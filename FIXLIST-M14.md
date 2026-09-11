# FIXLIST-M14 — twenty-one locked items

**This list is the contract.** Every item below is either done to its acceptance criteria or explicitly
renegotiated with the user first. Nothing gets quietly dropped, narrowed, or marked done because
something adjacent got better.

Each entry carries four things, and the second one matters most: **what is true today was read out of
the code, not assumed.** One item turned out to be already built, and three have a different cause than
the report suggested. Those are marked.

Ticking an item requires: the acceptance criteria met, `node test/all.js` green, and — for anything
that changes behaviour — a test with a negative control (a check that fails when the change is
reverted).

**Legend:** ☐ open · ✅ verified already correct, no work · ⚠ cause differs from the report

---

## Decisions already taken

All four open questions were answered by the user and are folded into the entries below. Recorded here
so nobody re-opens them.

1. **Widow Mine (A3)** — model the **full SC2 arming delay** as well as burrow and unburrow times, with
   the upgrade that shortens it. Damage, splash radius and cooldown stay as they are; the user
   described the current profile — large radius, slow to shoot, explosive — as correct.
2. **Creep tumours (C3)** — the Queen **gains** the ability and the **Overlord keeps it**. Deliberately
   two sources, so tumours are available to more than one unit.
3. **Sensor Tower (C2)** — the AI **does** see the contacts. That makes them simulation state, so the
   item moves out of the interface group into Group C and **the build stamp moves**.
4. **Cyclone (C4)** — **keep the current numbers.** Firing on the move is a mobility change only; any
   cooldown or damage adjustment belongs to the gated balance run.

---

## Traceability — all 21, none lost

Nineteen entries cover twenty-one reported items, because items 1, 3 and 14 are one feature and are
done as one. **Every reported number appears in this table exactly once.**

| # | reported | entry | status |
|---|---|---|---|
| 1 | click a mineral node to see what is left | **B1** | ✅ done |
| 2 | double-click selects all of that building | **B2** | ✅ done |
| 3 | click a geyser / extractor to see gas left | **B1** | ✅ done |
| 4 | do Queens have Spawn Larva | **V1** | ✅ they do — verify by hand |
| 5 | creep tumours should come from the Queen | **C3** | ✅ done — two sources now |
| 6 | AI raids expansions, never pushes the main | **D1** | ☐ retreat exists; targeting is the fault |
| 7 | units are hard to click | **B3** | ✅ done |
| 8 | game over screen with menu / restart | **B4** | ✅ done — it was never appearing in a FFA |
| 9 | cannot build in undiscovered blackness | **C1** | ✅ done — soak and techtime both flat |
| 10 | dust storm has hard edges | **B6** | ✅ done |
| 11 | dust storm should not hurt units | **A2** | ✅ done |
| 12 | sensor tower shows movement as dots | **C2** | ✅ done |
| 13 | Reactor gives no prerequisite error | **A4** | ✅ done |
| 14 | hover ring on minerals and gas | **B1** | ✅ done |
| 15 | Starport shows add-on tech, dead page button | **B5** | ✅ done — one cause |
| 16 | freehand formation shapes | **C7** | ✅ done |
| 17 | every building needs a description | **A1** | ✅ done |
| 18 | Thor walks onto buildings | **C6** | ✅ done — it never did; it could not FIT |
| 19 | Cyclone should fire while moving | **C4** | ✅ done |
| 20 | Hellion beam hits everything in its path | **C5** | ✅ done — it did; three defects around it fixed |
| 21 | Widow Mine burrow time should match SC2 | **A3** | ✅ done |

---

# Group A — data only, no simulation risk

Four changes that cannot break each other. Independent, fast, and they build the habit of the test
gate before anything risky starts.

### ✅ A1 · (item 17) Every building and unit needs a short description

**Asked for:** the healing and jammer buildings have no descriptions; check *all* buildings — they
should all have one.

**True today:** there is no description field anywhere in the game. `grep -c "desc:" js/data.js` returns
**0** across all 73 buildings and every unit. The command-card tooltip
([js/hud.js:844](js/hud.js:844)) builds its lines from the label and the cost only — name, minerals,
gas, supply, build time, energy. Aid Station and Scrambler Mast are not special cases; nothing has one.

**Done means:**
- A `desc` field on **every** building in `DATA.buildings` and **every** unit in `DATA.units`, one or
  two sentences, saying what the thing is *for* — not restating its stats.
- The command-card tooltip renders it under the cost line, wrapped.
- The codex screen shows it too.
- A test asserts **every** def has a non-empty `desc` under ~200 characters, so a def added later
  cannot ship without one. That test is the negative control: delete one `desc` and it must go red.

**Where:** `js/data.js`, [js/hud.js:828-846](js/hud.js:828), `js/codex.js`.

**Watch:** `test/version.js` reaches into `js/data.js` **by source text** to prove an edit moves the
build stamp. Adding a field to every def is a large edit to that file — re-run it and make sure it is
still testing what it thinks it is.

---

### ✅ A2 · (item 11) The dust storm must not damage units

**Asked for:** the dust storm should be visual only.

**True today:** it deals real damage. `MapModes.sandstorm(span, dps = 3)`
([js/map.js:166](js/map.js:166)) returns a hazard with `dps: 3`, and the comment above it reasons
explicitly about Protoss shield regeneration outpacing "a 3-a-second storm".

**Done means:**
- The sandstorm applies **zero** damage to any unit, any race, any armour type.
- The warning message, the visual and the timing all stay exactly as they are — this removes the
  damage, not the weather.
- The `safe` radius around starting bases becomes irrelevant to damage. Keep it if the renderer uses it,
  delete it if nothing does. **Do not leave a dead field.**
- A test asserts a unit standing in the storm for a full sweep loses no hit points. Negative control:
  restore `dps` and it must go red.

**Where:** [js/map.js:163-215](js/map.js:163), and wherever `hazard.dps` is consumed.

**Do this before B6** — there is no point tuning how a thing looks while its behaviour is about to
change.

---

### ✅ A3 · (item 21) Widow Mine burrow, arming and unburrow timing to match StarCraft II

**Asked for:** pre- and post-upgrade burrow times matching SC2. **Decision: model the arming delay too.**

**True today:** the Widow Mine ([js/data.js:159](js/data.js:159)) reuses the Lurker's `burrowOnly`
mechanism and the generic `burrow` toggle. It has **no burrow duration, no arming delay and no
upgrade** — it fires as soon as it is dug in.

Its current combat profile is `W(40, 'explosive', 5, 90, { burrowOnly: true, targets: 'both', splash:
[0.7, 1.2, 1.8] })` — 40 explosive damage, range 5, a 90-frame (3.75 s) cooldown, and splash out to 1.8
tiles. **The user confirmed this profile is right and it is explicitly out of scope**: large radius,
slow to shoot, explosive.

**Done means:**
- Burrow duration, **arming delay**, and unburrow duration all modelled, as **named constants** with the
  SC2 figure each one is matching noted in a comment beside it.
- The mine **cannot fire during the arming delay**, and that is visible — a player must be able to tell
  an armed mine from one still digging in.
- The upgrade (SC2's Drilling Claws) exists, is researchable from a real building, and measurably
  shortens the timings.
- **Damage, splash and cooldown are not touched.** If a timing change looks like it wants a damage
  change, that is the balance run's call.
- A test asserts the base and upgraded durations and that a shot fired inside the arming window does
  not land. It **reads the constants, never the literals** — this repo has been bitten by that twice.

**Where:** [js/data.js:159-160](js/data.js:159), `js/abilities.js` (burrow toggle), `js/combat.js`.

---

### ✅ A4 · (item 13) The Reactor gives no error when its prerequisites are unmet

**Asked for:** an error when you try to build a Reactor too early.

**True today:** `B('reactor', …)` ([js/data.js:748](js/data.js:748)) declares `parent: 'barracks'` and
**no `req` array at all**. `G.queueAddon` checks `p.hasReq(ad)`, which passes trivially against an empty
requirement list, so nothing is ever refused and nothing is ever said.

**Done means:**
- The Reactor's real prerequisite expressed in data as a `req`.
- Attempting it without that prerequisite produces the **existing** red message every other unmet
  requirement produces (`p.msg('Requires ' + p.missingReq(def), 'error')`) — not a new format.
- **Audit every other addon and building for the same hole.** This is a class of bug, not one instance:
  any def gated by convention rather than by `req`. List what the audit found in the commit, even if
  the answer is "nothing else".
- A test asserts the refusal and the message. Negative control: remove the `req` and it must go red.

**Where:** [js/data.js:746-748](js/data.js:746), `js/game.js` (`queueAddon`).

---

# Group B — interface and rendering

**None of these may move the build stamp** (`js/build.js` hashes simulation functions only; render, HUD
and input are deliberately excluded). Run `node test/version.js` after each.

### ✅ B1 · (items 1, 3, 14) Mineral patches and geysers: click to inspect, hover to highlight

**Asked for:** click a mineral node to see how many minerals are left; click a gas patch for gas
remaining; clicking a built extractor/refinery/assimilator shows it too; hovering either shows a 50%
transparent ring so you know you are over it.

**True today:** `UI.unitAt` ([js/ui.js:251](js/ui.js:251)) iterates `G.units` only. Mineral patches and
geysers live in `G.map.resources`, not `G.units`, so they are **unreachable by any click** — a missing
feature, not a broken one. Each resource already carries `amount` and `start`
([js/map.js:656-662](js/map.js:656)), so the data is there.

**Done means:**
- Left-clicking a mineral patch or a geyser selects it; the console shows its name and **remaining
  amount**.
- Clicking a completed Refinery / Extractor / Assimilator shows the remaining gas of the geyser beneath
  it, in the same place.
- Hovering a patch or geyser draws a **50% transparent ring** sized to the resource, matching the rally
  ring's look, so the hover is unambiguous before the click.
- A selected resource **cannot be issued a command** as if it were a unit, and never enters a control
  group.
- Amounts respect fog: a patch never explored shows nothing.

**Where:** `js/ui.js` (`unitAt`, `hover`, `select`), `js/hud.js` (console panel), `js/render.js` (ring).

---

### ✅ B2 · (item 2) Double-clicking a building selects all of that building on screen

**Asked for:** double-clicking any building should select all instances of it.

**True today:** the behaviour exists and is **explicitly switched off for buildings**.
[js/ui.js:319](js/ui.js:319) reads `now - this.lastClick < 350 && this.lastClickUnit === t && t.owner === G.human && !t.isBuilding`. The `!t.isBuilding` clause is the whole fix. `Ctrl`-click on the same
line already does select-all-of-type and does **not** exclude buildings, which shows the exclusion is
unmotivated rather than load-bearing.

**Done means:**
- Double-clicking one of your buildings selects every building of that type **currently on screen**,
  matching the unit behaviour exactly — same 350 ms window, same on-screen restriction.
- Verify specifically that "select all barracks, press the unit key once" now works in two actions,
  since M12's multi-building production already routes a key to the shortest queue.
- A test asserts it. Negative control: restore `!t.isBuilding` and it must go red.

**Where:** [js/ui.js:319](js/ui.js:319).

---

### ✅ B3 · (item 7) Units are hard to click — widen the hit area to match the sprite

**Asked for:** the clickable area is smaller than the visible model; expand it to fit.

**True today:** `unitAt` uses `d <= Math.max(u.r + 4, Render.iconH(u) * 1.4)` — a circle around the
unit's centre from its collision radius. `u.r` is a **simulation** radius (9 for a Widow Mine, 20 for a
Thor) with no relationship to how tall the sprite is drawn, so tall and wide models under-report badly.

**Done means:**
- The hit area derives from the **drawn sprite's** footprint, not from `u.r`.
- Every unit is selectable by clicking anywhere on the part of it you can see.
- Overlapping units still resolve to the nearest centre — widening must not make clicking into a clump
  *worse*.
- **`u.r` must not change.** It drives pathing, collision and combat, and touching it would move the
  build stamp and alter the simulation.
- A test asserts a click at the visual top edge of a tall unit (Thor, Colossus, Battlecruiser) selects
  it. Negative control: revert to `u.r + 4` and it must go red.

**Where:** [js/ui.js:251](js/ui.js:251), `js/render.js` (`iconH` and sprite metrics).

---

### ✅ B4 · (item 8) A defeat screen with Return to Menu and Restart

**Asked for:** a game-over screen with "return to menu" and "restart" buttons.

**True today — partly built.** The screen exists: `if (G.over && !this.menu) this.menu = 'over';`
([js/ui.js:141](js/ui.js:141)) and the panel at [js/ui.js:1058](js/ui.js:1058) renders `DEFEAT`, a stats
table, and three items — *Continue playing*, *Save replay*, *Return to main menu*. **There is no
Restart.**

**Done means:**
- A **Restart** item that begins a new game with the identical setup — same map, same seed, same
  opponents, races, difficulty and styles — without going through the lobby.
- **Find out why the user is not seeing the screen.** Check whether `G.over` is actually set when the
  human is eliminated while an AI-vs-AI game continues ([js/game.js:1084](js/game.js:1084)). If it is
  not, that is the real fault and it is part of this item.
- Both buttons work from the DEFEAT and the VICTORY version.
- A test asserts Restart produces a game with the same seed and setup.

**Where:** [js/ui.js:141](js/ui.js:141), [js/ui.js:1058](js/ui.js:1058),
[js/game.js:1084](js/game.js:1084).

---

### ✅ B5 · (item 15) The Starport shows its add-on's tech and has a dead page button

**Asked for:** the "more 1/2" button does nothing; hovering shows "Apollo Reactor" if a Control Tower
is built; a Terran main building should not show tech belonging to its attached add-on.

**True today:** two faults reported together and probably one cause — a card built from the parent's
list plus the add-on's, long enough to paginate, with a page button that does not advance.

**Done means:**
- Terran production buildings show **only their own** abilities and tech. Add-on research appears on the
  add-on when the add-on is selected.
- The page button either advances correctly or does not appear at all.
- **Audit all five add-ons** — Machine Shop, Control Tower, Comsat Station, Physics Lab, Reactor — and
  all their parents: Barracks, Factory, Starport, Science Facility.
- A test asserts a Starport with a Control Tower shows no Control Tower research on its own card.
  Negative control: put it back and it must go red.

**Where:** `js/hud.js` (`currentCard`), `js/data.js` (`tech:` arrays on buildings).

---

### ✅ B6 · (item 10) The dust storm has hard edges

**Asked for:** dither or blend the edges so it looks like a real storm starting and tapering off.

**True today:** drawn from `GameMap.hazardState(G.frame)` ([js/render.js:532](js/render.js:532)) as a
band `band` tiles deep with a hard leading and trailing edge. The render is a milestone old and was
written as "the least possible version of a hazard".

**Done means:**
- Leading and trailing edges fade over a distance rather than switching at a tile boundary — gradient,
  dither or noise mask, whichever reads better in motion.
- Intensity ramps up as the front arrives and tapers as it leaves.
- **Hazard state stays a pure function of the frame number.** [js/render.js:474](js/render.js:474) is
  explicit that the renderer is READ ONLY on it, so a seek or a rejoin reproduces the storm exactly.
  No render-side accumulation, no `Math.random()`.
- **A2 first.**

**Where:** [js/render.js:470-540](js/render.js:470).

---

# Group C — simulation changes

Each moves the build stamp. Each needs `node test/all.js` green and a negative control. C1 and C2 are
both vision and are done as one stretch.

### ✅ C1 · (item 9) You must not be able to build in unexplored blackness

**Asked for:** cannot build where fog is pure black/undiscovered; error at the bottom of the screen
saying "You can't build here until it is explored".

**True today:** `GameMap.canPlace` checks terrain, occupancy, creep and psi — there is **no explored
test**. `G.explored(player, tx, ty)` already exists and is used for building visibility in `unitAt`.

**Done means:**
- `canPlace` refuses any footprint overlapping a tile the player has never explored, with the message
  **"You can't build here until it is explored"** verbatim.
- The placement ghost shows red over unexplored ground, before the click.
- A footprint straddling the boundary is **refused**; say so in the comment so the choice is deliberate.
- Explored-but-currently-fogged ground is still **allowed** — those are different states and only the
  first is blocked.
- **The AI must respect it too, and this is the risk.** `AI.findSpot` spirals outward calling
  `canPlace`; a new refusal reason can make it fail to place buildings it places today. **Re-run
  `node test/soak.js` and `node test/techtime.js 20 1,5,11 vs` and compare against the numbers in
  `HANDOFF-M14.md` before calling this done.**
- A test asserts refusal on unexplored ground and success on fogged-but-explored ground.

**Where:** `js/map.js` (`canPlace`), `js/ui.js` (ghost), `js/ai.js` (`findSpot`).

---

### ✅ C2 · (item 12) The Sensor Tower shows enemy movement as contacts, not vision

**Asked for:** see enemy *movement* as dots without illuminating the whole sight range.
**Decision: the AI sees the contacts too, so this is simulation state and the stamp moves.**

**True today:** `B('sensor_tower', …)` ([js/data.js:735](js/data.js:735)) has plain `sight: 16` — an
ordinary vision source with a large radius. It simply reveals the map. There is no contact mechanic.

**A contact is a blip: position only, no identity.** You learn that something moved there — a dot on the
terrain and on the minimap — not what it is, not its health, and you cannot target it. It disappears
when the thing stops.

**Done means:**
- The tower's radius **no longer grants normal vision**. Fog inside it stays fogged; terrain stays as
  explored or unexplored as it already was.
- Enemy units **moving** inside the radius render as dots, on the main view and the minimap, with no
  identity, no health bar, and no targetability.
- Stationary and burrowed enemies do not appear. It is a movement detector.
- The tower keeps a small ordinary sight radius on its own footprint so it is not blind.
- **The AI reads contacts** — they feed the intel model (`observe`, `readEnemy` in `js/ai.js`) the same
  way vision does, but as position-only information. It must not be able to infer unit types from them.
- Contacts are **derived from simulation state deterministically** — no `Math.random()`, reproducible
  on a replay seek and a rejoin.
- A test asserts an enemy inside the radius is **not** `G.canSee`-visible but **does** produce a contact,
  and that a stationary one produces none. Negative control: restore `sight: 16` and it must go red.

**Where:** [js/data.js:735](js/data.js:735), `js/game.js` (vision), `js/ai.js` (intel model),
`js/render.js`, `js/hud.js` (minimap).

---

### ✅ C3 · (item 5) Creep tumours come from the Overlord — the Queen should have it too

**Asked for:** "how are creep tumors made? from our queen unit? this is how it should be."
**Decision: the Queen gains it and the Overlord keeps it — two sources on purpose.**

**True today — the report is right that this is wrong, but not about the cause.** `plant_tumour` is on
the **Overlord** ([js/data.js:253](js/data.js:253), beside `unload` and `overseer_aspect`). The Queen's
list ([js/data.js:273](js/data.js:273)) is `['larva_inject', 'parasite', 'ensnare', 'spawn_broodling',
'infest']` — **no tumour at all**. A finished tumour seeds one child through the separate `spawn_tumour`
ability on the tumour building itself ([js/data.js:824](js/data.js:824)).

**Done means:**
- The Queen can plant a creep tumour on key `C`, matching StarCraft II.
- The Overlord **keeps** `plant_tumour`, unchanged.
- The Queen's ability list ordering is deliberate — [js/data.js:264](js/data.js:264) says so explicitly
  and `larva_inject` must stay first. **Read that comment before inserting anything.**
- The tumour→tumour chain (`spawn_tumour`, one child each) is unchanged.
- `test/zerg12.js` asserts tumours spread and stay bounded at ≤8 per game. It must stay green, and the
  bound must still hold now that there are **two** sources — that is the regression risk.
- **Check whether the AI ever plants one.** `AI.macro`'s Zerg branch does not appear to; if it does not,
  making it do so is part of this item.

**Where:** [js/data.js:253,264,273,824,1227](js/data.js:253),
[js/abilities.js:228,523](js/abilities.js:228), `js/ai.js` (Zerg macro).

---

### ✅ C4 · (item 19) The Cyclone should fire while moving

**Decision: keep the current numbers.** Mobility only.

**True today:** `U('cyclone', …)` ([js/data.js:144](js/data.js:144)) has an ordinary
`gw: W(14, 'explosive', 6, 22, { targets: 'both' })`. Nothing marks it able to fire on the move, and the
engine halts a unit to shoot.

**Done means:**
- The Cyclone attacks without halting, at full move speed, against ground and air.
- Expressed as a **flag on the weapon or the unit** — not a Cyclone special case in the combat loop — so
  the next unit that needs it costs one field, not another branch.
- **Damage, range and cooldown unchanged.** Any adjustment is the gated balance run's call.
- A test asserts the Cyclone's position keeps changing across an attack and a Goliath's does not. The
  Goliath half is the negative control.

**Where:** [js/data.js:144](js/data.js:144), `js/combat.js`, `js/sim.js` (attack order).

---

### ✅ C5 · (item 20) The Hellion's line attack works — it is drawn as Lurker spines

**Asked for:** the hellion's shot is a beam that hits all units in its path.

**True today — the mechanic is already there and correct; the visual is borrowed from another unit.**
The Hellion has `gw: W(9, 'concussive', 5, 30, { line: true, … })`
([js/data.js:137](js/data.js:137)), and `w.line` **is** implemented at
[js/combat.js:17-20](js/combat.js:17): it damages every non-flying enemy whose perpendicular distance
from the firing line is within its own radius, along the whole length. The code comment reads *"a line
hits everything along it at once"*. The user is very likely seeing correct damage and an unrecognisable
effect.

The effect pushed is `{ kind: 'spines' }`, written for the Lurker, and the branch's own comment says
*"Lurker spines along a line"*. A Hellion firing draws subterranean spines rather than flame.

Two real defects sit in that same branch:
- **The length is a hardcoded `6 * TILE`** regardless of the weapon's range. The Hellion's range is
  **5**, so its line reaches a full tile further than the weapon says it can.
- **`o.fly` is excluded by the shared branch** rather than by either weapon.

**Done means:**
- **Confirm the damage with a probe first** — fire one Hellion into a row of five and count how many
  take damage. The fix differs completely depending on that number. Do not edit `js/combat.js` until it
  is on screen.
- The Hellion renders as a **flame beam or cone**, visually distinct from Lurker spines. Effect kind
  chosen per weapon, not shared by accident.
- The line's length comes from **the weapon's range**, not a literal. Verify this does not silently
  change the Lurker, whose range may be the 6 that was baked in.
- Friendly fire decided explicitly and commented. Today allies are skipped.
- A test asserts N units in a line all take damage from one shot, and that the line stops at the
  weapon's range. Negative control: remove `line: true` and the first must go red.

**Where:** [js/data.js:136-137](js/data.js:136), [js/combat.js:17-20](js/combat.js:17),
[js/fx.js:198](js/fx.js:198).

---

### ✅ C6 · (item 18) The Thor walks onto buildings — audit pathing for all units

**Asked for:** the Thor gets stuck walking on buildings; check pathing for all units and ensure they
path around.

**True today:** the map keeps a `blocked` array ([js/map.js:578](js/map.js:578)) with building and
resource occupancy, so the data exists. The Thor is the largest ground unit in the game — `r: 20`
([js/data.js:166](js/data.js:166)) — which points at a **footprint-versus-radius** fault: a path found
for a point is not traversable by a body forty units wide.

**Done means:**
- **Build the probe first.** Walk one of every ground unit past a building on a fixed seed and record
  how many end inside a footprint or stuck. That table is the measurement; the fix follows it.
- No ground unit ends a move standing inside a building footprint.
- Large units path around buildings with clearance for their radius, not for a point.
- `maxStuck` in `test/eightplayer.js` (asserted `< 400`) must not get worse.
- A test asserts the Thor specifically — the reported case and the widest unit.

**Where:** `js/map.js` (pathing, `blocked`), `js/sim.js` (movement, `stuck`).

---

### ✅ C7 · (item 16) Freehand formation shapes

**Asked for:** enhance the right-drag formation line so the exact path of the mouse forms any shape —
parabolas, arcs, curves.

**True today:** right-drag produces a straight line with a live pip per selected unit
([js/ui.js:313](js/ui.js:313), `LINE_MIN`). It works well and the user says so.

**Done means:**
- The drag samples the mouse path and distributes the selected units **along the drawn curve**, evenly
  by arc length, keeping the live preview with one pip per unit.
- A straight drag still produces exactly today's straight line — this extends the feature, it does not
  replace it.
- **Determinism is the whole risk.** The formation resolves into orders that enter the command log and
  must replay identically. The sampled path is **quantised and sent as command data**, never re-derived
  from mouse state at replay time. Nothing may use `Math.random()`.
- Very long or self-intersecting drags are bounded; the cap is chosen and commented.
- A test asserts a curved drag replays bit-identically. **That is the negative control that matters.**

**Where:** [js/ui.js:313](js/ui.js:313), `js/commands.js`, `test/formation.js`.

**Last in Group C on purpose** — it is the only item that writes to the command log.

---

# Group D — AI behaviour

### ☐ D1 · (item 6) The AI raids expansions and never commits to the main

**Asked for:** if they attack, they should push until they believe they will lose, then retreat.

**True today — the retreat half already exists; the targeting half is the fault.** `AI.pickTarget`
scores every seen enemy building by `distance − (depot ? 8 tiles : 0) + (nearby defenders × 10 tiles)`
and takes the minimum. An expansion is both **closer** and **less defended** than a main, so it wins
essentially always. Worse, the target is re-picked the moment it dies, so after razing one expansion the
army takes the next nearest thing — **it never commits to a base.**

The retreat rule is already there and already measured: `gutted` (a fifth of the wave dead) or
`outgunned` (local enemy strength greater than the wave by 1.43× while taking hits), with a regroup
timer. The comment records that 0.8 beat 0.7 and 0.55 outright.

**Done means:**
- Once a wave commits to a base it **finishes that base** — hall and production — before re-targeting,
  unless the retreat rule fires.
- The main is a legitimate target rather than one that loses to distance forever. Guarded targets should
  cost something, not be effectively excluded.
- **The existing retreat behaviour is preserved. Do not retune `gutted`/`outgunned` in the same change**
  — they carry measured numbers, and mixing the two makes the result unreadable.
- **Measure first.** Add a probe recording, per wave: what it targeted, what it killed, whether it
  retreated and why. Every AI fix in M13 that started from a measurement was right the first time;
  every one that started from a hypothesis had to be reverted.
- **Re-run `test/aistyles.js` on seeds 1, 5 and 11.** It runs one seed by default and hid a real
  behaviour change last session.
- Acceptance, by hand: in a `vs` game the AI destroys a main it has committed to, or retreats from it
  for a stated reason. Use the reveal recipe in `PLAYTEST-M13.md`.

**Where:** `js/ai.js` (`pickTarget`, `army`), `test/aistyles.js`, `test/aiaudit.js`.

---

# Already correct — verify and close

### ✅ V1 · (item 4) Queens already have Spawn Larva

`A('larva_inject', 'Spawn Larva', 'L', 'unit', { energy: 25, range: 4, delay: 240, cap: 3 })`
([js/data.js:1226](js/data.js:1226)), and it is **first** in the Queen's ability list
([js/data.js:273](js/data.js:273)) — the comment at [js/data.js:264](js/data.js:264) says the ordering is
deliberate. The Queen flies, has 200 energy, and the ability fills a hatchery to the same cap of 3 that
natural larva production uses.

**To close:** confirm by hand — build a Queen, select it, press `L` on a hatchery, watch larvae appear
after the delay. If it does not work it is a *bug in an existing feature* and earns its own entry. It is
documented as working in `PLAYTEST-M12.md`.

---

# Order of work, and why

**A → B → C → D.** Strictly increasing risk, strictly decreasing independence.

- **Group A** — four data changes that cannot interact. A2 before B6 so the storm's look is tuned
  against final behaviour.
- **Group B** — interface only; **the build stamp must not move**, so run `node test/version.js` after
  each. **B1, B2 and B3 all edit `UI.unitAt` and its callers, so they are one pass and one commit** —
  three separate passes over the same function would conflict.
- **Group C** — simulation. C1 and C2 are both vision and are done together. C1 is first because it
  touches `AI.findSpot`, and the AI numbers in `HANDOFF-M14.md` must be re-checked against it before
  anything else moves them. C5 starts with a measurement rather than an edit. C7 is last because it is
  the only item that writes to the command log.
- **Group D** is last and sits immediately before M14's original step 1, the composition ratchet. Both
  are AI, both need the same measure-first discipline, and `test/ledger.js` serves both.

**The balance run stays gated and stays last.** C4, C5, C6 and D1 all change combat or army behaviour
and invalidate it further.

---

# Standing rules for every item

From `CLAUDE.md`, and every one of them earned its place in M13:

- **`node test/all.js` is the gate before every commit.** Green means green. One M13 change fixed a real
  fault and was reverted anyway because it turned one marginal assertion red.
- **Measure before fixing.** Four M13 changes were regressions found by measurement within minutes of
  being written. Not one would have been found by reasoning.
- **Every new behaviour gets a negative control** — a check that fails when the feature is removed.
- **Determinism.** Never `Math.random()` in simulation code; use `G.rand()`.
- **Read the constant, never the literal.**
- **CRLF.** Every file here is CRLF; `git show` and `sed -i` both hand you LF.
- **Commit per entry**, or per group where entries share a function (B1–B3). A commit that fixes three
  unrelated items cannot be reverted when one of them turns out to be wrong.
