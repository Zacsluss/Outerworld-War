# Codebase scan, 2026-09-17 — refactor pass and bug pass

The user: "do a large scan refactor scan then bug scan". Four reading passes over `js/` (~22,000 lines) for
refactor debt, then four for defects. Every claim below was re-checked by hand, and the ones marked
**measured** were reproduced with a probe kept in `.claude/review/scan/` (local scratch, gitignored).

**A1 (all nine player-visible defects) is FIXED** -- PLAYTEST-M18 125, twelve negative controls red.
**A2 is FIXED** -- 11, 12, 13, 14 and 15, PLAYTEST-M18 126, eleven negative controls red; and 10, PLAYTEST-M18 129, six
negative controls red, on the user's word and without the gated balance run. **A3 is FIXED** -- 16 to 22, PLAYTEST-M18
127, eleven negative controls red; and on the user's word the rock A3.16 cost the small Open Basin is back, PLAYTEST-M18
130. **B is FIXED** -- all eleven, PLAYTEST-M18 128, eighteen negative controls red, and a new gate suite
(`test/onecopy.js`) whose job is to keep each rule a single copy. **THE SCAN IS FINISHED: nothing in this file is
open.** The gate was green (101/101) before the scan and is green after every batch (102/102 now).

---

## A. Defects, in the order they are worth fixing

### A1. Player-visible and cheap to fix

1. **A worker inside a gas building that dies is frozen for ever** -- `js/sim.js:751`. `tickGather` swaps the
   dead resource for another by editing the order in place, so `applyOrder` never runs and `u.inside` is
   never cleared; `Unit.tick` then returns at the `inside` guard every frame. **Measured:** 600 frames later
   the SCV is alive, still inside a dead Refinery, order `gather/goto`, never moves -- out of the grid
   (unclickable, untargetable) but still counted in supply. Needs a second gas building to exist, which is
   why no suite sees it.
2. **The last unit before the supply cap is paid for and never starts** -- `js/game.js:690` books a queued
   unit's supply, then `tickProduction` asks `supplyBlocked` again, which counts the same supply on top of
   the reservation. **Measured:** at 9/10 supply the Barracks accepts a Marine, charges 50 minerals, and 400
   frames later `started: false, progress: 0`. The HUD says "supply blocked", repeating the error.
   **Its fix had a regression of its own** (PLAYTEST-M18 131): the new gate asked whether the PLAYER was over the cap and
   held every queued item when so -- Interceptors, Scarabs and Nukes too, which cost no supply. It asks about the item now.
3. **Allied splash, line and bounce weapons do full damage** -- `js/combat.js:16`, `:48`, `:67` test
   `o.owner === a.owner` where the rest of the engine uses `G.allied`. **Measured** in a 2v2: the ally's
   Firebat takes my Marine 40 -> 24 while his own identical Marine at the same distance stays at 40.
   Thirteen splash weapons, the Lurker/Hellion lines, and the Mutalisk bounce, which will actively pick an
   ally as its next hop.
4. **Clicking one passenger's portrait empties the whole transport** -- `js/commands.js:127`: buildings get
   `unloadOne`, everything else `unloadAll`. **Measured:** bunker 4 -> 3 (right), dropship 4 -> 1 (wrong).
5. **A destroyed Refinery leaves its geyser open for good** -- `GameMap.unblock` (`js/map.js:2053`) returns a
   dead building's footprint to `-1` instead of to what was under it, and nothing restores the geyser's
   `-3`. **Measured:** after the hulk rots the tiles are walkable and `canPlace` allows a Supply Depot *and*
   a Refinery on the same footprint. On small generated maps (`islands`, `cliffs`) the main's geyser sits on
   the plateau's cliff row, so this opens a second way into the main across ground drawn as a geyser --
   and `rampProblems()`/`elevationProblems()` both pass, because they skip tiles whose `blocked !== -1`.
6. **A fogged enemy building reports live HP and shields** -- `js/ui.js:447` hands the live Unit to the
   console for any building on explored ground, and `js/hud.js:1052` prints HP/Shields for any owner. Scout
   a Nexus, fly away, click it: you can watch its shields regenerate and read a fight you cannot see. The
   memory ghost stores a stale `hp`; the panel bypasses it.
7. **Changing HUD size desyncs what is drawn from what is clickable** -- `js/ui.js:120` `setHudScale` never
   calls `Render.resize()`, the only writer of `Render.viewH` (`js/render.js:129`); its neighbour
   `setTerrainLook` does. Drop 1.4 -> 1.0 mid-game at 1920x1080: a ~78 px black band above the console, and
   clicks in it are treated as world clicks on ground that was never drawn.
8. **Combat resets the music to full volume** -- `js/audio.js:236`. `start` and `setVolume` write
   `LEVEL * level()`; `swell` writes bare `0.26`/`0.16` to the same master gain. Set music to 25%, get into
   a fight, and it is louder than 100% and stays at full for the session.
9. **"Set Rally" on the command card rallies only the first selected building** -- `js/ui.js:1154`
   (`sel[0]`), while the right-click path deliberately fans out over every producer (`js/ui.js:1112`).

### A2. Correctness, but needs a judgement call  -- ALL FIXED (10: PLAYTEST-M18 129; 11 to 15: PLAYTEST-M18 126)

10. **FIXED** (PLAYTEST-M18 129: both read SUPPLY_CAP now, fifty and ten below it). **The AI's attack gate still reads the old 200 supply cap** -- `js/ai.js:1374` (`supUsed > 150`) and
    `js/ai.js:1377` (`supUsed >= 190`); `SUPPLY_CAP` has been 500 since M11 and `AI.supply()` was fixed for
    exactly this at `js/ai.js:670`. Past 190 the AI attacks on the supply count alone, bypassing the style
    ladder and the scouted-army floor. Measured by the scan: 611 of 611 launches after that point had
    `sup < threshold`, and `waves` ran to 623 against 21 with the clause removed -- same seed, same kills,
    same winner. **Fixing it changes AI behaviour, so it belongs with the gated balance run.** -- The user said to fix
    it on its own (2026-09-17). Measured over nine thirty-minute Hard games: 816 of 886 launches were the supply clause
    alone, every one of them back to gathering in the same decision with no target; after the fix, 77 launches, all of
    them the ladder. Nothing changes before 150 supply, and two late games of nine play out differently.
11. **FIXED.** **`AI.headDef` is never cleared when the build script runs out** -- `js/ai.js:719` returns before the
    only line that writes it, and the comment three lines down says "Cleared when the script runs out",
    describing a line that does not exist. Measured: for the last 11 minutes of a 30-minute game the head
    claim holds ~196 minerals / ~100 gas on every think, gas free is <= 0 on 54% of them, and the AI ends on
    829/871 floating against 219/258 with the field cleared.
12. **FIXED.** **The build stamp does not cover static methods** -- `js/build.js:155` hashes `c.prototype` only.
    `GameMap.assignStarts` (which picks every player's start) and `GameMap.quadrantsOf` (which places bases
    and features) are static and therefore invisible to it. **Measured:** with the hash cache cleared,
    changing a prototype method moves the stamp `678387e310c2c3fe -> e1793521f13a63e8`; changing
    `assignStarts` leaves it at `678387e310c2c3fe`, so an old replay would load and re-simulate a different
    game in silence. `test/version.js` cannot see this: its audit matches top-level declarations only.
13. **FIXED.** **Siege Mode's 40-frame transition costs nothing going in** -- `js/sim.js:205` returns `SIEGE_W` when
    `sieged` is true, shadowing the `transT > 0` lockout on the next line. **Measured:** the tank fires on
    frame 3 of a 40-frame transition. Un-sieging correctly pays the full cost.
14. **FIXED.** **Alt-click/drag and an in-progress right-drag fire through an open menu or codex** -- the alt branch is
    first in `onDown` (`js/ui.js:532`), before the modal guards, and `onUp` (`js/ui.js:552`) has no modal
    guard at all. In a network game the lockstep runs behind the pause menu, so allies see you draw on the
    map while your menu is open, and the replay keeps it.
15. **FIXED.** **`Sprites.tinted` leaves the player colour out of its cache key** -- `js/sprites.js:97`. Select your own
    healthy Marines, then Ctrl-click an enemy Marine at the same tile size and health tint: the cache hits
    and the enemy's units are drawn in your team colour, in the one panel whose job is to say whose units
    you have.

### A3. Map quality and the editor  -- ALL FIXED (PLAYTEST-M18 127)

16. **FIXED.** **Mineral patches sealed inside rock on generated maps** -- the basin generator paints its rock ellipses
    before placing bases and `rockClear` (`js/map.js:498`) protects ramps only. **Measured:**
    `arch:basin:2:small` has 20 of 144 patches with no walkable tile beside them; `basin:1:small` has 4. A
    worker mines a buried patch *faster* than a reachable one -- it never walks, and cannot be attacked.
    **Its cost, and then its reversal:** skipping a blob that landed on a base left a small Open Basin 4 blobs of 36; the
    user asked for the rock back, and a blob that lands on a base now MOVES to the nearest legal spot and is kept only if
    the finished map is no harder to cross for any unit (PLAYTEST-M18 130).
17. **FIXED.** **A mineral patch is drawn on top of the geyser on every small map** -- `MapModes.base` (`js/map.js:245`)
    lays the ninth patch at `x+4..x+5` and the geyser at `x+5..x+8`; only `MAP_SIZES.small` asks for nine.
    **Measured:** Close Quarters, a shipped menu map, has two overlapping tiles at both starts;
    `resourceAt` returns the mineral while the grid says geyser.
18. **FIXED.** **Editor undo does not restore `W`/`H` after a resize** -- `js/editor.js:35`. Resize, Ctrl+Z, and the
    dimensions stay at the new size over the old grid: reads past the end draw as low ground, writes are
    dropped, and the saved map is re-read at the wrong stride and comes out sheared.
19. **FIXED.** **The editor's starter template puts resources in (and past) the border below 83 tiles wide**, and
    `Editor.problems()` reports "valid and fully connected" -- it never checks resource bounds.
    `test/editor.js` itself builds such a map and plays 3000 frames on it.
20. **FIXED.** **The help panel and the network banners are mis-centred at the shipped default HUD size** --
    `js/hud.js:1188` and four banner lines use `Render.W` (screen pixels) inside the HUD-scaled transform.
    At 1280x720 with HUD 1.4 the help panel's right edge lands at x 1373 on a 1280-wide window.
21. **FIXED.** **The Sentinel's description says it costs no supply; it costs 3** -- `js/data.js:2016` against
    `js/data.js:736`. `test/neutrals.js` pins the supply cost on one line and the description's existence on
    another, and never compares them.
22. **FIXED.** **`G.kill` splices the larva array it is iterating**, so one larva in three outlives its hatchery.
    **Measured:** `[dead, ALIVE, dead]`. The survivor dies on its own next tick, so nothing is visible; the
    fix is `.slice()`, which the line above it already does for `launched`.

---

## B. Refactor debt worth paying  -- ALL ELEVEN FIXED (PLAYTEST-M18 128; test/onecopy.js pins them)

The same failure mode keeps recurring: **a number copied out of the place that owns it**, and **a rule
written twice because a second code path grew up beside the first**.

1. Six refused ability casts refund **literal** energy (`js/abilities.js:583` and five more) while ten newer
   cases in the same switch refund `ab.energy`. All six agree with `js/data.js` today.
2. The "too far from your base to alert" radius is `16 * TILE` written twice (`js/game.js:755` and `:1401`),
   as complementary halves of one boundary, with the same 20-second re-alert block under both.
3. `blocked[]` codes `-2` (mineral) and `-3` (geyser) are raw literals while `-4`/`-5`/`-6` are named
   constants (`js/map.js:845` and six more). Related to defect 5 above.
4. `ZOOM_ICON` (`js/render.js:184`) and `FX.LOD_Z` are bound by a comment only.
5. The chunk bake and the overview build the same tile grid, blur, wall fix-up and cliff curve in
   byte-identical copies (`js/terrain.js:462` vs `:1095`).
6. Three implementations of "how high does this tile present" that **disagree** (`js/map.js:1458`, `:1617`,
   `:1827`): one omits the `blocked` test, so the seal pass counts a mineral tile as open ground and the
   ramp pass does not.
7. `generateCustom` is missing `generate`'s feature-registration line (`js/map.js:1966`) -- harmless only
   because editor maps carry no features yet.
8. A selected building's rally is drawn twice, in two visual languages (`js/render.js:417` after
   `drawRallies` at `:408`).
9. The command-card slot rectangle is computed three times (`js/hud.js:904`, `js/ui.js:1478`, `:1494`), and
   the two in `ui.js` hedge with defaults the drawing copy lacks -- drift here is a wrong click.
10. `AI.scriptHave` (`js/ai.js:697`) restates `EQUIV` (`js/sim.js:14`) and has already drifted;
    `js/desktop.js:27` and `js/net.js:30` are byte-identical URL normalisers; the composition scoring is
    copy-pasted between `production()` and `warpIn()`; three AI constructor fields are written and never
    read; a 14-key upgrade-cost block in `js/data.js:1190` rewrites what `L3` already set.
11. Dead code: an unreachable `&& false` in `updateVision` (`js/game.js:421`), an `if` with five conditions
    and an empty body in `onHit` (`js/game.js:762`), unused locals at `js/combat.js:7` and `js/sim.js:544`,
    and a `fill` parameter threaded through three sprite functions for a feature that was removed.

---

## C. What the test suite cannot currently see

Worth stating plainly, because it is the reason 22 defects survived 101 green suites:

- **Nothing runs long enough.** Defects 10 and 11 need 19+ minutes of game time or 190+ supply; the
  non-gated suites stop well short. This is the same blind spot that hid the `AI.supply()` 200-vs-500 bug a
  milestone ago. (Defect 10 is now driven on a built scene in `test/aistyles.js`, at the supply counts a game
  would take half an hour to reach, and `test/onecopy.js` refuses a three-digit number on any line of the game
  that reads a supply count.)
- **A suite that prints FAIL can still pass the gate.** Found after the scan, while gating A2.10: `test/features.js`
  printed "FAIL: interceptor built" and exited 0, and `test/all.js` judges a suite by its exit code, so the gate
  showed it green ("86 passed, 1 failed") from the A1 batch on -- and the failure was A1.2's own regression (below).
  FIXED in PLAYTEST-M18 131: the suite is on the shared harness, and an audit of all 102 gate suites found no other.
- **"Ally" is spelled `owner ===` in the tests too.** `test/line.js` asserts "AN ALLY IS NOT" hit, with an
  ally spawned under the same owner -- so only the half that works is tested (defect 3).
- **The generated maps are held to a weaker contract than the shipped ones.** `test/maplayouts.js` asserts
  the structural invariants (one ramp into a main, resources on the hall's level) over the nine hand-written
  layouts only; the archetypes are checked for base reachability at one seed per size (defects 16, 17).
- **The HUD-scale chain is never exercised end to end**: every suite that needs `Render.viewH` assigns it by
  hand instead of calling `Render.resize()` (defect 7).
- **`test/version.js` cannot see reflective gaps.** It audits named top-level bindings; a `static` member is
  in neither the hashed set nor `NOT_SIM` (defect 12).
- **No suite kills a gas building and re-reads the grid** (defect 5), and none compares a def's prose with
  its own fields (defect 21).

Each fix should land with a negative control, as everything else here does.
