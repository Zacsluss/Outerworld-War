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
  rectMode: false, rectStart: null, mirror: 'off', undoStack: [], redoStack: [], tileset: 'badlands',
  squareBrush: false,   // the freehand brush is round by default; a square one is what you want for plateaus and corridors

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

  // ---------------- undo / redo ----------------
  // A whole-map snapshot is 32 KB, so 50 of them is cheaper than tracking per-tile deltas and it
  // survives base edits and template loads without any special cases.
  snap() { return { height: this.height.slice(), rocks: this.rocks.slice(), name: this.name, bases: this.bases.map(b => ({ x: b.x, y: b.y, main: b.main, natural: b.natural, minerals: b.minerals.map(m => m.slice()), geyser: b.geyser ? b.geyser.slice() : null })) }; },
  restore(sn) { this.height = sn.height.slice(); this.rocks = sn.rocks.slice(); this.name = sn.name; this.bases = sn.bases.map(b => ({ x: b.x, y: b.y, main: b.main, natural: b.natural, minerals: b.minerals.map(m => m.slice()), geyser: b.geyser ? b.geyser.slice() : null })); this.dirty = true; },
  mark() { this.undoStack.push(this.snap()); if (this.undoStack.length > 50) this.undoStack.shift(); this.redoStack.length = 0; }, // call once per gesture, not per tile
  undo() { if (!this.undoStack.length) { this.msgSay('Nothing to undo.'); return; } this.redoStack.push(this.snap()); this.restore(this.undoStack.pop()); this.msgSay('Undo.'); },
  redo() { if (!this.redoStack.length) { this.msgSay('Nothing to redo.'); return; } this.undoStack.push(this.snap()); this.restore(this.redoStack.pop()); this.msgSay('Redo.'); },

  // ---------------- mirroring ----------------
  // Positions that mirror (tx,ty) for a w x h footprint. Anchors are mirrored by footprint, not by
  // centre tile, so a 4x3 base lands symmetrically rather than three tiles off.
  mirrors(tx, ty, w = 1, h = 1) {
    const W = this.W, H = this.H, out = [[tx, ty]];
    if (this.mirror === '2') out.push([W - tx - w, H - ty - h]);
    else if (this.mirror === '4') { out.push([W - tx - w, ty], [tx, H - ty - h], [W - tx - w, H - ty - h]); }
    return out.filter(([x, y], i) => this.inb(x, y) && out.findIndex(o => o[0] === x && o[1] === y) === i);
  },
  // Turn the painted grids into a layout object the engine can generate from.
  toLayout() {
    return { name: this.name, players: Math.max(2, this.bases.filter(b => b.main).length), custom: true, tileset: this.tileset, w: this.W, h: this.H, height: MapCodec.encode(this.height), rocks: MapCodec.encode(this.rocks), bases: this.bases.map(b => ({ x: b.x, y: b.y, main: !!b.main, natural: !!b.natural, minerals: b.minerals.slice(), geyser: b.geyser ? b.geyser.slice() : null })) };
  },
  fromLayout(l) {
    this.W = l.w || 128; this.H = l.h || 128; this.name = l.name || 'My Map'; this.tileset = l.tileset || 'badlands';
    this.height = MapCodec.decode(l.height, this.W * this.H); this.rocks = MapCodec.decode(l.rocks, this.W * this.H);
    this.bases = (l.bases || []).map(b => ({ x: b.x, y: b.y, main: !!b.main, natural: !!b.natural, minerals: (b.minerals || []).map(m => m.slice()), geyser: b.geyser ? b.geyser.slice() : null }));
    this.dirty = false;
  },
  // Accepts a number or a "WxH" string. The engine has always clamped a custom layout to 64-256 per
  // axis (js/map.js) and never required a square map -- the template lays itself out in 128ths of each
  // axis independently -- but the only way to change the size was a button that cycled four square
  // presets. Resizing cannot keep the painting, because the height and rock arrays are indexed by W:
  // it lays down a fresh template, which is exactly what the cycle button already did.
  resizeMap(spec) {
    const lim = v => Math.max(64, Math.min(256, Math.round(v)));
    const m = String(spec).toLowerCase().match(/^\s*(\d+)\s*(?:[x,\s]\s*(\d+))?\s*$/);
    if (!m) { this.msgSay('Size must be a number or WxH, 64 to 256.'); return false; }
    const w = lim(+m[1]), h = lim(m[2] ? +m[2] : +m[1]);
    if (w !== +m[1] || h !== +(m[2] || m[1])) this.msgSay('Clamped to ' + w + 'x' + h + ' (64 to 256).');
    this.W = w; this.H = h; this.template(); return true;
  },
  // A starter map so a new user has something valid to edit: two mirrored mains on high ground.
  template() {
    this.blank();
    const rect = (x0, y0, w, h, v) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (this.inb(x, y)) this.height[this.idx(x, y)] = v; };
    const fx = f => Math.round(f * this.W / 128), fy = f => Math.round(f * this.H / 128); // the template is laid out in 128ths so it scales to any map size
    rect(fx(6), fy(6), fx(34), fy(28), 2); rect(this.W - fx(40), this.H - fy(34), fx(34), fy(28), 2);
    rect(fx(38), fy(30), fx(5), fy(6), 1); rect(this.W - fx(43), this.H - fy(36), fx(5), fy(6), 1);   // ramps down from each main
    this.addBase(fx(12), fy(12), true); this.addBase(this.W - fx(20), this.H - fy(22), true);
    this.addBase(fx(56), fy(56), false); this.addBase(fx(60), fy(24), false); this.addBase(fx(56), fy(92), false);
    this.msgSay('New ' + this.W + 'x' + this.H + ' 2-player template. Paint terrain, then Save.');
  },
  // A base is a hall footprint plus a ring of minerals and one geyser, laid out clear of the hall.
  addBase(x, y, main) {
    // the hall may not sit within 3 tiles of any resource, so the patches ring it at a safe offset
    const minerals = []; for (let i = 0; i < 8; i++) minerals.push(i < 5 ? [x - 5, y - 1 + i * 2] : [x - 2 + (i - 5) * 2, y - 4]);
    this.bases.push({ x, y, main: !!main, natural: false, minerals, geyser: [x + 7, y] });
    this.dirty = true;
  },
  baseAt(tx, ty) { return this.bases.find(b => tx >= b.x - 6 && tx <= b.x + 9 && ty >= b.y - 5 && ty <= b.y + 5); },
  addBaseMirrored(tx, ty, main) { let n = 0; for (const [x, y] of this.mirrors(tx, ty, 4, 3)) if (!this.baseAt(x, y)) { this.addBase(x, y, main); n++; } return n; },
  removeBaseMirrored(tx, ty) { let n = 0; for (const [x, y] of this.mirrors(tx, ty, 4, 3)) { const b = this.baseAt(x, y); if (b) { this.bases.splice(this.bases.indexOf(b), 1); n++; } } if (n) this.dirty = true; return n; },

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
    // Re-armed on every open. The loop ends itself when `active` goes false on close, so a second open
    // used to find `_loop` already made, skip the request, and draw nothing at all. (REVIEW-M17)
    if (!this._loop) this._loop = () => { this._queued = false; if (this.active) { this._queued = true; this.draw(); requestAnimationFrame(this._loop); } };
    if (!this._queued) { this._queued = true; requestAnimationFrame(this._loop); }
    this.bind();
  },
  close() { this.active = false; document.getElementById('game').style.display = 'none'; document.getElementById('menu').style.display = 'flex'; UI.refreshMapList && UI.refreshMapList(); },
  resize() { const c = this.canvas; c.width = window.innerWidth; c.height = window.innerHeight; },
  msgSay(t) { this.msg = t; this.msgT = performance.now(); },

  // ---------------- input ----------------
  bind() {
    if (this._bound) return; this._bound = true;
    const c = this.canvas;
    c.addEventListener('mousedown', e => {
      if (!this.active) return; if (this.uiClick(e.clientX, e.clientY)) return; if (this.minimapClick(e.clientX, e.clientY)) return;
      this.mark(); // one undo entry per gesture
      this.painting = e.button === 0 ? 'paint' : 'erase';
      if (this.rectMode && this.tool !== 'base' && this.tool !== 'start') { this.rectStart = this.toTile(e.clientX, e.clientY); return; }
      this.paintAt(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', e => {
      if (this.active && this.rectStart) { const [tx, ty] = this.toTile(e.clientX, e.clientY); this.fillRect(this.rectStart[0], this.rectStart[1], tx, ty, this.painting === 'erase'); this.rectStart = null; }
      else if (this.active && this.painting && this.undoStack.length && !this.dirty) this.undoStack.pop(); // the gesture changed nothing
      this.painting = false;
    });
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
      else if (k === 'r') this.rectMode = !this.rectMode; else if (k === 'm') this.cycleMirror();
      else if (k === 'b') this.squareBrush = !this.squareBrush;
      else if (k === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (e.shiftKey) this.redo(); else this.undo(); }
      else if (k === 'y' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.redo(); }
      else if (k === 'escape') { if (this.rectStart) { this.rectStart = null; this.undo(); } else this.close(); }
      this.camX = clamp(this.camX, 0, Math.max(0, this.W - this.viewTilesX())); this.camY = clamp(this.camY, 0, Math.max(0, this.H - this.viewTilesY()));
    });
    window.addEventListener('resize', () => { if (this.active) this.resize(); });
  },
  viewTilesX() { return Math.floor(this.canvas.width / this.zoom); },
  viewTilesY() { return Math.floor((this.canvas.height - 90) / this.zoom); },
  toTile(sx, sy) { return [clamp(this.camX + Math.floor(sx / this.zoom), 0, this.W - 1), clamp(this.camY + Math.floor((sy - 60) / this.zoom), 0, this.H - 1)]; },
  toolValue() { return this.tool === 'low' ? 0 : this.tool === 'ramp' ? 1 : 2; },
  setTile(x, y, erase) {
    if (!this.inb(x, y)) return; const i = this.idx(x, y);
    if (this.tool === 'rock') this.rocks[i] = erase ? 0 : 1;
    else { this.height[i] = erase ? 0 : this.toolValue(); if (!erase) this.rocks[i] = 0; }
  },
  // Round or square, same radius either way, so B swaps the shape without changing the size of the
  // stroke. A round brush cannot paint a clean plateau edge and the rectangle tool cannot follow a
  // curve, so neither of the two things that already existed covered a straight-edged freehand stroke.
  brushAt(tx, ty, erase) { const r = this.brush, sq = this.squareBrush; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (sq || dx * dx + dy * dy <= r * r) for (const [x, y] of this.mirrors(tx + dx, ty + dy)) this.setTile(x, y, erase); this.dirty = true; },
  fillRect(x0, y0, x1, y1, erase) {
    const ax = Math.min(x0, x1), ay = Math.min(y0, y1), bx = Math.max(x0, x1), by = Math.max(y0, y1);
    for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) for (const [mx, my] of this.mirrors(x, y)) this.setTile(mx, my, erase);
    this.dirty = true;
  },
  paintAt(sx, sy) {
    if (sy < 60 || sy > this.canvas.height - 30) return;
    const [tx, ty] = this.toTile(sx, sy); const erase = this.painting === 'erase';
    if (this.tool === 'base' || this.tool === 'start') {
      if (this.painting !== 'paint') { const n = this.removeBaseMirrored(tx, ty); if (n) this.msgSay(n > 1 ? n + ' bases removed.' : 'Base removed.'); return; }
      if (this.baseAt(tx, ty)) return;
      const n = this.addBaseMirrored(tx, ty, this.tool === 'start');
      this.msgSay((this.tool === 'start' ? 'Start location' : 'Expansion') + (n > 1 ? ' x' + n + ' added.' : ' added.'));
      this.painting = false; return;
    }
    if (this.rectMode) return; // the rectangle is committed on mouse-up, not dragged over
    this.brushAt(tx, ty, erase);
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
    add(this.squareBrush ? 'Square' : 'Round', 'B', () => this.squareBrush = !this.squareBrush, this.squareBrush);
    add(this.rectMode ? 'Rect' : 'Brush', 'R', () => this.rectMode = !this.rectMode, this.rectMode);
    add('Mirror ' + (this.mirror === 'off' ? 'off' : this.mirror + 'p'), 'M', () => this.cycleMirror(), this.mirror !== 'off');
    add('Undo', '^Z', () => this.undo());
    add('Redo', '^Y', () => this.redo());
    x += 14;
    add('Size ' + this.W + 'x' + this.H, '', () => { const sizes = [96, 128, 160, 192]; this.mark(); this.resizeMap(sizes[(sizes.indexOf(this.W) + 1) % sizes.length]); });
    add('Size...', '', () => { const n = prompt('Map size in tiles: one number for a square map, or WxH. 64 to 256.', this.W + 'x' + this.H); if (n) { this.mark(); this.resizeMap(n); } });
    add('Tiles: ' + (TILESET_NAMES[this.tileset] || this.tileset), '', () => { this.mark(); this.tileset = TILESET_IDS[(TILESET_IDS.indexOf(this.tileset) + 1) % TILESET_IDS.length]; this.dirty = true; this.msgSay('Tileset: ' + (TILESET_NAMES[this.tileset] || this.tileset) + '.'); });
    add('New', '', () => { this.mark(); this.template(); });
    add('Rename', '', () => { const n = prompt('Map name', this.name); if (n) { this.mark(); this.name = n.slice(0, 24); this.dirty = true; } });
    add('Check', '', () => { const p = this.problems(); this.msgSay(p.length ? 'Problems: ' + p.slice(0, 2).join('; ') : 'Map is valid and fully connected.'); });
    add('Save', '', () => this.save());
    add('Export', '', () => this.exportFile());
    add('Import', '', () => document.getElementById('mapFile').click());
    add('Test game', '', () => this.test());
    add('Exit', 'Esc', () => this.close());
    return b;
  },
  uiClick(sx, sy) { for (const b of this.buttons()) if (sx >= b.x && sx < b.x + b.w && sy >= b.y && sy < b.y + b.h) { b.fn(); return true; } return false; },
  cycleMirror() { this.mirror = this.mirror === 'off' ? '2' : this.mirror === '2' ? '4' : 'off'; this.msgSay(this.mirror === 'off' ? 'Mirroring off.' : 'Mirroring on: ' + this.mirror + '-player symmetry.'); },

  // ---------------- minimap preview ----------------
  // One pixel per tile in the bottom-right corner, with the viewport outlined. Clicking jumps the camera,
  // which is the only way to cross a 128x128 map quickly at a useful zoom.
  minimapRect() { const s = 2, w = this.W * s / 2, h = this.H * s / 2; return { x: this.canvas.width - w - 10, y: this.canvas.height - h - 34, w, h, s: s / 2 }; },
  minimapClick(sx, sy) {
    const r = this.minimapRect(); if (sx < r.x || sy < r.y || sx >= r.x + r.w || sy >= r.y + r.h) return false;
    this.camX = clamp(Math.round((sx - r.x) / r.s - this.viewTilesX() / 2), 0, Math.max(0, this.W - this.viewTilesX()));
    this.camY = clamp(Math.round((sy - r.y) / r.s - this.viewTilesY() / 2), 0, Math.max(0, this.H - this.viewTilesY()));
    return true;
  },
  drawMinimap() {
    const ctx = this.ctx, r = this.minimapRect();
    ctx.fillStyle = '#0b0e13'; ctx.fillRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      const i = this.idx(x, y);
      ctx.fillStyle = this.rocks[i] ? '#2b2b2f' : this.height[i] === 2 ? '#7a6a4e' : this.height[i] === 1 ? '#9a8a5e' : '#4a4436';
      ctx.fillRect(r.x + x * r.s, r.y + y * r.s, r.s, r.s);
    }
    for (const b of this.bases) { ctx.fillStyle = b.main ? '#5ac8ff' : '#ffdc5a'; ctx.fillRect(r.x + b.x * r.s - 1, r.y + b.y * r.s - 1, 4, 4); }
    ctx.strokeStyle = '#e6eaf0'; ctx.lineWidth = 1;
    ctx.strokeRect(r.x + this.camX * r.s + .5, r.y + this.camY * r.s + .5, this.viewTilesX() * r.s, this.viewTilesY() * r.s);
    ctx.strokeStyle = '#556'; ctx.strokeRect(r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5);
  },
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
    const fw = (this.tool === 'base' || this.tool === 'start') ? 4 : 1, fh = (this.tool === 'base' || this.tool === 'start') ? 3 : 1;
    if (this.rectStart && this.tool !== 'base' && this.tool !== 'start') {
      ctx.strokeStyle = 'rgba(255,228,90,0.95)';
      for (const [ax, ay] of this.mirrors(Math.min(this.rectStart[0], hx), Math.min(this.rectStart[1], hy), Math.abs(hx - this.rectStart[0]) + 1, Math.abs(hy - this.rectStart[1]) + 1))
        ctx.strokeRect((ax - tx0) * z + .5, 60 + (ay - ty0) * z + .5, (Math.abs(hx - this.rectStart[0]) + 1) * z, (Math.abs(hy - this.rectStart[1]) + 1) * z);
    } else {
      for (const [mx, my] of this.mirrors(hx, hy, fw, fh)) { // the mirrored copies show where the same stroke will land
        ctx.strokeStyle = (mx === hx && my === hy) ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)';
        if (this.squareBrush && this.tool !== 'base' && this.tool !== 'start') ctx.strokeRect((mx - r - tx0) * z + .5, 60 + (my - r - ty0) * z + .5, (r * 2 + 1) * z, (r * 2 + 1) * z);
        else { ctx.beginPath(); ctx.arc((mx - tx0 + .5) * z, 60 + (my - ty0 + .5) * z, (r + .5) * z, 0, 7); ctx.stroke(); }
      }
    }
    this.drawMinimap();
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
    ctx.fillText(`"${this.name}"${this.dirty ? ' *' : ''}   tile ${hx},${hy}   brush ${this.brush} ${this.squareBrush ? 'square' : 'round'}   starts ${mains}   expansions ${this.bases.length - mains}   ${this.W}x${this.H}   ${this.rectMode ? 'rectangle' : 'brush'}   mirror ${this.mirror === 'off' ? 'off' : this.mirror + 'p'}   Ctrl+Z undo, B brush shape, R rectangle, M mirror, right-drag erases`, 10, H - 10);
    if (this.msg && performance.now() - this.msgT < 6000) { ctx.fillStyle = '#ffe45a'; ctx.textAlign = 'right'; ctx.fillText(this.msg, W - 10, H - 10); ctx.textAlign = 'left'; }
  },
};
