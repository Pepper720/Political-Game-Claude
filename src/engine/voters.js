/* Electorates and the vote model.
 *
 * An electorate is a set of voter blocs (shares sum to 1) spread over regions. A
 * calibration offset makes a generic Democrat-vs-Republican race reproduce the
 * jurisdiction's partisan lean exactly; real candidates then move votes bloc by bloc.
 */
(function (PG) {
  'use strict';
  const U = PG.util;

  const T_GENERAL = 47;   // softmax temperature for partisan generals (lean 40 → ~70/30)
  const T_PRIMARY = 26;   // primaries: no party cue, more volatile
  const T_NONPARTISAN = 32;

  const TURNOUT_KIND = { pres: 1.0, mid: 0.8, off: 0.5, primary: 0.55, runoff: 0.4 };

  // Jurisdiction archetypes relative to their state.
  const TYPES = {
    urban: { urban: .85, suburban: .15, black: 1.6, hispanic: 1.3, asianOther: 1.5, college: 1.25, religious: .5, seniors: .85, young: 1.3, leanShift: -28 },
    suburban: { urban: .10, suburban: .85, black: .8, hispanic: .9, asianOther: 1.1, college: 1.15, religious: .9, seniors: 1.0, young: .95, leanShift: -4 },
    smalltown: { urban: .05, suburban: .35, black: .7, hispanic: .7, asianOther: .5, college: .75, religious: 1.3, seniors: 1.15, young: .9, leanShift: 14 },
    rural: { urban: 0, suburban: .15, black: .6, hispanic: .6, asianOther: .5, college: .65, religious: 1.4, seniors: 1.2, young: .85, leanShift: 26 },
  };

  // Regional tilt of each bloc (used to spread blocs across regions for election night).
  const REGION_TILT = {
    core: { urban_prog: 2.2, black: 1.6, latino: 1.4, aapi: 1.4, young: 1.6, working: 1.2, sub_college: .6, sub_family: .4, rural: .05, rural_rel: .05, seniors: .7 },
    inner: { sub_college: 1.8, aapi: 1.2, urban_prog: 1.0, black: 1.0, latino: 1.0, sub_family: 1.0, young: 1.0, working: .9, rural: .2, rural_rel: .2, seniors: 1.0 },
    outer: { sub_family: 1.9, sub_college: 1.1, seniors: 1.1, working: 1.0, rural: .6, rural_rel: .7, urban_prog: .4, black: .6, latino: .8, aapi: .7, young: .8 },
    town: { working: 1.4, seniors: 1.3, rural: 1.2, rural_rel: 1.2, sub_family: .8, black: .7, latino: .8, urban_prog: .3, sub_college: .5, aapi: .4, young: .8 },
    rural: { rural: 2.2, rural_rel: 2.2, seniors: 1.2, working: .8, black: .5, latino: .6, aapi: .3, urban_prog: .1, sub_college: .3, sub_family: .6, young: .7 },
  };

  function stateDemo(st) {
    return { urban: st.urban, suburban: st.suburban, rural: st.rural, black: st.black, hispanic: st.hispanic,
      asianOther: st.asianOther, college: st.college, religious: st.religious, seniors: st.seniors, young: 0.2 };
  }

  function demoFor(st, type) {
    const base = stateDemo(st);
    const T = TYPES[type];
    if (!T) return base;
    return {
      urban: T.urban, suburban: T.suburban, rural: Math.max(0, 1 - T.urban - T.suburban),
      black: U.clamp(st.black * T.black, 0.005, 0.7), hispanic: U.clamp(st.hispanic * T.hispanic, 0.01, 0.75),
      asianOther: U.clamp(st.asianOther * T.asianOther, 0.005, 0.6), college: U.clamp(st.college * T.college, 0.12, 0.75),
      religious: U.clamp(st.religious * T.religious, 0.03, 0.8), seniors: U.clamp(st.seniors * T.seniors, 0.08, 0.32),
      young: U.clamp(0.2 * T.young, 0.12, 0.3),
    };
  }

  // Blend a demo toward the urban or rural archetype according to how far a district's
  // lean departs from its state (used for legislative and congressional districts).
  function demoForDistrict(st, lean) {
    const d = lean - st.lean;
    const t = U.clamp(Math.abs(d) / 55, 0, 1);
    const a = stateDemo(st);
    const b = demoFor(st, d < 0 ? 'urban' : 'rural');
    const out = {};
    for (const k of Object.keys(a)) out[k] = U.lerp(a[k], b[k], t);
    return out;
  }

  function blocShares(demo) {
    const minority = demo.black + demo.hispanic + demo.asianOther;
    const W = Math.max(0.05, 1 - minority);
    const wy = W * demo.young, ws = W * demo.seniors;
    const M = Math.max(0, W - wy - ws);
    const uM = M * demo.urban, sM = M * demo.suburban, rM = M * demo.rural;
    const urbanProg = uM * Math.min(0.9, demo.college * 1.5);
    const shares = {
      black: demo.black, latino: demo.hispanic, aapi: demo.asianOther, young: wy, seniors: ws,
      urban_prog: urbanProg,
      working: (uM - urbanProg) + sM * (1 - demo.college) * 0.35 + rM * 0.15,
      sub_college: sM * demo.college,
      sub_family: sM * (1 - demo.college) * 0.65,
    };
    const relShare = Math.min(0.9, demo.religious * 1.6);
    shares.rural_rel = rM * 0.85 * relShare;
    shares.rural = rM * 0.85 - shares.rural_rel;
    const tot = U.sum(Object.values(shares));
    for (const k of Object.keys(shares)) shares[k] = shares[k] / tot;
    return shares;
  }

  function turnoutFor(bloc, kind) {
    const m = TURNOUT_KIND[kind] || 1;
    // Lower-turnout elections exaggerate the gap between high- and low-propensity voters.
    return Math.pow(bloc.turnout, 1 + (1 - m) * 1.1) * Math.min(1, 0.35 + m * 0.65) / Math.min(1, 0.35 + 0.65);
  }

  // Generic two-party margin (+R) for a set of blocs with a calibration offset.
  function genericMargin(blocs, offset, kind) {
    let r = 0, d = 0;
    for (const b of blocs) {
      const pR = U.logistic((b.baseLean + offset) / T_GENERAL);
      const w = b.share * turnoutFor(b, kind || 'pres');
      r += w * pR; d += w * (1 - pR);
    }
    return ((r - d) / (r + d)) * 100;
  }

  function calibrate(blocs, targetMargin) {
    let lo = -200, hi = 200;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (genericMargin(blocs, mid) < targetMargin) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* opts: { id, name, type ('state'|'urban'|'suburban'|'smalltown'|'rural'|'district'),
   *         stateId, lean, population, regionKind ('city'|'state'), demo? } */
  function makeElectorate(opts) {
    const st = PG.data.stateById[opts.stateId];
    const demo = opts.demo || (opts.type === 'district' ? demoForDistrict(st, opts.lean) : opts.type === 'state' ? stateDemo(st) : demoFor(st, opts.type));
    const shares = blocShares(demo);
    const blocs = PG.data.blocs.map((b) => ({ id: b.id, share: shares[b.id], baseLean: b.lean, turnout: b.turnout, econ: b.econ, social: b.social }));
    const offset = calibrate(blocs, opts.lean);
    blocs.forEach((b) => { b.lean = U.round(b.baseLean + offset, 2); });
    const e = {
      id: opts.id, name: opts.name, type: opts.type, stateId: opts.stateId, lean: opts.lean,
      population: opts.population, voters: Math.round(opts.population * 0.74), demo, offset: U.round(offset, 2), blocs,
    };
    e.regions = makeRegions(e, opts.regionKind || (opts.type === 'state' ? 'state' : 'city'));
    return e;
  }

  function makeRegions(e, kind) {
    const d = e.demo;
    let defs;
    if (kind === 'state') {
      const n = PG.data.names.regionNames.state;
      defs = [
        { name: n[0], arch: 'core', w: d.urban },
        { name: n[1], arch: 'inner', w: d.suburban * 0.5 },
        { name: n[2], arch: 'outer', w: d.suburban * 0.5 },
        { name: n[3], arch: 'town', w: d.rural * 0.45 + 0.03 },
        { name: n[4], arch: 'rural', w: d.rural * 0.3 + 0.02 },
        { name: n[5], arch: 'rural', w: d.rural * 0.25 + 0.02 },
      ];
    } else {
      const n = PG.data.names.regionNames.city;
      const archs = e.type === 'urban' ? ['core', 'core', 'inner', 'inner', 'outer', 'core']
        : e.type === 'suburban' ? ['inner', 'outer', 'outer', 'inner', 'town', 'outer']
          : e.type === 'smalltown' ? ['town', 'town', 'outer', 'rural', 'town', 'inner']
            : ['rural', 'town', 'rural', 'town', 'outer', 'rural'];
      defs = archs.map((a, i) => ({ name: n[i], arch: a, w: 1 }));
    }
    defs = defs.filter((r) => r.w > 0.005);
    const regions = defs.map((r, i) => ({ id: 'r' + i, name: r.name, arch: r.arch, blocShare: {}, size: 0 }));
    for (const b of e.blocs) {
      let tot = 0;
      for (let i = 0; i < defs.length; i++) tot += defs[i].w * (REGION_TILT[defs[i].arch][b.id] || 1);
      for (let i = 0; i < defs.length; i++) {
        const s = b.share * defs[i].w * (REGION_TILT[defs[i].arch][b.id] || 1) / tot;
        regions[i].blocShare[b.id] = s;
        regions[i].size += s;
      }
    }
    return regions;
  }

  function dist(a, b) { const de = a.econ - b.econ, ds = a.social - b.social; return Math.sqrt(de * de + ds * ds); }

  function partyAffinity(party, lean) {
    if (party === 'R') return lean / 2;
    if (party === 'D') return -lean / 2;
    if (party === 'L') return lean * 0.12 - 17;
    if (party === 'G') return -lean * 0.12 - 17;
    return -Math.abs(lean) * 0.22 - 13; // independent: no party home + wasted-vote worry
  }

  function partyNorm(party) { return (PG.data.parties[party] || PG.data.parties.I).norm; }

  // Utility of candidate c among bloc b under context ctx. Returns { u, parts } when explain.
  function utility(c, b, ctx, explain) {
    const parts = {};
    let blocIdeo = b;
    if (ctx.mode === 'primary') {
      const pn = partyNorm(ctx.party);
      const pull = ctx.primaryType === 'closed' ? 0.55 : ctx.primaryType === 'open' ? 0.4 : 0.47;
      blocIdeo = { econ: U.lerp(b.econ, pn.econ * 1.35, pull), social: U.lerp(b.social, pn.social * 1.35, pull) };
    }
    const pw = ctx.partisanW === undefined ? 1 : ctx.partisanW;
    if (ctx.mode !== 'primary' && pw > 0) {
      parts.party = partyAffinity(c.party, b.lean) * pw;
      const env = (ctx.env || 0) * (ctx.nat === undefined ? 1 : ctx.nat) + (ctx.swing || 0);
      if (c.party === 'R') parts.env = env / 2 * pw; else if (c.party === 'D') parts.env = -env / 2 * pw;
    }
    const w = ctx.mode === 'primary' ? 0.30 : 0.22;
    if (ctx.mode === 'general' && pw >= 0.7) parts.ideology = -w * (dist(c.ideology, blocIdeo) - dist(partyNorm(c.party), blocIdeo));
    else parts.ideology = -w * dist(c.ideology, blocIdeo);
    const nr = U.clamp(c.nameRec, 0, 100) / 100;
    parts.appeal = (c.fav - 50) * nr * 0.45 + nr * (ctx.mode === 'general' ? 3 : 7);
    if (c.incumbent) parts.incumbency = ctx.mode === 'primary' ? 4 : 3;
    if (c.blocBoost && c.blocBoost[b.id]) parts.campaign = c.blocBoost[b.id];
    if (c.momentum) parts.momentum = c.momentum;
    if (ctx.candNoise && ctx.candNoise[c.id]) parts.noise = ctx.candNoise[c.id];
    if (ctx.blocNoise && ctx.blocNoise[c.id + ':' + b.id]) parts.noise = (parts.noise || 0) + ctx.blocNoise[c.id + ':' + b.id];
    let u = 0;
    for (const k of Object.keys(parts)) u += parts[k];
    return explain ? { u, parts } : u;
  }

  // Share of the bloc that participates in this contest's electorate.
  function participation(b, ctx) {
    if (ctx.mode !== 'primary') return 1;
    const pP = U.logistic((ctx.party === 'R' ? b.lean : -b.lean) / T_GENERAL);
    if (ctx.primaryType === 'closed') return pP * 0.95;
    if (ctx.primaryType === 'semi') return pP + 0.12 * (1 - pP);
    return pP + 0.2 * (1 - pP);
  }

  function temperature(ctx) {
    if (ctx.T) return ctx.T;
    return ctx.mode === 'primary' ? T_PRIMARY : ctx.mode === 'nonpartisan' ? T_NONPARTISAN : T_GENERAL;
  }

  function softmax(us, T) {
    let m = -Infinity;
    for (const u of us) if (u > m) m = u;
    const ex = us.map((u) => Math.exp((u - m) / T));
    const s = U.sum(ex);
    return ex.map((x) => x / s);
  }

  /* Compute a full vote. candidates: [{ id, party, ideology, nameRec, fav, incumbent, blocBoost,
   * momentum, ground, enthusiasm }]. ctx: { mode, party, primaryType, partisanW, env, nat, swing,
   * kind ('pres'|'mid'|'off'|'primary'|'runoff'), candNoise, blocNoise, regionNoise (bool) }. */
  function computeVote(e, candidates, ctx) {
    const T = temperature(ctx);
    const kind = ctx.kind || 'pres';
    const res = { votes: {}, byBloc: {}, byRegion: [], total: 0 };
    candidates.forEach((c) => { res.votes[c.id] = 0; });
    const blocShareOf = {};
    for (const b of e.blocs) {
      const us = candidates.map((c) => utility(c, b, ctx));
      blocShareOf[b.id] = softmax(us, T);
    }
    for (const r of e.regions) {
      const rv = { id: r.id, name: r.name, votes: {}, total: 0 };
      candidates.forEach((c) => { rv.votes[c.id] = 0; });
      for (const b of e.blocs) {
        const pop = r.blocShare[b.id] * e.voters * participation(b, ctx) * turnoutFor(b, kind);
        let shares = blocShareOf[b.id];
        if (ctx.regionNoise) {
          const us = candidates.map((c) => utility(c, b, ctx) + PG.rng.hashNoise((ctx.noiseKey || '') + r.id + c.id) * 2.5);
          shares = softmax(us, T);
        }
        candidates.forEach((c, i) => {
          const mult = 1 + 0.004 * (c.ground || 0) + 0.004 * (c.enthusiasm || 0);
          const v = pop * shares[i] * mult;
          rv.votes[c.id] += v;
          res.votes[c.id] += v;
          if (!res.byBloc[b.id]) res.byBloc[b.id] = { votes: {}, total: 0 };
          res.byBloc[b.id].votes[c.id] = (res.byBloc[b.id].votes[c.id] || 0) + v;
          res.byBloc[b.id].total += v;
          rv.total += v;
        });
      }
      res.byRegion.push(rv);
    }
    res.total = U.sum(Object.values(res.votes));
    res.shares = {};
    for (const c of candidates) res.shares[c.id] = res.total > 0 ? res.votes[c.id] / res.total : 0;
    return res;
  }

  // Instant-runoff on top of the bloc model: eliminated candidates' supporters re-choose.
  function computeRCV(e, candidates, ctx) {
    let remaining = candidates.slice();
    const rounds = [];
    for (;;) {
      const r = computeVote(e, remaining, ctx);
      rounds.push(r);
      const sorted = U.sortBy(remaining, (c) => -r.shares[c.id]);
      if (r.shares[sorted[0].id] > 0.5 || remaining.length <= 2) return { final: r, rounds };
      remaining = remaining.filter((c) => c.id !== sorted[sorted.length - 1].id);
    }
  }

  // Explain why a bloc leans the way it does toward each candidate.
  function explainBloc(e, candidates, ctx, blocId) {
    const b = e.blocs.find((x) => x.id === blocId);
    return candidates.map((c) => ({ id: c.id, ...utility(c, b, ctx, true) }));
  }

  PG.voters = {
    TYPES, TURNOUT_KIND, T_GENERAL, stateDemo, demoFor, demoForDistrict, blocShares, turnoutFor, genericMargin,
    calibrate, makeElectorate, computeVote, computeRCV, explainBloc, utility, dist, partyNorm, participation,
  };
})(globalThis.PG = globalThis.PG || {});
