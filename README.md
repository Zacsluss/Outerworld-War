# Brood War Remake

A from-scratch browser remake of StarCraft: Brood War's gameplay. Plain HTML5 canvas + JavaScript, no build step, no dependencies, no Blizzard assets. All art is generated at runtime: a noise-based Badlands-style tileset with cliff faces and doodads, pre-rendered unit and building sprites (16 facings x 8 walk frames x 5 attack frames, consistent lighting, team colours, animated building parts, death collapse), additive particle effects with blood/scorch decals and corpses, and a bevelled BW-style console with icon buttons and a custom cursor. Audio is synthesized.

## Run

```bash
node broodwar/test/serve.js 8765
```

Then open http://localhost:8765. (Opening `index.html` directly from disk also works in most browsers.)

## What is implemented

**Engine**
- Fixed-step simulation at 24 ticks/s ("Fastest" speed). All unit/building stats, costs, build times, ranges, cooldowns and speeds are in BW frames/tiles/pixels (`js/data.js`).
- 128x128 tile map (32 px tiles), 4-fold symmetric: high-ground mains with a ramp, naturals, third bases, a center plateau. Seeded, so `Map seed` gives you a fixed layout per number.
- A* pathfinding with string-pulling, soft unit separation, ground/air layers, building footprints that block paths.
- Fog of war with BW's high-ground rule (low ground cannot see up cliffs, ramps see only their level, flyers see everything).
- Cloak/burrow + detection (Overlord, Observer, Science Vessel, Turret, Spore, Cannon, Comsat scan, Arbiter cloaking field).
- Damage model: normal / concussive / explosive vs small / medium / large, armor, Protoss shields with shield upgrades, splash rings (100/50/25%), Mutalisk glaive bounce, Lurker line, friendly-fire rules per weapon.
- Economy: mineral fields (1500) with one worker per patch, geysers (5000, 2 gas when depleted), one worker inside the geyser at a time, 200 supply cap, per-race supply messages.
- Production queues (5), rally points (including rally-to-minerals), Zerg larva/eggs, Terran add-ons and lift-off/land, Protoss warp-in and psi power (buildings go unpowered when pylons die), Zerg creep requirement, Zerg building morphs (Lair/Hive, Sunken/Spore, Greater Spire), unit morphs (Lurker, Guardian, Devourer), Archon/Dark Archon merging.
- Transports (Dropship, Shuttle, Overlord with Ventral Sacs) and Bunkers (garrisoned infantry fire with +1 range).
- All 3-level upgrades and every single-level research from BW, with the correct prerequisite buildings.

**Units** (all 3 races, every BW unit): Terran SCV, Marine, Firebat, Medic, Ghost, Vulture (spider mines), Siege Tank (siege mode), Goliath, Wraith (cloak), Dropship, Science Vessel, Battlecruiser (Yamato), Valkyrie. Zerg Larva, Drone, Overlord, Zergling, Hydralisk, Lurker, Mutalisk, Scourge, Queen, Guardian, Devourer, Ultralisk, Defiler, Broodling, Infested Terran. Protoss Probe, Zealot, Dragoon, High Templar, Dark Templar, Archon, Dark Archon, Reaver (scarabs), Shuttle, Observer, Scout, Corsair, Carrier (interceptors), Arbiter.

**Spells**: Stim, Siege Mode, Cloak (Wraith/Ghost), Lockdown, Nuclear Strike, Spider Mines, Defensive Matrix, EMP, Irradiate, Yamato, Heal (auto), Restoration, Optical Flare, Scanner Sweep, Burrow, Parasite, Ensnare, Spawn Broodlings, Dark Swarm (ranged attacks miss under it), Plague, Consume, Psionic Storm, Hallucination, Feedback, Mind Control, Maelstrom, Disruption Web, Recall, Stasis Field, Shield Battery (auto), Arbiter cloaking field.

**UI** (BW console layout): minimap with fog/pings/camera box, unit portrait + stats + queue + cargo panel, 3x3 command card with BW hotkeys and costs, resource bar, alerts ("Your base is under attack", "Nuclear launch detected", supply messages), drag-select (12 max), shift-queue, ctrl-click / double-click type select, control groups (Ctrl+1-9), camera saves (Shift+F2-F8), attack-move / patrol / hold, smart right-click (gather, return cargo, repair, load, follow, attack, rally), minimap commands, building placement ghost with psi/creep preview, F1 help, F10 menu, speed +/-, pause F9.

**AI**: scripted openings per race, macro loop (workers, supply, gas saturation, expansions, production, add-ons, static defense), research priority lists, army waves with rally/gather/attack/defend states, basic micro (siege/unsiege, stim, lurker burrow, storm, plague/swarm, irradiate, broodling, stasis, spider mines, nukes). Difficulty changes reaction speed and attack timing.

## Controls

Left click select, drag to box-select, right click for smart commands. `A` attack-move, `M` move, `S` stop, `H` hold, `P` patrol, `B` build, `V` advanced build, `Esc` cancel. Unit and building hotkeys are printed on the command card. Arrow keys or screen edge scroll. Space jumps to the last alert.

## Tests

```bash
node broodwar/test/features.js
```

87 headless checks covering construction, production, research, transports, bunkers, morphs, spells, detection, fog and damage math. `test/smoke.js <frames> <races>` runs an AI-vs-AI game headless, e.g. `node broodwar/test/smoke.js 16000 TZ`.

## Known gaps vs. the original

- No campaign, no multiplayer, no replays or saves, one map layout (seeded variations only).
- Art is procedural (no hand-painted sprites); sound is synthesized beeps rather than voice lines.
- Zerg AI is the weakest of the three computer players.
- Not implemented: Infest Command Center, Nydus Canal transit (the canal builds but does not teleport), unit-level attack animations/turn rates, BW's exact pathing quirks, interceptors/scarabs as killable units (they are projectiles), tank/lurker splash shapes are circles.
