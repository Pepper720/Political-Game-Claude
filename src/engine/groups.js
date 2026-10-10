/* Interest groups, donor commitments, media relations, and scandals. */
(function (PG) {
  'use strict';
  const U = PG.util, R = PG.rng;

  function group(id) { return PG.data.groupById[id]; }

  function ideoAlignment(a, b) {
    // −1 (opposite) .. +1 (aligned), based on distance in ideological space.
    const d = PG.voters.dist(a, b);
    return U.clamp(1 - d / 90, -1, 1);
  }

  function init(state) {
    const p = state.player;
    const bg = PG.data.backgroundById[p.background];
    for (const g of PG.data.groups) {
      let rel = ideoAlignment(g.ideo, p.ideology) * 20;
      rel += (bg.groups && bg.groups[g.id]) || 0;
      state.groups[g.id] = { rel: U.round(U.clamp(rel, -60, 60), 1), endorsed: null, history: [] };
    }
    for (const o of PG.data.outlets) state.media[o.id] = { rel: U.round(-Math.abs(o.lean - (p.ideology.econ + p.ideology.social) / 2) / 6 + 5, 1) };
  }

  function rel(state, gid) { return state.groups[gid] ? state.groups[gid].rel : 0; }

  function change(state, gid, delta, why) {
    const g = state.groups[gid];
    if (!g) return;
    g.rel = U.round(U.clamp(g.rel + delta, -100, 100), 1);
    if (why) { g.history.unshift({ date: { ...state.date }, delta: U.round(delta, 1), why }); if (g.history.length > 12) g.history.length = 12; }
  }

  // How much a group likes a law: sum of its tag preferences.
  function stanceOnLaw(g, law) {
    let s = 0;
    for (const t of law.tags || []) s += g.tags[t] || 0;
    return s;
  }

  function activeAt(g, level) { return g.levels.includes(level); }

  /* The player took a position on a law. action weight: sponsor 1.2, sign 1, vote 0.7, veto −1, vote no −0.7.
   * Returns causal lines. */
  function reactToLaw(state, law, scope, weight, verb) {
    const lines = [];
    const level = state.gov ? state.gov.level : 'city';
    const mult = PG.data.scopes[(scope || 2) - 1].mult;
    for (const g of PG.data.groups) {
      if (!activeAt(g, level)) continue;
      const s = stanceOnLaw(g, law);
      if (!s) continue;
      const d = U.round(s * 3.2 * mult * weight, 1);
      change(state, g.id, d, verb + ' ' + law.name);
      if (Math.abs(d) >= 3) lines.push(g.name + ' ' + U.fmtSigned(d, 0));
    }
    lines.push.apply(lines, checkCommitments(state, law, weight > 0));
    return lines;
  }

  /* Donor commitments: promises implied by big checks. Supporting/opposing a law with a
   * tag the donor cares about honors or breaks the commitment. */
  function addCommitment(state, gid) {
    const g = group(gid);
    const tags = Object.entries(g.tags).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (!tags.length) return null;
    const [tag, stance] = tags[0];
    if (state.player.commitments.some((c) => c.groupId === gid && c.tag === tag && c.status === 'open')) return null;
    const c = { id: U.nextId(state, 'cm'), groupId: gid, tag, stance: Math.sign(stance), status: 'open', date: { ...state.date },
      text: g.name + ' expects you to ' + (stance > 0 ? 'support' : 'oppose') + ' ' + tagLabel(tag) + ' measures.' };
    state.player.commitments.push(c);
    return c;
  }

  function checkCommitments(state, law, supported) {
    const lines = [];
    for (const c of state.player.commitments) {
      if (c.status !== 'open' || !(law.tags || []).includes(c.tag)) continue;
      const honored = (c.stance > 0) === supported;
      c.status = honored ? 'honored' : 'broken';
      c.resolved = { ...state.date, law: law.name };
      const g = group(c.groupId);
      if (honored) {
        change(state, c.groupId, 6, 'Kept your word on ' + law.name);
        lines.push('Kept commitment to ' + g.name);
      } else {
        change(state, c.groupId, -22, 'Broke your commitment on ' + law.name);
        state.player.media = U.clamp(state.player.media - 2, -100, 100);
        lines.push('Broke commitment to ' + g.name + ' — expect their money to flow to your opponents');
        state.player.flags['burned_' + c.groupId] = true;
      }
    }
    return lines;
  }

  function tagLabel(tag) {
    const map = { public_schools: 'public-school funding', labor: 'pro-labor', school_choice: 'school-choice', tax_hike: 'tax-increase', tax_cut: 'tax-cut',
      spending_cut: 'spending-cut', police_fund: 'police-funding', police_reform: 'police-reform', min_wage: 'minimum-wage', anti_union: 'right-to-work', business: 'pro-business',
      deregulation: 'deregulation', regulation: 'new regulation', guns_expand: 'gun-rights', guns_restrict: 'gun-control', environment: 'environmental', fossil: 'energy-production',
      abortion_restrict: 'abortion-restriction', abortion_protect: 'abortion-rights', religious_liberty: 'religious-liberty', civil_liberties: 'civil-liberties', seniors: 'senior-benefit',
      agriculture: 'farm', healthcare_market: 'market health-care', healthcare_public: 'public health-coverage', tech_reg: 'tech-regulation', housing_build: 'housing-construction',
      rent_control: 'rent-control', zoning_local: 'local-zoning', immigration_open: 'pro-immigration', immigration_restrict: 'immigration-enforcement', curriculum_parent: 'parental-rights',
      lgbt_rights: 'LGBTQ-rights', transparency: 'transparency', good_government: 'good-government', criminal_justice_reform: 'justice-reform', tough_on_crime: 'tough-on-crime',
      veterans: 'veterans', defense: 'defense', trade_protect: 'tariff', trade_free: 'free-trade', welfare: 'safety-net', infrastructure: 'infrastructure', drug_liberalize: 'drug-legalization',
      family: 'family', voting_access: 'voting-access', election_security: 'election-security', border_deal: 'immigration-deal', quality: 'quality-of-life', phone: 'school-phone' };
    return map[tag] || tag.replace(/_/g, ' ');
  }

  // Groups' lobbying intensity on a bill (positive = pushing yes). Used by legislators.
  function lobbying(state, law, level, playerIsSponsor) {
    const out = [];
    for (const g of PG.data.groups) {
      if (!activeAt(g, level)) continue;
      const s = stanceOnLaw(g, law);
      if (!s) continue;
      let intensity = s * (0.6 + g.money * 0.15);
      // Groups that feel snubbed by the player work harder against the player's bills.
      if (playerIsSponsor && rel(state, g.id) < -30 && s < 0) intensity *= 1.4;
      out.push({ id: g.id, name: g.name, intensity, ideo: g.ideo });
    }
    return out;
  }

  /* Monthly: hostile, well-funded groups run issue ads against an officeholder; friendly
   * ones run cover. Returns lines for the log. */
  function monthly(state) {
    if (!state.gov) return;
    const lvl = state.gov.level;
    for (const g of PG.data.groups) {
      if (!activeAt(g, lvl)) continue;
      const r = rel(state, g.id);
      // Relationships slowly cool toward neutral-ish baseline.
      state.groups[g.id].rel = U.round(state.groups[g.id].rel * 0.995, 2);
      if (Math.abs(r) < 45 || !R.chance(state, 0.04 * g.money)) continue;
      const sign = r > 0 ? 1 : -1;
      for (const [b, w] of Object.entries(g.blocs)) state.gov.mods[b] = (state.gov.mods[b] || 0) + sign * w * 0.7;
      PG.game.log(state, 'groups', g.name + (sign > 0 ? ' ran ads praising you.' : ' launched an ad campaign against you.'),
        ['Relationship ' + U.round(r) + '; they reach ' + Object.keys(g.blocs).map((b) => PG.data.blocById[b].name).join(', ')]);
    }
  }

  // Meeting with a group in office: costs capital, improves relations modestly.
  function meet(state, gid) {
    const p = state.player;
    if (p.capital < 3) return { ok: false, msg: 'Not enough political capital.' };
    p.capital -= 3;
    const g = group(gid);
    const before = rel(state, gid);
    const gain = U.round(4 + (before < 0 ? 3 : 0) + R.range(state, 0, 3), 1);
    change(state, gid, gain, 'Met with leadership');
    // Other side notices.
    for (const o of PG.data.groups) {
      if (o.id !== gid && ideoAlignment(o.ideo, g.ideo) < -0.6) change(state, o.id, -1, 'You courted ' + g.name);
    }
    return { ok: true, msg: 'Met with ' + g.name + ' (+' + gain + ').' };
  }

  // ----- Scandals -----
  function add(state, text, severity, kind) {
    const s = { id: U.nextId(state, 'sc'), text, severity: U.round(severity, 1), kind: kind || 'event', date: { ...state.date }, heat: severity };
    state.player.scandals.push(s);
    PG.game.news(state, 'Controversy: ' + text, -2);
    PG.game.log(state, 'scandal', 'Scandal: ' + text + ' (severity ' + s.severity + ')');
    return s;
  }
  // Scandal "heat" fades over time; total current heat weighs on approval and favorability.
  function heat(state) { return U.sum(state.player.scandals, (s) => s.heat || 0); }
  function decay(state) {
    for (const s of state.player.scandals) s.heat = U.round(Math.max(0, (s.heat || 0) * 0.85 - 0.1), 2);
  }

  PG.groups = { init, rel, change, stanceOnLaw, reactToLaw, addCommitment, checkCommitments, lobbying, monthly, meet, ideoAlignment, tagLabel, activeAt };
  PG.scandals = { add, heat, decay };
})(globalThis.PG = globalThis.PG || {});
