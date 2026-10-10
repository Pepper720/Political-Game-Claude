'use strict';
const { loadPG, test, assert } = require('./harness');
const PG = loadPG();

function governor(seed, st) {
  const s = PG.game.newGame({ seed, name: 'Court Tester', party: 'D', background: 'lawyer', traits: [], homeState: st || 'TX', age: 50, startYear: 2027 });
  s.player.history.push({ officeId: 'us_house', start: { year: 2021, month: 1 }, end: { year: 2027, month: 1 } });
  PG.gov.assumeOffice(s, 'governor', PG.calendar.electionInfo(s, 'governor', 2030), 0.52);
  s.player.capital = 60;
  return s;
}

function enactDirect(s, lawId, scope) {
  const bill = PG.leg.newBill(s, { lawId, scope: scope || 2, sponsorId: 'exec', sponsorName: 'Ally', sponsorParty: 'D', origin: PG.juris.chambersFor(s, 'state')[0], playerStance: 1, execStance: 1 });
  PG.leg.enact(s, bill, 'Test enactment.');
  return bill;
}

test('courts: a vulnerable law draws a lawsuit that moves trial → appeal → final ruling', () => {
  let filed = 0, finished = 0;
  for (let i = 0; i < 12; i++) {
    const s = governor('court-' + i);
    const bill = enactDirect(s, 'assault_weapons_ban', 3);
    const cs = s.courts.cases.find((c) => c.target.id === bill.id);
    if (!cs) continue;
    filed++;
    assert.ok(/Second Amendment/.test(cs.grounds));
    assert.equal(cs.forum, 'fed', 'constitutional claims go to federal court');
    for (let m = 0; m < 40 && cs.status === 'pending'; m++) PG.courts.monthly(s);
    assert.ok(['upheld', 'struck'].includes(cs.status), cs.status);
    finished++;
    const en = s.gov.enacted.find((e) => e.billId === bill.id);
    assert.equal(en.active, cs.status === 'upheld', 'law active iff upheld');
    assert.ok(cs.history.length >= 2);
  }
  assert.ok(filed >= 6, 'most high-vulnerability laws are challenged: ' + filed + '/12');
  assert.equal(filed, finished);
});

test('courts: bench ideology changes the odds; defense and settlement work', () => {
  const s = governor('court-ideo');
  const cs = { forum: 'fed', stage: 'supreme', vuln: 0.4, ideo: { econ: 0, social: -45 }, defense: 0 };
  s.courts.scotus.forEach((j) => { j.ideo = 0.7; });
  const pCons = PG.courts.strikeProb(s, cs, 'supreme');
  s.courts.scotus.forEach((j) => { j.ideo = -0.7; });
  const pLib = PG.courts.strikeProb(s, cs, 'supreme');
  assert.ok(pCons > pLib, 'a conservative court is likelier to strike a progressive law: ' + pCons + ' vs ' + pLib);
  const bill = enactDirect(s, 'end_cash_bail', 2);
  const c2 = PG.courts.file(s, { type: 'law', id: bill.id, lawId: 'end_cash_bail', name: 'End Cash Bail', ideo: PG.leg.L(bill), vuln: 0.5, grounds: 'state constitution', tags: [], level: 'state' }, 'Plaintiffs', 'police_union');
  assert.ok(PG.game.act(s, { type: 'gov.caseDefend', id: c2.id }).ok);
  assert.equal(c2.defense, 0.06);
  assert.ok(PG.game.act(s, { type: 'gov.caseSettle', id: c2.id }).ok);
  assert.equal(c2.status, 'settled');
  const en = s.gov.enacted.find((e) => e.billId === bill.id);
  assert.equal(en.scope, 1, 'settlement narrowed the law');
});

test('courts: Supreme Court vacancy filled by a President-player shifts the median', () => {
  const s = PG.game.newGame({ seed: 'scotus', name: 'P', party: 'R', background: 'lawyer', traits: [], homeState: 'OH', age: 55, startYear: 2029 });
  s.player.history.push({ officeId: 'us_senate', start: { year: 2017, month: 1 }, end: { year: 2029, month: 1 } });
  PG.gov.assumeOffice(s, 'president', PG.calendar.electionInfo(s, 'president', 2028), 0.52);
  s.player.capital = 60;
  const before = PG.courts.median(s.courts.scotus.map((j) => j.ideo));
  s.courts.scotus[6].age = 140; // force a departure of a liberal justice
  let g = 0;
  while (!s.courts.vacancies.length && g++ < 50) PG.courts.monthly(s);
  const v = s.courts.vacancies[0];
  assert.ok(v && v.playerAppoints, 'player appoints');
  const r = PG.game.act(s, { type: 'gov.judge', seat: v.id, nominee: v.nominees[1].id });
  assert.ok(r.ok, r.msg);
  if (!s.courts.vacancies.length) {
    const after = PG.courts.median(s.courts.scotus.map((j) => j.ideo));
    assert.ok(after >= before, 'median moved right or held: ' + before + ' → ' + after);
  }
});

test('preemption: a red state challenges a blue city\'s rent stabilization', () => {
  const s = PG.game.newGame({ seed: 'preempt', name: 'M', party: 'D', background: 'activist', traits: [], homeState: 'TX', cityType: 'urban', age: 40, startYear: 2027 });
  s.player.history.push({ officeId: 'city_council', start: { year: 2023, month: 1 }, end: { year: 2027, month: 1 } });
  s.world.executives.governor.party = 'R';
  s.world.chambers.state_house.majority = 'R';
  PG.gov.assumeOffice(s, 'mayor', PG.calendar.electionInfo(s, 'mayor', 2029), 0.55);
  const bill = PG.leg.newBill(s, { lawId: 'rent_stabilization', scope: 2, sponsorId: 'exec', sponsorName: 'Ally', sponsorParty: null, origin: 'council', playerStance: 1, execStance: 1 });
  PG.leg.enact(s, bill, 'Test.');
  assert.ok(s.courts.cases.some((c) => /State of Texas/.test(c.title)), 'state sued: ' + s.courts.cases.map((c) => c.title));
});
