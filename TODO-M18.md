# TODO-M18 — the user's thirteen-item list from the first internet game

Written when the fifth session paused for the night (2026-09-12). `HANDOFF-M17.md` has the state, the traps
and the kickoff prompt; this file is the open list and nothing else. Four items are closed and struck through
at the bottom with their commits. **Nine are open**, and eight of those have partial, **ungated, unverified**
work sitting in three locked worktrees — see "The three worktrees" below before you start any of them.

The gate is **79 suites** (`node test/all.js`, ~4 min) and it is green at `7be866a`. Every rule in `CLAUDE.md`
applies to every item here: measure before fixing, a negative control that goes cleanly RED, `tools/patch.js`
for edits, and the gate green before the commit.

---

## Open

### 1. AI settings cannot be changed in the multiplayer lobby
*With items 10, 12, 13 — one piece of work.* The skirmish screen lets you pick each opponent's race,
difficulty, play style and team. The lobby's ADD AI hardcodes race `R` and difficulty `normal`
(`test/serve.js`, the `addai` case). Every AI slot should get race, difficulty and play style
(`UI.setupStyles()`, the same list the skirmish screen uses) editable by the host, and be removable.

### 3. A Queen or Overlord should walk into range to plant a creep tumour
Today an out-of-range cast is refused outright with "Creep Tumour only reaches 3 tiles — pick a spot closer
in." (`Abilities.outOfRangeMsg`). It should move the caster toward the target until the target is in range,
then cast, the way a build order moves a worker first.

**Trap:** `js/abilities.js` near line 397 documents a deliberate fix — a caster that "flew 13 tiles and planted
it, against a declared range of 3". Do not undo it. The right shape is a real move-then-cast ORDER that the
command log carries, not a silent teleport or an unbounded walk. **Anything that does not go through
`CMD.pack`/`CMD.apply` and `ORDER_KEYS` will desync in multiplayer and vanish from replays** — `test/cmdlog.js`
is the suite that catches that class of mistake and `REVIEW-M17.md` entry 6 is the last time it happened.
Decide and record whether this applies to every targeted ability or only the tumour.

### 4. Some tech gets stuck during research
A research or upgrade begins and never finishes. **Not yet reproduced.** Write the probe first: long games,
several AI opponents, all three races, a few seeds, 20+ minutes, reporting any production slot whose progress
has not advanced for N frames and naming the building, the tech and the frame it stalled. `G.tickProduction`
(`js/game.js`) is the tick; `G.queueTech`/`G.queueUpgrade` are the entry points. Candidate causes, none
confirmed: a lifted building, a morphed one (Lair/Hive, Greater Spire), one that changed owner, a
cancelled-and-requeued slot. **Do not guess — the probe must name the case.**

### 5. The HUD is far too small and should be doubled
`js/hud.js` draws the console band, minimap, selection strip, command card and top bar on the canvas. Measure
what sets its size today (fixed pixels? viewport fraction? device pixel ratio?) at 1280x720, 1920x1080 and
2560x1440 before changing anything — the user is likely on a high-resolution display where a fixed-pixel HUD
reads tiny.

One named constant, not a hundred edited literals. It must not push the console off a small window, and
**every hotspot must move with what it draws**: `test/qol.js` asserts forty selected units get forty hotspots,
all on the console band and none below the screen. Do not weaken that. Suites to keep green: `qol`, `cardsay`,
`diegetic`, `daynight`, `review17ui`, `controls`.

### 6. Workers should not cross the map when their patch runs out
"When drones finish the minerals in an area, they go to the next entire mineral area — in SC2, once the area is
out, they stop unless you command them to go to another area's patch. Copy this."

`js/sim.js`'s gather tick re-scans **all** of `G.map.resources` (`findNearestResource`, and the `% 16 === 0`
loop) and sends the worker to the nearest patch anywhere on the map. Restrict it to the worker's own mineral
line / base cluster and go idle if that is exhausted. Decide what "the same area" means in this codebase's
terms (resources are placed in clusters around base locations) and record why. Check it still resumes when a
new hall finishes nearby, and that `AI.economy` can still move workers to a new base deliberately.

### 10 + 13. Finish the lobby, self-contained, in the shape of StarCraft II's
*The user supplied screenshots; items 1 and 12 belong to this work.* Today's lobby (PLAYTEST item 60) has the
game list, HOST GAME, join-by-code, team columns, ready marks, kick, map and speed, and chat. The SC2 target
adds: per-slot colour and handicap, an A.I. row with difficulty/race/build dropdowns, "Add A.I." and "Add
Player" buttons, a right-hand Settings panel (Category, Mode, Game Duration, Game Speed, Locked Alliances,
Game Privacy), a map preview thumbnail with name and author, and START / MAKE PUBLIC / QUIT.

**Do not add an inert control.** Check `G.init` and `UI.skirmishOptions()` for what the simulation actually
honours, and record which SC2 rows were deliberately left out. Specifically:
- **Handicap scales a player's income — that is a simulation change and therefore GATED balance.** Leave it
  out, or make it visibly inert and say so loudly.
- **Per-player colour**: check whether wiring it would move the build stamp (`PLAYER_COLORS`, `NOT_SIM` in
  `js/build.js`). Do not move the stamp for a cosmetic.
- Everything from another client that reaches `innerHTML` goes through `Net.esc()`; every new field is a new
  injection point and needs its own assertion. `test/rooms.js` already pins a `<svg/onload=x()>` name.
- Keep `Net.connect(url, name, race, room)` — join-by-code with no browsing — working exactly as it is:
  `test/net.js` and `test/net_many.js` use it and must stay green. Run both by hand.
- Do not break the rejoin path (`test/net.js` phase 3).

### 11. Dragoons wobble very fast after they move
Look at `Unit.moveTo` (`js/sim.js`): `TURN.dragoon = 0.25` rad/frame, the arrive radius, and
`if (Math.abs(diff) > 1.2) step *= TURN[this.def.id] ? 0.15 : 0.45`. Oscillating between two facings, between
"arrived" and "not arrived", or being pushed by collision and re-facing every frame all present as a fast
wobble. **Measure it**: record a dragoon's `facing`, `x`, `y` and order state per frame after it completes a
move, and report the amplitude and period. Then fix the cause the probe names. Turn rates and the arrive radius
affect every unit, so prefer the narrowest fix the measurement supports and check `test/eightplayer.js` to see
how far it reaches.

### 12. A 5-4-3-2-1 countdown before a network game unlocks
"This will help the game start time stay equal." After START, before the simulation is unlocked, every client
shows the same numbers and begins simulating on the same frame. **The relay should decide it** — a countdown
each client times for itself is a desync waiting to happen.

---

## Gated / needs an explicit decision

### 7. The economy — MEASURED, CHANGED, REVERTED. Read before touching.
**Measured** (`.claude/review/mine-rate.js`): **100 minerals per worker per minute**; a 114-frame cycle for 8
minerals, 75 frames inside the patch and 39 walking. That is **x2.4 StarCraft II** but only **x1.15 Brood War**.
The game was already close to the one it remakes; the gap the user felt is SC2's deliberately slower economy.

Swept with `.claude/review/mine-sweep.js`, measuring each arm rather than deriving it:

| MINE_TIME | 75 | 90 | 105 | 120 | 140 | 160 | 190 |
|---|---|---|---|---|---|---|---|
| minerals/worker/min | 99.8 | 89.3 | 80.3 | 71.0 | 64.5 | 58.0 | 49.8 |
| vs Brood War (~87) | x1.15 | x1.03 | x0.92 | x0.82 | x0.74 | x0.67 | x0.57 |
| vs StarCraft II (~41) | x2.43 | x2.18 | x1.96 | x1.73 | x1.57 | x1.41 | x1.21 |

The user chose the SC2 end. `MINE_TIME 190, GAS_TIME 94` (gas scaled by the same 2.53x, so the ratio was
untouched) **broke the game**: `test/aistyles.js` went red on seeds 1, 5 and 11 with the "never attacked"
sentinel for **every** style — no computer opponent mounted a first wave inside ten minutes on any seed — and
the gate went 4 of 79 red (`version`, `aistyles`, `zerg12`, `queens`). `test/eightplayer.js` 18/19, peak supply
`21/51/57/33/56/31/19/50` against a floor of 20.

**Reverted**, per `CLAUDE.md`: a change that turns the canaries red is reverted even when it does what was
asked. **The constant is not the problem.** The AI's build orders and its attack threshold are tuned for the
current income, so halving income makes the computer stop playing. Re-tuning them is the gated balance work.
**Do not retry this without taking the AI with it.**

`.claude/review/attack-clock.js` measures the frame of the first wave at each candidate using `ai.waves`, the
counter `aistyles` itself reads. It was stopped mid-run and is the instrument to finish first.

`test/version.js` edits `const MINE_TIME = 75,` as one of its stamp probes — any real change here must
re-anchor that line, or the suite goes red reporting a stale anchor.

---

## The three worktrees

Three agents were stopped mid-task when the session paused. **None had written its deliverable**, so nothing of
theirs is on the main line, none of it is gated, and none of it has notes saying what was measured. `git
worktree list` shows them, all locked, all based on `e9fe40e`:

| worktree | items | where it got to |
|---|---|---|
| lobby | 1, 10, 12, 13 | fixing a check that still passed with the feature deleted |
| HUD scale | 5 | verifying its deliverable reproduces on a clean tree — the furthest along |
| four sim bugs | 3, 4, 6, 11 | three of four written; starting item 11's patch |

**Re-dispatching fresh is the safer default.** If you do resume one, treat everything in the worktree as
unverified until it has been measured, controlled and gated. Clean up with `git worktree remove --force <path>`
then `git branch -d <branch>`.

---

## Closed

- ~~**2. Both players heard each other's announcements.**~~ `Player.msg` gated its sound on "is a human player"
  rather than "is the player sitting here" — the same person in single player, two people in a game. Commit
  `8dbb471`, `test/netaudio.js`, PLAYTEST item 62.
- ~~**8. Queued moves draw faint lines.**~~ A polyline through every queued destination with a diamond at each;
  green move, red attack, yellow patrol. Commit `7be866a`, `test/seldraw.js`, PLAYTEST item 63.
- ~~**9. A dead unit's health bar lingers.**~~ **It does not.** A probe drove the real renderer across a death:
  the sprite and the bar stop on the same drawn frame, and a 40-unit battle drew 18,816 bars across 29 deaths
  with none for a dead unit. What lingers is the corpse, by design. Pinned so it cannot regress. Commit
  `7be866a`. One dead thing's bar is left on purpose: a remembered enemy building's ghost in the fog, because
  removing it would leak that the building is dead.
- ~~**7. The economy.**~~ Measured and reverted — see the gated section above. Not closed as "done"; closed as
  "answered, and the answer is that it needs the AI re-tuned first".
