// High ground applied, and the vision bug that finding it uncovered.
//
// test/verticality.js covers the QUERY -- map.heightAt, heightAdvantage, heightBonus and the terrain
// promise that a ramp is the only way up. This covers what the simulation does with the answer: range,
// sight and damage, and who is exempt.
//
// It also pins G.circle's rounding, which is the more serious half. G.circle iterates `dy = -r; dy <= r;
// dy++`, so a FRACTIONAL radius makes every offset fractional, `y * w + x` a non-integer index, and a
// typed array read at a non-integer index is undefined rather than a throw. The height test compares
// undefined and is false, so a unit whose sight was not a whole number marked NO TILES AT ALL. Nothing
// had fractional sight when that loop was written; the night penalty, the jammer aura and the
// high-ground bonus all do. On a night map every ground unit went blind while detectors, whose sight
// stayed round, kept seeing -- which is how it was reported: as a broken renderer.
//   node test/highground.js
const vm = require('vm'), { makeCtx, ok, summary } = require('./_harness');
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'snapshot'], ext: false });

const r = vm.runInContext(`(() => {
  const out = {};
  const init = (layout) => G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 5, layout: layout || 'temple' });

  // ---- G.circle: the radius is rounded, so a fractional sight is not silently blind ----
  init();
  out.circle = {
    int7: G.circle(7).length,
    frac: G.circle(7.4).length,
    roundsUp: G.circle(7.6).length === G.circle(8).length,
    allInteger: G.circle(5.25).every(([dx, dy]) => Number.isInteger(dx) && Number.isInteger(dy)),
    zero: G.circle(0).length, negative: G.circle(-3).length,
  };

  // The regression itself, measured the way the player sees it: how many tiles does one unit light up?
  const m = G.map;
  const countVis = (u, sight) => {
    const p = G.players[0]; p.vis.fill(0);
    const uh = u.heightLevel();
    for (const [dx, dy] of G.circle(sight)) {
      const x = Math.floor(u.x / TILE) + dx, y = Math.floor(u.y / TILE) + dy;
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
      const i = y * m.w + x; if (m.height[i] <= uh) p.vis[i] = 2;
    }
    let n = 0; for (const v of p.vis) if (v === 2) n++; return n;
  };
  const scv = G.units.find(u => u.alive && u.owner === 0 && u.def.worker);
  out.fractional = { whole: countVis(scv, 7), fraction: countVis(scv, 5.25) };

  // ...and end to end, through the real vision pass on a real night map.
  G.init({ players: [{ race: 'Z', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 3, layout: 'nightfall' });
  const p0 = G.players[0];
  G.frame = 0; G.updateVision();
  let day = 0; for (const v of p0.vis) if (v === 2) day++;
  const drone = G.units.find(u => u.alive && u.owner === 0 && u.def.id === 'drone');
  const daySight = drone.sight;
  G.frame = 8640; G.updateVision();
  let night = 0; for (const v of p0.vis) if (v === 2) night++;
  out.night = { day, night, daySight, nightSight: drone.sight, daylight: +G.daylight.toFixed(4) };

  // ---- range: high ground shoots further, and only at something lower ----
  init();
  const T = TILE;
  let lo = null, hi = null;
  for (let y = 3; y < m.h - 3 && !hi; y++) for (let x = 3; x < m.w - 3; x++) {
    const i = m.idx(x, y); if (m.height[i] !== 2 || m.walk[i] !== 1) continue;
    for (let d = 2; d < 7; d++) { const j = m.idx(x + d, y); if (m.height[j] === 0 && m.walk[j] === 1) { hi = [x, y]; lo = [x + d, y]; break; } }
    if (hi) break;
  }
  out.foundPair = !!(hi && lo);
  if (hi) {
    const up = G.spawnUnit('marine', 0, (hi[0] + 0.5) * T, (hi[1] + 0.5) * T);
    const down = G.spawnUnit('marine', 1, (lo[0] + 0.5) * T, (lo[1] + 0.5) * T);
    const w = up.def.gw;
    out.range = { base: up.wRange(w), downhill: +up.wRangeAt(w, down).toFixed(4), uphill: +down.wRangeAt(w, up).toFixed(4) };
    out.sight = { high: up.sight, low: down.sight, base: up.def.sight };
    // damage. Facing is set toward the attacker so directional armour contributes exactly 1.
    up.facing = Math.atan2(down.y - up.y, down.x - up.x);
    down.facing = Math.atan2(up.y - down.y, up.x - down.x);
    const dDown = G.damage(down, 20, 'normal', up, {});      // high ground shooting DOWN
    const dUp = G.damage(up, 20, 'normal', down, {});        // low ground shooting UP
    out.damage = { down: +dDown.toFixed(4), up: +dUp.toFixed(4) };
    // splash is exempt, exactly as it is exempt from facing
    up.hp = up.maxHp; down.hp = down.maxHp;
    const sDown = G.damage(down, 20, 'normal', up, { splash: true });
    const sUp = G.damage(up, 20, 'normal', down, { splash: true });
    out.splash = { down: +sDown.toFixed(4), up: +sUp.toFixed(4) };
    // ...and so is anything flying, because the map answers about the ground beneath it
    const wr = G.spawnUnit('wraith', 1, (lo[0] + 0.5) * T, (lo[1] + 0.5) * T);
    const aw = up.weaponFor(wr) || up.def.gw;
    out.flyer = { range: +up.wRangeAt(aw, wr).toFixed(4), base: up.wRange(aw), sight: wr.sight, defSight: wr.def.sight };
  }
  return out;
})()`, ctx);

ok(r.circle.frac === r.circle.int7, 'a fractional radius yields the same offsets as the nearest whole one', JSON.stringify(r.circle));
ok(r.circle.roundsUp, '...rounding, not truncating', JSON.stringify(r.circle));
ok(r.circle.allInteger, 'every offset is a whole number of tiles -- a fractional one indexes a typed array at a non-integer and reads undefined', JSON.stringify(r.circle));
ok(r.circle.zero === 1 && r.circle.negative === 1, 'and a zero or negative radius is one tile, not a throw', JSON.stringify(r.circle));

ok(r.fractional.fraction > 0, 'a unit with fractional sight lights up tiles at all -- it used to light up NONE', JSON.stringify(r.fractional));
ok(r.fractional.fraction < r.fractional.whole, '...and fewer of them than one with full sight, which is what the penalty is for', JSON.stringify(r.fractional));

ok(r.night.nightSight < r.night.daySight, 'night shortens sight on a night map', JSON.stringify(r.night));
ok(!Number.isInteger(r.night.nightSight), '...to a fractional value, which is precisely what used to blind it', JSON.stringify(r.night));
ok(r.night.night > 0, 'and the player can still see something at the bottom of the night', JSON.stringify(r.night));
ok(r.night.night < r.night.day, '...less than in daylight, but not nothing', JSON.stringify(r.night));

ok(r.foundPair, 'the map has a high tile within five of a low one to measure against');
ok(r.range.downhill > r.range.base, 'shooting downhill reaches further', JSON.stringify(r.range));
ok(r.range.uphill === r.range.base, 'shooting uphill reaches no further and no less', JSON.stringify(r.range));
ok(r.sight.high > r.sight.low, 'standing on high ground sees further', JSON.stringify(r.sight));

ok(r.damage.up < r.damage.down, 'a shot fired uphill hurts less than the same shot fired down', JSON.stringify(r.damage));
ok(Math.abs(r.damage.up / r.damage.down - 0.70) < 0.001, '...by exactly the table’s 0.70, and by damage rather than a miss roll, so combat gains no new randomness', JSON.stringify(r.damage));
ok(r.splash.up === r.splash.down, 'splash is exempt -- a blast does not come from a direction, uphill or otherwise', JSON.stringify(r.splash));
ok(r.flyer.range === r.flyer.base, 'a flying target grants no height bonus: the map would answer about the ground under it', JSON.stringify(r.flyer));
ok(r.flyer.sight === r.flyer.defSight, '...and a flyer gains no height sight bonus either', JSON.stringify(r.flyer));

summary({ word: 'FAILURES' });
