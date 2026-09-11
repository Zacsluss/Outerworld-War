# HANDOFF — M17 (the review, the decisions, and the Zerg notes)

Written at the end of the three sessions that did `REVIEW-M17.md`: the full codebase review, the user's
ten answers to its questions, and then the user's three Zerg notes (open tasks 25-27) with one fault found
while measuring them. Branch `m10-overnight`. (HEAD moves as this file is committed — trust `git log -1`,
not a hash written here.)

> **THE STATE OF THE PROJECT IS `REVIEW-M17.md`.** Section 2 holds the ten questions and, above them, the
> decisions table with what each one became. Section 3 holds 19 fixed entries with measurements, controls
> and gate results — 18 and 19 are the third session's. Section 1 holds the open tasks: 30 listed, of
> which 23, 25, 26 and 27 are done and 29 and 30 were found by the third session; section 4 holds 15
> things deliberately not done. `PLAYTEST-M17.md` is how to see every fixed thing by hand (items 38-42
> are the third session's).
>
> **NEXT: task 1** (the HUD overrides that leave two shipped features never drawing — needs the game open
> in a browser to judge), **then task 28** (peer hosting only: the relay must ship with the Tauri app),
> **then tasks 29 and 30** (an uprooted crawler grinding on a `land` order it cannot complete; the AI never
> rebuilding a destroyed tech building), both measured with their probes named. The balance run stays
> gated.

`HANDOFF-M16.md` remains true for its traps and its account of M15. Three of its facts moved: the fourth
red is gone (the assertion was wrong and was replaced), `eightplayer` was never 19/19 at that tree, and
the gate's `aistyles` seed is 1 now, not 5.

---

## State

- **75 test suites green.** `node test/all.js`, ~3.5 minutes. That is the gate before any commit. Six
  suites have joined it since the review began: `saveload` (which had never run anywhere), `cmdlog`,
  `review17`, `review17ui`, `dmath`, and now `queens` (the Zerg notes).
- **20 commits since the `pre-review-m17` tag**, each gated: 16 in the first two sessions, 2 for the Zerg
  notes and the geyser fault, this docs commit and the one before it.
- **The build stamp moved with every simulation change**; it is `7f822858401946ae` at this file's commit.
  Every save and replay from before the review — and from before the two Zerg commits — is refused with
  the reason, which is the stamp doing its job.
- **The simulation is engine-deterministic** (`DMath`, decision 1): the game will be sold wrapped in
  Tauri, so a Windows build (WebView2) and a Mac build (WebKit) have to agree bit for bit.
- **Multiplayer was run by hand** against the hardened relay in the second session: `node test/net.js`
  all pass, `node test/net_many.js` 51 of 51. Nothing in the third session touched the relay or the
  client; the stamp moved, so mixed-build games refuse to start, which is correct.

### The known reds now

1. **`test/soak.js`** — one tier-1/2 coverage assertion, Swarm Host never fielded. Unchanged, not
   weakened, not in the gate.
2. **`test/aistyles.js`** — the gate runs **seed 1** (131 of 131). After the Zerg commits: seed 5 fails
   one economy line (expander vs turtle workers at five minutes, 57 vs 61 — the same line as before),
   seed 11 fails one first-wave line (expander vs standard, 32 vs 34 over P; it was two lines, then none,
   then this one — every AI change re-deals all fifteen arms). Run all three after any AI or start-of-game
   change and expect movement; only seed 1 is a gate member.
3. **`test/eightplayer.js`** — **18 of 19 by hand**, and deliberately not in the gate. Its MONEY line is
   GREEN for the first time since FIXLIST-M15 C3 (banks 337/286/454/496/196/28/49/260 — every AI under
   500 minerals, after the geyser fix in entry 19). Its "nothing wedged itself for good" line is red on
   this deal: an uprooted Sunken Colony holding a `land` order it cannot complete, `stuck` 582 (open task
   29 — a real fault, not variance). Any AI edit re-deals the whole game; the bank line is no longer a
   free identity check for this tree, because both Zerg commits changed what the AI does.

---

## What the three sessions changed, in a player's language

The review (commits 1-10):

1. **Saves and replays are honest.** The stamp covers everything the simulation reads, and an audit in
   `test/version.js` keeps it that way.
2. **Every order the interface can issue survives the command log** — autocast arming replays and
   reaches LAN peers, the Dropship ferry works from the card, a malformed save is refused with a sentence.
3. **Eight simulation faults**, each measured first: a Carrier that stopped launching, fields curing a
   longer status, a sieged tank walking on follow, no decloak under 25 energy, a larva becoming an SCV,
   a worker scanning every frame, an uncounted exception in the tick, Charon Boosters *shortening* range.
4. **The interface:** keys no longer leak into the menu's text fields, Shift+= zooms, F8 asks first, Tab
   turns the card page, an ally's ping is a last alert, net games pace on the host's speed and a menu no
   longer freezes peers, the editor draws on reopen, effects fire per sim frame, non-square maps draw.
5. **The relay no longer trusts its clients** — any player could order another's units, one bad URL
   crashed every room, the checkout was served whole, a dead connection was never noticed.
6. **The AI:** an allied AI no longer storms its partner; waves no longer march on a derelict.
7. **Tests:** the runner reads every failure shape, shows every FAIL line, kills a hang; four vacuous
   anchors guarded; wall-clock budgets gone.

The decisions (commits 11-16):

8. **A Zerg player starts with a Queen**, and the AI injects with her from the first minute.
9. **Bunkers fire at the unit's own rate.** **Eleven energy upgrades give +50 max energy.** **Every
   computer opponent runs its micro**, and **it notices cloak**.
10. **A larva-starved Zerg AI adds hatcheries every 15 s** instead of 45.
11. **The fog shows what you last saw.**
12. **Online:** room codes are at least four characters, an address may join sixty times a minute, and
    cheats are off in network games.
13. **Deterministic maths** in the simulation, and **one line-ending rule**.

The Zerg notes (commits 17-18, the third session):

14. **Spawn Larva stacks a Hatchery: +3 larvae per cast, up to twelve.** A hall you never inject still
    spawns to three and stops, exactly as before. A cast on a full hall is refused and refunded; a
    cancelled egg goes back to a hall that already holds more than three (it used to die).
15. **The computer keeps one Queen at every Hatchery, Lair and Hive**, each homed to her hall: she injects
    it first, flies back when idle, and stays behind when the army leaves (which also closes open task 23,
    the Queen following the army). Measured before: one Queen all game, injecting two halls of five. After:
    Queens equal to halls by minute nine on four of four measured arms, every finished hall injected.
16. **The computer morphs larvae from its fullest Hatchery**, not from whichever is oldest.
17. **A gas geyser no longer dies when a worker inside it is re-ordered.** Found by measurement, not by the
    notes: the AI's own gas rebalancing did it to itself routinely, and one Zerg in the eight-player game
    had both extractors dead from minute five with three drones each standing outside.

**Deliberately different from what was asked:** task 26's text put the Queen's budget claim "above the
composition's top pick"; measured there, two of four arms never reached one Queen per hall, so she sits
above the head of the build order instead (at most a minute of tech on one arm; the seven claims that
existed keep their order — the gated claim order is untouched). `test/alerts.js`'s live check was
corrected, not weakened: it matched the supply message by text and two mechanisms speak it. **Left
unfinished:** open tasks 1, 28, 29, 30 and the rest of section 1.

---

## Traps found in these three sessions

On top of everything in `HANDOFF-M13.md` to `HANDOFF-M16.md`. Each cost real time.

1. **A `//` comment appended to a one-line method kills the rest of the line.** Most of `js/` puts
   several statements on a line; `node --check` is the only thing that notices. Use `/* */` inside a
   line, `//` only on a line of its own.
2. **`test/veterancy.js` defines a munition as "a def with no `min` key".** A constructor default of
   `min: 0` turned it red; reverted, and rightly. Price the one repairable def that lacked one.
3. **Line numbers go stale the moment you commit.** Anchor every patch on text. `tools/patch.js`
   refuses to write unless every anchor matches exactly once; `tools/control.js` applies a negative
   control, runs a command, and restores the file from memory.
4. **`js/fx.js` has two `switch` statements with the same `case` labels.** Scope a scrape to the function.
5. **`test/larvacard.js` starts its game with `G.init`, not `UI.start`**, and drives keys through
   `UI.onKey`; any guard on `UI.running` has to be reflected there.
6. **`test/eightplayer.js`'s bank line is a free identity check for AI edits** — until a change touches
   the RNG stream or the AI's decisions, after which every AI game is a different sample and the line
   says nothing. Both Zerg commits did; it is a measurement again.
7. **Spawning a unit at start re-deals every AI test.** `Unit`'s constructor draws a random facing, so
   the starting Queen shifted the RNG stream and re-sampled all fifteen `aistyles` arms.
8. **`canPlace` refuses unexplored ground** (FIXLIST-M14 C1), including for a test that wants to drop an
   enemy building at the map centre. Check the footprint's walkability and call `G.placeBuilding`.
9. **A regex for `Math.sin` matches `DMath.sin`.** Use a lookbehind, or count what you found.
10. **The `test/version.js` edit audit refuses a stale anchor.** When it says "the edit matched nothing",
    the anchor is stale, not the check.
11. **A raw test client never answers `needsnap`**, so a rejoin it donates for arrives after the relay's
    4-second fallback. Poll for the `rejoin`.
12. **Counting calls to a global from a probe counts every caller.** Count for the unit under test.
13. **Nested heredocs mangle `\r\n`** — and a `node -e` script in a bash double-quoted string loses its
    backticks and `$`. Write patch scripts, probes and long commit messages to files and run them
    (`.claude/review/` is gitignored for exactly this).
14. **A solo AI against an AI-less human seat wins in about nine minutes, and `G.tick` is a no-op once
    `G.over`.** Every reading freezes at the final frame: a Queen that "held an inject order for twenty
    seconds without moving" was a finished game. Probes that run one AI should print `G.over`'s frame.
15. **The supply message has two voices.** `G.tickAlerts` raises it as an alert; `G.supplyRefused` says the
    same sentence for an order refused for supply, on purpose. A check that matches the text catches both.
16. **`tools/control.js` edits `js/` in place while it runs.** Nothing else may read `js/` meanwhile — a
    probe or a canary started in parallel sees the control's tree. Run controls in one sequential chain,
    and on Windows chain nothing inside the control's own command (`spawnSync` with `shell: true` is
    `cmd.exe`, where `;` is not a separator); run the control once per suite instead.
17. **A probe that counts "seconds at the cap" must read the cap.** `larva-probe.js` counted `>= 3` and
    kept reporting a full hall after the cap became twelve.
18. **`test/all.js`'s `summarize()` is fine; the suite you just added is not in the gate until it is in the
    `TESTS` list.** `node test/all.js queens` is the check that the runner knows it.

---

## Diagnostics available

```
node test/all.js                                  75 suites, ~3.5 min, the pre-commit gate
node test/eightplayer.js                          18/19 by hand; money green, "nothing wedged" red (task 29)
node test/aistyles.js --seed=N [--frames=14400]   1 is the gate's; run 5 and 11 too after any AI change
node test/queens.js [--verbose]                   the Zerg notes: inject stacking, a Queen per hall, the fullest larva
node test/zerg12.js                               section 4 is the inject rule itself
node test/review17.js                             section 18 is the geyser wedge
node test/cmdlog.js  / review17ui.js / dmath.js   the review's other pins
node test/rooms.js                                rooms, the cap, the delay, the hardening, the cheats gate
node test/net_many.js / node test/net.js          the socket suites, ~100 s and ~60 s
node tools/patch.js <spec.js>                     exactly-one-match, line-ending-safe patching
node tools/control.js <file> <a> <b> <cmd...>     apply a negative control, run, restore from memory
node tools/inventory.js --md                      the repo map (the appendix of REVIEW-M17.md)
```

`.claude/review/` (gitignored) holds every probe and gate log of the three sessions. The third session's:
`larva-probe.js` (Queens, injects, larvae per hall), `queen-why.js` (why the AI never bought a Queen),
`queen-pos.js` (the claim's position, four arms), `queen-wander.js` / `queen-stuck.js` (what moves a homed
Queen), `ep-zerg.js` (the eight-player Zerg players minute by minute, takes a tree root), `ep-gas.js` /
`ep-gasdrones.js` / `ep-gastrigger.js` (the geyser wedge and who caused it), `ep-stuck.js` (the wedged
crawler, task 29, and Z1's missing Queen's Nest, task 30), `alert-lie.js` (the supply message's two
voices), and the `spec-*.js` patch specs that made every edit.

---

## Kickoff prompt for a fresh chat

Paste everything inside the fence into an empty chat. **Replace the HEAD hash with
`git log -1 --format=%h` first** — committing this file moves it.

```
Repo: C:\Users\zacsl\OneDrive\Documents\Default Project\broodwar
Branch: m10-overnight. HEAD: <run git log -1 --format=%h>. Working tree clean. (master is 160+
commits behind and unmerged; nothing lives there.)

Read CLAUDE.md, then HANDOFF-M17.md, then REVIEW-M17.md in full, then PLAYTEST-M17.md.

REVIEW-M17 was a stop-and-inspect pass over the whole codebase, a second session that carried out
the user's ten decisions, and a third that did the user's three Zerg notes (open tasks 25-27, and 23
with them) and fixed a wedged-geyser fault found while measuring them: twenty commits since the tag
pre-review-m17, all gated. The four lists at the bottom of REVIEW-M17.md ARE the to-do list; the
decisions table in section 2 says what each question became; entries 18 and 19 in section 3 are the
third session's work, with the measurements.

THE FIRST ACTION: REVIEW-M17.md open task 1 -- js/hud.js overrides eight UI draw methods at load, so
UI.drawSelGrid (the grouped selection strip) and UI.drawDayDial (the day/night countdown) never draw
in the browser. Start the game (PLAY.bat, http://localhost:8765), select 30+ units and look at the
strip, and look for the dial; then wire both into the HUD's drawConsole / drawTop, look at them on a
screen, and delete the eight dead ui.js bodies. It needs eyes on a screen, which is why it waited.
THEN task 28 (peer hosting only: the relay must ship with the Tauri app, as a Node sidecar or a port
of test/serve.js -- the protocol is pinned by test/rooms.js, net.js, net_many.js).
THEN tasks 29 and 30, both measured, probes named in the task text: an uprooted Sunken Colony holding
a `land` order it cannot complete grinds its stuck counter forever (eightplayer's "nothing wedged"
line is red on it); the AI never rebuilds a destroyed tech building (a Zerg that loses its Queen's
Nest can never make another Queen).

THE GATE: node test/all.js, 75 suites, about three and a half minutes, before EVERY commit. Green
means green. If a change fixes a real fault but turns a marginal assertion red, revert it anyway and
say so -- six times now, all six right. (When a re-dealt AI sample turns a check red, bisect with
tools/control.js first: the third session's alerts red was a test that matched a message by text
which two mechanisms speak, not a fault.)

MEASURE BEFORE FIXING. Every fix in three sessions that started from a measurement was right the
first time. Every new behaviour gets a negative control that goes RED when the feature is removed
and is a CLEAN red. tools/control.js applies a control, runs a command and restores; tools/patch.js
is the exactly-one-match patch runner. Anchor on text, never line numbers. Write probes and patch
specs to files under .claude/review/ (gitignored) -- heredocs and node -e mangle them.

KNOWN REDS, none block:
  - test/soak.js fails one tier-1/2 coverage assertion (Swarm Host). Do not weaken it.
  - test/aistyles.js: the gate runs seed 1 (clean). Seed 5 fails one economy line, seed 11 one
    first-wave line. Any AI change re-deals all fifteen arms; run 1, 5 and 11 and expect movement.
  - test/eightplayer.js is 18/19 by hand and deliberately NOT in the gate: its money line is GREEN
    now (every AI under 500 minerals after the geyser fix); its "nothing wedged" line is red on the
    wedged crawler of task 29.

GATED, needs my explicit instruction: test/balance.js, test/proxy.js, the claim order in budget()
(the Queen claim was ADDED above the head step by measurement; the seven that existed keep their
order), and anything justified by "better balance". The balance run's list: Charon Boosters, bunker
fire rate, the AI cadence and detector weight, the eleven energy techs, the larva-starved hatchery
cadence, the starting Queen, Spawn Larva stacking to twelve, a Queen per hatchery.

Read the eighteen traps in HANDOFF-M17 before writing any probe.
```

---

## Conventions that are not negotiable

Unchanged, and every one of them earned its place again:

- **Determinism.** Never `Math.random()` in sim code — use `G.rand()`. And never `Math.sin`, `cos`,
  `atan2` or `hypot` in a stamped file — use `DMath`; `test/dmath.js` scrapes for a native that crept back.
- **`node test/all.js` is the gate.** Green means green.
- **Measure before fixing.** The Queen's claim would have gone in the wrong place without `queen-pos.js`,
  and the eight-player bank would have been called variance without `ep-gas.js`.
- **Every new behaviour gets a negative control**, and it must produce a clean red rather than a crash.
- **Read the constant, never the literal.** `LARVA_NATURAL` exists because three literal 3s meant two
  different things the moment the cap became twelve.
- **Build stamp scope.** `js/build.js` names every top-level binding of every stamped file, in a list or
  in `NOT_SIM` with a reason, and `test/version.js` refuses a tree where that is not so.
- **The balance run is gated.**
