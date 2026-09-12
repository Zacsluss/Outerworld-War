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
