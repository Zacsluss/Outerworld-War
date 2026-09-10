# M12 — the modern layer

Chosen 2026-09-09 from a "what does SC2 have that this does not" audit. Sixteen items, all accepted,
none declined. This file is the contract: what was picked, why, what it touches, in what order, and
what "done" means for each.

The one-line version: **M11 made the game deeper; M12 makes it comfortable, then makes it bigger.**
The order matters — quality of life first, because every later item is easier to build and to test
once the interface stops fighting you.

**This is a Brood War remake that is deliberately borrowing from SC2.** The rule for every item below
is: take the *ergonomics* wholesale, take the *mechanics* only where they add a decision. Where SC2 and
Brood War disagree on feel, Brood War wins unless the item is explicitly about changing that.

---

## Standing decisions carried in from M11

- **Determinism is not negotiable.** Never `Math.random()` in simulation code; use `G.rand()`. Anything
  a replay or a rejoining client must reproduce goes through `G.init` options or the command log.
- **Build-stamp scope.** `js/build.js` hashes the simulation files only. Render and UI changes must not
  move the stamp; data and simulation changes must.
- **The balance run is still gated on an explicit instruction, and is to be double-checked when one is
  given.** M12 invalidates balance far harder than M11 did — it adds thirty-seven units. No measurement
  until commanded.
- **Tests are plain node, no framework**, PASS/FAIL lines, registered in `test/all.js`, and every new
  behaviour gets a negative control.

---

## Wave one — quality of life

Nine items. Almost all of this is `js/ui.js`, which is why it goes first and goes together: it is one
file and cannot be parallelised, and everything after it is easier to test once it lands.

| # | Item | Touches | Done means |
|---|---|---|---|
| 1 | **Line-formation preview** | render | Right-drag draws a live line with one pip per selected unit, at the slot it will take |
| 2 | **Unlimited selection** | ui, hud | The 12-cap is gone everywhere; the console paginates or shrinks instead |
| 3 | **Multi-building production** | ui | Select N production buildings, queue once, it goes to the shortest queue |
| 4 | **Worker auto-mines on spawn** | game, sim | A new worker walks to the nearest patch of its own hall with no order |
| 5 | **Smart casting** | ui, abilities | One cast per key press from the unit best placed to make it, not all of them |
| 6 | **Autocast toggles** | ui, abilities, sim | Right-click an ability to arm it; armed abilities fire on their own within rules |
| 7 | **Repeat / queue building** | ui, commands | Shift-queue construction; a worker builds a row without further input |
| 8 | **Control-group tab across types** | ui | Tab cycles type subgroups within a mixed group and the card follows |
| 9 | **Ping and drawing** | ui, net | Alt-click pings; drag draws a stroke allies see for a few seconds |

**Decision on #2, written down because it is the one people argue about.** Brood War's 12-unit cap is
a skill expression and removing it is a real change to how the game plays. It goes anyway: this project
already has select-all-army and control groups, so the cap is not producing interesting decisions, it
is producing clicking. The command card already paginates (M11), which is the mechanism that makes an
unlimited selection legible.

**Decision on #6.** Autocast is opt-in per ability and per unit, off by default, and never applies to
anything that costs a unit (no autocast on infest, nuke, or a morph). An armed ability may only fire
when it would not waste itself — the rules live beside each ability, not in a generic energy check.

## Wave two — the shell

| # | Item | Touches | Done means |
|---|---|---|---|
| 10 | **Menus, properly** | index.html, ui | Main / lobby / settings / controls, organised the way a shipped game does it |

Four screens, not one panel with everything on it. **Main** (play, campaign, replays, editor, quit),
**Lobby** (the M11 skirmish setup, promoted and finished), **Settings** (video, audio, gameplay),
**Controls** (every binding listed, rebindable, with a reset). The controls screen is the one that
does not exist in any form today and is the reason this item is here rather than in a polish pass.

## Wave three — macro mechanics

| # | Item | Touches | Done means |
|---|---|---|---|
| 11 | **Larva inject / chrono boost / MULE** | data, abilities, sim, ui | Each race has one energy sink on its hall that rewards attention |
| 12 | **Warp-in** | data, sim, abilities, ui | A researched Gateway becomes a Warp Gate; units warp to any powered field |
| 13 | **Creep tumours** | data, sim, map | A tumour spreads creep and seeds another tumour, alongside the existing colonies |
| 14 | **Unit collision push** | sim | Units nudge past each other instead of stopping dead |

**Decision on #13.** Tumours are ADDITIVE. The existing creep-from-buildings stays exactly as it is;
tumours are a second, player-driven source. This is the same argument every M11 map toggle made: a
change that silently rewrites every existing map is not a feature, it is a regression with a changelog.

**Decision on #14.** Push applies between units of the same owner only, and never to buildings, larvae,
burrowed units or anything in transit. Cross-owner push is how a blocked ramp stops working.

## Wave four — the roster

| # | Item | Touches | Done means |
|---|---|---|---|
| 15 | **Thirty-seven SC2 units and buildings** | data, models, ai, sprites | Each has a def, a 3D model, a baked sheet, a tech-tree home and an AI that builds it |

- **Terran (15)** — Marauder, Reaper, Hellion, Thor, Widow Mine, Cyclone, Liberator, Raven, Banshee,
  Viking, Medivac, Planetary Fortress, Orbital Command, Sensor Tower, Reactor
- **Zerg (10)** — Roach, Baneling, Swarm Host, Viper, Ravager, Infestor, Overseer, Nydus Worm network,
  moving Spine/Spore crawlers, Creep Tumour
- **Protoss (12)** — Stalker, Immortal, Colossus, Sentry, Void Ray, Phoenix, Oracle, Tempest,
  Disruptor, Mothership, Warp Prism, Nexus chrono

**Every one of these is only done when `test/baked.js` and `test/aiscripts.js` still pass** — that is,
it has a 3D model, a baked sheet, and a computer opponent that can build it. M11 shipped nine
structures that no AI could build and sixteen sprites with no model; those two tests exist because of
it, and this wave is exactly the situation that would repeat the mistake at four times the scale.

## Wave five — verification

| # | Item | Done means |
|---|---|---|
| 16 | **Long-run testing** | Full suite, extended AI-vs-AI soak across every matchup, scripted playthroughs, determinism and save/replay round-trips |

Run at the END, once everything above has landed, because a soak that runs against a moving tree
measures nothing. Balance measurement remains separately gated on an explicit instruction.

---

## Order, and why

1. **Wave one**, because it is one file and everything downstream is easier to test with it.
2. **Wave two**, because the lobby is where wave four's roster becomes reachable.
3. **Wave three**, because the macro mechanics change what the AI should do before the AI learns
   thirty-seven new things.
4. **Wave four**, the largest, last of the building.
5. **Wave five**, once nothing is moving.

## Status

Updated 2026-09-10. **All sixteen items are built and tested.**

| Wave | State |
|---|---|
| **One — quality of life (1-9)** | **DONE.** `test/qol.js` (22), `test/controls.js` (19). |
| **Two — the shell (10)** | **DONE.** Four screens: Main, Lobby, Settings, Controls. |
| **Three — macro (11-14)** | **DONE.** MULE, larva inject, chrono boost, warp-in, creep tumours, collision push. `test/push.js`. |
| **Four — the roster (15)** | **DONE.** Terran 15/15, Zerg 10/10, Protoss 12/12. `test/terran12.js` (135), `test/zerg12.js` (162), `test/protoss12.js` (114). |
| **Five — long testing (16)** | **DONE.** `test/soak.js` (new), plus `test/longgame.js` and `test/missions.js` re-run. |

Three deliberate deviations from a literal reading of item 15, each pinned by a test in both
directions so it cannot be quietly undone: **no Stalker def** (it is Blink on the Dragoon, because a
Stalker beside a Dragoon is the same role at the same building), **the Shuttle survives** beside the
Warp Prism (the prism is +50 minerals for `psi`, which makes it a decision rather than a rename), and
**no Baneling Nest** (banelings sit behind a tech, one fewer structure for the same decision).

Two of wave one turned out to be already built and only needed verifying, recorded here so nobody
builds them twice: **7 repeat/queue building** already worked (`UI.confirmPlacement(shift)` queues the
order and keeps the placement ghost alive) and **8 control-group tab across types** already worked, via
`UI.cycleSubgroup` with the command card following `UI.subgroup`.

And **5 smart casting** was a different feature than it looked. "One press, one cast" was already true,
because the ability branch in `execPending` returns after the first unit. What was not true is that it
picked a sensible caster -- it took whatever was first in the selection, no energy and furthest away
included. Smart casting here means "the right caster", not "one caster", and the test measures that.

## Things this milestone learned the hard way

Written down because all three cost hours and none is visible in a diff.

1. **`git show <rev>:file` emits LF and the working tree is CRLF.** Every three-way merge attempted
   without normalising first sees nearly every line as changed and produces garbage that looks like a
   real conflict. Normalise all three inputs before merging anything in this repo.
2. **Duplicate object keys are silent data loss.** A union merge of `AI_SCRIPTS`, `AI_COMP` and the
   sprite animation sets produced two `T:` keys and three `treads:` keys. That is valid JavaScript --
   the last one wins -- so an entire race's roster vanished from the AI with no error and a file that
   parsed. `test/terran12.js` caught it only because it asserts every new unit is in an AI table.
3. **`map.height` was not snapshotted** on the reasoning that `syncFeature`/`syncWrecks` re-derive it.
   They only paint tiles they still own, so a wreck that skipped a tile a building later took left that
   tile raised live and flat restored. It presented as a lurker firing in one process and not the
   other, three ticks after a restore, with every unit field identical. Height is captured now.

## Found during M12, owed to the balance run

Not fixed here, because each is a change to what an army is made of and the balance run is gated on an
explicit instruction. Recorded so the run has a starting list rather than a blank page.

1. **The cheap-unit ratchet still bites Zerg.** `AI.production()` sorts the composition by supply-share
   score and trains the first candidate it can *afford*, so an unaffordable top pick falls through to
   whatever is cheaper. The hold rule is meant to stop this, but it only engages once the bank reaches
   70% of the preferred unit's cost -- and a 25-mineral zergling is always affordable, so for Zerg the
   bank never gets there. Measured on seed 5 of `test/zerg12.js`: the Roach is the top-ranked candidate
   in **114 of 186** production thinks and is trained in **none** of them, while 22 zerglings are bought
   in those same thinks. Across seeds 5-9 the AI fields 0-2 roaches a game against 5-10 hydralisks,
   where the weights (roach 4-5, hydralisk 5-6) ask for roughly one roach per two hydralisks by supply.
   The same mechanism will be suppressing every other expensive tier-one unit.
2. **Zerg banks gas it cannot spend.** The same games sit at ~20 minerals and ~166 gas with four
   extractors on fourteen drones. Whatever the fix in (1) is, it is measuring against an economy that
   is already lopsided, so the two want changing together.

## Wave five: what the long run actually found

`node test/all.js` is 49 suites green. On top of that, the suites that are deliberately outside it:

| run | result |
|---|---|
| `test/soak.js` — 18 games, 6 matchups x 3 seeds, 32k frames | No throws, no console errors, no NaN, every list bounded, **every mid-game snapshot re-simulated identically**, every matchup fields a real army |
| `test/longgame.js` — 60 minutes + replay | Hour completes, replay is **bit-identical**, no leak, no slowdown, checkpoint thinning and seeking correct |
| `test/missions.js` — eight scenarios | All pass |
| `test/saveload.js` | 54 pass, including the new M12 morphs |
| `test/eightplayer.js` | Passes after three stale assertions were fixed (see below) |

### The AI never reached tier 3, and that was a bug

Filed first as a design question about game length. That was wrong, and the correction came from the
person who plays this game: a human reaches tier 3 in well under eight minutes, and build order,
scouting and countering the opponent are most of what a real match consists of. So it is a bug.

Measured with `test/techtime.js`, a new diagnostic that suppresses victory and gives the AI an
opponent that does nothing, so the build ORDER is measured rather than the outcome of a war. Against
nobody at all, the AI could not reach tier 3 in twenty minutes.

The decisive experiment was to hand it unlimited gas: every race then reached every tier-3 building in
five to eight minutes. So the tech tree and the scripts were sound and the entire problem was resource
flow. Five separate causes, each measured before it was touched:

1. **The concurrent-build limit was a constant** -- a flat 2, right for a twelve-worker opening and
   absurd for a seventy-worker one, and `macro()` ignores it entirely. `under` therefore sat at 3-5
   permanently and the head of the tech order was never startable: Protoss's Citadel was refused for
   this reason **423 times in one game**, its Robotics 226, Zerg's Spire 225. The 200-second escape
   hatch then advanced past them, so those buildings were not delayed, they were **skipped**.
2. **Tier 3 sat behind the optional buildings.** Protoss had NINE side-buildings between the Templar
   Archives and the Stargate.
3. **`prodDone` counted `!u.def.depot`**, and every Zerg production building is a depot -- so it was
   permanently 0 for Zerg and the gas-tech gate could never open by that arm.
4. **The reserve was set after the spending.** `turn()` zeroes it, runs `economy()` and `supply()` --
   every worker and every overlord, the two largest mineral sinks in the game -- and only then
   `script()`, the one thing that knows what is being saved for. Both sinks always saw zero.
5. **The 40% floor deadlocked.** Below 40% of the target the reserve is off, so units are bought, so
   the bank never reaches 40%. Zerg's Spire held the head of the script for **842 seconds** sitting on
   ~60 minerals against a 200 target.

Plus a sixth in the economy: geysers at newly taken bases sat on **zero workers**, because candidates
were restricted to workers already within 20 tiles and a base you have just taken has none.

Medians over three seeds, before and after:

| | before | after |
|---|---|---|
| Terran Starport | never | 6:11 |
| Terran Armory | 19:01 | 6:23 |
| Zerg Spire | never | 12:27 |
| Zerg Queen's Nest | 15:20 | 11:56 |
| Protoss Stargate | 16:01 | **7:03** |
| Protoss Templar Archives | 19:59 | **7:33** |
| Protoss Robotics | never | 6:00 |
| Protoss Fleet Beacon | never | 13:04 |

And a seventh cause for the tier-3 UNITS, separate from the buildings: `AI.production` scores a
candidate as `(count * sup + sup) / weight`, so a 6-supply Thor at weight 2 opened at 3.00 against a
Marine's 0.17 -- eighteenth in line -- and because `count` is LIVE units, attrition kept resetting the
Marine's score before the queue ever got there. Every unit needing an advanced building or 100+ gas
now has a weight putting its score at 1.25 or better.

### Four more, found by following the money

The first five above got the tier-3 BUILDINGS up. The units still did not appear, and the reason was
four further faults in the same system -- each one found the same way, by measuring what the AI
actually produced and then asking its own code why not.

6. **The AI stopped building supply at 200.** `AI.supply()` opened with `if (p.supMax >= 200) return;`
   and M11 raised `SUPPLY_CAP` to 500. So it sat at its own ceiling all game, and what a capped player
   cannot buy is everything expensive. Measured: a solo 20-minute Protoss finished **252/252 having
   produced 77 zealots, 3 dragoons and nothing else**, with Immortal, Colossus, Reaver, Carrier,
   Arbiter, Void Ray, Tempest, Disruptor, Oracle, Corsair, Scout and Warp Prism each reporting
   "supply" as the reason. The same stale-constant bug as the `<= 200` assertion in
   `test/eightplayer.js` -- a number the game stopped using a milestone ago.
7. **Heavy units were scored eighteenth in the queue** (see above) -- weights recomputed from supply.
8. **Gas had the same hold bar as minerals.** A geyser admits one worker at a time, so gas is a
   trickle next to a mineral line; demanding 70% of it banked before the AI will wait means it never
   waits. The Dragoon is the *better* pick by composition score (0.40 against the Zealot's 0.50) and
   lost every single time, because it costs 50 gas and the Zealot costs none.
9. **Upgrades outbid the build order.** `research()` was the last spender in the file reading the bank
   directly instead of asking `afford()`. A 20-minute game mines ~9,100 gas and upgrades are the
   largest single claim on it.

The composition after 6-9, same seed, same twenty minutes:

| | before | after |
|---|---|---|
| zealot | 77 | 56 |
| dragoon | 3 | 18 |
| everything else | **nothing** | high_templar 6, dark_templar 6, immortal 3, phoenix 3, warp_prism 3, archon 2, reaver 2, void_ray 2, dark_archon 1, disruptor 1, oracle 1, scout 1 |

Eleven unit types that had never once been built now appear. That is the composition table finally
being able to express itself.

**Zerg is exempt from 9**, and the exemption is the interesting part: Zerg reserves for its head step
*unconditionally* (the M7 lever inside `script()`, kept because it is worth 15 points in TvZ), so its
reserve is engaged essentially all game and any reserve-based brake silences its research completely.
`test/zerg12.js` caught that within one run.

### Scouting was decorative, and now is not

`enemyAir` -- the switch deciding whether Zerg builds Scourge and Spore Colonies and whether Protoss
builds Corsairs -- was a raw scan of `G.units` with **no vision test at all**. The AI knew about a
Wraith the moment it hatched, from across an unexplored map. Hiding your tech bought you nothing.

There is an intel model now (`observe`, `sawAir`, `sawCloak`, `readEnemy`), gated on `G.canSee` for
units and `G.explored` for buildings, remembering what it has seen. From it: composition counters
(anti-air, splash against a massing enemy, cheap units against a teching one, detectors), attack
timing (a teching enemy is soft *now* -- that window is the whole reason to scout), and `overrun()`,
which stops the build order saving for tech when an army it cannot match is already on the way.

`test/aiadapt.js` covers it, and the negative control is the point of every check: an AI that cheats
passes "the AI knows about air" exactly as well as one that scouted, so each check shows it the thing
and requires the answer to flip.

### Three stale assertions, and one landmine

`test/eightplayer.js` had three checks that measured something other than what they said, all found by
running it rather than by reading it. The pattern is the one this milestone keeps hitting: **an
assertion that samples one frame to answer a question about a whole game.**

1. `<= 200` supply, against a `SUPPLY_CAP` that M11 raised to 500. Failing against a number the game
   had stopped using.
2. "every player built an economy", read at the final segment — which is really "nobody is ever
   eliminated in an eight-player free-for-all". Three players reached 40-50 supply and were razed.
   Peak across the game now.
3. "every hall sits on a base", judged at the end — so a legitimate Zerg macro hatchery became an
   orphan the moment the sibling halls justifying it died. Judged at placement time now: 0 bad
   placements.

And `test/patch10.js`, `patch11.js`, `patch15.js` are **not tests**: they are one-off codemods that
rewrite files in `js/`. Running one today throws part-way on a stale anchor, *after* `edit()` has
written the files it already got through — patch11 appended a second `CMD.install()` to
`js/commands.js` before failing. They refuse to run without an explicit flag now.
