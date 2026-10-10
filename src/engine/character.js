/* Player character creation, derived modifiers, and office eligibility (age, residency,
 * term limits, career ladder). */
(function (PG) {
  'use strict';
  const U = PG.util;

  const STAT_KEYS = ['charisma', 'fundraising', 'policy', 'discipline', 'organizing'];

  function createPlayer(state, setup) {
    const bg = PG.data.backgroundById[setup.background] || PG.data.backgrounds[0];
    const traits = (setup.traits || []).filter((t) => PG.data.traitById[t]).slice(0, 3);
    const stats = {};
    STAT_KEYS.forEach((k) => { stats[k] = 50; });
    for (const [k, v] of Object.entries(bg.stats || {})) stats[k] += v;
    const mods = { blocs: {} };
    for (const tid of traits) {
      const t = PG.data.traitById[tid];
      for (const [k, v] of Object.entries(t.stats || {})) stats[k] += v;
      for (const [k, v] of Object.entries(t.mods || {})) {
        if (k === 'blocs') for (const [b, x] of Object.entries(v)) mods.blocs[b] = (mods.blocs[b] || 0) + x;
        else if (typeof v === 'number' && mods[k] !== undefined && k.endsWith('Rate')) mods[k] *= v;
        else mods[k] = (mods[k] || 0) + v;
      }
    }
    for (const [b, x] of Object.entries(bg.blocs || {})) mods.blocs[b] = (mods.blocs[b] || 0) + x;
    STAT_KEYS.forEach((k) => { stats[k] = U.clamp(Math.round(stats[k]), 10, 95); });
    const diff = PG.data.difficulty[state.difficulty];
    const startAge = U.clamp(Number(setup.age) || 32, 18, 75);
    const party = PG.data.parties[setup.party] ? setup.party : 'I';
    const norm = PG.voters.partyNorm(party);
    const ideology = setup.ideology
      ? { econ: U.clamp(Number(setup.ideology.econ), -100, 100), social: U.clamp(Number(setup.ideology.social), -100, 100) }
      : { econ: norm.econ, social: norm.social };
    let cash = bg.cash * diff.startCash;
    if (mods.selfFund) cash += 150000;
    state.player = {
      name: String(setup.name || 'Alex Morgan').slice(0, 40), party, background: bg.id, traits, homeState: setup.homeState,
      birthYear: state.date.year - startAge, birthMonth: 1, ideology, stats, mods, cash: Math.round(cash),
      nameRec: U.clamp(4 + (mods.localNameRec || 0), 0, 100), fav: 55, media: (bg.media || 0) + (mods.media || 0),
      partyRel: 50 + (mods.partyRel || 0), office: null, history: [], commitments: [], scandals: [], skeletons: [],
      flags: {}, capital: 0, positions: {}, fatigue: 0, legacy: { laws: [], vetoes: 0, eos: 0, elections: [] },
      naturalBorn: setup.naturalBorn !== false, retired: false,
    };
    seedSkeletons(state, bg, mods);
  }

  // Hidden vulnerabilities an opposition researcher could find later.
  function seedSkeletons(state, bg, mods) {
    const R = PG.rng;
    const pool = {
      client: ['Represented a predatory lender in a high-profile case', 'Firm billed a city agency while you consulted for it'],
      service: ['A disputed incident report from your service years', 'Exaggerated details of a commendation in a past interview'],
      business: ['Company paid a settlement over unpaid overtime', 'Tax lien on a former business'],
      social: ['Inflammatory social-media posts from a decade ago', 'Arrest at a protest in your twenties'],
    };
    const n = 1 + (mods.skeletons || 0) + (R.chance(state, 0.35) ? 1 : 0);
    const list = (pool[bg.skeleton] || pool.social).concat(['Late property-tax payments', 'Voted in the wrong precinct after a move']);
    for (let i = 0; i < n; i++) {
      state.player.skeletons.push({ id: 'sk' + i, text: R.pick(state, list), severity: U.round(R.range(state, 2, 7) + (mods.skeletons ? 1 : 0), 1), revealed: false });
    }
  }

  function office(id) { return PG.data.officeById[id]; }
  function ageAt(state, date) { return date.year - state.player.birthYear - (date.month < state.player.birthMonth ? 1 : 0); }

  function termsServed(state, officeId) { return state.player.history.filter((h) => h.officeId === officeId); }
  function yearsServed(state, officeId) {
    return U.sum(termsServed(state, officeId), (h) => U.monthsBetween(h.start, h.end || state.date) / 12);
  }
  // Years served in an office counting the current term through its scheduled end.
  function yearsCommitted(state, officeId) {
    const cur = state.player.office;
    return U.sum(termsServed(state, officeId), (h) => U.monthsBetween(h.start, h.end || (cur && cur.officeId === officeId ? cur.termEnd : state.date)) / 12);
  }
  // Number of most-recent back-to-back terms in this office.
  function consecutiveTerms(state, officeId) {
    const t = termsServed(state, officeId);
    if (!t.length) return 0;
    let n = 1;
    for (let i = t.length - 1; i > 0; i--) {
      if (t[i - 1].end && Math.abs(U.monthsBetween(t[i - 1].end, t[i].start)) <= 1) n++; else break;
    }
    return n;
  }

  function termLimitBlock(state, officeId) {
    const o = office(officeId);
    const st = PG.data.stateById[state.player.homeState];
    const terms = termsServed(state, officeId).length;
    const holding = state.player.office && state.player.office.officeId === officeId;
    if (!o.termLimit) return null;
    switch (o.termLimit.type) {
      case 'pres':
        if (terms >= 2) return '22nd Amendment: no one may be elected President more than twice.';
        return null;
      case 'consec2':
        if (holding && consecutiveTerms(state, officeId) >= 2) return 'Term-limited: two consecutive terms (you may run again after sitting out a term).';
        return null;
      case 'legLimit':
        if (st.legLimit && yearsCommitted(state, officeId) + PG.calendar.termLength(officeId, st) > st.legLimit + 0.01) return st.name + ' limits legislators to ' + st.legLimit + ' years in this chamber.';
        return null;
      case 'gov':
        if (st.govLimit === 'life2' && terms >= 2) return st.name + ' limits governors to two terms, lifetime.';
        if (st.govLimit === 'consec2' && holding && consecutiveTerms(state, officeId) >= 2) return st.name + ' limits governors to two consecutive terms.';
        if (st.govLimit === 'noconsec' && holding) return 'Virginia bars governors from serving consecutive terms.';
        return null;
      default: return null;
    }
  }

  /* Can the player run for this office now? Returns { ok, reasons[], info, warnings[] }. */
  function eligibility(state, officeId, fixedInfo) {
    const o = office(officeId);
    const st = PG.data.stateById[state.player.homeState];
    const reasons = [], warnings = [];
    const p = state.player;
    if (st.isDC && ['state_house', 'state_senate', 'governor', 'us_house', 'us_senate'].includes(officeId)) {
      reasons.push('The District of Columbia has no state legislature, governor, or senators, and its House delegate cannot vote on the floor.');
    }
    if (st.unicameral && officeId === 'state_house') reasons.push('Nebraska has a one-house (unicameral) legislature — run for the Legislature (state senate) instead.');
    if (!p.history.length && o.rank > 1) reasons.push('Every career starts in local office: run for school board or city council first.');
    if (o.naturalBorn && !p.naturalBorn) reasons.push('Only natural-born citizens may serve as President.');
    const info = fixedInfo || PG.calendar.nextElection(state, officeId);
    if (!info) reasons.push('No upcoming election you can still file for.');
    if (info) {
      const age = ageAt(state, info.termStart);
      if (age < o.minAge) reasons.push('Minimum age ' + o.minAge + ' (you would be ' + age + ' when the term begins).');
      if (o.residentYears && ageAt(state, info.general) < o.residentYears + 18) reasons.push('Must have ' + o.residentYears + ' years of U.S. residency.');
      const block = termLimitBlock(state, officeId);
      if (block) reasons.push(block);
      if (p.office && p.office.officeId === officeId) {
        if (U.dateCmp(info.termStart, p.office.termEnd) !== 0 && U.dateCmp(info.termStart, p.office.termEnd) < 0) {
          reasons.push('Your seat is not up until ' + U.fmtDate(U.addMonths(p.office.termEnd, -2)) + '.');
        }
      }
      if (p.office && p.office.officeId !== officeId) {
        if (U.dateCmp(p.office.termEnd, info.termStart) > 0) warnings.push('Your current term continues past this election — if you lose, you keep your seat.');
        else warnings.push('Your current term ends when this one would begin — losing ends your time in office.');
      }
      if (o.rank - currentRank(state) >= 3) warnings.push('A big leap: donors and voters will question your experience.');
    }
    if (state.campaign) reasons.push('You are already running for office.');
    return { ok: reasons.length === 0, reasons, warnings, info };
  }

  function currentRank(state) {
    let r = 0;
    for (const h of state.player.history) r = Math.max(r, office(h.officeId).rank);
    return r;
  }

  // Effective stat including fatigue and scandals for the current month.
  function stat(state, key) {
    const p = state.player;
    let v = p.stats[key];
    if (key === 'charisma' || key === 'discipline') v -= p.fatigue * 0.25;
    return U.clamp(v, 5, 99);
  }

  function partyName(party) { return (PG.data.parties[party] || PG.data.parties.I).name; }

  /* How the player's personality (traits, background, skills) changes the job of
   * governing. Returns numeric modifiers plus plain-English lines for the UI. */
  const JOB_KEYS = ['persuade', 'townhall', 'address', 'policyEff', 'markup', 'courtDefense', 'fundraise', 'actions', 'capital', 'scandal',
    'base', 'colleagues', 'deal', 'dealCost', 'defection', 'schedule', 'media', 'constituent'];
  function jobMods(state) {
    const p = state.player;
    const m = { outcome: {}, cats: [], lines: [] };
    JOB_KEYS.forEach((k) => { m[k] = 0; });
    const addJob = (job, source) => {
      if (!job) return;
      for (const k of JOB_KEYS) if (typeof job[k] === 'number') m[k] += job[k];
      if (job.outcome) m.outcome[job.outcome] = (m.outcome[job.outcome] || 0) + 3;
      if (job.cat) m.cats.push(job.cat);
      if (job.desc) m.lines.push({ source, text: job.desc });
    };
    for (const t of p.traits) addJob(PG.data.traitById[t].job, PG.data.traitById[t].name);
    const bg = PG.data.backgroundById[p.background];
    addJob(bg.job, bg.name);
    // Skills matter too.
    const st = (k) => stat(state, k);
    const sk = {
      persuade: (st('charisma') - 50) / 200, policyEff: (st('policy') - 50) / 300, capital: (st('organizing') - 50) / 60,
      scandal: -(st('discipline') - 50) / 250, fundraise: (st('fundraising') - 50) / 150, townhall: (st('charisma') - 50) / 300,
    };
    for (const [k, v] of Object.entries(sk)) m[k] += v;
    const notes = [];
    if (Math.abs(sk.persuade) >= 0.05) notes.push('charisma ' + (sk.persuade > 0 ? 'boosts' : 'weakens') + ' your persuasion');
    if (Math.abs(sk.policyEff) >= 0.04) notes.push('policy skill ' + (sk.policyEff > 0 ? 'strengthens' : 'weakens') + ' the laws you write');
    if (Math.abs(sk.capital) >= 0.2) notes.push('organizing ' + (sk.capital > 0 ? 'speeds' : 'slows') + ' political capital');
    if (Math.abs(sk.scandal) >= 0.05) notes.push('discipline makes scandals ' + (sk.scandal < 0 ? 'softer' : 'harsher'));
    if (notes.length) m.lines.push({ source: 'Your skills', text: U.cap(notes.join('; ')) + '.' });
    m.scandalMult = U.clamp(1 + m.scandal, 0.4, 2);
    return m;
  }

  PG.character = { jobMods, JOB_KEYS, STAT_KEYS, createPlayer, eligibility, termLimitBlock, termsServed, yearsServed, yearsCommitted, consecutiveTerms, ageAt, stat, partyName, currentRank };
})(globalThis.PG = globalThis.PG || {});
