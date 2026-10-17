/* Storylines: scenarios that unfold over months or years. Each chapter is a decision.
 *   when:    { cond, levels, minMonths, weight } — cond uses PG.arcs.PRED names, "!name",
 *            { var, eq|gt|lt }, { cast, gt|lt }, { flag }, { any: [...] }, { not: ... }
 *   needs:   condition that must keep holding, or the story ends with `fizzle`
 *   pick:    random story variables, e.g. { company: [...] } → {company} in text
 *   pickIf:  [{ if, pick }] — conditional picks (applied after pick)
 *   stages:  { id: { speaker, title, text, variants: [{ if, text }], extra: [{ if, text }], choices } }
 *   choice:  { label, hint, if, requires: { capital, partyFunds, cond }, effects, cast: { role: n },
 *              mem, set: { var: v }, chance: { p, stat, mods: [{ if, add }], success, fail },
 *              next: 'stage' | { stage, months: [a, b] } | { roll: [{ stage, w, mods: [{ if, w }] }], months },
 *              end: 'outcome text', arc: 'another storyline to start later' }
 * Speakers are cast roles (data/cast.js). All companies and people are fictional. */
(function (PG) {
  'use strict';
  PG.data = PG.data || {};
  const NAMES = ['Dana Kincaid', 'Marcus Treadwell', 'Priya Haddad', 'Owen Redmond', 'Lucia Valdivia', 'Graham Ashby', 'Renee Calloway', 'Silas Upshaw'];

  PG.data.arcs = [
    // ------------------------------------------------------------------ the plant
    { id: 'plant', title: 'The Plant', icon: '🏭', summary: '{company} is leaving town — and everyone wants something from you.',
      when: { cond: ['governing', 'notSchool'], weight: 1.3 }, needs: 'governing', fizzle: 'You left office. Your successor inherited the empty plant.',
      pick: { company: ['Hollister Glass Works', 'Brandt Axle & Gear', 'Kessler Appliance', 'Northcott Paper Mill'], buyer: ['Zhenhua Industrial Group', 'Aldane Holdings', 'Meridian Sovereign Fund'], tech: ['Cobalt Cloud', 'Arcwave Data', 'Halcyon AI'] },
      start: 'announce',
      stages: {
        announce: { speaker: 'chief', title: '1,400 jobs',
          text: '"Boss, {company} just told the workers: the plant closes in nine months. 1,400 jobs. The parking lot is full of TV trucks. {labor} has called three times, and {business} says the company wants \'a conversation about incentives.\' Translation: they want money to stay."',
          choices: [
            { label: 'Offer a tax-incentive package', hint: 'Expensive; might keep the jobs — might not', effects: { budgetPct: -0.006, groups: { chamber: 4, taxpayers: -3 } }, cast: { business: 6, labor: 3 }, mem: 'offered {company} incentives', set: { deal: 'incentive' },
              next: { roll: [{ stage: 'stay', w: 1 }, { stage: 'clawback', w: 0.6 }], months: [3, 5] } },
            { label: 'Find a buyer for the plant', hint: 'Costs capital; buyers come with baggage', effects: { capital: -2 }, cast: { labor: 4 }, set: { deal: 'buyer' }, next: { stage: 'buyer', months: [3, 6] } },
            { label: 'Let the market work — fund retraining', hint: 'Fiscally clean; brutal for the town', effects: { budgetPct: -0.002, groups: { labor: -5, chamber: 2 }, approval: { blocs: { working: -1.5 } } }, cast: { labor: -8 }, mem: 'let {company} close', set: { deal: 'none' }, next: { stage: 'ghost', months: [8, 14] } },
          ] },
        stay: { speaker: 'chief', title: 'They stayed — mostly',
          text: '"{company} took the deal and stayed. They kept 900 jobs and replaced the other 500 with robots. The ribbon-cutting photo is fantastic. The clawback provisions are, let\'s say, aspirational."',
          choices: [
            { label: 'Take the victory lap', hint: 'Good for now', effects: { approval: { all: 1.2, blocs: { working: 1 } }, nameRec: 2 }, cast: { labor: 4 }, next: { stage: 'automation', months: [12, 20] } },
            { label: 'Stay quiet and watch them', effects: { approval: { all: 0.5 } }, cast: { investigator: 3 }, next: { stage: 'automation', months: [12, 20] } },
          ] },
        automation: { speaker: 'investigator', title: 'Round two of "efficiencies"',
          text: '"{investigator} here. {company} just announced another 400 layoffs — despite your incentive package. I\'m writing about what the clawbacks were worth. Are you enforcing them?"',
          choices: [
            { label: 'Enforce the clawback in court', hint: 'Recover money; businesses take note', effects: { budgetPct: 0.003, groups: { chamber: -6, labor: 4 }, approval: { blocs: { working: 1 } } }, cast: { business: -10, investigator: 6 },
              end: 'You got the money back; the company got lawyers. Every site-selection consultant in America now has your name on a list — some say "tough," some say "difficult."' },
            { label: 'Quietly renegotiate', hint: 'Keeps the peace; looks bad in print', effects: { scandal: { severity: 2, text: 'Questions over waived clawbacks for {company}' } }, cast: { business: 5, investigator: -8 },
              end: 'The renegotiation keeps 600 jobs. The headline says "waived."' },
          ] },
        clawback: { speaker: 'reporter', title: 'Paid to leave',
          text: '"{reporter} from {paper}. {company} cashed the first incentive check — then announced the move anyway. Our headline tomorrow is \'PAID TO LEAVE.\' Want to respond?"',
          choices: [
            { label: 'Sue to claw the money back', hint: 'Costs capital; wins working-class respect', effects: { capital: -2, budgetPct: 0.003, approval: { blocs: { working: 1 } } }, cast: { labor: 4 }, end: 'The suit drags on for years. Every hearing is a news story about how you fought back.' },
            { label: 'Blame the previous administration', hint: 'Base likes it; press doesn\'t', effects: { approval: { base: 0.5, opp: -1 }, media: -3 }, cast: { reporter: -5 }, end: 'Your predecessor writes an op-ed. Now it\'s a feud. The workers are still out of jobs.' },
            { label: 'Own the mistake', hint: 'Honest; voters rarely reward it', effects: { approval: { all: -0.6 }, media: 4 }, cast: { reporter: 8 }, end: '{reporter} wrote that you were the only person in the building who told the truth. It didn\'t poll well. It aged well.' },
          ] },
        buyer: { speaker: 'fixer', title: 'A buyer with baggage',
          text: '"Good news, bad news. {buyer} will buy the plant and keep every job. Bad news: the national-security crowd is calling them a front for a foreign government, and {rival} is drafting a press release as we speak."',
          choices: [
            { label: 'Champion the sale', hint: 'Jobs now; security hawks scream', effects: { approval: { blocs: { working: 2, sub_college: -0.5 } }, groups: { labor: 4, border_security: -4 } }, cast: { labor: 8, rival: -4 },
              next: { roll: [{ stage: 'review_ok', w: 1, mods: [{ if: 'presSameParty', w: 0.6 }] }, { stage: 'review_blocked', w: 0.9 }], months: [4, 7] } },
            { label: 'Ask for a security review first', hint: 'Prudent; the buyer may walk', cast: { fixer: -3 }, next: { stage: 'tech_buyer', months: [4, 8] } },
            { label: 'Kill the deal', hint: 'Sovereignty over jobs', effects: { approval: { base: 0.5, blocs: { working: -1.5 } }, groups: { labor: -6 } }, cast: { labor: -8 }, next: { stage: 'ghost', months: [8, 14] } },
          ] },
        review_ok: { speaker: 'chief', title: 'Sale cleared',
          text: '"Federal reviewers cleared the {buyer} sale. The plant reopens with a new sign and the same workers. {labor} sent a fruit basket. {rival} sent a press release."',
          choices: [
            { label: 'Throw a reopening rally', effects: { approval: { all: 1.5, blocs: { working: 1.5 } }, nameRec: 3 }, cast: { labor: 6 }, end: 'Jobs saved. Somewhere a cable host calls you "{buyer}\'s favorite politician." The workers do not care.' },
            { label: 'Keep it low-key', effects: { approval: { blocs: { working: 1 } } }, end: 'The plant hums. Nobody remembers the fight, which is the highest compliment in local politics.' },
          ] },
        review_blocked: { speaker: 'chief', title: 'Sale blocked',
          text: '"The review blocked the sale. {buyer} walked. The workers are back on the sidewalk, and they\'re asking what Plan B is."',
          choices: [
            { label: 'Call every company you know', hint: 'Keep looking', effects: { capital: -1 }, next: { stage: 'tech_buyer', months: [2, 4] } },
            { label: 'Accept it', effects: { approval: { blocs: { working: -1 } } }, next: { stage: 'ghost', months: [6, 12] } },
          ] },
        tech_buyer: { speaker: 'business', title: 'Six football fields of servers',
          text: '"{business} here. {tech} wants the site — not for manufacturing. A data center the size of six football fields. Sixty permanent jobs, a huge property-tax bill, and it will draw as much electricity as a small city."',
          choices: [
            { label: 'Roll out the red carpet', hint: 'Revenue now; grid strain later', effects: { budgetPct: 0.004, groups: { tech: 6, chamber: 3, labor: -2 } }, cast: { business: 6 }, set: { dc: 1 }, next: { stage: 'grid', months: [10, 16] } },
            { label: 'Make them pay for grid upgrades', hint: 'Policy check', chance: { p: 0.55, stat: 'policy',
              success: { effects: { budgetPct: 0.002, groups: { tech: 2, environment: 3 } }, set: { dc: 2 }, outcome: '{tech} grumbles and signs. You look like the adult in the room.', next: { stage: 'grid', months: [10, 16] } },
              fail: { effects: { groups: { tech: -5 } }, outcome: '{tech} builds in the next county instead.', next: { stage: 'ghost', months: [6, 10] } } } },
            { label: 'Say no — the town needs real jobs', effects: { approval: { blocs: { working: 0.5 } }, groups: { tech: -6 } }, next: { stage: 'ghost', months: [6, 12] } },
          ] },
        grid: { speaker: 'pollster', title: 'The weird part',
          text: '"Here\'s the weird part. The data center works. Tax revenue is up. But electric bills across the region are up 14% because the utility had to buy power for it — and voters are blaming you, not the utility."',
          variants: [{ if: { var: 'dc', eq: 2 }, text: '"Because you made {tech} pay for grid upgrades, bills only rose 3%. The utility one county over did the same deal without conditions and their officials are getting crushed. You look like a genius. Enjoy it, it\'s rare."' }],
          choices: [
            { label: 'Take a bow', if: { var: 'dc', eq: 2 }, effects: { approval: { all: 1.5 } }, end: 'A plant became a data center and nobody\'s bills exploded. You will cite this in every debate for ten years.' },
            { label: 'Push a rate freeze', if: { var: 'dc', eq: 1 }, hint: 'Popular; the utility defers maintenance', effects: { groups: { energy: -6 }, approval: { all: 1 }, budgetPct: -0.003 }, end: 'Bills froze. The utility postponed repairs. That will be someone\'s problem in a few years — possibly yours.' },
            { label: 'Explain the economics', if: { var: 'dc', eq: 1 }, hint: 'Policy check', chance: { p: 0.4, stat: 'policy', success: { effects: { approval: { blocs: { sub_college: 1 } } }, outcome: 'A few people get it.' }, fail: { effects: { approval: { all: -1 } }, outcome: 'Nobody has ever been comforted by a chart about load growth.' } }, end: 'Being right and being popular are different skills.' },
          ] },
        ghost: { speaker: 'faith', title: 'A year later',
          text: '"It has been a year since {company} closed. Three bars and the diner on Route 9 are gone. Calls to the crisis line are up by a third. People ask me what the plan is. I\'m asking you."',
          choices: [
            { label: 'Fund a recovery and retraining center', effects: { budgetPct: -0.004, outcomes: { health: 2 }, approval: { blocs: { working: 1 } } }, cast: { faith: 8 }, end: 'The center opens with a waiting list. Recovery is slow, but it has a front door.' },
            { label: 'Rezone the site for housing', effects: { outcomes: { housing: 2 }, groups: { developers: 5, neighborhood: -3 } }, cast: { business: 4 }, end: 'Townhomes rise where the furnaces were. The new neighbors vote differently than the old ones did.' },
            { label: '"There\'s only so much government can do."', effects: { approval: { blocs: { working: -1.5 } } }, cast: { faith: -8, rival: 3 }, end: 'The town shrinks a little more. {rival} visits the empty lot with a camera crew.' },
          ] },
      } },

    // ------------------------------------------------------------------ water
    { id: 'pipes', title: 'The Water Report', icon: '🚰', summary: 'A lead-testing report nobody outside your office has seen.',
      when: { cond: ['executive', { any: ['city', 'stateLevel'] }], weight: 1 }, needs: 'governing', fizzle: 'You left office; the pipes are your successor\'s now.',
      pick: { kid: ['Maya', 'Ava', 'Jasmine', 'Sofia', 'Zoe', 'Amara'] },
      start: 'results',
      stages: {
        results: { speaker: 'chief', title: 'Close the door',
          text: '"Close the door. The utility\'s lead tests came back: eleven percent of homes on the Eastside are over the federal action level. The report isn\'t public yet. The utility director wants to \'resample\' before anybody panics."',
          choices: [
            { label: 'Go public today', hint: 'Painful now; nothing to hide later', effects: { approval: { all: -1.2 }, media: 4, outcomes: { health: 1 } }, cast: { reporter: 6, chief: 2 }, set: { disclosed: 1 }, next: { stage: 'replace', months: [2, 3] } },
            { label: 'Quietly resample first', hint: 'Buys time — if nobody leaks', set: { hid: 1 }, next: { roll: [{ stage: 'whistle', w: 0.6, mods: [{ if: 'lowLoyalty', w: 1 }, { if: { cast: 'investigator', lt: -20 }, w: 0.4 }] }, { stage: 'resample_ok', w: 0.8 }], months: [3, 6] } },
            { label: 'Hand out filters and announce a "study"', hint: 'Half-measure', effects: { budgetPct: -0.001, approval: { all: -0.4 } }, next: { stage: 'replace', months: [3, 5] } },
          ] },
        whistle: { speaker: 'investigator', title: 'Someone talked',
          text: '"{investigator} here. I have the original report. Someone in your building gave it to me. The headline is \'Officials sat on lead results for months.\' Parents are lining up outside the water department with jugs. Comment?"',
          choices: [
            { label: 'Fire the utility director and apologize', effects: { approval: { all: -2.5 }, scandal: { severity: 3, text: 'Delay in disclosing lead test results' } }, cast: { investigator: 3 }, next: { stage: 'replace', months: [2, 4] } },
            { label: '"I was never told."', hint: 'Only works if the paper trail is murky', chance: { p: 0.35,
              success: { effects: { approval: { all: -1 } }, outcome: 'The paper trail is murky enough. Barely.' },
              fail: { effects: { scandal: { severity: 6, text: 'Cover-up of lead test results' }, approval: { all: -2 } }, cast: { chief: -10 }, outcome: 'Your chief\'s calendar shows the briefing. So does yours.' } }, next: { stage: 'replace', months: [2, 4] } },
          ] },
        resample_ok: { speaker: 'chief', title: 'Better numbers',
          text: '"The resample came back better — six percent, still over the line on a few blocks, but nothing like the first round. Nobody outside this building knows there was a first round."',
          choices: [
            { label: 'Disclose both rounds now', effects: { approval: { all: -0.5 }, media: 3 }, cast: { reporter: 4 }, next: { stage: 'replace', months: [2, 4] } },
            { label: 'Release only the new numbers', hint: 'Filing cabinets are forever', effects: { echo: { event: 'lead_report_leak', months: [12, 30], chance: 0.45 } }, end: 'The new numbers ran on page B6. The first report sits in a filing cabinet. Filing cabinets are forever.' },
          ] },
        replace: { speaker: 'chief', title: 'The expensive part',
          text: '"Now the expensive part: replacing the lead service lines. Eight thousand pipes. At the current pace, that\'s a decade."',
          choices: [
            { label: 'Borrow for a three-year blitz', hint: 'Big cost; big results', effects: { budgetPct: -0.01, outcomes: { health: 3, infrastructure: 3 }, approval: { all: 1 }, groups: { labor: 3 } }, next: { stage: 'kid', months: [12, 20] } },
            { label: 'Apply for federal money and wait', hint: 'Cheaper; depends on Washington', next: { roll: [{ stage: 'fed_money', w: 1, mods: [{ if: 'presSameParty', w: 0.8 }] }, { stage: 'fed_slow', w: 1 }], months: [5, 9] } },
            { label: 'Replace pipes as they break', hint: 'Cheap; the Eastside notices', effects: { budgetPct: -0.002, approval: { blocs: { black: -1, latino: -0.5 } } }, end: 'Some pipes will be replaced in 2051. The neighborhood notices exactly which ones.' },
          ] },
        fed_money: { speaker: 'chief', title: 'The grant came through',
          text: '"The federal grant came through. Full funding. And somehow {rival} is already at the ribbon cutting, holding the big scissors."',
          choices: [
            { label: 'Share the stage', effects: { approval: { all: 1 } }, cast: { rival: 5 }, end: 'The pipes go in. Two politicians smile in the same photo. Kids drink from the tap.' },
            { label: 'Make clear who did the work', effects: { nameRec: 2, approval: { base: 1 } }, cast: { rival: -6 }, end: 'You take the scissors. {rival} takes note.' },
          ] },
        fed_slow: { speaker: 'comms', title: 'Stuck in review',
          text: '"The federal application is stuck in review. Meanwhile Channel 7 is filming a mother bathing her toddler with bottled water. It\'s going to air tonight."',
          choices: [
            { label: 'Borrow for it after all', effects: { budgetPct: -0.009, outcomes: { health: 3 }, approval: { all: 0.8 } }, end: 'You stop waiting for Washington. The pipes go in. The grant arrives a year later and pays down the debt.' },
            { label: 'Keep waiting', effects: { approval: { all: -1.5 } }, end: 'The grant arrives eighteen months later. The footage arrived first.' },
          ] },
        kid: { speaker: 'faith', title: 'A letter',
          text: '"A girl from the Eastside, {kid}, wrote you a letter. Her blood-lead level is back to normal since the new pipes went in. She wants to know if she can meet you."',
          choices: [
            { label: 'Visit her school', effects: { approval: { all: 1 }, fav: 1 }, cast: { faith: 5 }, end: 'The photo hangs in her classroom. It will hang in your campaign office too.' },
            { label: 'Write back by hand', effects: { fav: 0.5 }, end: 'She keeps the letter in a shoebox. Years later she tells a reporter about it.' },
          ] },
      } },

    // ------------------------------------------------------------------ stadium
    { id: 'stadium', title: 'The Stadium', icon: '🏟️', summary: 'The {city} {pro} want a new stadium — paid for by taxpayers.',
      when: { cond: ['governing', { any: ['city', 'stateLevel'] }], weight: 0.9 }, needs: 'governing', fizzle: 'You left office before the stadium question was settled.',
      pick: { owner: ['Wendell Corcoran', 'Bitsy Fairbanks', 'Raymond Stanhope'], pro: ['Mavericks', 'Blaze', 'Gulls', 'Monarchs'], cost: ['$410,000', '$585,000', '$760,000'] },
      start: 'ask',
      stages: {
        ask: { speaker: 'business', title: 'Pay up or we move',
          text: '"{owner}, who owns the {city} {pro}, wants $600 million in public money for a new stadium — or the team moves to a city that will pay. Fans are frantic. Economists are nearly unanimous that stadiums rarely pay for themselves. Economists do not buy season tickets."',
          choices: [
            { label: 'Fund the stadium', hint: 'Fans cheer; taxpayers groan', effects: { budgetPct: -0.012, approval: { all: 1, blocs: { working: 1, young: 0.5 } }, groups: { taxpayers: -8, developers: 6 } }, cast: { business: 8 }, set: { funded: 1 },
              next: { roll: [{ stage: 'champs', w: 0.35, mods: [{ if: 'teamGood', w: 0.2 }] }, { stage: 'flop', w: 0.65 }], months: [14, 24] } },
            { label: 'Negotiate a community-benefits deal', hint: 'Policy check', chance: { p: 0.45, stat: 'policy',
              success: { effects: { budgetPct: -0.006, approval: { all: 0.6 }, groups: { taxpayers: -3, labor: 4 } }, set: { funded: 2 }, outcome: '{owner} takes half the money with strings: local hiring and a housing fund.',
                next: { roll: [{ stage: 'champs', w: 0.35 }, { stage: 'flop', w: 0.5 }], months: [14, 24] } },
              fail: { outcome: '{owner} calls it an insult and starts touring other cities.', next: { stage: 'leave', months: [4, 8] } } } },
            { label: 'Refuse', hint: 'Fiscal hawks cheer; fans don\'t', effects: { approval: { blocs: { working: -1, young: -1, sub_college: 0.5 } }, groups: { taxpayers: 6 } }, cast: { business: -6 }, next: { stage: 'leave', months: [4, 8] } },
          ] },
        champs: { speaker: 'comms', title: 'Champions',
          text: '"The {pro} just won the championship in their brand-new stadium. The parade goes right past your office. Research says approval ratings are about to do something irrational."',
          choices: [
            { label: 'Ride the parade float', effects: { approval: { all: 2.5 }, nameRec: 4 }, end: 'You will never pay for a drink in this city again. The bonds still have 28 years to run.' },
            { label: 'Stay modest', effects: { approval: { all: 1.2 } }, end: 'You let the players have the day. People notice that too.' },
          ] },
        flop: { speaker: 'investigator', title: 'The math',
          text: '"Two years in, the \'stadium district\' is a parking lot and one sports bar. Attendance is down. The bonds are not. By my math the public paid {cost} per new job. I\'m publishing Sunday."',
          choices: [
            { label: 'Renegotiate the lease', hint: 'Costs capital; recovers money', effects: { capital: -2, budgetPct: 0.003 }, cast: { business: -5 }, end: '{owner} agrees to pay more rent. The parking lot stays a parking lot.' },
            { label: 'Defend the investment', effects: { approval: { all: -1 } }, cast: { investigator: -4 }, end: 'History may vindicate you. Taxpayers will not wait for history.' },
          ] },
        leave: { speaker: 'reporter', title: 'They\'re gone',
          text: '"It\'s official: the {pro} are moving to a city that offered $900 million. {rival} is already cutting an ad: \'The leader who lost our team.\'"',
          choices: [
            { label: 'Hold firm on principle', effects: { approval: { blocs: { working: -1 } } }, cast: { reporter: 3 }, next: { stage: 'vindicated', months: [18, 30] } },
            { label: 'Land a minor-league team instead', effects: { budgetPct: -0.002, approval: { all: 0.6 } }, end: 'The {city} Mudcats sell out every Thursday. Dollar hot dog night becomes a civic institution.' },
          ] },
        vindicated: { speaker: 'pollster', title: 'Vindicated',
          text: '"Remember the city that took the {pro}? Their stadium bonds just got downgraded and their mayor is facing a recall. Your refusal is suddenly \'prudent stewardship.\'"',
          choices: [
            { label: 'Say "I told you so"', effects: { approval: { base: 1 } }, cast: { rival: -4 }, end: 'Satisfying. Not classy. Satisfying.' },
            { label: 'Say nothing, just smile', effects: { approval: { all: 0.8 } }, end: 'The editorial board says it for you.' },
          ] },
      } },

    // ------------------------------------------------------------------ investigation
    { id: 'thread', title: 'The Investigation', icon: '🔎', summary: '{investigator} is pulling on a thread connected to {firm}.',
      when: { cond: [{ any: ['governing', 'campaign'] }, 'notParty'], weight: 1.1 },
      pick: { firm: ['Pruitt Paving', 'Lockhart Development', 'Sorensen Medical Supply', 'Galloway Waste Services'] },
      start: 'inquiry',
      stages: {
        inquiry: { speaker: 'comms', title: 'A phone call',
          text: '"{investigator} called. They\'re asking about {firm} — owned by one of your donors — and the county contract it won last year. They want to know if you ever discussed it with the owner. Did you?"',
          choices: [
            { label: 'Cooperate fully', hint: 'Openness; no guarantees', effects: { media: 2 }, cast: { investigator: 8 }, next: { roll: [{ stage: 'cleared', w: 1, mods: [{ if: 'hasCommitments', w: -0.4 }] }, { stage: 'story', w: 0.7 }], months: [3, 6] } },
            { label: 'Stonewall', hint: 'They\'ll write it anyway', cast: { investigator: -12 }, next: { stage: 'story', months: [3, 6] } },
            { label: 'Leak your version to a friendly outlet', hint: 'Charisma check', chance: { p: 0.45, stat: 'charisma',
              success: { effects: { media: 1 }, outcome: 'Your version runs first. Theirs reads like a follow-up.', next: { stage: 'cleared', months: [3, 5] } },
              fail: { cast: { investigator: -8, reporter: -4 }, outcome: 'Leaking to a friendly outlet just told everyone where to look.', next: { stage: 'story', months: [2, 4] } } } },
          ] },
        cleared: { speaker: 'investigator', title: 'A one-day story',
          text: '"The story ran. {firm} won the contract fairly — but the piece notes the owner gave $40,000 to groups that supported you. It\'s a one-day story. Probably."',
          choices: [
            { label: 'Return the donations', effects: { cashPct: -0.03, groups: { reform: 5 } }, cast: { donor: -10 }, end: 'Clean hands, lighter wallet. {donor} noticed.' },
            { label: 'Move on', end: 'A one-day story. Unless someone remembers it in an ad.' },
          ] },
        story: { speaker: 'chief', title: 'Front page',
          text: '"Front page of {paper}: \'{firm}\'s Inside Track.\' Emails show our office pushed the county to \'expedite\' the contract. You don\'t remember the email. Your deputy says you were cc\'d."',
          choices: [
            { label: 'Release every email', hint: 'Transparency bleeds but heals', effects: { media: 2, groups: { reform: 4 }, scandal: { severity: 2.5, text: 'Emails on the {firm} contract' } },
              next: { roll: [{ stage: 'grandjury', w: 0.3, mods: [{ if: 'hasCommitments', w: 0.3 }] }, { stage: 'fades', w: 1 }], months: [4, 8] } },
            { label: 'Fire the deputy who sent it', hint: 'A scapegoat with a long memory', effects: { scandal: { severity: 2, text: 'Aide fired over {firm} emails' } }, cast: { chief: -10, comms: -4 },
              next: { roll: [{ stage: 'tellall', w: 0.5, mods: [{ if: 'lowLoyalty', w: 0.5 }] }, { stage: 'fades', w: 1 }], months: [6, 12] } },
            { label: 'Attack the paper as biased', hint: 'Base rallies; reporters dig', effects: { approval: { base: 1, blocs: { sub_college: -1 } }, scandal: { severity: 3.5, text: 'Feud with {paper} over {firm} contract' } }, cast: { reporter: -10, investigator: -10 },
              next: { roll: [{ stage: 'grandjury', w: 0.5 }, { stage: 'fades', w: 0.6 }], months: [4, 8] } },
          ] },
        grandjury: { speaker: 'chief', title: 'Subpoenas',
          text: '"A county grand jury subpoenaed {firm}\'s books. You\'re not a target — yet — but your name is in the paperwork, and lawyers bill by the hour."',
          choices: [
            { label: 'Hire a top defense lawyer', chance: { p: 0.75, mods: [{ if: 'hasCommitments', add: -0.2 }],
              success: { effects: { cashPct: -0.05 }, end: 'The owner of {firm} is indicted. You are not. The mugshot runs next to your old ribbon-cutting photo.' },
              fail: { effects: { cashPct: -0.05, scandal: { severity: 6, text: 'Named in {firm} corruption case' } }, end: 'You are named — not charged, but named. That word will follow you.' } } },
            { label: 'Cooperate as a witness', effects: { groups: { reform: 6 }, approval: { all: 0.5 } }, cast: { donor: -30 }, end: 'You testify. {donor} never speaks to you again. Prosecutors call you "forthcoming."' },
          ] },
        fades: { speaker: 'reporter', title: 'Saved by a raccoon',
          text: '"The {firm} story faded. Nothing personal — a councilman in the next county got caught smuggling a raccoon into a casino and that ate the whole news cycle."',
          choices: [{ label: 'Breathe', end: 'Saved by a raccoon. Politics is not a just world, but sometimes it is a funny one.' }] },
        tellall: { speaker: 'comms', title: 'The book',
          text: '"Your fired deputy has a book deal. Working title: \'Expedite: My Years Inside.\' Chapter seven is about you."',
          choices: [
            { label: 'Sue to block it', effects: { cashPct: -0.03, scandal: { severity: 2.5, text: 'Lawsuit to block former aide\'s book' } }, end: 'The lawsuit puts the book on the bestseller list. Trying to suppress something is the best way to publicize it.' },
            { label: 'Read it aloud on a podcast and laugh', chance: { p: 0.5, stat: 'charisma',
              success: { effects: { approval: { all: 0.5 }, nameRec: 2 }, end: 'You read the funniest chapter aloud. It works. People like a politician who can take a punch.' },
              fail: { effects: { scandal: { severity: 3, text: 'Former aide\'s tell-all' } }, end: 'You laugh at the wrong chapter.' } } },
          ] },
      } },

    // ------------------------------------------------------------------ the storm
    { id: 'storm', title: 'The Storm', icon: '🌀', summary: '{storm} — and the long tail of decisions after it.',
      when: { cond: ['governing', 'notSchool'], weight: 0.9 }, needs: 'governing', fizzle: 'You left office; your successor inherited {storm}\'s long tail.',
      pick: { storm: ['the Spring Floods', 'the Derecho', 'the Ice Storm', 'the River Crest'] },
      pickIf: [{ if: 'coastal', pick: { storm: ['Hurricane Delphine', 'Hurricane Marco', 'Hurricane Oriana', 'Tropical Storm Ines'] } }],
      start: 'warning',
      stages: {
        warning: { speaker: 'chief', title: 'Three days out',
          text: '"{storm} is three days out. Forecasters say it could be bad — or it could veer away. An early emergency declaration closes schools and businesses and costs millions. If it misses, you look hysterical. If it hits and you waited, you look like you didn\'t care."',
          choices: [
            { label: 'Declare an emergency now', hint: 'Costly insurance', effects: { budgetPct: -0.003 }, set: { early: 1 },
              next: { roll: [{ stage: 'hit_ready', w: 0.6 }, { stage: 'miss', w: 0.4 }], months: 1 } },
            { label: 'Wait for certainty', hint: 'Save money — gamble lives', set: { early: 0 },
              next: { roll: [{ stage: 'hit_late', w: 0.6 }, { stage: 'miss', w: 0.4 }], months: 1 } },
          ] },
        miss: { speaker: 'comms', title: 'It veered away',
          text: '"{storm} veered away. Nobody will ever know you gambled. {pollster} lit a candle anyway."',
          variants: [{ if: { var: 'early', eq: 1 }, text: '"{storm} veered away. Schools closed for nothing, {business} is furious about lost sales, and talk radio has a new nickname for you: \'Chicken Little.\'"' }],
          choices: [
            { label: 'Defend caution', if: { var: 'early', eq: 1 }, effects: { approval: { blocs: { sub_family: 0.5, working: -0.5 } }, groups: { chamber: -3 } }, end: 'Voters barely reward preparation and richly reward cleanup. You just paid the preparation bill.' },
            { label: 'Exhale', if: { var: 'early', eq: 0 }, end: 'Luck is not a strategy. It is, occasionally, a career.' },
          ] },
        hit_ready: { speaker: 'chief', title: 'It hit — and you were ready',
          text: '"{storm} hit hard. But the shelters were open and the roads were empty. No deaths. Damage is in the hundreds of millions, and every TV truck in the state is here."',
          choices: [
            { label: 'Request federal disaster aid', next: { roll: [{ stage: 'aid', w: 0.5, mods: [{ if: 'presSameParty', w: 0.5 }, { if: 'presIsPlayer', w: 3 }] }, { stage: 'aid_denied', w: 0.5 }], months: [1, 2] } },
            { label: 'Tour the damage in work boots', hint: 'Charisma check', chance: { p: 0.65, stat: 'charisma',
              success: { effects: { approval: { all: 1.8 } }, outcome: 'The photo of you hauling sandbags runs everywhere.' },
              fail: { effects: { approval: { all: -0.8 } }, outcome: 'Someone photographed your spotless boots next to a man who lost everything.' } },
              next: { roll: [{ stage: 'aid', w: 0.5, mods: [{ if: 'presSameParty', w: 0.5 }] }, { stage: 'aid_denied', w: 0.5 }], months: [1, 2] } },
          ] },
        hit_late: { speaker: 'chief', title: 'It hit — and people were on the roads',
          text: '"{storm} hit hard and people were still on the roads. Four deaths. Damage in the hundreds of millions. The question on every channel is the same: why did you wait?"',
          choices: [
            { label: 'Take responsibility', hint: 'Honest; painful', effects: { approval: { all: -1.5 }, media: 3 }, cast: { reporter: 4 }, next: { roll: [{ stage: 'aid', w: 0.5, mods: [{ if: 'presSameParty', w: 0.5 }] }, { stage: 'aid_denied', w: 0.5 }], months: [1, 2] } },
            { label: 'Blame the forecasters', effects: { approval: { all: -3 } }, cast: { reporter: -6 }, next: { roll: [{ stage: 'aid', w: 0.5, mods: [{ if: 'presSameParty', w: 0.5 }] }, { stage: 'aid_denied', w: 0.5 }], months: [1, 2] } },
          ] },
        aid: { speaker: 'chief', title: 'The contractors line up',
          text: '"Federal aid approved: 75 percent of rebuilding costs. Now the contractors are lining up — including {donor}\'s brother-in-law, who says he can start Monday with no bidding."',
          choices: [
            { label: 'Competitive bids only', hint: 'Slower; clean', effects: { budgetPct: -0.004, outcomes: { infrastructure: 3 }, groups: { reform: 3 } }, cast: { donor: -6 }, next: { stage: 'rebuild', months: [6, 10] } },
            { label: 'Emergency no-bid contracts', hint: 'Fast; risky', effects: { outcomes: { infrastructure: 4 }, approval: { all: 1 } }, cast: { donor: 8 }, next: { roll: [{ stage: 'audit', w: 0.6 }, { stage: 'rebuild', w: 0.6 }], months: [8, 14] } },
          ] },
        aid_denied: { speaker: 'comms', title: 'Denied',
          text: '"FEMA denied the request — damage \'does not exceed the per-capita threshold.\' {rival} says your application was sloppy. Washington says it\'s {state}\'s problem."',
          choices: [
            { label: 'Fund the rebuild ourselves', effects: { budgetPct: -0.012, outcomes: { infrastructure: 3 }, approval: { all: 1 } }, next: { stage: 'rebuild', months: [6, 10] } },
            { label: 'Appeal — and go on cable about it', chance: { p: 0.5, stat: 'charisma',
              success: { effects: { budgetPct: -0.003, approval: { base: 1 } }, outcome: 'The appeal wins partial aid. The cable hit made you a minor star.' },
              fail: { effects: { approval: { all: -1 } }, outcome: 'The appeal fails and the cable hit gets mocked.' } }, next: { stage: 'rebuild', months: [6, 10] } },
          ] },
        audit: { speaker: 'investigator', title: '$2.1 million in "debris consulting"',
          text: '"An audit of the storm contracts found the no-bid firm billed $2.1 million for \'debris consulting.\' The brother-in-law has a new boat. Comment?"',
          choices: [
            { label: 'Claw it back and cut ties', effects: { budgetPct: 0.002, scandal: { severity: 2, text: 'Storm contract overbilling' } }, cast: { donor: -15 }, next: { stage: 'rebuild', months: [4, 8] } },
            { label: 'Defend the speed of the cleanup', effects: { scandal: { severity: 4, text: 'No-bid storm contracts to donor\'s relative' } }, cast: { investigator: -6 }, next: { stage: 'rebuild', months: [4, 8] } },
          ] },
        rebuild: { speaker: 'faith', title: 'Build back where?',
          text: '"The neighborhoods that flooded worst want to rebuild exactly where they were. The engineers say the next storm will flood them again. A voluntary buyout would turn the lowest blocks into parkland. These families have lived here for three generations."',
          choices: [
            { label: 'Fund buyouts and managed retreat', hint: 'Unpopular now; pays off later', effects: { budgetPct: -0.006, outcomes: { environment: 2 }, approval: { blocs: { seniors: -1, rural: -0.5 } } }, cast: { faith: -3 }, set: { retreat: 1 }, next: { stage: 'nextstorm', months: [24, 40] } },
            { label: 'Rebuild in place — it\'s their home', effects: { approval: { all: 1 } }, cast: { faith: 6 }, set: { retreat: 0 }, next: { stage: 'nextstorm', months: [24, 40] } },
          ] },
        nextstorm: { speaker: 'pollster', title: 'Years later, another storm',
          text: '"Another storm. The rebuilt blocks flooded again — worse. Same streets, same families, same TV trucks, and the same question."',
          variants: [{ if: { var: 'retreat', eq: 1 }, text: '"Another storm. The bought-out blocks flooded — and nobody lived there anymore. The park is under water; the people are dry. Even your critics noticed."' }],
          choices: [
            { label: 'Take quiet credit', if: { var: 'retreat', eq: 1 }, effects: { approval: { all: 2 } }, end: 'Preparedness rarely wins votes. This time it did, a little.' },
            { label: 'Rebuild again', if: { var: 'retreat', eq: 0 }, effects: { budgetPct: -0.006, approval: { all: -1 } }, end: 'You rebuild. Everyone knows how this story goes.' },
            { label: 'Offer the buyouts now', if: { var: 'retreat', eq: 0 }, effects: { budgetPct: -0.006 }, cast: { faith: 4 }, end: 'The second time, more families take the buyout. The river keeps the land.' },
          ] },
      } },

    // ------------------------------------------------------------------ the staffer
    { id: 'staffer', title: 'The Old Post', icon: '😬', summary: 'Something {comms} wrote years ago has resurfaced.',
      when: { cond: [{ any: ['governing', 'campaign'] }], weight: 0.9 },
      start: 'allegation',
      stages: {
        allegation: { speaker: 'chief', title: 'It\'s trending',
          text: '"Bad news about {comms}. A post from nine years ago resurfaced — a crude joke about a fallen soldier\'s family. It\'s trending. {comms} is mortified and has offered to resign."',
          choices: [
            { label: 'Accept the resignation', hint: 'Clean break; lose a talented aide', effects: { approval: { all: 0.3 }, replace: 'comms' }, cast: { chief: -3 }, end: '{comms} clears out their desk at night. A new communications director starts Monday.' },
            { label: 'Stand by them', hint: 'Loyalty earns loyalty — if it blows over', chance: { p: 0.55,
              success: { effects: { approval: { base: 0.5 } }, cast: { comms: 20 }, outcome: 'The story burns out in three days. {comms} will run through walls for you now.' },
              fail: { effects: { scandal: { severity: 3, text: 'Aide\'s offensive old posts' } }, cast: { comms: 15 }, outcome: 'A second post surfaces. Then a third.' } }, end: 'Loyalty is a currency. You spent some.' },
            { label: 'Suspend pending a review', cast: { comms: -6 }, next: { stage: 'review', months: [1, 2] } },
          ] },
        review: { speaker: 'chief', title: 'The review',
          text: '"The review is done. The post was nine years ago, {comms} apologized privately to the family, and the family accepted. Do we bring them back?"',
          choices: [
            { label: 'Reinstate', cast: { comms: 10 }, end: '{comms} returns quieter and sharper. People can change; sometimes politics lets them.' },
            { label: 'Let them go', effects: { replace: 'comms' }, cast: { chief: -3 }, end: 'The review cleared them; you let them go anyway. The rest of your staff notices.' },
          ] },
      } },

    // ------------------------------------------------------------------ the challenger
    { id: 'challenger', title: 'The Challenger', icon: '🥊', summary: 'Your base is shopping for someone to replace you: {challenger}.',
      when: { cond: ['governing', 'partisan', 'majorParty', { cast: 'activist', lt: 15 }], minMonths: 8, weight: 1.2 }, needs: 'governing',
      pick: { challenger: NAMES },
      start: 'rumble',
      stages: {
        rumble: { speaker: 'activist', title: 'People are talking',
          text: '"People are talking. They say you\'ve gone soft. A young prosecutor named {challenger} is taking meetings with our members. I\'m not threatening you. I\'m telling you what I hear."',
          choices: [
            { label: 'Give the base what it wants', hint: 'Calms the base; swing voters notice', effects: { approval: { base: 1.5, swing: -0.8 }, threat: -0.12 }, cast: { activist: 12 }, end: 'The talk dies down. Your swing voters noticed the pivot, though.' },
            { label: 'Ask {boss} to clear the field', hint: 'Better if the boss likes you', chance: { p: 0.5, mods: [{ if: { cast: 'boss', gt: 20 }, add: 0.25 }],
              success: { effects: { threat: -0.2, partyRel: -4 }, cast: { boss: -8 }, end: '{challenger} gets offered a judgeship and suddenly loves the bench.' },
              fail: { effects: { threat: 0.15 }, cast: { activist: -10 }, outcome: '{challenger} tells the press the party tried to buy them off.', next: { stage: 'launch', months: [2, 4] } } } },
            { label: 'Ignore it', next: { roll: [{ stage: 'launch', w: 0.7 }, { stage: 'nochallenge', w: 0.5 }], months: [4, 8] } },
          ] },
        launch: { speaker: 'reporter', title: 'The launch',
          text: '"{challenger} just launched a primary challenge against you — standing in front of your district office. The crowd was small but loud, and two national groups pledged money. What\'s your response?"',
          choices: [
            { label: 'Bury them early with money', hint: 'Expensive; effective', effects: { threat: -0.06, cashPct: -0.04, approval: { base: -0.3 } }, cast: { activist: -5 }, end: 'You bury {challenger} under mailers. It mostly works. The base notices you spent its money on a civil war.' },
            { label: 'Run on your record', effects: { threat: 0.15, approval: { swing: 0.5 } }, end: 'The challenge is real. It will be on the ballot.' },
            { label: 'Steal their best issue', effects: { threat: -0.1, approval: { base: 1, swing: -0.5 } }, cast: { activist: 6 }, end: '{challenger} complains you stole their platform. That\'s the point.' },
          ] },
        nochallenge: { speaker: 'pollster', title: 'They passed',
          text: '"{challenger} decided not to run — took a job at a big law firm instead. The base is still grumpy, but grumpy isn\'t organized."',
          choices: [{ label: 'Good', end: 'No challenge this time. The grumbling stays in a drawer, ready for next time.' }] },
      } },

    // ------------------------------------------------------------------ the kingmaker
    { id: 'kingmaker', title: 'The Kingmaker\'s Price', icon: '🎩', summary: '{boss} can clear your path — for a price.',
      when: { cond: ['career', 'majorParty'], weight: 1.2 },
      pick: { crony: ['Harold Lockhart', 'Bennett Pruitt', 'Gideon Fenwick', 'Warren Tolliver'] },
      start: 'offer',
      stages: {
        offer: { speaker: 'boss', title: 'The diner',
          text: '{boss} slides a laminated menu across the diner table. "You want to run, I can clear the field. All it costs is your endorsement for my guy, {crony}, for county judge. Good guy. Mostly."',
          choices: [
            { label: 'Take the deal', hint: 'Party support now; a debt later', effects: { partyRel: 8, flags: { set: ['boss_deal'] } }, cast: { boss: 15 }, next: { roll: [{ stage: 'crony_bad', w: 0.5 }, { stage: 'crony_fine', w: 0.5 }], months: [12, 30] } },
            { label: 'Decline politely', cast: { boss: -10 }, end: '"Your funeral," says {boss}, and picks up the check. That\'s a bad sign. {boss} never picks up the check.' },
            { label: 'Decline — and tell {reporter} about the offer', effects: { media: 4, groups: { reform: 5 }, partyRel: -6 }, cast: { boss: -25, reporter: 10 }, end: 'The story runs. Reformers love you. The party machinery will remember this for a decade.' },
          ] },
        crony_bad: { speaker: 'investigator', title: 'Paragraph two',
          text: '"Judge {crony} was arrested this morning — accused of taking kickbacks from a bail-bond company. Every story mentions who endorsed him. Your name is in paragraph two."',
          choices: [
            { label: 'Denounce him loudly', effects: { scandal: { severity: 2, text: 'Endorsed now-indicted Judge {crony}' } }, cast: { boss: -15 }, end: 'You denounce him. {boss} calls it betrayal. Voters call it the least you could do.' },
            { label: 'Say nothing', effects: { scandal: { severity: 3.5, text: 'Silence on indicted Judge {crony}' } }, end: 'Silence reads as guilt. It usually does.' },
          ] },
        crony_fine: { speaker: 'boss', title: 'A team player',
          text: '"{crony} turned out to be a decent judge. I\'m telling everyone you\'re a team player. That\'s worth something at the next convention."',
          choices: [{ label: 'Bank it', effects: { partyRel: 4 }, cast: { boss: 5 }, end: 'Not every deal goes bad. This one just made you part of the machine.' }] },
      } },

    // ------------------------------------------------------------------ crypto
    { id: 'crypto', title: 'The Crypto Prince', icon: '🪙', summary: '{prince} of {exchange} wants to fund your career.',
      when: { cond: [{ any: ['campaign', 'governing'] }, 'notParty'], weight: 0.7 },
      pick: { prince: ['Tobias Wexler', 'Caleb Yardley', 'Felix Northcott'], exchange: ['CoinVault', 'HashHarbor', 'Lumen Exchange'] },
      start: 'offer',
      stages: {
        offer: { speaker: 'donor', title: 'Cargo shorts',
          text: '{donor} introduces you to a 29-year-old in cargo shorts: {prince}, founder of {exchange}. He wants to fund a super PAC supporting you — eight figures — and asks only that you "keep an open mind" about digital-asset regulation.',
          choices: [
            { label: 'Take the support', hint: 'Huge money; huge exposure', effects: { cashPct: 0.12, groups: { tech: 5, reform: -5 } }, cast: { donor: 6 }, next: { roll: [{ stage: 'collapse', w: 0.7 }, { stage: 'boom', w: 0.3 }], months: [8, 18] } },
            { label: 'Decline', effects: { groups: { reform: 3 } }, end: '{prince} funds your opponent instead. Funny how that works.' },
          ] },
        collapse: { speaker: 'investigator', title: 'Overnight',
          text: '"{exchange} collapsed overnight. Customer funds are missing. {prince} is under house arrest and every dollar he gave is radioactive. Will you return his money?"',
          choices: [
            { label: 'Donate it all to the victims', effects: { cashPct: -0.1, groups: { reform: 5 }, media: 3 }, end: 'Expensive decency. The ads your opponent prepared are now useless.' },
            { label: 'Keep it — it\'s legally spent', effects: { scandal: { severity: 4.5, text: 'Took millions tied to collapsed {exchange}' } }, end: 'Legal. Not survivable in a thirty-second ad.' },
          ] },
        boom: { speaker: 'pollster', title: 'Plot twist',
          text: '"Plot twist: {exchange} didn\'t collapse. It went public. {prince} is a billionaire and wants to host your next fundraiser on his yacht."',
          choices: [
            { label: 'Go to the yacht', effects: { cashPct: 0.08, approval: { blocs: { working: -0.8 } } }, end: 'A photo of you on the yacht becomes your opponent\'s favorite picture.' },
            { label: 'Politely decline', end: 'You keep your distance. Sometimes the bubble doesn\'t pop — yet.' },
          ] },
      } },

    // ------------------------------------------------------------------ the clip
    { id: 'clip', title: 'The Clip', icon: '📱', summary: '"{quote}" — you, with your mouth full of pie.',
      when: { cond: [{ any: ['campaign', 'governing'] }], weight: 1 },
      pick: { quote: ['Honestly? The pie is the policy.', 'I\'m not a robot, I just talk like one.', 'Let\'s circle back on the gravy situation.', 'Every pothole is personal.'] },
      start: 'viral',
      stages: {
        viral: { speaker: 'comms', title: 'Four million views',
          text: '"A diner patron filmed you saying \'{quote}\' with your mouth full of pie. It has four million views. Half the internet thinks it\'s cringe. The other half turned it into a song."',
          choices: [
            { label: 'Embrace it — sell the T-shirts', hint: 'Fame and money; risks being a joke', effects: { cashPct: 0.04, nameRec: 6, fav: -0.5 }, next: { roll: [{ stage: 'brand', w: 0.6 }, { stage: 'attack', w: 0.4 }], months: [4, 9] } },
            { label: 'Apologize', effects: { media: -1, fav: -0.5 }, end: 'Apologizing for a pie joke becomes its own joke. The song gets a second verse.' },
            { label: 'Ignore it', effects: { nameRec: 3 }, end: 'The clip fades in a week. Your aunt still sends it to you every Thanksgiving.' },
          ] },
        brand: { speaker: 'comms', title: 'You\'re a brand now',
          text: '"The \'{quote}\' shirts are everywhere. A brewery named a beer after it. Young voters who couldn\'t name their own council member can name you."',
          choices: [
            { label: 'Lean all the way in', effects: { approval: { blocs: { young: 2 } }, nameRec: 4 }, end: 'You are now, irreversibly, The Pie Politician. Worse things have won elections.' },
            { label: 'Pivot to serious', effects: { approval: { blocs: { sub_college: 0.5 } } }, end: 'You retire the shirt. The brewery keeps the beer.' },
          ] },
        attack: { speaker: 'reporter', title: '"Fun guy. Bad job."',
          text: '"{rival}\'s allies cut an ad: your clip, intercut with your missed votes. Tagline: \'Fun guy. Bad job.\' Response?"',
          choices: [
            { label: 'Fire back with your record', chance: { p: 0.55, stat: 'policy', success: { effects: { approval: { swing: 0.8 } }, outcome: 'Your record holds up.' }, fail: { effects: { approval: { all: -0.8 } }, outcome: 'The ad sticks.' } }, end: 'The ad war moves on.' },
            { label: 'Make a funnier clip', chance: { p: 0.5, stat: 'charisma', success: { effects: { nameRec: 3, approval: { blocs: { young: 1.5 } } }, outcome: 'Round two goes viral too.' }, fail: { effects: { fav: -1.5 }, outcome: 'Trying to go viral on purpose never works.' } }, end: 'The internet giveth. The internet taketh away.' },
          ] },
      } },

    // ------------------------------------------------------------------ ballot measure
    { id: 'measure', title: 'The Ballot Measure', icon: '🗳️', summary: 'A citizens\' initiative to {measure} is headed for the ballot.',
      when: { cond: ['governing', 'notSchool'], weight: 0.8 },
      pick: { measure: ['raise the minimum wage to $18', 'adopt ranked-choice voting', 'legalize recreational marijuana', 'cap property-tax increases at 2%', 'require photo ID to vote', 'ban new natural-gas hookups'] },
      start: 'qualify',
      stages: {
        qualify: { speaker: 'pollster', title: 'It qualified',
          text: '"A citizens\' initiative to {measure} just qualified for the November ballot. It\'s polling at 58 percent. Your base is split. Both sides want your endorsement — and measures like this drive turnout among the people who care about them."',
          choices: [
            { label: 'Endorse Yes', effects: { approval: { base: 0.5, swing: 0.3, opp: -0.5 } }, cast: { activist: 5 }, set: { side: 'yes' }, next: { roll: [{ stage: 'passed', w: 0.65 }, { stage: 'failed', w: 0.35 }], months: [5, 8] } },
            { label: 'Endorse No', effects: { approval: { base: -0.5, swing: 0.2, opp: 0.5 } }, cast: { business: 4 }, set: { side: 'no' }, next: { roll: [{ stage: 'passed', w: 0.55 }, { stage: 'failed', w: 0.45 }], months: [5, 8] } },
            { label: 'Stay neutral', effects: { approval: { all: -0.2 } }, cast: { activist: -4 }, set: { side: 'none' }, next: { roll: [{ stage: 'passed', w: 0.6 }, { stage: 'failed', w: 0.4 }], months: [5, 8] } },
          ] },
        passed: { speaker: 'reporter', title: 'It passed',
          text: '"The measure to {measure} passed, 56 to 44. Both sides noted you hid under your desk."',
          variants: [
            { if: { var: 'side', eq: 'yes' }, text: '"The measure to {measure} passed, 56 to 44. You were on the winning side — and the Yes campaign\'s turnout operation brought out your voters too."' },
            { if: { var: 'side', eq: 'no' }, text: '"The measure to {measure} passed, 56 to 44, despite your opposition. Now you have to implement a law you campaigned against."' },
          ],
          choices: [
            { label: 'Implement it faithfully', effects: { approval: { all: 0.5 } }, end: 'The voters spoke. You listened. That is the job.' },
            { label: 'Drag your feet', if: { var: 'side', eq: 'no' }, effects: { approval: { base: 0.5, opp: -1.5 }, groups: { reform: -4 } }, end: 'Courts will eventually make you do it anyway. The delay becomes a campaign issue.' },
          ] },
        failed: { speaker: 'reporter', title: 'It failed',
          text: '"The measure to {measure} failed, 47 to 53. Late money flooded in against it. Neither side is thanking you."',
          variants: [
            { if: { var: 'side', eq: 'yes' }, text: '"The measure to {measure} failed, 47 to 53, after a late flood of money against it. You backed the losing side, and its supporters want to know what you\'ll do now."' },
            { if: { var: 'side', eq: 'no' }, text: '"The measure to {measure} failed, 47 to 53. Your side won — and the losers have long memories."' },
          ],
          choices: [
            { label: 'Promise a legislative version', if: { var: 'side', eq: 'yes' }, effects: { approval: { base: 1 }, capital: -1 }, cast: { activist: 6 }, end: 'Ballot measures that lose often come back as bills. This one will.' },
            { label: 'Move on', end: 'Direct democracy has spoken. It will speak again in two years.' },
          ] },
      } },

    // ------------------------------------------------------------------ sharks
    { id: 'sharks', title: 'Shark Summer', icon: '🦈', summary: 'Shark bites at {beach} — and voters who blame you for them.',
      when: { cond: ['governing', 'coastal', 'summer', { any: ['city', 'stateLevel'] }], weight: 0.7 }, needs: 'governing',
      pick: { beach: ['Gull Point', 'Sandpiper Beach', 'Harbor Cove', 'Pelican Shoals'] },
      start: 'attacks',
      stages: {
        attacks: { speaker: 'chief', title: 'Three bites',
          text: '"Three shark bites in two weeks at {beach}. Nobody died, but tourist bookings are down 30 percent, the motel owners are panicking, and — I\'m not making this up — there\'s political-science research saying voters punish incumbents for shark attacks."',
          choices: [
            { label: 'Close the beaches', hint: 'Safe; kills the summer economy', effects: { budgetPct: -0.002, approval: { blocs: { working: -1 } }, groups: { small_biz: -5 }, outcomes: { safety: 2 } }, next: { stage: 'season_end', months: [2, 3] } },
            { label: 'Keep them open with patrols', hint: 'Gamble', effects: { budgetPct: -0.001 }, chance: { p: 0.7, success: { outcome: 'No more bites. The beach stays open.' }, fail: { effects: { approval: { all: -2 } }, outcome: 'A fourth bite — on camera.' } }, next: { stage: 'season_end', months: [2, 3] } },
            { label: 'Appoint a "Shark Czar"', hint: 'Charisma check; weird', chance: { p: 0.5, stat: 'charisma', success: { effects: { approval: { all: 0.8 }, nameRec: 3 }, outcome: 'The Shark Czar becomes a beloved local celebrity with a catchphrase.' }, fail: { effects: { approval: { all: -1 } }, outcome: 'The Shark Czar is a punchline on late-night TV.' } }, next: { stage: 'season_end', months: [2, 3] } },
          ] },
        season_end: { speaker: 'pollster', title: 'Summer\'s over',
          text: '"Summer\'s over. Tourism took a hit no matter what you did, and your numbers in the beach towns dipped. The sharks, for the record, are not registered to vote."',
          choices: [
            { label: 'Fund a tourism comeback campaign', effects: { budgetPct: -0.002, approval: { all: 0.5 } }, end: 'Voters blame leaders for things nobody controls. Research says so. It was never fair.' },
            { label: 'Move on', effects: { approval: { all: -0.3 } }, end: 'Next summer the sharks are elsewhere. Nobody gives you credit for that either.' },
          ] },
      } },

    // ------------------------------------------------------------------ gas
    { id: 'gasprice', title: 'Four-Dollar Gas', icon: '⛽', summary: 'Gas is ${gas} and voters want someone to blame.',
      when: { cond: ['governing', 'highGas'], weight: 3 }, needs: 'governing',
      start: 'spike',
      stages: {
        spike: { speaker: 'pollster', title: 'You don\'t control oil prices',
          text: '"Gas is ${gas} a gallon. You have zero control over global oil markets. Your approval is down anyway. The other side is proposing a gas-tax holiday that would save drivers maybe 18 cents a gallon. Maybe."',
          choices: [
            { label: 'Back a gas-tax holiday', hint: 'Popular; mostly symbolic', effects: { budgetPct: -0.004, approval: { all: 0.8 }, outcomes: { infrastructure: -1.5 }, groups: { environment: -4 } }, end: 'Economists say much of the holiday went to oil-company margins. Drivers say thanks anyway. The roads say nothing — yet.' },
            { label: 'Explain who actually sets oil prices', hint: 'Policy check', chance: { p: 0.35, stat: 'policy', success: { effects: { approval: { blocs: { sub_college: 0.8 } } }, outcome: 'A few people appreciate the honesty.' }, fail: { effects: { approval: { all: -0.8 } }, outcome: 'Voters at the pump do not want an economics lecture.' } }, end: 'Being right and being reelected are different skills.' },
            { label: 'Blame the other party', effects: { approval: { base: 1, opp: -1 } }, end: 'Your base agrees. Gas is still expensive.' },
          ] },
      } },

    // ------------------------------------------------------------------ mentor
    { id: 'mentorfavor', title: 'The Last Favor', icon: '🧓', summary: '{mentor} has never asked for anything. Until now.',
      when: { cond: ['governing', { cast: 'mentor', gt: 30 }], minMonths: 10, weight: 0.6 },
      start: 'ask',
      stages: {
        ask: { speaker: 'mentor', title: 'One call',
          text: '{mentor} asks to meet at the old diner. "I\'ve never asked you for anything. My granddaughter\'s school is about to lose its permit over paperwork. One call from you would save it. One call."',
          choices: [
            { label: 'Make the call', hint: 'Loyalty; looks like favoritism', cast: { mentor: 15 }, mem: 'made the call for the school', next: { roll: [{ stage: 'story', w: 0.4, mods: [{ if: { cast: 'investigator', lt: -20 }, w: 0.4 }] }, { stage: 'fine', w: 0.6 }], months: [4, 10] } },
            { label: '"I can\'t, and you know why."', cast: { mentor: -25 }, effects: { groups: { reform: 2 } }, mem: 'refused the one favor', next: { stage: 'hurt', months: [6, 12] } },
          ] },
        story: { speaker: 'investigator', title: '"Care to comment?"',
          text: '"Sources say you personally intervened to save a school tied to your mentor\'s family. Care to comment?"',
          choices: [
            { label: 'Tell the truth: it was loyalty', effects: { scandal: { severity: 2, text: 'Intervened for mentor\'s family school' } }, cast: { investigator: 3 }, end: 'People understand loyalty. They just don\'t like it in their government.' },
            { label: 'Deny it', chance: { p: 0.4, success: { outcome: 'The story can\'t be confirmed.' }, fail: { effects: { scandal: { severity: 4, text: 'Misled press on mentor favor' } }, outcome: 'The phone records confirm it.' } }, end: 'Truth is a renewable resource; credibility isn\'t.' },
          ] },
        fine: { speaker: 'mentor', title: 'A note',
          text: 'The school kept its permit. {mentor} sends a handwritten note: "You\'re still the kid I met."',
          choices: [{ label: 'Keep the note', end: 'You keep it in your desk drawer, under the budget books.' }] },
        hurt: { speaker: 'mentor', title: 'A card',
          text: '{mentor} skipped your birthday. Then, months later, a card arrives: "You were right. I hate that you were right. Proud of you."',
          choices: [{ label: 'Call them', cast: { mentor: 22 }, mem: 'called after the card', end: 'You talk for two hours. Neither of you mentions the school.' }] },
      } },

    // ------------------------------------------------------------------ the leak
    { id: 'leak', title: 'The Leak', icon: '🕳️', summary: 'Someone inside your office is talking to {paper}.',
      when: { cond: ['governing', 'lowLoyalty'], weight: 2.5 },
      start: 'leak',
      stages: {
        leak: { speaker: 'reporter', title: 'The memo',
          text: '"{reporter} from {paper}. We have your internal memo ranking your own colleagues by \'usefulness.\' Somebody in your office sent it. I\'m running it tomorrow. Want to comment?"',
          choices: [
            { label: 'Hunt down the leaker', chance: { p: 0.5,
              success: { effects: { legRel: -6 }, cast: { chief: 5 }, outcome: 'You find the leaker — a junior aide. Morale drops; the leaks stop.' },
              fail: { effects: { legRel: -6 }, cast: { chief: -10, comms: -10 }, outcome: 'The witch hunt itself leaks.' } }, end: 'Colleagues read the memo. Some laugh. Most file it away.' },
            { label: 'Own the memo with humor', chance: { p: 0.5, stat: 'charisma',
              success: { effects: { legRel: -2, approval: { all: 0.3 } }, outcome: 'You call yourself "useful-ish" in a floor speech. Colleagues laugh — mostly.' },
              fail: { effects: { legRel: -8 }, outcome: 'Colleagues are not amused.' } }, end: 'The memo becomes a running joke. Mostly at your expense.' },
            { label: 'Fix morale: raises and a real day off', effects: { budgetPct: -0.0008, legRel: -5 }, cast: { chief: 12, comms: 12 }, end: 'The leak runs, but the next one never comes. Happy staff don\'t leak.' },
          ] },
      } },

    // ------------------------------------------------------------------ the pothole
    { id: 'gary', title: 'The Pothole Named Gary', icon: '🕳️', summary: 'A pothole has become a local celebrity.',
      when: { cond: ['governing', { any: ['city', 'local'] }], weight: 0.7 },
      start: 'named',
      stages: {
        named: { speaker: 'comms', title: 'Gary',
          text: '"A pothole on 5th Street now has a name — Gary — an Instagram account with 40,000 followers, and a birthday party planned for Saturday. People are bringing cake. To a pothole."',
          choices: [
            { label: 'Fill Gary immediately', effects: { outcomes: { infrastructure: 0.5 }, approval: { all: 0.3, blocs: { young: -0.5 } } }, end: 'You fill Gary. The internet mourns. A candlelight vigil is held. You are briefly the villain in a story about a hole.' },
            { label: 'Attend Gary\'s birthday, then fill it', hint: 'Charisma check', chance: { p: 0.6, stat: 'charisma',
              success: { effects: { nameRec: 4, approval: { all: 0.5, blocs: { young: 1.5 } } }, outcome: 'You bring a shovel and a cake. It\'s perfect.' },
              fail: { effects: { fav: -1 }, outcome: 'You trip into Gary on camera.' } }, end: 'Gary is filled. Gary is remembered.' },
            { label: 'Launch the "Gary Act" — a citywide pothole blitz', effects: { budgetPct: -0.002, outcomes: { infrastructure: 2 }, approval: { all: 0.8 } }, end: 'The Gary Act fills 3,000 potholes. Gary himself is preserved behind a little fence with a plaque.' },
          ] },
      } },

    // ------------------------------------------------------------------ rival's ask
    { id: 'rivaldeal', title: 'The Rival\'s Offer', icon: '⚔️', summary: '{rival} wants a truce — on their terms.',
      when: { cond: ['notParty', 'rivalInOffice', { any: ['governing', 'career'] }], weight: 0.9 },
      pick: { topic: ['police body cameras', 'property-tax relief', 'a new trade school', 'rural broadband'] },
      start: 'ask',
      stages: {
        ask: { speaker: 'rival', title: 'A truce',
          text: '{rival} catches you in a hallway. "Let\'s bury the hatchet — or at least move it. Back my bill on {topic} and I\'ll stay out of your way next cycle. Cross me, and I\'ll find a primary opponent for you myself."',
          choices: [
            { label: 'Back the bill', hint: 'A truce — maybe', effects: { capital: -2 }, cast: { rival: 20 }, next: { roll: [{ stage: 'keeps', w: 0.65 }, { stage: 'betrays', w: 0.35 }], months: [10, 18] } },
            { label: 'Refuse', effects: { threat: 0.1 }, cast: { rival: -15 }, end: '{rival} smiles the way animals smile in nature documentaries right before something gets eaten.' },
          ] },
        keeps: { speaker: 'rival', title: 'A word kept',
          text: '{rival} kept their word: stayed out of your race and even said something nice about you on the radio. It sounded like it physically hurt.',
          choices: [{ label: 'Return the courtesy', cast: { rival: 5 }, end: 'Not friends. Something better in politics: predictable.' }] },
        betrays: { speaker: 'reporter', title: '"Nothing personal"',
          text: '"{rival} just endorsed your opponent. \'Nothing personal,\' they told me. Is it personal?"',
          choices: [
            { label: 'Go public with the deal', effects: { approval: { base: 0.5 } }, cast: { reporter: 5, rival: -25 }, end: 'Everyone learns that {rival} breaks deals. That is worth more than an endorsement.' },
            { label: 'Say nothing. Remember everything.', cast: { rival: -30 }, end: 'You add a page to the binder.' },
          ] },
      } },

    // ------------------------------------------------------------------ court shockwave
    { id: 'shockwave', title: 'The Ruling', icon: '⚖️', summary: 'A Supreme Court ruling just woke up both bases.',
      when: { cond: [{ any: ['governing', 'campaign'] }, 'partisan', 'majorParty'], weight: 0.6 },
      pick: { ruling: ['limits on campaign spending', 'federal power to regulate power-plant emissions', 'race-conscious college admissions', 'state permit requirements to carry a gun'] },
      start: 'ruling',
      stages: {
        ruling: { speaker: 'pollster', title: 'Both bases are awake',
          text: '"The Supreme Court just overturned a decades-old precedent on {ruling}. Turnout models are scrambling. Fundraising emails are going out on both sides as we speak. How loud do you want to be?"',
          choices: [
            { label: 'Lead the charge', hint: 'Fires up the base', effects: { approval: { base: 1.5, opp: -1 }, enthusiasm: 3, cashPct: 0.02 }, cast: { activist: 8 }, end: 'Your speech goes viral with exactly the people who already agreed with you. That still matters for turnout.' },
            { label: 'Measured statement', effects: { approval: { swing: 0.5 } }, cast: { activist: -4 }, end: 'Swing voters appreciate calm. Activists appreciate nothing about calm.' },
            { label: '"Not my lane."', cast: { activist: -8 }, end: 'Everyone\'s lane, it turns out.' },
          ] },
      } },

    // ------------------------------------------------------------------ party mode
    { id: 'defector', title: 'The Defector', icon: '🔀', summary: 'A sitting legislator wants to join the {party}.',
      when: { cond: ['party', 'partyEstablished'], weight: 1.4 },
      pick: { defector: NAMES, oldparty: ['Democratic Party', 'Republican Party'] },
      start: 'approach',
      stages: {
        approach: { speaker: 'chief', title: 'A seat walks in',
          text: '"A sitting state legislator, {defector}, wants to leave the {oldparty} and join the {party}. Instant seat, instant credibility, instant headlines. There are also rumors about {defector}\'s expense reports."',
          choices: [
            { label: 'Welcome them with a press conference', effects: { partySeat: 1, partyRec: 6, partyFav: 1, partyMembers: 0.04 }, cast: { boss: -10 }, next: { roll: [{ stage: 'expenses', w: 0.5 }, { stage: 'asset', w: 0.6 }], months: [6, 12] } },
            { label: 'Vet them first', requires: { partyFunds: 8000 }, effects: { partyFunds: -8000 }, chance: { p: 0.6,
              success: { effects: { partySeat: 1, partyRec: 4 }, outcome: 'Vetting turns up nothing serious. Welcome aboard.', next: { stage: 'asset', months: [6, 12] } },
              fail: { outcome: 'The expense reports are worse than rumored. You pass.', end: 'You passed on a seat. Purity is a brand — so is a seat.' } } },
            { label: 'Decline', end: 'Purity is a brand. So is a seat.' },
          ] },
        expenses: { speaker: 'investigator', title: 'Steakhouse outreach',
          text: '"I published {defector}\'s expense reports: $14,000 on \'constituent outreach\' at a steakhouse. The {party}\'s first legislator is now its first scandal."',
          choices: [
            { label: 'Expel them', effects: { partyFav: 1, partyRec: -1 }, end: 'You lose the seat and keep the brand.' },
            { label: 'Stand by them', effects: { partyFav: -3 }, end: 'You keep the seat. The brand takes a dent shaped like a steak.' },
          ] },
        asset: { speaker: 'reporter', title: 'A natural',
          text: '"{defector} turned out to be a natural — on cable twice a week explaining why they left. Your membership forms spiked."',
          choices: [{ label: 'Book them everywhere', effects: { partyMembers: 0.05, partyRec: 3 }, end: 'Defectors make the best evangelists.' }] },
      } },
    { id: 'ballotfight', title: 'The Ballot Challenge', icon: '📑', summary: 'The old parties are trying to knock the {party} off the ballot.',
      when: { cond: ['party', { not: { flag: 'petition_truce' } }, 'partyEstablished'], weight: 1 },
      start: 'filed',
      stages: {
        filed: { speaker: 'boss', title: 'Signature by signature',
          text: 'A lawyer for {boss}\'s side filed suit to knock the {party} off the ballot in {state}, challenging thousands of petition signatures one by one. It\'s a real tactic, and it works more often than you\'d think.',
          choices: [
            { label: 'Hire real election lawyers', requires: { partyFunds: 25000 }, effects: { partyFunds: -25000 }, set: { lawyered: 1 }, next: { roll: [{ stage: 'won', w: 0.7 }, { stage: 'lost', w: 0.3 }], months: [2, 4] } },
            { label: 'Fight it in public as a dirty trick', effects: { partyRec: 4, partyFav: 1.5 }, cast: { boss: -10 }, next: { roll: [{ stage: 'won', w: 0.45 }, { stage: 'lost', w: 0.55 }], months: [2, 4] } },
          ] },
        won: { speaker: 'reporter', title: 'Tossed',
          text: '"The judge tossed the challenge and scolded the plaintiffs for wasting the court\'s time. You\'re on the ballot — and you got a week of free press."',
          choices: [{ label: 'Fundraise off it', effects: { partyFunds: 20000, partyFav: 1 }, end: 'Nothing raises money like being picked on.' }] },
        lost: { speaker: 'chief', title: 'Off the ballot',
          text: '"We lost. The court threw out enough signatures to knock us off the ballot in {state}. We have to petition again."',
          choices: [{ label: 'Start over', effects: { ballotLoss: 1, partyFav: 1 }, end: 'Back to the clipboards. Sympathy is up; signatures are down.' }] },
      } },
  ];
  PG.data.arcById = Object.fromEntries(PG.data.arcs.map((a) => [a.id, a]));
})(globalThis.PG = globalThis.PG || {});
