# HANDOFF — Brood War Remake

Read this first in a fresh chat. It says where the build is, how it is wired, what must never break, and
exactly what is left to do.

## Kickoff for the next chat

Open a chat in `Default Project/broodwar/` and paste:

> Read HANDOFF.md and README.md, run the tests, then work through the "M7 — what to do next" section in
> order. Keep the determinism tests green after every change, commit at each item, and update HANDOFF.md
> at the end.

## Status (2026-09-07, at commit 67b3785 plus this close-out)

**M6 is complete.** All six tasks are done and the three items M6 left open are closed. Along the way the
close-out found and fixed four real bugs, two of which had nothing to do with the milestone, and produced
one result that M7 has to deal with:

> **Terran vs Zerg is 64% [59-69] on the shipping code — undecided, not an established failure.** Two of
> M6's bug fixes moved it hard in opposite directions and very nearly cancelled: medics that heal are
> worth +9 points to Terran, a repaired A* closed set is worth -6. Read "The balance moved twice" below
> before touching a number, because the intermediate figures in the commit messages are real but stale.

| commit | what |
|---|---|
| `032b975` | M6 task 2 — spend the energy |
| `e5f59f1` | M6 task 3 — tell the player what is wrong |
| `f44e63e` | M6 task 4 — missions, 7 of 8 won |
| `43776b9` | M6 task 5 (part) — a third tileset |
| `1691fd0` | M6 close-out with task 1's answer |
| `acd26c8` | M6 task 5 (rest) — perf re-measured, and a harness for the render half |
| `734201f` | M6 task 6 (part) — the supply line drowned the console |
| `0f87106` | two silent bugs behind the intermittent `test/net.js` rejoin failure |
| `8a2a488` | M6 task 6 (part) — at 200/200 the game asked for supply depots |
| `026a894` | `test/snapshot.js` — cover the case a rejoin actually exercises |
| `d06293e` | M6 task 6 — play-test round five |
| `67b3785` | the A* fix won the last mission: the campaign bot is 8 of 8 |
| this commit | M6 close-out: the shipping-code balance run, this handoff |

## The balance moved twice, in opposite directions, and nearly cancelled

M6 task 2's acceptance was "the share of wasted caster energy roughly halves **and balance does not
move**". The first half was met comfortably (26% → 11%). The second half failed — and then a bug fix
found during the close-out undid most of it. Four runs of the same 66 seeds, three layouts, both sides,
396 games each:

| code | bloodbath | temple | valley | pooled |
|---|---|---|---|---|
| M5 as shipped, `f6d4229` | 67% [59-75] | 49% [40-57] | 67% [59-75] | **61% [56-66]** n=378 |
| M6 with `medicAuto` reverted | 67% [59-75] | 49% [40-57] | 67% [58-75] | **61% [56-66]** n=377 |
| M6 as measured, `1691fd0` | 73% [65-80] | 67% [58-74] | 69% [61-77] | **70% [65-74]** n=375 |
| **shipping, `0f87106`** | 68% [59-75] | 59% [50-67] | 66% [57-74] | **64% [59-69]** n=382 |

And the paired comparisons between consecutive rows, which is what actually decides anything:

| change | pooled | paired | verdict |
|---|---|---|---|
| everything in M6 except `medicAuto` | 61% → 61% | 1 flip each way of 376 | **p = 1.000**, nothing |
| `medicAuto` healing on the move | 61% → 70% | 53 to T, 25 away of 360 | **p = 0.002**, moved |
| the A* closed set repair | 70% → 64% | 55 to T, 80 away of 364 | **p = 0.038**, moved back |
| **M5 as shipped → M6 as shipped** | **61% → 64%** | **74 to T, 64 away of 366** | **p = 0.444, no detectable shift** |

So the honest summary of M6's effect on Terran vs Zerg is **nothing measurable**, arrived at by two large
changes that happened to be worth +9 and -6. Neither is a tuning choice and neither should be undone:
medics that do not heal and an A* closed set that does not close were both bugs.

**64% [59-69] is undecided, not a failure.** The harness's rule is that "outside" needs the whole
interval past the line, and this one straddles it. It also means no amount of further seeds will settle
it cheaply: a rate sitting three points off the boundary is exactly where the interval refuses to
separate.

`node test/balance_ab.js before.log after.log` prints all of the above. It is the tool the M6 handoff
asked for, and it earned its keep here — comparing two Wilson intervals over ~375 games a side would not
have called any of these three shifts, and counting the games that flipped called all three.

**The intermediate numbers in the commit messages are real but stale.** `734201f` and the round-five log
quote 70%; that was true of the code at `1691fd0` and is not true of anything that ships. This table is
the current picture.

### Why each of the two changes moved it

**Medics, +9.** `medicAuto` only healed a unit it was already touching; out of touch range it did nothing
unless the medic happened to be idle. It now walks the last few tiles, heals, and resumes its order.
Medics were **76% of all the energy the AI never spent**. The isolation run is unambiguous: everything
else M6 did — comsats spending a full bar, the four alerts, the ice tileset — moved two games out of 376.
So Terran's bio ball had been balanced against by an accident, and the AI's Zerg has no answer once the
accident goes away. That is information, not a mistake to undo.

**The pathfinder, -6.** Repairing the A* closed set changes the path every ground unit walks. It helps
Zerg on net, which is not obvious in advance and is worth a moment's thought before assuming the next
pathfinding change is neutral: Zerg fields far more units per unit of supply, so anything that changes
how a large group crosses a map is not symmetric between the races. This is a real effect at p = 0.038,
and it is the clearest evidence in the project so far that **the shape of movement is a balance lever**,
which is the same lesson M5 learned when retreating behind static defence moved TvZ 24 points without a
single number in `js/data.js` changing.

**The map spread narrowed but did not go away.** Temple went 49% → 67% on the medic fix and back to 59%
on the pathfinder fix; the other two layouts sit at 66-68%. So temple is still the least Terran-favoured
layout by about eight points, which is a weaker version of the M6 finding rather than a refutation of it.

**Do not tune unit stats.** Every attempt in M3, M4 and M5 to move this matchup from `js/data.js`
produced zero or negative results, and the structural finding behind that has not changed: equal-supply
duels are Terran-Zerg 3-3, and games are decided by who brings more army supply to the fight.

### PvZ and PvT have not been measured since M5

The pathfinder fix changes every game, so M5's PvZ 52% and PvT 52% are as stale as the TvZ numbers were.
Only TvZ was re-run, because it was the matchup under investigation. **Re-running the other two is M7's
first job** and it is about eighty minutes at `--jobs=12`.

## Four bugs found on the way, all fixed

`test/net.js` now passes all eleven checks, and it passed them **while a twelve-job balance run and the
AI audit were saturating the machine** — which is the reverse of the story M5 recorded about it. Note
phase 4: it reports the divergence it deliberately injects, at frame 19248. Before the fixes it reported
16896, which was not the injected one at all — the clients were already desynced by then, so the check
that proves desync detection works had been passing for the wrong reason.

### 1. The A* closed set stopped working after the 256th search of every game

`Pathfinder` stamps `closed` with the search generation, exactly as it does `stamp`, but `closed` was a
`Uint8Array`. `closed[ci] = gen` stored `gen & 255`, so from generation 256 onward `closed[ci] === gen`
was never true and the closed set silently did nothing. Measured directly: the same eight queries return
identical paths for every starting generation up to 254, and a different path from 255 on — the search
where `gen` first reaches 256.

For an ordinary game that is a quiet cost. Two hundred long queries on temple, run after 300 searches so
the generation is past 256:

| | neighbour tests | time | reached the goal | waypoints |
|---|---|---|---|---|
| `Uint8Array` | 2,137,373 | 165 ms | 195/200 | 1608 |
| `Int32Array` | 1,613,272 | 154 ms | 196/200 | 1604 |

So **25% of the search work was re-expanding nodes already expanded**, for 7% of the wall time. Path
quality barely moves — one more query in two hundred reaches its goal — which is worth knowing, because
it means the fix is a cost fix and a determinism fix, not a "units path better now" fix.

For a rejoining client it is a desync, because it starts at generation 0 with a working closed set while
everyone else is past 256 with a broken one. `closed` is an `Int32Array` now.

**It also won the last mission.** `z3 "Tunnel Vision"` was the one scenario the scripted bot could not
finish, and M6 diagnosed it as a loop: the nydus block in `test/playtest_scripts.js` re-selected idle
zerglings and right-clicked the canal every six frames forever, 22,354 commands where every other mission
issues 1,100-4,400. That diagnosis was right about the symptom and the cause was this bug — the zerglings
could not path to the canal. With the fix z3 wins at frame 19,368 on 2,577 commands; with only this one
change reverted it still runs to the 28,800 cap on exactly 22,354. **The missions are 8 of 8.**

### 2. Snapshots dropped the corpses the simulation still points at

`G.units` is reaped of the dead once a second (`game.js`, `frame % 24 === 0`); **nothing ever deletes
from `G.byId`**. So in a live game a reference to a unit that died a moment ago still resolves, and the
simulation reads them — `AI.think`'s "am I being attacked" test asks `lastHitBy.owner` without asking
whether the attacker is still alive. `Snapshot.restore` rebuilt `byId` from `G.units` alone, `dec()`
turned those references into `null`, and the restored AI stopped defending a base the live one defended.

`take()` now records every id it wrote a reference for and encodes the ones no longer in `G.units` into
`s.gone`. They go back into `byId` only, never into `G.units`, so `G.units` still matches the live game.
Three fields can hold one today (`lastHitBy`, `inside`, `lastRes`) and the fix does not name any of them.

### 3. The supply line drowned the console

Play-test round five, first game: 48 console lines in eight minutes and **41 of them were the same
sentence**. See `PLAYTEST.md` round five. Fixed by giving one condition one voice (`G.supplyRefused`).

## M7 — what to do next

### 1. Re-measure PvZ and PvT, then decide about Terran vs Zerg

TvZ is 64% [59-69] on the shipping code — undecided, and three points off a boundary the interval cannot
cheaply separate from. It is not an emergency. The order worth working in:

- **Run PvZ and PvT on the shipping code first**, because they have not been measured since M5 and the
  pathfinder fix moved TvZ six points. There is no point reasoning about one matchup while the other two
  are unknown. `node test/balance.js --matchups=TP,ZP --seeds=$(seq -s, 1 66) --jobs=12`, about eighty
  minutes, snapshotted as described under "Balance" below.
- **Look at the AI's response to bio, not at unit stats.** The measured mechanism is that Terran's army
  is now worth more supply-for-supply than it was, because the medics attached to it work. Zerg's answer
  to healed bio in the real game is Dark Swarm, and the AI never casts it: M6 measured **zero** Defiler
  caster-seconds across nine games, because `defiler_mound` is step 66 of the Zerg script and games end
  at 15.9 minutes. This is the same finding as "the AI never fields an advanced caster", arrived at from
  the other direction, and it is the first time that gap has had a number attached to it. Moving
  `defiler_mound` earlier in `AI_SCRIPTS` is the first thing to try, and unlike the entries in the "what
  not to repeat" table it is not a tuning change — it is giving Zerg an answer it already has code for.
- **Treat movement as a balance lever.** The pathfinder repair moved TvZ six points toward Zerg without
  touching a unit, an AI script or a map. That is the second time a change to how armies move has moved
  this matchup more than any stat ever has (M5's retreat rule was the first, at 24 points).
- **Do not tune `js/data.js`.** The table of things already tried and their results is below.

### 2. The AI never fields an advanced caster

Unchanged from M6 and now the largest lever in the project, with a price tag on it. Twenty-eight of the
thirty spells have working code, a working autocast in `AI.micro()`, and are never once reached in a
normal-length game. Over nine games: 25 caster-seconds of high templar, 9 of corsair, and **zero** of
defiler, science vessel, arbiter, queen, ghost, battlecruiser and dark archon. Two visible causes in
`js/ai.js`:

- The archon-merge rule (`production()`, the Protoss branch) merges any two high templars with
  `energy < 60` while `psi_storm_tech` is unresearched. A fresh templar starts below that, so every
  templar built before storm finishes is merged on sight and storm never gets cast.
- The buildings that unlock the rest arrive late in `AI_SCRIPTS` — `science_facility` at step 44,
  `defiler_mound` at 66, `arbiter_tribunal` at 60 — and games end at 15.9 minutes.

Zerg's `defiler_mound` at step 66 is the specific one that matters for item 1.

### 3. Idle production, still the largest thing the audit counts

`test/aiaudit.js` over nine games on the shipping code: **86.7 idle production buildings per minute**
summed over both players, down from 105.7 in M5 and 203.1 in M4. Improving without being solved for
three milestones running. The composition hold accounts for 7.9% of production calls; the money reserve
for most of the rest. Everything else the audit counts is now at or near zero except the supply block,
which sits at 9% and has not moved since M4.

## Architecture map

| File | Role |
|---|---|
| `js/data.js` | All unit/building/upgrade/tech/ability tables (BW numbers, frames at 24/s, tiles, px/frame). |
| `js/map.js` | `MapCodec` (run-length codec for custom maps), `MAP_LAYOUTS`, `TILESET_IDS`/`TILESET_NAMES`, `GameMap` (terrain, cliffs, ramps, resources, creep, psi, placement, `generateCustom` for editor maps), `Pathfinder` (A*, returns a **best-effort partial path**, never fails). |
| `js/sim.js` | `Player`, `Unit` (orders state machine, movement with turn/accel, gathering, building, combat helpers). `TURN`/`ACCEL` tables live here. |
| `js/game.js` | `G`: init, spatial hash (`near`, `nearEach`), vision/detection, spawning/killing, production, supply, damage, victory, tick loop. Also `ALERTS`, `G.tickAlerts` and `G.supplyRefused` — the player-facing alerts, run once a second. |
| `js/combat.js` | Weapon firing, splash, glaive/line, projectiles, interceptor/scarab launch. |
| `js/abilities.js` | Spells, fields (storm/swarm/etc.), auto-casts (`medicAuto`, `batteryAuto`), interceptor/scarab/dock behaviours, infest. |
| `js/commands.js` | `RNG`, `G.rand`, `G.stateHash`, command packers/dispatcher (`CMD`), wrappers that intercept every player action, `G.exec`, cheats, `Replay`. Loaded after abilities.js. |
| `js/ai.js` | Computer players: scripts, macro, money reservation, production, research, army waves, scouting, drops, micro. |
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

### Performance (`acd26c8`)

| metric | M2 baseline | M6 | target | |
|---|---|---|---|---|
| sim tick mean | 2.75 ms | 2.89 ms | under 8 ms | pass |
| sim tick p95 | 5.64 ms | 6.03 ms | — | |
| render median, 1080p, 290 units drawn | 3.7 ms | 1.60 ms | under 6 ms | pass |
| render median, 1080p, 491 units drawn | — | 2.30 ms | under 6 ms | pass |

Do not read the render row against M2's 3.7 ms as an improvement: the two were not measured the same way
and the M2 number is not reproducible. What is established is that the M3 art pass, which made infantry
sprites 27% larger, did not put the draw pass anywhere near the line.

`node test/perf.js 600 4 temple --sustain` for the simulation; `node test/perf_render.js` then open the
URL it prints for the draw pass. **Pace the draws.** Drawing in a tight loop outruns the compositor and
every third frame blocks on the GPU queue, which reports 6.08 ms mean and a 15.8 ms p95 for a pass that
costs 2.3 ms. That is what invariant 7's "trust the median" is really about.

### Balance

Runs read `js/*.js` from disk when each child process starts, so editing the working tree mid-run
silently mixes two versions — that happened once in M3 and cost a full run. **Snapshot instead**: copy
`js/{data,map,sim,game,combat,abilities,commands,ai}.js` plus `test/balance.js` into a scratch directory
outside OneDrive and run the harness from there, which also lets several variants run at once. One
matchup at 66 seeds is 396 games and about forty minutes at `--jobs=12` on sixteen cores; all three is
1188 games and about two hours.

**Run it so it survives the session ending.** `Start-Process -WindowStyle Hidden -RedirectStandardOutput`
detaches it from the tool harness entirely; the M6 baseline run was killed two thirds of the way through
and only survived because the harness happens to run matchup-major.

**A/B on identical seeds, not two fresh matrices.** `node test/balance_ab.js before.log after.log` scores
both logs the same way and counts the games that flipped (McNemar). Same seeds means the same maps and
the same openings, so a pair differs only by the change, and the games that did not flip carry no
information. That is what made a 9-point shift callable at p = 0.004 from 375 games a side when the two
Wilson intervals overlap almost entirely.

Logs kept from M6, all TvZ, 66 seeds, three layouts, both sides:

| log | code |
|---|---|
| `C:\Users\zacsl\bw-scratch\m6-base\baseline.log` | M5 as shipped, `f6d4229` |
| `C:\Users\zacsl\bw-scratch\m6-after\after.log` | M6 through `1691fd0` |
| `C:\Users\zacsl\bw-scratch\m6-nomedic\nomedic.log` | the same, with `medicAuto` alone reverted |
| `C:\Users\zacsl\bw-scratch\m6-head\head.log` | `0f87106`, i.e. with the pathfinder fix |

### What not to repeat

Each was a full run, most 216 games, all zero or negative:

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
| Tuning anything to move the *pooled* TvZ number | it used to be an average of one fair map and two unfair ones; after M6 all three are unfair |

**Known asymmetry, still unexploited.** By ten minutes in TvZ, Terran has finished five techs (siege,
stim, u238, mines, thrusters) and Zerg has finished none. Zerg's minerals and gas are anti-correlated
early — 470 minerals with 32 gas, then 114 minerals with 359 gas — so the flat research gate almost never
opens for it. The obvious fix (a cost-aware gate) backfired because it helped Terran more, but the
observation still looks like a real lever if approached from the Zerg side only.

## Known issues and rough edges

- **Terran vs Zerg is 64% [59-69]**, undecided rather than failing, and PvZ/PvT have not been measured
  since M5. See above.
- **The AI never fields an advanced caster** and so 28 of the 30 spells never fire.
- **The AI leaves production buildings idle**, 86.7 a minute over both players with the money to fill
  them banked, measured by `test/aiaudit.js`. Down from 105.7 (M5) and 203.1 (M4).
- **The AI is supply blocked 9% of the time**, unchanged since M4 and still far more than a human. It
  now gets told, which does not help an AI.
- **Missions**: all eight resolve, are winnable, and the scripted bot now wins **all eight**, with zero
  JS errors and zero stuck units. A human should still try them before anyone tunes them.
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
- **Nothing distinguishes "not told" from "told and ignored".** In the round-five game the idle-production
  alert fired three times as the bank grew from 560 to 1948 minerals, which is as often as its 45-second
  cooldown allows. That is the alert working. Neither the alert pass nor `test/aiaudit.js` can tell the
  two apart, so neither can say whether the alerts help.

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
node test/balance_ab.js a.log b.log   # paired A/B of two balance logs (runs no games)
node test/aiaudit.js             # counts things the AI does that a human never would, incl. per-caster energy
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

**M6** spent the energy the AI was sitting on (26% → 11% of caster-seconds full), told the player what is
wrong with four alerts, found that the missions were fine and the scripted bot was not (4 of 8 → 7 of 8),
added the ice tileset, re-measured performance and built the render harness that half of it never had.
Its close-out was worth as much as the milestone: playing one game in the pane found that the console was
41 copies of one sentence, and taking `test/net.js`'s intermittent failure seriously — instead of
believing M5's note that it was load-sensitive — found that the A* closed set had been dead since the
256th search of every game and that snapshots dropped the corpses the AI still reads. Fixing the first of
those also won `z3`, the last mission, so the bot is 8 of 8. On balance it measured that its own medic
fix moved TvZ nine points to Terran and its own pathfinder fix moved it six back, and reported the net —
no detectable shift — rather than either half.

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

The lesson in that sequence is worth keeping, and M6 is the fourth instance of it: **a milestone that
reports a negative result accurately is worth more than one that reports a number from too few games.**
M6's task 1 answer was "the pooled number is not the problem", and its task 2 answer is "we moved it, and
here is the seed-paired evidence" — both more useful than a number to tune against.
