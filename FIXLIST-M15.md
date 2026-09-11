# FIXLIST-M15 — locked

Six reported items, plus three found while verifying them, plus everything left over from
`HANDOFF-M15.md`. **When this list is closed the project has no open to-dos.**

Every entry below was checked against the code before it was written. Where the report and the code
disagree, the entry says so and gives the number. Where I could not reproduce the report, the entry
says that too, plainly, and names the probe to build first.

**Read `HANDOFF-M15.md` for the state of the tree and the three known reds.**

---

## Decisions already taken

- **Work the groups in order: A (data / presentation) → B (interface) → C (simulation) → D (AI).**
  Strictly increasing risk, strictly decreasing independence. Same order as M14, for the same reason.
- **`node test/all.js` is the gate before every commit.** 63 suites, ~2.7 minutes. Green means green.
  A change that fixes a real fault but turns a marginal assertion red gets reverted anyway.
- **Group A3 is render-only and must not move the build stamp.** Run `node test/version.js` after it.
- **The balance run stays gated.** Do not run `test/balance.js` or `test/proxy.js` without an explicit
  instruction, and double-check if one appears to be given.
- **Measure before fixing.** Three entries below (A1, C3, D1) name the probe to build first.

## Traceability — all six reported, plus three found

| # | reported | entry | status |
|---|---|---|---|
| 1 | were unit projectiles ever researched? make them varied | **A1** | ✅ done — **No, they never were.** All 67 weapon slots now carry their own shot, 20 kinds, races disjoint |
| 2 | tumours should cost energy; Overlords need an energy pool | **C1** | ☐ confirmed: `plant_tumour` has no energy cost and the Overlord has no energy at all |
| 3 | tumours have unlimited range | **C2** | ⚠ confirmed but not for the reported reason — see the entry |
| 4 | Spawn Broodlings is unexplained and says only "invalid target" | **A2 + B2** | ☐ confirmed: **0 of 76 abilities have a description** |
| 5 | creep should look alive; Zerg should move faster on it | **A3 + C3** | ☐ confirmed: no creep animation, and **no creep speed bonus exists at all** |
| 6 | training a Drone at supply cap also says "Spire required" | **B1** | ⚠ **partly reproduced** — see the entry, it is two faults and I only found one |
| — | found: the supply refusal fires once per selected larva | **B1** | ☐ 3 larvae selected = 3 identical errors |
| — | found: Set Rally and Queen share slot 6 on the larva card | **B3** | ☐ same family as M14's B5 |
| — | found: seven abilities say only "Invalid target." | **B2** | ☐ a class, not one case |

---

# Group A — data and presentation

Lowest risk. Nothing here changes what the simulation does.

### ✅ A1 · (item 1) Unit projectiles were never designed — 54% fire the same white bullet

**Asked for:** "for all units, did you research their projectiles at all before building? I think we
need a pass at that to make them more varied/fun".

**Answer: no, they were not.** No milestone touched them and no entry in FIXLIST-M14 went near them.

**Measured, not estimated.** `Combat.visual()` (`js/combat.js:81`) chooses a shot's look from a
**hardcoded list of unit ids**, and anything not on the list falls through to `kind: 'bullet'`,
`color: '#ffe'`:

```
armed units       58
armed buildings    5
TOTAL armed       63
named in visual() 29
FALL THROUGH      34   (54%)
```

The 34 that all look identical: `spider_mine, marauder, reaper, hellion, cyclone, widow_mine, thor,
banshee, liberator, viking, viking_a, lurker, mutalisk, scourge, infested_terran, roach, ravager,
baneling, locust, reaver, carrier, interceptor, sentry, immortal, colossus, phoenix, oracle, void_ray,
tempest, mothership, carrion_grub, carrion_maw, sentinel, planetary_fortress`.

**That is every unit M12 added.** The Colossus, the Carrier, the Void Ray, the Immortal, the Thor and
the Mutalisk all fire the same small white dot.

**Done means:**
- **The look comes off the weapon, not off a list of ids.** `w.fx` already exists and M14's C5 used it
  for the Hellion — that is the pattern. A hardcoded id list is the fault, not the symptom; replacing
  it with a longer hardcoded id list is not a fix.
- Every armed unit and building has a deliberate shot. Reuse is fine where it is *chosen*
  (two missile units may share `missile`), but nothing should be reaching a default by accident.
- **New effect kinds go in `FX.drawEffect` in `js/fx.js`.** There are 20 today. Watch for the trap M14
  hit: `case 'flame'` already existed and a second one was silently unreachable, so the new Hellion
  effect had to be named `flamejet`. **Check the case does not already exist before adding it.**
- Air, ground, splash and beam weapons should read differently at a glance from a zoomed-out camera.
- **Measure first, and it is cheap here:** print the id → effect mapping for all 63 before touching
  anything, so "varied" is a number and not an impression. `tools/_projaudit.js` is not committed;
  the script is reproduced in the commit message for A1's predecessor investigation.

**Where:** `js/combat.js` (`visual`), `js/data.js` (weapon defs), `js/fx.js` (`drawEffect`).
**Note:** moving the table into `DATA` moves the build stamp. That is fine and expected outside Group B.

---

### ☐ A2 · (item 4, first half) Not one ability in the game says what it does

**Asked for:** "I'm not sure what Spawn Broodlings does".

**True today, and it is not one ability.** M14's A1 gave a description to every unit and every
building. **Abilities were not covered: 0 of 76 have one.** So no ability anywhere in the game
explains itself, and Spawn Broodlings is simply the one that got noticed.

**Done means:**
- A short description on **all 76** abilities, in the same `DESC` table style A1 used in `js/data.js`
  (kept out of the def lines so `test/version.js`'s source-text probe stays valid).
- It must say **what the ability does AND what it can be used on**, because the second half is the
  actual complaint. For Spawn Broodlings the target rule is, from `js/abilities.js:531`: not air, not
  a building, not on the `NO_BROODLING` list, and not a Protoss mechanical unit — i.e. **ground
  organic units only**, it **kills the target outright**, and it gives you two Broodlings that live
  30 seconds.
- The HUD already has the field: M14's A1 added `desc` to the tooltip as its own line. Use it.
- A test in the shape of `test/describe.js`, which already asserts this for units and buildings.

**Where:** `js/data.js` (`DESC`), `js/hud.js` (tooltip), `test/describe.js`.

---

### ☐ A3 · (item 5, first half) Creep should look alive — RENDER ONLY

**Asked for:** "Creep should have some minor bubbling or ripples to make it look living".

**True today.** Creep is drawn as a flat cached texture and never moves.

**Done means:**
- A slow bubble or ripple. **Minor** is the word in the request — this is ambient, not a light show.
- **THE CONSTRAINT THAT MATTERS:** creep is composited from **chunk canvases cached at 8×8 tiles and
  keyed by the creep bits** (`Terrain.creepChunk`, and `Render.creepFrame`). A naive per-frame
  animation invalidates that cache every frame and hands back the performance the cache was built to
  win. Animate in a way that does not rebuild chunks — an overlay pass, a scrolling mask, or a shader-
  style modulation on top of the cached blit.
- **The build stamp must not move.** `js/render.js` and `js/fx.js` are not hashed. Run
  `node test/version.js` after and confirm the digest is unchanged.
- Check the cost: `test/zoom.js` and the eight-player tick budget (`test/eightplayer.js` asserts
  < 25 ms/frame) are the two that will notice.

**Where:** `js/render.js`, `js/fx.js`. **Not** `js/sim.js` — the speed half of item 5 is C3.

---

# Group B — interface

### ⚠ B1 · (item 6) Training a Drone at the supply cap — TWO faults, and I only reproduced one

**Asked for:** "when I try to build a drone at population limit as Zerg it gives me the error Spire
required in addition to the correct error which says spawn more overlords".

**What I reproduced.** Driving a Zerg player to `supUsed === supMax` and running exactly what the
Drone button runs (`js/ui.js:903`) gives:

```
error: Spawn more overlords.
error: Spawn more overlords.
error: Spawn more overlords.
```

**Three times, because three larvae were selected.** The button loops every selected larva and only
`break`s on success, so a refusal is announced once per larva. That is a real fault and it is fixed
by refusing once.

**What I could NOT reproduce: the "Requires Spire" line.** It does not come from `larvaMorph`, which
returns on the first failed check, and there is no hotkey collision on the larva card (all eleven
morphs have distinct keys). **Do not guess at this — build the probe.** The most likely source is
`js/sim.js:614`: a worker that arrives at a build site re-checks requirements and says
`'Requires ' + missingReq(def)` there. A Drone already walking to a Spire site without a Lair would
emit that line **on its own schedule**, landing in the console next to the supply refusal and reading
as one click producing two errors. If that is it, the two faults are unrelated and both are real.

**Done means:**
- One refused click says one thing, once, however many larvae are selected.
- The "Requires Spire" line is **reproduced first** and then either fixed or explained. If it turns
  out to be the walking-worker case, the fix is that a worker whose build order became impossible
  should say so once and drop the order, not announce it repeatedly.
- A test that selects three larvae, refuses, and counts the messages.

**Where:** `js/ui.js:903`, `js/game.js` (`larvaMorph`, `supplyRefused`), `js/sim.js:614`.

---

### ☐ B2 · (item 4, second half) "Invalid target." — seven times, and never a reason

**True today, and it is a class.** `js/abilities.js` says the bare string `'Invalid target.'` in
**seven** places (`spawn_broodling`, `consume`, `hallucination`, `mind_control`, `abduct`,
`consume_essence`, and one more). None of them says what a valid target would have been.

This is the same shape as M14's A4, where four refusal states in `G.queueAddon` said nothing at all
and the audit found the real bug behind them.

**Done means:**
- Every one of the seven says **what it needed**, in the player's words. Spawn Broodlings should say
  something like "Spawn Broodlings only works on ground organic units", not "Invalid target."
- Audit the rest of `js/abilities.js` for silent refusals — refusals that `return` or `break` with no
  message at all. M14's A4 found that class of bug by asking the same question of a different file,
  and it found three holes where the report described one.
- The energy refund on a refused cast (`u.energy += 150`) must survive. Check each one.

**Where:** `js/abilities.js`.

---

### ☐ B3 · (found) Two buttons share slot 6 on the Zerg larva card

**Nobody reported this. It is the same family as M14's B5**, where the page-turn button was drawn on
top of the twelfth real button and pressing "More 1/2" pressed Apollo Reactor.

`js/ui.js:903` calls `B(6, 'Set Rally', ...)` and then `DATA.larvaMorphs.forEach((id, i) => B(i, ...))`.
`larvaMorphs` is eleven long and **Queen is index 6**. `B` is `btns.push(...)` — it appends, it does
not assign to a slot — so **two buttons leave that function both carrying `slot: 6`**.

**Done means:** confirm the visible symptom first (which of the two draws, and which one a click or
the `Q`/`R` hotkey actually reaches), then give them separate slots. The card has twelve slots and the
larva card uses eleven, so there is room. A test that asserts no two buttons on any card share a slot
would catch this whole family — that is the version worth writing.

**Where:** `js/ui.js` (`buildCard`), `test/addons.js` or a new card-integrity suite.

---

# Group C — simulation

Everything here moves the build stamp, which is expected.

### ☐ C1 · (item 2) Creep tumours are free, and the Overlord has no energy at all

**Asked for:** "Creep tumors should cost the queen and overlord energy (overlords should be given 200
energy that fills over time like the queen)".

**Both halves are true.**
- `A('plant_tumour', 'Creep Tumour', 'C', 'point', { range: 3 })` — **no `energy` key.** Compare
  `A('larva_inject', ..., { energy: 25, ... })` and `A('ensnare', ..., { energy: 75, ... })`. Planting
  a tumour is free and unlimited for both casters.
- `U('overlord', ...)` has **no `energy` and no `maxEnergy`.** It is not an energy unit at all.

**Done means:**
- `plant_tumour` costs energy. The Queen already has a pool and a regen; this just gives the ability a
  price. SC2 charges 25 for Creep Tumour — worth matching, and worth saying out loud in the commit
  which number was chosen and why.
- The Overlord gets **200 energy that fills over time like the Queen's**. Find the existing regen — do
  not write a second one. `maxEnergy` and the regen path already work for Queen, Defiler, Infestor,
  Viper, Ghost, Templar and the rest; the Overlord just needs to join them.
- **Read the constant, never the literal.** There is an established energy-regen rate; use it.
- The AI plants tumours too (`js/ai.js:1377`). It must respect the new cost or it will spam refusals —
  check `AI.tumourBudget()`.
- **This is a balance change.** Free unlimited tumours becoming energy-gated changes how fast creep
  spreads. Add it to the balance-run list in `HANDOFF-M15.md` section 4.

**Where:** `js/data.js` (`plant_tumour`, `spawn_tumour`, `overlord`), `js/abilities.js`, `js/ai.js`.

---

### ⚠ C2 · (item 3) Tumour range — confirmed, but NOT for the reason the report gives

**Asked for:** "Creep tumors currently have unlimited range and they need to have their range limited
or best where they can spawn additional tumors".

**The symptom is real. The cause is one line, and it is not in the tumour code.**

Both abilities already carry a range: `plant_tumour` has `range: 3` and `spawn_tumour` has `range: 9`.
The problem is what `range` MEANS. From `Abilities.orderTick` (`js/abilities.js:396`):

```js
if (distPt(u.x, u.y, tx, ty) > range) {
  if (!u.canMove || u.sieged || u.burrowed) { u.nextOrder(); return; }
  u.moveTo(tx, ty, t); return;
}
```

**For anything that can move, `range` is a walk-to distance, not a limit.** The Overlord simply flies
to wherever you clicked and plants there. So:

- **`plant_tumour` from an Overlord or Queen is effectively unlimited** — anywhere on your creep.
- **`spawn_tumour` from a tumour IS already limited to 9 tiles**, and correctly, because a tumour
  cannot move so it takes the `nextOrder()` branch. **The half of this the report asked to limit is
  the half that already works.**

Combined with C1 — free casts — an Overlord can plant unlimited free tumours anywhere on the creep
field. C1 and C2 together are the actual fix.

**Done means:**
- A cast range that is a **limit** for these abilities, not a travel order. Note this is a deliberate
  behaviour change to a shared code path — decide whether it is a per-ability flag
  (`noApproach: true`) or a change for all point abilities, and say which and why. **A flag is much
  safer:** every other point ability in the game relies on walk-to today.
- Do not "fix" `spawn_tumour`'s 9 tiles. Measure it before changing it; it is already enforced.
- A test that a mobile caster refuses an out-of-range tumour instead of flying to it, and a negative
  control showing it still flies for a normal point ability.

**Where:** `js/abilities.js` (`orderTick`), `js/data.js`.

---

### ☐ C3 · (item 5, second half) Zerg units do not move faster on creep — the bonus does not exist

**Asked for:** "All zerg units on creep should have their speed increased just like it is in
StarCraft 2 so look up the exact percentage."

**Looked up, and confirmed absent.** There is no creep speed bonus anywhere in `js/sim.js`.

**The StarCraft II numbers** ([Liquipedia](https://liquipedia.net/starcraft2/Creep),
[Liquipedia: Speed](https://liquipedia.net/starcraft2/Speed)):

| | on creep |
|---|---|
| most Zerg ground units | **+30%** |
| Queen | **+167%** |
| Spine Crawler / Spore Crawler (moving) | **+150%** |
| Locust | **+40%** |
| **Drone, Broodling, Changeling, anything burrowed** | **no bonus** |

**Done means:**
- The bonus applies on creep and only to Zerg **ground** units. Fliers get nothing.
- The exceptions above are honoured — in particular **the Drone gets nothing**, which is the one most
  likely to be missed and the one that most changes the early game if it is wrong.
- **Read the creep test that already exists.** `G.map` already answers "is this tile creep" for
  building placement and for the Nydus worm; use that, do not write a second creep test.
- **Determinism:** speed feeds movement, so this is squarely in the replay path. `test/longgame.js`
  and the replay assertions are the ones to watch.
- **This is a large balance change** and belongs on the gated list. A 30% army-wide movement bonus on
  your own ground is one of the biggest levers in this list.

**Where:** `js/sim.js` (`moveTo` / speed resolution), `js/data.js`, `js/map.js` (creep query).

---

# Group D — the AI, carried over from HANDOFF-M15

Highest risk. Both were measured last session; neither has been attempted.

### ☐ D1 · Bound the fall-through in `AI.production()`

Carried over unchanged and **this is the one next action `HANDOFF-M15.md` names.** The measurement is
done and is in that file: the AI ignores its own composition table in all three races — the cheapest
tier-one unit takes 3–6× its intended share of army supply — and the cause is that `production()`
buys the cheapest affordable unit whenever its correctly-ranked top pick cannot be paid for.

**The probe already exists:** `node test/ledger.js 20 1 solo Z`, section 6. Get before numbers for all
three races **in a git worktree** before editing.

**Do not** open by re-tuning `AI_COMP`, and **do not** take the claim-order reorder — it is measured,
priced per race in `HANDOFF-M15.md`, and gated on the balance run.

### ☐ D2 · Re-tune `AI_COMP` weights — only after D1

Blocked on D1 by measurement, not by preference: the weights are not being read, so tuning them tunes
a table nothing consults. Worth doing when section 6's misallocation number is small enough that a
weight change shows up in it.

---

# Gated — not part of this list

**The balance run.** `test/balance.js` and `test/proxy.js` need an explicit instruction. The list of
what it has to price is in `HANDOFF-M15.md` section 4 and **this fixlist adds three more to it**:
C1 (tumours cost energy), C2 (tumour cast range becomes a real limit) and C3 (a 30% creep speed
bonus). C3 is the largest single balance change proposed in either fixlist.
