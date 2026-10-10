/* Jurisdictions: which electorate, budget and body each office answers to. Electorates
 * are generated on demand (deterministically from the world) and cached in state. */
(function (PG) {
  'use strict';
  const U = PG.util;

  const OFFICE_KEY = { school_board: 'school', city_council: 'ward', mayor: 'city', state_house: 'sh', state_senate: 'ss', governor: 'state', us_house: 'cd', us_senate: 'state', president: 'nation' };
  const OFFICE_LEVEL = { school_board: 'school', city_council: 'city', mayor: 'city', state_house: 'state', state_senate: 'state', governor: 'state', us_house: 'federal', us_senate: 'federal', president: 'federal' };
  const OFFICE_BODY = { school_board: 'school', city_council: 'council', mayor: 'council', state_house: 'state_house', state_senate: 'state_senate', governor: 'state_house', us_house: 'us_house', us_senate: 'us_senate', president: 'us_house' };

  function homeState(state) { return PG.data.stateById[state.player.homeState]; }

  function nationDemo() {
    const keys = ['urban', 'suburban', 'rural', 'black', 'hispanic', 'asianOther', 'college', 'religious', 'seniors'];
    const out = { young: 0.2 }; let tot = 0;
    keys.forEach((k) => { out[k] = 0; });
    for (const s of PG.data.states) { tot += s.population; keys.forEach((k) => { out[k] += s[k] * s.population; }); }
    keys.forEach((k) => { out[k] /= tot; });
    return out;
  }

  function seatMember(state, chamberId) {
    const ch = state.world.chambers[chamberId];
    const idx = PG.world.seatIndexFor(state, chamberId);
    return ch && idx !== undefined && idx >= 0 ? ch.members[idx] : null;
  }

  function describe(state, key) {
    const st = homeState(state), city = state.world.home.city;
    switch (key) {
      case 'school': return city.name + ' School District';
      case 'ward': return 'Ward ' + (state.world.home.wardIndex + 1) + ', ' + city.name;
      case 'city': return city.name;
      case 'sh': return st.id + ' House District ' + seatMember(state, 'state_house').district;
      case 'ss': return (st.unicameral ? 'Legislative' : st.id + ' Senate') + ' District ' + seatMember(state, 'state_senate').district;
      case 'cd': return st.id + '-' + seatMember(state, 'us_house').district;
      case 'state': return st.name;
      case 'nation': return 'United States';
      default: if (key.startsWith('st:')) return PG.data.stateById[key.slice(3)].name; return key;
    }
  }

  function electorate(state, key) {
    state.world.electorates = state.world.electorates || {};
    if (state.world.electorates[key]) return state.world.electorates[key];
    const st = homeState(state), city = state.world.home.city;
    let opts;
    switch (key) {
      case 'school': case 'city':
        opts = { type: city.type, lean: city.lean, population: city.population, stateId: st.id, regionKind: 'city' }; break;
      case 'ward': {
        const m = state.world.chambers.council.members[state.world.home.wardIndex];
        opts = { type: city.type, lean: m.lean, population: Math.round(city.population / 9), stateId: st.id, regionKind: 'city' }; break;
      }
      case 'sh': case 'ss': case 'cd': {
        const ch = { sh: 'state_house', ss: 'state_senate', cd: 'us_house' }[key];
        const m = seatMember(state, ch);
        const n = { sh: st.houseSize, ss: st.senateSize, cd: st.houseSeats }[key];
        opts = { type: 'district', lean: m.lean, population: Math.round(st.population * 1e6 / n), stateId: st.id, regionKind: 'state' }; break;
      }
      case 'state':
        opts = { type: 'state', lean: st.lean, population: st.population * 1e6, stateId: st.id, regionKind: 'state' }; break;
      case 'nation':
        opts = { type: 'state', lean: 0, population: 340e6, stateId: st.id, regionKind: 'state', demo: nationDemo() }; break;
      default:
        if (key.startsWith('st:')) {
          const s2 = PG.data.stateById[key.slice(3)];
          opts = { type: 'state', lean: s2.lean, population: s2.population * 1e6, stateId: s2.id, regionKind: 'state' };
        } else throw new Error('Unknown jurisdiction ' + key);
    }
    opts.id = key; opts.name = describe(state, key);
    const e = PG.voters.makeElectorate(opts);
    state.world.electorates[key] = e;
    return e;
  }

  function invalidate(state, key) { if (state.world.electorates) delete state.world.electorates[key]; }

  function forOffice(state, officeId) { return electorate(state, OFFICE_KEY[officeId]); }

  function population(state, level) {
    const st = homeState(state);
    if (level === 'school' || level === 'city') return state.world.home.city.population;
    if (level === 'state') return st.population * 1e6;
    return 340e6;
  }

  // Campaign scale for an office (typical winning budget) in this jurisdiction.
  function typicalBudget(state, officeId) {
    const o = PG.data.officeById[officeId];
    let b = o.typicalBudget;
    if (o.scaleByPop) b *= Math.pow(homeState(state).population / 6, 0.75);
    if (officeId === 'mayor') b *= Math.pow(state.world.home.city.population / 300000, 0.7);
    if (officeId === 'school_board' || officeId === 'city_council') b *= Math.pow(state.world.home.city.population / 250000, 0.5);
    return Math.max(15000, Math.round(b));
  }

  function bodyFor(state, officeId) {
    const st = homeState(state);
    if (officeId === 'governor' && st.unicameral) return 'state_senate';
    return OFFICE_BODY[officeId];
  }

  // Chambers that must pass a bill for this level (in order).
  function chambersFor(state, level) {
    const st = homeState(state);
    if (level === 'school') return ['school'];
    if (level === 'city') return ['council'];
    if (level === 'state') return st.unicameral ? ['state_senate'] : ['state_house', 'state_senate'];
    return ['us_house', 'us_senate'];
  }

  // The executive who signs bills at this level (null for school boards).
  function executiveFor(state, level) {
    if (level === 'school') return null;
    if (level === 'city') return 'mayor';
    if (level === 'state') return 'governor';
    return 'president';
  }

  PG.juris = { OFFICE_KEY, OFFICE_LEVEL, homeState, electorate, invalidate, forOffice, describe, population, typicalBudget, bodyFor, chambersFor, executiveFor, seatMember, nationDemo };
})(globalThis.PG = globalThis.PG || {});
