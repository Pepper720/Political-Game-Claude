#!/usr/bin/env node
/* Balance report: `node tests/balance.js [runs]`. Plays many races with a default-plan
 * player and summarizes win rates, vote shares, approval and legislative productivity.
 * Used to tune the simulation; not part of the pass/fail suite. */
'use strict';
const { loadPG } = require('./harness');
const PG = loadPG();
const U = PG.util;
const runs = Number(process.argv[2] || 30);

function setupFor(i, office) {
  const states = ['PA', 'OH', 'GA', 'AZ', 'MI', 'TX', 'CA', 'NY', 'FL', 'WI', 'NC', 'MN'];
  const party = i % 2 ? 'R' : 'D';
  const s = PG.game.newGame({ seed: 'bal-' + office + '-' + i, name: 'B', party, background: PG.data.backgrounds[i % PG.data.backgrounds.length].id, traits: [], homeState: states[i % states.length], cityType: ['urban', 'suburban', 'smalltown'][i % 3], age: 45, startYear: 2027, difficulty: process.env.DIFF || 'normal' });
  if (office !== 'city_council' && office !== 'school_board') s.player.history.push({ officeId: 'city_council', start: { year: 2019, month: 1 }, end: { year: 2023, month: 1 } });
  return s;
}

function step(s) {
  if (s.electionNight) return PG.game.act(s, { type: 'election.dismiss' });
  if (s.events.active) return PG.game.act(s, { type: 'event.choose', i: PG.rng.int(s, 0, PG.events.view(s).choices.length - 1) });
  if (s.gov && s.gov.budgetStage === 'drafting') PG.game.act(s, { type: 'gov.budgetSubmit', proposal: PG.executive.currentProposal(s.gov.budget) });
  if (s.gov && s.gov.budgetStage === 'counter') PG.game.act(s, { type: 'gov.budgetCounter', choice: 'accept' });
  if (s.gov) for (const id of (s.gov.desk || []).slice()) PG.game.act(s, { type: 'gov.sign', billId: id });
  if (!s.campaign && s.player.declared) return PG.game.act(s, { type: 'career.fastForward' });
  return PG.game.act(s, { type: 'endMonth' });
}

function race(office) {
  const out = { office, n: 0, wins: 0, shares: [], approvals: [], reelect: 0, reelectTries: 0, laws: 0, prim: 0, primWins: 0 };
  for (let i = 0; i < runs; i++) {
    const s = setupFor(i, office);
    const r = PG.game.act(s, { type: 'career.declare', officeId: office });
    if (!r.ok) continue;
    let g = 0;
    while ((s.campaign || s.player.declared || s.electionNight || s.events.active) && g++ < 120) {
      const n = s.electionNight;
      if (n && /primary/i.test(n.title)) { out.prim++; if (n.playerAdvanced) out.primWins++; }
      step(s);
    }
    out.n++;
    const last = s.player.legacy.elections[s.player.legacy.elections.length - 1];
    if (last && last.share) out.shares.push(last.share);
    if (!last || !last.won) continue;
    out.wins++;
    // Govern for most of a term, then try for reelection.
    g = 0;
    while (s.player.pendingOffice && g++ < 10) step(s);
    let months = 0;
    while (s.gov && !s.gov.decision && months++ < 70) step(s);
    if (!s.gov) continue;
    out.approvals.push(s.gov.approval.overall);
    out.laws += s.player.legacy.laws.length;
    out.reelectTries++;
    const r2 = PG.game.act(s, { type: 'gov.decide', choice: 'reelect' });
    if (!r2.ok) continue;
    g = 0;
    while ((s.campaign || s.player.declared || s.electionNight || s.events.active) && g++ < 120) step(s);
    const l2 = s.player.legacy.elections[s.player.legacy.elections.length - 1];
    if (l2 && l2.won) out.reelect++;
  }
  return out;
}

const avg = (a) => a.length ? U.sum(a) / a.length : NaN;
for (const office of (process.argv[3] ? process.argv[3].split(',') : ['city_council', 'school_board', 'mayor', 'state_house', 'us_house', 'governor'])) {
  const t0 = Date.now();
  const o = race(office);
  console.log(office.padEnd(14), 'runs', o.n, '| first-race win', (o.wins / o.n * 100).toFixed(0) + '%', '| primary wins', o.prim ? o.primWins + '/' + o.prim : '-', '| avg share', (avg(o.shares) * 100).toFixed(1) + '%',
    '| approval at decision', avg(o.approvals).toFixed(1), '| reelected', o.reelect + '/' + o.reelectTries, '| laws/term', (o.laws / Math.max(1, o.wins)).toFixed(1), '|', ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
