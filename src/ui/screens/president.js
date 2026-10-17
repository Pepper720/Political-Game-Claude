/* Presidential race UI: running mate, focus states, the tile map, delegates, and the
 * primary / general election nights. */
(function (PG) {
  'use strict';
  const ui = PG.ui, U = PG.util, esc = ui.esc;

  function marginColor(m) {
    // m: player margin (−1..1). Shade toward the player's color or the opponent's.
    const a = U.clamp(Math.abs(m) * 4, 0.12, 1);
    const col = m >= 0 ? '47,107,216' : '210,60,60';
    return 'rgba(' + col + ',' + a.toFixed(2) + ')';
  }

  function tileMap(cellFn) {
    const tiles = PG.data.mapTiles;
    let h = '<div class="map" style="grid-template-columns:repeat(11,minmax(0,1fr))">';
    const grid = {};
    for (const [id, [r, c]] of Object.entries(tiles)) grid[r + ',' + c] = id;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 11; c++) {
      const id = grid[r + ',' + c];
      if (!id) { h += '<div class="st empty"></div>'; continue; }
      const cell = cellFn(id);
      h += '<div class="st" style="background:' + cell.bg + (cell.fg ? ';color:' + cell.fg : '') + '" title="' + esc(cell.title) + '">' + id + '</div>';
    }
    return h + '</div>';
  }
  ui.tileMap = tileMap;

  ui.screens.presPanel = function (g) {
    const c = g.campaign, P = c.pres;
    let h = '';
    if (P.vpChoices && !P.vp) {
      h += '<div class="card alert"><h2>Choose a running mate</h2><p class="small muted">Your choice shapes your home-state map, base enthusiasm and swing appeal. Vetting is imperfect.</p>' +
        P.vpChoices.map((v) => '<button class="choice" data-act="' + ui.attr({ type: 'campaign.vp', id: v.id }) + '"><b>' + esc(v.name) + ' — ' + esc(v.label) + ' (' + esc(PG.data.stateById[v.home].name) + ')</b><span>' + esc(v.desc) + ' Home state +' + v.homeBonus + ', base ' + U.fmtSigned(v.base, 1) + ', swing ' + U.fmtSigned(v.swing, 1) + '.</span></button>').join('') + '</div>';
    } else if (P.vp) h += '<p class="small">Running mate: <b>' + esc(P.vp.name) + '</b> (' + esc(P.vp.label) + ', ' + esc(PG.data.stateById[P.vp.home].name) + ')</p>';
    const sel = ui.drafts.focus || (ui.drafts.focus = P.focus.slice());
    const suggested = c.stage === 'pres_primary' ? upcoming(g) : (P.statePolls || []).map((x) => x.state);
    h += '<div class="card"><h3>State focus <span class="muted small">(up to 6)</span></h3><p class="small muted">Your retail and media days and part of your ad budget concentrate in these states, building state-specific support. ' + (c.stage === 'pres_primary' ? 'Upcoming contests: ' + esc(suggested.join(', ')) : 'Closest states: ' + esc(suggested.join(', '))) + '.</p><div class="row">' +
      PG.data.states.map((s) => '<button class="small ' + (sel.includes(s.id) ? 'primary' : '') + '" data-cmd="toggleFocus" data-arg="' + s.id + '">' + s.id + '</button>').join('') + '</div><div class="row" style="margin-top:8px">' + ui.cbtn('Save focus', 'saveFocus', undefined, 'primary') + '<span class="small muted">Current: ' + esc(P.focus.join(', ') || 'none') + '</span></div></div>';
    return h;
  };
  function upcoming(g) {
    const P = g.campaign.pres;
    const m = g.date.year === P.year ? g.date.month : 1;
    const out = [];
    for (let k = m; k <= 6 && out.length < 8; k++) out.push.apply(out, PG.data.presCalendar[k] || []);
    return out.slice(0, 8);
  }
  ui.commands.toggleFocus = (id) => {
    const f = ui.drafts.focus;
    if (f.includes(id)) ui.drafts.focus = f.filter((x) => x !== id); else if (f.length < 6) f.push(id); else ui.toast('Six states at most.');
    ui.render();
  };
  ui.commands.saveFocus = () => ui.act({ type: 'campaign.stateFocus', focus: ui.drafts.focus });

  ui.screens.map = function (g) {
    const c = g.campaign, P = c.pres;
    let h = '<h1>' + (c.stage === 'pres_primary' ? 'Delegates & calendar' : 'The Electoral College') + '</h1>';
    if (c.stage === 'pres_primary') {
      const del = Object.entries(P.delegates).map(([id, n]) => ({ id, n, x: c.candidates.find((y) => y.id === id) })).filter((r) => r.x).sort((a, b) => b.n - a.n);
      h += '<div class="card"><h3>Delegate count — ' + P.needed + ' needed of ' + P.total + '</h3><table>' + del.map((r) => '<tr class="' + (r.x.isPlayer ? 'you' : '') + '"><td>' + esc(r.x.isPlayer ? 'You' : r.x.name) + (r.x.active ? '' : ' <span class="chip">withdrew</span>') + '</td><td style="width:50%">' + ui.bar(r.n / P.needed, r.x.isPlayer ? 'var(--accent)' : 'var(--muted)') + '</td><td class="num">' + r.n + '</td></tr>').join('') + '</table></div>';
      const res = {};
      for (const r of P.results) res[r.id] = r;
      h += '<div class="card"><h3>Calendar</h3>' + tileMap((id) => {
        const r = res[id];
        if (!r) return { bg: 'var(--chip)', fg: 'var(--ink-2)', title: PG.data.stateById[id].name + ' — ' + U.MONTHS[PG.presidential.monthOf(id) - 1] };
        return { bg: r.winner === 'player' ? 'var(--accent)' : 'var(--muted)', title: PG.data.stateById[id].name + ': won by ' + (r.winner === 'player' ? 'you' : (c.candidates.find((x) => x.id === r.winner) || {}).name) };
      }) + '<p class="small muted">Blue: states you won. Gray: won by a rival. Light: still to vote.</p><table>' +
        Object.entries(PG.data.presCalendar).map(([m, list]) => '<tr><td class="nowrap">' + U.MONTHS[m - 1] + ' ' + P.year + '</td><td class="small">' + list.map((s) => s + ' (' + P.delTable[s] + (PG.data.caucusStates.includes(s) ? ', caucus' : '') + ')').join(', ') + '</td></tr>').join('') + '</table></div>';
      return h;
    }
    const est = P.lastEstimate || PG.presidential.estimates(g);
    const opp = PG.presidential.generalCands(g).find((x) => !x.isPlayer && x.nominee) || PG.presidential.generalCands(g).find((x) => !x.isPlayer);
    let mine = 0, theirs = 0, toss = 0;
    const rows = [];
    for (const [k, sh] of Object.entries(est)) {
      const m = (sh.player || 0) - (sh[opp.id] || 0);
      const ev = PG.presidential.evOf(k);
      if (Math.abs(m) < 0.03) toss += ev; else if (m > 0) mine += ev; else theirs += ev;
      rows.push({ k, m, ev });
    }
    h += '<div class="card"><h3>Model estimate (if the election were today)</h3>' + ui.splitbar([[mine, 'var(--accent)', 'You'], [toss, 'var(--muted)', 'Toss-up'], [theirs, ui.partyColor(opp.party), opp.name.split(' ').slice(-1)[0]]]) +
      '<p class="small muted">270 electoral votes to win. Toss-up = within 3 points. This is the game\'s underlying estimate, which you only see through polls in real life; election-day error can swing every state together.</p>' +
      tileMap((id) => { const sh = est[id]; const m = (sh.player || 0) - (sh[opp.id] || 0); return { bg: marginColor(m), title: PG.data.stateById[id].name + ' (' + PG.data.stateById[id].ev + ' EV): ' + (m >= 0 ? 'you +' : opp.name + ' +') + Math.abs(m * 100).toFixed(1) }; }) +
      '<p class="small muted">Maine and Nebraska split electors by congressional district: ' + ['ME-1', 'ME-2', 'NE-1', 'NE-2', 'NE-3'].map((k) => k + ' ' + (est[k] ? ((est[k].player - est[k][opp.id]) >= 0 ? 'you' : 'them') : '')).join(', ') + '.</p></div>';
    h += '<div class="card"><h3>Battleground polls</h3><table><thead><tr><th>State</th><th class="num">EV</th><th class="num">You</th><th class="num">' + esc(opp.name) + '</th><th class="num">MOE</th></tr></thead><tbody>' +
      (P.statePolls || []).map((p) => '<tr><td>' + esc(PG.data.stateById[p.state].name) + '</td><td class="num">' + PG.data.stateById[p.state].ev + '</td><td class="num">' + p.results.player + '</td><td class="num">' + (p.results[opp.id] || 0) + '</td><td class="num">±' + p.moe + '</td></tr>').join('') + '</tbody></table></div>';
    rows.sort((a, b) => Math.abs(a.m) - Math.abs(b.m));
    h += '<div class="card"><h3>Closest contests (model)</h3><table>' + rows.slice(0, 12).map((r) => '<tr><td>' + r.k + '</td><td class="num">' + r.ev + ' EV</td><td class="num ' + (r.m >= 0 ? 'good' : 'bad') + '">' + (r.m >= 0 ? '+' : '') + (r.m * 100).toFixed(1) + '</td></tr>').join('') + '</table></div>';
    return h;
  };

  // ------------------------------------------------------------ nights
  ui.screens.presPrimaryNight = function (g) {
    const n = g.electionNight;
    const names = Object.fromEntries(n.candidates.map((c) => [c.id, c.name]));
    let h = '<div class="overlay night"><div class="modal wide"><p class="small muted">' + U.fmtDate(n.date) + '</p><h2>' + esc(n.title) + '</h2><span class="bigcall ' + (n.playerAdvanced ? (/clinched|win/.test(n.message) ? 'win' : 'wait') : 'lose') + '">' + esc(n.message) + '</span>';
    h += '<div class="tablewrap" style="margin-top:12px"><table><thead><tr><th>State</th><th>Rule</th>' + n.candidates.map((c) => '<th class="num">' + esc(c.name.split(' ').slice(-1)[0].replace('(you)', 'You')) + '</th>').join('') + '<th class="num">Delegates</th></tr></thead><tbody>' +
      n.rows.map((r) => '<tr><td>' + esc(r.name) + (r.caucus ? ' <span class="chip">caucus</span>' : '') + '</td><td class="small">' + esc(r.rule) + '</td>' + n.candidates.map((c) => '<td class="num' + (r.winner === c.id ? ' good' : '') + '">' + ((r.shares[c.id] || 0) * 100).toFixed(0) + '%' + (r.delegates[c.id] ? '<div class="small muted">' + r.delegates[c.id] + ' del</div>' : '') + '</td>').join('') + '<td class="num">' + r.total + '</td></tr>').join('') + '</tbody></table></div>';
    h += '<h3>Delegate totals</h3><table>' + Object.entries(n.delegates).filter(([id]) => names[id]).sort((a, b) => b[1] - a[1]).map(([id, d]) => '<tr><td>' + esc(names[id]) + '</td><td style="width:50%">' + ui.bar(d / n.needed) + '</td><td class="num">' + d + ' / ' + n.needed + '</td></tr>').join('') + '</table>' + ui.whyList(n.notes);
    return h + '<div class="row" style="justify-content:flex-end">' + ui.btn('Continue', { type: 'election.dismiss' }, 'primary') + '</div></div></div>';
  };

  ui.screens.presGeneralNight = function (g) {
    const n = g.electionNight;
    const k = Math.min(ui.nightStep, n.steps.length - 1);
    const step = n.steps[k];
    const final = k === n.steps.length - 1;
    const opp = n.candidates.find((c) => !c.isPlayer && c.party !== 'L' && c.party !== 'G') || n.candidates[1];
    const evMine = step.ev.player || 0, evOpp = step.ev[opp.id] || 0;
    let h = '<div class="overlay night"><div class="modal wide"><p class="small muted">' + U.fmtDate(n.date) + '</p><h2>Election night — President of the United States</h2>';
    h += '<div class="row between"><b>' + esc(step.label) + ' ET</b>' + (final ? '<span class="bigcall ' + (n.playerAdvanced ? 'win' : 'lose') + '">' + esc(n.message) + '</span>' : '<span class="bigcall wait">Counting…</span>') + '</div>';
    h += '<div style="margin:12px 0">' + ui.splitbar([[evMine, 'var(--accent)', 'You'], [538 - evMine - evOpp, '#2b3552', 'Uncalled'], [evOpp, ui.partyColor(opp.party), opp.name.split(' ').slice(-1)[0]]]) + '<div class="row between small muted"><span>You: ' + evMine + '</span><span>270 to win</span><span>' + esc(opp.name) + ': ' + evOpp + '</span></div></div>';
    h += tileMap((id) => {
      const s = step.states[id];
      if (!s) return { bg: '#1c2540', title: PG.data.stateById[id].name + ': polls open' };
      if (!s.called) return { bg: '#46507a', title: PG.data.stateById[id].name + ': too close to call (' + Math.round(s.pct * 100) + '% counted)' };
      return { bg: s.called === 'player' ? 'var(--accent)' : ui.partyColor(opp.party), title: PG.data.stateById[id].name + ': called' };
    });
    const pending = Object.entries(step.states).filter(([, s]) => !s.called).map(([id]) => id);
    h += '<p class="small muted">' + (pending.length ? 'Too close to call: ' + esc(pending.join(', ')) : final ? '' : 'Polls close by time zone: East 7–8 PM, Central 8 PM, Mountain 9 PM, Pacific 11 PM.') + '</p>';
    if (final) {
      h += '<div class="card flat" style="background:transparent;border-color:#26304a"><h3>Why it happened</h3>' + ui.whyList(n.notes) + '</div>';
      const rows = Object.entries(n.results).filter(([kk]) => kk.indexOf('-') < 0).map(([kk, r]) => ({ kk, m: (r.shares.player || 0) - (r.shares[opp.id] || 0), ev: r.ev })).sort((a, b) => Math.abs(a.m) - Math.abs(b.m)).slice(0, 10);
      h += '<details class="box" open><summary>Closest states</summary><table>' + rows.map((r) => '<tr><td>' + esc(PG.data.stateById[r.kk].name) + '</td><td class="num">' + r.ev + '</td><td class="num">' + (r.m >= 0 ? 'You +' : 'Them +') + Math.abs(r.m * 100).toFixed(1) + '</td></tr>').join('') + '</table></details>';
    }
    h += '<div class="row" style="justify-content:flex-end">' + (final ? ui.btn('Continue', { type: 'election.dismiss' }, 'primary') : ui.cbtn('Skip to final results', 'nightSkip')) + '</div></div></div>';
    return h;
  };
})(globalThis.PG = globalThis.PG || {});
