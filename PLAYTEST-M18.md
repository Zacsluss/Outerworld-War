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
is item 69.)*

**What was asked.** "A research or upgrade begins and never finishes." Never reproduced, so the brief was
to write a probe first and let it name the case rather than guess at one.

**What was built.** Two probes, both kept in `.claude/review/` and both re-runnable:

- `node .claude/review/stall-probe.js --minutes=25 --seeds=3,7,11` — plays three 25-minute
  six-player games with hard AIs of all three races and reports every production slot whose progress
  stops advancing for more than ten seconds, with the state of the building at that moment.
- `node .claude/review/stall-scenes.js` — eleven directed scenes that each *create* a candidate cause on
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
confirm." **7b, the rebalance, is gated and has not started.**)*

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
