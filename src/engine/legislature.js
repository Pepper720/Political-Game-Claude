/* Legislatures: bills move through committee → floor → other chamber → (conference) →
 * executive → (override). Every member decides from ideology, party position, district
 * pressure, group lobbying, the player's whipping/deals, fiscal concerns and a stable
 * idiosyncratic term — and the result explains which of those decided it. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;

  function law(bill) { return PG.data.lawById[bill.lawId]; }
  function scopeMult(bill) { return PG.data.scopes[bill.scope - 1].mult; }
  function L(bill) { const l = law(bill), m = scopeMult(bill); return { econ: l.ideo.econ * m, social: l.ideo.social * m }; }
  function chamber(state, id) { return state.world.chambers[id]; }
  function member(state, chamberId, mid) { return chamber(state, chamberId).members.find((m) => m.id === mid); }
  function polarization(level) { return level === 'federal' ? 1 : level === 'state' ? 0.8 : 0.3; }
  function isPlayerMember(m) { return !!m.isPlayer; }

  // Executive for a level as a member-like object (ideology + party).
  function execFor(state, level) {
    const key = PG.juris.executiveFor(state, level);
    if (!key) return null;
    const p = state.player;
    if (p.office && p.office.officeId === (key === 'mayor' ? 'mayor' : key)) {
      return { isPlayer: true, party: p.party, econ: p.ideology.econ, social: p.ideology.social, name: p.name, title: PG.data.officeById[key].short };
    }
    const e = state.world.executives[key];
    return e ? { isPlayer: false, party: e.party, econ: e.econ, social: e.social, name: e.name, title: e.title } : null;
  }

  // Leadership position of a party on a bill: +1 whip yes, −1 whip no, 0 free vote.
  function partyPosition(state, level, party, bill) {
    if (party !== 'D' && party !== 'R') return 0;
    const n = PG.voters.partyNorm(party), l = L(bill);
    let v = (n.econ * l.econ + n.social * l.social) / 1500;
    if (bill.sponsorParty === party) v += 0.6;
    else if (bill.sponsorParty === 'D' || bill.sponsorParty === 'R') v -= 0.45 * polarization(level);
    const ex = execFor(state, level);
    if (ex && bill.execStance) v += (ex.party === party ? 0.5 : -0.25) * bill.execStance;
    if (law(bill).partyCost) v -= 0.4; // reforms that constrain incumbents
    return Math.abs(v) < 0.3 ? 0 : Math.sign(v);
  }

  /* Score > 0 means the member leans yes. Returns { score, parts }. */
  function memberScore(state, ch, m, bill, opts) {
    opts = opts || {};
    const lw = law(bill), l = L(bill), mult = scopeMult(bill);
    const level = ch.level === 'local' ? (ch.id === 'school' ? 'school' : 'city') : ch.level;
    const parts = {};
    parts.ideology = (m.econ * l.econ + m.social * l.social) / 1500;
    if (ch.partisan) {
      const pos = partyPosition(state, level, m.party, bill);
      if (pos) parts.party = pos * m.loyalty * 1.3;
    } else {
      // Nonpartisan bodies still sort loosely by worldview.
      parts.ideology *= 1.2;
    }
    const dIdeal = { econ: m.lean * 0.9, social: m.lean * 1.0 };
    const vulnerable = Math.abs(m.lean) < 12 ? 1.6 : 1;
    parts.district = (dIdeal.econ * l.econ + dIdeal.social * l.social) / 2600 * vulnerable;
    const hawk = Math.max(0, m.econ) / 100;
    const fiscal = -((lw.cost || 0) * mult) * hawk * 28 - Math.max(0, (lw.revenue || 0) * mult) * hawk * 20;
    if (Math.abs(fiscal) > 0.02) parts.fiscal = fiscal;
    // Interest-group lobbying moves members already sympathetic to the group.
    let gsum = 0; let top = null;
    for (const g of PG.groups.lobbying(state, lw, level, bill.sponsorId === 'player' || bill.sponsorId === 'exec')) {
      const align = Math.max(0, PG.groups.ideoAlignment(g.ideo, m));
      const v = g.intensity * align * 0.1;
      gsum += v;
      if (!top || Math.abs(v) > Math.abs(top.v)) top = { id: g.id, name: g.name, v };
    }
    if (Math.abs(gsum) > 0.02) { parts.groups = gsum; parts._topGroup = top; }
    // Player influence: relationships, whipping, deals, public pressure.
    const ps = bill.playerStance || 0;
    if (ps && !m.isPlayer) {
      const relv = (m.rel || 0) / 100 * 0.8;
      const whip = (bill.whip && bill.whip[m.id]) || 0;
      const deal = bill.deals && bill.deals[m.id] ? 1.1 : 0;
      const pub = bill.publicPush ? U.clamp((opts.approval || 50) - 45, -15, 20) / 20 * 0.3 : 0;
      const v = ps * (relv + whip * 0.4 + deal + pub);
      if (Math.abs(v) > 0.02) parts.player = v;
    }
    const ex = execFor(state, level);
    if (ex && bill.execStance && !ex.isPlayer && ch.partisan && ex.party === m.party) parts.executive = bill.execStance * 0.25;
    if (ex && ex.isPlayer && bill.execStance && ch.partisan && ex.party === m.party) parts.executive = bill.execStance * 0.3;
    if (bill.cosponsors && bill.cosponsors.includes(m.id)) parts.cosponsor = 0.6;
    if (opts.override) {
      // Sustaining a veto: the executive's party rallies.
      if (ex && ch.partisan && ex.party === m.party) parts.executive = (parts.executive || 0) - 0.9 * m.loyalty;
    }
    parts.personal = PG.rng.hashNormal(bill.id + '|' + m.id) * 0.3 - 0.08;
    let score = 0;
    for (const [k, v] of Object.entries(parts)) if (k[0] !== '_') score += v;
    return { score, parts };
  }

  const PART_LABEL = { ideology: 'ideology', party: 'party leadership', district: 'district pressure', fiscal: 'cost concerns',
    groups: 'interest-group lobbying', player: 'your persuasion', executive: 'the executive', cosponsor: 'cosponsorship', personal: 'personal conviction' };

  function topReason(parts, direction) {
    let best = null, bv = 0;
    for (const [k, v] of Object.entries(parts)) {
      if (k[0] === '_' || k === 'party') continue;
      const d = v * direction;
      if (d > bv) { bv = d; best = k; }
    }
    if (best === 'groups' && parts._topGroup) return parts._topGroup.name + ' lobbying';
    return PART_LABEL[best] || 'personal conviction';
  }

  function threshold(state, ch, bill, kind) {
    const n = ch.members.length;
    if (kind === 'cloture') return Math.ceil(n * 0.6);
    if (kind === 'override') return Math.ceil(n * (ch.rules.override || 2 / 3) - 1e-9);
    return Math.floor(n / 2) + 1;
  }

  /* Whip count: projected position of every member. */
  function whipCount(state, chamberId, bill, opts) {
    const ch = chamber(state, chamberId);
    const approval = state.gov ? state.gov.approval.overall : 50;
    const rows = ch.members.map((m) => {
      if (m.isPlayer) return { id: m.id, name: m.name, party: m.party, score: (bill.playerVote === 'N' ? -1 : 1) * 2, lean: bill.playerVote || '?', you: true };
      const s = memberScore(state, ch, m, bill, { approval, override: opts && opts.override });
      const lean = s.score > 0.6 ? 'Y' : s.score > 0.15 ? 'y' : s.score < -0.6 ? 'N' : s.score < -0.15 ? 'n' : '?';
      return { id: m.id, name: m.name, party: m.party, lean: lean, score: s.score, parts: s.parts, reason: topReason(s.parts, Math.sign(s.score) || 1), state: m.state, district: m.district };
    });
    const yes = rows.filter((r) => r.score > 0).length;
    return { rows, yes, no: rows.length - yes, needed: threshold(state, ch, bill, opts && opts.kind), firm: { Y: rows.filter((r) => r.lean === 'Y').length, N: rows.filter((r) => r.lean === 'N').length } };
  }

  /* Actually hold a vote. kind: 'passage' | 'cloture' | 'override' | 'committee'. */
  function vote(state, chamberId, bill, kind, memberIds) {
    const ch = chamber(state, chamberId);
    const level = ch.level === 'local' ? (ch.id === 'school' ? 'school' : 'city') : ch.level;
    const approval = state.gov ? state.gov.approval.overall : 50;
    const voters = memberIds ? ch.members.filter((m) => memberIds.includes(m.id)) : ch.members;
    let yea = 0, nay = 0;
    const roll = {};
    const defections = [];
    for (const m of voters) {
      let yes;
      let s = null;
      if (m.isPlayer) {
        if (bill.playerVote === 'A') { roll[m.id] = 'A'; continue; } // absent
        yes = bill.playerVote ? bill.playerVote === 'Y' : partyPosition(state, level, m.party, bill) >= 0;
      } else {
        s = memberScore(state, ch, m, bill, { approval, override: kind === 'override' });
        const sc = s.score + (Math.abs(s.score) < 0.35 ? R.normal(state, 0, 0.25) : 0);
        yes = sc > 0;
      }
      roll[m.id] = yes ? 'Y' : 'N';
      if (yes) yea++; else nay++;
      if (s && ch.partisan) {
        const pos = partyPosition(state, level, m.party, bill);
        if (pos && (pos > 0) !== yes) defections.push({ m, reason: topReason(s.parts, yes ? 1 : -1) });
      } else if (s && !ch.partisan) {
        defections.push({ m, reason: topReason(s.parts, yes ? 1 : -1), yes });
      }
    }
    const needed = kind === 'committee' ? Math.floor(voters.length / 2) + 1 : threshold(state, ch, bill, kind);
    const passed = yea >= needed;
    const summary = explain(state, ch, bill, { yea, nay, needed, passed, defections, kind, level });
    const rec = { date: { ...state.date }, chamber: chamberId, chamberName: ch.name, kind, yea, nay, needed, passed, roll, summary: summary.text, reasons: summary.reasons };
    bill.votes.push(rec);
    if (bill.votes.length > 12) bill.votes.shift();
    return rec;
  }

  function explain(state, ch, bill, v) {
    const kindName = { passage: 'Floor vote', cloture: 'Cloture vote', override: 'Override vote', committee: 'Committee vote', conference: 'Conference report' }[v.kind] || 'Vote';
    const text = kindName + ' ' + (v.passed ? 'succeeded' : 'failed') + ' ' + v.yea + '–' + v.nay + (v.kind === 'cloture' || v.kind === 'override' ? ' (needed ' + v.needed + ')' : '');
    const reasons = [];
    if (ch.partisan) {
      const byParty = {};
      for (const d of v.defections) {
        const key = d.m.party;
        byParty[key] = byParty[key] || {};
        byParty[key][d.reason] = (byParty[key][d.reason] || 0) + 1;
      }
      for (const [party, rs] of Object.entries(byParty)) {
        const total = U.sum(Object.values(rs));
        const pos = partyPosition(state, v.level, party, bill);
        const list = Object.entries(rs).sort((a, b) => b[1] - a[1]).map(([r, n]) => r + (n > 1 ? ' ×' + n : '')).join(', ');
        reasons.push(U.plural(total, PG.data.parties[party].adj + ' member') + ' broke with party leadership (' + (pos > 0 ? 'which backed it' : 'which opposed it') + '): ' + list + '.');
        const names = v.defections.filter((d) => d.m.party === party).slice(0, 4).map((d) => d.m.name + (d.m.state && ch.level === 'federal' ? ' (' + d.m.state + ')' : ''));
        if (names.length) reasons.push('Defectors included ' + names.join(', ') + (total > names.length ? ' and others' : '') + '.');
      }
      for (const party of ['D', 'R']) {
        const pos = partyPosition(state, v.level, party, bill);
        if (!pos) reasons.push(PG.data.parties[party].name + ' leadership let members vote their conscience.');
      }
    } else {
      const swing = v.defections.filter((d) => true).slice(0, 3);
      if (swing.length) reasons.push('Deciding factors: ' + swing.map((d) => d.m.name + ' (' + (d.yes ? 'yes' : 'no') + ': ' + d.reason + ')').join('; ') + '.');
    }
    const lw = law(bill);
    const lob = PG.groups.lobbying(state, lw, v.level, bill.sponsorId === 'player' || bill.sponsorId === 'exec').sort((a, b) => Math.abs(b.intensity) - Math.abs(a.intensity)).slice(0, 2);
    if (lob.length) reasons.push('Lobbying: ' + lob.map((g) => g.name + (g.intensity > 0 ? ' pushed for it' : ' fought it') + (PG.groups.rel(state, g.id) < -30 && g.intensity < 0 && (bill.sponsorId === 'player' || bill.sponsorId === 'exec') ? ' (hard — they have a grudge against you)' : '')).join('; ') + '.');
    if (v.kind === 'cloture' && !v.passed) reasons.push('The minority sustained a filibuster; 60 votes are needed to end debate.');
    if (bill.deals && Object.keys(bill.deals).length) reasons.push('Side deals with ' + U.plural(Object.keys(bill.deals).length, 'member') + ' were in play.');
    return { text, reasons };
  }

  // ------------------------------------------------------------------ bills
  function newBill(state, opts) {
    const lw = PG.data.lawById[opts.lawId];
    const level = state.gov.level;
    const chambers = PG.juris.chambersFor(state, level);
    let origin = opts.origin || chambers[0];
    const order = [origin].concat(chambers.filter((c) => c !== origin));
    const bill = {
      id: U.nextId(state, 'b'), lawId: lw.id, title: lw.name, scope: opts.scope || 2, sponsorId: opts.sponsorId, sponsorName: opts.sponsorName,
      sponsorParty: opts.sponsorParty || null, chambers: order, ci: 0, stage: 'committee', monthsInStage: 0, history: [], votes: [], cosponsors: [],
      whip: {}, deals: {}, playerStance: opts.playerStance || 0, execStance: opts.execStance || 0, playerVote: null, created: { ...state.date },
      reconciliation: false, level,
    };
    bill.committee = referral(state, order[0], lw);
    hist(state, bill, 'Introduced by ' + bill.sponsorName + '; referred to ' + committeeName(state, order[0], bill.committee) + '.');
    state.gov.bills.push(bill);
    return bill;
  }

  function referral(state, chamberId, lw) {
    const ch = chamber(state, chamberId);
    const c = ch.committees.find((x) => x.cats.includes(lw.cat)) || ch.committees[0];
    return c.id;
  }
  function committeeName(state, chamberId, cid) { const c = chamber(state, chamberId).committees.find((x) => x.id === cid); return c ? c.name : 'committee'; }
  function hist(state, bill, text, causes) { bill.history.push({ date: { ...state.date }, text, causes: causes || null }); }

  function activeBills(state) { return state.gov ? state.gov.bills.filter((b) => !['enacted', 'dead', 'vetoed'].includes(b.stage)) : []; }

  // Player introduces (legislator) or sends (executive) a bill.
  function introduce(state, lawId, scope) {
    const g = state.gov;
    const p = state.player;
    const lw = PG.data.lawById[lawId];
    if (!lw) return { ok: false, msg: 'Unknown law.' };
    if (!lw.levels.includes(g.level)) return { ok: false, msg: 'That is not within this government\'s authority.' };
    if (activeBills(state).some((b) => b.lawId === lawId)) return { ok: false, msg: 'A version of that bill is already moving.' };
    const cost = 4;
    if (p.capital < cost) return { ok: false, msg: 'Introducing a bill takes ' + cost + ' political capital.' };
    p.capital -= cost;
    let bill;
    if (g.kind === 'legislator') {
      bill = newBill(state, { lawId, scope, sponsorId: 'player', sponsorName: p.name + ' (you)', sponsorParty: p.party === 'D' || p.party === 'R' ? p.party : null, playerStance: 1, origin: g.body });
      bill.playerVote = 'Y';
    } else {
      // Executives need a legislative sponsor: pick the friendliest senior member.
      const chId = PG.juris.chambersFor(state, g.level)[0];
      const ch = chamber(state, chId);
      const sponsor = U.sortBy(ch.members.filter((m) => !m.isPlayer && (!ch.partisan || m.party === p.party || p.party === 'I')), (m) => -((m.rel || 0) + m.seniority * 2 + (m.econ * lw.ideo.econ + m.social * lw.ideo.social) / 100))[0] || ch.members[0];
      bill = newBill(state, { lawId, scope, sponsorId: 'exec', sponsorName: sponsor.name + ' (on your behalf)', sponsorParty: ch.partisan ? sponsor.party : null, playerStance: 1, execStance: 1, origin: chId });
    }
    PG.game.log(state, 'legislation', 'You ' + (g.kind === 'legislator' ? 'introduced' : 'sent the legislature') + ' the ' + lw.name + ' (' + PG.data.scopes[scope - 1].name + ').');
    PG.groups.reactToLaw(state, lw, scope, 0.4, 'You proposed');
    return { ok: true, bill };
  }

  // AI legislators introduce bills during session.
  function aiBills(state) {
    const g = state.gov;
    const level = g.level;
    if (activeBills(state).filter((b) => b.sponsorId !== 'player' && b.sponsorId !== 'exec').length >= 4) return;
    if (!R.chance(state, level === 'school' ? 0.35 : 0.55)) return;
    const chId = PG.juris.chambersFor(state, level)[R.int(state, 0, PG.juris.chambersFor(state, level).length - 1)];
    const ch = chamber(state, chId);
    const enacted = new Set(g.enacted.map((e) => e.lawId));
    const active = new Set(activeBills(state).map((b) => b.lawId));
    const pool = PG.data.laws.filter((l) => l.levels.includes(level) && !enacted.has(l.id) && !active.has(l.id));
    if (!pool.length) return;
    const majority = ch.partisan ? ch.majority : null;
    const sponsorParty = majority && R.chance(state, 0.22) ? (majority === 'D' ? 'R' : 'D') : majority;
    const norm = sponsorParty ? PG.voters.partyNorm(sponsorParty) : { econ: U.sum(ch.members, (m) => m.econ) / ch.members.length, social: U.sum(ch.members, (m) => m.social) / ch.members.length };
    const lw = R.weighted(state, pool, (l) => Math.max(0.05, (norm.econ * l.ideo.econ + norm.social * l.ideo.social) / 1500 + 0.45));
    if (!lw) return;
    const cands = ch.members.filter((m) => !m.isPlayer && (!sponsorParty || m.party === sponsorParty));
    const sponsor = R.weighted(state, cands, (m) => Math.max(0.05, (m.econ * lw.ideo.econ + m.social * lw.ideo.social) / 1500 + 0.5 + m.seniority / 20));
    if (!sponsor) return;
    const scope = R.pick(state, [1, 2, 2, 3]);
    const bill = newBill(state, { lawId: lw.id, scope, sponsorId: sponsor.id, sponsorName: sponsor.name + (ch.partisan ? ' (' + sponsor.party + ')' : ''), sponsorParty: ch.partisan ? sponsor.party : null, origin: chId });
    // AI executive signals a stance on big partisan bills.
    const ex = execFor(state, level);
    if (ex && !ex.isPlayer) {
      const s = (ex.econ * lw.ideo.econ + ex.social * lw.ideo.social) / 1500;
      if (Math.abs(s) > 0.5) bill.execStance = Math.sign(s);
    }
    return bill;
  }

  /* Monthly pipeline. Docketed floor votes (already visible to the player) are held,
   * then bills move and next month's docket is set. Returns nothing; logs results. */
  function monthly(state, autopilot) {
    const g = state.gov;
    const st = PG.juris.homeState(state);
    const session = PG.calendar.inSession(g.level === 'school' || g.level === 'city' ? 'local' : g.level, st, state.date.month, state.date.year);
    // 1) Hold docketed votes.
    for (const item of g.docket) {
      const bill = g.bills.find((b) => b.id === item.billId);
      if (!bill || bill.stage === 'dead') continue;
      if (autopilot && bill.playerVote === null && isPlayerChamber(state, item.chamber)) {
        // Absent while campaigning: the vote is missed.
        bill.playerVote = 'A';
        g.missedVotes = (g.missedVotes || 0) + 1;
      }
      holdFloorVote(state, bill, item.chamber);
    }
    g.docket = [];
    if (!session) {
      // Bills still in committee when session ends die.
      for (const b of activeBills(state)) {
        if (b.stage === 'committee' && b.monthsInStage > 0 && g.level === 'state') { b.stage = 'dead'; hist(state, b, 'Died in committee when the session adjourned.'); }
      }
      return;
    }
    // 2) Committee action, executive action, overrides.
    for (const bill of activeBills(state)) {
      bill.monthsInStage++;
      if (bill.stage === 'committee') committeeStep(state, bill);
      else if (bill.stage === 'desk') deskStep(state, bill, autopilot);
      else if (bill.stage === 'override') overrideStep(state, bill);
      else if (bill.stage === 'conference') conferenceStep(state, bill);
    }
    aiBills(state);
    // Keep saves small: retain only the most recent finished bills.
    const finished = g.bills.filter((b) => ['enacted', 'dead', 'vetoed'].includes(b.stage));
    if (finished.length > 30) { const drop = new Set(finished.slice(0, finished.length - 30).map((b) => b.id)); g.bills = g.bills.filter((b) => !drop.has(b.id)); }
    // 3) Schedule next month's floor votes.
    for (const bill of activeBills(state)) {
      if (bill.stage !== 'floor') continue;
      const chId = bill.chambers[bill.ci];
      if (scheduleDecision(state, bill, chId)) {
        g.docket.push({ billId: bill.id, chamber: chId });
        if (isPlayerChamber(state, chId)) bill.playerVote = bill.sponsorId === 'player' ? 'Y' : null;
      } else if (bill.monthsInStage > 5) {
        bill.stage = 'dead'; hist(state, bill, 'Leadership never brought it to the floor.');
      }
    }
  }

  function isPlayerChamber(state, chId) {
    return state.gov && state.gov.kind === 'legislator' && state.gov.body === chId;
  }

  function committeeStep(state, bill) {
    const chId = bill.chambers[bill.ci];
    const ch = chamber(state, chId);
    const com = ch.committees.find((c) => c.id === bill.committee);
    const chair = com && com.chair ? ch.members.find((m) => m.id === com.chair) : null;
    let markup;
    if (chair && chair.isPlayer) markup = bill.playerStance >= 0 && !bill.buried;
    else {
      const cs = chair ? memberScore(state, ch, chair, bill).score : 0;
      const push = (bill.markupPush || 0) * 0.6 + (bill.cosponsors.length / Math.max(5, ch.members.length)) * 2 + (bill.ci > 0 ? 0.8 : 0);
      markup = R.chance(state, U.logistic(cs * 1.8 + push - 0.4));
    }
    if (!markup) {
      if (bill.monthsInStage >= 4) { bill.stage = 'dead'; hist(state, bill, 'Never received a hearing — the chair, ' + (chair ? chair.name : 'committee leadership') + ', let it die.'); }
      return;
    }
    const v = vote(state, chId, bill, 'committee', com.members);
    hist(state, bill, com.name + ': ' + v.summary, v.reasons);
    if (v.passed) { bill.stage = 'floor'; bill.monthsInStage = 0; }
    else { bill.stage = 'dead'; logBill(state, bill, 'died in committee', v); }
  }

  function scheduleDecision(state, bill, chId) {
    const ch = chamber(state, chId);
    const leader = ch.leaders.majority ? ch.members.find((m) => m.id === ch.leaders.majority) : null;
    if (leader && leader.isPlayer) return bill.playerStance >= 0;
    if (bill.discharged) return true;
    if (!ch.partisan) return true;
    // "Majority of the majority": leaders rarely schedule bills most of their caucus opposes.
    const maj = ch.members.filter((m) => m.party === ch.majority && !m.isPlayer);
    const support = maj.filter((m) => memberScore(state, ch, m, bill).score > 0).length;
    const ok = support > maj.length / 2;
    return ok || R.chance(state, (bill.floorPush || 0) * 0.25);
  }

  function fiscalYear(state) {
    const fy = PG.calendar.fyStart(state.gov.level, PG.juris.homeState(state));
    return state.date.month >= fy ? state.date.year + 1 : state.date.year;
  }

  // Budget reconciliation: one budgetary vehicle per fiscal year may bypass the filibuster.
  function maybeReconcile(state, bill, ch) {
    if (!ch.rules.cloture || bill.reconciliation || !law(bill).budgetary) return;
    const g = state.gov;
    if (g.reconUsed === fiscalYear(state)) return;
    const wantsIt = bill.reconRequested || (bill.sponsorParty && bill.sponsorParty === ch.majority && R.chance(state, 0.5));
    if (!wantsIt) return;
    bill.reconciliation = true;
    g.reconUsed = fiscalYear(state);
    hist(state, bill, 'Moved under budget reconciliation: only a simple majority is needed in the Senate (Byrd rule limits it to budgetary provisions).');
  }

  function requestReconciliation(state, billId) {
    const bill = state.gov.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, msg: 'No such bill.' };
    if (!law(bill).budgetary) return { ok: false, msg: 'Only budgetary measures (taxes and spending) qualify under the Byrd rule.' };
    if (state.gov.level !== 'federal') return { ok: false, msg: 'Reconciliation is a congressional procedure.' };
    if (state.gov.reconUsed === fiscalYear(state)) return { ok: false, msg: 'This fiscal year\'s reconciliation vehicle has already been used.' };
    const sen = chamber(state, 'us_senate');
    if (state.player.party !== sen.majority) return { ok: false, msg: 'Only the Senate majority can set up a reconciliation bill.' };
    if (state.player.capital < 6) return { ok: false, msg: 'Costs 6 political capital.' };
    state.player.capital -= 6;
    bill.reconRequested = true;
    return { ok: true, msg: 'Leadership agreed to use this fiscal year\'s reconciliation instructions for the ' + bill.title + '.' };
  }

  function holdFloorVote(state, bill, chId) {
    const ch = chamber(state, chId);
    maybeReconcile(state, bill, ch);
    if (isPlayerChamber(state, chId) && !bill.playerVote) bill.playerVote = partyPosition(state, bill.level, state.player.party, bill) >= 0 ? 'Y' : 'N';
    if (ch.rules.cloture && !bill.reconciliation) {
      const c = vote(state, chId, bill, 'cloture');
      hist(state, bill, ch.name + ' — ' + c.summary, c.reasons);
      if (!c.passed) { bill.stage = 'dead'; logBill(state, bill, 'was filibustered in the ' + ch.name, c); return; }
    }
    let v = vote(state, chId, bill, 'passage');
    // Second chamber may pass a scaled-back version instead.
    if (!v.passed && bill.ci > 0 && bill.scope > 1) {
      const orig = bill.scope;
      bill.scope--;
      const w = whipCount(state, chId, bill);
      if (w.yes >= w.needed) {
        bill.votes.pop();
        v = vote(state, chId, bill, 'passage');
        hist(state, bill, ch.name + ' amended it down to "' + PG.data.scopes[bill.scope - 1].name + '" and passed it ' + v.yea + '–' + v.nay + '.', v.reasons);
        bill.stage = 'conference'; bill.monthsInStage = 0; bill.ci++;
        return;
      }
      bill.scope = orig;
    }
    hist(state, bill, ch.name + ' — ' + v.summary, v.reasons);
    if (!v.passed) { bill.stage = 'dead'; logBill(state, bill, 'failed in the ' + ch.name, v); return; }
    if (isPlayerChamber(state, chId) && bill.playerVote && bill.playerVote !== 'A') recordPlayerVote(state, bill);
    bill.ci++;
    bill.monthsInStage = 0;
    if (bill.ci >= bill.chambers.length) toDesk(state, bill);
    else { bill.stage = 'committee'; bill.committee = referral(state, bill.chambers[bill.ci], law(bill)); bill.playerVote = null; }
  }

  function conferenceStep(state, bill) {
    // Both chambers vote on the conference report (the reconciled version).
    for (const chId of bill.chambers) {
      if (isPlayerChamber(state, chId) && !bill.playerVote) bill.playerVote = bill.playerStance >= 0 ? 'Y' : 'N';
      const v = vote(state, chId, bill, 'passage');
      hist(state, bill, 'Conference report in the ' + chamber(state, chId).name + ': ' + v.summary, v.reasons);
      if (!v.passed) { bill.stage = 'dead'; logBill(state, bill, 'collapsed in conference', v); return; }
    }
    toDesk(state, bill);
  }

  function toDesk(state, bill) {
    const ex = execFor(state, bill.level);
    bill.monthsInStage = 0;
    if (!ex) { enact(state, bill, 'Adopted by the board.'); return; }
    bill.stage = 'desk';
    if (ex.isPlayer) {
      state.gov.desk = state.gov.desk || [];
      state.gov.desk.push(bill.id);
      PG.game.log(state, 'legislation', '"' + bill.title + '" passed the legislature and awaits your signature or veto.');
    }
  }

  function deskStep(state, bill, autopilot) {
    const ex = execFor(state, bill.level);
    if (ex.isPlayer) {
      if (autopilot || bill.monthsInStage >= 2) {
        // Unsigned bills become law (as in most states) — note it.
        state.gov.desk = state.gov.desk.filter((x) => x !== bill.id);
        enact(state, bill, 'Became law without your signature.');
      }
      return;
    }
    const lw = law(bill), l = L(bill);
    let s = (ex.econ * l.econ + ex.social * l.social) / 1500 + 0.25;
    if (bill.sponsorParty && bill.sponsorParty === ex.party) s += 0.5;
    else if (bill.sponsorParty) s -= 0.3;
    if (bill.sponsorId === 'player' && state.player.party === ex.party) s += 0.2;
    if (s > -0.2) enact(state, bill, 'Signed by ' + ex.title + ' ' + ex.name + '.');
    else {
      bill.stage = 'override'; bill.monthsInStage = 0;
      hist(state, bill, 'Vetoed by ' + ex.title + ' ' + ex.name + ' (' + PG.data.parties[ex.party].adj + '): the policy cuts against the executive\'s agenda.');
      PG.game.log(state, 'legislation', ex.title + ' ' + ex.name + ' vetoed the ' + lw.name + '.');
    }
  }

  function overrideStep(state, bill) {
    for (const chId of bill.chambers) {
      if (isPlayerChamber(state, chId) && !bill.playerVote) bill.playerVote = bill.playerStance >= 0 ? 'Y' : 'N';
      const v = vote(state, chId, bill, 'override');
      hist(state, bill, 'Override attempt in the ' + chamber(state, chId).name + ': ' + v.summary, v.reasons);
      if (!v.passed) { bill.stage = 'vetoed'; logBill(state, bill, 'veto was sustained', v); return; }
    }
    enact(state, bill, 'Enacted over the veto.');
  }

  function recordPlayerVote(state, bill) {
    const lw = law(bill);
    const yes = bill.playerVote === 'Y';
    const w = bill.sponsorId === 'player' ? 1.0 : 0.55;
    if (!bill.recorded) {
      bill.recorded = true;
      PG.approval.policyReaction(state, lw, bill.scope, yes ? w : -w * 0.6);
      const lines = PG.groups.reactToLaw(state, lw, bill.scope, yes ? w * 0.8 : -w * 0.8, yes ? 'You voted for' : 'You voted against');
      // Party discipline.
      const pos = partyPosition(state, bill.level, state.player.party, bill);
      if (pos && (pos > 0) !== yes) {
        state.player.partyRel = U.clamp(state.player.partyRel - 4, 0, 100);
        lines.push('Party leadership noticed you broke ranks (−4)');
        state.gov.defections = (state.gov.defections || 0) + 1;
      } else if (pos) state.player.partyRel = U.clamp(state.player.partyRel + 0.5, 0, 100);
      state.gov.voteRecord.push({ date: { ...state.date }, bill: bill.title, vote: bill.playerVote, partyLine: pos ? (pos > 0) === yes : null });
      if (lines.length) PG.game.log(state, 'vote', 'You voted ' + (yes ? 'YES' : 'NO') + ' on "' + lw.name + '".', lines);
    }
  }

  function enact(state, bill, how) {
    const lw = law(bill);
    bill.stage = 'enacted';
    hist(state, bill, how);
    const g = state.gov;
    const causes = PG.budget.applyLaw(state, lw, bill.scope);
    const mult = scopeMult(bill);
    for (const [k, v] of Object.entries(lw.outcomes || {})) g.lawOutcomes[k] = (g.lawOutcomes[k] || 0) + v * mult;
    if (lw.econ) {
      const eff = {};
      for (const [k, v] of Object.entries(lw.econ)) eff[k] = v * mult * (g.level === 'federal' ? 1 : g.level === 'state' ? 0.6 : 0.3);
      PG.economy.shock(state, eff, g.level === 'federal');
    }
    g.enacted.push({ lawId: lw.id, scope: bill.scope, date: { ...state.date }, billId: bill.id, sponsor: bill.sponsorName, active: true, byPlayer: bill.sponsorId === 'player' || bill.sponsorId === 'exec' });
    // Responsibility: executives own what they sign; sponsors own their bills.
    const ex = execFor(state, bill.level);
    if (ex && ex.isPlayer) {
      PG.approval.policyReaction(state, lw, bill.scope, bill.execStance >= 0 ? 0.9 : 0.5);
      if (!bill.groupsDone) { PG.groups.reactToLaw(state, lw, bill.scope, 0.9, 'You signed'); bill.groupsDone = true; }
    } else if (bill.sponsorId === 'player') {
      PG.approval.policyReaction(state, lw, bill.scope, 0.6);
    }
    if (bill.sponsorId === 'player' || bill.sponsorId === 'exec') {
      state.player.legacy.laws.push({ name: lw.name, scope: bill.scope, date: { ...state.date }, level: g.level });
      state.player.capital += 3;
    }
    if (lw.id === 'independent_redistricting' && g.level === 'state') state.world.redistrictingOverride = 'commission';
    PG.game.log(state, 'legislation', 'ENACTED: ' + lw.name + ' (' + PG.data.scopes[bill.scope - 1].name + '). ' + how, causes);
    PG.game.news(state, lw.name + ' becomes law', 0);
    if (PG.courts) PG.courts.maybeChallenge(state, { type: 'law', id: bill.id, lawId: lw.id, name: lw.name, ideo: L(bill), vuln: (lw.legal && lw.legal.vuln) || 0.05, grounds: lw.legal && lw.legal.grounds, tags: lw.tags, level: g.level });
    if (PG.courts && lw.preempt) PG.courts.preemption(state, bill, lw);
  }

  function logBill(state, bill, what, v) {
    const mine = bill.sponsorId === 'player' || bill.sponsorId === 'exec' || bill.playerStance;
    PG.game.log(state, 'legislation', '"' + bill.title + '" ' + what + ' (' + v.yea + '–' + v.nay + ').', v.reasons);
    if (mine && bill.playerStance > 0) state.player.capital = Math.max(0, state.player.capital - 2);
  }

  // ----------------------------------------------------------- player tools
  function whip(state, billId, memberId) {
    const p = state.player, bill = state.gov.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, msg: 'No such bill.' };
    if (p.capital < 2) return { ok: false, msg: 'Whipping a vote costs 2 political capital.' };
    p.capital -= 2;
    bill.whip[memberId] = (bill.whip[memberId] || 0) + 1;
    const m = findMember(state, memberId);
    if (m) m.rel = U.clamp((m.rel || 0) - 1, -100, 100); // pressure wears on relationships
    return { ok: true, msg: 'You leaned on ' + (m ? m.name : 'the member') + '.' };
  }

  function deal(state, billId, memberId) {
    const p = state.player, bill = state.gov.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, msg: 'No such bill.' };
    if (p.capital < 3) return { ok: false, msg: 'A side deal costs 3 political capital (plus a district project).' };
    p.capital -= 3;
    bill.deals[memberId] = true;
    const m = findMember(state, memberId);
    if (m) m.rel = U.clamp((m.rel || 0) + 8, -100, 100);
    if (state.gov.budget) PG.budget.oneTime(state, -0.0015);
    state.gov.earmarks = (state.gov.earmarks || 0) + 1;
    PG.groups.change(state, 'taxpayers', -1.5, 'Pork-barrel deal');
    return { ok: true, msg: 'Deal struck with ' + (m ? m.name : 'the member') + ': a project for their district in exchange for their vote.' };
  }

  function seekCosponsors(state, billId) {
    const p = state.player, bill = state.gov.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, msg: 'No such bill.' };
    if (p.capital < 2) return { ok: false, msg: 'Costs 2 political capital.' };
    p.capital -= 2;
    const ch = chamber(state, bill.chambers[bill.ci]);
    const added = [];
    for (const m of ch.members) {
      if (m.isPlayer || bill.cosponsors.includes(m.id)) continue;
      const s = memberScore(state, ch, m, bill).score;
      if (s > 0.45 && R.chance(state, 0.5)) { bill.cosponsors.push(m.id); added.push(m); }
      if (added.length >= 6) break;
    }
    const bip = ch.partisan ? added.filter((m) => m.party !== p.party).length : 0;
    return { ok: true, msg: added.length ? U.plural(added.length, 'new cosponsor') + (bip ? ' (' + bip + ' from across the aisle)' : '') + '.' : 'No one else would sign on yet.' };
  }

  function pushBill(state, billId) {
    const p = state.player, bill = state.gov.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, msg: 'No such bill.' };
    if (p.capital < 3) return { ok: false, msg: 'Costs 3 political capital.' };
    p.capital -= 3;
    if (bill.stage === 'committee') bill.markupPush = (bill.markupPush || 0) + 1;
    else if (bill.stage === 'floor') bill.floorPush = (bill.floorPush || 0) + 1;
    return { ok: true, msg: 'You pressed leadership to move the ' + bill.title + '.' };
  }

  function goPublic(state, billId) {
    const p = state.player, bill = state.gov.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, msg: 'No such bill.' };
    if (p.capital < 4) return { ok: false, msg: 'A public campaign costs 4 political capital.' };
    p.capital -= 4;
    bill.publicPush = true;
    p.nameRec = U.clamp(p.nameRec + 1, 0, 100);
    return { ok: true, msg: 'You took your case for the ' + bill.title + ' directly to voters. It helps only as much as you are popular.' };
  }

  function setStance(state, billId, stance) {
    const bill = state.gov.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, msg: 'No such bill.' };
    bill.playerStance = stance;
    if (state.gov.kind === 'executive') {
      bill.execStance = stance;
      if (stance < 0) PG.game.log(state, 'legislation', 'You issued a veto threat against the ' + bill.title + '.');
    }
    return { ok: true, msg: stance > 0 ? 'You endorsed the ' + bill.title + '.' : stance < 0 ? 'You came out against the ' + bill.title + '.' : 'You are staying neutral.' };
  }

  function castVote(state, billId, v) {
    const bill = state.gov.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, msg: 'No such bill.' };
    bill.playerVote = v;
    return { ok: true };
  }

  function discharge(state, billId) {
    const bill = state.gov.bills.find((b) => b.id === billId);
    const chId = bill && bill.chambers[bill.ci];
    if (!bill || chId !== 'us_house' || bill.stage !== 'floor') return { ok: false, msg: 'Discharge petitions only apply to House bills stuck awaiting a floor vote.' };
    const w = whipCount(state, chId, bill);
    if (w.yes < 218) return { ok: false, msg: 'Only ' + w.yes + ' members would sign; 218 needed.' };
    bill.discharged = true;
    state.player.partyRel = U.clamp(state.player.partyRel - (chamber(state, chId).majority === state.player.party ? 12 : 2), 0, 100);
    return { ok: true, msg: 'Discharge petition reached 218 signatures; the bill goes to the floor over leadership\'s objections.' };
  }

  function bury(state, billId) {
    const bill = state.gov.bills.find((b) => b.id === billId);
    if (!bill) return { ok: false, msg: 'No such bill.' };
    bill.buried = true;
    return { ok: true, msg: 'As chair, you declined to schedule a markup.' };
  }

  function findMember(state, mid) {
    for (const ch of Object.values(state.world.chambers)) { const m = ch.members.find((x) => x.id === mid); if (m) return m; }
    return null;
  }

  // Executive decision on a bill on the desk.
  function sign(state, billId) {
    const bill = state.gov.bills.find((b) => b.id === billId);
    if (!bill || bill.stage !== 'desk') return { ok: false, msg: 'Nothing to sign.' };
    state.gov.desk = state.gov.desk.filter((x) => x !== billId);
    enact(state, bill, 'Signed into law by you.');
    return { ok: true, msg: 'You signed the ' + bill.title + '.' };
  }
  function veto(state, billId) {
    const bill = state.gov.bills.find((b) => b.id === billId);
    if (!bill || bill.stage !== 'desk') return { ok: false, msg: 'Nothing to veto.' };
    state.gov.desk = state.gov.desk.filter((x) => x !== billId);
    bill.stage = 'override'; bill.monthsInStage = 0; bill.execStance = -1;
    hist(state, bill, 'Vetoed by you.');
    const lw = law(bill);
    PG.approval.policyReaction(state, lw, bill.scope, -0.5);
    const lines = PG.groups.reactToLaw(state, lw, bill.scope, -0.8, 'You vetoed');
    state.player.legacy.vetoes++;
    PG.game.log(state, 'legislation', 'You vetoed the ' + lw.name + '. The legislature may try to override.', lines);
    return { ok: true, msg: 'Vetoed.' };
  }

  PG.leg = {
    law, chamber, member, memberScore, partyPosition, whipCount, vote, newBill, introduce, aiBills, monthly, activeBills, execFor,
    requestReconciliation, fiscalYear, whip, deal, seekCosponsors, pushBill, goPublic, setStance, castVote, discharge, bury, sign, veto, findMember, enact, isPlayerChamber, threshold, L,
  };
})(globalThis.PG = globalThis.PG || {});
