/* Top-level game orchestration: new game, the action dispatcher, month advancement and
 * phase transitions. Pure logic — no DOM. */
(function (PG) {
  'use strict';
  const U = PG.util;

  function newGame(setup) {
    const seed = String(setup.seed || 'default-seed');
    const state = {
      version: PG.save.VERSION, seed, rng: PG.rng.create(seed), difficulty: PG.data.difficulty[setup.difficulty] ? setup.difficulty : 'normal',
      date: { year: Number(setup.startYear) || 2027, month: 1 }, phase: 'career', idCounter: 0,
      campaign: null, gov: null, electionNight: null, log: [], news: [], groups: {}, media: {},
      events: { active: null, queue: [], fired: {}, lastMonth: {} }, history: { approval: [], polls: [] }, stats: { months: 0 },
    };
    PG.character.createPlayer(state, setup);
    PG.world.createWorld(state, setup);
    if (PG.groups) PG.groups.init(state);
    if (PG.courts) PG.courts.init(state);
    log(state, 'career', state.player.name + ' begins a political career in ' + state.world.home.city.name + ', ' + PG.data.stateById[state.player.homeState].name + '.');
    return state;
  }

  /* Log entry with optional causes ("why") for transparency. */
  function log(state, type, text, causes) {
    state.log.unshift({ date: { ...state.date }, type, text, causes: causes || null });
    if (state.log.length > 400) state.log.length = 400;
  }

  function news(state, headline, tone, outlet) {
    state.news.unshift({ date: { ...state.date }, headline, tone: tone || 0, outlet: outlet || null });
    if (state.news.length > 120) state.news.length = 120;
  }

  PG.game = { newGame, log, news };
})(globalThis.PG = globalThis.PG || {});
