# PLAYTEST — M18

Continues `PLAYTEST-M17.md`, whose items run to 63. The numbering carries straight on. `TODO-M18.md` is
the open list this work comes from; each item below names the task it closes.

Everything here is reachable from the front menu with no flags, unless the item says otherwise.

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
