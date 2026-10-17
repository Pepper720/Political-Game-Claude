/* Voter blocs, issues, backgrounds, traits, difficulty levels, and fictional name pools. */
(function (PG) {
  'use strict';
  PG.data = PG.data || {};

  /* Voter blocs partition the electorate (a deliberate simplification — real voters
   * belong to many overlapping groups). lean: generic two-party margin inside the bloc
   * before jurisdiction calibration (+ = R). econ/social: -100 (left) .. +100 (right).
   * turnout: propensity in a presidential general. salience: which issues move them. */
  PG.data.blocs = [
    { id: 'black', name: 'Black voters', lean: -76, econ: -35, social: 5, turnout: .58,
      salience: { economy: 1.2, healthcare: 1.1, civil_rights: 1.5, crime: 1.0, jobs: 1.1 } },
    { id: 'latino', name: 'Latino voters', lean: -16, econ: -20, social: 10, turnout: .47,
      salience: { economy: 1.4, immigration: 1.1, healthcare: 1.0, jobs: 1.2, housing: 1.0 } },
    { id: 'aapi', name: 'AAPI & other voters', lean: -26, econ: -15, social: -15, turnout: .52,
      salience: { education: 1.3, economy: 1.2, healthcare: 1.0, civil_rights: 1.0 } },
    { id: 'young', name: 'Young voters', lean: -20, econ: -30, social: -50, turnout: .42,
      salience: { housing: 1.5, environment: 1.4, abortion: 1.2, education: 1.0, jobs: 1.2 } },
    { id: 'seniors', name: 'Seniors', lean: 14, econ: 10, social: 25, turnout: .78,
      salience: { retirement: 1.8, healthcare: 1.5, taxes: 1.1, crime: 1.2 } },
    { id: 'urban_prog', name: 'Urban progressives', lean: -50, econ: -55, social: -60, turnout: .68,
      salience: { environment: 1.4, civil_rights: 1.3, housing: 1.3, abortion: 1.3, healthcare: 1.1 } },
    { id: 'sub_college', name: 'College suburbanites', lean: -10, econ: 5, social: -30, turnout: .74,
      salience: { education: 1.4, economy: 1.2, abortion: 1.2, ethics: 1.2, taxes: 1.0 } },
    { id: 'sub_family', name: 'Suburban families', lean: 18, econ: 25, social: 20, turnout: .66,
      salience: { taxes: 1.3, education: 1.3, crime: 1.3, economy: 1.3 } },
    { id: 'working', name: 'Working-class voters', lean: 10, econ: -5, social: 20, turnout: .53,
      salience: { jobs: 1.6, economy: 1.5, immigration: 1.1, healthcare: 1.1 } },
    { id: 'rural', name: 'Rural voters', lean: 40, econ: 35, social: 35, turnout: .63,
      salience: { economy: 1.2, guns: 1.4, taxes: 1.1, immigration: 1.1, infrastructure: 1.1 } },
    { id: 'rural_rel', name: 'Religious conservatives', lean: 62, econ: 40, social: 65, turnout: .72,
      salience: { abortion: 1.5, guns: 1.3, civil_rights: 0.8, immigration: 1.2, education: 1.1 } },
  ];
  PG.data.blocById = Object.fromEntries(PG.data.blocs.map((b) => [b.id, b]));

  /* Issues. axis says which ideological axis a stance mostly expresses; stance labels run
   * from -2 (most left) to +2 (most right). Positions are presented neutrally. */
  PG.data.issues = [
    { id: 'economy', name: 'Economy', axis: 'econ', stances: ['Public investment drives growth', 'Targeted stimulus', 'Balanced approach', 'Cut red tape', 'Free markets, low taxes'] },
    { id: 'taxes', name: 'Taxes', axis: 'econ', stances: ['Raise taxes on the wealthy', 'Close loopholes', 'Hold rates steady', 'Broad tax cuts', 'Deep tax cuts'] },
    { id: 'jobs', name: 'Jobs & Wages', axis: 'econ', stances: ['Big minimum-wage hike', 'Strengthen unions', 'Job training', 'Business incentives', 'Right-to-work'] },
    { id: 'healthcare', name: 'Health Care', axis: 'econ', stances: ['Single-payer', 'Public option', 'Fix the ACA', 'Market competition', 'Repeal mandates'] },
    { id: 'education', name: 'Education', axis: 'social', stances: ['Fund public schools first', 'Raise teacher pay', 'Accountability & tutoring', 'Charter expansion', 'Universal school choice'] },
    { id: 'crime', name: 'Crime & Policing', axis: 'social', stances: ['Reallocate to services', 'Reform & accountability', 'Community policing', 'Hire more officers', 'Tough sentencing'] },
    { id: 'immigration', name: 'Immigration', axis: 'social', stances: ['Path to citizenship', 'Protect Dreamers', 'Border tech + legal paths', 'Stricter enforcement', 'Mass deportation'] },
    { id: 'environment', name: 'Energy & Environment', axis: 'econ', stances: ['Rapid fossil phase-out', 'Clean-energy investment', 'All of the above', 'Energy production first', 'Roll back regulations'] },
    { id: 'guns', name: 'Guns', axis: 'social', stances: ['Assault-weapons ban', 'Universal background checks', 'Red-flag laws only', 'Enforce existing laws', 'Permitless carry'] },
    { id: 'abortion', name: 'Abortion', axis: 'social', stances: ['Codify broad access', 'Protect access with limits', 'Leave it to states / no change', '15-week limit', 'Near-total ban'] },
    { id: 'housing', name: 'Housing', axis: 'econ', stances: ['Rent control + public housing', 'Subsidies & renter aid', 'Build more of everything', 'Cut permitting costs', 'Protect local zoning'] },
    { id: 'infrastructure', name: 'Infrastructure', axis: 'econ', stances: ['Massive public works', 'Transit-first', 'Fix it first', 'Public-private partnerships', 'Cut waste before spending'] },
    { id: 'retirement', name: 'Social Security & Medicare', axis: 'econ', stances: ['Expand benefits', 'Raise the payroll cap', 'Protect benefits as-is', 'Gradual reforms', 'Private accounts'] },
    { id: 'civil_rights', name: 'Civil Rights & Liberties', axis: 'social', stances: ['Sweeping anti-discrimination law', 'Expand voting access', 'Defend existing protections', 'Election security first', 'Religious-liberty exemptions'] },
    { id: 'ethics', name: 'Government Ethics', axis: 'social', stances: ['Public financing of campaigns', 'Ban stock trading by officials', 'Transparency rules', 'Term limits', 'Shrink government'] },
  ];
  PG.data.issueById = Object.fromEntries(PG.data.issues.map((i) => [i.id, i]));

  /* Backgrounds. stats are added to a base of 50. groups: starting relationships.
   * skeleton: the kind of past an opposition researcher might find. */
  PG.data.backgrounds = [
    { id: 'lawyer', name: 'Attorney', desc: 'Courtroom polish and policy fluency. Client list may raise questions.',
      stats: { policy: 12, fundraising: 8, charisma: 3 }, cash: 25000, groups: { civil_lib: 5, chamber: 5 }, skeleton: 'client' , job: { courtDefense: 0.05, desc: 'Courtroom experience: your laws and orders hold up better in court.' } },
    { id: 'veteran', name: 'Military veteran', desc: 'Service record earns trust across lines; less polished on policy detail.',
      stats: { charisma: 6, discipline: 10, policy: -3 }, cash: 8000, groups: { veterans: 25, police_union: 5 }, blocs: { working: 2, rural: 2, seniors: 2 }, skeleton: 'service' , job: { outcome: 'security', cat: 'defense', desc: 'Credibility on security: defense and veterans bills draw extra support.' } },
    { id: 'business', name: 'Small-business owner', desc: 'Knows payrolls and donors. Labor groups are wary.',
      stats: { fundraising: 12, organizing: 4 }, cash: 40000, groups: { small_biz: 20, chamber: 10, labor: -10 }, blocs: { sub_family: 2 }, skeleton: 'business' , job: { outcome: 'efficiency', cat: 'commerce', desc: 'You run a tighter operation: government efficiency improves; commerce bills draw support.' } },
    { id: 'teacher', name: 'Public-school teacher', desc: 'Beloved by parents and the union; few wealthy friends.',
      stats: { charisma: 6, policy: 5, fundraising: -8 }, cash: 4000, groups: { teachers: 30, parents_choice: -10 }, blocs: { sub_family: 2, sub_college: 2 }, skeleton: 'social' , job: { outcome: 'education', cat: 'education', desc: 'You know classrooms: schools improve faster under you; education bills draw support.' } },
    { id: 'activist', name: 'Community activist', desc: 'Deep organizing roots and passionate supporters; a long trail of hot takes.',
      stats: { organizing: 14, charisma: 4, discipline: -8 }, cash: 3000, groups: {}, skeleton: 'social', activist: true , job: { capital: 0.5, desc: 'You know how to mobilize: political capital regenerates faster.' } },
    { id: 'doctor', name: 'Physician', desc: 'Credible on health care, comfortable income, little political experience.',
      stats: { policy: 8, fundraising: 6, organizing: -4 }, cash: 30000, groups: { health_industry: 15, seniors_league: 5 }, blocs: { seniors: 2 }, skeleton: 'business' , job: { outcome: 'health', cat: 'health', desc: 'Medical credibility: health outcomes improve faster; health bills draw support.' } },
    { id: 'farmer', name: 'Farmer / rancher', desc: 'Rooted in rural communities; struggles with urban audiences.',
      stats: { charisma: 4, discipline: 4, fundraising: -2 }, cash: 15000, groups: { farm: 30 }, blocs: { rural: 3, rural_rel: 1, urban_prog: -2 }, skeleton: 'business' , job: { outcome: 'environment', cat: 'agriculture', desc: 'Land stewardship: environmental outcomes and farm bills benefit.' } },
    { id: 'police', name: 'Former police officer', desc: 'Credible on public safety; complaint files can resurface.',
      stats: { discipline: 6, charisma: 2 }, cash: 6000, groups: { police_union: 30, civil_lib: -10 }, blocs: { seniors: 2, sub_family: 2, urban_prog: -2 }, skeleton: 'service' , job: { outcome: 'crime', cat: 'justice', desc: 'Public-safety credibility: crime falls faster; justice bills draw support.' } },
    { id: 'union', name: 'Union organizer', desc: 'Labor\'s ground game is yours; business donors keep their distance.',
      stats: { organizing: 12, charisma: 2, fundraising: -4 }, cash: 3000, groups: { labor: 30, public_emp: 15, chamber: -15 }, blocs: { working: 3 }, skeleton: 'social' , job: { cat: 'labor', persuade: 0.05, desc: 'Labor ties: labor bills draw support, and you know how to count votes.' } },
    { id: 'clergy', name: 'Faith leader', desc: 'A ready-made congregation network and moral authority; scrutiny of your sermons.',
      stats: { charisma: 10, organizing: 6, policy: -4 }, cash: 4000, groups: { faith: 30 }, blocs: { rural_rel: 2, black: 1 }, skeleton: 'social' , job: { townhall: 0.1, cat: 'civil', desc: 'A natural pastor: town halls go well; civil-rights bills draw support.' } },
    { id: 'journalist', name: 'Former journalist', desc: 'Media-savvy with sources everywhere; your old columns are searchable.',
      stats: { charisma: 6, policy: 6, fundraising: -4 }, cash: 6000, groups: {}, media: 15, skeleton: 'social' , job: { media: 0.2, desc: 'You know how newsrooms work: media appearances go better.' } },
    { id: 'tech', name: 'Tech founder', desc: 'Wealthy and connected; seen as an outsider who may not get it.',
      stats: { fundraising: 14, policy: 2, charisma: -3 }, cash: 120000, groups: { tech: 30 }, skeleton: 'business' , job: { outcome: 'efficiency', cat: 'tech', desc: 'You modernize: efficiency improves; tech bills draw support.' } },
    { id: 'nonprofit', name: 'Nonprofit director', desc: 'Coalition builder who knows grant-makers; can seem bureaucratic.',
      stats: { organizing: 8, policy: 6, charisma: -2 }, cash: 8000, groups: { housing_adv: 15 }, skeleton: 'client' , job: { outcome: 'housing', cat: 'housing', desc: 'You know the service providers: housing outcomes improve faster.' } },
  ];
  PG.data.backgroundById = Object.fromEntries(PG.data.backgrounds.map((b) => [b.id, b]));

  /* Traits — each has an upside and a cost. */
  PG.data.traits = [
    { id: 'charismatic', name: 'Charismatic', desc: '+12 charisma; voters expect a show, so debate letdowns sting more.', stats: { charisma: 12 }, mods: { debateVolatility: 1.3 }, job: { persuade: 0.25, townhall: 0.15, address: 0.5, desc: 'Colleagues and crowds respond to you: whipping and public pushes work 25% better; town halls go better.' } },
    { id: 'wonk', name: 'Policy wonk', desc: '+12 policy; −5 charisma (you over-explain).', stats: { policy: 12, charisma: -5 }, job: { policyEff: 0.15, markup: 0.5, courtDefense: 0.03, persuade: -0.05, desc: 'Your bills are better drafted: laws deliver 15% more, chairs schedule hearings more readily, and courts find them sturdier. You lecture, which persuades a bit less.' } },
    { id: 'rainmaker', name: 'Rainmaker', desc: '+14 fundraising; donors expect access, so commitments pile up faster.', stats: { fundraising: 14 }, mods: { commitmentRate: 1.4 }, job: { fundraise: 0.5, desc: 'Fundraisers in office raise 50% more — and donors keep asking for favors.' } },
    { id: 'workhorse', name: 'Workhorse', desc: '+3 campaign days per month; fatigue builds faster.', stats: { organizing: 4 }, mods: { extraDays: 3, fatigueRate: 1.35 }, job: { actions: 1, capital: 0.6, desc: 'One extra personal action every month and faster political-capital regeneration.' } },
    { id: 'disciplined', name: 'Disciplined', desc: 'Half the gaffe risk; −4 charisma (scripted).', stats: { discipline: 15, charisma: -4 }, job: { scandal: -0.4, townhall: 0.05, desc: 'Scandals hit 40% softer and appointee scandals are rarer; you rarely blow up at a town hall.' } },
    { id: 'firebrand', name: 'Firebrand', desc: 'Base loves you (+enthusiasm, +small-dollar); swing voters are wary.', stats: { charisma: 4 }, mods: { baseEnthusiasm: 6, smallDollar: 1.35, swingPenalty: 2 }, job: { base: 0.4, colleagues: -0.3, persuade: -0.1, desc: 'Your base approval gets a steady lift, but members across the aisle resist you and relationships with colleagues erode.' } },
    { id: 'dealmaker', name: 'Dealmaker', desc: 'Colleagues trust you (+legislative relationships); your base suspects you of selling out.', stats: {}, mods: { legislativeRel: 10, baseEnthusiasm: -3 }, job: { deal: 0.5, dealCost: -1, colleagues: 0.3, desc: 'Side deals cost 1 less capital and land harder; cosponsors come easier; colleagues warm to you over time.' } },
    { id: 'maverick', name: 'Maverick', desc: 'Independents like you (+swing); party leadership doesn\'t.', stats: {}, mods: { swingBonus: 2, partyRel: -15 }, job: { defection: -0.5, schedule: -0.3, desc: 'Breaking with your party costs half as much — but leadership is slower to schedule your bills.' } },
    { id: 'loyalist', name: 'Party loyalist', desc: 'Leadership backs you (+party support, endorsements); seen as a partisan.', stats: {}, mods: { partyRel: 15, swingPenalty: 1 }, job: { defection: 1, schedule: 0.4, desc: 'Leadership fast-tracks your bills, and defections cost you double.' } },
    { id: 'wealthy', name: 'Family wealth', desc: 'Can self-fund (+$ to start, bigger each race); "out of touch" attacks land.', stats: {}, mods: { selfFund: 1, outOfTouch: 1 }, job: { fundraise: 0.2, townhall: -0.1, desc: 'Fundraisers go a bit better; town halls a bit worse ("out of touch").' } },
    { id: 'plainspoken', name: 'Plainspoken', desc: 'Working-class voters connect with you; more prone to gaffes.', stats: { charisma: 4, discipline: -8 }, mods: { blocs: { working: 3, rural: 2 } }, job: { townhall: 0.15, media: -0.1, desc: 'Town halls go well; formal media interviews are riskier.' } },
    { id: 'telegenic', name: 'Telegenic', desc: 'Media loves you (+earned media); critics call you a lightweight (−3 policy).', stats: { policy: -3 }, mods: { media: 15, earnedMedia: 1.3 }, job: { media: 0.25, address: 0.5, desc: 'Media appearances and public addresses land better.' } },
    { id: 'checkered', name: 'Checkered past', desc: 'Life experience (+6 charisma, +6 organizing); oppo researchers will find something.', stats: { charisma: 6, organizing: 6 }, mods: { skeletons: 2 }, job: { scandal: 0.4, desc: 'Scandals land 40% harder; reporters keep digging.' } },
    { id: 'local_roots', name: 'Deep local roots', desc: 'Strong name recognition at home (+15 local name rec); harder to scale up statewide.', stats: {}, mods: { localNameRec: 15, scaleUp: 0.85 }, job: { constituent: 1, desc: 'Constituent services are twice as effective.' } },
  ];
  PG.data.traitById = Object.fromEntries(PG.data.traits.map((t) => [t.id, t]));

  PG.data.parties = {
    D: { id: 'D', name: 'Democratic', short: 'Dem', adj: 'Democratic', color: 'var(--dem)', norm: { econ: -35, social: -40 } },
    R: { id: 'R', name: 'Republican', short: 'GOP', adj: 'Republican', color: 'var(--rep)', norm: { econ: 40, social: 40 } },
    I: { id: 'I', name: 'Independent', short: 'Ind', adj: 'independent', color: 'var(--ind)', norm: { econ: 0, social: 0 } },
    L: { id: 'L', name: 'Libertarian', short: 'Lib', adj: 'Libertarian', color: 'var(--ind)', norm: { econ: 60, social: -40 } },
    G: { id: 'G', name: 'Green', short: 'Grn', adj: 'Green', color: 'var(--ind)', norm: { econ: -70, social: -55 } },
  };

  /* Difficulty changes how forgiving the simulation is — never the rules. */
  PG.data.difficulty = {
    forgiving: { name: 'Forgiving', desc: 'Polls are steadier, opponents weaker, scandals rarer, voters quicker to forgive.',
      pollNoise: 0.8, oppQuality: -8, scandalRate: 0.6, badNews: 0.8, startCash: 1.5, electionNoise: 0.8, capital: 1.2 },
    normal: { name: 'Normal', desc: 'Calibrated to reality as closely as practical.',
      pollNoise: 1, oppQuality: 0, scandalRate: 1, badNews: 1, startCash: 1, electionNoise: 1, capital: 1 },
    hard: { name: 'Hard', desc: 'Noisy polls, sharper opponents, more scandals, long memories.',
      pollNoise: 1.25, oppQuality: 8, scandalRate: 1.4, badNews: 1.2, startCash: 0.7, electionNoise: 1.2, capital: 0.85 },
  };

  /* Fictional names only. */
  PG.data.names = {
    first: ['Avery', 'Jordan', 'Morgan', 'Casey', 'Riley', 'Taylor', 'Quinn', 'Reese', 'Dana', 'Jamie', 'Elena', 'Marcus',
      'Priya', 'Daniel', 'Grace', 'Hector', 'Naomi', 'Victor', 'Leah', 'Samuel', 'Ruth', 'Andre', 'Mei', 'Owen', 'Fatima',
      'Caleb', 'Rosa', 'Theo', 'Imani', 'Wesley', 'Nadia', 'Gareth', 'Lucia', 'Darius', 'Helen', 'Tobias', 'Yolanda',
      'Raymond', 'Sofia', 'Dwight', 'Ingrid', 'Malik', 'Carmen', 'Bennett', 'Joy', 'Felix', 'Aisha', 'Russell', 'Tamara',
      'Graham', 'Lena', 'Omar', 'Bridget', 'Desmond', 'Ivy', 'Harold', 'Keiko', 'Luis', 'Margaret', 'Nathaniel', 'Opal',
      'Patrick', 'Renee', 'Silas', 'Tessa', 'Ulysses', 'Vivian', 'Warren', 'Ximena', 'Yusuf', 'Zelda', 'Clint', 'Delia',
      'Emmett', 'Farah', 'Gideon', 'Hazel', 'Isaac', 'June', 'Kendrick', 'Lorraine', 'Mateo', 'Nora', 'Oscar', 'Paloma'],
    last: ['Whitfield', 'Okafor', 'Delgado', 'Brennan', 'Castellano', 'Hargrove', 'Lindqvist', 'Mbeki', 'Novak', 'Prescott',
      'Quintero', 'Ramsey', 'Sandoval', 'Thornbury', 'Underwood', 'Vasquez', 'Wexler', 'Yamamoto', 'Zielinski', 'Abernathy',
      'Beaumont', 'Calloway', 'Draper', 'Ellsworth', 'Fairbanks', 'Galloway', 'Holloway', 'Ibarra', 'Jennings', 'Kowalski',
      'Langford', 'Merriweather', 'Nakamura', 'Oyelaran', 'Pendleton', 'Rutherford', 'Stanhope', 'Treadwell', 'Vance-Ortiz',
      'Winslow', 'Ashby', 'Bramwell', 'Corcoran', 'Dunleavy', 'Escobedo', 'Fenwick', 'Greer', 'Haddad', 'Iverson', 'Jeffords',
      'Kincaid', 'Lockhart', 'Marchetti', 'Nguyen-Hale', 'Orsini', 'Pruitt', 'Redmond', 'Sorensen', 'Tolliver', 'Upshaw',
      'Valdivia', 'Whitaker', 'Yancey', 'Adeyemi', 'Blackwood', 'Chandler', 'Desai', 'Everhart', 'Fitzgerald', 'Gutierrez',
      'Hollis', 'Ingram', 'Jaramillo', 'Kessler', 'Lowery', 'McAllister', 'Northcott', 'Ogden', 'Pacheco', 'Quigley', 'Rourke',
      'Saltonstall', 'Tran', 'Ulrich', 'Voss', 'Wakefield', 'Xiong', 'Yardley', 'Zamora', 'Albright', 'Bishop-Reyes'],
    cityPrefix: ['Cedar', 'Maple', 'River', 'Lake', 'Pine', 'Oak', 'Granite', 'Willow', 'Fox', 'Elm', 'Silver', 'Stone', 'Clear', 'Red', 'Spring', 'Iron', 'Harbor', 'Prairie', 'Bridge', 'North'],
    citySuffix: ['ton', ' Falls', 'ville', ' Heights', 'field', ' Springs', 'port', ' Crossing', 'wood', ' Hollow', 'burg', ' Bend', ' Junction', 'brook', ' Rapids'],
    regionNames: {
      city: ['Downtown', 'Eastside', 'Northgate', 'Riverside', 'Hillcrest', 'Southpark', 'Old Mill', 'Westview'],
      state: ['Metro core', 'Inner suburbs', 'Outer suburbs', 'Small towns', 'Rural north', 'Rural south'],
    },
  };
})(globalThis.PG = globalThis.PG || {});
