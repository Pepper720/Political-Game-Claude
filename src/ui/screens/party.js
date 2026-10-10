/* Party-founder mode: HQ, races & candidates, ballot map, results. */
(function (PG) {
  'use strict';
  const ui = PG.ui, U = PG.util, esc = ui.esc;
  const pact = (kind, arg) => ({ type: 'party.act', kind, arg });

  function nextSteps(g) {
    const P = g.party, home = g.player.homeState;
    const y = PG.party.electionYear(g);
    const tips = [];
    const b = P.ballot[home];
    if (b.status !== 'qualified') tips.push('Get on the ballot at home: run petition drives in ' + PG.data.stateById[home].name + ' (' + b.signatures.toLocaleString() + ' / ' + b.required.toLocaleString() + ' signatures). Local nonpartisan races don\'t need a ballot line.');
    const running = P.candidates.filter((c) => c.status === 'running');
    if (!running.length) tips.push('Recruit candidates on the Races tab. Pick seats where your estimate is highest — focus beats spreading thin.');
    else if (running.some((c) => c.funds < 2000 && !c.spent)) tips.push('Some candidates have no money. Fund them on the Races tab — spending raises their name recognition and turnout.');
    if (P.brand.nameRec < 20) tips.push('Almost nobody has heard of you. A media blitz or a convention raises name recognition.');
    if (P.funds < 20000) tips.push('Money is tight. A fundraising drive is the reliable way to refill the treasury.');
    if (g.date.month >= 9 && g.date.month <= 11) tips.push('Election in November ' + y + ' — last chance to fund candidates.');
    return tips.slice(0, 4);
  }

  ui.screens.hq = function (g) {
    const P = g.party;
    const st = PG.party.STATUS.find((x) => x.id === P.status);
    const s = PG.party.strength(g);
    let h = '<div class="hero" style="--hero:' + esc(P.color) + '"><div><p class="eyebrow">Party headquarters</p><h1>' + esc(P.name) + '</h1><p>' + esc(st.name) + ' — ' + esc(st.desc) + '</p></div><div class="hero-stat"><b>' + Math.round(s * 100) + '</b><span>party strength</span></div></div>';
    const tips = nextSteps(g);
    if (tips.length) h += '<div class="card brief"><h3>💡 What to do next</h3><ul>' + tips.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul></div>';
    h += '<div class="grid g4">' + ui.kpi('Treasury', U.fmtMoney(P.funds), 'Dues bring in ~' + U.fmtMoney(P.lastDues || 0) + '/mo') + ui.kpi('Members', P.members.toLocaleString()) + ui.kpi('Name recognition', Math.round(P.brand.nameRec) + '%') + ui.kpi('Favorability', Math.round(P.brand.fav) + '%') +
      ui.kpi('Seats held', PG.party.totalSeats(g)) + ui.kpi('Ballot lines', Object.values(P.ballot).filter((b) => b.status === 'qualified').length + ' / 51') + ui.kpi('Last avg. vote', P.lastShare ? ui.pct(P.lastShare) : '—') + ui.kpi('Leadership actions', P.actionsLeft + ' left') + '</div>';
    h += '<div class="card"><h3>Why voters hesitate</h3><p class="small">New parties face the <b>wasted-vote problem</b>: even voters who like you fear helping the major party they dislike most. Your strength (' + Math.round(s * 100) + '/100) combines name recognition, recent vote share and seats held; as it rises, the penalty shrinks. ' + ui.bar(s) + '</p></div>';
    // Actions
    const home = g.player.homeState;
    const sel = ui.drafts.partyState || home;
    const stt = PG.data.stateById[sel];
    const chCost = Math.round(6000 * Math.sqrt(stt.population) / 1000) * 1000;
    const no = P.actionsLeft <= 0;
    h += '<div class="card"><h3>Leadership actions <span class="muted small">(' + P.actionsLeft + ' left this month)</span></h3><div class="grid g2">' +
      '<div class="action"><b>💵 Fundraising drive</b><p class="small muted">Scales with members, name recognition and your fundraising skill.</p>' + ui.btn('Raise money', pact('fundraise'), 'primary', { disabled: no }) + '</div>' +
      '<div class="action"><b>📺 Media blitz</b><p class="small muted">Costs ~' + U.fmtMoney(15000 + Math.round(P.brand.nameRec * 1500)) + '. Builds name recognition; an extreme platform polarizes coverage.</p>' + ui.btn('Launch blitz', pact('media'), '', { disabled: no }) + '</div>' +
      '<div class="action"><b>🎪 National convention</b><p class="small muted">Once a year, ~' + U.fmtMoney(40000 + P.members * 4) + '. Members, recognition, enthusiasm.</p>' + ui.btn('Hold convention', pact('convention'), '', { disabled: no || P.conventionYear === g.date.year }) + '</div>' +
      '<div class="action"><b>📍 State organizing</b><div class="row"><select data-bind="partyState" data-rerender>' + PG.data.states.map((x) => '<option value="' + x.id + '"' + (x.id === sel ? ' selected' : '') + '>' + esc(x.name) + (PG.party.onBallot(g, x.id) ? ' ✓' : '') + '</option>').join('') + '</select></div>' +
      '<p class="small muted">Chapter strength ' + Math.round(P.chapters[sel] || 0) + ' · ballot: ' + ballotLabel(P.ballot[sel]) + '</p><div class="row">' + ui.btn('Build chapter (' + U.fmtMoney(chCost) + ')', pact('chapter', sel), 'small', { disabled: no }) + ui.btn('Petition drive (≤ half of funds)', pact('petition', sel), 'small', { disabled: no || P.ballot[sel].status === 'qualified' }) + '</div></div>' +
      '</div></div>';
    // Platform
    const pi = (ui.drafts.plank && ui.drafts.plank.issue) || 'economy';
    const issue = PG.data.issueById[pi];
    h += '<div class="card"><h3>📜 Platform</h3><p class="small muted">Position: economic ' + Math.round(P.ideology.econ) + ', social ' + Math.round(P.ideology.social) + ' (−100 left … +100 right). Each plank shifts the party and every candidate. Reversing a plank costs members and favorability.</p><div class="row"><select data-bind="plank.issue" data-rerender>' + PG.data.issues.map((i) => '<option value="' + i.id + '"' + (i.id === pi ? ' selected' : '') + '>' + esc(i.name) + (P.platform[i.id] !== undefined ? ' ✓' : '') + '</option>').join('') + '</select></div><div class="row" style="margin-top:8px">' +
      issue.stances.map((x, i) => ui.btn(esc(x) + (P.platform[pi] === i - 2 ? ' ✓' : ''), pact('platform', { issue: pi, stance: i }), 'small', { disabled: no })).join('') + '</div>' +
      (Object.keys(P.platform).length ? '<p class="small" style="margin-top:8px">' + Object.entries(P.platform).map(([k, v]) => '<span class="chip">' + esc(PG.data.issueById[k].name) + ': ' + esc(PG.data.issueById[k].stances[v + 2]) + '</span>').join(' ') + '</p>' : '') + '</div>';
    if (P.milestones.length) h += '<div class="card"><h3>🏁 Milestones</h3><ul class="log">' + P.milestones.slice().reverse().map((m) => '<li><div class="when">' + U.fmtShortDate(m.date) + '</div>' + esc(m.text) + '</li>').join('') + '</ul></div>';
    return h;
  };

  function ballotLabel(b) {
    if (b.status === 'qualified') return '<span class="good">on the ballot</span>';
    if (b.status === 'petitioning') return 'petitioning ' + Math.round(b.signatures / b.required * 100) + '% (' + b.required.toLocaleString() + ' needed)';
    return 'not started (' + b.required.toLocaleString() + ' signatures needed)';
  }

  ui.screens.races = function (g) {
    const P = g.party;
    const y = PG.party.electionYear(g);
    const list = PG.party.races(g);
    const running = P.candidates.filter((c) => c.status === 'running');
    let h = '<h1>Races &amp; candidates</h1><p class="muted">Election: November ' + y + '. Recruiting costs a leadership action plus vetting money. Candidate quality depends on your local chapter and party strength.</p>';
    h += '<div class="card"><h3>Your candidates (' + running.length + ')</h3>' + (running.length ? '<div class="tablewrap"><table><thead><tr><th>Candidate</th><th>Race</th><th class="num">Quality</th><th class="num">Name rec</th><th class="num">War chest</th><th class="num">Est. share</th><th></th></tr></thead><tbody>' +
      running.map((c) => {
        const est = c.race.national ? null : PG.party.estimate(g, c.race, c);
        return '<tr><td><b>' + esc(c.name) + '</b></td><td class="small">' + esc(c.race.label) + '</td><td class="num">' + c.quality + '</td><td class="num">' + Math.round(c.nameRec) + '</td><td class="num">' + U.fmtMoney(c.funds) + '</td><td class="num">' + (est === null ? '—' : ui.pct(est, 0)) + '</td><td class="nowrap">' +
          [0.02, 0.05, 0.15].map((f) => ui.btn('+' + U.fmtMoney(Math.max(1000, Math.round(PG.party.raceBudget(g, c.race) * f))), pact('fund', { id: c.id, amount: Math.max(1000, Math.round(PG.party.raceBudget(g, c.race) * f)) }), 'small', { disabled: P.funds < Math.max(1000, Math.round(PG.party.raceBudget(g, c.race) * f)) })).join('') +
          ui.btn('Withdraw', pact('withdraw', c.id), 'small danger') + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="small muted">Estimates are the model\'s current read, before election-day error. Money spent each month builds recognition and turnout.</p>' : '<p class="muted">None yet.</p>') + '</div>';
    const filt = ui.drafts.raceFilter || 'all';
    const kinds = { all: 'All', local: 'Local', state: 'Statehouse', congress: 'Congress', statewide: 'Statewide' };
    const pick = (r) => filt === 'all' || (filt === 'local' && r.local) || (filt === 'state' && /state_/.test(r.officeId)) || (filt === 'congress' && /us_/.test(r.officeId)) || (filt === 'statewide' && r.statewide);
    const taken = new Set(running.map((c) => c.raceId));
    const shown = list.filter(pick).filter((r) => !taken.has(r.id)).slice(0, 40);
    h += '<div class="card"><h3>Open opportunities</h3><div class="pill-tabs">' + Object.entries(kinds).map(([k, v]) => '<button class="small ' + (filt === k ? 'on' : '') + '" data-cmd="raceFilter" data-arg="' + k + '">' + v + '</button>').join('') + '</div>' +
      (list.length && !shown.length ? '<p class="muted">Every open race in this category already has a candidate. Win ballot lines in more states to open up more races.</p>' : '') +
      (list.length ? '' : '<p class="warn">No races available yet. Local council races need no ballot line (odd years); partisan races require ballot access in that state.</p>') +
      '<div class="tablewrap"><table><thead><tr><th>Race</th><th class="num">Lean</th><th>Incumbent</th><th class="num">Est. share</th><th></th></tr></thead><tbody>' +
      shown.map((r) => '<tr><td>' + esc(r.label) + '</td><td class="num">' + (r.national ? '' : U.fmtLean(r.lean)) + '</td><td class="small">' + esc(r.incumbent || '') + ' ' + (r.incParty === 'D' || r.incParty === 'R' || r.incParty === 'P' ? ui.party(r.incParty) : '') + '</td><td class="num">' + estBar(r.estimate) + '</td><td>' + ui.btn('Recruit (' + U.fmtMoney(Math.max(3000, Math.round(PG.party.raceBudget(g, r) * 0.02))) + ')', pact('recruit', r.id), 'small primary', { disabled: P.actionsLeft <= 0 }) + '</td></tr>').join('') +
      '</tbody></table></div><p class="small muted">Sorted by the estimated vote share of a typical recruit. Three-way races are won with a plurality — often 35–40% is enough.</p></div>';
    return h;
  };
  ui.commands.raceFilter = (k) => { ui.drafts.raceFilter = k; ui.render(); };

  function estBar(e) {
    const col = e >= 0.33 ? 'var(--good)' : e >= 0.2 ? 'var(--warn)' : 'var(--muted)';
    return '<div style="min-width:90px">' + ui.bar(e / 0.5, col) + '<span class="small">' + ui.pct(e, 0) + '</span></div>';
  }

  ui.screens.pmap = function (g) {
    const P = g.party;
    let h = '<h1>Ballot access map</h1><p class="muted">Every state sets its own rules for new parties. You need valid signatures (opponents will challenge some) to get a ballot line, and you keep it only if your candidates there clear 2% in the next even-year election.</p>';
    h += '<div class="card">' + ui.tileMap((id) => {
      const b = P.ballot[id], ch = P.chapters[id] || 0;
      if (b.status === 'qualified') return { bg: P.color, title: PG.data.stateById[id].name + ': on the ballot · chapter ' + Math.round(ch) };
      if (b.status === 'petitioning') return { bg: 'color-mix(in srgb, ' + P.color + ' 40%, var(--chip))', fg: 'var(--ink)', title: PG.data.stateById[id].name + ': petitioning ' + Math.round(b.signatures / b.required * 100) + '%' };
      return { bg: 'var(--chip)', fg: 'var(--ink-2)', title: PG.data.stateById[id].name + ': not organized (' + b.required.toLocaleString() + ' signatures needed)' };
    }) + '<div class="legend" style="margin-top:8px"><span><span class="dot" style="background:' + esc(P.color) + '"></span>On the ballot</span><span><span class="dot" style="background:color-mix(in srgb, ' + esc(P.color) + ' 40%, var(--chip))"></span>Petitioning</span><span><span class="dot" style="background:var(--chip)"></span>Not organized</span></div></div>';
    const rows = PG.data.states.map((s) => ({ s, b: P.ballot[s.id], ch: P.chapters[s.id] || 0 })).filter((x) => x.ch > 0 || x.b.status !== 'none').sort((a, b) => b.ch - a.ch);
    h += '<div class="card"><h3>Organized states</h3>' + (rows.length ? '<table><thead><tr><th>State</th><th>Chapter</th><th>Ballot</th><th></th></tr></thead><tbody>' + rows.map((x) => '<tr><td>' + esc(x.s.name) + '</td><td style="width:30%">' + ui.bar(x.ch / 100, P.color) + '<span class="small">' + Math.round(x.ch) + '</span></td><td class="small">' + ballotLabel(x.b) + '</td><td>' + ui.btn('Petition', pact('petition', x.s.id), 'small', { disabled: x.b.status === 'qualified' || P.actionsLeft <= 0 }) + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted">No chapters yet.</p>') + '</div>';
    return h;
  };

  ui.screens.presults = function (g) {
    const P = g.party;
    const sb = PG.party.seatsBy(g);
    let h = '<h1>Results</h1><div class="card"><h3>Seats held</h3>' + (Object.keys(sb).length ? '<table>' + Object.values(sb).map((x) => '<tr><td>' + esc(x.name) + '</td><td class="num">' + x.n + (x.size > 1 ? ' of ' + x.size : '') + '</td></tr>').join('') + '</table>' : '<p class="muted">None yet. Many great parties started with a single council seat.</p>') + '</div>';
    if (P.history.length) {
      h += '<div class="card"><h3>Election history</h3>' + ui.lineChart([{ name: 'Avg. vote share', color: P.color, points: P.history.map((x) => [x.year, x.share * 100]) }], { yMin: 0, suffix: '%' }) +
        '<table><thead><tr><th>Year</th><th class="num">Candidates</th><th class="num">Won</th><th class="num">Avg. share</th><th class="num">Seats after</th></tr></thead><tbody>' + P.history.slice().reverse().map((x) => '<tr><td>' + x.year + '</td><td class="num">' + x.races + '</td><td class="num">' + x.won + '</td><td class="num">' + ui.pct(x.share || 0) + '</td><td class="num">' + x.seats + '</td></tr>').join('') + '</tbody></table></div>';
    }
    const past = P.candidates.filter((c) => c.status === 'won' || c.status === 'lost');
    if (past.length) h += '<div class="card"><h3>Recent candidates</h3><table>' + past.slice().reverse().slice(0, 30).map((c) => '<tr><td>' + esc(c.name) + '</td><td class="small">' + esc(c.race.label) + ' (' + c.year + ')</td><td class="num">' + ui.pct(c.share || 0) + '</td><td><span class="chip ' + (c.status === 'won' ? 'good' : 'bad') + '">' + c.status + '</span></td></tr>').join('') + '</table></div>';
    return h;
  };

  ui.screens.partyNight = function (g) {
    const n = g.electionNight;
    const won = n.rows.filter((r) => r.won).length;
    return '<div class="overlay night"><div class="modal wide"><p class="small muted">' + U.fmtDate(n.date) + '</p><h2>' + esc(n.title) + '</h2><span class="bigcall ' + (won ? 'win' : 'lose') + '">' + esc(n.message) + '</span>' +
      '<div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>Race</th><th>Candidate</th><th class="num">' + esc(g.party.short) + '</th><th class="num">Dem</th><th class="num">GOP</th><th></th></tr></thead><tbody>' +
      n.rows.map((r) => '<tr class="' + (r.won ? 'you' : '') + '"><td>' + esc(r.label) + '</td><td>' + esc(r.name) + '</td><td class="num">' + ui.pct(r.share) + '</td><td class="num">' + ui.pct(r.d || 0) + '</td><td class="num">' + ui.pct(r.r || 0) + '</td><td>' + (r.won ? '✔ Won' : 'Lost') + '</td></tr>').join('') + '</tbody></table></div>' +
      '<div class="card flat" style="background:transparent;border-color:#26304a"><h3>Takeaways</h3>' + ui.whyList(n.notes) + '</div><div class="row" style="justify-content:flex-end">' + ui.btn('Continue', { type: 'election.dismiss' }, 'primary') + '</div></div></div>';
  };
})(globalThis.PG = globalThis.PG || {});
