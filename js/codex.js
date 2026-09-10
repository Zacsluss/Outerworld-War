'use strict';
// ============================================================================
// CODEX -- the field manual (M11 wave two, idea 25).
//
// M11 gave this game a great deal of depth that has no surface at all. Suppressing fire is a research
// per production line and the only way to know it exists is to read the tech table. Veterancy is derived
// from a kill count and shows up as "this marine hits for 7 now". Scarring quietly lowers a unit's
// ceiling for the rest of its life. Directional armour makes a rear hit 35% harder and there is nothing
// on screen that says so. None of that is discoverable by playing, which means none of it is a
// mechanic yet -- it is just variance the player cannot account for.
//
// So: race tabs, a unit list, a detail pane, and a damage calculator that shows the whole chain from
// the weapon's table entry to the number that comes off the target's hit points.
//
// THE CALCULATOR IS THE POINT, AND IT MUST NOT LIE. It reads the sim's own tables -- DMG_MULT from
// data.js, FACE_MULT and the armour rules from game.js, SIEGE_W from sim.js -- so the only thing it
// duplicates is the ORDER of operations in G.damage. That order is pinned by test/codex.js, which
// builds real units, fires real shots and compares. A codex that disagrees with the game is worse than
// no codex, because the player will believe it.
//
// Render-only. It reads G, DATA and Sprites and writes nothing. Drawing happens only while it is open,
// so it is allowed to be more expensive than the console -- it builds its layout from scratch on every
// draw rather than caching, which is what lets `click` hit-test without a draw ever having run.
//
// Driven from outside: UI owns the F3 key and the menu button. Everything here is reachable through
// open / close / toggle / isOpen / draw / click / move / wheel / key.
// ============================================================================
const Codex = {
  // ---- state ---------------------------------------------------------------
  shown: false,
  race: 'T',
  kind: 'units',                 // 'units' | 'structures'
  sel: null,                     // the def id in the detail pane
  scroll: 0,
  pick: null,                    // 'atk' | 'def' while the list is choosing a calculator slot
  atkId: 'marine', defId: 'zergling',
  aUp: 0, dUp: 0, aVet: 0, dVet: 0, aTech: false, dTech: false, siege: false,
  mouse: { x: -1, y: -1 },

  // ---- lifecycle -----------------------------------------------------------
  open(id) {
    this.shown = true; this.pick = null;
    if (id && DATA.all[id]) { const d = DATA.all[id]; this.race = d.race; this.kind = d.isBuilding ? 'structures' : 'units'; this.sel = id; }
    else if (!this.sel) { const p = (typeof G !== 'undefined' && G.players) ? G.players[G.human] : null; if (p && p.race) this.race = p.race; }
    this.ensure();
    return true;
  },
  close() { this.shown = false; this.pick = null; return true; },
  toggle(id) { return this.shown ? this.close() : this.open(id); },
  isOpen() { return !!this.shown; },

  // Keep `sel` on something that is actually in the list being shown, and the scroll on it.
  ensure() {
    const ids = this.list();
    if (!ids.length) { this.sel = null; return; }
    if (!this.sel || !ids.includes(this.sel)) this.sel = ids[0];
    const L = this.layout(); const i = ids.indexOf(this.sel);
    if (i < this.scroll) this.scroll = i;
    if (i >= this.scroll + L.perPage) this.scroll = i - L.perPage + 1;
    this.clampScroll();
  },
  clampScroll() { const n = this.list().length, L = this.layout(); this.scroll = clamp(this.scroll, 0, Math.max(0, n - L.perPage)); },

  // ---- the tables, read rather than copied ---------------------------------
  // Larvae, eggs, munitions and the things that are not really units go to the end of the list rather
  // than being hidden. An egg has 200 hit points and ten armour, which is a real fact about the game
  // and exactly the sort of thing a manual is for.
  SUNDRY: ['larva', 'egg', 'lurker_egg', 'cocoon', 'spider_mine', 'nuke', 'scarab', 'interceptor', 'broodling', 'hallucination', 'infested_terran'],
  list(race, kind) {
    race = race || this.race; kind = kind || this.kind;
    const src = kind === 'structures' ? DATA.buildings : DATA.units;
    const ids = Object.keys(src).filter(id => src[id].race === race);
    const rank = id => (this.SUNDRY.includes(id) ? 1 : 0) + (src[id].notUnit ? 0.5 : 0);
    return ids.map((id, i) => [id, rank(id), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(a => a[0]);
  },
  color(race) { return (RACE_INFO[race || this.race] || RACE_INFO.T).color; },

  // Which research, if any, gives this unit suppressing fire. Read off the tech table's own `suppress`
  // list, the same way Unit.suppresses does, so a new one needs no code here.
  suppressTech(id) { for (const k in DATA.techs) { const t = DATA.techs[k]; if (t.suppress && t.suppress.includes(id)) return t; } return null; },

  // What produces this, and what has to exist first. `from` is a building for most things, 'larva' for
  // most of Zerg, and another unit for the morphs and the munitions.
  builtBy(d) {
    if (!d) return [];
    const out = [];
    if (d.isBuilding) {
      if (d.tier === 'morph' || d.morphFrom) out.push('Morphed from ' + (DATA.all[d.morphFrom] ? DATA.all[d.morphFrom].name : 'another structure'));
      else out.push('Built by the ' + (DATA.units[RACE_INFO[d.race].worker] || { name: 'worker' }).name);
    } else if (d.morphFrom) out.push('Morphed from ' + (DATA.all[d.morphFrom] || { name: d.morphFrom }).name);
    else if (d.from) out.push((DATA.all[d.from] ? DATA.all[d.from].name : d.from === 'larva' ? 'Larva' : d.from));
    return out;
  },
  requires(d) { return (d && d.req || []).map(r => (DATA.techs[r] || DATA.all[r] || { name: r }).name); },
  // Everything that names this as a requirement or as its producer -- the other half of a tech tree,
  // and the answer to "I built this, now what does it get me".
  unlocks(d) {
    if (!d) return [];
    const out = [];
    for (const src of [DATA.units, DATA.buildings]) for (const k in src) {
      const o = src[k]; if (o === d) continue;
      if ((o.req || []).includes(d.id) || o.from === d.id || o.morphFrom === d.id) out.push(o.name);
    }
    for (const k in DATA.techs) { const t = DATA.techs[k]; if (t.bld === d.id) out.push(t.name); }
    for (const k in DATA.upgrades) { const u = DATA.upgrades[k]; if (u.bld === d.id) out.push(u.name); }
    return [...new Set(out)];
  },

  // ============================ THE DAMAGE CALCULATOR ========================
  // Every number below comes out of G.damage's own sequence:
  //     shot   = round((w.dmg + upgrades + dmgTech) * (1 + 0.08 * rank))        Unit.wDmg
  //     armour = def.armor + upgrades + armorTech + (rank >= 2 ? 1 : 0)         Unit.armor
  //     if shields:  d = max(0.5, shot - shieldUpgrade), spilling the remainder into the hull
  //     d = (d - armour) * DMG_MULT[type][size]
  //     d *= FACE_MULT[front|flank|rear]
  //     d = max(0.5, d)
  sizeMult(type, size) { const T = (typeof DMG_MULT !== 'undefined' ? DMG_MULT : null); if (!T) return 1; return (T[type] || T.normal)[size || 'medium']; },
  faceMult(f) { const T = (typeof FACE_MULT !== 'undefined' ? FACE_MULT : { front: 1, flank: 1.15, rear: 1.35 }); return T[f] || 1; },
  FACES: ['front', 'flank', 'rear'],

  // Which weapon this attacker would use against that defender. Mirrors Unit.weaponFor.
  weaponFor(A, D, siege) {
    if (!A) return null;
    if (A.id === 'siege_tank' && siege) return (D && D.fly) ? null : (typeof SIEGE_W !== 'undefined' ? SIEGE_W : A.gw);
    if (D && D.fly) { if (A.aw) return A.aw; if (A.gw && A.gw.targets === 'both') return A.gw; return null; }
    if (A.gw && A.gw.targets !== 'air') return A.gw;
    return null;
  },
  shotOf(w, up, vet, techOn) {
    let d = w.dmg + (w.upgKey ? up : 0) * (w.upgDmg || 1);
    if (w.dmgTech && techOn) d += w.dmgTech[1];
    return Math.round(d * (1 + 0.08 * vet));
  },
  armorOf(D, up, vet, techOn) {
    let a = D.armor || 0;
    if (D.upgA) a += up;
    if (D.armorTech && techOn) a += D.armorTech[1];
    if (vet >= 2) a += 1;
    return Math.max(0, a);
  },

  // The whole calculation, as data. `spec` overrides the panel's own state, which is what lets the test
  // drive it without touching the UI.
  calc(spec) {
    const s = Object.assign({
      atk: this.atkId, def: this.defId, aUp: this.aUp, dUp: this.dUp, aVet: this.aVet, dVet: this.dVet,
      aTech: this.aTech, dTech: this.dTech, siege: this.siege, dShieldUp: null,
    }, spec || {});
    const A = DATA.all[s.atk], D = DATA.all[s.def];
    const r = { atk: A, def: D, spec: s, weapon: null, why: null, notes: [], faces: {} };
    if (!A || !D) { r.why = 'Unknown unit.'; return r; }
    let w = this.weaponFor(A, D, s.siege);
    // A carrier's damage is not the carrier's: the gw entry is a launch order and the interceptor
    // carries a weapon of its own. Say so and price the interceptor, because "25 damage" would be a lie.
    if (w && w.interceptor) {
      const ic = DATA.units.interceptor;
      w = ic && ic.gw && (!D.fly || ic.gw.targets === 'both' || ic.gw.targets === 'air') ? ic.gw : null;
      r.via = 'interceptor'; r.notes.push('Dealt by its interceptors -- one weapon each, up to eight in the air.');
    }
    if (!w) { r.why = A.name + ' cannot attack ' + (D.fly ? 'air' : 'ground') + ' targets.'; return r; }
    r.weapon = w;
    r.shot = this.shotOf(w, s.aUp, s.aVet, s.aTech);
    r.base = w.dmg;
    r.hits = w.hits || 1;
    r.cd = w.cd;
    r.armor = this.armorOf(D, s.dUp, s.dVet, s.dTech);
    r.size = D.size || 'medium';
    r.type = w.type;
    r.mult = this.sizeMult(w.type, r.size);
    r.shieldUp = s.dShieldUp == null ? s.dUp : s.dShieldUp;
    r.shields = D.sh || 0;
    r.shieldHit = r.shields ? Math.max(0.5, r.shot - r.shieldUp) : 0;
    // Where a hit lands only means something on a thing that has a facing. Buildings, larvae and eggs
    // are exempt in hitFacing(), and a line attack sweeps everything at once with no direction at all.
    r.noFace = !!(D.isBuilding || D.larva || D.egg);
    r.directional = !w.line && !r.noFace;
    if (!r.directional) r.notes.push(w.line ? 'A line attack hits everything along it at once and has no direction.'
      : (D.isBuilding ? 'Structures have no facing: every hit counts as a front hit.' : 'This has no facing: every hit counts as a front hit.'));
    if (w.splash) r.notes.push('Splash: the target it is aimed at takes a directional hit; everything caught in the blast does not.');
    if (w.glaive) r.notes.push('Bounces twice more for a third of the damage each time.');
    if (w.scarab) r.notes.push('Delivered by a scarab, which has to reach the target first.');
    if (w.burrowOnly) r.notes.push('Only while burrowed.');
    if (w.cdTech) r.notes.push((DATA.techs[w.cdTech[0]] || { name: w.cdTech[0] }).name + ' takes the cooldown to ' + w.cdTech[1] + ' frames.');
    if (w.rangeTech) r.notes.push((DATA.techs[w.rangeTech[0]] || { name: w.rangeTech[0] }).name + ' takes the range to ' + w.rangeTech[1] + '.');
    const sup = this.suppressTech(A.id);
    if (sup) r.notes.push(sup.name + ' pins what this hits to 45% speed for one second.');
    for (const f of this.FACES) {
      const fm = r.directional ? this.faceMult(f) : 1;
      const per = Math.max(0.5, (r.shot - r.armor) * r.mult * fm);
      const k = this.shotsToKill(D, r, fm);
      r.faces[f] = { mult: fm, per, volley: per * r.hits, dps: w.cd ? per * r.hits * TPS / w.cd : 0, kill: k.shots, capped: k.capped };
    }
    return r;
  },
  // Volleys to kill a fresh one, walking the same branch G.damage walks -- including the hit that breaks
  // the last of the shields and spills its remainder into the hull, which is where a naive
  // hp/damage division is wrong by a whole shot against every Protoss unit.
  shotsToKill(D, r, fm) {
    let hp = D.hp, sh = D.sh || 0, n = 0;
    while (hp > 0 && n < 5000) {
      n++;
      for (let i = 0; i < r.hits; i++) {
        let d = r.shot;
        if (sh > 0) { d -= r.shieldUp; if (d < 0.5) d = 0.5; if (d <= sh) { sh -= d; continue; } d -= sh; sh = 0; }
        d = (d - r.armor) * r.mult * fm; if (d < 0.5) d = 0.5;
        hp -= d; if (hp <= 0) break;
      }
    }
    return { shots: n, capped: hp > 0 };
  },

  // ---- layout --------------------------------------------------------------
  // Built fresh from Render's size on every call and never cached, so `click` can hit-test exactly what
  // the last `draw` put on screen -- or what the next one would, if nothing has been drawn yet.
  layout() {
    const R = (typeof Render !== 'undefined' && Render.W) ? Render : { W: 1280, H: 720 };
    const W = Math.max(700, R.W || 1280), H = Math.max(460, R.H || 720);
    const pad = 14;
    const P = { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2 };
    const HEAD = 42, ROW = 22;
    // The calculator's height is not a taste decision: the three facing columns need 72px for their
    // four lines, and everything above them is fixed, so anything under 206 starts eating the answer.
    const CALC = clamp(Math.round(P.h * 0.36), 206, 240);
    const bodyY = P.y + HEAD + 6, bodyH = Math.max(120, P.h - HEAD - CALC - 26);
    const LW = clamp(Math.round(P.w * 0.20), 156, 232);
    const kindsY = bodyY, kindH = 20;
    const list = { x: P.x + 14, y: bodyY + kindH + 4, w: LW, h: bodyH - kindH - 4 };
    const detail = { x: list.x + LW + 12, y: bodyY, w: P.x + P.w - 14 - (list.x + LW + 12), h: bodyH };
    const calc = { x: P.x + 14, y: bodyY + bodyH + 10, w: P.w - 28, h: CALC };
    const perPage = Math.max(1, Math.floor((list.h - 10) / ROW));
    const L = { W, H, panel: P, HEAD, ROW, list, detail, calc, perPage, hot: [], tabs: [], kinds: [], rows: [] };
    const add = (id, x, y, w, h, fn) => { const rec = { id, x, y, w, h, fn }; L.hot.push(rec); return rec; };

    // race tabs
    const tw = clamp(Math.round(P.w * 0.10), 84, 132), th = 26;
    let tx = P.x + Math.min(230, Math.round(P.w * 0.20));
    for (const r of ['T', 'Z', 'P']) {
      L.tabs.push(Object.assign(add('tab_' + r, tx, P.y + 9, tw, th, () => { this.race = r; this.scroll = 0; this.sel = null; this.ensure(); }), { race: r }));
      tx += tw + 6;
    }
    L.close = add('close', P.x + P.w - 82, P.y + 9, 68, th, () => this.close());

    // units / structures
    let kx = list.x;
    for (const k of ['units', 'structures']) {
      const kw = Math.round((list.w - 4) / 2);
      L.kinds.push(Object.assign(add('kind_' + k, kx, kindsY, kw, kindH, () => { this.kind = k; this.scroll = 0; this.sel = null; this.ensure(); }), { kind: k }));
      kx += kw + 4;
    }

    // list rows
    const ids = this.list();
    const sc = clamp(this.scroll, 0, Math.max(0, ids.length - perPage));
    L.ids = ids; L.scroll = sc; L.more = ids.length > perPage;
    for (let i = 0; i < perPage && sc + i < ids.length; i++) {
      const id = ids[sc + i], y = list.y + 5 + i * ROW;
      L.rows.push(Object.assign(add('row_' + id, list.x + 3, y, list.w - 6, ROW - 2, () => {
        if (this.pick === 'atk') { this.atkId = id; this.pick = null; }
        else if (this.pick === 'def') { this.defId = id; this.pick = null; }
        else this.sel = id;
      }), { defId: id }));
    }
    if (L.more) {
      L.up = add('scroll_up', list.x + list.w - 18, list.y + 3, 15, 15, () => { this.scroll = Math.max(0, sc - perPage); });
      L.down = add('scroll_down', list.x + list.w - 18, list.y + list.h - 18, 15, 15, () => { this.scroll = Math.min(Math.max(0, ids.length - perPage), sc + perPage); });
    }

    // detail: the two buttons that load this unit into the calculator
    const bw = 96, bh = 22;
    L.setAtk = add('set_atk', detail.x + detail.w - bw * 2 - 20, detail.y + 10, bw, bh, () => { if (this.sel) this.atkId = this.sel; });
    L.setDef = add('set_def', detail.x + detail.w - bw - 14, detail.y + 10, bw, bh, () => { if (this.sel) this.defId = this.sel; });

    // calculator controls
    const half = Math.floor((calc.w - 24) / 2);
    const slotH = 30;
    const mk = (side, x) => {
      const o = { x, y: calc.y + 26, w: half, h: slotH };
      o.slot = add('slot_' + side, x, o.y, half, slotH, () => { this.pick = this.pick === side ? null : side; });
      const sy = o.y + slotH + 6, sh = 20;
      const step = (nm, sx, sw, get, set, lo, hi) => {
        const g = { x: sx, y: sy, w: sw, h: sh, label: nm, get, lo, hi };
        g.minus = add(nm + '_' + side + '_-', sx + 30, sy, 18, sh, () => set(clamp(get() - 1, lo, hi)));
        g.plus = add(nm + '_' + side + '_+', sx + sw - 18, sy, 18, sh, () => set(clamp(get() + 1, lo, hi)));
        return g;
      };
      const cw = Math.floor((half - 8) / 3);
      o.up = step('UPG', x, cw, () => side === 'atk' ? this.aUp : this.dUp, v => { if (side === 'atk') this.aUp = v; else this.dUp = v; }, 0, 3);
      o.vet = step('VET', x + cw + 4, cw, () => side === 'atk' ? this.aVet : this.dVet, v => { if (side === 'atk') this.aVet = v; else this.dVet = v; }, 0, 3);
      const tx2 = x + (cw + 4) * 2, tw2 = half - (cw + 4) * 2;
      o.tech = { x: tx2, y: sy, w: tw2, h: sh };
      o.tech.hit = add('tech_' + side, tx2, sy, tw2, sh, () => {
        const A = DATA.all[this.atkId], D = DATA.all[this.defId];
        if (side === 'atk') { const w = this.weaponFor(A, D, this.siege); if (A && A.id === 'siege_tank') this.siege = !this.siege; else if (w && w.dmgTech) this.aTech = !this.aTech; }
        else if (D && D.armorTech) this.dTech = !this.dTech;
      });
      o.rowY = sy + sh;
      return o;
    };
    L.atk = mk('atk', calc.x + 8);
    L.def = mk('def', calc.x + 16 + half);
    L.swap = add('swap', calc.x + calc.w - 62, calc.y + 4, 54, 18, () => { const a = this.atkId; this.atkId = this.defId; this.defId = a; const u = this.aUp; this.aUp = this.dUp; this.dUp = u; const v = this.aVet; this.aVet = this.dVet; this.dVet = v; });
    // the three facing columns, with 24px kept back at the bottom for the notes
    const fy = L.atk.rowY + 28, fh = Math.max(52, calc.y + calc.h - 26 - fy);
    const fw = Math.floor((calc.w - 32) / 3);
    L.faceCols = this.FACES.map((f, i) => ({ face: f, x: calc.x + 8 + i * (fw + 8), y: fy, w: fw, h: fh }));
    L.faceY = fy;
    return L;
  },
  hit(rec) { const m = this.mouse; return !!rec && m.x >= rec.x && m.x < rec.x + rec.w && m.y >= rec.y && m.y < rec.y + rec.h; },

  // ---- input ---------------------------------------------------------------
  move(x, y) { this.mouse.x = x; this.mouse.y = y; return this.shown; },
  wheel(dy) { if (!this.shown) return false; this.scroll += dy > 0 ? 3 : -3; this.clampScroll(); return true; },
  // Returns true when the click was the codex's, which is the signal for UI to stop processing it.
  click(x, y, button) {
    if (!this.shown) return false;
    this.mouse.x = x; this.mouse.y = y;
    if (button === 2) { if (this.pick) { this.pick = null; return true; } this.close(); return true; }
    const L = this.layout();
    for (let i = L.hot.length - 1; i >= 0; i--) { const r = L.hot[i]; if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) { r.fn(); return true; } }
    return true;   // a click anywhere on a full-screen panel belongs to the panel
  },
  key(k) {
    if (!this.shown) return false;
    const ids = this.list(), i = Math.max(0, ids.indexOf(this.sel));
    switch (k) {
      case 'Escape': case 'F3': this.close(); return true;
      case 'ArrowDown': case 'ArrowUp': {
        const n = ids.length; if (!n) return true;
        this.sel = ids[clamp(i + (k === 'ArrowDown' ? 1 : -1), 0, n - 1)]; this.ensure(); return true;
      }
      case 'ArrowRight': case 'ArrowLeft': {
        const rs = ['T', 'Z', 'P'], j = rs.indexOf(this.race);
        this.race = rs[(j + (k === 'ArrowRight' ? 1 : 2)) % 3]; this.scroll = 0; this.sel = null; this.ensure(); return true;
      }
      case 'PageDown': this.scroll += this.layout().perPage; this.clampScroll(); return true;
      case 'PageUp': this.scroll -= this.layout().perPage; this.clampScroll(); return true;
      case 'Home': this.scroll = 0; if (ids.length) this.sel = ids[0]; return true;
      case 'End': if (ids.length) { this.sel = ids[ids.length - 1]; this.ensure(); } return true;
      case 'Tab': this.kind = this.kind === 'units' ? 'structures' : 'units'; this.scroll = 0; this.sel = null; this.ensure(); return true;
      case 'Enter': case ' ': if (this.pick && this.sel) { if (this.pick === 'atk') this.atkId = this.sel; else this.defId = this.sel; this.pick = null; } return true;
    }
    const u = String(k || '').toUpperCase();
    if (u === 'A' && this.sel) { this.atkId = this.sel; return true; }
    if (u === 'D' && this.sel) { this.defId = this.sel; return true; }
    if (u === 'S') { this.siege = !this.siege; return true; }
    if (u === 'T' || u === 'Z' || u === 'P') { this.race = u; this.scroll = 0; this.sel = null; this.ensure(); return true; }
    return true;   // while the manual is up it eats the keyboard, so nothing leaks into the game
  },

  // ---- drawing -------------------------------------------------------------
  draw(ctx) {
    if (!this.shown) return false;
    ctx = ctx || (typeof Render !== 'undefined' ? Render.ctx : null); if (!ctx) return false;
    const prev = HUD.skinOverride;
    HUD.skinOverride = this.race;                      // the manual is made of the race it is describing
    try { this.paint(ctx); } finally { HUD.skinOverride = prev; }
    return true;
  },
  paint(ctx) {
    const L = this.layout(), P = L.panel, s = HUD.skin(), col = this.color();
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(0, 0, L.W, L.H);
    HUD.frame(ctx, P.x, P.y, P.w, P.h, { ribs: false });   // one sheet, not a three-section console

    // ---- header ----
    HUD.text(ctx, 'FIELD MANUAL', P.x + 22, P.y + 29, s.edge, 17);
    for (const t of L.tabs) {
      const on = t.race === this.race, hov = this.hit(t);
      HUD.bevel(ctx, t.x, t.y, t.w, t.h, !on, on ? shadeSafe(this.color(t.race), 0.42) : hov ? '#2a3240' : '#151a22');
      HUD.text(ctx, HUD.caps(RACE_INFO[t.race].name), t.x + t.w / 2, t.y + 18, on ? '#fff' : '#9aa4b0', 12, true, 'center');
      if (on) { ctx.fillStyle = this.color(t.race); ctx.fillRect(t.x + 3, t.y + t.h - 3, t.w - 6, 2); }
    }
    HUD.bevel(ctx, L.close.x, L.close.y, L.close.w, L.close.h, !this.hit(L.close), this.hit(L.close) ? '#3a2430' : '#1b2028');
    HUD.text(ctx, 'ESC', L.close.x + L.close.w / 2, L.close.y + 18, '#c8d0d8', 12, true, 'center');
    // The header's right-hand strip is the hint line normally and the pick prompt while a calculator
    // slot is waiting for a unit -- above the list rather than on top of them, which is where it was.
    if (this.pick) HUD.text(ctx, this.pick === 'atk' ? 'PICK AN ATTACKER FROM THE LIST' : 'PICK A DEFENDER FROM THE LIST', L.close.x - 12, L.close.y + 18, '#ffe45a', 11, true, 'right');
    else if (L.close.x - L.tabs[2].x - L.tabs[2].w > 300) HUD.text(ctx, 'arrows move  ·  Tab units/structures  ·  A attacker  ·  D defender  ·  S siege', L.close.x - 12, L.close.y + 18, '#98a2ae', 10, false, 'right');

    // ---- unit list ----
    for (const k of L.kinds) {
      const on = k.kind === this.kind;
      HUD.bevel(ctx, k.x, k.y, k.w, k.h, !on, on ? '#26303c' : this.hit(k) ? '#212833' : '#12161d');
      HUD.text(ctx, HUD.caps(k.kind), k.x + k.w / 2, k.y + 14, on ? s.edge : '#7f8894', 10, true, 'center');
    }
    HUD.inset(ctx, L.list.x, L.list.y, L.list.w, L.list.h);
    for (const r of L.rows) {
      const d = DATA.all[r.defId], on = r.defId === this.sel;
      const isA = r.defId === this.atkId, isD = r.defId === this.defId;
      if (on || this.hit(r)) HUD.bevel(ctx, r.x, r.y, r.w, r.h, !on, on ? '#2c3644' : '#1d232c');
      try { ctx.drawImage(Sprites.icon(r.defId, col, 18), r.x + 3, r.y + 1); } catch (e) { }
      HUD.text(ctx, d ? d.name : r.defId, r.x + 25, r.y + 15, on ? '#ffe45a' : d && (d.notUnit || d.larva || d.egg) ? '#7d8590' : '#cdd4dc', 11, on);
      if (isA || isD) HUD.text(ctx, isA && isD ? 'AD' : isA ? 'A' : 'D', r.x + r.w - 6, r.y + 15, isA ? '#ff8a5a' : '#6fd0ff', 10, true, 'right');
    }
    if (L.more) {
      for (const [b, gl] of [[L.up, '▲'], [L.down, '▼']]) { HUD.bevel(ctx, b.x, b.y, b.w, b.h, !this.hit(b), '#1b212a'); HUD.text(ctx, gl, b.x + b.w / 2, b.y + 12, '#aab3bd', 9, true, 'center'); }
      HUD.text(ctx, (L.scroll + 1) + '-' + Math.min(L.ids.length, L.scroll + L.perPage) + ' of ' + L.ids.length, L.list.x + 4, L.list.y + L.list.h - 4, '#6f7883', 9, false);
    }

    // ---- detail ----
    this.drawDetail(ctx, L);
    // ---- calculator ----
    this.drawCalc(ctx, L);
    ctx.restore();
  },

  drawDetail(ctx, L) {
    const D = L.detail, d = DATA.all[this.sel], col = this.color();
    HUD.inset(ctx, D.x, D.y, D.w, D.h);
    if (!d) { HUD.text(ctx, 'Nothing selected.', D.x + 16, D.y + 30, '#8a93a0', 12, false); return; }
    ctx.save(); ctx.beginPath(); ctx.rect(D.x, D.y, D.w, D.h); ctx.clip();
    // portrait
    const PS = 92;
    HUD.bevel(ctx, D.x + 10, D.y + 10, PS, PS, false, '#080b10');
    try { ctx.drawImage(Sprites.icon(d.id, col, PS - 8), D.x + 14, D.y + 14); } catch (e) { }
    ctx.fillStyle = 'rgba(255,255,255,0.035)'; for (let i = 0; i < PS - 4; i += 3) ctx.fillRect(D.x + 12, D.y + 12 + i, PS - 4, 1);

    const tx = D.x + PS + 24; let y = D.y + 30;
    HUD.text(ctx, d.name, tx, y, HUD.skin().edge, 17); y += 18;
    const kindLine = [d.isBuilding ? 'Structure' : (d.notUnit ? 'Munition' : 'Unit'), RACE_INFO[d.race].name,
      d.isBuilding ? (d.w + 'x' + d.h + ' tiles') : (d.size || 'medium'), d.fly ? 'air' : 'ground',
      d.det ? 'detector' : null, d.worker ? 'worker' : null, d.cloaked ? 'cloaked' : null].filter(Boolean).join('  ·  ');
    HUD.text(ctx, kindLine, tx, y, '#8f98a4', 11, false); y += 18;
    const cost = [];
    if (d.min) cost.push(d.min + ' min'); if (d.gas) cost.push(d.gas + ' gas');
    if (d.sup) cost.push(d.sup + (d.pair ? ' x2' : '') + ' supply'); if (d.supGive) cost.push('+' + d.supGive + ' supply');
    if (d.time) cost.push(Math.round(d.time / TPS) + 's');
    HUD.text(ctx, cost.length ? cost.join('   ') : 'No build cost', tx, y, '#ffe45a', 12); y += 18;
    // What the thing is FOR, straight under the price and above the two columns of numbers. It wraps
    // to the space left of the calculator buttons rather than the whole pane, or it runs under them.
    if (d.desc) { y = this.wrap(ctx, d.desc, tx, y, D.w - (tx - D.x) - 150, '#9fb0c4', 11) + 4; }
    else y += 2;

    // buttons that load it into the calculator
    for (const [b, lbl, c] of [[L.setAtk, 'AS ATTACKER (A)', '#ff8a5a'], [L.setDef, 'AS DEFENDER (D)', '#6fd0ff']]) {
      HUD.bevel(ctx, b.x, b.y, b.w, b.h, !this.hit(b), this.hit(b) ? '#2a3240' : '#171d25');
      HUD.text(ctx, lbl, b.x + b.w / 2, b.y + 15, c, 9, true, 'center');
    }

    // two columns of facts
    const colW = Math.floor((D.w - 28) / 2), c1 = D.x + 14, c2 = c1 + colW + 4;
    let ly = Math.max(y, D.y + PS + 24);
    const rowsL = [], rowsR = [];
    const push = (arr, k, v, c) => { if (v !== null && v !== undefined && v !== '') arr.push([k, String(v), c]); };
    push(rowsL, 'Hit points', d.hp);
    if (d.sh) push(rowsL, 'Shields', d.sh, '#6fa8ff');
    push(rowsL, 'Armour', (d.armor || 0) + (d.upgA ? '  (+1 per ' + (DATA.upgrades[d.upgA] || { name: d.upgA }).name + ')' : ''));
    if (d.armorTech) push(rowsL, 'Armour tech', '+' + d.armorTech[1] + ' from ' + (DATA.techs[d.armorTech[0]] || { name: d.armorTech[0] }).name);
    // Scars and ranks go high in the column, above speed and sight, because they are the two facts
    // nothing else on screen ever states and speed is visible in the game already. On a short window
    // the bottom of this column is what gets clipped, so the order IS the priority.
    if (!d.isBuilding && !d.larva && !d.egg) {
      push(rowsL, 'Scar floor', Math.round(d.hp * 0.4) + ' hp  (a tenth of every wound is permanent)', '#d89a6a');
      push(rowsL, 'Ranks', '2 / 5 / 10 kills  ·  +8% damage each  ·  +1 armour at rank 2', '#d8c46a');
    }
    if (!d.isBuilding) push(rowsL, 'Speed', (d.speed || 0).toFixed(2) + ' px/frame' + (d.speedTech ? '  (' + d.speedTech[1].toFixed(2) + ' with ' + (DATA.techs[d.speedTech[0]] || { name: d.speedTech[0] }).name + ')' : ''));
    push(rowsL, 'Sight', (d.sight || 7) + ' tiles');
    if (d.energy) push(rowsL, 'Energy', d.energy);
    if (d.cargo) push(rowsL, 'Transport', d.cargo + ' slots');
    if (d.cargoSize) push(rowsL, 'Cargo size', d.cargoSize);

    for (const [w, lbl] of [[d.gw, 'Ground'], [d.aw, 'Air']]) {
      if (!w) continue;
      // A carrier's weapon entry is a launch order and its `dmg` is never dealt by anything -- printing
      // "6 normal, 3.9 dps" beside a 350-mineral capital ship would be the single most misleading line
      // in the manual, so the interceptor's own gun goes here instead.
      if (w.interceptor) { const ic = DATA.units.interceptor; push(rowsR, lbl + ' weapon', 'Launches interceptors at range ' + w.range + '; each carries ' + ic.gw.dmg + ' ' + ic.gw.type + ' every ' + ic.gw.cd + ' frames'); continue; }
      const tags = [w.line ? 'line' : null, w.burrowOnly ? 'burrowed only' : null, w.glaive ? 'bounces twice' : null, w.scarab ? 'delivered by a scarab' : null, w.suicide ? 'one use' : null].filter(Boolean);
      push(rowsR, lbl + ' weapon', w.dmg + (w.hits > 1 ? ' x' + w.hits : '') + ' ' + w.type + '  range ' + w.range + '  every ' + w.cd + 'f  (' + (w.cd ? (w.dmg * (w.hits || 1) * TPS / w.cd).toFixed(1) : '0') + ' dps)' + (tags.length ? '  [' + tags.join(', ') + ']' : ''));
      if (w.upgKey) push(rowsR, '  upgraded by', (DATA.upgrades[w.upgKey] || { name: w.upgKey }).name + '  (+' + (w.upgDmg || 1) + ' a level)');
      if (w.splash) push(rowsR, '  splash', w.splash.join(' / ') + ' tiles');
    }
    if (d.id === 'siege_tank' && typeof SIEGE_W !== 'undefined') push(rowsR, 'Siege weapon', SIEGE_W.dmg + ' ' + SIEGE_W.type + '  range ' + SIEGE_W.range + '  every ' + SIEGE_W.cd + 'f');
    const sup = this.suppressTech(d.id);
    if (sup) push(rowsR, 'Suppression', sup.name + ' at the ' + (DATA.buildings[sup.bld] || { name: sup.bld }).name + '  (' + sup.min + '/' + sup.gas + ')', '#ff9a5a');
    for (const l of this.builtBy(d)) push(rowsR, 'Built at', l);
    const req = this.requires(d); if (req.length) push(rowsR, 'Requires', req.join(', '), '#ffb060');
    if ((d.produces || []).length) push(rowsR, 'Trains', d.produces.map(i => (DATA.units[i] || { name: i }).name).join(', '));
    if ((d.upg || []).length) push(rowsR, 'Upgrades', d.upg.map(i => (DATA.upgrades[i] || { name: i }).name).join(', '));
    if ((d.tech || []).length) push(rowsR, 'Researches', d.tech.map(i => (DATA.techs[i] || { name: i }).name).join(', '));
    if ((d.addons || []).length) push(rowsR, 'Add-ons', d.addons.map(i => (DATA.buildings[i] || { name: i }).name).join(', '));
    if ((d.abil || []).length) push(rowsR, 'Abilities', d.abil.map(i => (DATA.abilities[i] || { name: i }).name).join(', '));
    if (d.aura) push(rowsR, 'Aura', d.aura.kind + ', ' + d.aura.r + ' tiles, ' + d.aura.affects);
    const unl = this.unlocks(d); if (unl.length) push(rowsR, 'Unlocks', unl.slice(0, 8).join(', ') + (unl.length > 8 ? ' +' + (unl.length - 8) + ' more' : ''));

    const drawCol = (rows, x, w) => {
      let yy = ly;
      for (const [k, v, c] of rows) {
        if (yy > D.y + D.h - 8) break;
        HUD.text(ctx, k, x, yy, '#77808c', 10, false);
        yy += 12;
        yy = this.wrap(ctx, v, x + 6, yy, w - 10, c || '#c8d0d8', 11) + 6;
      }
      return yy;
    };
    drawCol(rowsL, c1, colW); drawCol(rowsR, c2, colW);
    ctx.restore();
  },
  // Word wrap for the fact columns and the description. The splitting lives in HUD.wrapLines so the
  // command-card tooltip, which has to size its panel before it draws, breaks lines the same way.
  wrap(ctx, text, x, y, w, color, sz) {
    for (const line of HUD.wrapLines(ctx, text, w, sz)) { HUD.text(ctx, line, x, y, color, sz, false); y += sz + 3; }
    return y;
  },

  drawCalc(ctx, L) {
    const C = L.calc, s = HUD.skin();
    HUD.inset(ctx, C.x, C.y, C.w, C.h);
    HUD.text(ctx, 'DAMAGE', C.x + 10, C.y + 17, s.edge, 12);
    HUD.bevel(ctx, L.swap.x, L.swap.y, L.swap.w, L.swap.h, !this.hit(L.swap), this.hit(L.swap) ? '#2a3240' : '#171d25');
    HUD.text(ctx, 'SWAP', L.swap.x + L.swap.w / 2, L.swap.y + 13, '#c0c8d2', 9, true, 'center');

    const r = this.calc();
    const A = DATA.all[this.atkId], Dn = DATA.all[this.defId];
    for (const [side, o, def, c, lbl] of [['atk', L.atk, A, '#ff8a5a', 'ATTACKER'], ['def', L.def, Dn, '#6fd0ff', 'DEFENDER']]) {
      const picking = this.pick === side;
      HUD.bevel(ctx, o.slot.x, o.slot.y, o.slot.w, o.slot.h, !picking, picking ? '#3a3020' : this.hit(o.slot) ? '#242c38' : '#141920');
      try { if (def) ctx.drawImage(Sprites.icon(def.id, this.color(def.race), 26), o.slot.x + 3, o.slot.y + 2); } catch (e) { }
      HUD.text(ctx, lbl, o.slot.x + 34, o.slot.y + 13, c, 9, true);
      HUD.text(ctx, def ? def.name : '--', o.slot.x + 34, o.slot.y + 26, '#e6eaf0', 12);
      // steppers
      for (const g of [o.up, o.vet]) {
        HUD.bevel(ctx, g.x, g.y, g.w, g.h, true, '#141920');
        HUD.text(ctx, g.label, g.x + 4, g.y + 14, '#7f8894', 9, false);
        HUD.text(ctx, String(g.get()), g.x + g.w / 2 + 4, g.y + 14, '#ffe45a', 12, true, 'center');
        for (const [b, t2] of [[g.minus, '-'], [g.plus, '+']]) { HUD.bevel(ctx, b.x, b.y, b.w, b.h, !this.hit(b), this.hit(b) ? '#2f3846' : '#1b212a'); HUD.text(ctx, t2, b.x + b.w / 2, b.y + 14, '#cdd4dc', 11, true, 'center'); }
      }
      // the one contextual toggle: a damage tech, an armour tech, or siege mode
      const t = o.tech; let tl = null, on = false;
      if (side === 'atk') {
        if (A && A.id === 'siege_tank') { tl = 'SIEGE'; on = this.siege; }
        else if (r.weapon && r.weapon.dmgTech) { tl = HUD.caps((DATA.techs[r.weapon.dmgTech[0]] || { name: '' }).name).slice(0, 14); on = this.aTech; }
      } else if (Dn && Dn.armorTech) { tl = HUD.caps((DATA.techs[Dn.armorTech[0]] || { name: '' }).name).slice(0, 14); on = this.dTech; }
      HUD.bevel(ctx, t.x, t.y, t.w, t.h, !on, !tl ? '#101419' : on ? '#2c3a24' : this.hit(t) ? '#242c38' : '#141920');
      HUD.text(ctx, tl || '--', t.x + t.w / 2, t.y + 14, tl ? (on ? '#9fe07a' : '#98a2ae') : '#4a525c', 9, true, 'center');
    }

    // the chain, in one line
    const chainY = L.atk.rowY + 20;
    if (r.why) { HUD.text(ctx, r.why, C.x + 12, chainY, '#ff8a8a', 12); }
    else {
      const parts = [
        ['SHOT', String(r.shot), '#ffe45a'],
        ['-ARMOUR', String(r.armor), '#9fb8d8'],
        ['x' + r.mult.toFixed(2), r.type + ' vs ' + r.size, '#a8b4c0'],
      ];
      if (r.shields) parts.push(['SHIELDS', r.shieldHit.toFixed(1) + ' a hit (' + r.shields + ')', '#6fa8ff']);
      let px = C.x + 12;
      for (const [k, v, c] of parts) {
        HUD.text(ctx, k, px, chainY, '#77808c', 10, false); px += ctx.measureText(k).width + 6;
        ctx.font = HUD.font(12); HUD.text(ctx, v, px, chainY, c, 12); px += ctx.measureText(v).width + 18;
      }
      if (r.hits > 1) HUD.text(ctx, r.hits + ' hits a volley', px, chainY, '#a8b4c0', 11, false);
    }

    // three facing columns -- the whole reason this panel exists
    for (const fc of L.faceCols) {
      const f = r.faces[fc.face];
      const on = fc.face !== 'front' && r.directional;
      HUD.bevel(ctx, fc.x, fc.y, fc.w, fc.h, true, on ? (fc.face === 'rear' ? '#2a1a1a' : '#26221a') : '#141920');
      const c = fc.face === 'front' ? '#c8d0d8' : fc.face === 'flank' ? '#ffd07a' : '#ff8a6a';
      HUD.text(ctx, HUD.caps(fc.face) + (f ? '  x' + f.mult.toFixed(2) : ''), fc.x + 8, fc.y + 14, c, 11);
      if (!f) { HUD.text(ctx, '--', fc.x + 8, fc.y + 34, '#5a626c', 14); continue; }
      const big = f.per.toFixed(1);
      HUD.text(ctx, big, fc.x + 8, fc.y + 36, '#fff', 19);
      HUD.text(ctx, 'per hit', fc.x + 12 + ctx.measureText(big).width, fc.y + 36, '#8f98a4', 10, false);
      if (fc.h >= 54) HUD.text(ctx, (r.hits > 1 ? f.volley.toFixed(1) + ' a volley   ' : '') + f.dps.toFixed(1) + ' dps', fc.x + 8, fc.y + 50, '#b6c0cc', 11, false);
      if (fc.h >= 68) HUD.text(ctx, f.capped ? 'it cannot kill it' : f.kill + (r.hits > 1 ? ' volleys' : ' shots') + ' to kill', fc.x + 8, fc.y + 64, '#9fd08a', 11, false);
    }

    // notes along the bottom: the exceptions, which are where a calculator earns its trust
    let ny = C.y + C.h - 18;
    for (const n of r.notes.slice(0, 2)) { HUD.text(ctx, n, C.x + 12, ny, '#8a93a0', 10, false); ny += 12; }
  },
};
// shade() lives in sprites_units.js and is not guaranteed to be loaded before this file; the tab tint is
// cosmetic, so fall back to the flat colour rather than making the manual depend on the sprite pipeline.
function shadeSafe(hex, k) { try { return shade(hex, k); } catch (e) { return hex; } }
