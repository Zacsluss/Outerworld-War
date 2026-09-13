# Working agreement — Brood War remake

Loaded automatically every session. Kept short on purpose; the detail lives in `HANDOFF-M18.md` (**current
state, the decisions waiting on the user, known reds, traps, the kickoff prompt**), `TODO-M18.md` (the open
list with every measurement), `PLAYTEST-M18.md` (items 64 onward, by hand), `RESEARCH-LOBBY.md` (the lobby research), `RESEARCH-TERRAIN.md` (terrain: OpenRA's way, the Badlands test run, the terrain queue's research), `docs/terrain/` (the approved look), `HANDOFF-M17.md` and
`PLAYTEST-M17.md` (everything before), `REVIEW-M17.md` (the full codebase review) and `DESIGN-M13.md`.

---

## Close every major task with a handoff

A "major task" is a milestone, a numbered work item, or any stretch of work that produced commits
worth playtesting. At the end of one, **do all three of these without being asked**:

### 1. A ready-to-paste kickoff prompt for a NEW chat

Long chats get expensive and eventually lose the early context. So every major task ends by handing
over to a fresh one. The prompt must stand alone — someone pasting it into an empty chat should need
nothing else:

- repo path, branch, HEAD commit, whether the tree is clean
- which file to read first for state (`HANDOFF-M17.md` or its successor)
- the single next action, stated as an action, not a topic
- the test gate (`node test/all.js`)
- any known reds and whether they block
- anything currently gated (the balance run) and that it needs explicit instruction

### 2. High-level bullets of what was actually done

Numbered, one line each, in the user's language rather than function names. What changed *for a
player*, not which file moved. Include what is deliberately different from what was asked and why,
and anything left unfinished — stated plainly, not buried.

### 3. How to playtest each item BY HAND

This is the part that gets skipped and is the reason the whole convention exists. For each item, say
concretely how to reach it and what to look for:

- the screen or menu to open, the key to press, the unit or building to select
- what "working" looks like, in a sentence
- where a mechanic is invisible from normal play, say so and say what to do instead

Write the durable version into the repo — a `PLAYTEST-*.md` — and commit it. Nothing important should
exist only in a chat transcript.

---

## Non-negotiable

- **`node test/all.js` is the gate before any commit.** 99 suites, about two minutes wall on this machine. Green means green. A red
  `rooms` with `EADDRINUSE` is another gate or a stray server on the relay ports (8793-8800; 8810-8813 for `lobby`, 8820-8821 for `starts`, 8840 for `spectate`, 8850-8851 for `rematch`, 8860-8863 for `safety`, 8890-8892 for `ratings`, 8900 for `joincode`, 8904 for `aislots`, 8908 for `colours`, 8912-8913 for `leaver`; 8870-8871 is the playtest recorder, 8897 `tools/terrain-shot.js`, 8899 the `broodwar` preview server), not a fault:
  re-run `node test/rooms.js` alone, then the gate.
- **Determinism.** Never `Math.random()` in simulation code — use `G.rand()`. Anything a replay or a
  rejoining client must reproduce goes through `G.init` options or the command log.
- **Every new behaviour gets a negative control.** A check that still passes with the feature deleted
  is not a check. This has caught real bad tests here more than once.
- **The balance run is gated.** Do not start `test/balance.js` or `test/proxy.js` without an explicit
  instruction, and double-check when one is given. Every balance number in `HANDOFF.md` is stale.
- **Measure before fixing.** In this codebase, every fix that started from a measurement was right the
  first time and every fix that started from a hypothesis had to be reverted. Build the probe first.
- **Read the constant, never the literal.** Stale constants have caused real bugs here (`AI.supply()`
  returning early at 200 when `SUPPLY_CAP` had been 500 for a milestone).
- **DETECT LINE ENDINGS PER FILE, even now that they are uniform.** `.gitattributes` (REVIEW-M17,
  decision 3) normalises to LF in the repository and checks out with the platform ending, so a fresh
  checkout on Windows is CRLF throughout (134 of 134 files, measured after the re-checkout). Before
  that it was 71 CRLF, 77 LF-only and 2 mixed, because tools write LF after checkout -- and they still
  can, so a patch script must detect the ending the file already has, reuse it, build every multi-line
  anchor as an ARRAY joined with it, and refuse to write on a zero anchor count (that count is how the
  mixture was found). `git show <rev>:file` emits LF regardless. A working-copy ending mismatch produces
  no diff at all -- do not chase one. `tools/patch.js` is the reference patch runner and `tools/control.js` applies a negative control and restores.
- **`test/patch10.js`, `patch11.js`, `patch15.js` are NOT tests** — they are one-off codemods that
  rewrite `js/`. They refuse to run without a flag. Leave it that way.
