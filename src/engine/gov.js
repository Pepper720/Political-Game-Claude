/* Governing: taking office, monthly upkeep (outcomes, capital, approval), personal
 * actions (time-limited), and leaving office. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;

  const ACTIONS_PER_MONTH = 3;

  function office(id) { return PG.data.officeById[id]; }

  function seatPlayer(state, officeId) {
    const p = state.player;
    const body = PG.juris.bodyFor(state, officeId);
    const ch = state.world.chambers[body];
    let idx = PG.world.seatIndexFor(state, body);
    if (officeId === 'school_board') idx = ch.members.findIndex((m) => m.id !== ch.leaders.majority && !m.isPlayer);
    if (officeId === 'us_senate') {
      const info = state.campaign && state.campaign.info;
      idx = ch.members.findIndex((m) => m.state === p.homeState && (!info || !info.senateClass || m.senateClass === info.senateClass));
    }
    const old = ch.members[idx];
    const prior = PG.character.termsServed(state, officeId).length;
    const me = { id: old.id, name: p.name, party: p.party === 'D' || p.party === 'R' ? p.party : 'I', econ: p.ideology.econ, social: p.ideology.social, lean: old.lean,
      seniority: prior * PG.calendar.termLength(officeId, PG.juris.homeState(state)), loyalty: 0.8, state: old.state, district: old.district, rel: 0, committees: [], isPlayer: true, senateClass: old.senateClass };
    ch.members[idx] = me;
    // Committee assignments: two committees, preferring the background's expertise.
    const pref = { teacher: ['education', 'curriculum', 'edwork', 'help'], lawyer: ['judiciary'], police: ['judiciary', 'safety'], veteran: ['armed', 'homeland'], business: ['commerce', 'budget', 'finance', 'ways'],
      doctor: ['health', 'energy', 'finance'], farmer: ['ag', 'environment'], union: ['commerce', 'edwork', 'help'], tech: ['commerce', 'energy'], nonprofit: ['land', 'health'], activist: ['land', 'judiciary'], clergy: ['health', 'education'], journalist: ['elections', 'admin', 'judiciary'] }[p.background] || [];
    const comms = ch.committees.slice().sort((a, b) => (pref.includes(b.id) ? 1 : 0) - (pref.includes(a.id) ? 1 : 0));
    for (const c of ch.committees) c.members = c.members.filter((x) => x !== me.id);
    comms.slice(0, ch.members.length <= 9 ? 2 : 2).forEach((c) => { c.members.push(me.id); me.committees.push(c.id); });
    for (const c of ch.committees) if (c.chair === me.id && !me.committees.includes(c.id)) c.chair = null;
    PG.world.setLeadership(state, ch);
    fixChairs(state, ch);
    return { ch, me, replaced: old };
  }

  // Ensure each committee has a chair from the majority (by seniority).
  function fixChairs(state, ch) {
    for (const c of ch.committees) {
      const mems = c.members.map((id) => ch.members.find((m) => m.id === id)).filter(Boolean);
      const maj = ch.partisan ? mems.filter((m) => m.party === ch.majority) : mems;
      const best = U.sortBy(maj, (m) => -(m.seniority + (m.isPlayer ? (state.player.partyRel - 50) / 25 : 0)))[0];
      c.chair = best ? best.id : null;
    }
  }

  function assumeOffice(state, officeId, info, voteShare) {
    const p = state.player;
    const o = office(officeId);
    const prev = p.office;
    if (prev) leaveOffice(state, prev.officeId === officeId ? 'reelected' : 'moved');
    const level = PG.juris.OFFICE_LEVEL[officeId];
    const key = PG.juris.OFFICE_KEY[officeId];
    const reelected = prev && prev.officeId === officeId;
    const termNumber = reelected ? prev.termNumber + 1 : 1;
    p.office = { officeId, start: { ...state.date }, termEnd: { year: state.date.year + info.termYears, month: 1 }, termNumber, key, level, senateClass: info.senateClass || null };
    p.history.push({ officeId, start: { ...state.date }, end: null, jurisdiction: PG.juris.describe(state, key), termNumber });
    const body = PG.juris.bodyFor(state, officeId);
    const keepGov = reelected && state.gov;
    if (o.kind === 'legislator' && !reelected) seatPlayer(state, officeId);
    if (o.kind === 'executive') {
      const exKey = officeId === 'mayor' ? 'mayor' : officeId;
      const ex = state.world.executives[exKey] || {};
      state.world.executives[exKey] = { ...ex, name: p.name, party: p.party, econ: p.ideology.econ, social: p.ideology.social, title: o.short, isPlayer: true, approval: 50 };
    }
    if (!keepGov) {
      state.gov = {
        officeId, key, level, kind: o.kind, body, approval: null, outcomes: {}, lawOutcomes: {}, record: {}, mods: {}, bills: [], enacted: [], docket: [], desk: [],
        voteRecord: [], eos: [], cabinet: {}, nominees: {}, honeymoon: 0, missedVotes: 0, monthsInOffice: 0, actionsLeft: ACTIONS_PER_MONTH, decision: null,
        budget: PG.budget.createBudget(state, level), budgetDraft: null, budgetStage: null, shutdown: false, earmarks: 0, defections: 0, townHalls: 0,
      };
      for (const k of PG.approval.OUTCOMES_BY_LEVEL[level]) state.gov.outcomes[k] = U.round(50 + R.normal(state, 0, 6), 1);
      PG.approval.init(state, 50 + ((voteShare || 0.52) - 0.5) * 50);
      if (o.kind === 'executive' && PG.executive) PG.executive.initCabinet(state);
    } else {
      state.gov.decision = null;
      state.gov.honeymoon = 2;
      state.gov.missedVotes = 0;
    }
    p.capital = Math.max(p.capital, 10);
    PG.game.log(state, 'career', 'Sworn in as ' + o.name + ' (' + PG.juris.describe(state, key) + ')' + (termNumber > 1 ? ', term ' + termNumber : '') + '.');
    PG.game.news(state, p.name + ' sworn in as ' + o.short, 1);
    state.phase = state.campaign ? 'campaign' : 'governing';
  }

  function leaveOffice(state, reason) {
    const p = state.player;
    if (!p.office) return;
    const h = p.history[p.history.length - 1];
    if (h && !h.end) h.end = { ...state.date };
    const o = office(p.office.officeId);
    if (reason !== 'reelected') {
      if (o.kind === 'legislator') {
        const body = PG.juris.bodyFor(state, p.office.officeId);
        const ch = state.world.chambers[body];
        const idx = ch.members.findIndex((m) => m.isPlayer);
        if (idx >= 0) {
          const old = ch.members[idx];
          const repl = PG.world.genMember(state, body, idx, old.lean, old.state);
          repl.id = old.id; repl.district = old.district; repl.senateClass = old.senateClass;
          ch.members[idx] = repl;
          PG.world.setLeadership(state, ch); fixChairs(state, ch);
        }
      } else {
        const exKey = p.office.officeId === 'mayor' ? 'mayor' : p.office.officeId;
        const lean = exKey === 'mayor' ? state.world.home.city.lean : exKey === 'governor' ? PG.juris.homeState(state).lean : 0;
        const party = state.campaign && state.campaign.winnerParty ? state.campaign.winnerParty : (R.chance(state, 0.5) ? 'D' : 'R');
        state.world.executives[exKey] = PG.world.createExecutive(state, party, lean, o.short);
      }
      p.legacy.finalApproval = state.gov ? state.gov.approval.overall : null;
      state.gov = null;
    }
    p.office = reason === 'reelected' ? p.office : null;
  }

  function monthlyCapital(state) {
    const g = state.gov, p = state.player;
    const diff = PG.data.difficulty[state.difficulty];
    const base = g.kind === 'executive' ? 7 : 5;
    const add = (base + (g.approval.overall - 50) / 6 + (g.kind === 'legislator' ? (p.partyRel - 50) / 25 : 0) + PG.character.jobMods(state).capital * 2) * diff.capital;
    const cap = g.kind === 'executive' ? 60 : 40;
    p.capital = U.round(U.clamp(p.capital + Math.max(1, add), 0, cap), 1);
  }

  function updateOutcomes(state) {
    const g = state.gov;
    const q = PG.budget.serviceQuality(g.budget);
    for (const k of Object.keys(g.outcomes)) {
      const quality = q[k] !== undefined ? q[k] : (k === 'safety' ? q.crime || 1 : 1);
      let t = k === 'crime' ? 50 - 40 * (quality - 1) : 50 + 40 * (quality - 1);
      t += (g.lawOutcomes[k] || 0) * 2.2;
      if (k === 'crime') t += (state.world.local.unemployment - 4.5) * 1.5;
      t += cabinetBonus(state, k);
      const om = PG.character.jobMods(state).outcome[k];
      if (om) t += (k === 'crime' ? -om : om) * (g.kind === 'executive' ? 1 : 0.4);
      g.outcomes[k] = U.round(U.clamp(g.outcomes[k] + 0.08 * (t - g.outcomes[k]) + R.normal(state, 0, 0.4), 0, 100), 1);
    }
  }

  function cabinetBonus(state, outcome) {
    const g = state.gov;
    if (g.kind !== 'executive' || !g.cabinet) return 0;
    const area = outcome === 'safety' ? 'crime' : outcome;
    let b = 0;
    for (const c of Object.values(g.cabinet)) {
      if (!c) continue;
      if (c.area === area || (c.area === 'efficiency')) b += (c.competence - 50) / (c.area === 'efficiency' ? 40 : 12) * (outcome === 'crime' ? -1 : 1);
    }
    return b;
  }

  // Reelection decision window: the next election for this office is near.
  function checkDecision(state) {
    const g = state.gov, p = state.player;
    if (state.campaign || g.decision === 'retiring' || g.decision === 'declined') return;
    const info = PG.calendar.electionInfo(state, p.office.officeId, p.office.termEnd.year - 1);
    if (!PG.calendar.onBallot(state, p.office.officeId, p.office.termEnd.year - 1)) return;
    if (U.dateCmp(state.date, info.campaignStart) >= 0 && U.dateCmp(state.date, info.filingDeadline) <= 0) g.decision = 'pending';
    if (U.dateCmp(state.date, info.filingDeadline) > 0 && g.decision === 'pending') {
      g.decision = 'declined';
      PG.game.log(state, 'career', 'The filing deadline passed — you are not seeking reelection. Your term ends ' + U.fmtDate(p.office.termEnd) + '.');
    }
  }

  function monthly(state, autopilot) {
    const g = state.gov;
    g.monthsInOffice++;
    PG.leg.monthly(state, autopilot);
    if (PG.executive) PG.executive.monthly(state, autopilot);
    updateOutcomes(state);
    PG.groups.monthly(state);
    // The press cycle: relations with reporters tint how everything else is covered.
    const tone = U.clamp(state.player.media / 60, -1, 1) * 0.35;
    if (Math.abs(tone) > 0.05) for (const b of Object.keys(g.approval.byBloc)) g.mods[b] = (g.mods[b] || 0) + tone;
    // Personality at work: firebrands energize the base; colleagues warm to dealmakers or cool on firebrands.
    const jmods = PG.character.jobMods(state);
    if (jmods.base) for (const b of PG.effects.blocGroups(state, PG.juris.electorate(state, g.key)).base) g.mods[b] = (g.mods[b] || 0) + jmods.base;
    if (jmods.colleagues) for (const c of PG.juris.chambersFor(state, g.level)) state.world.chambers[c].members.forEach((m) => { if (!m.isPlayer) m.rel = U.clamp((m.rel || 0) + jmods.colleagues, -100, 100); });
    // Sunset clauses expire.
    for (const en of g.enacted) {
      if (en.active && en.sunset && U.dateCmp(state.date, en.sunset) >= 0) {
        PG.courts.toggleLaw(state, en, false); en.sunset = null; en.expired = true;
        PG.game.log(state, 'legislation', PG.data.lawById[en.lawId].name + ' expired under its sunset clause.');
      }
    }
    PG.approval.monthly(state);
    monthlyCapital(state);
    g.actionsLeft = ACTIONS_PER_MONTH + jmods.actions;
    checkDecision(state);
    if (PG.campaign && PG.campaign.primaryThreat) PG.campaign.primaryThreat(state);
  }

  // ---------------------------------------------------------- personal actions
  function useAction(state) {
    if (state.gov.actionsLeft <= 0) return false;
    state.gov.actionsLeft--;
    return true;
  }

  function act(state, kind, arg) {
    const g = state.gov, p = state.player;
    if (!g) return { ok: false, msg: 'Not in office.' };
    if (!useAction(state)) return { ok: false, msg: 'No time left this month (3 personal actions per month).' };
    switch (kind) {
      case 'townhall': {
        // Risky: rewards charisma, punishes unpopular officials.
        const skill = PG.character.stat(state, 'charisma') / 100;
        const roll = R.next(state) + skill * 0.4 - (g.approval.overall < 40 ? 0.15 : 0) + PG.character.jobMods(state).townhall;
        g.townHalls++;
        if (roll > 0.55) {
          PG.effects.apply(state, { approval: { all: 1.2, swing: 0.8 } });
          PG.game.log(state, 'action', 'Your town hall went well — constituents felt heard.', ['Charisma ' + Math.round(skill * 100) + '; roll favorable']);
          return { ok: true, msg: 'The town hall went well.' };
        }
        if (roll < 0.3) {
          PG.effects.apply(state, { approval: { all: -1, base: -0.5 }, media: -2 });
          PG.game.log(state, 'action', 'A heated town hall went viral for the wrong reasons.', ['Approval ' + g.approval.overall + '% made the crowd hostile']);
          return { ok: true, msg: 'The town hall turned ugly and the clip went viral.' };
        }
        PG.effects.apply(state, { approval: { all: 0.4 } });
        return { ok: true, msg: 'A respectful, uneventful town hall.' };
      }
      case 'fundraiser': {
        const tb = PG.juris.typicalBudget(state, p.office.officeId);
        const amt = Math.round(tb * 0.035 * (PG.character.stat(state, 'fundraising') / 50) * (g.kind === 'executive' ? 1.4 : 1) * (1 + Math.max(-0.5, PG.character.jobMods(state).fundraise)) * (0.8 + R.next(state) * 0.4));
        p.cash += amt;
        let note = '';
        if (R.chance(state, 0.3 * ((p.mods.commitmentRate) || 1))) {
          const donors = PG.data.groups.filter((x) => PG.groups.rel(state, x.id) > 10 && x.money >= 3);
          const gpick = donors.length ? R.pick(state, donors) : null;
          const c = gpick && PG.groups.addCommitment(state, gpick.id);
          if (c) note = ' ' + c.text;
        }
        PG.game.log(state, 'money', 'Fundraiser raised ' + U.fmtMoney(amt) + ' for your war chest.' + note);
        return { ok: true, msg: 'Raised ' + U.fmtMoney(amt) + '.' + note };
      }
      case 'district': {
        // Constituent services / ribbon cuttings: modest, safe local approval.
        const k = 1 + PG.character.jobMods(state).constituent;
        PG.effects.apply(state, { approval: { all: 0.6 * k, swing: 0.4 * k } });
        p.nameRec = U.clamp(p.nameRec + 1, 0, 100);
        return { ok: true, msg: 'Constituent services and local appearances (+approval).' };
      }
      case 'media': {
        const m = p.media;
        const good = R.chance(state, U.clamp(0.55 + m / 200 + (PG.character.stat(state, 'charisma') - 50) / 200 + PG.character.jobMods(state).media, 0.2, 0.92));
        PG.effects.apply(state, good ? { approval: 0.8, nameRec: 2, media: 1 } : { approval: -0.6, nameRec: 1, media: -1 });
        return { ok: true, msg: good ? 'A strong media appearance.' : 'An awkward interview made the rounds.' };
      }
      case 'meet': {
        g.actionsLeft++; // meeting uses capital instead of time
        return PG.groups.meet(state, arg);
      }
      case 'leadership': {
        g.actionsLeft++;
        return runForLeadership(state);
      }
      default:
        g.actionsLeft++;
        return { ok: false, msg: 'Unknown action.' };
    }
  }

  // Legislators can seek a committee chair (seniority, party standing, majority status).
  function runForLeadership(state) {
    const g = state.gov, p = state.player;
    if (g.kind !== 'legislator') return { ok: false, msg: 'Only legislators run for leadership posts.' };
    const ch = state.world.chambers[g.body];
    const me = ch.members.find((m) => m.isPlayer);
    if (ch.partisan && ch.majority !== me.party) return { ok: false, msg: 'Your party is in the minority — chairs go to the majority.' };
    if (p.capital < 8) return { ok: false, msg: 'Costs 8 political capital.' };
    p.capital -= 8;
    const com = ch.committees.find((c) => me.committees.includes(c.id) && c.chair !== me.id);
    if (!com) return { ok: false, msg: 'You already chair your committees.' };
    const chair = ch.members.find((m) => m.id === com.chair);
    const myScore = me.seniority + (p.partyRel - 50) / 4 + (p.mods.legislativeRel || 0) / 2 + R.normal(state, 0, 2);
    const theirScore = chair ? chair.seniority + 4 : 0;
    if (myScore > theirScore) {
      com.chair = me.id;
      PG.game.log(state, 'career', 'You won the chairmanship of the ' + com.name + ' committee.', ['Your seniority ' + me.seniority + ' yrs + party standing ' + Math.round(p.partyRel) + ' beat ' + (chair ? chair.name + ' (' + chair.seniority + ' yrs)' : 'no one')]);
      return { ok: true, msg: 'You now chair ' + com.name + '.' };
    }
    p.partyRel = U.clamp(p.partyRel - 3, 0, 100);
    return { ok: true, msg: 'The caucus stuck with ' + (chair ? chair.name : 'seniority') + ' for ' + com.name + '. Seniority: you ' + me.seniority + ' yrs vs ' + (chair ? chair.seniority : 0) + '.' };
  }

  PG.gov = { ACTIONS_PER_MONTH, assumeOffice, leaveOffice, monthly, act, seatPlayer, fixChairs, checkDecision };
})(globalThis.PG = globalThis.PG || {});
