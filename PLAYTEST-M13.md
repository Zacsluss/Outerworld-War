# M13 playtest guide — the AI's money

M13 changed exactly one thing: **how the computer opponent decides what to spend its minerals and gas
on.** Nothing was added to the game — no units, no buildings, no interface. So this guide is unusual,
and worth reading before you start:

> **Most of M13 is invisible from inside your own base.** It is a change to what the *opponent* does.
> Every item below therefore says how to *get where you can see it*, and where something genuinely
> cannot be seen from normal play, it says so and gives you the command that shows it instead.

`DESIGN-M13.md` has the reasoning and the numbers. `PLAYTEST-M12.md` is still entirely true.

---

## Set-up: how to watch the AI at all

Start the server with **`PLAY.bat`** (or `node test/serve.js 8765`) and open
`http://localhost:8765`. From the main menu, **Play** → set **one opponent**, race **Protoss**,
difficulty **Hard**, style **Standard**, and start.

Then press **`Enter`** to open chat and type these three, one at a time:

```
black sheep wall
```
```
staying alive
```
```
power overwhelming
```

The first reveals the map, the second stops you losing, the third makes you unkillable. You are now a
spectator with a base. **Do not attack.** Scroll to the enemy's start position and just watch it for
fifteen minutes.

*(If you would rather have a proper replay to scrub: play a game normally, then from the main menu use
**Replays** to load it back. Replay mode reveals everything and has a production overlay by default.)*

---

## 1. The opponent reaches its top tier, and you can see it standing there

**This is the headline.** Before M13 the computer got stuck on tier 2 and built the same cheap army
forever — a Protoss opponent finished a twenty-minute game with 77 zealots, 3 dragoons and nothing
else.

**How to see it:** with the map revealed, watch the enemy base from **6:00 to 12:00** on the game
clock. Look for the **big** buildings going up, not the small ones.

**What working looks like:** by about **7:00** a Protoss opponent has a **Stargate**; by **8:00** a
**Templar Archives**; by **9:00** a **Robotics Support Bay**; and by **11:00–12:00** a **Fleet
Beacon** and an **Arbiter Tribunal**. Every one of those has a unit standing next to it before the
game is over.

**Repeat it for the other two races** — one game each, same set-up:

| race | what to look for, and roughly when |
|---|---|
| **Terran** | Starport ~6:00, Control Tower ~6:45, Armory ~7:30, Science Facility ~8:30 |
| **Zerg** | Spire ~7:15–8:00, Queen's Nest ~6:30, Hive ~8:00–9:00, Defiler Mound ~9:00–12:00 |
| **Protoss** | Stargate ~7:00, Templar Archives ~8:00, Robotics Support Bay ~9:00, Fleet Beacon ~10:00 |

**The most striking one is Zerg.** Before M13, the Spire took **eighteen minutes** in a contested game
and the Hive and Defiler Mound usually never arrived at all. If you watch one game this session, watch
a Zerg one and wait for the Spire.

---

## 2. The heavy units actually come out

Buildings are only half of it — a Stargate that never makes anything is not tech.

**How to see it:** same revealed game, **after 10:00**, scroll around the enemy's army and its
production buildings.

**What working looks like — units that used to appear in exactly zero games:**

- **Terran:** a **Thor** walking with the army. A **Banshee** or **Liberator** overhead. A
  **Battlecruiser** — one, late, but it exists.
- **Protoss:** a **Colossus** stepping over a cliff. A **Void Ray**, a **Tempest**, a **Carrier**, an
  **Arbiter**. Also a **Disruptor**.
- **Zerg:** **Infestors** and **Defilers** in the army rather than pure zerglings.

**The quickest single check:** press `Enter`, type **`black sheep wall`** if you have not, then look at
the enemy army around **15:00**. If everything in it is the race's cheapest unit, something has
regressed.

---

## 3. The opponent is still fighting you at twenty minutes

An unintended but real result. Before M13 the computer often ran itself into the ground — in the
measurement runs, a contested Terran finished a twenty-minute game **on two workers**, because it had
spent itself to death and then been killed.

**How to see it:** play a **normal** game — no cheats — against one Hard opponent on any race, and try
to win. Do not rush.

**What working looks like:** at **20:00** the opponent still has three or more bases, sixty or more
workers, and a mixed army with expensive things in it. It should feel like it is still in the game.
If it collapses into nothing by itself, that is a regression.

---

## 4. The opponent still attacks early — check this specifically

This one is a **guard against a change that was tried and rejected**, so it is worth confirming by
hand: an earlier version of the budget reached tier 3 faster and stopped attacking for the first eight
minutes, which makes for a much duller opponent.

**How to see it:** normal game, one Hard opponent, and **do not build any defence at your natural**.

**What working looks like:** a real attack wave arrives at your base **within the first eight minutes**
— usually somewhere around **five to seven**. If nothing has come at you by 10:00, that is the
regression, and `test/aistyles.js` is the test that catches it.

---

## 5. The opponent upgrades throughout the game

**How to see it:** revealed game again. Select an enemy **Forge / Engineering Bay / Evolution Chamber**
and look at what is in its production queue. Do this three or four times between 8:00 and 18:00.

**What working looks like:** it is almost always busy. Over a twenty-minute game the computer now
finishes roughly **twenty to thirty** upgrades. It is also visible in combat — enemy units that hit
harder than they did at ten minutes.

**Why this one is worth a specific look:** getting the budget wrong in either direction breaks it
completely and silently. One version of the change left Zerg with **one upgrade in a whole game**, and
nothing about that is obvious from watching unless you go and look at the buildings.

---

## 6. What you genuinely cannot see, and what to run instead

The budget itself — which of the seven claims got funded, what each gate refused, where every mineral
went — has **no representation in the game at all**. There is no point squinting at the screen for it.

```bash
node test/ledger.js 20 1 solo P
```

That is the instrument. `20` is minutes, `1` is the seed, `solo` gives the AI an opponent that does
nothing (so you are measuring its build order, not the outcome of a war — use `vs` for a real game),
and the last argument is `T`, `Z`, `P` or `all`.

It prints five sections. The ones worth your time:

- **Section 1, "where the money went"** — every mineral and gas, split by what bought it. A healthy
  Protoss run mines about **35,000 minerals and 11,000 gas** in twenty minutes.
- **Section 2, "the claim order"** — how often each of the seven claims asked for money and how often
  it got the whole amount. If `inflight` drops well below 90%, or `head` below about 40%, something is
  wrong.
- **Section 4, "buildable, never chosen"** — units that had a finished building able to make them and
  never came out. **This list should be short.** Today it is Swarm Host, Viper and Mothership, and
  those three are a known open problem (see below).

**The first line of its output is the one to check before believing any of the rest:** it runs the same
seed twice, once instrumented and once clean, and compares a state hash. It must say **IDENTICAL**. If
it ever says DIVERGED, the probe is changing the thing it is measuring and every number under it is
describing a different game.

Two more, both pre-existing:

```bash
node test/techtime.js 20 1,5,11 vs
```
When the AI reaches each tier, three seeds, contested. Read the `at 20 min` line under each race
first — **if a race finished on a handful of workers it was destroyed, and its build-order timings are
measuring a war, not a build order.**

```bash
node test/soak.js
```
Eighteen games, every matchup, and a coverage report. The number M13 moved is **tier-3 M12 defs: 4/13
→ 11/13**.

---

## Known, and deliberately not fixed here

**Three units are still never built by the computer: Swarm Host, Viper and Mothership.** All three are
morphs, and all three want more of the unit they are made from than the AI ever builds — a Viper needs
five Mutalisks, a Mothership needs three Arbiters, a Swarm Host needs five Roaches. The tech, the
buildings and the money are all there by the time it matters; the army simply has the wrong shape.

The clearest way to see it: in `AI_COMP.Z`, Zergling and Roach carry **the same weight**, which is
meant to mean equal army supply. A twenty-minute Zerg game ends with **113 zerglings and 3 roaches**.

This is the composition table's problem rather than the economy's, and re-deriving those weights needs
the balance harness, which is a forty-minute run that has to come after everything else. So it is
written down rather than guessed at. **`test/soak.js` fails one assertion because of it** — 15 of 16
tier-1/2 units, missing Swarm Host — and that assertion was deliberately **not** weakened to make it
green.
