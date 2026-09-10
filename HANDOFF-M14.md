# HANDOFF — M14: the composition

Written at the end of the session that did M13. Branch `m10-overnight`, working tree clean. (HEAD
moves as this file is committed — trust `git log -1`, not a hash written here.)

**Read `DESIGN-M13.md` first** — it carries the full write-up of the budget, the four wrong turns and
what each cost, and the two orderings that were measured and rejected. This file is the state
transition: where things stand, what is next, and what will bite you.

---

## State

- **50 test suites green.** `node test/all.js`, ~2.5 minutes. That is the gate before any commit.
- **M13 is complete.** The AI's single shared spending reserve is gone, replaced by two explicit
  budgets per think. All four of the overrides that had accumulated on it are deleted, not re-tuned.
- **The slow suites outside the gate**, all run this session:
  - `longgame` — **green, 19 of 19**, and the seek red from the last handoff is gone. It was not a
    stale budget; forward seeks ignored the checkpoints. 88.5 s → 4.4 s.
  - `saveload` — green, 54.
  - `missions` — green, 8 scenarios.
  - `soak` — **one failing assertion**, see below.
  - `eightplayer` — **two failing assertions**, see below. It was already failing two before M13.

### What M13 moved

`node test/soak.js`, 18 games, measured against the commit before the change:

| | before | after |
|---|---|---|
| units fielded | 55/85 | **70/85** |
| **tier-3 M12 defs** | **4/13** | **11/13** |
| abilities invoked | 28/80 | **38/80** |
| techs researched | 38/71 | **68/71** |
| upgrades finished | 7/16 | **10/16** |

`node test/techtime.js 20 1,5,11 vs`, medians: Zerg Spire 18:14 → **7:47**, Hive 11:45 → **8:46**,
Defiler Mound 13:53 → **9:27**, Terran Machine Shop 10:07 → **4:06**, Science Facility 13:02 →
**9:10**, Protoss Fleet Beacon **never built** → **11:31**.

Protoss tier 3 is *later* (Stargate 5:15 → 7:24). That is real and it buys reliability — the old
numbers came from one or two surviving seeds of three, and the baseline's contested Terran finished a
twenty-minute game on **two workers**. All three races now finish alive on every seed with 69–71
workers, and every tier-3 building completes on every seed.

### The three known reds

1. **`test/soak.js`** fails `every tier-1/2 M12 def is fielded` — 15/16, **Swarm Host** missing. It
   was Oracle before M13. **Deliberately not weakened.**
2. **`test/eightplayer.js`** fails two of nineteen:
   - `every one of the eight players built an economy at some point` — **pre-existing**, fails
     identically on the pre-M13 tree (one player peaks at 13 workers against a floor of 20).
   - `no AI is left sitting on money it cannot spend` — **new in M13**, and understood. Two players
     bank ~2,900 minerals on ~14 gas at ten minutes: both geysers dry, every unit they want costs gas,
     and their mineral sinks are capped. M13 *fixed* the expansion assertion this test used to fail
     (9/16 bases claimed → 16/16), so the count is unchanged at 17 passed / 2 failed.
   - **Two fixes for the money one were measured and rejected; both are written into `js/ai.js` at the
     line in question so you do not re-derive them.** Do not spend the session there without reading
     that comment first.
3. Neither `soak` nor `eightplayer` is in `test/all.js`.

---

## What is next, in order

### 0. FIXLIST-M14.md — twenty-one player-reported items, and they come FIRST

**Read `FIXLIST-M14.md` before anything below.** The user played the game and reported twenty-one
faults and requests, all of which were checked against the code and locked into that document with
acceptance criteria. Three of them are not what they look like: creep tumours come from the Overlord
rather than the Queen, the Hellion's line attack already works and is merely drawn as Lurker spines,
and the defeat screen exists but has no Restart. One is already correct and needs only a hand check.

They are ordered A (data) -> B (interface) -> C (simulation) -> D (AI), which is strictly increasing
risk and strictly decreasing independence. **D1 -- the AI raiding expansions and never committing to a
main -- sits immediately before step 1 below on purpose:** both are AI, both need the same
measure-first discipline, and `test/ledger.js` serves both.

**All four open questions have been answered and are folded in** — see "Decisions already taken" at the
top of that file. One of the answers changed the plan: the AI *does* read the Sensor Tower's contacts,
which makes them simulation state, so that item moved out of the interface group into Group C and the
build stamp moves with it.

Nineteen entries cover the twenty-one items — 1, 3 and 14 are one feature. There is a traceability
table so none can be lost.

### 1. The composition ratchet — the one thing M13 left standing

Everything the budget could fix, it fixed. What is left is `AI_COMP`, and the single number that says
so:

> **Zergling and Roach carry the same weight (4) in `AI_COMP.Z`.** Weights are documented and intended
> as a share of army supply, so at equilibrium they should hold equal supply. A solo twenty-minute
> Zerg game ends with **113 zerglings and 3 roaches.**

`production()` walks the composition in score order and buys the first thing it can afford, so a
25-mineral zergling wins every think in which a 75-mineral roach is a few minerals short. The
top-pick claim exists to stop exactly this, and `test/ledger.js` says it is funded on **3% of thinks**,
because it is last of seven and the bank runs out above it.

This is the direct cause of all three remaining coverage gaps — every one is a morph wanting more of
its source unit than the composition delivers:

| morph | wants | gets |
|---|---|---|
| Swarm Host | 5 Roaches | 3 |
| Viper | 5 Mutalisks | 2 |
| Mothership | 3 Arbiters | 1–2 |

**Build the probe first, again.** `test/ledger.js` already reports "top pick" and "built" per unit;
what it does not yet report is **intended supply share against actual supply share**, which is the
number that turns this from an anecdote into a measurement. Add that before changing a weight.

There is a measured lever sitting right there and it is **not free**: moving the top pick above
research in `budget()` (swap claims 6 and 7) takes Zerg from 215 to 265 supply, roaches 3 → 7,
mutalisks 2 → 7 — which is exactly what the morph gates want — and costs Zerg every upgrade but one,
Protoss 20 of 25, Terran 16 of 28. Upgrades multiply a whole army; supply is linear. **That trade is
the balance run's to price, not a guess's.**

### 2. Re-tune `AI_COMP` weights against the fixed economy

Carried over from M13's plan and still true: every heavy unit was set to a pick-order score of ≤1.25
(55 bumps) **while the economy was starved**. Those numbers are now calibrated against conditions that
no longer exist. Do this after step 1, because step 1 may show the weights were never the problem.

### 3. The first attack wave is later than it was

Not caught by the gate, because `test/aistyles.js` runs one seed. On **seeds 1 and 11** no style
attacks at all inside its 12,000-frame window; on the default seed 5 they all still do, and at 30,000
frames every wave assertion passes on every seed. So the AI still attacks — it teches first.

Whether that is a fair price is a balance question. What is *not* in doubt: an earlier version of the
budget (head build step above the expansion) made this far worse and was dropped for it. If you touch
the claim order, **run `test/aistyles.js --seed=1` as well as the default.**

### 4. Make `test/soak.js` fully green

Only after step 1. The tier-1/2 assertion is red on Swarm Host alone, and Swarm Host has the same
cause as the two named tier-3 gaps.

### 5. The balance run — LAST, and gated

**Do not start `test/balance.js` or `test/proxy.js` without an explicit instruction, and double-check
when one is given.** Every balance number in `HANDOFF.md` is stale and M13 moved balance further than
M12 did: tech pacing, spending priority, upgrade share, expansion timing and attack timing all
changed. A real run is ~40 minutes and its output is a confidence interval, not a pass/fail.

Three specific things for it to price, all measured and all deliberately left undecided:

- the top pick above research (step 1)
- the two rejected `test/eightplayer.js` fixes, written up in `js/ai.js`
- the later first attack wave (step 3)

---

## Traps — the M13 ones, on top of everything in `HANDOFF-M13.md`

The eight traps in `HANDOFF-M13.md` are all still true. CRLF, backticks inside `vm` template literals,
the codemods that are not tests, dead players looking like broken AIs, stale constants, and
regex probes that go stale — all of those bit again this session. These are the new ones.

1. **A claim you cannot spend is a tax, not savings.** Every claim in `budget()` must be armed only
   when *money* is the only thing missing. Twice this session a claim was held for something
   unbuildable for another reason — no free base, requirements unmet — and it was never spent, so it
   was never released, so `commitMin` climbed to equal the entire bank and hundreds of minerals floated
   for the whole game.
2. **Clearing a claim before attempting the purchase deadlocks it.** `macro()` reset `expandDef` at the
   top, so during that same think `claimed()` could not recognise the very claim `budget()` was
   holding — the expansion was refused by its own reserved money, which re-armed the claim, which
   refused it again. The symptom is `commitMin` tracking the bank exactly.
3. **`git show <rev>:file` and `sed -i` both give you LF.** Two commits this session needed a CRLF
   repair pass afterwards. Convert explicitly whenever either has touched a file.
4. **`/tmp` is not the same path to Bash and to Python here.** Bash maps it into `%TEMP%`; Python gets
   a literal `C:\tmp` that does not exist. Put scratch files in the repo and delete them.
5. **Python patch scripts fed through a bash heredoc get their backslash escapes mangled** — this is
   trap 6 from last time, arriving in a new costume. `\n` inside a triple-quoted needle becomes a real
   newline and the match silently fails. Write the script to a file with the Write tool, or use Edit.
6. **`test/aistyles.js` and `test/eightplayer.js` each run one seed.** Both hid a real behaviour change
   this session. If you touch the AI's spending, run them on more than the default.

---

## Diagnostics available

```
node test/all.js                                  50 suites, ~2.5 min, the pre-commit gate
node test/ledger.js [min] [seed] [solo|vs] [race] NEW: per-think spend, claim funding, refusals by gate
node test/techtime.js [min] [seeds] [solo|vs]     when the AI reaches each tier
node test/soak.js [--frames=] [--seeds=]          every matchup, coverage report, ~3 min
node test/longgame.js                             60-minute game and its replay, ~8 min
node test/eightplayer.js                          eight players on a 192x192 custom map
node test/aiadapt.js                              intel is vision-gated; massing vs teching
node tools/bake.js                                re-bake sprites after art changes
```

**`test/ledger.js` is the new instrument and it is the one to reach for.** Its first output line runs
the same seed twice — instrumented and clean — and compares a state hash. **If that ever says DIVERGED,
stop: the probe is changing the thing it measures and every number under it is describing a different
game.** It has said IDENTICAL on every run so far.

---

## Conventions that are not negotiable

Unchanged from `HANDOFF-M13.md`, and all of them earned their place again this session:

- **Determinism.** Never `Math.random()` in sim code — use `G.rand()`.
- **`node test/all.js` is the gate.** Green means green. One change this session fixed a real fault in
  `test/eightplayer.js` and was reverted anyway, because it turned the gate red on one marginal
  assertion.
- **Measure before fixing.** Four of this session's changes were regressions found by measurement
  within minutes of being written. Not one of them would have been found by reasoning.
- **Every new behaviour gets a negative control.** The new binding assertion in `test/soak.js` was run
  against the pre-M13 tree to confirm it fails there, and it names the seven defs that regress.
- **Build stamp scope.** `js/build.js` hashes simulation files only. `js/ui.js` changed this session
  and must not move the stamp; `js/ai.js` changed and must.
- **The balance run is gated.**
