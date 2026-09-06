# PLAYTEST.md — human play-test log

Milestone M2 task 1. Every entry has repro steps; entries marked **fixed** were fixed in the same commit.

## Sessions

| # | Matchup | Map | Length | JS errors | Stuck units | Result |
|---|---|---|---|---|---|---|
| 1 | Terran vs Zerg (normal) | Lost Ruins | 25:51 | 0 | 0 | Victory (cheats used to compress the endgame) |
| 2 | Protoss vs Terran (normal) | Twilight Valley | 11:44 | 0 | 0 | Victory |
| 3 | Zerg vs Protoss (normal) | Blood Pit | 8:04 | 0 | 0 | Victory |

All three were played in the desktop app browser pane through the real UI (mouse, drag boxes, hotkeys, minimap, command card, chat cheats, F1/F9/F10 menus). Errors were captured with a `window.onerror` + `console.error` hook. The pane renders at 1–8 fps but the sim ran at full speed, which is what exposed the stale-card hotkey bug below.

The same three matchups also run headless for 20 minutes each through `node test/playtest.js` (a scripted player that drives `UI.select`/`smartCommand`/`execPending`/command-card buttons/hotkeys, ~10k UI actions per game, cheats at 6:00 so late-game spells get exercised). It flags JS errors, units that stop moving with an unfinished movement order, units inside building footprints, cargo/transport mismatches and supply-accounting drift. Current result: 0 errors, 0 stuck, 0 invariant violations for all three.

## Bugs found and fixed

1. **Scanner Sweep could not be cast by a human** (also Nydus Exit). Repro: select a Comsat Station (or its Command Center), click Scanner Sweep, click the map. Nothing happens. `UI.execPending` skipped every building in the selection. **Fixed**: abilities are now executed for buildings, and abilities offered on a parent's card (Comsat via the CC) are cast by the add-on itself.
2. **Land button on a lifted building started a new construction.** Repro: lift a Barracks, press L on the card, click a spot. A second Barracks starts building (and costs 150) while the lifted one keeps floating. `confirmPlacement` issued a `build` order for a `land` placement. **Fixed**.
3. **"Continue playing" after the result screen froze the game.** `checkVictory` re-triggered `G.over` on the next check. **Fixed** with a `G.freePlay` flag.
4. **Units could not board Bunkers from most angles.** Repro: build a Bunker, right-click it with a Marine standing to its left. The Marine walks to the blocked centre tile, the path ends short and it stands next to the wall forever in a `load` order. Same for any unit told to load into something it cannot enter (Vulture into a Bunker, units into an Overlord without Ventral Sacs): they waited forever. **Fixed**: loading into buildings uses the building-approach mover, and a refused load drops the order.
5. **Two touching buildings trapped a builder.** Repro: put a Supply Depot directly above a Factory site and send an SCV from the left. The approach point rounds into the depot's tile (unit sits exactly on a tile boundary), A* returns an empty path and the SCV stands 8 px from the Factory without building. **Fixed**: building approaches fall back to the nearest passable perimeter point; construction progress uses rectangle distance instead of centre distance.
6. **Workers crawled along resource corners.** Repro: send an SCV through a gap next to a mineral field; it slid at 0.5 px/frame for seconds. The blocked-step fallback used the tiny axis component of the intended step. **Fixed**: blocked units now slide along the obstacle at full speed.
7. **Shift-queued orders after a gather never ran.** Repro: select a mining worker, shift-click a build placement. The worker keeps mining forever. The gather/return loop never advanced the queue. **Fixed**: queued orders run after the current mineral/gas trip.
8. **Hotkeys pressed quickly after opening a menu were ignored** (e.g. B then S within one render frame; always in the throttled browser pane). The card was only rebuilt during rendering. **Fixed**: input rebuilds the card itself (`UI.currentCard`).
9. **Command-card click hit-boxes were off by up to 12 px on the bottom row.** `consoleClick` used the old 66/52 px grid while the HUD draws 68/58. **Fixed**: shared geometry.
10. **Both players spawned in the same base on Twilight Valley.** `startOrder [0,3]` referenced a fourth main that a 2-player layout does not have, so the AI's refinery landed on the human's geyser. **Fixed** (`[0,1]`, and unlisted mains are appended instead of dropped).
11. **Expansions could not be placed at most bases.** The hall spots designed into the layouts were within 3 tiles of a geyser (all Blood Pit bases including the mains, 8 Lost Ruins bases, 3 Twilight Valley bases) and the Valley natural sat on a mirrored ramp with rocks between it and its minerals. The AI silently failed to expand there. **Fixed**: geysers moved, the stray Valley plateau/ramp removed, rocks moved behind the mineral line; `test/playtest.js` and a validation snippet now confirm every base hall spot is placeable and ground-reachable from every start.
12. **Auto-acquire targeted eggs and larvae.** A patrolling Ghost spent minutes shooting an Egg for 0.5 damage a shot. **Fixed**: auto-acquisition ignores larvae/eggs (explicit attack orders still work).
13. **Sieged tanks / burrowed Lurkers with an out-of-range attack target did nothing.** **Fixed**: they fire at whatever is in range while the order stands.
14. **Unload hotkey unloaded in place.** The `instant` branch of the card caught the Unload ability before the targeted-unload branch. **Fixed**: U now asks for a drop point; cargo wireframes still unload single units.
15. **Archon merge unavailable with a mixed selection.** Two High Templar plus one Dark Templar showed no Summon button. **Fixed**: merge buttons appear whenever two templar of a kind are selected.
16. **Duplicate hotkeys on one card** (first match won, the other action was unreachable by keyboard): Hydralisk Den vs Hatchery (H), Reaver vs Set Rally (R), Heal vs Hold (H), Summon Archon / Dark Archon vs Stop (S), Build Scarab vs Stop (S). **Fixed**: Hydralisk Den D, Reaver V, Heal E, Summon W, Build Scarab B. Comsat abilities shown on the CC card drop their hotkey when it collides with SCV.
17. **Right-clicking your own building with a combat unit made it "follow" the building.** Now a plain move. **Fixed**.
18. **Landing next to an orphaned add-on** did not re-attach it. **Fixed**.
19. **Mind Control left the old owner's mineral/gas bookkeeping and selection dirty**, Hallucination accepted buildings. **Fixed**.
20. **Transport unload over unwalkable ground** kept the transport hovering forever. **Fixed**: wider search, then "Cannot unload here." and the order is dropped.

## Annoyances (not fixed, noted for later)

- Camera jump with Space to an alert can land on a fully black (never explored) spot when the attacked unit died before its vision was recorded. Cosmetic.
- The browser pane throttles rendering to a few fps; a normal browser tab is fine. Keep the sim on `setInterval`.
- Giving several build orders to a multi-worker selection without Shift replaces the previous order on the same worker (Brood War does the same, but the first worker in the selection is not obvious).
- Larvae wander; clicking them needs some precision. Brood War's "select larva" button on the Hatchery card does not exist yet.
- New workers from a hall with a ground rally point idle at the rally instead of mining unless the rally is on a mineral.
- Attack-move stacks of melee units jam around a single building for several seconds before spreading out.
- Zerg AI on Normal reached 100 units by 9:30 against a slow human opener; balance is task 3.

## Round two: issues found while finishing M2 (tasks 3-6)

21. **The AI never expanded as Terran or Protoss.** It spent every mineral on units the moment it had them, so it could never bank the 400 for a Command Center or Nexus. Fixed with a money reservation; workers, urgent supply, gas and research are exempt so saving never starves the economy.
22. **Mass-zergling armies crowded out everything.** The AI picked its next unit by comparing unit *counts* against weights, so the cheapest unit always won and Zerg fielded 110 zerglings. Weights are now a share of army supply.
23. **Zerg could deadlock on a Spire it could not afford**, because its second Extractor sat behind the Spire in the build order and the script's give-up timer was being reset every think by the new early-returns.
24. **Ultralisks got stuck inside sunken colony footprints.** Any ground unit whose centre tile ends up inside a building is now pushed out.
25. **A render crash on a zero-sized canvas.** Starting a mission while the canvas was hidden made `drawImage` throw every frame. The renderer now clamps its size and skips frames with no viewport.
26. **Infestation and Reclamation could not be won** once the objective became impossible (the last Command Center died, or the beacon holder was killed). Razing every enemy structure now completes any mission.
27. **The map editor's default base layout was unplaceable**: the geyser sat inside the town hall's 3-tile resource exclusion, so no map validated until the geyser was moved clear.

## How the log was produced

- Browser: `node test/serve.js 8765`, desktop app browser pane at 1280x800, errors captured by a page hook, cheats typed into the chat box (`show me the money`, `operation cwal`, `food for thought`, `medieval man`, `power overwhelming`, `there is no cow level`).
- Headless: `node test/playtest.js all 28800 3 --quiet` (options: matchup `TZ|PT|ZP|all`, frames, seed, `--diff=easy|normal|hard`, `--cheat=<minutes>`).
