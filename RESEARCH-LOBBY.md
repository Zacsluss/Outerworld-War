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
