/* Executive powers: the annual budget cycle (proposal → legislative vote → counteroffer →
 * line-item veto / shutdown), executive orders, cabinet appointments and confirmations. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;

  function isExec(state) { return state.gov && state.gov.kind === 'executive'; }
  function chambers(state) { return PG.juris.chambersFor(state, state.gov.level); }

  // ---------------------------------------------------------------- budget
  function months(state) {
    const fy = state.gov.budget.fyStart;
    const wrap = (m) => ((m - 1 + 12) % 12) + 1;
    return { propose: wrap(fy - 4), adopt: wrap(fy - 1), fy };
  }

  function currentProposal(b) {
    return { spending: { ...b.spending }, rates: { ...b.rates } };
  }

  function proposalStats(state, prop) {
    const b = state.gov.budget;
    const fake = { ...b, spending: prop.spending, rates: prop.rates };
    const rev = PG.budget.revenueOf(state, fake).total;
    const sp = PG.budget.spendingTotal(fake);
    const curSp = PG.budget.spendingTotal(b);
    const def = PG.data.budgets[b.level];
    const lev = def.revenue.filter((r) => r.lever);
    const taxChange = U.sum(lev, (r) => (prop.rates[r.id] - 1) * r.share) / U.sum(lev, (r) => r.share);
    return { revenue: rev, spending: sp, deficit: sp - rev, spendChange: sp / curSp - 1, taxChange, balancedOk: b.level === 'federal' || sp - rev <= b.reserves * 0.5 };
  }

  // AI executive or default proposal.
  function aiProposal(state, ex) {
    const b = state.gov.budget;
    const prop = currentProposal(b);
    const def = PG.data.budgets[b.level];
    const lean = ex ? ex.econ / 100 : 0;
    for (const c of def.spending) {
      if (c.fixed || c.mandatory) continue;
      prop.spending[c.id] *= 1 + (-lean * 0.03) + 0.01;
    }
    let st = proposalStats(state, prop);
    // Balance if required: trim discretionary first, then raise rates modestly.
    let guard = 0;
    while (!st.balancedOk && guard++ < 30) {
      for (const c of def.spending) if (!c.fixed && !c.mandatory) prop.spending[c.id] *= 0.99;
      if (lean < 0) for (const r of def.revenue) if (r.lever) prop.rates[r.id] = U.round(prop.rates[r.id] + 0.005, 3);
      st = proposalStats(state, prop);
    }
    return prop;
  }

  // Legislator's view of a budget: ideal spending/tax change from ideology.
  function budgetScore(state, ch, m, prop, st, proposerParty) {
    const idealSpend = -m.econ / 100 * 5; // percent
    const idealTax = -m.econ / 100 * 3;
    const parts = {};
    parts.spending = -Math.abs(st.spendChange * 100 - idealSpend) * 0.14;
    parts.taxes = -Math.abs(st.taxChange * 100 - idealTax) * 0.2;
    if (ch.partisan && proposerParty) parts.party = (m.party === proposerParty ? 1 : -0.6) * m.loyalty * (ch.level === 'federal' ? 1 : 0.8);
    parts.mustPass = 0.9;
    if (!st.balancedOk) parts.balanced = -3;
    if (state.gov.budgetEarmarks && state.gov.budgetEarmarks[m.id]) parts.earmark = 1.2;
    parts.personal = PG.rng.hashNormal('budget' + state.date.year + m.id) * 0.3;
    return { score: U.sum(Object.values(parts)), parts };
  }

  function budgetVote(state, prop, proposerParty) {
    const st = proposalStats(state, prop);
    const results = [];
    for (const chId of chambers(state)) {
      const ch = state.world.chambers[chId];
      let yea = 0, nay = 0; const no = { spending: 0, taxes: 0, party: 0, balanced: 0 };
      for (const m of ch.members) {
        let yes;
        if (m.isPlayer) yes = state.gov.budgetVote ? state.gov.budgetVote === 'Y' : true;
        else {
          const s = budgetScore(state, ch, m, prop, st, proposerParty);
          yes = s.score > 0;
          if (!yes) { const worst = Object.entries(s.parts).filter(([k]) => no[k] !== undefined).sort((a, b) => a[1] - b[1])[0]; if (worst) no[worst[0]]++; }
        }
        if (yes) yea++; else nay++;
      }
      const needed = Math.floor(ch.members.length / 2) + 1;
      const reasons = [];
      if (no.spending) reasons.push(no.spending + ' objected to the spending level');
      if (no.taxes) reasons.push(no.taxes + ' objected to the tax changes');
      if (no.party) reasons.push(no.party + ' voted against on party lines');
      if (no.balanced) reasons.push(no.balanced + ' refused an unbalanced budget (balanced-budget requirement)');
      results.push({ chamber: ch.name, yea, nay, needed, passed: yea >= needed, reasons });
      if (yea < needed) break;
    }
    return { passed: results.every((r) => r.passed), results, stats: st };
  }

  // Legislature's counteroffer: move halfway toward the majority's preference.
  function counterOffer(state, prop) {
    const ch = state.world.chambers[chambers(state)[0]];
    const majMembers = ch.partisan ? ch.members.filter((m) => m.party === ch.majority) : ch.members;
    const medEcon = U.sortBy(majMembers, (m) => m.econ)[Math.floor(majMembers.length / 2)].econ;
    const b = state.gov.budget;
    const def = PG.data.budgets[b.level];
    const out = { spending: { ...prop.spending }, rates: { ...prop.rates } };
    const cur = currentProposal(b);
    for (const c of def.spending) {
      if (c.fixed || c.mandatory) continue;
      const ideal = cur.spending[c.id] * (1 - medEcon / 100 * 0.05);
      out.spending[c.id] = (prop.spending[c.id] + ideal) / 2;
    }
    for (const r of def.revenue) {
      if (!r.lever) continue;
      const ideal = 1 - medEcon / 100 * 0.03;
      out.rates[r.id] = U.round((prop.rates[r.id] + ideal) / 2, 3);
    }
    return out;
  }

  function adopt(state, prop, how) {
    const b = state.gov.budget;
    b.spending = { ...prop.spending }; b.rates = { ...prop.rates };
    b.adopted = { year: state.date.year, how };
    state.gov.budgetStage = 'adopted';
    state.gov.shutdown = false;
    PG.game.log(state, 'budget', 'Budget adopted: ' + how);
  }

  function monthly(state, autopilot) {
    const g = state.gov;
    const mo = months(state);
    const m = state.date.month;
    if (m === mo.fy && g.monthsInOffice > 1) {
      const causes = PG.budget.closeYear(state);
      PG.game.log(state, 'budget', 'Fiscal year closed.', causes);
    }
    if (m === mo.propose) {
      g.budgetVote = null; g.budgetEarmarks = {};
      const ex = PG.leg.execFor(state, g.level);
      if (ex && ex.isPlayer) {
        g.budgetDraft = currentProposal(g.budget);
        g.budgetStage = 'drafting';
        PG.game.log(state, 'budget', 'Budget season: submit your proposal before ' + U.MONTHS[mo.adopt - 1] + '.');
      } else {
        g.budgetDraft = aiProposal(state, ex);
        g.budgetStage = 'proposed';
        g.budgetProposer = ex ? ex.party : null;
        if (g.kind === 'legislator') PG.game.log(state, 'budget', (ex ? ex.title + ' ' + ex.name : 'The finance committee') + ' proposed next year\'s budget. You will vote on it in ' + U.MONTHS[mo.adopt - 1] + '.');
      }
    }
    if (m === mo.adopt && (g.budgetStage === 'drafting' || g.budgetStage === 'proposed')) {
      if (g.budgetStage === 'drafting') { g.budgetProposer = state.player.party; PG.game.log(state, 'budget', 'You did not submit a budget; a current-services budget was sent by default.'); }
      const v = budgetVote(state, g.budgetDraft, g.budgetProposer);
      const lines = v.results.map((r) => r.chamber + ': ' + r.yea + '–' + r.nay + (r.reasons.length ? ' (' + r.reasons.join('; ') + ')' : ''));
      if (v.passed) adopt(state, g.budgetDraft, 'passed as proposed. ' + lines.join(' | '));
      else {
        g.budgetCounter = counterOffer(state, g.budgetDraft);
        const ex = PG.leg.execFor(state, g.level);
        PG.game.log(state, 'budget', 'The legislature rejected the budget proposal.', lines);
        if (ex && ex.isPlayer && !autopilot) g.budgetStage = 'counter';
        else {
          // AI executive (or autopilot) accepts the counteroffer most of the time.
          if (R.chance(state, 0.8)) adopt(state, g.budgetCounter, 'the legislature\'s compromise version.');
          else impasse(state);
        }
      }
    } else if (g.budgetStage === 'counter' && autopilot) {
      adopt(state, g.budgetCounter, 'the legislature\'s compromise version (accepted by your staff).');
    } else if (g.budgetStage === 'counter' && m === mo.fy) {
      impasse(state);
    } else if (g.budgetStage === 'impasse') {
      impasseMonth(state);
    }
  }

  function impasse(state) {
    const g = state.gov;
    g.budgetStage = 'impasse';
    g.shutdown = g.level === 'federal';
    PG.game.log(state, 'budget', g.level === 'federal' ? 'No appropriations: the federal government has SHUT DOWN.' : 'No budget by the fiscal deadline: agencies run on last year\'s levels while talks continue.');
    PG.game.news(state, g.level === 'federal' ? 'Government shutdown begins' : 'Budget impasse drags on', -2);
  }

  function impasseMonth(state) {
    const g = state.gov;
    PG.effects.apply(state, { approval: { all: g.shutdown ? -1.5 : -0.8 } });
    if (g.shutdown) PG.economy.shock(state, { growth: -0.15 }, true);
    const ex = PG.leg.execFor(state, g.level);
    if (!(ex && ex.isPlayer) && R.chance(state, 0.5)) adopt(state, g.budgetCounter || currentProposal(g.budget), 'a stopgap deal ended the impasse.');
  }

  function submitBudget(state, prop) {
    const g = state.gov;
    if (!isExec(state) || g.budgetStage !== 'drafting') return { ok: false, msg: 'Not the time to submit a budget.' };
    const st = proposalStats(state, prop);
    if (!st.balancedOk) return { ok: false, msg: 'This jurisdiction must balance its budget: the gap can\'t exceed half of reserves (' + U.fmtMoney(g.budget.reserves * 0.5) + '). Current gap: ' + U.fmtMoney(st.deficit) + '.' };
    g.budgetDraft = { spending: { ...prop.spending }, rates: { ...prop.rates } };
    g.budgetStage = 'proposed';
    g.budgetProposer = state.player.party;
    // Voters react to the headline changes.
    const lines = [];
    if (st.taxChange > 0.005) { PG.effects.apply(state, { approval: { blocs: { seniors: -1, sub_family: -1.5, rural: -1 } }, groups: { taxpayers: -6, public_emp: 3 } }); lines.push('Tax increase angers taxpayers'); }
    if (st.taxChange < -0.005) { PG.effects.apply(state, { groups: { taxpayers: 5, public_emp: -3 } }); lines.push('Tax cut pleases taxpayer groups'); }
    if (st.spendChange < -0.01) { PG.effects.apply(state, { groups: { public_emp: -6, teachers: -3, taxpayers: 4 } }); lines.push('Spending cuts anger public employees'); }
    if (st.spendChange > 0.02) { PG.effects.apply(state, { groups: { taxpayers: -4, public_emp: 3 } }); }
    PG.game.log(state, 'budget', 'You submitted a ' + U.fmtMoney(st.spending) + ' budget (' + U.fmtSigned(st.spendChange * 100) + '% spending, ' + U.fmtSigned(st.taxChange * 100) + '% tax rates, gap ' + U.fmtMoney(st.deficit) + ').', lines);
    return { ok: true, msg: 'Budget submitted to the legislature.' };
  }

  function respondCounter(state, choice) {
    const g = state.gov;
    if (g.budgetStage !== 'counter' && g.budgetStage !== 'impasse') return { ok: false, msg: 'No counteroffer pending.' };
    const st = PG.juris.homeState(state);
    if (choice === 'accept') { adopt(state, g.budgetCounter, 'you accepted the legislature\'s compromise.'); return { ok: true, msg: 'Compromise budget adopted.' }; }
    if (choice === 'lineitem') {
      if (g.level !== 'state' || !st.liv) return { ok: false, msg: 'This executive has no line-item veto.' };
      const out = { spending: { ...g.budgetCounter.spending }, rates: { ...g.budgetCounter.rates } };
      let cut = 0;
      for (const [k, v] of Object.entries(out.spending)) {
        const mine = g.budgetDraft.spending[k];
        if (v > mine) { cut += v - mine; out.spending[k] = mine; }
      }
      adopt(state, out, 'you signed it but line-item vetoed ' + U.fmtMoney(cut) + ' in added spending.');
      PG.effects.apply(state, { legRel: -6 });
      return { ok: true, msg: 'Signed with line-item vetoes. Legislators resent it.' };
    }
    if (choice === 'veto') {
      impasse(state);
      PG.effects.apply(state, { legRel: -4, approval: { base: 1, swing: -1 } });
      return { ok: true, msg: 'You vetoed the budget. The standoff begins.' };
    }
    return { ok: false, msg: 'Unknown choice.' };
  }

  // Legislator sets their budget vote; appropriators can add district earmarks.
  function setBudgetVote(state, v) { state.gov.budgetVote = v; return { ok: true }; }
  function requestEarmark(state) {
    const g = state.gov, p = state.player;
    if (g.kind !== 'legislator' || !g.budgetStage) return { ok: false, msg: 'No budget is moving.' };
    if (p.capital < 4) return { ok: false, msg: 'Costs 4 political capital.' };
    const ch = state.world.chambers[g.body];
    const me = ch.members.find((m) => m.isPlayer);
    const onApprops = me.committees.includes('approps') || me.committees.includes('budget') || me.committees.includes('finance');
    p.capital -= 4;
    if (!onApprops && R.chance(state, 0.5)) return { ok: true, msg: 'Appropriators turned down your request (you are not on the committee).' };
    g.earmarks++;
    PG.effects.apply(state, { approval: { all: 1.5 }, groups: { taxpayers: -3 } });
    PG.game.log(state, 'budget', 'You secured a community project in the budget for your district.', ['Local approval up; fiscal hawks unhappy']);
    return { ok: true, msg: 'Earmark secured for a district project.' };
  }

  // ------------------------------------------------------- executive orders
  function issueEO(state, eoId) {
    const g = state.gov, p = state.player;
    const eo = PG.data.eoById[eoId];
    if (!isExec(state)) return { ok: false, msg: 'Only executives issue orders.' };
    if (!eo || !eo.levels.includes(g.level)) return { ok: false, msg: 'Not within your authority.' };
    if (g.eos.some((x) => x.eoId === eoId && x.active)) return { ok: false, msg: 'Already in effect.' };
    if (p.capital < 5) return { ok: false, msg: 'Executive orders cost 5 political capital.' };
    p.capital -= 5;
    const rec = { id: U.nextId(state, 'eo'), eoId, name: eo.name, date: { ...state.date }, active: true, blocked: false };
    g.eos.push(rec);
    const eff = Object.assign({}, eo.effects);
    const lines = PG.effects.apply(state, eff);
    const pseudoLaw = { name: eo.name, ideo: eo.ideo, tags: eo.tags, issue: (eo.tags[0] && ({ police_reform: 'crime', tough_on_crime: 'crime', immigration_restrict: 'immigration', immigration_open: 'immigration', environment: 'environment', fossil: 'environment', trade_protect: 'jobs' })[eo.tags[0]]) || 'economy' };
    PG.approval.policyReaction(state, pseudoLaw, 2, 0.6);
    lines.push.apply(lines, PG.groups.reactToLaw(state, pseudoLaw, 2, 0.7, 'You ordered'));
    p.legacy.eos++;
    PG.game.log(state, 'executive', 'Executive order: ' + eo.name + '. Legal exposure: ' + Math.round(eo.vuln * 100) + '% (' + eo.grounds + ')', lines);
    if (PG.courts) PG.courts.maybeChallenge(state, { type: 'eo', id: rec.id, name: eo.name, ideo: eo.ideo, vuln: eo.vuln, grounds: eo.grounds, tags: eo.tags, level: g.level });
    return { ok: true, msg: 'Order signed.' };
  }

  function rescindEO(state, recId) {
    const rec = state.gov.eos.find((x) => x.id === recId);
    if (!rec || !rec.active) return { ok: false, msg: 'Nothing to rescind.' };
    rec.active = false;
    PG.game.log(state, 'executive', 'You rescinded the order "' + rec.name + '".');
    return { ok: true, msg: 'Rescinded.' };
  }

  // ------------------------------------------------------------- cabinet
  function cabinetKey(state) { return { mayor: 'mayor', governor: 'governor', president: 'president' }[state.gov.officeId]; }

  function makeNominee(state, pos, profile) {
    const p = state.player;
    const base = { insider: { competence: 68, loyalty: 75, ideo: 0.9 }, expert: { competence: 80, loyalty: 50, ideo: 0.4 }, bipartisan: { competence: 66, loyalty: 55, ideo: -0.2 }, crony: { competence: 48, loyalty: 92, ideo: 1.0 } }[profile];
    return {
      id: U.nextId(state, 'n'), name: PG.world.personName(state), position: pos.id, area: pos.area, profile,
      competence: U.clamp(Math.round(base.competence + R.normal(state, 0, 8)), 20, 98), loyalty: U.clamp(Math.round(base.loyalty + R.normal(state, 0, 8)), 20, 99),
      scandalRisk: U.round(U.clamp((profile === 'crony' ? 0.03 : 0.012) + R.normal(state, 0, 0.006), 0.003, 0.06), 3),
      econ: Math.round(p.ideology.econ * base.ideo + R.normal(state, 0, 10)), social: Math.round(p.ideology.social * base.ideo + R.normal(state, 0, 10)),
    };
  }

  function initCabinet(state) {
    const g = state.gov;
    const positions = PG.data.cabinets[cabinetKey(state)] || [];
    for (const pos of positions) {
      g.cabinet[pos.id] = null;
      g.nominees[pos.id] = ['insider', 'expert', 'bipartisan', 'crony'].map((pf) => makeNominee(state, pos, pf));
    }
  }

  function confirmBody(state) {
    const lvl = state.gov.level;
    if (lvl === 'city') return 'council';
    if (lvl === 'state') return 'state_senate';
    return 'us_senate';
  }

  function confirmationScore(state, ch, m, n) {
    const parts = {};
    parts.ideology = -PG.voters.dist(m, n) / 70 + 0.6;
    if (ch.partisan) parts.party = (m.party === state.player.party ? 0.9 : -0.35) * m.loyalty;
    parts.qualifications = (n.competence - 60) / 40;
    if (n.profile === 'bipartisan') parts.bipartisan = 0.5;
    if (n.profile === 'crony') parts.crony = -0.4;
    parts.personal = PG.rng.hashNormal(n.id + m.id) * 0.3;
    return { score: U.sum(Object.values(parts)), parts };
  }

  function nominate(state, posId, nomineeId) {
    const g = state.gov, p = state.player;
    const pos = (PG.data.cabinets[cabinetKey(state)] || []).find((x) => x.id === posId);
    const n = (g.nominees[posId] || []).find((x) => x.id === nomineeId);
    if (!pos || !n) return { ok: false, msg: 'No such nominee.' };
    if (p.capital < 2) return { ok: false, msg: 'A nomination costs 2 political capital.' };
    p.capital -= 2;
    if (pos.confirm) {
      const ch = state.world.chambers[confirmBody(state)];
      let yea = 0, nay = 0; const why = { ideology: 0, party: 0, qualifications: 0 };
      for (const m of ch.members) {
        const s = confirmationScore(state, ch, m, n);
        if (s.score > 0) yea++; else { nay++; const w = Object.entries(s.parts).filter(([k]) => why[k] !== undefined).sort((a, b) => a[1] - b[1])[0]; if (w) why[w[0]]++; }
      }
      const passed = yea >= Math.floor(ch.members.length / 2) + 1;
      const reasons = Object.entries(why).filter(([, v]) => v).map(([k, v]) => v + ' opposed over ' + ({ ideology: 'ideology', party: 'partisanship', qualifications: 'qualifications' })[k]);
      PG.game.log(state, 'executive', n.name + ' ' + (passed ? 'confirmed' : 'REJECTED') + ' as ' + pos.name + ' by the ' + ch.name + ', ' + yea + '–' + nay + '.', reasons);
      if (!passed) {
        g.nominees[posId] = g.nominees[posId].filter((x) => x.id !== nomineeId);
        PG.effects.apply(state, { approval: -0.5, capital: -2 });
        return { ok: true, msg: 'Rejected ' + yea + '–' + nay + '. ' + reasons.join('; ') };
      }
    }
    g.cabinet[posId] = { ...n, positionName: pos.name, since: { ...state.date } };
    if (n.profile === 'bipartisan') PG.effects.apply(state, { approval: { swing: 0.6, base: -0.3 } });
    if (n.profile === 'crony') PG.effects.apply(state, { media: -2 });
    return { ok: true, msg: n.name + ' is your new ' + pos.name + '.' };
  }

  function fire(state, posId) {
    const g = state.gov;
    const c = g.cabinet[posId];
    if (!c) return { ok: false, msg: 'Vacant.' };
    g.cabinet[posId] = null;
    const pos = (PG.data.cabinets[cabinetKey(state)] || []).find((x) => x.id === posId);
    g.nominees[posId] = ['insider', 'expert', 'bipartisan', 'crony'].map((pf) => makeNominee(state, pos, pf));
    PG.effects.apply(state, { media: c.loyalty > 70 ? -1 : 1 });
    PG.game.log(state, 'executive', 'You dismissed ' + c.name + ' as ' + c.positionName + '.');
    return { ok: true, msg: 'Dismissed. The post is vacant until a successor is confirmed.' };
  }

  // Monthly cabinet risks.
  function cabinetMonthly(state) {
    const g = state.gov;
    const diff = PG.data.difficulty[state.difficulty];
    for (const [pid, c] of Object.entries(g.cabinet)) {
      if (!c) continue;
      if (R.chance(state, c.scandalRisk * diff.scandalRate)) {
        PG.events.trigger(state, 'cabinet_scandal', { member: c.name, position: c.positionName, posId: pid });
        return;
      }
    }
  }

  function monthlyAll(state, autopilot) {
    monthly(state, autopilot);
    if (isExec(state)) cabinetMonthly(state);
  }

  // Executive address / press conference — short-lived bump, diminishing returns.
  function address(state) {
    const g = state.gov, p = state.player;
    if (p.capital < 3) return { ok: false, msg: 'Costs 3 political capital.' };
    p.capital -= 3;
    const recent = g.lastAddress && U.monthsBetween(g.lastAddress, state.date) < 4;
    g.lastAddress = { ...state.date };
    const v = recent ? 0.4 : 1.5;
    PG.effects.apply(state, { approval: { all: v } });
    return { ok: true, msg: recent ? 'Another address so soon had little effect.' : 'Your address landed well.' };
  }

  PG.executive = {
    months, currentProposal, proposalStats, aiProposal, budgetVote, counterOffer, adopt, submitBudget, respondCounter, setBudgetVote, requestEarmark,
    issueEO, rescindEO, initCabinet, nominate, fire, address, monthly: monthlyAll, confirmBody, cabinetKey,
  };
})(globalThis.PG = globalThis.PG || {});
