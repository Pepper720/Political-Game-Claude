'use strict';
const { loadPG, test, assert } = require('./harness');
const PG = loadPG();
const U = PG.util;

function base(over) {
  return PG.game.newGame(Object.assign({ seed: 'live', name: 'Robin Vale', party: 'D', background: 'lawyer', traits: ['charismatic'], homeState: 'FL', age: 45, cityType: 'suburban', startYear: 2027 }, over || {}));
}
function mayor(seed, st) {
  const s = base({ seed, homeState: st || 'FL' });
  s.player.history.push({ officeId: 'city_council', start: { year: 2023, month: 1 }, end: { year: 2027, month: 1 } });
  PG.gov.assumeOffice(s, 'mayor', PG.calendar.electionInfo(s, 'mayor', 2029), 0.55);
  s.player.capital = 30;
  return s;
}
function legislator(seed) {
  const s = base({ seed, homeState: 'OH' });
  s.player.history.push({ officeId: 'city_council', start: { year: 2023, month: 1 }, end: { year: 2027, month: 1 } });
  PG.gov.assumeOffice(s, 'state_house', PG.calendar.electionInfo(s, 'state_house', 2028), 0.55);
  s.player.capital = 30;
  return s;
}
function partyGame(seed) {
  const s = PG.game.newGame({ mode: 'party', partyName: 'Common Ground Party', partyShort: 'CGP', seed, name: 'Chair', background: 'activist', traits: [], homeState: 'OH', age: 40, startYear: 2027, ideology: { econ: 0, social: 0 } });
  s.party.status = 'minor'; s.party.funds = 200000;
  return s;
}

test('living world: every game has a full cast with names, quirks and relationships', () => {
  const s = base();
  assert.equal(Object.keys(s.cast).length, PG.data.castRoles.length);
  for (const r of PG.data.castRoles) {
    const c = s.cast[r.id];
    assert.ok(c.name && c.quirk && typeof c.rel === 'number', r.id);
  }
  assert.ok(s.cast.rival.party === 'D', 'rival shares your party in career mode');
  const r = PG.cast.change(s, 'reporter', 20, 'test');
  assert.equal(r.after - r.before, 20);
  assert.equal(s.cast.reporter.memory[0].text, 'test');
  // Relationships matter mechanically: hostile press makes scandals bigger.
  s.cast.reporter.rel = -80; s.cast.investigator.rel = -80;
  const hot = PG.cast.pressMult(s);
  s.cast.reporter.rel = 80; s.cast.investigator.rel = 80;
  assert.ok(hot > PG.cast.pressMult(s));
});

test('living world: storyline data references real chapters, speakers, groups, blocs and conditions', () => {
  const roles = new Set(PG.data.castRoles.map((r) => r.id));
  const issues = [];
  const s = mayor('validate');
  const checkEff = (where, e) => {
    if (!e) return;
    for (const g of Object.keys(e.groups || {})) if (!PG.data.groupById[g]) issues.push(where + ': group ' + g);
    for (const o of Object.keys(e.outcomes || {})) if (!PG.approval.OUTCOME_NAMES[o]) issues.push(where + ': outcome ' + o);
    const ap = e.approval && typeof e.approval === 'object' ? e.approval.blocs || {} : {};
    for (const b of Object.keys(ap)) if (!PG.data.blocById[b]) issues.push(where + ': bloc ' + b);
    if (e.echo && !PG.data.eventById[e.echo.event]) issues.push(where + ': echo ' + e.echo.event);
    if (e.arc && !PG.data.arcById[e.arc]) issues.push(where + ': arc ' + e.arc);
  };
  const checkCast = (where, c) => { for (const k of Object.keys(c || {})) if (!roles.has(k)) issues.push(where + ': cast ' + k); };
  const cond = (where, c) => { try { PG.arcs.test(s, { vars: {} }, c); } catch (e) { issues.push(where + ': ' + e.message); } };
  for (const a of PG.data.arcs) {
    cond(a.id + ' when', a.when && a.when.cond); cond(a.id + ' needs', a.needs);
    if (!a.stages[a.start]) issues.push(a.id + ': missing start');
    for (const [sid, st] of Object.entries(a.stages)) {
      if (st.speaker && !roles.has(st.speaker)) issues.push(a.id + '.' + sid + ': speaker ' + st.speaker);
      for (const v of (st.variants || []).concat(st.extra || [])) cond(a.id + '.' + sid + ' variant', v.if);
      st.choices.forEach((c, i) => {
        const w = a.id + '.' + sid + '#' + i;
        cond(w, c.if);
        const outs = [c].concat(c.chance ? [c.chance.success, c.chance.fail] : []);
        if (!outs.some((o) => o.next || o.end) && !(c.chance && c.chance.success.next !== undefined)) {
          // A chapter with no next and no end still closes the story — fine — but every outcome must be valid.
        }
        for (const o of outs) {
          checkEff(w, o.effects); checkCast(w, o.cast);
          const n = o.next;
          const targets = !n ? [] : typeof n === 'string' ? [n] : n.roll ? n.roll.map((x) => x.stage) : [n.stage];
          for (const t of targets) if (!a.stages[t]) issues.push(w + ': next ' + t);
          if (n && n.roll) n.roll.forEach((x) => (x.mods || []).forEach((m) => cond(w + ' roll', m.if)));
        }
        (c.chance && c.chance.mods || []).forEach((m) => cond(w + ' mod', m.if));
      });
    }
  }
  for (const a of PG.data.asks) {
    if (!roles.has(a.from)) issues.push(a.id + ': from ' + a.from);
    a.options.forEach((o, i) => { checkEff(a.id + '#' + i, o.effects); checkCast(a.id + '#' + i, o.cast); if (o.echo && !PG.data.eventById[o.echo.event]) issues.push(a.id + ': echo ' + o.echo.event); });
    checkEff(a.id + ' ignore', a.ignore && a.ignore.effects); checkCast(a.id + ' ignore', a.ignore && a.ignore.cast);
  }
  for (const p of PG.data.wirePosts.concat(PG.data.wireGossip, PG.data.wireQuotes)) cond('wire', p.if);
  assert.deepEqual(issues, []);
});

// Play every storyline many times, taking random available choices, in a fitting context.
test('living world: every storyline plays through to an ending without errors', () => {
  const ctx = (a, seed) => {
    const c = JSON.stringify(a.when && a.when.cond);
    if (/"party"/.test(c)) return partyGame(seed);
    if (/career/.test(c)) return base({ seed, homeState: 'OH' });
    if (/legislator/.test(c)) return legislator(seed);
    return mayor(seed, 'FL');
  };
  let endings = 0;
  for (const a of PG.data.arcs) {
    const seen = new Set();
    for (let k = 0; k < 14; k++) {
      const s = ctx(a, a.id + '-' + k);
      const inst = PG.arcs.start(s, a.id);
      assert.ok(inst, a.id + ' started');
      let guard = 0;
      while (PG.arcs.find(s, inst.uid) && guard++ < 20) {
        s.events.active = null;
        inst.due = U.monthIndex(s.date);
        s.events.active = { id: 'arc', arc: inst.uid, vars: {}, date: { ...s.date } };
        const v = PG.events.view(s);
        assert.ok(v && v.title && v.text && !/\{[a-z]+\}/i.test(v.text), a.id + ': unfilled text in ' + v.title + ': ' + v.text);
        const ok = v.choices.filter((c) => c.ok);
        assert.ok(ok.length, a.id + '.' + inst.stage + ' has an available choice');
        const pick = ok[PG.rng.int(s, 0, ok.length - 1)];
        seen.add(inst.stage);
        const r = PG.events.choose(s, pick.i);
        assert.ok(r.ok, a.id + ': ' + r.msg);
        s.date = U.addMonths(s.date, 1);
      }
      assert.ok(!PG.arcs.find(s, inst.uid), a.id + ' reached an ending');
      assert.ok(s.arcs.done[a.id] && s.arcs.done[a.id].outcome, a.id + ' recorded an outcome');
      endings++;
    }
    // Most chapters are reachable with random play.
    assert.ok(seen.size >= Math.min(2, Object.keys(a.stages).length), a.id + ' visited ' + [...seen].join(','));
  }
  assert.ok(endings >= PG.data.arcs.length * 14);
});

test('living world: storylines start on their own, hold the month, and remember your choices', () => {
  const s = mayor('arc-run');
  let started = 0, guard = 0;
  while (guard++ < 120) {
    if (s.events.active) {
      if (s.events.active.arc) started++;
      PG.game.act(s, { type: 'event.choose', i: PG.events.view(s).choices.find((c) => c.ok).i });
      continue;
    }
    if (s.electionNight) { PG.game.act(s, { type: 'election.dismiss' }); continue; }
    if (!s.gov) break;
    const r = PG.game.act(s, { type: 'endMonth' });
    assert.ok(r.ok, r.msg);
  }
  assert.ok(started >= 2, 'storyline chapters appeared: ' + started);
  const sum = PG.arcs.summary(s);
  assert.ok(sum.active.length + sum.done.length >= 1);
  assert.ok(s.log.some((l) => l.type === 'story'));
});

test('living world: phone asks arrive, can be answered, and expire with consequences when ignored', () => {
  const s = mayor('phone');
  let got = 0, guard = 0;
  while (got < 3 && guard++ < 40) {
    if (s.events.active) { PG.game.act(s, { type: 'event.choose', i: PG.events.view(s).choices.find((c) => c.ok).i }); continue; }
    PG.game.act(s, { type: 'endMonth' });
    got = s.inbox.length;
  }
  assert.ok(s.inbox.length > 0, 'calls came in');
  const it = s.inbox[0];
  const who = it.from, before = s.cast[who].rel;
  const r = PG.game.act(s, { type: 'phone.answer', uid: it.uid, i: 0 });
  assert.ok(r.ok, r.msg);
  assert.ok(!s.inbox.some((x) => x.uid === it.uid));
  assert.ok(s.cast[who].rel !== before || s.cast[who].memory.length > 0, 'the caller remembers');
  // Ignore the rest until they expire.
  const pending = s.inbox.map((x) => x.uid);
  for (let i = 0; i < 4; i++) { if (s.events.active) PG.game.act(s, { type: 'event.choose', i: PG.events.view(s).choices.find((c) => c.ok).i }); PG.game.act(s, { type: 'endMonth' }); }
  for (const uid of pending) assert.ok(!s.inbox.some((x) => x.uid === uid), 'unanswered asks expire');
  assert.ok(s.log.some((l) => /Missed call/.test(l.text)), 'missed calls are logged');
});

test('living world: your rival climbs and shows up in your primary for the same seat', () => {
  const s = base({ seed: 'rival', homeState: 'OH', party: 'R' });
  s.player.history.push({ officeId: 'city_council', start: { year: 2023, month: 1 }, end: { year: 2027, month: 1 } });
  s.cast.rival.target = 'state_house'; s.cast.rival.targetYear = 2028;
  const r = PG.game.act(s, { type: 'career.declare', officeId: 'state_house' });
  assert.ok(r.ok, r.msg);
  let g = 0;
  while (!s.campaign && g++ < 30) { if (s.events.active) PG.game.act(s, { type: 'event.choose', i: 0 }); else PG.game.act(s, { type: 'endMonth' }); }
  assert.ok(s.campaign, 'campaign started');
  const rc = s.campaign.candidates.find((c) => c.label === 'Your rival');
  assert.ok(rc, 'rival is in the race');
  assert.equal(rc.name, s.cast.rival.name);
  assert.equal(rc.party, 'R');
});

test('living world: gas spikes hurt the economic mood; the home team plays a season', () => {
  const s = mayor('gas');
  const before = PG.economy.score(s, 'city');
  s.world.national.gas.price = 5.2;
  assert.ok(PG.economy.score(s, 'city') < before - 1.5, 'expensive gas weighs on approval');
  s.date = { year: 2027, month: 8 };
  for (let i = 0; i < 4; i++) { PG.wire.monthly(s); s.date = U.addMonths(s.date, 1); }
  const t = s.world.team;
  assert.ok(t.w + t.l >= 9, 'games were played: ' + t.w + '-' + t.l);
});

test('living world: the wire fills with reactions, and old saves gain a cast on load', () => {
  const s = mayor('wire');
  for (let i = 0; i < 6; i++) { if (s.events.active) PG.game.act(s, { type: 'event.choose', i: PG.events.view(s).choices.find((c) => c.ok).i }); PG.game.act(s, { type: 'endMonth' }); }
  assert.ok(s.wire.length >= 4, 'wire posts: ' + s.wire.length);
  assert.ok(s.wire.every((w) => w.text && !/\{[a-z]+\}/i.test(w.text)), 'all wire text is filled in');
  const old = JSON.parse(PG.save.serialize(s));
  delete old.state.cast; delete old.state.arcs; delete old.state.inbox; delete old.state.wire; delete old.state.world.team; delete old.state.world.national.gas;
  const loaded = PG.save.deserialize(JSON.stringify(old));
  assert.ok(loaded.cast && loaded.arcs && loaded.world.team && loaded.world.national.gas);
});

test('living world: party-founder mode gets its own cast titles, calls and storylines', () => {
  const s = partyGame('party-live');
  assert.equal(PG.cast.title(s, 'boss'), 'Major-party operative');
  assert.ok(s.cast.boss.rel < 0, 'the old parties start hostile');
  const inst = PG.arcs.start(s, 'defector');
  s.events.active = { id: 'arc', arc: inst.uid, vars: {}, date: { ...s.date } };
  const seats = PG.party.totalSeats(s);
  PG.events.choose(s, 0);
  assert.equal(PG.party.totalSeats(s), seats + 1, 'the defector brought a seat');
});
