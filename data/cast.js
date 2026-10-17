/* The people in your political life (all fictional). Each game generates one person per
 * role. They remember what you do to them, it changes what they do for (or to) you, and
 * they show up by name in storylines, phone calls and the news.
 *   start: initial relationship range (−100 hostile … +100 devoted)
 *   matters: what this relationship does mechanically (shown in the Rolodex)
 *   group: an interest group whose standing moves with this person's */
(function (PG) {
  'use strict';
  PG.data = PG.data || {};

  PG.data.castRoles = [
    { id: 'chief', title: 'Chief of staff', partyTitle: 'Executive director', kind: 'staff', icon: '🗂️', start: [30, 50],
      matters: 'A loyal chief (60+) runs a tight shop: +capital each month. A disloyal one (below 0) leaks.' },
    { id: 'comms', title: 'Communications director', partyTitle: 'Press secretary', kind: 'staff', icon: '🎙️', start: [25, 45],
      matters: 'Shapes how storylines and scandals land. Burned-out comms staff quit at the worst moment.' },
    { id: 'fixer', title: 'Old-hand consultant', kind: 'staff', icon: '🎲', start: [10, 30],
      matters: 'Knows where the bodies are buried. Offers shortcuts in storylines — effective, sometimes alarming.' },
    { id: 'pollster', title: 'Pollster', kind: 'staff', icon: '📈', start: [15, 35],
      matters: 'Delivers the unvarnished numbers. A trusted pollster warns you before storms hit.' },
    { id: 'reporter', title: 'Beat reporter', kind: 'press', icon: '📰', start: [-5, 15],
      matters: 'Your press relations drift toward how this reporter sees you. Friendly coverage softens scandals.' },
    { id: 'investigator', title: 'Investigative reporter', kind: 'press', icon: '🔎', start: [-15, 0],
      matters: 'Hostile? Expect deeper digging and bigger stories. You cannot buy this one — only stop giving them material.' },
    { id: 'donor', title: 'Mega-donor', partyTitle: 'Founding donor', kind: 'money', icon: '💼', start: [5, 25],
      matters: 'A warm donor quietly steers money your way every campaign month. Every check comes with a phone call later.' },
    { id: 'boss', title: 'County party chair', partyTitle: 'Major-party operative', kind: 'party', icon: '🎩', start: [5, 25], partyStart: [-30, -10],
      matters: 'Party leadership standing drifts toward the boss\'s view of you. The boss can clear a primary field — for a price.' },
    { id: 'rival', title: 'Rival', partyTitle: 'Rival party-builder', kind: 'rival', icon: '⚔️', start: [-25, -5],
      matters: 'Climbs the ladder alongside you. If you both want the same seat, you will meet in a primary.' },
    { id: 'labor', title: 'Union local president', kind: 'leader', icon: '🔧', start: [-10, 20], group: 'labor',
      matters: 'Moves the American Workers Federation with them: door-knockers and checks, or picket lines.' },
    { id: 'business', title: 'Chamber of commerce head', kind: 'leader', icon: '🏢', start: [-10, 20], group: 'chamber',
      matters: 'Moves the Commerce Council with them. Owns half the sponsorship banners in town.' },
    { id: 'activist', title: 'Grassroots organizer', kind: 'leader', icon: '✊', start: [0, 25],
      matters: 'Speaks for your base. Anger here feeds a primary challenge; loyalty calms it.' },
    { id: 'faith', title: 'Community faith leader', kind: 'leader', icon: '🕊️', start: [0, 20],
      matters: 'Hosts the forums where swing voters actually show up. Trusted voices lend credibility in a crisis.' },
    { id: 'mentor', title: 'Mentor', kind: 'friend', icon: '🧓', start: [50, 70],
      matters: 'The person who talked you into this. Gives honest advice — and eventually asks for one favor.' },
  ];

  PG.data.castQuirks = [
    'texts exclusively in all caps', 'never forgets a slight', 'quotes Lyndon Johnson at every opportunity',
    'only takes meetings in the same diner booth', 'keeps a binder on everyone in town', 'answers the phone on the first ring at any hour',
    'thinks every problem is a messaging problem', 'has a nephew who needs a job', 'brings donuts to every bad-news meeting',
    'collects favors like baseball cards', 'speaks almost entirely in sports metaphors', 'is deeply superstitious about election nights',
    'has been in politics since the Carter administration', 'is quietly writing a memoir', 'refuses to use email',
    'knows every bartender within a mile of the capitol', 'still has a flip phone', 'is always training for a marathon',
    'name-drops a senator they met once in 1998', 'keeps a jar of hard candy for visitors', 'can recite precinct results from memory',
    'insists on handwritten thank-you notes', 'treats every decision as a chess move', 'has strong opinions about lawn signs',
  ];

  PG.data.relLabels = [
    [60, 'Devoted'], [30, 'Friendly'], [8, 'Cordial'], [-12, 'Wary'], [-40, 'Cold'], [-101, 'Hostile'],
  ];

  /* Phone asks: small decisions that arrive between months. They never block the game,
   * but they expire — and ignoring someone is also an answer. */
  PG.data.asks = [
    { id: 'rep_comment', from: 'reporter', when: { phase: ['governing', 'campaign'] },
      text: '{reporter} ({paper}): "Running a Sunday piece on property taxes. Want to be quoted, or should I write that you didn\'t respond?"',
      options: [
        { label: 'Give a candid quote', effects: { media: 2, nameRec: 1 }, cast: { reporter: 6 }, mem: 'gave a candid quote on property taxes' },
        { label: 'Send a written statement', effects: { media: 1 }, cast: { reporter: 1 } },
      ],
      ignore: { cast: { reporter: -6 }, effects: { media: -2 }, mem: 'ignored a request for comment', text: 'The story ran: "{name} did not respond to requests for comment."' } },
    { id: 'rep_tip', from: 'reporter', when: { phase: ['governing'] },
      text: '{reporter}: "Off the record — I hear {rival} is shopping a story about your office budget. Anything I should know first?"',
      options: [
        { label: 'Walk them through the numbers', effects: { media: 2 }, cast: { reporter: 8, rival: -4 }, mem: 'walked them through the office budget before a hit piece' },
        { label: '"No comment, even off the record."', cast: { reporter: -3 } },
      ],
      ignore: { cast: { reporter: -4 }, mem: 'left a friendly heads-up unanswered' } },
    { id: 'donor_dinner', from: 'donor', when: { phase: ['governing', 'campaign', 'career'] },
      text: '{donor}: "Dinner at the club Thursday? A few friends want to meet you. Bring your appetite and your schedule for next year."',
      options: [
        { label: 'Go to dinner', effects: { cashPct: 0.03, capital: -1 }, cast: { donor: 8, activist: -3 }, mem: 'came to dinner with the right friends' },
        { label: 'Politely decline', cast: { donor: -4 } },
      ],
      ignore: { cast: { donor: -7 }, mem: 'never RSVP\'d to dinner' } },
    { id: 'donor_nephew', from: 'donor', when: { phase: ['governing'] },
      text: '{donor}: "My nephew just graduated. Bright kid. Any chance you have an internship? Paid, ideally."',
      options: [
        { label: 'Find the nephew a job', effects: { capital: -1 }, cast: { donor: 10, chief: -4 }, mem: 'hired the nephew', echo: { event: 'nephew_trouble', months: [6, 14], chance: 0.35 } },
        { label: '"We have a formal application process."', cast: { donor: -5, chief: 2 } },
      ],
      ignore: { cast: { donor: -6 }, mem: 'ghosted them about the nephew' } },
    { id: 'labor_picket', from: 'labor', when: { phase: ['governing', 'campaign'] },
      text: '{labor}: "We\'re on the picket line at the distribution center Saturday. Your face there would mean something."',
      options: [
        { label: 'Walk the line', effects: { groups: { labor: 4, chamber: -3 }, approval: { base: 0.6, swing: -0.2 } }, cast: { labor: 10, business: -6 }, mem: 'walked the picket line' },
        { label: 'Send a supportive statement', effects: { groups: { labor: 1 } }, cast: { labor: 2 } },
      ],
      ignore: { cast: { labor: -8 }, effects: { groups: { labor: -2 } }, mem: 'didn\'t show up for the picket' } },
    { id: 'biz_ribbon', from: 'business', when: { phase: ['governing', 'campaign'] },
      text: '{business}: "Ribbon cutting for the new distribution hub. Big scissors, bigger photo op. Ten minutes of your time."',
      options: [
        { label: 'Cut the ribbon', effects: { groups: { chamber: 3 }, nameRec: 1 }, cast: { business: 8, labor: -3 }, mem: 'cut the ribbon at the new hub' },
        { label: 'Send a staffer', cast: { business: -2 } },
      ],
      ignore: { cast: { business: -5 }, mem: 'skipped the ribbon cutting' } },
    { id: 'activist_pledge', from: 'activist', when: { phase: ['governing', 'campaign'], partisan: true },
      text: '{activist}: "We\'re asking every candidate to sign our pledge. Some of your colleagues already have. Will you?"',
      options: [
        { label: 'Sign the pledge', effects: { approval: { base: 1, swing: -0.6 }, enthusiasm: 2 }, cast: { activist: 12, business: -3 }, mem: 'signed the pledge', flags: { set: ['signed_pledge'] } },
        { label: '"I don\'t sign pledges."', effects: { approval: { swing: 0.3 } }, cast: { activist: -8 }, mem: 'refused the pledge' },
      ],
      ignore: { cast: { activist: -5 }, mem: 'dodged the pledge' } },
    { id: 'faith_forum', from: 'faith', when: { phase: ['governing', 'campaign'] },
      text: '{faith}: "Our community forum is Sunday evening. People have questions about the shelter on Elm. Will you come and listen?"',
      options: [
        { label: 'Go and take questions', effects: { approval: { swing: 0.6 }, fav: 0.5 }, cast: { faith: 9 }, mem: 'came to the forum and listened' },
        { label: 'Decline — schedule conflict', cast: { faith: -3 } },
      ],
      ignore: { cast: { faith: -6 }, mem: 'didn\'t answer about the forum' } },
    { id: 'mentor_lunch', from: 'mentor', when: { phase: ['governing', 'campaign', 'career'] },
      text: '{mentor}: "Lunch? My treat. You look tired in your pictures, kid."',
      options: [
        { label: 'Have lunch', effects: { capital: 1 }, cast: { mentor: 6 }, mem: 'made time for lunch', note: 'Your fatigue eases.' },
        { label: '"Rain check?"', cast: { mentor: -2 } },
      ],
      ignore: { cast: { mentor: -4 }, mem: 'stopped returning calls' } },
    { id: 'boss_slate', from: 'boss', when: { phase: ['governing', 'campaign'], partisan: true },
      text: '{boss}: "We\'re printing the party slate card. I need you to endorse our pick for county clerk. Nobody you know. Good soldier."',
      options: [
        { label: 'Endorse the slate', effects: { partyRel: 4 }, cast: { boss: 8, activist: -3 }, mem: 'endorsed the slate' },
        { label: 'Stay neutral', effects: { partyRel: -2 }, cast: { boss: -6 }, mem: 'stayed off the slate card' },
      ],
      ignore: { cast: { boss: -6 }, effects: { partyRel: -2 }, mem: 'ignored the slate request' } },
    { id: 'rival_townhall', from: 'rival', when: { phase: ['governing'] },
      text: '{rival}: "Joint town hall on the transit plan? We\'d look bipartisan — or at least grown-up."',
      options: [
        { label: 'Share the stage', effects: { approval: { swing: 0.5 }, nameRec: 1 }, cast: { rival: 10 }, mem: 'shared a stage' },
        { label: 'Decline — no free airtime for them', cast: { rival: -6 } },
      ],
      ignore: { cast: { rival: -3 } } },
    { id: 'pollster_poll', from: 'pollster', when: { phase: ['governing'] },
      text: '{pollster}: "I can field a quick issues poll — $8k. Feels like something is moving with suburban parents and I\'d like to know what."',
      options: [
        { label: 'Fund the poll', effects: { cashPct: -0.008, capital: 1 }, cast: { pollster: 6 }, mem: 'funded the issues poll', note: 'The poll finds the soft spots; your next push is better targeted.' },
        { label: 'Not now', cast: { pollster: -2 } },
      ],
      ignore: { cast: { pollster: -3 } } },
    { id: 'comms_podcast', from: 'comms', when: { phase: ['governing', 'campaign'] },
      text: '{comms}: "A big-audience podcast wants you for three hours, unedited. Huge reach. Huge risk. I can get you out of it."',
      options: [
        { label: 'Do the podcast', chance: { p: 0.55, stat: 'charisma', success: { nameRec: 5, fav: 1.5, outcome: 'Three hours flew by. Clips are everywhere — the good kind.' }, fail: { nameRec: 4, fav: -2, outcome: 'Hour two: an answer about your diet goes viral for the wrong reasons.' } }, cast: { comms: 3 } },
        { label: 'Pass', cast: { comms: 2 } },
      ],
      ignore: { cast: { comms: -3 } } },
    { id: 'comms_burnout', from: 'comms', when: { phase: ['governing', 'campaign'] },
      text: '{comms}: "I haven\'t had a weekend in four months. I need a week off. I\'m asking, but honestly I\'m telling."',
      options: [
        { label: 'Take the week, I\'ll cover', effects: { capital: -1 }, cast: { comms: 12 }, mem: 'got the week off they needed' },
        { label: '"After the next news cycle."', cast: { comms: -10 }, mem: 'was told to wait — again' },
      ],
      ignore: { cast: { comms: -12 }, mem: 'asked for a week off and heard nothing' } },
    { id: 'chief_raise', from: 'chief', when: { phase: ['governing'] },
      text: '{chief}: "A firm offered me twice what I make here. I don\'t want to go. Match it halfway and I\'ll stay through the term."',
      options: [
        { label: 'Find the money', effects: { budgetPct: -0.0005, cashPct: -0.01 }, cast: { chief: 14 }, mem: 'matched the outside offer' },
        { label: '"Public service has its rewards."', cast: { chief: -15 }, mem: 'refused to match the offer' },
      ],
      ignore: { cast: { chief: -12 }, mem: 'never answered about the offer' } },
    { id: 'fixer_oppo', from: 'fixer', when: { phase: ['campaign'] },
      text: '{fixer}: "I know a guy who knows a guy who has your opponent\'s divorce file. I\'m not saying use it. I\'m saying I know a guy."',
      options: [
        { label: '"Absolutely not."', effects: { capital: 1 }, cast: { fixer: -4, faith: 2 }, mem: 'turned down the divorce file' },
        { label: '"Find out what\'s in it."', chance: { p: 0.6, success: { oppFav: -3, outcome: 'Something in it checks out. Your allies leak it; your hands stay clean — for now.' }, fail: { scandal: { severity: 4, text: 'Campaign linked to leak of rival\'s private divorce records' }, outcome: 'The guy who knew a guy talked to a reporter.' } }, cast: { fixer: 6 } },
      ],
      ignore: { cast: { fixer: -1 } } },
    { id: 'invest_records', from: 'investigator', when: { phase: ['governing'] },
      text: '{investigator}: "I\'ve filed a records request for your office calendar. You can send it now, or my lawyers can talk to yours."',
      options: [
        { label: 'Release the calendar', effects: { media: 2, groups: { reform: 3 } }, cast: { investigator: 8 }, mem: 'released the office calendar voluntarily' },
        { label: 'Slow-walk the request', effects: { groups: { reform: -3 } }, cast: { investigator: -10 }, mem: 'slow-walked a records request', echo: { event: 'records_story', months: [3, 7], chance: 0.5 } },
      ],
      ignore: { cast: { investigator: -8 }, mem: 'ignored a records request', echo: { event: 'records_story', months: [3, 7], chance: 0.4 } } },
    { id: 'faith_vigil', from: 'faith', when: { phase: ['governing'] },
      text: '{faith}: "There was a shooting on Cass Street last night. We\'re holding a vigil. Come as a neighbor — no speech."',
      options: [
        { label: 'Attend quietly', effects: { approval: { all: 0.4 } }, cast: { faith: 10 }, mem: 'came to the vigil as a neighbor' },
        { label: 'Attend and speak about policy', effects: { approval: { base: 0.8, opp: -0.6 } }, cast: { faith: -4, activist: 4 }, mem: 'turned the vigil into a speech' },
      ],
      ignore: { cast: { faith: -10 }, effects: { approval: { all: -0.3 } }, mem: 'stayed away from the vigil' } },
    { id: 'labor_endorse', from: 'labor', when: { phase: ['campaign'] },
      text: '{labor}: "The executive board votes on endorsements Tuesday. Commit to our project labor agreement and you have my vote in the room."',
      options: [
        { label: 'Commit', effects: { groups: { labor: 5, chamber: -3 }, ground: 3 }, cast: { labor: 10, business: -5 }, mem: 'committed to the project labor agreement' },
        { label: 'Stay noncommittal', cast: { labor: -5 } },
      ],
      ignore: { cast: { labor: -6 } } },
    { id: 'biz_roundtable', from: 'business', when: { phase: ['campaign'] },
      text: '{business}: "Off-the-record roundtable with the members. No press. They want to hear you on permitting reform."',
      options: [
        { label: 'Promise faster permits', effects: { groups: { chamber: 4, environment: -3 }, cashPct: 0.03 }, cast: { business: 10, activist: -3 }, mem: 'promised faster permits' },
        { label: 'Listen, promise nothing', cast: { business: 2 } },
      ],
      ignore: { cast: { business: -5 } } },
    { id: 'mentor_advice', from: 'mentor', when: { phase: ['campaign'] },
      text: '{mentor}: "Turn off the TV ads for a week and go knock on doors yourself. People can smell a candidate who stopped listening."',
      options: [
        { label: 'Take the advice', effects: { ground: 2, momentum: 0.6 }, cast: { mentor: 6 }, mem: 'took the advice about knocking doors' },
        { label: '"Times have changed."', cast: { mentor: -5 }, mem: 'was told times have changed' },
      ],
      ignore: { cast: { mentor: -2 } } },
    // Party-founder phone calls.
    { id: 'p_donor_check', from: 'donor', when: { phase: ['party'] },
      text: '{donor}: "I\'ll write the {party} a big check. One condition: drop the plank on campaign finance limits. It\'s bad for business — mine."',
      options: [
        { label: 'Take the check, drop the plank', effects: { partyFunds: 45000, partyFav: -1.5 }, cast: { donor: 10, activist: -8 }, mem: 'dropped a plank for a check' },
        { label: '"Our platform isn\'t for sale."', effects: { partyFav: 0.8 }, cast: { donor: -10, activist: 6 }, mem: 'refused to trade a plank for money' },
      ],
      ignore: { cast: { donor: -5 } } },
    { id: 'p_reporter', from: 'reporter', when: { phase: ['party'] },
      text: '{reporter}: "Doing a \'can third parties ever win?\' explainer. Give me ten minutes and I\'ll make it fair."',
      options: [
        { label: 'Give the interview', effects: { partyRec: 2 }, cast: { reporter: 7 }, mem: 'gave the third-party interview' },
        { label: 'Send talking points', effects: { partyRec: 0.5 }, cast: { reporter: -1 } },
      ],
      ignore: { cast: { reporter: -5 }, mem: 'blew off the explainer' } },
    { id: 'p_boss_deal', from: 'boss', when: { phase: ['party'] },
      text: '{boss}: "Here\'s a deal. Your people stay out of the House race in the 4th, and nobody challenges your ballot petitions this year."',
      options: [
        { label: 'Take the deal', effects: { partyFav: -1 }, cast: { boss: 12, activist: -10 }, mem: 'cut a non-compete deal', flags: { set: ['petition_truce'] } },
        { label: '"See you in court."', cast: { boss: -10, activist: 6 }, mem: 'refused a back-room deal' },
      ],
      ignore: { cast: { boss: -4 } } },
    { id: 'p_activist_purity', from: 'activist', when: { phase: ['party'] },
      text: '{activist}: "Members are furious we recruited a former lobbyist for the state house race. Disavow or I can\'t hold the chapter together."',
      options: [
        { label: 'Back the recruit', effects: { partyMembers: -0.03 }, cast: { activist: -10 }, mem: 'stood by the ex-lobbyist recruit' },
        { label: 'Hold a members\' town hall', effects: { partyMembers: 0.01, partyFav: 0.5 }, cast: { activist: 6 }, mem: 'held a members\' town hall' },
      ],
      ignore: { cast: { activist: -6 }, effects: { partyMembers: -0.02 } } },
  ];
  PG.data.askById = Object.fromEntries(PG.data.asks.map((a) => [a.id, a]));
})(globalThis.PG = globalThis.PG || {});
