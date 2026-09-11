'use strict';
// ============================================================================
// Combat: weapon firing, splash, special attack types, projectiles.
// ============================================================================
const Combat = {
  fire(a, t, w) {
    const p = a.player; const dmg = a.wDmg(w);
    const ranged = w.range > 1 && !a.def.worker;
    const vis = G.visibleAt(G.human, a.x, a.y) || G.visibleAt(G.human, t.x, t.y);
    if (typeof Sound !== 'undefined' && vis) Sound.attack(a);
    // Dark Swarm: ranged non-splash attacks against ground units under swarm miss
    const swarmed = ranged && !t.fly && !w.splash && !w.line && !w.glaive && Abilities.inField(t.x, t.y, 'swarm');
    if (w.suicide) { this.explode(a, t, w); return; }
    if (w.scarab) { if (a.scarabs <= 0) { a.cooldown = 8; return; } a.scarabs--; const s = G.spawnUnit('scarab', a.owner, a.x + Math.cos(a.facing) * a.r, a.y + Math.sin(a.facing) * a.r); s.parent = a; s.lifetime = 110; s.facing = a.facing; s.applyOrder({ type: 'scarab', target: t }); return; }
    if (w.interceptor) { a.launched = a.launched || []; for (const ic of a.launched) if (ic.alive) { ic.order.target = t; if (ic.order.type === 'dock') ic.applyOrder({ type: 'intercept', target: t }); } if (a.interceptors > 0 && !(a.launchCd > 0)) { const ic = G.spawnUnit('interceptor', a.owner, a.x, a.y + 6); ic.parent = a; ic.facing = a.facing; ic.applyOrder({ type: 'intercept', target: t }); a.interceptors--; a.launched.push(ic); a.launchCd = 8; } a.cooldown = 6; return; }
    if (w.glaive) { this.visual(a, t, 'glaive'); let cur = t, d = dmg; const hit = [t]; for (let b = 0; b < 3 && cur; b++) { if (!swarmed || b > 0) G.damage(cur, d, w.type, a); d = Math.max(1, Math.floor(d / 3)); let nx = null, nd = 1e9; for (const o of G.near(cur.x, cur.y, 3 * TILE)) { if (hit.includes(o) || o.owner === a.owner || !G.targetable(a, o) || o.isBuilding && false) continue; const dd = dist(o, cur); if (dd < nd) { nd = dd; nx = o; } } if (nx) { hit.push(nx); G.effects.push({ kind: 'line', x: cur.x, y: cur.y, tx: nx.x, ty: nx.y, t: 6, color: '#8f8' }); } cur = nx; } return; }
    // A LINE HITS EVERYTHING ALONG IT AT ONCE. Two weapons use this: the Lurker's spines and the
    // Hellion's flame. FIXLIST-M14 C5 (item 20) reported the Hellion's as broken; it was measured
    // first, and it was not -- one Hellion into a row of five marines hit FIVE of five for 9 each. The
    // damage was always right. What was wrong was everything around it, and all three are fixed here.
    //
    //   LENGTH came from a hardcoded 6 * TILE regardless of the weapon. The Hellion's range is 5, so
    //   it reached a full tile past what its own table said -- measured: a lone target hit at 5.5 and
    //   6.0 tiles and missed at 6.5. It now comes from wRange, which is the same number Unit.inRange
    //   uses to decide the shot was legal in the first place, so the two can no longer disagree. The
    //   Lurker's range IS 6, the number that was baked in, so this leaves the Lurker exactly as it was
    //   -- that was checked before the change rather than hoped for afterwards.
    //
    //   THE EFFECT was `{ kind: 'spines' }` for both, written for the Lurker, so a Hellion firing drew
    //   subterranean spines. It comes off the weapon now (`w.fx`), because two weapons sharing a look
    //   by accident is how the report happened.
    //
    //   FLYERS were skipped by this branch rather than by either weapon. Both line weapons are
    //   ground-only, so the answer was right and the reason was not: it now reads `w.targets`, like
    //   every other weapon in the game, and a line weapon that could hit air would work without
    //   anybody editing this.
    //
    //   FRIENDLY FIRE stays OFF, and that is a decision rather than an omission. `splash: true` here
    //   is the damage TYPE flag, not permission to hit allies -- the ff opt-in that Combat.splash
    //   reads is deliberately not set. A flame that cooked your own marines would make the Hellion
    //   unusable in the bio ball it is built to escort, and no part of the report asked for it.
    if (w.line) {
      const ang = Math.atan2(t.y - a.y, t.x - a.x);
      const len = a.wRange(w) * TILE;
      G.effects.push({ kind: w.fx || 'spines', x: a.x, y: a.y, tx: a.x + Math.cos(ang) * len, ty: a.y + Math.sin(ang) * len, t: 12 });
      const hitsAir = w.targets === 'air' || w.targets === 'both';
      for (const o of G.near(a.x + Math.cos(ang) * len / 2, a.y + Math.sin(ang) * len / 2, len / 2 + 16)) {
        if (o.owner === a.owner || !o.alive || o.inside) continue;
        if (o.fly ? !hitsAir : w.targets === 'air') continue;
        const rx = o.x - a.x, ry = o.y - a.y;
        const proj = rx * Math.cos(ang) + ry * Math.sin(ang); if (proj < 0 || proj > len) continue;
        const perp = Math.abs(-rx * Math.sin(ang) + ry * Math.cos(ang));
        if (perp <= o.r + 8) G.damage(o, dmg, w.type, a, { splash: true });
      }
      return;
    }
    this.visual(a, t, w);
    if (w.splash) { for (let h = 0; h < w.hits; h++) this.splash(a, t.x, t.y, dmg, w, t); return; }
    for (let h = 0; h < w.hits; h++) { if (swarmed) { G.effects.push({ kind: 'text', x: t.x, y: t.y - 10, text: 'miss', t: 20, color: '#aaa' }); continue; } G.damage(t, dmg, w.type, a); }
    if (w.acidSpores && t.alive) t.acidSpores = Math.min(9, t.acidSpores + 1);
  },
  splash(a, x, y, dmg, w, primary) {
    const [r1, r2, r3] = w.splash; const air = w.targets === 'air';
    if (primary && primary.alive) G.damage(primary, dmg, w.type, a);
    for (const o of G.near(x, y, r3 * TILE + 8)) {
      if (o === primary || !o.alive || o.inside) continue;
      if (!w.ff && o.owner === a.owner) continue;
      if (air ? !o.fly : (o.fly && !(w.targets === 'both'))) continue;
      const d = Math.max(0, distPt(o.x, o.y, x, y) - o.r) / TILE;
      const m = d <= r1 ? 1 : d <= r2 ? 0.5 : d <= r3 ? 0.25 : 0; if (!m) continue;
      G.damage(o, dmg * m, w.type, a, { splash: true });   // a blast has no direction; see FACE_MULT
    }
    // ...and the ground itself. This is what lets a siege line open a lane through a rock formation or
    // drop a bridge -- destructible terrain that only splash can reach, which is the whole point of it
    // being terrain rather than a building. Contract is documented above GameMap.placeFeatures.
    G.map.damageFeatureAt(x, y, dmg);
    G.effects.push({ kind: 'boom', x, y, t: 12, r: r2 * TILE * 0.6 });
  },
  explode(a, t, w) { const dmg = a.wDmg(w); if (t) this.splash(a, t.x, t.y, dmg, Object.assign({ splash: w.splash || [0.3, 0.3, 0.3] }, w), t); G.effects.push({ kind: 'boom', x: a.x, y: a.y, t: 14, r: 24 }); G.kill(a, null, true); },
  visual(a, t, w) {
    const k = w === 'glaive' ? 'glaive' : a.def.id;
    let kind = 'bullet', color = '#ffe';
    if (w === 'glaive') kind = 'glaive';
    else if (['marine', 'ghost', 'vulture', 'wraith', 'battlecruiser', 'goliath'].includes(k)) { kind = 'bullet'; color = '#ffd'; }
    else if (['siege_tank', 'dragoon', 'sunken_colony', 'hydralisk', 'missile_turret', 'valkyrie', 'devourer', 'guardian', 'scout', 'arbiter'].includes(k)) { kind = 'missile'; color = k === 'dragoon' ? '#6cf' : '#fc8'; }
    else if (['photon_cannon', 'corsair', 'spore_colony'].includes(k)) { kind = 'laser'; color = '#8cf'; }
    else if (k === 'firebat') { kind = 'flame'; }
    else if (['zealot', 'zergling', 'ultralisk', 'dark_templar', 'broodling', 'scv', 'probe', 'drone'].includes(k)) { kind = 'slash'; }
    else if (k === 'archon') { kind = 'laser'; color = '#adf'; }
    G.effects.push({ kind, x: a.x, y: a.y, tx: t.x, ty: t.y, t: kind === 'laser' ? 6 : kind === 'missile' ? 8 : 4, color });
  },
  tickProjectiles() {
    const ps = G.projectiles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]; if (p.delay > 0) { p.delay--; continue; }
      p.life--; const t = p.target;
      if (!t || !t.alive || p.life <= 0) { ps.splice(i, 1); continue; }
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
      if (p.kind === 'nuke') { if (--p.timer <= 0) { Abilities.nukeImpact(p); ps.splice(i, 1); } continue; }
      if (d <= p.spd + t.r * 0.5) {
        if (p.kind === 'yamato') { G.damage(t, 260, 'explosive', p.src); G.effects.push({ kind: 'boom', x: t.x, y: t.y, t: 20, r: 30 }); }
        ps.splice(i, 1); continue;
      }
      p.x += dx / d * p.spd; p.y += dy / d * p.spd;
    }
  },
};
