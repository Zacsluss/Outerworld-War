# HANDOFF — M17 (the review, the decisions, the Zerg notes, and the open list finished)

Written at the end of the fourth session, the one that finished `REVIEW-M17.md` section 1: thirteen steps, one
commit each, every gate green before its commit. Branch `m10-overnight`. (HEAD moves as this file is committed —
trust `git log -1`, not a hash written here.)

> **THE STATE OF THE PROJECT IS `REVIEW-M17.md`.** Section 1's thirty open tasks are all marked **DONE** with a
> pointer to their section-3 entry (entries 20-32 are this session's); section 2 holds the decisions, including
> the last one (README's burning Terran buildings: the sentence was deleted); section 4 holds sixteen things
> deliberately not done. `PLAYTEST-M17.md` items 43-58 are how to see this session's work by hand.
>
> **FIFTH SESSION (2026-09-11): the main menu is three doors.** SINGLE PLAYER, MULTIPLAYER and SETTINGS on the
> front, everything else behind one of them on a screen of its own with a BACK, in the shape of a nineties RTS menu
> (a steel plate, a bronze frame, gold lettering, bevelled buttons). Presentation only: the stamp did not move.
> `PLAYTEST-M17.md` item 59 is how to see it. The five leftover agent worktrees were removed on the user's word.
> **Then the lobby browser** (the user's second ask, same day): CONNECT lists the games hosted on the server, HOST GAME
> makes one, a click joins one, and the lobby shows teams, ready marks and chat. The relay gained `list`, `leave`,
> `create`, `ready` and a per-team `addai`; a code-joined room stays unlisted. `test/rooms.js` section 12 (74 checks
> now); `PLAYTEST-M17.md` item 60.
>
> **NEXT:** nothing is left on the review's list. What remains is gated or a product decision — the balance run
> (every number in `HANDOFF.md` is stale, and the list of things it must price has grown), the claim order in
> `AI.budget()`, and for the desktop build the Mac side, signing and a real icon. The kickoff prompt below says so.

`HANDOFF-M16.md`'s traps are still true. Three facts of the third session moved: `eightplayer` is 19 of 19 by
hand now (its money line green since the geyser fix, its "nothing wedged" line green since task 29) and its bank
line is the identity check for refactors again; `aistyles` seed 11 is clean (its first-wave line went green on
task 30's re-deal); and the gate was **76 suites** (`abilities20` joined it; `ticker` made it 77 in the fifth session).

---

## State

- **On GitHub since the fifth session:** `origin` is https://github.com/Zacsluss/Outerworld-War and its `main` is
  this branch. Local `m10-overnight` tracks `origin/main`, so `git push` publishes; GitHub's own initial commit (a
  stub README and .gitignore) was merged in with ours kept, so the history is fast-forward from there.
- **79 test suites green.** `node test/all.js`, about four minutes on a quiet machine. That is the gate before
  any commit. One suite joined it this session: `abilities20` (task 20); forty-four suites moved onto
  `test/_harness.js` (task 21) with every count unchanged.
- **14 commits since `95c00e9`** (the third session's docs commit), each gated. The build stamp is
  **`b2d136a211dfe314`** at the last simulation change (task 22's relocations). Every save and replay from before the
  session is refused with the reason, which is the stamp doing its job; presentation and relay commits (tasks 1,
  13/14, 15, 16, 28, 21) did not move it.
- **Multiplayer was run by hand** after the relay commit: `node test/net.js` all pass, `node test/net_many.js`
  51 of 51, `node test/rooms.js` 61 of 61. The desktop build hosted a LAN game end to end
  (`desktop/window-check.js`, 23 of 23, twice on this machine).

### The known reds now

1. **`test/soak.js`** — one tier-1/2 coverage assertion, Swarm Host never fielded. Unchanged, not weakened, not
   in the gate.
2. **`test/aistyles.js`** — the gate runs **seed 1** (132 of 132 with its new tick-error check). **Seed 5 fails
   one economy line** (expander vs turtle workers at five minutes, 57 vs 61 — the same line all session, through
   five re-deals). **Seed 11 is clean** since task 30 (its first-wave line went green on that re-deal and stayed).
3. **`test/eightplayer.js`** — **19 of 19 by hand** and deliberately not in the gate: its money line is a
   measurement (every AI under 500 minerals on the last deal, one Zerg at 804), its "nothing wedged" line green
   since task 29 (max stuck 0). Its bank line — `377/324 804/283 147/103 222/70 302/214 392/64 221/653 303/167`
   at the end of the session — is the identity check: it was byte-identical after tasks 6, 19/18/12/17, 20 and
   22/24 and re-dealt only by the AI commits (5/7/8, 30) and the stamp move of task 29.

---

## What the fourth session changed, in a player's language

The thirteen steps, in the order they were listed (with the entry in `REVIEW-M17.md` section 3):

1. **The day/night dial draws** beside the clock on Nightfall, and **the selection strip keeps every selected
   unit on the console** (forty Marines used to put twenty-two below the screen). Dead `ui.js` drawing bodies
   deleted. *(task 1, entry 20)*
2. **An uprooted crawler walks out of a gap it does not fit**, and a rooting order that gave up **no longer
   teleports the building to the ordered tile** (sixteen tiles, measured). `eightplayer` is 19 of 19. *(task 29,
   entry 21)*
3. **A computer Zerg with a Hive still researches the Lair's techs**; **its Ravens and Disruptors march with the
   army** instead of standing where they were built; a Lair or add-on no longer double-counts its money for the
   rest of the think. *(tasks 5, 7, 8, entry 22)*
4. **The computer rebuilds a tech building it loses** — the build order goes back to the missing step. *(task 30,
   entry 23)*
5. **One supply test everywhere; a nuke builds when supply is short** (it used to sit at 0% for ever under a
   "supply blocked" alert). *(task 6, entry 24)*
6. **Relay:** a batch claiming a far-future frame is dropped (it used to poison every later rejoin's catch
   target); **rejoining a finished game no longer applies its last frame twice**. *(tasks 13, 14, entry 25)*
7. **Tests that see more:** the three AI suites catch exceptions inside a tick; `observer` counts ticks, not
   milliseconds; the ally test and the tall-map clamp are live scenes; a drawn unit's screen fields no longer ride
   saves and rejoin snapshots. *(tasks 19, 18, 12, 17, entry 26)*
8. **A rebind cannot land on a key the game keeps** (F8, the digits, the camera slots, Ctrl+M ...): the Controls
   screen says "F8 is reserved" instead of silently killing the action. README's burning-buildings sentence
   deleted (the user's decision). *(task 15, entry 27)*
9. **Presentation cost measured**: five of the seven suspected costs were not costs; **a field of corpses and the
   editor's minimap were**, and both are fixed (the decal pass 1.7 to 0.6 ms with 119 corpses; the 256x256
   editor minimap 8.3 to 0.2 ms). *(task 16, entry 28)*
10. **Every ability the gate never drove is driven** (`test/abilities20.js`, 73 checks), which found and fixed
    two Carrier faults: **an Interceptor could circle its Carrier for ever without docking**, and **every other
    Interceptor survived the frame its Carrier died**. *(task 20, entry 29)*
11. **Small refactors with results unchanged** (caps, capacity and energy costs read the data; five M12 blocks
    relocated; `HOVER` derived; four dead `tools/` exports gone). A computer Protoss with Reaver Capacity now
    fills its Reavers to ten; a Probe puffs dust instead of leaving tyre tracks. *(tasks 22, 24, entry 30)*
12. **The desktop build exists**: `desktop/` is a Tauri 2 project; the relay ships unchanged as a
    single-executable sidecar; HOST A GAME in the app spawns it and kills it with the window (and a Job Object
    kills it if the app dies). The Windows installer was built and driven end to end here. *(task 28, entry 31)*
13. **One test harness**: forty-four gate suites share `test/_harness.js`, 286 lines fewer, every
    suite's counts and output unchanged. *(task 21, entry 32)*

**Deliberately different from what was asked:** task 7's derived support list was rejected by measurement (it
adds the Overlord and drops the Arbiter and the Dark Archon) — the two units are named instead. Task 16 fixed
only what the probe named. Task 20 fixed the two faults its coverage found rather than leaving them red, because
both were the faults the task's own mechanics (Interceptor loss on Carrier death) exist to catch. Task 22's
`Unit.suppresses` cache was measured and left (4.6 ms a game; a cache cannot be proved sound). Steps 8-13 were
prepared by five agents in their own worktrees and landed on the main line in order, each re-verified here.
**Left unfinished:** nothing on the list. Task 28's Mac build is written and unbuilt (no Mac here), nothing is
signed, the icon is a placeholder.

---

## What the fifth session changed, in a player's language

Two commits. The stamp did not move: `index.html`, `js/ui.js`, `js/net.js`, `js/desktop.js` and the relay are not
simulation. `PLAYTEST-M17.md` items 59 and 60 are the hand tests.

1. **The front of the menu is three buttons -- SINGLE PLAYER, MULTIPLAYER, SETTINGS** -- on a steel plate with
   the title in gold, in the shape of a nineties RTS menu. Nothing else on the front but a one-line footer.
2. **Everything else stands behind one of the three**, each on a screen of its own with BACK: Single Player holds
   the quick START GAME with its summary, SKIRMISH SETUP, CAMPAIGN (its own screen), LOAD SAVED GAME, WATCH
   REPLAY, CONTINUE AUTOSAVE and MAP EDITOR; Multiplayer holds Server, Name, CONNECT, the desktop app's HOST A
   GAME and the lobby browser (item 4); Settings holds audio, hotkeys, CONTROLS and CODEX. The user asked because the
   lobby and the room code could not be found: both sat inside a collapsed disclosure at the foot of the old menu.
3. **Skirmish's BACK returns to Single Player**, the door it is behind, not to the front; Codex closes back to
   Settings; a finished game still returns to the front.
4. **CONNECT opens a lobby browser.** The Multiplayer screen lists every game hosted on the server you connected
   to -- name, host, map, players, open or in game -- and updates live. HOST GAME (with a name) makes one; a click
   on a row joins one; JOIN BY CODE is for a private room, which is never listed. The relay makes up the code.
5. **The lobby shows teams.** Players sit under Team 1, Team 2, ... with a join link per team, add AI per team for
   the host, a ready mark per player (READY toggles it; an AI is always ready), the host's star and kick, the map
   and speed pickers for the host, START GAME, LEAVE and a chat box. A joining human lands on the least-populated
   team (the relay used to give every joiner a team of their own, so a third human opened Team 3). Leaving returns
   you to the list; the host leaving hands the room to the next human; the last human leaving removes the game
   from the list.
6. **Typing a room code is the private path now**, and the page's help no longer sends anyone to a .bat file.
   `PLAY-ONLINE.bat` says: share the link, host from the list, or agree a code for a game strangers must not see.
   The relay's rule that it never lists its rooms is gone by the user's decision; the private property survives
   for code-joined rooms, and the header comment says so.
7. **The other player no longer freezes every second when the host's window is hidden or covered.** The
   simulation's clock is a Worker timer, which a hidden tab cannot throttle (measured in the pane: 10 sim calls
   in five hidden seconds from a page timer, 313 from the worker; the peer used to get eight frames in one burst
   a second). A page interval remains the fallback where Workers do not exist or stay silent.
8. **The camera no longer pans on its own after Alt-Tab.** A key the page never saw released (keydown, then
   focus elsewhere) kept the arrows' scroll going; focus leaving or the tab hiding forgets every held key, and
   the arrows are polled only with focus. `test/ticker.js` (17 checks, in the gate: 77 suites), three negative
   controls. `PLAYTEST-M17.md` item 61.

**Deliberately different from what was asked:** the lobby has no map preview -- a map is generated from the seed
the relay picks at START, so there is nothing to draw before it -- and no password on a listed game: a private game
is a code-joined room. **Not done:** the desktop app's HOST A GAME was re-pointed (it starts its relay, then hosts a
listed game on it; `desktop/page-check.js` 22 of 22) but `desktop/window-check.js` was not re-driven, which needs a
Tauri build; the in-game pause menu (F10) is drawn on the canvas by `hud.js` and was not restyled; the Controls and Skirmish screens took the new plate and buttons
but their layouts are unchanged. Every element the wiring reaches keeps its id (only the Room box went, with the
code-first flow), so `test/skirmish.js`'s scrape, `test/controls.js` and `desktop/page-check.js` needed no change.

---

## Traps found in the fourth session

On top of everything in `HANDOFF-M13.md` to `HANDOFF-M17.md`'s earlier list. Each cost real time.

1. **Two gates on one machine collide on the relay ports.** `test/rooms.js` binds 8793-8798; another gate (an
   agent's worktree, a second session) or a stray server on one of them turns `rooms` red with `EADDRINUSE`, and
   the runner reports a plain failure. Re-run `node test/rooms.js` alone before reading anything into it; keep
   probe servers off that range (the render probe moved to 8790).
2. **A hidden browser pane throttles the page's timers to one a second.** Any measurement paced with
   `setTimeout` reads ten times too high or never finishes. Front the tab (`tabs_select`), or pace with a spin.
3. **Bash mangles backslashes and heredocs in this environment**, even quoted ones: `\\d` arrives as `\d`, a
   heredoc with a quoted delimiter still loses them. Write scripts and patch specs with the Write tool, never
   inline.
4. **Inside a vm template literal `\d` is `d`.** A regex in a test's `vm.runInContext(\`...\`)` needs `[0-9]`.
5. **`test/eightplayer.js` reads `js/` three times** (the editor context, the game, the "Dry" game at the end);
   nothing may patch `js/` until its last PASS line, a minute after the bank line.
6. **A docs spec anchored on the previous entry's tail breaks the moment a placeholder in it is filled.** Anchor
   new entries on the section heading (unique, never rewritten) — `.claude/review/reanchor.js` does that.
7. **`G.tick` is a no-op after `G.over`, and so is a donor's frame.** A snapshot taken then already holds its
   frame's batch (task 14): the usual "restore, then apply the batch for the snapshot's frame" applies it twice.
8. **Every branch of `onKey` returns**, so a key collision is not two actions but one dead one, decided by line
   order — a rebind that "does nothing" is the symptom.
9. **Worktree agents write only inside their worktree**; deliverables for the main tree go to an absolute path
   under `.claude/review/` and are landed by the main line, never merged.

---

## Diagnostics available

```
node test/all.js                                  79 suites, ~4 min, the pre-commit gate
node test/seldraw.js                              the queued-order lines, and that a dead unit draws no bar, 21 checks
node test/netaudio.js                             an alert is heard only by the player it is about, 10 checks
node test/ticker.js                               the Worker clock and the held-key guards, 17 checks in a second
node test/eightplayer.js                          19/19 by hand; the bank line is the identity check for refactors
node test/aistyles.js --seed=N [--frames=14400]   1 is the gate's; run 5 and 11 too after any AI change
node test/abilities20.js                          every ability, 73 checks in two seconds
node test/review17.js / review17ui.js             sections 19-22 and 13 are this session's pins
node test/rooms.js                                74 checks; section 11 is the window and the rejoin flag, 12 the lobby browser
node test/net_many.js / node test/net.js          the socket suites, ~100 s and ~60 s
node .claude/review/perf-probe.js [port=8790]     the render-cost probe (open the URL with the pane in front)
node .claude/review/agent-21/migrate.js --check   which suites the harness codemod would move on this tree
cd desktop && npm run check:relay / check:page / check:window     the desktop build's three checks
node tools/patch.js <spec.js>                     exactly-one-match, line-ending-safe patching
node tools/control.js <file> <a> <b> <cmd...>     apply a negative control, run, restore from memory
```

`.claude/review/` (gitignored) holds every probe, spec, gate log and agent deliverable of this session: `gate-23`
to `gate-36 (and the codemod's verify run)`, `spec-task*.js`, `ep-stuck2.js`/`ep-pocket.js`/`crawler-scenes.js` (task 29),
`ai578-probe.js`, `rebuild-probe.js`, `nuke-probe.js`, `lead-measure.js`, `perf-probe.js` and its results, and
`agent-15/`, `agent-20/`, `agent-2224/`, `agent-28/` (with the built installer), `agent-21/`, each with a
`NOTES.md`.

---

## The user's thirteen-item list (fifth session, paused for the night)

Brought after the first internet game against a friend. Status of each, in the user's own numbering:

| # | item | status |
|---|---|---|
| 1 | AI settings not editable in the multiplayer lobby | **open** -- worktree, partial |
| 2 | both players hear each other's announcements | **DONE**, commit `8dbb471`, PLAYTEST item 62 |
| 3 | Queens/Overlords should walk into range to plant a tumour, not refuse | **open** -- worktree, partial |
| 4 | some tech gets stuck during research | **open** -- worktree, partial |
| 5 | the HUD is far too small, should be doubled | **open** -- worktree, nearly done |
| 6 | workers should not cross the map when their patch runs out | **open** -- worktree, partial |
| 7 | minerals gathered 2-3x faster than SC2 | **APPROVED, to re-apply** -- 7a, then 7b |
| 8 | queued moves should draw faint green lines | **DONE**, commit `7be866a`, PLAYTEST item 63 |
| 9 | a dead unit's health bar lingers | **DONE: it does not.** Measured, no fault; pinned. Item 63 |
| 10 | the lobby should be finished and self-contained | **open** -- worktree, partial |
| 11 | dragoons wobble after moving | **open** -- worktree, partial |
| 12 | a 5-4-3-2-1 countdown before a network game unlocks | **open** -- worktree, partial |
| 13 | the lobby should look like SC2's (screenshots supplied) | **open**, with 10 |

### Item 7: measured, changed, and REVERTED. Read this before touching the economy.

**Measured** (`.claude/review/mine-rate.js`, 16 workers on a saturated line, seed 7, Lost Ruins, nothing
spending): **100 minerals per worker per minute**, a 114-frame cycle for 8 minerals -- 75 frames inside the
patch, 39 walking. That is **x2.4 StarCraft II** (~41/min) but only **x1.15 Brood War** (~87/min). The game was
already close to the one it remakes; the gap the user felt is SC2's deliberately slower economy.

A sweep (`.claude/review/mine-sweep.js`) measured every candidate rather than deriving it:

| MINE_TIME | 75 | 90 | 105 | 120 | 140 | 160 | 190 |
|---|---|---|---|---|---|---|---|
| minerals/worker/min | 99.8 | 89.3 | 80.3 | 71.0 | 64.5 | 58.0 | 49.8 |
| vs Brood War | x1.15 | x1.03 | x0.92 | x0.82 | x0.74 | x0.67 | x0.57 |
| vs StarCraft II | x2.43 | x2.18 | x1.96 | x1.73 | x1.57 | x1.41 | x1.21 |

The user chose the SC2 end. `MINE_TIME 190, GAS_TIME 94` was applied (gas scaled by the same 2.53x so the
gas-to-mineral ratio was untouched) and **it broke the game**:

- **`test/aistyles.js`: seeds 1, 5 and 11 all red with the "never attacked" sentinel (43200) for every style.**
  No computer opponent mounted a first wave inside the ten-minute window on any seed. The rusher, the turtle
  and the standard read identically because none of them attacked at all.
- The gate went **4 of 79 red**: `version`, `aistyles`, `zerg12`, `queens`. (`version` is a stale anchor in the
  test itself -- it edits `const MINE_TIME = 75,` -- and would need re-anchoring for any real change here.)
- `test/eightplayer.js` 18/19: peak supply `21/51/57/33/56/31/19/50` against a floor of 20.

**Reverted**, per the rule in `CLAUDE.md` that a change turning the canaries red is reverted even when it does
what was asked. The cause is not the constant: the AI's build orders and its attack threshold are tuned for the
current income, so halving income makes the computer stop playing. **Re-tuning them is the gated balance work.**
Do not retry this without taking the AI with it.

**Unfinished instrument:** `.claude/review/attack-clock.js` measures the frame of the first wave at each
candidate, using `ai.waves` -- the same counter `aistyles` reads. It was stopped mid-run. A first version of it
counted army units near the enemy start instead and reported "never" for Zerg even at today's settings: a probe
that disagrees with a known-good instrument is a broken probe, not a finding. That version is gone.

### Three worktrees hold partial, UNVERIFIED work

Stopped mid-task when the night ended; none had written its deliverable to `.claude/review/agent-*/` yet, so
**nothing of theirs is on the main line and none of it is gated**. `git worktree list` shows them, all locked,
all based on `e9fe40e`:

- **lobby** (items 1, 10, 12, 13) -- was fixing a check that passed with the feature deleted.
- **HUD scale** (item 5) -- was verifying its deliverable reproduces on a clean tree. The furthest along.
- **four sim bugs** (items 3, 4, 6, 11) -- three of four written, was starting item 11's patch.

Either resume them or re-dispatch fresh with the same briefs; **a fresh dispatch is the safer default**, because
what is in those worktrees has not been gated and has no notes saying what was measured. Remove them with
`git worktree remove --force <path>` and `git branch -d <branch>` once their work is landed or abandoned.

---

## Kickoff prompt for a fresh chat

Paste everything inside the fence into an empty chat. **Replace the HEAD hash with `git log -1 --format=%h`
first** — committing this file moves it.

```
Repo: C:\Users\zacsl\OneDrive\Documents\Default Project\broodwar
Branch: m10-overnight. HEAD: <run git log -1 --format=%h>. Working tree clean. (master is 170+
commits behind and unmerged; nothing lives there.) origin = https://github.com/Zacsluss/Outerworld-War,
whose main IS this branch (m10-overnight tracks origin/main; git push publishes).

Read CLAUDE.md, then HANDOFF-M17.md (this file: the state, the known reds, the traps of four
sessions), then REVIEW-M17.md sections 2, 3 and 4 (every open task in section 1 is DONE and points at
its entry; section 4 is what was deliberately not done), then PLAYTEST-M17.md.

THE STATE: the review is finished. 79 suites green; the stamp is af56c841f794af2f. Three known reds, none
blocking: test/soak.js's Swarm Host line; test/aistyles.js seed 5's one economy line (57 vs 61);
nothing else. test/eightplayer.js is 19/19 by hand and its bank line is the identity check for any
refactor.

THE MENU (fifth session): the front is three doors -- SINGLE PLAYER, MULTIPLAYER, SETTINGS -- with
everything else behind them (PLAYTEST-M17 item 59). Presentation only; the in-game F10 menu on the
canvas was not restyled. The five leftover agent worktrees are gone.

THE LOBBY BROWSER (fifth session): CONNECT lists the games hosted on the server, HOST GAME makes one,
a click joins one, the lobby shows teams, ready marks and chat; a code-joined room stays unlisted.
Relay messages list/leave/create/ready and a per-team addai; test/rooms.js section 12 (74 checks);
PLAYTEST-M17 item 60. The desktop app's HOST A GAME now starts its relay and hosts a listed game;
desktop/window-check.js was not re-driven (needs a Tauri build).

THE CLOCK (fifth session): the simulation runs on a Worker timer (UI.makeTicker), so a hidden or
covered host window no longer starves its peer; held keys are forgotten on blur and the arrows are
polled only with focus (UI.armFocusGuards). test/ticker.js, 17 checks; PLAYTEST-M17 item 61.

THERE IS A LIST, AND IT IS THE USER'S THIRTEEN ITEMS (the table above). Four are closed (2, 8, 9, and 7
by a measured revert); nine are open and eight of those have partial, ungated work sitting in three
locked worktrees. Read the table and the item-7 section before starting: re-dispatching the three
agents fresh is the safer default, and the economy must not be touched without taking the AI's build
orders and attack threshold with it.

Beyond that list, what remains is gated or a product decision and needs explicit instruction:
  - THE BALANCE RUN (test/balance.js, test/proxy.js) and the order of the eight claims in AI.budget().
    Every number in HANDOFF.md is stale. The list of what it must price grew again this session: the
    Hive's Lair techs (task 5), Ravens and Disruptors that move (7), morph/add-on claims released (8),
    rebuilt tech buildings (30), the nuke at the cap (6), Interceptors that dock and die (20), the
    Reaver cap read from the def (22). Do not start it without being told; double-check when told.
  - THE DESKTOP BUILD's Mac side (written, unbuilt: needs a Mac), code signing, a real icon and
    identifier, and internet play from the app (untested: no tunnel here). desktop/NOTES in
    .claude/review/agent-28/NOTES.md section 6 has the exact commands.
  - The harness's remaining tiers (16 canvas-tier suites, 8 ui-tier singletons) if anyone wants them
    on test/_harness.js; the codemod refuses anything whose stub it does not match exactly.

If the user brings a new fault: MEASURE BEFORE FIXING (every fix this session that started from a
measurement was right the first time; the one hypothesis -- that the corpse filter was the cost --
was checked by an interleaved A/B before it was kept), a negative control that goes cleanly RED with
the feature removed, tools/control.js for controls, tools/patch.js for edits anchored on text, probes
and specs written to files under .claude/review/ with the Write tool (bash mangles backslashes), and
the gate (node test/all.js, 79 suites) green before the commit -- re-run test/rooms.js alone if it is
the one red (the relay ports collide with any other gate on the machine). After any AI or simulation
change: aistyles seeds 1, 5, 11 and eightplayer by hand, and expect the samples to re-deal.

CLOSE every piece of work the way CLAUDE.md says: a kickoff prompt for the next chat, a numbered
list of what changed for a player, and how to playtest each item by hand, written into the repo.
```

---

## Conventions that are not negotiable

Unchanged, and every one of them earned its place again:

- **Determinism.** Never `Math.random()` in sim code — use `G.rand()`; never a native transcendental in a stamped
  file — use `DMath`.
- **`node test/all.js` is the gate.** Green means green; a red `rooms` on `EADDRINUSE` is a port collision, not a
  fault — re-run it alone, then the gate.
- **Measure before fixing.** Task 16's probe named two costs out of seven; the other five would have been changed
  for nothing.
- **Every new behaviour gets a negative control**, and it must produce a clean red rather than a crash.
- **Read the constant, never the literal.** `AI_CLOAK_RESERVE`, `MULE_HAUL`, `hangarCap`, `cargoCap` exist because
  the literals disagreed with the data or with each other.
- **Build stamp scope.** `js/build.js` names every top-level binding of every stamped file; `test/version.js`
  refuses a tree where that is not so.
- **The balance run is gated.**
