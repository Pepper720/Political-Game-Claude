/* Storylines: multi-chapter scenarios that unfold over months or years. Each chapter is
 * a decision; choices set story variables, move relationships, and decide which chapter
 * comes next (sometimes by a weighted roll shaped by your situation). Data: data/arcs.js. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;
  const COASTAL = ['FL', 'TX', 'LA', 'NC', 'SC', 'GA', 'AL', 'MS', 'VA', 'MD', 'NJ', 'NY', 'CT', 'RI', 'MA', 'NH', 'ME', 'DE', 'CA', 'OR', 'WA', 'HI'];

  const PRED = {
    governing: (s) => !!s.gov,
    campaign: (s) => !!s.campaign,
    career: (s) => !s.gov && !s.campaign && s.mode !== 'party',
    party: (s) => s.mode === 'party',
    notParty: (s) => s.mode !== 'party',
    executive: (s) => !!s.gov && s.gov.kind === 'executive',
    legislator: (s) => !!s.gov && s.gov.kind === 'legislator',
    local: (s) => !!s.gov && ['city', 'school'].includes(s.gov.level),
    city: (s) => !!s.gov && s.gov.level === 'city',
    stateLevel: (s) => !!s.gov && s.gov.level === 'state',
    federal: (s) => !!s.gov && s.gov.level === 'federal',
    notSchool: (s) => !s.gov || s.gov.level !== 'school',
    partisan: (s) => { const o = s.gov ? s.gov.officeId : s.campaign ? s.campaign.officeId : null; return !!o && PG.data.officeById[o].partisan; },
    majorParty: (s) => ['D', 'R'].includes(s.player.party),
    coastal: (s) => COASTAL.includes(s.player.homeState),
    presSameParty: (s) => s.world.executives.president.party === s.player.party,
    presIsPlayer: (s) => !!s.world.executives.president.isPlayer,
    govSameParty: (s) => s.world.executives.governor && s.world.executives.governor.party === s.player.party,
    lowLoyalty: (s) => !!s.cast && (s.cast.chief.rel < 0 || s.cast.comms.rel < 0),
    loyalStaff: (s) => !!s.cast && s.cast.chief.rel >= 40 && s.cast.comms.rel >= 30,
    hasCommitments: (s) => s.player.commitments.some((c) => c.status === 'open'),
    goodPress: (s) => s.player.media > 15,
    badPress: (s) => s.player.media < -15,
    recession: (s) => s.world.national.economy.recession,
    incumbentRun: (s) => !!s.campaign && !!PG.campaign.playerCand(s) && PG.campaign.playerCand(s).incumbent,
    popular: (s) => !!s.gov && s.gov.approval.overall >= 55,
    unpopular: (s) => !!s.gov && s.gov.approval.overall < 42,
    fall: (s) => s.date.month >= 8 && s.date.month <= 10,
    summer: (s) => s.date.month >= 5 && s.date.month <= 8,
    rivalInOffice: (s) => !!s.cast && !!s.cast.rival.office,
    teamGood: (s) => !!s.world.team && s.world.team.strength >= 0.55,
    partyEstablished: (s) => !!s.party && PG.party.STATUS.findIndex((x) => x.id === s.party.status) >= 1,
    hasSeats: (s) => !!s.party && PG.party.totalSeats(s) > 0,
    highGas: (s) => !!s.world.national.gas && s.world.national.gas.price > 4,
  };

  function test(state, inst, c) {
    if (!c) return true;
    if (typeof c === 'string') {
      const neg = c[0] === '!';
      const f = PRED[neg ? c.slice(1) : c];
      if (!f) throw new Error('Unknown storyline condition: ' + c);
      return neg ? !f(state, inst) : !!f(state, inst);
    }
    if (Array.isArray(c)) return c.every((x) => test(state, inst, x));
    if (c.any) return c.any.some((x) => test(state, inst, x));
    if (c.not) return !test(state, inst, c.not);
    const cmp = (v) => ('eq' in c ? v === c.eq : 'gt' in c ? (v || 0) > c.gt : 'lt' in c ? (v || 0) < c.lt : !!v);
    if (c.var) return cmp(inst ? inst.vars[c.var] : undefined);
    if (c.cast) return state.cast ? cmp(state.cast[c.cast].rel) : false;
    if (c.flag) return !!state.player.flags[c.flag];
    if (c.stat) return cmp(PG.character.stat(state, c.stat));
    if (c.approval) return state.gov ? cmp(state.gov.approval.overall) : false;
    if (c.capital) return cmp(state.player.capital);
    return true;
  }

  function def(id) { return PG.data.arcById[id]; }

  // ----------------------------------------------------------------- lifecycle
  function eligible(state, d) {
    const st = state.arcs;
    if (st.active.some((x) => x.id === d.id)) return false;
    if (st.done[d.id] && !d.repeat) return false;
    const w = d.when || {};
    if (w.levels && !(state.gov && w.levels.includes(state.gov.level))) return false;
    if (w.minMonths && !(state.gov && state.gov.monthsInOffice >= w.minMonths)) return false;
    return test(state, null, w.cond);
  }

  function start(state, id, extraVars) {
    PG.cast.ensure(state);
    const d = def(id);
    if (!d || state.arcs.active.some((x) => x.id === id)) return null;
    const vars = Object.assign({}, extraVars || {});
    for (const [k, list] of Object.entries(d.pick || {})) vars[k] = R.pick(state, list);
    for (const pi of d.pickIf || []) if (test(state, null, pi.if)) for (const [k, list] of Object.entries(pi.pick)) vars[k] = R.pick(state, list);
    const inst = { uid: U.nextId(state, 'arc'), id, stage: d.start, due: U.monthIndex(state.date), vars, started: { ...state.date }, history: [] };
    state.arcs.active.push(inst);
    state.arcs.lastStart = U.monthIndex(state.date);
    return inst;
  }

  function finish(state, inst, outcome) {
    state.arcs.active = state.arcs.active.filter((x) => x.uid !== inst.uid);
    const d = def(inst.id);
    state.arcs.done[inst.id] = { outcome: outcome || 'It ended.', date: { ...state.date }, history: inst.history, title: d.title, icon: d.icon };
  }

  function monthly(state) {
    PG.cast.ensure(state);
    const st = state.arcs, now = U.monthIndex(state.date);
    for (const inst of st.active.slice()) {
      const d = def(inst.id);
      if (!d) { st.active = st.active.filter((x) => x !== inst); continue; }
      if (d.needs && !test(state, inst, d.needs)) {
        const txt = U.fill(d.fizzle || 'The story moved on without you.', vars(state, inst));
        PG.game.log(state, 'story', (d.icon || '📖') + ' ' + d.title + ': ' + txt);
        finish(state, inst, txt);
      }
    }
    if (!state.events.active) {
      const due = st.active.filter((x) => x.due <= now).sort((a, b) => a.due - b.due)[0];
      if (due) { present(state, due); return; }
    }
    const diff = PG.data.difficulty[state.difficulty];
    if (st.active.length < 2 && now - st.lastStart >= 5 && R.chance(state, 0.22 * (diff.scandalRate > 1 ? 1.15 : 1))) {
      const pool = PG.data.arcs.filter((d) => eligible(state, d));
      const d = R.weighted(state, pool, (x) => (x.when && x.when.weight) || 1);
      if (d) { const inst = start(state, d.id); if (inst && !state.events.active) present(state, inst); }
    }
  }

  function present(state, inst) {
    if (state.events.active) return;
    state.events.active = { id: 'arc', arc: inst.uid, vars: {}, date: { ...state.date } };
  }

  function vars(state, inst) {
    return Object.assign(PG.events.ctxVars(state), PG.cast.vars(state), inst.vars);
  }

  function stageText(state, inst, s) {
    let text = s.text;
    for (const v of s.variants || []) if (test(state, inst, v.if)) { text = v.text; break; }
    for (const x of s.extra || []) if (test(state, inst, x.if)) text += ' ' + x.text;
    return text;
  }

  function choiceOk(state, inst, c) {
    const rq = c.requires;
    if (!rq) return true;
    if (rq.capital && state.player.capital < rq.capital) return false;
    if (rq.partyFunds && (!state.party || state.party.funds < rq.partyFunds)) return false;
    if (rq.cond && !test(state, inst, rq.cond)) return false;
    return true;
  }

  function find(state, uid) { return state.arcs && state.arcs.active.find((x) => x.uid === uid); }

  function view(state, uid) {
    const inst = find(state, uid);
    if (!inst) return null;
    const d = def(inst.id), s = d.stages[inst.stage];
    const v = vars(state, inst);
    const sp = s.speaker && state.cast[s.speaker];
    const choices = s.choices.map((c, i) => ({ c, i })).filter((x) => !x.c.if || test(state, inst, x.c.if));
    return {
      arc: true, id: d.id, storyTitle: d.title, icon: d.icon || '📖', chapter: inst.history.length + 1,
      title: U.fill(s.title, v), text: U.fill(stageText(state, inst, s), v),
      speaker: sp ? { role: s.speaker, name: sp.name, title: PG.cast.title(state, s.speaker), icon: PG.cast.role(s.speaker).icon, rel: sp.rel, quirk: sp.quirk } : null,
      previously: inst.history.slice(-2).map((h) => h.text),
      choices: choices.map(({ c, i }) => ({ i, label: U.fill(c.label, v), hint: c.hint ? U.fill(c.hint, v) : '', ok: choiceOk(state, inst, c) })),
    };
  }

  function choose(state, uid, idx) {
    const inst = find(state, uid);
    if (!inst) { state.events.active = state.events.queue.shift() || null; return { ok: false, msg: 'That story is over.' }; }
    const d = def(inst.id), s = d.stages[inst.stage];
    const c = s.choices[idx];
    if (!c || (c.if && !test(state, inst, c.if)) || !choiceOk(state, inst, c)) return { ok: false, msg: 'Not available.' };
    const v = vars(state, inst);
    let res = c, outcome = null;
    const mem = c.mem ? U.fill(c.mem, v) : 'chose "' + U.fill(c.label, v) + '" (' + d.title + ')';
    const lines = [];
    if (c.chance) {
      let pr = c.chance.p;
      if (c.chance.stat) pr += (PG.character.stat(state, c.chance.stat) - 50) / 100;
      for (const m of c.chance.mods || []) if (test(state, inst, m.if)) pr += m.add;
      const ok = R.chance(state, U.clamp(pr, 0.05, 0.95));
      const o = ok ? c.chance.success : c.chance.fail;
      // The base choice's effects always apply; the outcome adds its own and may redirect the story.
      lines.push.apply(lines, PG.cast.applyCastAndEffects(state, c.cast, fillDeep(c.effects, v), mem));
      res = Object.assign({}, c, o, { cast: o.cast, effects: o.effects });
      outcome = o.outcome || (ok ? 'It worked.' : 'It backfired.');
    }
    if (c.set) Object.assign(inst.vars, c.set);
    if (res !== c && res.set) Object.assign(inst.vars, res.set);
    lines.push.apply(lines, PG.cast.applyCastAndEffects(state, res.cast, fillDeep(res.effects, v), mem));
    if (res.arc) { const nx = start(state, res.arc); if (nx) nx.due = U.monthIndex(state.date) + 3; }
    const label = U.fill(c.label, v);
    inst.history.push({ date: { ...state.date }, stage: inst.stage, title: U.fill(s.title, v), text: U.fill(s.title, v) + ': ' + label + (outcome ? ' — ' + U.fill(outcome, v) : ''), choice: idx });
    if (res.wire) PG.wire.post(state, { kind: 'story', text: U.fill(res.wire, v), tone: res.wireTone || 0 });
    PG.game.log(state, 'story', (d.icon || '📖') + ' ' + d.title + ' — ' + U.fill(s.title, v) + ': you chose "' + label + '".' + (outcome ? ' ' + U.fill(outcome, v) : ''), lines);
    // Next chapter.
    const nx = resolveNext(state, inst, res);
    if (res.end || !nx) {
      const out = U.fill(res.end || outcome || 'The story closes.', v);
      if (res.end) PG.game.log(state, 'story', (d.icon || '📖') + ' ' + d.title + ' — the end: ' + out);
      finish(state, inst, out);
    } else {
      if (!d.stages[nx.stage]) throw new Error('Storyline ' + d.id + ' has no chapter ' + nx.stage);
      inst.stage = nx.stage;
      inst.due = U.monthIndex(state.date) + nx.months;
    }
    state.events.active = state.events.queue.shift() || null;
    return { ok: true, msg: outcome ? U.fill(outcome, v) : 'Decision made.', lines };
  }

  // Scandal texts and similar strings inside effects can use story variables.
  function fillDeep(eff, v) {
    if (!eff) return eff;
    if (typeof eff === 'string') return U.fill(eff, v);
    if (Array.isArray(eff)) return eff.map((x) => fillDeep(x, v));
    if (typeof eff === 'object') { const o = {}; for (const [k, x] of Object.entries(eff)) o[k] = fillDeep(x, v); return o; }
    return eff;
  }

  function resolveNext(state, inst, res) {
    const n = res.next;
    if (!n) return null;
    const months = (spec) => (Array.isArray(spec) ? R.int(state, spec[0], spec[1]) : spec === undefined ? R.int(state, 2, 5) : spec);
    if (typeof n === 'string') return { stage: n, months: months(undefined) };
    if (n.roll) {
      const opts = n.roll.map((o) => {
        let w = o.w === undefined ? 1 : o.w;
        for (const m of o.mods || []) if (test(state, inst, m.if)) w += m.w;
        return { stage: o.stage, w: Math.max(0, w) };
      });
      const pick = R.weighted(state, opts, (o) => o.w);
      return pick ? { stage: pick.stage, months: months(n.months) } : null;
    }
    return { stage: n.stage, months: months(n.months) };
  }

  // Summaries for the Storylines panel.
  function summary(state) {
    const st = state.arcs || { active: [], done: {} };
    const now = U.monthIndex(state.date);
    const active = st.active.map((inst) => {
      const d = def(inst.id);
      return { uid: inst.uid, title: d.title, icon: d.icon || '📖', blurb: U.fill(d.summary || '', vars(state, inst)), history: inst.history, nextIn: Math.max(0, inst.due - now), started: inst.started };
    });
    const done = Object.entries(st.done).map(([id, x]) => Object.assign({ id }, x)).sort((a, b) => U.monthIndex(b.date) - U.monthIndex(a.date));
    return { active, done };
  }

  PG.arcs = { PRED, test, start, monthly, view, choose, summary, eligible, find, COASTAL };
})(globalThis.PG = globalThis.PG || {});
