/* Campaign screens: the monthly plan, the race, polls, money, and voters. */
(function (PG) {
  'use strict';
  const ui = PG.ui, U = PG.util, esc = ui.esc;

  function planDraft(g) {
    const c = g.campaign;
    if (!ui.drafts.plan) ui.drafts.plan = U.deepClone(c.plan);
    const d = ui.drafts.plan;
    d.debateStyle = d.debateStyle || 'policy';
    return d;
  }

  ui.screens.campaign = function (g) {
    const c = g.campaign;
    const o = PG.data.officeById[c.officeId];
    const pc = PG.campaign.playerCand(g);
    const d = planDraft(g);
    const days = PG.campaign.daysAvailable(g);
    const T = c.typicalBudget;
    const stageDate = PG.campaign.stageDate(g, c.stage);
    ui.liveHooks.push(() => {
      const used = U.sum(PG.campaign.DAY_KEYS, (k) => Number(d.days[k]) || 0);
      const el = document.getElementById('daysUsed');
      if (el) { el.textContent = used + ' / ' + days + ' days'; el.className = used > days ? 'bad' : used === days ? 'good' : 'warn'; }
      for (const k of PG.campaign.DAY_KEYS) { const v = document.getElementById('dv-' + k); if (v) v.textContent = d.days[k]; }
      const bar = document.getElementById('dayBar');
      if (bar) bar.innerHTML = PG.campaign.DAY_KEYS.filter((k) => d.days[k] > 0).map((k) => '<div style="flex:' + d.days[k] + ';background:' + DAY_COLORS[k] + '" title="' + PG.campaign.DAY_LABELS[k] + ': ' + d.days[k] + '">' + (d.days[k] >= 2 ? k : '') + '</div>').join('');
      const tot = (Number(d.adsPct) || 0) + (Number(d.fieldPct) || 0) + (Number(d.oppoPct) || 0);
      const sp = document.getElementById('spendTot');
      if (sp) { sp.textContent = tot + '% of cash (≈' + U.fmtMoney(pc.cash * tot / 100) + ' at today\'s balance)'; sp.className = tot > 100 ? 'bad' : ''; }
      for (const k of ['adsPct', 'fieldPct', 'oppoPct']) { const v = document.getElementById('sv-' + k); if (v) v.textContent = (Number(d[k]) || 0) + '% ≈ ' + U.fmtMoney(pc.cash * (Number(d[k]) || 0) / 100); }
    });
    let h = '<div class="row between"><h1>' + esc(o.name) + ' campaign</h1><span class="chip">' + esc(ui.stageName(c.stage)) + (stageDate ? ' · ' + esc(U.fmtDate(stageDate)) : '') + '</span></div>';
    h += '<p class="muted">' + esc(PG.juris.describe(g, c.key)) + ' · lean ' + U.fmtLean(PG.campaign.electorate(g).lean) + ' · ' + (o.partisan ? 'partisan' : 'nonpartisan') + (o.seats > 1 ? ' · ' + o.seats + ' seats (top ' + o.seats + ' win)' : '') + ' · typical winning budget ' + U.fmtMoney(T) + '</p>';
    if (c.pres) h += ui.screens.presPanel(g);
    if (c.ballot) h += '<div class="card ' + (c.ballot.collected < c.ballot.required ? 'alert' : '') + '"><b>Ballot access:</b> ' + c.ballot.collected.toLocaleString() + ' / ' + c.ballot.required.toLocaleString() + ' valid signatures (due ' + U.fmtDate(c.info.filingDeadline) + '). Ground-organizing days and field spending collect signatures.</div>';
    h += campaignBrief(g);
    // Schedule
    h += '<div class="card"><div class="row between"><h2>📅 This month\'s schedule</h2><b id="daysUsed"></b></div><div class="row" style="margin-bottom:8px"><span class="small muted">Presets:</span>' +
      Object.entries(PRESETS).map(([k, v]) => '<button class="small" data-cmd="planPreset" data-arg="' + k + '" title="' + esc(v.desc) + '">' + esc(v.name) + '</button>').join('') + '</div><div id="dayBar" class="daybar"></div><p class="small muted">You have ' + days + ' campaign days' + (g.player.office ? ' (official duties take the rest)' : '') + '. Overwork builds fatigue, which raises gaffe risk and dulls your charisma.</p><div class="grid g2">';
    const hints = {
      fundraising: 'Big checks — and big donors expect access', digital: 'Small donors; ideological intensity and momentum help', retail: 'Doors, diners, town halls: name ID and targeted blocs (strong in small districts)',
      media: 'Interviews and press: name ID at scale, gaffe risk', ground: 'Recruit volunteers, build turnout operation', policy: 'Policy credibility; needed for rollouts (2+ days)', prep: 'Improves your next debate', rest: 'Recover from fatigue',
    };
    for (const k of PG.campaign.DAY_KEYS) {
      h += '<div class="field"><label>' + esc(PG.campaign.DAY_LABELS[k]) + ': <span id="dv-' + k + '"></span> <span class="muted small">— ' + esc(hints[k]) + '</span></label><input type="range" min="0" max="' + days + '" data-bind="plan.days.' + k + '" value="' + d.days[k] + '"></div>';
    }
    h += '</div><div class="grid g2"><div class="field"><label>Who to target (retail and ads)</label><select data-bind="plan.target">' +
      [['swing', 'Swing voters'], ['base', 'Your base'], ['broad', 'Everyone']].concat(PG.campaign.electorate(g).blocs.map((b) => [b.id, ui.blocName(b.id)])).map(([v, l]) => '<option value="' + v + '"' + (d.target === v ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Debate approach</label><select data-bind="plan.debateStyle">' + [['policy', 'Policy depth'], ['attack', 'Go on offense'], ['folksy', 'Relatable stories'], ['cautious', 'Play it safe']].map(([v, l]) => '<option value="' + v + '"' + (d.debateStyle === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select><p class="small muted">' + debatesNote(g) + '</p></div></div></div>';
    // Spending
    const slider = (k, label) => '<div class="field"><label>' + label + ': <span id="sv-' + k + '"></span></label><input type="range" min="0" max="100" step="5" data-bind="plan.' + k + '" value="' + (d[k] || 0) + '">';
    h += '<div class="card"><div class="row between"><h2>Spending</h2><b id="spendTot"></b></div><p class="small muted">Set shares of cash on hand, spent after this month\'s fundraising comes in. Cash now: ' + U.fmtMoney(pc.cash) + '. Staff overhead (~' + U.fmtMoney(T * 0.015) + '/mo) is paid automatically. Effects have diminishing returns relative to the race\'s scale — and money saved now can be spent in the final weeks, when it matters most.</p><div class="grid g3">' +
      slider('adsPct', 'Ads') + '<select data-bind="plan.adTone" style="margin-top:6px">' + [['positive', 'Positive (build you up)'], ['contrast', 'Contrast (you vs. them)'], ['negative', 'Negative (tear them down; backlash risk)']].map(([v, l]) => '<option value="' + v + '"' + (d.adTone === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
      slider('fieldPct', 'Field staff &amp; turnout') + '</div>' +
      slider('oppoPct', 'Opposition research') + '</div>' +
      '</div>' + (g.player.mods.selfFund ? '<div class="field"><label>Self-fund this month <span class="muted">(family wealth)</span></label><input type="number" min="0" step="1000" data-bind="plan.selfFund" value="' + (d.selfFund || 0) + '"></div>' : '') +
      '<div class="row">' + ui.cbtn('Save plan', 'savePlan', undefined, 'primary') + '<span class="small muted">The saved plan runs when you end the month. Last saved: ' + esc(planSummary(c.plan)) + '</span></div></div>';
    // One-off actions
    h += '<div class="card"><h2>Moves</h2><div class="grid g2">';
    h += '<div><h4>Roll out a policy plan</h4><p class="small muted">Shifts your position, wins over blocs that agree, and alienates those who don\'t. Changing a stance you already took is a flip-flop. One per month; needs 2+ policy days.</p>' +
      '<div class="row"><select data-bind="rollout.issue" data-rerender>' + PG.data.issues.map((i) => '<option value="' + i.id + '"' + ((ui.drafts.rollout || {}).issue === i.id ? ' selected' : '') + '>' + esc(i.name) + '</option>').join('') + '</select></div>';
    const ri = PG.data.issueById[(ui.drafts.rollout && ui.drafts.rollout.issue) || 'economy'];
    ui.drafts.rollout = ui.drafts.rollout || { issue: 'economy', stance: 2 };
    h += '<div class="stack" style="margin-top:8px">' + ri.stances.map((s, i) => ui.btn(esc(s) + (g.player.positions[ri.id] === i - 2 ? ' ✓' : ''), { type: 'campaign.rollout', issue: ri.id, stance: i }, 'small', { disabled: c.rolloutThisMonth })).join(' ') + '</div></div>';
    h += '<div><h4>Seek an endorsement</h4><p class="small muted">One pitch per month. Groups weigh ideology, your relationship, and viability.</p><div class="row"><select data-bind="endorseGroup">' +
      PG.data.groups.filter((x) => PG.groups.activeAt(x, PG.juris.OFFICE_LEVEL[c.officeId]) && !c.endorsements[x.id]).map((x) => '<option value="' + x.id + '">' + esc(x.name) + ' (rel ' + Math.round(PG.groups.rel(g, x.id)) + ')</option>').join('') + '</select>' + ui.cbtn('Make the pitch', 'endorse', undefined, '', { disabled: c.endorseAsks >= 1 }) + '</div>' +
      '<h4 style="margin-top:14px">Other</h4><div class="row">' + ui.btn('Commission internal poll (' + U.fmtMoney(Math.max(3000, T * 0.02)) + ')', { type: 'campaign.poll' }, 'small') +
      (c.pledgeNoPAC ? '<span class="chip">No corporate PAC money pledged</span>' : ui.btn('Pledge: no corporate PAC money', { type: 'campaign.pledge' }, 'small')) +
      ui.cbtn('Withdraw from race', 'confirmWithdraw', undefined, 'small danger') + '</div></div>';
    h += '</div></div>';
    if (c.oppoFile.length) {
      h += '<div class="card"><h2>Opposition file</h2><table>' + c.oppoFile.map((x) => '<tr><td><b>' + esc(x.candName) + '</b>: ' + esc(x.text) + '</td><td class="num">severity ' + x.severity + '</td><td>' + (x.released ? '<span class="chip">released</span>' : ui.btn('Release', { type: 'campaign.releaseOppo', id: x.id }, 'small')) + '</td></tr>').join('') + '</table><p class="small muted">Timing matters: release late and it has less time to fade — but going negative can cost you too.</p></div>';
    }
    return h;
  };

  const PRESETS = {
    balanced: { name: 'Balanced', desc: 'A bit of everything', days: { fundraising: 5, digital: 2, retail: 4, media: 2, ground: 3, policy: 2, prep: 0, rest: 2 }, adsPct: 35, fieldPct: 10 },
    money: { name: 'Money push', desc: 'Build a war chest for the final stretch', days: { fundraising: 10, digital: 4, retail: 2, media: 1, ground: 1, policy: 0, prep: 0, rest: 2 }, adsPct: 10, fieldPct: 5 },
    doors: { name: 'Doors & ground', desc: 'Retail and turnout; best in small districts', days: { fundraising: 3, digital: 1, retail: 7, media: 1, ground: 6, policy: 0, prep: 0, rest: 2 }, adsPct: 20, fieldPct: 25 },
    air: { name: 'Air war', desc: 'Media and ads; best in big jurisdictions', days: { fundraising: 5, digital: 3, retail: 1, media: 6, ground: 1, policy: 2, prep: 0, rest: 2 }, adsPct: 60, fieldPct: 5 },
    debate: { name: 'Debate camp', desc: 'Prep for an upcoming debate', days: { fundraising: 4, digital: 2, retail: 2, media: 1, ground: 2, policy: 2, prep: 6, rest: 1 }, adsPct: 30, fieldPct: 10 },
  };
  const DAY_COLORS = { fundraising: '#2f9e44', digital: '#74b816', retail: '#1c7ed6', media: '#7048e8', ground: '#f08c00', policy: '#0c8599', prep: '#c2255c', rest: '#adb5bd' };
  ui.commands.planPreset = (k) => {
    const pr = PRESETS[k], d = ui.drafts.plan;
    const days = PG.campaign.daysAvailable(ui.game);
    d.days = Object.assign({}, pr.days);
    let tot = U.sum(Object.values(d.days));
    if (tot < days) d.days.rest += days - tot;
    while (tot > days) { const big = Object.keys(d.days).sort((a, b) => d.days[b] - d.days[a])[0]; d.days[big]--; tot--; }
    d.adsPct = pr.adsPct; d.fieldPct = pr.fieldPct;
    const r = PG.game.act(ui.game, { type: 'campaign.setPlan', plan: d });
    ui.toast(r.ok ? pr.name + ' plan saved.' : r.msg);
    PG.storage.autosave(ui.game);
    ui.render();
  };

  function campaignBrief(g) {
    const c = g.campaign, pc = PG.campaign.playerCand(g);
    const tips = [];
    const last = c.polls.find((p) => p.stage === c.stage);
    if (last) {
      const mine = last.results.player, best = Math.max.apply(null, Object.entries(last.results).filter(([k]) => k !== 'player').map(([, v]) => v).concat([0]));
      tips.push([mine >= best ? '📈' : '📉', 'Latest poll (' + last.sponsor + '): you ' + mine.toFixed(0) + '% vs. ' + best.toFixed(0) + '% for your top rival, ±' + last.moe + '.']);
    } else tips.push(['📊', 'No public polls yet. An internal poll shows where you stand, bloc by bloc.']);
    if (pc.nameRec < 35) tips.push(['📣', 'Most voters don\'t know you (' + Math.round(pc.nameRec) + '% name recognition). Retail, media and positive ads fix that.']);
    if (pc.cash < c.typicalBudget * 0.05) tips.push(['💰', 'You are low on money. Shift days to call time or digital.']);
    if (g.player.fatigue > 25) tips.push(['😴', 'You are exhausted — schedule rest days to avoid gaffes.']);
    const deb = c.debates.find((x) => !x.held && x.stage === c.stage && U.monthsBetween(g.date, x.date) <= 1);
    if (deb) tips.push(['🎤', deb.label + ' is coming up — prep days help.']);
    if (!c.rolloutThisMonth && (c.plan.days.policy || 0) >= 2) tips.push(['📜', 'You scheduled policy days: roll out a plan below to win over voters who agree.']);
    if (c.oppoFile.some((x) => !x.released)) tips.push(['🗂️', 'Your opposition file has unreleased material.']);
    const rv = c.candidates.find((x) => x.label === 'Your rival' && x.active);
    if (rv) tips.unshift(['⚔️', 'Your old rival ' + rv.name + ' is in this race. This one is personal.']);
    tips.push.apply(tips, ui.peopleTips(g));
    return '<div class="card brief">' + ui.memoHeader(g, 'Campaign briefing') + '<ul class="icons">' + tips.slice(0, 6).map(([i, t]) => '<li><span aria-hidden="true">' + i + '</span>' + esc(t) + '</li>').join('') + '</ul></div>';
  }

  function debatesNote(g) {
    const c = g.campaign;
    const next = c.debates.find((x) => !x.held && x.stage === c.stage);
    return next ? 'Next: ' + next.label + ' (' + U.fmtShortDate(next.date) + '). Prep banked: ' + c.prep + ' days.' : 'No debates scheduled for this stage.';
  }

  function planSummary(p) {
    return Object.entries(p.days).filter(([, v]) => v).map(([k, v]) => k + ' ' + v).join(', ') + '; ads ' + (p.adsPct || 0) + '% (' + p.adTone + '), field ' + (p.fieldPct || 0) + '%' + (p.oppoPct ? ', oppo ' + p.oppoPct + '%' : '');
  }

  ui.commands.savePlan = () => { ui.act({ type: 'campaign.setPlan', plan: ui.drafts.plan }); };
  ui.commands.endorse = () => {
    const sel = document.querySelector('[data-bind="endorseGroup"]');
    if (sel) ui.act({ type: 'campaign.endorse', group: sel.value });
  };
  ui.commands.confirmWithdraw = () => { if (window.confirm('Withdraw from this race? Your remaining money stays in your war chest.')) ui.act({ type: 'campaign.withdraw' }); };

  ui.screens.race = function (g) {
    const c = g.campaign;
    const cands = c.candidates.filter((x) => x.active || x.nominee);
    const stageC = PG.campaign.stageCands(g);
    let h = '<h1>The race</h1>';
    h += '<div class="card"><h3>Candidates</h3><div class="tablewrap"><table><thead><tr><th>Candidate</th><th>Party</th><th class="num">Name rec.</th><th class="num">Favorable</th><th class="num">Cash</th><th class="num">Raised</th><th class="num">Ground</th><th>Endorsements</th></tr></thead><tbody>' +
      cands.map((x) => '<tr class="' + (x.isPlayer ? 'you' : '') + '"><td>' + esc(x.isPlayer ? x.name + ' (you)' : x.name) + (x.incumbent ? ' <span class="chip">incumbent</span>' : '') + (!stageC.includes(x) ? ' <span class="chip">' + (x.nominee ? 'nominee (other party)' : 'other primary') + '</span>' : '') +
        (!x.isPlayer ? '<div class="small muted">' + esc(styleLabel(x)) + '</div>' : '') + '</td><td>' + ui.party(x.party) + '</td><td class="num">' + Math.round(x.nameRec) + '</td><td class="num">' + Math.round(x.fav) + '</td><td class="num">' + (x.isPlayer ? U.fmtMoney(x.cash) : '~' + U.fmtMoney(Math.round(x.cash / 1000) * 1000)) + '</td><td class="num">' + U.fmtMoney(x.raised) + '</td><td class="num">' + Math.round(x.ground) + '</td><td class="small">' + x.endorsements.map((e) => esc(PG.data.groupById[e].name)).join(', ') + '</td></tr>').join('') +
      '</tbody></table></div><p class="small muted">Favorability is among voters who know the candidate. Opponents\' cash is an estimate from public filings.</p></div>';
    h += '<div class="card"><h3>Debates</h3>' + (c.debates.length ? '<table>' + c.debates.map((d) => '<tr><td>' + esc(d.label) + '</td><td>' + U.fmtShortDate(d.date) + '</td><td>' + (d.held ? 'Won by <b>' + esc(d.result ? d.result.winner : '—') + '</b>' + (d.result ? ui.whyList(d.result.lines) : '') : '<span class="muted">upcoming</span>') + '</td></tr>').join('') + '</table>' : '<p class="muted">None.</p>') + '</div>';
    const st = PG.juris.homeState(g);
    h += '<div class="card"><h3>Calendar &amp; rules</h3><ul class="small">' +
      (c.info.primary && c.officeId !== 'president' ? '<li>Primary: ' + U.fmtDate(c.info.primary) + ' (' + esc(st.primary) + ' primary' + (st.runoff ? ', runoff below ' + Math.round(st.runoff * 100) + '%' : '') + ')</li>' : '') +
      '<li>General election: ' + U.fmtDate(c.info.general) + '</li><li>Filing deadline: ' + U.fmtDate(c.info.filingDeadline) + '</li><li>Term begins: ' + U.fmtDate(c.info.termStart) + ' (' + c.info.termYears + ' years)</li>' +
      (st.rcv && c.partisan ? '<li>Ranked-choice voting in the general election: if no one wins a majority, last-place candidates are eliminated and their voters\' next choices counted.</li>' : '') + '</ul></div>';
    return h;
  }

  function styleLabel(x) {
    const d = PG.voters.dist(x.ideology, { econ: 0, social: 0 });
    const lean = x.ideology.econ + x.ideology.social;
    const kind = d < 30 ? 'Moderate' : d < 70 ? (lean < 0 ? 'Mainstream liberal' : 'Mainstream conservative') : (lean < 0 ? 'Progressive firebrand' : 'Hard-line conservative');
    return kind + ' · quality ' + (x.quality > 65 ? 'strong' : x.quality < 40 ? 'weak' : 'average');
  }

  ui.screens.polls = function (g) {
    const c = g.campaign;
    const stagePolls = c.polls.filter((p) => p.stage === c.stage).slice().reverse();
    const cands = PG.campaign.stageCands(g).filter((x) => stagePolls.some((p) => p.results[x.id] !== undefined && p.results[x.id] > 0.5) || x.isPlayer);
    const colors = ['var(--accent)', 'var(--rep)', 'var(--good)', 'var(--warn)', 'var(--ind)', 'var(--muted)'];
    const series = cands.map((x, i) => ({ name: x.isPlayer ? 'You' : x.name, color: x.isPlayer ? 'var(--accent)' : colors[(i % 5) + 1], points: stagePolls.filter((p) => !p.internal || true).map((p) => [U.monthIndex(p.date), p.results[x.id] || 0]) }));
    let h = '<h1>Polls</h1><div class="card"><h3>' + esc(ui.stageName(c.stage)) + ' polling</h3>' + ui.lineChart(series, { yMin: 0, suffix: '%', label: 'poll trend' }) + '</div>';
    h += '<div class="card"><h3>All polls</h3><div class="tablewrap"><table><thead><tr><th>Date</th><th>Pollster</th><th class="num">n</th><th class="num">MOE</th>' + cands.map((x) => '<th class="num">' + esc(x.isPlayer ? 'You' : x.name.split(' ').slice(-1)[0]) + '</th>').join('') + '<th class="num">Undecided</th></tr></thead><tbody>' +
      c.polls.filter((p) => p.stage === c.stage).map((p) => '<tr><td>' + U.fmtShortDate(p.date) + '</td><td>' + esc(p.sponsor) + '</td><td class="num">' + p.n + '</td><td class="num">±' + p.moe + '</td>' + cands.map((x) => '<td class="num">' + (p.results[x.id] !== undefined ? p.results[x.id].toFixed(0) : '—') + '</td>').join('') + '<td class="num">' + p.undecided.toFixed(0) + '</td></tr>').join('') +
      '</tbody></table></div><p class="small muted">Margin of error (95%) ≈ 98/√n for each candidate\'s share; the gap between two candidates is roughly twice as uncertain. Pollsters also have house effects, and undecideds break late.</p></div>';
    const internal = c.polls.find((p) => p.internal && p.stage === c.stage);
    if (internal) {
      h += '<div class="card"><h3>Your latest internal poll — crosstabs (' + U.fmtShortDate(internal.date) + ')</h3><div class="tablewrap"><table><thead><tr><th>Bloc</th>' + cands.map((x) => '<th class="num">' + esc(x.isPlayer ? 'You' : x.name.split(' ').slice(-1)[0]) + '</th>').join('') + '</tr></thead><tbody>' +
        Object.entries(internal.crosstabs).map(([b, row]) => '<tr><td>' + esc(ui.blocName(b)) + '</td>' + cands.map((x) => '<td class="num">' + (row[x.id] !== undefined ? row[x.id] : '—') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' +
        '<p class="small muted">Subgroup samples are small; each crosstab cell carries a wide margin of error (±8–15).</p>' +
        '<h4>Name recognition / favorability</h4><p class="small">' + Object.entries(internal.fav).map(([id, v]) => esc(id === 'player' ? 'You' : (c.candidates.find((x) => x.id === id) || {}).name) + ': ' + v.rec + '% know, ' + v.fav + '% favorable').join(' · ') + '</p></div>';
    } else h += '<div class="card"><p class="muted">Commission an internal poll on the Campaign tab to see crosstabs by voter bloc.</p></div>';
    return h;
  };

  ui.screens.money = function (g) {
    const c = g.campaign, pc = PG.campaign.playerCand(g);
    const r = c.raised, s = c.spent;
    let h = '<h1>Money</h1><div class="grid g4">' + ui.kpi('Cash on hand', U.fmtMoney(pc.cash)) + ui.kpi('Raised (this race)', U.fmtMoney(pc.raised)) + ui.kpi('Spent', U.fmtMoney(pc.spent)) + ui.kpi('Typical winning budget', U.fmtMoney(c.typicalBudget)) + '</div>';
    h += '<div class="grid g2"><div class="card"><h3>Where it came from</h3><table>' + [['Carried over', r.carry], ['Large donors', r.large], ['Small-dollar', r.small], ['PACs', r.pac], ['Self-funding', r.self]].map(([k, v]) => '<tr><td>' + k + '</td><td class="num">' + U.fmtMoney(v) + '</td></tr>').join('') + '</table>' +
      '<p class="small muted">Contribution limit for this race: ' + limitText(g) + '. Tighter limits mean more call time for the same dollars; no limits mean fewer, bigger donors — with bigger expectations.</p></div>';
    h += '<div class="card"><h3>Where it went</h3><table>' + [['Ads', s.ads], ['Field & turnout', s.field], ['Staff & overhead', s.staff], ['Polling', s.polls], ['Opposition research', s.oppo]].map(([k, v]) => '<tr><td>' + k + '</td><td class="num">' + U.fmtMoney(v) + '</td></tr>').join('') + '</table>' +
      '<p class="small muted">Outside spending (super PACs — legally independent of you): ' + U.fmtMoney(c.superPac.for) + ' for you, ' + U.fmtMoney(c.superPac.against) + ' against you.</p></div></div>';
    h += ui.lineChart([{ name: 'Cash on hand', color: 'var(--good)', points: c.history.map((x) => [U.monthIndex(x.date), x.cash / 1000]) }], { yMin: 0, suffix: 'K', label: 'cash' });
    h += ui.screens.commitmentsCard(g);
    return h;
  };

  function limitText(g) {
    const lvl = PG.juris.OFFICE_LEVEL[g.campaign.officeId];
    if (lvl === 'federal') return '$3,500 per person per election (federal); PACs $5,000';
    if (lvl === 'state') { const l = PG.juris.homeState(g).contribLimit; return l ? U.fmtMoney(l) + ' per person (state law)' : 'no limit on individual contributions in this state'; }
    return 'set by city ordinance (typically ~$1,000)';
  }

  ui.screens.voters = function (g) {
    const c = g.campaign;
    const e = PG.campaign.electorate(g);
    const prev = PG.election.preview(g);
    const pc = PG.campaign.playerCand(g);
    const rival = PG.campaign.stageCands(g).filter((x) => !x.isPlayer).sort((a, b) => (prev.votes[b.id] || 0) - (prev.votes[a.id] || 0))[0];
    let h = '<h1>Voters</h1><p class="muted">' + esc(e.name) + ' · ' + Math.round(e.voters).toLocaleString() + ' eligible voters · partisan lean ' + U.fmtLean(e.lean) + '</p>';
    h += '<div class="card"><h3>Voter blocs</h3><p class="small muted">The electorate is modeled as blocs with distinct partisanship, ideology, turnout and issue priorities. "Your support" is the model\'s current estimate if the election were held today — polls see it only through noise.</p><div class="tablewrap"><table><thead><tr><th>Bloc</th><th class="num">Share</th><th class="num">Lean</th><th class="num">Turnout</th><th>Cares most about</th><th class="num">You</th>' + (rival ? '<th class="num">' + esc(rival.name.split(' ').slice(-1)[0]) + '</th>' : '') + '<th>Why</th></tr></thead><tbody>';
    const ctx = PG.election.ctxFor(g, c.stage, c.stage === 'primary' || c.stage === 'runoff' ? g.player.party : null);
    for (const b of e.blocs) {
      const bv = prev.byBloc[b.id];
      const mine = bv && bv.total ? bv.votes.player / bv.total : 0;
      const theirs = bv && bv.total && rival ? (bv.votes[rival.id] || 0) / bv.total : 0;
      const sal = Object.entries(PG.data.blocById[b.id].salience).sort((a, b2) => b2[1] - a[1]).slice(0, 2).map(([k]) => PG.data.issueById[k] ? PG.data.issueById[k].name : k).join(', ');
      const ex = rival ? PG.voters.explainBloc(e, [pc, rival], ctx, b.id) : null;
      let why = '';
      if (ex) {
        const diff = {};
        for (const k of Object.keys(ex[0].parts)) diff[k] = (ex[0].parts[k] || 0) - (ex[1].parts[k] || 0);
        for (const k of Object.keys(ex[1].parts)) if (diff[k] === undefined) diff[k] = -(ex[1].parts[k] || 0);
        why = Object.entries(diff).filter(([, v]) => Math.abs(v) > 1).sort((a, b2) => Math.abs(b2[1]) - Math.abs(a[1])).slice(0, 2).map(([k, v]) => k + ' ' + (v > 0 ? '+' : '') + Math.round(v)).join(', ');
      }
      h += '<tr><td>' + esc(ui.blocName(b.id)) + '</td><td class="num">' + ui.pct(b.share, 0) + '</td><td class="num">' + U.fmtLean(b.lean) + '</td><td class="num">' + ui.pct(PG.voters.turnoutFor(b, ctx.kind || 'pres'), 0) + '</td><td class="small">' + esc(sal) + '</td><td class="num">' + ui.pct(mine, 0) + '</td>' + (rival ? '<td class="num">' + ui.pct(theirs, 0) + '</td>' : '') + '<td class="small muted">' + esc(why) + '</td></tr>';
    }
    h += '</tbody></table></div><p class="small muted">"Why" compares the factors driving each bloc toward you vs. your main rival: party, environment, ideology, appeal (favorability × name recognition), campaign targeting, incumbency, momentum.</p></div>';
    h += '<div class="card"><h3>Regions</h3><table>' + e.regions.map((r) => '<tr><td>' + esc(r.name) + '</td><td class="num">' + ui.pct(r.size, 0) + ' of voters</td><td>' + Object.entries(r.blocShare).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b, s]) => esc(ui.blocName(b)) + ' ' + ui.pct(s / r.size, 0)).join(', ') + '</td></tr>').join('') + '</table></div>';
    return h;
  };
})(globalThis.PG = globalThis.PG || {});
