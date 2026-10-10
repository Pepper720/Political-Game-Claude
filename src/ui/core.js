/* UI core: state holder, rendering loop, event delegation, toasts, and helpers.
 * Screens register in PG.ui.screens and return HTML strings. */
(function (PG) {
  'use strict';
  const U = PG.util;

  const ui = PG.ui = {
    game: null,            // the engine state
    view: 'title',         // title | setup | game | reality
    tab: null,             // current tab in the game view
    modal: null,           // { kind, ... } UI-only modals (bill detail, confirm)
    drafts: {},            // form drafts (campaign plan, budget, setup)
    screens: {},
    toastMsg: null,
    nightStep: 0,
    nightTimer: null,
  };

  // ------------------------------------------------------------- helpers
  ui.esc = function (s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
  ui.attr = function (obj) { return ui.esc(JSON.stringify(obj)); };
  ui.btn = function (label, action, cls, opts) {
    opts = opts || {};
    return '<button class="' + (cls || '') + '" data-act="' + ui.attr(action) + '"' + (opts.disabled ? ' disabled' : '') + (opts.title ? ' title="' + ui.esc(opts.title) + '"' : '') + '>' + label + '</button>';
  };
  ui.cbtn = function (label, cmd, arg, cls, opts) {
    opts = opts || {};
    return '<button class="' + (cls || '') + '" data-cmd="' + ui.esc(cmd) + '"' + (arg !== undefined ? ' data-arg="' + ui.esc(typeof arg === 'string' ? arg : JSON.stringify(arg)) + '"' : '') + (opts.disabled ? ' disabled' : '') + (opts.title ? ' title="' + ui.esc(opts.title) + '"' : '') + '>' + label + '</button>';
  };
  ui.party = function (p) { return '<span class="chip ' + ui.esc(p) + '">' + ui.esc((PG.data.parties[p] || PG.data.parties.I).short) + '</span>'; };
  ui.partyColor = function (p) { return p === 'D' ? 'var(--dem)' : p === 'R' ? 'var(--rep)' : 'var(--ind)'; };
  ui.pct = function (x, d) { return (x * 100).toFixed(d === undefined ? 1 : d) + '%'; };
  ui.signed = function (x, d) { const v = U.round(x, d === undefined ? 1 : d); return '<span class="' + (v > 0 ? 'good' : v < 0 ? 'bad' : 'muted') + '">' + (v > 0 ? '+' : '') + v + '</span>'; };
  ui.bar = function (frac, color) { return '<div class="bar"><i style="width:' + U.clamp(frac * 100, 0, 100).toFixed(1) + '%;' + (color ? 'background:' + color : '') + '"></i></div>'; };
  ui.centerBar = function (v, max, neutral) {
    const f = U.clamp(v / max, -1, 1) * 50;
    const pos = neutral ? 'var(--ink-2)' : 'var(--good)', neg = neutral ? 'var(--ink-2)' : 'var(--bad)';
    const style = f >= 0 ? 'left:50%;width:' + f + '%;background:' + pos : 'left:' + (50 + f) + '%;width:' + (-f) + '%;background:' + neg;
    return '<div class="bar"><span class="mid"></span><i style="' + style + '"></i></div>';
  };
  ui.whyList = function (lines) { return lines && lines.length ? '<ul class="why">' + lines.map((l) => '<li>' + ui.esc(l) + '</li>').join('') + '</ul>' : ''; };
  ui.date = function (d) { return U.fmtDate(d); };
  ui.blocName = function (id) { return PG.data.blocById[id] ? PG.data.blocById[id].name : id; };

  // Simple SVG line chart. series: [{ name, color, points: [[x, y], ...] }]
  ui.lineChart = function (series, opts) {
    opts = opts || {};
    const W = 600, H = opts.height || 180, P = { l: 34, r: 10, t: 10, b: 22 };
    const xs = [], ys = [];
    series.forEach((s) => s.points.forEach((p) => { xs.push(p[0]); ys.push(p[1]); }));
    if (!xs.length) return '<p class="muted">No data yet.</p>';
    let x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    if (x0 === x1) { x0 -= 1; x1 += 1; }
    let y0 = opts.yMin !== undefined ? opts.yMin : Math.min.apply(null, ys), y1 = opts.yMax !== undefined ? opts.yMax : Math.max.apply(null, ys);
    if (y0 === y1) { y0 -= 5; y1 += 5; }
    const X = (x) => P.l + (x - x0) / (x1 - x0) * (W - P.l - P.r);
    const Y = (y) => H - P.b - (y - y0) / (y1 - y0) * (H - P.t - P.b);
    let g = '<g class="grid">';
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const yv = y0 + (y1 - y0) * i / ticks;
      g += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + Y(yv) + '" y2="' + Y(yv) + '"/><text x="2" y="' + (Y(yv) + 4) + '">' + Math.round(yv) + (opts.suffix || '') + '</text>';
    }
    if (opts.ref !== undefined) g += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + Y(opts.ref) + '" y2="' + Y(opts.ref) + '" stroke-dasharray="4 4" style="stroke:var(--muted)"/>';
    g += '</g>';
    if (opts.xLabel) g += '<text x="' + P.l + '" y="' + (H - 4) + '">' + ui.esc(opts.xLabel[0]) + '</text><text x="' + (W - P.r) + '" y="' + (H - 4) + '" text-anchor="end">' + ui.esc(opts.xLabel[1]) + '</text>';
    const paths = series.map((s) => {
      const d = s.points.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
      const dots = s.points.length < 30 ? s.points.map((p) => '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="2.5" fill="' + s.color + '"/>').join('') : '';
      return '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2.2"/>' + dots;
    }).join('');
    const legend = series.length > 1 ? '<div class="legend">' + series.map((s) => '<span><span class="dot" style="background:' + s.color + '"></span>' + ui.esc(s.name) + '</span>').join('') + '</div>' : '';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + ui.esc(opts.label || 'chart') + '">' + g + paths + '</svg>' + legend;
  };

  ui.logList = function (entries, limit) {
    if (!entries.length) return '<p class="muted">Nothing yet.</p>';
    return '<ul class="log">' + entries.slice(0, limit || 30).map((e) => '<li><div class="when">' + U.fmtShortDate(e.date) + ' · ' + ui.esc(e.type) + '</div>' + ui.esc(e.text) +
      (e.causes ? '<details><summary>Why?</summary><ul>' + e.causes.map((c) => '<li>' + ui.esc(c) + '</li>').join('') + '</ul></details>' : '') + '</li>').join('') + '</ul>';
  };

  ui.toast = function (msg) {
    ui.toastMsg = msg;
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(() => { ui.toastMsg = null; const t = document.querySelector('.toast'); if (t) t.remove(); }, 3800);
  };

  // ------------------------------------------------------------- actions
  ui.act = function (action) {
    if (!ui.game) return;
    const r = PG.game.act(ui.game, action);
    if (r && r.msg && (action.type !== 'endMonth' || !r.ok)) ui.toast(r.msg);
    if (r && r.error) console.error(r.error);
    if (action.type === 'endMonth' || action.type === 'career.fastForward') { ui.drafts.plan = null; ui.drafts.budget = null; }
    PG.storage.autosave(ui.game);
    if (ui.game.electionNight) ui.startNight();
    ui.render();
    return r;
  };

  ui.cmd = function (name, arg) {
    const f = ui.commands[name];
    if (!f) { console.warn('Unknown command', name); return; }
    f(arg);
  };
  ui.commands = {};

  // Inputs bound to drafts: data-bind="plan.days.retail" (numbers auto-cast).
  function setPath(obj, path, val) {
    const ks = path.split('.');
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] === undefined || o[ks[i]] === null) o[ks[i]] = {}; o = o[ks[i]]; }
    o[ks[ks.length - 1]] = val;
  }

  ui.liveHooks = [];
  ui.runLive = function () { for (const f of ui.liveHooks) try { f(); } catch (e) { console.error(e); } };

  // ------------------------------------------------------------- render
  ui.render = function () {
    const root = document.getElementById('app');
    const main = root.querySelector('.main');
    const scroll = main ? main.scrollTop : 0;
    const winScroll = window.scrollY;
    ui.liveHooks = [];
    let html;
    try {
      html = ui.screens.root();
    } catch (e) {
      console.error(e);
      html = '<div class="title"><h1>Something went wrong</h1><pre>' + ui.esc(e.stack || e) + '</pre><button data-cmd="home">Back to title</button></div>';
    }
    if (ui.toastMsg) html += '<div class="toast" role="status">' + ui.esc(ui.toastMsg) + '</div>';
    root.innerHTML = html;
    const m2 = root.querySelector('.main');
    if (m2) m2.scrollTop = scroll;
    if (ui.keepScroll) window.scrollTo(0, winScroll); else window.scrollTo(0, ui.scrollTarget || winScroll);
    ui.keepScroll = true; ui.scrollTarget = 0;
    ui.runLive();
  };

  ui.goTab = function (tab) { ui.tab = tab; ui.modal = null; ui.keepScroll = false; ui.scrollTarget = 0; ui.render(); };

  function onClick(ev) {
    const t = ev.target.closest('[data-act],[data-cmd]');
    if (!t || t.disabled) return;
    if (t.hasAttribute('data-act')) {
      ev.preventDefault();
      ui.act(JSON.parse(t.getAttribute('data-act')));
    } else {
      ev.preventDefault();
      const a = t.getAttribute('data-arg');
      let arg = a;
      if (a && (a[0] === '{' || a[0] === '[')) { try { arg = JSON.parse(a); } catch (e) { /* keep string */ } }
      ui.cmd(t.getAttribute('data-cmd'), arg);
    }
  }

  function onInput(ev) {
    const t = ev.target;
    const path = t.getAttribute && t.getAttribute('data-bind');
    if (!path) return;
    let v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.type === 'number' || t.type === 'range' || t.getAttribute('data-num') !== null) v = Number(v);
    setPath(ui.drafts, path, v);
    if (t.hasAttribute('data-rerender')) ui.render(); else ui.runLive();
  }

  ui.boot = function () {
    const root = document.getElementById('app');
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && ui.modal) { ui.modal = null; ui.render(); }
    });
    const saved = PG.storage.load();
    ui.hasSave = !!saved;
    try { const th = localStorage.getItem('bg-theme'); if (th) document.documentElement.setAttribute('data-theme', th); } catch (e) { /* ignore */ }
    ui.render();
  };
})(globalThis.PG = globalThis.PG || {});
