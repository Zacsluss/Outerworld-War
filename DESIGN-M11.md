# M11 — the spiritual successor

Chosen from a 25-idea brainstorm on 2026-09-09. Fifteen in, nine out, one deferred. This file is the
contract: what was picked, why, what it touches, and in what order. Anything not listed here is out of
scope, and "out" is a decision, not an oversight.

The three-word version: **attrition, position, consequence.** Every accepted idea pushes toward a game
where losses are permanent, where *where* a unit stands matters as much as what it is, and where the
map remembers what happened on it.

---

## In

| # | Idea | Touches | Risk |
|---|---|---|---|
| 25 | Supply cap 200 -> 500 | data | low |
| 24 | Cut the hard-counter matrix: roles, not counters | data, combat | **high** |
| 2 | Veterancy with scars -- ranks that stick, damage that does not fully heal | sim, render | medium |
| 6 | Directional armour -- rear and flank hits hurt more | sim, combat | medium |
| 7 | Suppression, as a per-unit unlock researched at the building that trains it | data, sim, ui | medium |
| 1 | Attrition economy -- finite minerals that visibly strip the ground | sim, render | medium |
| 9 | Terrain destruction -- craters and wreckage that block pathing and sight | sim, render | **high** |
| 5 | Fog that lies -- explored ground shows its last known state, not the truth | sim, render | medium |
| 11 | Readable weapon arcs and reload cadence | render, sim | low |
| 19 | Weather and day/night -- sight and air movement under real pressure | sim, render | medium |
| 15 | Diegetic UI, one per race, that takes damage and glitches | ui, hud | medium |
| 16 | Audio that changes when a fight starts and when it ends | audio | low |
| 17 | Unit flavour kept and pushed further -- more thematic, not less | data, audio | low |
| 14 | Morally weighted objectives, remembered quietly | missions | medium |
| 13 | **Deferred to last.** Campaign attrition: losing a facility closes that branch for good | missions | **high** |

## Out, and why

- **4 supply as morale** -- superseded by 25. A 500 cap and a morale system are two answers to one question.
- **8 siege ammunition** -- logistics without supply lines (18, also out) is a chore, not a decision.
- **10 routing** -- overlaps 2. Veterancy already makes a damaged unit a decision.
- **12 casualty ledger** -- 2 carries the attachment; a list of names is the weaker half.
- **18 supply lines** -- the biggest idea on the list and the biggest change to how a match is played.
  Out for now, and the one most worth revisiting.
- **20 asymmetric win conditions** -- would fork the balance work three ways before it has converged once.
- **21 persistent map between matches**, **22 commander abilities**, **23 cut worker micro** -- each a
  different game, not a better version of this one.

## Order, and the reason for it

Sequenced by blast radius, cheapest and most contained first, so each lands on a stable base.

1. **25** supply cap. One number.
2. **17** unit flavour. Data only, cannot break anything.
3. **16** combat audio state. Render-side, no stamp movement.
4. **11** weapon arcs and cadence. Mostly render.
5. **2** veterancy. New unit fields; snapshot picks them up automatically.
6. **6** directional armour. Combat maths, wants duel measurement.
7. **7** suppression tech. Data plus a research entry plus a status effect.
8. **5** fog that lies. Vision memory; the render half is the visible half.
9. **19** weather and day/night. A global clock that modulates sight and air speed.
10. **1** attrition economy. Resource depletion plus the visual scarring.
11. **9** terrain destruction. The hardest: pathing, vision and the chunk cache all move.
12. **15** diegetic per-race UI. Large but self-contained.
13. **24** cut hard counters. **Last of the mechanics**, because it invalidates every balance number
    and should land on top of everything else that also does.
14. **14** moral objectives, then **13** campaign attrition.

## Standing decisions

- **Balance measurement is suspended until 24 lands.** Ideas 25, 24, 2, 6, 7 and 1 each move balance on
  their own; measuring between them measures noise. One authoritative run at the end.
- **The eight invariants in HANDOFF.md still hold.** Determinism, sim/render separation and build-stamp
  scope are not negotiable for any of this.
- **Every sim change ships with a test.** M10 shipped a one-line build-script bug that cost Protoss its
  whole tech tree and was invisible to every existing check; test/aiscripts.js exists because of it.

---

# Wave two

A second 25-idea brainstorm, chosen 2026-09-09. Twelve in. These are additive: none of them replaces
anything in wave one, and the wave-one order still runs first.

| # | Idea | Touches | Risk |
|---|---|---|---|
| 23 | AI gets a **play style** as well as a difficulty | ai | low |
| 22 | Skirmish setup screen -- handicaps, starting resources, restrictions | ui | low |
| 25 | In-game unit codex: stats, roles, live damage calculator | ui, hud | low |
| 16 | Four map sizes that are different **rules**, not just dimensions | map, ui | medium |
| 11 | A field hospital and a jamming tower **for each race** | data, sim, art | medium |
| 15 | Walls for each race, thematically distinct | data, sim, art | medium |
| 20 | Hazard maps -- lava, sandstorms, drifting radiation | map, sim, render | medium |
| 19 | Vertical layers: high ground worth fighting for, ramps decisive | map, sim | **high** |
| 18 | Destructible and dynamic map features -- bridges, dams, rock formations | map, sim, render | **high** |
| 17 | Procedural maps with named archetypes | map, editor | **high** |
| 1 | Neutral hostile life, surfacing when you build near it, with a **visible tell** while buried | sim, ai, art | **high** |
| 8 | Derelict structures to capture and repair, **per-map toggle** | data, sim, map | **high** |

## Order for wave two

Cheap-and-contained first again, and the three map-generation items grouped so the terrain code is
opened once rather than three times.

1. **23** AI play styles. The tables already exist; this is mostly data.
2. **22** skirmish setup screen. Pure UI, and it is where 16, 8 and 23 all surface to the player.
3. **25** unit codex. Pure UI, and it is what makes wave one's depth visible.
4. **11** field hospital and jamming tower, then **15** walls. Both are new buildings on an existing
   pattern, so they go together.
5. **16** map sizes as modes, then **20** hazards, then **18** destructibles, then **17** archetypes.
   One pass over the map generator, in rising order of how much of it they rewrite.
6. **19** vertical layers. Touches pathing, vision and every sprite's ground contact.
7. **1** neutral life and **8** derelicts. Both need a third owner that is neither player nor ally, so
   they share that work and come last.

## Notes carried from the brainstorm

- **1** needs a tell while buried -- disturbed ground, a heat shimmer, something that reads as "do not
  expand here yet" without spelling it out. The horror only works if the player could have known.
- **8** is per-map because it changes the shape of a match: a map with derelicts rewards map control
  with tech, and that should be a property of the map, not a global rule.
- **23** is difficulty AND style, not style instead of difficulty. Turtle, rusher, expander, harasser,
  each at easy/normal/hard.

---

# Wave three

Chosen 2026-09-09 from a brainstorm framed against SC2, Beyond All Reason and Supreme Commander. Ten
new items; the rest of that list either duplicated wave one and two or was declined.

| # | Idea | Touches | Risk |
|---|---|---|---|
| W3-19 | Sound as information -- a distinct voice per weapon class, so off-screen fights are legible by ear | audio | low |
| W3-21 | No refunds, **on buildings only** -- cancelling construction returns nothing | sim, ui | low |
| W3-5 | Attack-move that prefers what threatens *you* over what is merely nearest | sim | medium |
| W3-18 | Weight -- recoil, settling, tracks, mass in how things start and stop | render, sim | medium |
| W3-9 | **Right-click-drag line formation**, as Beyond All Reason has it: drag a line, units space evenly along it | ui, sim | medium |
| W3-2 | Formations that hold their shape over distance | sim | medium |
| W3-6 | Fights you can read at scale -- silhouette and role legibility with hundreds of units | render | medium |
| W3-4 | Transport ferry routes that run themselves | sim, ui | medium |
| W3-24 | Branching replay: take control mid-replay and play the what-if | ui | medium |
| W3-1 | **Strategic zoom** -- seamless zoom to whole-map, icons replacing sprites | render, ui | **high** |

## Declined or already covered

- **W3-7 legible economy** and **W3-8 tiers that do not obsolete** -- already true. Two resources, visible
  income, no hidden ratios; the tech tree is Brood War-shaped so tier 1 stays relevant. The second is
  worth *verifying* rather than assuming, so a duel check for tier-1 contribution at high supply is
  queued with the balance work.
- **W3-11 facing**, **W3-12 veterancy with scars**, **W3-13 suppression** -- built already this milestone.
- **W3-3 orders that outlive the worker**, **W3-14 weather as tactical layer**, **W3-17 salvage** -- out.
  Note that wave one's idea 19 (weather and day/night) is still IN: it was chosen with full context and
  W3-14 was a restatement, so the earlier decision stands.
- **W3-10 terrain memory**, **W3-15 destructible chokes**, **W3-16 neutral life**, **W3-20 diegetic UI**,
  **W3-22 AI personalities**, **W3-23 skirmish setup** -- all already queued in waves one and two.
- **W3-25 codex** -- deferred pending a look at the layout. The shape proposed: a CODEX button beside
  SETTINGS on the main menu and F3 in game, opening one full-screen panel with race tabs, a unit list,
  and a detail pane carrying the sprite, the stats, what builds it, what it needs, and a live damage
  calculator that takes two units and shows real damage per hit including armour, size, upgrades and
  facing. Its purpose is to make invisible depth visible -- suppression, veterancy and directional
  armour currently have no surface at all.

## Order for wave three

Slotted into the existing plan rather than run after it: the cheap ones go first, the two that touch
movement (W3-9, W3-2) go together, and strategic zoom goes last of the render work because every other
render change has to land under it.

1. **W3-21** no building refunds, then **W3-19** weapon-class audio. Both are contained.
2. **W3-5** attack-move target preference.
3. **W3-9** drag-line formation and **W3-2** shape-holding formations, together: one pass over ordering.
4. **W3-18** weight, then **W3-6** legibility at scale.
5. **W3-4** ferry routes, then **W3-24** branching replay.
6. **W3-1** strategic zoom, last, after every other render change.


---

# Status, end of the overnight run (2026-09-09)

`node test/all.js` -- **26 checks, 0 failed**, 134 s wall clock. Thirteen suites existed when this
milestone started; there are twenty-six now, and every feature below shipped with one.

## Shipped

**Wave one** -- supply cap 500 (25), combat-aware music (16), reload cadence arcs (11), veterancy and
scars (2), directional armour (6), suppressing fire (7), voice flavour (17), sandstorm weather (19,
the day/night half is still open).

**Wave two** -- AI play styles (23), field hospitals, jamming towers and walls with working auras (11,
15), the four map sizes as different rules (16), hazards (20), destructibles and procedural archetypes
(18, 17), the unit codex (25).

**Wave three** -- no refunds on buildings (21), a voice per weapon class (19), threat-aware targeting
(5), the drag-line formation (9), formations that hold their shape (2), weight (18), legibility at
scale (6).

**Bugs found and fixed on the way**, none of which any existing test could see:
- a spider mine is `mech` but has no build cost, so repairing one produced NaN hit points that spread
  through every comparison they touched. Unreachable until the AI was taught to repair.
- scarring never fired in a real fight: `G.damage` subtracts hit points itself and never calls
  `damageRaw`, where the code lived. Thirty thousand frames across six matchups, zero scarred units.
- mined-out patches were dropped from the snapshot entirely, so a rejoining client sent workers to mine
  something the donor knew was gone. Second bug in that family; the first was M10's positional index.
- a build page holds exactly eight entries and nothing enforced it -- a ninth draws under Cancel and
  stays clickable.
- `HUD.panel` cached one texture, so with the pause menu open both it and the console were rebuilt from
  scratch every frame.
- `Voice.pick` was a modulo on unit id alone: every marine had one select line for its whole life. The
  attack-bark pool was never called at all, and the Zerg line arrays were empty.
- `FX.ambient`'s rate gate is simulation time evaluated once per drawn frame, so drift ran ~2.5x its
  intended density and was frame-rate dependent.

## Still open

| | |
|---|---|
| **24 cut the hard-counter matrix** | wave one, last mechanic by design -- it invalidates every balance number |
| **5 fog that lies** | wave one |
| **1 attrition economy**, **9 terrain destruction** (unit-facing half), **15 diegetic per-race UI** | wave one |
| **19 day/night** | the weather half shipped; the light half did not |
| **14 moral objectives**, then **13 campaign attrition** | wave one, last |
| **22 skirmish setup screen** | wave two -- the surface for AI styles, map sizes and derelicts |
| **19 vertical layers** | wave two, high risk |
| **1 neutral hostile life**, **8 capturable derelicts** | wave two, last: both need a third owner |
| **4 ferry routes**, **24 branching replay**, **1 strategic zoom** | wave three |

## Owed measurements

- **A full balance run.** Suspended by design until 24 lands. Every number in HANDOFF.md is stale: the
  AI has changed twice over (abilities, fog of war), and supply, veterancy, armour facing and
  suppression all move it.
- **Protoss sits on `citadel_of_adun` from minute four to minute eight** at supply 139 and still has no
  templar archives at seventeen. Most likely why PvT reads 66%.
- **Tier-1 relevance at high supply** -- promised as a check rather than an assumption.
- **Terrain-at-2x frame cost**, still never measured on a quiet machine.
