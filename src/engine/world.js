/* World generation: home jurisdictions, districts (with gerrymandering), legislative
 * chambers full of fictional members, executives, and the national picture. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;

  function personName(state) {
    return R.pick(state, PG.data.names.first) + ' ' + R.pick(state, PG.data.names.last);
  }
  function cityName(state) {
    return R.pick(state, PG.data.names.cityPrefix) + R.pick(state, PG.data.names.citySuffix);
  }

  const CITY_POP = { urban: [350000, 1400000], suburban: [60000, 220000], smalltown: [15000, 55000], rural: [18000, 60000] };

  /* District leans for a state: natural geographic sorting, then the map-drawer packs
   * and cracks. Returns leans sorted from most D to most R. */
  function districtLeans(state, st, n, control) {
    if (n <= 0) return [];
    if (n === 1) return [st.lean];
    const spread = 14 + st.urban * 34;
    let leans = [];
    for (let i = 0; i < n; i++) leans.push(R.normal(state, st.lean, spread));
    const mean = U.sum(leans) / n;
    leans = leans.map((l) => l - mean + st.lean).sort((a, b) => a - b);
    if (control === 'R' || control === 'D') {
      // Pack the other party's voters into a few lopsided seats, crack the rest.
      const packN = Math.max(1, Math.round(n * 0.3));
      const delta = 6;
      if (control === 'R') {
        for (let i = 0; i < n; i++) leans[i] += i < packN ? -delta * (n - packN) / packN : delta;
      } else {
        for (let i = 0; i < n; i++) leans[i] += i >= n - packN ? delta * (n - packN) / packN : -delta;
      }
      leans.sort((a, b) => a - b);
    }
    return leans.map((l) => U.round(U.clamp(l, -95, 95), 1));
  }

  function moderateIdeology(state, party, lean, key) {
    const norm = PG.voters.partyNorm(party);
    const competitiveness = U.clamp(1 - Math.abs(lean) / 45, 0, 1);
    const mod = 1 - 0.45 * competitiveness;
    return {
      econ: U.round(U.clamp(norm.econ * mod + lean * 0.12 + R.normal(state, 0, 13), -100, 100)),
      social: U.round(U.clamp(norm.social * mod + lean * 0.15 + R.normal(state, 0, 13), -100, 100)),
    };
  }

  function genMember(state, chamberId, idx, lean, stateId, partisanBias) {
    const pR = U.logistic((lean + (partisanBias || 0) + R.normal(state, 0, 4)) / 7);
    const party = R.chance(state, pR) ? 'R' : 'D';
    const ideo = moderateIdeology(state, party, lean);
    const seniority = Math.floor(Math.min(30, -Math.log(1 - R.next(state)) * 7));
    return {
      id: chamberId + '-' + idx, name: personName(state), party, econ: ideo.econ, social: ideo.social, lean: U.round(lean, 1),
      seniority, loyalty: U.round(U.clamp(0.82 - (1 - Math.min(1, Math.abs(lean) / 40)) * 0.2 + R.normal(state, 0, 0.07), 0.4, 0.98), 2),
      state: stateId, district: idx + 1, rel: 0, committees: [],
    };
  }

  function committeeKey(chamberId) {
    if (chamberId === 'us_house' || chamberId === 'us_senate') return chamberId;
    if (chamberId === 'state_house' || chamberId === 'state_senate') return 'state';
    return chamberId; // council / school
  }

  function assignCommittees(state, ch) {
    const defs = PG.data.committees[committeeKey(ch.id)];
    const n = ch.members.length;
    const per = n <= 9 ? Math.min(n, 3) : n <= 60 ? Math.max(5, Math.round(n / 4.5)) : Math.max(11, Math.round(n / 9));
    ch.committees = defs.map((d) => ({ id: d.id, name: d.name, cats: d.cats, members: [], chair: null, ranking: null }));
    const majority = ch.majority;
    for (const c of ch.committees) {
      const pool = R.shuffle(state, ch.members);
      const majN = Math.ceil(per * 0.55 + 0.01), minN = per - majN;
      const maj = pool.filter((m) => !ch.partisan || m.party === majority).slice(0, ch.partisan ? majN : per);
      const min = ch.partisan ? pool.filter((m) => m.party !== majority).slice(0, minN) : [];
      c.members = maj.concat(min).map((m) => m.id);
      const chairCand = U.sortBy(maj, (m) => -m.seniority)[0];
      c.chair = chairCand ? chairCand.id : null;
      const rk = U.sortBy(min, (m) => -m.seniority)[0];
      c.ranking = rk ? rk.id : null;
    }
    for (const m of ch.members) m.committees = ch.committees.filter((c) => c.members.includes(m.id)).map((c) => c.id);
  }

  function setLeadership(state, ch) {
    if (ch.partisan) {
      const counts = { D: 0, R: 0 };
      ch.members.forEach((m) => { if (counts[m.party] !== undefined) counts[m.party]++; });
      ch.counts = counts;
      if (counts.D === counts.R) ch.majority = ch.tieBreakParty || 'D';
      else ch.majority = counts.R > counts.D ? 'R' : 'D';
      const lead = (p) => U.sortBy(ch.members.filter((m) => m.party === p && !m.isPlayer), (m) => -(m.seniority + Math.abs(m.econ) / 10))[0];
      const L = lead(ch.majority), M = lead(ch.majority === 'R' ? 'D' : 'R');
      ch.leaders = { majority: L ? L.id : null, minority: M ? M.id : null };
    } else {
      ch.counts = null; ch.majority = null;
      const L = U.sortBy(ch.members.filter((m) => !m.isPlayer), (m) => -m.seniority)[0];
      ch.leaders = { majority: L ? L.id : null, minority: null };
    }
  }

  function makeChamber(state, spec) {
    const ch = {
      id: spec.id, name: spec.name, level: spec.level, partisan: spec.partisan !== false,
      size: spec.leans.length, members: [], committees: [], rules: spec.rules || {}, tieBreakParty: spec.tieBreakParty,
    };
    spec.leans.forEach((l, i) => ch.members.push(genMember(state, spec.id, i, l.lean !== undefined ? l.lean : l, l.state || spec.stateId, spec.partisanBias)));
    if (spec.districtOf) ch.members.forEach((m, i) => { m.district = spec.districtOf[i]; });
    setLeadership(state, ch);
    assignCommittees(state, ch);
    return ch;
  }

  function usHouseLeans(state) {
    const out = [], districtOf = [];
    for (const st of PG.data.states) {
      if (st.houseSeats <= 0) continue;
      const leans = districtLeans(state, st, st.houseSeats, st.redistricting);
      const order = R.shuffle(state, leans.map((l, i) => i));
      order.forEach((k, i) => { out.push({ lean: leans[k], state: st.id }); districtOf.push(i + 1); });
    }
    return { leans: out, districtOf };
  }

  function usSenateLeans() {
    const out = [];
    for (const st of PG.data.states) {
      if (st.isDC) continue;
      out.push({ lean: st.lean, state: st.id }, { lean: st.lean, state: st.id });
    }
    return out;
  }

  function nearestIndex(list, target, filter) {
    let best = -1, bd = Infinity;
    list.forEach((m, i) => {
      if (filter && !filter(m)) return;
      const d = Math.abs((m.lean !== undefined ? m.lean : m) - target);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function firstYear(start, pred) { for (let y = start; y < start + 12; y++) if (pred(y)) return y; return start; }

  function createExecutive(state, party, lean, title) {
    const ideo = moderateIdeology(state, party, lean);
    return { name: personName(state), party, econ: ideo.econ, social: ideo.social, title, approval: U.round(R.range(state, 42, 56)) };
  }

  function createWorld(state, setup) {
    const st = PG.data.stateById[setup.homeState];
    const year = state.date.year;
    const cityType = st.isDC ? 'urban' : (setup.cityType || 'suburban');
    const popRange = CITY_POP[cityType];
    const city = {
      name: st.isDC ? 'Washington' : (setup.cityName || cityName(state)), type: cityType,
      population: st.isDC ? 680000 : Math.round(R.range(state, popRange[0], popRange[1]) / 1000) * 1000,
      lean: st.isDC ? st.lean : U.round(U.clamp(st.lean + PG.voters.TYPES[cityType].leanShift + R.normal(state, 0, 6), -90, 90), 1),
    };
    const areaLean = U.lerp(city.lean, st.lean, 0.35);

    const oddLeg = PG.calendar.ODD_YEAR_LEGISLATURES.includes(st.id);
    const firstOdd = firstYear(year, (y) => y % 2 === 1);
    const firstLeg = firstYear(year, (y) => (y % 2 === 1) === oddLeg);
    const seats = {
      school_board: firstOdd, city_council: firstOdd, mayor: firstOdd + 2,
      state_house: firstLeg, state_senate: st.senateTerm === 4 && R.chance(state, 0.5) ? firstLeg + 2 : firstLeg,
    };
    if (st.houseTerm === 4) seats.state_house = st.id === 'ND' ? firstYear(year, (y) => y % 4 === 0) : firstYear(year, (y) => (oddLeg ? (y % 4 === 3) : (y % 4 === 2)));

    // Local bodies (nonpartisan; members still have party leanings).
    const wardLeans = [];
    for (let i = 0; i < 9; i++) wardLeans.push(U.round(city.lean + R.normal(state, 0, 14), 1));
    wardLeans.sort((a, b) => a - b);
    const council = makeChamber(state, { id: 'council', name: city.name + ' City Council', level: 'local', partisan: false, leans: wardLeans, stateId: st.id, rules: { override: 2 / 3 } });
    const schoolLeans = [];
    for (let i = 0; i < 7; i++) schoolLeans.push(U.round(city.lean + R.normal(state, 0, 6), 1));
    const school = makeChamber(state, { id: 'school', name: city.name + ' Board of Education', level: 'local', partisan: false, leans: schoolLeans, stateId: st.id, rules: {} });

    const chambers = { council, school };
    const home = { city, wardIndex: nearestIndex(council.members, areaLean - 3) };

    if (!st.isDC) {
      const ctrl = st.redistricting;
      if (!st.unicameral) {
        const hl = districtLeans(state, st, st.houseSize, ctrl);
        chambers.state_house = makeChamber(state, { id: 'state_house', name: st.name + ' House', level: 'state', leans: hl, stateId: st.id, rules: { override: st.override } });
        home.stateHouseIndex = nearestIndex(chambers.state_house.members, areaLean + R.normal(state, 0, 5));
      }
      const sl = districtLeans(state, st, st.senateSize, ctrl);
      chambers.state_senate = makeChamber(state, { id: 'state_senate', name: st.unicameral ? 'Nebraska Legislature' : st.name + ' Senate', level: 'state', partisan: true, leans: sl, stateId: st.id, rules: { override: st.override } });
      home.stateSenateIndex = nearestIndex(chambers.state_senate.members, areaLean + R.normal(state, 0, 4));
    }

    const hl = usHouseLeans(state);
    chambers.us_house = makeChamber(state, { id: 'us_house', name: 'U.S. House', level: 'federal', leans: hl.leans, districtOf: hl.districtOf, rules: { override: 2 / 3, discharge: 218 } });
    if (!st.isDC) home.usHouseIndex = nearestIndex(chambers.us_house.members, areaLean + R.normal(state, 0, 5), (m) => m.state === st.id);

    // President: elected in the most recent presidential year.
    const lastPres = year - (year % 4 === 0 ? 4 : year % 4);
    const presParty = R.chance(state, 0.5) ? 'R' : 'D';
    const president = createExecutive(state, presParty, presParty === 'R' ? 10 : -10, 'President');
    president.electedYear = lastPres; president.termNumber = R.chance(state, 0.6) ? 1 : 2;
    president.approval = U.round(R.range(state, 40, 50));

    chambers.us_senate = makeChamber(state, { id: 'us_senate', name: 'U.S. Senate', level: 'federal', leans: usSenateLeans(), partisanBias: -3, tieBreakParty: presParty, rules: { cloture: 60, override: 2 / 3 } });
    // Senate seat numbering: seats within a state get their class.
    chambers.us_senate.members.forEach((m) => {
      const s = PG.data.stateById[m.state];
      const classes = s.senateClasses.split('');
      m.district = 'Class ' + classes[(m.id.split('-')[1] | 0) % 2];
      m.senateClass = Number(classes[(m.id.split('-')[1] | 0) % 2]);
    });

    const govParty = R.chance(state, U.logistic(st.lean / 14)) ? 'R' : 'D';
    const executives = {
      mayor: createExecutive(state, R.chance(state, U.logistic(city.lean / 14)) ? 'R' : 'D', city.lean, 'Mayor'),
      governor: st.isDC ? null : createExecutive(state, govParty, st.lean, 'Governor'),
      president,
    };

    state.world = {
      seats, home, chambers, executives,
      national: {
        economy: { growth: 1.9, unemployment: 4.3, inflation: 2.7, fedRate: 3.6, sentiment: 68, gdp: 31e12, recession: false, trend: 1.9 },
        environment: 0, generic: 0,
      },
      local: { growthOffset: U.round(R.normal(state, 0, 0.5), 2), unemploymentOffset: U.round(R.normal(state, 0, 0.6), 2) },
      lastCensus: Math.floor(year / 10) * 10,
    };
    PG.world.updateEnvironment(state);
  }

  // National environment (+R margin) from presidential approval, economy, midterm penalty.
  function updateEnvironment(state) {
    const n = state.world.national;
    const p = state.world.executives.president;
    const econ = n.economy;
    const econScore = (econ.growth - 2) * 1.2 - (econ.unemployment - 4.5) * 1.0 - Math.max(0, econ.inflation - 2.5) * 1.1;
    const presStanding = (p.approval - 47) * 0.35 + econScore * 0.6;
    const sign = p.party === 'D' ? -1 : 1; // good standing helps the president's party
    const year = state.date.year;
    const midterm = year % 4 === 2 ? 1.0 : 0;
    // Midterm penalty for the president's party (~historical average swing).
    const env = sign * presStanding - sign * midterm * 3.5;
    n.environment = U.round(U.clamp(env, -15, 15), 1);
    n.generic = n.environment;
    return n.environment;
  }

  function seatIndexFor(state, chamberId) {
    const h = state.world.home;
    return { council: h.wardIndex, state_house: h.stateHouseIndex, state_senate: h.stateSenateIndex, us_house: h.usHouseIndex }[chamberId];
  }

  function chamberControlSummary(ch) {
    if (!ch.partisan) return 'Nonpartisan body';
    return (ch.majority === 'D' ? 'Democratic' : 'Republican') + ' majority ' + Math.max(ch.counts.D, ch.counts.R) + '–' + Math.min(ch.counts.D, ch.counts.R);
  }

  /* After each census, the home state redraws its maps. Whoever controls the process
   * (one-party trifecta, commission, or divided government/courts) shapes the lines.
   * Members keep their seats; their districts' leans change. */
  function redistrict(state) {
    const st = PG.data.stateById[state.player.homeState];
    state.world.lastRedistrict = state.date.year;
    if (st.isDC) return;
    let control = state.world.redistrictingOverride || st.redistricting;
    if (control !== 'commission') {
      const leg = [state.world.chambers.state_house, state.world.chambers.state_senate].filter(Boolean);
      const gov = state.world.executives.governor;
      const parties = leg.map((c) => c.majority).concat(gov ? [gov.party] : []);
      control = parties.every((p) => p === parties[0]) ? parties[0] : 'split';
    }
    const causes = ['Map-drawing control: ' + ({ R: 'Republican trifecta', D: 'Democratic trifecta', commission: 'independent commission', split: 'divided government — courts and compromise' }[control] || control)];
    const shift = (chId, n) => {
      const ch = state.world.chambers[chId];
      if (!ch) return;
      const idx = ch.members.map((m, i) => i).filter((i) => ch.members[i].state === st.id);
      const leans = districtLeans(state, st, idx.length, control);
      const order = idx.slice().sort((a, b) => ch.members[a].lean - ch.members[b].lean);
      order.forEach((i, k) => {
        const m = ch.members[i];
        const before = m.lean;
        m.lean = leans[k];
        if (m.isPlayer) causes.push('Your ' + ch.name + ' district moved from ' + U.fmtLean(before) + ' to ' + U.fmtLean(m.lean) + '.');
      });
      void n;
    };
    shift('state_house'); shift('state_senate'); shift('us_house');
    ['sh', 'ss', 'cd'].forEach((k) => PG.juris.invalidate(state, k));
    if (state.gov && ['sh', 'ss', 'cd'].includes(state.gov.key)) {
      const e = PG.juris.electorate(state, state.gov.key);
      for (const b of e.blocs) if (state.gov.approval.byBloc[b.id] === undefined) state.gov.approval.byBloc[b.id] = 50;
      PG.approval.recompute(state);
    }
    PG.game.log(state, 'world', 'Redistricting: ' + st.name + ' adopted new maps after the ' + (state.date.year - 2) + ' census.', causes);
    PG.game.news(state, st.name + ' unveils new political maps', 0);
  }

  PG.world = {
    redistrict,
    personName, cityName, districtLeans, genMember, makeChamber, setLeadership, assignCommittees, createWorld,
    updateEnvironment, seatIndexFor, nearestIndex, createExecutive, moderateIdeology, chamberControlSummary, committeeKey,
  };
})(globalThis.PG = globalThis.PG || {});
