// FIXLIST-M15 A3 -- creep that looks alive, without paying for it.
//
// Reported as "Creep should have some minor bubbling or ripples to make it look living". Creep was
// drawn as a flat cached texture and never moved.
//
// The interesting part of this item is not the bubbles, it is the CACHE. Creep is composed from chunk
// canvases baked at 8x8 tiles and keyed by the creep bits, which is what took the old renderer from
// three full-viewport operations a frame down to a handful of opaque blits. The obvious way to animate
// creep -- vary the bake -- invalidates that key every frame and hands back exactly what the cache was
// built to win. So the three things worth asserting are:
//
//   1. it only draws where creep actually is
//   2. it does not disturb the chunk cache, which is the whole performance argument
//   3. it is derived, not stored, so a replay seek cannot desync it and nothing needs restoring
//
// ...and the fourth, which is the item's stated constraint: RENDER ONLY. The build stamp must not move.
//
//   node test/creeplife.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const errors = [];
const fakeCanvas = () => ({ width: 64, height: 64, style: {}, addEventListener() { }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 64, height: 64 }), getContext: () => stub2d() });
const stub2d = () => ({ canvas: { width: 64, height: 64 }, save() { }, restore() { }, translate() { }, rotate() { }, scale() { }, clearRect() { }, fillRect() { }, strokeRect() { },
  beginPath() { }, moveTo() { }, lineTo() { }, closePath() { }, arc() { }, ellipse() { }, fill() { }, stroke() { }, clip() { }, drawImage() { }, putImageData() { }, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  createImageData: () => ({ data: new Uint8ClampedArray(4) }), createRadialGradient: () => ({ addColorStop() { } }), createLinearGradient: () => ({ addColorStop() { } }), createPattern: () => null,
  measureText: () => ({ width: 10 }), fillText() { }, strokeText() { }, setTransform() { }, transform() { }, setLineDash() { }, arcTo() { }, quadraticCurveTo() { }, bezierCurveTo() { }, rect() { }, roundRect() { } });
const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(a.join(' ')) }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  localStorage: { getItem() { return null; }, setItem() { } }, location: { protocol: 'http:', host: 'localhost' },
  devicePixelRatio: 1, OffscreenCanvas: function (w, h) { return fakeCanvas(); },
  document: { getElementById: () => fakeCanvas(), createElement: () => fakeCanvas(), addEventListener() { }, hasFocus: () => true, body: { appendChild() { } }, querySelectorAll: () => [] } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'missions', 'net', 'terrain',
  'sprites_units', 'sprites_buildings', 'sprites', 'fx', 'render'])
  vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const J = s => JSON.parse(vm.runInContext('JSON.stringify(' + s + ')', ctx));

// A ctx that records WHERE it was asked to draw, which is the only thing this file cares about.
const SCENE = `
  const rec = { pts: [], alphas: [] };
  const rc = { _a: 1, save() { }, restore() { }, beginPath() { }, fill() { }, translate() { }, rotate() { },
    set globalCompositeOperation(v) { }, set fillStyle(v) { }, set globalAlpha(v) { this._a = v; },
    ellipse(x, y, rx) { rec.pts.push([Math.round(x), Math.round(y), +rx.toFixed(2)]); rec.alphas.push(+this._a.toFixed(4)); },
    arc(x, y, r) { rec.pts.push([Math.round(x), Math.round(y), +r.toFixed(2)]); rec.alphas.push(+this._a.toFixed(4)); } };
  G.init({ players: [{ race: 'Z', human: true, difficulty: 'hard', name: 'You', team: 1 },
                     { race: 'T', human: false, difficulty: 'hard', name: 'B', team: 2 }], seed: 3, layout: 'temple' });
  G.checkVictory = () => { };
  Render.zoom = 1; Render.camX = 0; Render.camY = 0;
  Render.viewWorldW = () => 40 * TILE; Render.viewWorldH = () => 30 * TILE;
  const m = G.map;
  const clearCreep = () => m.creep.fill(0);
  const creepRect = (x0, y0, x1, y1) => { for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) m.creep[m.idx(tx, ty)] = 1; };
  const draw = () => { rec.pts = []; rec.alphas = []; Render.drawCreepLife(rc, Render.camX, Render.camY); return rec; };
`;

// =============================================================================
// 1. it exists, it is wired in, and it is render-only
// =============================================================================
{
  const src = fs.readFileSync(path.join(root, 'js', 'render.js'), 'utf8');
  ok(/drawCreepLife\(ctx, ox, oy\)/.test(src), 'Render.drawCreepLife exists');
  ok(/this\.drawCreepLife\(ctx, ox, oy\);/.test(src), '...and drawCreep actually calls it, rather than it sitting there unreferenced');
  // The item says RENDER ONLY. js/render.js is not one of the files js/build.js hashes; this asserts
  // that is still true rather than trusting it, because moving the stamp breaks every saved game.
  const build = fs.readFileSync(path.join(root, 'js', 'build.js'), 'utf8');
  ok(!/'render'/.test(build) && !/render\.js/.test(build), 'js/render.js is NOT hashed by the build stamp, so this item cannot move it');
  // COMMENTS STRIPPED FIRST. The first version of this check matched the sentence in the code that
  // says it must never call G.rand(), and went red against code that does not call it -- a test
  // reading its own documentation back and failing on it.
  const body = src.slice(src.indexOf('  drawCreepLife(ctx, ox, oy) {'), src.indexOf('  frame(alpha) {'))
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  ok(body.length > 200, 'the function body was actually found, so the next check is not vacuous', String(body.length));
  ok(!/G\.rand\(/.test(body),
    'and it never draws from G.rand() -- that is the simulation stream and using it here would desync a replay');
}

// =============================================================================
// 2. it draws where creep is, and NOWHERE ELSE
// =============================================================================
const where = J(`(() => { ${SCENE}
  clearCreep();
  const none = draw().pts.length;
  creepRect(4, 4, 16, 16);
  const some = draw();
  // every bubble must land inside the creeped rectangle, in screen space with the camera at 0,0
  const outside = some.pts.filter(([x, y]) => x < 4 * TILE - 8 || x > 17 * TILE + 8 || y < 4 * TILE - 8 || y > 17 * TILE + 8);
  return { none, some: some.pts.length, outside: outside.length, sample: some.pts.slice(0, 3) };
})()`);
ok(where.none === 0, 'NEGATIVE CONTROL: with no creep on the map it draws nothing at all', String(where.none));
ok(where.some > 0, 'and with creep it draws something', JSON.stringify(where.sample));
ok(where.outside === 0, 'EVERY bubble lands on creep -- none of them strays onto bare ground', String(where.outside) + ' outside');

// =============================================================================
// 3. derived, not stored -- so a replay seek cannot desync it
// =============================================================================
const det = J(`(() => { ${SCENE}
  clearCreep(); creepRect(4, 4, 16, 16);
  G.frame = 500; const a = JSON.stringify(draw().pts);
  G.frame = 900; const b = JSON.stringify(draw().pts);
  G.frame = 500; const c = JSON.stringify(draw().pts);     // go BACK, as a replay seek does
  return { same: a === c, moved: a !== b, n: JSON.parse(a).length };
})()`);
ok(det.same, 'the same frame always draws the same thing -- seek a replay backwards and the creep matches');
ok(det.moved, 'ANTI-VACUITY: and a different frame draws something different, so it is genuinely animating');

// ...and it is animation, not a flicker: a site fades in and out rather than popping.
const smooth = J(`(() => { ${SCENE}
  clearCreep(); creepRect(4, 4, 16, 16);
  let worst = 0, prev = null;
  for (let f = 0; f < 240; f += 4) {
    G.frame = f; const r = draw();
    const tot = r.alphas.reduce((s, a) => s + a, 0);
    if (prev !== null) worst = Math.max(worst, Math.abs(tot - prev));
    prev = tot;
  }
  return { worst: +worst.toFixed(3), peak: prev };
})()`);
ok(smooth.worst < 1.0, 'and it changes smoothly frame to frame rather than popping on and off', 'worst jump ' + smooth.worst);

// =============================================================================
// 4. it does not disturb the chunk cache -- the whole performance argument
// =============================================================================
const cache = J(`(() => { ${SCENE}
  clearCreep(); creepRect(4, 4, 16, 16);
  Terrain.resetCreep(); Terrain.syncCreep();
  Terrain.creepBudget = 99; for (let cy = 0; cy < 3; cy++) for (let cx = 0; cx < 3; cx++) Terrain.creepChunk(cx, cy);
  const built = Terrain.creepChunks.size;
  const sigs = [...Terrain.creepChunks.values()].map(e => e.sig).join(',');
  for (let f = 0; f < 120; f++) { G.frame = f; draw(); }
  const after = [...Terrain.creepChunks.values()].map(e => e.sig).join(',');
  return { built, stable: sigs === after, size: Terrain.creepChunks.size };
})()`);
ok(cache.built > 0, 'the scene is real: creep chunks were actually baked', String(cache.built));
ok(cache.stable && cache.size === cache.built,
  'THE CACHE IS UNTOUCHED after 120 animated frames -- the bubbles are an overlay, not a re-bake', JSON.stringify(cache));

// =============================================================================
// 5. it stays cheap, and it gets out of the way when zoomed out
// =============================================================================
const cost = J(`(() => { ${SCENE}
  clearCreep(); creepRect(0, 0, 39, 29);           // creep over the entire viewport, the worst case
  G.frame = 40;
  const full = draw().pts.length;
  Render.zoom = 0.3;
  const zoomed = draw().pts.length;
  Render.zoom = 1;
  return { full, zoomed, tiles: 40 * 30 };
})()`);
ok(cost.full > 0 && cost.full < 400, 'a viewport that is ENTIRELY creep still draws only a couple of hundred bubbles',
  cost.full + ' over ' + cost.tiles + ' tiles');
ok(cost.zoomed === 0, 'and at a strategic zoom it draws nothing, where it would be sub-pixel anyway', String(cost.zoomed));

// =============================================================================
// 6. a real game, not a hand-filled array
// =============================================================================
// The checks above write creep into the grid directly. This one lets a Hatchery make it, so the
// feature is proved against creep the game produced.
const live = J(`(() => { ${SCENE}
  for (let i = 0; i < 40; i++) G.tick();
  const hatch = G.units.find(u => u.alive && u.owner === 0 && u.def.depot);
  Render.camX = Math.max(0, hatch.x - 20 * TILE); Render.camY = Math.max(0, hatch.y - 15 * TILE);
  G.frame = 60;
  const r = Render.drawCreepLife ? (() => { rec.pts = []; rec.alphas = []; Render.drawCreepLife(rc, Render.camX, Render.camY); return rec; })() : { pts: [] };
  return { hatch: !!hatch, bubbles: r.pts.length };
})()`);
ok(live.hatch, 'a real Hatchery exists and has laid creep');
ok(live.bubbles > 0, 'and the creep it laid bubbles in a running game', String(live.bubbles));

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
