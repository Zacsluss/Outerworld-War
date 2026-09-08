# HANDOFF — Brood War Remake

Read this first in a fresh chat. It says where the build is, how it is wired, what must never break, and
exactly what is left to do.

## Kickoff for the next chat

Open a chat in `Default Project/broodwar/` and paste:

> Read HANDOFF.md and README.md, run the tests, then work through the "M9 — what to do next" section
> in order, starting with task 0. Keep the determinism tests green after every change, commit at each
> item, and update HANDOFF.md at the end.
>
> Task 0 is finishing a measurement, not starting one: M8 found a bug that voided every balance number
> in the repo, and the re-measurement was launched but may not have finished. Check it before trusting
> any win rate you read anywhere in that file.

## Status (2026-09-07, M8 complete)

**M8 built a cheap way to ask balance questions, used it to find that the previous milestone's stated
cause was wrong, and then a player found a bug that voids every balance number in this file.**

Read these three things before touching anything:

> **1. Hold Position never checked the weapon cooldown.** `case 'hold'` called `fireAt` directly while
> every other path goes through `engage()`, which is where `if (this.cooldown <= 0)` lives. A unit
> holding with a target in range fired *once per tick* -- 24 shots a second where a siege tank is
> allowed one per 75 frames, at 70 damage with splash. Measured: mean gap between shots 1 frame
> before, 74.7 after. It presents as a siege bug because siege mode is the only thing that puts a unit
> on hold and leaves it there, but every race's units did it on `H`. Fixed in `fcf08be`.
>
> **2. Therefore every balance figure measured before `fcf08be` was void**, including M7's "TvZ 77%".
> Siege tanks are 4 of 24 in `AI_COMP.T` and the AI sieges them. TvZ has been re-measured on 66 seeds,
> three layouts, both sides, and the result is **not** what "siege tanks are overpowered" predicts:
>
> | code | TvZ | paired against the row above | verdict |
> |---|---|---|---|
> | M7 as shipped, `2802b31` (with the bug) | 77% [73-81] | -- | void, kept for the pairing |
> | + the Hold Position fix, `fcf08be` | **87% [83-90]** | 39 to T, 9 away of 364 | **p = 0.000, MOVED** |
> | + the drone-gate fix, `197eb40` (**as shipped**) | **79% [75-83]** | 37 to T, 67 away of 364 | **p = 0.004, MOVED** |
>
> **Fixing the tank made the matchup worse by nine points.** The bug was net-helping *Zerg*: a Zerg AI
> spends most of a game defending, defending units sit on Hold, and Hold was where the illegal rate of
> fire lived. That is the opposite of what the symptom suggested, and it is the whole argument for
> re-measuring rather than reasoning. Task 1's fix then took eight of those points back.
>
> **After M9's Zerg build-order fix, no matchup is formally OUTSIDE 60/40 for the first time since M4**
> -- but none is confirmed inside either. All three are "undecided": the interval still crosses the
> line, and the harness's own rule is that undecided means undecided.
>
> | matchup | M8 as shipped | M9 as shipped | paired | verdict |
> |---|---|---|---|---|
> | TvZ | 79% [75-83] T | **64% [59-69] T** | 36 to T, 90 away of 360 | **-15 pts, p = 0.000** |
> | PvZ | 63% [58-67] P | **36% [31-41] P** | 32 to P, 136 away of 380 | **-27 pts, p = 0.000** |
> | PvT | 62% [57-67] P | not re-measured | -- | the change is Zerg-only and cannot move it |
>
> **The fix is right and it overshot.** -15 on TvZ is the second largest balance move in the project's
> history after M5's 24, and it went the direction five milestones had been trying to go. The same
> change moved PvZ 27 points, which is roughly twice what centring it needed: Protoss went from
> favoured to unfavoured without stopping in the middle. Zerg was under-built against everyone, and
> correcting that helped it against everyone.
>
> **This is the open problem M10 inherits, and it is a better one than M9 was handed.** The question is
> no longer "why does Zerg lose" but "the Zerg correction is too strong by roughly half in PvZ" --
> which is a tuning question with a measured size, not a search. Note that a Zerg-only lever cannot fix
> it: the same reserve serves both matchups. Either PvZ needs a Protoss-side answer, or the reserve
> needs to be conditioned on something that differs between the two.
>
> **3. M7's stated cause for the TvZ move was wrong, and task 0 is what showed it.** The handoff said
> to check whether `91e4195` paid Terran in upgrades. It did not: Terran's finished upgrades at ten
> minutes went *down* (0.17 to 0.11) and Zerg's went *up* (0.00 to 0.36), a paired -0.46 at p = 0.000.
> What it paid Terran was economy -- 40 workers to 62, 110 supply to 137, +2,513 mined, army flat at
> 55.6. That reframing is what led to the task 1 fix.

| commit | what |
|---|---|
| `b116e7a` | task 0 -- a balance proxy that is right for a reason, and two candidates that are wrong |
| `9705072` | task 2 -- Desert and Space Platform, the two missing Brood War biomes |
| `f0aaaf9` | task 2 -- a shadow pass that is the unit's own shape, and a rim light that is not |
| `c389c5a` | task 2 -- the rim light, baked where it costs nothing |
| `509ad17` | task 2 -- muzzle flashes and shield hits, without a new effect kind |
| `e991333` | task 2 -- what the graphics work cost, in the units that decide the next one |
| `fcf08be` | **Hold Position never checked the weapon cooldown** (player-reported) |
| `e30e506` | a greyed command-card button says what is missing; `test/techtree.js` (player-reported) |
| `285f90e` | task 2 -- the console is made of the faction's own material now |
| `197eb40` | task 1 -- Terran and Protoss were never army-gated on workers, because of a constant |
| `071d24e` | task 2 -- the era pass: posterised art, mineral fields and geysers, HUD type, ambient life |
| `6c45be7` | task 2 -- units: silhouettes that differ, materials per race, and weight |

## The three bugs a player found in an afternoon, and what that says

All three came from someone playing the game rather than from a test, and two of them had been there
for milestones. They are worth listing together because the pattern is the point.

- **"my one tank is holding a position and has 81 kills in seemingly seconds"** -- and then, exactly
  right, *"it looks like the cooldown isnt applied ONLY in siege mode"*. The Hold Position bug above.
  Every automated check in this repo passed with it in place, because nothing measures rate of fire.
- **"the terran barracks cant get its side building to enable firebats, medics, ghosts"** -- not a
  broken requirement. The Academy is a standalone building and the Barracks has no add-on, in Brood
  War either. What was broken is that the game never said so: both dispatchers skipped a disabled
  button's handler, so pressing `F` with no Academy was indistinguishable from a dead key. The build
  menu *looked* like it handled this, with a `'Requires ' + p.missingReq(d)` branch inside its
  handler -- unreachable for the same reason. `Player.missingReq` already knew and nothing asked it.
- **"why cant i build a battlecruiser"** -- also reachable, just deep: a Control Tower on the Starport
  *and* a Physics Lab on a Science Facility. `test/techtree.js` is new and takes the closure of the
  whole tech tree; it reports 236 checks and everything reachable for all three races.

**The lesson for M9: this project has no test that plays like a person.** `test/playtest.js` drives
the UI, but it drives it correctly -- it never holds position and watches, never clicks a greyed
button and waits for an explanation, never asks why it cannot build the thing it wants. Two of these
three were invisible to every check here and visible in about a minute of play.

## Task 0's answer: the proxy works, and both of its favoured candidates lose

`test/proxy.js` runs the same seeds to ten minutes instead of playing them out, and compares a
measurement at a fixed frame rather than a win rate. A win rate is one coin flip per game and needs
hundreds; a paired measurement on identical seeds differs only by the change, so 132 games in four
minutes carries the same weight as a full run. **This is what made the rest of M8 possible: eleven
variants were tested in about an hour, which at full-run prices is most of a day.**

It was validated without spending a single new balance run. Every M7 variant's sim code was still on
disk under `bw-scratch`, and each is byte-identical to its commit (checked: `m6-head`==`0f87106`,
`m7-head`==`c494be6`, `m7-casters`==`a23d92b`, `m7-head2`==`07836c6`, `m7-mound`==`2802b31`), so the
proxy could run against exactly the code that produced each log. `test/proxy_validate.js` scores ten
indicators against five verdicts those runs already paid for, and runs no games:

| indicator | verdicts | notes |
|---|---|---|
| `sup@10`, `bld@10`, `score@cap` | **5/5** | no false alarm on the four changes that did nothing |
| `wk@10`, `mined@10`, `kills@cap` | 4/5 | |
| `army@10` | 3/5 | |
| **`army@contact`** | 2/5 | one of the two this handoff expected to win |
| **`upg@10`, `upgtech@10`** | **1/5** | the other one |

**The two candidates this handoff nominated are the two that lose**, and they do not merely fail --
they fire at p < 0.05 *in the wrong direction* on calls the full runs settled. They measure what a
change does, not what it wins. Zerg buying upgrades it does not live to use is M7's own finding, and
`upg@10` reports it as progress. Only the three validated indicators vote in `--ab`'s call.

**It then got a sixth call right, on a change it was not tuned against.** The task 1 drone-gate fix
was proxied at 3 of 3 toward Zerg (`score@cap` -31.3, p = 0.000) before any full run existed; the
full 396-game run came back -8 points to Zerg at p = 0.004. That is the workflow working end to end:
four minutes to decide the change was worth an hour, then the hour spent confirming rather than
searching.

**What the validation cannot do, which matters more than the score.** Four of the five calls are "no
move", so most of what is being tested is whether an indicator cries wolf. The single positive is a
13-point move. That is enough to say these three do not raise false alarms and do catch a large move;
it is not enough to say they would catch a small one, because the ground truth contains no confirmed
small move. **A quiet proxy is a reason not to spend a full run, not proof of neutrality.**

`test/duel.js` is the third candidate and the control, worth keeping for what it proves rather than
what it predicts. Its signature is byte-identical across all six M7 variants (`4142cbb4`): every one
of those changes is in `ai.js` and none can touch combat. That makes it useless as a predictor for AI
changes and exactly right as a scope check -- and `--upg` makes it the right first probe for the
`js/data.js` tunes that fill "what not to repeat". Its other finding is worth reading: **at equal
supply and equal upgrades Terran loses TvZ duels 6/36 at -10.3 supply**, and giving Terran alone one
upgrade level plus stim and u238 takes that to 9/18 at -0.7. The matchup is not decided by the fight.

## Task 1's answer: Terran and Protoss were never army-gated, because of a constant

`economy()` has read this since M2:

```js
const larvaN = this.race === 'Z' ? this.mine(u => u.def.larva).length : 9;
...
(p.race !== 'Z' ? (larvaN >= 2 || workers.length < 12 || armySup >= workers.length * 0.4)
                : (workers.length < 16 || armySup >= (workers.length - 16) * 1.5))
                                                      // drones only once the army keeps up
```

`larvaN` is only ever read on the branch where it is the literal `9`. So `larvaN >= 2` is a constant
`true` that short-circuits the army-supply test written beside it, under a comment describing that
test. **Only Zerg was ever gated.** Terran and Protoss built workers to the saturation cap
unconditionally, and always had.

It cost nothing while Terran could not reach the cap anyway -- and M7's build-order fix is precisely
what removed that limit. That is the missing half of M7's story and the reason the upgrade hypothesis
in this file was wrong.

Fixed in `197eb40`, minimally: the vestigial term is deleted, both races' real gates are untouched,
and the now-unused `larvaN` walk over `G.units` goes with it. The other reading of the same slip --
that `larvaN >= 2` was meant for the *Zerg* branch -- was tried and is much worse (3/3 indicators to
Terran); a larva-gated Zerg drones to 60 and fields no army.

Proxy on the fixed baseline, 132 games: **TvZ 3 of 3 toward Zerg** (`sup@10` -20.3, `bld@10` -5.1,
`score@cap` -31.3, all p = 0.000); PvT 2 of 3 mildly toward Protoss; PvZ 1 of 3. **Confirmed by the
full run: -8 points to Zerg over 364 paired seeds, 37 flips to Terran against 67 away, p = 0.004.**
TvZ is 79% [75-83] as shipped, still outside 60/40 but eight points better than the tank fix left it. Eleven other levers
were tried and are in "what not to repeat" below, including both that this handoff nominated (a Zerg
gas budget: nothing, 110 of 128 seeds bit-identical; reordering `AI_RESEARCH.Z`: nothing on outcome).

## Task 2's answer: the graphics, and the exchange rate that shaped them

Five tilesets instead of three (Desert, Space Platform), silhouette shadows, a baked rim light, muzzle
flashes and shield hits, a per-race console skin, posterised sprites and terrain, real mineral fields
and geysers, seven ground doodads instead of three, era typography, ambient drift, per-race material
response, differentiated infantry silhouettes, and three weight cues.

One number decided the shape of nearly all of it:

> **One extra full-sprite blit per unit costs about 2 ms a frame at 490 units.**

The draw pass had 3.7 ms of headroom against its 6 ms target, so it could afford one and not two. A
first version had both a shadow and a runtime rim light and measured 6.60 ms -- a fail. De-shearing
the shadow bought 0.10 ms, so the shear was never the cost; dropping the rim bought 1.80. The shadow
stayed in the draw loop and **the rim light moved into `tools/raster.js`, where it costs nothing.**
The same logic sent the mineral and geyser art into cached canvases and kept the muzzle flash's
gradient out of the per-frame path (0.8 ms built live, 0.3 ms baked).

Final cost: **4.40 ms at 490 units drawn**, from 2.30 at the start of M8 -- and the last two commits
made it *cheaper*, because caching the resource sprites more than paid for the ambient particles.

The period look is mostly one idea: **posterise and dither**. These sprites come out of a float-shaded
rasterizer and the terrain out of a smooth noise painter, and thousands of shades in a gradient read
as modern pre-rendered art whatever the colours are. Quantising to a small palette and hiding the
seams with an ordered 4x4 Bayer dither is most of what the eye reads as "1998". Both do it now, and
both do it at bake or cache time, so neither costs a frame.

Two further things worth not re-deriving. **Per-race material response** (`MATERIALS` in
`tools/raster.js`) was the cheapest large win on the units: one BRDF for all three races is most of
why they read as one art style, and giving Zerg subsurface scattering, Terran a tight hard specular
and Protoss emission separates them at a glance for free. And **silhouette beats colour**: at 40 px
under fog with a team tint, colour is the first thing lost, so marine/firebat/medic/ghost each carry
one oversized outline-breaking feature now. Neither changes a stat.

## M7: PvT and PvZ were fine all along

M6 left three matchups in three different states and could only vouch for one of them. Re-measured on
the M6 shipping code, 66 seeds, three layouts, both sides, 396 games each:

| matchup | rate | interval | verdict |
|---|---|---|---|
| PvT | P 54% | [49-59] over 388 decided | **at target** |
| PvZ | P 49% | [45-54] over 390 decided | **at target** |
| TvZ | T 64% | [59-69] over 382 decided | undecided |

So the M6 pathfinder repair, which moved TvZ six points, did not disturb the other two. That was worth
knowing before reasoning about anything else, and it is why the rest of M7 could treat TvZ as the only
open matchup. `C:\Users\zacsl\bw-scratch\m7-head\pvt-pvz.log` is the run.

## M7: the build order was a queue, and it was eating the tech tree

**Read the M8 correction in Status before quoting the mechanism in this section.** The finding -- that
the build order threw away its own steps -- is sound and the fix is kept. The *explanation* of why it
cost twelve points of TvZ is wrong: it bought Terran economy, not upgrades.

This is the finding of the milestone and the cause of the balance move, so it is worth the space.

`test/casters.js` is new and asks the caster question directly rather than inferring it from unspent
energy: per race, when each enabling building finished, when the first caster of that kind existed, how
long it lived, and every cast that happened. On the M6 shipping code, over nine games:

- **Advanced casters fielded: 3 of 11 kinds. Casting: one** (the comsat).
- **23 of the 28 spell abilities never fired once.** The five that did were stim, burrow, scanner sweep,
  spider mines and one siege.
- **Templar archives were finished in none of six Protoss games.**

That last line kills M6's stated cause. M6 blamed the archon-merge rule for the missing storms — it
merged any two templars under 60 energy while storm was unresearched, and a fresh templar starts at 50,
so every templar was merged on sight. That is a real bug and it is fixed. It cannot have been the
operative cause, because there were never any templars.

The operative cause was in `AI.script()`. The build order ran strictly at the head: a step that could
not be started froze every step behind it, and after 200 seconds a give-up timer threw the step away for
good. Over nine games that abandoned **29 steps**, and 13 of them were abandoned at a moment when the
only thing blocking was the AI's own "do not start five things at once" throttle — a condition that
resolves by itself. Worse, the steps that needed an abandoned one were then abandoned in turn on `req`:
one citadel dropped at step 8 cost the archives at step 13 and everything behind them.

A human whose next building is unaffordable starts the one after it. The order is scanned forward now.
`scriptIdx` still means "the first thing we still owe" and the timer only runs when nothing in reach can
be started at all. Dropped steps fell from 29 to 16, and the buildings arrived:

| enabling building | M6 shipping | after the fix |
|---|---|---|
| templar archives | never, 0 of 6 games | 11:41, 1 of 6 |
| defiler mound | never, 0 of 6 | 11:43, 1 of 6 |
| queen's nest | 14:23, 4 of 6 | 7:29, 4 of 6 |
| academy | 5:13, 5 of 6 | 3:43, 3 of 6 |

### And it moved Terran vs Zerg outside 60/40

Three matchups, 66 seeds, both sides, 1188 games, paired against the M6 shipping logs on the same
seeds. (This is the task 2 run; measured again with task 3 on top it is +13 at p = 0.000, and the
shipping figure in the M8 section is the one to quote.)

| matchup | before | after | paired | verdict |
|---|---|---|---|---|
| **TvZ** | 64% [59-69] | **77% [72-81]** | 104 to T, 59 away of 370 | **p = 0.001, MOVED** |
| PvT | 54% [49-59] | 52% [47-57] | 89 to P, 99 away of 380 | p = 0.512, nothing |
| PvZ | 49% [45-54] | 46% [41-51] | 79 to P, 92 away of 388 | p = 0.359, nothing |

The mechanism is not mysterious and it is the same asymmetry M6 wrote down. Terran's script was the one
being dropped most — `engineering_bay`, a second `factory`, `comsat_station` and `armory` were the
repeat casualties, which is to say Terran was losing its **infantry upgrades** and half its production.
Give those back and a bio ball that already heals gets meaningfully stronger. Zerg's script was being
dropped too, but what Zerg gets back is a defiler mound at 11:43 and a queen's nest at 7:29 — buildings
whose units it never trains and whose spells it never casts. **The same fix pays Terran in upgrades and
pays Zerg in buildings it has no time to use.**

`C:\Users\zacsl\bw-scratch\m7-casters\after.log` is the run.

### The Zerg-side answer, and what it was worth

M6's handoff named this as task 1's real work: Zerg's answer to healed bio is Dark Swarm and the AI
never casts it. Three changes were tried, first as a bundle and then split, because the bundle measured
five points the wrong way and a bundle cannot say which third did it.

**Kept, and measured as exactly neutral (p = 1.000, 39 flips to T and 40 away of 365 paired seeds):**

- **The Defiler Mound required a Hive. In Brood War it is a Lair-tech building.** That is a fidelity bug
  against a README that claims BW numbers, not a balance knob, and it had put Zerg's only answer to
  healed bio four minutes past the end of an average AI game. It is `req: ['lair']` now, and it sits at
  supply 32 in the Zerg script where a Lair-tech building belongs.
- **Dark Swarm was gated on `this.state === 'attack'`.** The cluster test beside it already says "our
  ground units are being shot at", which is the defensive case, so the gate only ever removed the
  situation the spell exists for -- and a Zerg AI losing a game spends it in `defend`.

**Reverted: a cost-aware research gate for Zerg only.** M4 tried it for every race and took TvZ to 97%;
M6's handoff said it "still looks like a real lever if approached from the Zerg side only". It is not.
Zerg alone is worth **+5 points to Terran** over 360 paired seeds. Zerg buys upgrades it does not live
to use. The flat 200/150 gate stays.

**So Zerg has no answer that could be found this milestone.** The mound arrives at 8:04 instead of never
and Dark Swarm still does not fire once in nine games, because the defiler is never *trained*: it costs
50/150 and competes with a lurker morph at 50/100, and `AI_COMP` is a supply-share ratio with no notion
of a gas budget at all. That is the thread M8 picks up.

## M7: two thirds of "idle production" was never a defect

`test/aiaudit.js` has reported idle production buildings since M4 and every milestone since has improved
it without solving it: 203.1 a minute in M4, 105.7 in M5, 86.7 in M6. M7 asked the question of each idle
building on its own instead of once of the player — an idle starport with 400 minerals and no gas is
"cannot afford", even though a marine was affordable at a barracks somewhere else. Same nine games, same
counter, on the M6 shipping code and on M7's:

| | M6 shipping | M7 |
|---|---|---|
| idle production buildings per minute | 86.7 | 114.0 |
| only makes workers, and the AI has enough | 66% | 71% |
| saving for a building | 12% | 12% |
| cannot afford anything this building makes | 8% | 7% |
| composition hold | 7% | 5% |
| unexplained | 5% | 4% |
| supply blocked | 3% | 1% |
| ...of which the money was there to fill | 55.8 | 74.9 |

**Two thirds of the number is a saturated town hall.** A Command Center that has stopped making SCVs
because the AI has enough SCVs is `economy()` working, and it has been counted as a macro sin since M4.
The genuine part is about 30 a minute on both builds and it did not move this milestone. Do not quote
the headline number against M4's 203.1 as progress without saying which part of it is which.

Two real defects were found and fixed on the way:

- **The composition hold stopped every production building, not just the ones that could build the held
  unit.** A Protoss saving eight seconds for a dragoon left its robotics facility and stargate idle too.
  It holds per producer now; for Zerg it still holds everything, which is right, because larva is the
  shared resource being saved.
- **The production loop queued at most one of each unit per think.** A Terran with six idle barracks
  needed six thinks — eight seconds — to fill them. It keeps training now while something can still be
  trained, re-scoring the unit it just queued so the composition ratios still decide the order.

## M9: most units could never use their abilities at all

The finding of the milestone, and the reason every balance number is void.

`micro()` does not run every frame. `think()` runs it on multiples of 12 and on each full think, so the
only values `G.frame % 16` ever takes inside it are `{0,4,8,12}` -- measured, not reasoned. Every stagger
in `micro()` was written `(G.frame + id) % N === 0`, so it came true only for ids in a fraction of the
residue classes, and it did so for the entire life of the unit:

| gate | abilities | units that could *ever* fire |
|---|---|---|
| `% 12` | kiting | 1 in 4 |
| `% 16` | psi storm, dark swarm, plague | 1 in 4 |
| `% 24` | irradiate, spawn broodling, stasis | 1 in 6 |
| `% 48` | nuke, spider mine, comsat scan | 1 in 8 |

A defiler whose id was not a multiple of 4 could not cast dark swarm however long it lived. The comsat
gate keys on `p.id`, where the reachable set is `{0,12,16,24,32,36}` and no player id exceeds 7, so
**only player 0 could ever scan** -- which is why the audit saw scans in some games and not others.
`AI.turn(id, n)` counts guaranteed micro ticks instead of raw frames.

Measured, same seeds, 41-minute cap, only the fix differing: caster kinds *casting* 1 -> 3, spells never
cast 23 -> 21, dark swarm 0 -> 13, irradiate 0 -> 7, scanner sweep 25 -> 47, spider mine 72 -> 668, siege
mode 105 -> 410, burrow 542 -> 1512.

**The measurement that made this findable** was running `test/casters.js` at a 60,000-frame cap instead
of 24,000. Doubling the cap took caster kinds fielded from 3/11 to 5/11 but left kinds *casting* at 1,
and the defiler at 3,622 seconds alive with zero casts. That separated "the game ended" from "the AI
can't" -- without it the whole thing reads as a game-length problem, which is what M7 and M8 concluded.

Separately, `covert_ops` was in no build script, so the AI could not build a ghost or a nuclear silo in
any matchup. It needs a science facility of its own: both Terran science add-ons name `science_facility`
as parent and `AI.addon()` looks for a parent that has none, so the one facility in the script was
always already taken by `physics_lab`.

## M9: the render work, and one wrong extrapolation

- **Per-unit facings.** Five slow-turning types (`FINE_DIRS` in `tools/bake.js`) bake at 32 rather than
  16, for +3.3 MB instead of the x1.96 a global doubling costs. The atlas had recorded `cols` per unit
  since the sheets existed and nothing read it.
- **Pooled shadows.** The shadow pass was a second full-sprite blit per unit; it is now one blit into a
  half-viewport layer per unit and a single upscaled blit of that layer. **4.30 -> 2.80 ms** at 490
  units, p95 4.70 -> 3.20. It also fixed overlapping shadows double-darkening.
- **Device pixel ratio.** The canvas was sized in CSS pixels, so a scaled display got a stretched frame.
  It is sized in device pixels now, integer ratios only.

  The instructive part is that **the cost extrapolation was wrong by two orders of magnitude.** Four
  times the pixels ought to cost four times the fill; measured at 490 units, dpr 1 is 2.80 ms and dpr 2
  (3840x2160) is 2.90. Canvas2D here is GPU-composited, so this pass is bound by the number of draw
  calls and not the area each covers. `test/perf_render.js` takes a dpr argument now. **Budget in draw
  calls, not in pixels** -- which is the same lesson as M8's "budget in blits, not in effects".

  What it sharpens is only what is drawn as geometry: HUD text, bevels, rings, bars, particles, decals.
  Terrain, creep, sprites, fog and the minimap are all cached bitmaps blitted at natural size, so they
  are still upscaled. Making *those* sharp is an open look decision -- bake at the ratio and the 1 px
  dither halves in apparent size, or upscale nearest-neighbour and the art stays chunky but crisp.
  Neither should be picked without looking at it.

## M9 — what to do next

**Task 0 is not optional and comes first, and it is not a research task this time: it is finishing the
measurement M8 started.** Everything else here is downstream of knowing where the balance actually is.

### 0. Finish the re-measurement M8 voided

`fcf08be` invalidated every balance number in this repository. Three full runs were launched at the
end of M8 and write to `C:\Users\zacsl\bw-scratch\full\`:

| log | code | matchups |
|---|---|---|
| `m8-holdfix-tz.log` | HEAD before `197eb40` (tank fix, no drone fix) | TZ |
| `m8-deadcode-tz.log` | HEAD as shipped | TZ |
| `m8-deadcode-pvtpvz.log` | HEAD as shipped | TP, ZP |

**The two TvZ runs completed and their verdict is in Status above: 79% [75-83], still outside 60/40.**
What is *not* done is the third run, `m8-deadcode-pvtpvz.log` (792 games), which was still going when
M8 ended. Check `progress2.txt` for `FULL2DONE`; if it is not there, relaunch from
`bw-scratch/full/run2.sh` -- the scratch directories are set up.

That run tells you where PvT and PvZ sit after the Hold Position fix, which matters because **nothing
has re-measured them at all.** Note its limit before quoting it: there is no matching post-`fcf08be`
baseline for those two matchups, so it can say where they *are* but not what moved them. If either is
outside 60/40, the first suspect is the tank fix, not anything M8 chose -- TvZ moved nine points on
that change alone, in the direction nobody predicted.

Then decide whether re-baselining PvT and PvZ properly is worth two more full runs. It probably is:
they are the only matchups in the project with no trustworthy number at all, and the M8 experience is
that a matchup nobody has measured recently is a matchup nobody knows.

### 1. Write a test that plays like a person -- DONE in M9

All three landed and are in `test/all.js`: `rates.js` (372 checks, every weapon's observed interval
against its `wCd` in both hold and attack), `cardsay.js` (every greyed command-card button explains
itself) and `wrongthing.js` (unreachable orders, unaffordable queues, cancelled morphs). The original
reasoning is kept below because it is the argument for writing more of them.


The strongest finding of M8 is in "The three bugs a player found in an afternoon" above: two of the
three were invisible to every check in this repo and obvious within a minute of play. `playtest.js`
drives the UI *correctly* -- it never holds position and watches, never presses a greyed button and
waits to be told why, never tries to build something it cannot yet build.

Concretely, and each of these would have caught a real bug:

- **Assert rates, not just outcomes.** Nothing here measures shots per second. A check that a unit's
  observed fire interval matches `wCd` for every weapon, in both hold and attack orders, is perhaps
  thirty lines and would have caught `fcf08be` the day it was written.
- **Press every disabled button and require an explanation.** Walk the command card in every state
  and assert that anything dimmed produces a message when pressed. That is `e30e506` as a test.
- **Do the wrong thing on purpose.** Order units to unreachable places, hold in odd spots, queue
  things that cannot be afforded, cancel mid-morph.

### 2. The graphics, continued -- DONE in M9; read the budget before adding more

The draw pass is at **4.40 ms of a 6 ms target**, so there is roughly 1.6 ms left, not the 3.7 ms M8
started with. Budget in blits, not effects: one extra full-sprite blit per unit is about 2 ms, which
means **there is no room for another per-unit pass in the draw loop.** Anything further has to be
bake-time or cache-time. That is not much of a constraint -- most of M8's best work was.

Worth doing, roughly in order:

- **Creep edges.** Still the plainest thing on screen: the mask is upscaled with bilinear smoothing so
  Zerg ground fades out like an airbrush. It wants the same dithered treatment the terrain height
  transitions got. The obstacle is that creep is composited per frame, not cached, so the dither has
  to be built into the pattern or the mask rather than applied after -- see `drawCreep`.
- **Death animations.** There is one death per unit and it is a collapse. Two or three, picked by
  `u.id`, would show constantly in every fight.
- ~~**More facings.**~~ Done in M9, but per unit rather than globally. Doubling every sheet costs
  x1.96 bytes and takes the runtime tinted-sheet ceiling from 576 MB to 1152 MB; measurement said only
  siege_tank (3.3 sim frames), reaver (2.6), ultralisk (2.0) and vulture (1.8) hold a 16-direction
  bucket long enough to see, and the nineteen types with no `TURN` entry cross nearly two buckets a
  frame. Those five are baked at 32 for +3.3 MB. `FINE_DIRS` in `tools/bake.js` is the list; the atlas
  had recorded `cols` per unit all along and nothing read it, so this had to land as one commit.
- ~~**Buildings.**~~ Done in M9: `Sprites.buildingShadow` casts the building's own outline, cached per
  type, so a base sits on the ground instead of on top of it.

### 3. Balance, once task 0 has told you where you are

Do not plan this before reading the runs. What M8 leaves for it:

- **`AI_COMP` is still gas-blind** and a defiler still competes with a lurker morph. M8's gas budget
  attempt did nothing (110 of 128 seeds bit-identical), because the reserve almost never triggers --
  but the underlying observation stands and a better implementation may not be hopeless. Note that the
  M9 caster work found `production()` already scores by share-of-army-supply, so a caster at count 0 is
  the *top* pick and there is already a bank-for-the-top-pick hold: the gas story may not be the one.
- **Casting is fixed; fielding is not.** See Known Issues -- the units that never cast now are the ones
  that are never built.
- **Terran loses equal-supply duels badly** (6/36, -10.3 supply) and wins games anyway. Whatever is
  deciding TvZ, it is not the fight. `test/duel.js --upg` is the tool for pricing that asymmetry.

### 4. Leftovers

- ~~**`test/techtree.js` is not in any suite.**~~ Wired into `test/all.js` in M9, along with `rates`,
  `cardsay` and `wrongthing`.
- **The genuine 30-a-minute of idle production.** Unchanged from M7's list.

## Architecture map

| File | Role |
|---|---|
| `js/data.js` | All unit/building/upgrade/tech/ability tables (BW numbers, frames at 24/s, tiles, px/frame). |
| `js/map.js` | `MapCodec` (run-length codec for custom maps), `MAP_LAYOUTS`, `TILESET_IDS`/`TILESET_NAMES`, `GameMap` (terrain, cliffs, ramps, resources, creep, psi, placement, `generateCustom` for editor maps), `Pathfinder` (A*, returns a **best-effort partial path**, never fails). |
| `js/sim.js` | `Player`, `Unit` (orders state machine, movement with turn/accel, gathering, building, combat helpers). `TURN`/`ACCEL` and `EQUIV` tables live here. |
| `js/game.js` | `G`: init, spatial hash (`near`, `nearEach`), vision/detection, spawning/killing, production, supply, damage, victory, tick loop. Also `ALERTS`, `G.tickAlerts` and `G.supplyRefused` — the player-facing alerts, run once a second. |
| `js/combat.js` | Weapon firing, splash, glaive/line, projectiles, interceptor/scarab launch. |
| `js/abilities.js` | Spells, fields (storm/swarm/etc.), auto-casts (`medicAuto`, `batteryAuto`), interceptor/scarab/dock behaviours, infest. `cast()` is the choke point every finished spell goes through; `test/casters.js` counts there. |
| `js/commands.js` | `RNG`, `G.rand`, `G.stateHash`, command packers/dispatcher (`CMD`), wrappers that intercept every player action, `G.exec`, cheats, `Replay`. Loaded after abilities.js. |
| `js/ai.js` | Computer players: `AI_SCRIPTS` (build orders, **scanned forward, not run as a queue**), `AI_COMP` (supply-share ratios, gas-blind), `AI_RESEARCH`, macro, money reservation, production, army waves, scouting, drops, micro. |
| `js/missions.js` | Eight scenarios, the mission runner (fallback victory, score line) and helpers (`G.hallOf`, `G.givePlayer`, `G.placeDone`). |
| `js/snapshot.js` | Simulation snapshots: reflective capture and restore of the whole sim state, used for replay seeking and for rejoin. Reflective on purpose — a hand-written field list would silently desync the first time someone added a field. `s.gone` carries the reaped-but-referenced corpses. |
| `js/build.js` | Build stamp. Reflection over the sim's data tables and function source; saves and replays carry it and a mismatch is refused. Render code is deliberately excluded. |
| `js/net.js` | LAN lockstep client: hash exchange, desync detection, drop and rejoin. `test/serve.js` is the static server + relay (no npm deps). |
| `js/editor.js` | Map editor: terrain brush, rectangle fill, mirrored painting, undo/redo, minimap, base placement, tileset cycling, validation, localStorage and JSON import/export. |
| `js/audio.js` | `Voice` (speechSynthesis) and `Music` (WebAudio generative). |
| `js/terrain.js` | Procedural terrain painting, and `TILESETS` — the palette table that is the whole of what makes a biome look like itself. A new biome is an entry here plus an id in `TILESET_IDS` in `js/map.js`, and nothing else. |
| `js/sprites*.js`, `js/atlas.js`, `js/fx.js`, `js/render.js`, `js/hud.js`, `js/ui.js` | Rendering, baked-sprite loading and tinting, effects, HUD/console, input/menus/loop, observer overlays. `hud.js` overrides the drawing methods of `UI`. |
| `tools/models.js`, `tools/raster.js`, `tools/bake.js` | Sprite pipeline. `node tools/bake.js` writes `assets/sprites/*.png`, `assets/atlas.js`, `assets/preview.png`. `ART_SCALE` in bake.js is the render-only infantry size boost. |
| `tools/tilesets.js` | Serves a page that renders every entry in `TILESET_IDS` through the game's own `Terrain.draw` and posts the composed image back; writes `assets/tilesets.png` and exits. |

## Invariants (do not break)

1. **Determinism.** No `Math.random`, `Date`, or `performance` in sim files (`sim.js`, `game.js`,
   `combat.js`, `abilities.js`, `ai.js`, `map.js`, `commands.js`, `missions.js`). Use `G.rand()`.
   `test/determinism.js` must stay green; `test/diverge.js` pinpoints a divergence frame if it breaks.
2. **Commands.** Anything the human does to the sim must go through a function wrapped in `CMD.install()`.
   A new player-facing sim mutation needs a packer + `CMD.apply` case, or replays and network play
   silently desync.
3. **Sim vs render.** `G.tick` sets `G.inTick`; UI calls outside ticks are intercepted. Render-side state
   (FX particles, decals, animation frames) must never influence the sim. `js/fx.js` is render-only and
   is not referenced by any sim file; keep it that way. `G.human` is render-only too — that is what makes
   replay vision switching safe. Alerts follow the same rule: the decision is sim-side and gated on
   `p.human`, the minimap ping is render-side and gated on `G.human`.
4. **Input must not depend on rendering.** Hotkeys and command-card clicks rebuild the card through
   `UI.currentCard()`. Do not go back to reading a card cached by the draw pass; the browser pane
   throttles rendering and the card goes stale.
5. **Baked art.** Edit `tools/models.js` and rebake; never hand-edit PNGs. If assets are missing, vector
   painters are the fallback.
6. **The build stamp covers the sim only.** If you add a sim file, add it to the list in `js/build.js`.
   If you change render code the stamp must *not* move — `test/version.js` and a rebake of the sprites
   both check this in practice.
7. **Browser pane quirk.** The desktop app's browser pane throttles `requestAnimationFrame` — to about
   three frames a second, so 160 frames takes over 45 seconds and rAF is unusable for pacing anything.
   The sim runs on `setInterval` in `UI.simStep`; keep it that way.
8. **Nothing in the sim may hold a reference the snapshot cannot resolve.** `G.byId` never forgets a
   unit and `G.units` is reaped once a second, so the two disagree by design; `Snapshot.take` closes the
   gap with `s.gone`. If you add a field that can point at a unit, it is already covered — but if you
   add a *container* the reflective walk does not reach, it is not.

## Measuring things

### Performance

| metric | M2 baseline | M6 | M7 | M8 | target | |
|---|---|---|---|---|---|---|
| sim tick mean | 2.75 ms | 2.89 ms | 3.07 ms | — | under 8 ms | pass |
| sim tick p95 | 5.64 ms | 6.03 ms | 6.14 ms | — | — | |
| render median, 1080p, ~290 units drawn | 3.7 ms | 1.60 ms | — | 3.10 ms | under 6 ms | pass |
| render median, 1080p, ~490 units drawn | — | 2.30 ms | — | 4.40 ms | under 6 ms | pass |

M7 costs about 0.18 ms a tick at 513 units and 204 supply a side, which is `AI.script()` walking
`G.units` once more per think and `production()` being allowed to keep training rather than stopping at
three units. The whole AI phase is 0.16 ms of a 3.07 ms tick; the tick is still dominated by unit
separation at 0.92 ms. M8 did not touch a sim file for the graphics work, so the sim rows are M7's.

**Read the render rows before planning more art.** M8 spent most of the headroom the handoff advertised:
2.30 ms of a 6 ms budget became 4.40, so what is left is about 1.6 ms, not 3.7. The exchange rate is
worth writing down because it decided three design choices in a row:

> **One extra full-sprite blit per unit costs about 2 ms a frame at 490 units.**

That is the whole reason the shadow pass is in the draw loop and the rim light is in the bake. A first
version had both at draw time and measured 6.60 ms -- a fail. De-shearing the shadow bought 0.10 ms, so
the shear was never the cost; dropping the rim bought 1.80. Budget in blits, not in effects.

The other measured trap: **building a gradient per instance per frame is expensive.** The muzzle flash
cost 0.8 ms while it called `createRadialGradient` per flash, and 0.3 ms once the gradient was baked
into a 32px canvas and blitted. "Only units that fired this frame" is most of the screen in a
200-supply battle.

`node test/perf.js 600 4 temple --sustain` for the simulation; `node test/perf_render.js` then open the
URL it prints for the draw pass. **Pace the draws.** Drawing in a tight loop outruns the compositor and
every third frame blocks on the GPU queue, which reports 6.08 ms mean and a 15.8 ms p95 for a pass that
costs 2.3 ms.

### Balance

> **Every balance number measured before `fcf08be` is void.** Hold Position never checked the weapon
> cooldown, so a sieged tank fired up to 75x its allowed rate, and siege tanks are 4 of 24 in
> `AI_COMP.T`. That includes M7's "TvZ 77% [73-81]" and every row of the chain below it. The logs are
> kept because the *paired* comparisons between them are still valid -- both sides of each pair have
> the bug -- but no absolute win rate in this file can be quoted. M9 task 0 is finishing the
> re-measurement.
>
> The cheap path first: `test/proxy.js` gives a direction in four minutes and is validated
> (`test/proxy_validate.js`). Spend a 40-to-90 minute run confirming what it flags, not discovering.

Runs read `js/*.js` from disk when each child process starts, so editing the working tree mid-run
silently mixes two versions — that happened once in M3 and cost a full run. **Snapshot instead**: copy
`js/{data,map,sim,game,combat,abilities,commands,ai}.js` plus `test/balance.js` into a scratch directory
outside OneDrive and run the harness from there, which also lets several variants run at once. One
matchup at 66 seeds is 396 games and about forty minutes at `--jobs=12` on sixteen cores; all three is
1188 games and about ninety.

**Run it so it survives the session ending.** `Start-Process -WindowStyle Hidden -RedirectStandardOutput`
detaches it from the tool harness entirely.

**A/B on identical seeds, not two fresh matrices.** `node test/balance_ab.js before.log after.log
[--matchup=TZ] [--race=T]` scores both logs the same way and counts the games that flipped (McNemar).
Same seeds means the same maps and the same openings, so a pair differs only by the change. It reads
any balance run's stdout, and it filters by matchup, so one three-matchup log is three A/B inputs.

Logs kept, all 66 seeds, three layouts, both sides:

| log | code | matchups |
|---|---|---|
| `C:\Users\zacsl\bw-scratch\m6-base\baseline.log` | M5 as shipped, `f6d4229` | TZ |
| `C:\Users\zacsl\bw-scratch\m6-head\head.log` | M6 as shipped, `0f87106` | TZ |
| `C:\Users\zacsl\bw-scratch\m7-head\pvt-pvz.log` | M6 as shipped, `c494be6` | TP, ZP |
| `C:\Users\zacsl\bw-scratch\m7-casters\after.log` | M7 task 2, `a23d92b` | TZ, TP, ZP |
| `C:\Users\zacsl\bw-scratch\m7-head2\tvz.log` | M7 tasks 2+3, `07836c6` | TZ |
| `C:\Users\zacsl\bw-scratch\m7-zerg\tvz.log` | M7 with the Zerg-side answer | TZ |
| `C:\Users\zacsl\bw-scratch\m7-mound\tvz.log` | M7 **as shipped**, `2802b31` (M7's table omitted this one) | TZ |
| `C:\Users\zacsl\bw-scratch\proxy\*.log` | ten-minute proxy runs, six M7 variants + eleven M8 ones | various |
| `C:\Users\zacsl\bw-scratch\full\m8-*.log` | **post-`fcf08be`, M9 task 0 reads these** | TZ, TP, ZP |

### What not to repeat

Each was a full run, most 216 games or more, all zero or negative:

| tried | result |
|---|---|
| Terran comp off marines (6 to 4) onto tanks (4 to 5) | TvZ unchanged at 80% |
| More Zerg Lurkers (morph ratio 1.5 to 0.8) | TvZ unchanged at 79% |
| Zerg drones to army earlier (ramp from 16 to 12 workers) | TvZ 91%, much worse |
| Zerg early sunkens on a supply curve | TvZ 90%, much worse |
| Relaxing the base-count floor for Zerg only | TvZ 65% but PvZ collapses to 11% |
| Earlier Protoss gas | no change at all (M2's handoff recommended this) |
| Earlier Psionic Storm, in the script and the research order | no change at all — and M7 explains why: the archives were never built |
| **Zerg gas budget for `AI_COMP`** (M8) | nothing — 110 of 128 seeds bit-identical; the reserve almost never triggers |
| **Reordering `AI_RESEARCH.Z`, carapace/missW before flyW** (M8) | nothing on outcome; only `upg@10` moves, and downward |
| **Gentler Zerg drone ramp, 1.5 → 0.6** (M8) | nothing |
| **Zerg drone floor 16 → 24 / 28 / 32** (M8) | all three move toward Zerg; 32 was 3/3, but the dead-code fix is bigger and is a bug fix |
| **Per-base Zerg drone floor (10 × halls)** (M8) | nothing |
| **Giving Zerg the larva-gated rule T and P had** (M8) | much worse, 3/3 to Terran — drones to 60, fields no army |
| **Giving T and P Zerg's exact army gate** (M8) | as strong as the dead-code fix on TvZ but pushes PvZ toward Zerg, which is the wrong way |
| Earlier Lurkers in the research order | no change |
| More Zerg macro hatcheries | larvae but no minerals |
| Cost-aware research gate, all races | helps Terran more; TvZ 97% |
| Cost-aware research gate, Zerg only | +5 points to Terran over 360 paired seeds (M7) |
| Defiler Mound earlier, so Zerg can answer bio | neutral, p = 1.000 -- the mound gets built and the defiler never does |
| Gas vs mineral worker rebalancing | worse across the board |
| Reacting to a sighted push rather than one that landed | no improvement |
| Steeper or gentler Zerg drone ramps than the committed one | both worse |
| Retreat on 35% of units lost | never fired: 0 retreats in 12 games |
| Retreat at 0.55 or 0.7 of starting wave supply | both worse than 0.8 |
| Tuning anything to move the *pooled* TvZ number | all three layouts are Terran-favoured; there is no fair one to average against |

**Known asymmetry.** By ten minutes in TvZ, Terran has finished five techs (siege, stim, u238, mines,
thrusters) and Zerg has finished none. Zerg's minerals and gas are anti-correlated early — 470 minerals
with 32 gas, then 114 minerals with 359 gas — so a flat research gate almost never opens for it. M4's
cost-aware gate backfired because it applied to every race and helped Terran more. M7 tried it for Zerg
only; it is worth +5 points to Terran over 360 paired seeds, and is
reverted. Zerg buys upgrades it does not live to use. Treat this lever as closed.

## Known issues and rough edges

- ~~**Replay backward-seek lands on the wrong state.**~~ **Fixed in M9** (`779afb9`). `test/longgame.js`
  is ALL PASS 19/19, and the seek that took 207 s against a 90 s budget takes 4.5 s.

  It was never about thinning, and both candidates this section used to name in `js/ui.js` were
  innocent. `Snapshot` tagged a resource reference as its **index** into `G.map.resources`, and
  `G.removeResource` splices a mined-out patch out of that array while the object lives on wherever
  something still points at it -- `p.startBase.minerals`, a worker's order target. Those survivors kept
  a stale index and decoded to whichever patch had shifted into the slot, or off the end to `undefined`.
  A restored checkpoint quietly re-aimed workers at other players' minerals and the divergence surfaced
  seconds later, far from the cause. References are keyed by `id` through `resById` now.

  **The lesson worth keeping is why it looked like a seek bug for two milestones.** Every probe here
  confirmed "the checkpoint restores to the right state" by comparing `G.stateHash()`. That only proves
  the *hashed subset* matches, and a mis-aimed worker is not in it. Once that was distrusted it
  reproduced in two minutes with a 33,200-frame game and no thinning at all: restore the checkpoint at
  32,400 and it diverges 19 ticks later. All it needs is one mined-out patch, about 13:00 into any game.
  A structural diff of the two snapshots named it outright -- `s.players[1].startBase.minerals[1].__r:
  90 != undefined`. **When a hash says two states match and they then diverge, diff the states, not the
  hash.**

- **Dead-unit order targets do not survive a snapshot.** `s.gone` gets a shell for each referenced dead
  unit, but a dead unit referenced only by *another* dead unit is not in the walk, so its `order.target`
  decodes to `null`. Corpse-only and the sim never reads it, so it is cosmetic -- recorded because it
  showed up in the diff above and should not be re-investigated as a fault.

- **EVERY BALANCE NUMBER BELOW IS VOID.** `10fe920` changed how strong the AI is, not just which spells
  it casts: kiting was on the same broken stagger, so vultures, mutalisks and dragoons now kite four
  times as often, siege mode fires 4x more and spider mines 9x more. The build stamp moved
  `f0b8c7ea07fba27b` -> `e65b2a5848da3481`. Nothing here has been re-measured since. **This is task 0
  for whoever picks the project up next**, and it is a bigger re-measure than M8's, because it moves all
  three matchups at once.
- **No matchup is formally outside 60/40, and none is confirmed inside.** TvZ 64% [59-69] to Terran,
  PvZ 36% [31-41] to Protoss (so 64% to Zerg), PvT 62% [57-67] to Protoss. All three "undecided" --
  about 97 more decided games each would be needed to call any of them. PvZ is the one that moved
  furthest and is the one to look at first; see Status.
- **PvT is 62% [57-67] for Protoss and has not been re-measured since the Zerg build-order fix**,
  which is Zerg-only and cannot affect it.
- **Three of the five caster kinds that are never fielded are never fielded on purpose.** `ghost` and
  `dark_archon` are absent from `AI_COMP` altogether and `queen` has weight 0 in all three Zerg comps,
  where `production()` skips on `if (!wgt)`. So M9's `covert_ops` fix is deliberately incomplete: it
  buys lockdown, personnel cloaking and the nuclear silo, but no ghost will be trained until one is
  added to `AI_COMP.T`. Doing that is composition work and moves balance, so it belongs with a
  measurement and not before one. Only `arbiter` and `corsair` are in the composition and still absent,
  and those are the time-and-gas story.
- **The AI casts 7 of 28 spell abilities, and 5 of 11 caster kinds are never fielded.** Improved in M9
  from 5 of 28 by fixing the micro stagger below; what is left is a *production* problem, not a casting
  one. At a 41-minute cap: queen (5/6 games have the enabler), dark archon, arbiter and corsair are never
  trained at all, and the high templar gets 102 caster-seconds, which is not long enough to reach psi
  storm's 75 energy. `node test/casters.js 60000` is the measurement -- and note the 24,000-frame default
  materially under-reports, showing 3 of 11 kinds fielded where 60,000 shows 5.
- **The AI leaves production buildings idle**, 114 a minute over both players — but two thirds of that
  is saturated town halls and is not a defect. See task 3 above.
- **The AI is supply blocked 9-12% of the time**, unchanged in character since M4.
- **Missions**: all eight resolve, are winnable, and the scripted bot wins all eight, with zero JS errors
  and zero stuck units. A human should still try them before anyone tunes them.
- **Multiplayer**: rejoin ships a snapshot and is fast. Tested with four clients plus AI, simultaneous drops, and host migration (`test/net_many.js`).
  `test/net.js` phase 3 now gets the same 240 s budget as every other phase (`83ce89f`); the separate
  assertion that a rejoin is *fast* keeps its own 120 s, because that one is about the code.
- **Replay backward-seek** restarts from a checkpoint 30 s back, so it is fast but not instant;
  checkpoints past 40 minutes are thinned to every 60 s.
- **Editor**: done as of M9. The brush is round or square (B), and "Size..." takes a number or WxH and
  clamps to the 64-256 the engine has always accepted. Non-square maps were legal from the start and
  simply unreachable; `test/editor.js` now plays one at 64x256.
- **Art**: five terrain tilesets — badlands, jungle, ice, desert, space. Creep is chunk-cached with a dithered border as of M9. A sixth tileset is a palette entry in `js/terrain.js`
  plus an id in `TILESET_IDS` in `js/map.js`, and nothing else.
- **Host migration** is not a thing that needs building: the relay picks the first non-dropped human as
  host, so if the host leaves the next player takes over, and mid-game there is no authority to transfer
  because the relay routes everything.
- **Nothing distinguishes "not told" from "told and ignored".** Neither the alert pass nor
  `test/aiaudit.js` can tell whether the player alerts help.

## How to run everything

```bash
node test/serve.js 8765          # or double-click PLAY.bat; prints LAN URL
node test/features.js            # 87 gameplay checks
node test/all.js                   # the eleven fast deterministic checks, in parallel
node test/rates.js                 # every weapon's observed rate of fire matches its table entry
node test/cardsay.js               # every greyed command-card button explains itself when pressed
node test/wrongthing.js            # do the wrong thing on purpose: nothing crashes, nothing wedges
node test/net_many.js              # 3-4 lockstep clients, simultaneous drops, host migration
node test/longgame.js              # a 60-minute game and its replay past the checkpoint thinning
node test/eightplayer.js           # 8 players on a 192x192 custom map
node test/saveload.js              # saves taken mid-nuke, mid-morph, mid-Recall reload exactly
node test/determinism.js         # identical runs match; replay reproduces the original
node test/alerts.js              # the four player alerts fire when they should, never when they should not
node test/version.js             # build stamp: a save from another build is refused
node test/observer.js            # replay observer: vision switching, production overlay, seeking
node test/snapshot.js            # a restored simulation snapshot re-simulates bit-identically
node test/rejoindiag.js [frames] # splits a rejoin into round-trip and fresh-context, to isolate a desync
node test/movement.js            # unreachable goals, wedged units, burrowed units
node test/balance_stats.js       # the statistics behind the balance harness (runs no games)
node test/proxy.js --matchups=TZ            # the cheap balance signal: ten-minute games, paired
node test/proxy.js --ab a.log b.log --matchup=TZ --race=T   # which way a change moved, in minutes
node test/proxy_validate.js                 # what the proxy gets right and wrong (runs no games)
node test/duel.js --upg=T:1,Z:0             # equal-supply duels, optionally at unequal upgrades
node test/techtree.js                       # every unit/building/tech reachable? prints the long chains
node test/balance_ab.js a.log b.log --matchup=TZ --race=T   # paired A/B of two balance logs (runs no games)
node test/aiaudit.js             # things the AI does that a human never would, and why each idle building is idle
node test/casters.js             # which spells the AI ever casts, and when the tech that unlocks them lands
node test/micro.js               # prints a controlled duel frame by frame (diagnostic, not pass/fail)
node test/playtest.js all        # scripted human drives TvZ, PvT, ZvP through the UI layer
node test/playtest.js missions   # the same scripted human plays all eight campaign missions
node test/net.js                 # two lockstep clients + AI: hashes, drop, rejoin, desync detection
node test/missions.js            # every campaign mission: setup, placement, objective resolves
node test/editor.js              # custom map, mirrored 4-player map, undo/redo, AI game, LAN game
node test/balance.js --seeds=1,2,3,4,5,6     # win-rate matrix (about 9 minutes) - see the variance warning
node test/perf.js 600 4 temple --sustain     # 4-player 200-supply battle timings
node test/perf_render.js                     # the draw pass at 1080p; open the URL it prints
node test/smoke.js 16000 TZ temple           # single AI-vs-AI game
node test/diag.js PZ 21600 temple            # AI progression dump
node test/diverge.js                         # finds the first non-deterministic frame
node tools/bake.js                           # after editing tools/models.js
node tools/tilesets.js                       # then open the URL it prints; writes assets/tilesets.png
```

Git: the repo is inside OneDrive; commits with the 16 MB of sprites are slow (30-60 s). Run
`git add -A && git commit` in the background if using a tool with a timeout.

## How earlier milestones landed (kept for context)

**M8** built a ten-minute proxy for the balance harness, validated it for free against five runs that
were already paid for, and used it to test eleven levers in an hour -- finding along the way that M7's
stated cause was wrong (the build-order fix bought Terran *economy*, not upgrades) and that Terran and
Protoss had never been army-gated on worker production because of a constant that was always true. It
also did the graphics overhaul: five tilesets, silhouette shadows, baked rim light, posterised art,
per-race console skins and materials, and real mineral fields. Then a player found in one afternoon
three bugs that every test here missed, one of which -- Hold Position ignoring the weapon cooldown --
voided the entire balance history of the project. **The milestone's most useful output is that last
sentence**, and M9 task 1 is the test suite it implies.

**M7** answered M6's open question — PvT and PvZ were at target all along — and then found the largest
structural bug in the AI by asking the caster question directly instead of inferring it: the build order
was run as a queue, threw away 29 of its own steps over nine games, and amputated its own tech tree, so
templar archives were finished in none of six Protoss games and 23 of 28 spells never fired. Fixing it
cost twelve points of Terran vs Zerg at p = 0.001, because the steps Terran was losing were its infantry
upgrades and the steps Zerg was losing were buildings it has no time to use. It also found that two
thirds of the idle-production figure three milestones have chased is a saturated Command Center.

**M6** spent the energy the AI was sitting on (26% → 11% of caster-seconds full), told the player what is
wrong with four alerts, found that the missions were fine and the scripted bot was not (4 of 8 → 7 of 8),
added the ice tileset, re-measured performance and built the render harness that half of it never had.
Its close-out was worth as much as the milestone: playing one game in the pane found that the console was
41 copies of one sentence, and taking `test/net.js`'s intermittent failure seriously found that the A*
closed set had been dead since the 256th search of every game and that snapshots dropped the corpses the
AI still reads. Fixing the first of those also won `z3`, the last mission, so the bot is 8 of 8.

**M5** fixed what M4 said could not be fixed by tuning: no matchup outside 60/40, TvZ 84% → 60%, by
making a lost fight survivable rather than by changing a unit stat. It also halved idle production, made
rejoin ship a snapshot, added the jungle tileset, and ran play-test round four.

**M4** added confidence intervals to the balance harness — the most valuable thing in it, because it
retro-invalidated several M3 conclusions — fixed three classes of never-completing order, added
simulation snapshots, building damage states and the AI audit tool. It failed to fix TvZ by tuning and
said so, which is what let M5 fix it another way.

**M3** reworked AI macro, drove all eight missions through the UI for the first time, added the build
stamp on saves and replays, editor quality of life, an infantry art pass and observer/replay controls.
Its task 1 commit message overstates its result: it quotes a seeds 1-6 run only. Over 216 games M3 traded
one established failure (PvZ) for another (TvZ).

The lesson in that sequence is worth keeping, and M7 is the fifth instance of it: **a milestone that
reports a negative result accurately is worth more than one that reports a number from too few games.**
M7's is the sharpest yet, because the negative result and the bug fix are the same change.
