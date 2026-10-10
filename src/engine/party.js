/* Party-founder mode: you chair a new political party. Build state chapters, petition
 * onto ballots, set a platform, recruit and fund candidates for real seats, and grow
 * from a fringe outfit into a major party. Races are decided by the same voter model
 * as every other election, with a "wasted vote" penalty that shrinks as the party
 * proves itself. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;

  const ACTIONS = 4;
  // States notorious for hard new-party ballot access get a higher signature rate.
  const HARD_BALLOT = ['CA', 'NY', 'TX', 'NC', 'OK', 'GA', 'IL', 'PA', 'VA', 'AL', 'WV', 'IN'];
  const EASY_BALLOT = ['VT', 'NJ', 'CO', 'MS', 'LA', 'TN', 'MN', 'NH', 'DC', 'WA', 'UT', 'IA'];
  const STATUS = [
    { id: 'fringe', name: 'Fringe movement', desc: 'Few voters know you exist. Every vote for you feels wasted.' },
    { id: 'minor', name: 'Minor party', desc: 'On some ballots, with a few dedicated chapters.' },
    { id: 'established', name: 'Established third party', desc: 'Winning seats and drawing real vote shares.' },
    { id: 'major', name: 'Major party', desc: 'A genuine contender that the two old parties must reckon with.' },
  ];
  const COLORS = ['#e07b18', '#13a389', '#8a5cc7', '#c2185b', '#2e7d32', '#b08900', '#00838f', '#6d4c41'];

  function P(state) { return state.party; }

  // Inject the party into the shared party table (used by the vote model and UI).
  function sync(state) {
    const p = state.party;
    if (!p) return;
    PG.data.parties.P = { id: 'P', name: p.name, short: p.short, adj: p.name, color: p.color, norm: { econ: 0, social: 0 }, platform: p.ideology, custom: true, strength: strength(state) };
  }

  function strength(state) {
    const p = state.party;
    const rec = Math.min(1, p.brand.nameRec / 80);
    const share = Math.min(1, (p.lastShare || 0) / 0.35);
    const seats = Math.min(1, totalSeats(state) / 40);
    return U.round(U.clamp(rec * 0.3 + share * 0.35 + seats * 0.35, 0, 1), 3);
  }

  function requiredSignatures(st) {
    const rate = HARD_BALLOT.includes(st.id) ? 0.009 : EASY_BALLOT.includes(st.id) ? 0.0015 : 0.004;
    return Math.round(U.clamp(st.population * 1e6 * 0.74 * rate, 1000, 160000) / 100) * 100;
  }

  function create(state, setup) {
    const st = PG.juris.homeState(state);
    const ideo = state.player.ideology;
    const name = String(setup.partyName || 'Forward Party').slice(0, 40);
    const short = String(setup.partyShort || name.split(/\s+/).map((w) => w[0]).join('').slice(0, 4)).toUpperCase().slice(0, 5);
    state.party = {
      name, short, color: COLORS.includes(setup.partyColor) ? setup.partyColor : COLORS[0], ideology: { econ: ideo.econ, social: ideo.social }, platform: {},
      funds: Math.round(60000 * PG.data.difficulty[state.difficulty].startCash) + Math.round((state.player.cash || 0)),
      members: 600, brand: { nameRec: 2, fav: 52 }, chapters: {}, ballot: {}, candidates: [], history: [], founded: { ...state.date },
      actionsLeft: ACTIONS, status: 'fringe', lastShare: 0, peakSeats: 0, milestones: [], conventionYear: null, raceMemo: {},
    };
    for (const s of PG.data.states) state.party.ballot[s.id] = { status: 'none', signatures: 0, required: requiredSignatures(s) };
    state.party.chapters[st.id] = 15;
    state.party.ballot[st.id].status = 'petitioning';
    state.mode = 'party';
    state.phase = 'party';
    state.player.party = 'P';
    sync(state);
  }

  function totalSeats(state) {
    let n = 0;
    for (const ch of Object.values(state.world.chambers)) n += ch.members.filter((m) => m.party === 'P').length;
    return n;
  }
  function seatsBy(state) {
    const out = {};
    for (const ch of Object.values(state.world.chambers)) { const n = ch.members.filter((m) => m.party === 'P').length; if (n) out[ch.id] = { name: ch.name, n, size: ch.members.length }; }
    const ex = state.world.executives;
    if (ex.governor && ex.governor.party === 'P') out.governor = { name: 'Governor of ' + PG.juris.homeState(state).name, n: 1, size: 1 };
    if (ex.mayor && ex.mayor.party === 'P') out.mayor = { name: 'Mayor of ' + state.world.home.city.name, n: 1, size: 1 };
    if (ex.president && ex.president.party === 'P') out.president = { name: 'President', n: 1, size: 1 };
    return out;
  }

  // -------------------------------------------------------------- races
  const elecCache = new Map();
  function seatElectorate(state, sid, lean, type) {
    const key = sid + '|' + type + '|' + U.round(lean, 1);
    if (elecCache.has(key)) return elecCache.get(key);
    const st = PG.data.stateById[sid];
    const e = PG.voters.makeElectorate({ id: key, name: key, type, stateId: sid, lean, population: type === 'state' ? st.population * 1e6 : 150000, regionKind: type === 'state' ? 'state' : 'city' });
    elecCache.set(key, e);
    if (elecCache.size > 800) elecCache.delete(elecCache.keys().next().value);
    return e;
  }

  function electionYear(state) { return state.date.month <= 11 ? state.date.year : state.date.year + 1; }

  function onBallot(state, sid) { return state.party.ballot[sid] && state.party.ballot[sid].status === 'qualified'; }

  /* Upcoming races the party could contest this cycle. */
  function races(state) {
    const y = electionYear(state);
    const memo = state.party.raceMemo;
    if (memo.key === y + ':' + Object.values(state.party.ballot).filter((b) => b.status === 'qualified').length && memo.list) return memo.list;
    const st = PG.juris.homeState(state);
    const out = [];
    const add = (r) => { r.id = r.officeId + ':' + r.chamberId + ':' + r.idx; out.push(r); };
    if (y % 2 === 1) {
      state.world.chambers.council.members.forEach((m, i) => (i + y) % 2 === 0 && add({ officeId: 'city_council', chamberId: 'council', idx: i, sid: st.id, lean: m.lean, label: 'Council Ward ' + (i + 1), incumbent: m.name, incParty: m.party, local: true }));
    }
    const oddLeg = PG.calendar.ODD_YEAR_LEGISLATURES.includes(st.id);
    if (!st.isDC && (y % 2 === 1) === oddLeg && onBallot(state, st.id)) {
      for (const chId of ['state_house', 'state_senate']) {
        const ch = state.world.chambers[chId];
        if (!ch) continue;
        ch.members.forEach((m, i) => add({ officeId: chId, chamberId: chId, idx: i, sid: st.id, lean: m.lean, label: (chId === 'state_house' ? st.id + ' House' : st.unicameral ? 'NE Legislature' : st.id + ' Senate') + ' District ' + m.district, incumbent: m.name, incParty: m.party }));
      }
    }
    if (y % 2 === 0) {
      state.world.chambers.us_house.members.forEach((m, i) => { if (onBallot(state, m.state)) add({ officeId: 'us_house', chamberId: 'us_house', idx: i, sid: m.state, lean: m.lean, label: m.state + '-' + m.district + ' (U.S. House)', incumbent: m.name, incParty: m.party }); });
      state.world.chambers.us_senate.members.forEach((m, i) => {
        if (!onBallot(state, m.state)) return;
        if (m.senateClass !== PG.calendar.senateClassUp(PG.data.stateById[m.state], y)) return;
        add({ officeId: 'us_senate', chamberId: 'us_senate', idx: i, sid: m.state, lean: PG.data.stateById[m.state].lean, label: PG.data.stateById[m.state].name + ' (U.S. Senate)', incumbent: m.name, incParty: m.party, statewide: true });
      });
    }
    if (!st.isDC && onBallot(state, st.id) && PG.calendar.onBallot(state, 'governor', y)) {
      const g = state.world.executives.governor;
      add({ officeId: 'governor', chamberId: 'exec', idx: 0, sid: st.id, lean: st.lean, label: 'Governor of ' + st.name, incumbent: g ? g.name : '—', incParty: g ? g.party : 'D', statewide: true });
    }
    if (y % 4 === 0) {
      const ev = PG.data.states.filter((s) => onBallot(state, s.id)).reduce((a, s) => a + s.ev, 0);
      add({ officeId: 'president', chamberId: 'pres', idx: 0, sid: st.id, lean: 0, label: 'President of the United States (on the ballot in states worth ' + ev + ' electoral votes)', incumbent: state.world.executives.president.name, incParty: state.world.executives.president.party, statewide: true, national: true });
    }
    for (const r of out) r.estimate = estimate(state, r);
    out.sort((a, b) => b.estimate - a.estimate);
    memo.key = y + ':' + Object.values(state.party.ballot).filter((b) => b.status === 'qualified').length;
    memo.list = out;
    return out;
  }

  function candidateFor(state, r, c) {
    const p = state.party;
    const ch = p.chapters[r.sid] || 0;
    // Concentration: volunteers spread thin across many races help each one less.
    const sameState = Math.max(1, p.candidates.filter((x) => x.status === 'running' && x.race.sid === r.sid).length);
    const focus = 8 / Math.sqrt(sameState);
    return {
      id: 'P', party: 'P', ideology: c ? c.ideology : p.ideology, nameRec: U.clamp((c ? c.nameRec : 5) * 0.6 + p.brand.nameRec * 0.4 + ch * 0.15, 0, 100),
      fav: c ? c.fav : p.brand.fav, ground: ch / 4 + (c ? Math.min(14, 12 * Math.sqrt(((c.spent || 0) + c.funds) / raceBudget(state, r))) : 0),
      momentum: ch / 30 + focus * ch / 100 + (c ? (c.quality - 50) / 15 + Math.min(8, 7 * Math.sqrt(((c.spent || 0) + c.funds) / raceBudget(state, r))) : 0),
      enthusiasm: Math.min(10, p.members / 4000),
    };
  }

  function majors(state, r) {
    const party = r.incParty === 'D' || r.incParty === 'R' ? r.incParty : null;
    const make = (pp) => {
      const inc = party === pp && !r.open;
      const ideo = PG.world.moderateIdeology({ rng: { s: PG.rng.hashString(r.id + pp) } }, pp, r.lean);
      return { id: pp, party: pp, ideology: ideo, nameRec: inc ? 85 : 55, fav: inc ? 52 : 49, incumbent: inc, ground: 6 };
    };
    return [make('D'), make('R')];
  }

  function ctxFor(state, r) {
    const o = PG.data.officeById[r.officeId];
    return { mode: 'general', partisanW: o.partisan ? 1 : 0.4, env: state.world.national.environment, nat: o.nationalization, kind: PG.calendar.electionKind(electionYear(state)) };
  }

  function estimate(state, r, c) {
    if (r.national) return 0.05 + strength(state) * 0.25;
    const e = seatElectorate(state, r.sid, r.lean, r.statewide ? 'state' : 'district');
    const res = PG.voters.computeVote(e, majors(state, r).concat([candidateFor(state, r, c)]), ctxFor(state, r));
    return res.shares.P;
  }

  function raceBudget(state, r) { return PG.data.officeById[r.officeId].typicalBudget * (r.statewide && r.officeId !== 'president' ? Math.pow(PG.data.stateById[r.sid].population / 6, 0.75) : 1); }

  // ------------------------------------------------------------- actions
  function useAction(state) {
    if (state.party.actionsLeft <= 0) return false;
    state.party.actionsLeft--;
    return true;
  }

  function act(state, kind, arg) {
    const p = state.party, me = state.player;
    if (!p) return { ok: false, msg: 'No party.' };
    sync(state);
    const jm = PG.character.jobMods(state);
    const spend = (amt) => { if (p.funds < amt) return false; p.funds -= amt; return true; };
    switch (kind) {
      case 'fundraise': {
        if (!useAction(state)) return { ok: false, msg: 'No leadership actions left this month.' };
        const amt = Math.round((12000 + p.members * 6 + p.brand.nameRec * 900) * (PG.character.stat(state, 'fundraising') / 50) * (1 + Math.max(-0.5, jm.fundraise)) * R.range(state, 0.8, 1.2));
        p.funds += amt;
        PG.game.log(state, 'party', 'Fundraising drive raised ' + U.fmtMoney(amt) + '.', ['Scales with members (' + p.members.toLocaleString() + '), name recognition (' + Math.round(p.brand.nameRec) + ') and your fundraising skill']);
        return { ok: true, msg: 'Raised ' + U.fmtMoney(amt) + '.' };
      }
      case 'chapter': {
        const st = PG.data.stateById[arg];
        if (!st) return { ok: false, msg: 'Pick a state.' };
        const cost = Math.round(6000 * Math.sqrt(st.population) / 1000) * 1000;
        if (p.funds < cost) return { ok: false, msg: 'Organizing a chapter in ' + st.name + ' costs ' + U.fmtMoney(cost) + '.' };
        if (!useAction(state)) return { ok: false, msg: 'No leadership actions left this month.' };
        spend(cost);
        const cur = p.chapters[st.id] || 0;
        const gain = U.round((12 + PG.character.stat(state, 'organizing') / 10) * (1 - cur / 120), 1);
        p.chapters[st.id] = U.round(Math.min(100, cur + gain), 1);
        p.members += Math.round(40 + st.population * 8);
        if (p.ballot[st.id].status === 'none') p.ballot[st.id].status = 'petitioning';
        PG.game.log(state, 'party', 'Built up the ' + st.name + ' chapter (strength ' + Math.round(cur) + ' → ' + Math.round(p.chapters[st.id]) + ').');
        return { ok: true, msg: st.name + ' chapter strength now ' + Math.round(p.chapters[st.id]) + '.' };
      }
      case 'petition': {
        const st = PG.data.stateById[arg];
        if (!st) return { ok: false, msg: 'Pick a state.' };
        const b = p.ballot[st.id];
        if (b.status === 'qualified') return { ok: false, msg: 'Already on the ballot in ' + st.name + '.' };
        if (!useAction(state)) return { ok: false, msg: 'No leadership actions left this month.' };
        const need = b.required - b.signatures;
        const volunteer = Math.round(b.required * (p.chapters[st.id] || 0) / 100 * 0.35);
        // Paid circulators: one drive spends at most half the treasury.
        const paid = Math.min(Math.floor(p.funds * 0.5 / 8), Math.max(0, need - volunteer));
        spend(paid * 8);
        b.signatures += volunteer + paid;
        b.status = 'petitioning';
        // Opponents challenge signatures: some are tossed.
        const tossed = Math.round((volunteer + paid) * R.range(state, 0.05, 0.2));
        b.signatures = Math.max(0, b.signatures - tossed);
        let msg = st.name + ': ' + b.signatures.toLocaleString() + ' / ' + b.required.toLocaleString() + ' valid signatures (volunteers ' + volunteer.toLocaleString() + ', paid ' + paid.toLocaleString() + ' at $8 each, ' + tossed.toLocaleString() + ' thrown out in challenges).';
        if (b.signatures >= b.required) { b.status = 'qualified'; msg = 'You qualified for the ballot in ' + st.name + '!'; milestone(state, 'ballot-' + st.id, 'Ballot line in ' + st.name); p.raceMemo = {}; }
        PG.game.log(state, 'party', msg);
        return { ok: true, msg };
      }
      case 'media': {
        const cost = 15000 + Math.round(p.brand.nameRec * 1500);
        if (p.funds < cost) return { ok: false, msg: 'A media blitz costs ' + U.fmtMoney(cost) + '.' };
        if (!useAction(state)) return { ok: false, msg: 'No leadership actions left this month.' };
        spend(cost);
        const gain = U.round(3 + (PG.character.stat(state, 'charisma') - 50) / 20 + jm.media * 4, 1);
        p.brand.nameRec = U.clamp(p.brand.nameRec + gain * (1 - p.brand.nameRec / 100), 0, 100);
        const extreme = PG.voters.dist(p.ideology, { econ: 0, social: 0 }) / 100;
        const favShift = U.round(R.normal(state, 0.5 - extreme * 1.2, 1.2), 1);
        p.brand.fav = U.clamp(p.brand.fav + favShift, 15, 85);
        PG.game.log(state, 'party', 'Media blitz: name recognition +' + gain + ', favorability ' + U.fmtSigned(favShift) + '.', ['A more extreme platform polarizes coverage (distance from center ' + Math.round(extreme * 100) + ')']);
        return { ok: true, msg: 'Name recognition now ' + Math.round(p.brand.nameRec) + '.' };
      }
      case 'platform': {
        const issue = PG.data.issueById[arg && arg.issue];
        if (!issue) return { ok: false, msg: 'Pick an issue.' };
        if (!useAction(state)) return { ok: false, msg: 'No leadership actions left this month.' };
        const stance = U.clamp(Math.round(arg.stance), 0, 4) - 2;
        const prev = p.platform[issue.id];
        p.platform[issue.id] = stance;
        const target = stance * 38;
        p.ideology[issue.axis] = U.round(U.clamp(p.ideology[issue.axis] + (target - p.ideology[issue.axis]) * 0.2, -100, 100), 1);
        me.ideology = { ...p.ideology };
        for (const c of p.candidates) if (c.status === 'running') c.ideology = { ...p.ideology };
        if (prev !== undefined && Math.abs(prev - stance) >= 2) { p.brand.fav = U.clamp(p.brand.fav - 3, 15, 85); p.members = Math.round(p.members * 0.96); }
        for (const g of PG.data.groups) { const d = (1 - Math.abs(g.ideo[issue.axis] - target) / 60) * 3; if (Math.abs(d) >= 1.5) PG.groups.change(state, g.id, U.round(d, 1), 'Party platform on ' + issue.name); }
        p.raceMemo = {};
        PG.game.log(state, 'party', 'Platform plank adopted on ' + issue.name + ': "' + issue.stances[stance + 2] + '".', [(prev !== undefined && Math.abs(prev - stance) >= 2) ? 'Reversing an old plank cost favorability and some members' : 'Party position: economic ' + Math.round(p.ideology.econ) + ', social ' + Math.round(p.ideology.social)]);
        return { ok: true, msg: 'Plank adopted.' };
      }
      case 'convention': {
        if (p.conventionYear === state.date.year) return { ok: false, msg: 'One national convention per year.' };
        const cost = 40000 + p.members * 4;
        if (p.funds < cost) return { ok: false, msg: 'A convention costs ' + U.fmtMoney(cost) + '.' };
        if (!useAction(state)) return { ok: false, msg: 'No leadership actions left this month.' };
        spend(cost);
        p.conventionYear = state.date.year;
        p.brand.nameRec = U.clamp(p.brand.nameRec + 6 * (1 - p.brand.nameRec / 100), 0, 100);
        p.brand.fav = U.clamp(p.brand.fav + 1.5, 15, 85);
        p.members = Math.round(p.members * 1.08);
        PG.game.log(state, 'party', 'The national convention energized members and drew coverage.');
        return { ok: true, msg: 'Convention held.' };
      }
      case 'recruit': {
        const r = races(state).find((x) => x.id === arg);
        if (!r) return { ok: false, msg: 'That race is not available.' };
        if (p.candidates.some((c) => c.raceId === r.id && c.status === 'running')) return { ok: false, msg: 'You already have a candidate there.' };
        const cost = Math.round(Math.max(3000, raceBudget(state, r) * 0.02));
        if (p.funds < cost) return { ok: false, msg: 'Recruiting and vetting costs ' + U.fmtMoney(cost) + '.' };
        if (!useAction(state)) return { ok: false, msg: 'No leadership actions left this month.' };
        spend(cost);
        const o = PG.data.officeById[r.officeId];
        const ch = p.chapters[r.sid] || 0;
        const quality = Math.round(U.clamp(30 + ch * 0.3 + strength(state) * 25 - (o.rank - 1) * 4 + R.normal(state, 0, 9), 15, 90));
        const c = { id: U.nextId(state, 'pc'), raceId: r.id, race: r, name: r.officeId === 'president' ? me.name : PG.world.personName(state), quality, nameRec: U.round(3 + quality / 10 + ch / 8, 1), fav: U.round(48 + quality / 12, 1),
          funds: 0, ideology: { ...p.ideology }, status: 'running', year: electionYear(state), recruited: { ...state.date } };
        p.candidates.push(c);
        PG.game.log(state, 'party', 'Recruited ' + c.name + ' (quality ' + quality + ') for ' + r.label + '.', ['Quality reflects the local chapter (' + Math.round(ch) + '), party strength and how high the office is']);
        return { ok: true, msg: c.name + ' will run for ' + r.label + '.' };
      }
      case 'fund': {
        const c = p.candidates.find((x) => x.id === (arg && arg.id) && x.status === 'running');
        const amt = Math.round(Number(arg && arg.amount) || 0);
        if (!c || amt <= 0) return { ok: false, msg: 'Nothing to fund.' };
        if (p.funds < amt) return { ok: false, msg: 'The party only has ' + U.fmtMoney(p.funds) + '.' };
        p.funds -= amt; c.funds += amt;
        return { ok: true, msg: 'Transferred ' + U.fmtMoney(amt) + ' to ' + c.name + '.' };
      }
      case 'withdraw': {
        const c = p.candidates.find((x) => x.id === arg && x.status === 'running');
        if (!c) return { ok: false, msg: 'No such candidate.' };
        c.status = 'withdrew';
        p.funds += Math.round(c.funds * 0.5);
        return { ok: true, msg: c.name + ' withdrew; half their unspent money came back.' };
      }
      default: return { ok: false, msg: 'Unknown party action.' };
    }
  }

  function milestone(state, key, text) {
    const p = state.party;
    if (p.milestones.some((m) => m.key === key)) return;
    p.milestones.push({ key, text, date: { ...state.date } });
    PG.game.news(state, p.name + ': ' + text, 2);
  }

  // ------------------------------------------------------------- the month
  function monthly(state) {
    const p = state.party;
    sync(state);
    const s = strength(state);
    const chapterTotal = U.sum(Object.values(p.chapters));
    p.members = Math.max(100, Math.round(p.members * (1 + (p.brand.fav - 50) / 4000 + s / 500) + chapterTotal * 0.15));
    const dues = Math.round(p.members * 1.2);
    p.funds += dues;
    p.brand.nameRec = U.round(Math.max(1, p.brand.nameRec * 0.99 + s * 0.25), 2);
    p.brand.fav = U.round(p.brand.fav + (50 - p.brand.fav) * 0.03 + PG.voters.dist(p.ideology, { econ: 0, social: 0 }) / -400 + 0.05, 2);
    for (const k of Object.keys(p.chapters)) p.chapters[k] = U.round(Math.max(0, p.chapters[k] * 0.995), 2);
    // Volunteers keep gathering signatures in states with chapters.
    for (const [sid, b] of Object.entries(p.ballot)) {
      if (b.status !== 'petitioning') continue;
      b.signatures += Math.round(b.required * (p.chapters[sid] || 0) / 100 * 0.06);
      if (b.signatures >= b.required) { b.status = 'qualified'; milestone(state, 'ballot-' + sid, 'Ballot line in ' + PG.data.stateById[sid].name); PG.game.log(state, 'party', 'Volunteers finished the petition drive: you are on the ballot in ' + PG.data.stateById[sid].name + '.'); p.raceMemo = {}; }
    }
    // Candidates campaign.
    for (const c of p.candidates) {
      if (c.status !== 'running') continue;
      const burn = Math.round(c.funds * 0.25);
      c.funds -= burn; c.spent = (c.spent || 0) + burn;
      const budget = raceBudget(state, c.race);
      c.nameRec = U.round(U.clamp(c.nameRec + (2 + (p.chapters[c.race.sid] || 0) / 25 + 15 * Math.sqrt(burn / budget)) * (1 - c.nameRec / 100), 0, 100), 1);
      if (R.chance(state, 0.015 * PG.data.difficulty[state.difficulty].scandalRate)) {
        c.fav = U.clamp(c.fav - 6, 10, 90);
        p.brand.fav = U.clamp(p.brand.fav - 1.5, 15, 85);
        PG.game.log(state, 'party', 'Scandal: your candidate ' + c.name + ' (' + c.race.label + ') is under fire for old social-media posts.');
        PG.game.news(state, p.name + ' candidate ' + c.name + ' faces scrutiny', -1);
      }
    }
    p.actionsLeft = ACTIONS + PG.character.jobMods(state).actions;
    p.lastDues = dues;
    updateStatus(state);
    state.history.approval.push({ date: { ...state.date }, overall: p.brand.fav, base: p.brand.nameRec });
    if (state.history.approval.length > 240) state.history.approval.shift();
  }

  function updateStatus(state) {
    const p = state.party;
    const seats = totalSeats(state);
    const qualified = Object.values(p.ballot).filter((b) => b.status === 'qualified').length;
    const sb = seatsBy(state);
    let st = 'fringe';
    if (qualified >= 5 || seats >= 1) st = 'minor';
    if ((p.lastShare >= 0.06 && seats >= 3) || seats >= 10) st = 'established';
    if ((p.lastShare >= 0.15 && seats >= 25) || sb.governor || sb.president || seats >= 60) st = 'major';
    if (st !== p.status && STATUS.findIndex((x) => x.id === st) > STATUS.findIndex((x) => x.id === p.status)) {
      PG.game.log(state, 'party', p.name + ' is now a ' + STATUS.find((x) => x.id === st).name.toLowerCase() + '.');
      milestone(state, 'status-' + st, 'becomes a ' + STATUS.find((x) => x.id === st).name.toLowerCase());
    }
    p.status = st;
    p.peakSeats = Math.max(p.peakSeats, seats);
  }

  // ------------------------------------------------------------- elections
  /* November: every race with a party candidate is decided by the voter model. The
   * returned set protects those seats from the generic world elections. */
  function elections(state) {
    const p = state.party;
    sync(state);
    const y = state.date.year;
    const running = p.candidates.filter((c) => c.status === 'running' && c.year === y);
    const protectedSeats = new Set();
    if (!running.length) { postElection(state, [], y); return protectedSeats; }
    const diff = PG.data.difficulty[state.difficulty];
    const swing = R.normal(state, 0, 2.5 * diff.electionNoise);
    const rows = [];
    for (const c of running) {
      const r = c.race;
      if (r.officeId === 'president') { rows.push(presidential(state, c)); continue; }
      const e = seatElectorate(state, r.sid, r.lean, r.statewide ? 'state' : 'district');
      const cands = majors(state, r).concat([candidateFor(state, r, c)]);
      const ctx = Object.assign(ctxFor(state, r), { swing, candNoise: { D: R.normal(state, 0, 2), R: R.normal(state, 0, 2), P: R.normal(state, 0, 3 * diff.electionNoise) } });
      const res = PG.voters.computeVote(e, cands, ctx);
      const winner = Object.entries(res.shares).sort((a, b) => b[1] - a[1])[0][0];
      c.share = U.round(res.shares.P, 4);
      c.status = winner === 'P' ? 'won' : 'lost';
      rows.push({ label: r.label, name: c.name, share: res.shares.P, d: res.shares.D, r: res.shares.R, won: winner === 'P', winner, sid: r.sid });
      if (r.chamberId === 'exec') {
        if (winner === 'P') state.world.executives.governor = { name: c.name, party: 'P', econ: c.ideology.econ, social: c.ideology.social, title: 'Governor', approval: 55, termNumber: 1 };
        else { const ex = state.world.executives.governor; if (ex && ex.party !== winner) state.world.executives.governor = PG.world.createExecutive(state, winner, PG.juris.homeState(state).lean, 'Governor'); }
        protectedSeats.add('governor');
        continue;
      }
      const ch = state.world.chambers[r.chamberId];
      const m = ch.members[r.idx];
      protectedSeats.add(r.chamberId + ':' + r.idx);
      if (winner === 'P') {
        Object.assign(m, { name: c.name, party: 'P', econ: c.ideology.econ, social: c.ideology.social, seniority: 0, loyalty: 0.85, rel: 0 });
      } else if (m.party !== winner) {
        const ideo = PG.world.moderateIdeology(state, winner, m.lean);
        Object.assign(m, { name: PG.world.personName(state), party: winner, econ: ideo.econ, social: ideo.social, seniority: 0 });
      }
    }
    postElection(state, rows, y);
    return protectedSeats;
  }

  function presidential(state, c) {
    const p = state.party;
    const diff = PG.data.difficulty[state.difficulty];
    const swing = R.normal(state, 0, 2.6 * diff.electionNoise);
    const ev = { D: 0, R: 0, P: 0 }, pop = { D: 0, R: 0, P: 0 };
    for (const key of PG.presidential.stateKeys()) {
      const sid = key.split('-')[0];
      const e = PG.presidential.electorateFor(state, key);
      const r = { id: 'pres' + key, sid, lean: e.lean, incParty: state.world.executives.president.party, officeId: 'president' };
      const cands = majors(state, r);
      if (onBallot(state, sid)) cands.push(candidateFor(state, r, c));
      const res = PG.voters.computeVote(e, cands, { mode: 'general', partisanW: 1, env: state.world.national.environment, nat: 1, kind: 'pres', swing: swing + R.normal(state, 0, 2) });
      const w = Object.entries(res.shares).sort((a, b) => b[1] - a[1])[0][0];
      ev[w] += PG.presidential.evOf(key);
      if (key.indexOf('-') < 0) for (const k of Object.keys(res.votes)) pop[k] += res.votes[k];
    }
    const tot = pop.D + pop.R + pop.P;
    let winner = Object.entries(ev).sort((a, b) => b[1] - a[1])[0][0];
    if (ev[winner] < 270) winner = state.world.chambers.us_house.counts.D >= state.world.chambers.us_house.counts.R ? 'D' : 'R';
    c.share = U.round(pop.P / tot, 4);
    c.status = winner === 'P' ? 'won' : 'lost';
    c.ev = ev.P;
    if (winner === 'P') state.world.executives.president = { name: c.name, party: 'P', econ: c.ideology.econ, social: c.ideology.social, title: 'President', approval: 55, termNumber: 1, electedYear: state.date.year + 1 };
    state.party.presidentialRun = { year: state.date.year, ev, share: pop.P / tot };
    return { label: 'President (' + ev.P + ' electoral votes)', name: c.name, share: pop.P / tot, d: pop.D / tot, r: pop.R / tot, won: winner === 'P', winner, sid: 'US', ev };
  }

  function postElection(state, rows, y) {
    const p = state.party;
    const notes = [];
    if (rows.length) {
      const avg = U.sum(rows, (x) => x.share) / rows.length;
      p.lastShare = U.round(avg, 4);
      const won = rows.filter((x) => x.won).length;
      p.brand.nameRec = U.clamp(p.brand.nameRec + rows.length * 0.4 + won * 2, 0, 100);
      p.members = Math.round(p.members * (1 + won * 0.015 + avg * 0.15));
      notes.push(U.plural(rows.length, 'candidate') + ' on the ballot; ' + U.plural(won, 'winner') + '; average vote share ' + U.fmtPct(avg) + '.');
      if (won) milestone(state, 'first-win', 'wins its first election');
    }
    // Ballot retention: a line survives only if candidates there cleared 2%.
    const byState = {};
    for (const x of rows) if (x.sid !== 'US') byState[x.sid] = Math.max(byState[x.sid] || 0, x.share);
    const lost = [];
    if (y % 2 === 0) for (const [sid, b] of Object.entries(p.ballot)) {
      if (b.status !== 'qualified') continue;
      const best = byState[sid];
      if ((best !== undefined && best < 0.02) || (best === undefined && R.chance(state, 0.35))) { b.status = 'none'; b.signatures = 0; lost.push(PG.data.stateById[sid].name); }
    }
    if (lost.length) notes.push('Lost ballot access (no candidate cleared the 2% retention threshold, or none ran): ' + lost.join(', ') + '.');
    p.history.push({ year: y, races: rows.length, won: rows.filter((x) => x.won).length, share: p.lastShare, seats: totalSeats(state) });
    p.raceMemo = {};
    updateStatus(state);
    notes.push('Seats now held: ' + totalSeats(state) + '. Status: ' + STATUS.find((x) => x.id === p.status).name + '.');
    const sb = seatsBy(state);
    if (sb.us_house) milestone(state, 'congress', 'elects a member of Congress');
    if (sb.governor) milestone(state, 'governor', 'elects a governor');
    if (sb.president) milestone(state, 'president', 'wins the presidency');
    if (rows.length || lost.length) {
      state.electionNight = { kind: 'party_results', title: p.name + ' — ' + y + ' election results', date: { ...state.date }, rows: rows.sort((a, b) => b.share - a.share), notes, playerAdvanced: rows.some((x) => x.won), message: rows.some((x) => x.won) ? U.plural(rows.filter((x) => x.won).length, 'victory', 'victories') + ' for ' + p.short + '!' : 'No victories this cycle.' };
      PG.game.log(state, 'election', state.electionNight.title, notes);
    }
    // Clear finished candidates out of the active list (keep history short).
    p.candidates = p.candidates.filter((c) => c.status === 'running' || c.year >= y - 4).slice(-60);
  }

  function legacyScore(state) {
    const p = state.party;
    const sb = seatsBy(state);
    return Math.round(p.peakSeats * 12 + (sb.governor ? 150 : 0) + (sb.president ? 500 : 0) + U.sum(p.history, (h) => h.won * 8) + p.brand.nameRec * 2);
  }

  PG.party = { COLORS, STATUS, ACTIONS, create, sync, strength, monthly, act, races, estimate, elections, seatsBy, totalSeats, requiredSignatures, legacyScore, raceBudget, onBallot, electionYear };
})(globalThis.PG = globalThis.PG || {});
