# HANDOFF — Brood War Remake

Read this first in a fresh chat. It says where the build is, how it is wired, what must never break, and
exactly what is left to do.

## Kickoff for the next chat

Open a chat in `Default Project/broodwar/` and paste:

> Read HANDOFF.md and README.md, run the tests, then finish Milestone M6 from the "M6 — what is left"
> section. Work through the open items in order, keep the determinism tests green after every change,
> commit at each item, and update HANDOFF.md at the end.

## Status (as of commit 43776b9, 2026-09-07)

**M6 is mostly done: tasks 1, 2, 3 and 4 are resolved, task 5 is half in, task 6 is untouched.** M3, M4
and M5 are complete. Four commits are in:

| commit | task | state |
|---|---|---|
| `032b975` | M6 task 2 — spend the energy | **done** |
| `e5f59f1` | M6 task 3 — tell the player what is wrong | **done** |
| `f44e63e` | M6 task 4 — missions | **done**, 7 of 8 won, acceptance was six |
| `43776b9` | M6 task 5 — third tileset | **partial**, tileset in, perf not re-measured |

Task 1 (settle Terran vs Zerg by measuring) **has its answer** — see below — but the run that produced it
was killed two thirds of the way through when the session ended, so PvT and PvZ were not re-measured.
Task 6 (play-test round five) is not started.

### Task 1's answer: TvZ is not a balance problem, it is a map problem

This is the most useful thing in M6 so far. **Read it before touching any number in `js/data.js`.**

The measurement ran on the M5 code as shipped (commit `f6d4229`, snapshot copy so the working tree could
be edited while it ran). It completed **all 396 TvZ games** — 66 seeds x 3 layouts x both sides, 378
decided — before the process was killed. That is essentially the 385 decided games the milestone asked
for. Pooled and per layout, 95% Wilson:

| | result | verdict |
|---|---|---|
| **TvZ pooled** | T 61% [56–66], 378 decided | undecided, one point over the line |
| TvZ on **temple** | T 49% [40–57], 127 decided | **at target** |
| TvZ on **bloodbath** | T 67% [59–75], 126 decided | leaning hard Terran |
| TvZ on **valley** | T 67% [59–75], 125 decided | leaning hard Terran |

**The matchup is dead even on temple and 67/33 on the other two layouts.** The pooled 61% is an average
of an even map and two broken ones, and it is why every attempt to fix TvZ by tuning unit stats failed
across M3, M4 and M5 — there was never one number to move. The unit tables produce a fair game on one
layout and an unfair one on two.

So the verdict is: **not an established failure, and not fixable from `js/data.js`.** The named,
reproduced problem is the layout spread, and the next question is what temple has that the other two do
not. Candidates worth measuring before changing anything: distance between mains, whether the natural is
behind a ramp, how many ramps lead into the main, and how exposed the third base is. `MAP_LAYOUTS` is in
`js/map.js`.

Do not chase the pooled number any further. 61% against a 60% line cannot be separated from the line by
any feasible number of games, and the harness saying "undecided, needs ~97 more" is the formula being
naive about a rate that sits exactly on the boundary — 378 games is already far past the point of
diminishing returns.

**PvT partial and unusable as stated.** The killed run got 115 PvT games in, all on temple: P 39%
[31–49]. That is one layout, so it is not comparable to M5's pooled P 52% [44–61] across three. Do not
quote it as a regression. It does hint that temple favours Terran in PvT while being even in TvZ, which
is another reason to look at the maps. PvZ was not reached at all.

### What M6 has added so far

- **The AI audit now breaks unspent energy down per unit**, and that changed the diagnosis completely.
  "Casters idle at a full bar 23% of caster-seconds" was not actionable. Per unit it is medics (76% of
  the waste) and comsat stations (24%), and essentially nothing else — because **the AI never fields any
  other caster in a normal-length game**. Over nine games it cast one scanner sweep and six spider mines.
  Zero storms, zero swarms, zero irradiates.
- **Medics now actually heal.** `medicAuto` only healed a unit it was already touching; out of touch
  range it did nothing unless the medic happened to be idle. It now walks the last few tiles, heals, and
  resumes the order it had. Hold still means hold.
- **Comsats spend a nearly-full bar.** 200/200 is four scans thrown away, so once the bar is nearly full
  the comsat buys vision on the attack target.
- Together: full-energy caster-seconds **26% → 11%** overall, the audit's headline (units only)
  **23% → 9%**. Medics 23% → 9% full, comsats 43% → 23%.
- **Four player alerts** — idle production, supply block, a Carrier with an empty hangar, an undefended
  expansion under attack — with a console line, a minimap ping where there is a place to ping, and the
  existing voice path. `ALERTS` at the top of `js/game.js` holds the hold/cooldown numbers.
- **`test/alerts.js`**, which found a real pre-existing bug: a queued unit that could not start for want
  of supply re-announced the supply line every 72 frames until a depot went up — ten times in one game,
  four of them at moments the player was not even on the cap. Now once, on one cooldown.
- **The scripted play-test bot was not a competent player**, and that, not the objectives, is why the
  missions did not resolve. The attack sent `army.slice(0, 12)` plus one more selection of twelve, so a
  bot on 179 army supply walked 24 units into a defended base every two minutes and left ninety standing
  at home. Selection caps at 12 and the script had taken that as a cap on the army. `Bot.attackAll` walks
  the whole army in twelves; `Bot.reinforce` sends units that finished training after the push left.
  **The missions went from 4 of 8 won to 7 of 8**, with zero JS errors and zero stuck units. Not one
  objective needed changing. p2 also halved, 27,624 frames to 14,136.
- **A third tileset, Ice**, plus `tools/tilesets.js`, which regenerates `assets/tilesets.png` from the
  game's own `Terrain.draw` instead of the ad-hoc screenshot M5 used.

## M6 — what is left

Do these in order. Each is one commit with tests green.

### 1. Re-measure performance (task 5)

The only thing left in task 5. **The M2 baseline has not been re-measured since the M3 art pass**, which
made infantry sprites about 27% larger. Do not run this while anything else is using the cores.

```bash
node test/perf.js 600 4 temple --sustain
```

| metric | M2 baseline | target |
|---|---|---|
| sim tick mean | 2.75 ms | under 8 ms |
| sim tick p95 | 5.64 ms | — |
| render median at 1080p, ~500 units | 3.7 ms | under 6 ms |

The tileset half of the task is done; `assets/tilesets.png` already shows all three side by side.

### 2. Confirm task 2 did not move the balance

Task 2's acceptance was "the share roughly halves **and balance does not move**". The first half is
measured and comfortably met. The second half is not, because the baseline run was killed.

The cheap way to do this is a **paired A/B on identical seeds**, not another full run. The baseline log
for seeds 1–66 of TvZ on the M5 code is at `C:\Users\zacsl\bw-scratch\m6-base\baseline.log` and is
complete for that matchup. Snapshot the current code and run the same seeds:

```bash
mkdir -p /c/Users/zacsl/bw-scratch/m6-after/js /c/Users/zacsl/bw-scratch/m6-after/test
cp js/{data,map,sim,game,combat,abilities,commands,ai}.js /c/Users/zacsl/bw-scratch/m6-after/js/
cp test/balance.js /c/Users/zacsl/bw-scratch/m6-after/test/
cd /c/Users/zacsl/bw-scratch/m6-after && node test/balance.js --matchups=TZ --seeds=$(seq -s, 1 66) --jobs=12 > after.log
```

Then score both logs the same way and compare. The parser is four lines; the `wilson` and `gamesFor`
functions are exported from `test/balance.js` exactly so this can be done without spending an hour on
games. Expect the medic change to help Terran if it does anything, and TvZ is the matchup that can least
afford it — that is why this is the pairing worth running.

If it does move TvZ outside 60/40, the honest options are to report it and leave the medic fix in
(medics not healing was a bug, not a balance lever) or to look again at the map finding above. Do not
tune unit stats to hide it.

### 3. Play-test round five (task 6, stretch)

With the alerts in, watch a few games and log what the audit misses. `PLAYTEST.md` has the format from
rounds one to four.

### Worth writing down but out of M6's scope

**The AI never fields an advanced caster.** Twenty-eight of the thirty spells have working code, a
working autocast in `AI.micro()`, and are never once reached in a normal-length game. Over nine games:
25 caster-seconds of high templar, 9 of corsair, and **zero** of defiler, science vessel, arbiter, queen,
ghost, battlecruiser and dark archon. Two contributing causes are visible in `js/ai.js`:

- The archon-merge rule (`production()`, the Protoss branch) merges any two high templars with
  `energy < 60` while `psi_storm_tech` is unresearched. A fresh templar starts below that, so every
  templar built before storm finishes is merged on sight and storm never gets cast.
- The buildings that unlock the rest arrive late in `AI_SCRIPTS` — `science_facility` at step 44,
  `defiler_mound` at 66, `arbiter_tribunal` at 60 — and games end at 15.9 minutes.

This is a composition and tech-timing problem, not an energy problem, and it is a milestone of its own.
It is also the largest untouched lever on how the AI actually plays.

## Architecture map

| File | Role |
|---|---|
| `js/data.js` | All unit/building/upgrade/tech/ability tables (BW numbers, frames at 24/s, tiles, px/frame). |
| `js/map.js` | `MapCodec` (run-length codec for custom maps), `MAP_LAYOUTS`, `TILESET_IDS`/`TILESET_NAMES`, `GameMap` (terrain, cliffs, ramps, resources, creep, psi, placement, `generateCustom` for editor maps), `Pathfinder` (A*, returns a **best-effort partial path**, never fails). |
| `js/sim.js` | `Player`, `Unit` (orders state machine, movement with turn/accel, gathering, building, combat helpers). `TURN`/`ACCEL` tables live here. |
| `js/game.js` | `G`: init, spatial hash (`near`, `nearEach`), vision/detection, spawning/killing, production, supply, damage, victory, tick loop. Also `ALERTS` + `G.tickAlerts` — the player-facing alerts, run once a second. |
| `js/combat.js` | Weapon firing, splash, glaive/line, projectiles, interceptor/scarab launch. |
| `js/abilities.js` | Spells, fields (storm/swarm/etc.), auto-casts (`medicAuto`, `batteryAuto`), interceptor/scarab/dock behaviours, infest. |
| `js/commands.js` | `RNG`, `G.rand`, `G.stateHash`, command packers/dispatcher (`CMD`), wrappers that intercept every player action, `G.exec`, cheats, `Replay`. Loaded after abilities.js. |
| `js/ai.js` | Computer players: scripts, macro, money reservation, production, research, army waves, scouting, drops, micro. |
| `js/missions.js` | Eight scenarios, the mission runner (fallback victory, score line) and helpers (`G.hallOf`, `G.givePlayer`, `G.placeDone`). |
| `js/snapshot.js` | Simulation snapshots: reflective capture and restore of the whole sim state, used for replay seeking. Reflective on purpose — a hand-written field list would silently desync the first time someone added a field. |
| `js/build.js` | Build stamp. Reflection over the sim's data tables and function source; saves and replays carry it and a mismatch is refused. Render code is deliberately excluded. |
| `js/net.js` | LAN lockstep client: hash exchange, desync detection, drop and rejoin. `test/serve.js` is the static server + relay (no npm deps). |
| `js/editor.js` | Map editor: terrain brush, rectangle fill, mirrored painting, undo/redo, minimap, base placement, tileset cycling, validation, localStorage and JSON import/export. |
| `js/audio.js` | `Voice` (speechSynthesis) and `Music` (WebAudio generative). |
| `js/terrain.js` | Procedural terrain painting, and `TILESETS` — the palette table that is the whole of what makes a biome look like itself. A new biome is an entry here plus an id in `TILESET_IDS` in `js/map.js`, and nothing else. |
| `js/sprites*.js`, `js/atlas.js`, `js/fx.js`, `js/render.js`, `js/hud.js`, `js/ui.js` | Rendering, baked-sprite loading and tinting, effects, HUD/console, input/menus/loop, observer overlays. `hud.js` overrides the drawing methods of `UI`. |
| `tools/models.js`, `tools/raster.js`, `tools/bake.js` | Sprite pipeline. `node tools/bake.js` writes `assets/sprites/*.png`, `assets/atlas.js`, `assets/preview.png`. `ART_SCALE` in bake.js is the render-only infantry size boost. |
| `tools/tilesets.js` | Serves a page that renders every entry in `TILESET_IDS` through the game's own `Terrain.draw` and posts the composed image back; writes `assets/tilesets.png` and exits. |

## Invariants (do not break)

1. **Determinism.** No `Math.random`, `Date`, or `performance` in sim files (`sim.js`, `game.js`,
   `combat.js`, `abilities.js`, `ai.js`, `map.js`, `commands.js`, `missions.js`). Use `G.rand()`.
   `test/determinism.js` must stay green; `test/diverge.js` pinpoints a divergence frame if it breaks.
2. **Commands.** Anything the human does to the sim must go through a function wrapped in `CMD.install()`.
   A new player-facing sim mutation needs a packer + `CMD.apply` case, or replays and network play
   silently desync.
3. **Sim vs render.** `G.tick` sets `G.inTick`; UI calls outside ticks are intercepted. Render-side state
   (FX particles, decals, animation frames) must never influence the sim. `js/fx.js` is render-only and
   is not referenced by any sim file; keep it that way. `G.human` is render-only too — that is what makes
   replay vision switching safe. Alerts follow the same rule: the decision is sim-side and gated on
   `p.human`, the minimap ping is render-side and gated on `G.human`.
4. **Input must not depend on rendering.** Hotkeys and command-card clicks rebuild the card through
   `UI.currentCard()`. Do not go back to reading a card cached by the draw pass; the browser pane
   throttles rendering and the card goes stale.
5. **Baked art.** Edit `tools/models.js` and rebake; never hand-edit PNGs. If assets are missing, vector
   painters are the fallback.
6. **The build stamp covers the sim only.** If you add a sim file, add it to the list in `js/build.js`.
   If you change render code the stamp must *not* move — `test/version.js` and a rebake of the sprites
   both check this in practice.
7. **Browser pane quirk.** The desktop app's browser pane throttles `requestAnimationFrame`; the sim runs
   on `setInterval` in `UI.simStep`. Keep it that way. It also makes render timings noisy, so trust the
   median.

## Balance: what is known, and what not to repeat

**Current picture.** M5 measured, over 432 games, PvZ 52% [44–60] at target, PvT 52% [44–61] undecided,
TvZ 60% [51–67] undecided. M6 re-measured TvZ alone over 378 decided games and got 61% [56–66] pooled —
consistent with M5 — and found the layout split above, which is the actual finding. Nothing is OUTSIDE
60/40.

**The structural finding still holds.** Equal-supply controlled duels (48–54 supply a side, six seeds
each) give **Terran-Zerg 3-3, Protoss beats Terran 6-0, Zerg beats Protoss 6-0**. The unit tables are
fine. Every game is decided by who brings more army supply to the fight. That is why tuning unit stats
never moved anything, and why M5's change to the *shape* of the game (retreat when a wave has lost a
fifth of its starting supply, fall back behind static defence) moved TvZ 24 points without a single
number in `js/data.js` changing.

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
| Tuning anything to move the *pooled* TvZ number | it is an average of one fair map and two unfair ones |

**Known asymmetry, still unexploited.** By ten minutes in TvZ, Terran has finished five techs (siege,
stim, u238, mines, thrusters) and Zerg has finished none. Zerg's minerals and gas are anti-correlated
early — 470 minerals with 32 gas, then 114 minerals with 359 gas — so the flat research gate almost never
opens for it. The obvious fix (a cost-aware gate) backfired because it helped Terran more, but the
observation still looks like a real lever if approached from the Zerg side only.

**How to A/B without wasting an hour.** Balance runs read `js/*.js` from disk when each child process
starts, so editing the working tree mid-run silently mixes two versions — that happened once in M3 and
cost a full run. Snapshot instead: copy `js/{data,map,sim,game,combat,abilities,commands,ai}.js` plus
`test/balance.js` into a scratch directory outside OneDrive and run the harness from there, which also
lets several variants run at once. A full three-matchup 66-seed run is 1188 games and about two hours at
`--jobs=12` on sixteen cores; one matchup is about forty minutes. **Run it in a way that survives the
session ending** — the M6 baseline run was killed two thirds of the way through and only survived because
the harness happens to run matchup-major, so TvZ was already complete.

## Known issues and rough edges

- **TvZ is even on temple and 67/33 on bloodbath and valley.** The pooled 61% is not the problem; the
  spread is. See task 1's answer above.
- **The AI leaves production buildings idle about an eighth of the time** with the money to fill them
  banked, measured by `test/aiaudit.js`. Halved in M5, not solved. The composition hold accounts for 7.9%
  of production calls; the money reserve for most of the rest.
- **The AI never fields an advanced caster** and so 28 of the 30 spells never fire. See the note above.
- **The AI is supply blocked about 9% of the time**, still far more than a human. It now gets told.
- **`test/net.js` is timing-sensitive under load.** It failed two checks once during M5, while a
  216-game balance run was saturating every core, and passed five times in a row afterwards. Do not run
  it alongside a balance run and then believe the result.
- **Missions**: all eight resolve and are winnable, and the scripted bot now wins seven of the eight.
  `z3 "Tunnel Vision"` is the exception — it runs to the frame cap. The lead is that it issues **22,354
  commands** where every other mission issues 1,100–4,400, which is a loop rather than a hard fight: the
  nydus block in `test/playtest_scripts.js` (the `Z` script, around the `canalL` line) re-selects idle
  zerglings and right-clicks the canal every 6 frames forever. Look there before looking at the
  objective, which is only "destroy the Terran Command Center". A human should try the missions before
  anyone tunes them.
- **Multiplayer**: rejoin ships a snapshot and is fast. Tested with two clients plus AI, not more.
- **Replay backward-seek** restarts from a checkpoint 30 s back, so it is fast but not instant;
  checkpoints past 40 minutes are thinned to every 60 s.
- **Editor**: the brush is a circle only (rectangle fill is a separate mode). Map size cycles
  96/128/160/192 and the engine accepts 64-256, but the size button is the only way to change it.
- **Art**: three terrain tilesets — badlands, jungle, ice. A fourth is a palette entry in `js/terrain.js`
  plus an id in `TILESET_IDS` in `js/map.js`, and nothing else.
- **Host migration** is not a thing that needs building: the relay picks the first non-dropped human as
  host, so if the host leaves the next player takes over, and mid-game there is no authority to transfer
  because the relay routes everything.
- **Perf has not been measured since the M3 art pass.** This is M6's open task 2 above.
- Stray `node.exe` processes may be left over from the killed balance run. They are idle; nothing writes
  to the log any more.

## How to run everything

```bash
node test/serve.js 8765          # or double-click PLAY.bat; prints LAN URL
node test/features.js            # 87 gameplay checks
node test/determinism.js         # identical runs match; replay reproduces the original
node test/alerts.js              # the four player alerts fire when they should, never when they should not
node test/version.js             # build stamp: a save from another build is refused
node test/observer.js            # replay observer: vision switching, production overlay, seeking
node test/snapshot.js            # a restored simulation snapshot re-simulates bit-identically
node test/movement.js            # unreachable goals, wedged units, burrowed units
node test/balance_stats.js       # the statistics behind the balance harness (runs no games)
node test/aiaudit.js             # counts things the AI does that a human never would, incl. per-caster energy
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
node tools/tilesets.js                       # then open the URL it prints; writes assets/tilesets.png
```

Git: the repo is inside OneDrive; commits with the 16 MB of sprites are slow (30-60 s). Run
`git add -A && git commit` in the background if using a tool with a timeout.

## How earlier milestones landed (kept for context)

**M5** fixed what M4 said could not be fixed by tuning: no matchup outside 60/40, TvZ 84% → 60%, by
making a lost fight survivable rather than by changing a unit stat. It also halved idle production, made
rejoin ship a snapshot, added the jungle tileset, and ran play-test round four.

**M4** added confidence intervals to the balance harness — the most valuable thing in it, because it
retro-invalidated several M3 conclusions — fixed three classes of never-completing order, added
simulation snapshots, building damage states and the AI audit tool. It failed to fix TvZ by tuning and
said so, which is what let M5 fix it another way.

**M3** reworked AI macro, drove all eight missions through the UI for the first time, added the build
stamp on saves and replays, editor quality of life, an infantry art pass and observer/replay controls.
Its task 1 commit message overstates its result: it quotes a seeds 1–6 run only. Over 216 games M3 traded
one established failure (PvZ) for another (TvZ).

The lesson in that sequence is worth keeping: **a milestone that reports a negative result accurately is
worth more than one that reports a number from too few games.** M6 task 1 is the same shape — the answer
is "the pooled number is not the problem", and that is more useful than a number to tune against.
