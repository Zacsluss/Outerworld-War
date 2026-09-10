'use strict';
// ============================================================================
// FX: particles (render-side), ground decals (scorch, blood, corpses),
// effect and spell-field drawing with additive blending.
// ============================================================================
const FX = {
  particles: [], decals: [], seen: new WeakSet(), rnd: Math.random,
  MAX_PARTICLES: 700, MAX_DECALS: 260, // render-side only; a 200-supply brawl otherwise spawns thousands and the frame cost doubles
  reset() { this.particles = []; this.decals = []; this.seen = new WeakSet(); this.tracks.length = 0; this.trackI = 0; this._ambF = -1; },
  p(o) { const ps = this.particles; if (ps.length >= this.MAX_PARTICLES) { let worst = 0; for (let i = 1; i < 8; i++) if (ps[i] && ps[i].life < ps[worst].life) worst = i; ps[worst] = ps[ps.length - 1]; ps.pop(); } ps.push(Object.assign({ vx: 0, vy: 0, life: 0.5, max: 0.5, size: 3, col: [255, 200, 80], add: true, grav: 0, kind: 'dot', shrink: true }, o)); },
  burst(x, y, n, spd, o) { for (let i = 0; i < n; i++) { const a = this.rnd() * Math.PI * 2, s = spd * (0.3 + this.rnd() * 0.7); this.p(Object.assign({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s }, o, { life: o.life * (0.6 + this.rnd() * 0.6), max: o.life })); } },
  fire(x, y, n, spd, r = 1) { this.burst(x, y, n, spd, { life: 0.35 * r, size: 5 * r, col: [255, 170, 60], add: true }); this.burst(x, y, Math.ceil(n / 2), spd * 0.6, { life: 0.45 * r, size: 7 * r, col: [255, 80, 20], add: true }); },
  smoke(x, y, n, r = 1) { for (let i = 0; i < n; i++) this.p({ x: x + (this.rnd() - .5) * 10 * r, y: y + (this.rnd() - .5) * 10 * r, vx: (this.rnd() - .5) * 20, vy: -20 - this.rnd() * 30, life: 0.9 * r + this.rnd() * 0.5, max: 1.2 * r, size: 6 * r, col: [70, 70, 70], add: false, kind: 'smoke', shrink: false }); },
  sparks(x, y, n, spd) { this.burst(x, y, n, spd, { life: 0.3, size: 2, col: [255, 240, 160], add: true, kind: 'spark', grav: 300 }); },
  debris(x, y, n, spd, col = [90, 95, 100]) { this.burst(x, y, n, spd, { life: 0.8, size: 3, col, add: false, kind: 'debris', grav: 500, shrink: false }); },
  blood(x, y, n, spd) { this.burst(x, y, n, spd, { life: 0.5, size: 3, col: [150, 20, 40], add: false, kind: 'debris', grav: 400, shrink: false }); },
  // Dust thrown up off the ground: what a heavy thing disturbs by moving over dry ground, and what it
  // throws forward when it stops. Tinted to the tileset, because the dust a machine kicks up is made of
  // the ground it is standing on -- the same palette entry the ambient motes use, for the same reason.
  dust(x, y, n, r = 1) {
    const col = this.AMBIENT[typeof Terrain !== 'undefined' ? Terrain.setId : 'badlands'] || this.AMBIENT.badlands;
    for (let i = 0; i < n; i++) this.p({
      x: x + (this.rnd() - .5) * 10 * r, y: y + (this.rnd() - .5) * 5 * r,
      vx: (this.rnd() - .5) * 26 * r, vy: -5 - this.rnd() * 12,
      life: 0.35 + this.rnd() * 0.3, max: 0.7, size: 3 * r + 1, col, add: false, kind: 'smoke', shrink: false,
    });
  },
  decal(o) { this.decals.push(Object.assign({ t: 0, born: G.frame }, o)); if (this.decals.length > 400) this.decals.shift(); },

  // ---------------------------------------------------------------------------
  // Ground tracks. Not decals, and deliberately a separate list with its own cap.
  // ---------------------------------------------------------------------------
  // A decal is one event that leaves one mark; a track is a continuous stream, so twenty moving tanks
  // would evict every corpse and scorch on the field within seconds if these shared the decal array --
  // and MAX_DECALS is the thing keeping drawDecals affordable. So tracks get a fixed ring buffer they
  // can never overflow, and cost a bounded number of draw calls whatever is happening: every live track
  // goes into one of THREE batched paths (by age, which is what sets the alpha) and each path is
  // stroked once. That is 3 draw calls a frame for the whole battlefield, not one per mark -- the same
  // budgeting rule the shadow pool follows.
  TRACK_MAX: 128, TRACK_LIFE: 210,   // frames at 24/s, so a little under nine seconds
  tracks: [], trackI: 0,
  track(x, y, facing, w, len) {
    const t = { x, y, c: Math.cos(facing), s: Math.sin(facing), w, len, born: G.frame };
    if (this.tracks.length < this.TRACK_MAX) this.tracks.push(t);
    else { this.tracks[this.trackI] = t; this.trackI = (this.trackI + 1) % this.TRACK_MAX; }
  },
  drawTracks(ctx, inView) {
    const ts = this.tracks; if (!ts.length) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
    for (let b = 0; b < 3; b++) {
      let any = false; ctx.beginPath();
      for (const t of ts) {
        // Clamped, not just floored: a replay seeking backwards puts G.frame behind a mark's birth,
        // and an unclamped bucket index of 3 matches no pass and the mark silently stops being drawn.
        const k = 1 - (G.frame - t.born) / this.TRACK_LIFE;
        if (k <= 0 || Math.min(2, k * 3 | 0) !== b) continue;
        if (inView && !inView(t.x, t.y, t.w + t.len + 8)) continue;
        // Two parallel marks, perpendicular to travel and squashed on the vertical the same 0.55 the
        // ground ellipses everywhere else in the renderer are, so they lie ON the ground plane.
        const px = -t.s * t.w, py = t.c * t.w * 0.55, lx = t.c * t.len, ly = t.s * t.len * 0.55;
        ctx.moveTo(t.x + px - lx, t.y + py - ly); ctx.lineTo(t.x + px + lx, t.y + py + ly);
        ctx.moveTo(t.x - px - lx, t.y - py - ly); ctx.lineTo(t.x - px + lx, t.y - py + ly);
        any = true;
      }
      if (any) { ctx.globalAlpha = 0.07 + b * 0.05; ctx.lineWidth = 2; ctx.stroke(); }
    }
    ctx.restore();
  },
  // Ambient drift: a handful of motes crossing the viewport, tinted to the tileset. The maps here are
  // completely still between fights, and stillness is what makes a scene read as a screenshot rather
  // than a place. Capped hard and spawned only every 20th frame, because this is scenery and must
  // never compete with combat for the particle budget (MAX_PARTICLES is shared).
  AMBIENT: { badlands: [196, 170, 120], jungle: [150, 200, 110], ice: [220, 236, 248], desert: [226, 196, 140], space: [150, 190, 230] },
  // How hard the air is moving, 0..1, and which way. This is the whole reason the sandstorm's warning
  // works when the front itself is off camera: the wall is a thing at a place, but wind is everywhere,
  // so the drift the map already has picks up and leans over ten seconds before anything is visible.
  // Read-only on the map -- hazardState is a pure function of the frame and nothing here writes to it.
  wind() {
    const m = (typeof G !== 'undefined' && G.map) || null;
    if (!m || !m.hazard || !m.hazardState) return null;
    const s = m.hazardState(G.frame); if (!s || (!s.active && !s.warning)) return null;
    const k = s.active ? 1 : Math.min(1, s.phase / Math.max(1, m.hazard.warn));
    return { k: k * k, dir: s.dir, axis: s.axis };   // squared: the last seconds of the warning are where it reads
  },
  ambient(camX, camY, vw, vh) {
    const w = this.wind(), gust = w ? w.k : 0;
    // Spawn rate goes from one pair every 20 frames to one every four as the storm arrives.
    //
    // Once per SIM frame, not once per drawn frame. `G.frame % 20` is a gate on simulation time and
    // this is called from the draw pass, so at 60 Hz against a 24 Hz simulation the same sim frame is
    // drawn two or three times and the gate came true on each of them -- the drift ran at about two
    // and a half times its intended density, and at a rate that depended on the frame rate. It did not
    // matter much while this was scenery; it matters now that the same number says how hard the wind
    // is blowing, and a storm that looks stronger on a faster machine is a bug.
    if (this._ambF === G.frame) return;
    if (G.frame % Math.max(4, Math.round(20 - gust * 16)) || this.particles.length > this.MAX_PARTICLES * (0.5 + gust * 0.2)) return;
    this._ambF = G.frame;
    const col = this.AMBIENT[Terrain.setId] || this.AMBIENT.badlands;
    const spd = 1 + gust * 9, along = w ? w.dir : 1, vert = w && w.axis === 'y';
    for (let i = 0; i < (gust > 0.5 ? 3 : 2); i++) this.p({
      // Entering from the edge the wind comes from, so the motes stream across rather than appearing.
      x: vert ? camX + this.rnd() * vw : (along > 0 ? camX - 20 + this.rnd() * (vw * (1 - gust) + 40) : camX + vw + 20 - this.rnd() * (vw * (1 - gust) + 40)),
      y: vert ? (along > 0 ? camY - 20 + this.rnd() * (vh * (1 - gust) + 40) : camY + vh + 20 - this.rnd() * (vh * (1 - gust) + 40)) : camY + this.rnd() * vh,
      vx: vert ? (this.rnd() - .5) * 20 * spd : (12 + this.rnd() * 20) * spd * along,
      vy: vert ? (12 + this.rnd() * 20) * spd * along : (-3 + this.rnd() * 6) * spd,
      life: (2.4 + this.rnd() * 2.2) / (1 + gust * 2), max: 4.6 / (1 + gust * 2), size: 1 + this.rnd() * (1.6 + gust * 1.8),
      col, add: false, kind: 'dot', grav: 0, shrink: false, ambient: true,
    });
  },
  // Called once per effect the first time it is rendered
  spawn(e) {
    switch (e.kind) {
      case 'boom': this.fire(e.x, e.y, 10, 90 * (e.r / 14)); this.smoke(e.x, e.y, 4, Math.max(0.6, e.r / 16)); this.sparks(e.x, e.y, 8, 160); if (e.def) { this.debris(e.x, e.y, 8, 120); this.decal({ kind: 'scorch', x: e.x, y: e.y, r: e.r * 1.3, max: 1400 }); if (!e.fly) this.decal({ kind: 'wreck', x: e.x, y: e.y, r: e.r, def: e.def, owner: e.owner, facing: e.facing, max: 900 }); } break;
      case 'bigboom': this.fire(e.x, e.y, 24, 160); this.smoke(e.x, e.y, 14, 2); this.sparks(e.x, e.y, 20, 260); this.debris(e.x, e.y, 18, 220); this.decal({ kind: 'scorch', x: e.x, y: e.y, r: e.r * 1.1, max: 2400 }); break;
      case 'blood': this.blood(e.x, e.y, 12, 140); this.decal({ kind: 'blood', x: e.x, y: e.y, r: e.r * 1.4, max: 1600, seed: this.rnd() }); if (e.def && !e.fly) this.decal({ kind: 'corpse', x: e.x, y: e.y, r: e.r, def: e.def, owner: e.owner, facing: e.facing, max: 1100 }); break;
      case 'nuke': this.fire(e.x, e.y, 60, 400, 3); this.smoke(e.x, e.y, 40, 4); this.debris(e.x, e.y, 30, 400, [60, 50, 40]); this.decal({ kind: 'scorch', x: e.x, y: e.y, r: e.r, max: 4000 }); break;
      case 'bullet': this.sparks(e.tx, e.ty, 2, 90); break;
      case 'slash': this.sparks(e.tx, e.ty, 3, 80); break;
      case 'spark': this.sparks(e.x, e.y, 3, 70); break;
      case 'missile': this.smoke(e.x, e.y, 1, 0.5); break;
      case 'fire': this.fire(e.x, e.y, 3, 26, 0.7); this.smoke(e.x, e.y, 1, 0.6); break;
    }
  },
  update(dt) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) { const p = ps[i]; p.life -= dt; if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; } p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind === 'smoke') { p.size += 14 * dt; p.vx *= 0.98; } else if (p.kind === 'debris' && p.grav && p.vy > 0 && this.rnd() < 0.02) { p.vy = 0; p.grav = 0; p.vx = 0; } }
    if (G.frame % 24 === 0) { const ds = this.decals; for (let i = ds.length - 1; i >= 0; i--) { ds[i].t += 24; if (ds[i].t > ds[i].max) ds.splice(i, 1); } if (ds.length > this.MAX_DECALS) ds.splice(0, ds.length - this.MAX_DECALS); }
  },
  drawParticles(ctx) {
    const ps = this.particles; ctx.save();
    for (const p of ps) { if (p.add) continue; const k = p.life / p.max; ctx.globalAlpha = p.kind === 'smoke' ? k * 0.45 : Math.min(1, k * 1.5); ctx.fillStyle = `rgb(${p.col[0]},${p.col[1]},${p.col[2]})`; const s = p.shrink ? p.size * (0.4 + k * 0.6) : p.size; if (p.kind === 'debris') ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s); else { ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, 7); ctx.fill(); } }
    ctx.globalCompositeOperation = 'lighter';
    for (const p of ps) { if (!p.add) continue; const k = p.life / p.max; ctx.globalAlpha = Math.min(1, k * 1.4); const s = p.shrink ? p.size * (0.3 + k * 0.7) : p.size; if (p.kind === 'spark') { ctx.strokeStyle = `rgb(${p.col[0]},${p.col[1]},${p.col[2]})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); } else { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s); g.addColorStop(0, `rgba(${p.col[0]},${p.col[1]},${p.col[2]},0.9)`); g.addColorStop(1, `rgba(${p.col[0]},${p.col[1]},${p.col[2]},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, 7); ctx.fill(); } }
    ctx.restore();
  },
  // How far the camera is pulled back, for the decal level of detail below. Defensive about Render for
  // the same reason everything else in this file is defensive about Terrain and Atlas: fx.js is loaded
  // before render.js in more than one harness, and a bare reference would take the draw pass with it.
  zoomNow() { const z = (typeof Render !== 'undefined' && Render) ? Render.zoom : 1; return (typeof z === 'number' && z > 0 && isFinite(z)) ? z : 1; },
  // Below this the decals stop being pictures and start being stains. It matches the zoom at which
  // js/render.js swaps sprites for icons, deliberately: the two are the same judgement about what is
  // still worth drawing, and having them disagree would put a fully detailed corpse under a nine-pixel
  // icon of the unit that killed it.
  LOD_Z: 0.5,
  drawDecals(ctx, inView, visNow) {
    // Strategic zoom multiplies the world in view by up to twenty, so every decal on the field clears
    // the cull at once -- and a corpse is a full SPRITE BLIT while a scorch builds a fresh radial
    // gradient, which is the exact cost the muzzle flash was moved out of the draw loop to avoid. At
    // the zoom where a corpse is two pixels across, both are paid for nothing. So below LOD_Z they
    // collapse to flat fills and the corpses are dropped: the ground still remembers where the fight
    // was, which is the whole of what reads at that scale.
    const lod = this.zoomNow() < this.LOD_Z;
    for (const d of this.decals) {
      if (!inView(d.x, d.y, d.r + 20)) continue; const a = 1 - d.t / d.max;
      if (lod) {
        if (d.kind === 'corpse' || d.kind === 'wreck') continue;
        ctx.globalAlpha = a * (d.kind === 'blood' ? 0.6 : 0.5);
        ctx.fillStyle = d.kind === 'blood' ? '#5a0f1c' : '#141008';
        ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 0.8, d.r * 0.5, 0, 0, 7); ctx.fill();
        ctx.globalAlpha = 1; continue;
      }
      if (d.kind === 'scorch') { ctx.globalAlpha = a * 0.6; const g = ctx.createRadialGradient(d.x, d.y, 1, d.x, d.y, d.r); g.addColorStop(0, 'rgba(10,8,6,0.9)'); g.addColorStop(0.7, 'rgba(20,16,12,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill(); }
      else if (d.kind === 'blood') { ctx.globalAlpha = a * 0.75; ctx.fillStyle = '#5a0f1c'; for (let k = 0; k < 5; k++) { const ang = d.seed * 7 + k * 1.3, dd = (k ? d.r * 0.5 : 0) * ((d.seed * (k + 1)) % 1 + 0.5); ctx.beginPath(); ctx.ellipse(d.x + Math.cos(ang) * dd, d.y + Math.sin(ang) * dd * 0.6, d.r * (k ? 0.35 : 0.7), d.r * (k ? 0.25 : 0.45), ang, 0, 7); ctx.fill(); } }
      else if (d.kind === 'corpse' || d.kind === 'wreck') { const def = DATA.all[d.def]; if (!def) continue; const fake = { def, owner: d.owner, r: def.r || 10, sieged: false }; const age = G.frame - d.born; const k = Math.min(1, age / 12);
        // Baked death rows when this sheet has them: DVAR poses of DFR frames, laid out pose by pose.
        // The pose is fixed for the life of the corpse and the frame walks the fall. `u.id` is not
        // reachable here -- the effect G.kill pushes carries def/owner/facing and nothing else, and
        // adding a field to it would edit a sim file and move the build stamp -- so the pose is keyed
        // on the frame the corpse was born plus its tile. That is stable per decal, differs between
        // two units killed by the same splash, and is made of sim quantities, so two clients watching
        // one replay see the same battlefield. The first quarter of the collapse still shows the live
        // attack frame, because a unit that died this instant was standing a frame ago and every baked
        // pose starts part-way down.
        const D = this.deathRows(def.id); let anim = k < 1 ? 'a2' : 'i';
        if (D && k >= 0.25) { const v = ((d.born + (d.x | 0) + (d.y | 0)) % D.v + D.v) % D.v; anim = 'd' + (v * D.f + Math.min(D.f - 1, Math.floor((k - 0.25) / 0.75 * D.f))); }
        const s = Sprites.unit(fake, Sprites.dirOf(d.facing, fake), anim); ctx.save(); ctx.globalAlpha = a * (0.85 + (1 - k) * 0.15); ctx.filter = k < 1 ? `brightness(${1 - k * 0.45}) sepia(${k * 0.6})` : (d.kind === 'corpse' ? 'brightness(0.55) sepia(0.6) hue-rotate(-30deg)' : 'brightness(0.35) grayscale(0.7)'); ctx.translate(d.x, d.y + k * 3);
        // The 2D squash used to BE the death animation. On the baked path it is only the last of the
        // settle on top of a real pose, so it drops to a tenth; with no baked rows it is untouched.
        if (!D) { ctx.rotate((d.kind === 'corpse' ? 0.6 : 0.25) * k * (d.def.length % 2 ? 1 : -1)); ctx.scale(1 + k * 0.1, 1 - k * 0.3); } else if (k < 1) ctx.scale(1 + k * 0.05, 1 - k * 0.08);
        Sprites.draw(ctx, s, 0, 0); ctx.restore(); }
      ctx.globalAlpha = 1;
    }
  },
  // {v: poses, f: frames} when this unit type has baked death rows, else null. Flyers have none --
  // a flying unit never leaves a corpse decal, so baking them would be sheet bytes nothing can draw --
  // and neither does the vector fallback, which keeps the old squash.
  deathRows(id) {
    if (typeof Atlas === 'undefined' || !Atlas.data || !Atlas.data.dvar || !Atlas.hasUnit(id)) return null;
    const u = Atlas.data.units[id]; return (u && u.rows.d != null) ? { v: Atlas.data.dvar, f: Atlas.data.dframes } : null;
  },
  lerpPos(e, T) { const k = 1 - e.t / T; return [e.x + (e.tx - e.x) * k, e.y + (e.ty - e.y) * k]; },
  drawEffect(ctx, e) {
    if (!this.seen.has(e)) { this.seen.add(e); this.spawn(e); }
    ctx.save();
    switch (e.kind) {
      case 'bullet': { ctx.globalCompositeOperation = 'lighter'; if (e.t >= 3) { const a = Math.atan2(e.ty - e.y, e.tx - e.x); const mx = e.x + Math.cos(a) * 13, my = e.y + Math.sin(a) * 13; const g = ctx.createRadialGradient(mx, my, 0, mx, my, 9); g.addColorStop(0, 'rgba(255,240,180,0.95)'); g.addColorStop(1, 'rgba(255,160,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 9, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,230,160,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a) * 8, my + Math.sin(a) * 8); ctx.stroke(); } ctx.strokeStyle = 'rgba(255,230,150,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty); ctx.stroke(); break; }
      case 'laser': { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = e.t / 6; ctx.strokeStyle = e.color; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); break; }
      case 'line': ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty); ctx.stroke(); break;
      case 'missile': { const [x, y] = this.lerpPos(e, 8); const a = Math.atan2(e.ty - e.y, e.tx - e.x); if (e.t > 1) this.p({ x, y, vx: 0, vy: -10, life: 0.4, max: 0.4, size: 3, col: [120, 120, 120], add: false, kind: 'smoke', shrink: false }); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = '#d8d8d0'; ctx.fillRect(-5, -2, 10, 4); ctx.fillStyle = '#c33'; ctx.fillRect(3, -2, 3, 4); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(-6, 0, 0, -6, 0, 7); g.addColorStop(0, 'rgba(255,200,80,0.9)'); g.addColorStop(1, 'rgba(255,100,20,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(-6, 0, 7, 0, 7); ctx.fill(); if (e.t === 1) { this.fire(e.tx, e.ty, 6, 70, 0.8); this.smoke(e.tx, e.ty, 2, 0.6); } break; }
      case 'glaive': { const [x, y] = this.lerpPos(e, 4); ctx.globalCompositeOperation = 'lighter'; ctx.translate(x, y); ctx.rotate(G.frame * 0.8); ctx.fillStyle = 'rgba(120,255,120,0.9)'; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-4, 6); ctx.lineTo(-4, -6); ctx.closePath(); ctx.fill(); ctx.rotate(2.1); ctx.fill(); ctx.rotate(2.1); ctx.fill(); break; }
      case 'flame': { const a = Math.atan2(e.ty - e.y, e.tx - e.x); for (let k = 0; k < 5; k++) { const sp = 120 + this.rnd() * 120, da = (this.rnd() - .5) * 0.7; this.p({ x: e.x + Math.cos(a) * 10, y: e.y + Math.sin(a) * 10, vx: Math.cos(a + da) * sp, vy: Math.sin(a + da) * sp, life: 0.25 + this.rnd() * 0.15, max: 0.4, size: 5 + this.rnd() * 4, col: this.rnd() < 0.5 ? [255, 190, 60] : [255, 90, 20], add: true }); } break; }
      case 'slash': ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(e.tx, e.ty, 9, Math.PI * 0.2, Math.PI * 1.1); ctx.stroke(); break;
      case 'spines': { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(200,140,220,0.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.tx, e.ty); ctx.stroke(); const k0 = 1 - e.t / 12; for (let i = 0; i < 7; i++) { const k = Math.min(1, k0 * 1.4 + i / 8); const x = e.x + (e.tx - e.x) * k, y = e.y + (e.ty - e.y) * k; ctx.fillStyle = 'rgba(240,220,255,0.9)'; ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 3, y + 3); ctx.lineTo(x - 3, y + 3); ctx.closePath(); ctx.fill(); } break; }
      case 'boom': case 'bigboom': { const T = e.kind === 'boom' ? 18 : 40; const k = 1 - e.t / T; if (e.kind === 'bigboom' && (e.t === 30 || e.t === 20 || e.t === 12)) { const ox = (this.rnd() - .5) * e.r * 1.2, oy = (this.rnd() - .5) * e.r; this.fire(e.x + ox, e.y + oy, 14, 130); this.smoke(e.x + ox, e.y + oy, 6, 1.6); } if (k < 0.4) { ctx.globalCompositeOperation = 'lighter'; const rr = (e.r || 14) * (0.6 + k * 2.5); const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, rr); g.addColorStop(0, `rgba(255,255,230,${(0.4 - k) * 2})`); g.addColorStop(0.4, `rgba(255,180,60,${(0.4 - k) * 1.5})`); g.addColorStop(1, 'rgba(255,60,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, rr, 0, 7); ctx.fill(); } break; }
      case 'blood': case 'fire': break;
      case 'ring': ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = e.color; ctx.lineWidth = 3; ctx.globalAlpha = e.t / 14; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (1.3 - e.t / 14), 0, 7); ctx.stroke(); break;
      case 'heal': ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#7fff7f'; ctx.fillRect(e.x - 1.5, e.y - 5, 3, 10); ctx.fillRect(e.x - 5, e.y - 1.5, 10, 3); break;
      case 'spark': break;
      case 'charge': { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(e.x, e.y, 2, e.x, e.y, e.r + 10); g.addColorStop(0, 'rgba(255,120,120,0.7)'); g.addColorStop(1, 'rgba(255,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,200,200,0.8)'; ctx.lineWidth = 1.5; for (let k = 0; k < 4; k++) { const a = this.rnd() * 7; ctx.beginPath(); ctx.moveTo(e.x + Math.cos(a) * (e.r + 12), e.y + Math.sin(a) * (e.r + 12)); ctx.lineTo(e.x + Math.cos(a) * e.r * .3, e.y + Math.sin(a) * e.r * .3); ctx.stroke(); } break; }
      case 'text': ctx.fillStyle = e.color; ctx.font = 'bold 11px Arial'; ctx.globalAlpha = e.t / 20; ctx.fillText(e.text, e.x - 10, e.y - (20 - e.t)); break;
      case 'nuke': { const k = 1 - e.t / 60; ctx.globalCompositeOperation = 'lighter'; const rr = e.r * (0.3 + k * 2.2); const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, rr); g.addColorStop(0, `rgba(255,255,255,${Math.max(0, 0.9 - k * 1.2)})`); g.addColorStop(0.5, `rgba(255,200,100,${Math.max(0, 0.7 - k)})`); g.addColorStop(1, 'rgba(255,80,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, rr, 0, 7); ctx.fill(); ctx.strokeStyle = `rgba(255,220,180,${1 - k})`; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * k * 3, 0, 7); ctx.stroke(); if (e.t % 3 === 0) this.smoke(e.x + (this.rnd() - .5) * 40, e.y - k * 60, 2, 3); break; }
    }
    ctx.restore();
  },
  drawField(ctx, f, frame) {
    const r = f.r * TILE; ctx.save();
    if (f.kind === 'swarm') { for (let i = 0; i < 9; i++) { const a = i * 0.7 + frame * 0.01 * (i % 2 ? 1 : -1), d = r * 0.55 * ((i * 37 % 10) / 10); const x = f.x + Math.cos(a) * d, y = f.y + Math.sin(a) * d * 0.8; const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.55); g.addColorStop(0, 'rgba(200,110,40,0.55)'); g.addColorStop(1, 'rgba(120,50,10,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, 7); ctx.fill(); } }
    else if (f.kind === 'dweb') { ctx.fillStyle = 'rgba(70,110,255,0.28)'; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(140,180,255,0.5)'; ctx.lineWidth = 1.5; for (let k = 0; k < 3; k++) { const rr = ((frame / 30 + k / 3) % 1) * r; ctx.globalAlpha = 1 - rr / r; ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, 7); ctx.stroke(); } }
    else if (f.kind === 'storm') { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r * 1.2); g.addColorStop(0, 'rgba(120,180,255,0.45)'); g.addColorStop(1, 'rgba(40,80,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r * 1.2, 0, 7); ctx.fill(); for (let i = 0; i < 7; i++) { let x = f.x + (this.rnd() - .5) * r * 1.6, y = f.y - r * 1.6; ctx.strokeStyle = 'rgba(160,210,255,0.9)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (this.rnd() - .5) * 18; y += r * 0.45; ctx.lineTo(x, y); } ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); } }
    else if (f.kind === 'nuke_target') { ctx.fillStyle = frame % 14 < 7 ? '#ff2020' : '#a00000'; ctx.beginPath(); ctx.arc(f.x, f.y, 5, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,60,60,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(f.x, f.y, 10 + (frame % 24), 0, 7); ctx.stroke(); }
    else if (f.kind === 'scan' && f.owner === G.human) { ctx.globalCompositeOperation = 'lighter'; const k = (frame % 48) / 48; ctx.strokeStyle = `rgba(120,255,140,${0.6 * (1 - k)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, r * k, 0, 7); ctx.stroke(); ctx.fillStyle = 'rgba(80,255,120,0.05)'; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill(); }
    else if (f.kind === 'recall') { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(120,200,255,0.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, r * (f.t / 30), 0, 7); ctx.stroke(); }
    // ---- the persistent fields that used to draw NOTHING ------------------------------------------
    // G.fields is the only path to the screen for these, and none of them had a branch, so nine kinds
    // of ongoing effect were invisible for their entire duration. The one-frame `ring()` each pushes at
    // cast time is what made that survive review: something flashed, so the ability looked wired up.
    //
    // A FORCE FIELD IS TERRAIN. It writes blocked tiles through GameMap.raiseForceField and stops an
    // army dead, so an invisible one is not a missing effect, it is a wall the player cannot see. It is
    // drawn solid and bright for that reason, and everything else here is drawn to read as a hazard you
    // can stand outside of.
    else if (f.kind === 'force_field') {
      const a = Math.min(1, f.t / 30);                                         // only the last 30 frames fade
      ctx.globalAlpha = a; ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(f.x, f.y, r * 0.2, f.x, f.y, r);
      g.addColorStop(0, 'rgba(150,205,255,0.42)'); g.addColorStop(0.72, 'rgba(90,160,255,0.30)'); g.addColorStop(1, 'rgba(190,225,255,0.55)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(210,235,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.stroke();
      for (let i = 0; i < 6; i++) { const a0 = i * 1.047 + frame * 0.006; ctx.strokeStyle = 'rgba(170,215,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a0) * r, f.y + Math.sin(a0) * r * 0.85); ctx.lineTo(f.x + Math.cos(a0 + 1.047) * r, f.y + Math.sin(a0 + 1.047) * r * 0.85); ctx.stroke(); }
    }
    else if (f.kind === 'time_warp') {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, 'rgba(150,120,255,0.10)'); g.addColorStop(0.8, 'rgba(120,150,255,0.22)'); g.addColorStop(1, 'rgba(180,200,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill();
      for (let k = 0; k < 3; k++) { const rr = r * (1 - ((frame / 90 + k / 3) % 1)); ctx.strokeStyle = `rgba(170,190,255,${0.45 * (rr / r)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, 7); ctx.stroke(); }
    }
    // Fuses. The countdown ring CLOSES on the target, so the fraction of the ring that is left is the
    // time you have left to walk out of it -- which is the only number that matters to whoever is in it.
    else if (f.kind === 'nova' || f.kind === 'bile') {
      const nova = f.kind === 'nova', full = (nova ? DATA.abilities.purification_nova : DATA.abilities.corrosive_bile).delay;
      const k = Math.max(0, Math.min(1, f.t / full)), col = nova ? [190, 120, 255] : [150, 220, 70];
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.5 * (1 - k) + 0.15})`); g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},0.85)`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, -1.571, -1.571 + 6.283 * k); ctx.stroke();
      ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},0.35)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.stroke();
      if (nova) { ctx.fillStyle = 'rgba(235,215,255,0.9)'; ctx.beginPath(); ctx.arc(f.x, f.y, 3 + (1 - k) * 5, 0, 7); ctx.fill(); }
    }
    else if (f.kind === 'fungal') {
      ctx.globalAlpha = Math.min(1, f.t / 24);
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, 'rgba(150,210,80,0.45)'); g.addColorStop(0.7, 'rgba(90,150,50,0.35)'); g.addColorStop(1, 'rgba(60,110,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(180,230,110,0.5)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) { const a0 = i * 0.785 + frame * 0.02; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.quadraticCurveTo(f.x + Math.cos(a0) * r * 0.6, f.y + Math.sin(a0) * r * 0.5, f.x + Math.cos(a0 + 0.3) * r * 0.95, f.y + Math.sin(a0 + 0.3) * r * 0.8); ctx.stroke(); }
    }
    else if (f.kind === 'jam') {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'rgba(60,130,220,0.10)'; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(140,200,255,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -frame * 0.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      for (let i = 0; i < 4; i++) { const a0 = this.rnd() * 6.283, d = this.rnd() * r; ctx.strokeStyle = 'rgba(190,225,255,0.7)'; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a0) * d, f.y + Math.sin(a0) * d * 0.8); ctx.lineTo(f.x + Math.cos(a0) * d + (this.rnd() - .5) * 14, f.y + Math.sin(a0) * d * 0.8 + (this.rnd() - .5) * 10); ctx.stroke(); }
    }
    // r is 0 on these two: they mark a BUILDING, so the radius comes from the building they are on.
    else if (f.kind === 'chrono' || f.kind === 'inject') {
      const b = f.bld || f.hall, br = b && b.def ? Math.max(b.def.w, b.def.h) * TILE * 0.6 : 24;
      const chrono = f.kind === 'chrono', col = chrono ? 'rgba(255,205,90,' : 'rgba(200,140,255,';
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = col + '0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, br, 0, 7); ctx.stroke();
      for (let i = 0; i < 3; i++) { const a0 = frame * (chrono ? 0.09 : 0.05) + i * 2.094; const x = f.x + Math.cos(a0) * br, y = f.y + Math.sin(a0) * br * 0.6; ctx.fillStyle = col + '0.95)'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); const g = ctx.createRadialGradient(x, y, 0, x, y, 9); g.addColorStop(0, col + '0.5)'); g.addColorStop(1, col + '0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill(); }
    }
    else if (f.kind === 'beacon') {
      ctx.globalCompositeOperation = 'lighter';
      const k = (frame % 60) / 60;
      ctx.strokeStyle = `rgba(255,225,120,${0.7 * (1 - k)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, r * k, 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,225,120,0.45)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]); ctx.lineDashOffset = frame * 0.4;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
  },
};
