// FIXLIST-M14 A4 -- nothing is gated by convention. The audit, made durable.
//
// Reported as "the Reactor gives no prerequisite error". True, and the cause was wider than the
// Reactor. The audit that item demanded was run as a probe before anything was edited, and it found
// three holes rather than one:
//
//   1. FIVE of the seven add-ons carried no `req` at all -- reactor, machine_shop, control_tower,
//      physics_lab, covert_ops. `p.hasReq` passes trivially against an empty list, so nothing could be
//      refused and nothing was said.
//   2. FOUR refusal states in G.queueAddon said NOTHING AT ALL: parent unfinished, parent already has
//      an add-on, parent busy, parent lifted. That, more than the missing `req`, is what a player
//      experiences as "it gives no error".
//   3. THE COMMANDS TRUSTED THE COMMAND CARD. Measured before the fix: a Barracks accepted a Physics
//      Lab, a Machine Shop, Siege Tech AND Vehicle Weapons, and a Factory accepted being turned into
//      an Orbital Command -- silently, and paid for. Only the UI knew which building offered what.
//      A command log is not the UI; it is the simulation's public interface, reachable from a replay,
//      a rejoin or a modified client.
//
// So this file asks one question of every command: can it be asked for something the building does
// not offer, and does every refusal say which one it is. It is written as a sweep over the tables
// rather than a list of cases, so an add-on or a morph added in a later milestone is covered the day
// it lands.
//
//   node test/gated.js
const fs = require('fs'), vm = require('vm'), path = require('path'); const root = path.join(__dirname, '..');
const errors = [];
const ctx = { console: { log() { }, warn() { }, error: (...a) => errors.push(a.join(' ')) }, Math, performance, setTimeout, setInterval() { return 0; }, addEventListener() { }, requestAnimationFrame() { }, Image: function () { },
  localStorage: { getItem() { return null; }, setItem() { } }, location: { protocol: 'http:', host: 'localhost' },
  document: { getElementById: () => ({ style: {}, addEventListener() { }, getContext: () => null, click() { }, value: '', appendChild() { }, querySelectorAll: () => [] }), createElement: () => ({ getContext: () => null, style: {}, addEventListener() { } }), addEventListener() { }, hasFocus: () => false, body: { appendChild() { } }, querySelectorAll: () => [] } };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai']) vm.runInContext(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'), ctx, { filename: f });
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m + (x !== undefined && x !== '' ? '  ' + x : '')); } };
const J = src => JSON.parse(vm.runInContext('JSON.stringify(' + src + ')', ctx));

console.log('--- 1. the Reactor, which is the reported case ---');
const RE = J('DATA.buildings.reactor');
ok(Array.isArray(RE.req) && RE.req.length > 0, 'the Reactor has a req array at all -- it had none', JSON.stringify(RE.req || null));
ok((RE.req || []).length > 0 && RE.req.every(r => J('DATA.buildings')[r] || J('DATA.techs')[r]), 'and it names something real', JSON.stringify(RE.req || null));

const reactor = J(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 3, layout: 'temple' });
  const p = G.players[0]; const st = G.map.starts[0]; let col = 0;
  const put = id => { col += 6; const b = G.placeBuilding(DATA.buildings[id], Math.floor(st.cx / TILE) + col, Math.floor(st.cy / TILE) + 6, 0); if (b) { b.done = true; b.hp = b.maxHp; b.progress = b.def.time; } return b; };
  const bar = put('barracks');
  p.minerals = 5000; p.gas = 5000; p.msgs.length = 0;
  const without = { got: G.queueAddon(bar, 'reactor'), said: p.msgs.map(m => m.kind + '|' + m.text) };
  // Now stand up everything the Reactor asks for and try again.
  for (const r of (DATA.buildings.reactor.req || [])) { if (DATA.buildings[r]) put(r); else p.tech.add(r); }
  p.minerals = 5000; p.gas = 5000; p.msgs.length = 0;
  const withIt = { got: G.queueAddon(bar, 'reactor'), said: p.msgs.map(m => m.kind + '|' + m.text), addon: bar.addon ? bar.addon.def.id : null };
  return { without, withIt, wanted: (DATA.buildings.reactor.req || []).map(r => (DATA.buildings[r] || DATA.techs[r]).name) };
})()`);
ok(reactor.without.got === false, 'a Reactor is REFUSED when its prerequisite is not up');
ok(reactor.without.said.length === 1 && reactor.without.said[0] === 'error|Requires ' + reactor.wanted[0],
  'and the player is told, in the existing red "Requires X" format every other unmet requirement uses', JSON.stringify(reactor.without.said));
ok(reactor.withIt.got === true && reactor.withIt.addon === 'reactor', 'with the prerequisite up it builds', JSON.stringify(reactor.withIt));

console.log('\n--- 2. every add-on, swept: gated by data, never in silence ---');
const addons = J(`(() => {
  const out = [];
  for (const aid of Object.keys(DATA.buildings).filter(k => DATA.buildings[k].tier === 'addon')) {
    G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 3, layout: 'temple' });
    const ad = DATA.buildings[aid], p = G.players[0], st = G.map.starts[0];
    let col = 0;
    const put = id => { col += 6; const b = G.placeBuilding(DATA.buildings[id], Math.floor(st.cx / TILE) + col, Math.floor(st.cy / TILE) + 6, 0); if (b) { b.done = true; b.hp = b.maxHp; b.progress = b.def.time; } return b; };
    const parent = put(ad.parent);
    p.minerals = 5000; p.gas = 5000; p.msgs.length = 0;
    const bare = { got: G.queueAddon(parent, aid), said: p.msgs.map(m => m.text) };
    // then with everything it asks for
    for (const r of (ad.req || [])) { if (DATA.buildings[r]) put(r); else p.tech.add(r); }
    if (parent.addon) { G.kill(parent.addon, null, true); parent.addon = null; }
    p.minerals = 5000; p.gas = 5000; p.msgs.length = 0;
    const armed = { got: G.queueAddon(parent, aid), said: p.msgs.map(m => m.text) };
    out.push({ aid, parent: ad.parent, req: ad.req || null, bare, armed });
  }
  return out;
})()`);
for (const a of addons) {
  const gated = !!(a.req && a.req.length);
  ok(gated ? (a.bare.got === false && a.bare.said.length === 1 && /^Requires /.test(a.bare.said[0])) : a.bare.got === true,
    (gated ? a.aid + ' is refused with a reason when its req is unmet' : a.aid + ' is gated completely by its parent, and builds on one'),
    JSON.stringify(a.bare));
  ok(a.armed.got === true, '...and ' + a.aid + ' builds once everything it names is standing', JSON.stringify(a.armed));
}
ok(addons.length === 7, 'all seven add-ons were swept', String(addons.length));

console.log('\n--- 3. the four refusals that used to be silence ---');
const states = J(`(() => {
  const out = [];
  const attempt = (label, prep) => {
    G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 3, layout: 'temple' });
    const p = G.players[0], st = G.map.starts[0]; let col = 0;
    const put = id => { col += 6; const b = G.placeBuilding(DATA.buildings[id], Math.floor(st.cx / TILE) + col, Math.floor(st.cy / TILE) + 6, 0); if (b) { b.done = true; b.hp = b.maxHp; b.progress = b.def.time; } return b; };
    const bar = put('barracks');
    for (const r of (DATA.buildings.reactor.req || [])) { if (DATA.buildings[r]) put(r); else p.tech.add(r); }
    p.minerals = 5000; p.gas = 5000;
    prep(bar, p, put);
    p.msgs.length = 0;
    const got = G.queueAddon(bar, 'reactor');
    out.push({ label, got, said: p.msgs.map(m => m.kind + '|' + m.text) });
  };
  attempt('parent still under construction', b => { b.done = false; b.progress = 10; });
  attempt('parent already has an add-on', (b, p, put) => { const a = G.placeBuilding(DATA.buildings.reactor, b.tx + b.def.w, b.ty + b.def.h - 2, 0); a.done = true; a.parent = b; b.addon = a; });
  attempt('parent is training something', b => { G.queueUnit(b, 'marine'); });
  attempt('parent has lifted off', b => { b.lifted = true; });
  return out;
})()`);
for (const s of states) ok(s.got === false && s.said.length === 1 && /^error\|/.test(s.said[0]),
  'refusing because the ' + s.label + ' SAYS SO', JSON.stringify(s.said));
{ const texts = states.map(s => s.said[0]);
  ok(new Set(texts).size === texts.length, '...and each of the four says a different thing, so a player never has to guess which', JSON.stringify(texts)); }

console.log('\n--- 4. the class: a command may not be asked for what the building does not offer ---');
// A sweep rather than a list. For each command, a building is picked that does NOT offer the thing,
// and the answer must be a refusal with a message. Nothing may be paid for.
const cross = J(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 3, layout: 'temple' });
  const p = G.players[0], st = G.map.starts[0]; let col = 0;
  const put = id => { col += 6; const b = G.placeBuilding(DATA.buildings[id], Math.floor(st.cx / TILE) + col, Math.floor(st.cy / TILE) + 10, 0); if (b) { b.done = true; b.hp = b.maxHp; b.progress = b.def.time; } return b; };
  const bar = put('barracks'), fac = put('factory'), arm = put('armory'), ms = put('machine_shop'), ac = put('academy');
  for (const t of Object.keys(DATA.techs)) p.tech.add(t);
  const out = [];
  const try_ = (what, fn) => {
    p.minerals = 9000; p.gas = 9000; p.tech.clear(); p.msgs.length = 0;
    const before = [p.minerals, p.gas];
    const got = fn();
    out.push({ what, got, said: p.msgs.map(m => m.text), paid: p.minerals !== before[0] || p.gas !== before[1] });
  };
  try_('a Barracks asked for a Physics Lab (a Science Facility add-on)', () => G.queueAddon(bar, 'physics_lab'));
  try_('a Barracks asked for a Machine Shop (a Factory add-on)', () => G.queueAddon(bar, 'machine_shop'));
  try_('a Barracks asked to train a Siege Tank (a Factory unit)', () => G.queueUnit(bar, 'siege_tank'));
  try_('a Barracks asked to research Siege Tech (a Machine Shop research)', () => G.queueTech(bar, 'siege_tech'));
  try_('a Barracks asked to research Vehicle Weapons (an Armory upgrade)', () => G.queueUpgrade(bar, 'vehW'));
  try_('a Factory asked to become an Orbital Command (a Command Center morph)', () => G.queueMorph(fac, 'orbital_command'));
  try_('a Factory asked to become a Lair (a Hatchery morph, and the wrong race)', () => G.queueMorph(fac, 'lair'));
  return out;
})()`);
for (const c of cross) ok(c.got === false && c.said.length >= 1 && !c.paid, 'REFUSED, with a reason and no charge: ' + c.what, JSON.stringify([c.got, c.said, c.paid]));

console.log('\n--- 5. and the legal versions all still work (this is the half that keeps the sweep honest) ---');
// The whole risk of section 4 is over-refusing. A membership test that reads the wrong list turns off
// half the game and every check above still passes, so each legal call is made here too.
const legal = J(`(() => {
  G.init({ players: [{ race: 'T', human: true, name: 'A' }, { race: 'Z', human: false, difficulty: 'easy', name: 'B' }], seed: 3, layout: 'temple' });
  const p = G.players[0], st = G.map.starts[0]; let col = 0;
  const put = id => { col += 6; const b = G.placeBuilding(DATA.buildings[id], Math.floor(st.cx / TILE) + col, Math.floor(st.cy / TILE) + 14, 0); if (b) { b.done = true; b.hp = b.maxHp; b.progress = b.def.time; } return b; };
  const bar = put('barracks'), fac = put('factory'), arm = put('armory'), ms = put('machine_shop'), cc = G.units.find(u => u.owner === 0 && u.def.id === 'command_center');
  const out = {};
  p.minerals = 9000; p.gas = 9000; p.supMax = 400;
  out.trainMarine = G.queueUnit(bar, 'marine');
  out.techSiege = G.queueTech(ms, 'siege_tech');
  out.upgVehW = G.queueUpgrade(arm, 'vehW');
  const ac = put('academy');
  out.addonComsat = G.queueAddon(cc, 'comsat_station');
  const cc2 = put('command_center');
  out.morphOrbital = G.queueMorph(cc2, 'orbital_command');
  return out;
})()`);
for (const [k, v] of Object.entries(legal)) ok(v === true, 'the legal call still works: ' + k, String(v));
// Zerg tier inheritance, which is the case a naive membership test breaks. A Lair legitimately lists
// burrow_tech whose own `bld` is 'hatchery', and a Greater Spire lists both of the Spire's upgrades --
// so the test has to read the BUILDING's list, not compare against the tech table's `bld`.
const inherit = J(`(() => {
  G.init({ players: [{ race: 'Z', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 3, layout: 'temple' });
  const p = G.players[0], st = G.map.starts[0]; let col = 0;
  const put = id => { col += 6; const b = G.placeBuilding(DATA.buildings[id], Math.floor(st.cx / TILE) + col, Math.floor(st.cy / TILE) + 14, 0); if (b) { b.done = true; b.hp = b.maxHp; b.progress = b.def.time; } return b; };
  put('spawning_pool');
  const lair = put('lair'), gs = put('greater_spire');
  p.minerals = 9000; p.gas = 9000;
  return { lairBurrow: G.queueTech(lair, 'burrow_tech'), gsFlyW: G.queueUpgrade(gs, 'flyW'),
    inheritedTech: DATA.buildings.lair.tech.includes('burrow_tech') && DATA.techs.burrow_tech.bld !== 'lair',
    inheritedUpg: DATA.buildings.greater_spire.upg.includes('flyW') && DATA.upgrades.flyW.bld !== 'greater_spire' };
})()`);
ok(inherit.inheritedTech && inherit.inheritedUpg, 'Zerg tier inheritance really is the shape that would break a naive check', JSON.stringify(inherit));
ok(inherit.lairBurrow === true, 'a Lair can still research Burrow, whose own bld is the Hatchery');
ok(inherit.gsFlyW === true, 'a Greater Spire can still research Flyer Attacks, whose own bld is the Spire');

console.log('\n--- 6. the tables themselves: every card entry is queueable, every def names real things ---');
const tables = J(`(() => {
  const bad = { tech: [], upg: [], addon: [], produces: [], morph: [], req: [] };
  for (const [bid, b] of Object.entries(DATA.buildings)) {
    for (const id of (b.tech || [])) if (!DATA.techs[id]) bad.tech.push(bid + '/' + id);
    for (const id of (b.upg || [])) if (!DATA.upgrades[id]) bad.upg.push(bid + '/' + id);
    // An add-on's parent may also be something the parent MORPHS INTO: an Orbital Command and a
    // Planetary Fortress both keep the Command Center's Comsat and Silo, and EQUIV is where the game
    // already records that they are still Command Centers. Anything outside that is an add-on offered
    // by a building it does not belong to, which is the hole this file exists for.
    for (const id of (b.addons || [])) { const a = DATA.buildings[id]; if (!a) bad.addon.push(bid + '/' + id + ' missing'); else if (a.parent !== bid && !(EQUIV[a.parent] || []).includes(bid)) bad.addon.push(bid + ' offers ' + id + ' whose parent is ' + a.parent); }
    for (const id of (b.produces || [])) if (!DATA.units[id]) bad.produces.push(bid + '/' + id);
    for (const id of [b.morphTo, ...(b.morphOptions || [])]) if (id && !DATA.buildings[id]) bad.morph.push(bid + '/' + id);
    for (const id of (b.req || [])) if (!DATA.buildings[id] && !DATA.techs[id]) bad.req.push(bid + '/' + id);
  }
  for (const [uid, u] of Object.entries(DATA.units)) for (const id of (u.req || [])) if (!DATA.buildings[id] && !DATA.techs[id]) bad.req.push(uid + '/' + id);
  // and every add-on's parent must offer it back, or the button exists nowhere
  const orphan = Object.keys(DATA.buildings).filter(k => DATA.buildings[k].tier === 'addon')
    .filter(k => { const p = DATA.buildings[DATA.buildings[k].parent]; return !p || !(p.addons || []).includes(k); });
  return { bad, orphan };
})()`);
for (const [k, v] of Object.entries(tables.bad)) ok(v.length === 0, 'no building lists a ' + k + ' that does not exist', v.slice(0, 4).join(', '));
ok(tables.orphan.length === 0, 'every add-on is offered back by its own parent -- an add-on nobody offers is unreachable', tables.orphan.join(', '));

ok(errors.length === 0, 'no JS errors were logged along the way', errors.slice(0, 3).join(' | '));
console.log('\n' + (fail ? 'FAIL' : 'ALL PASS') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
