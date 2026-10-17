/* The presidential race: invisible primary, state-by-state primaries and caucuses with
 * party-specific delegate rules, dropouts, conventions, running mates, a 50-state +
 * DC general election with Maine/Nebraska district electors, the 269–269 contingent
 * election, and a state-by-state election night. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;

  function st(id) { return PG.data.stateById[id]; }
  function electorateFor(state, key) {
    if (key.indexOf('-') > 0) {
      state.world.electorates = state.world.electorates || {};
      const cacheKey = 'cd:' + key;
      if (state.world.electorates[cacheKey]) return state.world.electorates[cacheKey];
      const sid = key.split('-')[0];
      const d = PG.data.districtEV[sid].find((x) => x.id === key);
      const e = PG.voters.makeElectorate({ id: cacheKey, name: key, type: 'district', stateId: sid, lean: d.lean, population: st(sid).population * 1e6 / PG.data.districtEV[sid].length, regionKind: 'state' });
      state.world.electorates[cacheKey] = e;
      return e;
    }
    return PG.juris.electorate(state, 'st:' + key);
  }

  function monthOf(stateId) {
    for (const [m, list] of Object.entries(PG.data.presCalendar)) if (list.includes(stateId)) return Number(m);
    return 6;
  }

  function delegateTable(party) {
    const total = PG.data.delegateTotals[party];
    const w = {};
    let sum = 0;
    for (const s of PG.data.states) {
      const strength = party === 'D' ? -s.lean : s.lean;
      const v = Math.pow(s.population, 0.95) * U.clamp(1 + strength / 80, 0.4, 1.8) + (party === 'R' ? 0.8 : 0.25);
      w[s.id] = v; sum += v;
    }
    const out = {};
    for (const s of PG.data.states) out[s.id] = Math.max(party === 'R' ? 9 : 6, Math.round(total * w[s.id] / sum));
    return out;
  }

  function randomHomeState(state, exclude) {
    return R.weighted(state, PG.data.states.filter((s) => !s.isDC && s.id !== exclude), (s) => Math.sqrt(s.population)).id;
  }

  // ------------------------------------------------------------------ setup
  function setup(state) {
    const c = state.campaign, p = state.player;
    const year = c.info.general.year;
    const myParty = p.party === 'D' || p.party === 'R' ? p.party : null;
    const other = myParty === 'R' ? 'D' : 'R';
    c.stages = myParty ? ['pres_primary', 'general'] : ['general'];
    c.stage = c.stages[0]; c.stageIndex = 0;
    const pres = state.world.executives.president;
    c.pres = { year, party: myParty, delegates: {}, delTable: myParty ? delegateTable(myParty) : {}, results: [], focus: [], vp: null, vpChoices: null, nominated: !myParty,
      otherNominee: null, dropped: [], statePolls: [], conventionDone: false };
    c.pres.total = U.sum(Object.values(c.pres.delTable));
    c.pres.needed = Math.floor(c.pres.total / 2) + 1;
    const pc = PG.campaign.makePlayerCand(state, 'president');
    pc.stateBoost = {}; pc.homeState = p.homeState; pc.stateBoost[p.homeState] = 5;
    c.candidates = [pc];
    c.pres.delegates.player = 0;
    if (myParty) {
      const incumbentRuns = pres && !pres.isPlayer && pres.party === myParty && (pres.termNumber || 1) < 2;
      const n = incumbentRuns ? R.int(state, 0, 1) : R.int(state, 4, 6);
      if (incumbentRuns) addRival(state, myParty, { incumbent: true, name: pres.name, ideology: { econ: pres.econ, social: pres.social }, nameRec: 97, fav: pres.approval + 4, qualityBonus: 12 });
      const biases = ['base', 'moderate', 'mainstream', 'base', 'mainstream', 'moderate'];
      for (let i = 0; i < n; i++) addRival(state, myParty, { bias: biases[i], qualityBonus: incumbentRuns ? -12 : R.range(state, -5, 8) });
    }
    // The other party's nominee: an incumbent seeking a second term, or the winner of their primaries (decided in March).
    const otherIncumbent = pres && !pres.isPlayer && pres.party === other && (pres.termNumber || 1) < 2;
    if (otherIncumbent) c.pres.otherNominee = makeNominee(state, other, { incumbent: true, name: pres.name, ideology: { econ: pres.econ, social: pres.social }, nameRec: 97, fav: pres.approval + 3 });
    if (!myParty) c.pres.otherField = ['D', 'R'];
    // Debates: primary debates from the summer before; general debates in September and October.
    c.debates = [];
    if (myParty) for (const m of [6, 9, 11]) c.debates.push({ id: U.nextId(state, 'deb'), stage: 'pres_primary', date: { year: year - 1, month: m }, held: false, result: null, label: 'Primary debate (' + U.MONTHS[m - 1] + ')' });
    if (myParty) c.debates.push({ id: U.nextId(state, 'deb'), stage: 'pres_primary', date: { year, month: 2 }, held: false, result: null, label: 'Primary debate (February)' });
    c.debates.push({ id: U.nextId(state, 'deb'), stage: 'general', date: { year, month: 9 }, held: false, result: null, label: 'Presidential debate #1' });
    c.debates.push({ id: U.nextId(state, 'deb'), stage: 'general', date: { year, month: 10 }, held: false, result: null, label: 'Presidential debate #2' });
    if (!myParty) startGeneral(state);
  }

  function addRival(state, party, o) {
    const c = state.campaign;
    const x = PG.campaign.makeCandidate(state, Object.assign({ officeId: 'president', party, stages: ['pres_primary'] }, o));
    if (!o.nameRec) x.nameRec = U.round(R.range(state, 12, 50) + x.quality / 8, 1);
    x.cash = Math.round(c.typicalBudget * R.range(state, 0.01, 0.06) * x.quality / 50);
    x.homeState = randomHomeState(state);
    x.stateBoost = {}; x.stateBoost[x.homeState] = 8;
    c.candidates.push(x);
    c.pres.delegates[x.id] = 0;
    return x;
  }

  function makeNominee(state, party, o) {
    const x = PG.campaign.makeCandidate(state, Object.assign({ officeId: 'president', party, qualityBonus: 6 }, o));
    if (!o || !o.nameRec) x.nameRec = U.round(R.range(state, 60, 80), 1);
    x.cash = Math.round(state.campaign.typicalBudget * 0.15);
    x.homeState = randomHomeState(state);
    x.stateBoost = {}; x.stateBoost[x.homeState] = 4;
    x.nominee = true;
    return x;
  }

  function primaryCands(state) { return state.campaign.candidates.filter((x) => x.active && (x.isPlayer || (x.stages && x.stages.includes('pres_primary')))); }
  function generalCands(state) { return state.campaign.candidates.filter((x) => x.active && (!x.stages || x.stages.includes('general'))); }

  function withState(c, sid, extra) {
    const b = (c.stateBoost && c.stateBoost[sid]) || 0;
    return Object.assign({}, c, { momentum: (c.momentum || 0) + b + (extra || 0) });
  }

  // ---------------------------------------------------------------- primaries
  function primaryType(sid) {
    if (PG.data.caucusStates.includes(sid)) return 'closed'; // caucus-goers are activists
    const t = st(sid).primary;
    return t === 'closed' ? 'closed' : t === 'semi' ? 'semi' : 'open';
  }

  function holdContests(state, month) {
    const c = state.campaign, P = c.pres;
    const states = PG.data.presCalendar[month] || [];
    if (!states.length) return;
    const diff = PG.data.difficulty[state.difficulty];
    const cands = primaryCands(state);
    const natNoise = {};
    cands.forEach((x) => { natNoise[x.id] = R.normal(state, 0, 2 * diff.electionNoise); });
    const rows = [];
    const won = {};
    for (const sid of states) {
      const e = electorateFor(state, sid);
      const sc = cands.map((x) => withState(x, sid));
      const candNoise = {};
      sc.forEach((x) => { candNoise[x.id] = natNoise[x.id] + R.normal(state, 0, 3 * diff.electionNoise); });
      const res = PG.voters.computeVote(e, sc, { mode: 'primary', party: P.party, primaryType: primaryType(sid), kind: 'primary', candNoise, T: 24 });
      const del = allocate(P.party, sid, P.delTable[sid], res.shares);
      for (const [id, n] of Object.entries(del)) { P.delegates[id] = (P.delegates[id] || 0) + n; }
      const winner = Object.entries(res.shares).sort((a, b) => b[1] - a[1])[0][0];
      won[winner] = (won[winner] || 0) + 1;
      rows.push({ id: sid, name: st(sid).name, shares: res.shares, delegates: del, total: P.delTable[sid], winner, caucus: PG.data.caucusStates.includes(sid), rule: ruleName(P.party, sid) });
      P.results.push({ id: sid, month, shares: res.shares, delegates: del, winner });
    }
    // Momentum: winning states (especially early ones) drives coverage and money.
    const early = month <= 2 ? 1.6 : 1;
    for (const x of cands) {
      const w = won[x.id] || 0;
      x.momentum = U.clamp((x.momentum || 0) + (w ? (2 + w * 0.15) * early : -1 * early), -10, 10);
      if (w) { x.nameRec = U.clamp(x.nameRec + 4 * early, 0, 100); x.cash += Math.round(c.typicalBudget * 0.01 * w * early); }
    }
    // Dropouts.
    const leader = Object.entries(P.delegates).sort((a, b) => b[1] - a[1])[0];
    const dropped = [];
    for (const x of cands) {
      if (x.isPlayer) continue;
      const avg = U.sum(rows, (r) => r.shares[x.id] || 0) / rows.length;
      const del = P.delegates[x.id] || 0;
      const rank = Object.entries(P.delegates).filter(([id]) => id === 'player' || (c.candidates.find((y) => y.id === id) || {}).active).sort((a, b) => b[1] - a[1]).findIndex(([id]) => id === x.id);
      if ((month >= 3 && rank >= 2 && R.chance(state, 0.65)) || (month >= 2 && avg < 0.08) || (month >= 3 && del < leader[1] * 0.3) || (month >= 2 && x.cash < 0 && avg < 0.2)) {
        x.active = false; dropped.push(x.name); P.dropped.push({ name: x.name, month });
        // Their endorsement goes to the closest ideological survivor.
        const heir = cands.filter((y) => y.active && y.id !== x.id).sort((a, b) => PG.voters.dist(a.ideology, x.ideology) - PG.voters.dist(b.ideology, x.ideology))[0];
        if (heir) heir.momentum = U.clamp((heir.momentum || 0) + 1.5, -10, 10);
      }
    }
    const remaining = U.sum(Object.entries(PG.data.presCalendar).filter(([m]) => Number(m) > month).map(([, l]) => U.sum(l, (s) => P.delTable[s])));
    const night = {
      kind: 'pres_primary', title: PG.data.parties[P.party].adj + ' primaries — ' + U.MONTHS[month - 1], date: { ...state.date }, rows,
      candidates: cands.map((x) => ({ id: x.id, name: x.isPlayer ? x.name + ' (you)' : x.name, party: x.party, isPlayer: x.isPlayer })),
      delegates: { ...P.delegates }, needed: P.needed, remaining, dropped, notes: [],
    };
    const mine = P.delegates.player || 0;
    night.notes.push('You have ' + mine + ' of ' + P.needed + ' delegates needed. ' + remaining + ' remain to be allocated.');
    if (dropped.length) night.notes.push('Dropped out: ' + dropped.join(', ') + '.');
    night.notes.push(P.party === 'D' ? 'Democratic delegates are allocated proportionally among candidates above 15% in each state.' : 'Republican rules vary: winner-take-all, winner-take-most (all delegates above 50%), or proportional by state.');
    // Clinch check.
    const top = Object.entries(P.delegates).sort((a, b) => b[1] - a[1])[0];
    night.playerAdvanced = true;
    night.message = 'Results are in';
    if (top[1] >= P.needed) {
      if (top[0] === 'player') { night.message = 'You clinched the nomination!'; clinch(state); }
      else { const w = c.candidates.find((x) => x.id === top[0]); night.message = w.name + ' clinched the nomination.'; night.playerAdvanced = false; night.final = true; }
    } else if (month === 6) {
      // Contested convention: the delegate leader prevails on later ballots.
      if (top[0] === 'player') { night.message = 'No majority — you lead into a contested convention and win on the second ballot.'; clinch(state); }
      else { const w = c.candidates.find((x) => x.id === top[0]); night.message = 'No majority — ' + w.name + ' prevails at a contested convention.'; night.playerAdvanced = false; night.final = true; }
    }
    if (month === 3 && !c.pres.otherNominee) chooseOtherNominee(state);
    state.electionNight = night;
    PG.game.log(state, 'election', night.title + ': ' + night.message, night.notes.concat(rows.map((r) => r.name + ': ' + (r.winner === 'player' ? 'you' : (c.candidates.find((x) => x.id === r.winner) || {}).name) + ' won')).slice(0, 12));
    if (!night.playerAdvanced) {
      c.lastResult = { stage: 'pres_primary', playerShare: mine / P.total };
      PG.campaign.endCampaign(state, false, night.message);
    }
  }

  function ruleName(party, sid) {
    if (party === 'D') return 'proportional (15%)';
    if (PG.data.rWinnerTakeAll.includes(sid)) return 'winner-take-all';
    if (PG.data.rProportional.includes(sid)) return 'proportional';
    return 'winner-take-most';
  }

  // Largest-remainder proportional allocation among candidates above a threshold.
  function proportional(n, shares, threshold) {
    let eligible = Object.entries(shares).filter(([, s]) => s >= threshold);
    if (!eligible.length) eligible = [Object.entries(shares).sort((a, b) => b[1] - a[1])[0]];
    const tot = U.sum(eligible, (e) => e[1]);
    const out = {}; let given = 0;
    const rem = eligible.map(([id, s]) => { const q = n * s / tot; out[id] = Math.floor(q); given += out[id]; return [id, q - Math.floor(q)]; }).sort((a, b) => b[1] - a[1]);
    for (let i = 0; given < n; i = (i + 1) % rem.length) { out[rem[i][0]]++; given++; }
    return out;
  }

  function allocate(party, sid, n, shares) {
    if (party === 'D') return proportional(n, shares, 0.15);
    const top = Object.entries(shares).sort((a, b) => b[1] - a[1])[0];
    if (PG.data.rWinnerTakeAll.includes(sid)) return { [top[0]]: n };
    if (PG.data.rProportional.includes(sid)) return proportional(n, shares, 0.15);
    if (top[1] > 0.5) return { [top[0]]: n };
    return proportional(n, shares, 0.2);
  }

  function chooseOtherNominee(state) {
    const c = state.campaign;
    const other = c.pres.party === 'R' ? 'D' : 'R';
    const field = [0, 1, 2, 3].map(() => PG.campaign.makeCandidate(state, { officeId: 'president', party: other, bias: R.pick(state, ['base', 'mainstream', 'moderate']) }));
    const best = R.weighted(state, field, (x) => Math.pow(x.quality, 2) * (x.bias === 'base' ? 1.3 : 1));
    c.pres.otherNominee = makeNominee(state, other, { name: best.name, ideology: best.ideology });
    PG.game.log(state, 'campaign', c.pres.otherNominee.name + ' has clinched the ' + PG.data.parties[other].adj + ' nomination.');
    PG.game.news(state, c.pres.otherNominee.name + ' wins ' + PG.data.parties[other].adj + ' nomination', 0);
  }

  function clinch(state) {
    const c = state.campaign;
    c.pres.nominated = true;
    for (const x of c.candidates) if (!x.isPlayer) x.active = false;
    startGeneral(state);
  }

  function startGeneral(state) {
    const c = state.campaign;
    if (!c.pres.otherNominee) chooseOtherNominee(state);
    if (!c.pres.party) {
      // Independent / third-party run: both major parties field nominees.
      const d = makeNominee(state, 'D', {}), r = makeNominee(state, 'R', {});
      d.stages = null; r.stages = null; c.candidates.push(d, r);
    } else {
      const o = c.pres.otherNominee; o.stages = null; o.active = true;
      if (!c.candidates.includes(o)) c.candidates.push(o);
    }
    c.stageIndex = c.stages.indexOf('general'); c.stage = 'general';
    c.pres.vpChoices = makeVPChoices(state);
    PG.game.log(state, 'campaign', 'On to the general election. Choose a running mate.');
  }

  function makeVPChoices(state) {
    const p = state.player;
    const swing = PG.data.states.filter((s) => Math.abs(s.lean) <= 8 && !s.isDC && s.id !== p.homeState);
    return PG.data.vpArchetypes.map((a) => {
      const home = a.id === 'swing_gov' ? R.pick(state, swing).id : randomHomeState(state, p.homeState);
      const norm = PG.voters.partyNorm(p.party);
      const tilt = a.id === 'base_fav' ? 1.3 : a.id === 'senate_vet' ? 0.9 : 0.6;
      return { id: a.id, name: PG.world.personName(state), home, label: a.label, desc: a.desc, homeBonus: a.homeBonus, base: a.base, swing: a.swing, vetting: a.vetting,
        ideology: { econ: Math.round(norm.econ * tilt), social: Math.round(norm.social * tilt) } };
    });
  }

  function chooseVP(state, id) {
    const c = state.campaign;
    if (!c || !c.pres || !c.pres.vpChoices) return { ok: false, msg: 'No running-mate decision pending.' };
    if (c.pres.vp) return { ok: false, msg: 'You already chose a running mate.' };
    const v = c.pres.vpChoices.find((x) => x.id === id);
    if (!v) return { ok: false, msg: 'Unknown choice.' };
    c.pres.vp = v;
    const pc = PG.campaign.playerCand(state);
    pc.stateBoost[v.home] = (pc.stateBoost[v.home] || 0) + v.homeBonus;
    pc.enthusiasm = (pc.enthusiasm || 0) + v.base;
    for (const b of ['sub_college', 'sub_family', 'working', 'latino']) pc.blocBoost[b] = (pc.blocBoost[b] || 0) + v.swing;
    PG.game.log(state, 'campaign', v.name + ' (' + v.label + ', ' + st(v.home).name + ') is your running mate.', [v.desc]);
    PG.game.news(state, state.player.name + ' taps ' + v.name + ' as running mate', 1);
    if (R.chance(state, v.vetting)) PG.events.scheduleEcho(state, { event: 'vp_vetting', months: [1, 3], chance: 1, vars: { vp: v.name } });
    return { ok: true, msg: 'Running mate chosen.' };
  }

  function setFocus(state, focus) {
    const c = state.campaign;
    if (!c || !c.pres) return { ok: false, msg: 'Not a presidential race.' };
    const list = (focus || []).filter((s) => PG.data.stateById[s]).slice(0, 6);
    c.pres.focus = list;
    return { ok: true, msg: list.length ? 'Focusing on ' + list.join(', ') + '.' : 'No focus states.' };
  }

  // ----------------------------------------------------------- state estimates
  function stateKeys() {
    const out = [];
    for (const s of PG.data.states) {
      out.push(s.id);
      if (PG.data.districtEV[s.id]) for (const d of PG.data.districtEV[s.id]) out.push(d.id);
    }
    return out;
  }

  function genCtx(state) { return { mode: 'general', partisanW: 1, env: state.world.national.environment, nat: 1, kind: 'pres' }; }

  function homeBonus(state, x, sid) {
    const base = sid.split('-')[0];
    return x.homeState === base ? 4 : 0;
  }

  function estimates(state) {
    const cands = generalCands(state);
    const out = {};
    for (const key of stateKeys()) {
      const e = electorateFor(state, key);
      const sid = key.split('-')[0];
      const res = PG.voters.computeVote(e, cands.map((x) => withState(x, sid, homeBonus(state, x, key))), genCtx(state));
      out[key] = res.shares;
    }
    return out;
  }

  function evOf(key) {
    if (key.indexOf('-') > 0) return 1;
    const s = st(key);
    return PG.data.districtEV[key] ? 2 : s.ev;
  }

  // ---------------------------------------------------------------- monthly
  function afterMonth(state) {
    const c = state.campaign, P = c.pres;
    const m = state.date.month, y = state.date.year;
    // Focus states: visits and targeted ads build state-specific boosts.
    const pc = PG.campaign.playerCand(state);
    for (const x of c.candidates) if (x.stateBoost) for (const k of Object.keys(x.stateBoost)) x.stateBoost[k] = U.round(x.stateBoost[k] * 0.9, 3);
    if (P.focus.length) {
      const d = c.plan.days;
      const per = ((d.retail || 0) * 0.35 + (d.media || 0) * 0.15 + (c.plan.adsPct || 0) * 0.04) / P.focus.length;
      for (const s of P.focus) pc.stateBoost[s] = U.clamp((pc.stateBoost[s] || 0) + per, -5, 9);
    }
    if (c.stage === 'pres_primary') {
      if (y === P.year && m >= 1 && m <= 6) {
        holdContests(state, m);
        return;
      }
      // Rivals work the early states.
      for (const x of primaryCands(state)) if (!x.isPlayer) for (const s of ['IA', 'NH', 'SC', 'NV']) x.stateBoost[s] = U.clamp((x.stateBoost[s] || 0) + R.range(state, 0, 0.8) * x.quality / 50, -5, 9);
      return;
    }
    // General election.
    if (c.stage === 'general') {
      if (!P.vp && m >= 8 && P.vpChoices) chooseVP(state, P.vpChoices[0].id);
      if (m === 8 && !P.conventionDone) {
        P.conventionDone = true;
        pc.momentum = U.clamp((pc.momentum || 0) + 2.5, -10, 10);
        const o = generalCands(state).find((x) => !x.isPlayer && x.nominee);
        if (o) o.momentum = U.clamp((o.momentum || 0) + 2, -10, 10);
        PG.game.log(state, 'campaign', 'Convention season: both nominees enjoy a bounce.');
      }
      // Opponent targets the closest states.
      const est = estimates(state);
      const opp = generalCands(state).filter((x) => !x.isPlayer);
      const close = Object.entries(est).filter(([k]) => k.indexOf('-') < 0).sort((a, b) => Math.abs(margin(a[1], state)) - Math.abs(margin(b[1], state))).slice(0, 6).map(([k]) => k);
      for (const o of opp) for (const s of close) o.stateBoost[s] = U.clamp((o.stateBoost[s] || 0) + R.range(state, 0.4, 1.2) * o.quality / 50, -5, 9);
      P.statePolls = close.concat(P.focus.filter((s) => !close.includes(s))).slice(0, 10).map((sid) => statePoll(state, sid, est[sid]));
      P.lastEstimate = est;
      if (m === 11 && y === P.year) runGeneral(state);
    }
  }

  function margin(shares, state) {
    const ids = Object.keys(shares);
    const me = shares.player || 0;
    const best = Math.max.apply(null, ids.filter((i) => i !== 'player').map((i) => shares[i]));
    return me - best;
  }

  function statePoll(state, sid, shares) {
    const diff = PG.data.difficulty[state.difficulty];
    const n = R.pick(state, [600, 800, 1000]);
    const out = {};
    for (const [id, s] of Object.entries(shares)) out[id] = U.round(U.clamp(s * 0.95 + R.normal(state, 0, Math.sqrt(s * (1 - s) / n) * diff.pollNoise), 0, 1) * 100, 1);
    return { state: sid, n, moe: U.round(98 / Math.sqrt(n) * diff.pollNoise, 1), results: out, date: { ...state.date } };
  }

  // ------------------------------------------------------------ the general
  function runGeneral(state) {
    const c = state.campaign;
    const diff = PG.data.difficulty[state.difficulty];
    const cands = generalCands(state);
    const swing = R.normal(state, 0, 2.6 * diff.electionNoise);
    const results = {};
    const ev = {}; cands.forEach((x) => { ev[x.id] = 0; });
    const pop = {}; cands.forEach((x) => { pop[x.id] = 0; });
    for (const key of stateKeys()) {
      const e = electorateFor(state, key);
      const sid = key.split('-')[0];
      const ctx = Object.assign(genCtx(state), { swing: swing + (key.indexOf('-') > 0 ? results[sid].stateNoise : R.normal(state, 0, 2.2 * diff.electionNoise)), regionNoise: true, noiseKey: c.id + key });
      const res = PG.voters.computeVote(e, cands.map((x) => withState(x, sid, homeBonus(state, x, key))), ctx);
      const order = cands.slice().sort((a, b) => res.votes[b.id] - res.votes[a.id]);
      results[key] = { shares: res.shares, votes: res.votes, winner: order[0].id, ev: evOf(key), stateNoise: ctx.swing - swing, total: res.total };
      ev[order[0].id] += evOf(key);
      if (key.indexOf('-') < 0) for (const x of cands) pop[x.id] += res.votes[x.id];
    }
    const sorted = cands.slice().sort((a, b) => ev[b.id] - ev[a.id]);
    let winner = sorted[0];
    const notes = [];
    let contingent = null;
    if (ev[winner.id] < 270) {
      // No majority: the House picks, one vote per state delegation (26 needed).
      const house = state.world.chambers.us_house;
      const tally = {};
      for (const s of PG.data.states) {
        if (s.isDC) continue;
        const mem = house.members.filter((m) => m.state === s.id);
        const d = mem.filter((m) => m.party === 'D').length, r = mem.filter((m) => m.party === 'R').length;
        const party = d > r ? 'D' : r > d ? 'R' : null;
        if (party) tally[party] = (tally[party] || 0) + 1;
      }
      const pick = cands.filter((x) => x.party === 'D' || x.party === 'R').sort((a, b) => (tally[b.party] || 0) - (tally[a.party] || 0))[0] || winner;
      contingent = { tally, winner: pick.id };
      winner = pick;
      notes.push('No candidate reached 270 electoral votes. Under the 12th Amendment the House chose the President, one vote per state delegation: ' + Object.entries(tally).map(([p, n]) => PG.data.parties[p].adj + ' delegations ' + n).join(', ') + ' (26 needed).');
    }
    const totalPop = U.sum(Object.values(pop));
    const opp = cands.find((x) => !x.isPlayer && x.nominee) || sorted.find((x) => !x.isPlayer);
    notes.unshift('Electoral votes: you ' + ev.player + ', ' + opp.name + ' ' + ev[opp.id] + '. Popular vote: you ' + U.fmtPct(pop.player / totalPop) + ', ' + opp.name + ' ' + U.fmtPct(pop[opp.id] / totalPop) + '.');
    const flips = Object.entries(results).filter(([k, r]) => k.indexOf('-') < 0 && Math.abs((r.shares.player || 0) - (r.shares[opp.id] || 0)) < 0.03).map(([k]) => k);
    if (flips.length) notes.push('Decided by under 3 points: ' + flips.join(', ') + '.');
    if (ev.player >= 270 && pop.player < pop[opp.id]) notes.push('You won the Electoral College while losing the national popular vote.');
    if (ev.player < 270 && pop.player > pop[opp.id] && !contingent) notes.push('You won the popular vote but lost the Electoral College.');
    notes.push('National environment ' + U.fmtLean(state.world.national.environment) + '; polling error on the night ' + U.fmtLean(swing) + ' (positive = toward Republicans).');
    if (c.pres.vp) notes.push('Your running mate\'s home state ' + st(c.pres.vp.home).name + ' went ' + (results[c.pres.vp.home].winner === 'player' ? 'your way' : 'against you') + '.');
    const night = buildNight(state, cands, results, ev, pop, winner.id, notes, contingent);
    state.electionNight = night;
    const won = winner.isPlayer;
    c.winnerParty = winner.party;
    c.lastResult = { stage: 'general', playerShare: pop.player / totalPop };
    PG.game.log(state, 'election', 'Presidential election: ' + night.message, notes);
    if (won) {
      state.player.pendingOffice = { officeId: 'president', info: c.info, share: pop.player / totalPop };
      PG.game.news(state, state.player.name + ' elected President', 3);
      PG.campaign.endCampaign(state, true, night.message);
    } else {
      state.world.pendingSeat = { officeId: 'president', name: winner.name, party: winner.party, ideology: winner.ideology, termStart: c.info.termStart };
      PG.campaign.endCampaign(state, false, night.message);
    }
  }

  function buildNight(state, cands, results, ev, pop, winnerId, notes, contingent) {
    const hours = [19, 20, 21, 22, 23, 24, 25, 27];
    const labels = ['7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM', 'Midnight', '1:00 AM', 'Next morning'];
    const steps = [];
    for (let k = 0; k < hours.length; k++) {
      const h = hours[k];
      const sts = {};
      const tally = {}; cands.forEach((x) => { tally[x.id] = 0; });
      for (const [key, r] of Object.entries(results)) {
        const sid = key.split('-')[0];
        const close = PG.data.pollClose[st(sid).tz];
        if (h < close) continue;
        const since = h - close;
        const pct = k === hours.length - 1 ? 1 : U.clamp(0.25 + since * 0.3, 0, 1);
        const m = Math.abs(r.shares[r.winner] - Math.max.apply(null, Object.entries(r.shares).filter(([id]) => id !== r.winner).map(([, s]) => s)));
        const called = k === hours.length - 1 || m > 0.12 || (pct >= 0.85 && m > 0.03) || (pct >= 0.55 && m > 0.07);
        sts[key] = { pct, called: called ? r.winner : null, shares: r.shares };
        if (called) tally[r.winner] += r.ev;
      }
      steps.push({ label: labels[k], states: sts, ev: tally });
    }
    const won = winnerId === 'player';
    return {
      kind: 'pres_general', title: 'Presidential election', date: { ...state.date }, office: 'President of the United States', jurisdiction: 'United States',
      candidates: cands.map((x) => ({ id: x.id, name: x.isPlayer ? x.name + ' (you)' : x.name, party: x.party, isPlayer: x.isPlayer, incumbent: x.incumbent })),
      steps, results, ev, pop, winners: [winnerId], playerAdvanced: won, contingent, notes,
      message: won ? 'You are the President-elect!' : (cands.find((x) => x.id === winnerId) || {}).name + ' wins the presidency.',
      final: { shares: Object.fromEntries(cands.map((x) => [x.id, pop[x.id] / U.sum(Object.values(pop))])) }, calledAt: steps.length - 1, rounds: null, turnout: 0.64, mailLate: false,
    };
  }

  PG.presidential = { setup, afterMonth, chooseVP, setFocus, estimates, electorateFor, delegateTable, allocate, proportional, stateKeys, evOf, runGeneral, primaryCands, generalCands, monthOf };
})(globalThis.PG = globalThis.PG || {});
