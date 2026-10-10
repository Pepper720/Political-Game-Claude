/* Running elections: contexts for each stage (primary / runoff / general / top-two /
 * ranked-choice / multi-seat), election-day error, results, and an election-night
 * timeline that reports regions over time with realistic mail-ballot ordering. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;

  function office(state) { return PG.data.officeById[state.campaign.officeId]; }

  function ctxFor(state, stage, party) {
    const o = office(state), st = PG.juris.homeState(state);
    const yearKind = PG.calendar.electionKind(state.date.year);
    const ctx = { env: state.world.national.environment, nat: o.nationalization, noiseKey: state.campaign.id + stage };
    if (!o.partisan) { ctx.mode = 'nonpartisan'; ctx.partisanW = 0.4; ctx.kind = yearKind === 'pres' ? 'pres' : yearKind === 'mid' ? 'mid' : 'off'; }
    else if ((stage === 'primary') && (st.primary === 'top2' || st.primary === 'top4')) { ctx.mode = 'general'; ctx.partisanW = 1; ctx.kind = 'primary'; ctx.T = 36; }
    else if (stage === 'primary' || stage === 'runoff') {
      ctx.mode = 'primary'; ctx.party = party; ctx.kind = stage === 'runoff' ? 'runoff' : 'primary';
      ctx.primaryType = st.primary === 'closed' ? 'closed' : st.primary === 'semi' ? 'semi' : 'open';
    } else {
      ctx.mode = 'general'; ctx.partisanW = 1; ctx.kind = stage === 'general_runoff' ? 'runoff' : yearKind;
      if (st.primary === 'jungle') ctx.T = 40;
    }
    if (ctx.kind === 'off' && o.partisan && yearKind === 'off') ctx.kind = 'off';
    return ctx;
  }

  function candsFor(state, stage, party) {
    const c = state.campaign;
    let list = c.candidates.filter((x) => x.active && (!x.stages || x.stages.includes(stage)));
    if (party) list = list.filter((x) => x.party === party);
    return list;
  }

  // Deterministic "if the election were held today" estimate (used by polls).
  function preview(state) {
    const c = state.campaign;
    const stage = c.stage;
    const party = stage === 'primary' || stage === 'runoff' ? state.player.party : null;
    const ctx = ctxFor(state, stage, party);
    const cands = ctx.mode === 'primary' ? candsFor(state, stage, party) : candsFor(state, stage);
    return PG.voters.computeVote(PG.campaign.electorate(state), cands, ctx);
  }

  function noisyCtx(state, ctx, cands) {
    const diff = PG.data.difficulty[state.difficulty];
    const out = Object.assign({}, ctx);
    out.swing = ctx.mode === 'general' && ctx.partisanW >= 0.7 ? R.normal(state, 0, 2.6 * diff.electionNoise) : R.normal(state, 0, 1.2);
    out.candNoise = {};
    const sd = ctx.mode === 'general' && ctx.partisanW >= 0.7 ? 1.4 : 3.2;
    for (const c of cands) out.candNoise[c.id] = R.normal(state, 0, sd * diff.electionNoise);
    out.regionNoise = true;
    return out;
  }

  function vote(state, stage, cands, ctx) {
    const e = PG.campaign.electorate(state);
    const st = PG.juris.homeState(state);
    const nctx = noisyCtx(state, ctx, cands);
    if (st.rcv && ctx.mode === 'general' && office(state).partisan && cands.length > 2) {
      const r = PG.voters.computeRCV(e, cands, nctx);
      r.final.rounds = r.rounds;
      return r.final;
    }
    return PG.voters.computeVote(e, cands, nctx);
  }

  function ranked(res, cands) { return cands.slice().sort((a, b) => res.votes[b.id] - res.votes[a.id]); }

  /* Run the election for the current stage and transition the campaign. */
  function runStage(state) {
    const c = state.campaign, st = PG.juris.homeState(state), o = office(state);
    const stage = c.stage;
    const p = state.player;
    const pc = PG.campaign.playerCand(state);
    let night = null;
    if (stage === 'primary' && (st.primary === 'top2' || st.primary === 'top4')) {
      const cands = candsFor(state, stage);
      const ctx = ctxFor(state, stage);
      const res = vote(state, stage, cands, ctx);
      const order = ranked(res, cands);
      const k = st.primary === 'top4' ? 4 : 2;
      const adv = order.slice(0, k);
      cands.forEach((x) => { if (!adv.includes(x)) x.active = false; else x.stages = null; });
      night = buildNight(state, (st.primary === 'top2' ? 'Top-two' : 'Top-four') + ' primary', cands, res, adv.map((x) => x.id), { advance: true });
      const ok = adv.includes(pc);
      finishStage(state, night, ok, ok ? 'You advanced to the general election.' : 'You failed to finish in the top ' + k + '.');
      return;
    }
    if (stage === 'primary' || stage === 'runoff') {
      let playerRes = null;
      for (const party of ['D', 'R', 'L', 'G']) {
        const cands = candsFor(state, stage, party);
        if (!cands.length) continue;
        if (cands.length === 1) { cands[0].stages = null; cands[0].nominee = true; continue; }
        const ctx = ctxFor(state, stage, party);
        const res = vote(state, stage, cands, ctx);
        const order = ranked(res, cands);
        const top = res.shares[order[0].id];
        const isPlayerParty = cands.includes(pc);
        if (stage === 'primary' && st.runoff && top < st.runoff && order.length > 2) {
          const pair = order.slice(0, 2);
          cands.forEach((x) => { if (!pair.includes(x)) x.active = false; });
          if (isPlayerParty) {
            playerRes = { res, cands, winners: pair.map((x) => x.id), runoff: true };
          } else {
            // Resolve the other party's runoff off-screen.
            const r2 = vote(state, 'runoff', pair, ctxFor(state, 'runoff', party));
            const w = ranked(r2, pair)[0];
            pair.forEach((x) => { if (x !== w) x.active = false; });
            w.stages = null; w.nominee = true;
            PG.game.log(state, 'campaign', PG.data.parties[party].adj + ' runoff: ' + w.name + ' won the nomination.');
          }
        } else {
          const w = order[0];
          cands.forEach((x) => { if (x !== w) x.active = false; });
          w.stages = null; w.nominee = true;
          if (isPlayerParty) playerRes = { res, cands, winners: [w.id] };
          else PG.game.log(state, 'campaign', PG.data.parties[party].adj + ' primary: ' + w.name + ' won with ' + U.fmtPct(res.shares[w.id], 0) + '.');
        }
      }
      if (!playerRes) { // player had no primary opponent
        c.stageIndex++; c.stage = c.stages[c.stageIndex];
        PG.game.log(state, 'campaign', 'You were unopposed for your party\'s nomination.');
        return;
      }
      const title = (stage === 'runoff' ? 'Primary runoff' : PG.data.parties[p.party].adj + ' primary');
      night = buildNight(state, title, playerRes.cands, playerRes.res, playerRes.winners, { advance: true, runoff: playerRes.runoff });
      const ok = playerRes.winners.includes('player');
      if (playerRes.runoff && ok) {
        c.stages.splice(c.stageIndex + 1, 0, 'runoff');
        if (!c.info.runoff) c.info.runoff = U.addMonths(state.date, 2);
        finishStage(state, night, true, 'No one cleared ' + U.fmtPct(st.runoff, 0) + ' — you face a runoff in ' + U.fmtDate(c.info.runoff) + '.');
      } else finishStage(state, night, ok, ok ? 'You won the nomination.' : 'You lost the primary.');
      return;
    }
    // General (or general runoff).
    const cands = candsFor(state, stage);
    const ctx = ctxFor(state, stage);
    const res = vote(state, stage, cands, ctx);
    const order = ranked(res, cands);
    const seats = o.seats || 1;
    let winners = order.slice(0, seats).map((x) => x.id);
    const needRunoff = stage === 'general' && seats === 1 && cands.length > 2 && res.shares[order[0].id] < 0.5 &&
      (o.runoff || (st.generalRunoff && (o.level === 'federal' || o.id === 'governor')) || (st.primary === 'jungle' && o.partisan));
    if (needRunoff) {
      winners = order.slice(0, 2).map((x) => x.id);
      cands.forEach((x) => { if (!winners.includes(x.id)) x.active = false; else x.stages = null; });
      night = buildNight(state, o.partisan ? 'General election' : 'Municipal election', cands, res, winners, { advance: true, runoff: true });
      const ok = winners.includes('player');
      if (ok) { c.stages.push('general_runoff'); c.info.generalRunoff = c.info.generalRunoff || { year: state.date.year, month: 12 }; }
      finishStage(state, night, ok, ok ? 'No majority — you advance to a December runoff.' : 'You did not make the runoff.');
      return;
    }
    night = buildNight(state, stage === 'general_runoff' ? 'Runoff election' : (o.partisan ? 'General election' : seats > 1 ? 'School board election' : 'Municipal election'), cands, res, winners, { final: true });
    const won = winners.includes('player');
    c.winnerParty = (cands.find((x) => x.id === winners[0]) || {}).party;
    if (!won && seats === 1) {
      const w = cands.find((x) => x.id === winners[0]);
      state.world.pendingSeat = { officeId: c.officeId, name: w.name, party: w.party, ideology: w.ideology, termStart: c.info.termStart, senateClass: c.info.senateClass };
    }
    finishStage(state, night, won, won ? 'You won!' : 'You lost.', true);
  }

  function finishStage(state, night, ok, msg, final) {
    const c = state.campaign;
    night.playerAdvanced = ok;
    night.message = msg;
    state.electionNight = night;
    c.lastResult = { stage: c.stage, playerShare: night.final.shares.player || 0 };
    PG.game.log(state, 'election', night.title + ': ' + msg, night.notes);
    if (!ok) {
      PG.game.news(state, state.player.name + ' defeated', -1);
      PG.campaign.endCampaign(state, false, msg);
      return;
    }
    if (final) {
      state.player.pendingOffice = { officeId: c.officeId, info: c.info, share: night.final.shares.player };
      PG.game.news(state, state.player.name + ' wins ' + PG.data.officeById[c.officeId].short + ' race', 2);
      PG.campaign.endCampaign(state, true, msg);
      return;
    }
    c.stageIndex++;
    c.stage = c.stages[c.stageIndex];
    // Each new stage: rivals regroup; the player gets a bump as the winner.
    const pc = PG.campaign.playerCand(state);
    pc.momentum = U.clamp((pc.momentum || 0) + 2, -10, 10);
    for (const x of c.candidates) if (x.active && !x.isPlayer && x.nominee) x.momentum = (x.momentum || 0) + 1;
  }

  // ------------------------------------------------------------ election night
  const TIMES = ['7:00 PM', '7:30 PM', '8:00 PM', '8:30 PM', '9:00 PM', '9:30 PM', '10:00 PM', '10:30 PM', '11:00 PM', '11:30 PM', '12:30 AM', '2:00 AM', 'Next day'];

  function buildNight(state, title, cands, res, winners, opts) {
    const st = PG.juris.homeState(state);
    const N = TIMES.length;
    const mailLate = st.mailLate;
    const partisan = office(state).partisan;
    const regions = res.byRegion.map((r, i) => ({ ...r, speed: 0.75 + (PG.rng.hashNoise(state.campaign.id + r.id + title) + 1) * 0.3 }));
    const steps = [];
    const mailFrac = 0.4;
    let calledAt = null;
    const finalWinner = winners[0];
    for (let k = 1; k <= N; k++) {
      const votes = {}; let rep = 0, tot = 0;
      cands.forEach((x) => { votes[x.id] = 0; });
      const regionRows = [];
      for (const r of regions) {
        const prog = k === N ? 1 : U.clamp((k / (N - 1)) * r.speed, 0, 1);
        const mailRep = mailLate ? U.clamp((prog - 0.6) / 0.4, 0, 1) : U.clamp(prog / 0.35, 0, 1);
        const dayRep = mailLate ? U.clamp(prog / 0.6, 0, 1) : U.clamp((prog - 0.35) / 0.65, 0, 1);
        // Mail ballots skew Democratic, Election Day votes Republican (partisan races).
        let mailW = 0;
        const skew = {};
        cands.forEach((x) => { skew[x.id] = partisan ? (x.party === 'D' ? 1.18 : x.party === 'R' ? 0.82 : 1) : 1; mailW += r.votes[x.id] * skew[x.id]; });
        const row = { name: r.name, votes: {}, pct: 0 };
        let rr = 0;
        for (const x of cands) {
          const v = r.votes[x.id];
          const mail = mailW > 0 ? r.total * mailFrac * v * skew[x.id] / mailW : 0;
          const day = v - mail;
          const got = mail * mailRep + day * dayRep;
          votes[x.id] += got; row.votes[x.id] = got; rr += got;
        }
        row.pct = r.total ? rr / r.total : 0;
        rep += rr; tot += r.total;
        regionRows.push(row);
      }
      const pct = tot ? rep / tot : 0;
      const order = cands.slice().sort((a, b) => votes[b.id] - votes[a.id]);
      const lead = order[0].id;
      const margin = rep > 0 && order.length > 1 ? (votes[order[0].id] - votes[order[1].id]) / rep : 1;
      const seats = office(state).seats || 1;
      if (calledAt === null && seats === 1 && pct >= 0.45 && lead === finalWinner && margin > (1 - pct) * 0.4 + 0.025 && !opts.runoff) calledAt = k - 1;
      steps.push({ label: TIMES[k - 1], pct, votes, regions: regionRows });
    }
    if (calledAt === null) calledAt = N - 1;
    const final = { votes: res.votes, shares: res.shares, total: res.total };
    const notes = explainResult(state, cands, res, winners);
    return {
      title, date: { ...state.date }, office: office(state).name, jurisdiction: PG.juris.describe(state, state.campaign.key),
      candidates: cands.map((x) => ({ id: x.id, name: x.isPlayer ? x.name + ' (you)' : x.name, party: x.party, isPlayer: x.isPlayer, incumbent: x.incumbent })),
      steps, calledAt, winners, final, notes, mailLate, rounds: res.rounds ? res.rounds.map((r) => r.shares) : null, turnout: res.total / PG.campaign.electorate(state).voters,
    };
  }

  // Why did it come out this way? Bloc-level strengths/weaknesses and the big factors.
  function explainResult(state, cands, res, winners) {
    const notes = [];
    const pc = cands.find((x) => x.isPlayer);
    if (!pc) return notes;
    const rival = cands.filter((x) => !x.isPlayer).sort((a, b) => res.votes[b.id] - res.votes[a.id])[0];
    if (!rival) return notes;
    const e = PG.campaign.electorate(state);
    const rows = [];
    for (const b of e.blocs) {
      const bv = res.byBloc[b.id];
      if (!bv || !bv.total) continue;
      const mine = bv.votes.player / bv.total, theirs = bv.votes[rival.id] / bv.total;
      rows.push({ id: b.id, name: PG.data.blocById[b.id].name, mine, theirs, size: bv.total / res.total });
    }
    rows.sort((a, b) => (b.mine - b.theirs) * b.size - (a.mine - a.theirs) * a.size);
    const best = rows.slice(0, 2), worst = rows.slice(-2).reverse();
    notes.push('Your best groups: ' + best.map((r) => r.name + ' ' + Math.round(r.mine * 100) + '–' + Math.round(r.theirs * 100)).join(', ') + '.');
    notes.push('Your weakest: ' + worst.map((r) => r.name + ' ' + Math.round(r.mine * 100) + '–' + Math.round(r.theirs * 100)).join(', ') + '.');
    notes.push('Turnout: ' + U.fmtPct(res.total / e.voters, 0) + ' of eligible voters (' + PG.calendar.electionKind(state.date.year).replace('pres', 'presidential year').replace('mid', 'midterm').replace('off', 'off-year') + ' electorate).');
    const c = state.campaign;
    if (Math.abs(pc.ground - rival.ground) > 4) notes.push((pc.ground > rival.ground ? 'Your' : rival.name + '\'s') + ' stronger field operation boosted supporter turnout (ground ' + Math.round(pc.ground) + ' vs ' + Math.round(rival.ground) + ').');
    notes.push('Money: you spent ' + U.fmtMoney(pc.spent) + ' vs ' + U.fmtMoney(rival.spent) + (c.superPac.for || c.superPac.against ? '; outside groups spent ' + U.fmtMoney(c.superPac.for) + ' for you and ' + U.fmtMoney(c.superPac.against) + ' against' : '') + '.');
    notes.push('Name recognition ' + Math.round(pc.nameRec) + ' vs ' + Math.round(rival.nameRec) + '; favorability ' + Math.round(pc.fav) + ' vs ' + Math.round(rival.fav) + '.');
    const o = office(state);
    if (o.partisan && Math.abs(state.world.national.environment) >= 2) {
      const helps = (state.world.national.environment > 0) === (pc.party === 'R');
      notes.push('National environment ' + U.fmtLean(state.world.national.environment) + ' ' + (helps ? 'helped' : 'hurt') + ' you' + (state.date.year % 4 === 2 ? ' (midterm penalty for the president\'s party)' : '') + '.');
    }
    if (rival.incumbent) notes.push(rival.name + ' had the advantages of incumbency.');
    if (pc.incumbent) notes.push('Voters judged your record: approval ' + (state.gov ? Math.round(state.gov.approval.overall) + '%' : 'n/a') + '.');
    if (PG.scandals.heat(state) > 2) notes.push('Lingering scandal coverage cost you support.');
    if (pc.endorsements.length || rival.endorsements.length) notes.push('Endorsements: you ' + pc.endorsements.length + ', ' + rival.name + ' ' + rival.endorsements.length + '.');
    return notes;
  }

  PG.election = { ctxFor, candsFor, preview, runStage, buildNight, explainResult, TIMES };
})(globalThis.PG = globalThis.PG || {});
