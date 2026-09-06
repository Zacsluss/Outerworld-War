# HANDOFF — Brood War Remake

Read this first in a fresh chat. It says where the build is, how it is wired, what must never break, and exactly what the next milestone is.

## Kickoff for the next chat

Open a chat in `Default Project/broodwar/` and paste:

> Read HANDOFF.md and README.md, run the tests, then do Milestone M5 from HANDOFF.md. Work through the tasks in order, keep the determinism tests green after every change, commit at each task, and update HANDOFF.md at the end.

## Status (as of commit 065f8ad, 2026-09-06)

Milestone M4 is complete except for its balance task, which is documented as **not achievable with the levers tried** — read the balance section before spending time there. M3 is complete.

What M4 added on top of M3:

- **Confidence intervals in the balance harness.** `test/balance.js` reports "at target", "OUTSIDE 60/40" or "undecided" with a 95% Wilson interval, and says how many more games a verdict needs. This is the most valuable thing in the milestone: it retro-invalidates several M3 conclusions.
- **Three classes of never-completing order fixed** — unreachable goals, units wedged in building footprints, and burrowed units. Together these were the last source of stuck units.
- **Simulation snapshots.** Replay seeking backwards is 236 ms instead of 2438 ms, via `js/snapshot.js`.
- **Building damage states** for all three races at two thresholds.
- **Multiplayer speed selection**, editor map sizes, the console and menu fitting small windows.
- **An AI audit tool** (`test/aiaudit.js`) that counts things a human would never do, and a supply fix it found.

What M3 added on top of M2:

- **AI macro rework.** Composition priority is respected instead of drifting to the cheapest unit, a base-count floor stops Protoss and Terran sitting on two bases, static defence is no longer starved by expansions, Zerg drones stop crowding out its army, and the attack trigger is race-neutral. Protoss vs Zerg went from 22% to 42% over 216 games. Terran vs Zerg got worse; see below.
- **Play-test round two.** The three ladder games re-run on Normal and all eight missions driven through the UI for the first time, via a new `missions` mode in `test/playtest.js`. Two bugs found and fixed, both of which broke `z3 Tunnel Vision`. 0 errors, 0 stuck units across the session.
- **Build stamp on saves and replays.** A save from a different build is refused with the reason instead of re-simulating into a different game.
- **Editor quality of life.** Undo/redo, rectangle fill, 2- and 4-player mirrored painting, and a clickable minimap.
- **Infantry art pass.** Marines, zerglings and zealots are about 27% larger, and every unit has a four-frame idle loop instead of one static pose.
- **Observer and replay controls.** Per-player vision switching, a production overlay and a timeline scrubber.

### Where the balance actually landed — read this before touching it

**M4 task 1 (fix Terran vs Zerg) was not achieved, and I do not think it is achievable by tuning.** Final state over 216 games (12 seeds x 3 layouts x both sides), 95% Wilson intervals:

| matchup | result | verdict |
|---|---|---|
| Protoss vs Zerg | P 51% [39–62] | undecided, i.e. even as far as this can tell |
| Protoss vs Terran | P 28% [19–40] | **outside** |
| Terran vs Zerg | T 84% [73–91] | **outside** |

**Roughly forty configurations have now been measured across M3 and M4.** Everything below is evidence, not opinion. The single most useful thing for M5 is to not repeat any of it.

**The structural finding.** Equal-supply controlled duels (48–54 supply a side, six seeds each) give **Terran–Zerg 3–3, Protoss beats Terran 6–0, Zerg beats Protoss 6–0**. The unit tables are fine. Every game is decided by who brings more army supply to the fight.

**The pattern that defeats tuning.** *Every general improvement to the AI helps Terran most.* The composition hold, the base-count floor, the movement fixes, the Lurker fix, the supply fix — each was measured, each was a genuine improvement in AI quality, and each left Terran further ahead. Terran converts macro quality into delivered supply better than the other two because marines are cheap, mass instantly and never path badly. So "make the AI better" is not a route to balance here; it moves the wrong way.

**What was measured and did not work** (each a full run, most 216 games):

| tried | result |
|---|---|
| Terran comp off marines (6→4) onto tanks (4→5) | TvZ 80% [70–88] — unchanged |
| More Zerg Lurkers (morph ratio 1.5 → 0.8) | TvZ 79% [68–87] — unchanged |
| Zerg drones→army earlier (ramp from 16 → 12 workers) | TvZ 91% — much worse |
| Zerg early sunkens on a supply curve | TvZ 90% — much worse |
| Relaxing the base-count floor for Zerg only | TvZ 65% but PvZ collapses to 11% |
| Earlier Protoss gas | no change at all (M2's handoff recommended this) |
| Earlier Psionic Storm, in the script and the research order | no change at all (also recommended by M2) |
| Earlier Lurkers in the research order | no change |
| More Zerg macro hatcheries | larvae but no minerals |
| Cost-aware research gate | helps Terran more; TvZ 97% |
| Gas vs mineral worker rebalancing | worse across the board |
| Reacting to a sighted push rather than one that landed | no improvement |
| Steeper or gentler Zerg drone ramps than the committed one | both worse |

**What I would try next, in order.** All of these change *what the game asks of the AI* rather than how well it plays:

1. **Make the first timing push survivable.** Every one of these games is decided by one fight around the eight-to-eleven minute mark, and the loser never recovers. Anything that softens that — a real retreat behaviour, reinforcement that arrives as a group, static defence that is actually placed on the attack path — changes the shape of the game rather than nudging a number. Zerg loses that fight in TvZ and Protoss loses it in PvT.
2. **Give Terran something to get wrong.** Marines are strictly the best thing the AI can do with minerals. If the AI had to hold a third base to afford its army, or if bio needed upgrades to stay efficient, Terran's macro edge would cost something.
3. **Only then tune.** With the interval tool, a real 10-point move needs 97 decided games per matchup to confirm — about nine minutes per configuration. Budget accordingly.

**Known asymmetry, still unexploited.** By ten minutes in TvZ, Terran has finished five techs (siege, stim, u238, mines, thrusters) and Zerg has finished none. Zerg's minerals and gas are anti-correlated early — 470 minerals with 32 gas, then 114 minerals with 359 gas — so the flat research gate almost never opens for it. The obvious fix (a cost-aware gate) backfired because it helped Terran more, but the observation still looks like the biggest single lever on TvZ if approached from the Zerg side only.

### How M3's balance work landed (kept for context)

Two things matter more than the M3 numbers themselves:

1. **The variance is much larger than M2 assumed.** A `--seeds=1,2,3,4,5,6` run is 36 games per matchup, and the 95% interval on 36 games is about 30 points wide. Two independent 108-game runs of the *same* code gave PvT 41.7% and 25.0% — and those two are further apart than binomial noise alone explains, so per-seed map structure adds variation on top. `test/balance.js` now prints the interval and reports "undecided" rather than a number you can tune against; **97 decided games per matchup** are needed for ±10 points, 385 for ±5.
2. **The M3 task 1 commit message (48f7fc2) overstates the result.** It quotes the seeds 1–6 run only. Here is the same comparison over 216 games per configuration (12 seeds x 3 layouts x both sides, so 72 decided games per matchup) with 95% Wilson intervals:

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
| `js/snapshot.js` | Simulation snapshots: reflective capture and restore of the whole sim state, used for replay seeking. Reflective on purpose — a hand-written field list would silently desync the first time someone added a field. |
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

- **Balance**: see the section above. Terran vs Zerg (T 84%) and Protoss vs Terran (P 28%) are both established failures; Protoss vs Zerg is even. This is the open problem.
- **The AI leaves production buildings idle about a fifth of the time**, measured by `test/aiaudit.js`. Some of that is the deliberate composition hold, not all. It is the largest remaining number in the audit.
- **The AI is supply blocked about 10% of the time**, down from 13% but still far more than a human.
- **Missions**: all eight resolve and are winnable. Driven by the scripted player, `t1`, `t2` and `p3` are won and the rest run to the frame cap; a human should try them before tuning.
- **Multiplayer**: rejoin still re-simulates from frame 0, so joining a long game takes a while — `js/snapshot.js` now exists and would fix this, but the relay would have to ship a snapshot rather than the whole command history. Tested with two clients plus AI, not more.
- **Replay backward-seek** restarts from a checkpoint 30 s back, so it is fast but not instant; checkpoints past 40 minutes are thinned to every 60 s.
- **Editor**: the brush is a circle only (rectangle fill is a separate mode). Map size cycles 96/128/160/192 and the engine accepts 64–256, but the size button is the only way to change it.
- **Art**: one terrain tileset.
- **Host migration** is not a thing that needs building: the relay picks the first non-dropped human as host, so if the host leaves the next player takes over, and mid-game there is no authority to transfer because the relay routes everything.
- The `SyntaxError: Unexpected token ','` that the desktop browser pane logged since M2 **no longer reproduces** — the console is clean on load and every project file passes `node --check`.

## Milestone M5 — proposed

Nothing here is started. Do them in order; each is one commit with tests green.

1. **Make one lost fight not lose the game.** Every AI-vs-AI game is decided by a single engagement around minute eight to eleven, and the loser never rebuilds. Give the AI a retreat (pull out below some army-strength ratio rather than feeding units in), reinforcement that arrives as a group instead of in ones, and static defence placed on the path an attack actually takes. This is the prerequisite for the balance work, not a nice-to-have — see the balance section for why tuning cannot get there.
2. **Then re-measure balance.** Two independent 216-game runs, using the interval verdicts rather than the raw percentages. Acceptance: no matchup reported OUTSIDE 60/40. Do not chase "undecided" — that is the tool telling you the run cannot decide, not a failure.
3. **Close the idle-production gap.** `test/aiaudit.js` says production buildings sit idle about a fifth of the time with the money to fill them banked. Work out how much of that is the composition hold and fix the rest. Acceptance: the audit number roughly halves and balance does not move.
4. **Ship snapshots to rejoining clients.** The relay currently replays the entire command history to a rejoiner, which is slow and gets slower. `js/snapshot.js` already captures everything needed; the work is transferring it and trusting it. Acceptance: rejoining a 20-minute game is under a few seconds and `test/net.js` still passes.
5. **A second terrain tileset.** One more biome through the existing procedural pipeline, selectable per map in the editor. Acceptance: side-by-side screenshots and a game played on each.
6. **Human play-test round four (stretch).** With the observer controls and the audit tool, watch a few games and log what the numbers do not catch.

## How to run everything

```bash
node test/serve.js 8765          # or double-click PLAY.bat; prints LAN URL
node test/features.js            # 87 gameplay checks
node test/determinism.js         # identical runs match; replay reproduces the original
node test/version.js             # build stamp: a save from another build is refused
node test/observer.js            # replay observer: vision switching, production overlay, seeking
node test/snapshot.js            # a restored simulation snapshot re-simulates bit-identically
node test/movement.js            # unreachable goals, wedged units, burrowed units
node test/balance_stats.js       # the statistics behind the balance harness (runs no games)
node test/aiaudit.js             # counts things the AI does that a human never would
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
