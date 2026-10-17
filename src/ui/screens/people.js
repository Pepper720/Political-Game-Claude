/* People: your phone (asks that expire), storylines in progress, the Rolodex of
 * recurring characters, and the Wire. Also the shared avatar and wire-feed helpers. */
(function (PG) {
  'use strict';
  const ui = PG.ui, U = PG.util, esc = ui.esc;

  function hue(name) { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; }
  ui.avatar = function (name, icon, size) {
    const init = String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    return '<span class="avatar' + (size ? ' ' + size : '') + '" style="--av:' + hue(name) + '" aria-hidden="true">' + esc(init) + (icon ? '<i>' + icon + '</i>' : '') + '</span>';
  };
  ui.relChip = function (rel) {
    const cls = rel >= 30 ? 'good' : rel <= -12 ? 'bad' : '';
    return '<span class="chip rel ' + cls + '" title="Relationship ' + Math.round(rel) + '">' + esc(PG.cast.label(rel)) + ' ' + (rel > 0 ? '+' : '') + Math.round(rel) + '</span>';
  };

  ui.wireList = function (g, n) {
    const items = (g.wire || []).slice(0, n);
    if (!items.length) return '<p class="muted small">Quiet for now. Give it a month.</p>';
    return '<ul class="wire">' + items.map((w) => {
      const when = '<span class="when">' + U.fmtShortDate(w.date) + '</span>';
      if (w.kind === 'social') return '<li class="social">' + when + '<b>' + esc(w.who) + '</b> ' + esc(w.text) + '</li>';
      if (w.kind === 'quote') return '<li class="quote">' + when + ui.avatar(w.who, null, 'xs') + '<span><b>' + esc(w.who) + '</b> <span class="muted small">' + esc(w.title || '') + '</span><br>' + esc(w.text) + '</span></li>';
      if (w.kind === 'gossip') return '<li class="gossip">' + when + '🍸 <i>' + esc(w.text) + '</i></li>';
      if (w.kind === 'story') return '<li class="story">' + when + '📖 ' + esc(w.text) + '</li>';
      return '<li class="headline">' + when + '<span class="outlet">' + esc(w.who || 'News') + '</span> ' + esc(w.text) + '</li>';
    }).join('') + '</ul>';
  };

  // Lines for the morning memo / briefings.
  ui.peopleTips = function (g) {
    const tips = [];
    if (!g.cast) return tips;
    const n = (g.inbox || []).length;
    if (n) tips.push(['📱', n + ' call' + (n === 1 ? '' : 's') + ' waiting on the People tab. Unanswered calls expire — and people remember being ignored.']);
    const act = PG.arcs.summary(g).active;
    for (const a of act.slice(0, 1)) tips.push([a.icon, a.title + ' is still developing. ' + (a.nextIn <= 1 ? 'Expect news soon.' : 'Next development in a few months.')]);
    const C = g.cast;
    if (C.chief.rel < 0) tips.push(['🕳️', 'Morale in your own office is bad (' + C.chief.name + ' is ' + PG.cast.label(C.chief.rel).toLowerCase() + '). Unhappy staff leak.']);
    if (C.investigator.rel < -35) tips.push(['🔎', C.investigator.name + ' is digging. Hostile press makes every scandal bigger.']);
    if (C.activist.rel < -20 && g.gov) tips.push(['✊', C.activist.name + ' is turning your base against you — a primary challenge gets likelier.']);
    return tips;
  };

  function memoHeader(g, title) {
    const c = g.cast && g.cast.chief;
    if (!c) return '<h3>' + esc(title) + '</h3>';
    return '<div class="memo-head">' + ui.avatar(c.name, '🗂️', 'sm') + '<div><h3>' + esc(title) + '</h3><span class="small muted">from ' + esc(c.name) + ', ' + esc(PG.cast.title(g, 'chief').toLowerCase()) + '</span></div></div>';
  }
  ui.memoHeader = memoHeader;

  // ----------------------------------------------------------------- screen
  const VIEWS = [['phone', '📱 Phone'], ['stories', '📖 Storylines'], ['rolodex', '🗂️ Rolodex'], ['wire', '📰 The Wire']];
  ui.commands.peopleView = (v) => { ui.drafts.peopleView = v; ui.render(); };
  ui.commands.wireMore = () => { ui.drafts.peopleView = 'wire'; ui.goTab('people'); };

  ui.screens.people = function (g) {
    PG.cast.ensure(g);
    const v = ui.drafts.peopleView || 'phone';
    const n = g.inbox.length;
    let h = '<div class="hero" style="--hero:var(--accent)"><div><p class="eyebrow">Your political life</p><h1>People</h1><p>Everyone here remembers what you did. Relationships change what they do for you — and to you.</p></div>' +
      '<div class="hero-stat"><b>' + n + '</b><span>calls waiting</span></div></div>';
    h += '<div class="pill-tabs">' + VIEWS.map(([id, label]) => '<button class="small ' + (id === v ? 'on' : '') + '" data-cmd="peopleView" data-arg="' + id + '">' + esc(label) + (id === 'phone' && n ? ' <span class="badge">' + n + '</span>' : '') + '</button>').join('') + '</div>';
    if (v === 'phone') h += phone(g) + storiesActive(g);
    else if (v === 'stories') h += storiesActive(g) + storiesDone(g);
    else if (v === 'rolodex') h += rolodex(g);
    else h += '<div class="card"><h3>📰 The Wire</h3><p class="small muted">What people are saying — social posts, overheard gossip, quotes and headlines. It reacts to what is actually happening in your game.</p>' + ui.wireList(g, 60) + '</div>';
    return h;
  };

  function phone(g) {
    if (!g.inbox.length) return '<div class="card"><h3>📱 Phone</h3><p class="muted">No messages. Enjoy it — it never lasts.</p></div>';
    return '<div class="card"><h3>📱 Phone</h3><p class="small muted">Calls don\'t stop the clock, but they expire. Not answering is also an answer.</p><div class="calls">' + g.inbox.map((it) => {
      const v = PG.cast.askView(g, it);
      return '<div class="call">' + ui.avatar(v.who.name, PG.cast.role(v.from).icon) + '<div class="body"><div class="row between"><div><b>' + esc(v.who.name) + '</b> <span class="small muted">' + esc(v.title) + '</span></div>' + ui.relChip(v.who.rel) + '</div>' +
        '<p>' + esc(v.text) + '</p><div class="row">' + v.options.map((o) => ui.btn(o.label, { type: 'phone.answer', uid: v.uid, i: o.i }, 'small')) + '</div>' +
        '<p class="small ' + (v.monthsLeft <= 1 ? 'bad' : 'muted') + '">' + (v.monthsLeft <= 1 ? 'Goes to voicemail at the end of this month.' : 'Expires in ' + v.monthsLeft + ' months.') + '</p></div></div>';
    }).join('') + '</div></div>';
  }

  function storiesActive(g) {
    const s = PG.arcs.summary(g);
    if (!s.active.length) return '<div class="card"><h3>📖 Storylines in progress</h3><p class="muted small">Nothing is brewing. Something always is, eventually.</p></div>';
    return '<div class="card"><h3>📖 Storylines in progress</h3><div class="stories">' + s.active.map((a) => '<div class="story">' +
      '<div class="row between"><b>' + a.icon + ' ' + esc(a.title) + '</b><span class="chip">' + (a.nextIn <= 1 ? 'developing now' : 'next chapter in a few months') + '</span></div>' +
      '<p class="small muted">' + esc(a.blurb) + ' Started ' + U.fmtShortDate(a.started) + '.</p>' +
      (a.history.length ? '<ol class="chapters">' + a.history.map((h) => '<li><span class="when">' + U.fmtShortDate(h.date) + '</span> ' + esc(h.text) + '</li>').join('') + '</ol>' : '') + '</div>').join('') + '</div></div>';
  }

  function storiesDone(g) {
    const s = PG.arcs.summary(g);
    if (!s.done.length) return '';
    return '<div class="card"><h3>📚 How past stories ended</h3><div class="stories">' + s.done.map((a) => '<div class="story done"><b>' + (a.icon || '📖') + ' ' + esc(a.title) + '</b> <span class="small muted">' + U.fmtShortDate(a.date) + '</span>' +
      '<p>' + esc(a.outcome) + '</p>' + (a.history && a.history.length ? '<details><summary class="small">Chapters (' + a.history.length + ')</summary><ol class="chapters">' + a.history.map((h) => '<li><span class="when">' + U.fmtShortDate(h.date) + '</span> ' + esc(h.text) + '</li>').join('') + '</ol></details>' : '') + '</div>').join('') + '</div></div>';
  }

  function rolodex(g) {
    const groups = [['staff', 'Your team'], ['press', 'The press'], ['money', 'Money & party'], ['leader', 'Community leaders'], ['rival', 'Rivals & friends']];
    const kindOf = (r) => (r.kind === 'party' ? 'money' : r.kind === 'friend' ? 'rival' : r.kind);
    let h = '';
    for (const [k, label] of groups) {
      const roles = PG.data.castRoles.filter((r) => kindOf(r) === k);
      if (!roles.length) continue;
      h += '<h2 class="section">' + esc(label) + '</h2><div class="grid g3">' + roles.map((r) => person(g, r)).join('') + '</div>';
    }
    return h;
  }

  function person(g, r) {
    const c = g.cast[r.id];
    let extra = '';
    if (r.id === 'rival' && g.mode !== 'party') {
      extra = '<p class="small">' + (c.office ? 'Holds: <b>' + esc(PG.data.officeById[c.office].name) + '</b>' : 'Holds no office yet') + (c.target ? ' · running for ' + esc(PG.data.officeById[c.target].short) + ' in ' + c.targetYear : '') + ' · ' + ui.party(c.party) + '</p>';
    }
    if (c.formerly) extra += '<p class="small muted">Replaced ' + esc(c.formerly) + '.</p>';
    return '<div class="card person"><div class="row">' + ui.avatar(c.name, r.icon) + '<div><b>' + esc(c.name) + '</b><br><span class="small muted">' + esc(PG.cast.title(g, r.id)) + '</span></div></div>' +
      '<div class="relbar">' + ui.centerBar(c.rel, 100) + ui.relChip(c.rel) + '</div>' + extra +
      '<p class="small"><i>' + esc(U.cap(c.quirk)) + '.</i></p><p class="small muted">' + esc(r.matters) + '</p>' +
      (c.memory.length ? '<details><summary class="small">What they remember (' + c.memory.length + ')</summary><ul class="memory">' + c.memory.map((m) => '<li><span class="when">' + U.fmtShortDate(m.date) + '</span> You ' + esc(m.text) + (m.d ? ' <span class="' + (m.d > 0 ? 'good' : 'bad') + '">' + (m.d > 0 ? '+' : '') + m.d + '</span>' : '') + '</li>').join('') + '</ul></details>' : '<p class="small muted">No history yet.</p>') + '</div>';
  }
})(globalThis.PG = globalThis.PG || {});
