# HANDOFF — Brood War Remake

Read this first in a fresh chat. It says where the build is, how it is wired, what must never break, and exactly what the next milestone is.

## Kickoff for the next chat

Open a chat in `Default Project/broodwar/` and paste:

> Read HANDOFF.md and README.md, run the tests, then do Milestone M4 from HANDOFF.md. Work through the tasks in order, keep the determinism tests green after every change, commit at each task, and update HANDOFF.md at the end.

## Status (as of commit d3230ea, 2026-09-06)

Milestone M3 is complete: all six tasks are done and committed, one of them (task 1, balance) short of its acceptance bar — read the balance section below before trusting any number in it.

What M3 added on top of M2:

- **AI macro rework.** Composition priority is respected instead of drifting to the cheapest unit, a base-count floor stops Protoss and Terran sitting on two bases, static defence is no longer starved by expansions, Zerg drones stop crowding out its army, and the attack trigger is race-neutral. Protoss vs Zerg went from 22% to 42% over 216 games. Terran vs Zerg got worse; see below.
- **Play-test round two.** The three ladder games re-run on Normal and all eight missions driven through the UI for the first time, via a new `missions` mode in `test/playtest.js`. Two bugs found and fixed, both of which broke `z3 Tunnel Vision`. 0 errors, 0 stuck units across the session.
- **Build stamp on saves and replays.** A save from a different build is refused with the reason instead of re-simulating into a different game.
- **Editor quality of life.** Undo/redo, rectangle fill, 2- and 4-player mirrored painting, and a clickable minimap.
- **Infantry art pass.** Marines, zerglings and zealots are about 27% larger, and every unit has a four-frame idle loop instead of one static pose.
- **Observer and replay controls.** Per-player vision switching, a production overlay and a timeline scrubber.

### Where the balance actually landed

**Read this before doing any more balance work.** Two things matter more than the numbers themselves:

1. **The variance is much larger than M2 assumed.** A `--seeds=1,2,3,4,5,6` run is 36 games per matchup, and the 95% interval on 36 games is about 30 points wide. Two independent 108-game runs of the *same* code gave PvT 41.7% and 25.0% — and those two are further apart than binomial noise alone explains, so per-seed map structure adds variation on top. `test/balance.js` now prints the interval and reports "undecided" rather than a number you can tune against; **97 decided games per matchup** are needed for ±10 points, 385 for ±5.
2. **The M3 task 1 commit message (48f7fc2) overstates the result.** It quotes the seeds 1–6 run only. The honest numbers, 216 games per configuration (12 seeds x 3 layouts x both sides), on Normal:

With 95% Wilson intervals (added in M4 task 2 — `node test/balance_stats.js`), 72 decided games per matchup per configuration:

| matchup | baseline (M2) | after M3 task 1 |
|---|---|---|
| Protoss vs Zerg | P 22.2% [14.2–33.1] **outside** | P 41.7% [31.0–53.2] undecided |
| Protoss vs Terran | P 37.5% [27.2–49.0] undecided | P 33.3% [23.5–44.8] undecided |
| Terran vs Zerg | T 62.5% [51.0–72.8] undecided | T 76.1% [65.0–84.5] **outside** |

Read that carefully, because it is not the story the task 1 commit tells. **Only two of those six cells are a result at all.** At the baseline, Protoss vs Zerg was the single *established* failure. After M3, it is no longer established — that is the genuine win — but Terran vs Zerg became one. Protoss vs Terran has never been established either way at this sample size; it leans Terran and always has, but 72 games cannot prove it.

So M3 traded one established failure for another. Fixing Terran vs Zerg is the first thing M4 should do.

**The structural finding.** Equal-supply controlled duels (48-54 supply a side, six seeds each) give **Terran–Zerg 3-3, Protoss beats Terran 6-0, Zerg beats Protoss 6-0**. Unit stats are sound. Every one of these games is decided by who brings more army supply to the fight, which makes this an AI macro problem end to end, not a balance-table problem.

**The coupling that blocks progress.** The base-count floor (`wantHalls` in `AI.macro`) is what fixed PvZ, because Protoss was stuck on two bases and gas-capped while Zerg took four or five. It is also what hurts Zerg, because Zerg already expands through its build script and macro hatcheries and being pushed wider just spreads it thin. Restricting the floor to non-Zerg was measured over 216 games: TvZ recovers to T 65 / Z 35, but PvZ collapses back to P 11 / Z 89. Protoss and Zerg are coupled through this one rule and no setting of it satisfies both. **Breaking that coupling is the interesting problem** — probably by making Protoss competitive some other way, so the floor can be relaxed for Zerg.

**Measured dead ends** (each a full 108-game run, all zero or negative):

- Earlier Protoss gas — *no change at all*. M2's handoff proposed this; it is wrong. Protoss floats gas early and only becomes gas-limited later, because it is stuck on two bases.
- Earlier Psionic Storm, both in the build script and the research order — *no change*. Protoss dies before the tech matters.
- Earlier lurkers for Zerg — no change.
- More Zerg macro hatcheries — Zerg gets larvae but no minerals to spend on them.
- A cost-aware research gate (replacing the flat `minerals < 200 || gas < 150`) — helps Terran more than Zerg, TvZ went to 97.
- Rebalancing gas vs mineral workers when gas is banked — worse across the board.
- Reacting to a *sighted* push instead of one that has already landed — no improvement.
- A steeper or gentler Zerg drone ramp than the committed `(workers - 16) * 1.5` — both worse.

**Known asymmetry worth attacking.** By ten minutes in TvZ, Terran has finished five techs (siege, stim, u238, mines, thrusters) and Zerg has finished none. Zerg's minerals and gas are anti-correlated early — it holds 470 minerals with 32 gas, then 114 minerals with 359 gas — so the flat research gate almost never opens for it. The obvious fix backfired (see dead ends), but the underlying observation still looks like the biggest single lever on TvZ.

## Architecture map

| File | Role |
|---|---|
| `js/data.js` | All unit/building/upgrade/tech/ability tables (BW numbers, frames at 24/s, tiles, px/frame). |
| `js/map.js` | `MapCodec` (run-length codec for custom maps), `MAP_LAYOUTS`, `GameMap` (terrain, cliffs, ramps, resources, creep, psi, placement, `generateCustom` for editor maps), `Pathfinder` (A*, returns a **best-effort partial path**, never fails). |
| `js/sim.js` | `Player`, `Unit` (orders state machine, movement with turn/accel, gathering, building, combat helpers). `TURN`/`ACCEL` tables live here. |
| `js/game.js` | `G`: init, spatial hash (`near`, `nearEach`), vision/detection, spawning/killing, production, supply, damage, victory, tick loop. |
| `js/combat.js` | Weapon firing, splash, glaive/line, projectiles, interceptor/scarab launch. |
| `js/abilities.js` | Spells, fields (storm/swarm/etc.), auto-casts, interceptor/scarab/dock behaviours, infest. |
| `js/commands.js` | `RNG`, `G.rand`, `G.stateHash`, command packers/dispatcher (`CMD`), wrappers that intercept every player action, `G.exec`, cheats, `Replay`. Loaded after abilities.js. |
| `js/ai.js` | Computer players: scripts, macro, money reservation, production, research, army waves, scouting, drops, micro. |
| `js/missions.js` | Eight scenarios, the mission runner (fallback victory, score line) and helpers (`G.hallOf`, `G.givePlayer`, `G.placeDone`). |
| `js/build.js` | Build stamp. Reflection over the sim's data tables and function source; saves and replays carry it and a mismatch is refused. Render code is deliberately excluded. |
| `js/net.js` | LAN lockstep client: hash exchange, desync detection, drop and rejoin. `test/serve.js` is the static server + relay (no npm deps). |
| `js/editor.js` | Map editor: terrain brush, rectangle fill, mirrored painting, undo/redo, minimap, base placement, validation, localStorage and JSON import/export. |
| `js/audio.js` | `Voice` (speechSynthesis) and `Music` (WebAudio generative). |
| `js/terrain.js`, `js/sprites*.js`, `js/atlas.js`, `js/fx.js`, `js/render.js`, `js/hud.js`, `js/ui.js` | Rendering, baked-sprite loading and tinting, effects, HUD/console, input/menus/loop, observer overlays. `hud.js` overrides the drawing methods of `UI`. |
| `tools/models.js`, `tools/raster.js`, `tools/bake.js` | Sprite pipeline. `node tools/bake.js` writes `assets/sprites/*.png`, `assets/atlas.js`, `assets/preview.png`. `ART_SCALE` in bake.js is the render-only infantry size boost. |

## Invariants (do not break)

1. **Determinism.** No `Math.random`, `Date`, or `performance` in sim files (`sim.js`, `game.js`, `combat.js`, `abilities.js`, `ai.js`, `map.js`, `commands.js`, `missions.js`). Use `G.rand()`. `test/determinism.js` must stay green; `test/diverge.js` pinpoints a divergence frame if it breaks.
2. **Commands.** Anything the human does to the sim must go through a function wrapped in `CMD.install()`. A new player-facing sim mutation needs a packer + `CMD.apply` case, or replays and network play silently desync.
3. **Sim vs render.** `G.tick` sets `G.inTick`; UI calls outside ticks are intercepted. Render-side state (FX particles, decals, animation frames) must never influence the sim. `js/fx.js` is render-only and is not referenced by any sim file; keep it that way. `G.human` is render-only too — that is what makes replay vision switching safe.
4. **Input must not depend on rendering.** Hotkeys and command-card clicks rebuild the card through `UI.currentCard()`. Do not go back to reading a card cached by the draw pass; the browser pane throttles rendering and the card goes stale.
5. **Baked art.** Edit `tools/models.js` and rebake; never hand-edit PNGs. If assets are missing, vector painters are the fallback.
6. **The build stamp covers the sim only.** If you add a sim file, add it to the list in `js/build.js`. If you change render code the stamp must *not* move — `test/version.js` and a rebake of the sprites both check this in practice.
7. **Browser pane quirk.** The desktop app's browser pane throttles `requestAnimationFrame`; the sim runs on `setInterval` in `UI.simStep`. Keep it that way. It also makes render timings noisy, so trust the median.

## Performance baseline

Measured by `node test/perf.js 600 4 temple --sustain` (4 players, ~205 supply each, 513 units, damage disabled so the load does not decay):

| metric | value | target |
|---|---|---|
| sim tick mean | 2.75 ms | under 8 ms |
| sim tick p95 | 5.64 ms | — |
| render median at 1080p, ~500 units on screen | 3.7 ms | under 6 ms |

Both targets were met at M2 and nothing in M3 touched the hot path. The infantry sprites are about 27% larger, which costs a little fill rate; re-measure if you do another art pass.

## Known issues and rough edges

- **Balance**: see the section above. Terran vs Zerg is the one *established* failure (76.1% [65.0–84.5]) and is M3's regression. Protoss vs Terran leans Terran but has never been established either way at this sample size.
- **An unreachable goal is never abandoned.** `Pathfinder.find` returns a best-effort partial path rather than failing, so a unit ordered somewhere it cannot reach walks into the obstacle and slides along it forever with a live order. `u.stuck` does not catch it because the unit *is* moving. A movement watchdog was written and measured during M3 (give up after ten seconds without getting closer, then let `follow`/`patrol`/`construct`/`load` drop the order); it fixed every case it was aimed at but made units go idle *inside* building footprints in `z1` and `z2`, which were clean before, so it was reverted. Worth another attempt alongside the push-out logic.
- **Burrowed units silently ignore plain move orders.** `moveTo` returns false immediately for a burrowed unit and nothing cancels the order. Fixed for `load` (the unit surfaces); the general fix is to unburrow on any movement order as Brood War does, which needs `AI.army()` to skip burrowed units the way it already skips sieged ones, or Lurkers will surface and oscillate.
- **Missions**: all eight resolve and are winnable. Driven by the scripted player, `t1`, `t2` and `p3` are won and the rest run to the frame cap; a human should try them before tuning.
- **Multiplayer**: rejoin re-simulates from frame 0, so joining a very long game takes a while. There is no host migration. Speed is locked to Fastest. Tested with two clients plus AI, not more.
- **Replay seeking backwards** restarts and re-runs from frame 0, so scrubbing back in a long game pauses for a moment. Snapshots every few minutes would fix it.
- **AI `defend` state** can ping-pong when harassed; drop ops occasionally wait the full timeout with an empty transport.
- **Editor**: maps are always 128x128 and the brush is a circle (rectangle fill is a separate mode).
- **UI**: mission briefing text overflows the panel on a narrow window, and below roughly 900x600 the fixed-height console leaves almost no map viewport.
- **Art**: buildings have no damage states; one terrain tileset.
- The desktop browser pane logs a `SyntaxError: Unexpected token ','` on load that does not come from any project file (all pass `node --check`); ignore it there, but confirm it does not appear in a normal browser.

## Milestone M4 — proposed

Nothing here is started. Do them in order; each is one commit with tests green.

1. ~~Give the balance harness error bars.~~ **Done** — `test/balance.js` prints 95% Wilson intervals and reports "undecided" when the interval crosses the 60/40 line; `test/balance_stats.js` checks the maths and pins the M3 numbers as a fixture.
2. **Fix Terran vs Zerg, without giving back Protoss vs Zerg.** This is the M3 regression. Read the balance section first: the base-count floor couples the two matchups, so the useful move is to find a *different* way to make Protoss competitive so the floor can be relaxed for Zerg. Acceptance: all three matchups within 60/40 over **two independent 216-game runs** (`--seeds=1..6` and `--seeds=7..12`), not one — M3 was misled by exactly that.
3. **Fix the unreachable-goal class of bug properly.** See the rough edges above; the watchdog plus the footprint push-out, together. Acceptance: `test/playtest.js all` and `test/playtest.js missions` stay at 0 stuck units, and a unit ordered onto an unreachable cliff gives up within a few seconds.
4. **Replay snapshots.** Keep a state snapshot every couple of minutes so seeking backwards does not re-run from frame 0. Acceptance: seeking backwards in a 20-minute replay is under a second and `test/observer.js`'s bit-identical checks still pass.
5. **Building damage states.** Terran buildings already burn below a third; give every race visible damage at two thresholds. Acceptance: side-by-side screenshots.
6. **Human play-test round three (stretch).** Now that the AI macros properly and observer controls exist, watch a few AI-vs-AI replays and log what the AI does that a human never would. That is likely to be worth more than another tuning pass.

## How to run everything

```bash
node test/serve.js 8765          # or double-click PLAY.bat; prints LAN URL
node test/features.js            # 87 gameplay checks
node test/determinism.js         # identical runs match; replay reproduces the original
node test/version.js             # build stamp: a save from another build is refused
node test/observer.js            # replay observer: vision switching, production overlay, seeking
node test/playtest.js all        # scripted human drives TvZ, PvT, ZvP through the UI layer
node test/playtest.js missions   # the same scripted human plays all eight campaign missions
node test/net.js                 # two lockstep clients + AI: hashes, drop, rejoin, desync detection
node test/missions.js            # every campaign mission: setup, placement, objective resolves
node test/editor.js              # custom map, mirrored 4-player map, undo/redo, AI game, LAN game
node test/balance.js --seeds=1,2,3,4,5,6     # win-rate matrix (about 9 minutes) - see the variance warning
node test/perf.js 600 4 temple --sustain     # 4-player 200-supply battle timings
node test/smoke.js 16000 TZ temple           # single AI-vs-AI game
node test/diag.js PZ 21600 temple            # AI progression dump
node test/diverge.js                         # finds the first non-deterministic frame
node tools/bake.js                           # after editing tools/models.js
```

**A/B-ing the AI.** Balance runs read `js/*.js` from disk when each child process starts, so editing the working tree mid-run silently mixes two versions — that happened once in M3 and cost a full run. Snapshot instead: copy `js/{data,map,sim,game,combat,abilities,commands,ai}.js` plus `test/balance.js` into a scratch directory and run the harness from there, which also lets several variants run at once.

Git: the repo is inside OneDrive; commits with the 16 MB of sprites are slow (30-60 s). Run `git add -A && git commit` in the background if using a tool with a timeout.
