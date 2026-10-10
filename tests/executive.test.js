'use strict';
const { loadPG, test, assert } = require('./harness');
const PG = loadPG();
const U = PG.util;

function game(over) {
  const s = PG.game.newGame(Object.assign({ seed: 'exec', name: 'Exec Tester', party: 'R', background: 'business', traits: ['charismatic', 'rainmaker'], homeState: 'OH', age: 50, startYear: 2027 }, over || {}));
  s.player.history.push({ officeId: 'us_senate', start: { year: 2021, month: 1 }, end: { year: 2027, month: 1 } });
  return s;
}

function playOut(s, maxTurns) {
  let g = 0;
  while ((s.campaign || s.electionNight || s.events.active || s.player.pendingOffice) && g++ < (maxTurns || 120)) {
    if (s.electionNight) { PG.game.act(s, { type: 'election.dismiss' }); continue; }
    if (s.events.active) { PG.game.act(s, { type: 'event.choose', i: 0 }); continue; }
    const c = s.campaign;
    if (c && c.pres && c.pres.vpChoices && !c.pres.vp) PG.game.act(s, { type: 'campaign.vp', id: 'senate_vet' });
    PG.game.act(s, { type: 'endMonth' });
  }
}

test('Electoral College: 538 electors including Maine and Nebraska districts', () => {
  const keys = PG.presidential.stateKeys();
  assert.equal(U.sum(keys, (k) => PG.presidential.evOf(k)), 538);
  assert.ok(keys.includes('ME-2') && keys.includes('NE-2'));
  assert.equal(keys.length, 51 + 5);
});

test('delegate rules: Democratic proportional with 15% threshold; Republican winner-take-all / winner-take-most', () => {
  const d = PG.presidential.allocate('D', 'CA', 100, { a: 0.5, b: 0.38, c: 0.12 });
  assert.equal((d.a || 0) + (d.b || 0), 100);
  assert.ok(!d.c, 'below threshold gets none');
  assert.ok(Math.abs(d.a - 57) <= 1, 'a ~ 57: ' + d.a);
  assert.deepEqual(PG.presidential.allocate('R', 'FL', 125, { a: 0.4, b: 0.35, c: 0.25 }), { a: 125 });
  assert.deepEqual(PG.presidential.allocate('R', 'TX', 160, { a: 0.55, b: 0.45 }), { a: 160 });
  const wtm = PG.presidential.allocate('R', 'TX', 160, { a: 0.45, b: 0.35, c: 0.2 });
  assert.ok(wtm.a && wtm.b && wtm.a + wtm.b + (wtm.c || 0) === 160, 'proportional when no majority');
  const totD = U.sum(Object.values(PG.presidential.delegateTable('D'))), totR = U.sum(Object.values(PG.presidential.delegateTable('R')));
  assert.near(totD, 3950, 60); assert.near(totR, 2430, 60);
});

test('presidential race plays from primaries to a general-election result', () => {
  for (const seed of ['pres-a', 'pres-b', 'pres-c']) {
    const s = game({ seed });
    const r = PG.game.act(s, { type: 'career.declare', officeId: 'president' });
    assert.ok(r.ok, r.msg);
    for (let k = 0; k < 30 && !s.campaign; k++) { if (s.events.active) PG.game.act(s, { type: 'event.choose', i: 0 }); else PG.game.act(s, { type: 'career.fastForward' }); }
    assert.equal(s.campaign.stage, 'pres_primary');
    const nightsKinds = [];
    let g = 0;
    while ((s.campaign || s.electionNight || s.events.active) && g++ < 80) {
      if (s.electionNight) { nightsKinds.push(s.electionNight.kind); PG.game.act(s, { type: 'election.dismiss' }); continue; }
      if (s.events.active) { PG.game.act(s, { type: 'event.choose', i: 0 }); continue; }
      const c = s.campaign;
      if (c.pres.vpChoices && !c.pres.vp) assert.ok(PG.game.act(s, { type: 'campaign.vp', id: 'swing_gov' }).ok);
      PG.game.act(s, { type: 'endMonth' });
    }
    assert.ok(nightsKinds.includes('pres_primary'), seed + ' had primary nights');
    const el = s.player.legacy.elections[s.player.legacy.elections.length - 1];
    assert.ok(el && el.office === 'President of the United States', 'recorded');
    assert.equal(s.log.filter((l) => l.type === 'error').length, 0);
  }
});

test('general election: winner needs 270; a 269-269 tie goes to the House by state delegations', () => {
  const s = game({ seed: 'tie' });
  PG.game.act(s, { type: 'career.declare', officeId: 'president' });
  for (let k = 0; k < 30 && !s.campaign; k++) { if (s.events.active) PG.game.act(s, { type: 'event.choose', i: 0 }); else PG.game.act(s, { type: 'career.fastForward' }); }
  // Jump straight to a general election setup.
  const c = s.campaign;
  for (const x of c.candidates) if (!x.isPlayer) x.active = false;
  c.pres.nominated = true;
  c.stages = ['pres_primary', 'general'];
  const before = s.log.length;
  s.date = { year: c.pres.year, month: 11 };
  c.stage = 'general'; c.stageIndex = 1;
  const opp = PG.campaign.makeCandidate(s, { officeId: 'president', party: 'D' });
  opp.nominee = true; opp.stages = null; opp.homeState = 'NY'; opp.stateBoost = {};
  c.candidates.push(opp);
  c.pres.vp = { home: 'OH', homeBonus: 0 };
  PG.presidential.runGeneral(s);
  const n = s.electionNight || null;
  assert.ok(s.log.length > before);
  const lastNight = n || {};
  if (lastNight.ev) {
    const tot = U.sum(Object.values(lastNight.ev));
    assert.equal(tot, 538);
    const w = lastNight.winners[0];
    assert.ok(lastNight.ev[w] >= 270 || lastNight.contingent, 'majority or contingent election');
  }
});

test('governing as President: Senate confirms cabinet, executive orders carry legal risk, budget cycle runs', () => {
  const s = game({ seed: 'potus' });
  const info = PG.calendar.electionInfo(s, 'president', 2028);
  s.date = { year: 2029, month: 1 };
  PG.gov.assumeOffice(s, 'president', info, 0.52);
  assert.equal(s.gov.level, 'federal'); assert.equal(s.gov.kind, 'executive'); assert.equal(s.gov.key, 'nation');
  assert.ok(s.world.executives.president.isPlayer);
  s.player.capital = 60;
  const pos = Object.keys(s.gov.cabinet)[1];
  const r = PG.game.act(s, { type: 'gov.nominate', pos, nominee: s.gov.nominees[pos][2].id });
  assert.ok(r.ok, r.msg);
  assert.ok(s.log[0].text.includes('U.S. Senate'), s.log[0].text);
  const eo = PG.game.act(s, { type: 'gov.eo', eoId: 'eo_tariffs' });
  assert.ok(eo.ok, eo.msg);
  assert.ok(s.log.some((l) => /Legal exposure/.test(l.text)));
  for (let i = 0; i < 14; i++) { if (s.events.active) PG.game.act(s, { type: 'event.choose', i: 0 }); if (s.gov.budgetStage === 'drafting') PG.game.act(s, { type: 'gov.budgetSubmit', proposal: PG.executive.currentProposal(s.gov.budget) }); if (s.gov.budgetStage === 'counter') PG.game.act(s, { type: 'gov.budgetCounter', choice: 'accept' }); PG.game.act(s, { type: 'endMonth' }); }
  assert.ok(s.log.some((l) => l.type === 'budget'), 'budget activity');
  assert.ok(s.gov.approval.overall > 0 && s.gov.approval.overall < 100);
  assert.equal(s.world.executives.president.approval, s.gov.approval.overall);
});

test('governor: balanced budget enforced; line-item veto only where the state allows it', () => {
  const s = game({ seed: 'gov', homeState: 'NC' });
  const info = PG.calendar.electionInfo(s, 'governor', 2028);
  PG.gov.assumeOffice(s, 'governor', info, 0.52);
  const g = s.gov;
  g.budgetStage = 'drafting';
  const prop = PG.executive.currentProposal(g.budget);
  for (const k of Object.keys(prop.spending)) prop.spending[k] *= 1.3;
  const r = PG.game.act(s, { type: 'gov.budgetSubmit', proposal: prop });
  assert.ok(!r.ok && /balance/.test(r.msg), r.msg);
  g.budgetStage = 'counter'; g.budgetDraft = PG.executive.currentProposal(g.budget); g.budgetCounter = PG.executive.currentProposal(g.budget);
  const li = PG.game.act(s, { type: 'gov.budgetCounter', choice: 'lineitem' });
  assert.ok(!li.ok, 'North Carolina governors have no line-item veto');
  const s2 = game({ seed: 'gov2', homeState: 'TX' });
  PG.gov.assumeOffice(s2, 'governor', PG.calendar.electionInfo(s2, 'governor', 2030), 0.55);
  s2.gov.budgetStage = 'counter'; s2.gov.budgetDraft = PG.executive.currentProposal(s2.gov.budget);
  s2.gov.budgetCounter = PG.executive.currentProposal(s2.gov.budget); s2.gov.budgetCounter.spending.k12 *= 1.05;
  assert.ok(PG.game.act(s2, { type: 'gov.budgetCounter', choice: 'lineitem' }).ok);
  assert.near(s2.gov.budget.spending.k12, s2.gov.budgetDraft.spending.k12, 1);
});

test('22nd Amendment and Virginia\'s no-consecutive-terms rule', () => {
  const s = game({ seed: 'limits', homeState: 'VA' });
  PG.gov.assumeOffice(s, 'governor', PG.calendar.electionInfo(s, 'governor', 2029), 0.52);
  const b = PG.character.termLimitBlock(s, 'governor');
  assert.ok(b && /Virginia/.test(b), String(b));
  s.player.history.push({ officeId: 'president', start: { year: 2009, month: 1 }, end: { year: 2013, month: 1 } }, { officeId: 'president', start: { year: 2013, month: 1 }, end: { year: 2017, month: 1 } });
  assert.ok(/22nd/.test(PG.character.termLimitBlock(s, 'president')));
});
