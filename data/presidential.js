/* Presidential primaries and the Electoral College map.
 * Calendar months are relative to the election year (1 = January). The order follows
 * the modern calendar (early states, Super Tuesday in March, stragglers to June);
 * exact dates shift every cycle. */
(function (PG) {
  'use strict';
  PG.data = PG.data || {};
  PG.data.presCalendar = {
    1: ['IA', 'NH'],
    2: ['NV', 'SC', 'MI'],
    3: ['AL', 'AR', 'CA', 'CO', 'ME', 'MA', 'MN', 'NC', 'OK', 'TN', 'TX', 'UT', 'VT', 'VA', 'GA', 'MS', 'WA', 'AZ', 'FL', 'IL', 'KS', 'OH', 'LA', 'MO', 'ID', 'ND', 'AK', 'HI'],
    4: ['WI', 'NY', 'PA', 'CT', 'DE', 'RI', 'MD', 'WY'],
    5: ['IN', 'NE', 'WV', 'KY', 'OR'],
    6: ['MT', 'NJ', 'NM', 'SD', 'DC'],
  };
  PG.data.caucusStates = ['IA', 'NV', 'ND', 'WY', 'AK', 'HI', 'ID', 'KS', 'ME', 'UT'];
  // Republican allocation (approximate): winner-take-all, otherwise winner-take-most
  // (all delegates if a candidate tops 50%, else proportional above 20%); early states proportional.
  PG.data.rWinnerTakeAll = ['FL', 'OH', 'AZ', 'NJ', 'MT', 'SD', 'DE', 'NE', 'IN', 'MD', 'WV', 'WI', 'MO'];
  PG.data.rProportional = ['IA', 'NH', 'NV', 'SC', 'MI', 'MA', 'MN', 'VT', 'DC', 'NM', 'OR', 'WA'];
  PG.data.delegateTotals = { D: 3950, R: 2430 };

  // Tile-grid map: [row, col] on an 8 × 11 grid.
  PG.data.mapTiles = {
    AK: [0, 0], ME: [0, 10], WI: [1, 5], VT: [1, 9], NH: [1, 10],
    WA: [2, 0], ID: [2, 1], MT: [2, 2], ND: [2, 3], MN: [2, 4], IL: [2, 5], MI: [2, 6], NY: [2, 8], MA: [2, 9],
    OR: [3, 0], NV: [3, 1], WY: [3, 2], SD: [3, 3], IA: [3, 4], IN: [3, 5], OH: [3, 6], PA: [3, 7], NJ: [3, 8], CT: [3, 9], RI: [3, 10],
    CA: [4, 0], UT: [4, 1], CO: [4, 2], NE: [4, 3], MO: [4, 4], KY: [4, 5], WV: [4, 6], VA: [4, 7], MD: [4, 8], DE: [4, 9],
    AZ: [5, 1], NM: [5, 2], KS: [5, 3], AR: [5, 4], TN: [5, 5], NC: [5, 6], SC: [5, 7], DC: [5, 8],
    OK: [6, 3], LA: [6, 4], MS: [6, 5], AL: [6, 6], GA: [6, 7],
    HI: [7, 0], TX: [7, 3], FL: [7, 7],
  };
  // Poll-closing hour (Eastern) by time zone, for election night.
  PG.data.pollClose = { E: 19, C: 20, M: 21, P: 23, AK: 24, H: 24 };

  // Running-mate archetypes; names and home states are generated per game.
  PG.data.vpArchetypes = [
    { id: 'swing_gov', label: 'Popular swing-state governor', homeBonus: 3.5, base: 0, swing: 1.5, vetting: 0.15, desc: 'Could deliver a battleground; little national profile.' },
    { id: 'base_fav', label: 'Base favorite', homeBonus: 1, base: 4, swing: -1.5, vetting: 0.1, desc: 'Electrifies activists and small donors; scares moderates.' },
    { id: 'senate_vet', label: 'Experienced senator', homeBonus: 1.5, base: 1, swing: 1, vetting: 0.05, desc: 'Reassures on readiness to govern; uninspiring.' },
    { id: 'outsider', label: 'Business outsider', homeBonus: 1, base: 0.5, swing: 1, vetting: 0.3, desc: 'Fresh face with a thin record — and an unvetted past.' },
    { id: 'rival', label: 'Former primary rival', homeBonus: 2, base: 2, swing: 0.5, vetting: 0.1, desc: 'Unifies the party; you two do not like each other.' },
  ];
})(globalThis.PG = globalThis.PG || {});
