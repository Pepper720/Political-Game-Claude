/* Career ladder, profile, world overview, log & news. */
(function (PG) {
  'use strict';
  const ui = PG.ui, U = PG.util, esc = ui.esc;

  ui.screens.career = function (g) {
    const p = g.player;
    let h = '<h1>Career</h1>';
    if (g.phase === 'gameover') h += '<div class="card alert"><h3>Career complete</h3><p>Legacy score: <b>' + g.gameOver.score + '</b></p></div>';
    if (p.declared) {
      h += '<div class="card alert"><h3>You\'re running for ' + esc(PG.data.officeById[p.declared.officeId].name) + '</h3><p>The campaign kicks off ' + esc(U.fmtDate(p.declared.campaignStart)) + '. Election: ' + esc(U.fmtDate(p.declared.info.general)) + '.</p>' +
        '<div class="row">' + ui.btn('Skip to campaign launch ▸▸', { type: 'career.fastForward' }, 'primary') + ui.btn('Withdraw declaration', { type: 'career.undeclare' }) + '</div></div>';
    }
    if (p.pendingOffice) h += '<div class="card alert"><h3>Office-elect</h3><p>You take office as ' + esc(PG.data.officeById[p.pendingOffice.officeId].name) + ' in ' + esc(U.fmtDate(p.pendingOffice.info.termStart)) + '.</p></div>';
    if (p.office) h += '<div class="card"><p>You currently serve as <b>' + esc(PG.data.officeById[p.office.officeId].name) + '</b> (term ends ' + esc(U.fmtDate(p.office.termEnd)) + '). You can run for another office while serving; your staff handle routine work while you campaign.</p></div>';
    const LEVELS = [['local', '🏘️ Local'], ['state', '🏛️ State'], ['federal', '🦅 Federal']];
    h += '<p class="muted">Requirements, term lengths and limits follow real rules for ' + esc(PG.juris.homeState(g).name) + '. Bigger leaps are legal, but donors and voters will doubt you.</p>';
    for (const [lvl, title] of LEVELS) {
      h += '<h2 class="section">' + title + '</h2><div class="grid g3">';
      for (const o of PG.data.offices.filter((x) => x.level === lvl)) {
        const el = PG.character.eligibility(g, o.id);
        let jur = '', lean = null;
        try { const e = PG.juris.forOffice(g, o.id); jur = e.name; lean = e.lean; } catch (err) { jur = '—'; }
        const info = el.info;
        const st = PG.juris.homeState(g);
        const term = PG.calendar.termLength(o.id, st);
        const mineNow = p.office && p.office.officeId === o.id;
        const action = el.ok ? ui.btn(mineNow ? 'Seek reelection' : 'Run', { type: 'career.declare', officeId: o.id }, 'primary', { disabled: !!p.declared || !!g.campaign || g.phase === 'gameover' }) : '';
        const leanChip = lean === null ? '' : '<span class="chip ' + (Math.abs(lean) < 6 ? '' : lean > 0 ? 'R' : 'D') + '" title="Partisan lean">' + U.fmtLean(lean) + '</span>';
        h += '<div class="card office ' + (el.ok ? 'open' : 'locked') + (mineNow ? ' current' : '') + '"><div class="row between"><h3>' + esc(o.name) + '</h3>' + leanChip + '</div>' +
          '<p class="small muted">' + esc(jur) + ' · ' + term + '-year term' + (jur !== '—' ? ' · typical budget ' + esc(U.fmtMoney(PG.juris.typicalBudget(g, o.id))) : '') + '</p>' +
          (info ? '<p class="small">🗓️ Election ' + esc(U.fmtShortDate(info.general)) + (info.primary && o.id !== 'president' ? ' · primary ' + esc(U.fmtShortDate(info.primary)) : '') + ' · file by ' + esc(U.fmtShortDate(info.filingDeadline)) + '</p>' : '') +
          (!el.ok ? '<p class="small bad">🔒 ' + el.reasons.map(esc).join('<br>🔒 ') + '</p>' : '') + (el.ok && el.warnings.length ? '<p class="small warn">' + el.warnings.map(esc).join('<br>') + '</p>' : '') +
          '<details><summary class="small">Rules</summary><p class="small muted">' + esc(o.note) + '</p></details>' + (action ? '<div class="row" style="margin-top:8px">' + action + '</div>' : '') + '</div>';
      }
      h += '</div>';
    }
    if (g.phase !== 'gameover') h += '<div class="card"><h3>Leave public life</h3><p class="muted small">Retiring ends the game with a legacy summary (after your current term, if you hold office).</p>' + ui.btn('Retire', { type: 'career.retire' }, 'danger') + '</div>';
    return h;
  };

  ui.screens.profile = function (g) {
    const p = g.player;
    const bg = PG.data.backgroundById[p.background];
    let h = '<h1>' + esc(p.name) + '</h1><p class="muted">' + esc(PG.character.partyName(p.party)) + ' · ' + esc(bg.name) + ' · age ' + U.age(g) + ' · ' + esc(g.world.home.city.name + ', ' + PG.juris.homeState(g).name) + '</p>';
    h += '<div class="grid g2"><div class="card"><h3>Skills</h3><table>' + PG.character.STAT_KEYS.map((k) => '<tr><td>' + U.cap(k) + '</td><td style="width:55%">' + ui.bar(PG.character.stat(g, k) / 100) + '</td><td class="num">' + Math.round(PG.character.stat(g, k)) + '</td></tr>').join('') + '</table>' +
      '<p class="small muted">Fatigue ' + Math.round(p.fatigue) + ' (lowers charisma and discipline) · Press relations ' + Math.round(p.media) + ' · Party standing ' + Math.round(p.partyRel) + '</p>' +
      '<h4>Traits</h4>' + (p.traits.length ? p.traits.map((t) => '<p><b>' + esc(PG.data.traitById[t].name) + '</b> — <span class="muted">' + esc(PG.data.traitById[t].desc) + '</span></p>').join('') : '<p class="muted">None</p>') + '</div>';
    h += '<div class="card"><h3>Positions</h3><p class="small muted">Economic ' + Math.round(p.ideology.econ) + ', social ' + Math.round(p.ideology.social) + ' (−100 left … +100 right).</p>' +
      (Object.keys(p.positions).length ? '<table>' + Object.entries(p.positions).map(([id, s]) => '<tr><td>' + esc(PG.data.issueById[id].name) + '</td><td>' + esc(PG.data.issueById[id].stances[s + 2]) + '</td></tr>').join('') + '</table>' : '<p class="muted">No public policy positions yet.</p>') +
      '<h4>Scandals</h4>' + (p.scandals.length ? p.scandals.map((s) => '<p>' + esc(s.text) + ' <span class="muted small">' + U.fmtShortDate(s.date) + ' · severity ' + s.severity + ' · current heat ' + U.round(s.heat, 1) + '</span></p>').join('') : '<p class="muted">None so far.</p>') + '</div></div>';
    h += '<div class="card"><h3>Record</h3><table><thead><tr><th>Office</th><th>Jurisdiction</th><th>Served</th></tr></thead><tbody>' + (p.history.length ? p.history.map((x) => '<tr><td>' + esc(PG.data.officeById[x.officeId].name) + (x.termNumber > 1 ? ' (term ' + x.termNumber + ')' : '') + '</td><td>' + esc(x.jurisdiction) + '</td><td>' + U.fmtShortDate(x.start) + ' – ' + (x.end ? U.fmtShortDate(x.end) : 'present') + '</td></tr>').join('') : '<tr><td colspan="3" class="muted">No offices yet.</td></tr>') + '</tbody></table>' +
      '<h4>Elections</h4><table>' + (p.legacy.elections.length ? p.legacy.elections.map((e) => '<tr><td>' + e.year + '</td><td>' + esc(e.office) + '</td><td class="' + (e.won ? 'good' : 'bad') + '">' + (e.won ? 'Won' : 'Lost') + '</td><td class="num">' + (e.share ? ui.pct(e.share) : '') + '</td><td class="small muted">' + esc(e.why || '') + '</td></tr>').join('') : '<tr><td class="muted">None yet.</td></tr>') + '</table>' +
      '<h4>Laws you championed (' + p.legacy.laws.length + ')</h4>' + (p.legacy.laws.length ? '<p>' + p.legacy.laws.map((l) => esc(l.name) + ' <span class="muted small">(' + l.date.year + ')</span>').join(' · ') + '</p>' : '<p class="muted">None yet.</p>') +
      '<p class="small muted">Vetoes: ' + p.legacy.vetoes + ' · Executive orders: ' + p.legacy.eos + '</p></div>';
    if (p.commitments.length) h += ui.screens.commitmentsCard(g);
    return h;
  };

  ui.screens.commitmentsCard = function (g) {
    const cm = g.player.commitments;
    return '<div class="card"><h3>Donor commitments</h3><p class="small muted">Big checks come with expectations. When a related bill reaches you, keeping your word strengthens the relationship; breaking it costs you their money — and they may fund your opponents.</p><table>' +
      cm.slice().reverse().map((c) => '<tr><td>' + esc(c.text) + '</td><td class="small muted nowrap">' + U.fmtShortDate(c.date) + '</td><td><span class="chip ' + (c.status === 'honored' ? 'good' : c.status === 'broken' ? 'bad' : '') + '">' + c.status + '</span>' + (c.resolved ? '<div class="small muted">' + esc(c.resolved.law) + '</div>' : '') + '</td></tr>').join('') + '</table></div>';
  };

  ui.screens.world = function (g) {
    const n = g.world.national, e = n.economy, ex = g.world.executives, st = PG.juris.homeState(g);
    let h = '<h1>The world</h1><div class="grid g4">' +
      kpi('GDP growth', e.growth.toFixed(1) + '%') + kpi('Unemployment', e.unemployment.toFixed(1) + '%') + kpi('Inflation', e.inflation.toFixed(1) + '%') + kpi('Fed funds rate', e.fedRate.toFixed(2) + '%') +
      kpi('Consumer sentiment', Math.round(e.sentiment)) + kpi('Local growth', (g.world.local.growth || 0).toFixed(1) + '%') + kpi('Local unemployment', (g.world.local.unemployment || 0).toFixed(1) + '%') + kpi('National environment', U.fmtLean(n.environment)) +
      '</div>';
    h += '<div class="card"><h3>Executives</h3><table>' + [['President', ex.president], ['Governor of ' + st.name, ex.governor], ['Mayor of ' + g.world.home.city.name, ex.mayor]].filter((x) => x[1]).map(([t, x]) => '<tr><td>' + esc(t) + '</td><td>' + (x.isPlayer ? '<b>You</b>' : esc(x.name)) + ' ' + ui.party(x.party) + '</td><td class="num">' + Math.round(x.approval) + '% approval</td></tr>').join('') + '</table>' +
      '<p class="small muted">The national environment is the generic-ballot lean driven by presidential approval and the economy, with the historical midterm penalty for the president\'s party. It shifts every partisan race, scaled by how nationalized the office is.</p></div>';
    h += '<div class="card"><h3>Legislatures</h3><table>' + Object.values(g.world.chambers).map((ch) => '<tr><td>' + esc(ch.name) + '</td><td>' + esc(PG.world.chamberControlSummary(ch)) + '</td><td>' + (ch.partisan ? ui.splitbar([[ch.counts.D, 'var(--dem)', 'D'], [ch.counts.R, 'var(--rep)', 'R']]) : '') + '</td></tr>').join('') + '</table></div>';
    h += '<div class="card"><h3>' + esc(st.name) + ' rules</h3><ul class="small">' +
      '<li>Primaries: ' + esc({ open: 'open', closed: 'closed', semi: 'semi-closed (independents may participate)', top2: 'top-two (all candidates on one ballot; top two advance)', top4: 'top-four primary, ranked-choice general', jungle: 'all-candidate November ballot with December runoff' }[st.primary]) + (st.runoff ? '; runoff if no one tops ' + Math.round(st.runoff * 100) + '%' : '') + '</li>' +
      '<li>Governor: ' + st.govTerm + '-year term, ' + esc({ none: 'no term limit', consec2: 'two consecutive terms', life2: 'two terms lifetime', noconsec: 'no consecutive terms' }[st.govLimit]) + (st.liv ? ', line-item veto' : ', no line-item veto') + '</li>' +
      '<li>Legislature: ' + (st.unicameral ? 'unicameral, ' + st.senateSize + ' members' : st.houseSize + ' representatives (' + st.houseTerm + '-yr terms) and ' + st.senateSize + ' senators (' + st.senateTerm + '-yr terms)') + (st.legLimit ? '; ' + st.legLimit + '-year term limits' : '; no term limits') + '; veto override ' + (st.override === 0.5 ? 'simple majority' : Math.round(st.override * 100) + '%') + '</li>' +
      '<li>Redistricting: ' + esc({ R: 'Republican legislature draws the maps', D: 'Democratic legislature draws the maps', commission: 'independent or bipartisan commission', split: 'divided control / court-drawn' }[st.redistricting]) + '</li>' +
      '<li>Mail ballots are counted ' + (st.mailLate ? 'late (results can shift toward Democrats as they come in)' : 'early') + '.</li>' +
      '<li>Individual contribution limit (statewide): ' + (st.contribLimit ? U.fmtMoney(st.contribLimit) : 'none') + '; federal races: $3,500 per election.</li></ul></div>';
    return h;
  };

  function kpi(label, val, sub, tone) { return '<div class="kpi' + (tone ? ' ' + tone : '') + '"><b>' + esc(val) + '</b><span>' + esc(label) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>'; }
  ui.kpi = kpi;
  ui.splitbar = function (parts) {
    const tot = U.sum(parts, (x) => x[0]) || 1;
    return '<div class="splitbar">' + parts.map(([v, c, l]) => '<div style="width:' + (v / tot * 100).toFixed(1) + '%;background:' + c + '">' + (v / tot > 0.08 ? esc(l + ' ' + v) : '') + '</div>').join('') + '</div>';
  };

  ui.screens.log = function (g) {
    const f = ui.drafts.logFilter || 'all';
    const types = ['all'].concat([...new Set(g.log.map((x) => x.type))]);
    const list = f === 'all' ? g.log : g.log.filter((x) => x.type === f);
    return '<h1>Log &amp; news</h1><div class="pill-tabs">' + types.map((t) => '<button class="small ' + (t === f ? 'on' : '') + '" data-cmd="logFilter" data-arg="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div>' +
      '<div class="grid g2"><div class="card"><h3>Log</h3>' + ui.logList(list, 120) + '</div><div class="card"><h3>Headlines</h3><ul class="log">' + g.news.slice(0, 60).map((x) => '<li><div class="when">' + U.fmtShortDate(x.date) + ' · ' + esc(x.outlet || '') + '</div>' + esc(x.headline) + '</li>').join('') + '</ul></div></div>';
  };
  ui.commands.logFilter = (f) => { ui.drafts.logFilter = f; ui.render(); };
})(globalThis.PG = globalThis.PG || {});
