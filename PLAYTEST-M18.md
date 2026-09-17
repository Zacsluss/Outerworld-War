# PLAYTEST — M18

Continues `PLAYTEST-M17.md`, whose items run to 63. The numbering carries straight on. `TODO-M18.md` is
the open list this work comes from; each item below names the task it closes.

Everything here is reachable from the front menu with no flags, unless the item says otherwise.

**Recording a playtest (ninth session).** Run `node tools/playtest-listen.js` (or the `playtest` entry in
`.claude/launch.json`) and play at **http://127.0.0.1:8870**. It serves the last commit -- not work in progress -- with the
relay beside it, from a fresh origin (so the first-launch name prompt shows and your normal game's settings are
untouched). A **REC · NOTE** pill at the top of the page takes a sentence (and, in a game, a screenshot) whenever
something looks wrong. Everything goes to `.claude/review/playtest/<time>/` on this machine only: every screen, click,
key (not typed text), setting, lobby message, error, a five-second summary of the game, each game's replay, notes, and
the right-click gathering measurement of item 93. Say "done" and the assistant reads it.

---

## 64. The multiplayer lobby is finished, and it is shaped like StarCraft II's

*(TODO-M18 items 1, 10, 13 — "AI settings cannot be changed in the multiplayer lobby" and "finish the
lobby, self-contained, in the shape of StarCraft II's".)*

**How to reach it.** Run `PLAY.bat` (or `node test/serve.js 8899`), open the page, **MULTIPLAYER**,
**CONNECT**, then **HOST GAME**. You are now in the lobby. Everything below is on that one screen.

**What to look for, one thing at a time:**

1. **The screen is two columns.** Team boxes on the left, a **GAME SETTINGS** panel on the right. It used
   to be teams, then a Map row, then a Speed row, stacked.
2. **Press `+ ADD A.I.` in Team 2.** The new row is not the words "AI, normal" any more — it is four
   dropdowns: **race, difficulty, play style, team**, plus a red ✕ to remove the slot. Set one to
   Protoss / Hard / **Rusher**. Add a second and make it Zerg / Easy / **Turtle**.
   *The play styles are the same five the Skirmish screen offers, read from the same table.*
3. **Press `+ ADD A.I.` again.** The new slot copies the last one's race, difficulty and style, so filling
   a lobby with four hard rushers is four clicks and not twelve.
4. **The colour squares are real.** The little square at the left of each row is the colour that slot will
   play in — red, blue, teal, purple, in the order the rows are listed. You cannot choose it; see "what
   was deliberately left out" below.
5. **The map preview.** The panel draws the map: the big coloured dots are the **start positions**, one per
   seat, in the seats' own colours, and the small grey dots are the expansions. Change **Map** to Twilight
   Valley and watch it redraw as a two-start map, then to Blood Pit for a four-start one. *This is the real
   layout, not a picture — the dots are where the halls actually go.*
6. **Privacy.** The bottom bar has **MAKE PRIVATE**. Press it and the Privacy row changes to
   "Private — code only". Have someone else CONNECT on another machine (or another browser window): your
   game is **gone from their list**, but the **code still works** — it never changed. Press **MAKE PUBLIC**
   and it reappears in their list.
7. **The bottom bar reads READY / START GAME / MAKE PRIVATE / QUIT**, the shape of the screenshots. QUIT is
   the old LEAVE.
8. **Start the game and check the AI really got what you set.** After it starts, press F10 → nothing shows
   the styles, so instead: an AI you set to **Rusher** attacks noticeably earlier than one set to
   **Turtle**, and a **Hard** one thinks more often than an **Easy** one. If you want it proved rather than
   felt, open the browser console and run
   `G.players.map(p => p.name + '/' + p.race + '/' + (p.ai ? p.ai.diff + '/' + p.ai.style : 'human'))`
   — it prints `Computer 0/P/hard/rusher` for the slot above. *(This is the one mechanic here that is
   invisible from normal play in under ten minutes; the console line is the honest way to see it.)*

**What a guest sees.** Join from a second window. You get your own race and team dropdowns and nobody
else's; the AI rows show their settings **as text**, not dropdowns; there is no START and no privacy
button. Only the host configures the game.

**What was deliberately left out, and why** — the note under the settings panel says all of this on
screen, so a player is never left wondering:
- **Handicap.** It scales a player's income, which is a simulation change, and every balance number in
  this project is gated behind an explicit instruction. Left out rather than drawn dead.
- **Category, Mode, Game Duration.** Nothing in the simulation honours them.
- **Locked Alliances.** Shown as a fact, not a switch: teams are fixed when the game starts and there is
  no diplomacy, so a switch would have nothing to turn off.
- **Choosing your colour.** The colour is your seat's. Making it choosable means reading a colour back in
  `G.init` or in `Player`'s constructor — both stamped files — and that would move the build stamp and
  refuse every existing save and replay, for paint.
- **A map author line.** Nothing in `MAP_LAYOUTS` records one, and inventing one would be a lie.

---

## 65. A 5-4-3-2-1 countdown before a network game unlocks

*(TODO-M18 item 12.)*

**How to reach it.** In the lobby above, press **START GAME**.

**What to look for:**

1. **The game does not start.** A panel appears: **"THE GAME STARTS IN  5"**, then 4, 3, 2, 1 — one a
   second — and only then does the game load.
2. **START GAME is replaced by CANCEL** while it counts (for the host). Press CANCEL at 3 and you are back
   in the lobby with **"Player cancelled the start."** under the teams, and every setting editable again.
3. **Nothing can change while it counts.** Try the Map or Speed dropdown during the count: the relay
   refuses it and the value snaps back. Try `+ ADD A.I.`: nothing is added. This is deliberate — the
   player list the game is built from must not move under the countdown.
4. **Nobody can join mid-count.** From a second window, click the game in the list while it is counting:
   you are refused with "Game already in progress".
5. **Someone leaving cancels it.** Start the count with two humans in the lobby and have the second one
   close their window (or press QUIT) at "3". The count stops and everyone is told
   **"<name> disconnected, so the start was cancelled."** A count that reached zero with a slot that had
   walked out would build a different player list on each client.
6. **The relay owns the clock.** Two machines counting show the same digit at the same moment, because
   each number is a message from the server, not a local timer. You can see this without a second machine:
   in the console, `Net.count` only ever changes when a message arrives.

**Turning it off.** Start the relay with `BW_COUNTDOWN=0` and START starts the game immediately, exactly
as it did before. `BW_COUNTDOWN=10` is the maximum. The two socket suites (`test/net.js`,
`test/net_many.js`) set it to 0 because they test lockstep, not menus.

---

## 66. The HUD is twice the size

*(TODO-M18 item 5.)*

**How to reach it.** Start any game — SINGLE PLAYER → START GAME is enough. The console is the whole
bottom band.

**What to look for:**

1. **It is simply twice as big.** The minimap, the unit panel, the selection tiles, the command card and
   its labels, the resource bar and clock at the top — all of it. On a 1920x1080 window the band goes
   from 196 px to 392; on 2560x1440, the same. Before this, *every* window from 1366x768 upwards got the
   same 196 px band, which is why it read smaller the better your monitor was: 26% of a 720p screen, 18%
   of 1080p, 13.6% of 1440p, 9.1% of 4K. That was measured before anything was changed, and the cause was
   the clamp *ceiling* on the band's height, not the 26% fraction — the fraction never got a chance to
   apply above a 754 px window.
2. **The command card is readable.** "Build Advanced" fits on its button instead of being squeezed.
   Hover a button: the tooltip is bigger too.
3. **Everything still clicks where it looks.** This is the part worth actually testing, because it is
   what a scaled HUD usually gets wrong:
   - Click a command card button — it does what its label says.
   - Click a corner of the minimap — the camera jumps there, and the white viewport box is where you
     clicked.
   - Select forty units (drag a box over your workers plus some marines), then click one of the little
     portraits in the selection strip — the selection narrows to that one unit. Shift-click one to drop
     it. All forty portraits are on the plate; none is drawn below the bottom of the screen.
   - Right-click a card button with an autocastable ability selected — it still arms.
4. **A short window gets as much of the doubling as fits.** Drag the window down to about 720 px tall:
   the band takes 42% of the height and no more, and everything inside shrinks to match rather than being
   drawn off the bottom. Shrink it further, below about 330 px tall, and the console goes back to exactly
   the size it has always been.
5. **The icons are sharp, not stretched.** Compare a command card icon with the unit it builds. Icons are
   redrawn at the size they are shown at rather than blown up from the old small ones.

**Where the knob is.** `HUD_SCALE` at the top of [js/ui.js](js/ui.js) — one number. Set it to `1` and the
HUD is exactly what it was; `1.5` for something in between; `3` if you want it larger still (the 42%
ceiling will hold it back on anything but a tall window). `HUD_MAX_FRAC` beside it is that ceiling.

**What did NOT change, deliberately:**
- **The mouse cursor.** It is a pointer, not console furniture, and a doubled cursor would sit in the
  wrong place as well as look wrong.
- **The pause menu (F10), the help overlay (F1) and the codex.** They are dialogs drawn at their own
  size, not part of the console band the task named. The pause menu was already recorded as un-restyled
  in `HANDOFF-M17.md`.
- **The world.** Zoom is still yours (mouse wheel); the HUD taking more of the screen means the viewport
  is shorter, and the camera clamp follows it automatically.

---

## 67. A Queen or Overlord walks into range to plant a creep tumour

*(TODO-M18 item 3.)*

**How to reach it.** Skirmish as **Zerg** (SINGLE PLAYER → SKIRMISH SETUP → race Zerg → START). Build a
Spawning Pool and a Queen, or just select one of your starting **Overlords** — both have the ability.
Select the caster, press **C** (Creep Tumour), and click a legal creep tile **well out of range**.

**What to look for:**

1. **It walks there and plants it.** Before, you got "Creep Tumour only reaches 3 tiles — pick a spot
   closer in." and nothing happened. Now the caster moves off, stops as soon as the spot is within its
   3 tiles, and plants.
2. **It stops at the range, it does not walk onto the spot.** Watch where it ends up: about three tiles
   short. The declared range still means something — it is the *cast* range, and the walk is what gets
   you there.
3. **The walk is bounded at 36 tiles.** Click a creep tile most of the way across the map and you get
   **"That is too far to walk for Creep Tumour — 36 tiles is as far as it will go."** and the caster does
   not move. That number is measured, not picked: on the three shipped maps your nearest other base is
   18, 31 or 34 tiles away (so a real creep line always fits inside the budget) and the nearest *enemy*
   start is 100 to 142 (so a misclick can never send a Queen into someone else's main).
4. **A refusal is still free.** Check the caster's energy after a refusal — the 25 is still there.
5. **A tumour spreading creep by itself is unchanged.** Select a finished creep tumour, press **C**
   (Spread Creep), click past its 9 tiles: it still refuses with "only reaches 9 tiles". A building
   cannot walk anywhere, so its range really is its limit — that half was right and was left alone.
6. **Every other spell is untouched.** A Defiler ordered to Dark Swarm thirty tiles away still walks
   thirty tiles and casts, as it always did. Only the two tumour abilities have a bound at all.

**Where the knob is.** `CAST_APPROACH` at the top of [js/abilities.js](js/abilities.js), in tiles, with
the measurement written beside it.

**One thing this quietly fixed.** The computer's tumour budget counted the tumours that *exist*. That was
enough while an out-of-range order was refused outright — an order that had not landed never would — but
once the caster walks in and plants later, two Overlords could each see seven tumours and each plant, and
a game peaked at **nine** against a cap of eight. The budget counts orders in flight now. You would only
ever see this as "the Zerg AI has slightly too much creep"; it is pinned in `test/tumour.js`.

---

## 68. Research that gets stuck — NOT reproduced, and here is everything that was ruled out

*(TODO-M18 item 4. This entry is the record of a hunt, not a fix. One real fault was found on the way and
is item 69. **Ninth session: the game now watches for this itself and says what it finds -- item 99.**)*

**What was asked.** "A research or upgrade begins and never finishes." Never reproduced, so the brief was
to write a probe first and let it name the case rather than guess at one.

**What was built.** Two probes, both kept in `tools/` and both re-runnable:

- `node tools/stall-probe.js --minutes=25 --seeds=3,7,11` — plays three 25-minute
  six-player games with hard AIs of all three races and reports every production slot whose progress
  stops advancing for more than ten seconds, with the state of the building at that moment.
- `node tools/stall-scenes.js` — eleven directed scenes that each *create* a candidate cause on
  a building that is mid-research and ask whether the research comes back. Every scene asserts its own
  setup, because the first version had four scenes that silently did nothing and reported "ok".

**The result: the reported stall did not happen.** 75 minutes of AI games produced 25 stalls over ten
seconds. Every one was the rules working — a unit waiting on supply, a building waiting for its add-on to
finish, a Protoss building with no power — except two, and those two were a different fault (item 69).

**What is now ruled out, with the reason:**

| candidate | verdict |
|---|---|
| a **lifted** building | **impossible.** `G.liftBuilding` refuses while anything is in the queue, so you cannot lift a building that is researching. |
| a **morphed** building (Lair/Hive, Greater Spire) | **impossible.** `G.queueMorph` refuses while anything is in the queue. Driven in scenes 4 and 5: the morph is declined and the research finishes. |
| a **killed** building | **works.** The player's reservation is cleared, and the research can be started again on a rebuilt one. Scenes 8 and 9. |
| a destroyed **add-on** | **works.** Scene 10. |
| a **cancelled and requeued** slot | **works.** Scene 7. |
| an **unpowered** Protoss building | **freezes while dark, resumes when a new pylon goes up.** Scene 11. That is by design. |
| a building that **changes owner** | **would leak** — the old owner keeps the reservation for ever and is silently refused if they ask again — **but nothing in the game can do it.** Mind Control explicitly refuses buildings, Infest takes a Command Center (which researches nothing), and capturing a derelict takes a neutral building nobody was researching in. Scene 6 proves the leak by forcing the owner change by hand; it is a hole with no door to it today. |

**If it happens to you again**, the thing that would settle it in one line: open the browser console
during the game and run

```
G.players[G.human].researching
```

If it lists something you are *not* currently researching, that is the leak above and the door it came
through is worth knowing. If the building still shows the bar and the bar is not moving, run
`UI.selection[0].prod` and say what the building is, what is in the queue, and whether it is lifted,
unpowered or waiting on an add-on.

---

## 69. A unit cannot morph while it is riding in a transport

*(Found by TODO-M18 item 4's probe. It is not the research stall that was reported — see item 68 — but it
is a production slot that stops advancing, which is what the probe was told to look for.)*

**What was wrong.** Load a Zergling into an Overlord and morph it into a Baneling and the cocoon sat at
zero progress for as long as the ride lasted: the unit was out of the game and the 25/25 was spent. The
simulation stops ticking anything inside a transport before it ever reaches the code that develops an
egg. The computer did this to itself — it picked whichever Zergling came first, including one that was
loaded — and, having been refused nothing, it would pick the same one again every think.

**How to see the fix by hand.** Skirmish as Zerg. Build a Spawning Pool, research **Ventral Sacs** at the
Lair so Overlords can carry, get some Zerglings and an Overlord, load a Zergling (select the Overlord,
press **L** or right-click the Zergling), then select the loaded Zergling from the Overlord's cargo row
in the console and press **B** for Baneling.

- **It refuses,** and says "A unit cannot morph while it is inside a transport."
- **Nothing is charged** — check your minerals and gas before and after.
- **Unload it and press B again** and it morphs normally: the egg develops and a Baneling hatches.

This is what Brood War and StarCraft II both do, and the reason it is refused rather than made to work is
that an egg developing inside a transport raises questions about supply and about what happens when the
transport dies that nothing else in this game has an answer for.

**Where it was measured.** `.claude/review/stall-probe.js`, seed 7, 25 minutes, six hard AIs: two baneling
cocoons frozen at progress 0 inside an Overlord for 240+ frames each. Pinned in `test/abilities20.js`.

---

## 70. Workers stop when their mineral line runs out

*(TODO-M18 item 6 — "when drones finish the minerals in an area, they go to the next entire mineral area;
in SC2, once the area is out, they stop unless you command them to go to another area's patch.")*

**How to reach it.** You need a mined-out base, which takes a while honestly. Two ways:

- **The quick way.** Start any skirmish, open the browser console and run
  `for (const r of G.map.bases[0].minerals) r.amount = 0;`
  That empties your main's whole mineral line in one go.
- **The slow way.** Play until your main runs dry. On Lost Ruins that is about 11,900 minerals.

**What to look for:**

1. **They stop.** Every worker on that line finishes what it is carrying, delivers it, and goes **idle**
   at the base. Before this, all twelve of them set off for the natural 31 tiles away on their own and
   each walked about **280 tiles in ninety seconds**, shuttling minerals back past a hall they had no
   reason to stand at. That was measured, and it is the behaviour that was replaced.
2. **Nothing on screen used to say the base was finished.** Now it does, because idle workers are
   something the game already tells you about — press **,** (comma) to jump to an idle worker.
3. **One patch running out does NOT stop them.** Empty a single patch instead
   (`G.map.bases[0].minerals[0].amount = 0`) and the worker on it moves to another patch **on the same
   line**, exactly as before. Only the whole line running out stops anyone.
4. **An order still moves them.** Select the idle workers and right-click a patch at another base: they
   go, and they keep mining there. That is the whole of "unless you command them".
5. **The computer is unaffected.** A computer player whose main runs dry still picks its own workers up
   and moves them — it re-tasks anything idle on its own schedule, which is a deliberate decision rather
   than a worker wandering off. Watch a long skirmish and the AI still expands and keeps mining.

**Gas is deliberately unchanged.** A refinery that is destroyed or exhausted still sends its workers to
another of your refineries. A refinery is a building, not a line, and there is no "same area" to stay in.

**Where it lives.** `G.nextPatchInBase` in [js/game.js](js/game.js), and the two places
[js/sim.js](js/sim.js) calls it — the gather tick and the moment a worker finishes a delivery. "The same
area" needed no new idea: the map already records which patches belong to which base.

---

## 72. The economy runs at StarCraft II's pace — and the computer is passive until it is rebalanced

*(TODO-M18 7a, approved by the user: "I understand it broke AI but we can rebalance later when I
confirm." **7b, the rebalance, is gated and has not started.** Ninth session: queue item G made Terran and Protoss
computers attack again -- item 100. The Zerg computer is still passive.)*

**What changed.** A worker spends 190 frames inside a mineral patch instead of 75, and 94 inside a geyser
instead of 37. Gas moved by the same factor, so the ratio of gas to minerals is exactly what it was.

**How to see it by hand.** Start any skirmish and watch the mineral counter with your starting workers.

- **Income is about half.** Measured on a saturated line: **49.8 minerals per worker per minute**, where it
  was 99.8. That is 1.21 times StarCraft II's rate, against 2.4 times before.
- **A worker stands in the patch visibly longer** — the mining animation runs for about eight seconds
  where it ran for three.
- **Your first Barracks, Gateway or Spawning Pool comes noticeably later**, and so does everything after it.

**What you WILL notice, and it is expected: the computer barely attacks.** Its build orders and the army
size at which it commits a wave were tuned for the old income. Measured: in ten minutes on the test seeds,
*no* computer opponent of any style mounts a first wave. Two gate suites are red for exactly this reason
(`aistyles`, `queens`) and they turn green again when the AI is rebalanced. That work is TODO-M18 **7b**, and
it needs you to say go — `test/balance.js` and `test/proxy.js` are its instruments and neither may be run
without that.

**If you want the old pace back**, `const MINE_TIME = 190, GAS_TIME = 94` near the top of
[js/sim.js](js/sim.js) — set it to 75 and 37. Saves and replays made at one pace will not load at the other;
the build stamp refuses them, which is its job.

---

# The seventh session

The user's ten-item list after playing the sixth session's build. Items 73 onward.

---

## 73. The HUD is 1.4 times its old size, not 2

**How to reach it.** Start any game.

**What to look for.** The console band is about 30% smaller than the sixth session left it: 274 px tall on a
1080p or 1440p window (it was 392, and 196 before that), the minimap 243 px across, a command card button
74 px. Everything still clicks where it is drawn — press a card button, click the minimap, click a
selection portrait.

**The knob.** `HUD_SCALE` near the top of [js/ui.js](js/ui.js). It is `1.4` now; `1` is the original size.

---

## 74. The minimap is black until your units uncover it

**How to reach it.** Start any game and look at the minimap before moving anything.

**What to look for.**
- **Everything you have not seen is black.** Only the circle of ground around your starting base shows.
  Before this, the terrain of every unexplored base showed through at about 15% — the dim shapes in the
  screenshot — which also let you read the map's layout without scouting it.
- **Send a worker across the map.** The minimap reveals behind it as it goes. Ground it has seen and left
  stays visible but dimmed; ground in sight now is at full brightness.

---

## 75. The mouse is the real cursor again, still wearing the game's art

**How to reach it.** Start any game and move the mouse quickly in circles.

**What to look for.**
- **It keeps up with your hand.** The cursor used to be *painted onto the game canvas* every frame with the
  real one hidden, which puts it at least a frame behind the pointer and further behind whenever a busy
  fight slows a frame down. It is now the operating system's cursor, drawn by the browser straight from
  the pointer, so the game's frame rate cannot delay it.
- **It still looks the same.** The green-and-white arrow; green corner brackets over your own unit, red over
  an enemy; press **A** and the reticle is red, press **M** and it is green; hover the console and it is the
  arrow again.
- On a scaled display (125%/150%) it is drawn from a double-resolution image, so it stays sharp.

**One thing that is different by design:** because it is the real cursor, a screenshot tool that hides the
cursor will hide it — the painted one used to appear in screenshots.

---

## 76. Minerals: measured, and at StarCraft II's pace

*(The user asked: "Minerals do not seem to have changed. They are still being gathered about 50% too fast.
Did you actually change anything on mineral harvesting systems?")*

**Yes — and the running game was measured to prove it.** A worker now spends 190 frames inside a patch where
it spent 75. Measured in the page, in real time, at the default speed ("Fastest"): the simulation runs
exactly 24 frames a second, and four workers brought in **48 minerals each per real minute**. It was 99.8.

**Against StarCraft II.** Liquipedia gives Legacy of the Void's rate as 61.2 minerals per worker per minute on
a near patch and 53.6 on a far one, in real time. So the game now mines **slightly slower** than StarCraft
II, not faster. (The "SC2 is about 41" figure the sixth session started from turned out to be Heart of the
Swarm's *game-time* number; in real time it is about 1.4 times that.)

**Why it probably still felt fast.** About "50% too fast" is almost exactly what the *old* rate was against
StarCraft II, so the page you played was most likely loaded before the change. **To check the one you are
running:** open the browser console (F12) during a game and type `MINE_TIME` — it should say **190**. If it
says 75, reload the page (Ctrl+F5).

**Also:** the desktop app's bundled copy (`desktop/dist`) was a day old and still had the old rate. It has
been refreshed; an installer built from it will match the browser version.

**One thing that can still make income *feel* quicker than StarCraft II** even at the same rate: a worker
here carries **8** minerals a trip, as in Brood War, where StarCraft II carries **5**, so the counter climbs
in bigger steps. If you want that changed too, it is `WORKER_HAUL` in [js/sim.js](js/sim.js) — a balance
decision, so it has not been touched.

---

## 77. A builder that finishes a building stays where it is

*(Seventh session, item 5 — "after a unit is done building something, they should not move anywhere at all.
This bug may only be on the Terran, but investigate protoss as well.")*

**How to reach it.** Skirmish as Terran. Select an SCV that is mining and build a Supply Depot a little way
from the mineral line.

**What to look for.**
- **When the depot finishes, the SCV stays beside it, idle.** It used to walk straight back to the patch it had
  last mined — about ten tiles — without being told.
- **Try an SCV that was standing idle first.** Same result. It used to go back to a patch it had mined
  minutes earlier, because the game never forgot which one.
- **Build a Refinery.** The SCV stays next to it. It used to walk away from the gas it had just built, back to
  the minerals. (StarCraft II sends a Refinery's builder into it automatically. That was not added, because
  "should not move anywhere at all" was the instruction — say if you want that one exception.)
- **Shift-queue two depots on one SCV.** It builds both, then stays. What it was *told* still happens.
- **Protoss was checked and was already right:** a Probe that places a Pylon stays where it is. A Zerg Drone
  becomes the building, so it has nowhere to go.

---

## 78. A worker you have selected stays selected while it harvests gas

*(Seventh session, item 6.)*

**How to reach it.** Build a Refinery (or Assimilator / Extractor), select one worker, and right-click the
Refinery.

**What to look for.**
- **When it goes inside, it stays selected.** The unit is out of sight, as it should be, but it is still in
  your selection and the console still shows it — the unit panel reads **"Harvesting gas"**. It used to drop
  out of the selection the instant it went in, every time.
- **Right-click somewhere else while it is inside.** It comes out of the Refinery and goes. (It leaves
  without the gas it was in the middle of collecting — that is how the game has always handled it.)
- **Press Backspace (centre on selection)** with only that worker selected: the camera goes to the Refinery.
- **Load a Marine into a Bunker** with the Marine selected: it leaves the selection, as in both StarCraft
  games — it is cargo then, shown in the Bunker's own panel. Only gas buildings keep a worker selected.

---

## 79. Queued buildings show a faint ghost, and you can't place on top of one

*(Seventh session, item 9 — "a faint transparency of the building should be shown where it's placed. That way
you don't accidentally try to place over the same area twice. This is in Starcraft 2.")*

**How to reach it.** Select one SCV (or Probe, or Drone), press **B**, pick a Supply Depot, then hold **Shift**
and click three different spots.

**What to look for.**
- **A faint ghost of the building appears at every spot** — the one the worker is walking to and each one
  queued after it — with a thin dashed outline. Each ghost disappears as that building actually goes down.
  Before this, nothing showed until each one was placed, so the only way to know where the third depot was
  going was to remember.
- **Now try to place a building on top of one of the ghosts** — with the same worker holding Shift, or with a
  different worker. The placement preview turns **red** and says **"A building is already planned there."**,
  and clicking does nothing. That is the accident you described, made impossible.
- **Deselect the worker.** The ghosts stay. Whether a spot is already spoken for doesn't depend on which worker
  you happen to have selected.
- **Place WITHOUT Shift, with the same worker, on one of its own ghosts.** That is allowed: an order without
  Shift replaces everything the worker had queued, so its old spots are about to stop existing.
- You only ever see **your own** plans. An opponent's worker walking out to build shows nothing — that would
  be a scouting leak.

---

## 80. Supply Depots lower into the ground, as in StarCraft II

*(Seventh session, item 8.)*

**How to reach it.** Skirmish as Terran, build a Supply Depot, select it. The command card has **Lower (R)**.

**What to look for.**
- **Press R.** The depot sinks — drawn squashed and darker — and the button becomes **Raise (R)**. Your units
  can now walk straight across it; order a Marine through it and watch it cross instead of going round.
- **Enemies can cross it too**, exactly as in StarCraft II. That is the trade you make by lowering a wall.
- **You can't build on a lowered depot.** Try to place anything on it: "Location is blocked".
- **It still gives its 8 supply**, keeps its hit points, and can still be attacked while lowered.
- **Raise it with one of your own units standing on it.** It rises and the unit is pushed off to the edge.
- **Raise it with an enemy standing on it.** It refuses, and says "The Supply Depot cannot rise while an enemy
  is standing on it."
- **Build a wall of depots at your ramp, lower one to let your army out, raise it behind them.** That is the
  point of the ability.
- A depot still under construction has no button — it is a construction site, not a door.
- Saving and loading a game, a replay, or a network rejoin all keep a lowered depot lowered.

The rules are Liquipedia's for StarCraft II's Lower/Raise, all of them. The computer does not lower its own
depots.

---

## 81. Units stand beside each other, not inside each other

*(Seventh session, item 1: "units should not overlap with each other".)*

**What was wrong, measured.** Every unit is drawn at 1.2–2.6 times the size of its collision circle (a Marine is
about 30 px wide on a 16 px circle), and units only kept 85% of those circles apart. Twelve Marines told to one spot
stood with 53% of their drawn area on top of other Marines; sixteen Zerglings 59%; some units were completely
covered. Units now keep their **bodies** apart — the room each model really takes up, measured from its sprite — and
those numbers are 3% and 2%. Weapon range, pathing, splash, clicking and building placement are untouched: only where
units stand has changed.

**How to reach it.** Skirmish, any race. Select a dozen of anything and right-click one spot. Also: set a Barracks or
Gateway rally point and let units gather there.

**What to look for.**
- **A settled group reads as individual units.** Every Marine, Zergling and Zealot is visible on its own; models touch
  but do not stack. Before, a dozen Marines were one blob.
- **A group walking together** stays readable the whole way.
- **Mining is unchanged.** Workers in the mineral line still slide through each other and through your army, as in
  Brood War and StarCraft II, and income is the same as before (measured: 49–50 per worker per minute either way).
- **Things that need units to touch still work:** an SCV repairing a Siege Tank stands right against it; two High
  Templar or two Dark Templar merge where they meet; a unit told to follow another stands off without shoving it.
- **Melee still lands.** Zealots fighting Zealots, Zerglings on Marines: enemies may come close enough to hit, so in a
  brawl the models do touch a little.
- **Fighting units hold their ground.** Send sixteen Zerglings at one Marine: the ones already biting stay put and the
  rest slide round them to find room, instead of shoving the biters out of reach and walking back in.
- **Chokes take longer**, because a body fills a one-tile gap. Sixteen Marines through a one-tile gap in a wall take
  about 9 seconds (4 before). Everyone gets through; nobody gives up waiting in the queue.

**Deliberately different, and what it costs.**
- **Fewer melee units can hit one target at once.** Before, sixteen Zerglings could all bite one Marine by standing
  inside each other; now about five fit round it (StarCraft II fits six or seven). Ten Zealots on one Zealot: three,
  not ten. That is what "not overlapping" means for melee; the balance pass (still gated) should account for it.
- **Air units keep their bodies apart too**, as they already separated before, so Mutalisks do not stack.
- **The computer Zerg gets its Queens about a minute later** than before: its build order shifted (it builds its first
  army sooner and mines more, but starts the Queen's Nest later). `test/queens.js` is red for that reason and waits for
  the AI rebalance with the other economy reds.

**If a unit's art changes** (a re-bake of the sprites), run `node tools/bodies.js --table` and paste the new table into
`js/data.js`; `test/overlap.js` fails until you do.

---

## 82. The multiplayer browser: search, filters, a detail pane, QUICK JOIN

*(Seventh session, item 2. The research behind every piece of 82–85 is `RESEARCH-LOBBY.md`.)*

**How to reach it.** Run `PLAY.bat` (or `node test/serve.js`), open the page, **Multiplayer**, type a name, **Connect**.
To see a busy list, open the page in two or three more browser tabs and host a game in each.

**What to look for.**
- **The connect form becomes a strip** once connected: server, your name, how many are connected, your own latency,
  and **change** to disconnect.
- **The list has columns** — game, host, map, speed, players (hover for humans vs computers) and status (**open**,
  **full**, **starting**, **in game**).
- **Search** filters by the game's name, the host, the map's name or the code. **Full** and **In progress** hide
  those games. **Sort** by most players, newest or name. Games you can still join always come first.
- **Click a game** to see it on the right: the map with its start positions, who is in it, the speed and any
  rules that are not standard. **JOIN** there, or **double-click** the row.
- **QUICK JOIN** puts you in the open game with the most players, or hosts one if there is none.
- Your **name, server and race are remembered** the next time the page opens.
- A game that ended between the list and your click says **"That game has ended or no longer exists."** instead of
  dropping you into an empty room under its name.

---

## 83. Ready means ready

**How to reach it.** Two browser tabs: host a game in one, join it from the other.

**What to look for.**
- **START refuses until every other human has pressed READY**, and tells the host who: "Waiting for Ben to ready up."
  The whole room sees the same line in chat. The host's own START is the host's ready.
- Before pressing, the host can see it: START is dimmed with "Ben not ready yet" on hover, and the line beside the
  buttons says who the game is waiting on.
- **Changing the game withdraws everyone's ready**: the map, the speed, a rule, adding/changing/removing a computer, or
  shuffling the teams. Chat says what changed and "The game changed, so everyone has to ready up again."
  Renaming the game does not count.
- **Changing your own race or team withdraws only your own ready.**
- **The nudge**: the host sees a bell 🔔 beside every player who has not readied. Clicking it makes that player's
  READY button pulse gold, with "Ada is waiting for you to press READY."

---

## 84. Latency, teams, and a line for everything

**What to look for.**
- **Every human shows three bars and a number of milliseconds** — the relay measures each round trip itself every
  two seconds. Green is fine; a number in **red** means that connection is slower than the command delay (125 ms
  by default), so every player will wait on it. Hover for the explanation. Computers show nothing.
- **Chat carries the room's history**: joins, leaves, kicks, a new host, the map, the speed, each rule, privacy,
  locked teams, shuffles — in grey italics — and player lines with the name in that player's colour.
- **Lock teams** (host, settings column): players can no longer change team; the host still can, for anyone.
- **Shuffle teams** (host, under the teams): every slot dealt at random onto the teams in use, as evenly as they
  go. Seats — and so colours and start positions — do not move.
- **If the host leaves**, chat says who the host is now.

---

## 85. Rules, the map's seats, the invite link

**What to look for.**
- **The skirmish rules are in the online lobby**: starting bank, weather, light (day and night), destructibles,
  derelicts and wildlife, plus the map sizes and the procedural maps (with Size) in the map list. The host sets
  them; guests read them. They are the skirmish screen's own settings, built the same way, so an online game on
  "Rich" really starts everyone with 1500 / 700. The browser's detail pane lists the non-standard ones.
- **A room holds only as many players as the map has starts.** Lost Ruins is four: once four are in, "+ add A.I."
  disappears, a fifth player is told the game is full, and the list shows 4 seats. Switch to a two-start map with
  four already in and the header turns red ("4/2 players") with an explanation, and START refuses. *(Before, a fifth
  player on Lost Ruins was built inside player one's base.)*
- **INVITE LINK** (beside the code): copies a link. Opening it goes straight to Multiplayer, connects with your
  remembered name, and joins that lobby. Only offered when the page came from a server (not from a file).
- **BACK** from inside a lobby now leaves the lobby, so you no longer hold up everyone's START from the main menu.

---

## 86. Spectators

*(Seventh session, item 2. Every lobby in `RESEARCH-LOBBY.md` has observers; Beyond All Reason lets anyone join a
running game to watch.)*

**How to reach it.** Three browser tabs on the same server. Host a game in one, join it in the second, and in the third
pick the game in the list and press **SPECTATE**.

**What to look for.**
- **In the lobby**, the spectator appears under **Spectators**, not in a team. Chat says "Sam is watching." The room's
  seat count does not change: a full four-player game still lets people in to watch.
- **A spectator has no READY** — START never waits for them — and a **PLAY** button that takes a free seat.
- **A seated player** (not the host) has **watch instead** above the spectators box: it gives up the seat.
  The host cannot, because the host is the one who starts the game.
- **Spectators can chat**; their lines say "(watching)".
- **When the game starts**, the spectator watches it with **the whole map in view** and everyone's production shown.
  The banner reads **SPECTATING**; **[** and **]** switch whose view you see, **O** toggles the production overlay,
  **Ctrl+V** the whole map. Nothing you click gives orders.
- **The players never wait for a spectator.** A spectator's slow connection or a paused tab stalls nobody.
- **Join a game that is already running**: pick an **in game** row in the list and press **SPECTATE**. You catch up from
  a player's snapshot in a moment and then watch live.
- **A spectator leaving** stops nobody's units and cancels no countdown.
- **F10** as a spectator shows a SPECTATING menu (switch player, overlay, full map, stop watching). At the end the screen
  says **GAME OVER**. Online games no longer offer **Restart this game** — it would have started a private copy of a
  game everyone else was still in.

---

## 87. Settings, in tabs

*(Seventh session, item 2: "a truly sophisticated set of menus".)*

**How to reach it.** Main menu, **Settings**. In a game, **F10** then **Settings** has the same values.

**What to look for.**
- **Five tabs**: Game, Display, Audio, Multiplayer, Controls.
- **Display → HUD size**, 1.0x to 1.6x. 1.4x is the default (the size you asked for after the first increase);
  1.0x is the original console. Start a skirmish: the console, minimap and command card are drawn at that size. However
  large it is set, the console never takes more than 42% of a short window.
- **Game → Scroll speed** (50%–200%) changes how fast the arrow keys and the screen edge pan the camera, and **Edge
  scroll** off stops the mouse panning at the edge while the arrow keys still work.
- **Audio → Volume** is one level for everything: interface sounds, unit voices and music (a change while music plays
  applies at once). Mute still starts on with every page load, on purpose.
- **Multiplayer → Name and Server** are what the Multiplayer screen fills in, and what an invite link joins under.
- **Every setting except Mute is remembered** the next time the page opens.
- **F10 → Settings in a game** shows HUD size, Scroll speed, Edge scroll and Volume as buttons that step through values
  (HUD 1.4 → 1.5 → 1.6 → 1.0 …). The main menu's tabs show whatever was set there.

---

## 88. The main menu, and your name

*(Eighth session, the user's items 2 and 3: the name "should be set manually via a prompt when the game first opens",
and the main menu's tagline and control hints removed. `RESEARCH-LOBBY.md` section 6.)*

**How to reach it.** Open the game. To see the first-launch prompt again in a browser that has already answered it,
open the browser's developer console on the game's page and run `localStorage.removeItem('bw_intro')`, then reload.

**What to look for.**
- **Before the main menu, a WELCOME, COMMANDER box asks for your name.** CONTINUE (or Enter) with the box empty does
  not go on; it says to type a name first. Up to 16 letters.
- **You are asked once.** Reload: the main menu comes straight up. (Anyone who had connected before this change, whose
  name was the old default "Player", is asked once too.)
- **The main menu is the title and three buttons**: Single Player, Multiplayer, Settings. No sentence under the title,
  no control hints under the buttons.
- **The name is changed in Settings → Multiplayer → Name.** Emptying that box puts your name back rather than leaving
  you nameless.
- **An invite link** (`?join=CODE`) opened by someone with no name yet shows the name box first, then joins the game.

---

## 89. Single Player, and the skirmish lobby

*(Eighth session, the user's item 1: Single Player shows only its buttons, START is only in the Skirmish Setup lobby,
and that lobby "should look exactly the same as the Multiplayer Lobby".)*

**How to reach it.** Main menu → **Single Player** → **Skirmish Setup**.

**What to look for.**
- **Single Player has exactly**: Skirmish Setup, Campaign, Load Saved Game, Watch Replay, Continue Autosave (only when
  an autosave exists), Map Editor, and Back. No Start Game button, no summary text.
- **Skirmish Setup is the multiplayer lobby's screen**: teams side by side with a slot per player (colour, name, race,
  team; a computer's slot also has difficulty and play style), **+ add A.I.** on each team, **+ add a team**, **shuffle
  teams**, the chat box, and on the right GAME SETTINGS with the map preview, Map, Speed, the rules and Alliances.
  Compare it with Multiplayer → HOST GAME.
- **What is not there, because nobody else can join**: READY, the latency bars, the spectators box, the team lock,
  public/private, the game's name, the room code and the invite link. **QUIT is BACK.**
- **What is there that multiplayer does not have**: **Seed** with ROLL. A new seed is picked every time the lobby opens;
  type one to replay the same map and the same computer decisions.
- **It opens as the old one-click game**: you as Terran on Team 1 and one Random, Normal computer on Team 2, Lost Ruins,
  Fastest.
- **START GAME** needs a computer opponent (with none it says "Add a computer opponent to a team to start") and a map
  with a start for everyone (pick Twilight Valley with three players: the header turns red and says to remove a slot).
- **The game you start is the lobby you set up**: your race and team, each computer's race, difficulty, style and team,
  the map, the speed, the rules (try Starting bank: Rich -- you start with 1500 minerals) and the seed.
- **The chat log** says what changed (Added Computer 2., Map: ..., Speed: ...), and you can type in it.
- **Remembered**: leave with BACK, reload the page, come back -- the map, speed, rules and slots are as you left them
  (the seed is new).
- **Maps made in the Map Editor** appear in the Map list here, under "Made in the editor". They never appear in a
  multiplayer game's list.

---

## 90. Multiplayer is one click

*(Eighth session, the user's item 2: "clicking the multiplayer button is pressing the Connect button".)*

**How to reach it.** Main menu → **Multiplayer**.

**What to look for.**
- **No Server / Name / Connect screen.** "Connecting to ..." for a moment, then the game list, with "Connected to
  <server> as <your name>" above it.
- **BACK, then MULTIPLAYER again**: the list comes straight back (the connection was kept).
- **Only when the server cannot be reached** does a small form appear: "Could not reach the game server at <address>.",
  a Server box and **TRY AGAIN**. To see it, set Settings → Multiplayer → Server to `localhost:1` and press Multiplayer.
  Empty the box and TRY AGAIN to go back to the page's own server. If the server stops while you are connected, the same
  form says the connection was lost.
- **Addresses are typed the way people type them**: `192.168.1.5:8765` works, as does `ws://…/ws`.
- Earlier items in this file that say **MULTIPLAYER, CONNECT**: the CONNECT step no longer exists.
- **Desktop app**: there is no server to assume, so the form shows at once with HOST A GAME beside TRY AGAIN.

---

## 91. Settings: the Controls and Codex tabs

*(Eighth session, the user's items 4 and 5.)*

**How to reach it.** Main menu → **Settings**.

**What to look for.**
- **Six tabs**: Game, Display, Audio, Multiplayer, Controls, **Codex**.
- **Codex → OPEN THE CODEX** opens the codex; Escape brings back Settings, still on that tab.
- **The Game tab has no Hotkeys dropdown** any more.
- **Controls is the keys themselves** (there is no button to a separate screen): **Command card keys: Standard | Grid**
  at the top, then four views -- **Interface**, where every global key is listed under Selection, Camera and Interface
  (click a key, press the new one; Escape cancels, Delete clears), and **Terran, Zerg, Protoss**, the command cards
  (item 92). **Reset all** puts every key, every command card key and the Standard layout back.
- **Grid** puts the command card on QWER / ASDF / ZXCV (select an SCV in a game: Move is Q). It is remembered, and
  **F10 → Settings** in a game calls it "Command card keys".

---

## 92. Every command card key is yours to change

*(Eighth session, the user's item 5: "All controls in Hotkeys should be customizable". `RESEARCH-LOBBY.md` section 5.)*

**How to reach it.** Main menu → **Settings** → **Controls** → **Terran** (or Zerg, Protoss).

**What to look for.**
- **On the left, every card of that race**: Units (the worker first), Buildings (a Terran building that can lift has a
  second "(flying)" card with Land), and Build menus (the worker's Build and Build Advanced).
- **Click Barracks**: its command card is drawn as the game draws it, four across and three down -- Marine M, Firebat F,
  Medic C, Ghost G, Marauder D, Reaper E, the research, Reactor X, Set Rally R, Lift Off L. The Starport's card has two
  pages, shown one under the other.
- **Click the M under Marine, press Q.** The key turns gold and a small ↺ appears (click it to put M back). Start a
  skirmish as Terran, build a Barracks, select it: **Q trains a Marine and M does nothing.** The button shows the Q in
  its corner, since "Marine" has no Q in it.
- **A command on many cards is one key.** Hover Move on any unit: "Move is on 72 cards". Put Move on J: every unit and
  worker now moves on J -- and F1's help says "J move".
- **Clashes turn red and say why.** On the Barracks, put Firebat on D: Firebat and Marauder both go red, the line under
  the card says "D is on Firebat and Marauder: D presses the first of them", and Barracks turns red in the list.
  Change an Interface key to a letter (Interface → Select idle worker → S): a Marine's Stop goes red, "S is Select idle
  worker (Interface), which is read first: Stop will not answer it."
- **Only letters.** Press 5 or F2 on a key: it says "A to Z" and nothing changes. **Delete** leaves a button with no key
  (a dash); it can still be clicked.
- **Grid is its own set.** Switch to Grid: the card shows Q W E R / A S D F / Z X C V by position, and a key you set in
  Standard is not carried over. Switch back: your Standard keys are still there.
- **Reset this card** puts that card's keys back (shared commands such as Move included, everywhere); **Reset all**
  puts back every key, every card key, and the Standard layout.
- **Remembered**: reload the page; the keys you set are still set.
- **In a game, F10 → Settings → Command card keys** switches Standard and Grid, as before.

---

## 93. Units in different places gather where you right-click

*(Eighth session, the user's bug report: units "not on the same area" right-clicked to one point kept their spread
around it, so an army could not be gathered.)*

**How to reach it.** Start a skirmish. Send one SCV to the far side of your base and leave three by the minerals.
Select all four (click one, Shift+click the others), right-click one spot on open ground.

**What to look for.**
- **All four walk to that spot and stop together round it**, touching or nearly. They used to keep their spread
  (about 190 px either side of the spot) forever.
- **A group that is already together keeps its shape** when you right-click somewhere outside it: select a tight
  clump of marines and right-click far away -- the clump arrives as the clump it was, not a single file.
- **Right-click inside a group's own area** and it pulls in tighter round that spot (StarCraft II's "magic box").
- **Right-drag a line** still spreads the selection along the line, unchanged.

---

## 94. Choose where you start

*(Ninth session, queue item A: "build this now". `RESEARCH-LOBBY.md` section 7 -- OpenRA's lobby is the model.)*

**Saves and replays from before this are refused** (the build stamp moved: the game now reads a start from the setup).

**How to reach it.** Main menu → **Single Player** → **Skirmish Setup** (or Multiplayer → HOST GAME; everything below is
the same there). The map preview is at the top of GAME SETTINGS on the right.

**What to look for.**
- **Nothing changes until you choose.** Every seat's Start list says **Auto**, and the map shows seat one's colour on
  start 1, seat two's on start 2, the rest grey -- the game you always got. Every start now has its number on it.
- **Click start 3 on the map.** It turns your colour with a light ring (chosen), the chat log says "<you> takes start 3.",
  and your Start list says Start 3.
- **Click another free start.** As the host, it goes to **Computer 1** (the first computer still on Auto) -- OpenRA's rule,
  so you place everyone with a click each. Click a computer's start to put it back on Auto; click your own to give yours
  back.
- **An Auto seat goes where the map shows it.** Take start 2 yourself (Computer 1's own start): Computer 1 moves to start 1,
  the first free one, on the picture -- and in the game.
- **The Start list** on each slot offers Auto and every start; a start someone else holds is greyed and says who has it.
- **START GAME, then look at where your base is**: on the start you chose. The computers' bases are where the preview
  showed them (use F10 → Restart to see it again, or a replay with the whole map).
- **Change the map**: everyone is back on Auto, and the log says "Start positions are back on Auto for the new map." A
  procedural map has no picture, so its starts are **numbered chips** under "grown from the seed at START", each named by
  its corner in the tooltip (start 1 top left, start 2 bottom right...); they are clicked the same way.
- **Remembered**: BACK, reload, Skirmish Setup again -- your starts are still there (unless the map changed).
- **Online** (two browser tabs, one hosting): a guest clicks a start and the host sees it at once; a guest cannot move the
  host or a computer, and nobody can take a start someone holds. Moving a computer makes everyone ready up again; moving
  your own start only un-readies you.

---

## 95. Rematch, and back to the same lobby

*(Ninth session, queue item B: "build this now". `RESEARCH-LOBBY.md` section 8 -- Beyond All Reason's room that outlives
the match, with Age of Empires II's opt-in Rematch.)*

**Single player.** Skirmish Setup, add a second computer and take a start, START GAME. To reach the end quickly, open
the browser console and run `G.over = true` (or win or lose for real).
- **The end screen leads with Rematch and Back to lobby**, above Continue playing, Restart this game, Save replay and Return to
  main menu.
- **Rematch** starts the same game again at once -- same map, computers, teams, starts and rules -- on a **new seed**
  (Restart this game is the same seed).
- **Back to lobby** opens Skirmish Setup exactly as you left it, to change something and START again.
- A campaign mission, a loaded save or a watched replay offers neither.

**Online** (two browser tabs on the same server -- `PLAY.bat`, or `node tools/playtest-listen.js` to have it recorded).
Tab A hosts, tab B joins and readies, add a computer, START GAME. End it in both tabs with `G.over = true` in each
console (the relay only believes the end when both say the same frame -- which a real game's end always is).
- **Tab B presses Rematch.** Tab B is in the lobby at once: the same room code, map, rules, computer and starts, and B is
  already READY. The chat says the game is over and that A is still on the end screen.
- **Tab A, still on its end screen, is "end screen" in the lobby**, not ready -- and B is the host for now. B's START says
  it is waiting for A "(still on the end screen)".
- **Tab A presses Back to lobby**: A is in, not ready, and host again (the chat says so). A presses START: a new game on
  the same settings.
- **Going back before the end**: in a game of three or more, a player who is knocked out gets the end screen while the rest
  play on. Their Back to lobby puts them in the lobby marked "back", with a line naming who the room is waiting for; the
  others are told they went back, as for a drop. The room opens when the rest finish. (The buttons are on the end screen
  only, not in the F10 pause menu.) A player who closes the tab instead has no seat in the next lobby.
- **The game list** (a third tab, Multiplayer) shows the room "open" again after the game, not "in game".
- **A spectator** (join with SPECTATE) gets Back to lobby, never Rematch, and stays a spectator in the lobby.
- **F10 in an online game has no Restart and no Save game any more.** Restart used to start a private copy of a game
  everyone else was still in, and Save game did nothing online. A game against the computer still has both.

---

## 96. The desktop app for Windows and Mac, built by GitHub

*(Ninth session, queue item D. Unsigned, as the user decided: no Apple Developer Program, no paid Windows certificate.)*

**How to reach it.** On GitHub: the repository → **Actions** → **Desktop builds** → the newest run with a green tick →
**Artifacts** at the bottom: `brood-war-remake-windows-x64`, `brood-war-remake-macos-apple-silicon`,
`brood-war-remake-macos-intel` (each a zip). Downloading artifacts needs you to be signed in to GitHub. A run starts by
itself when `desktop/` or the workflow changes, on a `v*` tag, or from **Run workflow** on that page.

**What to look for.**
- **Windows:** the zip holds `Brood War Remake_0.1.0_x64-setup.exe`. Running it, SmartScreen says "Windows protected your
  PC" -- **More info → Run anyway** (that is what unsigned means). The app installs, opens on the main menu, and
  Multiplayer → HOST A GAME starts its own relay.
- **Mac:** the zip holds a `.dmg`; drag the app to Applications. The first open is refused ("cannot be opened because it is
  from an unidentified developer" or "Apple could not verify..."). **System Settings → Privacy & Security → Open Anyway**,
  or right-click the app → Open. If macOS instead says the app "is damaged", run
  `xattr -dr com.apple.quarantine "/Applications/Brood War Remake.app"` in Terminal once. After that it opens normally.
- **Both Macs have their own build**: Apple silicon (M1 and later) and Intel. The wrong one will not start.
- **Each run also checks** that the built relay answers a room join and that the page works as a desktop page; a red run
  names which step failed.

---

## 97. A password for your server, and a relay that shrugs off floods

*(Ninth session, queue item E. `RESEARCH-LOBBY.md` section 9.)*

**How to reach it.** Run **PLAY-ONLINE.bat**: it now asks "Password for this server". Type one (or, by hand,
`set BW_PASSWORD=something` then `node test\serve.js 8765 6`). The window says `PASSWORD ON`.

**What to look for.**
- **Open the game and press Multiplayer.** Instead of the game list: "This server needs a password", a box and JOIN
  SERVER. A wrong password says "Wrong password." and asks again; the right one shows the game list.
- **Press Back, then Multiplayer again, or reload the page**: the list comes straight up -- the password was remembered
  for this server.
- **Restart the server with a different password**: the remembered one is refused, forgotten, and you are asked again.
- **Without a password** (PLAY.bat, or Enter at the prompt) nothing is asked, exactly as before.
- **The flood caps are invisible in honest play.** In a normal game nothing changes; a chat line typed and sent very fast
  more than eight times in a row stops appearing until you slow down. (The caps themselves are proven by
  `node test/safety.js`: a thousand messages at once gets a socket dropped, a 100 KB message is refused.)
- **A tab closed abruptly** (end the browser's process) now leaves the game at once -- the others see "dropped" in a
  second, not after 45 seconds.

---

## 98. Ratings, and BALANCE TEAMS

*(Ninth session, queue item C. `RESEARCH-LOBBY.md` section 10 -- Beyond All Reason's system.)*

**How to reach it.** Two players are needed, **each in their own browser** (two tabs of one browser are one player: the
lobby will say "two players share one browser"). Use two browsers (say Chrome and Edge) or one normal and one private
window. Run `PLAY.bat`; both open the page, press Multiplayer; one hosts, the other joins.

**What to look for.**
- **Each player's slot shows a number: 16.7** for a new player -- BAR's Match Rating, skill minus uncertainty. Hover it for
  what it means and how many rated games are behind it.
- **GAME SETTINGS has a Rated row**: "Yes — Duel" with one player a side. Add a computer: "No — computers are playing". Put
  both players on one team: "No — everyone is on one team".
- **Play a duel for more than 90 seconds and win it** (or, to be quick, run `G.over = true; G.winTeam = <your team>` in both
  consoles once the clock passes 1:30 -- both must say the same). The end screen says "Duel rating: you 16.7 → 19.6,
  them 16.7 → 14.3", and so does the lobby's log. Back in the lobby, the slots show the new numbers.
- **Close the page and the server, start them again**: the numbers are still there (they live in
  `%USERPROFILE%\.broodwar-remake\ratings.json`).
- **A game under 90 seconds** says "That game is not rated: it lasted less than 90 seconds."
- **Walk out of a rated duel** (close the tab) and let the other player go Back to lobby 10 seconds later: "Duel rating (a
  forfeit)" -- the one who left loses.
- **BALANCE TEAMS** (the host, under the teams, beside shuffle teams) with four players in their own browsers: the teams are
  split so the totals are as close as they go, and the log says the difference. With equal players, pressing it again can
  deal a different split. With a computer in the lobby it refuses and says why.
- **Single player and games against computers are never rated**, and the skirmish lobby shows no ratings.

---

## 99. Research that stops says why -- and a real freeze writes the one line to send

*(Ninth session, queue item F: "research sometimes gets stuck". Items 68 and TODO-M18 item 4 are the hunt before.)*

**What was found first.** It still does not happen by itself. On today's code (bodies kept apart, the slower economy) three
25-minute six-player games with hard computers of all three races had **9 pauses over ten seconds, every one with a reason
the rules give**: 6 waiting on supply, 1 on an add-on still being built, 1 under Maelstrom -- and 1 a Protoss upgrade whose
building lost its Pylon and never got power back before the game ended. The eleven scenes of item 68 give the same
verdicts as before. Your own recorded game, re-simulated from its replay: 3 pauses, all a Nexus or Gateway waiting on
supply. So the likeliest "stuck research" is a Forge or Cybernetics Core whose Pylon died out of sight: the bar stops and
nothing said so.

**What changed.**
- **A research or upgrade kept waiting 20 seconds for a reason the rules give now says so, once**, in the message area:
  "Forge has stopped researching Ground Weapons: it has no power: a Pylon has to reach it." The other reasons it can give:
  lifted off the ground, its add-on still being built, disabled (stasis, lockdown or maelstrom), changing form, inside a
  transport. A unit waiting on supply is left to the supply alert you already get.
- **Anything in a production queue that stops for ten seconds with NO reason the rules give is reported, once**: on screen,
  "Academy has not moved Stim Packs on for 10 seconds, and the game cannot say why. Please send the line it wrote to the
  browser console (F12)." The line starts `[stall] build ...` and names the time, the building, the item, how far it got and
  everything the rules look at. It is also kept in the browser as `bw_stall`, so it survives closing the tab.
- **The game itself is unchanged**: the watcher only reads, only watches your own buildings, never runs in a replay, and
  cannot change a game's result or an online game's sync. The build stamp did not move.

**How to see it by hand** (Single Player, any map; cheats are typed into chat with **Enter**).
1. **The explanation.** Play Protoss, type `show me the money`. Build a Pylon and a Forge in its field, and start Ground
   Weapons. Select the Pylon, open the browser console (**F12**) and run `G.kill(UI.selection[0])`. The Forge goes dark and
   the bar stops. **About 20 game seconds later** the message above appears -- once, however long you wait. Build a new
   Pylon beside the Forge: when it finishes, the bar moves again.
2. **The report of a real freeze** (forced by hand, because a real one has never been caught). Play Terran, `show me the
   money`, build an Academy and start Stim Packs. Select the Academy, F12, run `UI.selection[0].tickProduction = () => {}`.
   **About ten game seconds later**: the on-screen message, a yellow `[stall] build ...` line in the console, and
   `localStorage.bw_stall` in the console returns the same line. Nothing more is said however long it stays frozen. (Reload
   the page to undo the freeze.)
3. **Honest waiting stays quiet.** Fill your supply and queue a Marine: the supply alert, and nothing from the watcher.
   Start a Machine Shop on a Factory and queue a Vulture while the shop builds: the Vulture waits, and no report.
4. **If research ever sticks for real**, send the `[stall]` line (from the console, or `localStorage.bw_stall` in the same
   browser later). If you played through the playtest recorder, `node tools/stall-replay.js` re-runs your saved replay and
   lists every pause over ten seconds with its reason.

---

## 100. Terran and Protoss computers attack again

*(Ninth session, queue item G: "the two red suites", authorized narrowly. TODO-M18 item G has every number. The build stamp
moved: saves and replays from before this change are refused.)*

**What changed for a computer opponent.** Three things, all in how it paces itself on the slower economy of item 72:
- **It keeps making workers until it has about 24**, instead of stopping at 12 and waiting for an army it could not afford.
  A normal computer had 13 workers from minute 2:30 to minute 10; it now has about 21 at five minutes and 40-50 at ten.
- **A Terran or Protoss computer only takes a new base when it has the workers for it** -- about 16 per base it already
  holds. It used to lay down a Command Center every three minutes whatever it had: five by ten minutes, with 13 SCVs.
- **Its attack waves are smaller: 0.7 of the old sizes.** A normal, standard computer attacks with about 24 supply (easy 31,
  hard 20), which is the size of Brood War's own computer's first wave (12 Zealots). Every style keeps its place: a rusher
  still attacks first and smallest, a turtle last and biggest.

**Deliberately not done, and you will see it:** the **Zerg** computer is still passive for the first ten minutes (it drones
and builds hatcheries, with an army of 1-14 supply at ten minutes), and in computer-against-computer games a Terran now
beats a Zerg at about thirteen minutes. Fixing Zerg is the AI rebalance (TODO-M18 7b) that you asked to hold until you say.

**How to see it by hand** (Single Player → Skirmish, Lost Ruins; cheats are typed into chat with **Enter**):
1. **A Protoss computer attacks.** Set the computer's slot to **Protoss, Normal, Standard** and start. Keep your own army
   small and do not attack (a computer that sees a bigger army than its wave waits for more). **Its first wave leaves home
   at about 8:45-9:25 of the game clock** with about 22 supply (roughly eleven Zealots and Dragoons) and reaches you a
   little after -- those times were measured against an opponent that does nothing. Before this change nothing came in
   the first ten minutes (a hard computer's first wave was at 14:27).
2. **A rusher comes sooner.** Same, with **Terran or Protoss, Normal, Rusher**: a wave of about 14 supply at about 7:30-9:15.
3. **Its workers and bases** (invisible without looking at its base): type `black sheep wall` to see the map. At **5:00** a
   normal Terran or Protoss computer has about 21 workers (was 13) and one or two bases; at **10:00**, 40-50 workers and three
   or four bases (was five bases and 13 SCVs).
4. **A Zerg computer's Queens.** Set it to **Zerg, Normal**, `black sheep wall`, and look at its hatcheries around **10:00**:
   a Queen beside each one (it had only its starting Queen). It will not have attacked you -- that is the unfinished part.
5. **Easy and hard still differ**: an easy computer waits for a bigger wave (31) and a hard one for a smaller (20).

---

# The tenth session -- the user's playtest of 94-100

**The build stamp moved** (to `096229469e3da005` with items 101-105, and to `56406f9d777368ac` with 106-107): saves and replays from before are refused.

## 101. Attack your own units and buildings on purpose -- and right-click still never does

*(Tenth session, item 1. Brood War and StarCraft II both let the Attack command hit your own side; a right-click never does.)*

**How to see it by hand** (Single Player, any skirmish):
1. **Right-click is friendly.** Select a few Marines (or SCVs) and right-click your own Supply Depot: they walk to it. Right-click
   one of your own units: they follow it. SCVs right-clicking your own damaged building repair it. Nothing attacks.
2. **The ATTACK command is not.** With the same Marines selected, press **A** (or the Attack button on the card) and left-click
   your own Supply Depot: they shoot it until you stop them. Do the same on one of your own Marines: they shoot it, and **it
   stands there and takes it** -- it does not turn on your army.
3. **Workers too.** Select three SCVs, Drones or Probes, press A, click your own building: they hit it.
4. **Found and fixed on the way: melee attackers reach small buildings from every side.** Send one Probe (or a Zealot,
   Zergling or Ultralisk) to attack an enemy Pylon or Photon Cannon from any direction: it hits it. Before, a melee attacker
   stopped a tile short and gave up from three to seven directions in eight (107 attacks in 384 measured).

---

## 102. Escape opens the game menu

*(Tenth session, item 6: "settings in-game should be bound to ESC, not F10". Age of Empires IV and Beyond All Reason try
Escape's cancel first and open the menu otherwise; StarCraft II keeps the menu on F10.)*

**How to see it by hand** (any game):
1. **Escape opens the menu** (Settings is in it). Escape again closes it; from Settings, Escape steps back to the menu.
2. **But first it cancels what is half-done.** Start placing a building and press Escape: the placement is cancelled and no
   menu opens. Same for a target (press A, then Escape), for the build menu of a worker, and for a chat line you are typing.
   The next Escape opens the menu.
3. **It destroys nothing.** Select a Barracks with two Marines queued, press Escape: both are still queued and the menu
   opens. **Cancelling a queued unit or a building going up is its card's Cancel button now** (it has no key).
4. **F10 does nothing by default.** The key is in Settings -> Controls -> Interface ("Game menu"); put it back on F10 if you
   prefer, and the help overlay (F1) and the HUD line say whichever key it is.

**Deliberately different:** StarCraft II's Escape cancels the last queued unit; here it never does, so reaching for the menu
cannot lose one.

---

## 103. Join by code only joins a game that exists

*(Tenth session, item 5. Brood War says "Game doesn't exist"; Beyond All Reason "No lobby found".)*

**How to see it by hand:** Multiplayer, type a code no game has ("fewrg") in the code box and press JOIN BY CODE (or
Enter). The status line says **"No game here has the code FEWRG."** and you stay on the game list -- no empty lobby with you
as its host (which is what the playtest made). Host a game in another tab, copy its code, join by it: you are in.

---

## 104. A computer slot is always ready, and always the host's to change or remove

*(Tenth session, item 3. OpenRA's and Beyond All Reason's ready checks count humans only; only the host changes a bot.)*

**How to see it by hand** (Multiplayer -> HOST GAME, two tabs if you like):
1. **+ ADD A.I.** The computer's row shows a **gear** where a human's ready tick goes (hover it: always ready), its race,
   difficulty, style, team and start lists, and a **REMOVE** button in words at the right.
2. **Change anything, any time.** Change its difficulty, team or start; press REMOVE and it is gone. START never waits for
   a computer.
3. **During the countdown too.** Press START with a second human ready, and while it counts change the computer's
   difficulty or REMOVE it: the count is called off ("The host changed Computer 0, so the start was cancelled.") and the
   change is made.
4. **A guest** (the second tab) sees the computer's settings as text with **host sets** beside them: only the host changes a
   computer, as in OpenRA.

---

## 105. Choose your colour in the lobby

*(Tenth session, item 2. StarCraft II's melee lobby keeps colours unique; OpenRA's picker is free and corrects a clash.)*

**How to see it by hand** (Multiplayer -> HOST GAME, or Single Player -> Skirmish Setup):
1. **Click your colour square** (the swatch at the left of your row). A palette opens under the row: the eight colours,
   yours ringed, the ones other players wear dimmed with their name on hover, and **Auto**.
2. **Click Brown.** Your square turns brown, the chat says "<you> plays in Brown.", and in the game your units, buildings,
   minimap dots and name are brown. Nobody's ready is withdrawn for it.
3. **Nobody shares a colour.** In a second tab, try to pick Brown: it is dimmed. As the host, click a computer's square to
   choose its colour.
4. **Auto** gives your colour back (your seat's own, or the first free one). A lobby where nobody chooses looks and plays
   exactly as before; the Skirmish lobby remembers your choice.

---

## 106. A player who leaves is out -- and a duel ends

*(Tenth session, item 4: "when the one human opponent leaves, it does NOT trigger an end game - it should". StarCraft II's
leaving is a surrender and a disconnect waits for the others; Brood War marks a leaver defeated and its victory check fires.)*

**How to see it by hand** (Multiplayer; two tabs are enough, one hosting, the other joined and ready; START GAME):
1. **Quit is leaving.** In the host's tab press **Escape -> Quit to menu**. In the other tab: "<host> has left the game."
   and, within a second, the victory screen. Before, it said "...dropped. Their units stop at 0:51; the game continues."
   and the game never ended.
2. **A drop gets a minute.** Start again and this time close the host's TAB (not Quit). The other tab reads "<host>
   dropped. Their units stop at <time>; they have 60 seconds to rejoin." Open the page again, Multiplayer, join that game
   with the same name inside the minute: you are back in and play on. Or wait the minute: "<host> has left the game." and
   the victory screen.
3. **A team game goes on.** Host with a computer on your team against the other tab, and quit: the other tab reads that
   you left and keeps playing against your computer.
4. **The replay agrees.** From the victory screen press Save replay, then watch it: it ends at the same moment with the
   same winner.
5. **A quit is final.** After quitting, join the same game again with the same name: it is refused.

**Deliberately different:** there is no vote to drop a player as in StarCraft II -- a player who drops has 60 seconds, then
is out by themselves. The leaver's units stay on the map where they stood, stopped, as in Brood War. Quit to menu from a
game that is already over changes nothing. **The build stamp moved:** saves and replays from before are refused.

---

## 107. A computer's workers fight a worker that attacks its base

*(Tenth session, item 8, locked in by the user until fixed. Brood War's own AI pulls every worker near the one that was hit;
StarCraft II's scripts defend with workers at every difficulty; bots that answer one attacker at a time lose to a group.)*

**How to see it by hand** (Single Player -> Skirmish against one computer, any races; type `black sheep wall` into chat with
Enter to see its base):
1. **One worker attacks.** Send one of your workers into the computer's mineral line, press **A** and click one of its
   workers. **Two or three of its workers leave the minerals and attack yours**; yours dies in about five seconds and
   kills nobody. Before, it lived for 45 seconds and killed about two.
2. **They go back to work.** A few seconds later every worker that chased is mining its own base again.
3. **Three at once meet more.** Send three workers and attack together: up to three of theirs come for each of yours, and
   all three of yours die (the computer may lose one to three workers).
4. **Hit and run.** Hit one of its workers, then run out of its base: they follow you only to the edge of their base and
   turn back to mine -- they cannot be led around the map.
5. **Only looking is left alone.** Walk a worker through its mineral line without attacking: nobody comes.
6. **A soldier is its army's business.** A Marine or Zergling attacking its workers pulls none of them.

**Deliberately different:** Brood War pulls every worker near the one hit, however many; here it is up to three for each
attacker (two, three and four were measured: all killed a lone worker with no loss; three is the middle), so the rest keep
mining.

---

## 108. What your playtest did not reach, run without you -- and three wrong words it found

*(Tenth session, item 7: "anything i missed in testing, run auto tests without me to test". The recording showed PLAYTEST 92 in
a game, 94 online, 95, 96, 97, 98, 99 and 100 not exercised.)*

**What was run, and what it said:**
- **92 in a game** (`.claude/review/tenth/walk-92.js`, a real game in a VM, keys pressed): M trains a Marine; with the Marine
  put on Q, Q trains and M does nothing; Escape -> Settings -> Command card keys switches to Grid, where Q (the slot) trains;
  a Grid choice (K) stays in Grid and the Standard one (Q) comes back with Standard; Reset all puts M back. **Found: the
  menu's Resume and Back said "(Esc)" whatever key the menu was on** -- fixed, below.
- **94 online, 95 online, 103, 104, 105 and 106, in two real browser tabs on the relay**: a code nobody has is refused and a
  real one joins; the guest takes start 3 and the host sees it, with "Ben takes start 3." in the log; the guest's colour
  picker (Brown) reaches the host; a computer shows its gear, REMOVE and, to the guest, "host sets"; START makes exactly the
  lobby's game (each player on the start and in the colour the lobby showed); REMATCH from the guest's end screen puts the
  guest in the lobby ready, the host shown "end screen" and the guest host for now, and the host's BACK TO LOBBY makes them
  host again; in a duel the host's Quit to menu ends the guest's game 22 frames later, the guest's side the winner, "Ada has
  left the game." said once. **Found: the host's map offered "click to give it back" on the start the GUEST had chosen,
  where a click does nothing; and the note under GAME SETTINGS still said "Colours follow the seats"** -- fixed, below.
- **96, the desktop app**: `desktop/page-check.js` 22 of 22, and the relay built again as the desktop app's single
  executable from today's relay, answering a room join (`desktop/relay/check.js` 7 of 7). On GitHub the Desktop builds for
  this session's relay changes (`ad06d00`, `372c4cc`) made all three installers, green. **They rebuild only when the desktop
  wrapper or the relay changes**, so the three words below are in no installer yet: Actions -> Desktop builds -> **Run
  workflow** makes one with them.
- **97, a password**: `test/safety.js` in the gate (25 checks: asked for, refused when wrong, remembered, forgotten when
  the server's changes).
- **98, ratings**: `test/ratings.js` in the gate (37), and a new walk for the new way to leave: **a player who QUITS a rated
  duel at 100 seconds loses it** -- rated for the one who stayed whether their game reports the end or they just go back to
  the lobby (`.claude/review/tenth/walk-98-quit.js`, 5 of 5).
- **99, research that stops**: its by-hand steps walked headlessly -- the Forge's "no power" explanation 21 game seconds
  after its Pylon dies, said once; a frozen Academy reported after 10 seconds, on screen, in the console and in `bw_stall`.
- **100, computers attack**: `aistyles` 132 of 132 on seeds 1, 5 and 11, every style's first wave and army unchanged by this
  session.

**The three words, fixed -- how to see them** (no build stamp change):
1. **The menu names its key.** In a game press Escape: the menu's first line is **Resume (Escape)**. In Settings -> Controls ->
   Interface put "Game menu" on F10; in a game F10 opens it and it says **Resume (F10)**, and Settings' last line **Back (F10)**.
2. **A start's hint says what a click does.** Host a game in one tab, join in another and take start 3 there. In the host's
   tab hover start 3: **"Start 3: Ben"**, and clicking it does nothing. Hover your own chosen start: "click to give it back".
   With your start chosen and a computer on Auto, hover a free start: **"click to give it to Computer 0"** -- which is what
   the click does. A start an Auto seat stands on says "click to take it".
3. **The note under GAME SETTINGS** says "Click your colour square to choose a colour" (the host's adds "a computer's too").

---

# Terrain

## 109. Detailed terrain -- the Badlands test run (OFF unless you ask for it)

*(The user, 2026-09-13: "i do not need an editor. i just want great looking maps", then, of the before/after: "this looks amazing
so far - exactly the direction i want". `RESEARCH-TERRAIN.md` sections 7-8; the approved images are in `docs/terrain/`.)*

**How to see it by hand:**
1. Start the game as usual (PLAY.bat), then add **`?hd=1`** to the end of the address and reload.
2. Single Player -> Skirmish on **Lost Ruins** (a Badlands map), START.
3. **What working looks like:** the ground is photographic dry dirt; your base's high ground is lighter packed earth; its edge is
   a natural, irregular cliff of orange layered rock, sunlit on its upper and left faces and in shadow on its lower and right
   ones; ramps are worn slopes; rock zones are lumpy orange rock. No cartoon boulders, crack lines or striped ramps. Units,
   minerals and buildings stand out against it.
4. **Without `?hd=1`** the game looks exactly as before -- nothing changed for anyone else.

**Not in the test run, and next (TODO-M18, THE TERRAIN QUEUE):** props on open ground, ramps walled on both sides, the other four
tilesets (Jungle, Ice, Desert, Space Platform keep the old look even with `?hd=1`), a matching zoomed-out view and minimap (both
still the old colours), a speed check on the biggest map, and switching it on for everyone.

## 110. Ramps have walls: you go up at the bottom or come down at the top, never over the side

*(The user, 2026-09-13, the terrain queue's item 2: "Better-shaped ramps - can only go up them from base, NOT from sides of ramp".
TODO-M18, THE TERRAIN QUEUE, phase 1. The rule is `GameMap.wallRamps` in `js/map.js`; `test/ramps.js` holds it to its word.)*

**THE BUILD STAMP MOVES** (`js/map.js` and `js/build.js` are stamped; the new stamp is `eff84c60f4bc9cf2`). Saves and replays made
before this commit are refused, as they should be: the ground they were played on has changed.

**What changed for a player:**
1. **Every ramp on every map is entered only at its foot or its top.** The tiles beside a ramp are cliff now -- walls you cannot walk
   or build on. Measured before: 132 of 158 ramps over every layout, size and archetype could be walked onto from a side.
2. **Ramps are shorter: at most three tiles, counted down from the cliff edge.** The layouts drew ramps five to thirteen tiles long
   because nothing walled them; walled at that length they would be piers into the low ground, and on Broken Expanse, Dust Bowl,
   Nightfall and Chokepoint Valley a Thor, an Ultralisk or a Reaver could no longer leave its main (measured). The part of an old
   ramp that ran back into the plateau is plateau now, so the top of a ramp is where the cliff is.
3. **Where a ramp's foot opens onto crowded ground -- a mineral line, a rock formation -- it is shorter still**, so a large unit can
   step off it and turn. And the rule checks itself: if walling a ramp would cost anyone a base, a mineral patch, a town-hall site
   or a route a large unit had, it tries that ramp shorter, down to the cliff row alone.
4. **Generated maps changed shape in four places, so every one of them can be walled** (without these, 26 of 32 small Vertical
   Cliffs maps could not): *Vertical Cliffs* -- the natural's ramp is three tiles wider than the rock formation in it, which now
   sits on its west side, so the natural is never sealed while the rocks stand; the main's ramp sits two tiles in from the corner of
   its plateau; the rock blob that always landed on the natural's terrace is gone; the spire keeps clear of the natural's ramp.
   *Island Chain* and *Chokepoint Valley* -- the main's ramp sits two tiles in from the corner; on the smallest size Chokepoint's
   natural stands east of its main ramp instead of with its mineral line across it. *Open Basin* -- its random rock blobs never land
   on a ramp. A side effect worth knowing: of 1,037 maps measured, those where some mineral patch cannot be reached or a base
   refuses its town hall fell from 200 to 58 -- almost all of the difference is the Vertical Cliffs blob, which used to bury part of
   the natural's mineral line. None got worse.
5. **Detailed terrain (`?hd=1`): a ramp is drawn as a slope, and the cliff folds down both sides of it.** Every ramp used to be drawn
   at one flat middle height, so it read as a slab with a drop at each end.

**How to see it by hand:**
1. **Single Player -> Skirmish on Lost Ruins, START.** Scroll to your main's ramp (south-east of your base, where the cliff turns).
   *Working:* a short stair with a rock face on both sides that runs all the way down to its foot; the foot opens onto the low ground.
2. **Walk round.** Put a Marine (or a worker) on the low ground right beside the ramp's side wall and right-click the plateau above.
   *Working:* it walks along the wall to the foot and up the ramp -- it never steps onto the ramp from the side.
3. **Build on a wall.** With a worker selected, try to place a Supply Depot over a wall tile beside the ramp. *Working:* refused.
4. **A large unit.** On Broken Expanse, bring a Thor (or a Reaver or an Ultralisk) from your main to your natural. *Working:* it goes
   down the ramp and round the natural's mineral line without sticking.
5. **Detailed terrain.** Add `?hd=1` to the address, reload, and open Lost Ruins again. *Working:* the ramp is a slope between two
   folds of the cliff, not a pale box stuck to it.
6. **Generated maps.** Single Player -> Skirmish -> a generated map (Vertical Cliffs, Island Chain, Chokepoint Valley, Open Basin)
   at each size. *Working:* every ramp has walls; on Vertical Cliffs the natural's ramp has a rock formation on its west half and a
   three-tile lane beside it (a Thor fits); breaking the rocks opens the full width.

**Invisible from normal play, and where to look instead:** that nothing reachable became unreachable. `test/ramps.js` (in the gate)
checks it on 53 maps -- every shipped layout, the archetypes at every size on two seeds, and the seeds that found each generator fix
-- against the same maps generated without walls; it was measured on 1,037 (`.claude/review/terrain/audit-shipped-64e.log`). Twelve
negative controls turn it red (`.claude/review/terrain/controls-ramps.log`).

**Deliberately different from what was asked:** walls "the whole length" of a ramp -- the whole length of a much shorter ramp (item
2 above says why). And the `queens` suite now checks one Queen per hatchery at twelve minutes rather than ten: the fourth and fifth
Queens arrive in a burst between minutes nine and ten, and over twelve seeds the ten-minute check passed on 7 without walls and 8
with them, so the seed, not the walls, decided it; at twelve all 24 games have exactly one per hall.

**Numbers recorded (by-hand runs after the change; the tenth session's are `.claude/review/aipace/after-*.log`):**
- `aistyles` seed 1: 132/132; seed 11: 132/132; **seed 5: 131/132** -- "harasser fields more of the fast units its table favours than
  turtle" came out 7 vs 10 (it passed before). The suite's own comment calls this "the weakest of the behavioural checks by some way"
  (ten minutes is too short for compositions to separate); the gate runs aistyles on its default seed, which passes. The AI
  rebalance is deferred by the user, so nothing was tuned for it.
- `queens` 25/25 (with the twelve-minute check above); `eightplayer` 19/19 -- every player alive at 10:00, 16 of 16 bases claimed
  (14 before), 634 units (523), tick 2.48 ms/frame mean (2.61), worst segment 4.74 ms (5.62).
- `net_many` 51/51, no desync; phase 1's four hashes agree at frame 3552 (820315027). *(Corrected in item 114: this first said
  "995386952 before -- the ground changed". The relay picks a new seed for every game, so the hash differs on every run and says
  nothing about the ground; what counts is that the clients agree.)*

## 111. Detailed terrain on Jungle, Ice, Desert and Space Platform, and no repeating pattern on any of them

*(The user, 2026-09-13, the terrain queue's item 3: "The other four biomes: about 12 more free textures, a few MB." TODO-M18, THE
TERRAIN QUEUE, phase 2. Drawing only -- `js/terrain.js` and `assets/terrain/`; the build stamp does not move, and no save, replay
or network game can tell the difference.)*

**Detailed terrain is still OFF by default** (phase 5 switches it on): add `?hd=1` to the game's address to see any of this.

**What changed for a player:**
1. **Jungle** is drawn from photographs: wet mossy ground below, a drier olive plateau above, mossy rock on the cliff faces.
2. **Ice**: a trodden snowfield in shadowed blue below, clean wind-packed snow above, veined grey rock on the cliff faces.
3. **Desert**: a cracked orange canyon floor below, bleached rippled sand above, bedded sandstone on the cliff faces.
4. **Space Platform**: a dark rust-stained deck below, light riveted plating above whose edges follow the tiles -- straight, with
   square steps and a steel lip -- and tread plate on the ramps.
5. **Every tileset, Badlands included: open ground no longer repeats.** Each texture used to tile every sixteen tiles, and on
   open ground the same snow patch, rust bloom or pale patch showed up again and again in a grid. The ground is now laid in
   squares six tiles across, each taken from its own place in the photograph, with their borders blended and wandering.
   Badlands keeps the textures and colours you approved.
6. **Cliffs read as one crisp drop on every set**, as on Badlands: each set's cliff rock is about as bright against its high ground
   as Badlands' (Ice's was black at first -- a dark outline round every plateau).

The files: thirteen Poly Haven CC0 textures, 8.3 MB (`assets/terrain/SOURCES.md` has every name, source address, real size and use).

**How to see it by hand:**
1. **Jungle.** Open the game with `?hd=1`, **Single Player -> Skirmish**, map **Contested Ground** (a Jungle map), START. *Working:* a
   green-olive plateau clearly lighter than the dark mossy ground below, a dark rocky drop at its edge, and the ramp a smooth slope.
2. **Ice.** Same, map **Nightfall** or **The Long March** (both Ice). *Working:* white snow on the plateau with no dark squiggles on
   it, blue-shadowed snow below, grey rock faces rather than black outlines. On Nightfall play on to about six minutes, the bottom
   of its twelve-minute day: the blue dark lies over the snow and the ground still reads.
3. **Desert.** Map **Dust Bowl**. *Working:* pale sand on the plateaus over an orange cracked floor. Ten seconds in, "A sandstorm is
   closing in.": the dust band that crosses the map reads over the sand.
4. **Space Platform.** Map **Open Basin** (a generated map), and in the lobby set **Seed** to **1**, START. (Other seeds that give Space
   Platform: Chokepoint Valley 3, Island Chain 10, Vertical Cliffs 16.) *Working:* light metal plating on the plateaus with straight
   stepped edges and a steel lip, dark stained metal below, no orange blotches in rows.
5. **No repeats.** On any of them, scroll across a wide stretch of open low ground (the middle of Contested Ground). *Working:* you
   cannot find the same patch twice in a row across the screen.
6. **What draws over the ground.** Play a Zerg game on any tileset (creep round the Hatchery), place a building (the green or red
   ghost), fight until something explodes (the scorch mark and the wreck), and play without Reveal Map (fog: black unexplored,
   dimmed explored ground). *Working:* each reads on every tileset.

**Invisible from normal play, and where to look instead:**
- `test/terraintex.js` (new, in the gate, 40 checks): every tileset has four textures in the repository and in SOURCES.md and a
  complete grade; healing lifts a texture's dark flecks and nothing else; two stretches of ground a texture repeat apart come out
  alike laid plainly (correlation over 0.97) and unalike laid in squares (under 0.2); Space Platform's edge follows the tiles (0
  pixels on the wrong side; 387 with the blur); every bake is a pure function of the map and writes nothing to it. Twelve negative
  controls turn it red (`.claude/review/terrain/controls-terraintex.log`).
- The screenshots: `.claude/review/terrain/shots/p2-*` (the before/afters sent, the open ground, and `p2-overlays-*`: creep, decals,
  a placement ghost, fog, night, the sandstorm and units at full size on all five tilesets).

**Deliberately different from what was asked:**
- **Thirteen textures, 8.3 MB**, where "about 12, a few MB" was asked: three sets use their high-ground texture for their ramps too
  (a ramp's own texture shows at only 15%), so thirteen files cover sixteen slots; the megabytes are the 1k scans' own size.
- **Badlands changed slightly** although it was approved: the same textures and colours, laid in squares so its pale patches stop
  repeating. The before/after was sent.
- **Space Platform's plating is on the high ground and the stained sheet on the low**, the other way round from the research
  shortlist: laid that way first, the sheet's rust blotches marched across every plateau in rows. Desert's floor
  (`dry_ground_rocks`) was not on the shortlist, and its plateau sand (`aerial_beach_01`) was shortlisted for the floor.

**Numbers recorded:**
- High ground against low (each graded texture's mean luminance in linear light): Badlands 2.2, Jungle 3.5, Ice 3.5, Desert 3.9, Space
  Platform 5.7. Cliff rock against high ground: 0.45, 0.43, 0.45, 0.29, 1.0.
- The bake, in the browser, 256 chunks of Contested Ground (Ice), median a chunk: 10.1-10.6 ms laid plainly, 11.6-12.3 ms in
  squares (about 15% more). Healing a texture costs once, at load.
- Found while measuring, for phase 4: baking some 1,500 chunks in a few minutes in one page lost the game canvas (Chrome dropped
  its 2D context). That was a measuring loop, not play -- the game keeps at most 160 chunks -- but The Long March is 1,024 chunks
  and phase 4's speed work must not create canvases faster than they are freed.

## 112. Rocks, debris and plants on open ground, lit like the units

*(The user, 2026-09-13, the terrain queue's item 1: "Scattered rocks, debris and dry plants on open ground, lit like the units."
TODO-M18, THE TERRAIN QUEUE, phase 3. Drawing only -- `js/terrain.js`, `TERRAIN_PROPS` and `Terrain.propMask`/`propAt`/`drawProp`; the
build stamp does not move.)*

**Detailed terrain is still OFF by default** (phase 5 switches it on): add `?hd=1` to the game's address to see any of this.

**What changed for a player:**
1. **Open ground has props on every tileset**, on one allowed tile in five to seven on the natural tilesets and one in eleven on
   Space Platform, gathered into clusters and clearings rather than spread evenly:
   - *Badlands*: grey-brown boulders with a few small stones beside them, stone scatters, tufts of dry grass, fallen branches.
   - *Jungle*: mossy grey rocks, broad-leaved plants, ferns, exposed roots.
   - *Ice*: faceted ice chunks, dark stones with snow on their tops, frozen shrubs in little snow mounds.
   - *Desert*: pale sandstone boulders and scatters, dead bushes.
   - *Space Platform*: floor hatches cut from the plating they sit in, vent grilles, cable runs with clamps, scrap.
2. **They are lit like the units**: every rock face, leaf and cable is shaded by its own slope against the same sun in the upper
   left, and throws its shadow down and to the right.
3. **They are scenery only.** Nothing blocks, slows or hides a unit, and nothing about the game changes -- a replay or a network game
   cannot tell they are there. A prop stands only on open walkable ground: never on or next to a cliff, a ramp or a ramp's wall, a
   rock formation or any map feature; never within two tiles of a mineral patch or geyser (mined out or not); never in the three
   tiles round a base's town-hall site. Buildings, creep and hulks simply cover the ones under them.
4. **They never move.** Each prop is decided by its tile and the map's seed, so every player in a game, a replay and a reloaded save
   sees the same ones in the same places, and breaking a rock formation or mining out a patch adds or removes none.

**How to see it by hand:**
1. **Badlands.** Open the game with `?hd=1`, **Single Player -> Skirmish**, map **Lost Ruins**, START. Scroll down the ramp from your
   main. *Working:* stones and dry grass tufts scattered over the open ground, none on the ramp, its walls or the cliff edge, none in
   your mineral line or round your Command Center.
2. **Jungle.** Map **Contested Ground**. Scroll to the middle of the map. *Working:* mossy rocks, leafy plants and ferns in loose
   clusters with bare stretches between.
3. **Ice.** Map **The Long March** or **Nightfall**. *Working:* white faceted ice chunks and dark snow-capped stones on the snow.
4. **Desert.** Map **Dust Bowl**. *Working:* pale sandstone rocks and dead bushes, on the sand plateaus and the orange floor.
5. **Space Platform.** Map **Open Basin** with **Seed 1**. *Working:* hatches, vents and cable runs on the deck and the plating --
   subtle, part of the floor, not scattered icons.
6. **Light.** On any of them look at a single boulder: its upper-left faces are bright, its lower-right faces dark, and its shadow lies
   down-right -- the same as the units' shading and shadows next to it.
7. **Legibility in a fight.** Get a large battle going on open ground (or a 400-unit test fight). *Working:* every unit reads as clearly
   as on bare ground; the props disappear under the armies.

**Invisible from normal play, and where to look instead:** `test/terraintex.js` (in the gate) now checks the props too -- on seven maps
(every tileset, the largest map, and generated maps with rock formations) no prop breaks a placement rule and none covers or shades
a pixel outside its own tile's 3x3 block; about the set's density of the allowed ground has a prop; every kind draws a body and a
shadow; the shadow falls away from the sun; in the bake a boulder's sunward faces are brighter; props change only the pixels they
cover or shade; a prop crossing a chunk edge is drawn the same by both chunks; breaking every feature, dropping a hulk and mining out
a patch moves no prop. Fifteen negative controls turn it red (`.claude/review/terrain/controls-props.log`).

**Numbers recorded:**
- Props on the ground they may stand on (`test/terraintex.js`): Lost Ruins 19.2% (density 0.2), Contested Ground 20.7% (0.22), The Long
  March 14.0% (0.16), Dust Bowl 15.9% (0.18), Open Basin seed 1 7.9% (0.09), Chokepoint Valley 20.6% (0.22), Vertical Cliffs 16.7% (0.18).
  The Long March has 7,408 props; working them out for the whole map takes 33 ms once, inside the test harness.
- The bake, in the browser, 256 chunks of Contested Ground (Badlands), median a chunk, runs interleaved in one page: 18.5 and 18.7 ms
  without props, 20.0 and 20.0 with -- about 1.4 ms, 7.5%. (The same code measured 13.5-14.5 ms earlier in the session: compare only
  numbers taken side by side.)
- Judged on screenshots in four passes (`.claude/review/terrain/shots/p3v1-*` to `p3v4-*`, `p3-ba-*`): pinpricks and orange blobs;
  smooth clay eggs, snowball ice and lime-green stars; paw-print pebble rings, spider bushes and bone-shaped pipes; icon-like hatches on
  Space Platform. Density judged at 0.12, 0.2 and 0.3; 0.2 kept.
- 400 units on Contested Ground (Badlands, Jungle) with and without props: every unit reads the same (`shots/p3-battle-*`).

## 113. The zoomed-out view and the minimap show the detailed ground, and The Long March never stutters

*(The user, 2026-09-13, the terrain queue's item 4: "A matching zoomed-out view and minimap, plus a speed check on the biggest map."
TODO-M18, THE TERRAIN QUEUE, phase 4. Drawing only -- `js/terrain.js`, `js/render.js`, `js/hud.js`; the build stamp does not move.)*

**Detailed terrain is still OFF by default** (phase 5 switches it on): add `?hd=1` to the game's address to see any of this.

**What changed for a player:**
1. **Zoomed out, the map looks like the ground you zoomed out from.** The strategic view (zoom far out, where units turn into icons)
   was drawn in flat palette colours; it is now painted from the same textures, light and cliffs as the detailed ground, only
   smaller. The rocks, debris and plants are left out that far out -- at four pixels a tile they would be specks.
2. **The minimap is that same picture**, a pixel a tile -- snow, sand, plating and rock faces instead of flat blocks.
3. **Unit dots on the minimap have a thin dark rim.** On the new minimaps a brown player's dots all but vanished into Desert's ground
   (and the pale green-white player's into Ice's snow); with the rim every one of the eight lobby colours reads on every tileset.
4. **No more freezes when the camera moves on big maps.** Jumping the camera across The Long March used to freeze the game for about
   0.7 s, a diagonal scroll stuttered in 180 ms hitches, and breaking a rock formation froze it for half a second. Now the ground
   is drawn a piece a frame, nearest the middle of the screen first, with the zoomed-out picture standing in for any piece not
   drawn yet -- so for a moment after a big jump the edges of the screen look soft, then sharpen. Ground just off the edge of the
   screen is drawn ahead while nothing else needs doing, so an ordinary scroll finds it ready.
5. **Breaking a rock formation redraws only the ground round it.**
6. **The ground under a destroyed building's hulk stays flat.** If the screen was redrawn while a hulk stood on low ground, the
   detailed terrain drew a little plateau with cliff faces round the wreck (and kept drawing it after the hulk was gone).

**How to see it by hand:**
1. **The zoomed-out view.** Open the game with `?hd=1`, **Single Player -> Skirmish**, map **The Long March**, START. Zoom out with the
   mouse wheel until units become icons. *Working:* the far view is snow, blue shadowed low ground and grey rock faces, the same
   country as up close, not a flat blue and white map. Zoom in and out across the point where it switches: the picture does not
   jump.
2. **The minimap.** Look at the minimap on the same map. *Working:* it shows the textured ground. Then open **Skirmish** on **Dust
   Bowl**, give one of the computer players the **brown** colour in the lobby, and play until you have seen their units. *Working:*
   their dots are clearly visible on the orange minimap, with a dark edge.
3. **A camera jump.** On The Long March click the far corner of the minimap. *Working:* no freeze; the ground there is soft for a
   moment and sharp within about half a second.
4. **Scrolling.** Hold the arrow keys (or push the mouse to the screen edge) and scroll across the map, then diagonally. *Working:*
   smooth, with no hitches.
5. **Breaking a rock formation.** **Skirmish** on **Open Basin** with **Seed 1** (or Chokepoint Valley), send a few units to attack a
   rock formation or spire until it breaks. *Working:* no stutter when it breaks.
6. **A hulk.** Destroy a building (an enemy Supply Depot or Pylon will do) or a large unit (a Siege Tank, an Ultralisk) standing on
   low ground, scroll away and back while its wreck stands (a building's lasts a minute and a half). *Working:* the ground under the
   wreck is flat; no raised block with cliff edges.
7. **Textures arriving.** Reload the page (so nothing is cached in memory) and start a game. *Working:* in the first second the
   minimap turns from flat colours into the textured picture, without a freeze.

**Invisible from normal play, and where to look instead:**
- The frame times, measured in the browser on The Long March (1600x900, detailed terrain, before and after the change):

| What | Before: worst frame | Before: frames over 50 ms | After: worst frame | After: frames over 50 ms |
|---|---|---|---|---|
| Camera jump to ground never drawn | 694 ms | the jump | 23 ms (60 frames) | 0 |
| Scroll right at the default speed, 240 frames | 124 ms | 7 | 30 ms (1,440 frames, 6 runs) | 0 * |
| Scroll diagonally, 200 frames | 179 ms | 25 | 27 ms | 0 |
| Zoom to 0.6 over ground never drawn | 72 ms | 20 of 40 | 33 ms (90 frames) | 0 |
| Zoom all the way out | 39 ms | 0 | 2 ms | 0 |
| A rock formation breaks | 512 ms ** | 1 | 42 ms (three, Open Basin) | 0 |
| Scroll at zoom 0.45 | -- | -- | 24 ms | 0 |
| The textures arrive mid-game | -- | -- | 44 ms | 0 |

  \* Long runs turned up a few frames of 40-159 ms twice (2 in one 240-frame run, 3 in one 2,100-frame run) with no terrain, creep,
  sprite, fog or interface work in them -- instrumented function by function -- so the browser's own work, most likely collecting
  memory. The bake then stopped throwing away about 2 MB a chunk (its scratch grids and pixels are reused) and a chunk leaving the
  cache frees its canvas at once; the next 4,500 frames scrolling back and forth across the whole map had none over 33 ms (worst 29).
  \*\* Everything cleared at once, as every feature change did, forced on The Long March (it has no rock formations).
- One-off costs, at a game's start: the textured overview of The Long March takes about 200 ms to paint (the old first frame baked
  thirty chunks, about 600 ms); the minimap from it about 26 ms the first time.
- `test/terrainview.js` (new, in the gate, 24 checks): the hulk (the chunk, ramp levels, overview and classic chunk byte-identical
  with and without it), the overview against the chunks tile by tile (correlation 0.996; the palette's is off by ten times as much),
  the overview painted in steps byte-identical to painted at once, the minimap as the overview's average, the budget (one chunk a
  slow draw, three a fast one, nearest the middle first, the overview under what is missing, the ring and nothing beyond it, nothing
  ahead over the cap), a feature change dropping only nearby chunks and repainting only nearby overview, a new map dropping nothing,
  the textures' arrival stepping only on draws with nothing to bake, the minimap's rims. Sixteen negative controls turn it red
  (`.claude/review/terrain/controls-terrainview.log`).

**Deliberately different from what was asked, or not done:**
- **No web worker.** Baking chunks off the main thread was the planned second step (RESEARCH-TERRAIN.md 8.4); with the per-frame
  budget no frame measured over 50 ms, so it was not built.
- **The minimap's dots have a rim** -- a small change to how the minimap has always looked, made because the textured minimap hid a
  lobby colour.
- **A big camera jump shows soft ground for a moment** instead of freezing until everything is drawn.
- **Props are not drawn in the far view or on the minimap.**
- **Three existing suites were changed** because they counted on the whole screen being drawn in one frame: `zoom` fills the view
  before counting, `seldraw` lets the terrain settle before its before-and-after frame pair, `review17ui`'s source check looks further
  into the minimap function. The reason is written in each.

## 114. A mined-out mineral patch never opens a way through a cliff or onto a ramp's side

*(The terrain queue's leftovers, after phase 4. Phase 1 (item 110) left "latent side contacts" open -- places where something beside
a ramp could open its side once gone. Measuring them found a bigger hole under the mineral patches. TODO-M18, THE TERRAIN QUEUE.
The rule is `GameMap.wallMinedGround` in `js/map.js`; `test/ramps.js` section 2b holds it to its word.)*

**THE BUILD STAMP MOVES** (`js/map.js` is stamped; the new stamp is `ca141a3b7ffcb528`, it was `eff84c60f4bc9cf2`). Saves and
replays made before this commit are refused: the ground under some mineral lines has changed.

**What changed for a player:**
1. **Mining out a patch that stood on a cliff edge no longer leaves a way through the cliff.** Placing a mineral patch has always
   made the ground under it walkable, and where the patch sat on the edge of a plateau that ground was a step down the cliff --
   hidden while the patch stood, open once it was mined out. On every small Vertical Cliffs map, for one, each main's mineral line
   stands on its plateau's edge above a narrow lane along the map's edge: mined out, it became five back doors into the main.
   Measured over 1,037 maps: 3,140 such tiles on 210 maps (Vertical Cliffs small and medium, Chokepoint Valley small and medium,
   Island Chain small). The ground under those patches is cliff now, so the cliff stays whole when they are gone.
2. **A patch beside a ramp no longer reopens the ramp's side** when it is mined out (the walls of item 110 stay closed).
3. **A patch standing on a leftover piece of ramp in open ground leaves plain ground.** On Chokepoint Valley medium and large an old
   ramp ran under the natural's top mineral row; mined out, the row left a raised slab in the middle of the floor. The ground under
   those patches is now level with the ground round them (2,384 tiles on 147 maps).
4. **Nothing changes while the patches stand**: every unit, worker and building reaches exactly what it reached before, measured on
   all 1,037 maps. What you may notice is the drawing: the cliff edge under a mineral line is one unbroken edge now, where the old
   ground showed little notches between the crystals.

**How to see it by hand** (a patch has to run out, which takes a long game -- two ways):
1. **In a real game.** **Single Player -> Skirmish**, map **Vertical Cliffs**, size **Small**, START. Your main's mineral line runs
   along the edge of your plateau, above a narrow lane at the map's edge. Mine it out: nine patches of 1,500, about fifteen
   minutes of game time with a full line of workers (press **=** a few times to speed the game up). Then select a unit in your
   main and right-click the lane just past where the crystals were. *Working:* it walks out of your main by the ramp and round --
   never straight down through the old mineral line -- and the cliff edge there is unbroken.
2. **Quicker, in a browser, single player only.** Open the game in a browser (PLAY.bat), start the same skirmish, press **F12** and
   run `for (const r of G.map.resources.slice()) if (r.type === 'mineral') G.removeResource(r)` in the console: every mineral patch
   on the map disappears as if mined out (the console is not the command log, so never do this in a network game or a replay you
   mean to keep). Then do the same right-click. *Working:* as above. For item 3, the same on **Chokepoint Valley, Medium**: where
   the natural's top mineral row stood is plain floor, not a raised block.

**Invisible from normal play, and where to look instead:** `test/ramps.js` section 2b (in the gate, 31 checks now): on 57 maps
(every shipped layout, the archetypes at every size, an editor-made map) with every patch removed no ramp can be entered from a side
and no patch leaves a slope, where without the pass 3 open a ramp's side and 22 leave a slope; while the patches stand nothing a
unit or a 3x3 body reaches changes; every wall a patch leaves is joined to a cliff, none standing alone in the open; a patch on a
slab is levelled and no high ground is put beside low. Ten negative controls turn it red
(`.claude/review/terrain/controls-mined2.log`). Measured on all 1,037 maps: `.claude/review/terrain/mined-compare.log`,
`mined-live-v2.log`. Before/after screenshots: `.claude/review/terrain/shots/mined2-*`.

**Deliberately different, and found on the way:**
- **The first version walled every step under a patch**, and its before/after screenshots showed the flaw: on Chokepoint Valley the
  mined-out top row left a block of wall standing in the open (2,376 tiles on 147 maps joined to no cliff). A step is walled only
  where it is a cliff edge -- high ground on one side, low on the other -- and levelled where it is not.
- **Phase 1's "212 latent side contacts" were 190 geyser tiles and 22 mineral patch tiles** -- not spires or rock formations, as
  item 110's note guessed. A geyser is never removed, so those 190 can never open.
- **`aistyles` seed 5** (7 vs 10 in item 110): measured on sixteen seeds, on the code before the ramp walls and on today's. The check
  "harasser fields more of the fast units its table favours than turtle" passes on 13 of 16 in both, and only 7 of 16 seeds (before)
  and 8 of 16 (today) pass every aistyles check -- ten minutes on one seed separates the styles unreliably, as the suite's own
  comment says. It is that suite's noise, not the walls. It belongs to the AI rebalance (TODO-M18 7b), deferred by the user.
- **`test/editor.js`** (by hand, not in the gate) timed out in its network half: the relay counts five seconds down before a game
  and the test waited five seconds for the game to start. It now starts its relay with no countdown, as every other suite that
  starts a game does; with a six-second count its negative control goes red.
- **A correction to item 110:** `net_many`'s hashes differ from run to run because the relay picks a new seed for every game, so
  phase 1's hash differing from the one before said nothing about the ground. What the suite checks is that every client agrees.

**Numbers recorded (by-hand runs after the change):**
- `aistyles` seed 1: 132/132; seed 11: 132/132; seed 5: 131/132 (7 vs 10, the same as item 110). Sixteen seeds before and after the
  ramp walls: `.claude/review/terrain/seed-sweep.log`.
- `queens` 25/25; `eightplayer` 19/19 -- every player alive at 10:00, 16 of 16 bases claimed, 634 units, tick 2.46 ms a frame mean and
  4.50 worst segment (run beside four other suites, so slower than item 110's).
- `net_many` 51/51, no desync.
- Over the 1,037 maps (`mined-compare.log`): 3,156 tiles walled on 210 maps, 2,384 levelled on 147; 0 cells changed anywhere but under a
  patch, 0 maps with anything reached, a hall, a mirror symmetry, an elevation or a ramp problem worse; with every patch mined out 0 ramp
  problems and 0 slopes; 0 walls standing alone.

## 115. Detailed terrain is on for everyone, and Classic is one click away

*(The user, 2026-09-13, the terrain queue's item 5: "Switch it on by default and commit." TODO-M18, THE TERRAIN QUEUE, phase 5.
Drawing and interface only -- `js/terrain.js`, `js/ui.js`, `index.html`; the build stamp stays `ca141a3b7ffcb528`, and no save,
replay or network game can tell which look a player uses.)*

**What changed for a player:**
1. **Every game is drawn in detailed terrain from the start**, with nothing added to the address: photographic ground on all five
   tilesets, rocks and plants on open ground, the matching far view and minimap (items 111-113) -- and the walled ramps of 110 and
   114 were already everyone's.
2. **Classic is one click away.** **Settings -> Display -> Terrain** has two buttons, **Detailed** and **Classic**; in a game,
   **Esc -> Settings -> Terrain: Detailed** switches with one press. Either applies at once, in the middle of a game too, and is
   remembered the next time the game opens. Classic is the original painted look, lighter work for a slow computer.
3. **Switching never freezes the game**: the ground is drawn again a piece a frame, so for a moment the edges of the screen are soft,
   as after a camera jump. Measured on The Long March, the biggest map: no frame over 50 ms (the worst 47 ms).
4. **For screenshots and side-by-sides**, `?hd=0` at the end of the address shows Classic and `?hd=1` Detailed for that page,
   whatever the setting -- and changes nothing stored.
5. **The desktop app shows detailed terrain too** (checked on a build of it), **but the installers on GitHub do not have any of the
   terrain work yet**: they are built only when someone runs Actions -> Desktop builds -> Run workflow. `SHIPPING.md` says so for
   the day the final build ships.

**How to see it by hand:**
1. **Detailed by default.** Open the game the usual way (PLAY.bat, or the desktop app), with nothing after the address. **Single
   Player -> Skirmish**, map **Lost Ruins**, START. *Working:* photographic ground, rocks and plants, a lighter plateau with one crisp
   cliff edge -- not the flat painted look.
2. **Switch in a game.** Press **Esc -> Settings**. *Working:* a line **Terrain: Detailed** under HUD size. Press it: it reads
   **Terrain: Classic**, and behind the menu the ground turns to the painted look within a moment, the minimap with it. Press it
   again: detailed again. Zoom far out after each press: the far view is the same look.
3. **The Settings screen.** Main menu -> **Settings -> Display**. *Working:* **Terrain** with **Detailed** lit and **Classic** beside
   it, and a note that Classic is the original look, lighter on a slow computer. Click **Classic**, reload the page and start a game:
   classic. Click **Detailed** to go back.
4. **A slow computer.** If a big map stutters when you scroll, choose Classic and try again.

**Invisible from normal play, and where to look instead:**
- `test/settings.js` (7 new checks): detailed with nothing stored; Classic remembered; a malformed stored value is detailed; `?hd=`
  decides for a page and stores nothing; a switch drops the baked ground and moves the minimap's revision; choosing the look in use
  drops nothing; the in-game line switches both ways; the two buttons are on the Display tab.
- `test/terrainview.js` section 8 (6 new checks, texture data handed in): detailed before any setting is read; whole frames of a game
  on every tileset bake every chunk from the textures; switching to Classic bakes the palette's ground though the textures are
  loaded, with the palette's minimap and far view; switching back steps the far view in, 32 draws for Lost Ruins' 128 rows, never one.
- `test/terraintex.js` section 1b (3 new checks, the one phase 2 left open): from each texture's measured levels, every tileset's
  graded high ground is at least as much lighter than its low ground as the approved Badlands', and its cliff rock neither a black
  stroke nor a glare against its high ground.
- `desktop/window-check.js` (1 new check): inside the app detailed terrain is on, and all five tilesets' textures load and read back.
- 16 negative controls, every one red (`.claude/review/terrain/controls-p5.log`); the app's check went red on the build from before
  this phase and on one with a texture left out (`controls-p5-window.log`, `controls-p5-window-notexture.log`).

**Deliberately different from what was asked:**
- **Two buttons, not a checkbox.** Edge scroll, the model named for this, is a checkbox; the terrain's look is a choice between two
  named looks, laid out like the command card's Standard and Grid, so the one you are not using is named.
- **Not on a key.** StarCraft: Remastered switches its classic graphics on F5 (RESEARCH-TERRAIN 8.9); here F5 is Save game, and the
  in-game settings screen is one press away.

**Numbers recorded:**
- The gate with the default flipped, before anything else was changed: 100 of 100 (`.claude/review/terrain/p5-default-probe.log`).
- A switch in the middle of a game on The Long March, 1600x900, 120 frames after each (`p5-toggle-probe.js`):

| Switch | Worst frame, dropping the chunks (what shipped) | Worst frame, dropping the far view too |
|---|---|---|
| Detailed -> Classic, zoom 1 | 31 ms | 36 ms |
| Classic -> Detailed, zoom 1 | 47 ms | 211 ms |
| Detailed -> Classic, zoomed out | 22 ms | 21 ms |
| Classic -> Detailed, zoomed out | 10 ms | 185 ms |

- How light each graded material is, from the measured levels (`test/terraintex.js` 1b): high ground over low ground Badlands 2.22,
  Jungle 3.49, Ice 3.53, Desert 3.88, Space Platform 5.69; cliff rock over high ground 0.45, 0.43, 0.44, 0.29, 1.04 -- the numbers
  phase 2 measured in the browser.
- `desktop/window-check.js` on a debug build of the app (`npm run build:dist`, `cargo build`): 24 of 24. Its new check failed on the
  build from before this phase (no detailed terrain at all) and on a build with Ice's snow texture left out ("ice": false).

## 116. No dark grid lines on the ground when you zoom

*(The user's playtest, 2026-09-13, with a screenshot of their main on Blood Pit: "why do I see dark tile lines in a grid? remove them
or hide them if you can." Drawing only -- `Terrain.draw` in `js/terrain.js`; the build stamp stays `ca141a3b7ffcb528`.)*

**What changed for a player:**
1. **The ground has no dark lines in a grid any more.** Zoomed in or out from the normal view -- the mouse wheel, by any amount -- a
   thin dark line showed every eight tiles, across and down, on detailed terrain and on Classic alike. They are gone at every zoom.
2. **Why they were there:** the ground is drawn in squares of eight by eight tiles. At the normal zoom each square lands exactly on
   whole pixels; at any other zoom its edges fall between pixels, so the pixels along each edge were only partly painted by the
   squares either side and the black behind the map showed through. Each square is now drawn one pixel larger than itself, so the
   next one overlaps it -- a stretch of one pixel in two hundred, which cannot be seen. At the normal zoom nothing changes.

**How to see it by hand:**
1. **Single Player -> Skirmish**, any map (Blood Pit is where it was found), START.
2. **Roll the mouse wheel a notch or two** to zoom out (or in), and look at open ground away from the buildings. *Working:* smooth
   ground, no straight dark lines across or down it. Scroll around: none appear as the view moves.
3. **Esc -> Settings -> Terrain: Detailed** to switch to Classic, and look again. *Working:* no lines in the classic look either.

**Invisible from normal play, and where to look instead:**
- The browser, Blood Pit, detailed terrain (`.claude/review/terrain/seam-probe.js`): each boundary column and row of the view against
  the columns and rows two pixels either side, as mean brightness over the whole view.

| Zoom | Before: boundaries darker by more than 2 levels (worst) | After (worst) | The ground's own variation |
|---|---|---|---|
| 1 | 0 of 10 (0.3) | 0 of 10 (0.3) | 1.1 |
| 0.80 (the user's) | 12 of 12 (16.2) | 0 of 12 (0.7) | 0.7 |
| 0.6 | 14 of 17 (18.3) | 0 of 17 (1.0) | 0.8 |
| 1.5 | 7 of 7 (21.5) | 0 of 7 (0.2) | 0.5 |
| 0.45 and 2.6 | -- | 0 (0.8, 0) | 0.8, 0 |
| Classic, 0.80 | 12 of 12 (24.0) | 0 of 12 (2.0) | 3.5, its dither |

- Creep is drawn in the same squares and showed no line that could be measured -- its veins vary as much at the normal zoom, where
  nothing is resampled -- so it is unchanged.
- `test/terrainview.js` section 9 (3 new checks): from the terrain's own draw calls, at seven zooms and display ratios, every pixel on
  a boundary between two squares is covered whole by the square drawn first and the other is drawn after it; no square is stretched
  by more than a pixel; at the normal zoom each is exactly its size on whole pixels. Four negative controls, all red
  (`.claude/review/terrain/controls-seams.log`): no overlap, the overlap at the normal zoom too, five pixels over, and the squares
  drawn right to left.

## 117. Sharper ground and props on high-resolution displays

*(The user's playtest, 2026-09-13: "The resolution of the land and doodads is a bit low, can we increase its resolution without
ruining performance?" Drawing only -- `js/terrain.js` (`texBakeSteps`, `Terrain.refine`), `js/render.js` (`Render.resize`), `js/ui.js`;
the build stamp stays `ca141a3b7ffcb528`.)*

**What changed for a player:**
1. **On a display set above 100% scaling -- 125%, 150%, a Mac's Retina screen -- detailed terrain is drawn at the screen's own
   resolution.** Ground grain, stone facets, grass blades and cliff rock are crisp instead of stretched. Measured on the user's display
   (150%): the game drew everything at 100% and the browser stretched it, so each speck of ground covered 2.25 screen pixels, and the
   ground textures used half the detail their files have.
2. **The sharp detail arrives a moment after the view settles.** Ground that comes into view is drawn as quickly as before, then drawn
   again sharp a piece at a time, the middle of the screen first: the middle within about half a second, a whole screen in two to
   four seconds (at 60 frames a second). Scrolling and camera jumps stay as smooth as they were.
3. **Zoom in past the normal view (mouse wheel) and the ground sharpens on any display**, a 100% one included.
4. **The HUD, the menus and the in-game panels are crisper** on the same displays: everything drawn as shapes and text now uses the
   screen's own pixels.
5. **Unchanged:** a 100% display at the normal zoom looks exactly as before; the Classic look (Esc -> Settings -> Terrain) keeps drawing
   at a whole-number resolution, as its pixel pattern needs; units and buildings are drawn from the same sprite sheets as before.

**How to see it by hand:**
1. **Sharp ground.** On a display scaled above 100%: **Single Player -> Skirmish**, any map, START, and look at open ground near your
   base. *Working:* separate grass blades, stones with light and dark faces, fine grain in the dirt -- not a soft blur.
2. **Sharpening.** Click a far corner of the minimap. *Working:* the new ground appears at once, a little soft, and turns sharp from the
   middle of the screen outward within a few seconds; the game never stutters while it does.
3. **Scrolling.** Hold an arrow key and scroll across the map, then diagonally. *Working:* as smooth as before.
4. **Zoomed in.** On any display, roll the mouse wheel to zoom in. *Working:* the ground sharpens after a moment instead of staying blurry.

**Invisible from normal play, and where to look instead:**
- Measured in the browser on this machine's display (150%), Blood Pit and The Long March, detailed terrain:

| What | Before | After |
|---|---|---|
| Canvas for a 1538 x 1270 page | 1538 x 1270 (stretched 1.5x) | 2307 x 1905 |
| A chunk of ground, as it comes into view | 256 px, a median 12.0 ms to draw | the same |
| A chunk drawn sharp (384 px at 150%) | -- | a median 27.7 ms of work (p90 37), in steps of at most 4.5 ms, 8 ms a frame at most |
| Blood Pit at zoom 1: the middle / the whole screen sharp | -- | frame 32 / frame 141 (0.5 s / 2.4 s at 60 fps) |
| Blood Pit at zoom 0.8: the whole screen (48 chunks) sharp | -- | frame 240 (4 s at 60 fps) |
| Frames over 50 ms while sharpening | -- | none (the one at a game's start, the map picture, is as before) |
| The Long March, worst frame: camera jump / scroll / diagonal / zoom 0.6 | 18.8 / 20.8 / 22.7 / 17.5 ms | 18.8 / 24.9 / 17.0 / 20.0 ms (two runs each) |
| Preparing the sharp textures, worst frame (Ice's cleaned snow) | -- | 13 ms (56 ms before it was spread over frames) |
| Memory for sharp ground | -- | about 0.6 MB a chunk in view (some 35-50 chunks) and 9 MB of textures |

- `test/terraintex.js` 7 (5 new checks): the bake at the old resolution is byte for byte the approved one -- 20 chunks on five tilesets,
  the roughest and the most open, pinned in `test/terrain-golden.json` from the code before this change; sharp chunks at 1.5x and 2x,
  averaged over squares of four world pixels, are within 1.5 levels of that chunk (a neighbouring chunk is 51 off); props cover 2.25x and
  4x the pixels; a sharp chunk drawn over hundreds of frames, with other chunks drawn between its steps, comes out pixel for pixel the
  same as one drawn at once.
- `test/terrainview.js` 10 (6 new checks) and 9: which resolution each display and zoom gets; missing ground drawn first; one row a frame
  with no time to spare, one chunk a frame at most, the middle first; the old picture freed; nothing sharpened on a 100% display at the
  normal zoom; ground pieces meeting on whole screen pixels at 150%. `test/settings.js` (1 new check): the canvas takes the display's own
  ratio with detailed terrain and a whole one with Classic, switching the look resizes it. Thirteen negative controls, all red -- three
  only after their checks were strengthened: the pinned chunks were all open ground (a change to cliff shadow got through), the sharp
  comparison used flat chunks, and the camera sat on an even pixel (`.claude/review/terrain/controls-sharp.log`, `controls-sharp2.log`).

**Deliberately different from what was asked, or not done:**
- **Sharpness is not instant.** Drawing a screen of ground sharp at once would freeze the game for about a second; drawing it a little
  each frame after the old detail keeps every frame smooth. Unity's texture streaming makes the same trade (low detail first).
- **Units and buildings are not sharper.** Their sprite sheets are fixed-size pictures; making those sharper means redrawing every
  sheet at twice the size, a separate decision (and four times the memory for them).
- **Classic stays as it was** -- its checkered pixel pattern needs a whole-number resolution.

## 118. A game opens on its finished ground: a loading screen, and no old textures first

*(The looks queue, item 1 -- the user, 2026-09-14: "when the game first loads I see the old textures and then the new textures load in
after a second and a half delay. This looks super unprofessional, I can't ship like this. How can we fix this so the new terrain textures
are the only thing that's rendered. Brainstorm the best option and execute." Drawing and interface only -- `js/terrain.js`
(`Terrain.prepSteps`, `preloadTextures`, `texEntry`), `js/ui.js`, `js/hud.js` (`UI.drawPrep`); the build stamp stays
`ca141a3b7ffcb528`.)*

**What changed for a player:**
1. **Every game opens with a loading screen**: the map's name in gold, a picture of the whole map painted from its real ground, the
   players with their colours and races, and a bar that fills ("Loading terrain", "Painting the map", "Placing the ground").
2. **When it goes, the game already looks finished.** The first frame has the detailed ground everywhere on screen at your display's
   full resolution, with the minimap and the zoomed-out view painted from the same ground. The classic painted look never appears,
   pieces of ground no longer pop in, and nothing sharpens after the start. (Ground you scroll to later still sharpens a moment after it
   arrives, as in 117.)
3. **The ground's textures download while you are in the menus**, so the loading screen mostly prepares the start view: under a second
   on a 100% display, about two seconds on a 150% one.
4. **The game clock waits for the loading screen.** Nothing happens under it. In a multiplayer game a player who has loaded sees the
   game's first moment and "Waiting for other players..." until everyone's loading screen has closed; then all play together.
5. **If a texture file is missing, or the download stalls for 20 seconds**, the game starts anyway in the Classic look instead of hanging.

**How to see it by hand:**
1. **Close the game and open it again** (a fresh page, as a player gets it). **Single Player -> Skirmish**, any map, START. *Working:* a
   loading screen with the map's name, its picture, you and your opponent, and a bar that fills; then the game with photographic ground
   already everywhere on screen -- no flat painted ground first, no squares of ground swapping, no blur sharpening.
2. **Straight away.** Open the game and click START as fast as you can. *Working:* the loading screen stays a little longer; the game still
   opens on finished ground.
3. **The minimap.** Look at it on the first frame. *Working:* already the textured picture, not flat colours turning into it.
4. **Restart.** Esc -> Restart. *Working:* the loading screen again (about as long as the first: the ground is prepared again), then
   finished ground.
5. **Multiplayer.** Two browser tabs in one lobby, START. *Working:* each shows a loading screen; whichever finishes first shows the game
   with "Waiting for other players..." until the other is in, then both play.
6. **Classic look.** Esc -> Settings -> Terrain: Classic, then start a game. *Working:* a very short loading screen and the painted look.

**Invisible from normal play, and where to look instead:**
- Measured in the browser on this machine, Blood Pit, the start view at 1600 x 900:

| What | Before | After |
|---|---|---|
| Classic ground on screen at the start | from 130 ms to about 930 ms, replaced piece by piece | never (0 classic chunks baked) |
| First frame of the game | classic ground, detail arriving over the next 800 ms | every chunk on screen detailed and at the display's ratio |
| Loading screen, a 150% display, the textures fetched at boot | -- | 1.7-1.9 s (the start view's chunks at 1.5x are most of it) |
| Loading screen, a 100% display, the textures downloaded cold | -- | 0.9 s |
| Restart, a 150% display | -- | 1.6 s, 0 classic chunks |
| Worst frame of the game's first seconds | 91.6 ms | 15.9 ms (the work moved onto the loading screen) |
| Two tabs in one room, one tab's loading screen held | -- | the other waited at frame 3 (the input delay), "Waiting for other players..."; both ran together once it closed |

- `test/terrainview.js` section 11 (9 new checks), with an Image that decodes and texture files that arrive when the test says: twenty
  frames of loading screen while the files are on their way draw no world, bake no ground, hold the simulation and ignore a click; once
  they arrive the far view, the minimap and every chunk of the start view at 1.5x are made before the first frame, which replaces none of
  them; the far view is painted four rows a slice; the loading screen shows the map's name and picture; a texture of another set
  arriving drops nothing; textures that never come give up and start the game; the classic look bakes its start view first too; the boot
  fetches every set's files, and where no image can load (the other suites) a game starts at once. Twelve negative controls, all red
  (`.claude/review/terrain/controls-prep.log`).
- `desktop/window-check.js` (1 new check, 25 of 25 on a debug build): a skirmish started inside the desktop app opens behind its loading
  screen, bakes no classic chunk, and its first frame's chunks are all detailed at the display's ratio.

**The options weighed** (the user asked for the best of them):
- *Preload in the menus only* -- fixes most starts, but a player who clicks START quickly, a slow disk or a restart still sees the flash.
- *A low-resolution texture first, then the full one* -- still a visible swap from blurry to sharp.
- *A black screen until ready* -- looks like a hang.
- *Chosen: a loading screen that makes the first frame final, with the files fetched in the menus* -- the way RTS games start a match
  (StarCraft II's shows the map, the players and how far each has loaded); it covers the textures, the map picture, the minimap and the
  sharp ground at once, and it holds the game clock so no one loses time.

**Deliberately different from what was asked, or not done:**
- **A loading screen was added**, where the request was only that the old textures never show: it is what lets the first frame be final
  without a hitch, and it costs one to two seconds at the start of a game.
- **A restart prepares the ground again** rather than keeping it: the same map with another seed is different ground, and keeping
  chunks across games is a separate change for a second saved.

## 119. Creep is one continuous mass: no tiles, no lines, a soft edge

*(The looks queue, item 2 -- the user, 2026-09-14: "Zerg creep has a tiled look to it with defined edges. We need to make those edges
undefined so the creep looks like a continuous mass with no lines or tiles." And: "Can you find any free textures online that would work
for creep? We don't have to use that, but if we can, we should for greater realism." Drawing only -- `js/terrain.js` (`creepMatSteps`,
`creepBakeSteps`, `creepWork`), `js/render.js` (`Render.drawCreep`); the build stamp stays `ca141a3b7ffcb528`.)*

**What changed for a player:**
1. **With detailed terrain, creep is one wet, folded mass of dark purple flesh**, lit from the upper left like the ground and the units.
   Measured first: the old creep was a 192-pixel square of pattern that did not wrap, so its veins stopped at a straight line every six
   tiles -- a grid of squares over every field of creep -- filled with a pattern of dots, and cut off at a hard dotted edge with a dark rim.
   None of that is left: no squares, no dots, no seams, and no repeat you can pick out.
2. **Its edge is soft and ragged**: the creep thins over about a tile, in stringy fingers, over a faint dark stain on the ground, and wanders
   in and out rather than following the tiles.
3. **When creep grows** (a Hatchery finishing, a Creep Colony or a tumour spreading) the new creep appears on the whole screen at once, never
   a square at a time.
4. **At any zoom** the creep has no lines between its pieces, and far out it is drawn at a lower detail, so it costs less.
5. **Classic look** (Settings -> Terrain) keeps the old creep, which matches its dotted ground.

**How to see it by hand:**
1. **Single Player -> Skirmish** as **Zerg**, any map. Look at the creep round your Hatchery. *Working:* a dark, glossy, folded mass; no
   squares, no straight lines, no dot pattern; its edge fades out in ragged fingers.
2. **Grow it.** Build a Creep Colony at the edge of the creep (or plant a tumour with a Queen) and watch. *Working:* the creep spreads in
   rounded lobes, the whole visible change at once, no square of creep popping in beside an old one.
3. **Zoom.** Roll the mouse wheel out and in over the creep. *Working:* no grid lines through it at any zoom.
4. **Classic.** Esc -> Settings -> Terrain: Classic. *Working:* the old creep. Back to Detailed: the new creep again.

**Invisible from normal play, and where to look instead:**
- Measured in the browser, Blood Pit with a Hatchery, two Creep Colonies and two tumours grown out, at 1600 x 900 on a 150% display:

| What | Before | After |
|---|---|---|
| The creep's pattern | a 192 px square that does not wrap: a colour jump of 45.5 across its edge, 32.5 inside | made to wrap: 4.0 across its edge, 4.5 inside |
| Its edge | a hard dotted cut with a dark rim | thins over 36 world px (a tile), half there 9.5 px past the tile's edge |
| A piece of creep baked, a 150% display | -- | 256 px at 1x: 6.9 ms (18.1 ms at 1.5x, which could not be told apart) |
| Forty seconds of creep growing (22 changes) | -- | creep work at most 8.2 ms in a frame; frames p99 7.1 ms, one over 33 ms, none over 50 |
| The material, made once | -- | 373 ms, in slices while the menus are idle (the loading screen finishes it if needed) |
| Lines between pieces of creep at zoom 0.6 | 1.3 to 2.5 times the pattern's own variation | none above it (an apron of two pixels drawn over the neighbour) |

- `test/terraintex.js` 8 (9 new checks): the pattern wraps with no seam and is not posterised; a piece of creep has no dotted edge and no
  posterising, its edge thins over at least 12 world px and is half there within half a tile of the tile's edge; the coverage it is cut
  from never steps (a noise switched on at a threshold drew a line along that contour in a prototype); where two pieces meet, each one's
  apron is the other's edge to the level; a field a pattern repeat apart does not repeat (correlation 0.26); a creep tile three tiles
  away is in a piece's signature; pieces with no picture are baked at once; and growing creep swaps every changed piece in view on the same
  frame, the old pictures freed. `test/terrainview.js` 12 (3) and 11 (1): the apron drawn inside at zoom 1 and over the neighbours at 0.6;
  zooming in bakes finer creep; switching the look switches the creep; at a Zerg start every piece of creep in view is detailed before the
  first frame. Negative controls in `.claude/review/creep/controls-creep.log`, all red.

**Deliberately different from what was asked, or not done:**
- **No downloaded texture.** The creep's pattern is made in code (wet folded flesh from noise that wraps, lit like the ground), which
  tiles with no seam at any size and costs no download; the free textures found (ambientCG, 3dtextures.me) remain an option if you would
  rather have a photographed one -- say which.
- **Creep is drawn at 1x on a 150% display**, not at the display's full resolution as the ground is: side by side the two could not be
  told apart, and the sharper one costs two and a half times as much to make.
- **The creep's slow bubbling overlay is unchanged** (FIXLIST-M15 A3).

## 120. A game started while its tab is in the background starts, with its detailed ground

*(Found while measuring 119 in a browser tab that was not on screen. Interface only -- `js/terrain.js` (`DECODE_WAIT_MS`),
`js/ui.js` (`UI.simStep`); the build stamp stays `ca141a3b7ffcb528`.)*

**What changed for a player:**
1. **A game that starts while its window or tab is not on screen** -- minimised, behind another tab -- no longer sits on its loading screen
   for twenty seconds and then gives up to the classic ground. Measured in a tab not on screen: the loading screen took 21.3 s and the
   ground came out classic; now 1.2 s and detailed. A browser never finishes decoding an image for a page that is hidden, and the loading
   screen waited for it; it now waits a quarter of a second at most once the files are in.
2. **In a multiplayer game, a player whose tab is in the background at START no longer holds everyone at the first frame until they come
   back.** A hidden tab gets no animation frames, which is where the loading screen ran; it now runs from the game's own timer there.

**How to see it by hand:**
1. **Two browser tabs in one lobby.** Press START in one tab and switch straight to the other tab. *Working:* the game in the tab you are
   looking at starts after its loading screen and does not wait long on "Waiting for other players..."; switch back to the first tab after
   ten seconds -- its game is running too, on detailed ground.
2. **A skirmish in a background tab.** Start a skirmish and switch tabs at once; come back after five seconds. *Working:* the game has
   started (its clock is running) and the ground is detailed, not the flat painted look.

**Invisible from normal play, and where to look instead:**
- `test/terrainview.js` 11 (2 new checks): a decode that never settles holds the loading screen DECODE_WAIT_MS at most and the ground is
  detailed; a page hidden during its loading screen runs it from the simulation's timer, draws no frame, and starts the game. Two negative
  controls, red (`.claude/review/creep/controls-creep.log`, 11 and 12).

## 121. Cliffs look about twice as tall

*(The looks queue, item 3 -- the user, 2026-09-14: "Cliffs look a little short. Can we make them look about twice as tall to really show the
change in elevation?" Drawing only -- `js/terrain.js` (`CLIFF_W`, `CLIFF_EVEN`, `CLIFF_RISE`, `CLIFF_SHADOW`, `CLIFF_SHADE`,
`CLIFF_FLOOR`, in the bake and the far view); the build stamp stays `ca141a3b7ffcb528`.)*

**What changed for a player:**
1. **A cliff's rock face is wider**: about a tile and a third from the plateau's lip to the ground below, where it was two thirds of a tile,
   and more of it an even, steep slope rather than soft shoulders.
2. **Plateaus and rock formations throw their shadows about twice as far** onto the ground below them -- down and to the right, away from
   the sun, like every unit's shadow -- and a little darker.
3. **A cliff face in shadow shows its rock** instead of going nearly black.
4. **Ramps look as they did**: their slope and their own shadow are unchanged, so a ramp still reads as a gentle way up.
5. **The zoomed-out view and the minimap follow** the same cliffs.
6. **Unchanged:** where units can walk and build; the Classic look.

**How to see it by hand:**
1. **Single Player -> Skirmish** on **Lost Ruins**, any race. Look at the edge of your main's plateau beside its ramp. *Working:* a broad
   band of rock face along the plateau's edge, with a long shadow below and to the right of it; the plateau clearly stands above the floor.
2. **The ramp.** Look at the ramp itself. *Working:* lit as before, not dark.
3. **Rock formations.** Look at a rock formation in the open. *Working:* a longer shadow to its lower right.
4. **Zoom out** with the mouse wheel. *Working:* plateaus in the far view carry the same longer shadows.
5. **Other tilesets.** Skirmish on a Jungle, Ice or Desert map. *Working:* the same taller look, no odd spikes or lines at ramps.

**Invisible from normal play, and where to look instead:**
- Measured on a straight plateau edge at ratio 1 (`.claude/review/cliffs/probe-cliff.js`, the scene of `test/terraintex.js` 9):

| What | Before | After |
|---|---|---|
| The drop, Badlands / Space Platform | 22.2 / 17 world px | 33.2 / 27 |
| The floor darkened past an east-facing cliff | 6.6 / 4.3 px | 16.4 / 14.7 |
| ...past a south-facing cliff | 18.9 / 14.9 px | 30 / 24.9 |
| A ramp's foot against the open floor | 1.594 / 3.496 | 1.593 / 3.489 |
| The far view against the chunks, tile by tile round Lost Ruins' main | -- | correlation 0.994 |

- `test/terraintex.js` 9 (7 new checks): the chunks and the far view both draw cliffs from the six CLIFF_ constants; on Badlands and Space Platform the drop is at least 1.4 times as wide as before, the shadow reaches
  at least twice as far past an east-facing cliff and 1.5 times past a south-facing one, and a ramp's light is within 0.02 of before. The
  pinned chunks (`test/terrain-golden.json`) were written again on purpose: the ten with cliffs, ramps and rock moved, the ten of open
  ground with props did not change a byte. Seven negative controls, all red -- two only once the far view's constants were checked: its tile-by-tile match with the chunks moved by a level or two with its shadow or drop left as they were (`.claude/review/cliffs/controls-cliffs.log`, `controls-cliffs2.log`).

**Deliberately different from what was asked, or not done:**
- **"About twice as tall" is the shadow and the face, not a view from the side.** A top-down picture shows height by the width of a cliff's
  face and the reach of its shadow: the shadow is twice as long and the face half as wide again. A face drawn taller on south-facing
  cliffs only, as a camera tilted towards the north would see it, was tried: the facing read from the ground's height drew spikes where a
  ramp's wall meets a plateau and lines where it changed from tile to tile (`.claude/review/terrain/shots/cliff-variants-3`, `cliff-sets-1`).
- **The wider face reaches about a sixth of a tile onto the walkable ground either side of the cliff tile.** Only the picture: where units
  walk and build is unchanged.

## 122. Every map laid out the way StarCraft II lays its maps out

*(The looks queue, item 4 -- the user, 2026-09-14: "All of the maps are very uninspired. Look at images of actual StarCraft II maps and
redesign the layout of all maps in the game according to the generalized structure that StarCraft II maps have." The layouts are
`MAP_LAYOUTS` and `MAP_SIZES` in `js/map.js`, the generated ones `Archetypes`; the research and what was chosen, RESEARCH-TERRAIN.md
8.14; `test/maplayouts.js` is new.)*

**THE BUILD STAMP MOVES** (`js/map.js` is stamped; the new stamp is `678387e310c2c3fe`, from `ca141a3b7ffcb528`). Saves and replays made
before this commit are refused, as they should be: the ground they were played on has changed.

**What changed for a player** (pictures: `.claude/review/terrain/shots/looks4-*.png`, before on the left, after on the right):
1. **Every map follows StarCraft II's skeleton.** Your main is on high ground with one ramp down; the ramp empties towards your natural,
   the nearest base on foot, which sits behind a choke; your thirds are further out; later bases are further still and more exposed; the
   middle is broken into lanes by rock; a back door into your side is shut by rocks you can destroy. Every base's minerals now sit on the
   level of its town hall, clear of the map's edge.
2. **Lost Ruins** (128, four players), after StarCraft II's Lost Temple: your ramp runs east along the top of the map to a natural beside
   your main; a linear third below your main, with a narrow path to it from the natural under your cliff that a small rock formation
   shuts; a ruined temple on high ground in the middle with a rich base (5000 a patch) on each corner, climbed by a wide ramp in the middle
   of each side; broken pillars through the middle ground. Four bases a player, as before.
3. **Blood Pit** (128, four players): close corners and a pit in the middle -- a ring of rock round the centre, open at its west and east
   gates and shut by rocks at its north and south ones, with four rich bases on the pit's floor. Your natural is below your main's ramp,
   your third along the top or bottom edge. Four bases a player (was three).
4. **Twilight Valley** (128, two players) is now turned half round the centre, as StarCraft II's one-against-one maps are, instead of
   mirrored four ways with two empty corners. Seven bases a player (was five): main, natural, a linear third down the west edge behind a
   rock-shut back door, a triangle third along the north edge, a fourth in the far corner, a fifth on the north edge, and a rich base past
   the western lane; a watch hill in the middle, climbed from north and south, with rock masses turning the middle into three lanes. Main
   to main is 128 tiles on foot (was 115).
5. **Close Quarters** (small, 96, two players): no longer a featureless duel. Your main is up a ramp (the map had no high ground at all),
   with a natural below it and a third along the top edge -- three bases a player (the two mains used to share two); a watch hill in the
   middle; rocks shut a back door into the natural. Turned half round, not mirrored. Main to main 92 tiles on foot (was 64).
6. **Contested Ground** (medium, 128, four players): main, natural, a third along the top edge, and a fourth on a central plateau every
   player can climb by a wide ramp in the middle of each side -- four bases a player (was three); back doors down the west and east edges.
7. **Broken Expanse** (large, 192; also **Dust Bowl** and **Nightfall**): seven bases a player (was five) -- natural, a linear and a
   triangle third, a fourth on a high pod in the broken middle, a sixth out by your neighbour, and the fifth on the central plateau.
8. **The Long March** (huge, 256): eight bases a player (was seven), at 1300 a patch (was 1100), so a player's whole territory is still
   worth about what large's is (66,300 against 67,500 minerals); a high pod each, long ridges across the lanes, a great central plateau.
9. **The generated maps**: the **Open Basin**'s mains are now up a ramp like every other map's, its naturals a little further out. A
   **two-player generated map** (any archetype on the small size) used to leave two corners empty; they now hold expansions where a main and
   a natural would be, fairly: each corner's bases are the half turn of the opposite corner's.
10. **Unchanged:** unit stats, the terrain's look, the size modes' patch and gas rules except The Long March's patch, how many players each
    map takes, and every generated map's shape (river, channels, terraces, open middle).

**How to see it by hand:**
1. **Single Player -> Skirmish -> map Lost Ruins**, any race. Press **Enter**, type **black sheep wall**, **Enter** (the map is revealed; single
   player only), and zoom out with the mouse wheel. *Working:* your main in a corner on high
   ground, its one ramp running east to a natural along the top edge; the temple in the middle with a rich base on each corner and a ramp
   in the middle of each side. Select a mineral patch at a temple base: *5000*.
2. **Walk a worker** from your natural towards the base below your main (south-west). *Working:* the short path under your main's cliff is
   shut by a rock formation; attack it (it takes a while) and the path opens.
3. **Twilight Valley.** *Working:* the enemy main is in the opposite corner, and the other two corners hold bases (not empty plateaus); the
   map looks the same turned upside down, not left-to-right.
4. **Close Quarters** (map sizes -> small). *Working:* your main is on high ground with a ramp; a small hill in the middle.
5. **Contested Ground, Broken Expanse, The Long March.** *Working:* a central plateau with bases on it and a wide ramp on each side;
   on the large and huge maps a small plateau with a base between your side and the middle.
6. **Play a computer opponent** on Lost Ruins, reveal the map as in step 1, and watch its corner for four or five minutes. *Working:* its
   first expansion is the natural beside its main, not the base below its main.
7. **Generated maps: Skirmish -> map Procedural: Open Basin**, size auto. *Working:* your main is on a small plateau with a ramp. Then
   **Procedural: Chokepoint Valley**, size **small**: *Working:* all four corners hold bases.

**Invisible from normal play, and where to look instead:**

| Map | Bases a player | Minerals a player | Main to main on foot | High ground tiles |
|---|---|---|---|---|
| Lost Ruins | 4 -> 4 | 40,500 -> 63,000 | 120 / 102 / 106 -> 142 / 104 / 137 | 4520 -> 3668 |
| Blood Pit | 3 -> 4 | 30,000 -> 61,500 | 110 / 100 / 101 -> 159 / 119 / 107 | 356 -> 1916 |
| Twilight Valley | 5 -> 7 | 72,000 -> 94,500 | 115 -> 128 | 5460 -> 1994 |
| Close Quarters | 2 -> 3 | 32,000 -> 46,000 | 64 -> 92 | 0 -> 1226 |
| Contested Ground | 3 -> 4 | 31,500 -> 40,500 | 111 / 100 / 106 -> 134 / 119 / 107 | 3624 -> 3400 |
| Broken Expanse | 5 -> 7 | 49,500 -> 67,500 | 198 / 164 / 170 -> 203 / 185 / 169 | 5480 -> 7332 |
| The Long March | 7 -> 8 | 49,500 -> 66,300 | 263 / 228 / 234 -> 267 / 249 / 231 | 8392 -> 10116 |

(Walking distances with every rock formation shut, from the first start to each other start: `.claude/review/maps/probes/rush.js`.)
- **`test/maplayouts.js`** (new, 27 checks): the layout language (rot2 painting and copying, poly, line, faces); on every fixed map one ramp
  down from each main, the natural on low ground and nearest on foot, three or more bases a player, every resource on its hall's level and
  inside the playable ground, every rock formation in a real gap (ten tiles or more of detour saved), no mineral line in siege range of
  high ground that is not its own, the two-player maps turned half round with bases in every corner, the computer player's first pick its
  natural; and on the generators' two-player maps, full and fair corners. **Seventeen negative controls, every one red**
  (`.claude/review/maps/controls-maps.js`, log `controls-maps.log`); one first stayed green and was moved closer (logged).
- Changed checks, each measured first (`.claude/review/maps/probes/`): `verticality` (every main on all 60 maps is on high ground;
  central plateaus; the old Twilight Valley's rich-geyser hole kept as a fixture), `mapmodes` (territory computed, every size's mains
  high), `mapfeatures` (the fixed maps carry exactly their listed rocks), `ramps` (the two pictured ramps re-drawn; the climb re-staged
  on the east-running ramp), `craters`, `creepspeed`, `features`, `forceattack`, `seldraw`, `saveload`, `overlap`, `zerg12` (its AI
  game runs 30,000 frames: on the new ground the Zerg's first M12 tech comes at 18:07-18:55 on all three seeds), `terraintex` and `aistyles` (both keep the
  ground they were calibrated on as a fixture: the approved bake's golden chunks match byte for byte, and the style games are the old
  Lost Ruins -- see below), `terrainview`. The gate is **101 suites**.
- **By hand:** `net_many` 51/51. `aistyles` on its pinned ground: seed 1 132/132, seed 11 132/132, seed 5 131/132 (the known harasser
  line, TODO-M18 7b) -- every style row identical to before this item; `queens` 25/25; `eightplayer` 19/19.

**Deliberately different from what was asked, or not done:**
- **The style comparisons in `test/aistyles.js` run on the old Lost Ruins**, kept in the test. On the new one three of those loose,
  single-game comparisons flip with no style changed (seed 1 and 5: "expander commits a bigger first wave than standard"; seed 11: both
  of the rusher's against standard -- `.claude/review/aipace/looks4c-aistyles-*.log`). Re-calibrating them is the AI rebalance's (7b),
  which waits for you.
- **Lost Ruins' linear third moved five tiles south, not the AI.** The computer player picks its next base by straight line, and with the
  third first drawn 27 tiles from the main against the natural's 30 every AI took the far third first. An AI that takes the named
  natural first was written and measured (`.claude/review/maps/ai-natural-first.js.txt`); it did the same thing the moved third does and
  is not in, so the AI's code is unchanged.
- **No watchtowers, sight blockers or mineral walls** -- the engine has none; a high-ground hill is the watch post. Two heights, not three.
- **Rich bases hold more (5000 a patch) but look like any other**; StarCraft II colours them gold.
- **The generated maps keep their shapes** (the river, the channels, the terraces, the open middle): they gained the main up a ramp
  (the basin) and full corners on two players, not a new layout.

## 123. Creep made from the texture you picked: Abstract Organic 002

*(The user, 2026-09-17, choosing from the twelve free textures shown to them after item 119: "use abstract organic for creep -
implement now", and "yes" to downloading its two files. `js/terrain.js` (`CREEP_SRC`, `CREEP_TEXMAT`, `creepMaterial`,
`creepSrcSteps`, `creepTexelSteps`); `assets/terrain/Abstract_Organic_002_COLOR.jpg` and `_DISP.png`, CC0, recorded in
`assets/terrain/SOURCES.md`. Drawing only: the build stamp stays `678387e310c2c3fe`.)*

**What changed for a player** (picture: `.claude/review/terrain/shots/creeptex-before-after.png`):
1. **Zerg creep on detailed terrain is the texture you picked**: wet, folded flesh with glossy highlights, like the texture's preview.
   Its light and dark come from the texture's colour map and its relief and gloss from its displacement map.
2. **It stays Zerg purple.** The texture itself is olive; the creep keeps its dark purple, as agreed before the download.
3. **One repeat of the texture covers ten tiles**, and two samples of it are mixed so no repeat shows.
4. **The creep's edge is unchanged** (item 119): soft, ragged and continuous, now pushed about by the texture's own ridges.
5. **A game waits for the texture on its loading screen**, as it waits for the ground's; if the files cannot load, the game starts at
   once with the creep made in code (the look of item 119).
6. **Unchanged:** where creep spreads; the Classic look's creep.

**How to see it by hand:**
1. **Single Player -> Skirmish**, race **Zerg**, any map, START. Look at the creep round your Hatchery. *Working:* dark purple folds that
   look wet, with glossy highlights; no lines, no tiles, no repeating pattern.
2. **Build a Creep Colony** (drone -> build -> Creep Colony) near the edge of the creep and wait for it to spread. *Working:* the new creep
   is the same texture and appears without a seam against the old.
3. **Zoom in** with the mouse wheel. *Working:* the folds get sharper, still no repeat.
4. **Esc -> Settings -> Terrain: Classic**, then **Detailed** again. *Working:* the classic creep, then the texture again.

**Invisible from normal play, and where to look instead:**
- Made at 1024 texels in 89 ms, no slice longer than 4 ms (the creep made in code: 538 ms); its two files are 845 KB together.
  Before a fix, one slice sorted a million texels and took 78 ms; the percentiles now come from histograms.
- `test/terraintex.js` 1 and 8b (8 new checks): the files are in the repository and recorded; where no image can load, the creep is the
  one made in code, byte for byte; made from a texture, the flesh follows its colour map (correlation 0.99) and its light the height
  map's slope towards the sun (0.66, with the flesh's own height taken out); an olive texture makes purple creep; it tiles with no
  seam; its strands push the edge as far as the made material's; the edge still thins over 37 px; a field of it one texture repeat long
  does not repeat (0.15). `test/terrainview.js` 11 (2 new): the loading screen waits on the creep's files ("Growing the creep") and
  then makes the creep from them; a file that fails does not hold the game. Ten negative controls, every one red
  (`.claude/review/creep/controls-texcreep.log`).

**Deliberately different from what was asked, or not done:**
- **Purple, not the texture's olive** (said before the download).
- **Two of the texture's five maps**: the colour and the displacement. The game lights creep from a height, as it lights the ground, so
  the normal, occlusion and roughness maps would add nothing; the 4K version is for paying supporters only.
- **The relief and the gloss are much stronger than the colour map alone would give**: the texture's own preview is a wet, folded ball,
  and six variants were judged on screenshots (`.claude/review/terrain/shots/creeptex-tune1`, `-tune2`).
- **The desktop installers do not have it yet** -- SHIPPING.md: rebuild them before shipping.
