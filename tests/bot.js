/* A simple autopilot that plays the game through the public action API. Used by the
 * autoplay tests and the smoke script to exercise every phase headlessly. */
'use strict';

function makeBot(PG, opts) {
  opts = opts || {};
  let step = 0;
  const ambition = opts.ambition === undefined ? 0.7 : opts.ambition;
  const stats = { actions: 0, failures: [], elections: 0, wins: 0, offices: new Set(), months: 0, events: 0, laws: 0 };

  function act(state, a) {
    const r = PG.game.act(state, a);
    stats.actions++;
    if (r && r.error) throw r.error;
    return r;
  }

  function pickOffice(state) {
    const offices = PG.data.offices.map((o) => ({ o, el: PG.character.eligibility(state, o.id) })).filter((x) => x.el.ok);
    if (!offices.length) return null;
    const cur = state.player.office ? PG.data.officeById[state.player.office.officeId].rank : 0;
    const up = offices.filter((x) => x.o.rank > cur && x.o.rank <= cur + 2);
    const roll = PG.rng.hashNoise(state.seed + step) * 0.5 + 0.5;
    if (up.length && roll < ambition) return up.sort((a, b) => a.o.rank - b.o.rank)[Math.floor(roll * up.length) % up.length].o.id;
    return offices[Math.floor(roll * offices.length) % offices.length].o.id;
  }

  function campaignTurn(state) {
    const c = state.campaign;
    const pc = PG.campaign.playerCand(state);
    if (c.officeId === 'president' && PG.presidential) {
      const pres = c.pres;
      if (pres && pres.vpChoices && !pres.vp) act(state, { type: 'campaign.vp', id: pres.vpChoices[0].id });
    }
    const plan = PG.campaign.defaultPlan(state);
    plan.adsPct = 30; plan.fieldPct = 10; plan.oppoPct = c.months % 3 === 0 ? 5 : 0;
    plan.adTone = ['positive', 'contrast', 'negative'][step % 3];
    plan.debateStyle = ['policy', 'attack', 'folksy', 'cautious'][step % 4];
    plan.days.policy = 2; plan.days.retail = Math.max(0, plan.days.retail - 1);
    let tot = Object.values(plan.days).reduce((a, b) => a + b, 0);
    while (tot > PG.campaign.daysAvailable(state)) { plan.days.rest = Math.max(0, plan.days.rest - 1); plan.days.retail = Math.max(0, plan.days.retail - 1); tot = Object.values(plan.days).reduce((a, b) => a + b, 0); }
    act(state, { type: 'campaign.setPlan', plan });
    if (step % 2 === 0) act(state, { type: 'campaign.rollout', issue: PG.data.issues[step % PG.data.issues.length].id, stance: state.player.party === 'R' ? 3 : 1 });
    if (step % 5 === 0) act(state, { type: 'campaign.poll' });
    if (step % 3 === 0) act(state, { type: 'campaign.endorse', group: PG.data.groups[step % PG.data.groups.length].id });
    for (const o of c.oppoFile) if (!o.released) act(state, { type: 'campaign.releaseOppo', id: o.id });
  }

  function govTurn(state) {
    const g = state.gov;
    if (g.decision === 'pending') {
      const roll = PG.rng.hashNoise(state.seed + 'd' + step);
      const other = pickOffice(state);
      if (other && other !== state.player.office.officeId && roll > 0.1) act(state, { type: 'career.declare', officeId: other });
      else if (roll < -0.9) act(state, { type: 'gov.decide', choice: 'retire' });
      else act(state, { type: 'gov.decide', choice: 'reelect' });
    }
    for (const id of (g.desk || []).slice()) act(state, { type: step % 4 === 0 ? 'gov.veto' : 'gov.sign', billId: id });
    if (g.budgetStage === 'drafting') {
      const prop = PG.executive.currentProposal(g.budget);
      act(state, { type: 'gov.budgetSubmit', proposal: prop });
    }
    if (g.budgetStage === 'counter' || g.budgetStage === 'impasse') act(state, { type: 'gov.budgetCounter', choice: step % 3 === 0 && g.level === 'state' ? 'lineitem' : 'accept' });
    for (const d of g.docket) { const b = g.bills.find((x) => x.id === d.billId); if (b && b.playerVote === null) act(state, { type: 'gov.vote', billId: b.id, v: step % 2 ? 'Y' : 'N' }); }
    if (step % 3 === 0) {
      const laws = PG.data.laws.filter((l) => l.levels.includes(g.level));
      const l = laws[step % laws.length];
      const r = act(state, { type: 'gov.introduce', lawId: l.id, scope: 1 + (step % 3) });
      if (r.ok) {
        const bill = g.bills[g.bills.length - 1];
        act(state, { type: 'gov.cosponsors', billId: bill.id });
        const chId = bill.chambers[bill.ci];
        const w = PG.leg.whipCount(state, chId, bill);
        const tgt = w.rows.find((x) => x.lean === '?' || x.lean === 'n');
        if (tgt) act(state, { type: 'gov.whip', billId: bill.id, memberId: tgt.id });
      }
    }
    if (step % 4 === 1) act(state, { type: 'gov.action', kind: ['townhall', 'fundraiser', 'district', 'media'][step % 4] });
    if (g.kind === 'executive') {
      for (const [pos, holder] of Object.entries(g.cabinet)) if (!holder && g.nominees[pos] && g.nominees[pos].length) act(state, { type: 'gov.nominate', pos, nominee: g.nominees[pos][step % g.nominees[pos].length].id });
      if (step % 7 === 0) {
        const eos = PG.data.executiveOrders.filter((e) => e.levels.includes(g.level));
        if (eos.length) act(state, { type: 'gov.eo', eoId: eos[step % eos.length].id });
      }
      if (PG.courts && state.courts && state.courts.vacancies) for (const v of state.courts.vacancies.slice()) if (v.nominees && v.nominees.length) act(state, { type: 'gov.judge', seat: v.id, nominee: v.nominees[0].id });
    }
  }

  function turn(state) {
    step++;
    if (state.phase === 'gameover') return false;
    if (state.electionNight) { stats.elections++; if (state.electionNight.playerAdvanced) stats.wins++; act(state, { type: 'election.dismiss' }); return true; }
    if (state.events.active) {
      const v = PG.events.view(state);
      const ok = v.choices.filter((c) => c.ok);
      act(state, { type: 'event.choose', i: ok[step % ok.length].i }); stats.events++; return true;
    }
    if (state.player.office) stats.offices.add(state.player.office.officeId);
    if (state.phase === 'career') {
      if (!state.player.declared) {
        const o = pickOffice(state);
        if (o) { act(state, { type: 'career.declare', officeId: o }); return true; }
      }
      const r = act(state, { type: 'career.fastForward', months: 24 });
      if (!state.player.declared && !state.campaign && r.ok && /Skipped 0/.test(r.msg)) act(state, { type: 'endMonth' });
      return true;
    }
    if (state.campaign) campaignTurn(state);
    else if (state.gov) govTurn(state);
    const r = act(state, { type: 'endMonth' });
    if (!r.ok && !/event|election/i.test(r.msg)) stats.failures.push(r.msg);
    stats.months++;
    return true;
  }

  return { turn, stats };
}

module.exports = { makeBot };
