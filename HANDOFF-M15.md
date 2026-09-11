# HANDOFF — M15

Written at the end of the session that did `FIXLIST-M14.md`. Branch `m10-overnight`. (HEAD moves as
this file is committed — trust `git log -1`, not a hash written here.)

**Read `FIXLIST-M14.md` first.** Every one of its nineteen entries is closed and each carries what was
measured, what was decided, and why. `PLAYTEST-M14.md` is how to see each one by hand. `HANDOFF-M14.md`
is the state M13 left behind and is still true except where this file says otherwise.

---

## State

- **63 test suites green.** `node test/all.js`, ~2.7 minutes. That is the gate before any commit.
- **FIXLIST-M14 is complete.** All twenty-one reported items, nineteen entries.
- **Thirteen new suites** were added to the gate this session (50 -> 63): `describe`, `gated`, `clicking`, `defeat`,
  `addons`, `fogbuild`, `sensor`, `tumour`, `onmove`, `line`, `clearance`, `curve`, `wavetarget`.

### The three known reds, updated

1. **`test/soak.js`** still fails `every tier-1/2 M12 def is fielded` — 15/16, **Swarm Host** missing.
   Unchanged and deliberately not weakened. Its coverage numbers moved slightly better this session
   (units 69→70/85, abilities 34→35/80, techs 67→68/72).
2. **`test/eightplayer.js` is now ONE red, not two.** `every one of the eight players built an economy
   at some point` **now passes**. Something earlier in this session fixed it — it was already passing
   at the pre-C6 HEAD, so it was not the clearance change. Worth five minutes to find out which item
   did it, because it is a real improvement nobody aimed at.
   The money-hoarding red (`no AI is left sitting on money it cannot spend`) is unchanged and
   untouched. **The two rejected fixes for it are still written into `js/ai.js` at the line in
   question. Read that comment before touching it.**
3. **`test/aistyles.js` on seeds 1 and 11** fails four assertions — no style attacks inside its
   12,000-frame window. Pre-existing, documented in HANDOFF-M14 step 3, and **identical before and
   after every change this session**. Seed 5, the default and the one in the gate, is 131/0.

---

## What M14 changed, and the four things worth knowing

### Three reported items were not what they looked like

Every one was found by building a probe before editing, which is the rule that keeps earning its place.

- **The Hellion's line attack was already correct.** One Hellion into a row of five hits five. The
  player was seeing correct damage and the *Lurker's* effect, because both weapons pushed
  `{ kind: 'spines' }`. Three real defects sat around it and are fixed.
- **The Thor never walked onto buildings.** No ground unit, of all 41, ever ends inside a footprint.
  What it did was fail to *fit* through a one-tile gap and never arrive, which reads as stuck.
- **The defeat screen worked.** It only ever appeared when one team was left, so in any free-for-all
  with three or more teams the human could be wiped out and the game carried on around them for ever.

- **"The AI never commits to a base" was not the fault either** (D1). Eighty-two per cent of waves
  never re-target at all, and the ones that do are the ones that are winning. Target SELECTION was
  the whole of it, and the old score could not have picked a main at any distance.

### D1 is a partial fix, and the numbers say so in both directions

Waves reaching within eight tiles of the enemy main went **5% -> 20%**. But the FIRST target a wave
picks is still **never** the main (0% before, 0% after), the median wave still turns around 31 tiles
out, and razed-three-or-more slipped from 18% to 15%. The AI raids less and commits more; **it does
not march on your main.** Making it do that needs the wave sized against what it is walking into,
which is a separate change and is listed under "what is next" below.

### Two bugs were one bug

"The more 1/2 button does nothing" and "the Starport shows Apollo Reactor" are the same fault:
add-on tech was copied onto the parent card, which pushed the Starport past twelve slots, and
`UI.paginate` then drew the page button **on top of** the twelfth real button. Pressing "More 1/2"
pressed Apollo Reactor.

### An audit found a class of bug nobody reported

A4 asked for an audit and it turned up three holes, of which only the first was the reported one:
five add-ons with no `req` at all; four refusal states in `G.queueAddon` that said **nothing**; and
**every command trusting the command card** — a Barracks would accept a Physics Lab, Siege Tech and
Vehicle Weapons, and a Factory would accept being turned into an Orbital Command, all silently and all
paid for. A command log is not the UI.

### Two stale constants from the 3×3 command card

`UI.buildCard` capped a unit at four abilities (`i > 8`) and `UI.paginate` gave the page turn no slot
of its own. Both date from before the card grew to 4×3 in M11. Slots 9, 10 and 11 had been empty on
every unit card in the game since.

---

## Traps — the M14 ones, on top of everything in HANDOFF-M13 and HANDOFF-M14

All eight in `HANDOFF-M13.md` and all six in `HANDOFF-M14.md` are still true. CRLF, backticks inside
`vm` template literals and the codemods-that-are-not-tests all bit again. These are the new ones, and
the first three each cost a wasted measurement.

1. **`test/soak.js` SPAWNS CHILD PROCESSES that re-read `js/`.** Editing the tree while it runs
   silently contaminates the result — the early games use the old code and the later ones the new.
   The first C1 A/B was thrown away for this.
2. **`test/techtime.js` re-reads `js/` for EVERY seed and race** (`mk()` is called per combination),
   so the same applies and is worse. Both C1 techtime runs were wasted before this was understood.
   **Run any long measurement in a `git worktree`**, which is what finally worked and lets before and
   after run in parallel.
3. **A probe that wraps a method can change the game.** The first D1 probe replaced
   `AI.prototype.pickTarget` with a logging wrapper and the divergence check caught it: instrumented
   and clean hashed differently. Rewritten to *observe* `ai.target` once a frame instead.
   **`test/ledger.js`'s IDENTICAL/DIVERGED line is not ceremony. Put it in every probe.**
4. **`G.tick()` is a no-op while `G.paused`.** A driving loop that forgets to unpause measures a game
   frozen at its starting frame and reads as "the feature does nothing". The frame counter is the tell.
5. **`G.near` reads the spatial hash, which `G.tick` rebuilds.** A test that spawns units and fires
   without ticking finds nobody at all — the first C5 probe reported ZERO damage for every line
   weapon *including the Lurker*, which is how you know the fault is in the probe.
6. **`u.setOrder` is wrapped by CMD and packs `c.p = G.human`.** In an AI-vs-AI harness `G.human` is
   −1, so the command is dropped and the unit never receives the order. Use `applyOrder`.
7. **`facing` is not decoration.** `moveTo` turns it toward the next waypoint at a limited rate and
   then MOVES ALONG IT, so pointing it at a target each frame steers the unit at the target. The C4
   Cyclone crept *backwards* down a lane because of this.
8. **A negative control that throws tells you nothing.** Three checks this session crashed the whole
   file when the feature was removed, hiding every other result. Guard the lookups a control will
   break.

---

## What is next, in order

### 1. The composition ratchet -- THE PROBE IS BUILT AND THE MEASUREMENT IS IN

HANDOFF-M14 said to build the probe first. `test/ledger.js` **section 6** now reports intended supply
share against actual, which is the number that was missing. Run it with:

```
node test/ledger.js 20 1 solo Z
```

**The anecdote is now a measurement, and it is worse and broader than the anecdote said.** Solo, hard,
20 minutes, seeds 1/5/11, all three races:

| race | worst unit | weight wants | actually holds | total misallocation (3 seeds) |
|---|---|---|---|---|
| Zerg | zergling | 14.3% | 61-91% | 138 / 94 / 153 |
| Terran | marine | 11.1% | 32-43% | 103 / 63 / 65 |
| Protoss | zealot | 7.5% | 43-48% | 78 / 81 / 74 |

Every other unlocked unit in all three races sits at a third of its intended share or less.

**This changes what step 2 should be.** The same fault, the same shape, in all three races means
`AI_COMP` is not being disobeyed by a bad number in one table. It is being disobeyed structurally, so
**re-tuning the weights would edit a table nothing is reading.** Fix the reading first.

#### Why -- measured, not reasoned

The ratchet mechanism **already exists and already scores correctly**. `production()` ranks candidates
by `(currentSupply + sup) / weight`, which is exactly a supply-share ratchet, and it gets the answer
right: over a 20-minute Zerg game **hydralisk was the top-ranked pick 564 times and was built 11**,
while **zergling was the top pick 50 times and was built 122**. The ranking was never the problem.

What fails is funding. The top pick is **claim seven of seven** in `budget()`. It armed 23,801 times
and was funded in full 860 -- **4%** -- holding a mean of 43 minerals. Six claims above it take the
bank first, and `production()`'s loop then falls through to the cheapest thing that fits in what is
left, which is always the tier-one unit.

#### One fix was tried, measured, and REVERTED -- do not re-discover it

There is a genuine accounting error next to this: `afford()` subtracts the whole of `commitMin`,
including the slice `budget()` just set aside for the very purchase being tested, and `claimed()` is
all-or-nothing, so a **partially** funded claim reserves money against itself. Instrumenting it found
618 decisions per game where crediting a claim's own money flips the mineral test from refuse to allow.

**It changes nothing.** Crediting the claim's own money moved 146 refusals from `reserveMin` to
`reserveGas` and left the rest of the report byte-identical, because **gas is the binding constraint,
not minerals**. Measured in four arms (baseline, fix, claim-reorder, reorder+fix) over seeds 1/5/11 and
all three races: with the fix and without it the games hash **bit-identically** -- Terran seed 1
`-1969821298`, Zerg seed 1 `714690699`, with and without, in both the plain and reordered arms.
The fix was reverted. The error is real, it is masked by gas, and it is worth re-examining only if
something later frees the gas.

#### The lever, now priced per race -- and it is the BALANCE RUN's to decide

Moving the top pick **above research** in `budget()` (swapping claims 6 and 7) is the lever
HANDOFF-M14 named. It works, and it costs what the handoff said it costs, in every race:

Seed 1, solo, hard, 20 minutes. "Total supply" is supply USED, army plus workers:

| | misallocation | army supply | total supply | upgrades bought |
|---|---|---|---|---|
| Terran before | 103 | 237 | 311 | **28** |
| Terran reordered | **47** | **286** | **374** | **12** |
| Zerg before | 138 | 143 | 217 | **12** |
| Zerg reordered | **117** | **186** | **266** | **1** |
| Protoss before | 78 | 143 | 227 | **35** |
| Protoss reordered | 74 | **360** | **444** | **10** |

**The headline is not the composition, it is the SIZE.** Protoss goes from a 143-supply army to a
360-supply one on the same economy, and its total supply from 227 to 444. The claim order is not
merely mis-shaping the army, it is throttling it to a fraction of what the economy already pays for.
Composition adherence improves too, but much less dramatically (Protoss misallocation only 78 -> 74).

The price is upgrades, in every race, and Protoss pays most: **Terran 28 -> 12, Zerg 12 -> 1,
Protoss 35 -> 10.**

Seed 5 Terran agrees on both directions (misallocation 63 -> 49, army 199 -> 249, upgrades down to 6),
so this is not a seed artefact. Seeds 5 and 11 for the remaining races were still running when this
was written; re-run `test/ledger.js 20 <seed> solo <race>` in a worktree if you want them.

**A much bigger army that looks more like the composition table, bought with most of the upgrades.**
That is a balance question, not a correctness question, and it is explicitly gated. Do not take it on
a view of which number looks nicer -- an army twice the size with no upgrades may well lose to a
smaller upgraded one, which is precisely what `test/balance.js` exists to answer. It is listed in
section 4 below for that reason.

**If you want a correctness-only improvement instead**, the thing to attack is that the fall-through
in `production()` buys the cheapest unit whenever the top pick is unaffordable. Bounding that -- and
NOT by reordering claims -- is the one avenue here that does not obviously trade army for tech. It has
not been tried. Measure it with section 6 before and after, in a worktree.

### 2. Re-tune `AI_COMP` weights against the fixed economy

**Do not start here.** Step 1 measured that the weights are not being obeyed in any race, so tuning
them is tuning a table nothing reads. This becomes worth doing once section 6's misallocation number
is small enough that a weight change would show up in it.

### 3. Find out what fixed the eightplayer economy assertion

See the reds above. A real improvement landed by accident and nobody knows which item did it.

### 4. The balance run — LAST, and gated

**Do not start `test/balance.js` or `test/proxy.js` without an explicit instruction, and double-check
when one is given.** Every number in `HANDOFF.md` was already stale and M14 moved several more things.
What it has to price, all deliberately left undecided:

- **the Reactor now requires an Academy** (A4). This is the most likely of the lot to matter: before,
  a 50/50 add-on doubled the cheapest production line in the game the moment the first Barracks
  finished.
- **Drilling Claws** (A3), a new research the AI now buys, appended last to `AI_RESEARCH.T`
- the Widow Mine's arming delay
- the Cyclone firing on the move (numbers deliberately unchanged)
- the Sensor Tower being early warning rather than sixteen tiles of vision
- clearance pathing for the four widest bodies
- the three carried-over items from HANDOFF-M14: the top pick above research, the two rejected
  eightplayer money fixes, and the later first attack wave
- **how the AI picks what to attack** (D1). Four new weights, none of them priced.
- **whatever step 1 below decides about the claim order.** That is the big one, and section 6 of
  `test/ledger.js` now measures the army side of it directly.

---

## Diagnostics available

```
node test/all.js                                  62 suites, ~2.5 min, the pre-commit gate
node test/ledger.js [min] [seed] [solo|vs] [race] per-think spend, claim funding, refusals by gate
node test/techtime.js [min] [seeds] [solo|vs]     when the AI reaches each tier  -- USE A WORKTREE
node test/soak.js [--frames=] [--seeds=]          every matchup, coverage report -- USE A WORKTREE
node test/longgame.js                             60-minute game and its replay, ~8 min
node test/eightplayer.js                          eight players on a 192x192 custom map
node test/aistyles.js --seed=N                    ONE seed by default; run 1, 5 and 11
node tools/bake.js                                re-bake sprites after art changes
```

---

## Conventions that are not negotiable

Unchanged, and every one of them earned its place again:

- **Determinism.** Never `Math.random()` in sim code — use `G.rand()`.
- **`node test/all.js` is the gate.** Green means green.
- **Measure before fixing.** Three of M14's items were not what the report said, and all three were
  caught by a probe rather than by reading.
- **Every new behaviour gets a negative control**, and it must produce a clean red rather than a crash.
- **Read the constant, never the literal.**
- **Build stamp scope.** `js/build.js` hashes simulation files only. Group B moved nothing —
  `8eb298001f359f60` before and after, checked by stashing.
- **The balance run is gated.**
