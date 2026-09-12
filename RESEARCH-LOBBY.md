# What makes a real-time strategy lobby great

*Seventh session, user item 2: "Do some research and find what makes a real-time strategy game lobby great -- examples
would be Beyond All Reason, Supreme Commander Forged Alliance, StarCraft 2. We need to have a truly sophisticated set
of menus and online lobby as well."*

This is the research, the gap between it and what this game had, and what was built from it. What was built is in
`PLAYTEST-M18.md` (items 82 onward) with how to try each piece by hand.

**About the sources.** The official pages for Forged Alliance Forever, Age of Empires II: DE and Liquipedia refused
automated fetches (HTTP 403), so where a claim below comes from a search summary or from how the games are commonly
known to behave rather than a page that was read, it says so. Nothing here is invented to fill a gap; where a detail
could not be confirmed it is left out.

---

## 1. The four lobbies

### StarCraft II (custom games)
- **The list shows real lobbies, not just maps.** Patch 3.19 (2017) replaced "games with open lobbies" with the lobbies
  themselves: each has a **name** the host gives it, the **owner**, **open slots**, and the **team composition and
  human/AI counts**. It also **removed auto-start when a lobby fills**, and removed the "Play" button that dropped new
  players into a lobby as host without knowing it. *(Blizzard Watch, patch 3.19 preview.)*
- **Slots** are open, closed or computer (with difficulty), each with **race, colour, handicap**, on a team; there are
  **observer** slots. A map can hide attributes (race, colour, handicap, difficulty) and **lock teams** so players
  cannot switch once in the lobby. *(StarCraft II editor guides: Game Variants, Player Properties.)*
- **A countdown** runs before the game, and the lobby is frozen while it does. *(Editor guides.)*
- Game settings the host sets and everyone sees: speed, locked alliances, privacy (public/private).

### Supreme Commander: Forged Alliance Forever (FAF)
- **Up to 12 players plus any number of observers**, **auto-teams**, a **big map preview**, and scores can be disabled.
  *(ModDB, "New lobby for multiplayer FAF".)*
- **Connection quality is on screen**: the lobby pings every player and shows a **ping bar** for anyone with high ping;
  **CPU score** is shown because a slow machine slows the whole simulation. *(FAF forums, "Ping Test tool on lobby";
  search summary.)*
- Commonly known behaviour (not confirmed from a page that loaded): each player row carries a **rating**, a **country
  flag**, faction, colour, team and **start position** (players are placed on spots on the map preview); **changing a
  game option clears everyone's ready state**; the host launches once all are ready.

### Beyond All Reason (BAR)
- Multiplayer is a list of **battle rooms run by autohosts**, controlled by chat commands and **votes**: presets
  (`!preset teams` / `!preset ffa`), **map choice and a random map**, **start boxes** drawn on the map (`!split`), and
  **skill-based team balance** (`!autobalance`, `!balancemode`, `!rebalance`, `!force player team n`).
  *(BAR news, "How to set up a match".)*
- **Readiness is social**: `!ring` reminds the players who have not clicked Ready, `!start` launches once all are ready,
  and `!forcestart` is a **vote** to begin anyway (an uneven 2v3). *(Same.)*
- **Spectating**: you can **join a running game as a spectator** from the list, and an AFK player can be moved to
  spectator (`!spec`). *(Same.)*
- Teams vs ally teams are distinct: players with the same *ally* number are allied. *(Same.)*

### Age of Empires II: Definitive Edition
- **The browser filters** by game type, map type and speed; a host picks **visibility** (who sees the lobby),
  a **password**, **allow spectators** and a **spectator delay**, and can **hide civilisations** until the game starts.
  **Everyone readies, then the host starts.** *(Age of Empires support, "How do I create a multiplayer match"; search
  summary.)*

### What the UX writing says (applies to any lobby)
- Keep the core facts of a match together in one view, filter by what the player wants rather than by genre, and have
  every interaction say what happens next. *(EJAW, "Designing a game lobby UX".)*
- The owner invites friends; the lobby is where a group coordinates before it plays. *(Microsoft PlayFab, lobby and
  matchmaking.)*

---

## 2. What they have in common: eight properties

1. **Getting in is fast.** A list, a quick way into a game with room, a link a friend can click, and a name the game
   remembers.
2. **You know what you are joining before you join.** Title, host, map, players and how many are human, speed, and
   whether it is already running -- searchable and sortable.
3. **Nothing changes under you.** Ready is consent to the settings on screen: change a setting and the consent is
   withdrawn. The start is a countdown everyone sees and anyone leaving cancels.
4. **Everyone sees the same truth.** The map with its start positions and the team colours; the settings, read-only for
   everyone but the host; and a line in chat for every change, so nobody is surprised by one.
5. **Fair teams, fair connections.** Teams can be shuffled or evened out and locked; everybody's latency is visible
   before the game, not discovered in it.
6. **Room for more than players.** Observers who watch without affecting the game.
7. **A social layer.** Chat with player colours and system lines, a nudge for the player holding everyone up, kick.
8. **It survives the internet.** Rejoin after a drop, and a clear refusal when two builds cannot play together.

---

## 3. This game, measured against them (before this work)

| | Had it | Missing |
|---|---|---|
| 1. Fast in | lobby browser, host, join by code, copy code | a link that joins by itself; quick join; a remembered name and server |
| 2. Know before joining | title, host, map, count, running or not | search, filters, sort; humans vs AI; speed; open seats |
| 3. Nothing changes under you | a ready toggle; a relay-owned countdown, cancelled by anyone leaving | **ready did not gate START**; changing the map or speed left everyone "ready" |
| 4. Same truth | map preview with start spots in seat colours; settings visible to all | no line in chat when a setting, a team or a slot changed |
| 5. Fair | teams, AI slots with difficulty and style, kick | shuffle / even teams; lock teams; **no latency shown at all** |
| 6. More than players | -- | spectators |
| 7. Social | chat, kick | player colours and system lines in chat; nudge |
| 8. Internet | rejoin by name, build-stamp refusal for saves | -- |

Also missing from the online lobby entirely: **the skirmish rules**. The skirmish screen offers map size and archetype,
weather, day and night, destructibles, derelicts, wildlife and the starting bank, and all of them are `G.init` options
the simulation already honours -- but a network game could only pick the map and the speed.

And the menus: Settings was one panel of checkboxes. The HUD size, which the player has had to ask about twice, could
not be changed at all.

---

## 4. What was built

| Property | Built | Where |
|---|---|---|
| 1. Fast in | QUICK JOIN; an invite link that connects and joins by itself; name, server and race remembered; a click on a game that has gone says so | `js/net.js` (`quickPick`, `inviteLink`, `parseInvite`, identity), `js/ui.js` boot, relay `existing` |
| 2. Know before joining | search, full / in-progress filters, three sorts; columns for speed and status; a detail pane with the map, the players and the rules | `Net.browserHtml`, `Net.filterRooms` |
| 3. Nothing changes under you | START refuses until every other human is ready and names who; a change to the game withdraws every ready, a player's own change only theirs | relay `start`, `unreadyAll` |
| 4. Same truth | a chat line for every change nobody made themselves; seat numbers on the map preview; the rules visible to all | relay `sys`, `Net.sysText` |
| 5. Fair | every human's measured latency against the command delay; shuffle and lock teams; the map's start count enforced (a fifth player on a four-start map used to be built in player one's base) | relay lobby ping, `shuffle`, `lockTeams`, `capOf` |
| 7. Social | player colours in chat; the nudge | relay `ring` |
| 6. More than players | spectators: join a lobby or a running game to watch, with the whole map in view; no seat, no ready, no batch anyone waits on; a player can step out to watch and back in | relay `specs`, `catchUp`; `Net.gameOptions` (the observer mode); `test/spectate.js` |
| Rules parity | starting bank, weather, light, destructibles, derelicts, wildlife, map sizes and procedural maps, composed by the skirmish screen's own functions | `Net.gameOptions` |

And the menus: **Settings in tabs** (Game, Display, Audio, Multiplayer, Controls) with a remembered **HUD size**, scroll speed, edge scrolling, one master volume and the multiplayer identity; the in-game settings screen steps the same values (`test/settings.js`).

Still not built, and why: a **rematch / back to the same lobby** after a game (the relay would have to hand a finished room back to its lobby while a player may still be watching the end of it -- a design of its own); **ratings and skill balance** (nothing records a result to rate); **start-position choice** (a seat is its start, and choosing one means reading it in the stamped `G.init`).

Tests: `test/lobby.js` (relay over real sockets, and the client in a VM with the real skirmish functions), with negative
controls in `.claude/review/lobby/controls.js`.

---

## 5. Every key, where a player looks for it

*Eighth session, the user's item 5: "Remove the hotkeys settings as currently shown. Hotkeys should be moved into
controls. All controls in Hotkeys should be customizable."*

**StarCraft II** (Options, Hotkeys; the profiles are commonly known and listed by Liquipedia, whose page refused the
fetch). A player picks a **profile** -- Standard, Standard for Lefties, Grid, Grid for Lefties, Classic -- and any of them
can be copied into a custom profile and edited. The editor is organised the way the game is played: pick a race, pick a
unit or building, and its **command card** is shown with a key on every button. A command shared by many units (Move,
Stop, Attack) is one command, so changing it on one card changes it on every card. The open-source
`jcfieldsdev/starcraft2-hotkey-editor`, which reproduces the in-game editor, states the two rules outright: conflicting
keys "are highlighted in red", and the editor lists "all units with that exact same command" because they "will also be
affected when this hotkey is edited". Every command can be reset to its default.

**OpenRA** (read from its source, `HotkeysSettingsLogic.cs`). Settings has a Hotkeys panel: hotkeys in groups, a filter
by context, click one and press the new key. A key already used is not silently taken: the panel names the hotkey that
has it and offers **OVERRIDE**. Each hotkey has its own reset, and the panel has a reset for all.

**What this game had.** The global keys (camera, selection, speed) could be rebound on a separate Controls screen reached
by a button inside the Settings tab called Controls. The command card's letters could not be changed at all: they came
from the unit tables, and a **Brood War / Grid** dropdown on the Game tab chose between those letters and QWER / ASDF /
ZXCV. An earlier milestone kept the two apart on purpose ("what letter builds a Barracks" against "what key centres the
camera"); both research sources put them in one place.

**What was built.** The keys are the **Controls tab** itself, with the two things the research puts there:

- **Standard or Grid** at the top -- StarCraft II's two main profiles: each command's own letter, or the slot's letter
  from QWER / ASDF / ZXCV. Each keeps its own set of choices, and the choice is remembered.
- **Interface** lists every global key (camera, selection, speed, the menus), rebound as before.
- **Terran, Zerg, Protoss** are the editor StarCraft II has: the race's cards on the left (units, buildings, a lifted
  building's own card, the build menus), and the chosen card drawn as its 4 x 3 grid with the key on every button,
  page by page where a card has more than one. Click a key and press a letter; Delete leaves a button with no key.
- **A key belongs to a command**, so Move, Stop, Set Rally or a Marine is one key wherever it appears, and the button's
  tooltip says on how many cards. Every button the game draws names its command (`cmd`, from `UI.CARD_COMMANDS` and the
  tables' ids) and `UI.cardKeyFor` resolves it: the player's choice, else the layout's letter.
- **Clashes are shown, not silently fixed**: a letter on two buttons of one card, or a letter an Interface key holds
  (read first, so the card's button never hears it), turns both red with a sentence saying which, and marks the card in
  the list. Each changed key has a way back, each card has **Reset this card**, and **Reset all** resets everything.
- **The console shows what is set**: a letter that is not in the button's name is drawn in its corner, as Grid's are
  (fourteen of the shipped letters were never visible at all, the Reactor's X among them), and F1's help names the keys
  as they are set.

Letters only, by design: every other key the game reads is an Interface binding or reserved (`UI.RESERVED`), and
`UI.onKey` reads those first, so a card button on one would never answer. Tests: `test/hotkeys.js` builds every one of
the 138 cards for real and holds the editor's list against it, button by button; `test/menus.js` section 7 drives the
editor. 26 negative controls in `.claude/review/menus/controls-hotkeys.js`.

---

## 6. The menus around the lobby

*Eighth session. The user, with screenshots of the old screens: "I feel like you did absolutely no research into what
this menu system and lobby system should look like." Five changes: Single Player shows only its doors and START lives in
the skirmish lobby; the skirmish lobby "should look exactly the same as the Multiplayer Lobby", except that nobody else
can join; the name is asked for when the game first opens, and pressing MULTIPLAYER is pressing CONNECT; the tagline
and the control hints come off the main menu; the Codex gets a Settings tab of its own.*

**OpenRA** is the closest model, and every one of the five is how it already works (read from `MainMenuLogic.cs`,
`LobbyLogic.cs` and `IntroductionPromptLogic.cs` on its `bleed` branch):

- **The main menu** is doors: Singleplayer, Multiplayer, Settings, Extras, Quit. **Singleplayer** opens a second set of
  doors -- Missions, Skirmish, Load, Encyclopedia, Back -- and nothing on it starts a game.
- **Skirmish creates a local server with the chosen map and opens the same lobby panel multiplayer uses.** In that mode
  the lobby's DISCONNECT button reads **Back**, START does not wait on a ready check, and the server browser tab is not
  offered. Chat stays.
- **Multiplayer opens the server browser directly.**
- **An introduction prompt is shown at startup, before the main menu**: the player's name and colour and the mouse and
  scroll options. It records the prompt version the player last completed, so a new version is shown once to everyone.

**StarCraft II** makes games against the computer in its custom-game lobby -- the same screen, with computer slots --
rather than on a form of their own.

**What was built** (`PLAYTEST-M18.md` items 88-91):

| The user's item | Now |
|---|---|
| 1. Single Player doors only; START only in the skirmish lobby; the skirmish lobby is the multiplayer lobby | Single Player: Skirmish Setup, Campaign, Load Saved Game, Watch Replay, Continue Autosave, Map Editor. **Skirmish Setup opens the multiplayer lobby's own screen** (`Net.roomHtml` with `local`), drawn from a room the page holds (`UI.Skirmish`) that answers the lobby's messages the way the relay does. Removed from it, because they exist only for other humans: READY, latency, the nudge, spectators, the team lock, privacy, the game's name, the code and the invite link. **QUIT reads BACK**, as in OpenRA. Added: a **Seed** row, the one setting a relay room picks for itself at START. START needs a computer opponent and a start for everyone. The setup is remembered, except the seed, which is new every time the lobby opens, as a relay's is. Maps made in the editor are offered here and never online. |
| 2. The name at first launch; MULTIPLAYER is CONNECT | A **Welcome** prompt before the main menu asks for the name (versioned like OpenRA's, so a player who connected before it existed is asked once too); an invite link waits for it. **MULTIPLAYER connects and shows the game list.** The server form appears only when the server cannot be reached (or the connection is lost), says which, and has TRY AGAIN. Name and server are changed in Settings, Multiplayer. |
| 3. No bloat on the main menu | The title and three doors. |
| 4. The Codex in its own tab | Settings, **Codex**. |
| 5. Hotkeys in Controls | Section 5. |

Tests: `test/menus.js` runs `js/ui.js`'s real boot against a page built from `index.html` (62 checks), with 40 negative
controls in `.claude/review/menus/controls-menus.js`.
