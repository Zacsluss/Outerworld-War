# Working agreement — Brood War remake

Loaded automatically every session. Kept short on purpose; the detail lives in `HANDOFF-M14.md`
(current state and plan), `FIXLIST-M14.md` (twenty-one locked player-reported items, which
come first), `DESIGN-M13.md` (what was built and why), and `PLAYTEST-M13.md`.

---

## Close every major task with a handoff

A "major task" is a milestone, a numbered work item, or any stretch of work that produced commits
worth playtesting. At the end of one, **do all three of these without being asked**:

### 1. A ready-to-paste kickoff prompt for a NEW chat

Long chats get expensive and eventually lose the early context. So every major task ends by handing
over to a fresh one. The prompt must stand alone — someone pasting it into an empty chat should need
nothing else:

- repo path, branch, HEAD commit, whether the tree is clean
- which file to read first for state (`HANDOFF-M14.md` or its successor)
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

- **`node test/all.js` is the gate before any commit.** ~2 minutes. Green means green.
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
- **LINE ENDINGS ARE MIXED, so DETECT PER FILE.** The old rule here said "every file in this repo is
  CRLF" and that is measured false: **71 files are CRLF, 77 are LF-only and two (`HANDOFF.md`,
  `HANDOFF-M13.md`) are already mixed.** `js/net.js`, `index.html`, `test/serve.js` and most of `test/`
  are LF. A patch script that assumes CRLF silently matches nothing and reports a zero anchor count,
  which is how this was found. Detect the ending the file already has, reuse it, and build every
  multi-line anchor as an ARRAY joined with it rather than as a literal.
  `git show <rev>:file` emits LF regardless. `core.autocrlf` is true, so git normalises on commit and
  a working-copy mismatch usually produces no diff at all -- do not chase one.
- **`test/patch10.js`, `patch11.js`, `patch15.js` are NOT tests** — they are one-off codemods that
  rewrite `js/`. They refuse to run without a flag. Leave it that way.
