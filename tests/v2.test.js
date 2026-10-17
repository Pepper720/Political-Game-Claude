'use strict';
const { loadPG, test, assert } = require('./harness');
const PG = loadPG();
const U = PG.util;

function partyGame(over) {
  return PG.game.newGame(Object.assign({ mode: 'party', partyName: 'Test Party', partyShort: 'TP', seed: 'pt', name: 'Chair', background: 'activist', traits: ['workhorse'], homeState: 'OH', age: 40, startYear: 2027, ideology: { econ: 0, social: 0 } }, over || {}));
}

test('party mode: founding a party sets up chapters, ballot rules and party affinity', () => {
  const s = partyGame();
  assert.equal(s.mode, 'party'); assert.equal(s.phase, 'party'); assert.equal(s.player.party, 'P');
  assert.ok(s.party.ballot.OH.required > 1000 && s.party.ballot.CA.required > s.party.ballot.VT.required, 'big/hard states need more signatures');
  assert.ok(PG.data.parties.P.custom);
  const weak = PG.voters.utility({ party: 'P', ideology: { econ: 0, social: 0 }, nameRec: 50, fav: 50 }, { lean: 0, econ: 0, social: 0, id: 'x' }, { mode: 'general', partisanW: 1 });
  s.party.brand.nameRec = 90; s.party.lastShare = 0.3; PG.party.sync(s);
  const strong = PG.voters.utility({ party: 'P', ideology: { econ: 0, social: 0 }, nameRec: 50, fav: 50 }, { lean: 0, econ: 0, social: 0, id: 'x' }, { mode: 'general', partisanW: 1 });
  assert.ok(strong > weak + 20, 'wasted-vote penalty shrinks as the party grows: ' + weak + ' → ' + strong);
});

test('party mode: actions, petitions, recruiting and a full election cycle', () => {
  const s = partyGame({ seed: 'pt-cycle' });
  const A = (kind, arg) => PG.game.act(s, { type: 'party.act', kind, arg });
  assert.ok(A('fundraise').ok);
  assert.ok(A('chapter', 'OH').ok);
  for (let i = 0; i < 2; i++) A('petition', 'OH');
  assert.ok(s.party.actionsLeft === 0 || s.party.actionsLeft === 1);
  const nope = A('fundraise');
  if (s.party.actionsLeft === 0) assert.ok(!nope.ok, 'actions are limited');
  // Advance to spring and recruit in local races (odd year → council).
  let guard = 0;
  while (s.date.month < 4 && guard++ < 10) { if (s.events.active) PG.game.act(s, { type: 'event.choose', i: 0 }); else PG.game.act(s, { type: 'endMonth' }); }
  const races = PG.party.races(s);
  assert.ok(races.length > 0, 'council races available without a ballot line');
  assert.ok(races.every((r) => r.estimate >= 0 && r.estimate < 0.7));
  const r = A('recruit', races[0].id);
  assert.ok(r.ok, r.msg);
  const c = s.party.candidates[0];
  assert.ok(A('fund', { id: c.id, amount: 5000 }).ok);
  let night = null;
  guard = 0;
  while (s.date.year === 2027 && guard++ < 20) {
    if (s.electionNight) { night = s.electionNight; PG.game.act(s, { type: 'election.dismiss' }); continue; }
    if (s.events.active) { PG.game.act(s, { type: 'event.choose', i: 0 }); continue; }
    PG.game.act(s, { type: 'endMonth' });
  }
  assert.ok(night && night.kind === 'party_results', 'results night');
  assert.ok(['won', 'lost'].includes(c.status));
  assert.equal(s.party.history.length, 1);
  if (c.status === 'won') assert.ok(PG.party.totalSeats(s) >= 1);
  assert.equal(s.log.filter((l) => l.type === 'error').length, 0);
  const t = PG.save.serialize(s); const back = PG.save.deserialize(t);
  assert.equal(back.party.name, 'Test Party');
});

test('party mode: a 12-year bot run grows the party without errors', () => {
  const s = partyGame({ seed: 'pt-long', homeState: 'ME' });
  const A = (kind, arg) => PG.game.act(s, { type: 'party.act', kind, arg });
  for (let m = 0; m < 144; m++) {
    let g = 0;
    while ((s.events.active || s.electionNight) && g++ < 10) { if (s.electionNight) PG.game.act(s, { type: 'election.dismiss' }); else PG.game.act(s, { type: 'event.choose', i: m % 2 }); }
    const P = s.party;
    A('fundraise');
    A(P.ballot.ME.status === 'qualified' ? 'chapter' : 'petition', 'ME');
    if (s.date.month >= 3 && s.date.month <= 9) for (const r of PG.party.races(s).slice(0, 3)) if (!P.candidates.some((c) => c.raceId === r.id && c.status === 'running')) A('recruit', r.id);
    for (const c of P.candidates.filter((x) => x.status === 'running')) if (P.funds > 30000) A('fund', { id: c.id, amount: Math.round(P.funds * 0.2) });
    PG.game.act(s, { type: 'endMonth' });
  }
  assert.equal(s.log.filter((l) => l.type === 'error').length, 0);
  assert.ok(s.party.history.length >= 10, 'contested most cycles');
  const first = s.party.history[0].share, last = s.party.history[s.party.history.length - 1].share;
  assert.ok(last > first, 'vote share grows with investment: ' + first + ' → ' + last);
  assert.ok(first < 0.35, 'new parties start weak: ' + first);
});

test('difficulty can be changed mid-game and only changes tuning', () => {
  const s = PG.game.newGame({ seed: 'diff', name: 'D', party: 'D', background: 'lawyer', traits: [], homeState: 'PA', startYear: 2027 });
  const r = PG.game.act(s, { type: 'settings.difficulty', level: 'hard' });
  assert.ok(r.ok); assert.equal(s.difficulty, 'hard');
  assert.ok(!PG.game.act(s, { type: 'settings.difficulty', level: 'nightmare' }).ok);
  assert.ok(s.log[0].text.includes('Difficulty changed'));
  assert.equal(PG.save.deserialize(PG.save.serialize(s)).difficulty, 'hard');
});

test('personality shapes the job: traits and background produce real modifiers', () => {
  const mk = (traits, bg) => PG.game.newGame({ seed: 'pers', name: 'P', party: 'D', background: bg || 'lawyer', traits, homeState: 'PA', startYear: 2027 });
  const deal = PG.character.jobMods(mk(['dealmaker']));
  const fire = PG.character.jobMods(mk(['firebrand']));
  const work = PG.character.jobMods(mk(['workhorse']));
  assert.ok(deal.dealCost < 0 && deal.colleagues > 0);
  assert.ok(fire.colleagues < 0 && fire.base > 0);
  assert.equal(work.actions, 1);
  assert.ok(PG.character.jobMods(mk([], 'teacher')).outcome.education > 0);
  // Workhorses really get an extra action per month in office.
  const s = mk(['workhorse']);
  s.player.history.push({ officeId: 'city_council', start: { year: 2023, month: 1 }, end: { year: 2027, month: 1 } });
  PG.gov.assumeOffice(s, 'city_council', PG.calendar.electionInfo(s, 'city_council', 2027), 0.55);
  PG.game.act(s, { type: 'endMonth' });
  if (!s.events.active) assert.equal(s.gov.actionsLeft, 4);
  // Charisma makes whipping more effective.
  const a = mk(['charismatic']), b = mk(['wonk']);
  assert.ok(PG.character.jobMods(a).persuade > PG.character.jobMods(b).persuade);
});

test('legislature: holdouts appear on close votes; amendments shift bills; favors are tracked', () => {
  const s = PG.game.newGame({ seed: 'hold', name: 'H', party: 'D', background: 'lawyer', traits: [], homeState: 'PA', startYear: 2029 });
  s.player.history.push({ officeId: 'city_council', start: { year: 2019, month: 1 }, end: { year: 2023, month: 1 } });
  PG.gov.assumeOffice(s, 'state_house', PG.calendar.electionInfo(s, 'state_house', 2028), 0.55);
  s.player.capital = 40;
  // Close votes on a bill you back generate holdouts with concrete demands.
  let holdoutBills = 0;
  const laws = PG.data.laws.filter((l) => l.levels.includes('state'));
  for (let k = 0; k < laws.length; k++) {
    const bill = PG.leg.newBill(s, { lawId: laws[k].id, scope: 2, sponsorId: 'player', sponsorName: 'Me', sponsorParty: 'D', origin: 'state_house', playerStance: 1 });
    bill.stage = 'floor';
    PG.leg.makeHoldouts(s, bill, 'state_house');
    if (bill.holdouts) { holdoutBills++; bill.holdouts.forEach((h) => assert.ok(['project', 'scope', 'favor'].includes(h.demand) && h.text)); }
  }
  assert.ok(holdoutBills > 0, 'some bills are close enough to draw holdouts');
  // Hostile chairs attach amendments some of the time.
  let pills = 0;
  const chair = s.world.chambers.state_house.members.find((m) => m.party === 'R');
  for (let k = 0; k < 40; k++) { const bill = PG.leg.newBill(s, { lawId: 'min_wage', scope: 2, sponsorId: 'player', sponsorName: 'Me', sponsorParty: 'D', origin: 'state_house', playerStance: 1 }); PG.leg.maybePill(s, bill, chair); if (bill.pill) pills++; }
  assert.ok(pills > 5 && pills < 35, 'pills attached ' + pills + '/40');
  // Direct API checks.
  const b = PG.leg.newBill(s, { lawId: 'min_wage', scope: 2, sponsorId: 'player', sponsorName: 'Me', sponsorParty: 'D', origin: 'state_house', playerStance: 1 });
  b.holdouts = [{ memberId: s.world.chambers.state_house.members[3].id, name: 'X', demand: 'favor', text: 'wants', resolved: null }];
  assert.ok(PG.game.act(s, { type: 'gov.holdout', billId: b.id, memberId: b.holdouts[0].memberId, accept: true }).ok);
  assert.equal(s.gov.ious.length, 1);
  assert.ok(b.deals[b.holdouts[0].memberId]);
  const before = PG.leg.L(b).social;
  b.pill = { kind: 'rider', name: 'rider', econ: 0, social: 22, by: 'Chair', stripped: false };
  assert.equal(PG.leg.L(b).social, before + 22);
  s.player.capital = 40;
  for (let i = 0; i < 6 && !b.pill.stripped; i++) PG.game.act(s, { type: 'gov.strip', billId: b.id });
  assert.ok(s.player.capital < 40);
});
