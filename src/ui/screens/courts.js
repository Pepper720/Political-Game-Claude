/* Courts screen: pending and decided cases, the benches, and judicial vacancies. */
(function (PG) {
  'use strict';
  const ui = PG.ui, U = PG.util, esc = ui.esc;

  function leanWord(x) { return x > 0.25 ? 'conservative' : x < -0.25 ? 'liberal' : 'centrist'; }

  ui.screens.courts = function (g) {
    const C = g.courts;
    if (!C) return '<h1>Courts</h1><p class="muted">No courts data.</p>';
    const st = PG.juris.homeState(g);
    let h = '<h1>Courts</h1><p class="muted">Laws and executive orders can be challenged by the groups they hurt. Cases move from trial court to appeals to a supreme court; judges can block a policy while the case proceeds. The bench\'s ideology matters.</p>';
    const vac = C.vacancies.filter((v) => v.playerAppoints);
    for (const v of vac) {
      h += '<div class="card alert"><h3>Vacancy: ' + (v.court === 'scotus' ? 'U.S. Supreme Court' : esc(st.name) + ' Supreme Court') + '</h3><p class="small muted">Nominations cost 5 political capital and need confirmation by the ' + (v.court === 'scotus' ? 'U.S. Senate' : esc(st.name) + ' Senate') + '. A committed ideologue thrills your base but may not be confirmed; younger judges serve longer.</p>' +
        v.nominees.map((n) => '<div class="row" style="padding:4px 0"><span style="flex:1"><b>' + esc(n.name) + '</b> — ' + esc(n.label) + ' · ideology ' + n.ideo + ' (' + leanWord(n.ideo) + ') · age ' + n.age + ' · qualifications ' + n.quals + '</span>' + ui.btn('Nominate', { type: 'gov.judge', seat: v.id, nominee: n.id }, 'small primary', { disabled: g.player.capital < 5 }) + '</div>').join('') + '</div>';
    }
    const pending = C.cases.filter((c) => c.status === 'pending');
    h += '<div class="card"><h3>Pending cases (' + pending.length + ')</h3>' + (pending.length ? pending.map((c) => caseRow(g, c, true)).join('') : '<p class="muted">None.</p>') + '</div>';
    const done = C.cases.filter((c) => c.status !== 'pending').slice(-15).reverse();
    h += '<div class="card"><h3>Decided</h3>' + (done.length ? done.map((c) => caseRow(g, c, false)).join('') : '<p class="muted">None yet.</p>') + '</div>';
    h += '<div class="grid g2"><div class="card"><h3>U.S. Supreme Court</h3><p class="small muted">Median justice: ' + U.round(PG.courts.median(C.scotus.map((j) => j.ideo)), 2) + ' (' + leanWord(PG.courts.median(C.scotus.map((j) => j.ideo))) + '). Lower federal courts: ' + U.round(C.circuit, 2) + '.</p><table>' +
      C.scotus.map((j) => '<tr><td>' + esc(j.vacant ? '(vacant)' : j.name) + '</td><td class="num">' + (j.vacant ? '' : j.age) + '</td><td>' + (j.vacant ? '' : ui.centerBar(j.ideo, 1)) + '</td></tr>').join('') + '</table></div>' +
      '<div class="card"><h3>' + esc(st.name) + ' Supreme Court</h3><p class="small muted">Median justice: ' + U.round(PG.courts.median(C.stateSup.map((j) => j.ideo)), 2) + '.</p><table>' +
      C.stateSup.map((j) => '<tr><td>' + esc(j.vacant ? '(vacant)' : j.name) + '</td><td class="num">' + (j.vacant ? '' : j.age) + '</td><td>' + (j.vacant ? '' : ui.centerBar(j.ideo, 1)) + '</td></tr>').join('') + '</table><p class="small muted">Bars: left = liberal, right = conservative.</p></div></div>';
    return h;
  };

  function caseRow(g, c, live) {
    const p = live ? PG.courts.strikeProb(g, c, c.stage) : null;
    return '<div style="border-bottom:1px solid var(--line);padding:8px 0"><div class="row between"><div style="flex:1;min-width:240px"><b>' + esc(c.title) + '</b> — challenge to "' + esc(c.target.name) + '"' +
      (c.injunction && live ? ' <span class="chip bad">enjoined</span>' : '') + (live ? '' : ' <span class="chip ' + (c.status === 'upheld' ? 'good' : c.status === 'struck' ? 'bad' : '') + '">' + esc(c.status) + '</span>') +
      '<div class="small muted">' + esc(PG.courts.courtName(g, c.forum, c.stage)) + ' · ' + esc(c.grounds) + (live ? ' · ruling in ~' + U.plural(Math.max(1, c.monthsLeft), 'month') + ' · odds it falls: ' + Math.round(p * 100) + '%' : '') + '</div></div>' +
      (live ? '<div class="row">' + ui.btn('Strengthen defense (3)', { type: 'gov.caseDefend', id: c.id }, 'small') + ui.btn('Settle & narrow', { type: 'gov.caseSettle', id: c.id }, 'small') + '</div>' : '') + '</div>' +
      '<details><summary class="small">History</summary>' + ui.whyList(c.history.map((x) => U.fmtShortDate(x.date) + ': ' + x.text + (x.causes ? ' (' + x.causes.join('; ') + ')' : ''))) + '</details></div>';
  }
})(globalThis.PG = globalThis.PG || {});
