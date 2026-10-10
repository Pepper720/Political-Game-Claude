/* Public approval of an officeholder, bloc by bloc. Each bloc's approval drifts toward a
 * target built from visible components (partisanship, economy, services, policy record,
 * events, scandals, honeymoon, ideological fit) so the UI can show exactly why. */
(function (PG) {
  'use strict';
  const U = PG.util;

  const OUTCOME_ISSUE = { crime: 'crime', education: 'education', infrastructure: 'infrastructure', health: 'healthcare', housing: 'housing',
    environment: 'environment', safety: 'crime', quality: 'housing', services: 'infrastructure', efficiency: 'ethics', security: 'economy', retirement: 'retirement' };
  const OUTCOME_NAMES = { crime: 'Crime', education: 'Schools', infrastructure: 'Infrastructure', health: 'Health care', housing: 'Housing',
    environment: 'Environment', safety: 'Public safety', quality: 'Quality of life', services: 'Basic services', efficiency: 'Government efficiency', security: 'National security', retirement: 'Retirement security' };
  const OUTCOMES_BY_LEVEL = {
    school: ['education', 'infrastructure', 'safety', 'efficiency'],
    city: ['crime', 'safety', 'infrastructure', 'housing', 'quality', 'services', 'efficiency', 'environment'],
    state: ['education', 'health', 'crime', 'infrastructure', 'housing', 'environment', 'efficiency', 'safety'],
    federal: ['health', 'retirement', 'security', 'infrastructure', 'housing', 'environment', 'crime', 'efficiency'],
  };

  function salience(blocId, issue) {
    const b = PG.data.blocById[blocId];
    return (b && b.salience[issue]) || 0.7;
  }

  // Responsibility voters assign to the office for conditions.
  function responsibility(gov) {
    if (gov.kind === 'executive') return gov.level === 'federal' ? 1.0 : gov.level === 'state' ? 0.75 : 0.6;
    return gov.level === 'federal' ? 0.3 : 0.35;
  }

  function partisanComponent(state, b) {
    const party = state.player.party;
    const gov = state.gov;
    const aff = party === 'R' ? b.lean : party === 'D' ? -b.lean : -Math.abs(b.lean) * 0.3;
    const partisanOffice = PG.data.officeById[gov.officeId].partisan;
    const w = partisanOffice ? (gov.level === 'federal' ? 0.42 : 0.36) : 0.16;
    return U.clamp(aff * w, -30, 30);
  }

  function components(state, blocId) {
    const g = state.gov;
    const e = PG.juris.electorate(state, g.key);
    const b = e.blocs.find((x) => x.id === blocId);
    const p = state.player;
    const resp = responsibility(g);
    const c = {};
    c.partisanship = partisanComponent(state, b);
    const econSal = (salience(blocId, 'economy') + salience(blocId, 'jobs')) / 2;
    c.economy = U.clamp(PG.economy.score(state, g.level) * econSal * 1.5 * resp, -15, 12);
    let svc = 0;
    for (const k of OUTCOMES_BY_LEVEL[g.level]) {
      const v = g.outcomes[k];
      if (v === undefined) continue;
      const good = k === 'crime' ? 50 - v : v - 50;
      svc += good * salience(blocId, OUTCOME_ISSUE[k]) * 0.09;
    }
    c.services = U.clamp(svc * resp, -14, 14);
    c.policy = U.clamp(g.record[blocId] || 0, -25, 25);
    c.events = U.clamp(g.mods[blocId] || 0, -25, 25);
    c.scandals = -PG.scandals.heat(state) * 1.1;
    c.honeymoon = g.honeymoon || 0;
    const norm = PG.voters.partyNorm(p.party);
    const partisanOffice = PG.data.officeById[g.officeId].partisan;
    const fit = partisanOffice ? PG.voters.dist(p.ideology, b) - PG.voters.dist(norm, b) : PG.voters.dist(p.ideology, b) - 55;
    c.ideology = U.clamp(-fit * 0.08, -10, 10);
    if (g.kind === 'executive' && g.budget) {
      const def = PG.data.budgets[g.budget.level];
      const avgRate = U.sum(def.revenue.filter((r) => r.lever), (r) => g.budget.rates[r.id] * r.share) / U.sum(def.revenue.filter((r) => r.lever), (r) => r.share);
      c.taxes = U.clamp(-(avgRate - 1) * 100 * 0.35 * salience(blocId, 'taxes'), -12, 8);
    }
    if (g.missedVotes) c.attendance = -Math.min(6, g.missedVotes * 0.6);
    return c;
  }

  function target(state, blocId) {
    const c = components(state, blocId);
    return U.clamp(50 + U.sum(Object.values(c)), 3, 97);
  }

  function init(state, startFrom) {
    const g = state.gov;
    const e = PG.juris.electorate(state, g.key);
    g.approval = { byBloc: {}, overall: 50, base: 50 };
    g.honeymoon = 6;
    for (const b of e.blocs) g.approval.byBloc[b.id] = U.round(startFrom !== undefined ? U.lerp(target(state, b.id), startFrom, 0.3) : target(state, b.id), 1);
    recompute(state);
  }

  function recompute(state) {
    const g = state.gov;
    const e = PG.juris.electorate(state, g.key);
    let s = 0, w = 0, bs = 0, bw = 0;
    const groups = PG.effects.blocGroups(state, e);
    for (const b of e.blocs) {
      const a = g.approval.byBloc[b.id];
      s += a * b.share; w += b.share;
      if (groups.base.includes(b.id) || (!groups.base.length && groups.swing.includes(b.id))) { bs += a * b.share; bw += b.share; }
    }
    g.approval.overall = U.round(s / w, 1);
    g.approval.base = U.round(bw ? bs / bw : g.approval.overall, 1);
  }

  function monthly(state) {
    const g = state.gov;
    const e = PG.juris.electorate(state, g.key);
    for (const b of e.blocs) {
      const t = target(state, b.id);
      g.approval.byBloc[b.id] = U.round(g.approval.byBloc[b.id] + 0.22 * (t - g.approval.byBloc[b.id]), 2);
    }
    g.honeymoon = U.round((g.honeymoon || 0) * 0.82, 2);
    U.decayMap(g.mods, 5);
    for (const k of Object.keys(g.record)) g.record[k] *= 0.985; // policy memory fades slowly (~4-year half-life)
    recompute(state);
    state.history.approval.push({ date: { ...state.date }, overall: g.approval.overall, base: g.approval.base });
    if (state.history.approval.length > 240) state.history.approval.shift();
  }

  /* Voters react to a policy the player owns. weight: +1 full ownership; negative = opposed it. */
  function policyReaction(state, law, scope, weight) {
    const g = state.gov;
    if (!g) return;
    const e = PG.juris.electorate(state, g.key);
    const mult = PG.data.scopes[(scope || 2) - 1].mult;
    const L = { econ: law.ideo.econ * mult, social: law.ideo.social * mult };
    for (const b of e.blocs) {
      const sal = salience(b.id, law.issue);
      let d = (L.econ * b.econ + L.social * b.social) / 4200 * 6 * sal;
      d += ((law.blocs && law.blocs[b.id]) || 0) * mult;
      g.record[b.id] = (g.record[b.id] || 0) + d * weight;
    }
  }

  PG.approval = { OUTCOME_ISSUE, OUTCOME_NAMES, OUTCOMES_BY_LEVEL, components, target, init, recompute, monthly, policyReaction, salience, responsibility };
})(globalThis.PG = globalThis.PG || {});
