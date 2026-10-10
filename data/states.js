/* All 50 states + DC. Values are approximations of real rules and demographics
 * (mid-2020s). Edit freely; the engine reads everything from here.
 *
 * Columns:
 *  id, name, ev, pvi (Cook-style, + = Republican, in PVI points; margin ≈ 2×PVI),
 *  region, tz (poll-close zone E/C/M/P/AK/H),
 *  urban, suburban (rural = remainder), black, hispanic, asianOther (AAPI, Native, other),
 *  college (share with BA+), religious (white evangelical / highly religious share),
 *  seniors (65+ share of voters),
 *  primary ('open' | 'closed' | 'semi' | 'top2' | 'top4' | 'jungle'), runoff (threshold or 0),
 *  primaryMonth (state/federal primary month), govParity (year % 4 of gubernatorial
 *  elections, -1 = every even year), govTerm, govLimit ('none' | 'consec2' | 'life2' | 'noconsec'),
 *  legLimit (years per chamber, 0 = none), houseSize, senateSize (state legislature),
 *  houseTerm, senateTerm, override (veto override fraction), liv (line-item veto),
 *  redistricting ('R' | 'D' | 'commission' | 'split'), mailLate (mail ballots counted last),
 *  contribLimit (individual → statewide candidate per election, 0 = unlimited),
 *  senateClasses (which U.S. Senate classes the state holds)
 */
(function (PG) {
  'use strict';
  const rows = [
    ['AL', 'Alabama', 9, 15, 'South', 'C', .25, .35, .26, .05, .03, .27, .45, .18, 'open', .5, 5, 2, 4, 'consec2', 0, 105, 35, 4, 4, .5, true, 'R', false, 0, '23'],
    ['AK', 'Alaska', 3, 6, 'West', 'AK', .30, .30, .03, .07, .22, .30, .20, .14, 'top4', 0, 8, 2, 4, 'consec2', 0, 40, 20, 2, 4, .67, true, 'commission', true, 1000, '23'],
    ['AZ', 'Arizona', 11, 3, 'West', 'M', .45, .40, .05, .32, .09, .31, .25, .19, 'semi', 0, 7, 2, 4, 'consec2', 8, 60, 30, 2, 2, .67, true, 'commission', true, 5300, '13'],
    ['AR', 'Arkansas', 6, 16, 'South', 'C', .25, .30, .15, .08, .03, .25, .45, .18, 'open', .5, 3, 2, 4, 'life2', 12, 100, 35, 2, 4, .5, true, 'R', false, 3300, '23'],
    ['CA', 'California', 54, -11, 'West', 'P', .60, .32, .06, .40, .17, .36, .12, .16, 'top2', 0, 6, 2, 4, 'life2', 12, 80, 40, 2, 4, .67, true, 'commission', true, 5900, '13'],
    ['CO', 'Colorado', 10, -4, 'West', 'M', .45, .40, .04, .22, .05, .44, .20, .16, 'semi', 0, 6, 2, 4, 'consec2', 8, 65, 35, 2, 4, .67, true, 'commission', false, 1350, '23'],
    ['CT', 'Connecticut', 7, -7, 'Northeast', 'E', .30, .55, .11, .18, .06, .41, .10, .18, 'closed', 0, 8, 2, 4, 'none', 0, 151, 36, 2, 2, .67, true, 'split', false, 3700, '13'],
    ['DE', 'Delaware', 3, -7, 'South', 'E', .30, .50, .23, .10, .05, .34, .15, .21, 'closed', 0, 9, 0, 4, 'life2', 0, 41, 21, 2, 4, .6, true, 'D', false, 1200, '12'],
    ['DC', 'District of Columbia', 3, -43, 'South', 'E', 1.0, 0, .41, .11, .06, .60, .10, .12, 'closed', 0, 6, 2, 4, 'none', 0, 0, 13, 4, 4, .67, true, 'commission', false, 2000, ''],
    ['FL', 'Florida', 30, 5, 'South', 'E', .40, .50, .15, .27, .04, .32, .25, .22, 'closed', 0, 8, 2, 4, 'consec2', 8, 120, 40, 2, 4, .67, true, 'R', false, 3000, '13'],
    ['GA', 'Georgia', 16, 2, 'South', 'E', .35, .40, .32, .10, .06, .33, .38, .15, 'open', .5, 5, 2, 4, 'consec2', 0, 180, 56, 2, 2, .67, true, 'R', false, 8400, '23'],
    ['HI', 'Hawaii', 4, -13, 'West', 'H', .50, .35, .02, .11, .55, .34, .10, .20, 'open', 0, 8, 2, 4, 'consec2', 0, 51, 25, 2, 4, .67, true, 'commission', false, 6000, '13'],
    ['ID', 'Idaho', 4, 18, 'West', 'M', .30, .30, .01, .13, .04, .30, .40, .17, 'closed', 0, 5, 2, 4, 'none', 0, 70, 35, 2, 2, .67, true, 'commission', false, 1000, '23'],
    ['IL', 'Illinois', 19, -5, 'Midwest', 'C', .45, .40, .14, .18, .07, .37, .15, .17, 'open', 0, 3, 2, 4, 'none', 0, 118, 59, 2, 4, .6, true, 'D', true, 6900, '23'],
    ['IN', 'Indiana', 11, 9, 'Midwest', 'E', .30, .35, .10, .08, .04, .28, .30, .17, 'open', 0, 5, 0, 4, 'consec2', 0, 100, 50, 2, 4, .5, false, 'R', false, 0, '13'],
    ['IA', 'Iowa', 6, 6, 'Midwest', 'C', .25, .35, .04, .07, .04, .30, .25, .18, 'semi', 0, 6, 2, 4, 'none', 0, 100, 50, 2, 4, .67, true, 'commission', false, 0, '23'],
    ['KS', 'Kansas', 6, 9, 'Midwest', 'C', .30, .35, .06, .13, .04, .35, .30, .17, 'closed', 0, 8, 2, 4, 'consec2', 0, 125, 40, 2, 4, .67, true, 'R', false, 2000, '23'],
    ['KY', 'Kentucky', 8, 15, 'South', 'E', .25, .30, .08, .04, .03, .26, .45, .17, 'closed', 0, 5, 3, 4, 'consec2', 0, 100, 38, 2, 4, .5, true, 'R', false, 2100, '23'],
    ['LA', 'Louisiana', 8, 11, 'South', 'C', .35, .30, .32, .06, .03, .26, .30, .17, 'jungle', .5, 10, 3, 4, 'consec2', 12, 105, 39, 4, 4, .67, true, 'R', false, 5000, '23'],
    ['ME', 'Maine', 4, -2, 'Northeast', 'E', .20, .30, .02, .02, .03, .34, .15, .22, 'semi', 0, 6, 2, 4, 'consec2', 8, 151, 35, 2, 2, .67, false, 'split', false, 2000, '12'],
    ['MD', 'Maryland', 10, -14, 'South', 'E', .30, .60, .31, .11, .08, .43, .15, .17, 'closed', 0, 6, 2, 4, 'consec2', 0, 141, 47, 4, 4, .6, true, 'D', true, 6000, '13'],
    ['MA', 'Massachusetts', 11, -14, 'Northeast', 'E', .40, .50, .08, .13, .08, .46, .08, .18, 'semi', 0, 9, 2, 4, 'none', 0, 160, 40, 2, 2, .67, true, 'D', false, 1000, '12'],
    ['MI', 'Michigan', 15, 0, 'Midwest', 'E', .35, .40, .14, .06, .05, .31, .25, .18, 'open', 0, 8, 2, 4, 'life2', 12, 110, 38, 2, 4, .67, true, 'commission', false, 3500, '12'],
    ['MN', 'Minnesota', 10, -1, 'Midwest', 'C', .35, .40, .07, .06, .07, .38, .18, .17, 'open', 0, 8, 2, 4, 'none', 0, 134, 67, 2, 4, .67, true, 'split', false, 1000, '12'],
    ['MS', 'Mississippi', 6, 10, 'South', 'C', .20, .30, .38, .03, .02, .23, .50, .17, 'open', .5, 6, 3, 4, 'life2', 0, 122, 52, 4, 4, .67, true, 'R', false, 0, '12'],
    ['MO', 'Missouri', 10, 9, 'Midwest', 'C', .30, .35, .11, .05, .03, .31, .35, .18, 'open', 0, 8, 0, 4, 'life2', 8, 163, 34, 2, 4, .67, true, 'R', false, 2900, '13'],
    ['MT', 'Montana', 4, 10, 'West', 'M', .20, .30, .01, .04, .08, .33, .25, .20, 'open', 0, 6, 0, 4, 'life2', 8, 100, 50, 2, 4, .67, true, 'commission', false, 790, '12'],
    ['NE', 'Nebraska', 5, 11, 'Midwest', 'C', .35, .25, .05, .12, .05, .33, .25, .16, 'semi', 0, 5, 2, 4, 'consec2', 8, 0, 49, 4, 4, .6, true, 'R', false, 0, '12'],
    ['NV', 'Nevada', 6, 1, 'West', 'P', .65, .25, .10, .30, .10, .27, .15, .17, 'closed', 0, 6, 2, 4, 'life2', 12, 42, 21, 2, 4, .67, false, 'D', true, 5000, '13'],
    ['NH', 'New Hampshire', 4, -1, 'Northeast', 'E', .25, .40, .02, .05, .04, .38, .10, .20, 'semi', 0, 9, -1, 2, 'none', 0, 400, 24, 2, 2, .67, false, 'R', false, 2000, '23'],
    ['NJ', 'New Jersey', 14, -3, 'Northeast', 'E', .35, .60, .13, .22, .11, .42, .10, .17, 'semi', 0, 6, 1, 4, 'consec2', 0, 80, 40, 2, 4, .67, true, 'commission', true, 5800, '12'],
    ['NM', 'New Mexico', 5, -3, 'West', 'M', .40, .25, .02, .49, .12, .29, .15, .19, 'semi', 0, 6, 2, 4, 'consec2', 0, 70, 42, 2, 4, .67, true, 'D', false, 5500, '12'],
    ['NY', 'New York', 28, -8, 'Northeast', 'E', .50, .35, .15, .19, .10, .39, .10, .17, 'closed', 0, 6, 2, 4, 'none', 0, 150, 63, 2, 2, .67, true, 'commission', true, 18000, '13'],
    ['NC', 'North Carolina', 16, 3, 'South', 'E', .30, .40, .21, .10, .04, .33, .35, .17, 'semi', .3, 3, 0, 4, 'consec2', 0, 120, 50, 2, 2, .6, false, 'R', false, 6800, '23'],
    ['ND', 'North Dakota', 3, 18, 'Midwest', 'C', .30, .20, .03, .05, .08, .31, .25, .16, 'open', 0, 6, 0, 4, 'life2', 8, 94, 47, 4, 4, .67, true, 'R', false, 0, '13'],
    ['OH', 'Ohio', 17, 6, 'Midwest', 'E', .35, .35, .13, .05, .04, .30, .28, .18, 'semi', 0, 5, 2, 4, 'consec2', 8, 99, 33, 2, 4, .6, true, 'R', false, 15900, '13'],
    ['OK', 'Oklahoma', 7, 19, 'South', 'C', .30, .30, .07, .11, .12, .27, .50, .17, 'closed', .5, 6, 2, 4, 'life2', 12, 101, 48, 2, 4, .67, true, 'R', false, 3300, '23'],
    ['OR', 'Oregon', 8, -6, 'West', 'P', .40, .35, .02, .14, .07, .36, .15, .19, 'closed', 0, 5, 2, 4, 'consec2', 0, 60, 30, 2, 4, .67, true, 'D', false, 0, '23'],
    ['PA', 'Pennsylvania', 19, 1, 'Northeast', 'E', .35, .40, .11, .09, .05, .33, .20, .19, 'closed', 0, 5, 2, 4, 'consec2', 0, 203, 50, 2, 4, .67, true, 'split', true, 0, '13'],
    ['RI', 'Rhode Island', 4, -8, 'Northeast', 'E', .40, .50, .07, .17, .05, .37, .08, .18, 'semi', 0, 9, 2, 4, 'consec2', 0, 75, 38, 2, 2, .6, false, 'D', false, 1000, '12'],
    ['SC', 'South Carolina', 9, 8, 'South', 'E', .30, .35, .26, .06, .03, .31, .40, .19, 'open', .5, 6, 2, 4, 'consec2', 0, 124, 46, 2, 4, .67, true, 'R', false, 3500, '23'],
    ['SD', 'South Dakota', 3, 15, 'Midwest', 'C', .25, .20, .02, .05, .10, .30, .30, .18, 'closed', .35, 6, 2, 4, 'consec2', 8, 70, 35, 2, 2, .67, true, 'R', false, 4000, '23'],
    ['TN', 'Tennessee', 11, 14, 'South', 'C', .30, .35, .16, .07, .03, .29, .45, .17, 'open', 0, 8, 2, 4, 'consec2', 0, 99, 33, 2, 4, .5, true, 'R', false, 1800, '12'],
    ['TX', 'Texas', 40, 6, 'South', 'C', .50, .30, .12, .40, .07, .32, .32, .13, 'open', .5, 3, 2, 4, 'none', 0, 150, 31, 2, 4, .67, true, 'R', false, 0, '12'],
    ['UT', 'Utah', 6, 11, 'West', 'M', .40, .45, .01, .15, .05, .36, .55, .12, 'closed', 0, 6, 0, 4, 'none', 0, 75, 29, 2, 4, .67, true, 'R', false, 0, '13'],
    ['VT', 'Vermont', 3, -15, 'Northeast', 'E', .15, .30, .01, .02, .03, .40, .08, .21, 'open', 0, 8, -1, 2, 'none', 0, 150, 30, 2, 2, .67, false, 'split', false, 4310, '13'],
    ['VA', 'Virginia', 13, -2, 'South', 'E', .30, .50, .19, .11, .08, .41, .25, .16, 'open', 0, 6, 1, 4, 'noconsec', 0, 100, 40, 2, 4, .67, true, 'commission', true, 0, '12'],
    ['WA', 'Washington', 12, -8, 'West', 'P', .45, .40, .04, .14, .12, .38, .15, .17, 'top2', 0, 8, 0, 4, 'none', 0, 98, 49, 2, 4, .67, true, 'commission', true, 1200, '13'],
    ['WV', 'West Virginia', 4, 21, 'South', 'E', .15, .30, .04, .02, .02, .23, .35, .21, 'semi', 0, 5, 0, 4, 'consec2', 0, 100, 34, 2, 4, .5, true, 'R', false, 3500, '12'],
    ['WI', 'Wisconsin', 10, 0, 'Midwest', 'C', .30, .40, .06, .08, .04, .32, .20, .18, 'open', 0, 8, 2, 4, 'none', 0, 99, 33, 2, 4, .67, true, 'split', true, 20000, '13'],
    ['WY', 'Wyoming', 3, 23, 'West', 'M', .20, .30, .01, .10, .04, .29, .30, .18, 'closed', 0, 8, 2, 4, 'life2', 0, 62, 31, 2, 4, .67, true, 'R', false, 1500, '12'],
  ];
  const keys = ['id', 'name', 'ev', 'pvi', 'region', 'tz', 'urban', 'suburban', 'black', 'hispanic', 'asianOther',
    'college', 'religious', 'seniors', 'primary', 'runoff', 'primaryMonth', 'govParity', 'govTerm', 'govLimit',
    'legLimit', 'houseSize', 'senateSize', 'houseTerm', 'senateTerm', 'override', 'liv', 'redistricting',
    'mailLate', 'contribLimit', 'senateClasses'];

  const states = rows.map((r) => {
    const o = {};
    keys.forEach((k, i) => { o[k] = r[i]; });
    o.lean = o.pvi * 2; // two-party presidential margin, + = R
    o.rural = Math.max(0, 1 - o.urban - o.suburban);
    o.houseSeats = o.id === 'DC' ? 0 : o.ev - 2;
    o.isDC = o.id === 'DC';
    o.unicameral = o.houseSize === 0;
    o.generalRunoff = o.id === 'GA' || o.id === 'LA';
    o.rcv = o.id === 'ME' || o.id === 'AK';
    return o;
  });

  // Electoral-vote allocation by congressional district (Maine and Nebraska).
  const districtEV = {
    ME: [{ id: 'ME-1', lean: -18 }, { id: 'ME-2', lean: 18 }],
    NE: [{ id: 'NE-1', lean: 16 }, { id: 'NE-2', lean: -4 }, { id: 'NE-3', lean: 58 }],
  };

  // Rough population (millions) — used for budgets, delegates, legislative scale.
  const population = {
    AL: 5.1, AK: .73, AZ: 7.4, AR: 3.1, CA: 39, CO: 5.9, CT: 3.6, DE: 1.0, DC: .68, FL: 22.6, GA: 11.0, HI: 1.4,
    ID: 2.0, IL: 12.5, IN: 6.9, IA: 3.2, KS: 2.9, KY: 4.5, LA: 4.6, ME: 1.4, MD: 6.2, MA: 7.0, MI: 10.0, MN: 5.7,
    MS: 2.9, MO: 6.2, MT: 1.1, NE: 2.0, NV: 3.2, NH: 1.4, NJ: 9.3, NM: 2.1, NY: 19.6, NC: 10.8, ND: .78, OH: 11.8,
    OK: 4.0, OR: 4.2, PA: 13.0, RI: 1.1, SC: 5.4, SD: .92, TN: 7.1, TX: 30.5, UT: 3.4, VT: .65, VA: 8.7, WA: 7.8,
    WV: 1.8, WI: 5.9, WY: .58,
  };
  states.forEach((s) => { s.population = population[s.id]; });

  PG.data = PG.data || {};
  PG.data.states = states;
  PG.data.stateById = Object.fromEntries(states.map((s) => [s.id, s]));
  PG.data.districtEV = districtEV;
})(globalThis.PG = globalThis.PG || {});
