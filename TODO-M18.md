# TODO-M18 — the user's thirteen-item list from the first internet game

Written when the fifth session paused for the night (2026-09-12). `HANDOFF-M17.md` has the state, the traps
and the kickoff prompt; this file is the open list and nothing else. Four items are closed and struck through
at the bottom with their commits. **Three are open** (4 — not reproduced, 6 and 11, plus the gated economy pair 7a/7b), and
each has partial, **ungated, unverified** work sitting in the locked worktrees — see "The three worktrees"
below before you start any of them.

The gate is **79 suites** (`node test/all.js`, ~4 min) and it is green at `7be866a`. Every rule in `CLAUDE.md`
applies to every item here: measure before fixing, a negative control that goes cleanly RED, `tools/patch.js`
for edits, and the gate green before the commit.

---

## Open

### 3 (DONE). A Queen or Overlord should walk into range to plant a creep tumour
*Kept for the record; what shipped is in Closed at the foot of this file.*
Today an out-of-range cast is refused outright with "Creep Tumour only reaches 3 tiles — pick a spot closer
in." (`Abilities.outOfRangeMsg`). It should move the caster toward the target until the target is in range,
then cast, the way a build order moves a worker first.

**Trap:** `js/abilities.js` near line 397 documents a deliberate fix — a caster that "flew 13 tiles and planted
it, against a declared range of 3". Do not undo it. The right shape is a real move-then-cast ORDER that the
command log carries, not a silent teleport or an unbounded walk. **Anything that does not go through
`CMD.pack`/`CMD.apply` and `ORDER_KEYS` will desync in multiplayer and vanish from replays** — `test/cmdlog.js`
is the suite that catches that class of mistake and `REVIEW-M17.md` entry 6 is the last time it happened.
Decide and record whether this applies to every targeted ability or only the tumour.

### 4. Some tech gets stuck during research — STILL NOT REPRODUCED, and here is what is ruled out
**The probes are written and committed** (`.claude/review/stall-probe.js`, `.claude/review/stall-scenes.js`)
and 75 minutes of six-player hard-AI games across three seeds did not produce it. 25 stalls over ten
seconds, every one of them the rules working (supply, an add-on still building, a Protoss blackout) except
two, and those two were a different fault — now fixed, see Closed. **Do not start guessing from here; run
the probes again after the user's next game, or get the one console line `PLAYTEST-M18.md` item 68 asks for.**

Ruled out, each with the reason:
- **a lifted building** — impossible. `G.liftBuilding` refuses while anything is in the queue.
- **a morphed one (Lair/Hive, Greater Spire)** — impossible. `G.queueMorph` refuses while anything is in
  the queue. Driven in scenes 4 and 5: the morph is declined and the research finishes.
- **a killed building** — works. The reservation in `p.researching` IS cleared and it can be researched
  again on a rebuilt one (scenes 8 and 9); REVIEW-M17 had already closed the other end of this at `CMD.bldg`.
- **a destroyed add-on** — works (scene 10).
- **a cancelled-and-requeued slot** — works (scene 7).
- **an unpowered Protoss building** — freezes while dark and resumes with a new pylon. By design (scene 11).
- **one that changed owner** — WOULD leak: `p.researching` is per player and `G.finishProduction` clears it
  from the building's current owner, so the old one holds a reservation for ever and is refused in silence
  if they ask again. **But nothing in the game can change a building's owner** — Mind Control explicitly
  refuses buildings, Infest takes a Command Center (which researches nothing) and capturing a derelict
  takes a neutral building. Scene 6 forces the handover by hand and shows the leak; it is a hole with no
  door to it today, and the door is what to look for if a future ability opens one.

The original brief, kept for the record:


A research or upgrade begins and never finishes. **Not yet reproduced.** Write the probe first: long games,
several AI opponents, all three races, a few seeds, 20+ minutes, reporting any production slot whose progress
has not advanced for N frames and naming the building, the tech and the frame it stalled. `G.tickProduction`
(`js/game.js`) is the tick; `G.queueTech`/`G.queueUpgrade` are the entry points. Candidate causes, none
confirmed: a lifted building, a morphed one (Lair/Hive, Greater Spire), one that changed owner, a
cancelled-and-requeued slot. **Do not guess — the probe must name the case.**

### 5 (DONE). The HUD is far too small and should be doubled
*Kept for the record; what was measured and what shipped is in Closed at the foot of this file.*
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

### 11. Dragoons wobble very fast after they move
Look at `Unit.moveTo` (`js/sim.js`): `TURN.dragoon = 0.25` rad/frame, the arrive radius, and
`if (Math.abs(diff) > 1.2) step *= TURN[this.def.id] ? 0.15 : 0.45`. Oscillating between two facings, between
"arrived" and "not arrived", or being pushed by collision and re-facing every frame all present as a fast
wobble. **Measure it**: record a dragoon's `facing`, `x`, `y` and order state per frame after it completes a
move, and report the amplitude and period. Then fix the cause the probe names. Turn rates and the arrive radius
affect every unit, so prefer the narrowest fix the measurement supports and check `test/eightplayer.js` to see
how far it reaches.

---

### 7a. Re-apply the slower economy: `MINE_TIME 190, GAS_TIME 94` — APPROVED
**The user was shown the evidence below and asked for it anyway** (2026-09-12): "I understand it broke AI but we
can rebalance later when I confirm." So it goes in, and **7b is what makes the game playable again**. Ship the
two together, or ship 7a knowing the computer opponents are passive for the first ten minutes.

`.claude/review/spec-mining.js` is the patch, written and already verified to apply. Expect, all measured:
- `test/aistyles.js` red on seeds 1, 5 and 11, every style reporting the "never attacked" sentinel (43200).
- The gate 4 of 79 red: `version`, `aistyles`, `zerg12`, `queens`.
- `test/eightplayer.js` 18/19, peak supply `21/51/57/33/56/31/19/50` against a floor of 20.
- **`test/version.js` edits `const MINE_TIME = 75,` as one of its stamp probes — re-anchor that line**, or it
  goes red reporting a stale anchor, which is a different failure from the economy one.
- The build stamp moves, so saves and replays from before are refused.

### 7b. Rebalance the AI for the slower economy — GATED, needs an explicit instruction
This is what 7a breaks, and it is the balance work this project has kept gated throughout. The AI's build orders
and its attack threshold are tuned for 100 minerals per worker per minute; at 50 it never fields a first wave
inside ten minutes. The knobs: `AI.budget()`'s claim order, the threshold that decides when a wave commits, and
the build-order step timings in `js/ai.js`. `test/balance.js` and `test/proxy.js` are the runs for it and
**both are gated** — do not start them without being told, and double-check when told.

Finish `.claude/review/attack-clock.js` first. It measures the frame of the first wave using `ai.waves`, the
counter `aistyles` itself reads, and it is the instrument that says whether a rebalance worked. (A first version
counted army units near the enemy start and reported "never" for Zerg even at today's settings: a probe that
disagrees with a known-good instrument is a broken probe, not a finding.)

### The measurement behind 7a and 7b
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

It was reverted on the night per `CLAUDE.md` (a change that turns the canaries red is reverted even when it does
what was asked), and then the user was shown this evidence and asked for it anyway — that is 7a above.
**The constant is not the problem.** The AI's build orders and its attack threshold are tuned for the current
income, so halving income makes the computer stop playing. That is 7b.

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
- ~~**1 + 10 + 12 + 13. The multiplayer lobby.**~~ Finished in the shape of the user's StarCraft II
  screenshots, and self-contained. Every AI slot is race + difficulty + **play style** + team, editable by the
  host and removable; the style rides through the relay into `G.setup.players[i].style`, which js/ai.js
  already reads, so **no stamped file changed and the build stamp did not move** (`af56c841f794af2f`). A
  settings column with a **real map preview** (the layout's start positions, mirrored exactly as
  `GameMap.generate` mirrors them, in the seats' colours), game **privacy** as a host setting, and a bottom
  bar of START / MAKE PUBLIC / QUIT. **START now runs a relay-timed 5-4-3-2-1 countdown** during which the
  room is frozen, nobody may join, and anyone leaving cancels it. `test/rooms.js` sections 13-15 (107 checks
  now), twelve negative controls in `.claude/review/lobby-controls.js`, `PLAYTEST-M18.md` items 64-65.
  **Deliberately left out, and said so on screen:** handicap (it scales income, so it is gated balance),
  Category/Mode/Game Duration (nothing simulates them), a Locked Alliances *switch* (alliances are always
  locked, so it is stated as a fact), a colour *picker* (a chosen colour must be read in `G.init` or
  `Player`, both stamped — TODO said not to move the stamp for paint, so the lobby SHOWS each seat's colour
  instead), and a map author line (nothing records one).
- ~~**5. The HUD is far too small.**~~ **Measured first**: the band was `clamp(Render.H * 0.26, 140, 196)`
  and the 0.26 is dead above a 754 px window, so every viewport from 1366x768 up got the same **196 px** --
  26% of a 720p screen, 18.1% of 1080p, 13.6% of 1440p, **9.1% of 4K** -- and the minimap (174), the card
  button (53) and the selection tile all derive from it, so they were pinned too. The CLAMP CEILING was the
  cause, not the fraction. Now `HUD_SCALE = 2` in `js/ui.js`: the console draws under one transform, in the
  console units it was already written in, so the whole thing doubles from one constant. `HUD_MAX_FRAC`
  (0.42) keeps a short window playable and `hudK` falls with it; below ~330 px of height the console is
  exactly what it always was. Hotspots are converted back to screen pixels by the same factor, icons are
  rasterised at the size they are drawn at, and the selection strip's shrink floor is 22 SCREEN pixels (it
  was 22 console units, which cost ten of forty tiles at 1024x768 -- found by measuring in the page).
  `test/qol.js` 33 checks, eight negative controls in `.claude/review/hud-controls.js`, `PLAYTEST-M18.md`
  item 66. Not scaled, on purpose: the mouse cursor, and the F10/F1/codex dialogs, which are not the
  console band.
- ~~**3. A Queen or Overlord walks into range to plant a creep tumour.**~~ Bounded by `CAST_APPROACH` = 36
  tiles, which is measured against the maps (a start's nearest other base is 18/31/34; a start to another
  start is 100 to 142). An IMMOBILE caster — a tumour seeding its own child, a burrowed or sieged unit —
  still refuses at its range, which is the half FIXLIST-M15 C2 was right about. It also found and fixed a
  real AI bug: the tumour budget counted only the tumours that EXIST, so with the walk allowed two
  Overlords each saw seven and the game peaked at nine against a cap of eight. Commit `b2a1442`,
  `test/tumour.js`, `PLAYTEST-M18.md` item 67.
- ~~**A unit cannot morph inside a transport.**~~ Not on the user's list — TODO item 4's probe found it.
  A Zergling loaded into an Overlord and morphed left its cocoon at progress 0 for the whole ride, money
  spent and unit gone, because `Unit.tick` returns at its `inside` guard before an egg ever reaches
  `tickProduction`; the AI then picked the same loaded Zergling every think. Refused now, as Brood War and
  StarCraft II both do, and the AI's seven morph sites skip loaded units. `test/abilities20.js`,
  `PLAYTEST-M18.md` item 69.
- ~~**7. The economy.**~~ Measured and reverted — see the gated section above. Not closed as "done"; closed as
  "answered, and the answer is that it needs the AI re-tuned first".
