/* "How this models reality" page. */
(function (PG) {
  'use strict';
  const ui = PG.ui, esc = ui.esc;
  ui.screens.realityBody = function () {
    return '<div class="reality"><p class="muted">The game aims to follow real American political rules wherever practical. Each section lists what is modeled faithfully and where it simplifies.</p>' +
      PG.data.reality.map((s) => '<div class="card"><h2>' + esc(s.title) + '</h2><div class="grid g2"><div><h4>Modeled on real rules</h4><ul>' + s.real.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div><div><h4>Simplifications</h4><ul>' + s.simplified.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div></div></div>').join('') + '</div>';
  };
})(globalThis.PG = globalThis.PG || {});
