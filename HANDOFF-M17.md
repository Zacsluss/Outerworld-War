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
>
> **NEXT:** nothing is left on the review's list. What remains is gated or a product decision — the balance run
> (every number in `HANDOFF.md` is stale, and the list of things it must price has grown), the claim order in
> `AI.budget()`, and for the desktop build the Mac side, signing and a real icon. The kickoff prompt below says so.

`HANDOFF-M16.md`'s traps are still true. Three facts of the third session moved: `eightplayer` is 19 of 19 by
hand now (its money line green since the geyser fix, its "nothing wedged" line green since task 29) and its bank
line is the identity check for refactors again; `aistyles` seed 11 is clean (its first-wave line went green on
task 30's re-deal); and the gate is **76 suites** (`abilities20` joined it).

---

## State

- **76 test suites green.** `node test/all.js`, about four minutes on a quiet machine. That is the gate before
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

One commit, presentation only (`index.html`, the panel wiring in `js/ui.js`, one line of `PLAY-ONLINE.bat`);
the stamp did not move. `PLAYTEST-M17.md` item 59 is the hand test.

1. **The front of the menu is three buttons -- SINGLE PLAYER, MULTIPLAYER, SETTINGS** -- on a steel plate with
   the title in gold, in the shape of a nineties RTS menu. Nothing else on the front but a one-line footer.
2. **Everything else stands behind one of the three**, each on a screen of its own with BACK: Single Player holds
   the quick START GAME with its summary, SKIRMISH SETUP, CAMPAIGN (its own screen), LOAD SAVED GAME, WATCH
   REPLAY, CONTINUE AUTOSAVE and MAP EDITOR; Multiplayer holds Server, Name, Room, CONNECT, the desktop app's
   HOST A GAME and the lobby; Settings holds audio, hotkeys, CONTROLS and CODEX. The user asked because the
   lobby and the room code could not be found: both sat inside a collapsed disclosure at the foot of the old menu.
3. **Skirmish's BACK returns to Single Player**, the door it is behind, not to the front; Codex closes back to
   Settings; a finished game still returns to the front.

**Deliberately different from what was asked:** nothing. **Not done:** the in-game pause menu (F10) is drawn on
the canvas by `hud.js` and was not restyled; the Controls and Skirmish screens took the new plate and buttons
but their layouts are unchanged. Every element keeps its id, so the wiring, `test/skirmish.js`'s scrape,
`test/controls.js` and `desktop/page-check.js` needed no change.

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
node test/all.js                                  76 suites, ~4 min, the pre-commit gate
node test/eightplayer.js                          19/19 by hand; the bank line is the identity check for refactors
node test/aistyles.js --seed=N [--frames=14400]   1 is the gate's; run 5 and 11 too after any AI change
node test/abilities20.js                          every ability, 73 checks in two seconds
node test/review17.js / review17ui.js             sections 19-22 and 13 are this session's pins
node test/rooms.js                                61 checks; section 11 is the window and the rejoin flag
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

## Kickoff prompt for a fresh chat

Paste everything inside the fence into an empty chat. **Replace the HEAD hash with `git log -1 --format=%h`
first** — committing this file moves it.

```
Repo: C:\Users\zacsl\OneDrive\Documents\Default Project\broodwar
Branch: m10-overnight. HEAD: <run git log -1 --format=%h>. Working tree clean. (master is 170+
commits behind and unmerged; nothing lives there.)

Read CLAUDE.md, then HANDOFF-M17.md (this file: the state, the known reds, the traps of four
sessions), then REVIEW-M17.md sections 2, 3 and 4 (every open task in section 1 is DONE and points at
its entry; section 4 is what was deliberately not done), then PLAYTEST-M17.md.

THE STATE: the review is finished. 76 suites green; the stamp is b2d136a211dfe314. Three known reds, none
blocking: test/soak.js's Swarm Host line; test/aistyles.js seed 5's one economy line (57 vs 61);
nothing else. test/eightplayer.js is 19/19 by hand and its bank line is the identity check for any
refactor.

THE MENU (fifth session): the front is three doors -- SINGLE PLAYER, MULTIPLAYER, SETTINGS -- with
everything else behind them (PLAYTEST-M17 item 59). Presentation only; the in-game F10 menu on the
canvas was not restyled. The five leftover agent worktrees are gone.

THERE IS NO LIST TO FINISH. What is left is gated or a product decision, and needs the user's explicit
instruction before any of it starts:
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
the gate (node test/all.js, 76 suites) green before the commit -- re-run test/rooms.js alone if it is
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
