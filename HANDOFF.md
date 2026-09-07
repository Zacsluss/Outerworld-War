# HANDOFF — Brood War Remake

Read this first in a fresh chat. It says where the build is, how it is wired, what must never break, and exactly what the next milestone is.

## Kickoff for the next chat

Open a chat in `Default Project/broodwar/` and paste:

> Read HANDOFF.md and README.md, run the tests, then do Milestone M6 from HANDOFF.md. Work through the tasks in order, keep the determinism tests green after every change, commit at each task, and update HANDOFF.md at the end.

## Status (as of commit e986eec, 2026-09-07)

**Milestone M5 is complete, all six tasks, and it did what M4 said could not be done: no matchup is
outside 60/40 any more.** M3 and M4 are complete.

The one thing to carry forward: **M4 concluded that TvZ was not fixable by tuning, and that was correct.**
Forty-odd configurations had been measured and none moved it. What moved it was changing the shape of the
game — making a lost fight survivable — exactly as M4's "what I would try next" predicted. TvZ went from
84% to 60% without a single number in `js/data.js` changing.

What M5 added on top of M4:

- **The AI retreats.** Below 80% of the supply a wave started with, or when it is outgunned locally and
  taking hits, it pulls back to its main and regroups for 25 seconds. It also keeps its wave together —
  units more than 13 tiles behind the blob's centroid rally on it instead of trickling into the fight —
  and it places static defence between its base and the enemy start rather than towards the map centre.
- **Balance re-measured and at target**, over 432 games. See below.
- **Idle production nearly halved**, 203 to 106 per game-minute, by raising the money-reserve threshold.
  This is the rare change that improved both the audit number and balance.
- **Rejoin ships a snapshot.** The relay asks a live client for one, holds the rejoiner until it arrives,
  and then sends only the commands issued after it. Rejoining is a few seconds instead of a re-simulation
  of the whole game. The full-history path is still there as a 4-second fallback if nobody answers.
- **A second tileset.** Jungle, through the same procedural pipeline; the palette is a table in
  `js/terrain.js` and adding a third means adding an entry there and an id in `js/map.js`. Selectable per
  map in the editor, carried in the map format, and screenshot side by side in `assets/tilesets.png`.
- **Play-test round four**, which found and fixed a patrol that swapped its endpoints forever without
  moving, and two flaws in the stuck-unit checker itself.

What M4 added on top of M3:

- **Confidence intervals in the balance harness.** `test/balance.js` reports "at target", "OUTSIDE 60/40"
  or "undecided" with a 95% Wilson interval, and says how many more games a verdict needs. This is the
  most valuable thing in that milestone: it retro-invalidates several M3 conclusions.
- **Three classes of never-completing order fixed** — unreachable goals, units wedged in building
  footprints, and burrowed units.
- **Simulation snapshots.** Replay seeking backwards is 236 ms instead of 2438 ms, via `js/snapshot.js`.
- **Building damage states** for all three races at two thresholds.
- **Multiplayer speed selection**, editor map sizes, the console and menu fitting small windows.
- **An AI audit tool** (`test/aiaudit.js`) that counts things a human would never do.

What M3 added on top of M2:

- **AI macro rework.** Composition priority is respected instead of drifting to the cheapest unit, a
  base-count floor stops Protoss and Terran sitting on two bases, static defence is no longer starved by
  expansions, Zerg drones stop crowding out its army, and the attack trigger is race-neutral.
- **Play-test round two**, all eight missions driven through the UI for the first time.
- **Build stamp on saves and replays.** A save from a different build is refused with the reason.
- **Editor quality of life.** Undo/redo, rectangle fill, mirrored painting, a clickable minimap.
- **Infantry art pass** and **observer/replay controls** (per-player vision, production overlay, scrubber).

### Where the balance landed — read this before touching it

**At target as of M5.** Pooled over 432 games: two independent 216-game runs (seeds 1-12 and 13-24, each
3 layouts x both sides), 95% Wilson intervals.

| matchup | pooled result | verdict |
|---|---|---|
| Protoss vs Zerg | P 52% [44-60] | **at target** |
| Protoss vs Terran | P 52% [44-61] | undecided, straddling even |
| Terran vs Zerg | T 60% [51-67] | undecided, leaning Terran |

**Nothing is OUTSIDE 60/40.** Compare M4: TvZ 84% [73-91] outside, PvT 28% [19-40] outside. Both moved
about 25 points, and no unit stat changed to do it.

**What actually worked, after about forty configurations that did not.** One change:

> Retreat when a wave has lost a fifth of the supply it started with, and fall back to the main behind
> static defence rather than to the nearest friendly unit.

The threshold matters and was measured: 0.8 of starting wave supply beats 0.7, which beats 0.55. The
earlier attempt in M3 tested a *unit-count* loss threshold of 35% and it never once fired in twelve games
— the wave was dead before it tripped. Measuring "did the retreat actually happen" before measuring "did
the retreat help" is what unstuck this.

The second-order effect is what fixed the balance, not the retreat itself. Games now last 15.9 minutes
instead of 14.4, there are 66 retreats where there were 0, and a player who loses its army recovers 35%
of the time. **The loser is no longer dead at the first fight, so macro quality stops being decisive** —
and Terran's edge was entirely a macro edge (see the structural finding below, which still holds).

The second win was the **money reserve**: production was being held back whenever the bank was under the
reserved amount, so the AI would sit on 400 minerals saving for an expansion. Producing once the bank is
past 40% of the reserve halved idle production *and* improved balance, which almost nothing else did.

**The structural finding still holds and is worth keeping.** Equal-supply controlled duels (48-54 supply
a side, six seeds each) give **Terran-Zerg 3-3, Protoss beats Terran 6-0, Zerg beats Protoss 6-0**. The
unit tables are fine. Every game is decided by who brings more army supply to the fight. That is why
tuning unit stats never moved anything, and why a change to the *shape* of the game did.

**Do not repeat these.** Each was a full run, most 216 games, all zero or negative:

| tried | result |
|---|---|
| Terran comp off marines (6 to 4) onto tanks (4 to 5) | TvZ unchanged at 80% |
| More Zerg Lurkers (morph ratio 1.5 to 0.8) | TvZ unchanged at 79% |
| Zerg drones to army earlier (ramp from 16 to 12 workers) | TvZ 91%, much worse |
| Zerg early sunkens on a supply curve | TvZ 90%, much worse |
| Relaxing the base-count floor for Zerg only | TvZ 65% but PvZ collapses to 11% |
| Earlier Protoss gas | no change at all (M2's handoff recommended this) |
| Earlier Psionic Storm, in the script and the research order | no change at all (also recommended by M2) |
| Earlier Lurkers in the research order | no change |
| More Zerg macro hatcheries | larvae but no minerals |
| Cost-aware research gate | helps Terran more; TvZ 97% |
| Gas vs mineral worker rebalancing | worse across the board |
| Reacting to a sighted push rather than one that landed | no improvement |
| Steeper or gentler Zerg drone ramps than the committed one | both worse |
| Retreat on 35% of units lost | never fired: 0 retreats in 12 games |
| Retreat at 0.55 or 0.7 of starting wave supply | both worse than 0.8 |

**The one number still worth watching.** TvZ at 60% [51-67] sits exactly on the boundary and the interval
crosses it, so the harness reports undecided — that is the tool being honest, not a failure. Deciding it
either way needs about 385 decided games per matchup for a ±5 point interval, roughly 40 minutes of
wall clock. **Measure before tuning it: it may already be fine.**

**Known asymmetry, still unexploited.** By ten minutes in TvZ, Terran has finished five techs (siege,
stim, u238, mines, thrusters) and Zerg has finished none. Zerg's minerals and gas are anti-correlated
early — 470 minerals with 32 gas, then 114 minerals with 359 gas — so the flat research gate almost never
opens for it. The obvious fix (a cost-aware gate) backfired because it helped Terran more, but the
observation still looks like the biggest remaining lever on TvZ if approached from the Zerg side only.

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

So M3 traded one established failure for another. M4 then failed to fix Terran vs Zerg by tuning and said
so honestly, which is what let M5 fix it by changing the game instead. The lesson to carry is in that
sequence: a milestone that reports a negative result accurately is worth more than one that reports a
number from too few games.

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
| `js/terrain.js` | Procedural terrain painting, and `TILESETS` — the palette table that is the whole of what makes a biome look like itself. A new biome is an entry here plus an id in `TILESET_IDS` in `js/map.js`. |
| `js/sprites*.js`, `js/atlas.js`, `js/fx.js`, `js/render.js`, `js/hud.js`, `js/ui.js` | Rendering, baked-sprite loading and tinting, effects, HUD/console, input/menus/loop, observer overlays. `hud.js` overrides the drawing methods of `UI`. |
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

Both targets were met at M2 and nothing since has touched the hot path. **This has not been re-measured
since the M3 art pass**, which made the infantry sprites about 27% larger and costs some fill rate;
re-measuring it is M6 task 5.

## Known issues and rough edges

- **Terran vs Zerg leans Terran at 60%**, right on the 60/40 boundary with the interval crossing it. Not
  an established failure any more, but the closest thing to one. Measure it properly before tuning.
- **The AI leaves production buildings idle about an eighth of the time** with the money to fill them
  banked, measured by `test/aiaudit.js`. Halved in M5, not solved. The composition hold accounts for 7.9%
  of production calls; the money reserve for most of the rest.
- **Spellcasters sit on a full energy bar 23% of the time.** Read this as a share of caster-seconds, not
  as the raw per-minute rate the audit also prints — the AI fields far more casters than it used to, so
  the rate went up while the waste stayed flat. This is the largest untouched number in the audit.
- **The AI is supply blocked about 9% of the time**, still far more than a human.
- **A Carrier with no interceptors left is inert**: it holds position in range of its target and does
  nothing, with no feedback to the player. Brood War behaves the same way, and the answer is to build
  interceptors, but a human would at least be told. It is the one remaining stuck-unit report in the
  play-test ladder suite; the missions suite is clean.
- **`test/net.js` is timing-sensitive under load.** It failed two checks once during M5, while a 216-game
  balance run was saturating every core, and passed five times in a row afterwards including immediately
  after the same batch. Do not run it alongside a balance run and then believe the result.
- **Missions**: all eight resolve and are winnable. Driven by the scripted player, `t1`, `t2` and `p3` are
  won and the rest run to the frame cap; a human should try them before tuning.
- **Multiplayer**: rejoin now ships a snapshot and is fast. Tested with two clients plus AI, not more.
- **Replay backward-seek** restarts from a checkpoint 30 s back, so it is fast but not instant;
  checkpoints past 40 minutes are thinned to every 60 s.
- **Editor**: the brush is a circle only (rectangle fill is a separate mode). Map size cycles 96/128/160/192
  and the engine accepts 64-256, but the size button is the only way to change it.
- **Art**: two terrain tilesets, badlands and jungle. A third is a palette entry in `js/terrain.js` plus an
  id in `TILESET_IDS` in `js/map.js`, and nothing else.
- **Host migration** is not a thing that needs building: the relay picks the first non-dropped human as
  host, so if the host leaves the next player takes over, and mid-game there is no authority to transfer
  because the relay routes everything.
- The `SyntaxError: Unexpected token ','` that the desktop browser pane logged since M2 **no longer
  reproduces** — the console is clean on load and every project file passes `node --check`.

## Milestone M6 — proposed

Nothing here is started. Do them in order; each is one commit with tests green. The AI and the balance are
in a good place now, so this milestone is mostly about what the *player* experiences.

1. **Settle Terran vs Zerg — by measuring, not tuning.** It sits at 60% [51-67], undecided. Run 385
   decided games per matchup (about 40 minutes) and find out whether there is anything to fix. Acceptance:
   a verdict, either "at target" or a named, reproduced problem. **Do not change any number before the
   measurement comes back** — that is how M3 and M4 each burned a milestone.
2. **Spend the energy.** Casters idle at a full bar 23% of caster-seconds. Work out which spells the
   auto-cast never reaches for and why. Acceptance: the share roughly halves and balance does not move.
3. **Tell the player what is wrong.** Idle production, supply block, a Carrier with no interceptors, an
   attack on an undefended expansion — the sim knows all of these and says none of them. Brood War-style
   alerts (a line in the console, a minimap ping, a voice line). Acceptance: each of the four fires in a
   real game and none fires spuriously.
4. **Make the missions beatable on purpose.** Five of eight run to the frame cap under the scripted bot
   rather than being won. Either the objectives are unreachable for a competent player or the bot is not
   one; find out which. Acceptance: the scripted bot wins at least six, or a written reason per mission.
5. **A third tileset and a perf re-measure.** Ice or desert through the same palette table, then re-run
   `node test/perf.js 600 4 temple --sustain` — the M2 baseline has not been re-measured since the M3 art
   pass. Acceptance: side-by-side screenshots and both perf targets still met.
6. **Play-test round five (stretch).** With the alerts in, watch a few games and log what the audit misses.

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
node test/micro.js               # prints a controlled duel frame by frame (diagnostic, not pass/fail)
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
