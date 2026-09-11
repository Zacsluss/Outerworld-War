# M17 playtest guide — what the review changed, and how to see each one by hand

`REVIEW-M17.md` is the review: its four lists say what was found, what was fixed, what is open and what
was deliberately left alone. This guide is how to *see* the fixed things in a running game, written to
be used with the game open beside it. Where a change is invisible from normal play it says so and says
what to run instead.

`PLAYTEST-M12.md` to `PLAYTEST-M15.md` are all still true.

---

## Set-up

Start the server with **`PLAY.bat`** (or `node test/serve.js 8765`) and open `http://localhost:8765`.
Unless an item says otherwise: **Play** → one opponent, **Easy**, and start.

Cheats are typed into chat with **`Enter`**: `show me the money`, `power overwhelming`,
`modify the phase variance`, `the gathering` (a toggle; several items below need it **off**).

---

# The quick pass — ten minutes

1. **Click into the Name box on the main menu and press Enter, Backspace, F5.** Nothing happens to the
   game; the field behaves like a text field. Before the review, Enter opened an invisible chat buffer
   that ate every key until Escape.
2. **In a game, press Shift+=.** The view zooms in. Shift+- zooms out. Bare `=` and `-` change the game
   speed. Before, Shift+= sped the game up and nothing zoomed.
3. **Select a Medic, right-click its Heal button (autocast on), heal something, save a replay (menu),
   watch it.** The Medic heals in the replay. Before, the arm never entered the command log and the
   replay played without the heals.
4. **Siege a tank, then right-click a friendly unit.** The tank stays put and the order is dropped.
   Before, it walked to the unit, siege and all.
5. **Fly a Carrier with four Interceptors at a target and kill the first Interceptor out** (or let a
   turret do it). The Carrier keeps launching. Before, it never launched again.

---

# Simulation (build stamp moved: saves and replays from before the review are refused, with the reason)

## 1. The Carrier keeps launching after its first Interceptor dies young

`show me the money`, `modify the phase variance`; build a Carrier with four Interceptors (Protoss), attack
an enemy Missile Turret or a Spore Colony. **Working:** Interceptors keep coming out after the first one
dies. **Before:** one launch, then the Carrier sat with three aboard for the rest of the game.

## 2. A field no longer cures a longer status

Hard to arrange by hand: it needs an Optical Flare (Medic) on a unit that is then Jammed (a jamming
tower's field), or an Ensnare under a Time Warp. Asserted directly in `test/review17.js` section 2 (an
Ensnare of 576 frames survives a ten-frame Time Warp; it used to end with it).

## 3. A sieged tank does not walk on follow, load, repair or gather

Siege a tank (`O`), then **right-click a friendly Marine**. **Working:** the tank stays sieged and still;
the follow order is dropped. Try right-clicking a Dropship (load), an SCV (repair) and a mineral patch:
same. **Before:** it walked there, sieged.

## 4. A cloaked unit below 25 energy can decloak

`the gathering` **off**. Cloak a Ghost (`C`) at 30+ energy, let it drain below 25 (or set it low by
waiting), press `C` again. **Working:** it decloaks; pressing `C` once more says "Not enough energy"
(the way in still costs 25). **Before:** it could not decloak until it regenerated.

## 5. A larva becomes only what a larva can become

Invisible from play — the card only offers legal morphs. It closes a hole for a hand-edited save:
`test/review17.js` section 5 asks `G.larvaMorph(larva, 'scv')` and is refused (it used to make a
Zerg-owned SCV).

## 6. A worker with no hall stops scanning every frame

Invisible from play (a performance fix). Lose your only hall with a worker carrying minerals: it keeps
its return order and resumes when a new hall finishes; it asks for a hall once a second rather than 638
times in ten seconds. Section 6 of the same test.

## 7. Exceptions inside a unit's tick are counted

Invisible: `G.tickErrors` in the console. It is 0 in every gate suite now; a unit or AI that throws is
skipped for the frame, counted, and the game goes on.

## 8. Charon Boosters lengthen the Goliath's air range

Terran, `show me the money`, `modify the phase variance`. Select a Goliath and note where it starts
shooting at an Overlord; research Charon Boosters at the Armory; try again. **Working:** it shoots from
further away (8 tiles). **Before:** the research *shortened* it, from 5 to 3. *This is on the balance
list.*

## 9. Four ability descriptions tell the truth

Hover **Stim** (names Marines, Firebats, Marauders and Reapers), **MULE** (75 seconds), **Blink** (the
Dragoon), and the Arbiter's **Mothership** merge (two Arbiters). Before: two of four named units that do
not exist, one said 90 seconds.

## 10. The AI does not march on the wildlife

**Skirmish** → turn **Derelicts** and **Wildlife** on, hard opponent, `black sheep wall`. Watch the
computer's first attack wave. **Working:** it walks at *your* base. **Before:** it attacked the nearest
derelict on three of three seeds, and counted the grubs as your army.

## 11. An allied AI does not storm you

**Skirmish** → two teams, you and a computer on one team, two computers on the other. Fight next to
your ally's High Templar or Science Vessel. **Working:** its storms and Irradiates land on the enemy,
never on you. **Before:** twenty-six of its spell clauses tested "enemy" by owner alone.

---

# Command log

## 12. Autocast arming is part of the replay

Item 3 of the quick pass. Also try it over LAN: arm a Medic on one client; the other client's Medic
heals too (before, only yours did, and the game desynced at the next hash).

## 13. The ferry route works from the interface

Select a Dropship, press its **Ferry** key, click a far point. **Working:** it shuttles between the two
points picking up idle units. **Before:** the order packed as an empty `ferry` and the ship stayed
idle; only the test could reach the feature, through a back door.

## 14. A malformed save is refused with a sentence

Save (F5), open the file, break the `cmds` list (delete a `c`, or put a later frame before an earlier
one), load it. **Working:** "This save cannot be loaded: command N of its log is malformed." **Before:**
it loaded, threw inside the tick or replayed nothing, in silence.

---

# Interface

## 15. Keys in text fields and on the main menu

Quick pass item 1. Also: with no game running, F5 does nothing (it used to throw).

## 16. Zoom keys

Quick pass item 2. **Esc → Settings → Hotkeys** shows Zoom in as `+` and Zoom out as `_`.

## 17. F8 asks before loading the autosave over a game

In a game, press **F8**. **Working:** a confirmation; "Cancel" leaves your game alone. **Before:** the
game was replaced by the autosave with no warning. The F1 help now lists F2 F4 F6 F7 as camera slots and
F8 as the autosave.

## 18. Tab turns the card page

Select a Starport with a Control Tower (or any unit whose card has a "More 1/2" button), Brood War
hotkeys on. Press **Tab**. **Working:** the page turns. **Before:** Tab was swallowed by subgroup cycling
even with one kind selected. With two kinds selected Tab still cycles the subgroup.

## 19. Jump to last alert includes an ally's ping

Team game with a human ally (LAN): they Alt-click the map; you press the last-alert key (Space by
default). **Working:** the view jumps to their ping. **Before:** only your own alerts counted.

## 20. Network games: one speed, and menus do not freeze peers

LAN game. Press `+` or `-`: "The host sets the speed in a network game." Open the pause menu (F10) on
one client: the other client keeps playing. **Before:** units stepped instead of gliding for the whole
match (the draw pass paced on the wrong speed), and one client's menu froze everyone on "Waiting for
other players".

## 21. The editor draws on its second open

Main menu → **Editor** → close → **Editor** again. **Working:** it draws. **Before:** blank.

## 22. Effects fire once per simulation frame

Watch a Hellion's flame or a Missile Turret's rockets on a fast machine: the same density as on a slow
one. Scorch marks fade over their intended life rather than 2.5× faster. Hard to judge by eye; asserted
in `test/review17ui.js` section 9 (a decal drawn three times in one frame ages 24, not 72).

## 23. A non-square map draws all its rows; the minimap uses the tileset's colours

**Editor**: make a 64×128 map, play it, scroll to the bottom. **Working:** ground all the way down.
**Before:** the lower chunk rows were never drawn. Start a game on an ice or jungle map: the minimap is
white or green, not brown.

## 24. The manual scrolls with the wheel

Press **F3**, scroll the wheel. **Before:** nothing.

---

# Multiplayer (`PLAY.bat` on one machine, two browser tabs, or two machines on the LAN)

## 25. A room code is required over the internet, and no code means the shared room

`PLAY-ONLINE.bat` + a tunnel: open the https link, leave Room blank, press Connect. **Working:** "Type a
room code first". On a LAN (http) a blank room still means the shared LAN room, as before.

## 26. The second game in the LAN room can change its settings

Play a LAN game, leave, connect again, change your race. **Working:** the lobby shows the new race.
**Before:** every setting was refused for the second game.

## 27. A kicked player is told and hears no more

Host kicks a player in the lobby. **Working:** the kicked client sees "The host removed you from the
game" and stops receiving the lobby.

## 28. The things you should NOT be able to do any more (need a modified client or a raw socket)

Order another player's units by sending a command with their `p`; crash the relay with `GET /%`;
download `/.git/HEAD` or a handoff from the game's URL; join a running game under a dropped player's
name while already in it; send a race of `QQ`; claim a 2^40-byte frame; put `<svg/onload>` in your
name. All are refused now and all are in `test/rooms.js` section 9; run it to see each one.

## 29. A silent connection is dropped in 45 seconds

Pull a client's network cable (or suspend the laptop). **Working:** within about 45 seconds the other
players see "dropped; their units stop at …" and the game continues; the dropped player can rejoin.
**Before:** everyone waited on the OS TCP timeout, and the rejoin was refused because the slot was not
marked gone.

---

# What is still gated, and what the review left open

- **The balance run** has not been run. Every number in `HANDOFF.md` is stale, and the review added
  one item to its list: Charon Boosters (8, was an inverted 3).
- **The AI's spending priorities** stay gated; the review added measured findings next to them (the
  micro cadence that exists only for player 0, the dead detector weight, the research building that
  cannot be found after a morph) — see `REVIEW-M17.md` questions 7-10.
- **`test/eightplayer.js` has been red since FIXLIST-M15 C3**, not "passing by 4%": bisected in the
  review, unchanged by any of it, and a decision for you (question 2).

---

# The decisions (second session) — how to see each by hand

Ten questions were answered in `REVIEW-M17.md` section 2 and every one is in the game now.

## 30. Zerg start with a Queen

Start any Zerg game. **Working:** a Queen hovers by the Hatchery with `Energy 50/200`. Press her
**Spawn Larva** key on the Hatchery: ten seconds later it holds three more larvae (item 38 has the rest of
that rule; until the third session it only ever refilled to three). Two casts from her starting energy,
then one every ~33 seconds as she regenerates.
**The AI does the same:** watch a computer Zerg's Hatchery in the first minute (`black sheep wall`) —
the purple inject ring appears within a minute.

## 31. Bunkers fire at the unit's own rate

Terran: put a Marine in a Bunker next to a Marine outside, attack something that does not die. Count
the shots for ten seconds. **Working:** the same number inside and out. **Before:** the bunkered
Marine fired twice as fast.

## 32. The eleven energy upgrades do something

Terran, `show me the money`, `modify the phase variance`: select a Medic, note `Energy 50/200`, research
**Caduceus Reactor** at the Academy. **Working:** the Medic reads `/250` and fills to it. The same for
Moebius (Ghost), Apollo (Wraith), Titan (Science Vessel), Colossus (Battlecruiser), Gamete (Queen),
Metasynaptic (Defiler), Khaydarin Amulet (High Templar), Argus Talisman (Dark Archon), Argus Jewel
(Corsair), Khaydarin Core (Arbiter). **Before:** nothing at all.

## 33. Computer opponents on easy and normal siege, scan, boost and MULE

Play against **two or three** computer opponents on normal and watch the second and third ones
(`black sheep wall`). **Working:** their tanks siege, their Comsats scan, their Queens inject, exactly
like the first opponent's. **Before:** only the first computer player ran its micro on schedule; the
others sieged rarely and never scanned.

## 34. The fog shows what you last saw

Scout an enemy building with a Marine, walk the Marine home, then have a computer ally or the enemy
destroy that building (or `black sheep wall` off, watch, `black sheep wall` on to compare). **Working:**
the building stays drawn in the fog, greyed, until a unit of yours sees the spot again — then it is
gone. **Before:** it vanished the instant it died, wherever you were.

## 35. Room codes, the join limit, and no cheats online

`PLAY-ONLINE.bat`, two clients: type a two-letter room code — **"A room code is at least 4 letters or
digits."** Type `show me the money` into a network game's chat — it is chat, and typing it into the
browser console does nothing on any client. Twenty joins a minute from one machine still work; the
sixty-first is refused for a minute.

## 36. Deterministic maths — invisible, on purpose

Nothing to see. Every game plays a rounding step differently from before this commit (saves and
replays from before are refused). Where it matters: a Windows build and a Mac build, or Chrome and
Firefox, can now play the same lockstep game without drifting into a desync. `node test/dmath.js`
measures it.

## 37. Line endings

Nothing to see in the game. `git status` on a fresh clone is clean on any machine.

---

# The Zerg notes (third session) — how to see each by hand

Open tasks 25, 26 and 27 of `REVIEW-M17.md` (and 23 with them), plus a wedged geyser found on the way.
Saves and replays from before these commits are refused: the stamp moved twice.

## 38. Spawn Larva stacks a Hatchery to twelve larvae

Zerg, `show me the money`. Select the Queen, press **Spawn Larva** (`L`) on the Hatchery, wait ten seconds:
the hall's `Larvae` line on the card goes from 3 to 6. Cast again at 6: 9. Again: 12. Once more at 12:
**"That hatchery cannot hold any more larvae."** and the 25 energy comes back. Hover the button: the text
says three and twelve. **Before:** every cast topped the hall back up to three and never past it. **Still
true, on purpose:** a Hatchery you never inject spawns to three on its own and stops there, exactly as
before — leave one alone for a minute and watch the count sit at 3.

## 39. A cancelled egg goes back to a Hatchery that already holds more than three

With a Hatchery at six or more larvae (item 38), morph one larva into a Drone and cancel the egg at once
(select it, **Escape**). **Working:** the larva is back under the hall and the `Larvae` count is what it
was. **Before:** the 50 minerals came back and the larva died, because a hall "could not" hold a fourth.

## 40. The computer keeps one Queen at every Hatchery

Play against a **normal** computer Zerg, `black sheep wall`, and look at its bases from about minute six (it
needs a Queen's Nest first; the starting Queen covers the main until then). **Working:** each Hatchery, Lair
or Hive has its own Queen hovering beside it and each gets the purple inject ring; a Queen hatched at the
main flies to the new hall she was made for; when the computer's army marches out, the Queens stay behind.
**Before:** one Queen for the whole game, injecting only the two halls within 26 tiles of her, and she left
with the army. Test-only detail: `node test/queens.js --verbose` prints the ten-minute count on the measured
seed (Queens equal to halls from minute nine).

## 41. Larvae come off the fullest Hatchery

Invisible from play by design — it is the computer's choice of larva. `node test/queens.js` section 6:
with two larvae at one hall and nine at another, the computer morphs from the nine. **Before:** the oldest
larva in the game, which drained the oldest hall first while an injected one sat full.

## 42. A geyser no longer dies when a worker inside it is re-ordered

Any race. You cannot select a worker that is inside a Refinery, Extractor or Assimilator, so this is hard to
provoke by hand; `node test/review17.js` section 18 does it directly. **Working:** the worker comes out on
its new order, the next worker goes in, gas keeps arriving. **Before:** the worker never came out, the
building counted it as its occupant for the rest of the game, and no gas was mined there again. The
computer did this to itself whenever it rebalanced gas workers: in the eight-player test game one Zerg's two
Extractors were dead from minute five with three Drones each standing outside, and it banked 3,376 minerals
it had no gas to spend. To see it in play: watch a computer Zerg's Extractors for a few minutes — the geyser
numbers keep falling now.

---

# The open list (fourth session) -- how to see each by hand

The open tasks of `REVIEW-M17.md` section 1, in the order its head gives. Presentation items move no stamp;
the simulation and AI items say so where they do.

## 43. The day/night dial beside the clock (task 1)

**Skirmish Setup** -> map **Nightfall** -> start. **Working:** a second plate beside the "0:02 TERRAN" clock:
a sun, **Day**, "dusk in 1:57" counting down; after dusk it is a moon, **Night**, "dawn in ...". On Lost
Ruins or any other map there is no second plate at all -- the dial is only for a map with a cycle.
**Before:** nothing beside the clock on any map; the dial had shipped in M11 and was never called.

## 44. The selection strip holds every selected unit (task 1)

Any race, `show me the money`, make forty units (or Ctrl+A over a real army) and select them all.
**Working:** every unit has a tile on the console's middle panel -- in a 1400 px window forty full-size tiles
in three rows, each with its own health bar; a narrow window shrinks the tiles; past 48 units the panel
shows one tile per type ("x101 Marine") with a count and a summed health bar and a "130 units, 3 types"
line; a tile that still does not fit is counted in "+N more". Click a type tile: every unit of that type is
selected. Shift-click a unit tile: that unit leaves the selection. **Before:** eighteen tiles, and the
nineteenth unit onward drawn below the bottom of the screen with nothing saying so.

## 45. An uprooted crawler walks out of a gap, and never lands where it is not (task 29)

Zerg, `show me the money`. Build a Spore Colony and, two tiles below it, two Creep Colonies side by side,
leaving a one-tile corridor between them; uproot a Sunken Colony (its **Uproot** key) and walk it into the
corridor against the spore; then right-click creep a dozen tiles the other side of the spore (or press
**Land**, `L`, and click there). **Working:**
it backs out of the corridor, walks round and roots on the tile you chose. **Before:** it ground into the
corner for ten seconds and then appeared on the target tile without having walked there. The second
half is easier to see: wall a creep tile in with colonies on all sides and order a lifted crawler to root
on it. **Working:** it walks up to the wall, gives up, and stands there lifted. **Before:** it rooted
inside the wall. Saves and replays from before this commit are refused (the stamp moved). The eight-player
test game (`node test/eightplayer.js`) reads 19 of 19 for the first time since FIXLIST-M15 C3.

## 46. A computer Zerg with a Hive still researches the Lair's techs (task 5)

Play against a **hard** computer Zerg to the twenty-minute mark, `black sheep wall`, and click its Hive.
**Working:** at some point after the Hive lands, its production slot shows Pneumatized Carapace, Ventral
Sacs, Antennae or Burrow researching (the computer's Overlords get faster and see further). **Before:**
once the Lair had become a Hive none of the four could ever be started by the computer -- the Hive's
slot stayed empty for the rest of the game. Quicker: `node test/review17.js` section 19.

## 47. The computer's Ravens and Disruptors march with the army (task 7)

Play against a **hard** computer Terran (or Protoss) past minute twelve, `black sheep wall`. When its
wave leaves, look for the Raven (Terran) or the Disruptor (Protoss) among the units that go.
**Working:** they travel with the wave and gather at the rally between attacks like the Medics and
Science Vessels do. **Before:** each one stood where it was built for the whole game -- 100/150 and
150/150 that never moved.

## 48. The computer does not double-count the money a Lair or an add-on cost it (task 8)

Invisible from play: it is the AI's private reserve. Within the same think that morphs a Lair (or
builds a Reactor), the money already paid stayed reserved as well, so anything bought later in that
think was refused for a cost the bank had already met. `node test/review17.js` section 19 shows the
reserve falling by the morph's price the moment it is queued. Saves and replays from before this commit
are refused (the stamp moved).

## 49. The computer rebuilds a tech building it has lost (task 30)

Play against a **normal** computer of any race. Around minute six, `black sheep wall`, find one of its
tech buildings that its build order has already passed -- a Zerg Queen's Nest or Hydralisk Den, a Terran
Academy or Factory, a Protoss Cybernetics Core -- and destroy it (`power overwhelming`, a few units, or
`show me the money` and a Ghost's nuke). **Working:** within a minute or two a worker of theirs goes back
and builds the same building again, before the order carries on past it. **Before:** never -- the
computer's order only walked forward, so the building and everything that needed it (the Hive, every
later Queen) were gone for the game. Not rebuilt on purpose: a step the computer gave up on because it
could not be started for 200 seconds (it skips those and does not go back). Quicker:
`node test/review17.js` section 20. Saves and replays from before this commit are refused (the stamp moved).

## 50. A nuke builds when supply is short (task 6)

Terran, `show me the money`, `modify the phase variance`: a Science Facility with a Covert Ops, a Nuclear
Silo on the Command Center, and build Marines until the top bar reads two supply short of your cap (or
exactly at it). Click the Silo, press **N**. **Working:** the Nuclear Missile's progress bar moves and the
warhead is ready 75 seconds later; at two free supply no "Additional supply depots required." appears
for it (at the cap itself that message is right, for the cap). **Before:** the missile was accepted,
sat at 0% for ever, and the game told you to build depots you did not need. Everything else refuses
exactly as it did: a Marine at the cap says "Additional supply depots required.", a Hydralisk at the
cap cannot become a Lurker (it costs one more), `food for thought` still lifts all of it. Saves and
replays from before this commit are refused (the stamp moved).
