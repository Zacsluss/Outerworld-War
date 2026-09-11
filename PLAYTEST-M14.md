# M14 playtest guide — the twenty-one things you reported

Everything in `FIXLIST-M14.md` is done. This guide is how to *see* each one, by hand, in a running
game. It is written to be used with the game open beside it.

Three of the items were not what they looked like, and where that is true this guide says so, because
what you actually see will not match what you expected to see.

`PLAYTEST-M12.md` and `PLAYTEST-M13.md` are both still entirely true.

---

## Set-up

Start the server with **`PLAY.bat`** (or `node test/serve.js 8765`) and open
`http://localhost:8765`.

For most items below, **Play** → one opponent, difficulty **Easy**, and start. Where an item needs
something different — a particular race, a bigger game, the Dust Bowl map — it says so at the top.

Three cheats are worth knowing, typed into chat with **`Enter`**:

```
black sheep wall
```
```
staying alive
```
```
power overwhelming
```

The first reveals the map, the second stops you losing, the third makes you unkillable. Several items
below are far easier to watch as an invulnerable spectator.

---

# The quick pass — ten minutes, one game

If you only have ten minutes, do these five in one Terran game and you will have seen the biggest
changes.

1. **Hover any building in the build menu.** Every one now has a description (item 17).
2. **Click a mineral patch.** The console tells you what is left in it (items 1, 3, 14).
3. **Double-click a Barracks.** Every Barracks on screen is selected (item 2).
4. **Click a Marine near the top of its sprite**, not its feet. It selects (item 7).
5. **Build a Reactor with no Academy.** It refuses, in red, and says why (item 13).

---

# Group A — data

## 1. Every building and unit has a description (item 17)

You reported that the healing and jammer buildings had no description. **Nothing in the game had one**
— not one of the 73 buildings and not one of the 85 units.

**How to see it:** select an SCV, press `B` for the build menu, and **hover any button**. Under the
name and the cost there is now a sentence or two saying what the thing is *for*. Then press `V` for
the advanced page and hover **Aid Station** and **Scrambler Mast** — the two you named.

Then press **`F3`** for the codex and click through the unit list. The same text is under the cost line
on every entry, for all three races and for the neutral wildlife.

**What "working" looks like:** no button anywhere, on any race, shows a name and a price and nothing
else.

---

## 2. The dust storm does not hurt anything (item 11)

**Needs the Dust Bowl map.** Play → Map → **Dust Bowl**.

You reported the storm should be visual only. It was dealing **3 damage a second**, straight to hit
points, ignoring armour and shields.

**How to see it:** park a few Marines in the open, well away from your base, and wait for the warning
("A sandstorm is closing in."). Let the front roll right over them and **watch their health bars**.

**What "working" looks like:** the bars do not move. At all. Not while the front is on them, not after
it has passed. Previously a Marine lost about 22 hit points crossing one front, and the wound scarred
permanently.

---

## 3. The Widow Mine digs in, arms, and only then fires (item 21)

You reported the burrow time should match StarCraft II. It had **no timing at all** — it borrowed the
generic Zerg burrow and could fire the instant it went down.

**How to see it:** build a Factory with a Machine Shop, make a **Widow Mine**, walk it somewhere, and
press `U` to burrow. **Watch the light on the mound.**

- while it digs in and arms it **blinks amber**
- when the weapon is live it goes **steady red**

That is about 2.2 seconds. With the mine selected, the console also reads **"Arming 1.4s"** counting
down, then **"Armed"**.

**The test that matters:** burrow a mine and immediately walk a Marine over it. If you are quick the
Marine walks straight across and lives. Wait for the red light and the next one does not.

**Then research Drilling Claws** at the Machine Shop and do it again — everything happens in about
0.7 seconds instead.

**Deliberately unchanged:** the damage, the blast radius and the reload. You said the current profile
was right — large radius, slow to shoot, explosive — so it was left alone.

---

## 4. The Reactor refuses, out loud (item 13)

You reported it gives no prerequisite error. It had **no prerequisite at all**, so nothing could ever
be refused.

**How to see it:** build a Barracks, wait for it to finish, select it, and press `X` for the Reactor
**before you build an Academy**. A red message appears at the bottom: **"Requires Academy"**. Build the
Academy and try again — it goes up.

**The audit found two more things, and they are worth a minute each:**

- **Select a Barracks that is still under construction** and press `X`. It says *"Barracks is not
  finished."* Try it while the Barracks is training a Marine: *"Barracks is busy."* Lift it off and
  try: *"Land the Barracks first."* **All four of those used to do nothing at all and say nothing** —
  which is almost certainly the "no error" you actually hit.
- Add-on tech no longer leaks onto the parent building — see item 15 below.

---

# Group B — interface

## 5. Minerals and gas: click to inspect, hover to ring (items 1, 3, 14)

This was a **missing feature**, not a broken one: clicks only ever looked at units, and patches are
not units.

**How to see it:**

- **Hover** a mineral patch with nothing standing on it. A **half-transparent green ring** appears
  around it, sized to the patch.
- **Click** it. The console on the left shows **"Mineral Field"**, the amount remaining, the share of
  its original, and whether it is being mined.
- **Click a geyser.** Same, in green: **"Vespene Geyser"** and what is left.
- **Build a Refinery on it and click the Refinery.** The remaining vespene is on the panel, under the
  hit points.

**Two things to check that it does *not* do:** a selected patch cannot be given an order (right-click
somewhere — nothing happens), and it never joins a control group (press `Ctrl+1` with a patch selected,
then `1` — the group is empty).

**Fog:** scroll to a corner of the map you have never explored and try to click a patch there. Nothing.
You cannot inspect what you have not seen.

---

## 6. Double-clicking a building selects all of them (item 2)

**How to see it:** build three Barracks. **Double-click any one of them.** All three are selected — you
can see three portraits in the console. Now press `M` once and a Marine is queued at the shortest
queue, so "select all Barracks, press the unit key once" is two actions.

It has always worked for units; one clause was switching it off for buildings.

---

## 7. Units are easier to click (item 7)

You reported the clickable area is smaller than the visible model. It was — **a median 0.62× the drawn
sprite, and as low as 0.36×**.

**How to see it:** make a **Thor** (Factory + Armory + Machine Shop). Click near the **top of its
head**, not its feet. It selects. Try the same with a **Marine** — click the top of the helmet.

**Where it is most obvious:** a **Colossus**. Its legs are drawn above its own position, and clicking
its body used to miss entirely.

**What must still be true:** clicking into a clump still picks the unit you are pointing at, not the
biggest one nearby. Park a Marine right beside a Thor and click the Marine — you get the Marine.

---

## 8. The defeat screen actually appears (item 8)

**This one was not what it looked like.** The screen existed and worked. The reason you were not seeing
it is that it only ever appeared when **one team was left standing**. In a free-for-all with three or
more players you could be wiped out and the game would simply carry on around you, for ever, with no
screen and no way out but the pause menu.

**How to see it:** Play → **three opponents**, all on **different teams** (a free-for-all), difficulty
**Easy**. Do not use `staying alive`. Let yourself be destroyed.

**What "working" looks like:** the moment your last building dies you get the **DEFEAT** screen with
the stats table, even though three AIs are still fighting each other. It offers:

- **Keep watching** — dismisses it and lets you spectate
- **Restart this game** — *new*; starts the same game again, same map, same seed, same opponents
- **Save replay**
- **Return to main menu**

**Check the restart properly:** note the seed in the console before you die (bottom left, "Seed N"),
press **Restart this game**, and check it is the same number and the same map. It is the same game, not
a similar one.

Win a 1v1 and you get the same screen saying **VICTORY**, with **Continue playing** instead of Keep
watching, and the same Restart.

---

## 9. The Starport, the add-on tech, and the dead page button (item 15)

**These were one bug, not two.**

**How to see the old symptom is gone:** build a **Starport** and a **Control Tower**. Select the
Starport. Its card now shows **only what it builds** — ten aircraft, Set Rally, Lift Off. **Apollo
Reactor and Cloaking Field are not on it.**

Now **click the Control Tower itself** (it is a building with its own footprint, just to the right of
the Starport). *Its* card has Cloaking Field and Apollo Reactor.

**The "More 1/2" button:** it is gone from the Starport, because with the add-on tech no longer copied
onto the parent the card fits in twelve slots. That is the same cause — the leak was what pushed the
card past twelve, and the page button was being drawn **on top of the last real button**, so pressing
it pressed Apollo Reactor instead of turning the page.

**Where this changes how you play:** Scanner Sweep is now on the **Comsat Station**, and building a
nuke is on the **Nuclear Silo**, not on the Command Center. That is where Brood War puts them.

---

## 10. The dust storm has soft edges (item 10)

**Needs Dust Bowl.** Do item 2 above and this one at the same time.

**How to see it:** put the camera in the storm's path, a long way from your base, and watch a whole
front arrive and leave.

**What "working" looks like:**

- the leading edge **fades in over about a tile and a half** rather than switching on at a tile
  boundary
- the bright rim on the face of the wall is a **glow with no edge you can point at**, not a drawn line
- the whole storm **gathers as it arrives and thins as it leaves** — at the start and the end of a
  sweep it is barely there, and it is strongest in the middle

The last one is the most visible change. Watch one whole sweep from a fixed camera.

---

# Group C — simulation

## 11. You cannot build in the black (item 9)

**How to see it:** at the start of a game, take an SCV, press `B`, choose **Supply Depot**, and move
the placement ghost out into unexplored ground.

**What "working" looks like:** the ghost is **red** before you click, and carries the message
**"You can't build here until it is explored"**. Click anyway and the same message appears in red at
the bottom of the screen. You are not charged.

**What must still work:** ground you have scouted and then lost sight of is still **fine to build on** —
those are different states. Walk a unit out, come back, and build where it went.

**And a footprint that straddles the line is refused**, deliberately. Push the ghost so half of it is
on explored ground and half in the black: still red.

---

## 12. The Sensor Tower reports movement instead of lighting up the map (item 12)

**How to see it:** Terran. Build an **Engineering Bay** and then a **Sensor Tower** somewhere between
you and the enemy. Then watch that part of the map.

**What "working" looks like:**

- the ground around the tower **stays dark**. It reveals nothing; the fog is not lifted.
- an enemy unit **moving** inside its radius appears as a **hollow amber ring** — on the world and on
  the minimap
- the blip **disappears the moment that unit stops**
- you cannot click it, it has no health bar, and it does not tell you what it is

**The thing to try:** walk one of your own units out to where a blip is and look at what was making it.
That is the only way to find out what it was — which is the point.

Stationary and burrowed things make no contact at all, so sitting still is a real answer to it.

---

## 13. The Queen plants creep tumours — and so does the Overlord (item 5)

**This was not what it looked like.** Tumours were never missing: they came from the **Overlord**. What
was true is that the Queen had no tumour ability at all.

**How to see it:** Zerg. Build a Spawning Pool, a Lair and a Queen's Nest, then a **Queen**. Select her.
Her card now shows **six** abilities: Spawn Larva, **Creep Tumour**, Parasite, Ensnare, Spawn
Broodlings and Infest Command Center.

Press **`C`** and click somewhere on your creep. A tumour goes down.

**Check the Overlord still has it:** select an Overlord, press `C`, same thing. Both, on purpose.

**While you are there — item 4, Spawn Larva.** Select the Queen, press `L`, click a hatchery. About ten
seconds later three larvae appear. It already worked; this is the hand-check you asked for.

---

## 14. The Cyclone fires while moving (item 19)

**How to see it:** build a Factory with a Machine Shop, make a **Cyclone** and a **Goliath**, and
right-click-drag or attack-move (`A` then click) both of them **past** an enemy unit — somewhere the
target is off to the side of the route, not standing in the middle of it.

**What "working" looks like:** the **Goliath stops dead** the moment the enemy is in range and stands
there shooting. The **Cyclone keeps walking**, shooting as it goes, and carries on to where you sent it.

**Deliberately unchanged:** its damage, range and reload. Firing on the move is a mobility change only.
Note that it gets *fewer* shots in than the Goliath, because it walks out of range — that is the price
of the mobility, not a bug.

---

## 15. The Hellion's flame (item 20)

**This was not what it looked like, and it is the clearest example of the three.** You reported the
Hellion's shot should hit everything in its path. **It already did** — one Hellion firing into a row
of five hits all five. What was wrong is that it was **drawing the Lurker's subterranean spines**, so a
working weapon looked like somebody else's.

**How to see it:** make a **Hellion** and fire it into a line of enemy units. It now draws an **orange
flame cone**, widening away from the muzzle.

**Two other things were fixed in the same place:**

- the flame used to reach **six tiles when the weapon says five**. It now stops exactly at its range.
- if you have a Lurker handy, fire one for comparison: it still draws **violet spines**, still reaches
  six tiles, and is completely unchanged. Two weapons, one mechanic, two appearances.

---

## 16. The Thor (item 18)

**This was not what it looked like either.** Thors do not walk onto buildings — no ground unit in the
game ever ends up standing inside a footprint. What actually happened is that a Thor is **forty pixels
across** and the pathfinder was finding it routes through **thirty-two pixel gaps**, so it would set
off, grind against the corner and never arrive. That reads as stuck.

**How to see it:** wall a line of Supply Depots across a corridor leaving a **one-tile gap**, and a
second gap **three tiles wide** further along. Send a **Marine** and a **Thor** to the far side.

**What "working" looks like:** the Marine takes the near gap. The **Thor walks past it and goes round
to the wide one**, and arrives. Before this it would head for the near gap and never get there.

Only the Thor, the Ultralisk, the Reaver and the wild Carrion Maw are affected — everything narrower
paths exactly as it always did.

---

## 17. Freehand formation shapes (item 16)

**How to see it:** select eight or ten units. **Hold the right mouse button and draw a curve** — an
arc, an S, a circle — then release.

**What "working" looks like:** while you are dragging, the **preview follows your stroke**, with one
pip per selected unit spaced evenly along it, and the label reads **"10 on the curve"**. On release the
units walk into that shape.

**What must still be true:** a **straight** drag behaves exactly as it always did — the label still says
"in line". A drag with a shake in it is still a straight drag; it takes about two-thirds of a tile of
deliberate bend before it counts as a curve.

---

# Group D — the AI

## 18. What an attack wave walks at (item 6)

**This is the hardest item in the list to see by hand, and the honest answer is that you mostly
cannot.** One wave is one sample; the change is worth about fifteen percentage points across forty
of them. If you watch one game and the wave hits an expansion, that tells you nothing — it does that
before and after. So there are two ways to do this, and the second is the real one.

**The impression, by hand.** Play → one opponent, **Hard**, and type `black sheep wall` and
`power overwhelming`. Now you can watch the whole map and cannot be killed. Let it run past the
fifteen-minute mark and watch where the AI's attack waves go. What you are looking for:

- when a wave arrives at one of your bases, does it **stay there** and work through the buildings, or
  does it kill one thing and immediately walk off to the next-nearest building somewhere else? It
  should stay. That is the clearest single thing to watch for, and it is the part of this change you
  can actually see in one game.
- **build a second and third base, and put your production at the main.** The AI now weighs a base by
  the **production standing around it**, not by how near it is. A bare expansion with nothing but a
  hall is worth much less to it than your main with five buildings round it.
- put a few turrets or cannons at one base and none at another. It should prefer the **soft** one —
  but if the defended one is the better target it will now come anyway. Before, three defenders were
  effectively a veto.

**What must still be true:** waves still **retreat**. That half already worked and was deliberately
not touched. A wave that loses a fifth of its number, or walks into something clearly bigger, turns
around and regroups. If you see waves fighting to the last unit, something is wrong.

**The honest version, and what the numbers actually say.** The measurement is in the commit message
and in `FIXLIST-M14.md`; forty waves before, forty-six after, in nine games each:

| | before | after |
|---|---|---|
| waves that ever targeted your main | 5% | **20% got within 8 tiles of it** |
| waves whose FIRST target was your main | **0%** | **0%** |
| median closest approach to your main | 33 tiles | 31 tiles |

**So: it raids less and commits more, but it still does not march on your main.** The first thing a
wave picks is still never the main, and the typical wave still turns around about thirty tiles short.
If you were hoping to see the AI form up and walk at your front door, **it does not do that yet** —
that needs the wave to be sized against what it is walking into, which is a separate change and is
listed as next work in `HANDOFF-M15.md`. This item made the target selection sane; it did not make
the AI aggressive.

---

## 19. Queens already had Spawn Larva (item 4)

**No code changed for this one.** It was a question rather than a bug, and the answer is yes.

**How to check:** Play as **Zerg**. Build a Spawning Pool, then a Queen from the Hatchery. Select the
Queen and look at the command card — **Spawn Larva** is there, along with Creep Tumour, Parasite,
Ensnare, Spawn Broodling and Infest. Click Spawn Larva, then click your Hatchery.

**What "working" looks like:** the Hatchery gets an egg icon and a countdown, and when it finishes,
three extra larvae appear at it. This was verified by hand in a running game, not just read out of
the data file.

---

# What is NOT in this milestone

**The balance run has not been done.** `test/balance.js` and `test/proxy.js` are gated on your explicit
instruction and were not run. Several things in this list are balance-relevant and are deliberately
left for it to price:

- the **Reactor now requires an Academy** (item 13). Before, a 50/50 add-on doubled your cheapest
  production line the moment your first Barracks finished. This is the one change here most likely to
  matter to how the game plays.
- the Widow Mine's arming delay, and **Drilling Claws**, which is a new research the AI will now buy
- the Cyclone firing on the move
- the Sensor Tower being early warning rather than vision
- clearance pathing for the four widest units
- **how the AI picks what to attack** (item 6). The weights are new and unpriced.

Every balance number in `HANDOFF.md` was already stale before this session and is staler now.
