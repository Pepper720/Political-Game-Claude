#!/usr/bin/env node
/* Headless smoke run: `node tests/smoke.js [seed] [years] [state] [party]` plays a career
 * with the bot and prints a short report. */
'use strict';
const { loadPG } = require('./harness');
const { makeBot } = require('./bot');
const PG = loadPG();

const seed = process.argv[2] || 'smoke-1';
const years = Number(process.argv[3] || 20);
const st = process.argv[4] || 'OH';
const party = process.argv[5] || 'D';
const state = PG.game.newGame({ seed, name: 'Smoke Test', party, background: 'lawyer', traits: ['charismatic', 'rainmaker'], homeState: st, age: 30, cityType: 'urban', difficulty: 'normal', startYear: 2027 });
const bot = makeBot(PG, { ambition: 0.8 });
const end = state.date.year + years;
let guard = 0;
while (state.date.year < end && state.phase !== 'gameover' && guard++ < 5000) bot.turn(state);
const p = state.player;
console.log('Seed', seed, '— ended', PG.util.fmtDate(state.date), 'phase', state.phase, 'turns', guard);
console.log('Offices held:', p.history.map((h) => h.officeId + ' ' + h.start.year + '-' + (h.end ? h.end.year : 'now')).join(', ') || 'none');
console.log('Elections:', p.legacy.elections.map((e) => e.year + ' ' + e.office + ' ' + (e.won ? 'WON' : 'lost') + ' ' + (e.share ? (e.share * 100).toFixed(1) + '%' : '')).join(' | '));
console.log('Laws:', p.legacy.laws.length, 'Events:', bot.stats.events, 'Failures:', bot.stats.failures.slice(0, 5));
console.log('Errors in log:', state.log.filter((l) => l.type === 'error').map((l) => l.text).slice(0, 5));
console.log('Save size:', (PG.save.serialize(state).length / 1024).toFixed(0) + ' KB');
if (state.gov) console.log('Approval', state.gov.approval.overall, 'capital', p.capital, 'bills', state.gov.bills.length, 'enacted', state.gov.enacted.length);
