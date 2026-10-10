'use strict';
const { loadPG, test, assert } = require('./harness');
const PG = loadPG();

const SETUP = { seed: 'test-seed', name: 'Test Player', party: 'D', background: 'teacher', traits: ['wonk', 'workhorse'], homeState: 'PA', age: 34, cityType: 'suburban', difficulty: 'normal', startYear: 2027 };

test('rng: same seed gives same sequence', () => {
  const a = PG.rng.create('abc'), b = PG.rng.create('abc'), c = PG.rng.create('abd');
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 20; i++) { sa.push(PG.rng.next(a)); sb.push(PG.rng.next(b)); sc.push(PG.rng.next(c)); }
  assert.deepEqual(sa, sb);
  assert.ok(JSON.stringify(sa) !== JSON.stringify(sc), 'different seeds differ');
  assert.ok(sa.every((x) => x >= 0 && x < 1), 'range');
});

test('rng: distributions are sane', () => {
  const r = PG.rng.create('dist');
  let s = 0, s2 = 0; const n = 20000;
  for (let i = 0; i < n; i++) { const x = PG.rng.normal(r, 0, 1); s += x; s2 += x * x; }
  assert.near(s / n, 0, 0.05, 'normal mean');
  assert.near(Math.sqrt(s2 / n), 1, 0.05, 'normal sd');
  const counts = [0, 0, 0];
  for (let i = 0; i < 9000; i++) counts[PG.rng.int(r, 0, 2)]++;
  counts.forEach((c) => assert.near(c, 3000, 250, 'int uniform'));
});

test('data: 50 states + DC with 538 electoral votes and 435 House seats', () => {
  assert.equal(PG.data.states.length, 51);
  assert.equal(PG.util.sum(PG.data.states, (s) => s.ev), 538);
  assert.equal(PG.util.sum(PG.data.states, (s) => s.houseSeats), 435);
});

test('data: every state holds exactly two Senate classes; 33/33/34 split', () => {
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (const s of PG.data.states) {
    if (s.isDC) { assert.equal(s.senateClasses, ''); continue; }
    assert.equal(s.senateClasses.length, 2, s.id);
    for (const c of s.senateClasses) counts[c]++;
  }
  assert.deepEqual(counts, { 1: 33, 2: 33, 3: 34 });
});

test('voters: bloc shares sum to 1 and calibration reproduces lean', () => {
  for (const st of PG.data.states) {
    const e = PG.voters.makeElectorate({ id: 'x', name: st.name, type: 'state', stateId: st.id, lean: st.lean, population: 1e6 });
    assert.near(PG.util.sum(e.blocs, (b) => b.share), 1, 1e-9, st.id + ' shares');
    const D = { id: 'd', party: 'D', ideology: PG.voters.partyNorm('D'), nameRec: 100, fav: 50 };
    const Rc = { id: 'r', party: 'R', ideology: PG.voters.partyNorm('R'), nameRec: 100, fav: 50 };
    const res = PG.voters.computeVote(e, [D, Rc], { mode: 'general', kind: 'pres', partisanW: 1 });
    const margin = (res.shares.r - res.shares.d) * 100;
    assert.near(margin, st.lean, 0.6, st.id + ' generic margin');
    const regionTotal = PG.util.sum(e.regions, (r) => r.size);
    assert.near(regionTotal, 1, 1e-6, st.id + ' regions');
  }
});

test('voters: moderate candidate gains in general, loses in primary', () => {
  const e = PG.voters.makeElectorate({ id: 'x', name: 'Swing', type: 'state', stateId: 'PA', lean: 0, population: 1e6 });
  const base = { party: 'D', nameRec: 80, fav: 52 };
  const progressive = { ...base, id: 'p', ideology: { econ: -45, social: -50 } };
  const moderate = { ...base, id: 'm', ideology: { econ: -5, social: -10 } };
  const R1 = { id: 'r', party: 'R', ideology: PG.voters.partyNorm('R'), nameRec: 80, fav: 52 };
  const gProg = PG.voters.computeVote(e, [progressive, R1], { mode: 'general', kind: 'pres' }).shares.p;
  const gMod = PG.voters.computeVote(e, [moderate, R1], { mode: 'general', kind: 'pres' }).shares.m;
  assert.ok(gMod > gProg, 'moderate does better in general: ' + gMod + ' vs ' + gProg);
  const prim = PG.voters.computeVote(e, [progressive, moderate], { mode: 'primary', party: 'D', primaryType: 'closed', kind: 'primary' });
  assert.ok(prim.shares.p > prim.shares.m, 'progressive wins closed D primary: ' + JSON.stringify(prim.shares));
});

test('voters: ranked-choice eliminates the last-place candidate', () => {
  const e = PG.voters.makeElectorate({ id: 'x', name: 'ME', type: 'state', stateId: 'ME', lean: -4, population: 1e6 });
  const c = [
    { id: 'a', party: 'D', ideology: { econ: -40, social: -40 }, nameRec: 90, fav: 50 },
    { id: 'b', party: 'R', ideology: { econ: 40, social: 40 }, nameRec: 90, fav: 50 },
    { id: 'c', party: 'I', ideology: { econ: 0, social: 0 }, nameRec: 60, fav: 55 },
  ];
  const r = PG.voters.computeRCV(e, c, { mode: 'general', kind: 'mid' });
  assert.ok(r.rounds.length >= 1);
  const fin = r.final;
  const ids = Object.keys(fin.shares);
  assert.ok(ids.length <= 3);
  if (r.rounds.length > 1) assert.equal(ids.length, 2);
});

test('world: generation is deterministic and chambers are complete', () => {
  const a = PG.game.newGame(SETUP), b = PG.game.newGame(SETUP);
  assert.equal(PG.save.serialize(a).length > 1000, true);
  assert.deepEqual(a.world.chambers.us_house.members.map((m) => m.party).join(''), b.world.chambers.us_house.members.map((m) => m.party).join(''));
  assert.equal(a.world.chambers.us_house.members.length, 435);
  assert.equal(a.world.chambers.us_senate.members.length, 100);
  assert.equal(a.world.chambers.state_house.members.length, 203);
  assert.equal(a.world.chambers.state_senate.members.length, 50);
  assert.ok(a.world.chambers.us_house.members[a.world.home.usHouseIndex].state === 'PA', 'home district in home state');
  const ch = a.world.chambers.us_house;
  assert.equal(ch.counts.D + ch.counts.R, 435);
  ch.committees.forEach((c) => assert.ok(c.members.length > 5 && c.chair, c.name));
});

test('world: gerrymandering packs the minority party', () => {
  const st = PG.data.stateById.TX;
  const holder = { rng: PG.rng.create('gerry') };
  let natSeats = 0, gerrySeats = 0;
  for (let i = 0; i < 20; i++) {
    natSeats += PG.world.districtLeans(holder, st, 38, 'commission').filter((l) => l > 0).length;
    gerrySeats += PG.world.districtLeans(holder, st, 38, 'R').filter((l) => l > 0).length;
  }
  assert.ok(gerrySeats > natSeats, 'R map yields more R-leaning seats: ' + gerrySeats + ' vs ' + natSeats);
});

test('calendar: offices land on real election years', () => {
  const s = PG.game.newGame(SETUP);
  assert.ok(PG.calendar.onBallot(s, 'president', 2028));
  assert.ok(!PG.calendar.onBallot(s, 'president', 2030));
  assert.ok(PG.calendar.onBallot(s, 'governor', 2030), 'PA governor in midterm years');
  assert.ok(!PG.calendar.onBallot(s, 'governor', 2028));
  assert.ok(PG.calendar.onBallot(s, 'us_senate', 2028), 'PA class 3 in 2028');
  assert.ok(PG.calendar.onBallot(s, 'us_senate', 2030), 'PA class 1 in 2030');
  assert.ok(!PG.calendar.onBallot(s, 'us_senate', 2026), 'PA holds no class 2 seat');
  assert.ok(PG.calendar.onBallot(s, 'city_council', 2027));
  const info = PG.calendar.nextElection(s, 'city_council');
  assert.equal(info.year, 2027); assert.equal(info.general.month, 11);
  const va = PG.game.newGame({ ...SETUP, homeState: 'VA' });
  assert.ok(PG.calendar.onBallot(va, 'governor', 2029) && !PG.calendar.onBallot(va, 'governor', 2030));
  const nh = PG.game.newGame({ ...SETUP, homeState: 'NH' });
  assert.ok(PG.calendar.onBallot(nh, 'governor', 2028) && PG.calendar.onBallot(nh, 'governor', 2030));
});

test('eligibility: ladder, age, DC and term limits', () => {
  const s = PG.game.newGame({ ...SETUP, age: 22 });
  assert.ok(PG.character.eligibility(s, 'city_council').ok, 'council ok');
  assert.ok(PG.character.eligibility(s, 'school_board').ok, 'school board ok');
  assert.ok(!PG.character.eligibility(s, 'us_house').ok, 'must start local');
  s.player.history.push({ officeId: 'city_council', start: { year: 2028, month: 1 }, end: { year: 2028, month: 2 } });
  const h = PG.character.eligibility(s, 'us_house');
  assert.ok(!h.ok && h.reasons.some((r) => r.includes('age 25')), 'too young for House: ' + h.reasons);
  const dc = PG.game.newGame({ ...SETUP, homeState: 'DC' });
  dc.player.history.push({ officeId: 'city_council', start: { year: 2028, month: 1 }, end: { year: 2028, month: 2 } });
  assert.ok(!PG.character.eligibility(dc, 'us_senate').ok, 'DC has no senators');
  const p = PG.game.newGame({ ...SETUP, age: 50 });
  p.player.history.push({ officeId: 'president', start: { year: 2021, month: 1 }, end: { year: 2025, month: 1 } });
  p.player.history.push({ officeId: 'president', start: { year: 2025, month: 1 }, end: { year: 2026, month: 1 } });
  assert.ok(!PG.character.eligibility(p, 'president').ok, '22nd Amendment');
});

test('save: round-trip preserves state and RNG continuation', () => {
  const s = PG.game.newGame(SETUP);
  const text = PG.save.serialize(s);
  const t = PG.save.deserialize(text);
  assert.equal(JSON.stringify(t), JSON.stringify(s));
  const a = PG.rng.next(s), b = PG.rng.next(t);
  assert.equal(a, b, 'RNG continues identically after load');
  assert.throws(() => PG.save.deserialize('{"format":"nope"}'));
  assert.throws(() => PG.save.deserialize('not json'));
  const bad = JSON.parse(text); delete bad.state.player;
  assert.throws(() => PG.save.deserialize(JSON.stringify(bad)));
});
