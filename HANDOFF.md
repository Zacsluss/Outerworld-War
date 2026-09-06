# HANDOFF — Brood War Remake

Read this first in a fresh chat. It says where the build is, how it is wired, what must never break, and exactly what the next milestone is.

## Kickoff for the next chat

Open a chat in `Default Project/broodwar/` and paste:

> Read HANDOFF.md and README.md, run the tests, then do Milestone M2 from HANDOFF.md. Work through the tasks in order, keep the determinism tests green after every change, commit at each task, and update HANDOFF.md at the end.

## Status (as of commit 32d9912, 2026-09-05)

Playable end to end and committed. Milestone M1 ("everything buildable offline") is complete:

- All 3 races, every unit/building/upgrade/research/spell, fog with high-ground rule, detection, damage model, economy, production, morphs, transports, add-ons, lift-off, Nydus transit, Infest CC, killable Interceptors/Scarabs, turn rates and air acceleration.
- Deterministic sim + command log → replays, save/load (re-simulation), LAN lockstep multiplayer (relay in `test/serve.js`, client in `js/net.js`).
- 6 missions, teams, 3 map layouts, 7 speed presets, grid/BW hotkeys, cheats, voice (speech synthesis) and generative music, score screen.
- Art pipeline: 3D primitive models → baked sprite sheets (`tools/`), procedural terrain, particle FX, BW-style HUD.
- Tests: `node test/features.js` (87 checks), `node test/determinism.js`, `node test/smoke.js <frames> <races> <layout>`, `node test/diag.js <races> <frames>` (AI progression dump), `node test/diverge.js` (finds the first non-deterministic frame).

## Architecture map

| File | Role |
|---|---|
| `js/data.js` | All unit/building/upgrade/tech/ability tables (BW numbers, frames at 24/s, tiles, px/frame). |
| `js/map.js` | `MAP_LAYOUTS`, `GameMap` (terrain, cliffs, ramps, resources, creep, psi, placement), `Pathfinder` (A*). |
| `js/sim.js` | `Player`, `Unit` (orders state machine, movement with turn/accel, gathering, building, combat helpers). `TURN`/`ACCEL` tables live here. |
| `js/game.js` | `G`: init, spatial hash, vision/detection (per player, team-shared), spawning/killing, production, supply, damage, victory, tick loop. |
| `js/combat.js` | Weapon firing, splash, glaive/line, projectiles, interceptor/scarab launch. |
| `js/abilities.js` | Spells, fields (storm/swarm/etc.), auto-casts, interceptor/scarab/dock behaviours, infest. |
| `js/commands.js` | `RNG`, `G.rand`, command packers/dispatcher (`CMD`), wrappers that intercept every player action, `G.exec`, cheats, `Replay` (save/load/watch). Loaded after abilities.js. |
| `js/ai.js` | Computer players: scripts, macro, production, research, army waves, scouting, drops, micro. |
| `js/missions.js` | Scenario definitions and helpers (`G.hallOf`, `G.givePlayer`, `G.placeDone`). |
| `js/net.js` | LAN lockstep client. `test/serve.js` is the static server + WebSocket relay (no npm deps). |
| `js/audio.js` | `Voice` (speechSynthesis) and `Music` (WebAudio generative). |
| `js/terrain.js`, `js/sprites*.js`, `js/atlas.js`, `js/fx.js`, `js/render.js`, `js/hud.js`, `js/ui.js` | Rendering, baked-sprite loading and tinting, effects, HUD/console, input/menus/loop. `hud.js` overrides the drawing methods of `UI`. |
| `tools/models.js`, `tools/raster.js`, `tools/bake.js` | Sprite pipeline. `node tools/bake.js` writes `assets/sprites/*.png`, `assets/atlas.js`, `assets/preview.png`. |

## Invariants (do not break)

1. **Determinism.** No `Math.random`, `Date`, or `performance` in sim files (`sim.js`, `game.js`, `combat.js`, `abilities.js`, `ai.js`, `map.js`, `commands.js`, `missions.js`). Use `G.rand()`. `test/determinism.js` must stay green; `test/diverge.js` pinpoints a divergence frame if it breaks.
2. **Commands.** Anything the human does to the sim must go through a function wrapped in `CMD.install()` (setOrder/stop/queue*/cancel*/setRally/lift/unload*/Abilities.issue/merge/cheat). A new player-facing sim mutation needs a packer + `CMD.apply` case, or replays/net silently desync.
3. **Sim vs render.** `G.tick` sets `G.inTick`; UI calls outside ticks are intercepted. Render-side state (FX, decals, animation frames) must never influence the sim.
4. **Baked art.** Edit `tools/models.js` and rebake; never hand-edit PNGs. If assets are missing, vector painters are the fallback.
5. **Browser pane quirk.** The desktop app's browser pane throttles `requestAnimationFrame`; the sim runs on `setInterval` in `UI.simStep`. Keep it that way.

## Known issues and rough edges

- **Balance**: AI-vs-AI results, 16000 frames: TvZ roughly even on Twilight Valley, Terran ahead on Lost Ruins, Protoss well ahead of Zerg on Blood Pit. Zerg AI is the weakest; Protoss AI never uses Reavers/Templar well.
- **Missions**: only `t1` was played in the browser; `t2`..`p2` were only exercised through their setup code. Expect placement or objective bugs.
- **Multiplayer**: no desync detection, no reconnect, no host migration; a disconnected player's units simply go idle. Chat exists. Speed is locked to Fastest. Untested beyond 2 clients + AI on one machine.
- **Replay/save**: loading a long game re-simulates from frame 0 (about 2000 ticks/s in Chrome); saves from a different code version will desync silently. Consider a version stamp check on load.
- **AI `defend` state** can ping-pong when harassed; drop ops occasionally wait the full timeout with an empty transport.
- **Performance**: `G.near` rebuilds a 64px grid each tick; vision recomputes for all players every 3 frames. Fine at 200 supply in tests, unprofiled at 4-player max supply with lots of interceptors.
- **Interceptors** never return for repair, and carriers keep launching while any target exists. Scarabs use full A* per frame while alive (110 frames max).
- **Art**: infantry still reads small; no idle animations; buildings have no damage states; one terrain tileset.
- The desktop browser pane logs a `SyntaxError: Unexpected token ','` on load that does not come from any project file (all pass `node --check`); ignore it there, but confirm it does not appear in a normal browser.

## Milestone M2 — Play-test, robustness, depth

Goal: the game holds up to real human sessions and LAN nights. Do these in order; each is one commit with tests green.

1. **Human play-test pass (Zac plays 3 games: TvZ, PvT, ZvP on Fastest).** Log every bug/annoyance in `PLAYTEST.md` with repro steps. Fix all crashes and order-handling bugs found. Acceptance: three full games without a JS error (check DevTools console) and without a stuck unit needing a workaround.
2. **Multiplayer robustness.** Add a state hash exchange every 48 frames (`Net` sends `{t:'hash', f, h}`; mismatch → on-screen "desync detected" plus both clients dump `G.log` to a download). Add "player dropped → their units stop; game continues" messaging, and a reconnect path (rejoin lobby, re-simulate from the host's log). Acceptance: two browsers + one AI finish a 10-minute game with matching hashes; killing one tab mid-game leaves the other playable.
3. **Balance and AI depth.** Target: each matchup within 60/40 across 6 AI-vs-AI runs per layout (`test/smoke.js`, three seeds each). Levers: Zerg macro timings, Protoss Reaver/Templar usage, Terran drop frequency, unit weights in `AI_COMP`. Add a `test/balance.js` that runs the matrix and prints a table. Then tune against human feedback from task 1.
4. **Missions polish.** Play all six; fix placements (`G.placeDone` fallbacks), objective timing, and add a mission-complete score line. Add two more missions that use Nydus/drops and Recall/Stasis so every spell family has a home.
5. **Performance pass.** Profile a 4-player 200-supply battle (spawn via cheats). Targets: sim tick under 8 ms, render under 6 ms at 1080p. Likely wins: cache `G.near` results per tick for AI queries, skip vision for defeated players, cap particles.
6. **Map editor (stretch, may become M3).** In-browser editor: paint height/rocks/ramps, place minerals/geysers/starts, save/load layouts as JSON into `MAP_LAYOUTS`, list custom maps in the menu. Acceptance: a custom 2-player map plays a full AI game and a LAN game.

## How to run everything

```bash
node test/serve.js 8765          # or double-click PLAY.bat; prints LAN URL
node test/features.js
node test/determinism.js
node test/smoke.js 16000 TZ temple
node tools/bake.js               # after editing tools/models.js
```

Git: the repo is inside OneDrive; commits with the 16 MB of sprites are slow (30-60 s). Run `git add -A && git commit` in the background if using a tool with a timeout.
