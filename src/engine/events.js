/* Event engine: monthly random draws filtered by conditions, triggered built-ins, and
 * delayed "echo" consequences scheduled by earlier choices. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;

  function ctxVars(state, extra) {
    const p = state.player;
    const c = state.campaign;
    const opp = c ? PG.campaign.opponents(state)[0] : null;
    return Object.assign({
      name: p.name, city: state.world.home.city.name, state: PG.juris.homeState(state).name,
      office: p.office ? PG.data.officeById[p.office.officeId].short : 'candidate', opponent: opp ? opp.name : 'your opponent',
    }, extra || {});
  }

  function phaseOf(state) { return state.campaign ? 'campaign' : state.gov ? 'governing' : 'career'; }

  function eligible(state, ev) {
    if (ev.echoOnly) return false;
    const w = ev.when || {};
    const phase = phaseOf(state);
    if ((w.phase || ['governing']).indexOf(phase) < 0) return false;
    if (phase === 'governing' || (state.gov && w.kinds)) {
      const g = state.gov;
      if (!g) return false;
      if (w.kinds && !w.kinds.includes(g.kind)) return false;
      if (w.levels && !w.levels.includes(g.level)) return false;
      if (w.offices && !w.offices.includes(g.officeId)) return false;
      if (w.minMonths && g.monthsInOffice < w.minMonths) return false;
      if (w.partisan && !PG.data.officeById[g.officeId].partisan) return false;
    }
    if (phase === 'campaign') {
      const lvl = PG.juris.OFFICE_LEVEL[state.campaign.officeId];
      if (w.levels && !w.levels.includes(lvl) && !(w.phase && w.phase.includes('governing') && state.gov)) return false;
      if (w.partisan && !state.campaign.partisan) return false;
    }
    const f = state.player.flags;
    if (w.flags && !w.flags.every((x) => f[x])) return false;
    if (w.notFlags && w.notFlags.some((x) => f[x])) return false;
    const fired = state.events.fired[ev.id] || 0;
    if (w.once && fired) return false;
    const last = state.events.lastMonth[ev.id];
    if (last !== undefined && U.monthIndex(state.date) - last < 18) return false; // cooldown
    return true;
  }

  function roll(state) {
    processEchoes(state);
    if (state.events.active) return;
    const phase = phaseOf(state);
    const p = { governing: 0.38, campaign: 0.28, career: 0 }[phase];
    if (!R.chance(state, p)) return;
    const pool = PG.data.events.filter((e) => eligible(state, e));
    const ev = R.weighted(state, pool, (e) => (e.when && e.when.weight) || 1);
    if (ev) trigger(state, ev.id, {});
  }

  function trigger(state, id, vars) {
    const ev = PG.data.eventById[id];
    if (!ev) return;
    const inst = { id, vars: ctxVars(state, vars), date: { ...state.date } };
    if (state.events.active) state.events.queue.push(inst);
    else state.events.active = inst;
    state.events.fired[id] = (state.events.fired[id] || 0) + 1;
    state.events.lastMonth[id] = U.monthIndex(state.date);
  }

  function scheduleEcho(state, ec) {
    const months = Array.isArray(ec.months) ? R.int(state, ec.months[0], ec.months[1]) : (ec.months || 3);
    state.events.echoes = state.events.echoes || [];
    state.events.echoes.push({ event: ec.event, due: U.monthIndex(state.date) + months, chance: ec.chance === undefined ? 1 : ec.chance, vars: ec.vars || {} });
  }

  function processEchoes(state) {
    const list = state.events.echoes || [];
    const now = U.monthIndex(state.date);
    const keep = [];
    for (const ec of list) {
      if (ec.due > now) { keep.push(ec); continue; }
      if (R.chance(state, ec.chance)) trigger(state, ec.event, ec.vars);
    }
    state.events.echoes = keep;
  }

  function view(state) {
    const a = state.events.active;
    if (!a) return null;
    const ev = PG.data.eventById[a.id];
    return {
      id: ev.id, title: U.fill(ev.title, a.vars), text: U.fill(ev.text, a.vars),
      choices: ev.choices.map((c, i) => ({ i, label: U.fill(c.label, a.vars), hint: c.hint ? U.fill(c.hint, a.vars) : '', ok: requiresOk(state, c) })),
    };
  }

  function requiresOk(state, c) {
    if (!c.requires) return true;
    if (c.requires.capital && state.player.capital < c.requires.capital) return false;
    return true;
  }

  function choose(state, idx) {
    const a = state.events.active;
    if (!a) return { ok: false, msg: 'No event.' };
    const ev = PG.data.eventById[a.id];
    const c = ev.choices[idx];
    if (!c || !requiresOk(state, c)) return { ok: false, msg: 'Not available.' };
    let eff = c.effects, outcome = null;
    if (c.chance) {
      let pr = c.chance.p;
      if (c.chance.stat) pr = U.clamp(pr + (PG.character.stat(state, c.chance.stat) - 50) / 100, 0.05, 0.95);
      const ok = R.chance(state, pr);
      eff = ok ? c.chance.success : c.chance.fail;
      outcome = eff.outcome || (ok ? 'It worked.' : 'It backfired.');
    }
    const lines = special(state, eff, a);
    lines.push.apply(lines, PG.effects.apply(state, eff, { label: ev.title }));
    const title = U.fill(ev.title, a.vars);
    PG.game.log(state, 'event', title + ' — you chose: ' + U.fill(c.label, a.vars) + (outcome ? '. ' + outcome : '.'), lines);
    state.events.active = state.events.queue.shift() || null;
    return { ok: true, msg: outcome || 'Done.', lines };
  }

  function special(state, eff, inst) {
    const lines = [];
    if (!eff) return lines;
    if (eff.fireCabinet && state.gov && inst.vars.posId && state.gov.cabinet[inst.vars.posId]) {
      PG.executive.fire(state, inst.vars.posId);
      lines.push('Cabinet post vacated');
    }
    if (eff.redistrict && state.gov && state.gov.kind === 'legislator') {
      const ch = state.world.chambers[state.gov.body];
      const me = ch.members.find((m) => m.isPlayer);
      const shift = eff.redistrict * (state.player.party === 'D' ? 1 : state.player.party === 'R' ? -1 : 0);
      me.lean = U.round(me.lean + shift, 1);
      PG.juris.invalidate(state, state.gov.key);
      lines.push('Your district shifted ' + U.fmtLean(shift) + ' (now ' + U.fmtLean(me.lean) + ')');
      // Re-seed approval for the new electorate.
      const old = state.gov.approval.byBloc;
      const e = PG.juris.electorate(state, state.gov.key);
      for (const b of e.blocs) if (old[b.id] === undefined) old[b.id] = 50;
      PG.approval.recompute(state);
    }
    return lines;
  }

  PG.events = { roll, trigger, scheduleEcho, processEchoes, view, choose, eligible };
})(globalThis.PG = globalThis.PG || {});
