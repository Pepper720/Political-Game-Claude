/* Top-level game orchestration: new game, the action dispatcher, month advancement,
 * world elections (all the races the player isn't in), and phase transitions. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;

  function newGame(setup) {
    const seed = String(setup.seed || 'default-seed');
    const state = {
      version: PG.save.VERSION, seed, rng: PG.rng.create(seed), difficulty: PG.data.difficulty[setup.difficulty] ? setup.difficulty : 'normal',
      date: { year: Number(setup.startYear) || 2027, month: 1 }, phase: 'career', idCounter: 0,
      campaign: null, gov: null, electionNight: null, log: [], news: [], groups: {}, media: {},
      events: { active: null, queue: [], fired: {}, lastMonth: {}, echoes: [] }, history: { approval: [], polls: [] }, stats: { months: 0 },
    };
    state.mode = setup.mode === 'party' ? 'party' : 'career';
    if (state.mode === 'party') {
      // Placeholder so character creation accepts the new party; filled in by PG.party.create.
      PG.data.parties.P = { id: 'P', name: setup.partyName || 'New Party', short: 'NEW', adj: setup.partyName || 'New Party', color: '#e07b18', norm: { econ: 0, social: 0 }, custom: true, strength: 0 };
      setup = Object.assign({}, setup, { party: 'P' });
    }
    PG.character.createPlayer(state, setup);
    PG.world.createWorld(state, setup);
    if (state.mode === 'party') PG.party.create(state, setup);
    PG.groups.init(state);
    if (PG.courts) PG.courts.init(state);
    PG.economy.monthly(state);
    PG.cast.ensure(state);
    log(state, 'career', state.player.name + ' begins a political career in ' + state.world.home.city.name + ', ' + PG.data.stateById[state.player.homeState].name + '.');
    return state;
  }

  function log(state, type, text, causes) {
    state.log.unshift({ date: { ...state.date }, type, text, causes: causes && causes.length ? causes : null });
    if (state.log.length > 500) state.log.length = 500;
  }

  function news(state, headline, tone, outlet) {
    const outlets = PG.data.outlets;
    state.news.unshift({ date: { ...state.date }, headline, tone: tone || 0, outlet: outlet || R.pick(state, outlets).name });
    if (state.news.length > 150) state.news.length = 150;
  }

  // ------------------------------------------------------------- the month
  function blockers(state) {
    if (state.phase === 'gameover') return 'The game is over.';
    if (state.events.active) return 'Respond to the event first.';
    if (state.electionNight) return 'Finish watching election night first.';
    return null;
  }

  function advanceMonth(state) {
    const b = blockers(state);
    if (b) return { ok: false, msg: b };
    const p = state.player;
    PG.cast.ensure(state);
    PG.wire.monthly(state);
    if (state.mode === 'party') PG.party.monthly(state);
    if (state.campaign) PG.campaign.processMonth(state);
    if (state.gov) PG.gov.monthly(state, !!state.campaign);
    if (PG.courts) PG.courts.monthly(state);
    PG.economy.monthly(state);
    aiExecutives(state);
    PG.world.updateEnvironment(state);
    if (state.date.month === 11) worldElections(state, state.mode === 'party' ? PG.party.elections(state) : null);
    PG.scandals.decay(state);
    if (!state.campaign) p.fatigue = U.round(p.fatigue * 0.6, 1);
    if (!state.campaign && !state.gov) idleMonth(state);
    if (state.gov && state.gov.kind === 'executive') {
      const exKey = state.gov.officeId === 'mayor' ? 'mayor' : state.gov.officeId;
      if (state.world.executives[exKey]) state.world.executives[exKey].approval = state.gov.approval.overall;
    }
    PG.cast.monthly(state);
    PG.wire.endOfMonth(state);
    state.date = U.addMonths(state.date, 1);
    state.stats.months++;
    if (state.date.month === 1 && state.date.year % 10 === 2 && state.world.lastRedistrict !== state.date.year) PG.world.redistrict(state);
    transitions(state);
    if (state.phase !== 'gameover') { PG.arcs.monthly(state); PG.events.roll(state); }
    return { ok: true };
  }

  function idleMonth(state) {
    const p = state.player;
    p.nameRec = U.round(Math.max(0, p.nameRec * 0.985), 1);
  }

  function transitions(state) {
    const p = state.player;
    // New terms begin in January.
    if (state.world.pendingSeat && U.dateCmp(state.date, state.world.pendingSeat.termStart) >= 0) applyPendingSeat(state);
    if (p.pendingOffice && U.dateCmp(state.date, p.pendingOffice.info.termStart) >= 0) {
      const po = p.pendingOffice; p.pendingOffice = null;
      PG.gov.assumeOffice(state, po.officeId, po.info, po.share);
    }
    if (p.office && U.dateCmp(state.date, p.office.termEnd) >= 0) {
      const o = PG.data.officeById[p.office.officeId];
      log(state, 'career', 'Your term as ' + o.name + ' has ended.');
      PG.gov.leaveOffice(state, 'term_end');
    }
    if (p.declared && U.dateCmp(state.date, p.declared.campaignStart) >= 0) {
      const r = PG.campaign.start(state, p.declared.officeId);
      if (!r.ok) { log(state, 'career', 'Could not launch your campaign: ' + r.msg); p.declared = null; }
    }
    if (p.retiring && !p.office && !state.campaign && state.mode !== 'party') endGame(state, 'retired');
    if (U.age(state) >= 88 && !p.office && !state.campaign) endGame(state, 'age');
    state.phase = state.phase === 'gameover' ? 'gameover' : state.mode === 'party' ? 'party' : state.campaign ? 'campaign' : p.office ? 'governing' : 'career';
  }

  function applyPendingSeat(state) {
    const ps = state.world.pendingSeat;
    state.world.pendingSeat = null;
    const o = PG.data.officeById[ps.officeId];
    if (o.kind === 'executive') {
      const key = ps.officeId === 'mayor' ? 'mayor' : ps.officeId;
      const ex = state.world.executives[key];
      if (ex && !ex.isPlayer) Object.assign(ex, { name: ps.name, party: ps.party, econ: ps.ideology.econ, social: ps.ideology.social, approval: 52, termNumber: ex.name === ps.name ? (ex.termNumber || 1) + 1 : 1 });
      return;
    }
    const chId = PG.juris.bodyFor(state, ps.officeId);
    const ch = state.world.chambers[chId];
    let m = null;
    if (ps.officeId === 'us_senate') m = ch.members.find((x) => x.state === state.player.homeState && x.senateClass === ps.senateClass && !x.isPlayer);
    else if (ps.officeId === 'school_board') m = ch.members.find((x) => !x.isPlayer);
    else m = ch.members[PG.world.seatIndexFor(state, chId)];
    if (m && !m.isPlayer && m.name !== ps.name) {
      Object.assign(m, { name: ps.name, party: ps.party === 'D' || ps.party === 'R' ? ps.party : 'I', econ: ps.ideology.econ, social: ps.ideology.social, seniority: 0, rel: 0 });
      PG.world.setLeadership(state, ch); PG.gov.fixChairs(state, ch);
    }
  }

  // AI executives' approval drifts with the economy and noise.
  function aiExecutives(state) {
    const ex = state.world.executives;
    const econ = PG.economy.score(state, 'federal');
    for (const [k, e] of Object.entries(ex)) {
      if (!e || e.isPlayer) continue;
      const target = (k === 'president' ? 46 : 50) + econ * (k === 'president' ? 2 : 1) - (k === 'president' ? Math.min(6, (state.date.year - (e.electedYear || state.date.year)) * 1.2) : 0);
      e.approval = U.round(U.clamp(e.approval + 0.12 * (target - e.approval) + R.normal(state, 0, 1.2), 22, 75), 1);
    }
  }

  /* November: every race the player isn't in is decided by fundamentals. */
  function worldElections(state, protectedSeats) {
    const prot = protectedSeats || new Set();
    const y = state.date.year;
    const p = state.player;
    const env = state.world.national.environment;
    const running = state.campaign ? state.campaign.officeId : null;
    const st = PG.juris.homeState(state);
    const summary = [];
    // President.
    if (y % 4 === 0 && running !== 'president' && !(p.office && p.office.officeId === 'president') && !(state.party && state.party.presidentialRun && state.party.presidentialRun.year === y)) {
      const pr = state.world.executives.president;
      const open = (pr.termNumber || 1) >= 2;
      const incAdv = open ? 0 : 3;
      const score = (pr.approval - 47) * 0.6 + PG.economy.score(state, 'federal') * 1.5 + incAdv + R.normal(state, 0, 4) - (open ? 2 : 0);
      if (score > 0) {
        if (open) { const np = PG.world.createExecutive(state, pr.party, pr.party === 'R' ? 10 : -10, 'President'); np.electedYear = y + 1; np.termNumber = 1; state.world.executives.president = np; summary.push(np.name + ' (' + pr.party + ') won the open presidency'); }
        else { pr.termNumber = (pr.termNumber || 1) + 1; pr.electedYear = y + 1; summary.push('President ' + pr.name + ' won reelection'); }
      } else {
        const party = pr.party === 'D' ? 'R' : 'D';
        const np = PG.world.createExecutive(state, party, party === 'R' ? 10 : -10, 'President');
        np.electedYear = y + 1; np.termNumber = 1;
        state.world.executives.president = np;
        summary.push(np.name + ' (' + party + ') won the presidency');
      }
      state.world.chambers.us_senate.tieBreakParty = state.world.executives.president.party;
    }
    // Governor and mayor races.
    if (!st.isDC && PG.calendar.onBallot(state, 'governor', y) && running !== 'governor' && !(p.office && p.office.officeId === 'governor') && !prot.has('governor')) {
      execRace(state, 'governor', st.lean + env * 0.6, summary);
    }
    if (PG.calendar.onBallot(state, 'mayor', y) && running !== 'mayor' && !(p.office && p.office.officeId === 'mayor')) {
      execRace(state, 'mayor', state.world.home.city.lean * 0.6 + env * 0.3, summary);
    }
    // Legislatures.
    if (y % 2 === 0) {
      chamberElections(state, 'us_house', (m, i) => !prot.has('us_house:' + i), env, summary);
      chamberElections(state, 'us_senate', (m, i) => !prot.has('us_senate:' + i) && m.senateClass === PG.calendar.senateClassUp(PG.data.stateById[m.state], y), env, summary);
    }
    const oddLeg = PG.calendar.ODD_YEAR_LEGISLATURES.includes(st.id);
    if (!st.isDC && (y % 2 === 1) === oddLeg) {
      if (state.world.chambers.state_house) chamberElections(state, 'state_house', (m, i) => !prot.has('state_house:' + i) && (st.houseTerm === 2 || R.chance(state, 0.5)), env * 0.7, summary);
      chamberElections(state, 'state_senate', (m, i) => !prot.has('state_senate:' + i) && (st.senateTerm === 2 || R.chance(state, 0.5)), env * 0.7, summary);
    }
    if (y % 2 === 1) chamberElections(state, 'council', (m, i) => !prot.has('council:' + i) && R.chance(state, 0.5), env * 0.2, summary);
    if (summary.length) log(state, 'world', 'Election results around the country and state.', summary);
  }

  function execRace(state, key, lean, summary) {
    const ex = state.world.executives[key];
    if (!ex || ex.isPlayer) return;
    const incAdv = (ex.approval - 47) * 0.5 + 3;
    const termLimited = key === 'governor' && (ex.termNumber || 1) >= 2 && PG.juris.homeState(state).govLimit !== 'none';
    const m = lean + (termLimited ? 0 : (ex.party === 'R' ? incAdv : -incAdv)) + R.normal(state, 0, 7);
    const party = m > 0 ? 'R' : 'D';
    if (!termLimited && party === ex.party) { ex.termNumber = (ex.termNumber || 1) + 1; summary.push(ex.title + ' ' + ex.name + ' reelected'); return; }
    const leanBase = key === 'mayor' ? state.world.home.city.lean : PG.juris.homeState(state).lean;
    const ne = PG.world.createExecutive(state, party, leanBase, ex.title);
    ne.termNumber = 1;
    state.world.executives[key] = ne;
    summary.push(ne.name + ' (' + party + ') elected ' + ex.title);
  }

  function chamberElections(state, chId, filter, env, summary) {
    const ch = state.world.chambers[chId];
    if (!ch) return;
    const before = ch.partisan ? { ...ch.counts } : null;
    for (let i = 0; i < ch.members.length; i++) {
      const m = ch.members[i];
      if (m.isPlayer || !filter(m, i)) continue;
      if (state.campaign && PG.juris.bodyFor(state, state.campaign.officeId) === chId && PG.world.seatIndexFor(state, chId) === i) continue;
      const retiring = R.chance(state, 0.06 + (m.seniority > 18 ? 0.12 : 0));
      const inc = retiring ? 0 : 4 + m.seniority * 0.1;
      const margin = m.lean + env + (m.party === 'R' ? inc : -inc) + R.normal(state, 0, 6);
      const winner = margin > 0 ? 'R' : 'D';
      if (!ch.partisan) {
        if (retiring || R.chance(state, 0.15)) replaceMember(state, ch, i, winner);
        else m.seniority += 2;
        continue;
      }
      if (m.party === 'P') {
        // Third-party incumbents hold on through personal brand; the wasted-vote penalty fades once elected.
        const s = PG.data.parties.P ? PG.data.parties.P.strength : 0;
        if (retiring || R.chance(state, 0.32 - s * 0.2)) replaceMember(state, ch, i, winner); else m.seniority += 2;
        continue;
      }
      if (retiring || winner !== m.party) replaceMember(state, ch, i, winner);
      else m.seniority += chId === 'us_senate' ? 6 : 2;
    }
    PG.world.setLeadership(state, ch);
    PG.gov.fixChairs(state, ch);
    if (before && (before.D !== ch.counts.D)) summary.push(ch.name + ': ' + PG.world.chamberControlSummary(ch) + ' (was D ' + before.D + ', R ' + before.R + ')');
  }

  function replaceMember(state, ch, i, party) {
    const old = ch.members[i];
    const nm = PG.world.genMember(state, ch.id, i, old.lean, old.state);
    if (ch.partisan && nm.party !== party) {
      nm.party = party;
      const ideo = PG.world.moderateIdeology(state, party, old.lean);
      nm.econ = ideo.econ; nm.social = ideo.social;
    }
    nm.id = old.id; nm.district = old.district; nm.senateClass = old.senateClass; nm.seniority = 0; nm.committees = old.committees.slice();
    ch.members[i] = nm;
  }

  // -------------------------------------------------------------- career
  function declare(state, officeId) {
    const el = PG.character.eligibility(state, officeId);
    if (!el.ok) return { ok: false, msg: el.reasons.join(' ') };
    if (state.gov && state.gov.decision === 'retiring') state.gov.decision = null;
    if (U.dateCmp(el.info.campaignStart, state.date) > 0) {
      state.player.declared = { officeId, campaignStart: el.info.campaignStart, info: el.info };
      log(state, 'career', 'You will run for ' + PG.data.officeById[officeId].name + '. The campaign begins in ' + U.fmtDate(el.info.campaignStart) + '.');
      return { ok: true, msg: 'Declared. Campaign kicks off ' + U.fmtDate(el.info.campaignStart) + '.' };
    }
    return PG.campaign.start(state, officeId);
  }

  function fastForward(state, maxMonths) {
    let n = 0;
    const target = state.player.declared ? state.player.declared.campaignStart : null;
    while (n < (maxMonths || 120)) {
      if (blockers(state)) break;
      if (state.campaign || state.phase === 'gameover') break;
      if (target && U.dateCmp(state.date, target) >= 0) break;
      if (state.gov && (state.gov.decision === 'pending' || (state.gov.desk && state.gov.desk.length) || state.gov.budgetStage === 'drafting' || state.gov.budgetStage === 'counter' || state.gov.docket.length)) break;
      advanceMonth(state);
      n++;
    }
    return { ok: true, msg: 'Skipped ' + U.plural(n, 'month') + '.' };
  }

  function retire(state) {
    const p = state.player;
    if (state.mode === 'party') { endGame(state, 'retired'); return { ok: true, msg: 'You stepped down as party chair.' }; }
    if (state.campaign) PG.campaign.endCampaign(state, false, 'Withdrew.');
    if (p.office) {
      p.retiring = true;
      if (state.gov) state.gov.decision = 'retiring';
      log(state, 'career', 'You announced you will retire at the end of your term (' + U.fmtDate(p.office.termEnd) + ').');
      return { ok: true, msg: 'You will retire when your term ends.' };
    }
    endGame(state, 'retired');
    return { ok: true, msg: 'You have retired from politics.' };
  }

  function endGame(state, why) {
    state.phase = 'gameover';
    state.gameOver = { why, date: { ...state.date }, score: legacyScore(state) };
    log(state, 'career', why === 'age' ? 'Age catches up with everyone. Your career is over.' : 'You retired from public life.');
  }

  function legacyScore(state) {
    if (state.mode === 'party') return PG.party.legacyScore(state);
    const p = state.player;
    let s = 0;
    for (const h of p.history) {
      const o = PG.data.officeById[h.officeId];
      const yrs = U.monthsBetween(h.start, h.end || state.date) / 12;
      s += o.rank * o.rank * 10 * yrs / 4 + 25;
    }
    s += p.legacy.laws.length * 15 + U.sum(p.legacy.elections, (e) => (e.won ? 10 : 0));
    return Math.round(s);
  }

  // Difficulty can change mid-game: only tuning parameters change, never rules.
  function setDifficulty(state, level) {
    if (!PG.data.difficulty[level]) return { ok: false, msg: 'Unknown difficulty.' };
    if (state.difficulty === level) return { ok: true, msg: 'Already on ' + PG.data.difficulty[level].name + '.' };
    const from = PG.data.difficulty[state.difficulty].name;
    state.difficulty = level;
    state.stats.difficultyChanges = (state.stats.difficultyChanges || 0) + 1;
    log(state, 'career', 'Difficulty changed from ' + from + ' to ' + PG.data.difficulty[level].name + '.');
    return { ok: true, msg: 'Difficulty set to ' + PG.data.difficulty[level].name + '.' };
  }

  // ------------------------------------------------------------- dispatcher
  function act(state, a) {
    const T = a.type;
    try {
      switch (T) {
        case 'endMonth': return advanceMonth(state);
        case 'career.declare': return declare(state, a.officeId);
        case 'career.undeclare': state.player.declared = null; return { ok: true, msg: 'Declaration withdrawn.' };
        case 'career.fastForward': return fastForward(state, a.months);
        case 'career.retire': return retire(state);
        case 'event.choose': return PG.events.choose(state, a.i);
        case 'election.dismiss': state.electionNight = null; return { ok: true };
        case 'campaign.setPlan': return PG.campaign.setPlan(state, a.plan);
        case 'campaign.rollout': return PG.campaign.rollout(state, a.issue, a.stance);
        case 'campaign.poll': return PG.campaign.commissionPoll(state);
        case 'campaign.endorse': return PG.campaign.seekEndorsement(state, a.group);
        case 'campaign.pledge': return PG.campaign.pledgeNoPAC(state);
        case 'campaign.releaseOppo': return PG.campaign.releaseOppo(state, a.id);
        case 'campaign.withdraw': PG.campaign.endCampaign(state, false, 'Withdrew from the race.'); log(state, 'career', 'You withdrew from the race.'); return { ok: true, msg: 'Withdrawn.' };
        case 'campaign.vp': return PG.presidential.chooseVP(state, a.id);
        case 'campaign.stateFocus': return PG.presidential.setFocus(state, a.focus);
        case 'gov.introduce': return PG.leg.introduce(state, a.lawId, Number(a.scope) || 2);
        case 'gov.whip': return PG.leg.whip(state, a.billId, a.memberId);
        case 'gov.deal': return PG.leg.deal(state, a.billId, a.memberId);
        case 'gov.cosponsors': return PG.leg.seekCosponsors(state, a.billId);
        case 'gov.push': return PG.leg.pushBill(state, a.billId);
        case 'gov.public': return PG.leg.goPublic(state, a.billId);
        case 'gov.stance': return PG.leg.setStance(state, a.billId, a.stance);
        case 'gov.vote': return PG.leg.castVote(state, a.billId, a.v);
        case 'gov.reconcile': return PG.leg.requestReconciliation(state, a.billId);
        case 'gov.strip': return PG.leg.stripPill(state, a.billId);
        case 'gov.holdout': return PG.leg.resolveHoldout(state, a.billId, a.memberId, !!a.accept);
        case 'gov.hearing': return PG.leg.holdHearing(state, a.billId);
        case 'settings.difficulty': return setDifficulty(state, a.level);
        case 'party.act': return PG.party.act(state, a.kind, a.arg);
        case 'phone.answer': return PG.cast.answer(state, a.uid, a.i);
        case 'gov.discharge': return PG.leg.discharge(state, a.billId);
        case 'gov.bury': return PG.leg.bury(state, a.billId);
        case 'gov.sign': return PG.leg.sign(state, a.billId);
        case 'gov.veto': return PG.leg.veto(state, a.billId);
        case 'gov.action': return PG.gov.act(state, a.kind, a.arg);
        case 'gov.budgetSubmit': return PG.executive.submitBudget(state, a.proposal);
        case 'gov.budgetCounter': return PG.executive.respondCounter(state, a.choice);
        case 'gov.budgetVote': return PG.executive.setBudgetVote(state, a.v);
        case 'gov.earmark': return PG.executive.requestEarmark(state);
        case 'gov.eo': return PG.executive.issueEO(state, a.eoId);
        case 'gov.rescind': return PG.executive.rescindEO(state, a.id);
        case 'gov.nominate': return PG.executive.nominate(state, a.pos, a.nominee);
        case 'gov.fire': return PG.executive.fire(state, a.pos);
        case 'gov.address': return PG.executive.address(state);
        case 'gov.caseDefend': return PG.courts.defend(state, a.id);
        case 'gov.caseSettle': return PG.courts.settle(state, a.id);
        case 'gov.judge': return PG.courts.nominateJudge(state, a.seat, a.nominee);
        case 'gov.decide':
          if (a.choice === 'retire') return retire(state);
          if (a.choice === 'reelect') return declare(state, state.player.office.officeId);
          return { ok: false, msg: 'Unknown choice.' };
        default: return { ok: false, msg: 'Unknown action: ' + T };
      }
    } catch (e) {
      log(state, 'error', 'Internal error during ' + T + ': ' + e.message);
      return { ok: false, msg: 'Something went wrong: ' + e.message, error: e };
    }
  }

  PG.game = { setDifficulty, newGame, log, news, advanceMonth, act, declare, fastForward, retire, endGame, legacyScore, worldElections, blockers };
})(globalThis.PG = globalThis.PG || {});
