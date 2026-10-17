'use strict';
const { loadPG, test, assert } = require('./harness');
const PG = loadPG();
const U = PG.util;

function game(over) {
  const s = PG.game.newGame(Object.assign({ seed: 'leg', name: 'Lee Tester', party: 'D', background: 'lawyer', traits: ['charismatic', 'rainmaker'], homeState: 'PA', age: 45, cityType: 'suburban', startYear: 2027 }, over || {}));
  s.player.history.push({ officeId: 'city_council', start: { year: 2019, month: 1 }, end: { year: 2023, month: 1 } });
  return s;
}

// Play a race to completion with a reasonable plan. Returns the list of election nights.
function runRace(s, officeId, opts) {
  opts = opts || {};
  const r = PG.game.act(s, { type: 'career.declare', officeId });
  if (!r.ok) throw new Error('declare failed: ' + r.msg);
  PG.game.act(s, { type: 'career.fastForward' });
  const nights = [];
  let guard = 0;
  while ((s.campaign || s.electionNight || s.events.active || s.player.declared) && guard++ < 80) {
    if (s.electionNight) { nights.push(s.electionNight); PG.game.act(s, { type: 'election.dismiss' }); continue; }
    if (s.events.active) { PG.game.act(s, { type: 'event.choose', i: 0 }); continue; }
    if (!s.campaign) { PG.game.act(s, { type: 'career.fastForward' }); continue; }
    if (opts.boost) { const pc = PG.campaign.playerCand(s); pc.fav = Math.max(pc.fav, 70); pc.cash += 1e6; }
    const plan = PG.campaign.defaultPlan(s);
    PG.game.act(s, { type: 'campaign.setPlan', plan });
    PG.game.act(s, { type: 'endMonth' });
  }
  return nights;
}

function untilOffice(s) {
  let g = 0;
  while (s.player.pendingOffice && g++ < 30) { if (s.events.active) PG.game.act(s, { type: 'event.choose', i: 0 }); else PG.game.act(s, { type: 'endMonth' }); }
}

test('state house: partisan primary then general; winner is seated in the chamber with committees', () => {
  const s = game({ homeState: 'OH', party: 'R', seed: 'sh-1' });
  const nights = runRace(s, 'state_house', { boost: true });
  assert.ok(nights.length >= 2, 'primary and general nights: ' + nights.map((n) => n.title));
  assert.ok(/primary/i.test(nights[0].title), nights[0].title);
  assert.ok(nights[nights.length - 1].playerAdvanced, 'won general');
  untilOffice(s);
  assert.equal(s.player.office.officeId, 'state_house');
  const ch = s.world.chambers.state_house;
  const me = ch.members.find((m) => m.isPlayer);
  assert.ok(me && me.committees.length === 2, 'seated with two committees');
  assert.equal(ch.members.length, 99);
  assert.equal(s.gov.kind, 'legislator');
  assert.equal(PG.calendar.termLength('state_house', PG.data.stateById.OH), 2);
});

test('top-two primary (CA) advances exactly two candidates regardless of party', () => {
  const s = game({ homeState: 'CA', seed: 'top2' });
  const nights = runRace(s, 'state_senate', { boost: true });
  const prim = nights.find((n) => /Top-two/.test(n.title));
  assert.ok(prim, 'had a top-two primary: ' + nights.map((n) => n.title));
  assert.equal(prim.winners.length, 2);
});

test('ranked-choice general (Maine) reports tabulation rounds when no majority', () => {
  const s = game({ homeState: 'ME', seed: 'rcv-me' });
  const e = PG.juris.electorate(s, 'state');
  const c = [
    { id: 'a', party: 'D', ideology: PG.voters.partyNorm('D'), nameRec: 80, fav: 50 },
    { id: 'b', party: 'R', ideology: PG.voters.partyNorm('R'), nameRec: 80, fav: 50 },
    { id: 'c', party: 'I', ideology: { econ: 0, social: -10 }, nameRec: 70, fav: 62 },
  ];
  const r = PG.voters.computeRCV(e, c, { mode: 'general', kind: 'mid' });
  const first = r.rounds[0].shares;
  if (Math.max(first.a, first.b, first.c) < 0.5) assert.ok(r.rounds.length === 2 && Object.keys(r.final.shares).length === 2, 'second round with two finalists');
  assert.ok(r.final.shares[Object.keys(r.final.shares)[0]] > 0);
});

test('Senate filibuster: partisan bill without 60 votes dies on cloture; reconciliation bypasses it', () => {
  const s = game({ seed: 'cloture' });
  // Give the player a governing context at the federal level as a senator.
  const info = PG.calendar.electionInfo(s, 'us_senate', 2028);
  PG.gov.assumeOffice(s, 'us_senate', info, 0.55);
  const sen = s.world.chambers.us_senate;
  assert.equal(PG.leg.threshold(s, sen, {}, 'cloture'), 60);
  const maj = sen.majority;
  const lawId = maj === 'R' ? 'income_tax_cut' : 'tax_high_earners';
  const bill = PG.leg.newBill(s, { lawId, scope: 3, sponsorId: sen.members.find((m) => m.party === maj && !m.isPlayer).id, sponsorName: 'Maj', sponsorParty: maj, origin: 'us_senate' });
  bill.stage = 'floor';
  const w = PG.leg.whipCount(s, 'us_senate', bill, { kind: 'cloture' });
  const minority = sen.members.filter((m) => m.party !== maj).length;
  if (minority >= 41 && w.yes < 60) {
    s.gov.reconUsed = PG.leg.fiscalYear(s); // block reconciliation
    PG.leg.vote(s, 'us_senate', bill, 'cloture');
    const v = bill.votes[bill.votes.length - 1];
    assert.ok(!v.passed, 'cloture failed ' + v.yea + '-' + v.nay);
    assert.ok(v.reasons.some((r) => /filibuster/.test(r)), 'explains filibuster');
  }
  // Reconciliation path: simple majority.
  const b2 = PG.leg.newBill(s, { lawId, scope: 2, sponsorId: 'x', sponsorName: 'Maj', sponsorParty: maj, origin: 'us_senate' });
  b2.reconciliation = true;
  assert.equal(PG.leg.threshold(s, sen, b2, 'passage'), 51);
});

test('vote explanations name defectors and lobbying', () => {
  const s = game({ seed: 'explain' });
  const info = PG.calendar.electionInfo(s, 'us_house', 2028);
  PG.gov.assumeOffice(s, 'us_house', info, 0.55);
  const house = s.world.chambers.us_house;
  const bill = PG.leg.newBill(s, { lawId: 'min_wage', scope: 2, sponsorId: 'x', sponsorName: 'Sponsor', sponsorParty: 'D', origin: 'us_house' });
  const v = PG.leg.vote(s, 'us_house', bill, 'passage');
  assert.equal(v.yea + v.nay + Object.values(v.roll).filter((x) => x === 'A').length, 435);
  assert.ok(v.reasons.length > 0, 'has reasons');
  assert.ok(v.reasons.some((r) => /Lobbying/.test(r)), 'mentions lobbying: ' + v.reasons.join(' | '));
  assert.ok(/succeeded|failed/.test(v.summary));
  // Whip counts are stable (deterministic member noise).
  const w1 = PG.leg.whipCount(s, 'us_house', bill), w2 = PG.leg.whipCount(s, 'us_house', bill);
  assert.equal(w1.yes, w2.yes);
  void house;
});

test('veto override thresholds follow state rules', () => {
  const al = game({ homeState: 'AL', seed: 'al' });
  const il = game({ homeState: 'IL', seed: 'il' });
  const pa = game({ homeState: 'PA', seed: 'pa' });
  assert.equal(PG.leg.threshold(al, al.world.chambers.state_house, {}, 'override'), Math.ceil(105 * 0.5));
  assert.equal(PG.leg.threshold(il, il.world.chambers.state_house, {}, 'override'), Math.ceil(118 * 0.6));
  assert.equal(PG.leg.threshold(pa, pa.world.chambers.state_house, {}, 'override'), Math.ceil(203 * 0.67 - 1e-9));
});

test('legislative term limits block reelection (Michigan 12 years per chamber... 6 House terms)', () => {
  const s = game({ homeState: 'MO', seed: 'tl' });
  // Missouri: 8 years per chamber. Four two-year terms served.
  for (let i = 0; i < 4; i++) s.player.history.push({ officeId: 'state_house', start: { year: 2019 + 2 * i, month: 1 }, end: { year: 2021 + 2 * i, month: 1 } });
  const el = PG.character.eligibility(s, 'state_house');
  assert.ok(!el.ok && el.reasons.some((r) => /limits legislators/.test(r)), el.reasons.join(' '));
});

test('redistricting after the census redraws home-state districts and explains control', () => {
  const s = game({ homeState: 'TX', seed: 'redist' });
  const before = s.world.chambers.us_house.members.filter((m) => m.state === 'TX').map((m) => m.lean).join(',');
  s.date = { year: 2032, month: 1 };
  PG.world.redistrict(s);
  const after = s.world.chambers.us_house.members.filter((m) => m.state === 'TX').map((m) => m.lean).join(',');
  assert.ok(before !== after, 'leans changed');
  assert.equal(s.world.chambers.us_house.members.length, 435);
  assert.ok(s.log[0].text.includes('Redistricting') && s.log[0].causes[0].includes('control'));
});

test('U.S. House incumbent faces a district whose lean shapes the race', () => {
  const s = game({ homeState: 'PA', seed: 'cd' });
  const e = PG.juris.electorate(s, 'cd');
  const seat = PG.juris.seatMember(s, 'us_house');
  assert.equal(e.lean, seat.lean);
  assert.equal(seat.state, 'PA');
});
