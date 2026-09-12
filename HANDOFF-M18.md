# HANDOFF — M18 (the seventh session: the user's second list)

Written at the end of the seventh session (2026-09-12). Branch `m10-overnight`, which is `origin/main`. **Everything is
committed and pushed; there are no open pull requests, no other branches and no extra worktrees.** Trust `git log -1`
for HEAD, not a hash written here.

> **READ `TODO-M18.md` FOR THE OPEN LIST** (its first section is this session's list, item by item, with commits).
> `PLAYTEST-M18.md` items 73–87 are how to see this session's work by hand. `RESEARCH-LOBBY.md` is the lobby research.
> `HANDOFF-M17.md`'s traps are all still true; this session's are below, then the sixth session's.

---

## The state

- **The gate is 83 suites and 2 are red, the same two the user already accepted as waiting on the rebalance:**
  `aistyles` and `queens`. Both are the computer's pacing under the slower economy. `queens` joined `zerg12`'s old place
  this session: keeping unit bodies apart shifted the Zerg AI's build (it fields its first army sooner and mines more,
  1–24% over four seeds, but starts the Queen's Nest later, so its Queens arrive about a minute after the ten-minute mark
  the test checks). `zerg12` went green in the same change.
- **Build stamp `71053b300e9bf18a`** (moved once this session, by unit bodies). Saves and replays from before are refused.
- **By hand, on the final tree:** `aistyles` seeds 1/5/11 — the same seven economy lines as before the session's sim
  change, with the long-standing flaky "harasser fields more fast units than turtle" line re-dealt between seeds;
  `eightplayer` 18/19 (the economy-floor line; it was 17/19 before bodies); `net_many` 51/51.
- **Desktop:** `desktop/dist` refreshed. The relay sidecar (`bw-relay`) is rebuilt from `test/serve.js` by `npm run dev`
  and `npm run build` on their own (`beforeDevCommand`), so the desktop HOST button gets the new lobby on the next build.

### The decisions still waiting on the user

1. **The AI rebalance (TODO-M18 7b) is still gated** — the user said "no rebalance yet, still more bugs to fix". It now has
   two more things to absorb, both consequences of units no longer overlapping: fewer melee units can hit one target at
   once (sixteen zerglings on a marine: about five, where sixteen could before), and the Zerg AI's later Queens.
   `test/balance.js` and `test/proxy.js` stay untouched until an explicit go, double-checked.

---

## What changed this session, in a player's language

1. **The dragoon wobble is fixed** — committed on the user's word.
2. **The HUD is 1.4 times its original size** (the doubled one was too big), and now a **HUD size slider** in Settings
   goes from 1.0x to 1.6x and is remembered.
3. **The minimap is black until you explore it**, not a dim map with everything visible.
4. **The mouse cursor has no lag** — it is the real cursor dressed in the game's art, not a drawing a frame behind.
5. **Minerals were measured, not changed**: 48 a worker a minute, against StarCraft II's 54–61. The earlier change had
   landed; the fast rate seen was most likely an old page or an old desktop build.
6. **A builder stays where it finished**, instead of walking back to the minerals (Terran and Protoss both checked).
7. **A worker inside a Refinery stays selected** and shows "Harvesting gas" in the HUD.
8. **Queued buildings show a faint ghost** where they will go, and nothing can be placed on top of one.
9. **Supply Depots lower into the ground and rise again** (R), with StarCraft II's rules.
10. **Units no longer stand inside each other.** Each unit keeps the room its model really takes up: a dozen marines
    told to one spot used to hide 53% of their drawn area under each other and now hide 3%. Mining, repair, archon
    merges, following and melee all still work, each checked. **What it costs, deliberately:** fewer melee units fit
    round one target, one-tile chokes take about twice as long, and the Zerg AI gets its Queens a minute later.
11. **The multiplayer screen is a full hub**: a searchable, filterable, sortable game list with a detail pane (map, players,
    rules), QUICK JOIN, and an **invite link** that connects and joins by itself. Your name, server and race are
    remembered.
12. **Ready means ready**: START waits until every other player has readied and says who it is waiting on; changing
    the map, speed, rules, computers or teams withdraws everyone's ready; the host can **nudge** a player with a bell.
13. **Every player's connection is shown** (bars and milliseconds, red when slower than the command delay), and **chat
    says everything that changed** — joins, leaves, kicks, a new host, the map, each rule.
14. **Teams can be locked and shuffled**, and **a game can no longer hold more players than its map has starts** — a
    fifth player on a four-start map used to be built inside player one's base.
15. **The skirmish rules work online**: starting bank, weather, day and night, destructibles, derelicts, wildlife, the map
    sizes and procedural maps.
16. **Spectators**: watch a lobby or a game already running, with the whole map in view, without taking a seat; the
    players never wait on a spectator.
17. **Settings are in tabs** (Game, Display, Audio, Multiplayer, Controls) with scroll speed, edge scrolling, one master
    volume, and your multiplayer name and server; all remembered except mute. F10 → Settings steps the same values in a
    game.

**Not done, and said so:** the AI rebalance (gated); a **rematch / back-to-the-same-lobby** after a game (the relay would
have to hand a finished room back to its lobby while a player may still be watching its end — a design of its own);
**ratings and skill-balanced teams** (nothing records a result to rate); **choosing a start position** (a seat is its
start, and a choice would have to be read in the stamped `G.init`); the **research stall** (TODO-M18 item 4, still not
reproduced).

---

## Traps found this session

1. **Bash heredocs mangle backslashes too**, not only `node -e`: a quoted heredoc turned `'\\n'` inside a template
   literal into a real newline. Write specs and probes with the Write tool, as CLAUDE.md says.
2. **`sed -i` in Git Bash rewrites a CRLF file as LF.** Git normalises it away, but `tools/patch.js` then sees a different
   ending. Edit with node scripts that keep the file's own ending.
3. **More players than starts is silently accepted by `G.init`**: player i takes `map.starts[i % starts.length]`. The lobby
   now refuses such a room (`capOf` in the relay, `Net.mapCap` in the host's client), but the engine does not — and
   `test/net_many.js` plays five on four-start maps on purpose, so its clients declare eight seats.
4. **Any "close enough to touch" check between two units must be read against bodies**, not footprints. Orders about an
   ally (repair, follow, merge, cast) are covered by the ally-order-target rule in `G.separate`; a NEW reach check that is
   not the unit's `order.target`/`partner` will be held out by bodies. `test/overlap.js` section 3 is the pattern.
5. **The relay does not re-broadcast the lobby state when a countdown ends in a start**: a client's last `lobby` message
   still says `starting` during the game. Test on the `start` message, not on `lobby.state`.
6. **`test/rooms.js` sections 12 and 15 pin lobby markup** (`class="lbTeam"`, `data-join`, `id="lbStart"`, `3/8`,
   `in game`…). Keep those names when restyling the lobby.
7. **Suites that start relay games without readying need `BW_READY=0`**, the way they already set `BW_COUNTDOWN=0`.
8. **`UI.menuItems()` for the end screen reads `G.log`**, which `UI.start` sets and a bare `G.init` does not.
9. **The browser pane's screenshot crops to a zoomed corner when the emulated viewport is larger than the pane.** Verify
   state with `javascript_tool` and do not trust a cropped picture for layout.

## Diagnostics added this session

`.claude/review/overlap/` — `probe.js` (hidden model area, collisions, surround, mining, gap throughput, perf),
`controls.js`, `gap-trace.js`, `queens-sweep.js`, `zerg-econ.js`, `zerg-builds.js`. `tools/bodies.js` measures every
model's body from the bake pipeline (`--table` prints the table for `js/data.js`). `.claude/review/lobby/` — the specs, and
`controls.js` (21), `controls-spectate.js` (12), `controls-settings.js` (13).

---

## Kickoff prompt for a fresh chat

Paste everything inside the fence into an empty chat. **Replace the HEAD hash with `git log -1 --format=%h` first** —
committing this file moves it.

```
Repo: C:\Users\zacsl\OneDrive\Documents\Default Project\broodwar
Branch: m10-overnight. HEAD: <run git log -1 --format=%h>. Working tree clean.
origin = https://github.com/Zacsluss/Outerworld-War, whose main IS this branch (git push publishes).
Everything is pushed; there are no open PRs, no other branches, no extra worktrees. Keep it that way.

READ IN THIS ORDER, then start:
  1. CLAUDE.md          -- the working agreement. Every line was earned; none is optional.
  2. HANDOFF-M18.md     -- state, what changed for a player, the traps (this session's first).
  3. TODO-M18.md        -- the open list; its first section is the seventh session's list with commits.
  4. PLAYTEST-M18.md    -- items 73-87, this session's work, by hand.
  5. RESEARCH-LOBBY.md  -- what makes an RTS lobby great, and what this one now has.

THE STATE: the gate (node test/all.js, 83 suites, ~5 min) is 2 RED, both known and accepted by the user as waiting
on the AI rebalance: aistyles and queens (the computer's pacing under the slower economy). Build stamp
71053b300e9bf18a. By hand: aistyles seeds 1/5/11 same seven economy lines; eightplayer 18/19; net_many 51/51.

THE SINGLE NEXT ACTION: ask the user for their playtest of PLAYTEST-M18 items 73-87 and their next list. The user's
last word on the rebalance was "no rebalance yet - still more bugs to fix". Do NOT start TODO-M18 7b, test/balance.js
or test/proxy.js without an explicit go, and double-check when it comes. When it does, it must also absorb two
consequences of units keeping their bodies apart: fewer melee attackers fit round one target, and the Zerg AI's
Queens arrive about a minute later.

IF ASKED FOR MORE LOBBY: the documented next step is a rematch -- the finished room handed back to its lobby with the
same players. Read RESEARCH-LOBBY.md section 4 for why it was left, and design the "a player is still watching the end"
case before writing code.

HOW THIS PROJECT WORKS, none of it negotiable:
  - node test/all.js is the gate before EVERY commit. Relay ports: 8793-8800 rooms, 8810-8813 lobby, 8840 spectate.
    A red rooms/lobby with EADDRINUSE is a stray server: re-run that suite alone, then the gate. Touch nothing in
    js/ or test/ while the gate runs.
  - MEASURE BEFORE FIXING. Build the probe first; make it assert its own setup.
  - EVERY new behaviour gets a negative control that goes cleanly RED.
  - tools/patch.js <spec.js> for every text-anchored edit. Write specs and probes with the Write tool: bash mangles
    backslashes AND backticks here, heredocs included. Never sed -i a CRLF file.
  - Determinism: never Math.random() in sim code (G.rand()), never a native transcendental in a stamped file (DMath).
    Anything a replay must reproduce goes through the command log (test/cmdlog.js).
  - The comments are load-bearing. Do not delete reasoning.

AFTER ANY AI OR SIMULATION CHANGE, by hand, recording ALL the numbers:
  node test/aistyles.js --seed=1 / --seed=5 / --seed=11
  node test/eightplayer.js
  node test/net_many.js     (after any relay or net change)
Expect the samples to RE-DEAL. A different deal is not a failure; a new KIND of failure is.

CLOSE every piece of work the way CLAUDE.md says: a kickoff prompt, a numbered list of what changed FOR A PLAYER, and
how to playtest each item by hand, written into the repo. Commit and push; leave nothing unmerged.
```

---

# The sixth session, kept for the record

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

