/* Courts: legal challenges to laws and executive orders (trial → appeal → supreme
 * court, with preliminary injunctions), state preemption of local ordinances, and
 * judicial vacancies that Presidents and governors fill — shifting future rulings. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;

  const STAGES = ['trial', 'appeal', 'supreme'];

  function init(state) {
    const st = PG.juris.homeState(state);
    const scIdeo = [0.85, 0.7, 0.6, 0.5, 0.42, 0.35, -0.6, -0.7, -0.65];
    const scAge = [77, 76, 71, 60, 62, 59, 72, 57, 55];
    const scotus = scIdeo.map((ideo, i) => ({ id: 'j' + i, name: 'Justice ' + R.pick(state, PG.data.names.last), ideo, age: scAge[i] + (state.date.year - 2027) }));
    const lean = U.clamp(st.lean / 40, -0.8, 0.8);
    const stateSup = [];
    for (let i = 0; i < 7; i++) stateSup.push({ id: 's' + i, name: 'Justice ' + R.pick(state, PG.data.names.last), ideo: U.round(U.clamp(lean + R.normal(state, 0, 0.35), -1, 1), 2), age: R.int(state, 48, 74) });
    state.courts = { scotus, stateSup, circuit: 0.12, stateLower: U.round(lean * 0.6, 2), cases: [], vacancies: [], log: [] };
  }

  function courtLean(state, level, stage) {
    const c = state.courts;
    if (level === 'federal' || level === 'fed') {
      if (stage === 'supreme') return median(c.scotus.map((j) => j.ideo));
      return c.circuit;
    }
    if (stage === 'supreme') return median(c.stateSup.map((j) => j.ideo));
    return c.stateLower;
  }
  function median(a) { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }

  function courtName(state, forum, stage) {
    const st = PG.juris.homeState(state);
    if (forum === 'fed') return stage === 'trial' ? 'U.S. District Court' : stage === 'appeal' ? 'U.S. Court of Appeals' : 'U.S. Supreme Court';
    return stage === 'trial' ? st.name + ' trial court' : stage === 'appeal' ? st.name + ' Court of Appeals' : st.name + ' Supreme Court';
  }

  // Probability the court strikes the policy: legal vulnerability, adjusted by how the
  // bench's ideology lines up against the policy's direction.
  function strikeProb(state, cs, stage) {
    const lean = courtLean(state, cs.forum === 'fed' ? 'federal' : 'state', stage);
    const dir = U.clamp((cs.ideo.econ + cs.ideo.social) / 2 / 45, -1, 1);
    const p = cs.vuln * (1 + 0.9 * (-lean * dir)) - (cs.defense || 0) - (cs.playerOwned ? PG.character.jobMods(state).courtDefense : 0);
    return U.clamp(p, 0.02, 0.95);
  }

  /* target: { type: 'law'|'eo', id, lawId?, name, ideo, vuln, grounds, tags, level } */
  function maybeChallenge(state, target) {
    if (!state.courts || !state.gov) return null;
    const lvl = target.level;
    const opponents = PG.data.groups.filter((g) => PG.groups.activeAt(g, lvl === 'school' ? 'school' : lvl) && (target.tags || []).reduce((s, t) => s + (g.tags[t] || 0), 0) <= -2);
    if (!opponents.length || target.vuln < 0.04) return null;
    const plaintiff = opponents.sort((a, b) => (b.litigator ? 3 : 0) + b.money - ((a.litigator ? 3 : 0) + a.money))[0];
    const p = U.clamp(target.vuln * 1.3 + (plaintiff.litigator ? 0.15 : 0.05), 0, 0.9);
    if (!R.chance(state, p)) return null;
    return file(state, target, plaintiff.name, plaintiff.id);
  }

  function file(state, target, plaintiffName, plaintiffId) {
    const g = state.gov;
    const fedGrounds = /Amendment|federal|Federal|Bruen|Supremacy|Takings|major-questions|APA|Administrative Procedure|Commerce|Appropriations|Take Care|Voting Rights/.test(target.grounds || '');
    const forum = target.level === 'federal' || fedGrounds ? 'fed' : 'state';
    const cs = {
      id: U.nextId(state, 'case'), title: plaintiffName + ' v. ' + (g.level === 'federal' ? 'United States' : g.level === 'state' ? PG.juris.homeState(state).name : PG.world ? state.world.home.city.name : 'City'),
      target: { type: target.type, id: target.id, lawId: target.lawId, name: target.name }, plaintiff: plaintiffId, plaintiffName, forum, stage: 'trial', monthsLeft: R.int(state, 3, 6),
      vuln: target.vuln, ideo: target.ideo, grounds: target.grounds || 'Statutory and constitutional claims', level: g.level, status: 'pending', injunction: false, defense: 0, history: [], playerOwned: true, filed: { ...state.date },
    };
    const pInj = strikeProb(state, cs, 'trial') * 0.55;
    if (R.chance(state, pInj)) { cs.injunction = true; setBlocked(state, cs, true); }
    cs.history.push({ date: { ...state.date }, text: 'Filed in ' + courtName(state, forum, 'trial') + '. Theory: ' + cs.grounds + (cs.injunction ? ' The judge issued a preliminary injunction blocking the policy.' : '') });
    state.courts.cases.push(cs);
    PG.game.log(state, 'courts', cs.title + ': lawsuit filed against "' + target.name + '"' + (cs.injunction ? ' — preliminary injunction granted.' : '.'), ['Legal vulnerability ' + Math.round(cs.vuln * 100) + '%; bench lean ' + U.round(courtLean(state, forum === 'fed' ? 'federal' : 'state', 'trial'), 2) + ' (−liberal/+conservative)']);
    PG.game.news(state, 'Lawsuit challenges ' + target.name, -1);
    return cs;
  }

  function setBlocked(state, cs, blocked) {
    const g = state.gov;
    if (!g) return;
    if (cs.target.type === 'eo') {
      const rec = g.eos.find((x) => x.id === cs.target.id);
      if (rec && rec.blocked !== blocked) {
        rec.blocked = blocked;
        // Lasting effects of the order are suspended while it is enjoined.
        const eo = PG.data.eoById[rec.eoId];
        for (const [k, v] of Object.entries((eo.effects && eo.effects.outcomes) || {})) g.outcomes[k] = U.clamp((g.outcomes[k] || 50) + (blocked ? -v : v), 0, 100);
      }
    } else {
      const en = g.enacted.find((x) => x.billId === cs.target.id);
      if (en && en.active === blocked) toggleLaw(state, en, !blocked);
    }
  }

  // Suspend or restore an enacted law's lasting effects.
  function toggleLaw(state, en, active) {
    const g = state.gov;
    const lw = PG.data.lawById[en.lawId];
    const mult = PG.data.scopes[en.scope - 1].mult * (active ? 1 : -1);
    en.active = active;
    for (const [k, v] of Object.entries(lw.outcomes || {})) g.lawOutcomes[k] = (g.lawOutcomes[k] || 0) + v * mult;
    if (g.budget) {
      const b = g.budget;
      if (lw.cost && !lw.reserveDeposit) { const cat = PG.budget.lawCategory(b.level, lw); b.spending[cat] = Math.max(0, b.spending[cat] + lw.cost * mult * b.total); }
      if (lw.revenue) {
        const levers = PG.data.budgets[b.level].revenue.filter((r) => r.lever);
        const tot = U.sum(levers, (r) => b.revenueBase[r.id]);
        levers.forEach((r) => { b.revenueBase[r.id] += lw.revenue * mult * b.total * b.revenueBase[r.id] / tot; });
      }
    }
  }

  function monthly(state) {
    if (!state.courts) init(state);
    const C = state.courts;
    for (const cs of C.cases) {
      if (cs.status !== 'pending') continue;
      if (!state.gov || state.gov.level !== cs.level) { cs.status = 'moot'; continue; }
      if (--cs.monthsLeft > 0) continue;
      rule(state, cs);
    }
    vacancies(state);
  }

  function rule(state, cs) {
    const p = strikeProb(state, cs, cs.stage);
    const struck = R.chance(state, p);
    const court = courtName(state, cs.forum, cs.stage);
    const lean = courtLean(state, cs.forum === 'fed' ? 'federal' : 'state', cs.stage);
    const why = ['Court: ' + court + ' (bench lean ' + U.round(lean, 2) + ')', 'Chance it would strike the policy: ' + Math.round(p * 100) + '% (vulnerability ' + Math.round(cs.vuln * 100) + '%, ideological alignment, your defense)'];
    cs.history.push({ date: { ...state.date }, text: court + (struck ? ' ruled AGAINST the policy.' : ' UPHELD the policy.'), causes: why });
    const loserAppeals = cs.stage !== 'supreme' && R.chance(state, cs.stage === 'trial' ? 0.75 : 0.5);
    if (loserAppeals) {
      cs.stage = STAGES[STAGES.indexOf(cs.stage) + 1];
      cs.monthsLeft = cs.stage === 'supreme' ? R.int(state, 6, 10) : R.int(state, 4, 8);
      if (struck !== cs.injunction) { cs.injunction = struck; setBlocked(state, cs, struck); }
      cs.history.push({ date: { ...state.date }, text: (struck ? 'The government' : 'The plaintiffs') + ' appealed to the ' + courtName(state, cs.forum, cs.stage) + '.' + (struck ? ' The policy stays blocked pending appeal.' : '') });
      PG.game.log(state, 'courts', cs.title + ': ' + court + (struck ? ' blocked' : ' upheld') + ' "' + cs.target.name + '"; the case goes up on appeal.', why);
      return;
    }
    cs.status = struck ? 'struck' : 'upheld';
    setBlocked(state, cs, struck);
    if (struck) {
      PG.effects.apply(state, { approval: { base: -1 }, groups: { [cs.plaintiff]: 3 } });
      if (cs.target.type === 'law') { const en = state.gov.enacted.find((x) => x.billId === cs.target.id); if (en) en.struck = true; }
    } else PG.effects.apply(state, { approval: { base: 0.5 } });
    PG.game.log(state, 'courts', 'FINAL: ' + court + ' ' + (struck ? 'struck down' : 'upheld') + ' "' + cs.target.name + '" in ' + cs.title + '.', why);
    PG.game.news(state, court + ' ' + (struck ? 'strikes down ' : 'upholds ') + cs.target.name, struck ? -1 : 1);
  }

  function defend(state, caseId) {
    const cs = state.courts.cases.find((x) => x.id === caseId);
    if (!cs || cs.status !== 'pending') return { ok: false, msg: 'No pending case.' };
    if (state.player.capital < 3) return { ok: false, msg: 'Hiring top appellate counsel costs 3 political capital.' };
    if ((cs.defense || 0) >= 0.15) return { ok: false, msg: 'Your legal team is already all-in.' };
    state.player.capital -= 3;
    cs.defense = (cs.defense || 0) + 0.06;
    return { ok: true, msg: 'Stronger legal defense (−6 points on the odds of losing).' };
  }

  function settle(state, caseId) {
    const cs = state.courts.cases.find((x) => x.id === caseId);
    if (!cs || cs.status !== 'pending') return { ok: false, msg: 'No pending case.' };
    cs.status = 'settled';
    // Settling narrows the policy (one scope level) or rescinds an order.
    if (cs.target.type === 'eo') { const rec = state.gov.eos.find((x) => x.id === cs.target.id); if (rec) rec.active = false; }
    else {
      const en = state.gov.enacted.find((x) => x.billId === cs.target.id);
      if (en) { if (en.active) toggleLaw(state, en, false); if (en.scope > 1) { en.scope--; toggleLaw(state, en, true); } }
    }
    if (cs.injunction) cs.injunction = false;
    PG.effects.apply(state, { approval: { base: -1.5 }, groups: { [cs.plaintiff]: 4 } });
    cs.history.push({ date: { ...state.date }, text: 'Settled: the policy was narrowed to resolve the suit.' });
    PG.game.log(state, 'courts', 'You settled ' + cs.title + ', narrowing "' + cs.target.name + '".');
    return { ok: true, msg: 'Settled.' };
  }

  // Local ordinances commonly preempted by the state.
  function preemption(state, bill, lw) {
    if (bill.level !== 'city' || lw.preempt !== 'state') return;
    const st = PG.juris.homeState(state);
    const gov = state.world.executives.governor;
    const leg = state.world.chambers.state_house || state.world.chambers.state_senate;
    const dir = Math.sign(lw.ideo.econ + lw.ideo.social);
    const stateDir = ((gov && gov.party === 'R') ? 1 : -1) + (leg && leg.majority === 'R' ? 1 : -1);
    if (dir * stateDir >= 0 && !(st.lean > 10 && dir < 0)) return;
    const target = { type: 'law', id: bill.id, lawId: lw.id, name: lw.name, ideo: PG.leg.L(bill), vuln: 0.7, grounds: 'State preemption: state law occupies this field', tags: lw.tags, level: 'city' };
    const cs = file(state, target, 'State of ' + st.name, null);
    cs.plaintiffName = 'State Attorney General';
    cs.title = 'State of ' + st.name + ' v. ' + state.world.home.city.name;
    cs.forum = 'state';
  }

  // ------------------------------------------------------------- vacancies
  function vacancies(state) {
    const C = state.courts, p = state.player;
    const isPres = p.office && p.office.officeId === 'president';
    const isGov = p.office && p.office.officeId === 'governor';
    // Aging and departures.
    if (state.date.month === 1) { C.scotus.forEach((j) => { j.age++; }); C.stateSup.forEach((j) => { j.age++; }); }
    const leave = (j) => R.chance(state, Math.max(0, j.age - 70) * 0.0018 + 0.0006);
    C.scotus.forEach((j, i) => {
      if (j.vacant || !leave(j)) return;
      j.vacant = true;
      const v = { id: U.nextId(state, 'vac'), court: 'scotus', seat: i, opened: { ...state.date }, playerAppoints: !!isPres, nominees: isPres ? judgeNominees(state, 'scotus') : [] };
      C.vacancies.push(v);
      PG.game.log(state, 'courts', j.name + ' is leaving the Supreme Court' + (isPres ? '. You will choose the nominee.' : '.'), ['Age ' + j.age + '; ideology ' + j.ideo]);
      PG.game.news(state, 'Supreme Court vacancy opens', 0);
    });
    if (R.chance(state, 0.008)) {
      const i = R.int(state, 0, C.stateSup.length - 1);
      if (!C.stateSup[i].vacant) {
        C.stateSup[i].vacant = true;
        C.vacancies.push({ id: U.nextId(state, 'vac'), court: 'state', seat: i, opened: { ...state.date }, playerAppoints: !!isGov, nominees: isGov ? judgeNominees(state, 'state') : [] });
        if (isGov) PG.game.log(state, 'courts', 'A seat opened on the ' + PG.juris.homeState(state).name + ' Supreme Court. You appoint the replacement.');
      }
    }
    // Lower federal courts drift toward the sitting President's views as judges are confirmed.
    const pres = state.world.executives.president;
    const sen = state.world.chambers.us_senate;
    const presIdeo = U.clamp(((pres.econ || 0) + (pres.social || 0)) / 2 / 50, -1, 1);
    C.circuit = U.round(C.circuit + (presIdeo - C.circuit) * (sen.majority === pres.party ? 0.004 : 0.001), 4);
    // AI executives fill their vacancies (unless the Senate is hostile and the clock favors waiting).
    for (const v of C.vacancies.slice()) {
      if (v.playerAppoints) continue;
      const months = U.monthsBetween(v.opened, state.date);
      if (v.court === 'scotus') {
        const hostile = sen.majority !== pres.party;
        if (months >= 3 && (!hostile || months >= 14 || R.chance(state, 0.05))) {
          const ideo = U.round(U.clamp((pres.party === 'R' ? 0.55 : -0.55) * (hostile ? 0.5 : 1) + R.normal(state, 0, 0.15), -1, 1), 2);
          fill(state, v, { name: 'Justice ' + R.pick(state, PG.data.names.last), ideo, age: R.int(state, 48, 58) }, 'President ' + pres.name);
        }
      } else if (months >= 2) {
        const gv = state.world.executives.governor;
        const ideo = U.round(U.clamp((gv && gv.party === 'R' ? 0.45 : -0.45) + R.normal(state, 0, 0.2), -1, 1), 2);
        fill(state, v, { name: 'Justice ' + R.pick(state, PG.data.names.last), ideo, age: R.int(state, 48, 60) }, 'Governor');
      }
    }
  }

  function judgeNominees(state, court) {
    const p = state.player;
    const dir = U.clamp((p.ideology.econ + p.ideology.social) / 2 / 50, -1, 1) || (p.party === 'R' ? 0.6 : -0.6);
    return [
      { id: U.nextId(state, 'jn'), name: 'Judge ' + R.pick(state, PG.data.names.first) + ' ' + R.pick(state, PG.data.names.last), label: 'Committed ideologue', ideo: U.round(U.clamp(dir * 1.2, -1, 1), 2), age: 47, quals: 70 },
      { id: U.nextId(state, 'jn'), name: 'Judge ' + R.pick(state, PG.data.names.first) + ' ' + R.pick(state, PG.data.names.last), label: 'Mainstream jurist', ideo: U.round(dir * 0.7, 2), age: 54, quals: 85 },
      { id: U.nextId(state, 'jn'), name: 'Judge ' + R.pick(state, PG.data.names.first) + ' ' + R.pick(state, PG.data.names.last), label: 'Consensus pick', ideo: U.round(dir * 0.25, 2), age: 60, quals: 90 },
    ].map((n) => Object.assign(n, { court }));
  }

  function fill(state, v, j, by) {
    const C = state.courts;
    const list = v.court === 'scotus' ? C.scotus : C.stateSup;
    list[v.seat] = { id: (v.court === 'scotus' ? 'j' : 's') + v.seat + '-' + state.date.year, name: j.name, ideo: j.ideo, age: j.age };
    C.vacancies = C.vacancies.filter((x) => x !== v);
    PG.game.log(state, 'courts', j.name + ' was confirmed to the ' + (v.court === 'scotus' ? 'U.S. Supreme Court' : PG.juris.homeState(state).name + ' Supreme Court') + ' (nominated by ' + by + ').', ['Ideology ' + j.ideo + ' (−liberal/+conservative); court median now ' + U.round(median(list.map((x) => x.ideo)), 2)]);
  }

  // The player's nominee faces a confirmation vote.
  function nominateJudge(state, vacId, nomineeId) {
    const C = state.courts;
    const v = C.vacancies.find((x) => x.id === vacId);
    if (!v || !v.playerAppoints) return { ok: false, msg: 'No vacancy for you to fill.' };
    const n = v.nominees.find((x) => x.id === nomineeId);
    if (!n) return { ok: false, msg: 'Unknown nominee.' };
    if (state.player.capital < 5) return { ok: false, msg: 'A judicial nomination fight costs 5 political capital.' };
    state.player.capital -= 5;
    const ch = state.world.chambers[v.court === 'scotus' ? 'us_senate' : 'state_senate'];
    let yea = 0, nay = 0;
    for (const m of ch.members) {
      const mDir = U.clamp((m.econ + m.social) / 2 / 50, -1, 1);
      let s = 0.8 - Math.abs(mDir - n.ideo) * 1.1 + (n.quals - 75) / 50;
      if (ch.partisan) s += (m.party === state.player.party ? 0.9 : -0.6) * m.loyalty;
      s += PG.rng.hashNormal(n.id + m.id) * 0.3;
      if (s > 0) yea++; else nay++;
    }
    const passed = yea > ch.members.length / 2;
    PG.game.log(state, 'courts', n.name + ' ' + (passed ? 'confirmed' : 'REJECTED') + ' by the ' + ch.name + ', ' + yea + '–' + nay + '.', ['Nominee ideology ' + n.ideo + ', qualifications ' + n.quals]);
    if (!passed) { v.nominees = v.nominees.filter((x) => x !== n); if (!v.nominees.length) v.nominees = judgeNominees(state, v.court); return { ok: true, msg: 'Rejected ' + yea + '–' + nay + '.' }; }
    fill(state, v, n, 'you');
    const base = Math.abs(n.ideo) > 0.8 ? 2 : 0.5;
    PG.effects.apply(state, { approval: { base, swing: Math.abs(n.ideo) > 0.8 ? -1 : 0.3 } });
    state.player.legacy.judges = (state.player.legacy.judges || 0) + 1;
    return { ok: true, msg: n.name + ' confirmed ' + yea + '–' + nay + '.' };
  }

  PG.courts = { init, maybeChallenge, file, monthly, rule, defend, settle, preemption, nominateJudge, courtLean, strikeProb, median, courtName, toggleLaw };
})(globalThis.PG = globalThis.PG || {});
