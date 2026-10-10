/* Overlays: event choices, election night playback, generic modals, game over. */
(function (PG) {
  'use strict';
  const ui = PG.ui, U = PG.util, esc = ui.esc;

  ui.screens.eventModal = function (g) {
    const v = PG.events.view(g);
    if (!v) return '';
    return '<div class="overlay" role="dialog" aria-modal="true"><div class="modal"><p class="small muted">' + U.fmtDate(g.date) + '</p><h2>' + esc(v.title) + '</h2><p>' + esc(v.text) + '</p>' +
      v.choices.map((c) => '<button class="choice" data-act="' + ui.attr({ type: 'event.choose', i: c.i }) + '"' + (c.ok ? '' : ' disabled') + '><b>' + esc(c.label) + '</b><span>' + esc(c.hint) + '</span></button>').join('') +
      '<p class="small muted">No option is free. Consequences may surface months from now.</p></div></div>';
  };

  // ------------------------------------------------------------- election night
  ui.startNight = function () {
    clearInterval(ui.nightTimer);
    ui.nightStep = 0;
    const n = ui.game.electionNight;
    if (!n.steps) return;
    ui.nightTimer = setInterval(() => {
      if (!ui.game || !ui.game.electionNight) { clearInterval(ui.nightTimer); return; }
      if (ui.nightStep >= n.steps.length - 1) { clearInterval(ui.nightTimer); return; }
      ui.nightStep++;
      refreshNight();
    }, 850);
  };
  function refreshNight() {
    const el = document.querySelector('.overlay.night');
    if (el) el.outerHTML = ui.screens.night(ui.game); else ui.render();
  }
  ui.commands.nightSkip = () => { clearInterval(ui.nightTimer); ui.nightStep = ui.game.electionNight.steps.length - 1; refreshNight(); };

  ui.screens.night = function (g) {
    const n = g.electionNight;
    if (n.kind === 'pres_primary') return ui.screens.presPrimaryNight(g);
    if (n.kind === 'pres_general') return ui.screens.presGeneralNight(g);
    const k = Math.min(ui.nightStep, n.steps.length - 1);
    const step = n.steps[k];
    const final = k === n.steps.length - 1;
    const called = k >= n.calledAt;
    const tot = U.sum(Object.values(step.votes)) || 1;
    const cands = n.candidates.slice().sort((a, b) => step.votes[b.id] - step.votes[a.id]);
    const youWon = n.playerAdvanced;
    let h = '<div class="overlay night" role="dialog" aria-modal="true"><div class="modal wide"><p class="small muted">' + esc(U.fmtDate(n.date)) + ' · ' + esc(n.jurisdiction) + '</p><h2>Election night — ' + esc(n.title) + '</h2><p class="muted">' + esc(n.office) + '</p>';
    h += '<div class="row between"><div><b>' + esc(step.label) + '</b> · ' + ui.pct(step.pct, 0) + ' of expected vote counted</div><div>' + (called ? '<span class="bigcall ' + (youWon ? 'win' : 'lose') + '">' + esc(n.message) + '</span>' : '<span class="bigcall wait">Too early to call</span>') + '</div></div>';
    h += '<div style="margin:10px 0">' + ui.bar(step.pct, '#6e93ff') + '</div>';
    h += '<table><thead><tr><th>Candidate</th><th class="num">Votes</th><th class="num">Share</th><th style="width:40%"></th></tr></thead><tbody>' + cands.map((c) => {
      const v = step.votes[c.id], s = v / tot;
      const win = called && n.winners.includes(c.id);
      return '<tr class="' + (c.isPlayer ? 'you' : '') + '"><td>' + (win ? '✔ ' : '') + esc(c.name) + ' ' + ui.party(c.party) + (c.incumbent ? ' <span class="chip">inc.</span>' : '') + '</td><td class="num">' + Math.round(v).toLocaleString() + '</td><td class="num">' + ui.pct(s) + '</td><td>' + ui.bar(s, ui.partyColor(c.party)) + '</td></tr>';
    }).join('') + '</tbody></table>';
    if (n.mailLate && !final) h += '<p class="small muted">Mail ballots here are counted last and lean Democratic — early margins can shift.</p>';
    else if (!final) h += '<p class="small muted">Early and mail votes are counted first here; Election Day precincts follow.</p>';
    h += '<details class="box"' + (final ? ' open' : '') + '><summary>Results by region</summary><div class="tablewrap"><table><thead><tr><th>Region</th><th class="num">Counted</th>' + cands.slice(0, 4).map((c) => '<th class="num">' + esc(c.name.split(' ')[1] || c.name) + '</th>').join('') + '</tr></thead><tbody>' +
      step.regions.map((r) => { const rt = U.sum(Object.values(r.votes)) || 1; return '<tr><td>' + esc(r.name) + '</td><td class="num">' + ui.pct(r.pct, 0) + '</td>' + cands.slice(0, 4).map((c) => '<td class="num">' + ui.pct(r.votes[c.id] / rt, 0) + '</td>').join('') + '</tr>'; }).join('') + '</tbody></table></div></details>';
    if (n.rounds && n.rounds.length > 1 && final) h += '<details class="box" open><summary>Ranked-choice rounds</summary>' + n.rounds.map((r, i) => '<p class="small">Round ' + (i + 1) + ': ' + Object.entries(r).map(([id, s]) => esc((n.candidates.find((c) => c.id === id) || {}).name) + ' ' + ui.pct(s)).join(', ') + '</p>').join('') + '</details>';
    if (final) h += '<div class="card flat" style="background:transparent;border-color:#26304a"><h3>Why it happened</h3>' + ui.whyList(n.notes) + '<p class="small muted">Turnout ' + ui.pct(n.turnout, 0) + ' of eligible voters.</p></div>';
    h += '<div class="row" style="justify-content:flex-end">' + (final ? '' : ui.cbtn('Skip to final results', 'nightSkip')) + (final ? ui.btn('Continue', { type: 'election.dismiss' }, 'primary') : '') + '</div></div></div>';
    return h;
  };

  // ------------------------------------------------------------- generic modals
  ui.screens.modal = function (g) {
    const m = ui.modal;
    let body = '';
    if (m.kind === 'bill' && g.gov) body = ui.screens.billModal(g);
    else if (m.kind === 'case' && ui.screens.caseModal) body = ui.screens.caseModal(g);
    if (!body) { ui.modal = null; return ''; }
    return '<div class="overlay" role="dialog" aria-modal="true"><div class="modal wide">' + body + '</div></div>';
  };

  ui.screens.gameOver = function (g) {
    const p = g.player;
    const go = g.gameOver;
    return '<div class="overlay"><div class="modal"><h2>' + esc(p.name) + ': a career in public life</h2><p class="muted">' + esc(go.why === 'age' ? 'Time catches up with everyone.' : 'You stepped away on your own terms.') + ' ' + U.fmtDate(go.date) + '.</p>' +
      '<div class="grid g3">' + ui.kpi('Legacy score', go.score) + ui.kpi('Offices held', new Set(p.history.map((h) => h.officeId)).size) + ui.kpi('Laws championed', p.legacy.laws.length) + '</div>' +
      '<h4>Offices</h4><ul>' + p.history.map((h) => '<li>' + esc(PG.data.officeById[h.officeId].name) + ' (' + h.start.year + '–' + (h.end ? h.end.year : '') + ')</li>').join('') + '</ul>' +
      '<h4>Elections</h4><p>' + U.plural(p.legacy.elections.filter((e) => e.won).length, 'win') + ', ' + U.plural(p.legacy.elections.filter((e) => !e.won).length, 'loss', 'losses') + '</p>' +
      '<div class="row">' + ui.cbtn('Start a new career', 'newgame', undefined, 'primary') + ui.cbtn('Look around', 'dismissGameOver') + '</div></div></div>';
  };
})(globalThis.PG = globalThis.PG || {});
