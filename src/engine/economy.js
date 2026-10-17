/* National business cycle + local offsets, and jurisdiction budgets.
 * Simple but responsive: policy shocks decay over time, revenue follows the economy,
 * and spending against "need" drives service outcomes. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;
  const NATURAL_U = 4.3;

  function monthly(state) {
    const n = state.world.national.economy;
    const imp = state.world.national.impulse = state.world.national.impulse || { growth: 0, inflation: 0, unemployment: 0 };
    const loc = state.world.local;
    // Recessions arrive at random, more likely when rates or inflation run hot.
    if (!n.recession && R.chance(state, 0.006 + Math.max(0, n.fedRate - 4.5) * 0.004 + Math.max(0, n.inflation - 4) * 0.003)) {
      n.recession = true; n.recessionMonths = R.int(state, 6, 14);
      PG.game.news(state, 'Economists warn the economy has tipped into recession', -2);
      PG.game.log(state, 'economy', 'A recession has begun.', ['Fed funds rate ' + n.fedRate.toFixed(2) + '%, inflation ' + n.inflation.toFixed(1) + '% — plus bad luck.']);
    }
    if (n.recession && --n.recessionMonths <= 0) { n.recession = false; PG.game.news(state, 'Recovery: economy returns to growth', 1); }
    const target = (n.recession ? -1.4 : n.trend) + imp.growth;
    n.growth = U.round(n.growth + 0.18 * (target - n.growth) + R.normal(state, 0, 0.22), 2);
    n.unemployment = U.round(U.clamp(n.unemployment - (n.growth - 1.8) * 0.035 + 0.02 * (NATURAL_U - n.unemployment) + imp.unemployment * 0.05, 2.8, 14), 2);
    const expected = 2.3;
    n.inflation = U.round(U.clamp(n.inflation + 0.07 * (expected - n.inflation) + 0.025 * (NATURAL_U - n.unemployment) + imp.inflation * 0.08 + R.normal(state, 0, 0.07), -1, 12), 2);
    const taylor = 0.75 + n.inflation + 0.5 * (n.inflation - 2) + 0.5 * (NATURAL_U - n.unemployment);
    n.fedRate = U.round(U.clamp(n.fedRate + 0.12 * (taylor - n.fedRate), 0, 10), 2);
    n.sentiment = U.round(U.clamp(100 - 4 * (n.unemployment - 4) - 6 * Math.max(0, n.inflation - 2.2) + 3 * n.growth - 12, 20, 110), 1);
    n.gdp = n.gdp * (1 + (n.growth + n.inflation) / 1200);
    // Policy impulses fade (half-life ~ 1.5 years).
    for (const k of Object.keys(imp)) imp[k] *= 0.962;
    for (const k of ['growthImpulse', 'unempImpulse']) loc[k] = (loc[k] || 0) * 0.962;
    loc.growth = U.round(n.growth + loc.growthOffset + (loc.growthImpulse || 0), 2);
    loc.unemployment = U.round(U.clamp(n.unemployment + loc.unemploymentOffset + (loc.unempImpulse || 0), 2, 16), 2);
  }

  // Apply a macro shock (from a law, EO or event). National if `national`, else local.
  function shock(state, eff, national) {
    if (national) {
      const imp = state.world.national.impulse = state.world.national.impulse || { growth: 0, inflation: 0, unemployment: 0 };
      if (eff.growth) imp.growth += eff.growth;
      if (eff.inflation) imp.inflation += eff.inflation;
      if (eff.unemployment) imp.unemployment += eff.unemployment;
    } else {
      const loc = state.world.local;
      if (eff.growth) loc.growthImpulse = (loc.growthImpulse || 0) + eff.growth * 1.5;
      if (eff.unemployment) loc.unempImpulse = (loc.unempImpulse || 0) + eff.unemployment * 1.5;
    }
  }

  // Economic mood score for approval: positive is good. Uses local figures below federal level.
  function score(state, level) {
    const n = state.world.national.economy, loc = state.world.local;
    const g = level === 'federal' ? n.growth : (loc.growth !== undefined ? loc.growth : n.growth);
    const u = level === 'federal' ? n.unemployment : (loc.unemployment !== undefined ? loc.unemployment : n.unemployment);
    const gas = state.world.national.gas ? state.world.national.gas.price : 3.3;
    return (g - 2) * 1.1 - (u - 4.5) * 1.2 - Math.max(0, n.inflation - 2.5) * 1.3 - Math.max(0, gas - 3.6) * 1.4;
  }

  // ---------------------------------------------------------------- budgets
  function structureFor(level) { return level; }

  const LAW_CAT_MAP = {
    school: { education: 'instruction', budget: 'admin', tax: 'admin', justice: 'support', health: 'support', transport: 'transport', labor: 'instruction', housing: 'facilities', environment: 'facilities' },
    city: { justice: 'police', immigration: 'police', housing: 'housing', transport: 'streets', environment: 'sanitation', education: 'parks', health: 'housing', budget: 'admin', tax: 'admin', labor: 'admin', commerce: 'admin', civil: 'admin', elections: 'admin' },
    state: { education: 'k12', health: 'medicaid', justice: 'corrections', guns: 'corrections', transport: 'transport', housing: 'welfare', welfare: 'welfare', budget: 'admin', tax: 'admin', labor: 'admin', energy: 'admin', environment: 'admin', elections: 'admin', commerce: 'admin', tech: 'admin', civil: 'admin', immigration: 'corrections' },
    federal: { health: 'medicaid', retirement: 'socsec', defense: 'defense', border: 'nondefense', transport: 'nondefense', education: 'nondefense', energy: 'nondefense', environment: 'nondefense', agriculture: 'other', housing: 'income_sec', welfare: 'income_sec', tax: 'other', justice: 'nondefense', immigration: 'nondefense', trade: 'other', tech: 'nondefense', elections: 'nondefense', labor: 'income_sec', budget: 'nondefense', guns: 'nondefense', civil: 'nondefense', finance: 'other', commerce: 'other' },
  };

  function createBudget(state, level) {
    const def = PG.data.budgets[structureFor(level)];
    const pop = PG.juris.population(state, level);
    const total = def.perCapita * pop;
    const b = { level, total, spending: {}, need: {}, revenueBase: {}, rates: {}, reserves: 0, debt: total * def.debtRatio,
      rating: 'AA', fyStart: PG.calendar.fyStart(level, PG.juris.homeState(state)), history: [], lastClose: null, adopted: null };
    for (const c of def.spending) {
      b.spending[c.id] = c.share * total;
      b.need[c.id] = c.share * total * (1 + R.normal(state, 0.02, 0.04));
    }
    const revRatio = level === 'federal' ? 0.77 : 1.005;
    for (const r of def.revenue) { b.revenueBase[r.id] = r.share * total * revRatio; b.rates[r.id] = 1; }
    if (level !== 'federal') b.reserves = total * (level === 'state' ? 0.08 : 0.1);
    return b;
  }

  function spendingTotal(b) { return U.sum(Object.values(b.spending)); }

  function revenueOf(state, b, rates) {
    const def = PG.data.budgets[b.level];
    const loc = state.world.local, n = state.world.national.economy;
    const g = b.level === 'federal' ? n.growth : loc.growth;
    let tot = 0;
    const by = {};
    for (const r of def.revenue) {
      const rate = (rates || b.rates)[r.id];
      const econ = 1 + r.econSens * ((g === undefined ? 2 : g) - 2) * 0.02;
      const behavior = 1 - (rate - 1) * 0.2 * r.econSens / 1.2;
      by[r.id] = b.revenueBase[r.id] * rate * econ * behavior;
      tot += by[r.id];
    }
    return { total: tot, by };
  }

  function summary(state, b) {
    const rev = revenueOf(state, b);
    const sp = spendingTotal(b);
    return { revenue: rev.total, revenueBy: rev.by, spending: sp, deficit: sp - rev.total, reserves: b.reserves, debt: b.debt, rating: b.rating };
  }

  // Service quality per outcome key: spending ÷ need across categories feeding it.
  function serviceQuality(b) {
    const def = PG.data.budgets[b.level];
    const s = {}, n = {};
    for (const c of def.spending) {
      if (c.service === 'obligations') continue;
      s[c.service] = (s[c.service] || 0) + b.spending[c.id];
      n[c.service] = (n[c.service] || 0) + b.need[c.id];
    }
    const q = {};
    for (const k of Object.keys(s)) q[k] = s[k] / n[k];
    return q;
  }

  function oneTime(state, pct) {
    const b = state.gov.budget;
    const amt = b.total * pct;
    b.reserves += amt;
    if (b.reserves < 0 && b.level !== 'federal') { b.debt -= b.reserves; b.reserves = 0; }
    if (b.level === 'federal') { b.debt -= amt; b.reserves = 0; }
    return amt;
  }

  function adjustSpending(state, cat, pct) {
    const b = state.gov.budget;
    if (b.spending[cat] !== undefined) b.spending[cat] *= 1 + pct;
  }

  function lawCategory(level, law) {
    const m = LAW_CAT_MAP[level] || {};
    const def = PG.data.budgets[level];
    return m[law.cat] || (def.spending.find((c) => !c.fixed && !c.mandatory) || def.spending[0]).id;
  }

  // Apply an enacted law's fiscal effects to the active budget.
  function applyLaw(state, law, scope) {
    if (!state.gov || !state.gov.budget) return [];
    const b = state.gov.budget;
    const mult = PG.data.scopes[(scope || 2) - 1].mult;
    const lines = [];
    if (law.cost) {
      const cat = lawCategory(b.level, law);
      const amt = law.cost * mult * b.total;
      if (law.reserveDeposit) { b.reserves += amt; lines.push('Deposits ' + U.fmtMoney(amt) + ' into reserves'); }
      else {
        b.spending[cat] = Math.max(0, b.spending[cat] + amt);
        if (amt < 0) b.need[cat] = Math.max(b.need[cat] * 0.5, b.need[cat] + amt * 0.6); // savings partly reflect reduced obligations
        else b.need[cat] += amt * 0.85; // new program: most of the money funds new commitments, not existing needs
        lines.push((amt >= 0 ? 'Adds ' : 'Saves ') + U.fmtMoney(Math.abs(amt)) + '/yr (' + PG.data.budgets[b.level].spending.find((c) => c.id === cat).name + ')');
      }
    }
    if (law.revenue) {
      const amt = law.revenue * mult * b.total;
      const def = PG.data.budgets[b.level];
      const levers = def.revenue.filter((r) => r.lever);
      const tot = U.sum(levers, (r) => b.revenueBase[r.id]);
      levers.forEach((r) => { b.revenueBase[r.id] += amt * b.revenueBase[r.id] / tot; });
      lines.push('Revenue ' + (amt >= 0 ? '+' : '−') + U.fmtMoney(Math.abs(amt)) + '/yr');
    }
    return lines;
  }

  /* Close the fiscal year: surplus/deficit flows to reserves or debt; obligations and
   * revenue bases grow with the economy; credit rating responds. Returns causes. */
  function closeYear(state) {
    const b = state.gov.budget;
    const s = summary(state, b);
    const n = state.world.national.economy;
    const causes = [];
    const def = PG.data.budgets[b.level];
    if (b.level === 'federal') {
      b.debt += s.deficit;
      const avgRate = Math.max(1.5, n.fedRate * 0.6 + 1.6) / 100;
      b.spending.interest = b.debt * avgRate;
      b.need.interest = b.spending.interest;
      causes.push((s.deficit > 0 ? 'Deficit of ' : 'Surplus of ') + U.fmtMoney(Math.abs(s.deficit)) + '; debt now ' + U.fmtMoney(b.debt));
    } else {
      b.reserves -= s.deficit;
      if (b.reserves < 0) {
        b.debt += -b.reserves; causes.push('Reserves exhausted: borrowed ' + U.fmtMoney(-b.reserves) + ' to cover the gap');
        b.reserves = 0;
      } else causes.push((s.deficit > 0 ? 'Drew ' : 'Added ') + U.fmtMoney(Math.abs(s.deficit)) + (s.deficit > 0 ? ' from' : ' to') + ' reserves');
    }
    const ratings = ['BBB', 'A', 'AA', 'AAA'];
    let ri = ratings.indexOf(b.rating); if (ri < 0) ri = 2;
    const stress = b.level === 'federal' ? (b.debt / n.gdp > 1.2 ? 1 : 0) : (b.reserves < b.total * 0.03 ? 1 : 0) + (s.deficit > b.total * 0.04 ? 1 : 0);
    if (stress >= 2 && ri > 0) { ri--; causes.push('Credit rating downgraded'); }
    else if (stress === 0 && b.reserves > b.total * 0.1 && ri < 3 && R.chance(state, 0.4)) { ri++; causes.push('Credit rating upgraded'); }
    b.rating = ratings[ri];
    // Growth of obligations and tax base.
    const nominal = (n.growth + n.inflation) / 100;
    for (const c of def.spending) { if (c.id !== 'interest') { b.need[c.id] *= 1 + n.inflation / 100 + 0.006; if (c.mandatory) b.spending[c.id] = Math.max(b.spending[c.id], b.need[c.id] * 0.98); } }
    for (const r of def.revenue) b.revenueBase[r.id] *= 1 + nominal;
    b.total = spendingTotal(b);
    b.history.push({ year: state.date.year, revenue: s.revenue, spending: s.spending, deficit: s.deficit, debt: b.debt, reserves: b.reserves });
    if (b.history.length > 12) b.history.shift();
    return causes;
  }

  PG.economy = { monthly, shock, score, NATURAL_U };
  PG.budget = { createBudget, summary, revenueOf, spendingTotal, serviceQuality, oneTime, adjustSpending, applyLaw, closeYear, lawCategory };
})(globalThis.PG = globalThis.PG || {});
