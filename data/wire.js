/* "The Wire": the chatter around your political life — social posts from fictional
 * accounts, overheard gossip, and quotes from the cast. Every template has a condition
 * (see PG.arcs.PRED plus the wire-specific ones in src/engine/wire.js), so the feed
 * reacts to what is actually happening. Voices come from all sides. */
(function (PG) {
  'use strict';
  PG.data = PG.data || {};

  PG.data.wireHandles = {
    left: ['@TransitNerd', '@UnionStrong4Life', '@ProgressivePTA', '@RentIsTooDamnHigh', '@ClimateCaucusKid', '@BikeLaneBrenda'],
    right: ['@TaxedEnoughAlready', '@FreedomFirstDad', '@SmallBizSteve', '@BackTheBlueBarb', '@LibertyLeague76', '@CountyCommonSense'],
    center: ['@JustTheFactsPlz', '@CoffeeShopPundit', '@LocalHistoryBuff', '@SwingVoterSue', '@PrecinctNerd', '@IndependentIrene'],
    weird: ['@PotholeWatch', '@CityHallGoose', '@ParkingTicketPoet', '@AngryAboutLeafBlowers', '@CrossingGuardCarl', '@TheBudgetGhost'],
  };

  PG.data.wireBars = ['the Capitol Grille', 'Sal\'s Tap Room', 'the hotel bar across from the statehouse', 'the Elks Lodge fish fry', 'the diner on Route 9', 'the back booth at Murphy\'s'];

  PG.data.wirePosts = [
    // Approval trends
    { if: 'approvalUp', lean: 'center', text: ['Not gonna lie, {name} has been… fine? Good, even? Weird feeling.', 'Ok who replaced {name} with a competent person. Asking for a friend.', 'Credit where due: {name} actually answered my email.'] },
    { if: 'approvalUp', lean: 'left', text: ['{name} is finally delivering. Keep the pressure on.', 'Proof that showing up works. Nice job {name}.'] },
    { if: 'approvalUp', lean: 'right', text: ['Even a broken clock. Fine, {name} did ok this month.', 'Hate to admit it but {name} handled that well.'] },
    { if: 'approvalDown', lean: 'left', text: ['Where is {name}?? Our neighborhood is waiting.', 'We didn\'t elect {name} to "study the issue."'] },
    { if: 'approvalDown', lean: 'right', text: ['{name}: all talk, no results, higher taxes. Next.', 'Remember this in November. #{city}Deserves Better'] },
    { if: 'approvalDown', lean: 'center', text: ['Polls say {name} is sinking. Shocked, I tell you. Mildly shocked.', 'The vibes around {name} are not great right now.'] },
    // Scandal
    { if: 'scandalHot', lean: 'weird', text: ['Today\'s {name} scandal brought to you by: nobody reading the documents before signing them.', 'Day 9 of refreshing the {paper} for new {name} details.'] },
    { if: 'scandalHot', lean: 'center', text: ['I just want ONE news cycle without {name} in it.', 'Is this a real scandal or a Tuesday? Genuinely can\'t tell anymore.'] },
    { if: 'scandalHot', lean: 'left', text: ['Accountability matters even when it\'s our side. {name} needs to answer questions.'] },
    { if: 'scandalHot', lean: 'right', text: ['If this were anyone else they\'d be gone already. Resign, {name}.'] },
    // Economy and gas
    { if: 'highGas', lean: 'right', text: ['${gas} a gallon. Thanks, politicians. 🙃', 'Filled up today. Had to take out a second mortgage. ${gas}/gal.'] },
    { if: 'highGas', lean: 'left', text: ['${gas} gas and oil companies post record profits. Funny how that works.'] },
    { if: 'highGas', lean: 'center', text: ['Nobody in local government controls gas prices but they\'re all going to get blamed. Politics!'] },
    { if: 'recession', lean: 'center', text: ['Laid off Friday. Applying everywhere. If {name} has a plan, now would be the time.', 'Half the storefronts on Main are papered over.'] },
    // Local sports
    { if: 'teamWinning', lean: 'weird', text: ['The {team} are {record}. Whoever is in office right now is going to get reelected on vibes alone.', 'Everyone in {city} is in a good mood because of the {team}. Sign your bills now, {name}.'] },
    { if: 'teamLosing', lean: 'weird', text: ['The {team} are {record}. Town mood: mutinous. Not a great time to raise any fees.', '{team} lose again. I blame city hall. I don\'t know why. I just do.'] },
    // Everyday local weirdness
    { if: 'local', lean: 'weird', text: ['Pothole on 5th now has its own name and a fan club. Please fix it before it unionizes.', 'The goose is back at city hall. The goose has more approval than anyone inside.', 'Someone put googly eyes on every parking meter downtown. Best thing the city has done in years and the city didn\'t do it.', 'The leaf blowers start at 7:02 a.m. Every day. Where is the ordinance, {name}?'] },
    { if: 'local', lean: 'center', text: ['Three-hour public comment on the dog park. Democracy is beautiful and also exhausting.', 'Went to my first council meeting. It\'s just like TV except worse and with folding chairs.'] },
    { if: 'stateLevel', lean: 'center', text: ['Session starts and suddenly every lobbyist in the state owns a nicer suit.', 'The statehouse cafeteria pie is the only bipartisan thing in this capitol.'] },
    { if: 'federal', lean: 'center', text: ['Another 2 a.m. vote. Love to see laws made by people who have not slept.', 'D.C. is just high school with nuclear codes.'] },
    // Campaign
    { if: 'campaign', lean: 'weird', text: ['I have received 14 texts from the {name} campaign today. I gave $5 once. In 2019.', 'Lawn sign count on my street: {name} 6, everyone else 4, guy with a hand-drawn sign 1. Calling it.'] },
    { if: 'campaign', lean: 'center', text: ['Debate tonight. Drinking game: every time someone says "kitchen table."', 'Still undecided. Persuade me with something other than mailers, please.'] },
    { if: 'trailing', lean: 'center', text: ['The {name} campaign has the energy of a group project the night before it\'s due.'] },
    { if: 'leading', lean: 'center', text: ['Every poll has {name} up. That\'s usually when campaigns get sloppy.'] },
    // Party-founder mode
    { if: 'party', lean: 'center', text: ['Honestly would love a third option. Is the {party} real or a podcast?', 'Signed a {party} petition outside the grocery store. Guy had a clipboard and a very nice dog.'] },
    { if: 'party', lean: 'left', text: ['A vote for the {party} is a vote for the other side. Do the math.', 'Third parties are a vanity project until they fix ranked-choice voting.'] },
    { if: 'party', lean: 'right', text: ['The {party} is splitting the vote. Classic spoiler.', 'Both parties hate the {party}. That\'s honestly a selling point.'] },
    { if: 'party', lean: 'weird', text: ['There is a {party} booth at the county fair next to the funnel cake. The funnel cake line is longer. For now.'] },
  ];

  PG.data.wireGossip = [
    { if: 'governing', text: ['Overheard at {bar}: a lobbyist bragging that {name}\'s office "returns calls in under an hour — if you know the number."', 'Overheard at {bar}: two staffers arguing about whether {chief} sleeps.', 'Overheard at {bar}: someone from {rival}\'s orbit asking how {name} polls with suburban moms.'] },
    { if: 'rivalHostile', text: ['Overheard at {bar}: {rival} telling donors that {name} "peaked in student government."', 'Word is {rival} has an oppo researcher pulling your old votes.'] },
    { if: 'campaign', text: ['Overheard at {bar}: a consultant saying the race "comes down to turnout in three precincts and one church parking lot."', 'Overheard at {bar}: {donor} told someone your race is "a good investment, for now."'] },
    { if: 'lowLoyalty', text: ['Overheard at {bar}: someone from your own office complaining loudly. Very loudly.', 'Word around town: one of your senior staff has been taking calls from headhunters.'] },
    { if: 'party', text: ['Overheard at {bar}: two old-party operatives laughing about the {party} — then going quiet and asking each other about your fundraising numbers.'] },
  ];

  // Quotes from the cast, keyed by role.
  PG.data.wireQuotes = [
    { role: 'rival', if: 'rivalHostile', text: ['"{name} means well. So did the guy who designed the Hindenburg."', '"I\'ve worked with {name} for years. I\'ll leave it at that."', '"Some of us do the work. Some of us do press releases."'] },
    { role: 'rival', if: { cast: 'rival', gt: 20 }, text: ['"We disagree plenty, but {name} keeps their word. That\'s rare around here."'] },
    { role: 'reporter', if: 'governing', text: ['Hearing interesting things about the budget. Story coming. 👀', 'Long day at city hall. More questions than answers.'] },
    { role: 'investigator', if: { cast: 'investigator', lt: -25 }, text: ['Records request #3 filed today. They can run, etc.', 'Follow the money. Always follow the money.'] },
    { role: 'activist', if: { cast: 'activist', lt: -15 }, text: ['"We knocked doors for {name}. We\'ll remember who knocked back."'] },
    { role: 'activist', if: { cast: 'activist', gt: 35 }, text: ['"{name} has been with us when it counted. We\'ll be there in November."'] },
    { role: 'labor', if: { cast: 'labor', gt: 30 }, text: ['"Our members know who stood with them."'] },
    { role: 'labor', if: { cast: 'labor', lt: -20 }, text: ['"Talk is cheap. Our members\' rent isn\'t."'] },
    { role: 'business', if: { cast: 'business', gt: 30 }, text: ['"{name} understands that jobs come from employers, not press releases."'] },
    { role: 'business', if: { cast: 'business', lt: -20 }, text: ['"Every month we wait for a permit is a month we hire somewhere else."'] },
    { role: 'pollster', if: 'campaign', text: ['Fielding tonight. Numbers by Thursday. Pray for response rates.'] },
    { role: 'boss', if: { cast: 'boss', lt: -15 }, text: ['"The party has a long memory and a short bench. {name} should think about which one they\'re on."'] },
  ];
})(globalThis.PG = globalThis.PG || {});
