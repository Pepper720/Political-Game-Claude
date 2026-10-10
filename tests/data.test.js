'use strict';
const { loadPG, test, assert } = require('./harness');
const PG = loadPG();

// Walk every effect object in the data so typos surface as test failures.
function effectsOf(c) { return [c.effects, c.chance && c.chance.success, c.chance && c.chance.fail].filter(Boolean); }

test('data integrity: events reference real groups, blocs, events and outcomes', () => {
  const outcomes = new Set(Object.keys(PG.approval.OUTCOME_NAMES));
  const issues = [];
  for (const e of PG.data.events) {
    assert.ok(e.choices.length >= 2, e.id + ' needs at least two choices');
    for (const c of e.choices) for (const ef of effectsOf(c)) {
      for (const g of Object.keys(ef.groups || {})) if (!PG.data.groupById[g]) issues.push(e.id + ': group ' + g);
      for (const x of [].concat(ef.echo || [])) if (!PG.data.eventById[x.event]) issues.push(e.id + ': echo ' + x.event);
      const ap = ef.approval && ef.approval.blocs;
      for (const b of Object.keys(ap || {})) if (!PG.data.blocById[b]) issues.push(e.id + ': bloc ' + b);
      for (const k of Object.keys(ef.outcomes || {})) if (!outcomes.has(k)) issues.push(e.id + ': outcome ' + k);
    }
  }
  assert.equal(issues.length, 0, issues.join('; '));
  assert.ok(PG.data.events.length >= 80, 'large event pool: ' + PG.data.events.length);
});

test('data integrity: laws, groups and executive orders are consistent', () => {
  const tags = new Set();
  for (const g of PG.data.groups) for (const t of Object.keys(g.tags)) tags.add(t);
  for (const l of PG.data.laws) {
    assert.ok(l.levels.length && l.cat && l.issue && PG.data.issueById[l.issue], l.id + ' fields');
    for (const k of Object.keys(l.outcomes || {})) assert.ok(PG.approval.OUTCOME_NAMES[k], l.id + ' outcome ' + k);
    for (const b of Object.keys(l.blocs || {})) assert.ok(PG.data.blocById[b], l.id + ' bloc ' + b);
  }
  // Every level has laws to work with.
  for (const lvl of ['school', 'city', 'state', 'federal']) assert.ok(PG.data.laws.filter((l) => l.levels.includes(lvl)).length >= 8, lvl);
  for (const e of PG.data.executiveOrders) assert.ok(e.vuln >= 0 && e.vuln <= 1 && e.grounds, e.id);
});

test('even-handedness: interest groups and media are balanced across the spectrum', () => {
  const left = PG.data.groups.filter((g) => g.ideo.econ + g.ideo.social < -20).length;
  const right = PG.data.groups.filter((g) => g.ideo.econ + g.ideo.social > 20).length;
  assert.ok(Math.abs(left - right) <= 3, 'groups left ' + left + ' vs right ' + right);
  const lean = PG.data.outlets.reduce((s, o) => s + o.lean, 0) / PG.data.outlets.length;
  assert.ok(Math.abs(lean) < 10, 'media lean average ' + lean);
  // Party ideological norms are mirror-ish.
  const D = PG.voters.partyNorm('D'), R = PG.voters.partyNorm('R');
  assert.ok(Math.abs((D.econ + R.econ)) <= 10 && Math.abs(D.social + R.social) <= 10);
});
