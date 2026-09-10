# DESIGN — M13: the AI's money

What M13 changed, why, and what each wrong turn cost. `HANDOFF-M14.md` is the state transition;
`PLAYTEST-M13.md` is how to see all of it by hand. `DESIGN-M12.md` has the ten AI faults this
milestone follows on from.

---

## The problem M13 was given

M12 finished the rosters — 37 new units and buildings across three races — and the session after it
fixed ten faults in the AI's economy. What was left was a single sentence in `HANDOFF-M13.md`:

> There is currently **one shared brake with four overrides bolted on**. Each was added to fix one
> symptom and they now fight each other.

The brake was `reserveMin` / `reserveGas` — "money we are saving for" — and `afford()`, which refused
any purchase that would eat into it. The four overrides, each added in a different milestone:

1. a **40% floor** inside `afford()` that switched the reserve off while the bank was below 40% of
   the target;
2. **`techStarved()` hard mode**, which switched it back on once the head of the build order had been
   stuck for 45 seconds;
3. a **`force` flag** that let expansions, production buildings and gas walk straight past it;
4. a **research rule** that read the bank directly and ignored the reserve entirely, plus a Zerg
   exemption *to that rule*, because Zerg was tech-starved so often that any reserve-based brake
   silenced its upgrades completely.

The visible damage was downstream of all four at once, so no single one could be blamed: Siege Tanks,
Colossi and Void Rays reported "buildable, never chosen"; the Oracle was missing from the soak;
tier-3 coverage sat at 4/13; and the Zerg roach ratchet had the Roach top-ranked in 114 of 186
production thinks and trained in none of them.

---

## Step one: build the probe

`CLAUDE.md` says it plainly — *in this codebase, every fix that started from a measurement was right
the first time and every fix that started from a hypothesis had to be reverted.* So nothing was
touched until there was a ledger.

**`AI.note()` in `js/ai.js`** is a hook at every gate the AI has. `this.ledger` is undefined in a real
game, so each call is one property read; `test/ledger.js` sets it to an array and every guard records
what it refused, what that cost, and what was committed at the time. The hooks sit **at** each guard
rather than re-deriving it in a probe, which is the only version that does not go stale the moment the
guard is edited — trap 7 in the last handoff, and it had already produced two nonsense reports.

**`test/ledger.js`** aggregates it and answers three questions:

1. **Where does the money go?** It hooks the Player's own `minerals`/`gas` properties with a
   getter/setter, so it counts the deduction the simulation actually makes rather than a model of it,
   and attributes each one to the phase of the think that made it.
2. **What does each gate refuse?** Count, cost held, and the ids most often turned down.
3. **Which units are never chosen, and by which gate?** Including a separate count of "top-ranked and
   refused", which is the ratchet: the composition asks for the expensive unit, something says no, and
   the fall-through buys the cheap one.

It runs each seed **twice — instrumented and clean — and compares a state hash**, so a perturbed
measurement announces itself instead of quietly lying. That line has read IDENTICAL on every run.

### What it said

Solo, 20 minutes, seed 1, all three races:

| | Terran | Zerg | Protoss |
|---|---|---|---|
| reserve engaged | 96% of thinks | 95% | 97% |
| reserve **binding** | 75% | 69% | **84%** |
| head step held longest | reactor 5:32 | **spire 10:42** | **stargate 10:01** |
| research share of gas | 29.8% | **54.8%** | 39.6% |

Two things fall out immediately.

**The reserve is not an occasional brake — it is the permanent condition.** Every comment in
`afford()` reasoning about "the normal case, where a step is briefly unaffordable" was describing a
state that does not exist.

**And it still saved nothing.** The Stargate held the head of the Protoss build order for 10:01 of a
20-minute game and was never built, while `production()` spent 42% of every mineral mined. Colossus
was the top-ranked pick **452 times** and built **0**. Queen 288 and 0. Science Vessel 202 and 0.

### The mechanism, stated exactly

`afford()` was a per-purchase **headroom** test, not a budget, and it failed in two structural ways:

- **`reserve()` took the MAX of the claims, not the sum.** A worker walking to a 150-mineral gateway
  and a 200-mineral Spire at the head of the order held 200 between them, not 350.
- **Nothing decremented as the money went.** A 400-mineral reserve against a 550-mineral bank permits
  a 150-mineral zealot — and permits another one next think, and another. It capped the size of a
  single buy and never held a total.

---

## Step two: two budgets

The replacement is one mechanism — a priority queue over the bank, recomputed once per think — and no
overrides at all. All four are deleted, not re-tuned.

```
COMMITTED   money already spoken for, claimed in this order and clipped at the bank as it goes,
            so priority is real rather than decorative:
              1. buildings a worker is already walking to
              2. supply, when it is about to block
              3. one worker, while economy() still wants one
              4. an expansion, while a base is free to take
              5. the head of the build order
              6. the next upgrade
              7. the composition's top pick

FREE        the bank minus committed. Everything else spends from it, and because afford() reads
            p.minerals live, free shrinks as the think spends it.
```

That last clause is the whole difference. It is a budget rather than a headroom test, so a think
cannot hand out the same money twice.

### The three rules that took four measured iterations to find

Each of these was found by measuring a regression, not by design, and each is load-bearing.

**A claim is armed only when money is the only thing missing.** A claim held for something that cannot
be bought for another reason — no free base left, requirements not met, no production slot — is never
spent and therefore never released, so it becomes a permanent tax on free. Measured with that guard
missing on two of the five claims at the time: `commitMin` sat within 3% of the entire bank for the
whole game and 500–900 minerals floated unspent while the AI stopped at 49 workers.

**A claimant may spend exactly what its claim was FUNDED, not merely because it is the claimant.**
`claimed()` first tested identity, which let the top pick spend from the bank on thinks where the
running total had already been clipped and its claim came to zero. That took 88% of all gas and held
the Templar Archives at the head of the order for 6:08.

**A claim is released when the thing it was held for is bought.** `free` is `p.minerals` minus
committed, so a think that buys a worker out of its own claim was charged for it twice — once when
`p.minerals` fell, and again because committed did not. Over a think where several claimants spent,
free went deeply negative and every claim after them was refused: the head of the build order was
funded on 22% of thinks and claims 6 and 7 were never funded at all, so a Zerg finished a 20-minute
game with no upgrades whatsoever. **Buildings deliberately do not release** — a building is paid for
when its worker reaches the site, so the money is still in the bank and still spoken for, and next
think `budget()` re-derives it as claim 1.

### Four wrong turns, and what each one cost

Recorded because each is a live trap for whoever edits this next.

1. **Workers made to spend from free like any other unit.** The economy collapsed: 17 workers against
   62, 13.8k minerals mined against 33.6k. A worker is income and income is what pays for the build
   order — a player saving for a Stargate stops making zealots, not probes. It is claim 3 now, above
   the build order, and still bounded by the worker target and the army-ratio gate.
2. **The expansion's `force` flag removed with nothing in its place.** Correct to remove — force
   bypassing the reserve is what starved Zerg's Spire for 842 seconds in M12 — but a Nexus was then
   refused for money 1313 times and the AI never took a third base. `economy()` sizes its worker
   target from the mineral fields it **owns**, so the worker cap fell with the base count and the
   whole economy went down with it. Committed rather than forced is the difference.
3. **`macro()` clearing `expandDef` before attempting the build.** The claim vanished from
   `this.claims` in the same think that needed it, so the expansion was refused by its own reserved
   money, which re-armed the claim, which refused it again. A self-sustaining deadlock, and the
   symptom was `commitMin` equalling the bank exactly.
4. **`research()` stopping at the first item it could not pay for.** That reads as a priority order
   and behaves as a blockage: one expensive upgrade at the head of the list silences everything behind
   it. `test/zerg12.js` went red immediately — a Zerg reached exactly one tech in ten minutes and none
   of the five M12 ones. The fix is the one `script()` already uses: **a research list is not a queue
   either.** The head becomes the claim and the scan continues.

### One more thing the ledger found

`canTrainSoon()` asked Zerg a harder question than every other race. For Terran and Protoss it wants a
production building with a free queue slot; for Zerg it wanted a **larva in hand**, which flickers,
because larvae are consumed the moment they appear. Once `budget()` started using it to decide whether
to hold money for the top pick, claim 7 was simply never armed for Zerg. A hatchery that spawns larva
is the Zerg equivalent of a gateway with a free slot, and it is what the function's own comment has
always described.

---

## What it bought

Everything below is measured against the commit immediately before the change, same seeds, same
machine, with the ledger's self-check reporting instrumented and clean runs as bit-identical.

### Coverage — `node test/soak.js`, 18 games

| | before | after |
|---|---|---|
| units fielded | 55/85 | **70/85** |
| **tier-3 M12 defs** | **4/13** | **11/13** |
| abilities invoked | 28/80 | **38/80** |
| techs researched | 38/71 | **68/71** |
| upgrades finished | 7/16 | **10/16** |
| games still live at the frame budget | 6/18 | 7/18 |

Every one of Thor, Liberator, Banshee, Colossus, Void Ray, Tempest and Disruptor went from never
fielded to fielded. The tier-1/2 miss moved from Oracle to Swarm Host.

### Tech timings — `node test/techtime.js 20 1,5,11 vs`, medians

| | before | after |
|---|---|---|
| Zerg Spire | 18:14 | **7:47** |
| Zerg Hive | 11:45 | **8:46** |
| Zerg Defiler Mound | 13:53 | **9:27** |
| Terran Machine Shop | 10:07 | **4:06** |
| Terran Science Facility | 13:02 | **9:10** |
| Protoss Fleet Beacon | **never built** | **11:31** |

### What it cost

**Protoss tier 3 is later than it was** — Stargate 5:15 → 7:24, Templar Archives 6:04 → 8:19. That is
a real cost and not a rounding error. What it buys is reliability: the old numbers came from one or
two surviving seeds out of three, and the baseline's contested Terran finished a 20-minute game **on
two workers**, because it had been destroyed. Every race now finishes alive on every seed — 71, 69 and
70 workers — and every tier-3 building completes on every seed, which none of them did before.

Trap 1 from the last handoff, arriving from the other side: a dead player does not only look like a
broken AI, it can also flatter one.

---

## Two orderings tried and not kept

Both were measured properly and both are real trades this branch cannot price without the balance run.
They are recorded so the next session does not have to rediscover them.

**Head build step above the expansion (swap claims 4 and 5).** Improves twelve of seventeen tier-3
medians — Zerg's Hive 11:35 → 8:25, Defiler Mound 12:17 → 9:10, Protoss Stargate 7:49 → 6:40 — and
**stops the AI attacking at all inside the first eight minutes**. `test/aistyles.js` goes red on four
wave assertions with "over no races where both attacked". An opponent that never pressures you is a
worse opponent than a slow one, so it was dropped.

**Top pick above research (swap claims 6 and 7).** Grows every army — Zerg 215 → 265 supply, Roaches
3 → 7, Mutalisks 2 → 7, which is exactly what the Swarm Host and Viper morph gates are waiting for —
and costs Zerg every upgrade but one, Protoss 20 of 25, Terran 16 of 28. Upgrades are a multiplier on
an entire army; supply is linear. Pricing that against each other is what the balance run is for.

---

## What is left, and why it is not an economy fault

Three defs are still never fielded, and all three fail the same way. Each is a morph whose gate in
`AI.production` wants more of the source unit than the composition ever builds:

| morph | wants | the composition delivers |
|---|---|---|
| Swarm Host | 5 Roaches | 3 |
| Viper | 5 Mutalisks | 2 |
| Mothership | 3 Arbiters | 1–2 |

The buildings, the tech and the money are all there by then — this is the composition ratchet, and it
is `AI_COMP`'s problem rather than the budget's. The clearest single number: **Zergling and Roach carry
the same weight (4) in `AI_COMP.Z`, so at equilibrium they should hold equal army supply. Measured:
113 zerglings against 3 roaches.** `production()` walks the composition in score order and buys the
first thing it can afford, so a 25-mineral zergling wins every think in which a 75-mineral roach is a
few minerals short. The top-pick claim exists to stop exactly this and is funded on only 3% of thinks,
because it is last of seven and the bank runs out above it.

That is the next milestone's first item, and `test/ledger.js` is the instrument for it.

---

## Test changes

- **`test/ledger.js`** is new. A measurement, not a check — it prints and never fails, like
  `test/techtime.js` and `test/aiaudit.js`, and it is deliberately **not** registered in `test/all.js`.
- **`test/soak.js`** now asserts tier-3 coverage at ordinary game length instead of reporting it. It
  stayed a report for as long as the answer was 4/13, because a test nobody can pass tells you
  nothing. The two remaining gaps are **named individually rather than allowed for as a slack
  threshold**, so fixing either one tightens the test by itself instead of leaving a gap a third def
  could slip into.
  *Negative control, run rather than asserted:* with `js/ai.js` restored to the commit before the
  budget split, the new check fails and names exactly the seven defs that regressed.
- **`test/aiaudit.js`**'s "composition hold" reason now reads `a.topDef`; the `holdFor`/`holdT` pair it
  used to read no longer exists.
