# M11 playtest guide

Everything accepted from the three brainstorms is built. Branch `m10-overnight`, 40 test suites green,
0 JS errors across scripted playthroughs. This is what to go and look at, and how to reach it.

**Start here:** most of wave two is invisible from the old menu. Click **SKIRMISH SETUP** on the main
menu — that screen is where map sizes, AI play styles, derelicts, wildlife, weather and day/night live.

---

## Wave one — attrition, position, consequence

- **Supply cap 500.** Armies get big. Tier-1 units stay on the field far longer.
- **Veterancy with scars.** Units rank up from kills — more damage, +1 armour at rank 2 — and damage
  they take leaves a permanent mark. A veteran unit is worth pulling out of a fight.
- **Directional armour.** Hits from the flank do 1.15×, from behind 1.35×. Flanking is a mechanic now,
  not a figure of speech. A tank line has a front that can be turned.
- **Suppression.** Sustained ranged fire pins a unit at 45% speed. Researched per-unit at the building
  that trains it.
- **Softened counters (0.65–1.0).** The big one. A wrong-target shot used to do a *quarter* damage;
  now it does 65%. Counters are still legible, but position, range, splash and facing decide fights.
- **Attrition economy.** Minerals are finite *and visible*: working a patch strips the ground around
  it permanently. You can read how long a base has been running off how bare the rock is.
- **Craters and wreckage.** Explosions permanently churn the ground (costs up to 25% movement speed).
  A razed building leaves a **hulk** that blocks pathing and sight for 90 seconds — a dead tank, 25s.
  Hulks clear; craters never do.
- **Fog that lies.** Explored ground shows its *last known* state. A building you scouted an hour ago
  is still drawn there whether or not it still exists. Only going back and looking corrects it.
- **Weather and day/night.** Sandstorms on some maps; night on others (try **Nightfall**). Night cuts
  sight to 75%, detectors to ~88%. There is a real light wash — the map visibly darkens and light
  pools around firing units.
- **Weapon arcs and reload cadence.** Fire is readable — you can see who is about to shoot.
- **Diegetic per-race UI.** The console is Terran stamped steel with amber phosphor, Zerg chitin and
  membrane, Protoss floating psionic glass. **It takes damage**: as you lose units and buildings it
  cracks, corrodes, bleeds and glitches. Lose badly and watch the HUD tear.
- **Combat audio state.** The soundscape changes when a fight starts and when it ends.
- **Unit flavour.** Five distinct weapon voices; per-unit lines.
- **Moral objectives + campaign attrition.** Three new missions (`t3` The Terrace, `z4` The Rearguard,
  `p4` Two Gates), each with a cheap answer and an expensive one, and nothing scores you. `t4` Cold
  Start reads your choices back. **Losing the Assembly in Two Gates closes Protoss air for the rest
  of the campaign.** Campaign missions are under the main menu.

## Wave two — the map is a player

- **Skirmish setup screen.** Per-opponent race, difficulty, **play style** and team; map size modes;
  procedural archetypes; weather, light, destructibles, derelicts and wildlife; starting bank; seed
  with a ROLL button, and a plain-English summary of what you are about to play.
- **AI play styles.** Standard / Turtle / Rusher / … — set per opponent.
- **Codex.** In-game manual with a damage calculator that reads the sim's own tables. **F3**, or the
  CODEX button on the main menu (that button was broken; it works now).
- **Four map sizes that are different rules**, not just different dimensions.
- **Vertical layers.** High ground now *matters*: +15% range and sight shooting down, and shooting
  **uphill does 30% less damage**. A ramp is neutral — halfway up you have gained nothing.
- **New buildings**: field hospital (heals) and jammer (shortens enemy sight, blinds detectors).
- **Walls** you can build. **Destructible map features**: rocks, bridges, spires, a floodgate whose
  channel floods for good once broken.
- **Hazards** — the sandstorm on `dustbowl`.
- **Neutral hostile life.** Carrion grubs, maws and warrens **buried** in the ground, on the expansions
  you want. A tell on the surface is your only warning — **no detector reveals them**. Walking wakes a
  grub; only building or mining wakes a maw. They guard their ground and do not chase you across the
  map. An awake warren starts breeding, so clearing a site early is cheaper than clearing it late.
- **Capturable derelicts.** A Foundry, an Archive and a Watchtower stand ruined and owned by nobody.
  **Send a worker to repair one and it becomes yours** (~30–65s solo, and it costs resources). The
  Foundry builds a **Sentinel** — a unit nothing else in the game can build. The Archive grants a
  permanent free armour level. The Watchtower gives 18 tiles of vision while you hold it. Your army
  will *not* auto-attack them, so you choose whether to take one or deny it.

## Wave three — feel and control

- **Strategic zoom.** Mouse wheel. Below 0.5 it swaps to icons and the whole map becomes one bitmap —
  zooming out is the *cheapest* state in the game. Zoom anchors on the cursor.
- **Ferry routes.** Select a transport, press **Y** (or the Ferry button), click a destination. It
  loads idle units where it stands, flies, unloads, and comes back — forever. It will not pick up a
  worker that has a job.
- **Branching replay.** Watch a replay, hit **Ctrl+B**, and take control from that frame. The AI keeps
  playing. Save afterwards and you get a *whole* game: the original opening, then your what-if.
- **Threat-aware targeting**, **no build refunds**, **unit weight and settle**, **drag-line formation**
  (drag with right-click to form a line), **formation shapes**, and legibility work at 400+ units.

---

## Quality-of-life keys

| key | does |
|---|---|
| `,` | select next idle worker |
| `Ctrl+A` | select all army |
| `Tab` | cycle subgroup |
| `Backspace` | centre camera on selection |
| `F3` | codex |
| `F10` | pause menu |
| `Y` | ferry route (transport selected) |
| wheel | zoom |
| `Ctrl+B` | take control of a replay |
| `Ctrl+V`, `[` `]`, `O` | in a replay: view all, switch player, production overlay |

## Known and deliberate

- **No balance run has been made, and every balance number in HANDOFF.md is stale.** Softening the
  counter matrix invalidated all of it, which is why it landed last. The run is waiting on your
  explicit go-ahead.
- A scripted 26,000-frame game left exactly one zergling idle inside a hatchery footprint. Pre-existing
  class of issue, benign, not chased.
