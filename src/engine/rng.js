/* Seeded RNG. The generator state lives inside the game state (state.rng.s) so that
 * saves are reproducible: same seed + same choices => same game. */
(function (PG) {
  'use strict';

  // cyrb53-style string hash -> unsigned 32-bit int.
  function hashString(str) {
    let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
  }

  function mulberryStep(s) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return { s, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
  }

  function create(seed) {
    return { s: hashString(String(seed)) };
  }

  // All functions take an object holding { rng: { s } } (usually the game state) or the rng itself.
  function R(holder) { return holder.rng ? holder.rng : holder; }

  function next(holder) {
    const r = R(holder);
    const out = mulberryStep(r.s);
    r.s = out.s;
    return out.v;
  }
  function range(h, min, max) { return min + next(h) * (max - min); }
  function int(h, min, max) { return Math.floor(range(h, min, max + 1)); }
  function chance(h, p) { return next(h) < p; }
  function pick(h, arr) { return arr[Math.floor(next(h) * arr.length)]; }
  function normal(h, mean, sd) {
    let u = 0, v = 0;
    while (u === 0) u = next(h);
    v = next(h);
    return (mean || 0) + (sd === undefined ? 1 : sd) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function weighted(h, items, weightFn) {
    let total = 0;
    const ws = items.map((it) => { const w = Math.max(0, weightFn(it)); total += w; return w; });
    if (total <= 0) return null;
    let x = next(h) * total;
    for (let i = 0; i < items.length; i++) { x -= ws[i]; if (x <= 0) return items[i]; }
    return items[items.length - 1];
  }
  function shuffle(h, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(next(h) * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  // Deterministic noise in [-1, 1] from a key; does not consume RNG state.
  function hashNoise(key) { return (hashString(String(key)) / 4294967295) * 2 - 1; }
  // Deterministic approx-normal noise (sum of 3 uniforms) from a key.
  function hashNormal(key) {
    return (hashNoise(key + '#a') + hashNoise(key + '#b') + hashNoise(key + '#c')) / 1.0;
  }
  function randomSeed() {
    const words = ['granite', 'harbor', 'prairie', 'capitol', 'liberty', 'ember', 'cedar', 'delta',
      'summit', 'quorum', 'beacon', 'meridian', 'atlas', 'ballot', 'frontier', 'lantern', 'oak', 'river'];
    const a = words[Math.floor(Math.random() * words.length)];
    const b = words[Math.floor(Math.random() * words.length)];
    return a + '-' + b + '-' + Math.floor(Math.random() * 9000 + 1000);
  }

  PG.rng = { hashString, create, next, range, int, chance, pick, normal, weighted, shuffle, hashNoise, hashNormal, randomSeed };
})(globalThis.PG = globalThis.PG || {});
