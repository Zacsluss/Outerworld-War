'use strict';
// ============================================================================
// FX: particles (render-side), ground decals (scorch, blood, corpses),
// effect and spell-field drawing with additive blending.
// ============================================================================
const FX = {
  particles: [], decals: [], seen: new WeakSet(), rnd: Math.random,
  MAX_PARTICLES: 700, MAX_DECALS: 260, // render-side only; a 200-supply brawl otherwise spawns thousands and the frame cost doubles
  reset() { this.particles = []; this.decals = []; this.seen = new WeakSet(); },
  p(o) { const ps = this.particles; if (ps.length >= this.MAX_PARTICLES) { let worst = 0; for (let i = 1; i < 8; i++) if (ps[i] && ps[i].life < ps[worst].life) worst = i; ps[worst] = ps[ps.length - 1]; ps.pop(); } ps.push(Object.assign({ vx: 0, vy: 0, life: 0.5, max: 0.5, size: 3, col: [255, 200, 80], add: true, grav: 0, kind: 'dot', shrink: true }, o)); },
  burst(x, y, n, spd, o) { for (let i = 0; i < n; i++) { const a = this.rnd() * Math.PI * 2, s = spd * (0.3 + this.rnd() * 0.7); this.p(Object.assign({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s }, o, { life: o.life * (0.6 + this.rnd() * 0.6), max: o.life })); } },
  fire(x, y, n, spd, r = 1) { this.burst(x, y, n, spd, { life: 0.35 * r, size: 5 * r, col: [255, 170, 60], add: true }); this.burst(x, y, Math.ceil(n / 2), spd * 0.6, { life: 0.45 * r, size: 7 * r, col: [255, 80, 20], add: true }); },
  smoke(x, y, n, r = 1) { for (let i = 0; i < n; i++) this.p({ x: x + (this.rnd() - .5) * 10 * r, y: y + (this.rnd() - .5) * 10 * r, vx: (this.rnd() - .5) * 20, vy: -20 - this.rnd() * 30, life: 0.9 * r + this.rnd() * 0.5, max: 1.2 * r, size: 6 * r, col: [70, 70, 70], add: false, kind: 'smoke', shrink: false }); },
  sparks(x, y, n, spd) { this.burst(x, y, n, spd, { life: 0.3, size: 2, col: [255, 240, 160], add: true, kind: 'spark', grav: 300 }); },
  debris(x, y, n, spd, col = [90, 95, 100]) { this.burst(x, y, n, spd, { life: 0.8, size: 3, col, add: false, kind: 'debris', grav: 500, shrink: false }); },
  blood(x, y, n, spd) { this.burst(x, y, n, spd, { life: 0.5, size: 3, col: [150, 20, 40], add: false, kind: 'debris', grav: 400, shrink: false }); },
  decal(o) { this.decals.push(Object.assign({ t: 0, born: G.frame }, o)); if (this.decals.length > 400) this.decals.shift(); },
  // Ambient drift: a handful of motes crossing the viewport, tinted to the tileset. The maps here are
  // completely still between fights, and stillness is what makes a scene read as a screenshot rather
  // than a place. Capped hard and spawned only every 20th frame, because this is scenery and must
  // never compete with combat for the particle budget (MAX_PARTICLES is shared).
  AMBIENT: { badlands: [196, 170, 120], jungle: [150, 200, 110], ice: [220, 236, 248], desert: [226, 196, 140], space: [150, 190, 230] },
  ambient(camX, camY, vw, vh) {
    if (G.frame % 20 || this.particles.length > this.MAX_PARTICLES * 0.5) return;
    const col = this.AMBIENT[Terrain.setId] || this.AMBIENT.badlands;
    for (let i = 0; i < 2; i++) this.p({
      x: camX - 20 + this.rnd() * (vw + 40), y: camY + this.rnd() * vh,
      vx: 12 + this.rnd() * 20, vy: -3 + this.rnd() * 6,
      life: 2.4 + this.rnd() * 2.2, max: 4.6, size: 1 + this.rnd() * 1.6,
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
  drawDecals(ctx, inView, visNow) {
    for (const d of this.decals) {
      if (!inView(d.x, d.y, d.r + 20)) continue; const a = 1 - d.t / d.max;
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
        const s = Sprites.unit(fake, Sprites.dirOf(d.facing), anim); ctx.save(); ctx.globalAlpha = a * (0.85 + (1 - k) * 0.15); ctx.filter = k < 1 ? `brightness(${1 - k * 0.45}) sepia(${k * 0.6})` : (d.kind === 'corpse' ? 'brightness(0.55) sepia(0.6) hue-rotate(-30deg)' : 'brightness(0.35) grayscale(0.7)'); ctx.translate(d.x, d.y + k * 3);
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
    ctx.restore();
  },
};
