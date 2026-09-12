// The AI build scripts have one invariant that is easy to break and expensive to notice: the steps must
// be in ascending supply order. AI.script() scans forward from the first thing it still owes and breaks
// on `p.supUsed < s[i][0]`, so one out-of-order entry hides every step behind it until supply catches up.
// That happened once, in M10: a shield battery at supply 29 slipped between a pylon at 27 and a robotics
// facility at 28, and Protoss stopped reaching its templar archives at all.
//   node test/aiscripts.js
const vm = require('vm'), { makeCtx, ok, summary } = require('./_harness');
const ctx = makeCtx({ files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai'], ext: false });
const { D, SCR, COMP, RES } = vm.runInContext('({D:DATA,SCR:AI_SCRIPTS,COMP:AI_COMP,RES:AI_RESEARCH})', ctx);
for (const race of Object.keys(SCR)) {
  const s = SCR[race]; const bad = [];
  for (let i = 1; i < s.length; i++) if (s[i][0] < s[i - 1][0]) bad.push(`${s[i - 1][1]}@${s[i - 1][0]} then ${s[i][1]}@${s[i][0]}`);
  ok(!bad.length, race + ' build script is in ascending supply order (' + s.length + ' steps)', bad.join('; '));
  const unknown = s.filter(([, id]) => !D.buildings[id]).map(([, id]) => id);
  ok(!unknown.length, race + ' build script names only real buildings', unknown.join(' '));
}
for (const key of Object.keys(COMP)) {
  const unknown = COMP[key].filter(([id]) => !D.units[id]).map(([id]) => id);
  ok(!unknown.length, 'AI_COMP.' + key + ' names only real units', unknown.join(' '));
  const race = key[0]; const wrong = COMP[key].filter(([id]) => D.units[id] && D.units[id].race !== race).map(([id]) => id);
  ok(!wrong.length, 'AI_COMP.' + key + ' units all belong to ' + race, wrong.join(' '));
}
for (const race of Object.keys(RES)) {
  const unknown = RES[race].filter(id => !D.techs[id] && !D.upgrades[id]);
  ok(!unknown.length, 'AI_RESEARCH.' + race + ' names only real techs and upgrades', unknown.join(' '));
  const dupes = RES[race].filter((id, i) => RES[race].indexOf(id) !== i);
  ok(!dupes.length, 'AI_RESEARCH.' + race + ' has no duplicates', dupes.join(' '));
}
// M11 wave two added nine buildings -- a field hospital, a jammer and a wall for each race -- and not
// one of them was in any build script, so no computer opponent could ever have one. Three of the nine
// are Protoss morphs off a Shield Battery, and AI.morph derived its source from a three-way ternary
// listing every morph that existed when it was written, so those three were unreachable even once they
// were in the script. Both are fixed; this is the guard.
{
  const NEW = ['aid_station', 'scrambler_mast', 'blast_barricade', 'mending_pool', 'miasma_gland',
    'carapace_ridge', 'rejuvenation_shrine', 'null_obelisk', 'warded_bastion'];
  const inScript = id => Object.values(SCR).some(list => list.some(e => e[1] === id));
  const missing = NEW.filter(id => !inScript(id));
  ok(missing.length === 0, 'every M11 structure appears in a build script', missing.join(', '));

  // A morph must have a source the AI can find, or being in the script changes nothing. Resolved
  // inside the context, because morphSource walks DATA.
  const src = vm.runInContext('(ids => ids.map(id => AI.prototype.morphSource.call({}, id)))', ctx);
  const morphs = NEW.filter(id => D.buildings[id] && D.buildings[id].tier === 'morph');
  ok(morphs.length === 3, 'three of them are morphs off a Shield Battery', morphs.join(', '));
  const sources = src(morphs);
  ok(sources.every(x => x), '...and AI.morphSource resolves every one from the data', JSON.stringify(sources));

  // the ternary this replaced: the three original morphs must still resolve to the same sources
  const orig = [['lair', 'hatchery'], ['hive', 'lair'], ['greater_spire', 'spire']];
  const got = src(orig.map(o => o[0]));
  const wrong = orig.filter((o, i) => got[i] !== o[1]);
  ok(wrong.length === 0, 'and the three original morphs still resolve as they did', JSON.stringify([orig.map(o => o[1]), got]));
}

summary();
