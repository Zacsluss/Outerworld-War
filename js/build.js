'use strict';
// ============================================================================
// Build stamp. Saves and replays are a seed plus a command log, so they only
// reproduce the original game if the simulation behaves identically. A save
// from a different build re-simulates into something else and drifts away
// silently, which looks like a corrupt save rather than a version mismatch.
//
// There is no build step, so the stamp is computed by reflection: a digest of
// the data tables plus the source text of every function the simulation runs.
// Function.prototype.toString returns the exact source slice, so two copies of
// the same files hash the same in any engine, and editing any sim file changes
// the hash. Render, HUD and input code is deliberately not included - it cannot
// affect the simulation, and stamping it would reject saves for a UI tweak.
// ============================================================================
const BUILD = {
  _hash: null,

  // Deterministic textual serialisation. Keys are sorted so property order cannot
  // change the digest; depth and a seen-set keep cyclic tables (a def referring
  // back to its parent) from running away.
  ser(v, out, seen, depth) {
    if (depth > 8) { out.push('~'); return; }
    const t = typeof v;
    if (t === 'function') { out.push('fn', Function.prototype.toString.call(v)); return; }
    if (v === null || v === undefined || t !== 'object') { out.push(String(v)); return; }
    if (seen.has(v)) { out.push('@'); return; }
    seen.add(v);
    if (Array.isArray(v)) { out.push('['); for (const x of v) this.ser(x, out, seen, depth + 1); out.push(']'); }
    else if (v instanceof Set) { out.push('S['); for (const x of [...v].map(String).sort()) out.push(x); out.push(']'); }
    else if (v instanceof Map) { out.push('M['); for (const k of [...v.keys()].map(String).sort()) { out.push(k); this.ser(v.get(k), out, seen, depth + 1); } out.push(']'); }
    else { out.push('{'); for (const k of Object.keys(v).sort()) { out.push(k); this.ser(v[k], out, seen, depth + 1); } out.push('}'); }
    seen.delete(v); // a shared def reached twice by different paths should read the same both times
  },

  // Only the functions of an object, by name. Used for the live singletons (G, CMD,
  // Abilities...) whose own properties are mostly running game state.
  fns(name, o, out) {
    if (!o) return;
    out.push('#' + name);
    for (const k of Object.getOwnPropertyNames(o).sort()) {
      let v; try { v = o[k]; } catch (e) { continue; } // getters on a prototype can throw off an instance
      if (typeof v === 'function') { out.push(k, Function.prototype.toString.call(v)); }
    }
  },

  // Every global that can change what the simulation does. Missing ones are skipped so
  // this still works in the headless harnesses, which load a subset of the files.
  parts() {
    const out = [], seen = new Set();
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    const look = n => { try { return typeof eval(n) !== 'undefined' ? eval(n) : g[n]; } catch (e) { return g[n]; } };
    for (const n of ['DATA', 'RACE_INFO', 'TURN', 'ACCEL', 'MAP_LAYOUTS', 'NO_BROODLING', 'AI_SCRIPTS', 'AI_COMP', 'AI_RESEARCH']) {
      const v = look(n); if (v !== undefined) { out.push('$' + n); this.ser(v, out, seen, 0); }
    }
    for (const [n, o] of [['G', look('G')], ['CMD', look('CMD')], ['Abilities', look('Abilities')], ['Missions', look('Missions')], ['RNG', look('RNG')],
    ['Unit', look('Unit') && look('Unit').prototype], ['Player', look('Player') && look('Player').prototype],
    ['AI', look('AI') && look('AI').prototype], ['GameMap', look('GameMap') && look('GameMap').prototype],
    ['Pathfinder', look('Pathfinder') && look('Pathfinder').prototype], ['MapCodec', look('MapCodec')]]) this.fns(n, o, out);
    return out;
  },

  // 64-bit-ish digest as two FNV-1a lanes, printed as 16 hex chars.
  hash() {
    if (this._hash) return this._hash;
    let a = 0x811c9dc5 | 0, b = 0x01000193 | 0;
    const s = this.parts().join('');
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b + c, 2654435761) ^ (b >>> 15); }
    const hex = v => (v >>> 0).toString(16).padStart(8, '0');
    return this._hash = hex(a) + hex(b);
  },

  // null when the save can be trusted, otherwise a sentence to show the player.
  check(d, what = 'save') {
    const mine = this.hash();
    if (!d || !d.build) return `This ${what} was made by an older build that did not stamp its version. Re-simulating it would drift out of sync with the original game, so it cannot be loaded. (This build is ${mine}.)`;
    if (d.build !== mine) return `This ${what} was made by a different build of the game (${what} ${d.build}, this build ${mine}). Re-simulating it would drift out of sync with the original game, so it cannot be loaded.`;
    return null;
  },
};
