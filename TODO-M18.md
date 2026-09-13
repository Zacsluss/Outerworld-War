# TODO-M18 — the user's thirteen-item list from the first internet game

Started when the fifth session paused for the night (2026-09-12) and kept since. `HANDOFF-M18.md` has the state, the
traps and the kickoff prompt; this file is the open list. **Its first section, THE WORK QUEUE, is what to do next**: the
user's decision on every open item after the eighth session, in order. The sessions' lists follow it (what each did,
with commits), then the older open items with their measurements, then what is closed. There are no worktrees.

The gate is **87 suites** (`node test/all.js`, ~5 min); in the ninth session it is 2 red, `aistyles` and
`queens`, both the AI pacing -- queue item G, which the user has now authorized (see below). It was last all green at `136b1b0`. Every rule in `CLAUDE.md`
applies to every item here: measure before fixing, a negative control that goes cleanly RED, `tools/patch.js`
for edits, and the gate green before the commit.

---

## THE WORK QUEUE -- the user's decisions after the eighth session (2026-09-12)

The user answered the ten-item open list item by item. Their words, against that list: **1** research gets stuck -- "Fix."
**2** AI rebalance -- "Defer until I say." **3** the two red suites -- "Fix now." **4** terrain art -- "Defer until I say."
**5** their playtest of 88-93 -- "I will do this in a moment." **6** rematch, **7** ratings and balanced teams, **8** choosing a
start position -- "Build this now." **9** internet-play security -- "If there's something simple and basic we can implement,
let's do it." **10** Mac build and code signing -- "Do this now."

This section is the queue a new chat works from; everything below it is history and measurement. **Work it in the order given, one item per commit (or a few), the gate before
each, a PLAYTEST entry for each, and TODO/HANDOFF updated as items close.** If the chat gets long, write the handoff
and a kickoff prompt before starting the next item rather than half-finishing one.

### The user's answers (ninth session, 2026-09-12)

- **Question 1 (items 2 and 3 conflict): "you can fix now."** Item G is authorized: change the AI's wave threshold and
  Queen timing NARROWLY to make `aistyles` and `queens` honestly green. `test/balance.js` and `test/proxy.js` stay untouched,
  and the AI rebalance (7b) stays deferred.
- **Question 2 (Mac build and signing): "if it costs money to do apple dev program i will skip it - remove it from tasks."**
  No Apple Developer Program, so no Mac signing or notarization. Windows signing costs money too (Azure Artifact Signing,
  about $10 a month; a plain .pfx certificate is no longer issued -- code-signing keys must live on hardware since 2023),
  so item D is **unsigned builds only**. The secrets a signed build would read are listed under D for the day that changes.
- **Question 3 (their playtest of 88-93): done**, recorded by the new playtest recorder (`tools/playtest-listen.js`). Results
  in "The ninth session" below: 88, 89, 90 and 93 work as far as they were exercised; 91 and 92 were not visited.

### Ask the user first (in the opening message), then start item A without waiting -- ANSWERED, above

1. **Items 2 and 3 conflict.** The user deferred the AI rebalance (2) and asked for the two red suites to be fixed now
   (3). Both reds are the rebalance: `aistyles` fails because NO computer style attacks inside its ten-minute window
   under the slower economy ("rusher attacks earlier in the game than standard -- 43200 vs 43200" is the never-attacked
   sentinel on every style), and `queens` because the Zerg AI's Queens come about a minute late. Passing them honestly
   means changing the AI's wave threshold and build timings in `js/ai.js` -- 7b's knobs. Ask: **may the AI's attack
   timing and Queen timing be changed narrowly now, measured by those two suites and
   `tools/attack-clock.js`, with `test/balance.js` / `test/proxy.js` still untouched?** Loosening the suites'
   expectations to match an AI that never attacks is NOT an acceptable fix: a skirmish computer that never attacks is
   a real bug a player meets.
2. **Item 10 needs the user's accounts, and only the user can create them** (entering credentials is not something
   an assistant may do): an Apple Developer Program membership and a "Developer ID Application" certificate plus
   notarization credentials for the Mac build, and a Windows code-signing route (an OV/EV certificate or Azure
   Trusted Signing). Say exactly which GitHub repository secrets the workflow will read, so the user can add them while
   the other items are built.
3. **Item 5 is the user's**: their playtest of `PLAYTEST-M18.md` items 88-93. Take the results whenever they come.

### The queue

**A. Choose a start position in the lobby (item 8, "build this now").** **DONE (ninth session)** -- click a start on the map
preview or use the slot's Start list; the host's clicks place the host then each computer on Auto (OpenRA's rule); no two
slots on one start; a new map or size resets to Auto; an Auto seat keeps its seat's start or takes the first free one,
deliberately not random (`GameMap.assignStarts`), so a game with no choices is unchanged. `RESEARCH-LOBBY.md` section 7,
`PLAYTEST-M18.md` item 94, `test/starts.js` (58), 30 negative controls. Build stamp moved. The plan as it was written:
- Today: seat i starts at `map.starts[i % starts.length]` (the layout's `startOrder`), so a seat IS its start and its
  colour (`Net.slotColor`). The lobby's map preview already draws each start with the seat number on it.
- Build: a per-player `start` (an index into the map's starts, or automatic) in the `G.init` options, placed by
  `js/game.js` -- a STAMPED file, so the build stamp moves and saves and replays from before are refused (say so in the
  PLAYTEST entry). Carried by `Net.gameOptions` and by the skirmish lobby's `UI.Skirmish.setup` / `UI.skirmishOptions`,
  saved by `Replay.data` (it saves `G.setup.players` verbatim, so a player field rides along). The relay validates it
  (in range, no two players on one start). In the lobby: click a start on the preview to take it, the host places
  computers, and automatic stays the default. Procedural maps have no preview until the seed exists: offer the start
  numbers without a picture there.
- Research first how StarCraft II, Age of Empires II and Beyond All Reason let a player choose a start, and say what
  was researched. Determinism: "automatic" must be derived from the seat order and the seed, never `Math.random`.
- Checks: `test/cmdlog.js`, `test/skirmish.js`, `test/rooms.js` (its sections 12 and 15 pin lobby markup names),
  `test/lobby.js`, `test/menus.js`; by hand `node test/net_many.js` (relay change) and the AI suites after a stamp move.

**B. Rematch / back to the same lobby after a game (item 6, "build this now").** **DONE (ninth session)** -- the room outlives
the game (Beyond All Reason's model, researched with OpenRA, StarCraft II, Age of Empires II and FAF: `RESEARCH-LOBBY.md`
section 8). The end screen of a game from a lobby leads with REMATCH (back, ready) and BACK TO LOBBY (back, unready); the
relay calls a game over only when every player still in it reports the same frame; a player still on the end screen is
`away`; going back early is a drop to the game and a seat in the lobby; the skirmish lobby's REMATCH is a new seed. Found
and fixed on the way: F10 in an online game offered Restart and Save game. `PLAYTEST-M18.md` item 95, `test/rematch.js`
(39), 29 negative controls. No stamped file changed. The plan as it was written:
- `RESEARCH-LOBBY.md` section 4 says why it was left: the relay would have to hand a finished room back to its lobby
  while a player may still be watching the end. Design that case BEFORE code: who is host, what happens to players who
  left, to spectators, to a player still on the end screen, and to the room code.
- Online: GAME OVER offers REMATCH / BACK TO LOBBY; the room returns to its lobby with the same settings and players,
  ready withdrawn, and a player who has not come back yet shows as away. Skirmish: REMATCH restarts the same room with a
  new seed; BACK TO LOBBY opens the skirmish lobby as it was (`UI.Skirmish.L`).
- Relay suites (`test/lobby.js` pattern, its own ports -- the CLAUDE.md port list), negative controls, PLAYTEST.

**C. Ratings and skill-balanced teams (item 7, "build this now").**
- Today nothing records a result, and a name is not an identity (anyone can type any name).
- Build, smallest honest version: (1) an identity token -- a random secret each browser generates and keeps with
  `bw_net`, sent on join; the name stays display-only. (2) Results: at game end every human client reports the outcome
  it computed; the relay records it only when the connected humans agree (lockstep makes them identical); a player who
  leaves a rated game loses it. (3) Ratings: Weng-Lin / OpenSkill, as Beyond All Reason uses (skill and uncertainty,
  separate ratings for 1v1, teams and free-for-all). **The relay must stay dependency-free**: `test/serve.js` requires
  only Node built-ins because the desktop sidecar is built from it as a single executable (`desktop/relay/build.js`), so
  the formulas are written inline, not pulled from npm. (4) Persistence: a JSON file the relay writes, its path from an
  environment variable, with a sensible default for PLAY.bat and for the desktop app. (5) In the lobby: each human's
  rating on their slot and in the browser, and a BALANCE TEAMS button for the host that splits the players to minimise
  the rating gap (at most 8 players, so every split can be tried), with a little randomness so the same split does not
  repeat, as BAR does. Games with computers or cheats unrated (say so).
- Research BAR's rating and balance guide first. Negative controls on the rating update, the agreement rule, and the
  balancer.

**D. Desktop Mac build -- UNSIGNED ONLY (item 10; the user will not pay for the Apple Developer Program, and Windows signing
is paid too).** **BUILT (ninth session)**: `.github/workflows/desktop.yml` -- Windows x64, macOS Apple silicon and macOS Intel
(`macos-15-intel`, GitHub's last Intel image, until August 2027), each checked (the relay answers a join, the page check),
the macOS app ad-hoc signed without the hardened runtime (the node sidecar's JIT). `PLAYTEST-M18.md` item 96. Build the GitHub Actions workflow for unsigned Windows and macOS installers and stop there; say in the
PLAYTEST entry how a Mac user opens an unsigned app. The signing notes below are kept for the day that changes.
- Today: a Tauri 2 app in `desktop/`, built by hand on Windows (bundle targets nsis, app, dmg); the relay sidecar is a
  Node single-executable build that CANNOT cross-build -- the Mac binary must be built on a Mac, the Apple-silicon one on
  Apple silicon. There is no CI (`.github/workflows` does not exist) and no `gh` CLI on this machine.
- Build: a GitHub Actions workflow (free for a public repository) with a Windows job and macOS jobs (Apple silicon and
  Intel, or a universal build) that runs `npm ci`, `node relay/build.js` and `tauri build`, and uploads the installers.
  Unsigned builds first, so it works before any account exists. Then signing: macOS via Tauri's documented variables
  (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, and notarization through an App Store
  Connect API key or an Apple ID); the Node sidecar needs the hardened-runtime entitlements Node's JIT requires.
  Windows via `bundle.windows.signCommand` (a certificate, or Azure Trusted Signing).
- The assistant never handles the certificates, passwords or keys: the user adds them as repository secrets.
  Sources: v2.tauri.app/distribute/sign/macos/ and v2.tauri.app/distribute/sign/windows/.

**E. Basic internet-play safety (item 9, "if there's something simple and basic, do it").** **DONE (ninth session)**: an
optional server password (`BW_PASSWORD`, asked once and remembered per server), 24 sockets per address, a message cap that
drops a flooding socket and narrower chat and lobby caps that ignore the excess, 64 KB frames except an asked-for snapshot,
forwarding headers believed only from this machine, and PLAY-ONLINE.bat's advice; a vanished far end is now left at once.
No Origin check, deliberately. `RESEARCH-LOBBY.md` section 9, `PLAYTEST-M18.md` item 97, `test/safety.js` (25), 21 controls.
The plan as it was written:
- Today the relay has a per-IP join rate limit, room codes, a 16 MB frame cap, fragmented frames refused and a
  keepalive. It has no TLS (a tunnel such as the one PLAY-ONLINE.bat describes provides https/wss), no password, no
  per-IP connection cap, no message rate limit and no Origin check.
- Simple and basic, measured with a flood probe first: an optional server password (an environment variable; the
  client asks for it once and remembers it), a per-IP connection cap, a per-connection message rate cap, a much smaller
  frame cap for everything except snapshots, and the tunnel advice written where a host will read it. Nothing that
  needs accounts or certificates.

**F. Research sometimes gets stuck (item 1, "fix").**
- Status and everything ruled out: "4. Some tech gets stuck during research" below. Not reproduced in 75 minutes of
  six-player hard-AI games. The probes are `tools/stall-probe.js` and `tools/stall-scenes.js`.
- Re-run both on today's code (units now keep bodies apart and the economy is slower -- the conditions changed).
  If it still does not reproduce, do not guess: add a detector to the game that notices a production slot that stops
  advancing for no rule-backed reason and writes one line the player can copy (PLAYTEST item 68 asks for exactly that
  line), so the user's next game names the cause.

**G. The two red suites (item 3, "fix now") -- AUTHORIZED (the user, ninth session: "you can fix now").**
- If yes: change the AI's wave threshold and build timings narrowly (`js/ai.js`: the threshold that commits a wave, the
  build-order step timings, the Queen's Nest and Queen timing), measured by `test/aistyles.js` (seeds 1, 5, 11 by
  hand), `test/queens.js` and `tools/attack-clock.js`. The claim order in `AI.budget()` and any run of
  `test/balance.js` / `test/proxy.js` stay gated. It must also absorb what bodies changed: fewer melee attackers fit
  round one target.
- If no: leave both red and say so in the handoff.

**Deferred until the user says:** the AI rebalance (item 2, TODO 7b below) and the terrain art path (item 4: a 3D pack
rendered to 2D, the Daniel Thomas painted packs, or both; the repo is public, so bought art stays out of git or the
repo goes private).

---

## The ninth session (2026-09-12)

- **The playtest recorder** (the user: "can you set up a dev listener before i test so you can do this?"). `node
  tools/playtest-listen.js`, then play at http://127.0.0.1:8870: the last commit served out of git beside a relay, a fresh
  origin, a REC · NOTE pill, and every screen, click, setting, lobby message, error, five-second game summary, replay,
  supply-aware production stall and right-click gathering measurement written to `.claude/review/playtest/<time>/`.
  `node tools/playtest-report.js` reads a session back as a timeline. How to use it: the head of `PLAYTEST-M18.md`.
- **The user's playtest of 88-93** (one skirmish, one 15-minute online game against a Zerg computer): **88** the name
  prompt showed on first open and not after a reload; **89** Single Player's doors exactly, the skirmish lobby's START
  started the game (its other controls not tried); **90** MULTIPLAYER connected straight to the list, HOST GAME and the
  countdown into the game (the unreachable-server form not tried); **91, 92 not visited**; **93** right-clicks that were
  not overtaken by another inside eight seconds closed up (3 probes 119 -> 21 px, 7 zealots 129 -> 61 px, all within ~90
  px of the point), lines still spread. No errors, warnings or desyncs; median 60 fps (min 49), a steady 24 game frames a
  second. The three "stalls" were supply blocks, which the recorder now ignores.
- **Queue item A, start positions: DONE** (above).
- **Queue item B, rematch and back to the lobby: DONE** (above), with the online F10 menu's Restart and Save game removed.
- **Queue item D, unsigned desktop builds in GitHub Actions: BUILT** (above); taken before C while C's research ran. Its
  first run (commit 3eeeab6) succeeded on all three machines.
- **Queue item E, basic internet-play safety: DONE** (above).

## The eighth session's list (the user's third message, 2026-09-12)

*"I feel like you did absolutely no research into what this menu system and lobby system should look like."* With
screenshots of the old Single Player, Skirmish, Multiplayer, main menu and Settings screens. Five items; all DONE, in
two commits (`b1639b0` menus, and the command-card keys commit after it). The research is `RESEARCH-LOBBY.md`
sections 5 and 6 (OpenRA's source and StarCraft II's editor); by hand, `PLAYTEST-M18.md` items 88-92.

- **1. Single Player shows only its doors; START only in the skirmish lobby; that lobby looks exactly like the
  multiplayer lobby.** DONE -- Single Player: Skirmish Setup, Campaign, Load Saved Game, Watch Replay, Continue
  Autosave, Map Editor. Skirmish Setup IS the multiplayer lobby's markup (`Net.roomHtml`/`Net.bindRoom` with `local`),
  drawn from a room `UI.Skirmish` holds and answers like the relay; without READY, latency, spectators, lock, privacy,
  name, code and invite; QUIT reads BACK; a Seed row. START makes exactly `UI.skirmishOptions` of the same settings.
  **Deliberately kept, as OpenRA keeps it:** the chat box (it logs the changes). PLAYTEST 89.
- **2. The name asked for when the game first opens; MULTIPLAYER = CONNECT.** DONE -- a Welcome prompt before the main
  menu (versioned, so players from before it are asked once); MULTIPLAYER connects and shows the list; the server form
  only on failure, naming the server, with TRY AGAIN. PLAYTEST 88 and 90.
- **3. No tagline or control hints on the main menu.** DONE. PLAYTEST 88.
- **4. The Codex in its own Settings tab.** DONE. PLAYTEST 91.
- **5. The hotkeys dropdown removed; hotkeys in Controls; every one customizable.** DONE -- the Controls tab is the keys:
  Standard / Grid, Interface keys, and a StarCraft II-style editor for every command card of every race (138 cards, held
  against the real cards by `test/hotkeys.js`), one key per command, clashes shown in red. PLAYTEST 91-92.

- **Bug (the user's report after the menus): units in different places right-clicked to one point never gathered.**
  FIXED -- a right-click keeps a group's shape only when the group is one clump and the click is outside it
  (StarCraft II's magic box); otherwise every unit goes to the point. Measured: four spread SCVs ended 194 px from
  their centre before, 31 px after. `test/formation.js` (19, six new), 5 negative controls in
  `.claude/review/formation/`. PLAYTEST 93.

Tests: `test/menus.js` (79), `test/hotkeys.js` (31); 66 negative controls in `.claude/review/menus/`. Gate 85 suites, the
same two AI-pacing reds.

---

## The seventh session's list (the user's second message, 2026-09-12)

Two decisions first: **no rebalance yet** ("still more bugs to fix") and **commit, leaving nothing unmerged**. Then
ten items. Status, most recent first:

- **1. Units overlap.** DONE -- units keep their measured BODIES apart (`DATA`'s BODY table, `tools/bodies.js`,
  `G.separate`); settled clumps went from 14-59% of drawn model area hidden to 0-4%. Mining, repair, merges, follow,
  melee reach and chokes each needed something and each has a negative control (`test/overlap.js`, 19 checks,
  `.claude/review/overlap/controls.js`). **Costs, stated plainly:** fewer melee units reach one target at once
  (16 zerglings on a marine -> about 5), one-tile chokes take about twice as long, and the Zerg AI's Queens come
  about a minute later, which turns `test/queens.js` red -- AI pacing, same family as `aistyles`, waits for 7b.
  PLAYTEST item 81.
- **2. Lobby research and a sophisticated set of menus and online lobby.** DONE -- `RESEARCH-LOBBY.md` (four lobbies, eight
  shared properties, the gap), then `9b1f17e` (ready means ready, latency, system lines, lock/shuffle/nudge, the map's
  seat cap, the skirmish rules online, the browser hub, invite links) and `6940a19` (spectators; Settings in tabs with
  HUD size, scroll speed, edge scroll, volume). `test/lobby.js`, `test/spectate.js`, `test/settings.js`; 46 negative
  controls. PLAYTEST 82-87. **Left, with reasons in the research:** a rematch lobby, ratings, start-position choice.
- **8. Supply Depot lower / raise.** DONE, `ecc9f8b`, PLAYTEST 80.
- **9. Queued buildings show a ghost.** DONE, `45107c9`, PLAYTEST 79.
- **5. Builders walk back to the minerals after building; 6. a worker in a Refinery drops out of the selection.**
  DONE, `54132bd`, PLAYTEST 77-78.
- **3. HUD 30% smaller (1.4x); 4. black minimap until explored; 7. laggy cursor; 10. minerals still fast.** DONE,
  `3fc2fea`, PLAYTEST 73-76. Item 10 was measured, not changed: 48 a worker a minute against StarCraft II's 54-61.
- **The dragoon wobble fix** (item 11 above) committed on the user's word, `c343b47`.

## Open

### 3 (DONE). A Queen or Overlord should walk into range to plant a creep tumour
*Kept for the record; what shipped is in Closed at the foot of this file.*
Today an out-of-range cast is refused outright with "Creep Tumour only reaches 3 tiles — pick a spot closer
in." (`Abilities.outOfRangeMsg`). It should move the caster toward the target until the target is in range,
then cast, the way a build order moves a worker first.

**Trap:** `js/abilities.js` near line 397 documents a deliberate fix — a caster that "flew 13 tiles and planted
it, against a declared range of 3". Do not undo it. The right shape is a real move-then-cast ORDER that the
command log carries, not a silent teleport or an unbounded walk. **Anything that does not go through
`CMD.pack`/`CMD.apply` and `ORDER_KEYS` will desync in multiplayer and vanish from replays** — `test/cmdlog.js`
is the suite that catches that class of mistake and `REVIEW-M17.md` entry 6 is the last time it happened.
Decide and record whether this applies to every targeted ability or only the tumour.

### 4. Some tech gets stuck during research — STILL NOT REPRODUCED, and here is what is ruled out
**The probes are written and committed** (`tools/stall-probe.js`, `tools/stall-scenes.js`)
and 75 minutes of six-player hard-AI games across three seeds did not produce it. 25 stalls over ten
seconds, every one of them the rules working (supply, an add-on still building, a Protoss blackout) except
two, and those two were a different fault — now fixed, see Closed. **Do not start guessing from here; run
the probes again after the user's next game, or get the one console line `PLAYTEST-M18.md` item 68 asks for.**

Ruled out, each with the reason:
- **a lifted building** — impossible. `G.liftBuilding` refuses while anything is in the queue.
- **a morphed one (Lair/Hive, Greater Spire)** — impossible. `G.queueMorph` refuses while anything is in
  the queue. Driven in scenes 4 and 5: the morph is declined and the research finishes.
- **a killed building** — works. The reservation in `p.researching` IS cleared and it can be researched
  again on a rebuilt one (scenes 8 and 9); REVIEW-M17 had already closed the other end of this at `CMD.bldg`.
- **a destroyed add-on** — works (scene 10).
- **a cancelled-and-requeued slot** — works (scene 7).
- **an unpowered Protoss building** — freezes while dark and resumes with a new pylon. By design (scene 11).
- **one that changed owner** — WOULD leak: `p.researching` is per player and `G.finishProduction` clears it
  from the building's current owner, so the old one holds a reservation for ever and is refused in silence
  if they ask again. **But nothing in the game can change a building's owner** — Mind Control explicitly
  refuses buildings, Infest takes a Command Center (which researches nothing) and capturing a derelict
  takes a neutral building. Scene 6 forces the handover by hand and shows the leak; it is a hole with no
  door to it today, and the door is what to look for if a future ability opens one.

The original brief, kept for the record:


A research or upgrade begins and never finishes. **Not yet reproduced.** Write the probe first: long games,
several AI opponents, all three races, a few seeds, 20+ minutes, reporting any production slot whose progress
has not advanced for N frames and naming the building, the tech and the frame it stalled. `G.tickProduction`
(`js/game.js`) is the tick; `G.queueTech`/`G.queueUpgrade` are the entry points. Candidate causes, none
confirmed: a lifted building, a morphed one (Lair/Hive, Greater Spire), one that changed owner, a
cancelled-and-requeued slot. **Do not guess — the probe must name the case.**

### 5 (DONE). The HUD is far too small and should be doubled
*Kept for the record; what was measured and what shipped is in Closed at the foot of this file.*
`js/hud.js` draws the console band, minimap, selection strip, command card and top bar on the canvas. Measure
what sets its size today (fixed pixels? viewport fraction? device pixel ratio?) at 1280x720, 1920x1080 and
2560x1440 before changing anything — the user is likely on a high-resolution display where a fixed-pixel HUD
reads tiny.

One named constant, not a hundred edited literals. It must not push the console off a small window, and
**every hotspot must move with what it draws**: `test/qol.js` asserts forty selected units get forty hotspots,
all on the console band and none below the screen. Do not weaken that. Suites to keep green: `qol`, `cardsay`,
`diegetic`, `daynight`, `review17ui`, `controls`.

### 6 (DONE). Workers should not cross the map when their patch runs out
*Kept for the record; what shipped is in Closed at the foot of this file.*
"When drones finish the minerals in an area, they go to the next entire mineral area — in SC2, once the area is
out, they stop unless you command them to go to another area's patch. Copy this."

`js/sim.js`'s gather tick re-scans **all** of `G.map.resources` (`findNearestResource`, and the `% 16 === 0`
loop) and sends the worker to the nearest patch anywhere on the map. Restrict it to the worker's own mineral
line / base cluster and go idle if that is exhausted. Decide what "the same area" means in this codebase's
terms (resources are placed in clusters around base locations) and record why. Check it still resumes when a
new hall finishes nearby, and that `AI.economy` can still move workers to a new base deliberately.

### 11. Dragoons wobble very fast after they move — FIX COMMITTED (the user said commit, seventh session)
**The cause is found and the fix works. It is not on the main line because it turns the gate red**, and the
line it turns red is the one this project has had flapping between seeds for its whole history. That is the
user's call. `node tools/patch.js tools/wobble-fix.js` applies it, and the file carries all of this.

**Measured** (`tools/wobble-probe.js`, `tools/wobble-render.js`, a minute each):
- **One dragoon alone turns back and forth zero times.** The steering is innocent in isolation.
- **Eight ordered to one point** snapped **37, 58 and 79 degrees in a single frame** against a declared turn
  rate of 14.32, up to **7.9 times a second**. Inside 20 px of the destination `Unit.moveTo` snapped the
  facing onto the bearing, and at that range the bearing is whichever way the neighbour you are arriving
  beside has just shoved you. The sim's `facing` is where it shows; nothing on the render side adds to it.
- **Marines never show it** (about one reversal a second): 40 degrees a frame covers the shove.

**The fix** holds the facing inside 20 px and strafes toward the goal (`ang = want` is load-bearing: without
it a dragoon told to move six pixels walked off and turned 143 degrees to come back).

| variant | worst turn in a frame | 8 dragoons to one point | aistyles 1 (THE GATE'S) | aistyles 5 | aistyles 11 | eightplayer |
|---|---|---|---|---|---|---|
| today | 79.6 deg | 529 frames | clean | economy red | clean | 19/19 |
| **the fix** | **14.32 deg** | **379 frames** | **economy red, 58 vs 60** | clean | economy red, 58 vs 61 | 19/19 |
| fix + exempting the slowdown too | 14.32 deg | 510 frames | clean | a different red | two reds of a NEW shape | **18/19: the AI never expanded** |

**The decision.** The fix re-deals "expander mines with more workers than turtle at five minutes" — HANDOFF-M17's
known red, 57/59/58 against 60 or 61 through every re-deal — onto seed 1, which is the seed the gate runs.
Either accept that (the line is a sample, it is the same line, and every other measure improves) and
commit with the gate's aistyles red on that line; or keep the wobble. **The third row was tried and rejected:**
it kept the gate green by luck and broke something real.

**Even with the fix**, eight dragoons still reverse at their own turn rate while they jostle (up to ~7 a
second), because all eight steer at the same point. That wants per-unit steering memory or formation slots.

The original brief, kept for the record:

Look at `Unit.moveTo` (`js/sim.js`): `TURN.dragoon = 0.25` rad/frame, the arrive radius, and
`if (Math.abs(diff) > 1.2) step *= TURN[this.def.id] ? 0.15 : 0.45`. Oscillating between two facings, between
"arrived" and "not arrived", or being pushed by collision and re-facing every frame all present as a fast
wobble. **Measure it**: record a dragoon's `facing`, `x`, `y` and order state per frame after it completes a
move, and report the amplitude and period. Then fix the cause the probe names. Turn rates and the arrive radius
affect every unit, so prefer the narrowest fix the measurement supports and check `test/eightplayer.js` to see
how far it reaches.

---

### 7a. Re-apply the slower economy: `MINE_TIME 190, GAS_TIME 94` — APPLIED (sixth session)
**Applied last, as scheduled, and committed with the gate knowingly red.** Measured on this tree, which is not
the tree the fifth session measured on:
- **The gate is 2 of 79 red, not 4:** `aistyles` (the "never attacked" sentinel, 43200 vs 43200, for every
  style) and `queens` (a poorer computer Zerg trains fewer Queens, so one-Queen-per-hall cannot hold).
  `version` is green because its `const MINE_TIME = 75,` probe was re-anchored to 190, which the section
  below asked for. `zerg12` is green: the commits between the two measurements took it out of the blast radius.
- **Mining: 49.8 minerals per worker per minute** on a saturated line, exactly the sweep's prediction (x1.21 SC2).
- **`test/eightplayer.js` 19/19** (it was 18/19 when the fifth session applied this).
- Build stamp `1e25bdbaf9ef8855`. PLAYTEST-M18.md item 72.

The fifth session's text, kept for the record:

**The user was shown the evidence below and asked for it anyway** (2026-09-12): "I understand it broke AI but we
can rebalance later when I confirm." So it goes in, and **7b is what makes the game playable again**. Ship the
two together, or ship 7a knowing the computer opponents are passive for the first ten minutes.

`.claude/review/spec-mining.js` is the patch, written and already verified to apply. Expect, all measured:
- `test/aistyles.js` red on seeds 1, 5 and 11, every style reporting the "never attacked" sentinel (43200).
- The gate 4 of 79 red: `version`, `aistyles`, `zerg12`, `queens`.
- `test/eightplayer.js` 18/19, peak supply `21/51/57/33/56/31/19/50` against a floor of 20.
- **`test/version.js` edits `const MINE_TIME = 75,` as one of its stamp probes — re-anchor that line**, or it
  goes red reporting a stale anchor, which is a different failure from the economy one.
- The build stamp moves, so saves and replays from before are refused.

### 7b. Rebalance the AI for the slower economy — GATED, needs an explicit instruction
This is what 7a breaks, and it is the balance work this project has kept gated throughout. The AI's build orders
and its attack threshold are tuned for 100 minerals per worker per minute; at 50 it never fields a first wave
inside ten minutes. The knobs: `AI.budget()`'s claim order, the threshold that decides when a wave commits, and
the build-order step timings in `js/ai.js`. `test/balance.js` and `test/proxy.js` are the runs for it and
**both are gated** — do not start them without being told, and double-check when told.

Use `tools/attack-clock.js` first (moved out of the ignored scratch folder, and its stale MINE_TIME anchor fixed, when the queue was written). It measures the frame of the first wave using `ai.waves`, the
counter `aistyles` itself reads, and it is the instrument that says whether a rebalance worked. (A first version
counted army units near the enemy start and reported "never" for Zerg even at today's settings: a probe that
disagrees with a known-good instrument is a broken probe, not a finding.)

### The measurement behind 7a and 7b
**Measured** (`.claude/review/mine-rate.js`): **100 minerals per worker per minute**; a 114-frame cycle for 8
minerals, 75 frames inside the patch and 39 walking. That is **x2.4 StarCraft II** but only **x1.15 Brood War**.
The game was already close to the one it remakes; the gap the user felt is SC2's deliberately slower economy.

Swept with `.claude/review/mine-sweep.js`, measuring each arm rather than deriving it:

| MINE_TIME | 75 | 90 | 105 | 120 | 140 | 160 | 190 |
|---|---|---|---|---|---|---|---|
| minerals/worker/min | 99.8 | 89.3 | 80.3 | 71.0 | 64.5 | 58.0 | 49.8 |
| vs Brood War (~87) | x1.15 | x1.03 | x0.92 | x0.82 | x0.74 | x0.67 | x0.57 |
| vs StarCraft II (~41) | x2.43 | x2.18 | x1.96 | x1.73 | x1.57 | x1.41 | x1.21 |

The user chose the SC2 end. `MINE_TIME 190, GAS_TIME 94` (gas scaled by the same 2.53x, so the ratio was
untouched) **broke the game**: `test/aistyles.js` went red on seeds 1, 5 and 11 with the "never attacked"
sentinel for **every** style — no computer opponent mounted a first wave inside ten minutes on any seed — and
the gate went 4 of 79 red (`version`, `aistyles`, `zerg12`, `queens`). `test/eightplayer.js` 18/19, peak supply
`21/51/57/33/56/31/19/50` against a floor of 20.

It was reverted on the night per `CLAUDE.md` (a change that turns the canaries red is reverted even when it does
what was asked), and then the user was shown this evidence and asked for it anyway — that is 7a above.
**The constant is not the problem.** The AI's build orders and its attack threshold are tuned for the current
income, so halving income makes the computer stop playing. That is 7b.

`test/version.js` edits `const MINE_TIME = 75,` as one of its stamp probes — any real change here must
re-anchor that line, or the suite goes red reporting a stale anchor.

---

## The three worktrees -- GONE

Removed in the seventh session, with their branches. Their items were finished on the main line instead -- 1, 3, 5, 6,
10, 12 and 13 are in Closed, 11 is committed -- except item 4, the research stall, which is still not reproduced
(above). `git worktree list` shows only the main checkout. Nothing of theirs remains to resume.

---

## Closed

- ~~**2. Both players heard each other's announcements.**~~ `Player.msg` gated its sound on "is a human player"
  rather than "is the player sitting here" — the same person in single player, two people in a game. Commit
  `8dbb471`, `test/netaudio.js`, PLAYTEST item 62.
- ~~**8. Queued moves draw faint lines.**~~ A polyline through every queued destination with a diamond at each;
  green move, red attack, yellow patrol. Commit `7be866a`, `test/seldraw.js`, PLAYTEST item 63.
- ~~**9. A dead unit's health bar lingers.**~~ **It does not.** A probe drove the real renderer across a death:
  the sprite and the bar stop on the same drawn frame, and a 40-unit battle drew 18,816 bars across 29 deaths
  with none for a dead unit. What lingers is the corpse, by design. Pinned so it cannot regress. Commit
  `7be866a`. One dead thing's bar is left on purpose: a remembered enemy building's ghost in the fog, because
  removing it would leak that the building is dead.
- ~~**1 + 10 + 12 + 13. The multiplayer lobby.**~~ Finished in the shape of the user's StarCraft II
  screenshots, and self-contained. Every AI slot is race + difficulty + **play style** + team, editable by the
  host and removable; the style rides through the relay into `G.setup.players[i].style`, which js/ai.js
  already reads, so **no stamped file changed and the build stamp did not move** (`af56c841f794af2f`). A
  settings column with a **real map preview** (the layout's start positions, mirrored exactly as
  `GameMap.generate` mirrors them, in the seats' colours), game **privacy** as a host setting, and a bottom
  bar of START / MAKE PUBLIC / QUIT. **START now runs a relay-timed 5-4-3-2-1 countdown** during which the
  room is frozen, nobody may join, and anyone leaving cancels it. `test/rooms.js` sections 13-15 (107 checks
  now), twelve negative controls in `.claude/review/lobby-controls.js`, `PLAYTEST-M18.md` items 64-65.
  **Deliberately left out, and said so on screen:** handicap (it scales income, so it is gated balance),
  Category/Mode/Game Duration (nothing simulates them), a Locked Alliances *switch* (alliances are always
  locked, so it is stated as a fact), a colour *picker* (a chosen colour must be read in `G.init` or
  `Player`, both stamped — TODO said not to move the stamp for paint, so the lobby SHOWS each seat's colour
  instead), and a map author line (nothing records one).
- ~~**5. The HUD is far too small.**~~ **Measured first**: the band was `clamp(Render.H * 0.26, 140, 196)`
  and the 0.26 is dead above a 754 px window, so every viewport from 1366x768 up got the same **196 px** --
  26% of a 720p screen, 18.1% of 1080p, 13.6% of 1440p, **9.1% of 4K** -- and the minimap (174), the card
  button (53) and the selection tile all derive from it, so they were pinned too. The CLAMP CEILING was the
  cause, not the fraction. Now `HUD_SCALE = 2` in `js/ui.js`: the console draws under one transform, in the
  console units it was already written in, so the whole thing doubles from one constant. `HUD_MAX_FRAC`
  (0.42) keeps a short window playable and `hudK` falls with it; below ~330 px of height the console is
  exactly what it always was. Hotspots are converted back to screen pixels by the same factor, icons are
  rasterised at the size they are drawn at, and the selection strip's shrink floor is 22 SCREEN pixels (it
  was 22 console units, which cost ten of forty tiles at 1024x768 -- found by measuring in the page).
  `test/qol.js` 33 checks, eight negative controls in `.claude/review/hud-controls.js`, `PLAYTEST-M18.md`
  item 66. Not scaled, on purpose: the mouse cursor, and the F10/F1/codex dialogs, which are not the
  console band.
- ~~**3. A Queen or Overlord walks into range to plant a creep tumour.**~~ Bounded by `CAST_APPROACH` = 36
  tiles, which is measured against the maps (a start's nearest other base is 18/31/34; a start to another
  start is 100 to 142). An IMMOBILE caster — a tumour seeding its own child, a burrowed or sieged unit —
  still refuses at its range, which is the half FIXLIST-M15 C2 was right about. It also found and fixed a
  real AI bug: the tumour budget counted only the tumours that EXIST, so with the walk allowed two
  Overlords each saw seven and the game peaked at nine against a cap of eight. Commit `b2a1442`,
  `test/tumour.js`, `PLAYTEST-M18.md` item 67.
- ~~**A unit cannot morph inside a transport.**~~ Not on the user's list — TODO item 4's probe found it.
  A Zergling loaded into an Overlord and morphed left its cocoon at progress 0 for the whole ride, money
  spent and unit gone, because `Unit.tick` returns at its `inside` guard before an egg ever reaches
  `tickProduction`; the AI then picked the same loaded Zergling every think. Refused now, as Brood War and
  StarCraft II both do, and the AI's seven morph sites skip loaded units. `test/abilities20.js`,
  `PLAYTEST-M18.md` item 69.
- ~~**6. Workers stop when their mineral line runs out.**~~ **Measured first** (.claude/review/worker-walk.js,
  Lost Ruins): with the main drained, twelve of twelve workers set off for the natural 31 tiles away and
  each covered about 280 tiles in ninety seconds, carrying minerals back past a hall they had no reason to
  stand at, and not one went idle. Now the gather tick asks `G.nextPatchInBase` instead of scanning every
  resource on the map: another patch on the SAME line, or idle. "The same area" needed no new idea -- the
  map already records which patches belong to which base. One patch running out still moves the worker
  within its line; an explicit order to another base is still obeyed; `AI.economy` still re-tasks the
  computer's idle workers, so no AI stalls. Gas is deliberately unchanged. `test/qol.js` 39 checks, two
  negative controls, `PLAYTEST-M18.md` item 70.
- ~~**7. The economy.**~~ Measured and reverted — see the gated section above. Not closed as "done"; closed as
  "answered, and the answer is that it needs the AI re-tuned first".
