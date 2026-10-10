/* Governing screens: office overview, legislature, budget, executive, groups & press, courts. */
(function (PG) {
  'use strict';
  const ui = PG.ui, U = PG.util, esc = ui.esc;

  const COMP_LABEL = { partisanship: 'Partisanship', economy: 'Economy', services: 'Services & conditions', policy: 'Your policy record', events: 'Recent events', scandals: 'Scandals', honeymoon: 'Honeymoon', ideology: 'Ideological fit', taxes: 'Tax burden', attendance: 'Missed votes' };

  ui.screens.office = function (g) {
    const gv = g.gov, p = g.player;
    const o = PG.data.officeById[gv.officeId];
    const e = PG.juris.electorate(g, gv.key);
    let h = '<h1>' + esc(o.name) + '</h1><p class="muted">' + esc(e.name) + ' · term ' + p.office.termNumber + ', ends ' + esc(U.fmtDate(p.office.termEnd)) + ' · ' + U.plural(gv.monthsInOffice, 'month') + ' in office</p>';
    if (gv.decision === 'pending') {
      const info = PG.calendar.electionInfo(g, gv.officeId, p.office.termEnd.year - 1);
      const block = PG.character.termLimitBlock(g, gv.officeId);
      h += '<div class="card alert"><h3>Your seat is up in ' + esc(U.fmtDate(info.general)) + '</h3><p>The filing deadline is ' + esc(U.fmtDate(info.filingDeadline)) + '. ' + (block ? '<b>' + esc(block) + '</b>' : 'Run again, aim higher, or step aside.') + (gv.primaryThreat > 0.3 ? ' <span class="warn">Your base is restless — expect a primary challenge (threat ' + Math.round(gv.primaryThreat * 100) + '%).</span>' : '') + '</p><div class="row">' +
        (block ? '' : ui.btn('Seek reelection', { type: 'gov.decide', choice: 'reelect' }, 'primary')) + ui.cbtn('Run for another office', 'tab', 'career') + ui.btn('Retire at end of term', { type: 'gov.decide', choice: 'retire' }, 'danger') + '</div></div>';
    }
    h += '<div class="grid g4">' + ui.kpi('Approval', gv.approval.overall.toFixed(0) + '%') + ui.kpi('Among your base', gv.approval.base.toFixed(0) + '%') + ui.kpi('Political capital', Math.round(p.capital)) + ui.kpi('Actions left', gv.actionsLeft + ' / ' + PG.gov.ACTIONS_PER_MONTH) + '</div>';
    const hist = g.history.approval.filter((x) => U.dateCmp(x.date, p.office.start) >= 0 || true).slice(-60);
    h += '<div class="card"><h3>Approval</h3>' + ui.lineChart([{ name: 'Overall', color: 'var(--accent)', points: hist.map((x) => [U.monthIndex(x.date), x.overall]) }, { name: 'Base', color: 'var(--good)', points: hist.map((x) => [U.monthIndex(x.date), x.base]) }], { yMin: 20, yMax: 80, ref: 50, suffix: '%', label: 'approval' }) + '</div>';
    // Components table
    const comps = {};
    for (const b of e.blocs) { const c = PG.approval.components(g, b.id); for (const [k, v] of Object.entries(c)) comps[k] = (comps[k] || 0) + v * b.share; }
    h += '<div class="grid g2"><div class="card"><h3>Why voters feel this way</h3><p class="small muted">Approval drifts toward a target built from these components (weighted average across blocs, in points vs. 50).</p><table>' +
      Object.entries(comps).map(([k, v]) => '<tr><td>' + esc(COMP_LABEL[k] || k) + '</td><td style="width:45%">' + ui.centerBar(v, 20) + '</td><td class="num">' + ui.signed(v) + '</td></tr>').join('') + '</table></div>';
    h += '<div class="card"><h3>By bloc</h3><table>' + e.blocs.slice().sort((a, b) => b.share - a.share).map((b) => '<tr><td>' + esc(ui.blocName(b.id)) + ' <span class="muted small">' + ui.pct(b.share, 0) + '</span></td><td style="width:40%">' + ui.bar(gv.approval.byBloc[b.id] / 100, gv.approval.byBloc[b.id] >= 50 ? 'var(--good)' : 'var(--bad)') + '</td><td class="num">' + Math.round(gv.approval.byBloc[b.id]) + '%</td></tr>').join('') + '</table></div></div>';
    // Conditions
    h += '<div class="card"><h3>Conditions in ' + esc(e.name) + '</h3><p class="small muted">Outcomes follow funding relative to need, enacted laws, the economy, and your appointees. 50 is typical.' + (gv.kind === 'legislator' ? ' Voters hold legislators only partly responsible.' : '') + '</p><div class="grid g4">' +
      Object.entries(gv.outcomes).map(([k, v]) => '<div class="kpi"><b class="' + ((k === 'crime' ? 50 - v : v - 50) >= 0 ? 'good' : 'bad') + '">' + Math.round(v) + '</b><span>' + esc(PG.approval.OUTCOME_NAMES[k] || k) + (k === 'crime' ? ' (lower is better)' : '') + '</span></div>').join('') + '</div></div>';
    // Personal actions
    h += '<div class="card"><h3>Your time this month</h3><p class="small muted">' + gv.actionsLeft + ' personal actions left. Meetings with groups and leadership bids use political capital instead.</p><div class="row">' +
      ui.btn('Hold a town hall', { type: 'gov.action', kind: 'townhall' }, '', { disabled: gv.actionsLeft <= 0 }) +
      ui.btn('Constituent services', { type: 'gov.action', kind: 'district' }, '', { disabled: gv.actionsLeft <= 0 }) +
      ui.btn('Media appearance', { type: 'gov.action', kind: 'media' }, '', { disabled: gv.actionsLeft <= 0 }) +
      ui.btn('Fundraiser', { type: 'gov.action', kind: 'fundraiser' }, '', { disabled: gv.actionsLeft <= 0 }) +
      (gv.kind === 'legislator' ? ui.btn('Seek a committee chair (8 capital)', { type: 'gov.action', kind: 'leadership' }) : ui.btn('Address the public (3 capital)', { type: 'gov.address' })) +
      '</div><p class="small muted">War chest for your next race: ' + U.fmtMoney(p.cash) + '</p></div>';
    return h;
  };

  // ------------------------------------------------------------- legislature
  function stageLabel(b, g) {
    const ch = g.world.chambers[b.chambers[Math.min(b.ci, b.chambers.length - 1)]];
    return { committee: 'In committee (' + (ch ? ch.name : '') + ')', floor: 'Awaiting floor vote (' + (ch ? ch.name : '') + ')', conference: 'Conference committee', desk: 'On the executive\'s desk', override: 'Veto override attempt', enacted: 'Enacted', dead: 'Dead', vetoed: 'Vetoed' }[b.stage] || b.stage;
  }

  ui.screens.legislature = function (g) {
    const gv = g.gov, p = g.player;
    const chambers = PG.juris.chambersFor(g, gv.level);
    let h = '<h1>' + (gv.kind === 'executive' ? 'Legislation' : esc(g.world.chambers[gv.body].name)) + '</h1>';
    h += '<p class="muted">' + chambers.map((c) => esc(g.world.chambers[c].name) + ': ' + esc(PG.world.chamberControlSummary(g.world.chambers[c]))).join(' · ') + ' · ' + esc(sessionNote(g)) + '</p>';
    // Desk
    if (gv.desk && gv.desk.length) {
      h += '<div class="card alert"><h3>On your desk</h3>' + gv.desk.map((id) => { const b = gv.bills.find((x) => x.id === id); return billRow(g, b, ui.btn('Sign', { type: 'gov.sign', billId: id }, 'primary small') + ui.btn('Veto', { type: 'gov.veto', billId: id }, 'danger small')); }).join('') + '<p class="small muted">Bills you neither sign nor veto become law after about a month.</p></div>';
    }
    // Docket
    const mine = gv.docket.filter((d) => PG.leg.isPlayerChamber(g, d.chamber));
    if (mine.length) {
      h += '<div class="card alert"><h3>Floor votes this month</h3>' + mine.map((d) => {
        const b = gv.bills.find((x) => x.id === d.billId);
        if (!b) return '';
        const pos = PG.leg.partyPosition(g, gv.level, p.party, b);
        return billRow(g, b, '<span class="small muted">Your party: ' + (pos > 0 ? 'YES' : pos < 0 ? 'NO' : 'free vote') + '</span> ' +
          ui.btn('Yea' + (b.playerVote === 'Y' ? ' ✓' : ''), { type: 'gov.vote', billId: b.id, v: 'Y' }, 'small' + (b.playerVote === 'Y' ? ' primary' : '')) +
          ui.btn('Nay' + (b.playerVote === 'N' ? ' ✓' : ''), { type: 'gov.vote', billId: b.id, v: 'N' }, 'small' + (b.playerVote === 'N' ? ' primary' : '')));
      }).join('') + '<p class="small muted">Votes are held when you end the month. If you don\'t choose, you vote with your party.</p></div>';
    }
    const other = gv.docket.filter((d) => !PG.leg.isPlayerChamber(g, d.chamber));
    if (other.length) h += '<div class="card"><h3>Scheduled votes elsewhere</h3>' + other.map((d) => billRow(g, gv.bills.find((x) => x.id === d.billId), '')).join('') + '</div>';
    // Introduce
    const laws = PG.data.laws.filter((l) => l.levels.includes(gv.level));
    const sel = ui.drafts.newBill || (ui.drafts.newBill = { lawId: laws[0].id, scope: 2 });
    const lw = PG.data.lawById[sel.lawId] || laws[0];
    h += '<div class="card"><h3>' + (gv.kind === 'executive' ? 'Send a bill to the legislature' : 'Introduce a bill') + ' <span class="muted small">(4 capital)</span></h3><div class="row"><select data-bind="newBill.lawId" data-rerender>' +
      laws.map((l) => '<option value="' + l.id + '"' + (l.id === lw.id ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') + '</select><select data-bind="newBill.scope" data-num data-rerender>' + PG.data.scopes.map((s) => '<option value="' + s.id + '"' + (Number(sel.scope) === s.id ? ' selected' : '') + '>' + s.name + '</option>').join('') + '</select>' +
      ui.btn('Introduce', { type: 'gov.introduce', lawId: lw.id, scope: Number(sel.scope) || 2 }, 'primary', { disabled: p.capital < 4 }) + '</div>' + lawCard(g, lw, Number(sel.scope) || 2) + '</div>';
    // Active bills
    const active = PG.leg.activeBills(g);
    h += '<div class="card"><h3>Bills in progress (' + active.length + ')</h3>' + (active.length ? active.map((b) => billRow(g, b, ui.cbtn('Details & whip count', 'bill', b.id, 'small'))).join('') : '<p class="muted">Nothing moving.</p>') + '</div>';
    const done = gv.bills.filter((b) => ['enacted', 'dead', 'vetoed'].includes(b.stage)).slice(-25).reverse();
    h += '<div class="card"><h3>Recent outcomes</h3>' + (done.length ? done.map((b) => billRow(g, b, ui.cbtn('Details', 'bill', b.id, 'small'))).join('') : '<p class="muted">None yet.</p>') + '</div>';
    if (gv.kind === 'legislator') {
      const ch = g.world.chambers[gv.body];
      const me = ch.members.find((m) => m.isPlayer);
      h += '<div class="card"><h3>Your committees</h3><table>' + ch.committees.filter((c) => me.committees.includes(c.id)).map((c) => { const chair = ch.members.find((m) => m.id === c.chair); return '<tr><td>' + esc(c.name) + '</td><td>' + (c.chair === me.id ? '<b>You chair it</b>' : 'Chair: ' + esc(chair ? chair.name : '—') + (chair && ch.partisan ? ' ' + ui.party(chair.party) : '') + ' (' + (chair ? chair.seniority : 0) + ' yrs)') + '</td></tr>'; }).join('') + '</table>' +
        '<p class="small muted">Seniority: ' + me.seniority + ' years · Party standing: ' + Math.round(p.partyRel) + ' · Votes cast: ' + gv.voteRecord.length + ', broke with party ' + (gv.defections || 0) + ' times · Missed votes: ' + (gv.missedVotes || 0) + '</p></div>';
    }
    return h;
  };

  function sessionNote(g) {
    const st = PG.juris.homeState(g);
    const lvl = g.gov.level === 'school' || g.gov.level === 'city' ? 'local' : g.gov.level;
    return PG.calendar.inSession(lvl, st, g.date.month, g.date.year) ? 'In session' : 'Not in session (bills can\'t move)';
  }

  function billRow(g, b, actions) {
    if (!b) return '';
    const lw = PG.data.lawById[b.lawId];
    const last = b.history[b.history.length - 1];
    return '<div class="row between" style="border-bottom:1px solid var(--line);padding:8px 0"><div style="flex:1;min-width:220px"><b>' + esc(lw.name) + '</b> <span class="chip">' + PG.data.scopes[b.scope - 1].name + '</span> ' +
      (b.playerStance > 0 ? '<span class="chip good">you support</span>' : b.playerStance < 0 ? '<span class="chip bad">you oppose</span>' : '') + '<div class="small muted">' + esc(stageLabel(b, g)) + ' · sponsor ' + esc(b.sponsorName) + (last ? ' · ' + esc(last.text) : '') + '</div></div><div class="row">' + actions + '</div></div>';
  }

  function lawCard(g, lw, scope) {
    const mult = PG.data.scopes[scope - 1].mult;
    const gv = g.gov;
    const groupsFor = PG.data.groups.filter((x) => PG.groups.activeAt(x, gv.level)).map((x) => ({ x, s: PG.groups.stanceOnLaw(x, lw) })).filter((y) => y.s);
    const tot = gv.budget ? gv.budget.total : 0;
    return '<div class="card flat" style="margin-top:10px"><p>' + esc(lw.desc) + '</p><div class="small">' +
      'Ideology: economic ' + ui.signed(lw.ideo.econ * mult, 0) + ', social ' + ui.signed(lw.ideo.social * mult, 0) + ' · ' +
      (lw.cost ? 'Cost ' + U.fmtMoney(lw.cost * mult * tot) + '/yr · ' : '') + (lw.revenue ? 'Revenue ' + (lw.revenue > 0 ? '+' : '−') + U.fmtMoney(Math.abs(lw.revenue * mult * tot)) + '/yr · ' : '') +
      (lw.outcomes ? Object.entries(lw.outcomes).map(([k, v]) => esc(PG.approval.OUTCOME_NAMES[k] || k) + ' ' + (v > 0 ? '+' : '') + U.round(v * mult, 1)).join(', ') + ' · ' : '') +
      (lw.legal ? '<span class="warn">Legal risk ' + Math.round(lw.legal.vuln * 100) + '%: ' + esc(lw.legal.grounds) + '</span> · ' : '') +
      (lw.budgetary ? 'Budgetary (eligible for reconciliation) · ' : '') + (lw.preempt && gv.level === 'city' ? '<span class="warn">Often preempted by state law</span>' : '') + '</div>' +
      (groupsFor.length ? '<div class="small" style="margin-top:6px">' + groupsFor.sort((a, b) => b.s - a.s).map((y) => '<span class="chip ' + (y.s > 0 ? 'good' : 'bad') + '">' + esc(y.x.name) + ' ' + (y.s > 0 ? '+' : '') + y.s + '</span>').join(' ') + '</div>' : '') + '</div>';
  }
  ui.lawCard = lawCard;

  // Bill detail modal (whip count + tools).
  ui.commands.bill = (id) => { ui.modal = { kind: 'bill', id }; ui.render(); };
  ui.screens.billModal = function (g) {
    const gv = g.gov;
    const b = gv.bills.find((x) => x.id === ui.modal.id);
    if (!b) return '';
    const lw = PG.data.lawById[b.lawId];
    const live = !['enacted', 'dead', 'vetoed'].includes(b.stage);
    const chId = b.chambers[Math.min(b.ci, b.chambers.length - 1)];
    const ch = g.world.chambers[chId];
    let h = '<div class="row between"><h2>' + esc(lw.name) + ' <span class="chip">' + PG.data.scopes[b.scope - 1].name + '</span></h2><button data-cmd="closeModal">✕</button></div><p class="muted">' + esc(stageLabel(b, g)) + ' · sponsor ' + esc(b.sponsorName) + ' · ' + U.plural(b.cosponsors.length, 'cosponsor') + '</p>';
    h += lawCard(g, lw, b.scope);
    if (live) {
      const kind = ch.rules.cloture && !b.reconciliation ? 'cloture' : b.stage === 'override' ? 'override' : 'passage';
      const w = PG.leg.whipCount(g, chId, b, { kind, override: b.stage === 'override' });
      const counts = { Y: 0, y: 0, '?': 0, n: 0, N: 0 };
      w.rows.forEach((r) => { counts[r.lean] = (counts[r.lean] || 0) + 1; });
      h += '<div class="card flat"><div class="row between"><h3>Whip count — ' + esc(ch.name) + '</h3><b class="' + (w.yes >= w.needed ? 'good' : 'bad') + '">' + w.yes + ' leaning yes · ' + w.needed + ' needed' + (kind === 'cloture' ? ' (cloture)' : kind === 'override' ? ' (override)' : '') + '</b></div>' +
        ui.splitbar([[counts.Y, 'var(--good)', 'Yes'], [counts.y, 'color-mix(in srgb, var(--good) 55%, var(--panel))', 'lean'], [counts['?'], 'var(--muted)', '?'], [counts.n, 'color-mix(in srgb, var(--bad) 55%, var(--panel))', 'lean'], [counts.N, 'var(--bad)', 'No']]) +
        '<div class="row" style="margin-top:10px">' + ui.btn('Support', { type: 'gov.stance', billId: b.id, stance: 1 }, 'small' + (b.playerStance > 0 ? ' primary' : '')) + ui.btn(gv.kind === 'executive' ? 'Oppose / veto threat' : 'Oppose', { type: 'gov.stance', billId: b.id, stance: -1 }, 'small' + (b.playerStance < 0 ? ' primary' : '')) + ui.btn('Neutral', { type: 'gov.stance', billId: b.id, stance: 0 }, 'small') +
        ui.btn('Seek cosponsors (2)', { type: 'gov.cosponsors', billId: b.id }, 'small') + ui.btn('Press leadership to move it (3)', { type: 'gov.push', billId: b.id }, 'small') + ui.btn('Go public (4)', { type: 'gov.public', billId: b.id }, 'small') +
        (gv.level === 'federal' && lw.budgetary && !b.reconciliation ? ui.btn('Use reconciliation (6)', { type: 'gov.reconcile', billId: b.id }, 'small', { title: 'Simple-majority Senate path for budgetary bills, once per fiscal year' }) : '') + (b.reconciliation ? '<span class="chip good">reconciliation</span>' : '') +
        (chId === 'us_house' && b.stage === 'floor' ? ui.btn('Discharge petition', { type: 'gov.discharge', billId: b.id }, 'small') : '') +
        (b.stage === 'committee' && isChair(g, b) ? ui.btn('Bury it in committee', { type: 'gov.bury', billId: b.id }, 'small danger') : '') + '</div>' +
        '<p class="small muted">Whipping (2 capital) and side deals (3 capital + a district project) work only in the direction of your stated position. Members\' leanings combine ideology, party leadership, district pressure, interest-group lobbying, cost concerns, their relationship with you, and personal conviction.</p>';
      const rows = w.rows.slice().sort((a, b2) => Math.abs(a.score) - Math.abs(b2.score)).slice(0, 40);
      h += '<div class="tablewrap"><table><thead><tr><th>Member</th><th>Lean</th><th>Main factor</th><th class="num">Score</th><th></th></tr></thead><tbody>' + rows.map((r) => '<tr class="' + (r.you ? 'you' : '') + '"><td>' + esc(r.name) + ' ' + (ch.partisan ? ui.party(r.party) : '') + (r.state && ch.level === 'federal' ? ' <span class="small muted">' + r.state + '-' + r.district + '</span>' : '') + '</td><td>' + leanLabel(r.lean) + '</td><td class="small">' + esc(r.reason || '') + '</td><td class="num">' + (r.you ? '' : r.score.toFixed(2)) + '</td><td class="nowrap">' + (r.you || !b.playerStance ? '' : ui.btn('Whip', { type: 'gov.whip', billId: b.id, memberId: r.id }, 'small') + ui.btn('Deal', { type: 'gov.deal', billId: b.id, memberId: r.id }, 'small')) + '</td></tr>').join('') + '</tbody></table></div><p class="small muted">Showing the 40 most persuadable members (closest to undecided).</p></div>';
    }
    h += '<div class="card flat"><h3>History</h3><ul class="log">' + b.history.slice().reverse().map((x) => '<li><div class="when">' + U.fmtShortDate(x.date) + '</div>' + esc(x.text) + ui.whyList(x.causes) + '</li>').join('') + '</ul></div>';
    return h;
  };

  function isChair(g, b) {
    const ch = g.world.chambers[b.chambers[b.ci]];
    const com = ch && ch.committees.find((c) => c.id === b.committee);
    const me = ch && ch.members.find((m) => m.isPlayer);
    return com && me && com.chair === me.id;
  }

  function leanLabel(l) {
    return { Y: '<span class="good">Yes</span>', y: '<span class="good">Lean yes</span>', '?': '<span class="muted">Undecided</span>', n: '<span class="bad">Lean no</span>', N: '<span class="bad">No</span>' }[l] || esc(l);
  }

  // ------------------------------------------------------------- budget
  ui.screens.budget = function (g) {
    const gv = g.gov, b = gv.budget;
    const def = PG.data.budgets[b.level];
    const s = PG.budget.summary(g, b);
    const mo = PG.executive.months(g);
    let h = '<h1>Budget</h1><div class="grid g4">' + ui.kpi('Spending', U.fmtMoney(s.spending)) + ui.kpi('Revenue', U.fmtMoney(s.revenue)) + ui.kpi(s.deficit > 0 ? 'Deficit' : 'Surplus', U.fmtMoney(Math.abs(s.deficit))) + ui.kpi(b.level === 'federal' ? 'Debt' : 'Reserves', U.fmtMoney(b.level === 'federal' ? b.debt : b.reserves)) + '</div>';
    h += '<p class="small muted">Fiscal year starts ' + U.MONTHS[mo.fy - 1] + '. Proposals are due in ' + U.MONTHS[mo.propose - 1] + ' and voted on in ' + U.MONTHS[mo.adopt - 1] + '. ' + (def.balanced ? 'This government must balance its budget (deficits can only be covered from reserves).' : 'The federal government can borrow; debt service grows with interest rates.') + ' Credit rating: <b>' + b.rating + '</b>. Debt: ' + U.fmtMoney(b.debt) + '.</p>';
    if (gv.shutdown) h += '<div class="card danger"><h3>The government is shut down</h3><p>Each month costs approval and growth. Accept the legislature\'s version to end it.</p>' + ui.btn('Accept their budget', { type: 'gov.budgetCounter', choice: 'accept' }, 'primary') + '</div>';
    if (gv.budgetStage === 'impasse' && !gv.shutdown) h += '<div class="card alert"><h3>Budget impasse</h3><p>Agencies are operating at last year\'s levels while talks continue. Approval suffers each month.</p>' + ui.btn('Accept their budget', { type: 'gov.budgetCounter', choice: 'accept' }, 'primary') + '</div>';
    if (gv.kind === 'executive') {
      if (gv.budgetStage === 'drafting') h += budgetEditor(g);
      else if (gv.budgetStage === 'counter') {
        const st2 = PG.executive.proposalStats(g, gv.budgetCounter);
        const st = PG.juris.homeState(g);
        h += '<div class="card alert"><h3>The legislature rejected your budget and sent back its own</h3><p>Their version: ' + U.fmtMoney(st2.spending) + ' spending (' + ui.signed(st2.spendChange * 100) + '%), tax rates ' + ui.signed(st2.taxChange * 100) + '%, gap ' + U.fmtMoney(st2.deficit) + '.</p>' + compareTable(g, gv.budgetDraft, gv.budgetCounter) +
          '<div class="row">' + ui.btn('Sign their version', { type: 'gov.budgetCounter', choice: 'accept' }, 'primary') + (gv.level === 'state' && st.liv ? ui.btn('Sign with line-item vetoes', { type: 'gov.budgetCounter', choice: 'lineitem' }) : '') + ui.btn('Veto it (standoff)', { type: 'gov.budgetCounter', choice: 'veto' }, 'danger') + '</div><p class="small muted">If you do nothing by the start of the fiscal year, the impasse begins.</p></div>';
      } else h += '<div class="card"><p class="muted">Budget status: <b>' + esc(gv.budgetStage || 'current budget in effect') + '</b>. Your next proposal is due in ' + U.MONTHS[mo.propose - 1] + '.</p></div>';
    } else {
      if (gv.budgetStage === 'proposed' && gv.budgetDraft) {
        const st2 = PG.executive.proposalStats(g, gv.budgetDraft);
        h += '<div class="card alert"><h3>Pending budget</h3><p>Proposed: ' + U.fmtMoney(st2.spending) + ' (' + ui.signed(st2.spendChange * 100) + '% spending, ' + ui.signed(st2.taxChange * 100) + '% tax rates), gap ' + U.fmtMoney(st2.deficit) + '. Vote in ' + U.MONTHS[mo.adopt - 1] + '.</p>' +
          compareTable(g, PG.executive.currentProposal(b), gv.budgetDraft) + '<div class="row">' + ui.btn('Vote yes' + (gv.budgetVote === 'Y' ? ' ✓' : ''), { type: 'gov.budgetVote', v: 'Y' }, gv.budgetVote === 'Y' ? 'primary' : '') + ui.btn('Vote no' + (gv.budgetVote === 'N' ? ' ✓' : ''), { type: 'gov.budgetVote', v: 'N' }, gv.budgetVote === 'N' ? 'primary' : '') + ui.btn('Request a district earmark (4 capital)', { type: 'gov.earmark' }) + '</div></div>';
      } else h += '<div class="card"><p class="muted">No budget is pending. The next proposal arrives in ' + U.MONTHS[mo.propose - 1] + '.</p></div>';
    }
    h += '<div class="card"><h3>Current spending vs. need</h3><table><thead><tr><th>Category</th><th class="num">Spending</th><th class="num">Need</th><th>Funding level</th></tr></thead><tbody>' + def.spending.map((c) => { const q = b.spending[c.id] / b.need[c.id]; return '<tr><td>' + esc(c.name) + (c.mandatory ? ' <span class="chip">mandatory</span>' : c.fixed ? ' <span class="chip">fixed</span>' : '') + '</td><td class="num">' + U.fmtMoney(b.spending[c.id]) + '</td><td class="num">' + U.fmtMoney(b.need[c.id]) + '</td><td style="width:30%">' + ui.bar(Math.min(1, q / 1.3), q >= 0.97 ? 'var(--good)' : q >= 0.9 ? 'var(--warn)' : 'var(--bad)') + '<span class="small muted">' + ui.pct(q, 0) + '</span></td></tr>'; }).join('') + '</tbody></table>' +
      '<h4>Revenue</h4><table>' + def.revenue.map((r) => '<tr><td>' + esc(r.name) + '</td><td class="num">' + U.fmtMoney(s.revenueBy[r.id]) + '</td><td class="num">rate ×' + b.rates[r.id].toFixed(3) + '</td></tr>').join('') + '</table></div>';
    if (b.history.length) h += '<div class="card"><h3>History</h3>' + ui.lineChart([{ name: 'Revenue', color: 'var(--good)', points: b.history.map((x) => [x.year, x.revenue / 1e6]) }, { name: 'Spending', color: 'var(--bad)', points: b.history.map((x) => [x.year, x.spending / 1e6]) }], { suffix: 'M' }) + '</div>';
    return h;
  };

  function compareTable(g, a, b2) {
    const def = PG.data.budgets[g.gov.budget.level];
    return '<table><thead><tr><th>Category</th><th class="num">Yours</th><th class="num">Theirs</th></tr></thead><tbody>' + def.spending.filter((c) => !c.fixed && !c.mandatory).map((c) => '<tr><td>' + esc(c.name) + '</td><td class="num">' + U.fmtMoney(a.spending[c.id]) + '</td><td class="num">' + U.fmtMoney(b2.spending[c.id]) + '</td></tr>').join('') +
      def.revenue.filter((r) => r.lever).map((r) => '<tr><td>' + esc(r.name) + ' rate</td><td class="num">×' + a.rates[r.id].toFixed(3) + '</td><td class="num">×' + b2.rates[r.id].toFixed(3) + '</td></tr>').join('') + '</tbody></table>';
  }

  function budgetEditor(g) {
    const gv = g.gov, b = gv.budget;
    const def = PG.data.budgets[b.level];
    const d = ui.drafts.budget || (ui.drafts.budget = { spend: {}, rate: {} });
    def.spending.forEach((c) => { if (d.spend[c.id] === undefined) d.spend[c.id] = 0; });
    def.revenue.forEach((r) => { if (d.rate[r.id] === undefined) d.rate[r.id] = 0; });
    const build = () => {
      const prop = PG.executive.currentProposal(b);
      def.spending.forEach((c) => { if (!c.fixed) prop.spending[c.id] = b.spending[c.id] * (1 + (Number(d.spend[c.id]) || 0) / 100); });
      def.revenue.forEach((r) => { if (r.lever) prop.rates[r.id] = U.round(b.rates[r.id] * (1 + (Number(d.rate[r.id]) || 0) / 100), 4); });
      return prop;
    };
    ui.drafts.buildBudget = build;
    ui.liveHooks.push(() => {
      const prop = build();
      const st = PG.executive.proposalStats(g, prop);
      const el = document.getElementById('budgetLive');
      if (el) el.innerHTML = 'Spending ' + U.fmtMoney(st.spending) + ' (' + U.fmtSigned(st.spendChange * 100) + '%) · Revenue ' + U.fmtMoney(st.revenue) + ' · ' + (st.deficit > 0 ? '<span class="' + (st.balancedOk ? 'warn' : 'bad') + '">Gap ' + U.fmtMoney(st.deficit) + '</span>' : '<span class="good">Surplus ' + U.fmtMoney(-st.deficit) + '</span>') + (st.balancedOk ? '' : ' — <b class="bad">must balance</b>');
      for (const c of def.spending) { const e = document.getElementById('bs-' + c.id); if (e) e.textContent = U.fmtSigned(Number(d.spend[c.id]) || 0, 0) + '% → ' + U.fmtMoney(prop.spending[c.id]) + ' (' + Math.round(prop.spending[c.id] / b.need[c.id] * 100) + '% of need)'; }
      for (const r of def.revenue) { const e = document.getElementById('br-' + r.id); if (e) e.textContent = U.fmtSigned(Number(d.rate[r.id]) || 0, 1) + '%'; }
    });
    let h = '<div class="card alert"><h3>Draft your budget proposal</h3><p id="budgetLive"></p><div class="grid g2"><div><h4>Spending</h4>';
    for (const c of def.spending) {
      if (c.fixed) { h += '<p class="small muted">' + esc(c.name) + ': ' + U.fmtMoney(b.spending[c.id]) + ' (fixed obligation)</p>'; continue; }
      h += '<div class="field"><label>' + esc(c.name) + (c.mandatory ? ' <span class="muted small">(mandatory — changes require law)</span>' : '') + ' <span class="muted small" id="bs-' + c.id + '"></span></label><input type="range" min="' + (c.mandatory ? -3 : -20) + '" max="' + (c.mandatory ? 3 : 20) + '" step="1" data-bind="budget.spend.' + c.id + '" value="' + d.spend[c.id] + '"></div>';
    }
    h += '</div><div><h4>Tax rates</h4>';
    for (const r of def.revenue) {
      if (!r.lever) { h += '<p class="small muted">' + esc(r.name) + ': set by others</p>'; continue; }
      h += '<div class="field"><label>' + esc(r.name) + ' <span class="muted small" id="br-' + r.id + '"></span></label><input type="range" min="-15" max="15" step="0.5" data-bind="budget.rate.' + r.id + '" value="' + d.rate[r.id] + '"></div>';
    }
    h += '<p class="small muted">Tax increases cost approval with tax-sensitive voters and slow growth slightly; cuts below need erode services over months. The legislature votes by its own preferences — a hostile majority will send back a counteroffer.</p></div></div>' +
      '<div class="row">' + ui.cbtn('Submit to the legislature', 'submitBudget', undefined, 'primary') + ui.cbtn('Reset', 'resetBudget') + '</div></div>';
    return h;
  }
  ui.commands.submitBudget = () => { const prop = ui.drafts.buildBudget(); const r = ui.act({ type: 'gov.budgetSubmit', proposal: prop }); if (r && r.ok) ui.drafts.budget = null; };
  ui.commands.resetBudget = () => { ui.drafts.budget = null; ui.render(); };

  // ------------------------------------------------------------- executive
  ui.screens.executive = function (g) {
    const gv = g.gov, p = g.player;
    const positions = PG.data.cabinets[PG.executive.cabinetKey(g)] || [];
    let h = '<h1>Executive</h1>';
    h += '<div class="card"><h3>Your team</h3><p class="small muted">Competence improves outcomes in an appointee\'s area; loyalty limits leaks; cronies are loyal but risky. Positions marked * need confirmation by the ' + esc(g.world.chambers[PG.executive.confirmBody(g)].name) + '.</p><div class="tablewrap"><table><thead><tr><th>Position</th><th>Holder</th><th class="num">Competence</th><th class="num">Loyalty</th><th></th></tr></thead><tbody>';
    for (const pos of positions) {
      const c = gv.cabinet[pos.id];
      h += '<tr><td>' + esc(pos.name) + (pos.confirm ? '*' : '') + '</td><td>' + (c ? esc(c.name) + ' <span class="chip">' + c.profile + '</span>' : '<span class="bad">Vacant</span>') + '</td><td class="num">' + (c ? c.competence : '') + '</td><td class="num">' + (c ? c.loyalty : '') + '</td><td>' + (c ? ui.btn('Dismiss', { type: 'gov.fire', pos: pos.id }, 'small danger') : '') + '</td></tr>';
      if (!c) {
        h += '<tr><td></td><td colspan="4"><div class="small">Nominees (2 capital each):</div>' + (gv.nominees[pos.id] || []).map((n) => '<div class="row" style="padding:3px 0"><span style="flex:1"><b>' + esc(n.name) + '</b> — ' + esc(profileLabel(n.profile)) + ' · competence ' + n.competence + ', loyalty ' + n.loyalty + ', ideology ' + ideoWord(n) + '</span>' + ui.btn('Nominate', { type: 'gov.nominate', pos: pos.id, nominee: n.id }, 'small primary') + '</div>').join('') + '</td></tr>';
      }
    }
    h += '</tbody></table></div></div>';
    const eos = PG.data.executiveOrders.filter((e) => e.levels.includes(gv.level));
    h += '<div class="card"><h3>Executive orders <span class="muted small">(5 capital)</span></h3><p class="small muted">Fast and unilateral — but courts can enjoin them, and the next executive can revoke them with a stroke of a pen.</p><table>' +
      eos.map((e) => { const rec = gv.eos.find((x) => x.eoId === e.id && x.active); return '<tr><td><b>' + esc(e.name) + '</b><div class="small muted">Legal risk ' + Math.round(e.vuln * 100) + '% — ' + esc(e.grounds) + '</div></td><td>' + (rec ? (rec.blocked ? '<span class="chip bad">blocked by court</span>' : '<span class="chip good">in effect</span>') + ' ' + ui.btn('Rescind', { type: 'gov.rescind', id: rec.id }, 'small') : ui.btn('Sign', { type: 'gov.eo', eoId: e.id }, 'small', { disabled: p.capital < 5 })) + '</td></tr>'; }).join('') + '</table></div>';
    return h;
  };
  function profileLabel(p) { return { insider: 'Party insider', expert: 'Respected expert', bipartisan: 'Bipartisan pick', crony: 'Longtime loyalist' }[p] || p; }
  function ideoWord(n) { const d = (n.econ + n.social) / 2; return d < -30 ? 'left' : d > 30 ? 'right' : 'center'; }

  // ------------------------------------------------------------- groups
  ui.screens.groups = function (g) {
    const gv = g.gov;
    const lvl = gv ? gv.level : 'city';
    const list = PG.data.groups.filter((x) => PG.groups.activeAt(x, lvl)).sort((a, b) => PG.groups.rel(g, b.id) - PG.groups.rel(g, a.id));
    let h = '<h1>Interest groups &amp; press</h1><div class="card"><p class="small muted">Relationships (−100…100) drive endorsements, PAC money, volunteers, lobbying on your bills and ad campaigns for or against you. Meeting a group costs 3 political capital — and its rivals notice.</p><div class="tablewrap"><table><thead><tr><th>Group</th><th>Type</th><th>Relationship</th><th>Recent</th><th></th></tr></thead><tbody>' +
      list.map((x) => { const r = PG.groups.rel(g, x.id); const hs = g.groups[x.id].history[0]; return '<tr><td><b>' + esc(x.name) + '</b><div class="small muted">Cares about: ' + Object.entries(x.tags).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3).map(([t, v]) => (v > 0 ? '+' : '−') + PG.groups.tagLabel(t)).join(', ') + '</div></td><td class="small">' + esc(x.kind) + '</td><td style="width:22%">' + ui.centerBar(r, 100) + '<span class="small">' + Math.round(r) + '</span></td><td class="small muted">' + (hs ? esc(hs.why) + ' (' + (hs.delta > 0 ? '+' : '') + hs.delta + ')' : '') + '</td><td>' + (gv ? ui.btn('Meet', { type: 'gov.action', kind: 'meet', arg: x.id }, 'small', { disabled: g.player.capital < 3 }) : '') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    h += '<div class="card"><h3>Media</h3><p class="small muted">Press relations: <b>' + Math.round(g.player.media) + '</b>. Better relations soften coverage of bad news and amplify good news.</p><table>' + PG.data.outlets.filter((o) => o.levels.includes(lvl === 'school' ? 'school' : lvl)).map((o) => '<tr><td>' + esc(o.name) + '</td><td class="small muted">' + esc(o.kind) + '</td><td class="small">lean ' + (o.lean < -10 ? 'left' : o.lean > 10 ? 'right' : 'center') + '</td></tr>').join('') + '</table></div>';
    if (g.player.commitments.length) h += ui.screens.commitmentsCard(g);
    return h;
  };

  ui.screens.courts = ui.screens.courts || function () { return '<h1>Courts</h1><p class="muted">No cases yet.</p>'; };
})(globalThis.PG = globalThis.PG || {});
