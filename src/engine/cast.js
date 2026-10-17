/* The cast: the recurring people in your political life. Each has a relationship with
 * you, a memory of what you did, and a mechanical role (see data/cast.js `matters`).
 * Also runs the phone inbox (small asks that expire) and your rival's parallel career. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;

  const LADDER = ['city_council', 'state_house', 'state_senate', 'us_house', 'us_senate', 'governor', 'president'];

  function ensure(state) {
    if (!state.cast) create(state);
    if (!state.inbox) state.inbox = [];
    if (!state.wire) state.wire = [];
    if (!state.arcs) state.arcs = { active: [], done: {}, lastStart: -99 };
    if (!state.world.national.gas) state.world.national.gas = { price: 3.35, shock: 0 };
    if (!state.world.team) PG.wire && PG.wire.makeTeam(state);
  }

  function create(state) {
    const party = state.mode === 'party';
    const used = new Set([state.player.name]);
    const quirks = R.shuffle(state, PG.data.castQuirks.slice());
    state.cast = {};
    PG.data.castRoles.forEach((r, i) => {
      let name;
      do name = PG.world.personName(state); while (used.has(name));
      used.add(name);
      const range = party && r.partyStart ? r.partyStart : r.start;
      const c = { role: r.id, name, rel: Math.round(R.range(state, range[0], range[1])), quirk: quirks[i % quirks.length], memory: [], gone: false };
      if (r.id === 'rival') {
        const p = state.player;
        c.party = party ? 'P2' : (['D', 'R'].includes(p.party) ? p.party : R.pick(state, ['D', 'R']));
        c.office = null; c.target = null; c.ambition = U.round(R.range(state, 0.45, 0.85), 2); c.wins = 0; c.losses = 0;
      }
      if (r.id === 'reporter') c.outlet = 'local_paper';
      state.cast[r.id] = c;
    });
  }

  function role(id) { return PG.data.castRoles.find((r) => r.id === id); }
  function title(state, id) { const r = role(id); return state.mode === 'party' && r.partyTitle ? r.partyTitle : r.title; }
  function get(state, id) { return state.cast && state.cast[id]; }
  function label(rel) { return PG.data.relLabels.find(([t]) => rel >= t)[1]; }

  function change(state, id, d, mem) {
    const c = get(state, id);
    if (!c || !d) return null;
    const before = c.rel;
    c.rel = Math.round(U.clamp(c.rel + d, -100, 100));
    if (mem) { c.memory.unshift({ date: { ...state.date }, text: mem, d }); if (c.memory.length > 12) c.memory.length = 12; }
    const r = role(id);
    if (r.group && PG.data.groupById[r.group] && state.groups[r.group]) PG.groups.change(state, r.group, Math.round(d * 0.4));
    return { name: c.name, title: title(state, id), d, before, after: c.rel };
  }

  // Text variables for storylines and asks: {chief}, {reporter}, {rival} …
  function vars(state) {
    const out = {};
    if (!state.cast) return out;
    for (const [id, c] of Object.entries(state.cast)) out[id] = c.name;
    const paper = PG.data.outlets.find((o) => o.id === 'local_paper');
    out.paper = paper ? paper.name : 'the paper';
    out.team = state.world.team ? state.world.team.name : 'the home team';
    if (state.world.national.gas) out.gas = state.world.national.gas.price.toFixed(2);
    return out;
  }

  // ----------------------------------------------------------------- monthly
  function monthly(state) {
    ensure(state);
    const p = state.player, C = state.cast;
    // Press relations drift toward how your beat reporter sees you.
    p.media = U.round(U.clamp(p.media + (C.reporter.rel * 0.5 - p.media) * 0.04, -100, 100), 1);
    // A well-run office banks capital; a loyal chief keeps things moving.
    if (state.gov && C.chief.rel >= 60) p.capital = U.round(p.capital + 0.4, 1);
    // Party leadership standing drifts toward the boss's opinion (career mode).
    if (state.mode !== 'party') p.partyRel = U.round(U.clamp(p.partyRel + ((50 + C.boss.rel / 2) - p.partyRel) * 0.03, 0, 100), 1);
    // A warm donor quietly bundles checks while you campaign.
    if (state.campaign && C.donor.rel > 20) {
      const pc = PG.campaign.playerCand(state);
      const amt = Math.round(state.campaign.typicalBudget * 0.01 * (C.donor.rel / 60));
      if (pc && amt > 0) { pc.cash += amt; state.campaign.raised.large += amt; }
    }
    if (state.party && C.donor.rel > 20 && state.date.month % 3 === 0) {
      state.party.funds += Math.round(4000 * C.donor.rel / 40);
    }
    // Relationships cool slowly toward neutral if neglected.
    for (const c of Object.values(C)) if (c.role !== 'mentor') c.rel = Math.round(c.rel * 0.995);
    rivalMonthly(state);
    inboxMonthly(state);
  }

  // ----------------------------------------------------------------- rival
  function rivalMonthly(state) {
    const rv = state.cast.rival;
    if (!rv || state.mode === 'party' || rv.gone) return;
    const y = state.date.year, m = state.date.month;
    if (m === 2 && y % 2 === 0 && !rv.target) {
      const i = rv.office ? LADDER.indexOf(rv.office) : -1;
      const next = LADDER[Math.min(LADDER.length - 1, i + 1)];
      if (next && next !== rv.office && R.chance(state, rv.ambition * (rv.office ? 0.7 : 1))) {
        if (next === 'president' && y % 4 !== 0) return;
        if (next === 'governor' && !PG.calendar.electionInfo(state, 'governor', y)) return;
        rv.target = next; rv.targetYear = y;
        const o = PG.data.officeById[next];
        PG.game.news(state, rv.name + ' launches bid for ' + o.short, 0, PG.data.outlets[0].name);
        PG.game.log(state, 'people', 'Your rival ' + rv.name + ' is running for ' + o.name + ' this year.', [state.campaign && state.campaign.officeId === next ? 'Same race as you — expect to meet in the primary.' : 'If they win, they become a bigger player — and a bigger obstacle.']);
        if (PG.wire) PG.wire.post(state, { kind: 'social', who: '@' + handle(rv.name), text: 'Proud to announce: I\'m running for ' + o.short + '. Time for leadership that shows up. 🇺🇸', tone: 0 });
      }
    }
    if (m === 11 && rv.target && rv.targetYear === y && !rv.inPlayerRace) {
      settleRival(state, R.chance(state, 0.5 + (rv.wins - rv.losses) * 0.05));
    }
  }

  function settleRival(state, won, note) {
    const rv = state.cast.rival;
    const o = PG.data.officeById[rv.target];
    if (!o) { rv.target = null; return; }
    if (won) { rv.office = rv.target; rv.wins++; PG.game.news(state, rv.name + ' wins ' + o.short + ' race', 0); }
    else { rv.losses++; PG.game.news(state, rv.name + ' falls short in ' + o.short + ' bid', 0); }
    PG.game.log(state, 'people', 'Your rival ' + rv.name + (won ? ' won' : ' lost') + ' the race for ' + o.name + '.', note ? [note] : null);
    rv.target = null; rv.inPlayerRace = false;
  }

  // The race you shared with your rival is over.
  function rivalRaceOver(state, officeId, rivalWon, playerWon) {
    const rv = state.cast && state.cast.rival;
    if (!rv || rv.target !== officeId) return;
    if (playerWon) change(state, 'rival', -15, 'lost to you head-to-head');
    else if (rivalWon) change(state, 'rival', 5, 'beat you head-to-head');
    settleRival(state, !!rivalWon && !playerWon, 'You ran in the same race.');
  }

  // Called from campaign.buildField: drop the rival into your primary if they want the same seat.
  function rivalForRace(state, officeId) {
    const rv = state.cast && state.cast.rival;
    if (!rv || rv.gone || state.mode === 'party') return null;
    if (rv.target !== officeId || rv.party !== state.player.party) return null;
    rv.inPlayerRace = true;
    return { name: rv.name, party: rv.party, qualityBonus: 8 + rv.wins * 3, nameRec: 14 + rv.wins * 10, label: 'Your rival' };
  }

  function handle(name) { return name.replace(/[^A-Za-z]/g, '').slice(0, 14); }

  // ----------------------------------------------------------------- phone
  function askEligible(state, a) {
    const w = a.when || {};
    const phase = PG.events.phaseOf(state);
    if ((w.phase || ['governing']).indexOf(phase) < 0) return false;
    if (w.partisan) {
      const off = state.gov ? state.gov.officeId : state.campaign ? state.campaign.officeId : null;
      if (!off || !PG.data.officeById[off].partisan) return false;
    }
    const c = get(state, a.from);
    if (!c || c.gone) return false;
    if (state.inbox.some((x) => x.ask === a.id)) return false;
    const last = (state.cast._askLast || {})[a.id];
    if (last !== undefined && U.monthIndex(state.date) - last < 14) return false;
    return true;
  }

  function inboxMonthly(state) {
    const now = U.monthIndex(state.date);
    // Expire unanswered asks: silence is also an answer.
    const keep = [];
    for (const it of state.inbox) {
      if (it.expires > now) { keep.push(it); continue; }
      const a = PG.data.askById[it.ask];
      const ig = a.ignore || {};
      const lines = applyCastAndEffects(state, ig.cast, ig.effects, ig.mem || 'never called back');
      const txt = ig.text ? U.fill(ig.text, Object.assign(vars(state), { name: state.player.name })) : 'You never got back to ' + get(state, a.from).name + '.';
      PG.game.log(state, 'people', '📱 Missed call: ' + txt, lines);
    }
    state.inbox = keep;
    if (state.inbox.length >= 3 || !R.chance(state, 0.55)) return;
    const pool = PG.data.asks.filter((a) => askEligible(state, a));
    const a = R.pick(state, pool);
    if (!a) return;
    state.cast._askLast = state.cast._askLast || {};
    state.cast._askLast[a.id] = now;
    state.inbox.push({ uid: U.nextId(state, 'ask'), ask: a.id, from: a.from, date: { ...state.date }, expires: now + 2 });
  }

  function applyCastAndEffects(state, castFx, effects, mem) {
    const lines = [];
    if (castFx) for (const [id, d] of Object.entries(castFx)) {
      const r = change(state, id, d, mem);
      if (r) lines.push(r.name + ' (' + r.title.toLowerCase() + ') ' + (d > 0 ? 'warmed to you' : 'cooled on you') + ' ' + U.fmtSigned(d, 0));
    }
    if (effects) lines.push.apply(lines, PG.effects.apply(state, effects, { label: 'Phone' }));
    return lines;
  }

  function askView(state, it) {
    const a = PG.data.askById[it.ask];
    const v = Object.assign(vars(state), { name: state.player.name, party: state.party ? state.party.name : '' });
    return { uid: it.uid, from: it.from, who: get(state, a.from), title: title(state, a.from), text: U.fill(a.text, v),
      options: a.options.map((o, i) => ({ i, label: U.fill(o.label, v) })), monthsLeft: Math.max(0, it.expires - U.monthIndex(state.date)) };
  }

  function answer(state, uid, i) {
    const idx = state.inbox.findIndex((x) => x.uid === uid);
    if (idx < 0) return { ok: false, msg: 'That call already went to voicemail.' };
    const it = state.inbox[idx];
    const a = PG.data.askById[it.ask];
    const o = a.options[i];
    if (!o) return { ok: false, msg: 'Pick an answer.' };
    state.inbox.splice(idx, 1);
    let eff = o.effects || {}, outcome = o.note || null;
    if (o.chance) {
      let pr = o.chance.p;
      if (o.chance.stat) pr = U.clamp(pr + (PG.character.stat(state, o.chance.stat) - 50) / 100, 0.05, 0.95);
      const ok = R.chance(state, pr);
      eff = Object.assign({}, eff, ok ? o.chance.success : o.chance.fail);
      outcome = eff.outcome || (ok ? 'It worked.' : 'It backfired.');
    }
    if (o.flags) eff = Object.assign({}, eff, { flags: o.flags });
    if (o.echo) eff = Object.assign({}, eff, { echo: o.echo });
    const lines = applyCastAndEffects(state, o.cast, eff, o.mem || 'answered "' + o.label + '"');
    if (o.note && state.player.fatigue) state.player.fatigue = U.round(state.player.fatigue * 0.7, 1);
    const who = get(state, a.from);
    PG.game.log(state, 'people', '📱 ' + who.name + ': you answered "' + o.label + '".' + (outcome ? ' ' + outcome : ''), lines);
    return { ok: true, msg: outcome || 'Done.', lines };
  }

  // Someone leaves your orbit; a new person takes the role.
  function replace(state, id) {
    const c = get(state, id);
    if (!c) return null;
    const old = c.name;
    let name;
    const used = new Set(Object.values(state.cast).filter((x) => x && x.name).map((x) => x.name));
    do name = PG.world.personName(state); while (used.has(name));
    state.cast[id] = Object.assign({}, c, { name, rel: 20, memory: [{ date: { ...state.date }, text: 'replaced ' + old, d: 0 }], quirk: R.pick(state, PG.data.castQuirks), formerly: old });
    return old + ' is out; ' + name + ' is your new ' + title(state, id).toLowerCase();
  }

  // Scandal coverage scales with how the press sees you.
  function pressMult(state) {
    if (!state.cast) return 1;
    const avg = (state.cast.reporter.rel + state.cast.investigator.rel) / 2;
    return U.clamp(1 - avg / 250, 0.75, 1.3);
  }

  PG.cast = { ensure, create, get, role, title, label, change, vars, monthly, answer, askView, applyCastAndEffects, rivalForRace, rivalRaceOver, pressMult, replace, handle, LADDER };
})(globalThis.PG = globalThis.PG || {});
