/* Election calendars: when each office is on the ballot, primaries, filing deadlines. */
(function (PG) {
  'use strict';
  const U = PG.util;
  const ODD_YEAR_LEGISLATURES = ['VA', 'NJ', 'LA', 'MS'];
  const SENATE_CLASS_MOD = { 1: 2024 % 6, 2: 2026 % 6, 3: 2028 % 6 };

  function office(id) { return PG.data.officeById[id]; }

  function termLength(officeId, st) {
    const o = office(officeId);
    if (typeof o.term === 'number') return o.term;
    return st[o.term];
  }

  /* Is office `officeId` (for the player's specific seat) on the ballot in `year`? */
  function onBallot(state, officeId, year) {
    const o = office(officeId);
    const st = PG.data.stateById[state.player.homeState];
    const seats = state.world.seats;
    const term = termLength(officeId, st);
    switch (o.electionYears) {
      case 'odd': return year % 2 === 1 && (year - seats[officeId]) % term === 0;
      case 'state': {
        const odd = ODD_YEAR_LEGISLATURES.includes(st.id);
        if (odd !== (year % 2 === 1)) return false;
        return (year - seats[officeId]) % term === 0;
      }
      case 'gov': return st.govParity === -1 ? year % 2 === 0 : year % 4 === st.govParity;
      case 'even': return year % 2 === 0;
      case 'senate': return senateClassUp(st, year) !== null;
      case 'pres': return year % 4 === 0;
      default: return false;
    }
  }

  function senateClassUp(st, year) {
    for (const c of st.senateClasses.split('')) if (year % 6 === SENATE_CLASS_MOD[c]) return Number(c);
    return null;
  }

  /* Next election for an office the player could still file for. */
  function nextElection(state, officeId, opts) {
    const o = office(officeId);
    const st = PG.data.stateById[state.player.homeState];
    const now = state.date;
    for (let y = now.year; y < now.year + 12; y++) {
      if (!onBallot(state, officeId, y)) continue;
      const info = electionInfo(state, officeId, y, st, o);
      if (U.dateCmp(info.filingDeadline, now) < 0 && !(opts && opts.ignoreDeadline)) continue;
      return info;
    }
    return null;
  }

  function electionInfo(state, officeId, year, st, o) {
    st = st || PG.data.stateById[state.player.homeState];
    o = o || office(officeId);
    const general = { year, month: 11 };
    let primary = null, runoff = null, generalRunoff = null;
    if (o.id === 'president') {
      primary = { year, month: 1 }; // calendar handled by the presidential module
    } else if (o.partisan && !(st.unicameral && officeId === 'state_senate')) {
      if (st.primary === 'jungle') {
        primary = null; generalRunoff = { year, month: 12 };
      } else {
        let pm = st.primaryMonth;
        if (year % 2 === 1) pm = st.id === 'LA' ? 10 : st.id === 'MS' ? 8 : 6;
        primary = { year, month: Math.min(pm, 9) };
        if (st.runoff) runoff = { year, month: Math.min(primary.month + 2, 10) };
      }
      if (st.generalRunoff && (o.level === 'federal' || o.id === 'governor')) generalRunoff = { year, month: 12 };
    } else if (o.runoff) {
      generalRunoff = { year, month: 12 };
    }
    const anchor = primary || general;
    const filingDeadline = o.id === 'president' ? { year: year - 1, month: 11 } : U.addMonths(anchor, primary ? -3 : -3);
    // Campaigns launch before the filing deadline (and at least 4 months before a primary).
    let campaignStart = U.addMonths(general, -o.campaignMonths);
    const latest = U.addMonths(filingDeadline, -1);
    if (U.dateCmp(latest, campaignStart) < 0) campaignStart = latest;
    const classUp = o.electionYears === 'senate' ? senateClassUp(st, year) : null;
    return { officeId, year, general, primary, runoff, generalRunoff, filingDeadline, campaignStart, senateClass: classUp,
      termStart: { year: year + 1, month: 1 }, termYears: termLength(officeId, st) };
  }

  /* Kind of election (for turnout): presidential year, midterm, or odd-year. */
  function electionKind(year) {
    if (year % 4 === 0) return 'pres';
    if (year % 2 === 0) return 'mid';
    return 'off';
  }

  // Fiscal-year start month for budgets.
  function fyStart(level, st) {
    if (level === 'federal') return 10;
    if (level === 'state') {
      if (st.id === 'NY') return 4;
      if (st.id === 'TX') return 9;
      if (st.id === 'AL' || st.id === 'MI' || st.id === 'DC') return 10;
      return 7;
    }
    return 7;
  }

  // Legislative session months (state legislatures meet part-time; Congress and councils year-round).
  function inSession(level, st, month, year) {
    if (level !== 'state') return month !== 8; // August recess
    const short = ['TX', 'MT', 'NV', 'ND'].includes(st.id); // biennial sessions in odd years
    if (short && year % 2 === 0) return false;
    return month >= 1 && month <= (['CA', 'NY', 'PA', 'MI', 'MA', 'OH', 'IL', 'WI', 'NJ'].includes(st.id) ? 10 : 5);
  }

  PG.calendar = { ODD_YEAR_LEGISLATURES, termLength, onBallot, senateClassUp, nextElection, electionInfo, electionKind, fyStart, inSession };
})(globalThis.PG = globalThis.PG || {});
