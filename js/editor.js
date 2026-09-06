'use strict';
// ============================================================================
// In-browser map editor. Paints the height grid (low / ramp / high) and rocks,
// places mineral patches, geysers and start locations, then saves the result as
// a custom layout that MAP_LAYOUTS can load like any built-in map.
// Custom maps live in localStorage under bw_maps and appear in the main menu.
// ============================================================================
const Editor = {
  W: 128, H: 128, active: false, name: 'My Map',
  height: null, rocks: null, bases: [], tool: 'high', brush: 2, camX: 0, camY: 0, zoom: 6,
  painting: false, msg: '', msgT: 0, hoverTile: [0, 0], dirty: false,

  // ---------------- storage ----------------
  store: {
    all() { try { return JSON.parse(localStorage.getItem('bw_maps') || '{}'); } catch (e) { return {}; } },
    save(name, layout) { const m = this.all(); m[name] = layout; try { localStorage.setItem('bw_maps', JSON.stringify(m)); } catch (e) { } },
    remove(name) { const m = this.all(); delete m[name]; try { localStorage.setItem('bw_maps', JSON.stringify(m)); } catch (e) { } },
  },
  // Make every stored map selectable as a layout id "custom:<name>".
  register() { const all = this.store.all(); for (const [name, l] of Object.entries(all)) MAP_LAYOUTS['custom:' + name] = l; return Object.keys(all); },

  // ---------------- model ----------------
  blank() {
    this.height = new Uint8Array(this.W * this.H); this.rocks = new Uint8Array(this.W * this.H); this.bases = [];
    this.name = 'My Map'; this.dirty = false; this.camX = 0; this.camY = 0;
  },
  idx(x, y) { return y * this.W + x; },
  inb(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; },
  // Turn the painted grids into a layout object the engine can generate from.
  toLayout() {
    return { name: this.name, players: Math.max(2, this.bases.filter(b => b.main).length), custom: true, w: this.W, h: this.H, height: MapCodec.encode(this.height), rocks: MapCodec.encode(this.rocks), bases: this.bases.map(b => ({ x: b.x, y: b.y, main: !!b.main, natural: !!b.natural, minerals: b.minerals.slice(), geyser: b.geyser ? b.geyser.slice() : null })) };
  },
  fromLayout(l) {
    this.W = l.w || 128; this.H = l.h || 128; this.name = l.name || 'My Map';
    this.height = MapCodec.decode(l.height, this.W * this.H); this.rocks = MapCodec.decode(l.rocks, this.W * this.H);
    this.bases = (l.bases || []).map(b => ({ x: b.x, y: b.y, main: !!b.main, natural: !!b.natural, minerals: (b.minerals || []).map(m => m.slice()), geyser: b.geyser ? b.geyser.slice() : null }));
    this.dirty = false;
  },
  // A starter map so a new user has something valid to edit: two mirrored mains on high ground.
  template() {
    this.blank();
    const rect = (x0, y0, w, h, v) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (this.inb(x, y)) this.height[this.idx(x, y)] = v; };
    rect(6, 6, 34, 28, 2); rect(88, 94, 34, 28, 2);
    rect(38, 30, 5, 6, 1); rect(85, 92, 5, 6, 1);           // ramps down from each main
    this.addBase(12, 12, true); this.addBase(108, 106, true);
    this.addBase(56, 56, false); this.addBase(60, 24, false); this.addBase(56, 92, false);
    this.msgSay('New 2-player template. Paint terrain, then Save.');
  },
  // A base is a hall footprint plus a ring of minerals and one geyser, laid out clear of the hall.
  addBase(x, y, main) {
    // the hall may not sit within 3 tiles of any resource, so the patches ring it at a safe offset
    const minerals = []; for (let i = 0; i < 8; i++) minerals.push(i < 5 ? [x - 5, y - 1 + i * 2] : [x - 2 + (i - 5) * 2, y - 4]);
    this.bases.push({ x, y, main: !!main, natural: false, minerals, geyser: [x + 7, y] });
    this.dirty = true;
  },
  baseAt(tx, ty) { return this.bases.find(b => tx >= b.x - 6 && tx <= b.x + 9 && ty >= b.y - 5 && ty <= b.y + 5); },

  // ---------------- validation ----------------
  // Everything the engine needs to be true before a map can be played.
  problems() {
    const out = []; const mains = this.bases.filter(b => b.main);
    if (mains.length < 2) out.push('needs at least 2 start locations (you have ' + mains.length + ')');
    let m = null;
    try { MAP_LAYOUTS['__preview'] = this.toLayout(); m = new GameMap(1, '__preview'); } catch (e) { out.push('map failed to build: ' + e.message); return out; }
    const hall = DATA.buildings.command_center, p = { id: 0 };
    for (const b of m.bases) { const err = m.canPlace(hall, b.x, b.y, p, [], null); if (err) out.push('base at ' + b.x + ',' + b.y + ': ' + err); }
    // every start must be able to walk to every other base
    const pf = new Pathfinder(m);
    for (const s of m.starts) for (const b of m.bases) {
      const from = m.findFreeTile(s.x + 2, s.y + 3, 4), to = m.findFreeTile(b.x + 2, b.y + 3, 4);
      if (!from || !to) { out.push('base at ' + b.x + ',' + b.y + ' has no free ground'); continue; }
      const path = pf.find(from[0], from[1], to[0], to[1], 30000); const end = path.length ? path[path.length - 1] : from;
      if (Math.hypot(end[0] - to[0], end[1] - to[1]) > 2) out.push('base at ' + b.x + ',' + b.y + ' is unreachable from start ' + s.x + ',' + s.y);
    }
    delete MAP_LAYOUTS['__preview'];
    return [...new Set(out)];
  },

  // ---------------- lifecycle ----------------
  open() {
    if (!this.height) this.template();
    this.active = true; UI.running = false; UI.menu = null;
    document.getElementById('menu').style.display = 'none';
    const c = document.getElementById('game'); c.style.display = 'block';
    this.canvas = c; this.ctx = c.getContext('2d'); this.resize();
    if (!this._loop) { this._loop = () => { if (this.active) { this.draw(); requestAnimationFrame(this._loop); } }; requestAnimationFrame(this._loop); }
    this.bind();
  },
  close() { this.active = false; document.getElementById('game').style.display = 'none'; document.getElementById('menu').style.display = 'flex'; UI.refreshMapList && UI.refreshMapList(); },
  resize() { const c = this.canvas; c.width = window.innerWidth; c.height = window.innerHeight; },
  msgSay(t) { this.msg = t; this.msgT = performance.now(); },

  // ---------------- input ----------------
  bind() {
    if (this._bound) return; this._bound = true;
    const c = this.canvas;
    c.addEventListener('mousedown', e => { if (!this.active) return; if (this.uiClick(e.clientX, e.clientY)) return; this.painting = e.button === 0 ? 'paint' : 'erase'; this.paintAt(e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => { this.painting = false; });
    c.addEventListener('mousemove', e => { if (!this.active) return; this.hoverTile = this.toTile(e.clientX, e.clientY); if (this.painting) this.paintAt(e.clientX, e.clientY); });
    c.addEventListener('wheel', e => { if (!this.active) return; e.preventDefault(); this.zoom = clamp(this.zoom + (e.deltaY < 0 ? 1 : -1), 2, 16); }, { passive: false });
    window.addEventListener('keydown', e => {
      if (!this.active) return;
      const k = e.key.toLowerCase(); const step = 8;
      if (k === 'arrowleft') this.camX -= step; else if (k === 'arrowright') this.camX += step;
      else if (k === 'arrowup') this.camY -= step; else if (k === 'arrowdown') this.camY += step;
      else if (k === '1') this.tool = 'low'; else if (k === '2') this.tool = 'ramp'; else if (k === '3') this.tool = 'high';
      else if (k === '4') this.tool = 'rock'; else if (k === '5') this.tool = 'base'; else if (k === '6') this.tool = 'start';
      else if (k === '[') this.brush = Math.max(1, this.brush - 1); else if (k === ']') this.brush = Math.min(12, this.brush + 1);
      else if (k === 'escape') this.close();
      this.camX = clamp(this.camX, 0, Math.max(0, this.W - this.viewTilesX())); this.camY = clamp(this.camY, 0, Math.max(0, this.H - this.viewTilesY()));
    });
    window.addEventListener('resize', () => { if (this.active) this.resize(); });
  },
  viewTilesX() { return Math.floor(this.canvas.width / this.zoom); },
  viewTilesY() { return Math.floor((this.canvas.height - 90) / this.zoom); },
  toTile(sx, sy) { return [clamp(this.camX + Math.floor(sx / this.zoom), 0, this.W - 1), clamp(this.camY + Math.floor((sy - 60) / this.zoom), 0, this.H - 1)]; },
  paintAt(sx, sy) {
    if (sy < 60 || sy > this.canvas.height - 30) return;
    const [tx, ty] = this.toTile(sx, sy); const erase = this.painting === 'erase';
    if (this.tool === 'base' || this.tool === 'start') {
      if (this.painting !== 'paint') { const b = this.baseAt(tx, ty); if (b) { this.bases.splice(this.bases.indexOf(b), 1); this.dirty = true; this.msgSay('Base removed.'); } return; }
      if (this.baseAt(tx, ty)) return;
      this.addBase(tx, ty, this.tool === 'start'); this.msgSay(this.tool === 'start' ? 'Start location added.' : 'Expansion added.');
      this.painting = false; return;
    }
    const v = this.tool === 'low' ? 0 : this.tool === 'ramp' ? 1 : 2;
    const r = this.brush;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = tx + dx, y = ty + dy; if (!this.inb(x, y) || dx * dx + dy * dy > r * r) continue;
      const i = this.idx(x, y);
      if (this.tool === 'rock') this.rocks[i] = erase ? 0 : 1;
      else { this.height[i] = erase ? 0 : v; if (!erase) this.rocks[i] = 0; }
    }
    this.dirty = true;
  },

  // ---------------- toolbar ----------------
  buttons() {
    const b = []; let x = 10;
    const add = (label, key, fn, on) => { const w = 8 + label.length * 7.5; b.push({ x, y: 14, w, h: 30, label, key, fn, on }); x += w + 6; };
    add('Low 1', '1', () => this.tool = 'low', this.tool === 'low');
    add('Ramp 2', '2', () => this.tool = 'ramp', this.tool === 'ramp');
    add('High 3', '3', () => this.tool = 'high', this.tool === 'high');
    add('Rock 4', '4', () => this.tool = 'rock', this.tool === 'rock');
    add('Expansion 5', '5', () => this.tool = 'base', this.tool === 'base');
    add('Start 6', '6', () => this.tool = 'start', this.tool === 'start');
    x += 14;
    add('Brush -', '[', () => this.brush = Math.max(1, this.brush - 1));
    add('Brush +', ']', () => this.brush = Math.min(12, this.brush + 1));
    x += 14;
    add('New', '', () => { this.template(); });
    add('Rename', '', () => { const n = prompt('Map name', this.name); if (n) { this.name = n.slice(0, 24); this.dirty = true; } });
    add('Check', '', () => { const p = this.problems(); this.msgSay(p.length ? 'Problems: ' + p.slice(0, 2).join('; ') : 'Map is valid and fully connected.'); });
    add('Save', '', () => this.save());
    add('Export', '', () => this.exportFile());
    add('Import', '', () => document.getElementById('mapFile').click());
    add('Test game', '', () => this.test());
    add('Exit', 'Esc', () => this.close());
    return b;
  },
  uiClick(sx, sy) { for (const b of this.buttons()) if (sx >= b.x && sx < b.x + b.w && sy >= b.y && sy < b.y + b.h) { b.fn(); return true; } return false; },
  save() {
    const p = this.problems();
    if (p.length) { this.msgSay('Not saved: ' + p[0]); return false; }
    this.store.save(this.name, this.toLayout()); this.register(); this.dirty = false;
    this.msgSay('Saved "' + this.name + '". It is now in the map list.'); return true;
  },
  exportFile() {
    const blob = new Blob([JSON.stringify(this.toLayout())], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = this.name.replace(/\W+/g, '_') + '.bwmap.json';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    this.msgSay('Exported ' + a.download);
  },
  importFile(file) { const r = new FileReader(); r.onload = () => { try { this.fromLayout(JSON.parse(r.result)); this.msgSay('Imported "' + this.name + '".'); } catch (e) { this.msgSay('Could not read that file: ' + e.message); } }; r.readAsText(file); },
  test() {
    if (!this.save()) return;
    const id = 'custom:' + this.name; const n = Math.min(3, Math.max(1, this.bases.filter(b => b.main).length - 1));
    const players = [{ race: 'T', human: true, name: 'Player', team: 1 }];
    for (let i = 0; i < n; i++) players.push({ race: 'R', human: false, difficulty: 'normal', name: 'Computer ' + (i + 1), team: i + 2 });
    this.active = false; UI.start({ players, seed: 1, layout: id });
  },

  // ---------------- drawing ----------------
  draw() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.fillStyle = '#0b0e13'; ctx.fillRect(0, 0, W, H);
    const z = this.zoom, tx0 = this.camX, ty0 = this.camY, cols = this.viewTilesX(), rows = this.viewTilesY();
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const mx = tx0 + x, my = ty0 + y; if (!this.inb(mx, my)) continue;
      const i = this.idx(mx, my);
      let col = this.height[i] === 2 ? '#7a6a4e' : this.height[i] === 1 ? '#9a8a5e' : '#4a4436';
      if (this.rocks[i]) col = '#2b2b2f';
      ctx.fillStyle = col; ctx.fillRect(x * z, 60 + y * z, z, z);
    }
    // bases, minerals, geysers
    for (const b of this.bases) {
      const sx = (b.x - tx0) * z, sy = 60 + (b.y - ty0) * z;
      ctx.fillStyle = b.main ? 'rgba(90,200,255,0.85)' : 'rgba(255,220,90,0.75)'; ctx.fillRect(sx, sy, 4 * z, 3 * z);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(sx + .5, sy + .5, 4 * z - 1, 3 * z - 1);
      ctx.fillStyle = '#6fe0ff'; for (const m of b.minerals) ctx.fillRect((m[0] - tx0) * z, 60 + (m[1] - ty0) * z, 2 * z, z);
      if (b.geyser) { ctx.fillStyle = '#7ee07a'; ctx.fillRect((b.geyser[0] - tx0) * z, 60 + (b.geyser[1] - ty0) * z, 4 * z, 2 * z); }
    }
    // brush cursor
    const [hx, hy] = this.hoverTile; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
    const r = (this.tool === 'base' || this.tool === 'start') ? 2 : this.brush;
    ctx.beginPath(); ctx.arc((hx - tx0 + .5) * z, 60 + (hy - ty0 + .5) * z, (r + .5) * z, 0, 7); ctx.stroke();
    // toolbar
    ctx.fillStyle = '#151a22'; ctx.fillRect(0, 0, W, 58); ctx.fillStyle = '#2c3340'; ctx.fillRect(0, 58, W, 2);
    for (const b of this.buttons()) {
      ctx.fillStyle = b.on ? '#3a5a3a' : '#262c36'; ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = '#556'; ctx.strokeRect(b.x + .5, b.y + .5, b.w - 1, b.h - 1);
      ctx.fillStyle = '#e6eaf0'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + 20); ctx.textAlign = 'left';
    }
    // status bar
    ctx.fillStyle = '#151a22'; ctx.fillRect(0, H - 28, W, 28);
    ctx.fillStyle = '#9aa4b0'; ctx.font = '12px sans-serif';
    const mains = this.bases.filter(b => b.main).length;
    ctx.fillText(`"${this.name}"${this.dirty ? ' *' : ''}   tile ${hx},${hy}   brush ${this.brush}   starts ${mains}   expansions ${this.bases.length - mains}   arrows scroll, wheel zooms, right-drag erases`, 10, H - 10);
    if (this.msg && performance.now() - this.msgT < 6000) { ctx.fillStyle = '#ffe45a'; ctx.textAlign = 'right'; ctx.fillText(this.msg, W - 10, H - 10); ctx.textAlign = 'left'; }
  },
};
