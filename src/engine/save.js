/* Save serialization, validation and migration. Storage itself (localStorage / file)
 * is handled by the UI; the engine only deals in strings. */
(function (PG) {
  'use strict';
  const FORMAT = 'ballot-and-gavel-save';
  const VERSION = 1;
  const REQUIRED = ['seed', 'rng', 'date', 'phase', 'player', 'world', 'difficulty'];

  function serialize(state) {
    return JSON.stringify({ format: FORMAT, version: VERSION, savedAt: new Date().toISOString(), state });
  }

  function validate(state) {
    const errors = [];
    if (!state || typeof state !== 'object') return ['Save contains no game state.'];
    for (const k of REQUIRED) if (state[k] === undefined) errors.push('Missing field: ' + k);
    if (state.rng && typeof state.rng.s !== 'number') errors.push('Corrupt RNG state.');
    if (state.date && !(state.date.month >= 1 && state.date.month <= 12)) errors.push('Corrupt date.');
    if (state.player && !PG.data.stateById[state.player.homeState]) errors.push('Unknown home state.');
    if (state.difficulty && !PG.data.difficulty[state.difficulty]) errors.push('Unknown difficulty.');
    return errors;
  }

  function migrate(wrapper) {
    // Future versions transform older saves here, one step at a time.
    if (wrapper.version > VERSION) throw new Error('This save was made by a newer version of the game.');
    return wrapper.state;
  }

  function deserialize(text) {
    let wrapper;
    try { wrapper = JSON.parse(text); } catch (e) { throw new Error('Not a valid JSON save file.'); }
    if (!wrapper || wrapper.format !== FORMAT) throw new Error('Not a Ballot & Gavel save file.');
    const state = migrate(wrapper);
    const errors = validate(state);
    if (errors.length) throw new Error('Invalid save: ' + errors.join(' '));
    if (state.party && PG.party) PG.party.sync(state);
    if (PG.cast) PG.cast.ensure(state);
    return state;
  }

  PG.save = { FORMAT, VERSION, serialize, deserialize, validate };
})(globalThis.PG = globalThis.PG || {});
