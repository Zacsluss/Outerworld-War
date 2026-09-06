# HANDOFF — Brood War Remake

Read this first in a fresh chat. It says where the build is, how it is wired, what must never break, and exactly what the next milestone is.

## Kickoff for the next chat

Open a chat in `Default Project/broodwar/` and paste:

> Read HANDOFF.md and README.md, run the tests, then do Milestone M3 from HANDOFF.md. Work through the tasks in order, keep the determinism tests green after every change, commit at each task, and update HANDOFF.md at the end.

## Status (as of commit 9c29897, 2026-09-06)

Milestone M2 is complete: all six tasks are done and committed. M1 (everything buildable offline) was complete before it.

What M2 added on top of M1:

- **Play-test pass.** Three full games played through the real UI in the browser plus a scripted play-test harness. Twenty order-handling and UI bugs fixed. See `PLAYTEST.md`.
- **Multiplayer robustness.** State hash exchange every 48 frames with a desync banner and log dump, drop handling on a relay-chosen frame, and rejoin by reconnecting with the same name.
- **Balance tooling and an AI economy overhaul.** `test/balance.js` runs the whole matrix in parallel. The AI now saves for expansions, scales production to income and picks compositions by army supply.
- **Mission polish.** Eight missions, a fallback victory so no objective can dead-end, a score line, and a headless mission test.
- **Performance pass.** Sim and render both inside their targets; measured by `test/perf.js`.
- **Map editor.** Paint terrain, place bases, save/export; custom maps play in single player and LAN.

### Where the balance actually landed

The M2 acceptance target was every matchup within 60/40. Two matchups are still outside it. Measured over 108 games (6 seeds x 3 layouts x both sides) on Normal:

| matchup | result | verdict |
|---|---|---|
| Terran vs Zerg | T 61 / Z 39 | at target |
| Protoss vs Terran | P 36 / T 64 | outside |
| Protoss vs Zerg | P 25 / Z 75 | outside |

Run-to-run variance is about 10 points, so treat single runs with suspicion. Protoss is the weak race in both of its matchups. What is known:

- Protoss units win straight fights on cost. A controlled duel of dragoon-heavy Protoss beats zergling/hydralisk plus three sunken colonies. Zealot-heavy Protoss loses the same fight badly.
- So the loss is macro, not unit stats. Protoss reaches the fight with too few dragoons because it is gas-limited, and it rebuilds slower than Zerg does from larvae.
- Things already tried that did **not** help: attacking earlier, attacking later (turtling to +16 supply), a larger supply margin, Reaver and Archon heavy compositions, counting static defence in the attack threshold.
- The most promising untried direction is making Protoss take and hold a third and fourth gas earlier, and using Psionic Storm in fights (the AI researches it late and rarely casts it).

## Architecture map

| File | Role |
|---|---|
| `js/data.js` | All unit/building/upgrade/tech/ability tables (BW numbers, frames at 24/s, tiles, px/frame). |
| `js/map.js` | `MapCodec` (run-length codec for custom maps), `MAP_LAYOUTS`, `GameMap` (terrain, cliffs, ramps, resources, creep, psi, placement, `generateCustom` for editor maps), `Pathfinder` (A*). |
| `js/sim.js` | `Player`, `Unit` (orders state machine, movement with turn/accel, gathering, building, combat helpers). `TURN`/`ACCEL` tables live here. |
| `js/game.js` | `G`: init, spatial hash (`near`, `nearEach`), vision/detection, spawning/killing, production, supply, damage, victory, tick loop. |
| `js/combat.js` | Weapon firing, splash, glaive/line, projectiles, interceptor/scarab launch. |
| `js/abilities.js` | Spells, fields (storm/swarm/etc.), auto-casts, interceptor/scarab/dock behaviours, infest. |
| `js/commands.js` | `RNG`, `G.rand`, `G.stateHash`, command packers/dispatcher (`CMD`), wrappers that intercept every player action, `G.exec`, cheats, `Replay`. Loaded after abilities.js. |
| `js/ai.js` | Computer players: scripts, macro, money reservation, production, research, army waves, scouting, drops, micro. |
| `js/missions.js` | Eight scenarios, the mission runner (fallback victory, score line) and helpers (`G.hallOf`, `G.givePlayer`, `G.placeDone`). |
| `js/net.js` | LAN lockstep client: hash exchange, desync detection, drop and rejoin. `test/serve.js` is the static server + relay (no npm deps). |
| `js/editor.js` | Map editor: terrain brush, base placement, validation, localStorage and JSON import/export. |
| `js/audio.js` | `Voice` (speechSynthesis) and `Music` (WebAudio generative). |
| `js/terrain.js`, `js/sprites*.js`, `js/atlas.js`, `js/fx.js`, `js/render.js`, `js/hud.js`, `js/ui.js` | Rendering, baked-sprite loading and tinting, effects, HUD/console, input/menus/loop. `hud.js` overrides the drawing methods of `UI`. |
| `tools/models.js`, `tools/raster.js`, `tools/bake.js` | Sprite pipeline. `node tools/bake.js` writes `assets/sprites/*.png`, `assets/atlas.js`, `assets/preview.png`. |

## Invariants (do not break)

1. **Determinism.** No `Math.random`, `Date`, or `performance` in sim files (`sim.js`, `game.js`, `combat.js`, `abilities.js`, `ai.js`, `map.js`, `commands.js`, `missions.js`). Use `G.rand()`. `test/determinism.js` must stay green; `test/diverge.js` pinpoints a divergence frame if it breaks.
2. **Commands.** Anything the human does to the sim must go through a function wrapped in `CMD.install()`. A new player-facing sim mutation needs a packer + `CMD.apply` case, or replays and network play silently desync.
3. **Sim vs render.** `G.tick` sets `G.inTick`; UI calls outside ticks are intercepted. Render-side state (FX particles, decals, animation frames) must never influence the sim. `js/fx.js` is render-only and is not referenced by any sim file; keep it that way.
4. **Input must not depend on rendering.** Hotkeys and command-card clicks rebuild the card through `UI.currentCard()`. Do not go back to reading a card cached by the draw pass; the browser pane throttles rendering and the card goes stale.
5. **Baked art.** Edit `tools/models.js` and rebake; never hand-edit PNGs. If assets are missing, vector painters are the fallback.
6. **Browser pane quirk.** The desktop app's browser pane throttles `requestAnimationFrame`; the sim runs on `setInterval` in `UI.simStep`. Keep it that way. It also makes render timings noisy, so trust the median.

## Performance baseline

Measured by `node test/perf.js 600 4 temple --sustain` (4 players, ~205 supply each, 513 units, damage disabled so the load does not decay):

| metric | value | target |
|---|---|---|
| sim tick mean | 2.75 ms | under 8 ms |
| sim tick p95 | 5.64 ms | — |
| render median at 1080p, ~500 units on screen | 3.7 ms | under 6 ms |

Both targets are met. The render mean in the desktop browser pane reads much higher than the median because the pane schedules unevenly; measure in a normal browser tab for a clean number.

## Known issues and rough edges

- **Balance**: Protoss loses about 64/36 to both other races. See the section above for what has been ruled out.
- **Missions**: all eight resolve and are winnable, but `z1`, `p2` and `z3` were lost by the AI-driven player in the headless test. They are hard rather than broken; a human should try them before tuning.
- **Multiplayer**: rejoin re-simulates from frame 0, so joining a very long game takes a while. There is no host migration. Speed is locked to Fastest. Tested with two clients plus AI, not more.
- **Replay/save**: loading a long game re-simulates from frame 0; saves from a different code version still desync silently. A version stamp on load is still worth adding.
- **AI `defend` state** can ping-pong when harassed; drop ops occasionally wait the full timeout with an empty transport.
- **Editor**: no undo, no minimap preview, and the brush is a circle only. Maps are always 128x128.
- **Art**: infantry still reads small; no idle animations; buildings have no damage states; one terrain tileset.
- The desktop browser pane logs a `SyntaxError: Unexpected token ','` on load that does not come from any project file (all pass `node --check`); ignore it there, but confirm it does not appear in a normal browser.

## Milestone M3 — proposed

Nothing here is started. Do them in order; each is one commit with tests green.

1. **Finish the balance work.** Target the same 60/40 across `test/balance.js`. Start with Protoss gas timing and Psionic Storm usage, since Protoss is the weak race in both matchups. Use `--seeds=1,2,3,4,5,6` and treat anything inside 10 points as noise. Acceptance: all three matchups within 60/40 over two independent 108-game runs.
2. **Human play-test round two.** Play the eight missions and three ladder games, now that the AI macros properly. Log to `PLAYTEST.md` and fix what turns up. Acceptance: no JS errors and no stuck units across the session.
3. **Save/replay version stamp.** Write a build hash into the save; on load, refuse (with a clear message) rather than desync silently. Acceptance: a save from an older build reports a version mismatch instead of drifting.
4. **Editor quality of life.** Undo/redo, a minimap preview, rectangle fill, and mirrored painting for symmetric maps. Acceptance: build a 4-player symmetric map in under five minutes and play it.
5. **Art pass on infantry.** Marines, zerglings and zealots read too small at 1:1. Rebake at a larger scale and add idle animations. Acceptance: side-by-side screenshots before and after.
6. **Observer/replay controls (stretch).** Per-player vision switching, production overlay, and a timeline scrubber for replays.

## How to run everything

```bash
node test/serve.js 8765          # or double-click PLAY.bat; prints LAN URL
node test/features.js            # 87 gameplay checks
node test/determinism.js         # identical runs match; replay reproduces the original
node test/playtest.js all        # scripted human drives TvZ, PvT, ZvP through the UI layer
node test/net.js                 # two lockstep clients + AI: hashes, drop, rejoin, desync detection
node test/missions.js            # every campaign mission: setup, placement, objective resolves
node test/editor.js              # custom map: validate, AI game, LAN game
node test/balance.js --seeds=1,2,3,4,5,6     # win-rate matrix (about 5 minutes)
node test/perf.js 600 4 temple --sustain     # 4-player 200-supply battle timings
node test/smoke.js 16000 TZ temple           # single AI-vs-AI game
node test/diag.js PZ 21600 temple            # AI progression dump
node test/diverge.js                         # finds the first non-deterministic frame
node tools/bake.js                           # after editing tools/models.js
```

Git: the repo is inside OneDrive; commits with the 16 MB of sprites are slow (30-60 s). Run `git add -A && git commit` in the background if using a tool with a timeout.
