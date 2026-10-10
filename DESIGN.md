# Ballot & Gavel — Design Document

A single-player, browser-only simulation of an American political career: run for
local office, climb the ladder, and govern. Realism and transparent causality over
spectacle.

## 1. Technical architecture

| Concern | Decision |
|---|---|
| Runtime | Static HTML/CSS/JS. No build, no dependencies, no network calls. |
| Module format | **Classic scripts sharing one `PG` namespace** (`globalThis.PG`). ES modules are blocked by browsers on `file://`, and "just open index.html" is a hard requirement. Every file is an IIFE `(function (PG) { ... })(globalThis.PG = globalThis.PG || {})`. |
| Layers | `data/` (pure data) → `src/engine/` (pure logic, no DOM) → `src/ui/` (DOM). The engine never touches `window`/`document`. |
| Load order | The `<script>` list in `index.html` is the single manifest. The Node test harness parses it and loads every non-UI script into a `vm` context. |
| Randomness | Seeded mulberry32 PRNG whose 32-bit state lives **inside the game state** (`state.rng`). All game randomness flows through `PG.rng`. Stable per-entity "personality noise" (e.g. a legislator's idiosyncratic take on a bill) uses a deterministic string hash so whip counts don't flicker. |
| State | One plain JSON-serializable object. No classes, no functions, no cycles. Static data is referenced by id. |
| Persistence | Autosave to `localStorage` after every action; export/import as `.json`. Saves are versioned and validated (`PG.save`). |
| Tests | `node tests/run.js` — zero installs. Unit tests per engine module plus multi-seed headless autoplay (a bot plays whole careers). A separate optional `tests/browser-smoke.js` drives the real UI in headless Chromium when Playwright is present. |

## 2. Core loop

```
setup → career (choose race) → campaign (monthly turns) → election night
      ↘ lose: back to career                    ↘ win: transition → governing (monthly turns)
governing → (decision point ~ filing deadline) → reelection / run for other office / retire
```

* **Time** advances in months. A campaign is 6–22 months depending on office; between
  meaningful dates the game time-skips with a summary.
* **Officeholders who run for another office** keep governing on autopilot while
  campaigning. If their current term outlasts the election (a senator running for
  president), losing doesn't cost them their seat — like reality.

## 3. Systems

### 3.1 Geography & electorates
* `data/states.js`: all 50 states + DC — electoral votes, Cook-style partisan lean,
  demographics, primary type (open/closed/semi/top-two/top-four), runoff thresholds,
  primary month, governor term/limits/election-year parity, legislature sizes and term
  lengths/limits, veto override thresholds, line-item veto, redistricting control,
  mail-ballot counting order, contribution limits, Senate classes.
* **Voter blocs** (`data/blocs.js`) partition the electorate (Black voters, Latino
  voters, AAPI & other, young, seniors, urban progressives, suburban college,
  suburban families, working class, rural, rural religious). Each has partisanship,
  a 2-D ideology (economic, social), issue salience and turnout propensity.
* `makeElectorate()` derives bloc shares from jurisdiction demographics and **calibrates**
  a partisan offset so a generic D-vs-R race reproduces the jurisdiction's lean exactly.
  Candidates then move votes bloc-by-bloc relative to that baseline.
* **Districts**: House and legislative districts are generated from the state lean;
  the map-drawer (R, D, commission, split) packs and cracks. Redistricting reoccurs
  after each census.

### 3.2 Vote model
Per bloc, each candidate's utility = party affinity × partisanship weight (lower in
nonpartisan and primary races) − ideological distance from the bloc (relative to a
generic candidate of that party) + appeal (favorability × name recognition) + campaign
targeting + incumbency + endorsements + national environment (scaled by how
nationalized the race is). Shares come from a softmax; turnout per bloc depends on
election type (presidential / midterm / off-year / primary), enthusiasm and ground
game. Primaries use only the party's (or open/top-two) electorate whose ideology is
pulled toward the party pole — the base-versus-moderate tension falls out naturally.
Election-day error is a correlated statewide/national shift plus bloc-level noise.

### 3.3 Campaign
* **Monthly schedule**: 20 campaign days split among call-time fundraising, digital
  small-dollar, retail, media, ground organizing, policy work, debate prep and rest
  (fatigue raises gaffe risk).
* **Money**: contribution limits by level/state; small-dollar vs large donors vs PACs;
  super PACs spend independently (no coordination). Large donors and PACs create
  **commitments** that come due when governing.
* **Spending**: ads (positive / contrast / negative with backlash risk), field staff,
  internal polls with crosstabs, opposition research.
* **Polls**: public polls with real sampling error (MOE ≈ 98/√n), house effects and
  undecideds tied to name recognition.
* Opposition research, scandals, gaffes, endorsements, debates, earned media.
* **Ballot access**: filing deadlines; independents must gather signatures.
* **Presidential**: primary calendar with proportional (D, 15% threshold) and mixed
  WTA/proportional (R) delegates, candidate dropouts, VP selection, conventions,
  50+DC Electoral College with Maine and Nebraska district allocation, 269–269
  contingent election, state-by-state swing strategy.
* **Election night** reports regions (or states) over time; mail-first vs mail-last
  states produce early "mirages"; races are called when statistically safe.

### 3.4 Governing
* **Legislatures** (council, school board, state house/senate, U.S. House/Senate) are
  rosters of generated members with party, ideology, district lean, seniority,
  loyalty and relationship to the player. A bill's fate is computed member-by-member
  from ideology, party position, district pressure, interest-group lobbying, the
  player's whipping and deals, and a stable idiosyncratic term — and every outcome
  reports the decisive factors.
* Pipeline: introduce → cosponsors → committee (chair) → floor (Senate cloture 60;
  reconciliation once a fiscal year for budgetary bills) → other chamber → conference
  → executive signature/veto → override (state-specific thresholds).
* **Executives** (mayor, governor, president): annual budget with categories and tax
  levers, balanced-budget rules for states/cities, appropriations negotiations,
  vetoes and line-item vetoes, executive orders with legal vulnerability,
  appointments and confirmations, cabinet competence/loyalty, emergencies.
* **Courts**: laws and orders with legal vulnerability get challenged by opposing
  groups; cases move through trial → appeal → supreme court; courts' ideology
  matters; injunctions suspend effects; judicial appointments shift future rulings.
* **Interest groups & media**: ~28 fictional organizations with tag-based policy
  preferences, resources and blocs of influence; relationships drive endorsements,
  money, lobbying and ad campaigns. Outlets with lean and reach shape coverage.
* **Economy & budget**: national cycle (growth, unemployment, inflation, Fed rate,
  sentiment) with local offsets; revenues follow the economy; services have a "need"
  baseline so cuts and increases change crime, schools, infrastructure, health.
* **Approval**: per-bloc approval tracks a target built from partisanship, economy,
  services, policy record, events and scandals — each component is displayed.
  National environment (midterm penalty, presidential approval) feeds every race.

### 3.5 Events
Data-driven events (`data/events.js`) with conditions (phase, office kind, level,
flags), branching choices and effects in a shared effect language. Choices can set
flags and schedule **echo** events months or years later. Every choice costs something.

### 3.6 Transparency
Every consequential calculation returns `reasons` alongside the result. The log
stores causes; the UI shows "Why?" expanders (vote breakdowns, approval components,
poll methodology, court rulings).

### 3.7 Difficulty
Forgiving / Normal / Hard change tunable parameters only: poll noise, opponent
quality, scandal frequency, approval sensitivity to bad news, starting network.
Rules are identical.

## 4. Data model (abridged)

```js
state = {
  version, seed, rng: { s }, difficulty, date: { year, month }, phase,
  player: { name, party, background, traits, homeState, birthYear, ideology:{econ,social},
            stats:{charisma,fundraising,policy,discipline,organizing}, cash, nameRec, fav,
            office, history, commitments, scandals, flags, capital },
  world: { national:{ economy, president, congress, environment, budget }, home:{ city, districts },
           chambers:{ [id]: { members[], committees[], leadership } }, courts },
  campaign: null | { race, stage, candidates[], electorate, polls[], plan, ... },
  gov: null | { kind, level, bills[], budget, approval:{ byBloc, components }, cabinet, eos[] },
  groups: { [id]: { rel } }, media: { [id]: { rel } },
  events: { active, queue[], fired{} }, log[], news[], electionNight
}
```

## 5. Milestones

1. **Engine core**: RNG, utilities, save/load + validation, state data, electorate
   calibration, character creation & eligibility, test harness.
2. **Local loop**: school board / city council / mayor campaigns (nonpartisan, multi-seat,
   runoffs), election night, council governing, mayoral executive basics, UI end to end.
3. **State & federal legislatures**: districts & gerrymandering, partisan primaries,
   state house/senate, U.S. House/Senate, committees, cloture, conference, overrides.
4. **Governor & President**: budgets, vetoes, EOs, appointments, presidential primaries,
   VP, Electoral College, election night by state.
5. **Events, groups, courts, polish**: event pool, interest-group dynamics, court
   challenges and appointments, "How this models reality", balance pass, README.
