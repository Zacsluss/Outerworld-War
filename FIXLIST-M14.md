# FIXLIST-M14 — twenty-one locked items

**This list is the contract.** Every item below is either done to its acceptance criteria or explicitly
renegotiated with the user first. Nothing gets quietly dropped, narrowed, or marked done because
something adjacent got better.

Each entry carries four things, and the second one matters most: **what is true today was read out of
the code, not assumed.** Two items turned out to be already built, and one has a different cause than
the report suggested. Those are marked.

Ticking an item requires: the acceptance criteria met, `node test/all.js` green, and — for anything
that changes behaviour — a test with a negative control (a check that fails when the change is
reverted).

**Legend:** ☐ open · ✅ verified already correct, no work · ⚠ cause differs from the report

---

## Traceability — all 21, none lost

Nineteen entries cover twenty-one reported items, because items 1, 3 and 14 are one feature and are
done as one. **Every reported number appears in this table exactly once.**

| # | reported | entry | status |
|---|---|---|---|
| 1 | click a mineral node to see what is left | **B1** | ☐ |
| 2 | double-click selects all of that building | **B2** | ☐ |
| 3 | click a geyser / extractor to see gas left | **B1** | ☐ |
| 4 | do Queens have Spawn Larva | **V1** | ✅ they do — verify by hand |
| 5 | creep tumours should come from the Queen | **C2** | ⚠ they come from the **Overlord** |
| 6 | AI raids expansions, never pushes the main | **D1** | ☐ retreat exists; targeting is the fault |
| 7 | units are hard to click | **B3** | ☐ |
| 8 | game over screen with menu / restart | **B4** | ⚠ screen exists, **Restart** does not |
| 9 | cannot build in undiscovered blackness | **C1** | ☐ |
| 10 | dust storm has hard edges | **B7** | ☐ |
| 11 | dust storm should not hurt units | **A2** | ☐ it deals 3 dps today |
| 12 | sensor tower shows movement as dots | **B6** | ☐ it is plain vision today |
| 13 | Reactor gives no prerequisite error | **A4** | ☐ it has no `req` at all |
| 14 | hover ring on minerals and gas | **B1** | ☐ |
| 15 | Starport shows add-on tech, dead page button | **B5** | ☐ |
| 16 | freehand formation shapes | **C6** | ☐ |
| 17 | every building needs a description | **A1** | ☐ **nothing** has one |
| 18 | Thor walks onto buildings | **C5** | ☐ |
| 19 | Cyclone should fire while moving | **C3** | ☐ |
| 20 | Hellion beam hits everything in its path | **C4** | ⚠ it does — it is **drawn as Lurker spines** |
| 21 | Widow Mine burrow time should match SC2 | **A3** | ☐ |

---

## Group A — data only, no simulation risk

Fast, independent, and none of them can break anything else. Do these first.

### ☐ A1 · (item 17) Every building and unit needs a short description

**Asked for:** the healing and jammer buildings have no descriptions; check *all* buildings — they
should all have one.

**True today:** there is no description field anywhere in the game. `grep -c "desc:" js/data.js` returns
**0** across all 73 buildings and every unit. The command-card tooltip
([js/hud.js:844](js/hud.js:844)) builds its lines from the label and the cost only — name, minerals,
gas, supply, build time, energy. Aid Station and Scrambler Mast are not special cases; nothing has a
description.

**Done means:**
- A `desc` field on **every** building in `DATA.buildings` and **every** unit in `DATA.units`, one or
  two sentences, saying what the thing is *for* — not restating its stats.
- The command-card tooltip renders it under the cost line, wrapped.
- The codex screen shows it too.
- A test asserts **every** def has a non-empty `desc` shorter than ~200 chars, so a new def added later
  cannot ship without one. That test is the negative control: delete one `desc` and it must go red.

**Where:** `js/data.js`, `js/hud.js:828-846`, `js/codex.js`.

---

### ☐ A2 · (item 11) The dust storm must not damage units

**Asked for:** the dust storm should be visual only.

**True today:** it deals real damage. `MapModes.sandstorm(span, dps = 3)`
([js/map.js:166](js/map.js:166)) returns a hazard with `dps: 3`, and the comment above it explicitly
reasons about Protoss shield regeneration outpacing "a 3-a-second storm".

**Done means:**
- The sandstorm applies **zero** damage to any unit, any race, any armour type.
- The warning message, the visual, and the timing all stay exactly as they are — this removes the
  damage, not the weather.
- The `safe` radius around starting bases becomes irrelevant to damage; keep it if the renderer uses
  it for the visual, delete it if it does not. Do not leave a dead field.
- A test asserts a unit standing in the storm for a full sweep loses no hit points. Negative control:
  restore `dps` and it must go red.

**Where:** `js/map.js:163-215`, and wherever `hazard.dps` is consumed.

**Note:** do this before A6/B7 (the storm's soft edges) — there is no point tuning the look of a thing
whose behaviour is about to change.

---

### ☐ A3 · (item 21) Widow Mine burrow timing must match StarCraft II

**Asked for:** pre- and post-upgrade burrow times matching SC2.

**True today:** the Widow Mine ([js/data.js:159](js/data.js:159)) reuses the Lurker's `burrowOnly`
mechanism and the generic `burrow` toggle. It has no dedicated burrow/unburrow timing of its own and
no upgrade that changes it.

**Done means:**
- Burrow and unburrow durations set to the SC2 values, as data constants with the source noted in a
  comment beside them.
- The upgrade that shortens unburrow exists, is researchable, and actually changes the timing.
- A test asserts both the base and upgraded durations, reading **the constants, never the literals**.

**Where:** `js/data.js`, `js/abilities.js` (the burrow toggle).

**Open question for the user — ask before implementing:** SC2's Widow Mine has a 3-second *arming*
delay after burrowing and 1.07 s unburrow, with Drilling Claws removing the arming delay. Confirm
whether you want the arming delay modelled as well, or only the burrow/unburrow durations.

---

### ☐ A4 · (item 13) The Reactor gives no error when its prerequisites are unmet

**Asked for:** an error when you try to build a Reactor too early.

**True today:** `B('reactor', …)` ([js/data.js:748](js/data.js:748)) declares `parent: 'barracks'` and
**no `req` array at all**. `G.queueAddon` checks `p.hasReq(ad)`, which passes trivially against an
empty requirement list, so nothing is ever refused and nothing is ever said.

**Done means:**
- The Reactor's actual prerequisite is expressed in data as a `req`.
- Attempting it without that prerequisite produces the same red message at the bottom of the screen
  that every other unmet requirement produces (`p.msg('Requires ' + p.missingReq(def), 'error')`) —
  not a new message format, the existing one.
- **Audit every other addon and building for the same hole**, since this is a class of bug rather than
  one instance: any def whose availability is gated by convention rather than by `req`.
- A test asserts the refusal and the message. Negative control: remove the `req` and it must go red.

**Where:** `js/data.js:746-748`, `js/game.js` (`queueAddon`).

---

## Group B — interface and rendering, no simulation impact

None of these may move the build stamp (`js/build.js` hashes simulation functions only). B1–B3 all
touch the same hit-testing code and are done as one pass.

### ☐ B1 · (items 1, 3, 14) Mineral patches and geysers: click to inspect, hover to highlight

**Asked for:** click a mineral node to see how many minerals are left; click a gas patch for gas
remaining; clicking a built extractor/refinery/assimilator shows it too; hovering either shows a 50%
transparent ring so you know you are over it.

**True today:** `UI.unitAt` ([js/ui.js:251](js/ui.js:251)) iterates `G.units` only. Mineral patches and
geysers live in `G.map.resources`, not `G.units`, so they are **unreachable by any click** — this is a
missing feature, not a broken one. Each resource already carries `amount` and `start`
([js/map.js:656-662](js/map.js:656)).

**Done means:**
- Left-clicking a mineral patch or a geyser selects it and the console shows its name and **remaining
  amount**.
- Clicking a completed Refinery / Extractor / Assimilator shows the remaining gas of the geyser
  underneath it, in the same place.
- Hovering a patch or geyser draws a **50% transparent ring** sized to the resource, matching the rally
  ring's look, so the hover is unambiguous before you click.
- Selecting a resource must **not** allow any command to be issued against it as if it were a unit, and
  must not enter the selection group used by control groups.
- Amounts respect fog: a patch you have never explored shows nothing.

**Where:** `js/ui.js` (`unitAt`, `hover`, selection), `js/hud.js` (console panel), `js/render.js`
(the ring).

---

### ☐ B2 · (item 2) Double-clicking a building selects all of that building on screen

**Asked for:** double-clicking any building should select all instances of it.

**True today:** the behaviour exists and is **explicitly switched off for buildings**.
[js/ui.js:319](js/ui.js:319) reads `now - this.lastClick < 350 && this.lastClickUnit === t && t.owner === G.human && !t.isBuilding`. The `!t.isBuilding` clause is the whole fix. `Ctrl`-click on the same
line already does select-all-of-type and does *not* exclude buildings, which confirms the exclusion is
deliberate-looking but unmotivated.

**Done means:**
- Double-clicking one of your buildings selects every building of that type **currently on screen**,
  matching the existing unit behaviour exactly (same 350 ms window, same on-screen restriction).
- Multi-building production (M12) already routes a unit key to the shortest queue, so this should make
  "select all barracks, press M" work in two actions. Verify that specifically.
- A test asserts it. Negative control: restore `!t.isBuilding` and it must go red.

**Where:** [js/ui.js:319](js/ui.js:319).

---

### ☐ B3 · (item 7) Units are hard to click — widen the hit area to match the sprite

**Asked for:** the clickable area is smaller than the visible model; expand it to fit.

**True today:** `unitAt` uses `d <= Math.max(u.r + 4, Render.iconH(u) * 1.4)` — a circle around the
unit's centre based on its collision radius, not on the drawn sprite. `u.r` is a *simulation* radius
(9 for a Widow Mine, 20 for a Thor) and has no relationship to how tall the model is drawn, so tall or
wide sprites under-report badly.

**Done means:**
- The hit area is derived from the **drawn sprite's** footprint, not from `u.r`.
- Every unit is selectable by clicking anywhere on the part of it you can see.
- Overlapping units still resolve to the nearest centre, so clicking into a clump picks the obvious one
  — widening must not make dense selection *worse*.
- **This is a render-side measurement, so it must not change `u.r`.** Changing the collision radius
  would alter pathing, combat and the build stamp.
- A test asserts a click at the visual top edge of a tall unit (Thor, Colossus, Battlecruiser) selects
  it. Negative control: revert to `u.r + 4` and it must go red.

**Where:** `js/ui.js:251`, `js/render.js` (`iconH` and the sprite metrics).

---

### ☐ B4 · (item 8) A defeat screen with Return to Menu and Restart

**Asked for:** a game-over screen with "return to menu" and "restart" buttons.

**True today:** ⚠ **partly built.** The screen exists — `if (G.over && !this.menu) this.menu = 'over';`
([js/ui.js:141](js/ui.js:141)) and the panel at [js/ui.js:1058](js/ui.js:1058) renders `DEFEAT`, a stats
table, and three items: *Continue playing*, *Save replay*, *Return to main menu*. **There is no
Restart.**

**Done means:**
- A **Restart** item that begins a new game with the identical setup — same map, same seed, same
  opponents, same races, same difficulty, same styles — without going back through the lobby.
- Confirm the screen actually appears on defeat in a normal skirmish, not only on mission failure.
  The user reports not seeing it, so **check whether `G.over` is set when the human player is
  eliminated but the AI-vs-AI game continues**, and fix that if it is the real fault.
- Both buttons work from both the DEFEAT and VICTORY versions.

**Where:** [js/ui.js:141](js/ui.js:141), [js/ui.js:1058](js/ui.js:1058), `js/game.js:1084` (defeat).

---

### ☐ B5 · (item 15) The Starport's command card shows its add-on's tech and has a dead page button

**Asked for:** the "more 1/2" button does nothing; hovering shows "Apollo Reactor" if a Control Tower
is built; a Terran main building should not show tech that belongs to its attached add-on.

**True today:** two faults reported together, and they are probably one cause — a card built from the
parent's list plus the add-on's, long enough to paginate, with a page button that does not advance.

**Done means:**
- Terran production buildings show **only their own** abilities and tech. Add-on research appears on
  the add-on when it is selected.
- The page button either advances correctly or does not appear.
- **Audit all four Terran add-ons** (Machine Shop, Control Tower, Comsat Station, Physics Lab,
  Reactor) and all their parents — Barracks, Factory, Starport, Science Facility — not just the
  Starport.
- A test asserts a Starport with a Control Tower shows no Control Tower research on its own card.
  Negative control: put it back and the test must go red.

**Where:** `js/hud.js` (`currentCard`), `js/data.js` (`tech:` arrays on buildings).

---

### ☐ B6 · (item 12) The Sensor Tower should show enemy movement as dots, not reveal terrain

**Asked for:** see enemy *movement* as dots without illuminating its whole sight range.

**True today:** `B('sensor_tower', …)` ([js/data.js:735](js/data.js:735)) has plain `sight: 16` — it is
an ordinary vision source with a large radius, so it simply reveals the map like any other building.
There is no dot mechanic.

**Done means:**
- The Sensor Tower's radius **no longer grants normal vision**. Fog inside it stays fogged; terrain
  stays as explored or unexplored as it already was.
- Enemy units *moving* inside the radius render as **dots** — on the main view and on the minimap —
  with no identity, no health bar, and no ability to target them.
- Stationary and burrowed enemies do not appear. This is a movement detector.
- Its own footprint keeps a small ordinary sight radius so the building is not blind.
- A test asserts an enemy inside the radius is not `G.canSee`-visible but does produce a contact.

**Where:** `js/data.js:735`, `js/game.js` (vision), `js/render.js`, `js/hud.js` (minimap).

**Risk:** vision is simulation state. If the contact list is computed for rendering only and never read
by the simulation, the stamp must not move; if it becomes a real detection mechanic the AI can use, it
must. **Decide which before writing it, and say so in the commit.**

---

### ☐ B7 · (item 10) The dust storm has hard edges

**Asked for:** dither or blend the edges so it looks like a real storm starting and tapering off.

**True today:** the storm is drawn from `GameMap.hazardState(G.frame)`
([js/render.js:532](js/render.js:532)), a band `band` tiles deep with a defined leading and trailing
edge. The render is a milestone old and was written as "the least possible version of a hazard".

**Done means:**
- The leading and trailing edges fade in and out over a distance rather than switching at a tile
  boundary — a gradient, dither, or noise mask, whichever reads better in motion.
- Intensity ramps up as the front arrives and tapers as it leaves.
- **The hazard's own state stays a pure function of the frame number.** The comment at
  [js/render.js:474](js/render.js:474) is explicit that the renderer is READ ONLY on hazard state; a
  seek or a rejoin must reproduce the storm exactly. No render-side accumulation, no `Math.random()`.
- Do A2 first.

**Where:** `js/render.js:470-540`.

---

## Group C — simulation changes

Each moves the build stamp, each needs `node test/all.js` green, each needs a negative control.

### ☐ C1 · (item 9) You must not be able to build in unexplored blackness

**Asked for:** cannot build where fog is pure black/undiscovered; error at the bottom of the screen
saying "You can't build here until it is explored".

**True today:** `GameMap.canPlace` checks terrain, occupancy, creep and psi — there is **no explored
test**. `G.explored(player, tx, ty)` exists and is already used for building visibility in `unitAt`.

**Done means:**
- `canPlace` refuses any footprint that overlaps a tile the player has never explored, returning the
  message **"You can't build here until it is explored"** verbatim.
- The placement ghost shows red over unexplored ground, before the click.
- **The AI must respect this too, and this is the risk.** `AI.findSpot` spirals outward from a hall and
  calls `canPlace`; a new refusal reason could make it fail to place buildings it currently places, or
  slow the spiral down. **Re-run `node test/soak.js` and `node test/techtime.js 20 1,5,11 vs` and
  compare against the numbers in `HANDOFF-M14.md` before calling this done.**
- Partially-explored footprints: a building whose rectangle straddles the boundary is refused. Say so
  in the comment so the choice is deliberate.
- A test asserts refusal on unexplored ground and success on explored-but-currently-fogged ground —
  those are different states and only the first is blocked.

**Where:** `js/map.js` (`canPlace`), `js/ui.js` (placement ghost), `js/ai.js` (`findSpot`).

---

### ⚠ C2 · (item 5) Creep tumours come from the Overlord, not the Queen

**Asked for:** "how are creep tumors made? from our queen unit? this is how it should be."

**True today — the report is right that this is wrong, but the cause is not what it looks like.** The
`plant_tumour` ability is on the **Overlord** ([js/data.js:253](js/data.js:253), alongside `unload` and
`overseer_aspect`). The Queen's ability list ([js/data.js:273](js/data.js:273)) is `['larva_inject',
'parasite', 'ensnare', 'spawn_broodling', 'infest']` — **no tumour**. A finished tumour can seed one
child via `spawn_tumour`, which is a separate ability on the tumour building itself
([js/data.js:824](js/data.js:824)).

**Done means:**
- The Queen can plant a creep tumour, on key `C`, matching StarCraft II.
- **Decide explicitly and record the decision:** does the Overlord keep `plant_tumour` as well, or lose
  it? SC2 has Overlords *generate* creep, not plant tumours. Whichever is chosen, the reason goes in
  the comment.
- The tumour→tumour chain (`spawn_tumour`, one child each) is unchanged.
- `test/zerg12.js` already asserts tumours spread and stay bounded (≤8 per game); it must stay green,
  and its budget assertion must still hold from the new source.
- The AI must plant them from whatever the new source is — `AI.macro`'s Zerg branch currently does not
  plant tumours at all. **Check whether the AI ever plants one; if it does not, that is part of this
  item.**

**Where:** `js/data.js:253,273,824,1227`, `js/abilities.js:228,523`, `js/ai.js` (Zerg macro).

---

### ☐ C3 · (item 19) The Cyclone should fire while moving

**True today:** `U('cyclone', …)` ([js/data.js:144](js/data.js:144)) has an ordinary
`gw: W(14, 'explosive', 6, 22, { targets: 'both' })`. Nothing marks it as able to fire on the move, and
the engine stops a unit to shoot.

**Done means:**
- The Cyclone attacks without halting, at full move speed, against ground and air.
- It is expressed as a **flag on the weapon or the unit** — not a Cyclone special case in the combat
  loop — so the next unit that needs it is one field, not another branch.
- Its damage-per-second is unchanged; this is a mobility change, not a buff to the numbers. If moving
  fire is worth a cooldown adjustment, that is a **balance** question and belongs to the gated run.
- A test asserts the Cyclone's position keeps changing across an attack, and that a Goliath's does not.
  The Goliath half is the negative control.

**Where:** `js/data.js:144`, `js/combat.js`, `js/sim.js` (the attack order).

---

### ⚠ C4 · (item 20) The Hellion's line attack works — it is drawn as Lurker spines

**Asked for:** the hellion's shot is a beam that hits all units in its path.

**True today — the mechanic is already there and correct; the visual is borrowed from another unit.**
The Hellion has `gw: W(9, 'concussive', 5, 30, { line: true, … })`
([js/data.js:137](js/data.js:137)), and `w.line` **is** implemented at
[js/combat.js:17-20](js/combat.js:17): it damages every non-flying enemy whose perpendicular distance
from the firing line is within its radius, along the whole length — the code comment reads *"a line
hits everything along it at once"*. So the user is very likely seeing correct damage and an
unrecognisable effect.

The effect it pushes is `{ kind: 'spines' }`, written for the Lurker, and the branch's own comment says
so: *"Lurker spines along a line"*. A Hellion firing therefore draws subterranean spines rather than
flame.

Two real defects sit in that branch as well:
- **The length is hardcoded `6 * TILE`** regardless of the weapon's own range. The Hellion's range is
  **5**, so its line currently reaches a full tile further than the weapon says it can.
- **`o.fly` is excluded**, which is right for a Lurker and right for a Hellion, but it is asserted by
  the shared branch rather than by either weapon.

**Done means:**
- **Confirm the damage first with a probe**, because the fix differs completely depending on the
  answer: fire one Hellion into a row of five and count how many take damage. Do not start editing
  `js/combat.js` until that number is on screen.
- The Hellion renders as a **flame beam or cone**, visually distinct from Lurker spines. Effect kind
  chosen per weapon, not shared by accident.
- The line's length comes from **the weapon's range**, not a literal 6 — read the constant, never the
  literal. Verify this does not silently change the Lurker, whose range may be the 6 that was baked in.
- Friendly fire: decide explicitly and comment it. Today allies are skipped (`o.owner === a.owner`).
- A test asserts N units in a line all take damage from one shot, and that the line stops at the
  weapon's range. Negative control: remove `line: true` and the first must go red.

**Where:** [js/data.js:136-137](js/data.js:136), [js/combat.js:17-20](js/combat.js:17),
[js/fx.js:198](js/fx.js:198).

---

### ☐ C5 · (item 18) The Thor walks onto buildings — audit pathing for all units

**Asked for:** the Thor gets stuck walking on buildings; check pathing for all units and ensure they
path around.

**True today:** the map keeps a `blocked` array ([js/map.js:578](js/map.js:578)) with building and
resource occupancy, so the data exists. The Thor is the largest ground unit in the game (`r: 20`,
[js/data.js:166](js/data.js:166)), which points at a **footprint-vs-radius** fault: a path found for a
point can be untraversable for a body 40 units wide.

**Done means:**
- **Build the probe first.** Walk one of every ground unit past a building on a fixed seed and record
  how many end up inside a footprint or stuck. That table is the measurement; the fix follows it.
- No ground unit ends a move standing inside a building footprint.
- Large units path around buildings with enough clearance for their radius, not for a point.
- `maxStuck` in `test/eightplayer.js` (currently asserted `< 400`) must not get worse.
- A test asserts the Thor specifically, since it is the reported case and the widest unit.

**Where:** `js/map.js` (pathing, `blocked`), `js/sim.js` (movement, `stuck`).

---

### ☐ C6 · (item 16) Freehand formation shapes

**Asked for:** enhance the right-drag formation line so the exact path of the mouse forms any shape —
parabolas, arcs, curves.

**True today:** right-drag produces a straight line with a live pip per selected unit
([js/ui.js:313](js/ui.js:313), `LINE_MIN`). It works well and the user says so.

**Done means:**
- The drag samples the mouse path and distributes the selected units **along the drawn curve**, evenly
  by arc length, keeping the existing live preview with one pip per unit.
- A straight drag must still produce exactly today's straight line — this extends the feature, it does
  not replace it.
- **Determinism is the whole risk here.** The formation resolves into orders that go into the command
  log and must replay identically. The sampled path must be quantised and sent as command data, not
  re-derived from mouse state at replay time. Nothing may use `Math.random()`.
- Very long or self-intersecting drags are bounded — decide the cap and comment it.
- A test asserts a curved drag replays bit-identically. That is the negative control that matters.

**Where:** `js/ui.js:313`, `js/commands.js`, `js/formation` logic (see `test/formation.js`).

---

## Group D — AI behaviour

### ☐ D1 · (item 6) The AI raids expansions and never commits to the main

**Asked for:** if they attack, they should push until they believe they will lose, then retreat.

**True today — the retreat half already exists; the target half is the fault.**
`AI.pickTarget` ([js/ai.js](js/ai.js)) scores every seen enemy building by
`distance − (depot ? 8 tiles : 0) + (nearby defenders × 10 tiles)` and takes the minimum. An expansion
is both **closer** and **less defended** than the main, so it wins essentially always. Worse, the target
is re-picked the moment it dies, so after razing one expansion the army picks the next nearest thing —
it never commits to a base.

The retreat rule is already there and already measured: `gutted` (a fifth of the wave dead) or
`outgunned` (local enemy strength > wave × 1.43 while taking hits), with a regroup timer. The comment
records that 0.8 beat 0.7 and 0.55 outright.

**Done means:**
- Once a wave commits to a base, it **finishes that base** — the town hall and its production — before
  re-targeting, unless the retreat rule fires.
- The main base is a legitimate target rather than one that loses to distance forever. Guarded targets
  should cost something, not be effectively excluded.
- The existing retreat behaviour is preserved. **Do not retune `gutted`/`outgunned` in the same change**
  — they carry measured numbers and mixing the two makes the result unreadable.
- **Measure first, per `CLAUDE.md`.** Add a probe that records, per attack wave: what it targeted, what
  it killed, whether it retreated and why. Every AI fix last milestone that started from a measurement
  was right the first time; every one that started from a hypothesis had to be reverted.
- **Re-run `test/aistyles.js` on seeds 1, 5 and 11**, not just the default — it runs one seed and hid a
  real behaviour change last session.
- Acceptance: in a `vs` game, the AI destroys a main base it has committed to, or retreats from it for
  a stated reason. Watch it with the reveal recipe in `PLAYTEST-M13.md`.

**Where:** `js/ai.js` (`pickTarget`, `army`), `test/aistyles.js`, `test/aiaudit.js`.

---

## Already correct — verify and close, no work

### ✅ V1 · (item 4) Queens already have Spawn Larva

`A('larva_inject', 'Spawn Larva', 'L', 'unit', { energy: 25, range: 4, delay: 240, cap: 3 })`
([js/data.js:1226](js/data.js:1226)), and it is **first** in the Queen's ability list
([js/data.js:273](js/data.js:273)) — the comment there says the ordering is deliberate. The Queen flies
(`fly: true`), has 200 energy, and the ability fills a hatchery to the same cap of 3 that natural larva
production uses.

**To close:** confirm by hand — build a Queen, select it, press `L` on a hatchery, see larvae appear
after the delay. If it does not work, it is a *bug in an existing feature* and gets its own item. It is
documented as working in `PLAYTEST-M12.md`.

---

## Open questions to settle before starting

Answer these first; two of them change what gets built.

1. **A3** — should the Widow Mine's 3-second arming delay be modelled, or only burrow/unburrow times?
2. **C2** — when the Queen gains the creep tumour, does the Overlord keep it, lose it, or gain SC2-style
   passive creep generation instead?
3. **B6** — should the Sensor Tower's contacts be visible to the *AI* as well as to the player? That
   decides whether it is simulation state and whether the build stamp moves.
4. **C3** — is firing on the move worth a Cyclone cooldown change, or does the unit keep its current
   numbers and simply gain mobility?

---

## Order of work, and why

**A → B → C → D.** Data before interface before simulation before AI, because that is strictly
increasing risk and strictly decreasing independence.

- **Group A** is four data changes that cannot break each other. A2 (storm damage) comes before B7
  (storm edges) so the look is tuned against final behaviour.
- **Group B** is interface only and must not move the build stamp. B1, B2 and B3 all edit `UI.unitAt`
  and its callers, so they are **one pass, one commit** — three separate passes over the same function
  would conflict.
- **Group C** changes the simulation. C1 (fog) is first because it touches `AI.findSpot` and the AI
  numbers in `HANDOFF-M14.md` must be re-checked against it before anything else moves them. C4 starts
  with a measurement, not an edit, because `line: true` may already work.
- **Group D** is last and sits immediately before M14's original step 1 (the composition ratchet).
  Both are AI, both need the same measure-first discipline, and `test/ledger.js` serves both.

**The balance run stays gated and stays last.** Several items here — C3, C4, C5, D1 — change combat or
army behaviour and invalidate it further.
