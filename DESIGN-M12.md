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

**Wave one: DONE** (2026-09-09). Items 1-9 all land, `test/qol.js` covers them, 43 suites green.

Two of the nine turned out to be already built and only needed verifying, which is worth recording so
nobody builds them twice: **7 repeat/queue building** already worked -- `UI.confirmPlacement(shift)`
queues the order and keeps the placement ghost alive -- and **8 control-group tab across types** already
worked, via `UI.cycleSubgroup` with the command card following `UI.subgroup`.

And one was smaller than it looked but in a different place than expected. **5 smart casting** was
supposed to stop N casters all firing at one point; that was already true, because the ability branch in
`execPending` returns after the first unit. What was NOT true is that it picked a sensible caster -- it
took whatever was first in the selection, with no energy and standing furthest away. So smart casting
here means "the right caster", not "one caster", and the test measures that.

Waves two to five: not started.
