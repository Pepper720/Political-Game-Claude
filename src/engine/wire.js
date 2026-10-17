/* The Wire and the "weird but real" world: gas prices voters blame on whoever is in
 * office, the home team's season (local wins put voters in a forgiving mood), election-day
 * weather, and a monthly feed of chatter reacting to what is actually happening. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;
  const MASCOTS = ['Bobcats', 'Ironmen', 'Herons', 'Miners', 'Rivermen', 'Comets', 'Owls', 'Foxes', 'Thunder', 'Bulldogs', 'Pioneers', 'Otters'];

  // Wire-specific conditions, added to the shared storyline predicates.
  Object.assign(PG.arcs.PRED, {
    approvalUp: (s) => trend(s) >= 2,
    approvalDown: (s) => trend(s) <= -2,
    scandalHot: (s) => PG.scandals.heat(s) > 2,
    teamWinning: (s) => !!s.world.team && inSeason(s) && s.world.team.w >= s.world.team.l + 2,
    teamLosing: (s) => !!s.world.team && inSeason(s) && s.world.team.l >= s.world.team.w + 2,
    rivalHostile: (s) => !!s.cast && s.cast.rival.rel < -10,
    trailing: (s) => lastPoll(s) !== null && lastPoll(s) < 44,
    leading: (s) => lastPoll(s) !== null && lastPoll(s) > 54,
  });

  function trend(s) {
    const h = s.history.approval;
    if (h.length < 3) return 0;
    return h[h.length - 1].overall - h[h.length - 3].overall;
  }
  function lastPoll(s) {
    const c = s.campaign;
    if (!c || !c.polls.length) return null;
    const lp = c.polls[c.polls.length - 1];
    return lp.results && lp.results.player !== undefined ? lp.results.player : null;
  }
  function inSeason(s) { return s.date.month >= 9 || s.date.month <= 1; }

  function makeTeam(state) {
    const city = state.world.home.city.name;
    state.world.team = { name: city + ' ' + R.pick(state, MASCOTS), strength: U.round(R.range(state, 0.3, 0.7), 2), w: 0, l: 0, season: 0, titles: 0 };
  }

  function post(state, item) {
    state.wire = state.wire || [];
    state.wire.unshift(Object.assign({ date: { ...state.date } }, item));
    if (state.wire.length > 80) state.wire.length = 80;
  }

  function vars(state) {
    const t = state.world.team;
    const v = Object.assign(PG.events.ctxVars(state), PG.cast.vars(state), {
      gas: state.world.national.gas.price.toFixed(2), bar: R.pick(state, PG.data.wireBars),
      record: t ? t.w + '–' + t.l : '', approval: state.gov ? Math.round(state.gov.approval.overall) : '',
    });
    return v;
  }

  // ----------------------------------------------------------------- gas
  function gasMonthly(state) {
    const gs = state.world.national.gas;
    const n = state.world.national.economy;
    if (R.chance(state, 0.015)) {
      const why = R.pick(state, ['a refinery fire on the Gulf Coast', 'conflict disrupting overseas oil shipping', 'a hurricane shutting offshore rigs', 'an OPEC production cut', 'a pipeline cyberattack']);
      gs.shock += R.range(state, 0.5, 1.1);
      PG.game.news(state, 'Gas prices jump after ' + why, -1);
      PG.game.log(state, 'world', '⛽ Gas prices are spiking after ' + why + '.', ['No local or state official controls oil markets — but voters reliably blame whoever is in office (real research on gas prices and approval).']);
    }
    const before = gs.price;
    gs.price = U.round(U.clamp(3.25 + (n.inflation - 2.3) * 0.22 + gs.shock + R.normal(state, 0, 0.05), 2.2, 6.5), 2);
    gs.shock *= 0.86;
    if (before <= 4 && gs.price > 4) PG.game.news(state, 'Gas tops $4 a gallon', -1);
  }

  // ----------------------------------------------------------------- the home team
  function teamMonthly(state) {
    const t = state.world.team;
    const m = state.date.month;
    if (m === 8) { t.w = 0; t.l = 0; t.season = state.date.year; t.strength = U.round(U.clamp(t.strength + R.normal(state, 0, 0.1), 0.2, 0.85), 2); return; }
    if (m < 9 || m > 12) return;
    const games = m === 12 ? 2 : 3;
    for (let i = 0; i < games; i++) { if (R.chance(state, t.strength)) t.w++; else t.l++; }
    if (m === 11) bigGame(state, t);
    if (m === 12 && t.w >= 10 && R.chance(state, 0.35)) {
      t.titles++;
      PG.game.news(state, 'The ' + t.name + ' win the championship!', 2);
      post(state, { kind: 'social', who: R.pick(state, PG.data.wireHandles.weird), text: 'CHAMPIONS!!! Nobody in ' + state.world.home.city.name + ' is going to work tomorrow and that is ok.', tone: 2 });
      if (state.gov) PG.effects.apply(state, { approval: { all: 0.8 } }, { label: 'Championship' });
    }
  }

  // The rivalry game right before the election. Real research (Healy, Malhotra & Mo, 2010)
  // found local wins just before Election Day nudged incumbents up; later work disputes
  // how large the effect is. Small here, and logged so you can see it.
  function bigGame(state, t) {
    const won = R.chance(state, t.strength);
    PG.game.news(state, t.name + (won ? ' win' : ' lose') + ' the rivalry game', won ? 1 : -1);
    const pc = state.campaign && PG.campaign.playerCand(state);
    const incumbent = (pc && pc.incumbent) || (state.gov && !state.campaign);
    if (!incumbent) return;
    const d = won ? 1 : -1;
    if (pc) pc.fav = U.clamp(pc.fav + d * 1.2, 5, 95);
    else PG.effects.apply(state, { approval: { all: d * 0.5 } }, { label: 'Rivalry game' });
    PG.game.log(state, 'world', '🏈 The ' + t.name + (won ? ' won' : ' lost') + ' the big game days before the election — and the mood rubbed off on incumbents like you (' + (won ? '+' : '−') + ').',
      ['Real but debated research: local sports wins right before an election have been linked to small gains for incumbents. Voters are human.']);
  }

  // ----------------------------------------------------------------- election-day weather
  // Rain lowers turnout (Gomez, Hansford & Krause, 2007); the side with the stronger
  // turnout operation loses less. Rolled once for a November general election.
  function weather(state) {
    const c = state.campaign;
    if (!c || state.date.month !== 11 || c.stage !== 'general' || c.weatherRolled === state.date.year) return;
    c.weatherRolled = state.date.year;
    const roll = R.next(state);
    const kind = roll < 0.22 ? 'rain' : roll < 0.28 ? 'snow' : roll < 0.4 ? 'heat' : null;
    if (!kind) return;
    const pc = PG.campaign.playerCand(state);
    const opp = PG.campaign.opponents(state).filter((x) => x.active).sort((a, b) => b.nameRec - a.nameRec)[0];
    if (!pc || !opp) return;
    const edge = (pc.ground || 0) - (opp.ground || 0);
    const d = U.clamp(edge / 8, -1, 1) * (kind === 'snow' ? 1.2 : kind === 'rain' ? 0.8 : 0.4);
    pc.momentum = U.clamp((pc.momentum || 0) + d, -10, 10);
    const desc = { rain: 'Cold rain is forecast for Election Day', snow: 'An early snowstorm is forecast for Election Day', heat: 'A freak heat wave is forecast for Election Day' }[kind];
    PG.game.log(state, 'world', '🌧️ ' + desc + '. ' + (d >= 0 ? 'Your stronger field operation will drag supporters out anyway.' : 'Your opponent\'s turnout machine handles bad weather better than yours.'),
      ['Real research: bad weather lowers turnout, and campaigns with strong ground games lose less of their vote.']);
  }

  // ----------------------------------------------------------------- chatter
  function chatter(state) {
    const v = vars(state);
    const ok = (c) => PG.arcs.test(state, null, c);
    const posts = PG.data.wirePosts.filter((p) => ok(p.if));
    const n = R.int(state, 1, 3);
    for (let i = 0; i < n && posts.length; i++) {
      const p = posts.splice(R.int(state, 0, posts.length - 1), 1)[0];
      post(state, { kind: 'social', who: R.pick(state, PG.data.wireHandles[p.lean]), lean: p.lean, text: U.fill(R.pick(state, p.text), v), tone: 0 });
    }
    if (R.chance(state, 0.4)) {
      const qs = PG.data.wireQuotes.filter((q) => ok(q.if) && state.cast[q.role] && !state.cast[q.role].gone);
      const q = R.pick(state, qs);
      if (q) { const c = state.cast[q.role]; post(state, { kind: 'quote', who: c.name, role: q.role, title: PG.cast.title(state, q.role), text: U.fill(R.pick(state, q.text), v), tone: 0 }); }
    }
    if (R.chance(state, 0.3)) {
      const gs = PG.data.wireGossip.filter((g) => ok(g.if));
      const g = R.pick(state, gs);
      if (g) post(state, { kind: 'gossip', text: U.fill(R.pick(state, g.text), v), tone: 0 });
    }
    // Real headlines from the month become wire items too.
    for (const nItem of state.news.filter((x) => U.monthIndex(x.date) === U.monthIndex(state.date)).slice(0, 2)) post(state, { kind: 'headline', who: nItem.outlet, text: nItem.headline, tone: nItem.tone });
  }

  function monthly(state) {
    PG.cast.ensure(state);
    gasMonthly(state);
    teamMonthly(state);
    weather(state);
  }
  // Called after the month's news has been written.
  function endOfMonth(state) { chatter(state); }

  PG.wire = { makeTeam, post, monthly, endOfMonth, vars };
})(globalThis.PG = globalThis.PG || {});
