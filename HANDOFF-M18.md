# HANDOFF — M18 (the sixth session: the ten confirmed tasks)

Written at the end of the sixth session (2026-09-12). Branch `m10-overnight`. **Seven commits since `0dba2b2`,
none of them pushed** — `origin/main` is this branch and `git push` publishes, and the last commit is knowingly
red (below), so publishing is the user's call. Trust `git log -1` for HEAD, not a hash written here.

> **READ `TODO-M18.md` FOR THE OPEN LIST.** Every task below has its entry there, struck through under Closed or
> kept open with the measurement. `PLAYTEST-M18.md` items 64–72 are how to see this session's work by hand.
> `HANDOFF-M17.md`'s traps are all still true; the new ones are at the bottom of this file.

---

## The state

- **The gate is 2 of 79 red, on purpose.** `aistyles` and `queens`, both because the economy is now half as
  fast (task 1, approved) and the computer's build orders are tuned for the old income. Task 2 — the rebalance —
  turns them green, and it is **gated**. Every commit before the last one was gated green.
- **Build stamp `1e25bdbaf9ef8855`.** It moved four times this session (tumour approach, egg-in-transport,
  worker lines, economy). Saves and replays from before are refused, which is the stamp doing its job.
- **By hand, on the final tree:** `test/eightplayer.js` 19/19; mining 49.8 minerals per worker per minute.
  `aistyles` seeds 1/5/11 are all red under the slower economy by design — do not read them as a regression
  until 7b has run.
- **Before the economy commit**, on `136b1b0`: gate 79/79; `aistyles` seed 1 clean, seed 5 the known economy
  red (59 vs 61), seed 11 clean; `eightplayer` 19/19. That commit is the last all-green point.

### Two decisions are waiting on the user

1. **Task 2 — rebalance the AI for the slower economy.** Gated. Needs an explicit go, and a double-check when
   it comes. `test/balance.js` and `test/proxy.js` are its instruments and neither may be started without it.
2. **The dragoon wobble fix** (`tools/wobble-fix.js`). Measured and working — the worst single-frame turn in a
   crowd goes from 79.6° to 14.32° and a crowd move from 529 frames to 379 — but on `136b1b0` it re-dealt the
   project's long-standing flaky line ("expander mines with more workers than turtle", 58 vs 60) onto
   `aistyles` seed 1, **which is the seed the gate runs**. Accepting that is reasonable; granting an exception
   to the gate is not a session's to make. Note it was measured before the economy change and must be
   re-measured after 7b.

---

## What changed, in a player's language

1. **The multiplayer lobby is finished and shaped like StarCraft II's.** Two columns — teams on the left, a Game
   Settings panel on the right — and a bottom bar of READY / START GAME / MAKE PRIVATE / QUIT. *(item 64)*
2. **Every computer opponent in a lobby is configurable**: race, difficulty, **play style** and team, set by the
   host, removable, and it really plays that way — the style reaches the simulation. Adding another copies the
   last one's settings. *(item 64)*
3. **The lobby draws a real map preview** — the start positions in each seat's colour, and the expansions —
   and each slot shows the colour it will play in. *(item 64)*
4. **A hosted game can be made private** (gone from everyone's list, same code still works) and public again.
   *(item 64)*
5. **START runs a 5-4-3-2-1 countdown**, timed by the server so every player sees the same digit at the same
   moment. During it nothing can change and nobody can join; the host can cancel, and anyone leaving cancels it.
   *(item 65)*
6. **The HUD is twice the size** on any window 1080 px tall or more, and as much bigger as fits on a smaller
   one. Every button, the minimap and the selection strip still click exactly where they are drawn. One
   constant, `HUD_SCALE` in `js/ui.js`, sets it. *(item 66)*
7. **A Queen or Overlord ordered to plant a creep tumour out of range walks into range and plants it**, up to 36
   tiles — a number measured from the maps so it covers every natural and never a trek to an enemy base. Past
   that it says the walk ran out. A tumour spreading creep by itself still refuses past its range. *(item 67)*
8. **The Zerg computer no longer overshoots its creep-tumour cap** (it could reach nine against eight once
   casters walked in to plant). *(item 67)*
9. **Research that gets stuck: NOT reproduced**, after 75 minutes of AI games and nine directed scenes. Every
   candidate cause is ruled out with a reason, and the probes are committed so it can be re-run. There is one
   console line to run if it happens again. *(item 68)*
10. **A unit can no longer morph while riding in a transport.** A Zergling loaded into an Overlord and turned
    into a Baneling used to sit as a frozen cocoon for the whole ride; the computer did it to itself. *(item 69)*
11. **Workers stop when their mineral line runs out** instead of walking to the next base on their own. They go
    idle; an order moves them. One patch running out still moves a worker to another on the same line, gas is
    unchanged, and the computer still re-tasks its own workers. *(item 70)*
12. **The dragoon wobble is measured and fixed, but not on the main line** — see the decision above. *(TODO item 11)*
13. **The economy runs at StarCraft II's pace**: about half the income. The computer barely attacks until task 2
    is done. *(item 72)*

**Deliberately different from what was asked:**
- The lobby has **no handicap** (it scales income — gated balance), **no Category/Mode/Game Duration** (nothing
  simulates them), **no Locked Alliances switch** (alliances are always locked, so it is stated as a fact), **no
  colour picker** (a chosen colour must be read in stamped files and would move the stamp for paint — the lobby
  shows each seat's colour instead) and **no map author** (nothing records one). The panel says all of this on
  screen.
- The **countdown is configurable** (`BW_COUNTDOWN`, 0 turns it off) so the two socket suites don't pay five
  seconds a game.
- The creep tumour **walk is bounded**, as TODO-M18 required, rather than unlimited.
- The **HUD's mouse cursor, pause menu, help and codex are not scaled** — they are not the console band.

**Left unfinished, stated plainly:** the research stall (not reproduced); the dragoon wobble's commit (a
decision); the residual crowd jostle even with the wobble fix (needs per-unit steering or formations); task 2.

---

## Traps found this session

1. **Patching `js/` while a gate is running corrupts the run.** `test/tumour.js` hung on a half-written file
   and had to be discarded. HANDOFF-M17 trap 5 says this about `eightplayer`; it is true of the whole gate.
   Nothing touches `js/` or `test/` until `wall clock` is in the log.
2. **Bash eats backticks in `node -e "..."`**, not only backslashes. A TODO entry lost four `code` names to
   command substitution. Every edit with a backtick in it goes through the Write tool as a file.
3. **A negative control that deletes a guard is not always the control.** Deleting the wobble fix's hold left
   an else-branch that caps every turn anyway, so a real check stayed green for a good reason. The honest
   control put the *original line* back.
4. **A probe that does not create its case reports "ok".** Four of the first stall scenes silently did nothing
   (an Academy cannot lift; a Forge does not research `infW`). Every scene now asserts its own setup.
5. **`canMove` is a getter.** Assigning `false` to it does nothing, so an "immobile" test unit walked.
6. **`tools/patch.js` checks every anchor against the ORIGINAL text**, so a second edit in one spec cannot
   anchor on text the first edit writes.
7. **A by-hand AI sample can hide a real regression behind "it re-dealt".** The rejected wobble variant kept
   the gate seed green while `eightplayer` quietly lost "the AI expanded". Run all of the by-hand checks, not
   just the one that is red.
8. **There are FOUR locked agent worktrees, not three**, all at `e9fe40e`. Their work is now superseded by this
   session's commits. They were not removed; the last removal needed the user's word.

---

## Diagnostics added this session

```
node tools/stall-probe.js --minutes=25 --seeds=3,7,11    every production slot that stalls, with the building's state
node tools/stall-scenes.js                                nine candidate causes of stuck research, each asserting its setup
node tools/wobble-probe.js                                a unit's facing, per frame, during and after a move
node tools/wobble-render.js                               the drawn side: sprite direction, animation, settle spring
node tools/patch.js tools/wobble-fix.js                   the measured wobble fix, waiting on a decision
node test/rooms.js                                        107 checks: sections 13-15 are the lobby slots, countdown, client
node test/qol.js                                          39 checks: the HUD scale and the exhausted mineral line
```

`.claude/review/` (gitignored) holds this session's specs, gate logs and the one-off measurements:
`hud-measure.js`, `tumour-reach.js`, `worker-walk.js`, `lobby-controls.js`, `hud-controls.js`,
`tumour-controls.js`, `wobble-control.js`, `mine-rate.js`.

---

## Kickoff prompt for a fresh chat

Paste everything inside the fence into an empty chat. **Replace the HEAD hash with `git log -1 --format=%h`
first** — committing this file moves it.

```
Repo: C:\Users\zacsl\OneDrive\Documents\Default Project\broodwar
Branch: m10-overnight. HEAD: <run git log -1 --format=%h>. Working tree clean.
origin = https://github.com/Zacsluss/Outerworld-War, whose main IS this branch (git push publishes).
The last 8 commits are NOT pushed, and the gate is knowingly red in them -- see below.

READ IN THIS ORDER, then start:
  1. CLAUDE.md       -- the working agreement. Every line was earned; none is optional.
  2. HANDOFF-M18.md  -- state, the two decisions waiting, what changed, and eight new traps.
  3. TODO-M18.md     -- the open list with every measurement.
  4. PLAYTEST-M18.md -- items 64-72, what this session did, by hand.

THE STATE: the gate (node test/all.js, ~4 min) is 2 of 79 RED ON PURPOSE -- aistyles and queens -- because
the economy was slowed to StarCraft II's pace (MINE_TIME 190 / GAS_TIME 94, approved by the user) and the
computer's build orders are tuned for twice that income. Build stamp 1e25bdbaf9ef8855. The last all-green
commit is 136b1b0 (gate 79/79, eightplayer 19/19).

THE SINGLE NEXT ACTION: ask the user whether to start TODO-M18 7b, the AI rebalance for the slower economy.
It is GATED. Do not start it, test/balance.js or test/proxy.js without an explicit go -- and double-check
when the go comes. When it does: finish .claude/review/attack-clock.js first (it measures the frame of the
first wave with ai.waves, the counter aistyles reads), measure, then tune AI.budget()'s claim order, the
wave threshold and the build-order step timings in js/ai.js until aistyles and queens are green.

ALSO WAITING ON THE USER: tools/wobble-fix.js, the dragoon wobble fix. Measured and working, not committed,
because on 136b1b0 it moved the long-standing flaky aistyles line onto seed 1, the gate's seed. It was
measured BEFORE the economy change, so re-measure it after 7b before asking again.

KNOWN REDS: aistyles + queens (the economy, above). test/soak.js's Swarm Host line (unchanged). The
research-stall report (TODO-M18 item 4) is NOT reproduced; the probes are tools/stall-*.js.

HOW THIS PROJECT WORKS, none of it negotiable:
  - node test/all.js is the gate before EVERY commit. A red rooms with EADDRINUSE is a port collision
    (8793-8798): re-run node test/rooms.js alone, then the gate. Touch nothing in js/ or test/ while it runs.
  - MEASURE BEFORE FIXING. Build the probe first; make it assert its own setup.
  - EVERY new behaviour gets a negative control that goes cleanly RED. tools/control.js applies one.
  - tools/patch.js <spec.js> for every text-anchored edit. Write specs and probes with the Write tool:
    bash mangles backslashes AND backticks here.
  - Determinism: never Math.random() in sim code (G.rand()), never a native transcendental in a stamped
    file (DMath). Anything a replay must reproduce goes through the command log (test/cmdlog.js).
  - The comments are load-bearing. Do not delete reasoning.

AFTER ANY AI OR SIMULATION CHANGE, by hand, recording the numbers -- ALL of them, not just the red one:
  node test/aistyles.js --seed=1 / --seed=5 / --seed=11
  node test/eightplayer.js   its bank line is the identity check
Expect the samples to RE-DEAL. A different deal is not a failure; a new KIND of failure is.

ALSO ON DISK: four locked worktrees at e9fe40e hold superseded agent work for this session's tasks. Ask the
user before removing them (git worktree remove --force <path>, then git branch -D <branch>).

CLOSE every piece of work the way CLAUDE.md says: a kickoff prompt, a numbered list of what changed FOR A
PLAYER, and how to playtest each item by hand, written into the repo.
```
