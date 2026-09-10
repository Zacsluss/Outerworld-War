# HANDOFF — M13: the AI economy

Written 2026-09-10, at the end of the session that finished M12 and then spent most of itself fixing
the AI. Branch `m10-overnight`, working tree clean, HEAD `ba7a87e`.

**Read `DESIGN-M12.md` first** — it carries the full write-up of what was found and why. This file is
the state transition: where things stand, what is next, and what will bite you.

---

## State

- **50 test suites green.** `node test/all.js`, ~2 minutes. That is the gate before any commit.
- **The slow suites outside it** were all run this session: `missions` (8 scenarios, green),
  `saveload` (54, green), `eightplayer` (19, green after three stale assertions were fixed),
  `longgame` (60-minute game + bit-identical replay, green except one timing budget — see below),
  `soak` (18 games, one failing assertion — see below).
- **M12 is complete**: all sixteen items, all three races' rosters, documented in `DESIGN-M12.md` and
  `PLAYTEST-M12.md`.

### The two known reds

1. **`test/soak.js`** fails one assertion: `every tier-1/2 M12 def is fielded` — 15/16, Oracle missing.
   Tier-3 M12 coverage is 4/13 and is *reported*, not asserted, at the default game length.
2. **`test/longgame.js`** fails one timing budget: a seek takes ~103.5 s against a 90 s budget. **This
   is not a regression** — measured at 106.6 s on the pre-M12 tree, so the budget was written on a
   faster machine. Either re-base it with a note saying what it was measured on, or make the seek
   faster.

Neither is in `test/all.js`, so both are green-adjacent rather than blocking.

---

## What this session changed

### M12 finishing work

- `test/zerg12.js` roach check was sampling only survivors at frame 14000; now three seeds with a
  separate "ever reached" record.
- **Warp Prism psi bug**: a *parked* prism lost its power field permanently the first time any pylon
  completed or died anywhere on the map, because `recomputePsi` read every source's centre from
  `u.tx`, which only buildings have. That broke warp-in onto a prism, which is the whole feature.
- **Nine persistent field kinds drew nothing at all**, including `force_field`, which writes blocked
  tiles — an invisible wall that stops your army. `test/fields.js` now requires every kind the sim can
  push into `G.fields` to issue paint calls.
- `raiseForceField`/`clearForceField` moved into `js/map.js`, dropping a load-order guard that failed
  silently.
- Three stale assertions in `test/eightplayer.js`, all the same shape: sampling one frame to answer a
  question about a whole game.

### The AI (most of the session)

Ten distinct faults, each measured before it was touched. Full detail in `DESIGN-M12.md`; the short
version is that the AI could not reach tier 3 in twenty minutes **unmolested**, and the decisive
experiment was handing it unlimited gas — every race then reached every tier-3 building in five to
eight minutes, so the tech tree and scripts were sound and the whole problem was resource flow.

Results, contested games, before → after:

| | before | after |
|---|---|---|
| Protoss Stargate | 16:01 | **5:18** |
| Protoss Robotics | never | **4:35** |
| Terran Starport | never | **5:59** |
| Zerg Spire | never | 12:21 |

Composition, solo 20-minute Protoss: zealots 77 → 56, dragoons 3 → 18, and eleven unit types that had
never once been built now appear.

Scouting was decorative — `enemyAir` was a raw scan of `G.units` with **no vision test**. There is an
intel model now (`observe`, `sawAir`, `sawCloak`, `readEnemy`, `overrun`) driving composition
counters, attack timing, and a decision to abandon teching when overrun. `test/aiadapt.js` covers it.

---

## What is next, in order

The ordering is dependency-first: **one root cause sits underneath most of what is left.**

### 1. Split the resource reserve — the root cause, do this first

There is currently **one shared brake with four overrides bolted on**: `reserveMin`/`reserveGas`, the
40% floor in `afford()`, `techStarved()` hard mode, the 35% gas hold in `production()`, and the
research surplus rule. Each was added to fix one symptom and they now fight each other — softening one
of them for combat units flooded the army with marines and dropped Goliaths from 15 to 1.

Replace with two explicit budgets per think: **committed** (the next build step plus in-flight
construction) and **free** (everything else). Units, upgrades, expansions and workers spend only from
free.

This is the root of all of:

- Siege Tank, Wraith, Battlecruiser, Colossus, Void Ray, Tempest reported "buildable, never chosen"
- Oracle missing from the soak (15/16)
- tier-3 soak coverage stuck at 4/13
- the Zerg roach ratchet already logged in `DESIGN-M12.md` (roach top-ranked in 114 of 186 production
  thinks and trained in none of them)

Expect several to resolve without their own fix.

**Build the diagnostic before the fix.** A per-think spend ledger — what was reserved, what was spent,
what was refused and by which gate. Every time this session measured first, the fix was right the
first time; every time it guessed, it was wrong and had to be reverted.

### 2. Re-tune `AI_COMP` weights against the fixed economy

Every heavy unit was set to a pick-order score of ≤1.25 (55 bumps) **while the economy was starved**.
After step 1 those numbers are calibrated against conditions that no longer exist. Re-derive them.

### 3. Zerg economy

Zerg is mineral-bound, near-permanently tech-starved, and reserves for its head step
*unconditionally* — the M7 lever inside `script()`, kept because it is worth 15 points in TvZ. That
lever is why Zerg needed an exemption from the research brake. After step 1 the exemption may be
unnecessary: **check, and delete it if so**, rather than leaving a special case nobody can explain.
Zerg's Spire at 12:21 against Protoss's Stargate at 5:18 is the number to move.

### 4. Re-measure and set the acceptance bar

`test/techtime.js` solo **and** contested, plus `test/soak.js`. The user's bar: **every tier-3 unit
fielded inside 15 minutes, in a game that lasts that long.** Then make the soak's tier-3 assertion
binding instead of a report, so it cannot regress silently.

### 5. `test/longgame.js` seek budget — independent, small, slot in anywhere

### 6. The balance run — LAST, and gated

**Do not start it without an explicit instruction, and double-check when one is given.** It has to be
last because every step above invalidates it, and this branch has already moved balance far more than
M12 alone did: tech pacing, composition weights, supply cap, gas staffing, scouting, counters, attack
timing. **Every balance number in `HANDOFF.md` is stale.** A real run is ~40 minutes and its output is
a confidence interval, not a pass/fail.

---

## Traps — all of these cost real time this session

1. **A dead player looks like a broken AI.** Twice, a measurement was read as "the AI never builds X"
   when the AI had simply been destroyed and was sitting on 2 supply. `test/techtime.js` has a `solo`
   mode (opponent with `ai = null`) for exactly this. **Check supply and building count before
   concluding anything about a build order.**
2. **Stale constants outlive the thing they referred to.** `AI.supply()` returned early at
   `supMax >= 200` when `SUPPLY_CAP` has been 500 since M11 — so the AI capped itself and could not
   buy anything expensive. `test/eightplayer.js` asserted `<= 200` for the same reason. **Read the
   constant, never the literal.**
3. **Backticks inside a JS template literal** passed to `vm.runInContext` terminate it. Broke
   `test/zerg12.js` and `test/soak.js` when a comment used `` `seen` ``. Do not use backticks in
   comments inside those blocks.
4. **`test/patch10.js`, `patch11.js`, `patch15.js` are NOT tests** — they are one-off codemods that
   rewrite files in `js/`. They now refuse to run without `--i-know-this-rewrites-source`. One of them
   appended a duplicate `CMD.install()` to `js/commands.js` before throwing.
5. **CRLF.** Every file in this repo is CRLF; `git show <rev>:file` emits LF. Patch scripts must
   detect and preserve the file's own line ending or every merge looks like a total rewrite.
6. **Bash heredocs break** on certain content in this environment. For multi-line patches, write a
   Python file with the Write tool and run it, then delete it — do not fight `<<'EOF'`.
7. **A regex probe that re-derives a guard goes stale** the moment the real guard is edited. Two
   probes reported nonsense this way. Watch real state (`scriptIdx`, bank, `underway()`) instead of
   copying conditions.
8. **`\s*[^']` and `\s*(?!')` both match the space**, because `\s*` backtracks to empty. Trim
   explicitly and look at one character.

## Conventions that are not negotiable

- **Determinism.** Never `Math.random()` in sim code — use `G.rand()`. Anything a replay must
  reproduce goes through `G.init` options or the command log.
- **Build stamp scope.** `js/build.js` hashes simulation files only. Render and UI changes must not
  move the stamp; data and sim changes must.
- **Tests are plain node, no framework**, PASS/FAIL lines, registered in `test/all.js`, and **every
  new behaviour gets a negative control.** A check that passes with the feature deleted is not a
  check — this caught two bad tests this session.
- Never register a duplicate entry in the `TESTS` array; `zerg12` is already there at line 90.

## Diagnostics available

```
node test/all.js                                  50 suites, ~2 min, the pre-commit gate
node test/techtime.js [min] [seeds] [solo|vs]     when the AI reaches each tier
node test/soak.js [--frames=] [--seeds=]          every matchup, coverage report
node test/longgame.js                             60-minute game and its replay
node test/aiadapt.js                              intel is vision-gated; massing vs teching
node tools/bake.js                                re-bake sprites after art changes
```
