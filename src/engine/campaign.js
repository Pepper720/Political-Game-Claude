/* Campaigns: candidates, the monthly schedule (20 days) and budget, fundraising with
 * donor strings attached, ads, ground game, policy rollouts, endorsements, opposition
 * research, debates and polling. Elections themselves live in election.js. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;

  const DAY_KEYS = ['fundraising', 'digital', 'retail', 'media', 'ground', 'policy', 'prep', 'rest'];
  const DAY_LABELS = { fundraising: 'Call time (big donors)', digital: 'Digital & small-dollar', retail: 'Retail campaigning', media: 'Media & interviews', ground: 'Ground organizing', policy: 'Policy work', prep: 'Debate prep', rest: 'Rest' };

  function office(state) { return PG.data.officeById[state.campaign.officeId]; }
  function playerCand(state) { const c = state.campaign; return c ? c.candidates.find((x) => x.isPlayer) : null; }
  function stageCands(state) {
    const c = state.campaign;
    return c.candidates.filter((x) => x.active && (!x.stages || x.stages.includes(c.stage)));
  }
  function opponents(state) { return stageCands(state).filter((x) => !x.isPlayer); }
  function electorate(state) { return PG.juris.electorate(state, state.campaign.key); }
  function sizeFactor(state) { return U.clamp(Math.sqrt(60000 / electorate(state).voters), 0.05, 1.6); }

  function daysAvailable(state) {
    const p = state.player;
    let d = 20 + ((p.mods && p.mods.extraDays) || 0);
    if (p.office) d -= p.office.officeId === 'president' ? 8 : 4; // official duties
    return d;
  }

  function defaultPlan(state) {
    const days = daysAvailable(state);
    const plan = { days: { fundraising: 5, digital: 2, retail: 4, media: 2, ground: 3, policy: 1, prep: 0, rest: 3 }, target: 'swing', adsPct: 35, adTone: 'positive', fieldPct: 10, oppoPct: 0, selfFund: 0, debateStyle: 'policy' };
    let tot = U.sum(Object.values(plan.days));
    while (tot > days) { plan.days.rest = Math.max(0, plan.days.rest - 1); plan.days.fundraising--; tot -= 2; }
    if (tot < days) plan.days.retail += days - tot;
    return plan;
  }

  // ------------------------------------------------------------ candidates
  function makeCandidate(state, o) {
    const diff = PG.data.difficulty[state.difficulty];
    const offc = PG.data.officeById[o.officeId];
    const q = U.clamp(R.normal(state, 50 + diff.oppQuality + (o.incumbent ? 6 : 0) + (o.qualityBonus || 0), 11), 18, 92);
    const norm = PG.voters.partyNorm(o.party);
    const bias = o.bias === 'base' ? 1.3 : o.bias === 'moderate' ? 0.5 : 0.95;
    const ideology = o.ideology || { econ: Math.round(U.clamp(norm.econ * bias + R.normal(state, 0, 10), -95, 95)), social: Math.round(U.clamp(norm.social * bias + R.normal(state, 0, 10), -95, 95)) };
    const stat = () => Math.round(U.clamp(q + R.normal(state, 0, 9), 15, 95));
    const rankRec = { 1: 6, 2: 10, 3: 12, 4: 16, 5: 22, 6: 30 }[offc.rank];
    const tbv = PG.juris.typicalBudget(state, o.officeId);
    const cand = {
      id: o.id || U.nextId(state, 'c'), name: o.name || PG.world.personName(state), party: o.party, isPlayer: false, incumbent: !!o.incumbent,
      ideology, charisma: stat(), fundraising: stat(), policy: stat(), discipline: stat(), organizing: stat(), quality: Math.round(q),
      nameRec: U.round(o.nameRec !== undefined ? o.nameRec : (o.incumbent ? R.range(state, 50, 72) : R.range(state, rankRec * 0.4, rankRec * 1.6) + q / 10), 1),
      fav: U.round(o.fav !== undefined ? o.fav : 50 + R.normal(state, 0, 4) + (o.incumbent ? 3 : 0), 1),
      cash: Math.round(tbv * R.range(state, 0.04, 0.2) * q / 50 * (o.incumbent ? 2.2 : 1)), raised: 0, spent: 0,
      ground: U.round(o.incumbent ? 6 : R.range(state, 0, 4), 1), enthusiasm: 0, momentum: 0, blocBoost: {}, endorsements: [], active: true,
      stages: o.stages || null, bias: o.bias || 'mainstream', skeletons: [], label: o.label || null,
    };
    const nsk = R.int(state, 0, 2) + (q < 40 ? 1 : 0);
    const sk = ['Unpaid taxes on a rental property', 'A DUI arrest years ago', 'Business partner indicted for fraud', 'Inflammatory remarks at a private fundraiser', 'Missed most votes in a previous office', 'Lobbied for a client now under investigation', 'Lived outside the district until recently', 'Padded résumé claims'];
    for (let i = 0; i < nsk; i++) cand.skeletons.push({ id: cand.id + 's' + i, text: R.pick(state, sk), severity: U.round(R.range(state, 2, 7), 1), found: false, released: false });
    return cand;
  }

  function makePlayerCand(state, officeId, opts) {
    const p = state.player;
    const g = state.gov;
    const incumbent = p.office && p.office.officeId === officeId;
    const keyMatch = p.office && PG.juris.OFFICE_KEY[p.office.officeId] === PG.juris.OFFICE_KEY[officeId];
    let nameRec = p.nameRec;
    // Name recognition carries over imperfectly to a bigger jurisdiction.
    if (!keyMatch && p.office) {
      const scale = { school: 1, ward: 0.6, city: 1, sh: 0.9, ss: 0.85, cd: 0.7, state: 0.55, nation: 0.35 }[PG.juris.OFFICE_KEY[officeId]] || 0.6;
      nameRec = p.nameRec * scale * ((p.mods && p.mods.scaleUp) || 1);
    }
    if (!p.office) nameRec = Math.min(nameRec, PG.juris.OFFICE_KEY[officeId] === 'ward' || officeId === 'school_board' ? 25 : 12);
    const fav = g ? U.clamp(g.approval.overall + 4, 20, 85) : p.fav;
    const blocBoost = {};
    for (const [b, v] of Object.entries((p.mods && p.mods.blocs) || {})) blocBoost[b] = v;
    if (p.mods && p.mods.swingBonus) for (const b of ['sub_college', 'sub_family', 'working', 'latino']) blocBoost[b] = (blocBoost[b] || 0) + p.mods.swingBonus;
    if (p.mods && p.mods.swingPenalty) for (const b of ['sub_college', 'sub_family']) blocBoost[b] = (blocBoost[b] || 0) - p.mods.swingPenalty;
    if (p.mods && p.mods.outOfTouch) for (const b of ['working', 'rural']) blocBoost[b] = (blocBoost[b] || 0) - 1.5;
    return {
      id: 'player', name: p.name, party: p.party, isPlayer: true, incumbent, ideology: p.ideology,
      nameRec: U.round(U.clamp(incumbent ? Math.max(nameRec, 55) : nameRec, 0, 100), 1), fav: U.round(fav, 1), cash: 0, raised: 0, spent: 0,
      ground: incumbent ? 6 : 0, enthusiasm: ((p.mods && p.mods.baseEnthusiasm) || 0), momentum: 0, blocBoost, endorsements: [], active: true, stages: null,
    };
  }

  // Who is running? Incumbents, primary rivals, the other party's field, minor parties.
  function buildField(state, officeId, info) {
    const p = state.player, o = PG.data.officeById[officeId], st = PG.juris.homeState(state);
    const cands = [];
    const partisan = o.partisan;
    const seat = (() => {
      if (officeId === 'city_council') return state.world.chambers.council.members[state.world.home.wardIndex];
      if (officeId === 'state_house') return PG.juris.seatMember(state, 'state_house');
      if (officeId === 'state_senate') return PG.juris.seatMember(state, 'state_senate');
      if (officeId === 'us_house') return PG.juris.seatMember(state, 'us_house');
      if (officeId === 'us_senate') return state.world.chambers.us_senate.members.find((m) => m.state === p.homeState && m.senateClass === info.senateClass);
      return null;
    })();
    const exec = officeId === 'mayor' ? state.world.executives.mayor : officeId === 'governor' ? state.world.executives.governor : null;
    let incumbent = null;
    const playerHolds = p.office && p.office.officeId === officeId;
    if (!playerHolds) {
      if (seat && !seat.isPlayer && R.chance(state, 0.78)) incumbent = { name: seat.name, party: seat.party, ideology: { econ: seat.econ, social: seat.social } };
      if (exec && !exec.isPlayer && R.chance(state, 0.6)) incumbent = { name: exec.name, party: exec.party, ideology: { econ: exec.econ, social: exec.social }, approval: exec.approval };
    }
    const mk = (opts) => { const c = makeCandidate(state, Object.assign({ officeId }, opts)); cands.push(c); return c; };
    if (officeId === 'school_board') {
      const n = R.int(state, 3, 5);
      const board = state.world.chambers.school.members.filter((m) => !m.isPlayer);
      for (let i = 0; i < n; i++) {
        const inc = i < 2 && R.chance(state, 0.65) ? board[i] : null;
        const party = inc ? inc.party : R.chance(state, U.logistic(state.world.home.city.lean / 20)) ? 'R' : 'D';
        mk({ party, incumbent: !!inc, name: inc ? inc.name : undefined, ideology: inc ? { econ: inc.econ, social: inc.social } : undefined, bias: R.pick(state, ['base', 'moderate', 'mainstream']) });
      }
      return cands;
    }
    if (!partisan) {
      if (incumbent) mk({ party: incumbent.party, incumbent: true, name: incumbent.name, ideology: incumbent.ideology, fav: incumbent.approval ? incumbent.approval + 3 : undefined });
      const n = (incumbent ? R.int(state, 0, 2) : R.int(state, 1, 3));
      const lean = PG.juris.electorate(state, PG.juris.OFFICE_KEY[officeId]).lean;
      for (let i = 0; i < n; i++) mk({ party: R.chance(state, U.logistic(lean / 18)) ? 'R' : 'D', bias: R.pick(state, ['base', 'moderate', 'mainstream']) });
      if (!cands.length) mk({ party: p.party === 'R' ? 'D' : 'R' });
      return cands;
    }
    // Partisan races.
    const myParty = p.party;
    const parties = ['D', 'R'];
    const threat = state.gov && playerHolds ? state.gov.primaryThreat || 0 : 0;
    for (const party of parties) {
      const stages = st.primary === 'top2' || st.primary === 'top4' || st.primary === 'jungle' ? null : ['primary', 'runoff', 'general', 'general_runoff'];
      if (incumbent && incumbent.party === party) {
        mk({ party, incumbent: true, name: incumbent.name, ideology: incumbent.ideology, fav: incumbent.approval ? incumbent.approval + 3 : undefined, stages: stages && ['primary', 'runoff', 'general', 'general_runoff'] });
        const rv = party === myParty && PG.cast && PG.cast.rivalForRace(state, officeId);
        if (rv) mk(Object.assign({ party, bias: 'mainstream', stages: stages && ['primary', 'runoff'] }, rv));
        else if (party === myParty || R.chance(state, 0.25)) mk({ party, bias: party === myParty ? R.pick(state, ['base', 'moderate']) : 'base', qualityBonus: -10, stages: stages && ['primary', 'runoff'] });
      } else if (party === myParty) {
        let n = playerHolds ? (threat > 0.3 ? 1 : R.chance(state, 0.25) ? 1 : 0) : R.int(state, 1, 3);
        const rv = PG.cast && PG.cast.rivalForRace(state, officeId);
        if (rv) { mk(Object.assign({ party, bias: 'mainstream', stages: stages && ['primary', 'runoff'] }, rv)); n = Math.max(0, n - 1); }
        for (let i = 0; i < n; i++) mk({ party, bias: playerHolds ? 'base' : (i === 0 ? (PG.voters.dist(p.ideology, PG.voters.partyNorm(party)) > 30 ? 'mainstream' : 'moderate') : R.pick(state, ['base', 'moderate', 'mainstream'])), qualityBonus: playerHolds ? threat * 20 - 8 : 0, stages: stages && ['primary', 'runoff'] });
      } else {
        const n = R.int(state, 1, 3);
        for (let i = 0; i < n; i++) mk({ party, bias: R.pick(state, ['base', 'moderate', 'mainstream']), stages: stages && ['primary', 'runoff', 'general', 'general_runoff'] });
      }
    }
    if (st.primary !== 'top2' && st.primary !== 'jungle' && R.chance(state, o.level === 'federal' ? 0.5 : 0.25)) {
      mk({ party: R.pick(state, ['L', 'G']), qualityBonus: -20, nameRec: 4, stages: ['general', 'general_runoff'] });
    }
    return cands;
  }

  function stagesFor(state, officeId, info) {
    const o = PG.data.officeById[officeId], st = PG.juris.homeState(state), p = state.player;
    if (officeId === 'president') return ['pres_primary', 'general'];
    if (!o.partisan) return ['general'];
    if (st.primary === 'top2' || st.primary === 'top4') return ['primary', 'general'];
    if (st.primary === 'jungle') return ['general'];
    const stages = [];
    if (p.party === 'D' || p.party === 'R') stages.push('primary');
    stages.push('general');
    return stages;
  }

  function start(state, officeId) {
    if (state.campaign) return { ok: false, msg: 'Already campaigning.' };
    const decl = state.player.declared && state.player.declared.officeId === officeId ? state.player.declared : null;
    const el = PG.character.eligibility(state, officeId, decl ? decl.info : null);
    if (!el.ok) return { ok: false, msg: el.reasons.join(' ') };
    const info = el.info;
    const o = PG.data.officeById[officeId];
    const key = PG.juris.OFFICE_KEY[officeId];
    const st = PG.juris.homeState(state);
    if (officeId === 'us_senate') PG.juris.invalidate(state, 'state');
    const c = {
      id: U.nextId(state, 'race'), officeId, info, key, typicalBudget: PG.juris.typicalBudget(state, officeId),
      partisan: o.partisan, stages: stagesFor(state, officeId, info), stageIndex: 0, stage: null, candidates: [], plan: null,
      polls: [], debates: [], oppoFile: [], endorsements: {}, raised: { large: 0, small: 0, pac: 0, self: 0, carry: 0 }, spent: { ads: 0, field: 0, polls: 0, oppo: 0, staff: 0 },
      superPac: { for: 0, against: 0 }, months: 0, startDate: { ...state.date }, prep: 0, policyCred: 0, rolloutThisMonth: false, endorseAsks: 0,
      ballot: null, lastResult: null, history: [], pledgeNoPAC: false,
    };
    state.campaign = c;
    c.stage = c.stages[0];
    if (officeId === 'president') { PG.presidential.setup(state); }
    else {
      c.candidates = buildField(state, officeId, info);
      c.candidates.unshift(makePlayerCand(state, officeId));
      if (st.primary === 'top4' && o.partisan) c.stages = ['primary', 'general'];
    }
    const pc = playerCand(state);
    // War chest carries over (simplification of transfer rules between committees).
    pc.cash = state.player.cash; c.raised.carry = state.player.cash;
    if (!o.partisan || officeId === 'president') { /* no petitions for these */ }
    else if (!['D', 'R'].includes(state.player.party)) c.ballot = { required: Math.round(electorate(state).voters * 0.008), collected: 0 };
    c.plan = defaultPlan(state);
    scheduleDebates(state);
    state.phase = 'campaign';
    state.player.declared = null;
    PG.game.log(state, 'campaign', 'You declared your candidacy for ' + o.name + ' (' + PG.juris.describe(state, key) + '). Election: ' + U.fmtDate(info.general) + '.',
      ['Baseline lean ' + U.fmtLean(electorate(state).lean) + '; typical winning budget ' + U.fmtMoney(c.typicalBudget)]);
    PG.game.news(state, state.player.name + ' launches campaign for ' + o.short, 1);
    return { ok: true, msg: 'Campaign launched.' };
  }

  function stageDate(state, stage) {
    const info = state.campaign.info;
    if (stage === 'primary') return info.primary;
    if (stage === 'runoff') return info.runoff;
    if (stage === 'general') return info.general;
    if (stage === 'pres_primary') { const y = state.campaign.pres ? state.campaign.pres.year : info.general.year; const m = state.date.year === y ? Math.min(6, Math.max(1, state.date.month)) : 1; return { year: y, month: m }; }
    if (stage === 'general_runoff') return info.generalRunoff || { year: info.general.year, month: 12 };
    return info.general;
  }

  function scheduleDebates(state) {
    const c = state.campaign, o = office(state);
    if (c.officeId === 'president') return;
    c.debates = [];
    for (const stage of c.stages) {
      const d = stageDate(state, stage);
      if (!d) continue;
      const n = stage === 'general' && o.rank >= 4 ? 2 : 1;
      for (let i = n; i >= 1; i--) {
        c.debates.push({ id: U.nextId(state, 'deb'), stage, date: U.addMonths(d, -(i - 1)), held: false, result: null,
          label: (stage === 'primary' ? 'Primary debate' : o.partisan ? 'General-election debate' : 'Candidate forum') + (n > 1 ? ' #' + (n - i + 1) : '') });
      }
    }
    // Debates happen in the election month itself (before voting) or the month before.
    c.debates.forEach((d) => { if (U.dateCmp(d.date, state.date) < 0) d.date = { ...state.date }; });
  }

  // ------------------------------------------------------------ player actions
  function setPlan(state, plan) {
    const c = state.campaign;
    const days = daysAvailable(state);
    const d = {};
    let tot = 0;
    for (const k of DAY_KEYS) { d[k] = Math.max(0, Math.round(Number(plan.days && plan.days[k]) || 0)); tot += d[k]; }
    if (tot > days) return { ok: false, msg: 'You only have ' + days + ' campaign days this month (planned ' + tot + ').' };
    const pct = (v) => U.clamp(Math.round(Number(v) || 0), 0, 100);
    const adsPct = pct(plan.adsPct), fieldPct = pct(plan.fieldPct), oppoPct = pct(plan.oppoPct);
    if (adsPct + fieldPct + oppoPct > 100) return { ok: false, msg: 'Spending shares add up to more than 100% of cash.' };
    const selfFund = Math.max(0, Math.round(Number(plan.selfFund) || 0));
    c.plan = { days: d, target: plan.target || 'swing', adsPct, fieldPct, oppoPct, adTone: ['positive', 'contrast', 'negative'].includes(plan.adTone) ? plan.adTone : 'positive',
      selfFund: state.player.mods.selfFund ? selfFund : 0, debateStyle: ['policy', 'attack', 'folksy', 'cautious'].includes(plan.debateStyle) ? plan.debateStyle : 'policy' };
    return { ok: true, msg: 'Schedule saved.' };
  }

  function rollout(state, issueId, stanceIdx) {
    const c = state.campaign, p = state.player, pc = playerCand(state);
    const issue = PG.data.issueById[issueId];
    if (!issue) return { ok: false, msg: 'Unknown issue.' };
    if (c.rolloutThisMonth) return { ok: false, msg: 'One policy rollout per month.' };
    if ((c.plan.days.policy || 0) < 2) return { ok: false, msg: 'Schedule at least 2 policy days this month to roll out a plan.' };
    const stance = U.clamp(Math.round(stanceIdx), 0, 4) - 2;
    c.rolloutThisMonth = true;
    const lines = [];
    const prev = p.positions[issueId];
    if (prev !== undefined && Math.abs(prev - stance) >= 2) {
      pc.fav = U.clamp(pc.fav - 3, 5, 95); p.media = U.clamp(p.media - 3, -100, 100);
      PG.game.news(state, p.name + ' flip-flops on ' + issue.name.toLowerCase(), -1);
      lines.push('Flip-flop! Favorability −3 (you previously said "' + issue.stances[prev + 2] + '")');
    }
    p.positions[issueId] = stance;
    const axis = issue.axis;
    const target = stance * 38;
    const before = p.ideology[axis];
    p.ideology[axis] = U.round(U.clamp(before + (target - before) * 0.18, -100, 100), 1);
    pc.ideology = p.ideology;
    const e = electorate(state);
    const moved = [];
    for (const b of e.blocs) {
      const agree = 0.8 - Math.abs(target - b[axis]) / 50;
      const d = U.clamp(agree * PG.approval.salience(b.id, issueId) * 0.7, -1.8, 1.8);
      pc.blocBoost[b.id] = U.clamp((pc.blocBoost[b.id] || 0) + d, -8, 8);
      if (Math.abs(d) >= 0.6) moved.push(PG.data.blocById[b.id].name + ' ' + U.fmtSigned(d, 1));
    }
    for (const g of PG.data.groups) {
      const d = (1 - Math.abs(g.ideo[axis] - target) / 60) * 3;
      if (Math.abs(d) >= 1.5) PG.groups.change(state, g.id, U.round(d, 1), 'Your ' + issue.name + ' plan');
    }
    pc.nameRec = U.clamp(pc.nameRec + 2 * sizeFactor(state) + 1, 0, 100);
    lines.push('Your ' + axis + ' position moved ' + U.round(before) + ' → ' + U.round(p.ideology[axis]));
    if (moved.length) lines.push('Reaction: ' + moved.join(', '));
    PG.game.log(state, 'campaign', 'Policy rollout on ' + issue.name + ': "' + issue.stances[stance + 2] + '".', lines);
    return { ok: true, msg: 'Plan released.' };
  }

  function commissionPoll(state) {
    const c = state.campaign, pc = playerCand(state);
    const cost = Math.round(Math.max(3000, c.typicalBudget * 0.02));
    if (pc.cash < cost) return { ok: false, msg: 'An internal poll costs ' + U.fmtMoney(cost) + '.' };
    pc.cash -= cost; pc.spent += cost; c.spent.polls += cost;
    const poll = makePoll(state, 'Internal (your campaign)', true);
    c.polls.unshift(poll);
    return { ok: true, msg: 'Internal poll complete.' };
  }

  function seekEndorsement(state, gid) {
    const c = state.campaign;
    const g = PG.data.groupById[gid];
    if (!g) return { ok: false, msg: 'Unknown group.' };
    if (c.endorseAsks >= 1) return { ok: false, msg: 'You can make one endorsement pitch per month.' };
    if (c.endorsements[gid]) return { ok: false, msg: g.name + ' has already made its choice.' };
    c.endorseAsks++;
    const pc = playerCand(state);
    PG.groups.change(state, gid, 5, 'Endorsement meeting');
    const score = endorsementScore(state, g, pc);
    const best = Math.max.apply(null, stageCands(state).filter((x) => !x.isPlayer).map((x) => endorsementScore(state, g, x)).concat([-999]));
    if (score >= 20 && score >= best + 4) { endorse(state, g, pc); return { ok: true, msg: g.name + ' endorsed you!' }; }
    return { ok: true, msg: g.name + ' heard you out but is not ready to endorse (their score for you ' + Math.round(score) + ' vs. best rival ' + Math.round(best) + ').' };
  }

  function pledgeNoPAC(state) {
    const c = state.campaign;
    if (c.pledgeNoPAC) return { ok: false, msg: 'Already pledged.' };
    c.pledgeNoPAC = true;
    const pc = playerCand(state);
    pc.blocBoost.urban_prog = (pc.blocBoost.urban_prog || 0) + 1.5; pc.blocBoost.young = (pc.blocBoost.young || 0) + 1;
    PG.groups.change(state, 'chamber', -8, 'Rejected corporate PAC money'); PG.groups.change(state, 'reform', 8, 'Rejected corporate PAC money');
    PG.game.log(state, 'money', 'You pledged to refuse corporate PAC money.', ['Small-dollar appeal +25%; no business or industry PAC checks; reformers pleased']);
    return { ok: true, msg: 'Pledge made.' };
  }

  function releaseOppo(state, sid) {
    const c = state.campaign;
    const item = c.oppoFile.find((x) => x.id === sid);
    if (!item || item.released) return { ok: false, msg: 'Nothing to release.' };
    const opp = c.candidates.find((x) => x.id === item.candId);
    item.released = true;
    const viaPac = c.superPac.for > 0 && R.chance(state, 0.5);
    const hit = item.severity * (1.0 + (opp.nameRec / 200));
    opp.fav = U.clamp(opp.fav - hit, 5, 95); opp.momentum = U.clamp(opp.momentum - item.severity * 0.3, -10, 10);
    const pc = playerCand(state);
    if (!viaPac) pc.fav = U.clamp(pc.fav - 0.6, 5, 95);
    PG.game.news(state, 'Report: ' + opp.name + ' — ' + item.text.toLowerCase(), -1);
    PG.game.log(state, 'campaign', 'You released opposition research on ' + opp.name + ': ' + item.text + '.', ['Their favorability −' + U.round(hit, 1), viaPac ? 'Laundered through an allied super PAC — no fingerprints' : 'Going negative cost you −0.6 favorability']);
    return { ok: true, msg: 'Released.' };
  }

  // --------------------------------------------------------------- polling
  function makePoll(state, sponsor, internal) {
    const c = state.campaign;
    const cands = stageCands(state);
    const truth = PG.election.preview(state);
    const diff = PG.data.difficulty[state.difficulty];
    const n = internal ? 600 : R.pick(state, [400, 500, 600, 800, 1000]);
    const moe = 98 / Math.sqrt(n) * diff.pollNoise;
    const avgRec = U.sum(cands, (x) => x.nameRec) / cands.length;
    const monthsLeft = Math.max(0, U.monthsBetween(state.date, stageDate(state, c.stage) || c.info.general));
    const und = U.clamp(0.05 + 0.3 * (1 - avgRec / 100) * Math.sqrt(Math.min(1, monthsLeft / 8)), 0.03, 0.4);
    const house = R.normal(state, 0, 1.3);
    const results = {};
    for (const cd of cands) {
      const t = truth.shares[cd.id] || 0;
      const se = Math.sqrt(Math.max(0.01, t * (1 - t)) / n) * diff.pollNoise;
      let v = t * (1 - und) + R.normal(state, 0, se) + (cd.party === 'R' ? house / 200 : cd.party === 'D' ? -house / 200 : 0);
      results[cd.id] = U.round(U.clamp(v, 0, 1) * 100, 1);
    }
    const poll = { date: { ...state.date }, sponsor, n, moe: U.round(moe, 1), undecided: U.round(und * 100, 1), results, stage: c.stage, internal: !!internal };
    if (internal) {
      poll.crosstabs = {};
      for (const [bid, bv] of Object.entries(truth.byBloc)) {
        const row = {};
        for (const cd of cands) row[cd.id] = U.round((bv.votes[cd.id] || 0) / bv.total * 100 + R.normal(state, 0, 4), 0);
        poll.crosstabs[bid] = row;
      }
      poll.fav = {}; for (const cd of cands) poll.fav[cd.id] = { fav: U.round(cd.fav), rec: U.round(cd.nameRec) };
    }
    state.history.polls.push({ date: { ...state.date }, race: c.id, results, stage: c.stage });
    return poll;
  }

  function publicPollDue(state) {
    const c = state.campaign, o = office(state);
    const d = stageDate(state, c.stage);
    if (!d) return false;
    const left = U.monthsBetween(state.date, d);
    if (o.rank <= 1) return left === 1 || (left === 3 && R.chance(state, 0.5));
    if (o.rank <= 3) return left <= 2 || (left % 3 === 0 && R.chance(state, 0.5));
    return left <= 6 || left % 2 === 0;
  }

  // ------------------------------------------------------------- endorsements
  function endorsementScore(state, g, cand) {
    let s = PG.groups.ideoAlignment(g.ideo, cand.ideology) * 30;
    if (cand.isPlayer) s += PG.groups.rel(state, g.id) * 0.5;
    if (cand.incumbent) s += 6;
    const last = state.campaign.polls.find((p) => !p.internal);
    if (last && last.results[cand.id] !== undefined) s += last.results[cand.id] / 5;
    if (cand.isPlayer && state.player.flags['burned_' + g.id]) s -= 30;
    return s;
  }

  function endorse(state, g, cand) {
    const c = state.campaign;
    c.endorsements[g.id] = cand.id;
    cand.endorsements.push(g.id);
    for (const [b, w] of Object.entries(g.blocs)) cand.blocBoost[b] = (cand.blocBoost[b] || 0) + w * 1.1;
    cand.ground = U.clamp((cand.ground || 0) + g.ground * 1.2, 0, 40);
    cand.cash += Math.round(c.typicalBudget * 0.012 * g.money);
    PG.game.log(state, 'campaign', g.name + ' endorsed ' + (cand.isPlayer ? 'you' : cand.name) + '.', ['Reaches ' + Object.keys(g.blocs).map((b) => PG.data.blocById[b].name).join(', ') + '; volunteers +' + U.round(g.ground * 1.2, 1)]);
  }

  function endorsementRound(state) {
    const c = state.campaign;
    const lvl = PG.juris.OFFICE_LEVEL[c.officeId];
    const cands = stageCands(state);
    for (const g of PG.data.groups) {
      if (!PG.groups.activeAt(g, lvl) || c.endorsements[g.id]) continue;
      if (!R.chance(state, lvl === 'city' || lvl === 'school' ? 0.2 : 0.35)) continue;
      const scored = cands.map((x) => ({ x, s: endorsementScore(state, g, x) })).sort((a, b) => b.s - a.s);
      if (scored.length && scored[0].s >= 22 && (scored.length < 2 || scored[0].s - scored[1].s >= 5)) endorse(state, g, scored[0].x);
    }
  }

  // --------------------------------------------------------------- debates
  function holdDebate(state, debate) {
    const c = state.campaign, p = state.player, pc = playerCand(state);
    const cands = stageCands(state);
    if (cands.length < 2) { debate.held = true; return; }
    const diff = PG.data.difficulty[state.difficulty];
    const style = c.plan.debateStyle || 'policy';
    const vol = (p.mods.debateVolatility || 1);
    const lead = leaderId(state);
    const scores = cands.map((x) => {
      let s, notes = [];
      if (x.isPlayer) {
        s = PG.character.stat(state, 'charisma') * 0.45 + PG.character.stat(state, 'policy') * 0.35 + Math.min(c.prep, 10) * 2.2;
        if (c.prep) notes.push('prep +' + U.round(Math.min(c.prep, 10) * 2.2));
        if (style === 'attack') { s += lead === 'player' ? -4 : 5; notes.push(lead === 'player' ? 'attacks from the front-runner looked petty' : 'attacks rattled the leader'); }
        if (style === 'policy') { s += PG.character.stat(state, 'policy') > 60 ? 4 : 0; notes.push('policy depth'); }
        if (style === 'folksy') { s += PG.character.stat(state, 'charisma') > 60 ? 4 : 1; notes.push('relatable answers'); }
        if (style === 'cautious') { s += 2; notes.push('no unforced errors'); }
        s += R.normal(state, 0, (style === 'cautious' ? 5 : 9) * vol);
      } else {
        s = x.charisma * 0.45 + x.policy * 0.35 + 10 + R.normal(state, 0, 9) + (diff.oppQuality / 2);
        if (x.id === lead && x.incumbent) s += 2;
      }
      return { x, s, notes };
    }).sort((a, b) => b.s - a.s);
    const best = scores[0], worst = scores[scores.length - 1];
    const lines = [];
    for (const r of scores) {
      const rel = r.s - U.sum(scores, (y) => y.s) / scores.length;
      const shift = U.clamp(rel * 0.18, -5, 5);
      r.x.fav = U.clamp(r.x.fav + shift, 5, 95);
      r.x.momentum = U.clamp((r.x.momentum || 0) + shift * 0.5, -10, 10);
      r.x.nameRec = U.clamp(r.x.nameRec + 4, 0, 100);
      lines.push((r.x.isPlayer ? 'You' : r.x.name) + ': ' + U.round(r.s) + ' (' + (shift >= 0 ? '+' : '') + U.round(shift, 1) + ' fav)' + (r.notes.length ? ' — ' + r.notes.join(', ') : ''));
    }
    debate.held = true;
    debate.result = { winner: best.x.isPlayer ? 'You' : best.x.name, lines };
    c.prep = 0;
    PG.game.log(state, 'campaign', debate.label + ': ' + (best.x.isPlayer ? 'you won the night' : best.x.name + ' won the night') + '.', lines);
    PG.game.news(state, (best.x.isPlayer ? p.name : best.x.name) + ' shines in debate', best.x.isPlayer ? 1 : -1);
    if (worst.x.isPlayer && worst.s < 35 && R.chance(state, 0.5)) PG.events.trigger(state, 'debate_gaffe', {});
  }

  function leaderId(state) {
    const last = state.campaign.polls.find((p) => p.stage === state.campaign.stage);
    if (!last) return null;
    return Object.entries(last.results).sort((a, b) => b[1] - a[1])[0][0];
  }

  // ------------------------------------------------------------- the month
  function limitFactor(state) {
    const lvl = PG.juris.OFFICE_LEVEL[state.campaign.officeId];
    if (lvl === 'federal') return 1;
    if (lvl === 'state') { const lim = PG.juris.homeState(state).contribLimit; return lim === 0 ? 1.3 : lim <= 1500 ? 0.8 : 1; }
    return 0.85;
  }

  function playerMonth(state) {
    const c = state.campaign, p = state.player, pc = playerCand(state);
    const plan = c.plan, d = plan.days;
    const T = c.typicalBudget, sf = sizeFactor(state);
    const lines = [];
    const fund = PG.character.stat(state, 'fundraising'), charisma = PG.character.stat(state, 'charisma');
    const lf = limitFactor(state);
    // Money in.
    const network = 0.75 + pc.nameRec / 160 + (pc.incumbent ? 0.45 : 0) + p.partyRel / 300 + (p.history.length ? 0.15 : 0);
    const large = Math.round(d.fundraising * T * 0.014 * Math.pow(fund / 50, 1.3) * lf * network * R.range(state, 0.8, 1.2));
    const intensity = PG.voters.dist(p.ideology, { econ: 0, social: 0 }) / 80;
    const small = Math.round(d.digital * T * 0.008 * (0.4 + pc.nameRec / 90) * (0.7 + intensity) * ((p.mods.smallDollar) || 1) * (c.pledgeNoPAC ? 1.25 : 1) * (1 + Math.max(0, pc.momentum) / 10) * R.range(state, 0.8, 1.2));
    let pac = 0;
    const lvl = PG.juris.OFFICE_LEVEL[c.officeId];
    for (const g of PG.data.groups) {
      if (!PG.groups.activeAt(g, lvl)) continue;
      const r = PG.groups.rel(state, g.id);
      if (r < 20) continue;
      if (c.pledgeNoPAC && (g.kind === 'Business' || g.kind === 'Industry')) continue;
      const amt = Math.round(T * 0.006 * g.money * r / 100);
      pac += amt;
      if (amt > T * 0.008 && R.chance(state, 0.12 * ((p.mods.commitmentRate) || 1))) {
        const cm = PG.groups.addCommitment(state, g.id);
        if (cm) lines.push(cm.text);
      }
    }
    if (d.fundraising >= 4 && R.chance(state, Math.min(0.5, d.fundraising * 0.035 * ((p.mods.commitmentRate) || 1) * lf))) {
      const donors = PG.data.groups.filter((g) => PG.groups.activeAt(g, lvl) && g.money >= 3 && PG.groups.rel(state, g.id) > -10 && !(c.pledgeNoPAC && (g.kind === 'Business' || g.kind === 'Industry')));
      const g = donors.length ? R.weighted(state, donors, (x) => x.money + Math.max(0, PG.groups.rel(state, x.id)) / 20) : null;
      const cm = g && PG.groups.addCommitment(state, g.id);
      if (cm) lines.push('Big donors want something: ' + cm.text);
    }
    const self = plan.selfFund ? Math.min(plan.selfFund, Math.round(T * 0.5)) : 0;
    const inflow = large + small + pac + self;
    pc.cash += inflow; pc.raised += inflow;
    c.raised.large += large; c.raised.small += small; c.raised.pac += pac; c.raised.self += self;
    lines.unshift('Raised ' + U.fmtMoney(inflow) + ' (big donors ' + U.fmtMoney(large) + ', small-dollar ' + U.fmtMoney(small) + ', PACs ' + U.fmtMoney(pac) + (self ? ', self ' + U.fmtMoney(self) : '') + ')');
    // Spending.
    const budget = pc.cash;
    const ads = Math.round(budget * (plan.adsPct || 0) / 100);
    pc.cash -= ads; pc.spent += ads; c.spent.ads += ads;
    c.oppoBudget = Math.round(budget * (plan.oppoPct || 0) / 100);
    const field = Math.min(Math.round(budget * (plan.fieldPct || 0) / 100), pc.cash);
    pc.cash -= field; pc.spent += field; c.spent.field += field;
    const staff = Math.round(T * 0.015);
    const staffPaid = Math.min(staff, pc.cash); pc.cash -= staffPaid; c.spent.staff += staffPaid; pc.spent += staffPaid;
    const targets = targetBlocs(state, plan.target);
    if (ads > 0) applyAds(state, pc, ads, plan.adTone, targets, lines);
    // Time.
    const recGain = (d.retail * 1.3 * sf + d.media * 0.9 * (0.6 + office(state).rank * 0.15) * (p.mods.earnedMedia || 1)) * (1 - pc.nameRec / 100);
    pc.nameRec = U.clamp(pc.nameRec + recGain, 0, 100);
    pc.fav = U.clamp(pc.fav + d.retail * 0.06 * (charisma - 40) / 40 + d.media * 0.04 * (charisma + p.media / 2 - 45) / 40, 5, 95);
    for (const b of targets) pc.blocBoost[b] = U.clamp((pc.blocBoost[b] || 0) + d.retail * 0.09 * Math.sqrt(sf), -8, 9);
    pc.ground = U.clamp((pc.ground || 0) * 0.95 + d.ground * PG.character.stat(state, 'organizing') / 50 * 0.6 + 8 * Math.sqrt(field / T), 0, 40);
    c.policyCred += d.policy;
    if (d.policy) for (const b of ['sub_college', 'seniors']) pc.blocBoost[b] = U.clamp((pc.blocBoost[b] || 0) + d.policy * 0.04 * PG.character.stat(state, 'policy') / 50, -8, 9);
    c.prep += d.prep;
    const work = U.sum(DAY_KEYS.filter((k) => k !== 'rest'), (k) => d[k]);
    p.fatigue = U.clamp(p.fatigue + Math.max(0, work - 14) * 2.2 * ((p.mods.fatigueRate) || 1) - d.rest * 3, 0, 60);
    if (p.fatigue > 25) lines.push('You are exhausted (fatigue ' + Math.round(p.fatigue) + '): charisma and discipline suffer');
    // Petitions for independents.
    if (c.ballot && c.ballot.collected < c.ballot.required) {
      const got = Math.round((d.ground * 0.06 + 0.05) * c.ballot.required * (0.6 + PG.character.stat(state, 'organizing') / 100) + field / Math.max(1, T) * c.ballot.required * 0.5);
      c.ballot.collected = Math.min(c.ballot.required, c.ballot.collected + got);
      lines.push('Ballot petitions: ' + c.ballot.collected.toLocaleString() + ' / ' + c.ballot.required.toLocaleString() + ' signatures');
    }
    // Gaffe risk.
    const disc = PG.character.stat(state, 'discipline');
    const gaffe = (0.015 + d.media * 0.006 + d.retail * 0.002 + p.fatigue / 250) * (1 - disc / 130);
    if (R.chance(state, gaffe)) PG.events.trigger(state, 'campaign_gaffe', {});
    return lines;
  }

  function targetBlocs(state, target) {
    const e = electorate(state);
    const g = PG.effects.blocGroups(state, e);
    if (target === 'base') return g.base.length ? g.base : g.swing;
    if (target === 'swing') return g.swing.length ? g.swing : e.blocs.map((b) => b.id);
    if (target === 'broad') return e.blocs.map((b) => b.id);
    if (PG.data.blocById[target]) return [target];
    return g.swing;
  }

  function applyAds(state, cand, amount, tone, targets, lines) {
    const c = state.campaign;
    const eff = 6 * Math.sqrt(amount / c.typicalBudget);
    const rivals = stageCands(state).filter((x) => x.id !== cand.id);
    const leader = rivals.sort((a, b) => (b.fav * b.nameRec) - (a.fav * a.nameRec))[0];
    if (tone === 'positive') {
      cand.nameRec = U.clamp(cand.nameRec + eff * 4 * (1 - cand.nameRec / 100), 0, 100);
      cand.fav = U.clamp(cand.fav + eff * 0.5, 5, 95);
    } else if (tone === 'contrast') {
      cand.nameRec = U.clamp(cand.nameRec + eff * 2.5 * (1 - cand.nameRec / 100), 0, 100);
      cand.fav = U.clamp(cand.fav + eff * 0.2, 5, 95);
      if (leader) leader.fav = U.clamp(leader.fav - eff * 0.5, 5, 95);
    } else {
      cand.nameRec = U.clamp(cand.nameRec + eff * 1.5 * (1 - cand.nameRec / 100), 0, 100);
      cand.fav = U.clamp(cand.fav - eff * 0.25, 5, 95);
      if (leader) leader.fav = U.clamp(leader.fav - eff * 1.0, 5, 95);
    }
    for (const b of targets || []) cand.blocBoost[b] = U.clamp((cand.blocBoost[b] || 0) + eff * 0.25, -8, 9);
    if (lines) lines.push('Ads (' + tone + ', ' + U.fmtMoney(amount) + '): impact ' + U.round(eff, 1) + (leader && tone !== 'positive' ? ' aimed at ' + leader.name : ''));
  }

  function opponentMonth(state) {
    const c = state.campaign, p = state.player;
    const T = c.typicalBudget, sf = sizeFactor(state);
    const d = stageDate(state, c.stage) || c.info.general;
    const left = Math.max(1, U.monthsBetween(state.date, d) + 1);
    const lead = leaderId(state);
    const diff = PG.data.difficulty[state.difficulty];
    for (const x of opponents(state)) {
      const raise = Math.round(T * 0.065 * (x.fundraising / 50) * (x.incumbent ? 1.35 : 1) * R.range(state, 0.7, 1.3));
      x.cash += raise; x.raised += raise;
      const spend = Math.round(x.cash * Math.min(0.85, 0.3 + 0.5 / left));
      const tone = lead && lead !== x.id && R.chance(state, 0.55) ? (R.chance(state, 0.5) ? 'negative' : 'contrast') : 'positive';
      const ads = Math.round(spend * 0.8), field = spend - ads;
      x.cash -= spend; x.spent += spend;
      if (ads > 0) {
        // Negative ads target whoever leads (often the player).
        if (tone !== 'positive' && lead) {
          const target = stageCands(state).find((y) => y.id === lead);
          const eff = 6 * Math.sqrt(ads / T);
          if (target && target.id !== x.id) {
            target.fav = U.clamp(target.fav - eff * (tone === 'negative' ? 1.0 : 0.5), 5, 95);
            x.fav = U.clamp(x.fav - (tone === 'negative' ? eff * 0.25 : -eff * 0.2), 5, 95);
            x.nameRec = U.clamp(x.nameRec + eff * 2 * (1 - x.nameRec / 100), 0, 100);
            if (target.isPlayer && eff > 1.5) PG.game.log(state, 'campaign', x.name + ' ran ' + tone + ' ads against you (' + U.fmtMoney(ads) + ').');
          }
        } else applyAds(state, x, ads, 'positive', null, null);
      }
      x.ground = U.clamp(x.ground * 0.95 + 8 * Math.sqrt(field / T) + x.organizing / 60, 0, 40);
      x.nameRec = U.clamp(x.nameRec + (2 + x.quality / 20) * sf * (1 - x.nameRec / 100), 0, 100);
      // Opposition research on you.
      const hidden = p.skeletons.filter((s) => !s.revealed);
      if (hidden.length && x.cash > T * 0.05 && R.chance(state, 0.05 * diff.scandalRate * (left <= 2 ? 2 : 1))) {
        const s = R.pick(state, hidden);
        s.revealed = true;
        PG.events.trigger(state, 'oppo_hit', { opponent: x.name, text: s.text, severity: s.severity });
      }
    }
  }

  function superPacs(state) {
    const c = state.campaign, pc = playerCand(state);
    const lvl = PG.juris.OFFICE_LEVEL[c.officeId];
    if (lvl === 'school') return;
    for (const g of PG.data.groups) {
      if (!PG.groups.activeAt(g, lvl) || g.money < 3) continue;
      const r = PG.groups.rel(state, g.id);
      const burned = state.player.flags['burned_' + g.id];
      if (Math.abs(r) < 40 && !burned) continue;
      if (!R.chance(state, 0.15 * g.money / 3)) continue;
      const amt = Math.round(c.typicalBudget * 0.05 * g.money / 3);
      if (r > 0 && !burned) {
        c.superPac.for += amt;
        const target = opponents(state).sort((a, b) => b.nameRec * b.fav - a.nameRec * a.fav)[0];
        if (target) target.fav = U.clamp(target.fav - 6 * Math.sqrt(amt / c.typicalBudget) * 0.8, 5, 95);
        // Uncoordinated messaging can misfire.
        if (R.chance(state, 0.15)) { pc.fav = U.clamp(pc.fav - 1, 5, 95); PG.game.log(state, 'campaign', 'An allied super PAC ran a crude attack ad that backfired on you. By law, you could not coordinate with them.'); }
        else PG.game.log(state, 'campaign', g.name + '\'s super PAC spent ' + U.fmtMoney(amt) + ' attacking your opponent.');
      } else {
        c.superPac.against += amt;
        pc.fav = U.clamp(pc.fav - 6 * Math.sqrt(amt / c.typicalBudget) * 0.8, 5, 95);
        PG.game.log(state, 'campaign', g.name + '\'s super PAC spent ' + U.fmtMoney(amt) + ' against you.', burned ? ['You broke a commitment to them'] : ['Relationship ' + Math.round(r)]);
      }
    }
  }

  function oppoResearch(state) {
    const c = state.campaign;
    const spend = c.oppoBudget || 0;
    if (!spend) return;
    const pc = playerCand(state);
    const amt = Math.min(spend, pc.cash);
    pc.cash -= amt; pc.spent += amt; c.spent.oppo += amt;
    const p = 1 - Math.exp(-amt / (c.typicalBudget * 0.05));
    for (const x of opponents(state)) {
      for (const s of x.skeletons) {
        if (s.found || !R.chance(state, p * 0.6)) continue;
        s.found = true;
        c.oppoFile.push({ id: s.id, candId: x.id, candName: x.name, text: s.text, severity: s.severity, released: false });
        PG.game.log(state, 'campaign', 'Your researchers found something on ' + x.name + ': ' + s.text + '.');
      }
    }
  }

  // Decay toward fundamentals each month.
  function drift(state) {
    for (const x of stageCands(state)) {
      x.momentum = U.round((x.momentum || 0) * 0.7, 2);
      x.fav = U.round(x.fav + (50 - x.fav) * 0.03, 2);
      for (const k of Object.keys(x.blocBoost)) x.blocBoost[k] = U.round(x.blocBoost[k] * 0.97, 3);
    }
    const pc = playerCand(state);
    if (pc) {
      const heat = PG.scandals.heat(state);
      pc.fav = U.clamp(pc.fav - heat * 0.12, 5, 95);
    }
  }

  function processMonth(state) {
    const c = state.campaign;
    c.months++;
    const lines = playerMonth(state);
    oppoResearch(state);
    opponentMonth(state);
    superPacs(state);
    const d = stageDate(state, c.stage);
    const left = d ? U.monthsBetween(state.date, d) : 0;
    if (left <= 2) endorsementRound(state);
    for (const deb of c.debates) if (!deb.held && deb.stage === c.stage && U.dateCmp(deb.date, state.date) <= 0) holdDebate(state, deb);
    drift(state);
    if (publicPollDue(state)) {
      const outlets = ['University Poll', 'Channel 7 / SurveyCo', 'Daily Register Poll', 'Statewide Research', 'Keystone Analytics', 'Granite Polling'];
      c.polls.unshift(makePoll(state, R.pick(state, outlets), false));
    }
    if (c.polls.length > 30) c.polls.length = 30;
    const pc = playerCand(state);
    state.player.cash = pc.cash;
    state.player.nameRec = Math.max(state.player.nameRec, pc.nameRec);
    c.history.push({ date: { ...state.date }, cash: pc.cash, nameRec: U.round(pc.nameRec), fav: U.round(pc.fav) });
    PG.game.log(state, 'campaign', 'Campaign month: ' + U.fmtShortDate(state.date), lines);
    c.rolloutThisMonth = false; c.endorseAsks = 0;
    // Independents must make the ballot by the filing deadline.
    if (c.ballot && c.ballot.collected < c.ballot.required && U.dateCmp(state.date, c.info.filingDeadline) >= 0) {
      PG.game.log(state, 'campaign', 'You failed to collect enough valid signatures by the filing deadline and did not qualify for the ballot.');
      endCampaign(state, false, 'Failed to qualify for the ballot.');
      return;
    }
    if (c.officeId === 'president') { PG.presidential.afterMonth(state); return; }
    if (d && U.dateCmp(state.date, d) >= 0) PG.election.runStage(state);
  }

  function endCampaign(state, won, why) {
    const c = state.campaign;
    const pc = playerCand(state);
    if (pc) state.player.cash = Math.max(0, pc.cash);
    state.player.legacy.elections.push({ office: PG.data.officeById[c.officeId].name, year: c.info.general.year, won, why, share: c.lastResult ? c.lastResult.playerShare : null });
    const rc = c.candidates.find((x) => x.label === 'Your rival');
    if (rc && PG.cast) PG.cast.rivalRaceOver(state, c.officeId, !won && rc.active, won);
    state.campaign = null;
    state.phase = state.player.office ? 'governing' : 'career';
    if (state.gov && state.gov.decision === 'pending') state.gov.decision = null;
  }

  // While governing in a partisan office, a weak standing with the base invites a challenger.
  function primaryThreat(state) {
    const g = state.gov;
    if (!PG.data.officeById[g.officeId].partisan) { g.primaryThreat = 0; return; }
    const base = g.approval.base;
    const disloyal = (g.defections || 0) / Math.max(1, g.voteRecord.length);
    const act = state.cast ? state.cast.activist.rel : 0;
    const organizer = act < -20 ? 0.25 : act > 40 ? -0.15 : 0;
    g.primaryThreat = U.round(U.clamp((60 - base) / 25 + disloyal * 1.5 + (state.player.partyRel < 35 ? 0.3 : 0) + organizer + (g.challenger || 0), 0, 1), 2);
  }

  PG.campaign = {
    DAY_KEYS, DAY_LABELS, start, playerCand, opponents, stageCands, electorate, defaultPlan, setPlan, rollout, commissionPoll, seekEndorsement,
    pledgeNoPAC, releaseOppo, makePoll, processMonth, endCampaign, primaryThreat, daysAvailable, stageDate, makeCandidate, makePlayerCand,
    playerMonth, opponentMonth, targetBlocs, applyAds, endorse, endorsementScore, leaderId, holdDebate, sizeFactor,
  };
})(globalThis.PG = globalThis.PG || {});
