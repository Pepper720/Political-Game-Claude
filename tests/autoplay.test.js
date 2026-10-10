'use strict';
const { loadPG, test, assert } = require('./harness');
const { makeBot } = require('./bot');
const PG = loadPG();

function play(setup, years) {
  const s = PG.game.newGame(setup);
  const bot = makeBot(PG, { ambition: 0.85 });
  const end = s.date.year + years;
  let guard = 0;
  while (s.date.year < end && s.phase !== 'gameover' && guard++ < 4000) {
    bot.turn(s);
    if (s.gov) {
      const a = s.gov.approval.overall;
      if (!(a >= 0 && a <= 100)) throw new Error('approval out of range: ' + a);
      for (const ch of Object.values(s.world.chambers)) if (ch.members.length !== ch.size) throw new Error(ch.id + ' lost members');
    }
    if (!Number.isFinite(s.player.cash) || !Number.isFinite(s.player.capital)) throw new Error('non-finite money/capital');
  }
  return { s, bot };
}

const CASES = [
  ['auto-1', 'PA', 'D', 'teacher'], ['auto-2', 'TX', 'R', 'business'], ['auto-3', 'CA', 'D', 'activist'],
  ['auto-4', 'GA', 'R', 'veteran'], ['auto-5', 'NE', 'I', 'farmer'], ['auto-6', 'ME', 'G', 'nonprofit'],
  ['auto-7', 'LA', 'D', 'clergy'], ['auto-8', 'DC', 'D', 'lawyer'], ['auto-9', 'WA', 'R', 'tech'],
];
for (const [seed, st, party, bg] of CASES) {
  test('autoplay: 20-year career ' + seed + ' (' + st + ', ' + party + ') runs without errors', () => {
    const { s, bot } = play({ seed, name: 'Bot ' + seed, party, background: bg, traits: ['charismatic', 'rainmaker'], homeState: st, age: 30, cityType: 'suburban', startYear: 2027 }, 20);
    const errs = s.log.filter((l) => l.type === 'error');
    assert.equal(errs.length, 0, 'engine errors: ' + errs.map((e) => e.text).join('; '));
    assert.ok(bot.stats.elections > 0, 'held elections');
    const text = PG.save.serialize(s);
    assert.ok(text.length < 2.5e6, 'save under 2.5MB: ' + text.length);
    assert.equal(JSON.stringify(PG.save.deserialize(text)), JSON.stringify(s), 'save round trip');
  });
}

test('autoplay: identical seed and choices reproduce the identical game', () => {
  const setup = { seed: 'repro', name: 'R', party: 'D', background: 'lawyer', traits: [], homeState: 'OH', age: 35, startYear: 2027 };
  const a = play(setup, 8).s, b = play(setup, 8).s;
  assert.equal(PG.save.serialize(a).replace(/"savedAt":"[^"]+"/, ''), PG.save.serialize(b).replace(/"savedAt":"[^"]+"/, ''));
});
