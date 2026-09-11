# HANDOFF — M17 (the review)

Written at the end of the session that did `REVIEW-M17.md`, the full codebase review. Branch
`m10-overnight`. (HEAD moves as this file is committed — trust `git log -1`, not a hash written here.)

> **THE REVIEW'S DELIVERABLE IS `REVIEW-M17.md`.** Its four lists are the state of the project: 23 open
> tasks with file, fault, fix and cost; 10 questions only you can answer; 11 things fixed with their
> measurements, controls and gate results; 13 things considered and deliberately not done, each with the
> reason. `PLAYTEST-M17.md` is how to see every fixed thing by hand.
>
> **Nothing is queued except your answers.** The balance run stays gated. The AI's spending priorities
> stay gated, and the review put three more measured AI findings next to them (questions 7-10).

`HANDOFF-M16.md` remains true for its traps and its account of M15; two of its facts moved and are
corrected below (the fourth red is gone, and `eightplayer` was never 19/19 at that tree).

---

## State

- **73 test suites green.** `node test/all.js`, ~3 minutes. That is the gate before any commit. Four
  suites joined it this session: `saveload` (which had never run anywhere), `cmdlog`, `review17`,
  `review17ui`.
- **Ten commits since the `pre-review-m17` tag**, each gated. `git diff --stat pre-review-m17` shows
  everything the review changed.
- **The build stamp moved five times**, and the first move was the point: it was blind to 56 of the 76
  things the simulation reads (the whole of `Combat`, `DMG_MULT`, `MINE_TIME`, `SUPPLY_CAP`, …). Every
  save and replay from before the review is refused with the reason, which is the stamp doing its job.
- **Multiplayer was run by hand** against the hardened relay: `node test/net.js` all pass,
  `node test/net_many.js` **51 of 51** (44 before; the fourth known red is gone, see below).

### The known reds now — two, not four

1. **`test/soak.js`** — one tier-1/2 coverage assertion, Swarm Host never fielded. Unchanged, not
   weakened, not in the gate.
2. **`test/aistyles.js` seeds 1 and 11** — four assertions, no style attacks inside a 12,000-frame
   window. Unchanged. Seed 5, the one the gate runs, is clean.

And one that was mis-recorded:

3. **`test/eightplayer.js` is 18/19, and has been since FIXLIST-M15 C3 (`89f2e40`).** HANDOFF-M16
   said 19/19 with the money assertion passing by 4%; that number (2405) is from `57d61d2`, two commits
   earlier. The review bisected it (19/19 at HANDOFF-M15, C1 and C2; 18/19 from C3 on — one bank at
   2630 against 2500), ran it three times to show it is deterministic, and ran it before and after
   every simulation change in the review: **byte-identical banks every time**, so nothing here moved
   it. The cause the test names is `AI.macro`'s `wantHalls` floor, which is AI spending, which is
   gated. **Question 2 in the review** is whether to accept it as a known red until the balance work.

**Gone:** `test/net_many.js`'s "phase 4: the promoted host's host-only command is obeyed" was the
assertion, not the relay, exactly as HANDOFF-M16 said. It now asserts the rule it contradicted (no
setting is mutable once a game has started, from the promoted host or anyone else) and a lobby-phase
block proves the promotion with the powers a lobby has.

---

## What the review changed, in a player's language

1. **Saves and replays are honest again.** The stamp covers everything the simulation reads, and a
   list-audit in `test/version.js` keeps it that way.
2. **Every order the interface can issue survives the command log.** Arming a Medic's autocast now
   replays and reaches LAN peers (it never did: any game with an armed Medic desynced or replayed
   wrong); the Dropship ferry works from the card; a malformed save is refused with a sentence.
3. **Eight simulation faults**, each measured before it was touched: a Carrier that stopped launching
   for the game, fields that cured a longer status, a sieged tank that walked on follow/load/repair, a
   cloaked unit that could not decloak below 25 energy, a larva that could become an SCV, a worker
   scanning every frame, an uncounted exception in the tick, and Charon Boosters that *shortened* the
   Goliath's air range.
4. **The interface:** keys no longer leak into the menu's text fields, Shift+= zooms, F8 asks before
   replacing a game, Tab turns the card page, an ally's ping is a "last alert", network games pace the
   draw on the host's speed and a menu no longer freezes peers, the editor draws on its second open,
   effects fire once per sim frame rather than per drawn frame, non-square maps draw all their rows,
   the minimap uses the tileset's colours, the manual scrolls.
5. **The relay no longer trusts its clients**: any player could order another player's units by
   writing their slot into a command; one malformed URL crashed every room; the checkout was served
   whole; a dead connection was never noticed. All closed, with a keepalive and a frame cap.
6. **The AI:** an allied AI no longer storms its partner (26 clauses tested "enemy" by owner alone);
   with wildlife on, the wave no longer marches on a derelict.
7. **Tests:** the runner reads every failure shape and shows every FAIL line, a hang is a failure, four
   vacuous anchors have count guards, a mangled regex works again, the wall-clock budgets are gone.
8. **Docs, comments, dead code**: HANDOFF.md and README point at the present; eight comments that
   described the code as it was a milestone ago say what it does; 25 dead definitions and branches
   are gone; eight literals are named constants.

**Deliberately different from what was asked:** nothing. **Left unfinished:** the 23 open tasks in
`REVIEW-M17.md`, the largest being the HUD override that leaves two shipped features never drawing
(task 1) and the cross-engine floating point question (task 2 / question 1).

---

## Traps found this session

On top of everything in `HANDOFF-M13.md` to `HANDOFF-M16.md`. Each cost real time.

1. **A `//` comment appended to a one-line method kills the rest of the line.** Most of `js/` is
   one statement per line with several statements on it; a patch that adds `// why` after the first
   statement comments out the rest and `node --check` is the only thing that notices. Use `/* */`
   inside a line, `//` only on a line of its own.
2. **`test/veterancy.js` defines a munition as "a def with no `min` key".** A constructor default of
   `min: 0` for every def turned it red. The rule says revert, and the revert was right: the mine's
   missing price was the original NaN bug, fixed by refusing to repair munitions. Price the one
   repairable def that lacked one; leave munitions priceless.
3. **Line numbers go stale the moment you commit** — the six region reviewers' findings all carried
   line numbers and half of them were off by the time they were read. Anchor every patch on text.
   `.claude/review/multi.js` refuses to write unless every anchor matches exactly once.
4. **`js/fx.js` has two `switch` statements with the same `case` labels** (impact effects, then the
   in-flight drawing). A scrape for `case 'shell':` finds the first and reports nothing about the
   second. Scope a scrape to the function.
5. **`test/larvacard.js` starts its game with `G.init`, not `UI.start`**, and drives keys through
   `UI.onKey`. Any guard added to `onKey` that reads `UI.running` has to be reflected there.
6. **`test/eightplayer.js`'s bank line is a free identity check for AI edits.** Deterministic, 37 s,
   eight AIs: if it prints the same eight banks before and after a change, the change did not touch a
   plain game. Used four times this session; it caught nothing, which is what it is for.
7. **Counting calls to a global from a probe counts every caller.** `G.nearestDepot` was "called 35
   times" after the fix because the other player's workers ask once per trip, legitimately. Count for
   the unit under test.
8. **A raw test client never answers `needsnap`**, so a rejoin it donates for arrives after the relay's
   4-second fallback. Poll for the `rejoin`, do not sleep 400 ms.
9. **The nested-heredoc trap is still alive** (HANDOFF-M13 trap 6, HANDOFF-M15 trap 6): a node script
   fed through a bash heredoc had its `\\r\\n` turned into real newlines inside a JS string. Write
   patch scripts and long commit messages to files with the Write tool and run them.
10. **`UI.onKey` had no target guard**, so a harness that stubs `document` and never focuses anything
    tested keys the browser would have sent to a text field. `review17ui.js` passes `target.tagName`
    explicitly.

---

## Diagnostics available

```
node test/all.js                                  73 suites, ~3 min, the pre-commit gate
node test/cmdlog.js                               every order the interface can issue survives the log
node test/review17.js                             the eleven simulation faults the review pinned
node test/review17ui.js                           the interface faults the review pinned
node test/rooms.js                                rooms, the cap, the delay, and the relay hardening
node test/net_many.js                             four humans, drops, rejoins, host migration -- 51 checks, ~95 s
node test/net.js                                  two clients + AI over real sockets, ~2 min
node test/eightplayer.js                          18/19; the bank line is the identity check for AI edits
node test/version.js                              the stamp, and the audit of what it covers
node tools/inventory.js --md                      the repo map (the appendix of REVIEW-M17.md)
```

`.claude/review/` (gitignored) holds the review's probes and every gate log; `multi.js` there is the
line-ending-safe, exactly-one-match patch runner, and `ctl.js` applies a negative control, runs a
command, and restores the file from memory.

---

## Kickoff prompt for a fresh chat

**The to-do list is `REVIEW-M17.md`'s four lists, and the first thing to do is answer its questions.**
Paste everything inside the fence into an empty chat. **Replace the HEAD hash with
`git log -1 --format=%h` first** — committing this file moves it.

```
Repo: C:\Users\zacsl\OneDrive\Documents\Default Project\broodwar
Branch: m10-overnight. HEAD: <run git log -1 --format=%h>. Working tree clean.

Read CLAUDE.md, then HANDOFF-M17.md, then REVIEW-M17.md in full, then PLAYTEST-M17.md.

REVIEW-M17 was a stop-and-inspect pass over the whole codebase: ten commits since the tag
pre-review-m17, all gated, and four lists at the bottom of REVIEW-M17.md. Those lists ARE the
to-do list. Nothing else is queued.

THE FIRST ACTION: go through REVIEW-M17.md section 2 (ten questions) and tell me my decisions,
one line each. The ones that unblock work are:
  1. mixed-browser multiplayer a target?           -> open task 2 (deterministic trig)
  2. eightplayer red since FIXLIST-M15 C3           -> accept as a known red, or authorise a change
  3. line endings                                   -> .gitattributes + one re-checkout, or leave
  5. 23 stale worktrees (4 with uncommitted edits) -> remove the clean ones?
  7-10. bunker double fire, the AI cadence bug and dead detector weight, the eleven inert
        energy techs, p.seen                        -> now, with the balance run, or never
Then take the open tasks in section 1 in order, starting with task 1 (the HUD overrides that leave
two shipped features never drawing), which needs the game open in a browser to judge.

THE GATE: node test/all.js, 73 suites, about three minutes, before EVERY commit. Green means
green. If a change fixes a real fault but turns a marginal assertion red, revert it anyway and
say so -- that happened six times in this project now (the sixth is in REVIEW-M17 section 4,
item 7) and all six reverts were right.

MEASURE BEFORE FIXING. Every fix in the review started from a probe; the six region reviewers
each shipped probes and half their line numbers were stale by the time they were read -- anchor
on text. Every new behaviour gets a negative control that goes RED when the feature is removed
and is a CLEAN red, not a crash. .claude/review/ctl.js applies a control, runs a command, and
restores the file from memory; multi.js is the exactly-one-match patch runner.

KNOWN REDS, none of which block:
  - test/soak.js fails one tier-1/2 coverage assertion (Swarm Host). Do not weaken it.
  - test/aistyles.js seeds 1 and 11 fail four assertions. Seed 5, the gate's, is clean.
  - test/eightplayer.js is 18/19 and has been since FIXLIST-M15 C3; bisected, deterministic,
    untouched by the review. The cause is gated AI spending. Question 2.
  (net_many's fourth red is gone: the assertion was wrong, and it has been replaced.)

GATED, needs my explicit instruction: test/balance.js, test/proxy.js, the claim order in
budget(), and anything justified by "better balance" -- which now includes the AI cadence bug
(open task 4) and the dead detector weight (task 9), both one-line fixes that change what the
computer does on easy and normal.

Read the traps in HANDOFF-M17 before writing any probe: a // comment on a one-line method kills
the rest of the line; test/veterancy.js defines a munition as a def with no min key; js/fx.js
has two switches with the same case labels; test/larvacard.js starts with G.init and needs
UI.running set by hand; eightplayer's bank line is a free identity check for any AI edit.
```

---

## Conventions that are not negotiable

Unchanged, and every one of them earned its place again:

- **Determinism.** Never `Math.random()` in sim code — use `G.rand()`.
- **`node test/all.js` is the gate.** Green means green.
- **Measure before fixing.** Every fix in this review started from a probe and none was reverted for
  being wrong; the one revert (the `min` default) was for turning an assertion red, which is the rule.
- **Every new behaviour gets a negative control**, and it must produce a clean red rather than a crash.
- **Read the constant, never the literal.** Eight more literals became constants this session.
- **Build stamp scope.** `js/build.js` now names every top-level binding of every stamped file, in a
  list or in `NOT_SIM` with a reason, and `test/version.js` refuses a tree where that is not so.
- **The balance run is gated.**
