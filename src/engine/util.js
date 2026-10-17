/* Small pure helpers shared by the engine and UI. */
(function (PG) {
  'use strict';

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function round(x, d) { const m = Math.pow(10, d || 0); return Math.round(x * m) / m; }
  function sum(arr, fn) { let s = 0; for (const x of arr) s += fn ? fn(x) : x; return s; }
  function logistic(x) { return 1 / (1 + Math.exp(-x)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function byId(list, id) { for (const x of list) if (x.id === id) return x; return null; }
  function sortBy(arr, fn) { return arr.slice().sort((a, b) => fn(a) - fn(b)); }

  // Dates are { year, month } with month 1..12.
  function monthIndex(d) { return d.year * 12 + (d.month - 1); }
  function fromIndex(i) { return { year: Math.floor(i / 12), month: (i % 12) + 1 }; }
  function addMonths(d, n) { return fromIndex(monthIndex(d) + n); }
  function monthsBetween(a, b) { return monthIndex(b) - monthIndex(a); }
  function dateCmp(a, b) { return monthIndex(a) - monthIndex(b); }
  function fmtDate(d) { return MONTHS[d.month - 1] + ' ' + d.year; }
  function fmtShortDate(d) { return MONTHS[d.month - 1].slice(0, 3) + ' ' + d.year; }

  function fmtMoney(x) {
    const neg = x < 0; x = Math.abs(x);
    let s;
    if (x >= 1e12) s = '$' + (x / 1e12).toFixed(2) + 'T';
    else if (x >= 1e9) s = '$' + (x / 1e9).toFixed(x >= 1e10 ? 1 : 2) + 'B';
    else if (x >= 1e6) s = '$' + (x / 1e6).toFixed(x >= 1e7 ? 1 : 2) + 'M';
    else if (x >= 1e4) s = '$' + Math.round(x / 1e3) + 'K';
    else s = '$' + Math.round(x).toLocaleString('en-US');
    return (neg ? '-' : '') + s;
  }
  function fmtPct(x, d) { return (x * 100).toFixed(d === undefined ? 1 : d) + '%'; }
  function fmtSigned(x, d) { const v = round(x, d === undefined ? 1 : d); return (v > 0 ? '+' : '') + v; }
  // Lean in "margin points": positive = Republican.
  function fmtLean(m) {
    const v = Math.round(Math.abs(m));
    if (v === 0) return 'EVEN';
    return (m > 0 ? 'R+' : 'D+') + v;
  }
  function plural(n, word, pl) { return n + ' ' + (n === 1 ? word : (pl || word + 's')); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // Template substitution: "Hello {name}" with a vars object.
  function fill(text, vars) {
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));
  }

  function nextId(state, prefix) {
    state.idCounter = (state.idCounter || 0) + 1;
    return prefix + state.idCounter;
  }

  function age(state) { return state.date.year - state.player.birthYear - (state.date.month < (state.player.birthMonth || 1) ? 1 : 0); }

  // Exponential decay of numeric map values toward 0 with a given half-life in months.
  function decayMap(map, halfLife) {
    const f = Math.pow(0.5, 1 / halfLife);
    for (const k of Object.keys(map)) {
      map[k] *= f;
      if (Math.abs(map[k]) < 0.05) delete map[k];
    }
  }

  PG.util = {
    MONTHS, clamp, round, sum, logistic, lerp, deepClone, byId, sortBy,
    monthIndex, fromIndex, addMonths, monthsBetween, dateCmp, fmtDate, fmtShortDate,
    fmtMoney, fmtPct, fmtSigned, fmtLean, plural, cap, fill, nextId, age, decayMap,
  };
})(globalThis.PG = globalThis.PG || {});
