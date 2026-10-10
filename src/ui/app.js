/* App shell: title screen, new-game setup, the in-game layout, settings, and boot. */
(function (PG) {
  'use strict';
  const ui = PG.ui, U = PG.util, esc = ui.esc;

  // ------------------------------------------------------------- title
  function title() {
    const s = ui.hasSave ? PG.storage.load() : null;
    return '<div class="title">' +
      '<p class="hero">Ballot &amp; Gavel</p>' +
      '<p class="tag">Run for school board. Climb to the White House. Govern like it\'s real — because the rules are.</p>' +
      '<div class="card"><div class="row">' +
      (s ? '<button class="primary" data-cmd="continue">Continue: ' + esc(s.player.name) + ' — ' + esc(U.fmtDate(s.date)) + '</button>' : '') +
      '<button class="' + (s ? '' : 'primary') + '" data-cmd="newgame">New career</button>' +
      '<button data-cmd="import">Import save file</button>' +
      '<button data-cmd="view" data-arg="reality">How this models reality</button>' +
      '</div></div>' +
      '<div class="grid g3">' +
      '<div class="card flat"><h3>Campaign</h3><p class="muted">Split your days between call time, doors and debate prep. Raise money with strings attached. Read polls with real margins of error.</p></div>' +
      '<div class="card flat"><h3>Govern</h3><p class="muted">Whip votes member by member, negotiate budgets, sign or veto, issue orders that courts may strike down.</p></div>' +
      '<div class="card flat"><h3>See why</h3><p class="muted">Every vote, poll and election shows its causes: which blocs moved, who defected, and which group lobbied against you.</p></div>' +
      '</div>' +
      '<p class="muted small">Single-player. Runs entirely in your browser. All characters are fictional. Progress autosaves locally.</p>' +
      '</div>';
  }

  // ------------------------------------------------------------- setup
  function defaultSetup() {
    return { seed: PG.rng.randomSeed(), name: '', party: 'D', background: 'teacher', traits: [], homeState: 'PA', cityType: 'suburban', cityName: '',
      age: 32, difficulty: 'normal', startYear: 2027, ideology: { econ: -30, social: -30 } };
  }

  function ideologyLabel(v) {
    const a = Math.abs(v);
    const side = v < 0 ? 'left' : 'right';
    if (a < 12) return 'centrist';
    if (a < 35) return 'center-' + side;
    if (a < 65) return side === 'left' ? 'progressive' : 'conservative';
    return side === 'left' ? 'far left' : 'far right';
  }

  function setup() {
    const d = ui.drafts.setup || (ui.drafts.setup = defaultSetup());
    const states = PG.data.states.slice().sort((a, b) => a.name.localeCompare(b.name));
    const st = PG.data.stateById[d.homeState];
    const bg = PG.data.backgroundById[d.background];
    ui.liveHooks.push(() => {
      const e = document.getElementById('econLbl'), s = document.getElementById('socLbl');
      if (e) e.textContent = Math.round(d.ideology.econ) + ' (' + ideologyLabel(d.ideology.econ) + ')';
      if (s) s.textContent = Math.round(d.ideology.social) + ' (' + ideologyLabel(d.ideology.social) + ')';
    });
    const traitHtml = PG.data.traits.map((t) => '<label class="check"><input type="checkbox" data-cmd="trait" data-arg="' + t.id + '"' + (d.traits.includes(t.id) ? ' checked' : '') + '><span><b>' + esc(t.name) + '</b><br><span class="muted small">' + esc(t.desc) + '</span></span></label>').join('');
    return '<div class="setup">' +
      '<div class="row between"><h1>New career</h1><button data-cmd="home">← Back</button></div>' +
      '<div class="card"><div class="grid g3">' +
      '<div class="field"><label>Seed <span class="muted">(same seed + same choices = same game)</span></label><div class="row"><input data-bind="setup.seed" value="' + esc(d.seed) + '" style="flex:1"><button data-cmd="reseed">🎲</button></div><p class="small muted">Current seed: <span class="seed">' + esc(d.seed) + '</span></p></div>' +
      '<div class="field"><label>Difficulty</label><select data-bind="setup.difficulty" data-rerender>' + Object.entries(PG.data.difficulty).map(([k, v]) => '<option value="' + k + '"' + (d.difficulty === k ? ' selected' : '') + '>' + v.name + '</option>').join('') + '</select><p class="small muted">' + esc(PG.data.difficulty[d.difficulty].desc) + ' Same rules at every level.</p></div>' +
      '<div class="field"><label>Start year</label><input type="number" min="2025" max="2040" data-bind="setup.startYear" value="' + d.startYear + '"></div>' +
      '</div></div>' +
      '<div class="card"><h2>Who are you?</h2><div class="grid g3">' +
      '<div class="field"><label>Name</label><input data-bind="setup.name" placeholder="Your name" value="' + esc(d.name) + '" maxlength="40"></div>' +
      '<div class="field"><label>Age</label><input type="number" min="18" max="70" data-bind="setup.age" value="' + d.age + '"><p class="small muted">Offices have minimum ages (House 25, Senate 30, President 35).</p></div>' +
      '<div class="field"><label>Party</label><select data-bind="setup.party" data-rerender>' + ['D', 'R', 'I', 'L', 'G'].map((p) => '<option value="' + p + '"' + (d.party === p ? ' selected' : '') + '>' + PG.data.parties[p].name + '</option>').join('') + '</select>' +
      (d.party !== 'D' && d.party !== 'R' ? '<p class="small warn">Outside the two major parties you skip primaries but must petition onto partisan ballots and fight the wasted-vote problem. Local races are nonpartisan.</p>' : '') + '</div>' +
      '<div class="field"><label>Background</label><select data-bind="setup.background" data-rerender>' + PG.data.backgrounds.map((b) => '<option value="' + b.id + '"' + (d.background === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select><p class="small muted">' + esc(bg.desc) + '</p></div>' +
      '<div class="field"><label>Home state</label><select data-bind="setup.homeState" data-rerender>' + states.map((s) => '<option value="' + s.id + '"' + (d.homeState === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select><p class="small muted">Lean ' + U.fmtLean(st.lean) + ' · ' + st.ev + ' electoral votes · ' + ({ open: 'open', closed: 'closed', semi: 'semi-closed', top2: 'top-two', top4: 'top-four + ranked-choice', jungle: 'jungle (all-candidate)' }[st.primary]) + ' primaries' + (st.isDC ? ' · no state offices or senators' : '') + '</p></div>' +
      '<div class="field"><label>Hometown</label><select data-bind="setup.cityType" data-rerender' + (st.isDC ? ' disabled' : '') + '>' + [['urban', 'Big city'], ['suburban', 'Suburb'], ['smalltown', 'Small town'], ['rural', 'Rural county seat']].map(([k, v]) => '<option value="' + k + '"' + (d.cityType === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select>' +
      '<input data-bind="setup.cityName" placeholder="Town name (optional)" value="' + esc(d.cityName) + '" maxlength="30" style="margin-top:6px;width:100%"' + (st.isDC ? ' disabled' : '') + '></div>' +
      '</div></div>' +
      '<div class="card"><h2>Where do you stand?</h2><p class="muted small">Your starting worldview. Policy rollouts and votes will move it. Primary voters reward distance from the center; general-election voters punish it.</p><div class="grid g2">' +
      '<div class="field"><label>Economic: <span id="econLbl"></span></label><input type="range" min="-90" max="90" data-bind="setup.ideology.econ" value="' + d.ideology.econ + '"><div class="row between small muted"><span>Government-led</span><span>Market-led</span></div></div>' +
      '<div class="field"><label>Social: <span id="socLbl"></span></label><input type="range" min="-90" max="90" data-bind="setup.ideology.social" value="' + d.ideology.social + '"><div class="row between small muted"><span>Progressive</span><span>Traditional</span></div></div>' +
      '</div><button class="small" data-cmd="partyNorm">Snap to party mainstream</button></div>' +
      '<div class="card"><h2>Traits <span class="muted small">(choose up to 3 — each has a cost)</span></h2><div class="grid g3">' + traitHtml + '</div></div>' +
      '<div class="row"><button class="primary" data-cmd="start">Begin career</button><span class="muted small">Seed <span class="seed">' + esc(d.seed) + '</span></span></div>' +
      '</div>';
  }

  // ------------------------------------------------------------- layout
  function tabsFor(g) {
    const t = [];
    const badge = {};
    if (g.campaign) {
      t.push(['campaign', 'Campaign'], ['race', 'The race'], ['polls', 'Polls'], ['money', 'Money'], ['voters', 'Voters']);
      if (g.campaign.officeId === 'president') t.splice(1, 0, ['map', 'Map & delegates']);
    }
    if (g.gov) {
      const gv = g.gov;
      t.push(['office', 'Office']);
      t.push(['legislature', gv.kind === 'executive' ? 'Legislation' : 'Legislature']);
      t.push(['budget', 'Budget']);
      if (gv.kind === 'executive') t.push(['executive', 'Executive']);
      t.push(['groups', 'Groups & press']);
      t.push(['courts', 'Courts']);
      const votes = gv.docket.filter((d) => { const b = gv.bills.find((x) => x.id === d.billId); return b && PG.leg.isPlayerChamber(g, d.chamber) && b.playerVote === null; }).length;
      badge.legislature = votes + (gv.desk ? gv.desk.length : 0);
      badge.budget = gv.budgetStage === 'drafting' || gv.budgetStage === 'counter' ? 1 : 0;
      badge.office = gv.decision === 'pending' ? 1 : 0;
      if (gv.kind === 'executive') badge.executive = Object.values(gv.cabinet).filter((x) => !x).length;
      if (g.courts) badge.courts = (g.courts.vacancies || []).filter((v) => v.playerAppoints).length;
    }
    if (!g.campaign) t.unshift(['career', 'Career']);
    t.push(['world', 'World'], ['profile', 'Profile'], ['log', 'Log & news'], ['settings', 'Save & settings'], ['reality', 'How it works']);
    return { tabs: t, badge };
  }

  function topbar(g) {
    const p = g.player;
    const o = p.office ? PG.data.officeById[p.office.officeId] : null;
    const role = o ? o.name + (g.campaign ? ' · running for ' + PG.data.officeById[g.campaign.officeId].short : '') : g.campaign ? 'Candidate for ' + PG.data.officeById[g.campaign.officeId].name : g.phase === 'gameover' ? 'Retired' : 'Private citizen';
    const stats = [];
    stats.push(['Date', U.fmtShortDate(g.date)]);
    stats.push(['Age', U.age(g)]);
    if (g.campaign) {
      const pc = PG.campaign.playerCand(g);
      stats.push(['Cash', U.fmtMoney(pc.cash)]);
      const lp = g.campaign.polls.find((x) => x.stage === g.campaign.stage);
      if (lp) stats.push(['Last poll', lp.results.player.toFixed(0) + '%']);
      stats.push(['Name rec', Math.round(pc.nameRec)]);
    } else stats.push(['War chest', U.fmtMoney(p.cash)]);
    if (g.gov) { stats.push(['Approval', g.gov.approval.overall.toFixed(0) + '%']); stats.push(['Capital', Math.round(p.capital)]); }
    return '<header class="topbar"><div><div class="who">' + esc(p.name) + ' ' + ui.party(p.party) + '</div><div class="small muted">' + esc(role) + '</div></div>' +
      stats.map(([k, v]) => '<div class="stat"><b>' + esc(v) + '</b><span>' + esc(k) + '</span></div>').join('') +
      '<div class="spacer"></div><button class="small" data-cmd="theme" title="Toggle dark mode">◐</button></header>';
  }

  function side(g) {
    let h = '';
    const n = g.world.national, e = n.economy, pr = g.world.executives.president;
    h += '<div class="card flat"><h4>National picture</h4><div class="small">President ' + esc(pr.isPlayer ? 'you' : pr.name) + ' ' + ui.party(pr.party) + ' — ' + Math.round(pr.approval) + '% approval<br>' +
      'Environment: <b>' + U.fmtLean(n.environment) + '</b> <span class="muted">(generic ballot)</span><br>' +
      'Growth ' + e.growth.toFixed(1) + '% · Unemployment ' + e.unemployment.toFixed(1) + '% · Inflation ' + e.inflation.toFixed(1) + '%' + (e.recession ? ' · <b class="bad">Recession</b>' : '') + '</div></div>';
    h += '<div class="card flat"><h4>What just happened</h4>' + ui.logList(g.log, 8) + '</div>';
    h += '<div class="card flat"><h4>Headlines</h4><ul class="log">' + g.news.slice(0, 5).map((x) => '<li><div class="when">' + U.fmtShortDate(x.date) + ' · ' + esc(x.outlet || '') + '</div>' + esc(x.headline) + '</li>').join('') + '</ul></div>';
    return h;
  }

  function actionbar(g) {
    const blocker = PG.game.blockers(g);
    let msg = '';
    let buttons = '';
    if (g.phase === 'gameover') { msg = 'Career complete.'; buttons = ui.cbtn('New career', 'newgame', undefined, 'primary'); }
    else if (g.phase === 'career') {
      const d = g.player.declared;
      msg = d ? 'Declared for ' + PG.data.officeById[d.officeId].name + '. Campaign begins ' + U.fmtDate(d.campaignStart) + '.' : 'Choose a race on the Career tab, or let time pass.';
      buttons = (d ? ui.btn('Skip to campaign ▸▸', { type: 'career.fastForward' }, 'primary') : ui.btn('Skip 12 months ▸▸', { type: 'career.fastForward', months: 12 })) + ui.btn('Next month ▸', { type: 'endMonth' }, d ? '' : 'primary');
    } else {
      const gv = g.gov;
      const notes = [];
      if (g.campaign) {
        const c = g.campaign;
        const d = PG.campaign.stageDate(g, c.stage);
        if (d) notes.push(stageName(c.stage) + ' in ' + U.plural(Math.max(0, U.monthsBetween(g.date, d)), 'month') + ' (' + U.fmtShortDate(d) + ')');
      }
      if (gv) {
        const votes = gv.docket.filter((x) => { const b = gv.bills.find((y) => y.id === x.billId); return b && PG.leg.isPlayerChamber(g, x.chamber) && b.playerVote === null; }).length;
        if (votes) notes.push(votes + ' floor vote(s) need your decision — unset votes follow your party');
        if (gv.desk && gv.desk.length) notes.push(gv.desk.length + ' bill(s) on your desk');
        if (gv.budgetStage === 'drafting') notes.push('Budget proposal due');
        if (gv.budgetStage === 'counter') notes.push('Respond to the budget counteroffer');
        if (gv.decision === 'pending') notes.push('Decide whether to seek reelection');
      }
      msg = notes.join(' · ');
      buttons = ui.btn('End month ▸', { type: 'endMonth' }, 'primary', { disabled: !!blocker });
    }
    return '<footer class="actionbar"><div class="msg">' + esc(msg) + '</div>' + buttons + '</footer>';
  }

  function stageName(s) { return { primary: 'Primary', runoff: 'Primary runoff', general: 'General election', general_runoff: 'Runoff', pres_primary: 'Primaries', convention: 'Convention' }[s] || s; }
  ui.stageName = stageName;

  function gameLayout() {
    const g = ui.game;
    const { tabs, badge } = tabsFor(g);
    if (!ui.tab || !tabs.some((t) => t[0] === ui.tab)) ui.tab = tabs[0][0];
    const screen = ui.screens[ui.tab];
    let body;
    try { body = screen ? screen(g) : '<p>Missing screen ' + esc(ui.tab) + '</p>'; } catch (e) { console.error(e); body = '<div class="card danger"><h3>Display error</h3><pre class="small">' + esc(e.stack) + '</pre></div>'; }
    let overlays = '';
    if (g.electionNight) overlays = ui.screens.night(g);
    else if (g.events.active) overlays = ui.screens.eventModal(g);
    else if (ui.modal) overlays = ui.screens.modal(g);
    else if (g.phase === 'gameover' && !ui.dismissedGameOver) overlays = ui.screens.gameOver(g);
    return '<div class="shell">' + topbar(g) +
      '<nav class="nav" aria-label="Sections">' + tabs.map(([id, label]) => '<button class="' + (ui.tab === id ? 'on' : '') + '" data-cmd="tab" data-arg="' + id + '">' + esc(label) + (badge[id] ? '<span class="badge">' + badge[id] + '</span>' : '') + '</button>').join('') + '</nav>' +
      '<main class="main">' + body + '</main><aside class="side">' + side(g) + '</aside>' + actionbar(g) + '</div>' + overlays;
  }

  ui.screens.root = function () {
    if (ui.view === 'setup') return setup();
    if (ui.view === 'reality') return '<div class="setup"><div class="row between"><h1>How this models reality</h1><button data-cmd="home">← Back</button></div>' + ui.screens.realityBody() + '</div>';
    if (ui.view === 'game' && ui.game) return gameLayout();
    return title();
  };

  // ------------------------------------------------------------- settings
  ui.screens.settings = function (g) {
    const d = PG.data.difficulty[g.difficulty];
    return '<h1>Save &amp; settings</h1>' +
      '<div class="card"><h3>This game</h3><p>Seed <span class="seed">' + esc(g.seed) + '</span> · Difficulty <b>' + esc(d.name) + '</b> · Started ' + esc(String(g.date.year - Math.floor(g.stats.months / 12))) + ' · ' + U.plural(g.stats.months, 'month') + ' played</p>' +
      '<p class="small muted">The game autosaves in this browser after every action. Export a file to keep a backup or move to another device.</p>' +
      '<div class="row"><button class="primary" data-cmd="export">Export save (.json)</button><button data-cmd="import">Import save</button><button class="danger" data-cmd="deleteSave">Delete autosave</button><button data-cmd="home">Title screen</button></div></div>' +
      '<div class="card"><h3>Display</h3><button data-cmd="theme">Toggle light / dark</button></div>' +
      '<div class="card"><h3>Difficulty</h3><p class="muted">' + esc(d.desc) + '</p><p class="small muted">Difficulty changes tuning (poll noise, opponent quality, scandal frequency, how hard bad news hits, starting money, election-day error, political capital) — never the rules.</p></div>';
  };

  ui.screens.reality = function () { return '<h1>How this models reality</h1>' + ui.screens.realityBody(); };

  // ------------------------------------------------------------- commands
  const C = ui.commands;
  C.home = () => { ui.view = 'title'; ui.modal = null; ui.hasSave = !!PG.storage.load(); ui.render(); };
  C.newgame = () => { ui.view = 'setup'; ui.drafts.setup = defaultSetup(); ui.render(); };
  C.view = (v) => { ui.view = v; ui.render(); };
  C.continue = () => { const s = PG.storage.load(); if (s) { ui.game = s; ui.view = 'game'; ui.tab = null; if (s.electionNight) ui.startNight(); ui.render(); } };
  C.reseed = () => { ui.drafts.setup.seed = PG.rng.randomSeed(); ui.render(); };
  C.trait = (id) => {
    const d = ui.drafts.setup;
    if (d.traits.includes(id)) d.traits = d.traits.filter((x) => x !== id);
    else if (d.traits.length < 3) d.traits.push(id);
    else ui.toast('Choose at most three traits.');
    ui.render();
  };
  C.partyNorm = () => { const d = ui.drafts.setup; const n = PG.voters.partyNorm(d.party); d.ideology = { econ: n.econ, social: n.social }; ui.render(); };
  C.start = () => {
    const d = ui.drafts.setup;
    if (!d.name.trim()) { ui.toast('Give your candidate a name.'); return; }
    ui.game = PG.game.newGame(d);
    ui.view = 'game'; ui.tab = 'career'; ui.dismissedGameOver = false;
    PG.storage.autosave(ui.game);
    ui.render();
  };
  C.tab = (t) => ui.goTab(t);
  C.theme = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const dark = cur ? cur === 'dark' : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('bg-theme', next); } catch (e) { /* ignore */ }
  };
  C.export = () => { if (ui.game) PG.storage.exportFile(ui.game); };
  C.import = () => PG.storage.importFile((err, s) => {
    if (err) { ui.toast('Import failed: ' + err.message); ui.render(); return; }
    ui.game = s; ui.view = 'game'; ui.tab = null; PG.storage.autosave(s); ui.toast('Save loaded.'); ui.render();
  });
  C.deleteSave = () => { if (window.confirm('Delete the autosave in this browser? (Exported files are unaffected.)')) { PG.storage.clear(); ui.hasSave = false; ui.toast('Autosave deleted.'); ui.render(); } };
  C.closeModal = () => { ui.modal = null; ui.render(); };
  C.dismissGameOver = () => { ui.dismissedGameOver = true; ui.render(); };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui.boot); else setTimeout(ui.boot, 0);
  }
})(globalThis.PG = globalThis.PG || {});
