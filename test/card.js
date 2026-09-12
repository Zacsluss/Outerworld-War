// The command card is 4x3 and paginates (M11 decision, 2026-09-09). It used to be 3x3 with Cancel
// pinned to slot 8, and nothing enforced the nine-entry ceiling: a tenth button drew UNDERNEATH Cancel
// and stayed clickable, an eleventh fell off the console, and neither threw. Protoss reached 16 of 16
// build entries and only fitted its new structures by hanging them off a morph.
//   node test/card.js
const vm = require('vm'), { makeCtx, ok, summary } = require('./_harness');
const ctx = makeCtx({ tier: 'ui', files: ['data', 'map', 'sim', 'game', 'combat', 'abilities', 'commands', 'ai', 'render', 'ui', 'hud'], ext: false });
const r = vm.runInContext(`(() => {
  const out = { cols: UI.CARD_COLS, rows: UI.CARD_ROWS, slots: UI.CARD_SLOTS };
  Render.W = 1600; Render.H = 900; Render.viewW = 1600; Render.viewH = 760;
  // pagination in isolation: 30 entries plus a pinned Cancel
  const mk = n => { const a = []; for (let i = 0; i < n; i++) a.push({ slot: i, label: 'B' + i, fn() { } }); return a; };
  // pin: true, exactly as the real cards mark Cancel. Pins are declared rather than inferred from the
  // slot number, because an over-long card's own overflow buttons also carry high slots.
  const withCancel = a => a.concat([{ slot: UI.CARD_SLOTS - 1, label: 'Cancel', hk: 'Escape', pin: true, fn() { } }]);
  UI.cardPage = 0;
  const p0 = UI.paginate(withCancel(mk(30)));
  out.page0 = { n: p0.length, maxSlot: Math.max(...p0.map(b => b.slot)), hasCancel: p0.some(b => b.label === 'Cancel'), hasMore: p0.some(b => /^More/.test(b.label)) };
  const more = p0.find(b => /^More/.test(b.label)); if (more) more.fn();
  const p1 = UI.paginate(withCancel(mk(30)));
  out.page1 = { n: p1.length, maxSlot: Math.max(...p1.map(b => b.slot)), hasCancel: p1.some(b => b.label === 'Cancel'), labels: p1.filter(b => /^B/.test(b.label)).map(b => b.label) };
  out.pagesDiffer = JSON.stringify(p0.map(b => b.label)) !== JSON.stringify(p1.map(b => b.label));
  // no slot on any page may exceed the grid, ever -- that is the bug this replaces
  let worst = -1, cover = new Set();
  for (let pg = 0; pg < 4; pg++) { UI.cardPage = pg; const pp = UI.paginate(withCancel(mk(30)));
    for (const b of pp) { worst = Math.max(worst, b.slot); if (/^B/.test(b.label)) cover.add(b.label); } }
  out.worstSlot = worst; out.reachable = cover.size;
  UI.cardPage = 0;
  // a short card is untouched
  const short = UI.paginate(mk(5));
  out.short = { n: short.length, hasMore: short.some(b => /^More/.test(b.label)) };
  // and in a real game, every card any selection can produce stays inside the grid
  G.init({ players: [{ race: 'P', human: true, name: 'A' }, { race: 'T', human: false, difficulty: 'easy', name: 'B' }], seed: 3 });
  UI.mode = 'play'; UI.menu = null;
  const pl = G.players[0]; pl.minerals = 9999; pl.gas = 9999;
  let over = [];
  for (const id of Object.keys(DATA.buildings)) {
    const d = DATA.buildings[id]; if (d.race !== 'P') continue;
    const b = G.spawnUnit(id, 0, pl.startX + 300, pl.startY + 300); if (!b) continue;
    b.done = true; UI.selection = [b];
    for (const menu of [null, 'basic', 'adv']) { UI.cardMenu = menu; UI.cardPage = 0;
      const c = UI.currentCard();
      for (const btn of c) if (btn.slot >= UI.CARD_SLOTS || btn.slot < 0) over.push(id + '/' + menu + '/' + btn.label + '@' + btn.slot); }
    G.kill(b, null, true);
  }
  UI.cardMenu = null;
  out.overflow = over;
  return out;
})()`, ctx);
ok(r.cols === 4 && r.rows === 3 && r.slots === 12, 'the card is 4 wide and 3 tall: twelve slots', JSON.stringify(r));
ok(r.page0.maxSlot < 12 && r.page1.maxSlot < 12, 'no button on any page sits outside the grid', JSON.stringify([r.page0, r.page1]));
ok(r.page0.hasMore, 'an over-long card grows a page turn');
ok(r.page0.hasCancel && r.page1.hasCancel, 'Cancel stays reachable on every page -- it is pinned, not flowed');
ok(r.pagesDiffer, 'the pages actually show different buttons');
ok(r.worstSlot < 12, 'across every page, no slot ever exceeds the grid', String(r.worstSlot));
ok(r.reachable === 30, 'every entry of an over-long card is reachable by paging', r.reachable + ' of 30');
ok(r.short.n === 5 && !r.short.hasMore, 'a card that fits is left alone', JSON.stringify(r.short));
ok(r.overflow.length === 0, 'no real Protoss card overflows the grid -- the race that was at 16 of 16', r.overflow.slice(0, 4).join(' '));
summary();
