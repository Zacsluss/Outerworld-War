'use strict';
// ============================================================================
// Map: terrain grid, cliffs/ramps, resources, creep, psi power, placement.
// height: 0 low ground, 1 ramp, 2 high ground. walk: 1 walkable.
// ============================================================================
// Map layouts. Coordinates are quadrant-0 tiles, mirrored 4-fold. Mains listed first.
const MAP_LAYOUTS = {
  temple: { name: 'Lost Ruins', players: 4, startOrder: [0, 3, 1, 2],
    high: [['rect', 4, 4, 32, 26], ['ellipse', 20, 17, 18, 15], ['rect', 50, 50, 14, 14], ['ellipse', 63.5, 63.5, 17, 17]],
    ramps: [[31, 28, 4, 5], [61, 45, 3, 5], [45, 61, 5, 3]],
    rocks: [['rect', 4, 30, 18, 4], ['ellipse', 42, 33, 4, 3], ['ellipse', 30, 58, 3, 2.5], ['ellipse', 58, 28, 2.5, 3], ['ellipse', 40, 50, 3, 3]],
    bases: [
      { hall: [12, 12], minerals: [[7, 9], [7, 11], [7, 13], [7, 15], [7, 17], [10, 8], [12, 8], [14, 8]], geyser: [17, 7], main: true },
      { hall: [29, 38], minerals: [[24, 36], [24, 38], [24, 40], [24, 42], [27, 45], [29, 45], [31, 45]], geyser: [34, 44], natural: true },
      { hall: [10, 52], minerals: [[5, 49], [5, 51], [5, 53], [5, 55], [5, 57], [5, 59]], geyser: [10, 58] },
      { hall: [52, 10], minerals: [[49, 5], [51, 5], [53, 5], [55, 5], [57, 5], [59, 5]], geyser: [59, 10] },
    ] },
  bloodbath: { name: 'Blood Pit', players: 4, startOrder: [0, 3, 1, 2],
    high: [['ellipse', 63.5, 63.5, 12, 10]],
    ramps: [[62, 52, 3, 3], [52, 62, 3, 3]],
    rocks: [['ellipse', 30, 30, 5, 4], ['rect', 4, 40, 10, 3], ['rect', 40, 4, 3, 10], ['ellipse', 46, 22, 3, 3], ['ellipse', 22, 46, 3, 3]],
    bases: [
      { hall: [12, 12], minerals: [[7, 9], [7, 11], [7, 13], [7, 15], [10, 7], [12, 7], [14, 7], [16, 7]], geyser: [19, 11], main: true },
      { hall: [30, 12], minerals: [[27, 5], [29, 5], [31, 5], [33, 5], [35, 5], [37, 8]], geyser: [37, 12] },
      { hall: [12, 30], minerals: [[5, 27], [5, 29], [5, 31], [5, 33], [5, 35], [8, 37]], geyser: [12, 36] },
    ] },
  valley: { name: 'Twilight Valley', players: 2, startOrder: [0, 1],
    high: [['rect', 4, 4, 40, 30], ['ellipse', 24, 19, 22, 17], ['rect', 4, 60, 22, 8]],
    ramps: [[38, 32, 5, 5], [24, 60, 4, 4]],
    rocks: [['rect', 44, 4, 4, 22], ['ellipse', 56, 40, 6, 5], ['ellipse', 64, 63, 10, 4], ['rect', 30, 50, 10, 3], ['ellipse', 80, 20, 4, 4]],
    bases: [
      { hall: [14, 14], minerals: [[9, 11], [9, 13], [9, 15], [9, 17], [9, 19], [12, 10], [14, 10], [16, 10], [18, 10]], geyser: [20, 9], main: true, quadrants: [0, 3] },
      { hall: [36, 40], minerals: [[31, 38], [31, 40], [31, 42], [31, 44], [34, 47], [36, 47], [38, 47]], geyser: [41, 46], natural: true, quadrants: [0, 3] },
      { hall: [12, 72], minerals: [[7, 69], [7, 71], [7, 73], [7, 75], [7, 77], [10, 79]], geyser: [15, 78], quadrants: [0, 3] },
      { hall: [60, 14], minerals: [[57, 9], [59, 9], [61, 9], [63, 9], [65, 9], [67, 12]], geyser: [67, 16], quadrants: [0, 3] },
      { hall: [94, 40], minerals: [[89, 37], [89, 39], [89, 41], [89, 43], [92, 35], [94, 35]], geyser: [98, 34], quadrants: [0, 3], rich: true },
    ] },
};
// Run-length codec for the editor's tile grids: "2x40,0x88,..." keeps a 128x128 map a few hundred bytes.
const MapCodec = {
  encode(arr) { let out = '', v = arr[0], n = 0; for (let i = 0; i < arr.length; i++) { if (arr[i] === v) { n++; continue; } out += v + 'x' + n + ','; v = arr[i]; n = 1; } return out + v + 'x' + n; },
  decode(s, len) { const out = new Uint8Array(len); if (!s) return out; let i = 0; for (const part of String(s).split(',')) { const [v, n] = part.split('x'); const val = +v, cnt = +n; for (let k = 0; k < cnt && i < len; k++) out[i++] = val; } return out; },
};

// Tilesets a map can declare. The palettes themselves live in js/terrain.js, but the list belongs here
// so the editor and the headless harnesses can offer them without loading the renderer.
const TILESET_IDS = ['badlands', 'jungle', 'ice', 'desert', 'space'];
const TILESET_NAMES = { badlands: 'Badlands', jungle: 'Jungle', ice: 'Ice', desert: 'Desert', space: 'Space Platform' };

class GameMap {
  constructor(seed = 1, layout = 'temple') {
    this.layout = layout;
    // Size comes from the layout so editor maps are not stuck at 128x128; the built-ins have no w/h and
    // stay at the historical size. Clamped because the codec and the spatial hash both scale with area.
    const LZ = MAP_LAYOUTS[layout] || MAP_LAYOUTS.temple;
    const lim = v => Math.max(64, Math.min(256, v | 0));
    this.w = lim((LZ.custom && LZ.w) || 128); this.h = lim((LZ.custom && LZ.h) || 128);
    const n = this.w * this.h;
    this.height = new Uint8Array(n);
    this.walk = new Uint8Array(n).fill(1);
    this.cliff = new Uint8Array(n);     // 1 = drawn as cliff edge
    this.blocked = new Int32Array(n).fill(-1); // building/resource occupancy (unit id, -2 mineral, -3 geyser)
    this.creep = new Uint8Array(n);
    this.psi = {};                       // playerId -> Uint8Array
    this.noise = new Uint8Array(n);
    this.resources = [];
    this.bases = [];
    this.starts = [];
    this.seed = seed;
    let s = seed >>> 0 || 1;
    this.rand = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
    for (let i = 0; i < n; i++) this.noise[i] = Math.floor(this.rand() * 255);
    this.generate();
  }
  idx(x, y) { return y * this.w + x; }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  H(x, y) { return this.inb(x, y) ? this.height[this.idx(x, y)] : 0; }
  // Apply painter fn(x,y) over 4-fold mirror symmetry
  sym(x, y, fn) {
    fn(x, y); fn(this.w - 1 - x, y); fn(x, this.h - 1 - y); fn(this.w - 1 - x, this.h - 1 - y);
  }
  mirrorPt(x, y, q) { // quadrant 0..3 transform of a point
    const mx = this.w - 1 - x, my = this.h - 1 - y;
    return q === 0 ? [x, y] : q === 1 ? [mx, y] : q === 2 ? [x, my] : [mx, my];
  }
  rect(x0, y0, w, h, fn) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (this.inb(x, y)) fn(x, y); }
  ellipse(cx, cy, rx, ry, fn) { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { if (this.inb(x, y) && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) fn(x, y); } }

  generate() {
    const W = this.w, Hh = this.h;
    const setH = v => (x, y) => { this.height[this.idx(x, y)] = v; };
    const rock = (x, y) => { this.walk[this.idx(x, y)] = 0; this.cliff[this.idx(x, y)] = 2; };
    const ramp = (x, y) => { const i = this.idx(x, y); this.walk[i] = 1; this.cliff[i] = 0; this.height[i] = 1; };
    const L = MAP_LAYOUTS[this.layout] || MAP_LAYOUTS.temple;
    this.name = L.name; this.players = L.players; this.tileset = TILESET_IDS.includes(L.tileset) ? L.tileset : 'badlands';
    if (L.custom) return this.generateCustom(L);
    // --- high ground ---
    for (const [kind, ...a] of L.high) { if (kind === 'rect') this.rect(a[0], a[1], a[2], a[3], (x, y) => this.sym(x, y, setH(2))); else this.ellipse(a[0], a[1], a[2], a[3], (x, y) => this.sym(x, y, setH(2))); }
    // --- cliffs: high tiles adjacent to low become unwalkable cliff ring ---
    const cliffs = [];
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      if (this.height[this.idx(x, y)] !== 2) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) { if (!this.inb(x + dx, y + dy) || this.height[this.idx(x + dx, y + dy)] === 0) { edge = true; break; } }
      if (edge) cliffs.push(this.idx(x, y));
    }
    for (const i of cliffs) { this.walk[i] = 0; this.cliff[i] = 1; }
    for (const r of L.ramps) this.rect(r[0], r[1], r[2], r[3], (x, y) => this.sym(x, y, ramp));
    // --- map border ---
    this.rect(0, 0, W, 2, (x, y) => rock(x, y)); this.rect(0, Hh - 2, W, 2, (x, y) => rock(x, y));
    this.rect(0, 0, 2, Hh, (x, y) => rock(x, y)); this.rect(W - 2, 0, 2, Hh, (x, y) => rock(x, y));
    // --- rocks / chokes ---
    for (const [kind, ...a] of L.rocks) { if (kind === 'rect') this.rect(a[0], a[1], a[2], a[3], (x, y) => this.sym(x, y, rock)); else this.ellipse(a[0], a[1], a[2], a[3], (x, y) => this.sym(x, y, rock)); }
    // --- bases (defined in quadrant 0, mirrored) ---
    for (let q = 0; q < 4; q++) for (const bd of L.bases) {
      if (bd.quadrants && !bd.quadrants.includes(q)) continue;
      const base = { minerals: [], geyser: null, main: !!bd.main, natural: !!bd.natural, quadrant: q };
      const tr = (x, y, w, h) => { let [tx, ty] = this.mirrorPt(x, y, q); if (q === 1 || q === 3) tx -= w - 1; if (q === 2 || q === 3) ty -= h - 1; return [tx, ty]; };
      const [hx, hy] = tr(bd.hall[0], bd.hall[1], 4, 3);
      base.x = hx; base.y = hy; base.cx = (hx + 2) * TILE; base.cy = (hy + 1.5) * TILE;
      for (const m of bd.minerals) {
        const [mx, my] = tr(m[0], m[1], 2, 1);
        const res = { type: 'mineral', x: mx, y: my, w: 2, h: 1, amount: bd.rich ? 5000 : 1500, cx: (mx + 1) * TILE, cy: (my + 0.5) * TILE, miner: null, id: this.resources.length };
        this.resources.push(res); base.minerals.push(res);
        this.rect(mx, my, 2, 1, (x, y) => { this.blocked[this.idx(x, y)] = -2; this.walk[this.idx(x, y)] = 1; this.cliff[this.idx(x, y)] = 0; });
      }
      if (bd.geyser) {
        const [gx, gy] = tr(bd.geyser[0], bd.geyser[1], 4, 2);
        const g = { type: 'geyser', x: gx, y: gy, w: 4, h: 2, amount: 5000, cx: (gx + 2) * TILE, cy: (gy + 1) * TILE, building: null, id: this.resources.length };
        this.resources.push(g); base.geyser = g;
        this.rect(gx, gy, 4, 2, (x, y) => { this.blocked[this.idx(x, y)] = -3; this.walk[this.idx(x, y)] = 1; this.cliff[this.idx(x, y)] = 0; });
      }
      this.rect(hx - 1, hy - 1, 6, 5, (x, y) => { if (this.height[this.idx(x, y)] !== 2 || !this.cliff[this.idx(x, y)]) { this.walk[this.idx(x, y)] = 1; this.cliff[this.idx(x, y)] = 0; } });
      this.bases.push(base);
      if (bd.main) this.starts.push(base);
    }
    // start order: spread players across the map (diagonal first)
    const order = L.startOrder || [0, 3, 1, 2]; const mains = this.starts; this.starts = order.map(i => mains[i]).filter(Boolean); for (const b of mains) if (!this.starts.includes(b)) this.starts.push(b);
    for (const r of this.resources) this.rect(r.x, r.y, r.w, r.h, (x, y) => { this.cliff[this.idx(x, y)] = 0; });
    this.resById = new Map(this.resources.map(r => [r.id, r]));
  }

  // ---------------- custom (editor-made) maps ----------------
  // A custom layout stores the painted height grid and rock grid run-length encoded, plus explicit
  // bases. Cliff edges are derived here exactly as for the built-in layouts, so the editor only has
  // to paint heights and the engine keeps one rule for what is walkable.
  generateCustom(L) {
    const W = this.w, Hh = this.h, n = W * Hh;
    const hgt = MapCodec.decode(L.height, n), rk = MapCodec.decode(L.rocks, n);
    for (let i = 0; i < n; i++) { this.height[i] = hgt[i] > 2 ? 0 : hgt[i]; this.walk[i] = 1; this.cliff[i] = 0; }
    const cliffs = [];
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      if (this.height[this.idx(x, y)] !== 2) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) { if (!this.inb(x + dx, y + dy) || this.height[this.idx(x + dx, y + dy)] === 0) { edge = true; break; } }
      if (edge) cliffs.push(this.idx(x, y));
    }
    for (const i of cliffs) { this.walk[i] = 0; this.cliff[i] = 1; }
    for (let i = 0; i < n; i++) if (this.height[i] === 1) { this.walk[i] = 1; this.cliff[i] = 0; }   // ramps stay walkable
    for (let i = 0; i < n; i++) if (rk[i]) { this.walk[i] = 0; this.cliff[i] = 2; }                  // painted rocks
    this.rect(0, 0, W, 2, (x, y) => { const i = this.idx(x, y); this.walk[i] = 0; this.cliff[i] = 2; });
    this.rect(0, Hh - 2, W, 2, (x, y) => { const i = this.idx(x, y); this.walk[i] = 0; this.cliff[i] = 2; });
    this.rect(0, 0, 2, Hh, (x, y) => { const i = this.idx(x, y); this.walk[i] = 0; this.cliff[i] = 2; });
    this.rect(W - 2, 0, 2, Hh, (x, y) => { const i = this.idx(x, y); this.walk[i] = 0; this.cliff[i] = 2; });
    for (const bd of (L.bases || [])) {
      const base = { minerals: [], geyser: null, main: !!bd.main, natural: !!bd.natural, quadrant: 0, x: bd.x, y: bd.y, cx: (bd.x + 2) * TILE, cy: (bd.y + 1.5) * TILE };
      for (const m of (bd.minerals || [])) {
        const res = { type: 'mineral', x: m[0], y: m[1], w: 2, h: 1, amount: bd.rich ? 5000 : 1500, cx: (m[0] + 1) * TILE, cy: (m[1] + 0.5) * TILE, miner: null, id: this.resources.length };
        this.resources.push(res); base.minerals.push(res);
        this.rect(m[0], m[1], 2, 1, (x, y) => { this.blocked[this.idx(x, y)] = -2; this.walk[this.idx(x, y)] = 1; this.cliff[this.idx(x, y)] = 0; });
      }
      if (bd.geyser) {
        const g = { type: 'geyser', x: bd.geyser[0], y: bd.geyser[1], w: 4, h: 2, amount: 5000, cx: (bd.geyser[0] + 2) * TILE, cy: (bd.geyser[1] + 1) * TILE, building: null, id: this.resources.length };
        this.resources.push(g); base.geyser = g;
        this.rect(g.x, g.y, 4, 2, (x, y) => { this.blocked[this.idx(x, y)] = -3; this.walk[this.idx(x, y)] = 1; this.cliff[this.idx(x, y)] = 0; });
      }
      this.rect(bd.x - 1, bd.y - 1, 6, 5, (x, y) => { const i = this.idx(x, y); if (!rk[i]) { this.walk[i] = 1; this.cliff[i] = 0; } });
      this.bases.push(base); if (bd.main) this.starts.push(base);
    }
    for (const r of this.resources) this.rect(r.x, r.y, r.w, r.h, (x, y) => { this.cliff[this.idx(x, y)] = 0; });
    this.resById = new Map(this.resources.map(r => [r.id, r]));
  }

  // ---------------- queries ----------------
  walkable(tx, ty) { if (!this.inb(tx, ty)) return false; const i = this.idx(tx, ty); return this.walk[i] === 1 && this.blocked[i] === -1; }
  walkableTerrain(tx, ty) { return this.inb(tx, ty) && this.walk[this.idx(tx, ty)] === 1; }
  heightAtPx(px, py) { return this.H(Math.floor(px / TILE), Math.floor(py / TILE)); }
  hasCreep(tx, ty) { return this.inb(tx, ty) && this.creep[this.idx(tx, ty)] > 0; }
  hasPsi(pid, tx, ty) { const p = this.psi[pid]; return !!p && this.inb(tx, ty) && p[this.idx(tx, ty)] > 0; }
  resourceAt(tx, ty) { if (!this.inb(tx, ty)) return null; const b = this.blocked[this.idx(tx, ty)]; if (b !== -2 && b !== -3) return null; return this.resources.find(r => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) || null; }
  geyserAt(tx, ty) { return this.resources.find(r => r.type === 'geyser' && r.x === tx && r.y === ty) || null; }

  block(tx, ty, w, h, id) { this.rect(tx, ty, w, h, (x, y) => { this.blocked[this.idx(x, y)] = id; }); }
  unblock(tx, ty, w, h, id) { this.rect(tx, ty, w, h, (x, y) => { if (this.blocked[this.idx(x, y)] === id) this.blocked[this.idx(x, y)] = -1; }); }

  // Building placement validation. Returns null if ok, else reason string.
  canPlace(def, tx, ty, player, units, ignoreUnit) {
    if (def.onGeyser) {
      const g = this.geyserAt(tx, ty);
      if (!g) return 'Must be placed on a Vespene Geyser';
      if (g.building && g.building.alive) return 'Geyser already has a building';
      return null;
    }
    let h0 = null;
    for (let y = ty; y < ty + def.h; y++) for (let x = tx; x < tx + def.w; x++) {
      if (!this.inb(x, y)) return 'Out of bounds';
      const i = this.idx(x, y);
      if (this.walk[i] !== 1) return 'Cannot build there';
      if (this.blocked[i] !== -1) return 'Location is blocked';
      const hh = this.height[i]; if (hh === 1) return 'Cannot build on ramps';
      if (h0 === null) h0 = hh; else if (h0 !== hh) return 'Uneven terrain';
      if (def.race !== 'Z' && this.creep[i]) return 'Cannot build on creep';
      if (def.needsCreep && !this.creep[i]) return 'Requires creep';
    }
    if (def.needsPsi) { const cx = tx + Math.floor(def.w / 2), cy = ty + Math.floor(def.h / 2); if (!this.hasPsi(player.id, cx, cy) && !this.hasPsi(player.id, cx - 1, cy)) return 'Requires psi power'; }
    if (def.race === 'Z' && def.id === 'hatchery' && def.needsCreep) { /* hatcheries can go anywhere */ }
    // units in the way (ground, non-builder)
    const x0 = tx * TILE, y0 = ty * TILE, x1 = (tx + def.w) * TILE, y1 = (ty + def.h) * TILE;
    for (const u of units) {
      if (!u.alive || u.fly || u === ignoreUnit || u.isBuilding || u.def.larva || (u.burrowed && u.def.mine)) continue;
      if (u.x + u.r > x0 && u.x - u.r < x1 && u.y + u.r > y0 && u.y - u.r < y1) { if (u.owner === player.id && u.def.worker) continue; return 'Unit in the way'; }
    }
    // resource proximity rule for town halls (no hall within 3 tiles of minerals)
    if (def.depot) {
      for (const r of this.resources) {
        if (r.type === 'geyser' && r.building && r.building.alive) continue;
        if (tx < r.x + r.w + 3 && tx + def.w > r.x - 3 && ty < r.y + r.h + 3 && ty + def.h > r.y - 3) return 'Too close to resources';
      }
    }
    return null;
  }

  // Creep: union of circles around living Zerg creep sources
  recomputeCreep(units) {
    this.creep.fill(0);
    for (const u of units) {
      if (!u.alive || !u.def.creep || u.fly) continue;
      if (u.def.id !== 'hatchery' && u.def.id !== 'lair' && u.def.id !== 'hive' && !u.done) continue;
      const cx = u.tx + u.def.w / 2, cy = u.ty + u.def.h / 2, r = u.def.creep;
      this.ellipse(cx - 0.5, cy - 0.5, r, r * 0.8, (x, y) => { if (this.walk[this.idx(x, y)] && this.height[this.idx(x, y)] !== 1) this.creep[this.idx(x, y)] = 1; });
    }
  }
  recomputePsi(pid, units) {
    const p = this.psi[pid] || (this.psi[pid] = new Uint8Array(this.w * this.h));
    p.fill(0);
    for (const u of units) {
      if (!u.alive || u.owner !== pid || !u.def.psi || !u.done) continue;
      this.ellipse(u.tx + 0.5, u.ty + 0.5, u.def.psi, u.def.psi * 0.7, (x, y) => { p[this.idx(x, y)] = 1; });
    }
  }
  // find a free nearby walkable tile (spiral)
  findFreeTile(tx, ty, maxR = 12, pred) {
    for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
      const x = tx + dx, y = ty + dy;
      if (this.walkable(x, y) && (!pred || pred(x, y))) return [x, y];
    }
    return null;
  }
}

// ============================================================================
// A* pathfinding on the tile grid (8-dir, no corner cutting). Binary heap.
// ============================================================================
class Pathfinder {
  // closed is stamped with the search generation, like stamp and for the same reason, so it must be able
  // to hold one. It was a Uint8Array: closed[ci] = gen stored gen & 255, so from the 256th search of a
  // game onward closed[ci] === gen was never true and the closed set silently stopped working -- every
  // search from a few seconds in re-expanded nodes it had already expanded, spending the node budget on
  // repeats and returning a worse path. It also made the pathfinder carry state between searches, which
  // is what desynced a rejoining client: it starts at gen 0 with a working closed set while everyone
  // else is past 256 with a broken one, so it walks its units somewhere different. With the right width
  // a search depends on nothing but its own generation, and the scratch is scratch again.
  constructor(map) { this.map = map; this.g = new Float32Array(map.w * map.h); this.closed = new Int32Array(map.w * map.h); this.parent = new Int32Array(map.w * map.h); this.stamp = new Int32Array(map.w * map.h); this.gen = 0; }
  // returns array of [tx,ty] from start (exclusive) to goal, or best-effort partial path
  find(sx, sy, gx, gy, maxNodes = 6000) {
    const m = this.map, W = m.w, Hh = m.h;
    if (!m.inb(sx, sy)) return [];
    const goalWalk = m.walkable(gx, gy);
    if (this.gen >= 0x7ffffffe) { this.gen = 0; this.stamp.fill(0); this.closed.fill(0); } // 2^31 searches is not reachable in a game, but a wrap would fail the same silent way
    this.gen++;
    const gen = this.gen, g = this.g, stamp = this.stamp, parent = this.parent, closed = this.closed;
    const heap = []; // [f, idx]
    const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break;[heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { let l = 2 * k + 1, r = l + 1, s = k; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === k) break;[heap[s], heap[k]] = [heap[k], heap[s]]; k = s; } } return top; };
    const hfn = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (dx + dy) + (1.4142 - 2) * Math.min(dx, dy); };
    const si = sy * W + sx;
    stamp[si] = gen; g[si] = 0; parent[si] = -1; closed[si] = 0;
    push(hfn(sx, sy), si);
    let best = si, bestH = hfn(sx, sy), n = 0;
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [-1, 1, 1.4142], [1, -1, 1.4142], [-1, -1, 1.4142]];
    while (heap.length && n < maxNodes) {
      const [, ci] = pop();
      if (closed[ci] === gen) continue;
      closed[ci] = gen; n++;
      const cx = ci % W, cy = (ci / W) | 0;
      const hh = hfn(cx, cy);
      if (hh < bestH) { bestH = hh; best = ci; }
      if (cx === gx && cy === gy) { best = ci; break; }
      if (!goalWalk && hh <= 1.5) { best = ci; break; }
      for (const [dx, dy, cost] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= Hh) continue;
        const ni = ny * W + nx;
        if (!m.walkable(nx, ny)) continue;
        if (dx && dy && (!m.walkable(cx + dx, cy) || !m.walkable(cx, cy + dy))) continue;
        if (closed[ni] === gen) continue;
        const ng = g[ci] + cost;
        if (stamp[ni] !== gen || ng < g[ni]) { stamp[ni] = gen; g[ni] = ng; parent[ni] = ci; push(ng + hfn(nx, ny), ni); }
      }
    }
    const path = [];
    for (let i = best; i !== -1 && i !== si; i = parent[i]) path.push([i % W, (i / W) | 0]);
    path.reverse();
    // string-pulling: remove intermediate nodes with line of sight
    return this.smooth(path, sx, sy);
  }
  los(x0, y0, x1, y1) {
    const m = this.map; let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), x = x0, y = y0, sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
    for (;;) {
      if (!m.walkable(x, y)) return false;
      if (x === x1 && y === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { if (!m.walkable(x, y + sy) && dx && dy) return false; err -= dy; x += sx; }
      if (e2 < dx) { if (!m.walkable(x + sx, y) && dx && dy) return false; err += dx; y += sy; }
    }
  }
  smooth(path, sx, sy) {
    if (path.length < 3) return path;
    const out = []; let cx = sx, cy = sy, i = 0;
    while (i < path.length) {
      let j = Math.min(path.length - 1, i + 12);
      while (j > i && !this.los(cx, cy, path[j][0], path[j][1])) j--;
      out.push(path[j]); cx = path[j][0]; cy = path[j][1]; i = j + 1;
    }
    return out;
  }
}
