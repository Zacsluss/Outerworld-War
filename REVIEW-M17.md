# REVIEW-M17 — full codebase review

**This file is the review's workspace and its deliverable.** It is committed at the baseline with the
scope, the rules and the map already filled in; the review fills in the two lists at the bottom.

---

## Baseline

| | |
|---|---|
| branch | `m10-overnight` |
| baseline commit | tagged **`pre-review-m17`** — diff against it to see everything the review changed |
| gate at baseline | `node test/all.js` — **69 suites, 0 failed**, ~3 minutes |
| build stamp at baseline | `c4fe57ceca68627b` |
| size | **39,142 lines** — `js/` 17,487, `test/` 19,976, `tools/` 1,679 |
| open to-dos before this review | **none.** `FIXLIST-M14.md` and `FIXLIST-M15.md` are both closed |

Everything the review changes should be measurable against that tag:

```bash
git diff --stat pre-review-m17
```

---

## What this review is for

A total scan for **refactor opportunities, bugs, best-practice violations, and anything a working dev
team would raise in review.** Not a milestone, not a feature. The deliverable is the two numbered
lists at the bottom of this file, plus whatever was safe to fix along the way.

**Read these first, in this order.** They are the accumulated decisions of fifteen milestones and most
of them explain why something that looks wrong is deliberate:

1. `CLAUDE.md` — the working agreement. Short, and every line of it was earned.
2. `HANDOFF-M16.md` — current state, the four known reds, sixteen traps, and what is gated.
3. `FIXLIST-M15.md` — the last forty items, and the Group D section in particular.
4. `HANDOFF-M15.md`, `HANDOFF-M14.md`, `HANDOFF-M13.md` — older traps, all still true.
5. `PLAYTEST-M15.md` — what the game actually does, in a player's language.

---

## Non-negotiable — these are not style preferences

Violating any of these produces a change that must be reverted, so check them before writing code.

1. **`node test/all.js` is the gate before every commit.** 69 suites, ~3 minutes. Green means green.
   **If a change fixes a real fault but turns a marginal assertion red, revert it anyway and say so.**
   That has happened five times in this project and all five reverts were right.
2. **Determinism.** Never `Math.random()` in simulation code — use `G.rand()`. The game is lockstep
   multiplayer and replays are a seed plus a command log; anything a replay or a rejoining client must
   reproduce goes through `G.init` options or the command log. `test/determinism.js`,
   `test/longgame.js` and `test/net.js` are the ones that catch a mistake here.
3. **Every new behaviour gets a negative control** — a check that goes RED when the feature is removed,
   and that produces a **clean red rather than a crash**. A check that still passes with the feature
   deleted is not a check.
4. **Measure before fixing.** In this codebase every fix that started from a measurement was right the
   first time and every fix that started from a hypothesis had to be reverted. Build the probe first.
5. **Read the constant, never the literal.**
6. **The balance run is GATED.** Do not run `test/balance.js` or `test/proxy.js`, and do not change
   anything whose justification is "this is better balance", without an explicit instruction.
7. **`test/patch10.js`, `patch11.js`, `patch15.js` are NOT tests.** They are one-off codemods that
   rewrite `js/`. They refuse to run without a flag. Leave it that way.
8. **The comments are load-bearing.** This codebase documents *why*, including why the obvious thing
   was not done and what was measured before rejecting it. A refactor that deletes the reasoning is a
   net loss even when the code gets shorter. If a comment is wrong, fix the comment — do not drop it.

---

## The four known reds. None block. Do not "fix" them without reading why.

1. **`test/soak.js`** — one tier-1/2 coverage assertion, Swarm Host never fielded. Deliberately not
   weakened. Not in the gate.
2. **`test/aistyles.js` seeds 1 and 11** — four assertions, no style attacks inside a 12,000-frame
   window. Pre-existing. Seed 5, the one the gate runs, is clean.
3. **`test/eightplayer.js` is 19/19 but its money assertion passes by 4%** (2405 against a 2500
   threshold). It is the first thing any AI spending change breaks — four attempts at FIXLIST-M15 D1
   pushed one bank from 796 to 5,019 minerals before being reverted. The cause the assertion names is
   `AI.macro`'s `wantHalls` floor (search the identifier, not a line number).
4. **`test/net_many.js` fails 1 of 44** — `phase 4: the promoted host's host-only command is obeyed`.
   **The assertion is what is wrong.** The relay refuses every settings change once a game has started,
   by design, and the same rule makes a different assertion in the same file pass. Verified identical
   at `57d61d2`. **Do not loosen the relay to make it pass.**

---

## What is gated, and is therefore not yours to decide

- **The balance run.** Every number in `HANDOFF.md` is stale. M15 added four things it must price:
  creep tumours costing 25 energy, tumour cast range becoming a real limit, the **30% Zerg creep
  movement bonus** (the largest single balance change in the project), and the Overlord becoming a
  legal Feedback/EMP target.
- **The AI's spending priorities.** The only known correctness problem left, and it is a balance
  question. `budget()` funds the composition's top pick in full on **4%** of the thinks it arms, and
  that number does not move under any bound — four were implemented and measured in FIXLIST-M15 D1 and
  all four reverted. The fix is the claim order in `budget()`, priced per race in `HANDOFF-M15.md`.
  **Flag it; do not take it.**

---

## Seed findings — already spotted, not yet investigated

Starting points, not conclusions. Verify each before acting; two of the last three "obvious" findings
in this project turned out to be the opposite of what they looked like.

1. **Six suites are neither in the gate nor in `test/all.js`'s documented exclusion list.**
   `test/all.js` opens with a careful list of what it deliberately does not run and why. These six are
   not on it and not in the gate either: **`saveload`, `eightplayer`, `longgame`, `ledger`, `techtime`,
   `net_many`**. `saveload.js` is the one that should worry you — 298 lines covering "saving and
   restoring while something is halfway through happening", running never. Decide for each: gate it,
   or document why not.
2. **`CHURN_SLOW` in `js/map.js` is a bare `const` that the build stamp does not hash.** `js/build.js`
   hashes `DATA` and a list of named globals; a tuning constant outside that can change the simulation
   while leaving the stamp still, which is the exact desync the stamp exists to refuse. `DATA.creepSpeed`
   was put in `DATA` for this reason. Audit for others.
3. **`test/` is larger than `js/`** — 19,976 lines against 17,487. Not wrong on its own, but worth
   asking whether there is duplication across the 102 suites that a shared harness would remove. Note
   that most files rebuild the same `vm` context boilerplate by hand.
4. **Line endings are mixed** — 71 CRLF, 77 LF-only, 2 already mixed (`HANDOFF.md`,
   `HANDOFF-M13.md`). `core.autocrlf` is true so git normalises on commit and this is mostly
   cosmetic, but it breaks naive patch scripts. Decide whether to normalise the tree once and add a
   `.gitattributes`, or leave it.
5. **The relay has no TLS and no authentication beyond the room code**, which is fine for friends and
   not fine for a public address. If internet play is going to be real, that is a decision to take
   deliberately rather than by default.

---

## How to deliver

Fill in the two lists below, in this file, and commit it.

- **Keep them numbered and keep them separate.** One list is work the user has to decide on; the other
  is work already done.
- **Open tasks need enough detail to act on without this chat** — file, what is wrong, what the fix
  would be, and what it would cost.
- **Questions and decisions are for things a reviewer genuinely cannot settle alone**: balance,
  scope, product direction. Not things you could have measured.
- **Fixed/changed needs the evidence**, in this project's house style: what was measured before, what
  after, which negative control was run, and the gate result.
- Anything you decide NOT to do belongs in a list too, with the reason. A review that silently drops
  its own findings is worse than one that never made them.

---

# 1. Open tasks / to-dos

*(to be filled in by the review)*

# 2. Questions and decisions for the user

*(to be filled in by the review)*

# 3. Fixed / changed / updated

*(to be filled in by the review)*

# 4. Considered and deliberately not done

*(to be filled in by the review)*

---

# Appendix — the map

Regenerate at any time with `node tools/inventory.js --md`. Every description below is the file's own
first comment line, so it cannot drift from the file.

### js/ — the game  — 24 files, 17,487 lines

| file | lines | eol | what it is |
|---|---:|---|---|
| `abilities.js` | 928 | CRLF | Abilities & spells, status fields, auto-cast behaviours. |
| `ai.js` | 1897 | CRLF | Computer opponent: scripted opening, macro loop, army control, basic micro. |
| `atlas.js` | 66 | LF | Runtime loader for baked sprite sheets (assets/atlas.js + PNGs). |
| `audio.js` | 255 | CRLF | Voice (Web Speech synthesis, original lines) and generative ambient music. |
| `build.js` | 128 | LF | Build stamp. Saves and replays are a seed plus a command log, so they only |
| `codex.js` | 580 | CRLF | CODEX -- the field manual (M11 wave two, idea 25). |
| `combat.js` | 125 | CRLF | Combat: weapon firing, splash, special attack types, projectiles. |
| `commands.js` | 148 | CRLF | Deterministic RNG, command interception/recording, replay + save/load. |
| `data.js` | 2038 | CRLF | Brood War data tables. Times are in game frames (24/s = "Fastest"). |
| `editor.js` | 328 | LF | In-browser map editor. Paints the height grid (low / ramp / high) and rocks, |
| `fx.js` | 365 | CRLF | FX: particles (render-side), ground decals (scorch, blood, corpses), |
| `game.js` | 1190 | CRLF | Game state container G: units, players, spatial hash, vision, production, |
| `hud.js` | 1004 | CRLF | HUD: BW-style console (minimap, unit panel, command card), resource bar, |
| `map.js` | 1788 | CRLF | Map: terrain grid, cliffs/ramps, resources, creep, psi power, placement. |
| `missions.js` | 622 | CRLF | Scenario missions: scripted setups with custom objectives and briefings. |
| `net.js` | 139 | CRLF | LAN multiplayer client: deterministic lockstep over a WebSocket relay. |
| `render.js` | 1588 | CRLF | Renderer: composes terrain chunks, creep, decals, sprites, effects, fog. |
| `sim.js` | 647 | CRLF | Simulation core: Game state, Player, Unit, orders, movement, combat, |
| `snapshot.js` | 219 | LF | Simulation snapshots. A replay is a seed plus a command log, so seeking |
| `sprites.js` | 103 | LF | Sprite cache: pre-renders unit painters per facing (16 dirs, 32 for a few) and building |
| `sprites_buildings.js` | 347 | LF | Building sprite painters (static) + animated overlays. Origin = footprint |
| `sprites_units.js` | 402 | LF | Unit sprite painters with animation state. Each paints a unit facing +x at |
| `terrain.js` | 628 | CRLF | Terrain renderer: procedural "Badlands"-style tileset. Chunk-cached. |
| `ui.js` | 1952 | CRLF | UI: input, selection, command card, console panel, minimap, hotkeys, |

### test/ — the suites  — 102 files, 19,976 lines

| file | lines | eol | gate | what it is |
|---|---:|---|---|---|
| `addons.js` | 159 | CRLF | ✅ | FIXLIST-M14 B5 (item 15) -- an add-on keeps its own card, and the page turn has a slot. |
| `aiadapt.js` | 176 | LF | ✅ | The AI scouts, and what it finds changes what it does. |
| `aiaudit.js` | 135 | CRLF | — | AI audit: watch AI-vs-AI games and count the things a human player would never do. |
| `aiscripts.js` | 63 | LF | ✅ | The AI build scripts have one invariant that is easy to break and expensive to notice: the steps must |
| `aistyles.js` | 299 | CRLF | ✅ | AI play styles: turtle, rusher, expander, harasser, and 'standard' -- which is the default and must |
| `alerts.js` | 231 | LF | ✅ | Player alerts: idle production, supply block, an empty Carrier, an undefended expansion under attack. |
| `all.js` | 182 | CRLF | — | The fast, deterministic checks, in one run, with one summary and a non-zero exit on any failure. |
| `auras.js` | 93 | LF | ✅ | Building auras (M11 wave two, item 11). The data contract is documented at length in js/data.js above |
| `baked.js` | 72 | LF | ✅ | Every unit and building has a baked sprite. |
| `balance.js` | 82 | LF | — | AI-vs-AI balance matrix: every matchup on every layout, both sides, N seeds, run in parallel. |
| `balance_ab.js` | 65 | LF | — | Paired A/B of two balance logs:  node test/balance_ab.js before.log after.log [--race=T] [--matchup=TZ] |
| `balance_stats.js` | 85 | LF | — | The statistics behind test/balance.js. Every wrong turn in M3's balance work came from reading a |
| `branch.js` | 116 | LF | ✅ | Branching replay: take control mid-replay and play the what-if. M11 wave three, item 24. |
| `campaign.js` | 434 | CRLF | ✅ | The campaign: weighted choices, the record of them, and what the record takes away. |
| `card.js` | 68 | LF | ✅ | The command card is 4x3 and paginates (M11 decision, 2026-09-09). It used to be 3x3 with Cancel |
| `cardsay.js` | 324 | CRLF | ✅ | Every greyed command-card button must say why it is greyed. |
| `casters.js` | 102 | LF | — | Caster audit: which of the spells the AI ever actually casts, and why the rest do not. |
| `clearance.js` | 180 | CRLF | ✅ | FIXLIST-M14 C6 (item 18) -- a wide unit gets a path its BODY can walk. |
| `clicking.js` | 335 | CRLF | ✅ | FIXLIST-M14 B1, B2 and B3 -- what a click can reach. |
| `codex.js` | 397 | CRLF | ✅ | The unit codex (M11 wave two, idea 25), and above all its damage calculator. |
| `commit.js` | 49 | LF | ✅ | Two M11 rules that are easy to regress and invisible when they do: |
| `controls.js` | 97 | LF | ✅ | Rebindable controls. M12 item 10, the half of the menu work that did not exist in any form. |
| `craters.js` | 165 | LF | ✅ | Craters, wreckage and stripped ground -- M11 wave one, idea 9 (terrain destruction) and idea 1 |
| `creeplife.js` | 172 | CRLF | ✅ | FIXLIST-M15 A3 -- creep that looks alive, without paying for it. |
| `creepspeed.js` | 271 | CRLF | ✅ | FIXLIST-M15 C3 (item 5, second half) -- the swarm moves faster over its own ground. |
| `curve.js` | 163 | CRLF | ✅ | FIXLIST-M14 C7 (item 16) -- freehand formation shapes. |
| `daynight.js` | 117 | LF | ✅ | The day/night cycle as the player meets it. M11 wave one, idea 19. |
| `defeat.js` | 177 | CRLF | ✅ | FIXLIST-M14 B4 (item 8) -- the defeat screen, and why it was never showing. |
| `describe.js` | 242 | CRLF | ✅ | FIXLIST-M14 A1 -- every unit and every building says what it is FOR. |
| `determinism.js` | 34 | LF | ✅ | Determinism + replay test: node test/determinism.js |
| `diag.js` | 9 | LF | — |  |
| `diegetic.js` | 540 | CRLF | ✅ | The diegetic console (M11 wave one, idea 15): a HUD that belongs to the commander, takes damage and |
| `diverge.js` | 25 | LF | — | Finds the first frame where two identical simulations diverge. node test/diverge.js [frames] |
| `duel.js` | 111 | LF | — | Equal-supply duels: the third proxy candidate, and the one that is supposed to show nothing. |
| `editor.js` | 208 | LF | — | Map editor test: builds a custom 2-player map the way the editor does, validates it, |
| `eightplayer.js` | 221 | CRLF | — | Eight players on a 192x192 map, which nothing has ever run. |
| `facing.js` | 52 | LF | ✅ | Directional armour (M11 idea 6). A hit from behind hurts more than one you are facing, so where a |
| `features.js` | 133 | LF | ✅ | Headless feature tests: node test/features.js |
| `ferry.js` | 96 | LF | ✅ | Transport ferry routes that run themselves. M11 wave three, item 4. |
| `fields.js` | 98 | LF | ✅ | Every persistent field draws SOMETHING. |
| `flavour.js` | 306 | CRLF | ✅ | Unit flavour (M11 wave-one idea 17): the voice lines, and the state-aware delivery on top of them. |
| `fogbuild.js` | 171 | CRLF | ✅ | FIXLIST-M14 C1 (item 9) -- you may not build on ground you have never seen. |
| `fognight.js` | 70 | LF | ✅ | Fog that lies (M11 wave one, idea 5) and the day/night cycle (idea 19's second half). |
| `formation.js` | 81 | LF | ✅ | Drag-line formation (M11 wave three, idea 9), as Beyond All Reason has it: hold right, drag a line, |
| `gated.js` | 213 | CRLF | ✅ | FIXLIST-M14 A4 -- nothing is gated by convention. The audit, made durable. |
| `highground.js` | 124 | CRLF | ✅ | High ground applied, and the vision bug that finding it uncovered. |
| `larvacard.js` | 168 | CRLF | ✅ | FIXLIST-M15 B1 + B3 -- the Zerg larva card, and one refused click saying one thing. |
| `ledger.js` | 351 | CRLF | — | THE PER-THINK SPEND LEDGER. A measurement, not a check -- it prints, it never fails. |
| `line.js` | 177 | CRLF | ✅ | FIXLIST-M14 C5 (item 20) -- the Hellion's line attack, and the three things wrong with it. |
| `longgame.js` | 211 | CRLF | — | A sixty-minute game, which nothing in this repo has ever run. |
| `mapfeatures.js` | 487 | CRLF | ✅ | Destructible and dynamic map features, and the procedural archetypes that place them. |
| `mapmodes.js` | 297 | CRLF | ✅ | Map sizes as modes, and the sandstorm. |
| `menucodex.js` | 106 | LF | ✅ | The CODEX button on the main menu, which did nothing at all until 2026-09-09. |
| `micro.js` | 12 | LF | — |  |
| `missions.js` | 44 | LF | — | Mission test: runs every campaign mission headlessly and checks that the setup placed what it promised, |
| `movement.js` | 126 | LF | ✅ | Movement edge cases that used to hang a unit forever with a live order. |
| `net.js` | 68 | LF | — | Multiplayer robustness test: two headless lockstep clients + one AI through the relay. |
| `net_many.js` | 361 | CRLF | — | Multiplayer with more than two humans, and what happens when two of them leave at once. |
| `neutrals.js` | 435 | CRLF | ✅ | The fourth race, which is not a race: neutral hostile life (M11 wave two, item 1) and capturable |
| `neutralsim.js` | 166 | LF | ✅ | The neutral owner, wired into the simulation. M11 wave two, items 1 (hostile life) and 8 (derelicts). |
| `newbuildings.js` | 252 | CRLF | ✅ | The nine buildings M11 wave two adds -- a field hospital, a jamming tower and a wall for each race -- |
| `observer.js` | 143 | LF | ✅ | Observer / replay controls: per-player vision switching, the production overlay and the |
| `onmove.js` | 167 | CRLF | ✅ | FIXLIST-M14 C4 (item 19) -- the Cyclone fires while moving. |
| `patch10.js` | 100 | LF | — | NOT A TEST. This is a one-off codemod from M10: it REWRITES FILES IN js/ and was applied once, |
| `patch11.js` | 65 | LF | — | NOT A TEST. This is a one-off codemod from M11: it REWRITES FILES IN js/ and was applied once, |
| `patch15.js` | 35 | LF | — | NOT A TEST. This is a one-off codemod from M15: it REWRITES FILES IN js/ and was applied once, |
| `perf.js` | 54 | LF | — | Performance test: 4 players at ~200 supply fighting in the middle of the map. |
| `perf_render.js` | 143 | LF | — | Render-side performance:  node test/perf_render.js [port] |
| `playtest.js` | 67 | LF | — | Scripted human play-test. Drives a full game per matchup through the UI layer |
| `playtest_bot.js` | 101 | LF | — | Harness-side "human": UI-level actions + invariant/stuck checks. Loaded into the game VM by playtest.js. |
| `playtest_scripts.js` | 173 | LF | — | Race scripts for the scripted human (see playtest.js). Each think() runs once per second of game time |
| `protoss12.js` | 668 | LF | ✅ | M12 wave four, the Protoss half: ten new units, the Warp Gate, Chrono Boost and Blink. |
| `proxy.js` | 169 | LF | — | A cheap directional proxy for the balance number. |
| `proxy_validate.js` | 108 | LF | — | Does the cheap proxy in test/proxy.js actually predict the balance number? |
| `push.js` | 109 | LF | ✅ | Unit collision push. M12 wave three, item 14. |
| `qol.js` | 174 | LF | ✅ | M12 wave one: the quality-of-life layer. |
| `rates.js` | 256 | CRLF | ✅ | Rate of fire: does every weapon actually fire at the interval the table says? |
| `refusals.js` | 176 | CRLF | ✅ | FIXLIST-M15 B2 -- a refused ability says WHY, and no ability refuses in silence. |
| `rejoindiag.js` | 125 | LF | — | Diagnostic for the net.js rejoin desync: isolate which of the two things a rejoin does to a snapshot |
| `renderfeel.js` | 553 | CRLF | ✅ | The three render changes of this commit, checked as far as render code can be checked. |
| `rooms.js` | 203 | LF | ✅ | Rooms, the join code, the player cap and the configurable lockstep delay. |
| `saveload.js` | 298 | CRLF | — | Saving and restoring while something is halfway through happening. |
| `sensor.js` | 222 | CRLF | ✅ | FIXLIST-M14 C2 (item 12) -- the Sensor Tower reports movement, it does not reveal ground. |
| `serve.js` | 184 | CRLF | — | Static server + multiplayer relay (WebSocket, no dependencies):  node test/serve.js [port] [delay] |
| `shots.js` | 202 | CRLF | ✅ | FIXLIST-M15 A1 -- every weapon has its own shot, and every shot actually draws. |
| `skirmish.js` | 323 | CRLF | ✅ | The skirmish setup screen (M11 wave two, item 22). |
| `smoke.js` | 23 | LF | — | Headless smoke test: loads the game scripts in a VM, runs an AI-vs-AI game for N frames. |
| `snapshot.js` | 149 | LF | ✅ | Simulation snapshots. The whole point is that restoring one and carrying on must be |
| `soak.js` | 328 | CRLF | — | M12 wave five: the long run, across every matchup. |
| `suppress.js` | 57 | LF | ✅ | Suppressing fire (M11 idea 7). One research per building that trains ranged units; everything that |
| `targeting.js` | 68 | LF | ✅ | Target selection (M11 wave three, idea 5). Scoring purely by distance makes a unit walk past the thing |
| `techtime.js` | 98 | LF | — | WHEN DOES THE AI REACH EACH TIER? A measurement, not a check. |
| `techtree.js` | 118 | CRLF | ✅ | Can everything actually be built?  node test/techtree.js [--quiet] |
| `terran12.js` | 552 | CRLF | ✅ | M12 wave four, the Terran half: fifteen new entries, the MULE (item 11), the Reactor and the Viking. |
| `tumour.js` | 362 | CRLF | ✅ | FIXLIST-M14 C3 (item 5) -- the Queen plants creep tumours, and the Overlord still does. |
| `version.js` | 83 | LF | ✅ | Build stamp: saves and replays carry a digest of the simulation, and a log from a |
| `verticality.js` | 407 | CRLF | ✅ | Vertical layers: the height query the simulation reads, and the promise that a ramp is the only |
| `veterancy.js` | 71 | LF | ✅ | Veterancy and scarring (M11 idea 2). Both are derived rather than stored -- rank comes from `kills`, |
| `wavetarget.js` | 209 | CRLF | ✅ | FIXLIST-M14 D1 (item 6) -- what a wave walks at. |
| `wrongthing.js` | 652 | CRLF | ✅ | Do the wrong thing on purpose, and require that the game neither crashes nor hangs. |
| `zerg12.js` | 602 | LF | ✅ | M12 wave four, the Zerg half: ten new defs, two macro mechanics, and one promise. |
| `zoom.js` | 575 | LF | ✅ | Strategic zoom, and the render half of day/night. |

### tools/ — build and diagnostics  — 5 files, 1,679 lines

| file | lines | eol | what it is |
|---|---:|---|---|
| `bake.js` | 94 | LF | Sprite baking pipeline:  node tools/bake.js [--only id,id] [--ss N] |
| `inventory.js` | 77 | LF | A map of the repo, generated rather than maintained by hand so it cannot go stale. |
| `models.js` | 1238 | LF | 3D model definitions for the sprite baker. Model space: X forward, Y up, |
| `raster.js` | 211 | LF | Software 3D rasterizer + PNG writer for the sprite baking pipeline. |
| `tilesets.js` | 59 | LF | Side-by-side screenshot of every tileset:  node tools/tilesets.js [port] |

### Totals

| | files | lines |
|---|---:|---:|
| `js/` (the game) | 24 | 17,487 |
| `test/` | 102 | 19,976 |
| `tools/` | 5 | 1,679 |
| **all** | **131** | **39,142** |

**In the gate:** 69 of 102 suites.

**NOT in the gate** (33, deliberately — `test/all.js` says why at the top of the file): `aiaudit`, `all`, `balance`, `balance_ab`, `balance_stats`, `casters`, `diag`, `diverge`, `duel`, `editor`, `eightplayer`, `ledger`, `longgame`, `micro`, `missions`, `net`, `net_many`, `patch10`, `patch11`, `patch15`, `perf`, `perf_render`, `playtest`, `playtest_bot`, `playtest_scripts`, `proxy`, `proxy_validate`, `rejoindiag`, `saveload`, `serve`, `smoke`, `soak`, `techtime`.
