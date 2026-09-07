# HANDOFF — Brood War Remake

Read this first in a fresh chat. It says where the build is, how it is wired, what must never break, and
exactly what is left to do.

## Kickoff for the next chat

Open a chat in `Default Project/broodwar/` and paste:

> Read HANDOFF.md and README.md, run the tests, then work through the "M8 — what to do next" section in
> order. Keep the determinism tests green after every change, commit at each item, and update HANDOFF.md
> at the end.

## Status (2026-09-07, M7 complete)

**M7 answered its first question, fixed the largest structural bug in the AI, and broke a matchup doing
it.** All three tasks are done. The one-line summary a reader needs before touching anything:

> **Terran vs Zerg is 77% [73-81] over 376 decided games — OUTSIDE 60/40, the first established failure
> since M4.** One commit did all of it: M7's build-order fix is worth +13 points to Terran at p = 0.000
> over 371 paired seeds. That fix is not a tuning choice and is not a mistake — the build order was
> throwing away its own steps and amputating its own tech tree — so it is kept, and this is the problem
> M8 inherits. Read "The build order was a queue" below before changing a number.

| commit | what |
|---|---|
| `91e4195` | M7 task 2 (part) — the build order was a queue, and it was eating the tech tree |
| `a23d92b` | M7 task 2 (rest) — the caster tech earlier, and templars that live to cast |
| `aaa716e` | M7 task 3 (part) — the composition hold held buildings it had no business holding |
| `07836c6` | M7 task 3 (rest) — two thirds of "idle production" was never a defect |
| `2802b31` | M7 task 1 — the Zerg-side answer, and what it was worth |
| this commit | M7 close-out: this handoff |

## Task 1's answer: PvT and PvZ were fine all along

M6 left three matchups in three different states and could only vouch for one of them. Re-measured on
the M6 shipping code, 66 seeds, three layouts, both sides, 396 games each:

| matchup | rate | interval | verdict |
|---|---|---|---|
| PvT | P 54% | [49-59] over 388 decided | **at target** |
| PvZ | P 49% | [45-54] over 390 decided | **at target** |
| TvZ | T 64% | [59-69] over 382 decided | undecided |

So the M6 pathfinder repair, which moved TvZ six points, did not disturb the other two. That was worth
knowing before reasoning about anything else, and it is why the rest of M7 could treat TvZ as the only
open matchup. `C:\Users\zacsl\bw-scratch\m7-head\pvt-pvz.log` is the run.

## The build order was a queue, and it was eating the tech tree

This is the finding of the milestone and the cause of the balance move, so it is worth the space.

`test/casters.js` is new and asks the caster question directly rather than inferring it from unspent
energy: per race, when each enabling building finished, when the first caster of that kind existed, how
long it lived, and every cast that happened. On the M6 shipping code, over nine games:

- **Advanced casters fielded: 3 of 11 kinds. Casting: one** (the comsat).
- **23 of the 28 spell abilities never fired once.** The five that did were stim, burrow, scanner sweep,
  spider mines and one siege.
- **Templar archives were finished in none of six Protoss games.**

That last line kills M6's stated cause. M6 blamed the archon-merge rule for the missing storms — it
merged any two templars under 60 energy while storm was unresearched, and a fresh templar starts at 50,
so every templar was merged on sight. That is a real bug and it is fixed. It cannot have been the
operative cause, because there were never any templars.

The operative cause was in `AI.script()`. The build order ran strictly at the head: a step that could
not be started froze every step behind it, and after 200 seconds a give-up timer threw the step away for
good. Over nine games that abandoned **29 steps**, and 13 of them were abandoned at a moment when the
only thing blocking was the AI's own "do not start five things at once" throttle — a condition that
resolves by itself. Worse, the steps that needed an abandoned one were then abandoned in turn on `req`:
one citadel dropped at step 8 cost the archives at step 13 and everything behind them.

A human whose next building is unaffordable starts the one after it. The order is scanned forward now.
`scriptIdx` still means "the first thing we still owe" and the timer only runs when nothing in reach can
be started at all. Dropped steps fell from 29 to 16, and the buildings arrived:

| enabling building | M6 shipping | after the fix |
|---|---|---|
| templar archives | never, 0 of 6 games | 11:41, 1 of 6 |
| defiler mound | never, 0 of 6 | 11:43, 1 of 6 |
| queen's nest | 14:23, 4 of 6 | 7:29, 4 of 6 |
| academy | 5:13, 5 of 6 | 3:43, 3 of 6 |

### And it moved Terran vs Zerg outside 60/40

Three matchups, 66 seeds, both sides, 1188 games, paired against the M6 shipping logs on the same
seeds. (This is the task 2 run; measured again with task 3 on top it is +13 at p = 0.000, and the
shipping figure in the M8 section is the one to quote.)

| matchup | before | after | paired | verdict |
|---|---|---|---|---|
| **TvZ** | 64% [59-69] | **77% [72-81]** | 104 to T, 59 away of 370 | **p = 0.001, MOVED** |
| PvT | 54% [49-59] | 52% [47-57] | 89 to P, 99 away of 380 | p = 0.512, nothing |
| PvZ | 49% [45-54] | 46% [41-51] | 79 to P, 92 away of 388 | p = 0.359, nothing |

The mechanism is not mysterious and it is the same asymmetry M6 wrote down. Terran's script was the one
being dropped most — `engineering_bay`, a second `factory`, `comsat_station` and `armory` were the
repeat casualties, which is to say Terran was losing its **infantry upgrades** and half its production.
Give those back and a bio ball that already heals gets meaningfully stronger. Zerg's script was being
dropped too, but what Zerg gets back is a defiler mound at 11:43 and a queen's nest at 7:29 — buildings
whose units it never trains and whose spells it never casts. **The same fix pays Terran in upgrades and
pays Zerg in buildings it has no time to use.**

`C:\Users\zacsl\bw-scratch\m7-casters\after.log` is the run.

### The Zerg-side answer, and what it was worth

M6's handoff named this as task 1's real work: Zerg's answer to healed bio is Dark Swarm and the AI
never casts it. Three changes were tried, first as a bundle and then split, because the bundle measured
five points the wrong way and a bundle cannot say which third did it.

**Kept, and measured as exactly neutral (p = 1.000, 39 flips to T and 40 away of 365 paired seeds):**

- **The Defiler Mound required a Hive. In Brood War it is a Lair-tech building.** That is a fidelity bug
  against a README that claims BW numbers, not a balance knob, and it had put Zerg's only answer to
  healed bio four minutes past the end of an average AI game. It is `req: ['lair']` now, and it sits at
  supply 32 in the Zerg script where a Lair-tech building belongs.
- **Dark Swarm was gated on `this.state === 'attack'`.** The cluster test beside it already says "our
  ground units are being shot at", which is the defensive case, so the gate only ever removed the
  situation the spell exists for -- and a Zerg AI losing a game spends it in `defend`.

**Reverted: a cost-aware research gate for Zerg only.** M4 tried it for every race and took TvZ to 97%;
M6's handoff said it "still looks like a real lever if approached from the Zerg side only". It is not.
Zerg alone is worth **+5 points to Terran** over 360 paired seeds. Zerg buys upgrades it does not live
to use. The flat 200/150 gate stays.

**So Zerg has no answer that could be found this milestone.** The mound arrives at 8:04 instead of never
and Dark Swarm still does not fire once in nine games, because the defiler is never *trained*: it costs
50/150 and competes with a lurker morph at 50/100, and `AI_COMP` is a supply-share ratio with no notion
of a gas budget at all. That is the thread M8 picks up.

## Task 3's answer: two thirds of "idle production" was never a defect

`test/aiaudit.js` has reported idle production buildings since M4 and every milestone since has improved
it without solving it: 203.1 a minute in M4, 105.7 in M5, 86.7 in M6. M7 asked the question of each idle
building on its own instead of once of the player — an idle starport with 400 minerals and no gas is
"cannot afford", even though a marine was affordable at a barracks somewhere else. Same nine games, same
counter, on the M6 shipping code and on M7's:

| | M6 shipping | M7 |
|---|---|---|
| idle production buildings per minute | 86.7 | 114.0 |
| only makes workers, and the AI has enough | 66% | 71% |
| saving for a building | 12% | 12% |
| cannot afford anything this building makes | 8% | 7% |
| composition hold | 7% | 5% |
| unexplained | 5% | 4% |
| supply blocked | 3% | 1% |
| ...of which the money was there to fill | 55.8 | 74.9 |

**Two thirds of the number is a saturated town hall.** A Command Center that has stopped making SCVs
because the AI has enough SCVs is `economy()` working, and it has been counted as a macro sin since M4.
The genuine part is about 30 a minute on both builds and it did not move this milestone. Do not quote
the headline number against M4's 203.1 as progress without saying which part of it is which.

Two real defects were found and fixed on the way:

- **The composition hold stopped every production building, not just the ones that could build the held
  unit.** A Protoss saving eight seconds for a dragoon left its robotics facility and stargate idle too.
  It holds per producer now; for Zerg it still holds everything, which is right, because larva is the
  shared resource being saved.
- **The production loop queued at most one of each unit per think.** A Terran with six idle barracks
  needed six thinks — eight seconds — to fill them. It keeps training now while something can still be
  trained, re-scoring the unit it just queued so the composition ratios still decide the order.

## M8 — what to do next

### 1. Terran vs Zerg is outside 60/40 and the cause is measured

**TvZ is 77% [73-81] over 376 decided games.** The full chain, all 66 seeds, three layouts, both sides,
each row paired against the one above it on identical seeds:

| code | TvZ | paired against the row above | verdict |
|---|---|---|---|
| M6 as shipped, `c494be6` | 64% [59-69] | -- | undecided |
| M7 tasks 2+3, `07836c6` | **77% [73-81]** | 104 to T, 56 away of 371 | **p = 0.000, MOVED** |
| + the Zerg research gate | 83% [78-86] | 72 to T, 53 away of 360 | p = 0.107, reverted anyway |
| M7 as shipped, `2802b31` | **77% [73-81]** | 39 to T, 40 away of 365 | p = 1.000, neutral |

PvT and PvZ were measured on the M6 code and were at target; they were re-measured on M7 task 2 and
still are (52% [47-57] and 46% [41-51], both p > 0.35 against their own baselines). **TvZ is the only
matchup out of band, and every point of the move is attributable to one commit, `91e4195`.**

Three things are worth saying before anyone starts:

- **Do not revert `AI.script()` to fix the number.** A build order that abandons its own steps and
  amputates its own tech tree is a bug, in the same way that a medic that does not heal and an A* closed
  set that does not close were bugs. M6 kept both of those and reported what they cost. The precedent is
  deliberate and it is the reason the balance figures in this project can be trusted.
- **Do not tune `js/data.js`.** The table of things already tried is below, and it is now four
  milestones long.
- **The lever is what Zerg does with fifteen minutes, not what a hydralisk costs.** Every change that
  has ever moved this matchup has been structural: how armies retreat (M5, 24 points), how they path
  (M6, 6 points), what the build order actually builds (M7, 13 points). Nothing in `js/data.js` has ever
  moved it at all.

The one thing M7 would try next, if it had another run in it: **the fix gave both sides their build
order back, and only Terran's build order contains its army's upgrades.** Terran's engineering bay and
armory drive `infW`/`infA`/`vehW`/`vehA` on a bio ball that already heals. Zerg's equivalent -- the
evolution chamber at script step 9, driving `carapace` and `missW` -- is built, but `AI_RESEARCH.Z`
spends its early gate on `metabolic`, `flyW` and `lurker_aspect` first, and the flat 200/150 gate then
almost never opens again (see the known asymmetry below). So the asymmetry may not be "Terran got more
buildings" at all; it may be "both got their buildings and only one of them converts buildings into
upgrades". That is checkable in an hour with `test/diag.js` before anyone spends forty minutes on a
balance run: count finished upgrades per side at ten minutes, before and after `91e4195`.

### 2. Games end at 15.9 minutes, and that is why no caster ever matters

This has been on the list since M4 as "the AI never fields an advanced caster" and M7 has taken it as
far as the scripts can take it. The scripts are fixed; the buildings arrive; the casters still do not.
The numbers that say why, over nine games:

- The enabling buildings now finish at **8:00 to 12:00** — in **one to four games of six**.
- The units are still barely trained. A defiler first exists at 15:18 in one game of six, with 57
  caster-seconds, and never reaches the 100 energy Dark Swarm costs.
- Zerg's gas goes to lurkers (50/100 a morph) and mutalisks (100/100) long before a defiler (50/150).
  `AI_COMP` has no notion of a gas budget; it is a supply-share ratio and gas is invisible to it.

So the question has changed shape. It is no longer "why does the AI not build the tech" — it does now.
It is **"why is an AI-vs-AI game only 15.9 minutes long, and should it be?"** A game that ended at 25
minutes would let every one of the 28 unused spells matter, and it would change what balance even means
here. That is a bigger and more interesting question than the one it replaces, and it is the first thing
in this project where the right answer might be to change the harness rather than the AI.

If the answer turns out to be "the games are the right length", then the honest next step is a gas-aware
`AI_COMP`, so a defiler is not competing with four lurkers for the same 150 gas.

### 3. The genuine 30-a-minute of idle production

With the town halls named and set aside, the remaining causes are small and specific. The largest is
"saving for a building" at 12%, which is `afford()` holding every mineral once 40% of the target is
banked. That is a defensible rule — a human does stop making units to afford an expansion — and it has
already been tuned twice (a quarter was too eager, 40% is the current value). Before touching it, decide
whether 30 idle-building-seconds a minute across two players is actually a defect at all. It may not be,
in which case the honest move is to write that down and take the metric off the list.

### 4. `test/net.js` phase 3 times out on a loaded machine

Phase 3 (rejoin and catch up) gets a 120-second wall-clock budget where every other phase gets 240. It
failed once during M7 while a twelve-job balance run was saturating the machine, with both clients
healthy and progressing — 18876 of a 19203-frame target when the budget ran out. The assertion that
rejoin is *fast* is a separate check that passed (`inbox` under 100 batches, not a replay from frame 0),
so the 120-second budget is measuring the machine rather than the code. On an unloaded machine it passes
all eleven checks, including phase 4 detecting its injected divergence at exactly 19248/19248. Either
raise the budget to 240 to match the others, or say why phase 3 deserves a tighter one — but do not
spend an afternoon looking for a desync, which is what M5 did with the same symptom.

## Architecture map

| File | Role |
|---|---|
| `js/data.js` | All unit/building/upgrade/tech/ability tables (BW numbers, frames at 24/s, tiles, px/frame). |
| `js/map.js` | `MapCodec` (run-length codec for custom maps), `MAP_LAYOUTS`, `TILESET_IDS`/`TILESET_NAMES`, `GameMap` (terrain, cliffs, ramps, resources, creep, psi, placement, `generateCustom` for editor maps), `Pathfinder` (A*, returns a **best-effort partial path**, never fails). |
| `js/sim.js` | `Player`, `Unit` (orders state machine, movement with turn/accel, gathering, building, combat helpers). `TURN`/`ACCEL` and `EQUIV` tables live here. |
| `js/game.js` | `G`: init, spatial hash (`near`, `nearEach`), vision/detection, spawning/killing, production, supply, damage, victory, tick loop. Also `ALERTS`, `G.tickAlerts` and `G.supplyRefused` — the player-facing alerts, run once a second. |
| `js/combat.js` | Weapon firing, splash, glaive/line, projectiles, interceptor/scarab launch. |
| `js/abilities.js` | Spells, fields (storm/swarm/etc.), auto-casts (`medicAuto`, `batteryAuto`), interceptor/scarab/dock behaviours, infest. `cast()` is the choke point every finished spell goes through; `test/casters.js` counts there. |
| `js/commands.js` | `RNG`, `G.rand`, `G.stateHash`, command packers/dispatcher (`CMD`), wrappers that intercept every player action, `G.exec`, cheats, `Replay`. Loaded after abilities.js. |
| `js/ai.js` | Computer players: `AI_SCRIPTS` (build orders, **scanned forward, not run as a queue**), `AI_COMP` (supply-share ratios, gas-blind), `AI_RESEARCH`, macro, money reservation, production, army waves, scouting, drops, micro. |
| `js/missions.js` | Eight scenarios, the mission runner (fallback victory, score line) and helpers (`G.hallOf`, `G.givePlayer`, `G.placeDone`). |
| `js/snapshot.js` | Simulation snapshots: reflective capture and restore of the whole sim state, used for replay seeking and for rejoin. Reflective on purpose — a hand-written field list would silently desync the first time someone added a field. `s.gone` carries the reaped-but-referenced corpses. |
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
7. **Browser pane quirk.** The desktop app's browser pane throttles `requestAnimationFrame` — to about
   three frames a second, so 160 frames takes over 45 seconds and rAF is unusable for pacing anything.
   The sim runs on `setInterval` in `UI.simStep`; keep it that way.
8. **Nothing in the sim may hold a reference the snapshot cannot resolve.** `G.byId` never forgets a
   unit and `G.units` is reaped once a second, so the two disagree by design; `Snapshot.take` closes the
   gap with `s.gone`. If you add a field that can point at a unit, it is already covered — but if you
   add a *container* the reflective walk does not reach, it is not.

## Measuring things

### Performance

| metric | M2 baseline | M6 | target | |
|---|---|---|---|---|
| sim tick mean | 2.75 ms | 2.89 ms | under 8 ms | pass |
| sim tick p95 | 5.64 ms | 6.03 ms | — | |
| render median, 1080p, 290 units drawn | 3.7 ms | 1.60 ms | under 6 ms | pass |
| render median, 1080p, 491 units drawn | — | 2.30 ms | under 6 ms | pass |

Not re-measured in M7; nothing M7 changed runs per unit or per frame. `AI.script()` walks `G.units` once
more per think than it used to, which is once every 32 frames per AI.

`node test/perf.js 600 4 temple --sustain` for the simulation; `node test/perf_render.js` then open the
URL it prints for the draw pass. **Pace the draws.** Drawing in a tight loop outruns the compositor and
every third frame blocks on the GPU queue, which reports 6.08 ms mean and a 15.8 ms p95 for a pass that
costs 2.3 ms.

### Balance

Runs read `js/*.js` from disk when each child process starts, so editing the working tree mid-run
silently mixes two versions — that happened once in M3 and cost a full run. **Snapshot instead**: copy
`js/{data,map,sim,game,combat,abilities,commands,ai}.js` plus `test/balance.js` into a scratch directory
outside OneDrive and run the harness from there, which also lets several variants run at once. One
matchup at 66 seeds is 396 games and about forty minutes at `--jobs=12` on sixteen cores; all three is
1188 games and about ninety.

**Run it so it survives the session ending.** `Start-Process -WindowStyle Hidden -RedirectStandardOutput`
detaches it from the tool harness entirely.

**A/B on identical seeds, not two fresh matrices.** `node test/balance_ab.js before.log after.log
[--matchup=TZ] [--race=T]` scores both logs the same way and counts the games that flipped (McNemar).
Same seeds means the same maps and the same openings, so a pair differs only by the change. It reads
any balance run's stdout, and it filters by matchup, so one three-matchup log is three A/B inputs.

Logs kept, all 66 seeds, three layouts, both sides:

| log | code | matchups |
|---|---|---|
| `C:\Users\zacsl\bw-scratch\m6-base\baseline.log` | M5 as shipped, `f6d4229` | TZ |
| `C:\Users\zacsl\bw-scratch\m6-head\head.log` | M6 as shipped, `0f87106` | TZ |
| `C:\Users\zacsl\bw-scratch\m7-head\pvt-pvz.log` | M6 as shipped, `c494be6` | TP, ZP |
| `C:\Users\zacsl\bw-scratch\m7-casters\after.log` | M7 task 2, `a23d92b` | TZ, TP, ZP |
| `C:\Users\zacsl\bw-scratch\m7-head2\tvz.log` | M7 tasks 2+3, `07836c6` | TZ |
| `C:\Users\zacsl\bw-scratch\m7-zerg\tvz.log` | M7 with the Zerg-side answer | TZ |

### What not to repeat

Each was a full run, most 216 games or more, all zero or negative:

| tried | result |
|---|---|
| Terran comp off marines (6 to 4) onto tanks (4 to 5) | TvZ unchanged at 80% |
| More Zerg Lurkers (morph ratio 1.5 to 0.8) | TvZ unchanged at 79% |
| Zerg drones to army earlier (ramp from 16 to 12 workers) | TvZ 91%, much worse |
| Zerg early sunkens on a supply curve | TvZ 90%, much worse |
| Relaxing the base-count floor for Zerg only | TvZ 65% but PvZ collapses to 11% |
| Earlier Protoss gas | no change at all (M2's handoff recommended this) |
| Earlier Psionic Storm, in the script and the research order | no change at all — and M7 explains why: the archives were never built |
| Earlier Lurkers in the research order | no change |
| More Zerg macro hatcheries | larvae but no minerals |
| Cost-aware research gate, all races | helps Terran more; TvZ 97% |
| Cost-aware research gate, Zerg only | +5 points to Terran over 360 paired seeds (M7) |
| Defiler Mound earlier, so Zerg can answer bio | neutral, p = 1.000 -- the mound gets built and the defiler never does |
| Gas vs mineral worker rebalancing | worse across the board |
| Reacting to a sighted push rather than one that landed | no improvement |
| Steeper or gentler Zerg drone ramps than the committed one | both worse |
| Retreat on 35% of units lost | never fired: 0 retreats in 12 games |
| Retreat at 0.55 or 0.7 of starting wave supply | both worse than 0.8 |
| Tuning anything to move the *pooled* TvZ number | all three layouts are Terran-favoured; there is no fair one to average against |

**Known asymmetry.** By ten minutes in TvZ, Terran has finished five techs (siege, stim, u238, mines,
thrusters) and Zerg has finished none. Zerg's minerals and gas are anti-correlated early — 470 minerals
with 32 gas, then 114 minerals with 359 gas — so a flat research gate almost never opens for it. M4's
cost-aware gate backfired because it applied to every race and helped Terran more. M7 tried it for Zerg
only; it is worth +5 points to Terran over 360 paired seeds, and is
reverted. Zerg buys upgrades it does not live to use. Treat this lever as closed.

## Known issues and rough edges

- **Terran vs Zerg is 77% [73-81] over 376 decided games**, OUTSIDE 60/40, the first established failure since M4. PvT 54% [49-59] and PvZ 49% [45-54] are at target.
- **The AI casts 5 of 28 spell abilities.** The tech buildings arrive now; the units do not get trained
  and the games end first. `node test/casters.js` is the measurement.
- **The AI leaves production buildings idle**, 114 a minute over both players — but two thirds of that
  is saturated town halls and is not a defect. See task 3 above.
- **The AI is supply blocked 9-12% of the time**, unchanged in character since M4.
- **Missions**: all eight resolve, are winnable, and the scripted bot wins all eight, with zero JS errors
  and zero stuck units. A human should still try them before anyone tunes them.
- **Multiplayer**: rejoin ships a snapshot and is fast. Tested with two clients plus AI, not more.
  `test/net.js` phase 3 has a 120-second budget that a loaded machine can miss; see M8 task 4.
- **Replay backward-seek** restarts from a checkpoint 30 s back, so it is fast but not instant;
  checkpoints past 40 minutes are thinned to every 60 s.
- **Editor**: the brush is a circle only (rectangle fill is a separate mode). Map size cycles
  96/128/160/192 and the engine accepts 64-256, but the size button is the only way to change it.
- **Art**: three terrain tilesets — badlands, jungle, ice. A fourth is a palette entry in `js/terrain.js`
  plus an id in `TILESET_IDS` in `js/map.js`, and nothing else.
- **Host migration** is not a thing that needs building: the relay picks the first non-dropped human as
  host, so if the host leaves the next player takes over, and mid-game there is no authority to transfer
  because the relay routes everything.
- **Nothing distinguishes "not told" from "told and ignored".** Neither the alert pass nor
  `test/aiaudit.js` can tell whether the player alerts help.

## How to run everything

```bash
node test/serve.js 8765          # or double-click PLAY.bat; prints LAN URL
node test/features.js            # 87 gameplay checks
node test/determinism.js         # identical runs match; replay reproduces the original
node test/alerts.js              # the four player alerts fire when they should, never when they should not
node test/version.js             # build stamp: a save from another build is refused
node test/observer.js            # replay observer: vision switching, production overlay, seeking
node test/snapshot.js            # a restored simulation snapshot re-simulates bit-identically
node test/rejoindiag.js [frames] # splits a rejoin into round-trip and fresh-context, to isolate a desync
node test/movement.js            # unreachable goals, wedged units, burrowed units
node test/balance_stats.js       # the statistics behind the balance harness (runs no games)
node test/balance_ab.js a.log b.log --matchup=TZ --race=T   # paired A/B of two balance logs (runs no games)
node test/aiaudit.js             # things the AI does that a human never would, and why each idle building is idle
node test/casters.js             # which spells the AI ever casts, and when the tech that unlocks them lands
node test/micro.js               # prints a controlled duel frame by frame (diagnostic, not pass/fail)
node test/playtest.js all        # scripted human drives TvZ, PvT, ZvP through the UI layer
node test/playtest.js missions   # the same scripted human plays all eight campaign missions
node test/net.js                 # two lockstep clients + AI: hashes, drop, rejoin, desync detection
node test/missions.js            # every campaign mission: setup, placement, objective resolves
node test/editor.js              # custom map, mirrored 4-player map, undo/redo, AI game, LAN game
node test/balance.js --seeds=1,2,3,4,5,6     # win-rate matrix (about 9 minutes) - see the variance warning
node test/perf.js 600 4 temple --sustain     # 4-player 200-supply battle timings
node test/perf_render.js                     # the draw pass at 1080p; open the URL it prints
node test/smoke.js 16000 TZ temple           # single AI-vs-AI game
node test/diag.js PZ 21600 temple            # AI progression dump
node test/diverge.js                         # finds the first non-deterministic frame
node tools/bake.js                           # after editing tools/models.js
node tools/tilesets.js                       # then open the URL it prints; writes assets/tilesets.png
```

Git: the repo is inside OneDrive; commits with the 16 MB of sprites are slow (30-60 s). Run
`git add -A && git commit` in the background if using a tool with a timeout.

## How earlier milestones landed (kept for context)

**M7** answered M6's open question — PvT and PvZ were at target all along — and then found the largest
structural bug in the AI by asking the caster question directly instead of inferring it: the build order
was run as a queue, threw away 29 of its own steps over nine games, and amputated its own tech tree, so
templar archives were finished in none of six Protoss games and 23 of 28 spells never fired. Fixing it
cost twelve points of Terran vs Zerg at p = 0.001, because the steps Terran was losing were its infantry
upgrades and the steps Zerg was losing were buildings it has no time to use. It also found that two
thirds of the idle-production figure three milestones have chased is a saturated Command Center.

**M6** spent the energy the AI was sitting on (26% → 11% of caster-seconds full), told the player what is
wrong with four alerts, found that the missions were fine and the scripted bot was not (4 of 8 → 7 of 8),
added the ice tileset, re-measured performance and built the render harness that half of it never had.
Its close-out was worth as much as the milestone: playing one game in the pane found that the console was
41 copies of one sentence, and taking `test/net.js`'s intermittent failure seriously found that the A*
closed set had been dead since the 256th search of every game and that snapshots dropped the corpses the
AI still reads. Fixing the first of those also won `z3`, the last mission, so the bot is 8 of 8.

**M5** fixed what M4 said could not be fixed by tuning: no matchup outside 60/40, TvZ 84% → 60%, by
making a lost fight survivable rather than by changing a unit stat. It also halved idle production, made
rejoin ship a snapshot, added the jungle tileset, and ran play-test round four.

**M4** added confidence intervals to the balance harness — the most valuable thing in it, because it
retro-invalidated several M3 conclusions — fixed three classes of never-completing order, added
simulation snapshots, building damage states and the AI audit tool. It failed to fix TvZ by tuning and
said so, which is what let M5 fix it another way.

**M3** reworked AI macro, drove all eight missions through the UI for the first time, added the build
stamp on saves and replays, editor quality of life, an infantry art pass and observer/replay controls.
Its task 1 commit message overstates its result: it quotes a seeds 1-6 run only. Over 216 games M3 traded
one established failure (PvZ) for another (TvZ).

The lesson in that sequence is worth keeping, and M7 is the fifth instance of it: **a milestone that
reports a negative result accurately is worth more than one that reports a number from too few games.**
M7's is the sharpest yet, because the negative result and the bug fix are the same change.
