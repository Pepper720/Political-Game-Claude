# Ballot & Gavel

A single-player simulation of an American political career that runs entirely in your
browser. Start on a school board or city council, climb through the statehouse and
Congress to the governor's mansion or the White House — and govern once you get there.
Realism, systemic depth and transparent causality come first: every poll, vote, ruling
and election tells you *why* it came out the way it did.

All characters, interest groups and media outlets are fictional.

## Running it

No build step, no dependencies, no network calls.

- **Just open `index.html`** in any modern browser (works over `file://`).
- Or serve the folder: `npx serve .` / `python3 -m http.server`, or publish it on
  GitHub Pages (Settings → Pages → deploy from the branch root).

Progress autosaves to `localStorage` after every action. Use **Save & settings** to
export a `.json` save file or import one.

## How to play

1. **Create a character** — name, party (Democratic, Republican, independent,
   Libertarian or Green), background, home state and town type, age, a starting
   ideology, and up to three traits (each has an upside and a cost). The setup screen
   shows the **seed**: the same seed with the same choices replays the same game.
2. **Pick a race** on the *Career* tab. Every office shows its real requirements, next
   election, filing deadline, partisan lean and typical budget. Your first race must be
   local.
3. **Campaign month by month.** Split 20 campaign days among call time, small-dollar
   digital, retail, media, ground organizing, policy work, debate prep and rest; set the
   share of cash for ads (positive / contrast / negative), field and opposition
   research; roll out policy positions; court endorsements. Big donors and PACs attach
   **commitments** you'll be held to later. Polls come with real margins of error;
   internal polls show crosstabs by voter bloc. The *Voters* tab shows exactly which
   factors pull each bloc toward you or your rival.
4. **Election night** reports results over time by region (or state), with mail-ballot
   "mirages" in states that count mail last, and a breakdown of why you won or lost.
5. **Govern.** Legislators introduce bills, gather cosponsors, whip votes member by
   member, cut side deals, vote on the floor (party discipline vs. district), chase
   committee chairs, and request earmarks. Executives propose budgets, sign or veto,
   use line-item vetoes where the state allows, issue executive orders, nominate and
   lose (or win) confirmation votes, and handle emergencies. Courts may strike down
   what you pass. Approval is broken into visible components bloc by bloc.
6. **Decide** near the end of each term: run again, aim higher, or retire. Term limits,
   primary challenges from a restless base, midterm penalties and the economy all feed
   into the next campaign.

Difficulty (*Forgiving / Normal / Hard*) changes how forgiving the simulation is —
poll noise, opponent quality, scandal frequency, how hard bad news hits, starting money,
election-day error and political capital — never the rules.

The in-game **How it works** page lists the real-world rules modeled and every major
simplification.

## Project layout

```
index.html            Script manifest (also read by the Node test harness)
css/style.css         Styles (light/dark, responsive)
data/                 All game data — edit these to extend the game
  states.js           50 states + DC: lean, demographics, primaries, terms, limits, vetoes…
  people.js           Voter blocs, issues, backgrounds, traits, difficulty, name pools
  offices.js          The career ladder and eligibility rules
  government.js       Committees, budget structures, cabinets, executive orders
  laws.js             Bill templates
  groups.js           Interest groups and media outlets
  events.js           The event pool
  presidential.js     Primary calendar, delegate rules, Electoral College map tiles, VP archetypes
  reality.js          "How this models reality" content
src/engine/           Simulation (pure logic, no DOM)
src/ui/               Rendering and input
tests/                Zero-install test suite, bot, smoke and balance scripts
DESIGN.md             Systems, data model and milestones
```

The engine never touches the DOM. All randomness flows through a seeded PRNG stored in
the game state, so saves are fully reproducible. Files are classic scripts sharing a
`PG` namespace (ES modules are blocked by browsers on `file://`).

## Tests

```
node tests/run.js              # all unit + autoplay tests (no installs needed)
node tests/run.js courts       # filter by test name
node tests/smoke.js SEED 30 TX R   # bot plays a 30-year career and prints a report
node tests/balance.js 30       # win rates, approval, reelection across many seeds
node tests/browser-smoke.js    # optional: drives the real UI in headless Chromium (needs Playwright)
```

The suite covers the RNG, data integrity (538 electors, 435 seats, Senate classes,
event references), electorate calibration, primaries/top-two/ranked-choice, the
filibuster and reconciliation, veto-override thresholds, term limits, redistricting,
delegate allocation, the Electoral College, governing as President and governor,
courts, save/load round trips, determinism, and multi-seed 20-year autoplay careers.

## Extending the game

Everything below is plain data; no engine changes needed.

### Add an event — `data/events.js`

```js
{ id: 'pothole_crisis', title: 'Pothole season',
  text: 'Residents of {city} are posting photos of crater-sized potholes.',
  when: { phase: ['governing'], kinds: ['executive'], levels: ['city'], minMonths: 3, weight: 1 },
  choices: [
    { label: 'Emergency repaving blitz', hint: 'Visible; expensive',
      effects: { budgetPct: -0.004, outcomes: { infrastructure: 2 }, approval: { all: 1 } } },
    { label: 'Stick to the schedule', hint: 'Cheap; drivers fume',
      effects: { approval: { blocs: { sub_family: -1.5 } }, echo: { event: 'pothole_lawsuit', months: [3, 8], chance: 0.4 } } },
  ] },
```

- `when`: `phase` (`governing` / `campaign` / `career`), `kinds`, `levels` (`school`,
  `city`, `state`, `federal`), `offices`, `flags` / `notFlags`, `minMonths`, `weight`,
  `once`, `partisan`. `echoOnly: true` events fire only when scheduled by an `echo`.
- A choice has `effects`, or `chance: { p, stat, success, fail }` (a stat such as
  `charisma` shifts the odds).
- Text variables: `{city} {state} {name} {office} {opponent}` plus any passed in.
- **Effect keys** (see `src/engine/effects.js`): `approval` (number or
  `{ all, base, swing, opp, blocs: { id: n } }`), `record`, `groups: { id: n }`, `media`,
  `capital`, `partyRel`, `legRel`, `cashPct`, `nameRec`, `fav`, `oppFav`, `momentum`,
  `enthusiasm`, `ground`, `budgetPct`, `spendingPct: { cat, pct }`, `outcomes: { key: n }`,
  `economy: { growth, unemployment, inflation }` (+ `national: true`), `presApproval`,
  `flags: { set, clear }`, `scandal: { severity, text }`, `echo: { event, months: [a, b], chance }`,
  plus specials `fireCabinet`, `redistrict`, `nuclear`.

`node tests/run.js data` validates group, bloc, outcome and echo references.

### Add a law — `data/laws.js`

```js
{ id: 'library_hours', name: 'Extended Library Hours', levels: ['city'], cat: 'education',
  issue: 'education', ideo: { econ: -10, social: 0 }, tags: ['public_schools'],
  cost: 0.004, outcomes: { quality: 1.5 }, blocs: { young: 1 },
  desc: 'Open branches evenings and Sundays. Popular with students; costs staff time.' }
```

`ideo` is the direction the policy moves (−100 left … +100 right on each axis) and
drives every legislator's vote and every voter bloc's reaction; `tags` connect it to
interest groups (`data/groups.js`); `cost`/`revenue` are fractions of the
jurisdiction's budget; `outcomes` shift service indices; `legal: { vuln, grounds }`
sets court risk; `budgetary: true` makes it eligible for Senate reconciliation;
`preempt: 'state'` lets red/blue states challenge city versions. Add a committee
category in `data/government.js` if you introduce a new `cat`.

### Add or change an office — `data/offices.js`

Each office declares its level, kind (`legislator` / `executive`), body, term (number
or a state field like `'houseTerm'`), minimum age, election-year rule
(`odd`, `even`, `state`, `gov`, `senate`, `pres`), campaign length, typical budget,
ladder rank and term-limit rule. Jurisdiction wiring (which electorate, budget and
legislature an office uses) lives in `src/engine/juris.js` (`OFFICE_KEY`,
`OFFICE_LEVEL`, `OFFICE_BODY`); a brand-new office type needs an entry there, and
`calendar.js` if it uses a new election-year rule.

### Other data

- **States** (`data/states.js`): one row per state — tweak leans, primary rules, term
  limits, override thresholds, contribution limits.
- **Interest groups** (`data/groups.js`): ideology, money/ground strength, levels, the
  policy `tags` they care about, and the voter blocs they reach.
- **Executive orders, cabinets, committees, budgets** (`data/government.js`).
- **Presidential calendar and delegate rules** (`data/presidential.js`).

## Design principles

- **Even-handed.** No party or ideology is favored; every policy has costs; there is
  no hidden moral score. Interest groups and media are balanced across the spectrum
  (enforced by a test).
- **Systemic.** Coalitions, money, the economy, courts and the calendar interact.
  Compromise, hardball and inaction are all viable — and all cost something.
- **Transparent.** Votes list defectors and the lobbying behind them, approval is
  decomposed by component and bloc, elections explain which blocs moved and why.
