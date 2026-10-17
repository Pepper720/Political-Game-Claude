/* Offices on the career ladder. Requirements and terms follow real rules; where rules
 * vary by city/state the most common value is used and noted in `note`. */
(function (PG) {
  'use strict';
  PG.data = PG.data || {};
  PG.data.offices = [
    { id: 'school_board', name: 'School Board Member', short: 'School Board', level: 'local', kind: 'legislator',
      body: 'school', term: 4, minAge: 18, partisan: false, seats: 3, electionYears: 'odd', campaignMonths: 6,
      typicalBudget: 45000, rank: 1, termLimit: null, nationalization: 0.25,
      note: 'At-large, multi-seat, nonpartisan (most common U.S. format). Three seats elected together; top three vote-getters win.' },
    { id: 'city_council', name: 'City Council Member', short: 'City Council', level: 'local', kind: 'legislator',
      body: 'council', term: 4, minAge: 18, partisan: false, seats: 1, electionYears: 'odd', campaignMonths: 6,
      typicalBudget: 120000, rank: 1, termLimit: null, nationalization: 0.3,
      note: 'Nonpartisan ward seat elected in odd-year November (common in large cities). Plurality wins.' },
    { id: 'mayor', name: 'Mayor', short: 'Mayor', level: 'local', kind: 'executive', body: 'council',
      term: 4, minAge: 18, partisan: false, seats: 1, runoff: 0.5, electionYears: 'odd', campaignMonths: 9,
      typicalBudget: 900000, rank: 2, termLimit: { type: 'consec2' }, nationalization: 0.35,
      note: 'Strong-mayor system, nonpartisan with a December top-two runoff if no one wins a majority. Two consecutive terms (common big-city limit).' },
    { id: 'state_house', name: 'State Representative', short: 'State House', level: 'state', kind: 'legislator',
      body: 'state_house', term: 'houseTerm', minAge: 21, partisan: true, seats: 1, electionYears: 'state', campaignMonths: 8,
      typicalBudget: 180000, rank: 2, termLimit: { type: 'legLimit' }, nationalization: 0.7,
      note: 'Term length and term limits follow the state (16 states have legislative term limits). Minimum age 21 is the most common rule (range 18–25).' },
    { id: 'state_senate', name: 'State Senator', short: 'State Senate', level: 'state', kind: 'legislator',
      body: 'state_senate', term: 'senateTerm', minAge: 25, partisan: true, seats: 1, electionYears: 'state', campaignMonths: 9,
      typicalBudget: 450000, rank: 3, termLimit: { type: 'legLimit' }, nationalization: 0.7,
      note: 'Minimum age 25 is the most common rule (range 18–30). Nebraska\'s unicameral legislature is officially nonpartisan.' },
    { id: 'governor', name: 'Governor', short: 'Governor', level: 'state', kind: 'executive', body: 'state',
      term: 'govTerm', minAge: 30, partisan: true, seats: 1, electionYears: 'gov', campaignMonths: 14,
      typicalBudget: 14000000, scaleByPop: true, rank: 4, termLimit: { type: 'gov' }, nationalization: 0.6,
      note: 'Election year, term length (2 years in NH and VT) and term limits follow each state. Minimum age 30 is the most common rule.' },
    { id: 'us_house', name: 'U.S. Representative', short: 'U.S. House', level: 'federal', kind: 'legislator',
      body: 'us_house', term: 2, minAge: 25, citizenYears: 7, partisan: true, seats: 1, electionYears: 'even', campaignMonths: 12,
      typicalBudget: 2500000, rank: 4, termLimit: null, nationalization: 1.0,
      note: 'Art. I §2: age 25, citizen 7 years, inhabitant of the state (not required to live in the district).' },
    { id: 'us_senate', name: 'U.S. Senator', short: 'U.S. Senate', level: 'federal', kind: 'legislator',
      body: 'us_senate', term: 6, minAge: 30, citizenYears: 9, partisan: true, seats: 1, electionYears: 'senate', campaignMonths: 15,
      typicalBudget: 16000000, scaleByPop: true, rank: 5, termLimit: null, nationalization: 1.0,
      note: 'Art. I §3: age 30, citizen 9 years, inhabitant of the state. Seats follow the three Senate classes.' },
    { id: 'president', name: 'President of the United States', short: 'President', level: 'federal', kind: 'executive',
      body: 'federal', term: 4, minAge: 35, naturalBorn: true, residentYears: 14, partisan: true, seats: 1,
      electionYears: 'pres', campaignMonths: 22, typicalBudget: 1200000000, rank: 6, termLimit: { type: 'pres' }, nationalization: 1.0,
      note: 'Art. II: natural-born citizen, age 35, 14 years resident. 22nd Amendment: elected at most twice (or once if you served more than two years of someone else\'s term).' },
  ];
  PG.data.officeById = Object.fromEntries(PG.data.offices.map((o) => [o.id, o]));
})(globalThis.PG = globalThis.PG || {});
