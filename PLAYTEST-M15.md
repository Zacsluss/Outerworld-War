# M15 playtest guide — the six things you reported, and the three found behind them

Everything in `FIXLIST-M15.md` is done. This guide is how to *see* each one, by hand, in a running
game. It is written to be used with the game open beside it.

Two of the entries turned out to be **two faults each**, and one of the things the fixlist itself said
was already working turned out not to be. Where that is true this guide says so, because what you
actually see will not match what the report described.

`PLAYTEST-M12.md`, `PLAYTEST-M13.md` and `PLAYTEST-M14.md` are all still entirely true.

---

## Set-up

Start the server with **`PLAY.bat`** (or `node test/serve.js 8765`) and open
`http://localhost:8765`.

Unless an item says otherwise: **Play** → one opponent, difficulty **Easy**, and start. Most of this
milestone is Zerg, so pick Zerg unless told not to.

Cheats are typed into chat with **`Enter`**. The ones this guide uses:

```
show me the money
```
```
power overwhelming
```
```
black sheep wall
```
```
the gathering
```
```
modify the phase variance
```

10,000 of each resource; invulnerability; reveal the map; **infinite energy**; and ignore tech
requirements. **`the gathering` is a toggle and several items below need it OFF** — it refills every
energy bar every frame, which hides exactly the cost you are trying to see.

---

# The quick pass — ten minutes, one Zerg game

If you only have ten minutes, do these five and you will have seen the biggest changes.

1. **Select an Overlord.** It has an energy bar now, and a number: `Energy 50/200` (C1).
2. **Press `C` and click creep twenty tiles away.** It refuses and says why. It does not fly there (C2).
3. **Walk a Zergling off the creep and back on.** It visibly speeds up on creep (C3).
4. **Watch the creep for ten seconds without moving.** It ripples (A3).
5. **Hover any ability button on any unit.** It says what the ability does *and what to click* (A2).

---

# Group A — what you look at

## 1. Every weapon fires its own shot (item 1)

You asked whether unit projectiles were ever researched before being built. **They were not.** The
shot's look came off a hardcoded list of unit ids, and **34 of the 63 armed things in the game — 54% —
were not on it** and fired the same small white dot. That was every unit M12 added: Thor, Colossus,
Carrier, Void Ray, Immortal, Phoenix, Mutalisk, Roach, Baneling, Lurker.

**How to see it:** type `modify the phase variance` and `show me the money`, then build one of each of
**Mutalisk, Roach, Baneling, Lurker** as Zerg, or **Thor, Colossus, Carrier, Void Ray, Immortal,
Phoenix** as the other two races, and shoot something with each. The cleanest comparison is a
**Goliath**: its ground autocannon and its air missiles now look different from each other, because
the look is on the **weapon** and not on the unit.

**What "working" looks like:** no two units that should feel different fire the same white dot, and
zooming out (mouse wheel) still lets you tell air fire from ground fire from splash at a glance.

---

## 2. Every ability says what it does and what to click (item 4, first half)

You said you were not sure what Spawn Broodlings does. **No ability in the game explained itself** —
0 of 80 had a description. Spawn Broodlings is just the one you happened to notice.

**How to see it:** make a **Queen** (Zerg, needs a Queen's Nest — or type `modify the phase variance`),
select her, and **hover each of her six buttons**. Under the name and the price there is now a
sentence saying what it does **and what it can be used on**. Spawn Broodlings says it kills a ground
organic unit outright and cannot target air, buildings or Protoss robotic units.

Then press **`F3`** for the codex and look at any unit — the same text is there.

**What "working" looks like:** no ability button anywhere shows a name and a price and nothing else.
Check **Burrow**, **Siege Mode**, **Stim** and **Blink** in particular: those have no cost at all, and
until this milestone a button with no cost and no energy price drew no tooltip whatsoever.

---

## 3. The creep is alive (item 5, first half)

**How to see it:** stand still and **watch your creep for ten seconds**. Slow bubbles and ripples move
across it. Deliberately *minor* — that was the word in the request — so look at the carpet, not for a
light show.

**What "working" looks like:** the creep is not a frozen texture. Frame rate is unchanged, which is
the actual hard part: creep is drawn from cached 8×8-tile chunks, and the animation is an overlay on
top of the finished blits so the cache is never invalidated.

**Worth trying:** save a replay, then seek backwards and forwards in it. The bubbles are derived from
tile coordinates and the frame number rather than stored, so the same tile bubbles the same way every
time you watch — seeking to 0:20, then 0:40, then back to 0:20 shows the identical picture.

---

# Group B — the interface

## 4. Training a Drone at the supply cap (item 6) — AND IT WAS THE CARD, NOT THE MESSAGE

You reported: *"when I try to build a drone at population limit as Zerg it gives me the error Spire
required in addition to the correct error which says spawn more overlords."*

Half of that reproduced immediately and half could not be reproduced at all last session. The probe
found it, and **the cause was not in the error at all — the larva command card was shifted one slot to
the right.** `Set Rally` was emitted first and took the top-left corner, so every morph moved one
place, and Drone was not where the card drew it.

**How to see the fault it caused:** open **Esc → Settings → Hotkeys** and switch to **Grid**. Grid
hotkeys are assigned by *slot*, so with the card shifted, `D` — which every player reads as Drone —
landed on **Scourge**, which needs a Spire. That is where "Requires Spire" came from.

**How to check it now:** Zerg, grid hotkeys on, select a larva, press `D`. You get a Drone. Drive
yourself to the supply cap (stop building Overlords) and press `D` again: you get **"Spawn more
overlords."**, **once**, however many larvae you have selected.

**Where this is hard to see:** with Brood War hotkeys the bug was invisible — the shift only mattered
because grid keys are positional. If you have never used grid hotkeys, turn them on for this one test.

---

## 5. A refused ability says why (item 4, second half)

The bare string `Invalid target.` appeared **seven times** and never once said what a valid target
would have been.

**How to see it:** as Zerg with a full-energy Queen (`the gathering` on for this one), press the
**Spawn Broodlings** key and click, in turn:

- **a Mutalisk or an Overlord** → "Spawn Broodlings cannot target air units."
- **a building** → "Spawn Broodlings cannot target buildings."
- **a Protoss Dragoon or Immortal** → "Spawn Broodlings only works on organic ground units -- not
  robotic ones."

Three different sentences from one ability, each naming the condition that actually failed.

**The audit found an eighth, and it was worse than generic:** cast **Psionic Storm** (Protoss High
Templar) on a spot that is *already burning*. It used to refund the 75 energy and say **nothing at
all**, so the click looked like the game had swallowed it. It says so now.

---

# Group C — the simulation. This is the half that changes how the game plays.

## 6. Creep tumours cost energy, and the Overlord has one (item 2)

*"Creep tumors should cost the queen and overlord energy (overlords should be given 200 energy that
fills over time like the queen)."* Both halves were true. **Measured before the change: one Overlord
with money in the bank planted THIRTY tumours back to back, thirty of thirty, with no refusal at any
point.** It was not merely cheap — the Overlord was not an energy unit at all.

**How to see the pool:** make sure `the gathering` is **off**. Select an **Overlord**. It has a purple
**energy bar** under its health bar, and the panel reads `Energy 50/200` — the same 50 every caster in
the game starts with. Watch it: it fills on its own at the same rate a Queen's does. A full 200 takes
about four and a half minutes.

**How to see the cost:** hover the **Creep Tumour** button. It says **25 energy**. Fly the Overlord
over your creep and plant with `C`: **two tumours, and then it refuses** — 50 energy buys two at 25
each. Wait about thirty seconds and it can plant a third.

**The Queen pays the same price**, which is a change: until this milestone the ability was free
*because* the Overlord had no energy to charge.

**A deliberate side effect worth knowing about:** an Overlord with an energy pool is now a legal
**Feedback** and **EMP** target like any other caster, and Feedback does damage equal to the energy it
burns — a full Overlord is 200 energy against 200 hit points. A Protoss Dark Archon can now one-shot
your Overlords. That is exactly StarCraft II's rule for energy units and it is on the balance list, not
special-cased.

**What the AI does:** it plants too, and it respects the cost. Over three 18-minute games the AI's peak
tumour count was 8, 8 and 6 both before and after — the price paces its creep, it does not starve it.

---

## 7. Tumour range is a limit now (item 3) — TWO FAULTS, AND THE REPORT WAS RIGHT ABOUT BOTH

*"Creep tumors currently have unlimited range and they need to have their range limited or best where
they can spawn additional tumors."*

The fixlist said this was real but for a different reason than reported, and that the half about
seeding additional tumours already worked. **Measuring said otherwise. There were two separate faults
in two different functions, and the half the fixlist said was fine was the one you actually asked
about.**

**Fault one — a caster that can move.** `range` on a point ability means "walk this close and then
cast", so an Overlord answered an out-of-range order by flying there. Measured: ordered to plant **17
tiles** away against a declared range of **3**, it flew 13 tiles and planted.

**Fault two — a tumour is a BUILDING.** A point ability cast by a building resolves immediately and
never reaches the range check at all. Measured: a finished tumour seeded a child **21.4 tiles** away
against a declared range of **9**.

**How to see the first:** select an Overlord sitting over your main, press `C`, and click a creep tile
right across your base — more than three tiles away. It **refuses, stays where it is, and says
"Creep Tumour only reaches 3 tiles -- pick a spot closer in."** Its energy is untouched: a refusal is
free. Then click a tile *next to it* and it plants.

**How to see the second:** let a tumour finish (about ten seconds), select it, press `C`, and click
creep more than nine tiles away — easiest at the far edge of a creep field a few tumours have already
spread. It refuses with the same sentence and the number 9. **It also keeps its one child**: select it
again and click somewhere legal, and it still plants.

**What did NOT change, and should not have:** every other point ability in the game still walks to its
target. Take a **Defiler**, order **Dark Swarm** thirty tiles away, and it walks there and casts. Only
the two tumour abilities carry the new flag.

---

## 8. Zerg move faster on creep (item 5, second half) — THE BIGGEST CHANGE IN THIS MILESTONE

*"All zerg units on creep should have their speed increased just like it is in StarCraft 2 so look up
the exact percentage."*

**There was no creep speed bonus anywhere in the game.** Not weak, not partial — twenty-three cases
measured and every one moved identically on creep and off it.

The numbers are StarCraft II's:

| | on creep |
|---|---|
| most Zerg ground units | **+30%** |
| Locust | **+40%** |
| Sunken / Spore Colony, while uprooted and walking | **+150%** |
| **Drone, Broodling, anything burrowed, anything flying** | **nothing** |

**How to see it:** the clean way is a race. Select **two Zerglings**, put one on creep and one on bare
ground beside the creep edge, and give both a move order the same distance in the same direction. The
one on creep pulls ahead immediately. Or simpler: **right-click a Zergling from your creep out onto
bare ground and watch it cross the edge** — it slows down visibly at the boundary.

**The Drone is the exception to check.** Order a **Drone and a Zergling** across the same stretch of
creep together. Before this milestone they crossed at about the same pace; now the Zergling leaves the
Drone behind, because a 30% faster worker would be a faster mineral line and the request was about
armies crossing their own ground.

**The crawler is the most dramatic one.** Select a **Sunken Colony**, press `U` to uproot it, and walk
it across creep — 2.5 against 1, so it is two and a half times faster on creep than off it. That is
also the only case where the bonus is applied on top of a hard override: any lifted building walks at
a flat 1.

**Two things here are deliberately NOT StarCraft II, and both are on purpose:**

- **The Queen gets nothing.** SC2's Queen is a ground unit that crawls off creep and gets +167% on it.
  **The Queen in this game flies** — she is Brood War's Queen — and she already moves at 6.67, which is
  faster than SC2's on-creep Queen. So the flier rule catches her. Her +167% is recorded in the table
  and is inert; if she is ever made a ground unit it will light up on its own.
- **There is no Changeling in this game.** Its no-bonus entry exists anyway, so that adding one later
  cannot silently hand it the default.

**Where this is invisible from normal play:** the **burrowed** exception. A move order surfaces a
burrowed unit before it walks, so you cannot watch a burrowed unit move at the wrong speed — there is
nothing to watch. It is asserted directly in `test/creepspeed.js` instead.

**This is the largest balance change in either fixlist** and nothing has priced it. A 30% army-wide
movement bonus on your own ground is a different game for Zerg. Play a few Zerg games and say whether
it feels like too much.

---

# Group D — the AI. There is nothing to see, and that is the finding.

## 9. The AI still ignores its own composition table, and now we know why

**Nothing changed in the game and no playtest step will show you anything.** This entry is here so the
absence is on the record rather than looking like an oversight.

The AI ranks what it wants to build correctly and then cannot pay for it, so it buys the cheapest thing
it can afford instead — which is why a hard Zerg fields a Zergling ball that is 68% of its army when
its own table asks for 16%.

Bounding that was tried **four different ways** and every one of them was measured over six 20-minute
games. The strong versions fixed the shape of the army and destroyed the army: Zerg went from 238
supply to 26.5, holding 547 idle minerals, with a composition that was beautifully proportioned and
had nothing in it. The weak version was a no-op — three of the six games came back bit-identical.

The ledger says why in one line: the AI's budget hands the army's top pick whatever is left after six
higher-priority claims, and **that share does not move under any bound — it is funded in full 4% of the
time before and 4% after.** Money the AI declines to spend on cheap units does not become an expensive
unit; it becomes buildings and upgrades, because research runs after production and takes it.

**All of it was reverted**, and the revert was verified rather than assumed: the ledger run at the
reverted tree is byte-identical to the run before any of it. The one thing that would actually fix this
is a change to the AI's spending priorities, it is measured and priced, and it is a balance question
that needs an explicit decision — so it is waiting for one.

---

# What is still gated

**The balance run has not been run and every balance number in `HANDOFF.md` is stale.** This milestone
adds three things it has to price, and the third is the biggest single item on the list:

1. Creep tumours costing 25 energy — creep spreads more slowly now, for both players and the AI.
2. Tumour cast range becoming a real limit — you have to fly an Overlord to the creep edge to extend it.
3. **The 30% creep movement bonus.**

Plus the Overlord becoming a Feedback and EMP target, which is new and unpriced.
