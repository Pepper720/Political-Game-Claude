/* The shared effect language used by events, laws, executive orders and actions.
 * apply() mutates state and returns human-readable lines describing what changed,
 * which become the "why" trail in the log. */
(function (PG) {
  'use strict';
  const U = PG.util;

  // Blocs whose partisanship favors / opposes / sits between the player's party.
  function blocGroups(state, e) {
    const party = state.player.party;
    const base = [], opp = [], swing = [];
    for (const b of e.blocs) {
      const lean = party === 'R' ? b.lean : party === 'D' ? -b.lean : 0;
      if (party !== 'R' && party !== 'D') { (Math.abs(b.lean) < 25 ? swing : opp).push(b.id); continue; }
      if (lean > 18) base.push(b.id); else if (lean < -18) opp.push(b.id); else swing.push(b.id);
    }
    return { base, opp, swing };
  }

  function currentElectorate(state) {
    if (state.gov) return PG.juris.electorate(state, state.gov.key);
    if (state.campaign) return PG.campaign.electorate(state);
    return PG.juris.electorate(state, 'city');
  }

  // Expand an approval spec into { blocId: delta }.
  function expandApproval(state, spec) {
    const e = currentElectorate(state);
    const out = {};
    const add = (ids, v) => ids.forEach((id) => { out[id] = (out[id] || 0) + v; });
    if (typeof spec === 'number') { add(e.blocs.map((b) => b.id), spec); return out; }
    const g = blocGroups(state, e);
    if (spec.all) add(e.blocs.map((b) => b.id), spec.all);
    if (spec.base) add(g.base, spec.base);
    if (spec.swing) add(g.swing, spec.swing);
    if (spec.opp) add(g.opp, spec.opp);
    if (spec.blocs) for (const [k, v] of Object.entries(spec.blocs)) out[k] = (out[k] || 0) + v;
    return out;
  }

  function apply(state, eff, source) {
    if (!eff) return [];
    const lines = [];
    const p = state.player;
    const diff = PG.data.difficulty[state.difficulty];
    const scaleBad = (v) => (v < 0 ? v * diff.badNews : v);

    if (eff.approval !== undefined) {
      const deltas = expandApproval(state, eff.approval);
      if (state.gov) {
        for (const [b, v] of Object.entries(deltas)) state.gov.mods[b] = (state.gov.mods[b] || 0) + scaleBad(v);
      } else if (state.campaign) {
        const pc = PG.campaign.playerCand(state);
        if (pc) for (const [b, v] of Object.entries(deltas)) pc.blocBoost[b] = (pc.blocBoost[b] || 0) + scaleBad(v) * 0.6;
      }
      const avg = U.sum(Object.values(deltas)) / Math.max(1, Object.keys(deltas).length);
      lines.push('Approval ' + (avg >= 0 ? 'up' : 'down') + ' among ' + describeBlocs(deltas));
    }
    if (state.party) {
      const pp = state.party;
      if (eff.approval !== undefined && !state.gov && !state.campaign) {
        const v = typeof eff.approval === 'number' ? eff.approval : (eff.approval.all || 0) + (eff.approval.swing || 0) * 0.5 + (eff.approval.base || 0) * 0.3;
        pp.brand.fav = U.clamp(pp.brand.fav + v * 0.6, 15, 85);
      }
      if (eff.partyFunds) { const amt = Math.round(eff.partyFunds); pp.funds = Math.max(0, pp.funds + amt); lines.push('Party funds ' + (amt >= 0 ? '+' : '−') + U.fmtMoney(Math.abs(amt))); }
      if (eff.partyRec) { pp.brand.nameRec = U.clamp(pp.brand.nameRec + eff.partyRec, 0, 100); lines.push('Party name recognition ' + U.fmtSigned(eff.partyRec, 0)); }
      if (eff.partyFav) { pp.brand.fav = U.clamp(pp.brand.fav + eff.partyFav, 15, 85); lines.push('Party favorability ' + U.fmtSigned(eff.partyFav, 1)); }
      if (eff.partyMembers) { pp.members = Math.max(100, Math.round(pp.members * (1 + eff.partyMembers))); lines.push('Membership ' + U.fmtSigned(eff.partyMembers * 100, 0) + '%'); }
      if (eff.partyIdeo) { for (const k of ['econ', 'social']) if (eff.partyIdeo[k]) pp.ideology[k] = U.clamp(pp.ideology[k] + eff.partyIdeo[k], -100, 100); state.player.ideology = { ...pp.ideology }; pp.raceMemo = {}; lines.push('Platform shifted'); }
    }
    if (eff.record) {
      const deltas = expandApproval(state, eff.record);
      if (state.gov) for (const [b, v] of Object.entries(deltas)) state.gov.record[b] = (state.gov.record[b] || 0) + v;
    }
    if (eff.groups) {
      for (const [g, v] of Object.entries(eff.groups)) {
        if (!PG.data.groupById[g]) continue;
        PG.groups.change(state, g, v);
        lines.push(PG.data.groupById[g].name + ' ' + (v >= 0 ? '+' : '') + v);
      }
    }
    if (eff.media) { p.media = U.clamp(p.media + eff.media, -100, 100); lines.push('Press relations ' + U.fmtSigned(eff.media, 0)); }
    if (eff.capital) { p.capital = Math.max(0, p.capital + eff.capital); lines.push('Political capital ' + U.fmtSigned(eff.capital, 0)); }
    if (eff.partyRel) { p.partyRel = U.clamp(p.partyRel + eff.partyRel, 0, 100); lines.push('Party leadership ' + U.fmtSigned(eff.partyRel, 0)); }
    if (eff.cashPct) {
      const office = state.campaign ? state.campaign.officeId : (p.office ? p.office.officeId : 'city_council');
      const amt = Math.round(PG.juris.typicalBudget(state, office) * eff.cashPct);
      p.cash = Math.max(0, p.cash + amt);
      lines.push('Campaign cash ' + (amt >= 0 ? '+' : '') + U.fmtMoney(amt));
    }
    if (eff.nameRec) {
      p.nameRec = U.clamp(p.nameRec + eff.nameRec, 0, 100);
      const pc = state.campaign && PG.campaign.playerCand(state);
      if (pc) pc.nameRec = U.clamp(pc.nameRec + eff.nameRec, 0, 100);
      lines.push('Name recognition ' + U.fmtSigned(eff.nameRec, 0));
    }
    if (eff.fav) {
      const v = scaleBad(eff.fav);
      p.fav = U.clamp(p.fav + v, 5, 95);
      const pc = state.campaign && PG.campaign.playerCand(state);
      if (pc) pc.fav = U.clamp(pc.fav + v, 5, 95);
      lines.push('Favorability ' + U.fmtSigned(v, 1));
    }
    if (eff.oppFav && state.campaign) {
      PG.campaign.opponents(state).forEach((c) => { c.fav = U.clamp(c.fav + eff.oppFav, 5, 95); });
      lines.push('Opponents\' favorability ' + U.fmtSigned(eff.oppFav, 1));
    }
    if (eff.momentum && state.campaign) {
      const pc = PG.campaign.playerCand(state); if (pc) pc.momentum = U.clamp((pc.momentum || 0) + eff.momentum, -10, 10);
      lines.push('Momentum ' + U.fmtSigned(eff.momentum, 1));
    }
    if (eff.enthusiasm && state.campaign) {
      const pc = PG.campaign.playerCand(state); if (pc) pc.enthusiasm = U.clamp((pc.enthusiasm || 0) + eff.enthusiasm, -10, 25);
      lines.push('Base enthusiasm ' + U.fmtSigned(eff.enthusiasm, 0));
    }
    if (eff.ground && state.campaign) {
      const pc = PG.campaign.playerCand(state); if (pc) pc.ground = U.clamp((pc.ground || 0) + eff.ground, 0, 40);
      lines.push('Ground game ' + U.fmtSigned(eff.ground, 0));
    }
    if (eff.budgetPct && state.gov && state.gov.budget) {
      const amt = PG.budget.oneTime(state, eff.budgetPct);
      lines.push('Budget ' + (amt >= 0 ? '+' : '') + U.fmtMoney(amt) + ' (one-time)');
    }
    if (eff.spendingPct && state.gov && state.gov.budget) {
      PG.budget.adjustSpending(state, eff.spendingPct.cat, eff.spendingPct.pct);
      lines.push('Spending on ' + eff.spendingPct.cat + ' ' + U.fmtSigned(eff.spendingPct.pct * 100, 0) + '%');
    }
    if (eff.outcomes && state.gov) {
      for (const [k, v] of Object.entries(eff.outcomes)) {
        state.gov.outcomes[k] = U.clamp((state.gov.outcomes[k] || 50) + v, 0, 100);
        lines.push(U.cap(k) + ' ' + U.fmtSigned(v, 1));
      }
    }
    if (eff.economy) {
      PG.economy.shock(state, eff.economy, eff.national || (state.gov && state.gov.level === 'federal'));
      lines.push('Economy: ' + Object.entries(eff.economy).map(([k, v]) => k + ' ' + U.fmtSigned(v, 2)).join(', '));
    }
    if (eff.legRel && state.gov) {
      const ch = state.world.chambers[state.gov.body];
      if (ch) ch.members.forEach((m) => { m.rel = U.clamp((m.rel || 0) + eff.legRel, -100, 100); });
      lines.push('Relations with legislators ' + U.fmtSigned(eff.legRel, 0));
    }
    if (eff.presApproval) {
      const pr = state.world.executives.president;
      if (!(p.office && p.office.officeId === 'president')) pr.approval = U.clamp(pr.approval + eff.presApproval, 15, 80);
    }
    if (eff.flags) {
      (eff.flags.set || []).forEach((f) => { p.flags[f] = true; });
      (eff.flags.clear || []).forEach((f) => { delete p.flags[f]; });
    }
    if (eff.setFlag) p.flags[eff.setFlag] = true;
    if (eff.scandal) {
      PG.scandals.add(state, eff.scandal.text || (source && source.label) || 'Scandal', eff.scandal.severity || 3, eff.scandal.kind || 'event');
      lines.push('Scandal (severity ' + (eff.scandal.severity || 3) + ')');
    }
    if (eff.echo) {
      const list = Array.isArray(eff.echo) ? eff.echo : [eff.echo];
      list.forEach((ec) => PG.events.scheduleEcho(state, ec));
    }
    if (eff.log) PG.game.log(state, 'event', eff.log);
    return lines;
  }

  function describeBlocs(deltas) {
    const names = Object.entries(deltas).filter(([, v]) => Math.abs(v) >= 0.5).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3)
      .map(([k, v]) => (PG.data.blocById[k] ? PG.data.blocById[k].name : k) + ' ' + U.fmtSigned(v, 1));
    return names.length ? names.join(', ') : 'voters';
  }

  PG.effects = { apply, expandApproval, blocGroups, currentElectorate, describeBlocs };
})(globalThis.PG = globalThis.PG || {});
