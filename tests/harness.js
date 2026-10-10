/* Minimal zero-dependency test harness. Loads every non-UI script listed in index.html
 * into a shared vm context, exactly as the browser would (minus the DOM). */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function engineScripts() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
  return srcs.filter((s) => !s.includes('/ui/'));
}

function loadPG() {
  const ctx = { console, Math, JSON, Date, Object, Array, Number, String, Error, Map, Set };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const rel of engineScripts()) {
    const file = path.join(ROOT, rel);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: rel });
  }
  return ctx.PG;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

class AssertionError extends Error {}
const assert = {
  ok(v, msg) { if (!v) throw new AssertionError(msg || 'expected truthy'); },
  equal(a, b, msg) { if (a !== b) throw new AssertionError((msg || 'not equal') + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b)); },
  near(a, b, tol, msg) { if (Math.abs(a - b) > tol) throw new AssertionError((msg || 'not near') + ': ' + a + ' vs ' + b + ' (tol ' + tol + ')'); },
  deepEqual(a, b, msg) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new AssertionError((msg || 'not deep-equal') + ':\n  ' + x.slice(0, 300) + '\n  ' + y.slice(0, 300)); },
  throws(fn, msg) { let threw = false; try { fn(); } catch (e) { threw = true; } if (!threw) throw new AssertionError(msg || 'expected throw'); },
};

async function run(filter) {
  let pass = 0, fail = 0;
  const t0 = Date.now();
  for (const t of tests) {
    if (filter && !t.name.includes(filter)) continue;
    const s = Date.now();
    try {
      await t.fn();
      pass++;
      console.log('  ✓ ' + t.name + ' (' + (Date.now() - s) + 'ms)');
    } catch (e) {
      fail++;
      console.log('  ✗ ' + t.name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n      ') : e));
    }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed (' + (Date.now() - t0) + 'ms)');
  return fail;
}

module.exports = { loadPG, test, assert, run, ROOT };
