/* Institutional structures: committees, budget categories, cabinets, executive orders. */
(function (PG) {
  'use strict';
  PG.data = PG.data || {};

  /* Committees per body. `cats` are the law categories referred to the committee. */
  PG.data.committees = {
    school: [
      { id: 'finance', name: 'Finance & Operations', cats: ['budget', 'tax', 'labor'] },
      { id: 'curriculum', name: 'Curriculum & Instruction', cats: ['education', 'justice', 'health'] },
      { id: 'facilities', name: 'Facilities & Safety', cats: ['transport', 'housing', 'environment', 'commerce'] },
    ],
    council: [
      { id: 'safety', name: 'Public Safety', cats: ['justice', 'immigration'] },
      { id: 'budget', name: 'Budget & Finance', cats: ['budget', 'tax', 'labor', 'commerce'] },
      { id: 'land', name: 'Housing & Land Use', cats: ['housing', 'environment', 'health'] },
      { id: 'infra', name: 'Transportation & Infrastructure', cats: ['transport', 'education', 'elections'] },
    ],
    state: [
      { id: 'approps', name: 'Appropriations', cats: ['budget'] },
      { id: 'revenue', name: 'Ways & Means / Revenue', cats: ['tax'] },
      { id: 'judiciary', name: 'Judiciary', cats: ['justice', 'immigration', 'civil'] },
      { id: 'education', name: 'Education', cats: ['education'] },
      { id: 'health', name: 'Health & Human Services', cats: ['health', 'welfare'] },
      { id: 'commerce', name: 'Commerce & Labor', cats: ['labor', 'commerce', 'finance', 'tech'] },
      { id: 'transport', name: 'Transportation', cats: ['transport'] },
      { id: 'environment', name: 'Environment & Natural Resources', cats: ['environment', 'energy', 'agriculture'] },
      { id: 'elections', name: 'State Affairs & Elections', cats: ['elections', 'housing', 'guns'] },
    ],
    us_house: [
      { id: 'approps', name: 'Appropriations', cats: ['budget'] },
      { id: 'ways', name: 'Ways and Means', cats: ['tax', 'trade', 'retirement'] },
      { id: 'judiciary', name: 'Judiciary', cats: ['justice', 'immigration', 'guns', 'civil'] },
      { id: 'energy', name: 'Energy and Commerce', cats: ['health', 'energy', 'commerce', 'tech', 'environment'] },
      { id: 'edwork', name: 'Education and the Workforce', cats: ['education', 'labor'] },
      { id: 'homeland', name: 'Homeland Security', cats: ['border'] },
      { id: 'armed', name: 'Armed Services', cats: ['defense'] },
      { id: 'transport', name: 'Transportation and Infrastructure', cats: ['transport', 'housing'] },
      { id: 'ag', name: 'Agriculture', cats: ['agriculture', 'welfare'] },
      { id: 'financial', name: 'Financial Services', cats: ['finance'] },
      { id: 'admin', name: 'House Administration', cats: ['elections'] },
    ],
    us_senate: [
      { id: 'approps', name: 'Appropriations', cats: ['budget'] },
      { id: 'finance', name: 'Finance', cats: ['tax', 'trade', 'retirement', 'health'] },
      { id: 'judiciary', name: 'Judiciary', cats: ['justice', 'immigration', 'guns', 'civil'] },
      { id: 'help', name: 'Health, Education, Labor & Pensions', cats: ['education', 'labor'] },
      { id: 'commerce', name: 'Commerce, Science & Transportation', cats: ['commerce', 'tech', 'transport'] },
      { id: 'homeland', name: 'Homeland Security & Governmental Affairs', cats: ['border', 'elections'] },
      { id: 'armed', name: 'Armed Services', cats: ['defense'] },
      { id: 'epw', name: 'Environment and Public Works', cats: ['environment', 'energy', 'housing'] },
      { id: 'ag', name: 'Agriculture, Nutrition & Forestry', cats: ['agriculture', 'welfare'] },
      { id: 'banking', name: 'Banking, Housing & Urban Affairs', cats: ['finance'] },
    ],
  };

  /* Budget structures. share = fraction of baseline spending. service = outcome it drives.
   * perCapita = baseline spending per resident. */
  PG.data.budgets = {
    school: {
      perCapita: 2300, fyStart: 7, balanced: true, debtRatio: 0.2,
      spending: [
        { id: 'instruction', name: 'Instruction & teachers', share: .58, service: 'education' },
        { id: 'support', name: 'Counselors & student support', share: .14, service: 'education' },
        { id: 'facilities', name: 'Buildings & maintenance', share: .11, service: 'infrastructure' },
        { id: 'transport', name: 'Buses', share: .06, service: 'services' },
        { id: 'admin', name: 'Administration', share: .11, service: 'efficiency' },
      ],
      revenue: [
        { id: 'levy', name: 'Local property levy', share: .45, lever: true, econSens: 0.3 },
        { id: 'state_aid', name: 'State aid', share: .48, lever: false, econSens: 0.6 },
        { id: 'federal', name: 'Federal funds', share: .07, lever: false, econSens: 0 },
      ],
    },
    city: {
      perCapita: 2100, fyStart: 7, balanced: true, debtRatio: 0.6,
      spending: [
        { id: 'police', name: 'Police', share: .27, service: 'crime' },
        { id: 'fire', name: 'Fire & EMS', share: .12, service: 'safety' },
        { id: 'streets', name: 'Streets & transit', share: .14, service: 'infrastructure' },
        { id: 'parks', name: 'Parks & libraries', share: .07, service: 'quality' },
        { id: 'housing', name: 'Housing & homelessness', share: .08, service: 'housing' },
        { id: 'sanitation', name: 'Sanitation & water', share: .10, service: 'services' },
        { id: 'admin', name: 'Administration', share: .09, service: 'efficiency' },
        { id: 'pensions', name: 'Pensions & debt service', share: .13, service: 'obligations', fixed: true },
      ],
      revenue: [
        { id: 'property', name: 'Property tax', share: .42, lever: true, econSens: 0.3 },
        { id: 'sales', name: 'Sales tax', share: .22, lever: true, econSens: 1.2 },
        { id: 'fees', name: 'Fees & charges', share: .14, lever: true, econSens: 0.5 },
        { id: 'state_aid', name: 'State & federal aid', share: .22, lever: false, econSens: 0.5 },
      ],
    },
    state: {
      perCapita: 8200, fyStart: 7, balanced: true, debtRatio: 0.35,
      spending: [
        { id: 'k12', name: 'K-12 education', share: .28, service: 'education' },
        { id: 'medicaid', name: 'Medicaid & health', share: .30, service: 'health' },
        { id: 'higher_ed', name: 'Higher education', share: .08, service: 'education' },
        { id: 'corrections', name: 'Corrections & police', share: .07, service: 'crime' },
        { id: 'transport', name: 'Transportation', share: .08, service: 'infrastructure' },
        { id: 'welfare', name: 'Public assistance', share: .06, service: 'housing' },
        { id: 'admin', name: 'General government', share: .05, service: 'efficiency' },
        { id: 'pensions', name: 'Pensions & debt service', share: .08, service: 'obligations', fixed: true },
      ],
      revenue: [
        { id: 'income', name: 'Personal income tax', share: .34, lever: true, econSens: 1.3 },
        { id: 'sales', name: 'Sales tax', share: .28, lever: true, econSens: 1.1 },
        { id: 'corporate', name: 'Corporate tax', share: .06, lever: true, econSens: 2.0 },
        { id: 'federal', name: 'Federal funds', share: .32, lever: false, econSens: 0 },
      ],
    },
    federal: {
      perCapita: 21500, fyStart: 10, balanced: false, debtRatio: 4.3,
      spending: [
        { id: 'socsec', name: 'Social Security', share: .21, service: 'retirement', mandatory: true },
        { id: 'medicare', name: 'Medicare', share: .14, service: 'health', mandatory: true },
        { id: 'medicaid', name: 'Medicaid & ACA', share: .09, service: 'health', mandatory: true },
        { id: 'defense', name: 'Defense', share: .13, service: 'security' },
        { id: 'nondefense', name: 'Non-defense discretionary', share: .13, service: 'infrastructure' },
        { id: 'income_sec', name: 'Income security', share: .09, service: 'housing', mandatory: true },
        { id: 'veterans', name: 'Veterans', share: .05, service: 'security' },
        { id: 'interest', name: 'Net interest', share: .13, service: 'obligations', fixed: true },
        { id: 'other', name: 'Other mandatory', share: .03, service: 'efficiency', mandatory: true },
      ],
      revenue: [
        { id: 'income', name: 'Individual income tax', share: .50, lever: true, econSens: 1.4 },
        { id: 'payroll', name: 'Payroll taxes', share: .35, lever: true, econSens: 0.9 },
        { id: 'corporate', name: 'Corporate tax', share: .10, lever: true, econSens: 2.0 },
        { id: 'tariffs', name: 'Tariffs & other', share: .05, lever: true, econSens: 0.8 },
      ],
    },
  };

  /* Executive staff / cabinet positions. confirm: which body must confirm. */
  PG.data.cabinets = {
    mayor: [
      { id: 'chief_staff', name: 'Chief of Staff', area: 'efficiency' },
      { id: 'police_chief', name: 'Police Chief', area: 'crime', confirm: true },
      { id: 'budget_dir', name: 'Budget Director', area: 'budget' },
      { id: 'housing_dir', name: 'Housing Director', area: 'housing', confirm: true },
      { id: 'public_works', name: 'Public Works Commissioner', area: 'infrastructure', confirm: true },
    ],
    governor: [
      { id: 'chief_staff', name: 'Chief of Staff', area: 'efficiency' },
      { id: 'budget_dir', name: 'Budget Director', area: 'budget' },
      { id: 'health', name: 'Health Secretary', area: 'health', confirm: true },
      { id: 'education', name: 'Education Commissioner', area: 'education', confirm: true },
      { id: 'safety', name: 'Public Safety Secretary', area: 'crime', confirm: true },
      { id: 'transport', name: 'Transportation Secretary', area: 'infrastructure', confirm: true },
      { id: 'emergency', name: 'Emergency Management Director', area: 'safety' },
    ],
    president: [
      { id: 'chief_staff', name: 'White House Chief of Staff', area: 'efficiency' },
      { id: 'state', name: 'Secretary of State', area: 'foreign', confirm: true },
      { id: 'treasury', name: 'Secretary of the Treasury', area: 'budget', confirm: true },
      { id: 'defense', name: 'Secretary of Defense', area: 'security', confirm: true },
      { id: 'ag', name: 'Attorney General', area: 'crime', confirm: true },
      { id: 'hhs', name: 'Secretary of Health & Human Services', area: 'health', confirm: true },
      { id: 'dhs', name: 'Secretary of Homeland Security', area: 'safety', confirm: true },
      { id: 'omb', name: 'OMB Director', area: 'budget', confirm: true },
    ],
  };

  /* Executive orders. vuln: legal vulnerability 0..1. grounds: likely legal theory.
   * revocable by successor; effects use the shared effect language. */
  PG.data.executiveOrders = [
    { id: 'eo_hiring_freeze', name: 'Government hiring freeze', levels: ['city', 'state', 'federal'], ideo: { econ: 25, social: 0 }, tags: ['spending_cut'],
      vuln: .05, grounds: 'None significant — squarely within executive authority.', effects: { budgetPct: -0.01, outcomes: { services: -1, efficiency: 1 } } },
    { id: 'eo_police_directive', name: 'Use-of-force & de-escalation directive', levels: ['city', 'state'], ideo: { econ: 0, social: -25 }, tags: ['police_reform'],
      vuln: .2, grounds: 'Police union contract and arbitration rules.', effects: { outcomes: { crime: 0.5 } } },
    { id: 'eo_crime_surge', name: 'Targeted crime-reduction surge', levels: ['city', 'state'], ideo: { econ: 5, social: 25 }, tags: ['tough_on_crime', 'police_fund'],
      vuln: .15, grounds: 'Civil-liberties challenges to stop-and-frisk-style tactics.', effects: { budgetPct: -0.004, outcomes: { crime: -2 } } },
    { id: 'eo_permit_streamline', name: 'Streamline construction permitting', levels: ['city', 'state'], ideo: { econ: 20, social: 0 }, tags: ['housing_build', 'deregulation'],
      vuln: .15, grounds: 'Procedural claims that environmental review was skipped.', effects: { outcomes: { housing: 2 }, economy: { growth: 0.05 } } },
    { id: 'eo_tenant_protection', name: 'Emergency tenant protections', levels: ['city', 'state'], ideo: { econ: -30, social: -5 }, tags: ['rent_control'],
      vuln: .45, grounds: 'Takings Clause and state preemption of local rent rules.', effects: { outcomes: { housing: -1 } } },
    { id: 'eo_climate_directive', name: 'Climate & clean-fleet directive', levels: ['city', 'state', 'federal'], ideo: { econ: -25, social: -10 }, tags: ['environment', 'regulation'],
      vuln: .3, grounds: 'Agency lacks statutory authority (major-questions doctrine at the federal level).', effects: { outcomes: { environment: 2 }, economy: { growth: -0.03 } } },
    { id: 'eo_energy_permits', name: 'Fast-track energy & pipeline permits', levels: ['state', 'federal'], ideo: { econ: 30, social: 5 }, tags: ['fossil', 'deregulation'],
      vuln: .25, grounds: 'Environmental-review statutes (NEPA-style) and tribal consultation.', effects: { outcomes: { environment: -2 }, economy: { growth: 0.06 } } },
    { id: 'eo_guard_border', name: 'Deploy National Guard to the border', levels: ['state'], ideo: { econ: 0, social: 35 }, tags: ['immigration_restrict'],
      vuln: .3, grounds: 'Federal supremacy over immigration enforcement.', effects: { budgetPct: -0.003 } },
    { id: 'eo_sanctuary', name: 'Limit cooperation with federal immigration detainers', levels: ['city', 'state'], ideo: { econ: 0, social: -35 }, tags: ['immigration_open'],
      vuln: .35, grounds: 'Federal funding conditions and state anti-sanctuary preemption laws.', effects: {} },
    { id: 'eo_ethics', name: 'Executive ethics & lobbying ban', levels: ['city', 'state', 'federal'], ideo: { econ: 0, social: 0 }, tags: ['transparency'],
      vuln: .05, grounds: 'None significant.', effects: { media: 3 } },
    { id: 'eo_tariffs', name: 'Emergency tariffs on imports', levels: ['federal'], ideo: { econ: 5, social: 15 }, tags: ['trade_protect'],
      vuln: .5, grounds: 'Whether emergency-powers statutes authorize tariffs (separation of powers).', effects: { economy: { inflation: 0.4, growth: -0.12 }, revenuePct: 0.01 } },
    { id: 'eo_loan_relief', name: 'Student-loan relief by executive action', levels: ['federal'], ideo: { econ: -35, social: -10 }, tags: ['welfare'],
      vuln: .7, grounds: 'Major-questions doctrine; lack of clear statutory authority.', effects: { budgetPct: -0.01 } },
    { id: 'eo_border_emergency', name: 'National emergency at the southern border', levels: ['federal'], ideo: { econ: 5, social: 40 }, tags: ['immigration_restrict'],
      vuln: .45, grounds: 'Reprogramming appropriated funds without Congress (Appropriations Clause).', effects: { budgetPct: -0.002 } },
    { id: 'eo_deferred_action', name: 'Deferred action for long-term residents', levels: ['federal'], ideo: { econ: 0, social: -35 }, tags: ['immigration_open'],
      vuln: .6, grounds: 'Administrative Procedure Act; Take Care Clause challenges by states.', effects: {} },
    { id: 'eo_dereg', name: 'Regulatory budget: two-for-one rule', levels: ['state', 'federal'], ideo: { econ: 35, social: 0 }, tags: ['deregulation'],
      vuln: .1, grounds: 'Minor APA claims.', effects: { economy: { growth: 0.05 }, outcomes: { environment: -1 } } },
    { id: 'eo_drug_import', name: 'Allow prescription-drug importation', levels: ['state', 'federal'], ideo: { econ: -10, social: 0 }, tags: ['healthcare_public'],
      vuln: .3, grounds: 'FDA safety statutes; industry suits.', effects: { outcomes: { health: 1 } } },
    { id: 'eo_remote_work', name: 'Return government workers to the office', levels: ['city', 'state', 'federal'], ideo: { econ: 15, social: 5 }, tags: ['spending_cut'],
      vuln: .1, grounds: 'Collective-bargaining agreements.', effects: { outcomes: { efficiency: 1 } } },
  ];
  PG.data.eoById = Object.fromEntries(PG.data.executiveOrders.map((e) => [e.id, e]));
})(globalThis.PG = globalThis.PG || {});
