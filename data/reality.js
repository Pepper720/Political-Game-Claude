/* "How this models reality": the real-world rules the game follows, and where it
 * simplifies. Shown in-game. Each section: { title, real: [...], simplified: [...] }. */
(function (PG) {
  'use strict';
  PG.data = PG.data || {};
  PG.data.reality = [
    { title: 'Offices, terms and eligibility',
      real: [
        'Constitutional minimum ages: U.S. House 25, Senate 30, President 35; citizenship of 7 and 9 years for House and Senate; Presidents must be natural-born citizens with 14 years of residency.',
        'The 22nd Amendment limits a President to two elected terms (one if they served more than two years of a predecessor\'s term).',
        'Governors\' term lengths (2 years in New Hampshire and Vermont), election years (including odd-year races in Virginia, New Jersey, Kentucky, Louisiana and Mississippi) and term limits (none, two consecutive, two lifetime, Virginia\'s no-consecutive-terms rule) follow each state.',
        'State legislative chamber sizes, term lengths (e.g., 4-year House terms in Alabama, Louisiana, Maryland, Mississippi and North Dakota; 2-year Senate terms in a dozen states) and the 16 states with legislative term limits follow each state. Nebraska is unicameral.',
        'U.S. Senate seats follow the three real Senate classes (up in 2024/2030, 2026/2032, 2028/2034). DC has no senators, governor or state legislature.',
        'Officeholders can run for another office mid-term; if their current term outlasts the election (e.g., a senator running for President), they keep their seat if they lose.',
      ],
      simplified: [
        'Local offices use common formats: nonpartisan odd-year elections, a three-seat at-large school board, ward-based council, strong mayor with a December runoff, and a two-consecutive-term mayoral limit. Real cities vary widely.',
        'State minimum ages for legislators and governors use the most common values (21/25/30) rather than every state\'s rule.',
        'Your first race must be local; after that you may run for anything you are legally eligible for.',
        '"Resign-to-run" laws in some states are not modeled.',
      ] },
    { title: 'Elections and voters',
      real: [
        'Every state\'s partisan lean approximates the Cook Partisan Voting Index; the two-party margin of a generic race reproduces it.',
        'Primary rules follow each state: open, closed, semi-closed, California and Washington\'s top-two, Alaska\'s top-four with ranked-choice general, Louisiana\'s all-candidate ballot, Maine\'s ranked-choice voting, and primary runoffs (50% in most Southern states, 30% in North Carolina, 35% in South Dakota). Georgia holds general-election runoffs.',
        'Turnout differs sharply by election type (presidential, midterm, odd-year, primary, runoff), and low-turnout elections are older and more partisan.',
        'Midterm penalty: the president\'s party historically loses ground in midterms; presidential approval and the economy drive the national environment.',
        'Polls carry a real sampling margin of error (≈ 98/√n), house effects, and undecided voters that shrink as name recognition grows. Crosstab subgroups are noisier.',
        'States that count mail ballots last (e.g., Pennsylvania, Wisconsin) show early leads that shift as mail is counted; states that count mail first show the reverse.',
        'Ranked-choice tabulation eliminates the last-place candidate and redistributes ballots until someone has a majority.',
      ],
      simplified: [
        'The electorate is split into eleven non-overlapping voter blocs. Real voters belong to many overlapping groups; blocs are a tractable stand-in.',
        'Candidates sit in a two-dimensional ideological space (economic, social). Voters weigh distance, party, favorability × name recognition, incumbency, campaign targeting and endorsements.',
        'Election-night regions are archetypes (metro core, suburbs, small towns, rural), not real counties.',
        'Election-day polling error is modeled as a single statewide/national swing plus candidate-level noise.',
      ] },
    { title: 'Districts and redistricting',
      real: [
        'House seats per state follow the 2020 apportionment (435 total); six states have a single at-large seat.',
        'Who draws the maps follows each state (Republican or Democratic legislatures, independent/bipartisan commissions, or split/court control). Partisan map-drawers "pack" opponents into a few lopsided seats and "crack" the rest.',
        'Mid-decade redistricting fights can redraw a member\'s district.',
      ],
      simplified: [
        'District leans are generated statistically from the state\'s lean and urbanization rather than drawn from real maps.',
        'Court challenges to maps (Voting Rights Act, state constitutions) are folded into events rather than simulated case by case.',
      ] },
    { title: 'Money in campaigns',
      real: [
        'Federal limit: $3,500 per individual per election (2025–26 cycle); PACs $5,000. Super PACs can raise and spend unlimited sums but may not coordinate with candidates.',
        'State contribution limits vary widely; about a dozen states (e.g., Texas, Virginia, Pennsylvania, Utah) have no limit on individual contributions to statewide candidates.',
        'Candidates trade call time for dollars; small-dollar fundraising rewards ideological intensity and momentum; big donors and PACs expect access.',
        'Unused campaign funds roll into future campaigns.',
      ],
      simplified: [
        'Money is a single war chest. Rules on transferring between state and federal committees are not modeled.',
        'Local contribution limits use a typical value rather than each city\'s ordinance.',
        'Donor "commitments" are an abstraction of the implicit expectations that accompany large contributions.',
      ] },
    { title: 'Presidential elections',
      real: [
        'All 50 states and DC with their 2024–2028 electoral votes (538 total; 270 to win).',
        'Maine and Nebraska allocate two electors statewide and one per congressional district; every other state is winner-take-all.',
        'A 269–269 tie goes to the House of Representatives, voting by state delegation (one vote per state; 26 needed).',
        'Democratic primaries allocate delegates proportionally with a 15% threshold; Republican primaries mix winner-take-all, winner-take-most and proportional rules by state. A majority of pledged delegates wins the nomination.',
        'The primary calendar runs from early states in January–February through Super Tuesday in March to June.',
      ],
      simplified: [
        'Delegate counts and state-by-state Republican allocation rules are approximations. Superdelegates and convention floor fights are not modeled.',
        'Faithless electors are not modeled.',
        'National polls and state results move together through a uniform national swing plus state-level noise.',
      ] },
    { title: 'Legislatures',
      real: [
        'Bills go to committee (where chairs can bury them), then to the floor, then the other chamber; differing versions go to conference; the executive signs or vetoes.',
        'Leaders of the majority control the floor and rarely schedule bills most of their own caucus opposes ("majority of the majority").',
        'In the U.S. Senate, most legislation needs 60 votes to end a filibuster (cloture). Budget reconciliation lets budgetary measures pass with a simple majority, once per fiscal year.',
        'House discharge petitions with 218 signatures can force a floor vote over leadership\'s objection.',
        'Veto override thresholds follow each state: two-thirds in most, three-fifths in Delaware, Illinois, Maryland, Nebraska, North Carolina, Ohio and Rhode Island, and a simple majority in Alabama, Arkansas, Indiana, Kentucky, Tennessee and West Virginia.',
        'Committee chairs are generally assigned by seniority within the majority party.',
        'Many state legislatures meet part-time; Texas, Montana, Nevada and North Dakota meet only in odd years.',
        'Unsigned bills generally become law after a set period (pocket vetoes are not modeled).',
      ],
      simplified: [
        'Each member decides from ideology, party leadership\'s position, district pressure, interest-group lobbying, cost concerns, their relationship with you, and a stable personal-conviction term.',
        'Amendments are modeled as scaling a bill\'s scope (Modest / Standard / Sweeping).',
        'Holds, unanimous-consent agreements, motions to recommit and the Byrd rule\'s details are not modeled.',
      ] },
    { title: 'Executives and budgets',
      real: [
        'Every state except Vermont has some balanced-budget requirement; cities must balance too. The federal government can borrow, and interest costs rise with debt and rates.',
        'Most governors (44 states) have a line-item veto; Indiana, Nevada, New Hampshire, North Carolina, Rhode Island and Vermont do not.',
        'Fiscal years follow common practice (July 1 for most states and cities; October 1 federal; New York April; Texas September).',
        'Federal appropriations lapses cause shutdowns; state budget impasses usually leave agencies running at prior levels.',
        'Many executive appointments require legislative confirmation.',
        'Executive orders are fast but vulnerable: courts weigh statutory authority (including the federal "major questions" doctrine), and successors can revoke them.',
      ],
      simplified: [
        'Budgets are aggregated into 5–9 categories with a "need" baseline; funding below need erodes outcomes over months.',
        'Tax policy is expressed as rate multipliers on a few revenue sources, with a small behavioral response.',
        'Federal mandatory spending can only change through legislation (the editor limits it to ±3%).',
      ] },
    { title: 'Courts',
      real: [
        'Laws and executive orders are challenged by affected groups; cases move from trial courts to appeals courts to a supreme court, and injunctions can block policies while litigation proceeds.',
        'Court ideology matters: the same law fares differently before different benches.',
        'Federal law preempts conflicting state law; states can preempt local ordinances (rent control, minimum wage, plastic bags, sanctuary policies are common targets).',
        'Presidents nominate federal judges and Supreme Court justices with Senate confirmation; many governors appoint state judges.',
      ],
      simplified: [
        'Each law has a single "legal vulnerability" score and a description of the likely legal theory.',
        'Lower federal courts are represented by an aggregate balance that shifts with appointments.',
        'State judicial selection methods (elections, merit selection) are collapsed into appointment by the governor.',
      ] },
    { title: 'Economy, approval and interest groups',
      real: [
        'Recessions arrive irregularly; unemployment follows growth (Okun\'s law); inflation responds to slack; the Fed sets rates roughly by a Taylor rule.',
        'Voters reward and punish officials for the economy, more so executives and Presidents.',
        'Partisanship puts a floor and ceiling on approval; honeymoons fade.',
      ],
      simplified: [
        'Approval is the sum of visible components (partisanship, economy, services, policy record, events, scandals, honeymoon, ideological fit, taxes) per bloc, approached gradually.',
        'Interest groups are fictional composites with tag-based policy preferences. No real organization is depicted.',
        'All people in the game are fictional. No real politician appears.',
      ] },
    { title: 'Third parties and party building',
      real: [
        'New parties must petition onto each state\'s ballot; requirements vary enormously, and states such as California, New York, Texas and North Carolina are notoriously hard while others are comparatively easy.',
        'Under first-past-the-post, voters often avoid "wasting" a vote on a party that cannot win (Duverger\'s law), so third parties underperform their sympathizers.',
        'Third-party success is usually built bottom-up: local and state legislative seats, concentrated in places where the brand is known, before statewide or federal wins.',
        'Spoiler accusations, debate-exclusion thresholds, fusion offers and factional splits are recurring real pressures on minor parties.',
      ],
      simplified: [
        'Signature requirements are a percentage of population in three tiers rather than each state\'s exact statute; parties keep ballot lines by reaching 2% of the vote anywhere they ran.',
        'The wasted-vote effect is a single penalty that shrinks with name recognition, recent vote share and seats held.',
        'You run the party as a whole; individual nominees are generated, and other parties\' candidates use the normal opponent model.',
        'Formal coalitions and power-sharing deals between parties in a chamber are not modeled.',
        'A single petition drive spends at most half the treasury on paid circulators; opponents\' signature challenges throw out a random 5–20%.',
      ] },
    { title: 'Getting bills through',
      real: [
        'Most introduced bills never become law; committees, chairs and floor leaders decide what gets a vote.',
        'Committee chairs and opponents add amendments that make bills harder to pass or less effective — offsets, unrelated riders and sunset clauses are all common.',
        'Wavering members trade their votes for district projects, changes to the bill, or future support (logrolling).',
      ],
      simplified: [
        'Poison pills are drawn from a short list; stripping one is a single capital-costing roll.',
        'Holdouts appear only on close votes for bills you back, at most three at a time, each with one demand.',
        'Personality effects are fixed modifiers from traits, background and stats rather than emergent behavior.',
      ] },
    { title: 'Even-handedness',
      real: [
        'Policy effects reflect commonly argued tradeoffs on both sides: costs, benefits, legal risk, and who gains or loses.',
        'There is no hidden moral score. Your "legacy" counts offices held, years served, laws passed and elections won — not ideology.',
        'Interest groups and media outlets are balanced across the spectrum.',
      ],
      simplified: [
        'Magnitudes are tuned for gameplay and are illustrative rather than predictions.',
      ] },
  ];
})(globalThis.PG = globalThis.PG || {});
