// Caster audit: which of the spells the AI ever actually casts, and why the rest do not.
//   node test/casters.js [frames=60000] [seeds=1,2,3]
// The cap defaults to 60,000 (41 minutes) and not 24,000, because 24,000 materially under-reports:
// it showed 3 of 11 caster kinds fielded where 60,000 shows 5, and every advanced caster's enabling
// building lands between 11:44 and 22:46. A cap that ends the game before the tech arrives cannot
// tell 'the AI will not' from 'the game stopped', which is the one question this file exists to ask.
// M6 found "the AI never fields an advanced caster" as a side effect of the unspent-energy audit, and
// could only say it with a caster-seconds figure. This makes it the primary measurement instead: per
// race, when the enabling building finished, when the first caster of each kind existed, how many
// caster-seconds it lived, and every cast that happened. A caster that is never built is a script
// problem; a caster that lives and never casts is a micro problem. The two need different fixes and
// the energy audit cannot tell them apart.
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const FRAMES = parseInt(process.argv[2] || '60000');
const SEEDS = (process.argv[3] || '1,2,3').split(',').map(Number);
const MATCHUPS = ['TZ', 'TP', 'ZP'];
// The casters whose spells sit behind a tech building. Everything here has working code in
// js/abilities.js and an autocast or a use in AI.micro(), so a zero is never "unimplemented".
const CASTERS = { T: ['comsat_station', 'science_vessel', 'ghost', 'battlecruiser', 'wraith'], Z: ['defiler', 'queen'], P: ['high_templar', 'dark_archon', 'arbiter', 'corsair'] };
const ENABLER = { comsat_station: 'academy', science_vessel: 'science_facility', ghost: 'covert_ops', battlecruiser: 'physics_lab', wraith: 'starport', defiler: 'defiler_mound', queen: 'queens_nest', high_templar: 'templar_archives', dark_archon: 'templar_archives', arbiter: 'arbiter_tribunal', corsair: 'stargate' };

function ctxFor() {
  const errors = [];
  const c = { console: { log() { }, warn() { }, error: (...a) => errors.push(String(a[0])) }, Math, performance, addEventListener() { }, setTimeout, document: { getElementById: () => ({ style: {}, addEventListener() { } }), createElement: () => ({ getContext: () => null }), addEventListener() { }, hasFocus: () => false }, requestAnimationFrame() { } };
  c.window = c; vm.createContext(c);
  for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), c, { filename: f + '.js' });
  c.errors = errors; return c;
}
// A "spell" here is an ability that costs energy or needs research: that is the set the AI has to
// decide to use, as opposed to build menus, morphs and interceptor production.
const meta = JSON.parse(vm.runInContext('JSON.stringify({' +
  'owner: (() => { const m = {}; for (const [id, d] of Object.entries(DATA.all)) for (const a of (d.abil || [])) if (!m[a]) m[a] = id; return m; })(),' +
  'spells: Object.entries(DATA.abilities).filter(([, a]) => (a.energy || a.tech) && a.kind !== "morph" && a.kind !== "produce" && a.kind !== "menu").map(([id]) => id),' +
  '})', ctxFor()));

// Abilities.cast is the one choke point a finished spell goes through, so wrapping it counts casts
// without the sim knowing. yamato/nuke/recall resolve in channel() instead; they are counted where
// their energy is actually spent, so the tally means "it happened" rather than "it was ordered".
const PROBE = `
  const S = { casts: {}, secs: {}, first: {}, bld: {}, minutes: 0 };
  const K = (owner, id) => G.players[owner].race + ':' + id;
  const _cast = Abilities.cast.bind(Abilities), _chan = Abilities.channel.bind(Abilities), _inst = Abilities.instant.bind(Abilities);
  const hit = (owner, id) => { const k = K(owner, id); S.casts[k] = (S.casts[k] || 0) + 1; };
  Abilities.cast = (u, id, t, x, y) => { hit(u.owner, id); return _cast(u, id, t, x, y); };
  Abilities.channel = (u, o) => { const e = u.energy, r = _chan(u, o); if (u.energy < e) hit(u.owner, o.abil); return r; };
  Abilities.instant = (u, id) => { const r = _inst(u, id); if (r) hit(u.owner, id); return r; };  // stim, siege, burrow and the cloaks never reach cast()
  for (let f = 0; f < ${FRAMES} && !G.over; f++) {
    G.tick();
    if (f % 24) continue;                              // once a second is enough for "did this ever exist"
    for (const u of G.units) {
      if (!u.alive) continue;
      const k = K(u.owner, u.def.id);
      if (u.isBuilding && u.done && S.bld[k] === undefined) S.bld[k] = G.frame;
      if (!u.maxEnergy) continue;
      if (S.first[k] === undefined) S.first[k] = G.frame;
      S.secs[k] = (S.secs[k] || 0) + 1;
    }
  }
  S.minutes = G.frame / 24 / 60; this.stats = S;
`;

const T = { casts: {}, secs: {}, first: {}, bld: {} }; let games = 0, minutes = 0;
const fielded = {};
for (const mu of MATCHUPS) for (const seed of SEEDS) {
  const c = ctxFor();
  const layout = mu === 'TZ' ? 'temple' : mu === 'TP' ? 'valley' : 'bloodbath';
  vm.runInContext(`G.init({ players: [{ race: '${mu[0]}', human: false, difficulty: 'normal', name: 'A' }, { race: '${mu[1]}', human: false, difficulty: 'normal', name: 'B' }], seed: ${seed}, layout: '${layout}' });` + PROBE, c);
  const S = c.stats; games++; minutes += S.minutes;
  for (const [k, v] of Object.entries(S.casts)) T.casts[k] = (T.casts[k] || 0) + v;
  for (const [k, v] of Object.entries(S.secs)) T.secs[k] = (T.secs[k] || 0) + v;
  for (const [k, v] of Object.entries(S.first)) { (T.first[k] = T.first[k] || []).push(v); fielded[k] = (fielded[k] || 0) + 1; }
  for (const [k, v] of Object.entries(S.bld)) (T.bld[k] = T.bld[k] || []).push(v);
  if (c.errors.length) console.log('  errors in ' + mu + ' seed ' + seed + ': ' + c.errors[0]);
}

const clock = f => Math.floor(f / 24 / 60) + ':' + String(Math.floor(f / 24) % 60).padStart(2, '0');
const med = a => { if (!a || !a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
const gamesPerRace = Math.round(games * 2 / 3);        // each race plays two of the three matchups
console.log('caster audit over ' + games + ' games, ' + minutes.toFixed(0) + ' game-minutes, cap ' + FRAMES + ' frames\n');
console.log('  race caster            enabler  games    first  caster-s  games  casts');
let kinds = 0, fieldedAdv = 0, castingAdv = 0;
for (const [race, ids] of Object.entries(CASTERS)) {
  for (const id of ids) {
    kinds++;
    const k = race + ':' + id, bk = race + ':' + ENABLER[id];
    const casts = Object.entries(T.casts).filter(([ck]) => ck.startsWith(race + ':') && meta.owner[ck.slice(2)] === id);
    const n = casts.reduce((s, [, v]) => s + v, 0);
    const b = med(T.bld[bk]), fr = med(T.first[k]);
    if (fr !== null) fieldedAdv++;
    if (n) castingAdv++;
    // The enabler's own game count matters as much as its median: "11:43" over one game of six is a
    // different statement from "11:43" over six, and the median alone cannot tell them apart.
    console.log('  ' + race + '    ' + id.padEnd(16) + (b === null ? '  never' : clock(b).padStart(7)) + String((T.bld[bk] || []).length).padStart(6) + '/' + gamesPerRace + (fr === null ? '    never' : clock(fr).padStart(9)) + String(T.secs[k] || 0).padStart(10) + String(fielded[k] || 0).padStart(6) + '/' + gamesPerRace + '  ' + (n ? casts.map(([ck, v]) => ck.slice(2) + ' x' + v).join(', ') : '-'));
  }
}
const allCasts = Object.entries(T.casts).sort((a, b) => b[1] - a[1]);
console.log('\n  every cast that happened: ' + (allCasts.length ? allCasts.map(([k, v]) => k + ' x' + v).join(', ') : 'none'));
const did = new Set(allCasts.map(([k]) => k.slice(2)));
const never = meta.spells.filter(s => !did.has(s));
console.log('  never cast (' + never.length + ' of ' + meta.spells.length + ' spell abilities): ' + never.join(', '));
console.log('\n  advanced casters fielded ' + fieldedAdv + '/' + kinds + ' kinds, of which casting ' + castingAdv);
