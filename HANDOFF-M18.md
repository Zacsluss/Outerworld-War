# HANDOFF — M18 (the ninth session: the whole work queue, A to G)

Written at the end of the ninth session (2026-09-12/13), after queue items A to G. Branch `m10-overnight`, which is `origin/main`.
**Everything is committed and pushed; there are no open pull requests, no other branches and no extra worktrees.**
Trust `git log -1` for HEAD, not a hash written here.

> **READ `TODO-M18.md` FIRST.** Its first section, THE WORK QUEUE, now holds the user's answers to the three questions
> as well as their decision on every item. `PLAYTEST-M18.md` items 94-100 are this session's work by hand, and its head
> says how to record a playtest. `RESEARCH-LOBBY.md` sections 7-10 are this session's lobby research.

---

## The state

- **The gate is 90 suites (new: `starts`, 58 checks; `rematch`, 39; `safety`, 25; `ratings`, 37; `stallwatch`, 17) and ALL
  GREEN** since queue item G -- the first time since `136b1b0`. (Through items A-F the only reds were `aistyles` and `queens`,
  every failing line byte-identical to the eighth session's log.)
- **The desktop builds run in GitHub Actions** (`.github/workflows/desktop.yml`); the first run, on 3eeeab6, succeeded on
  Windows, macOS Apple silicon and macOS Intel. Check a run with the public API
  (`https://api.github.com/repos/Zacsluss/Outerworld-War/actions/runs`) -- there is no gh CLI here. **Build stamp
  `70eec21987ffeaf7`** (moved twice this session: item A's `GameMap.assignStarts` made it `506fb0d48d1e1d36`, item G's
  `js/ai.js` made it this).
- **After item G, by hand:** `aistyles` 132/0 on seeds 1, 5 and 11; `queens` 25/0; `eightplayer` 19/19 (was 18/19);
  `tools/attack-clock.js` at today's economy, hard 1v1: TvZ first waves never / 14:57 -> 8:36 / never, PvT 14:27 / never
  -> 8:05 / 8:08. Twelve negative controls cleanly red (`.claude/review/aipace/controls.js`, `controls2.js`).
- **By hand:** `net_many` 51/51; `desktop/page-check.js` 22/22 (`desktop/dist` refreshed); `aistyles` seed 1 125/7, seed 5
  125/7 (the same seven wave-and-attack-timing lines), seed 11 124/8 (the seven plus the long-standing flaky "harasser
  fields more fast units than turtle", 3 vs 5); `eightplayer` 18/19 (the economy-floor line). All as before.
- **Negative controls:** 30 in `.claude/review/starts/controls.js` and 29 in `.claude/review/rematch/controls.js`, every one
  cleanly red. After item B, by hand: `net_many` 51/51 again, `page-check` 22/22; and in two real browser tabs on the relay,
  a player's REMATCH took the room back while the other was still in the game, who was shown the end screen, came back
  host, and started the rematch on a new seed.
- **The user answered the three questions** (TODO-M18): **G is authorized**, **D is unsigned builds only**, and their
  **playtest of 88-93 is done** (results in TODO-M18, "The ninth session"). They want every queue item finished.
- **The playtest recorder** may still be running from this session on ports 8870-8871 (a `preview_start` server named
  `playtest`). It is harmless, gitignored in what it writes, and not on any gate port.

## What changed this session, in a player's language

1. **You can choose where you start** -- in the skirmish lobby and online. Click a start on the lobby's map (click it
   again to give it back), or use the Start list on your slot. As the host, your clicks place you and then each computer
   still on Auto; a computer's Start list sets it directly. Nobody can take a start someone holds. A new map puts
   everyone back on Auto. The map shows every seat on the start it will really get, a chosen start ringed. (PLAYTEST 94)
2. **Deliberately different from the research's models:** OpenRA and StarCraft II deal Auto players a random start. Here
   an Auto seat keeps its seat's own start, or takes the first free one -- so the lobby can show exactly where everyone
   will be before START, and a game where nobody chooses is the same game as before.
3. **A playtest can be recorded** (for the assistant, not the player): `node tools/playtest-listen.js`, play at
   http://127.0.0.1:8870, press NOTE when something looks wrong.

4. **After a game, the room is still there** (PLAYTEST 95). The end screen of a game you started from a lobby leads with
   **Rematch** (you go back to the same lobby, ready) and **Back to lobby** (not ready). Online, the room keeps its code,
   map, rules, computers, teams and starts; a player still looking at the end screen is shown as "end screen" and START
   waits for them; whoever closed the game's tab loses their seat. In single player, Rematch is the same game again at once
   on a new seed, and Back to lobby is the skirmish lobby as you left it.
5. **F10 in an online game no longer offers Restart or Save game** -- Restart started a private copy of the game, Save game
   did nothing.
6. **The desktop app is built for Windows and both kinds of Mac by GitHub** on every change to it (PLAYTEST 96), unsigned:
   Windows asks "Run anyway", macOS "Open Anyway" once.
7. **A server can have a password** (PLAY-ONLINE.bat asks), typed once and remembered; and the relay drops a connection
   that floods it, ignores chat and lobby spam past a few a second, refuses oversized messages, and lets one address hold
   24 connections (PLAYTEST 97). A tab closed abruptly now leaves a game at once instead of after 45 seconds.
8. **Online games between players are rated**, the way Beyond All Reason rates them (PLAYTEST 98): a Match Rating on every
   slot, a Rated row saying whether the game will count and why not, the change on the end screen, a forfeit for walking
   out, and BALANCE TEAMS for the host. Games with computers, cheats, uneven teams or under 90 seconds are not rated.
   **Deliberately different from BAR:** the players' own clients agree on the result (there is no referee here), a game
   nobody finishes goes to the side that stayed, and every team is updated at once rather than BAR's per-team scheme its
   own issue tracker flagged.

9. **Research that stops now says why** (PLAYTEST 99): a research or upgrade kept waiting 20 seconds -- most likely a
   Forge whose Pylon died out of sight -- puts "Forge has stopped researching Ground Weapons: it has no power" in the
   message area, once. And anything that stops for ten seconds for no reason the rules know says so on screen and writes
   one `[stall]` line to the console and to `bw_stall`, to send in. **Deliberately not a fix:** the stuck research was
   still not reproduced on today's code (75 minutes of computer games, the eleven scenes, and the user's own game
   replayed), so the game watches rather than a guess being changed.
10. **Terran and Protoss computers attack again** (PLAYTEST 100): they keep making workers to about 24, only take a base
    they have the workers for, and send waves 0.7 the old size -- a normal standard computer's first wave is about 24
    supply, leaving around 8:45-9:25 against an opponent that does nothing (it never came in ten minutes before).
    **Deliberately not done:** the Zerg computer is still passive for ten minutes and loses computer-vs-computer games to
    a Terran at about 13 minutes -- that is the AI rebalance (7b) the user is holding. Two gate checks the change turned
    red were re-measured rather than loosened, and TODO-M18 item G says exactly how: `qol`'s computer re-task check now
    counts a worker building a Supply Depot as busy, and `zerg12`'s end-to-end Zerg game plays a passive opponent for
    20000 frames (the Terran AI had started winning it).

**Saves and replays from before this session are refused** (the build stamp moved with item A and again with item G;
items B-F changed no stamped file).

**Not done:** nothing in the work queue. Held by the user until they say: the AI rebalance (TODO-M18 7b -- the Zerg
computer first) and the terrain art path. Their playtest of PLAYTEST-M18 items 94-100 has not happened yet.

## Traps found this session

1. **A research subagent put the user's email address in a User-Agent header** on one request to a public API. Tell every
   research agent, in its prompt, never to put an email address or any personal detail in a request, URL or header.
2. **A playtest served from the working tree shows work in progress** -- a half-made edit, a negative control breaking a
   file for a minute. The recorder serves the COMMIT (`git show <rev>:path`); restart it to serve a newer one.
3. **A placement check whose chosen starts equal the seats' own proves nothing:** the skirmish-lobby check first chose
   starts 1 and 2 for seats one and two, and a control placing everyone by seat still passed it. Choose other starts.
4. **`UI.showPanel` is ASSIGNED inside the DOMContentLoaded handler**, and the first screen is shown from that handler, so
   anything that wraps it later misses the first screen. The recorder traps the assignment instead.
5. **A start is an index into `G.map.starts` AFTER the layout's `startOrder`**; the lobby draws index + 1. On Lost Ruins
   start 1 is top left, 2 bottom right, 3 top right, 4 bottom left.
6. **Tests make "custom" maps by copying a fixed layout** (bases with `hall`, no `x`/`y`); `Net.mapStarts` draws nothing
   for a custom layout without painted coordinates rather than NaN circles.
7. **`mkDom` (the page built from index.html) now lives in `test/_harness.js`**, shared by `test/menus.js` and
   `test/starts.js`. `test/menus.js` is still 79/79.
8. **A Monitor tailing the recorder's notable log floods during combat micro** (a line per right-click). Filter
   `RIGHT-CLICK` out; the lines are in the file anyway.
9. **A player index is a position in `L.players`, so nothing may be REMOVED from it while a game runs** -- a player who goes
   back is marked (`back`, `gone`) and pruned only in `returnToLobby`. Removing one would shift every later player's batches
   onto the wrong index.
10. **A client's last `lobby` message is stale during a game** (the seventh session's trap 5): the first rematch probe read
    `lobby.state` after a start and saw `lobby`. A client in a game that receives a `lobby` with state `lobby` knows the
    room went back without it (`Net.roomBack`).
11. **PowerShell 5.1 breaks a `git commit -m` here-string containing double quotes** into pathspecs. Write the message to a
    file with the Write tool and use `git commit -F`.
12. **The Browser pane does not run `requestAnimationFrame` while it is hidden**: `UI.loop` never runs, so the end screen
    never opens by itself and screenshots time out. Verify in-game state with `javascript_tool`.
13. **A `tools/patch.js` replace that does not end in a newline swallows the next line's indent** when the search did: the
    item A patch left a `}` on a `case` line and a comment on another. End such replacements with an empty last element.
14. **`tools/patch.js` checks every search against the ORIGINAL file**, so two entries where the second searches text the
    first one writes are refused as a whole. Edit those lines in one entry.
15. **The HTTP server's upgraded sockets are half-open**: a far end that sends a FIN without a WebSocket close frame never
    fires 'close'. The relay now listens for 'end' too (queue item E).
16. **Headless lockstep harnesses send far faster than a browser** (net_many: 670 messages in one second against a
    browser's 25-30). A new harness that starts relay games must pass `BW_MSG_RATE`, as net_many, net, spectate and editor do.
17. **PowerShell's `Set-Content -Encoding utf8` writes a byte-order mark.** Node strips it from a required spec; anything
    else should be written with the Write tool.
18. **A room code under four characters is refused** -- a suite that picks 'OFF' as a code gets no lobby and a confusing
    null; the ratings suite did.
19. **The relay's RATING MATH block is cut out of test/serve.js by its markers and run alone** by test/ratings.js: keep
    it free of anything else in the file, and keep the markers.
20. **A ratings file exists only once a rated game is recorded** (default `~/.broodwar-remake/ratings.json`); suites set
    `BW_RATINGS` to a temporary file. Nothing but test/ratings.js sends an identity key to a real relay.
21. **A guard no control can tell from its absence is dead weight**: the stall watcher's pause check (a paused game's
    `G.frame` does not move, so no timer grows) and its per-game reset (a new game's queue items are new objects) were
    both removed when their controls stayed green, with a comment in `js/ui.js` saying why they are not there.
22. **A "new game starts afresh" check must make the old entry match on everything but the thing under test**: the first
    version let game two's research move for 48 frames, so progress alone replaced the old entry and deleting the
    `w.item !== it` identity test changed nothing. It now reports game one's stall, then freezes the same research on the
    same Academy id at the same progress in game two.
23. **A lifted building never has a queue** (`G.liftBuilding` refuses): a by-hand step that lifts one to show "no
    report" proves nothing. The stall watcher's lifted excuse exists for queue items pushed by hand in tests and scenes.
24. **An AI starved by the slower economy shows no error, only a flat line**: 13 workers for seven minutes, every refusal a
    quiet ledger entry. `.claude/review/aipace/timeline.js` prints workers, army, halls, the head of the order and every
    funded claim each half-minute, and found both starvation loops (the worker floor, the expansion claim) in one run.
25. **Measure AI arms on copies, with the suites as the instrument**: `.claude/review/aipace/arms.js` copies `js/` and the
    suites into `arms/<name>/`, patches the copy and runs them side by side (the harness's root is the folder above
    `test/`). Once a patch is in the working tree, arms written against the old code need `--rev=HEAD`.
26. **`script()` returns before re-deriving `headDef` while the head step's supply is not reached**, so budget() keeps
    holding a step the order has passed (a Factory's 200/100 from 7:30 to 10:00 in one game). Found in item G and NOT
    fixed -- neither suite needed it, so it was not narrow. Likewise the Queen's Nest's head claim waits on the gas-tech
    gate (funded 7:30, built 9:42). Both belong to 7b.
27. **A suite that plays two computers against each other measures the matchup, not the AI**: zerg12 section 8's "fields
    Roaches" was green only while its Terran opponent never attacked. Reachability is measured against a passive
    opponent (the rig `aistyles` and `queens` already use).
28. **`test/aistyles.js` pins the two-argument wave thresholds** (31/24/20 since item G). Any change to the threshold moves
    that pin; control c7 shows it is still exact.
29. **PowerShell `Start-Job -ArgumentList` flattens an array argument** into separate ones: run parallel node jobs from a
    small node runner instead (`.claude/review/aipace/run-after.js`).

## Diagnostics added this session

`tools/playtest-listen.js`, `tools/playtest-client.js`, `tools/playtest-report.js` (tracked). `.claude/review/starts/` --
`probe.js` (the placement baseline, run before any change), the patch specs, `controls.js` (30), `gate-1.log`, the
`aistyles` / `eightplayer` / `net_many` logs. `.claude/review/playtest/` -- the user's recorded playtest and `report-1.txt`.
`tools/stall-replay.js` (tracked): a recorded game re-simulated from its replay, every pause over ten seconds named with its
reason. `.claude/review/stall/` -- `probe-25min.log` and `scenes.log` (today's code), `replay-probe.log`, `controls.js` (15),
`handcheck.js` (PLAYTEST 99's by-hand steps walked headlessly: the explanation 21 game seconds after the Pylon dies, the
report at 10), the patch specs and the gate logs. `.claude/review/aipace/` (item G) -- `arms.js` and `arms-v1..v8.js`
(every arm and its suite logs under `arms/`, including `old75`, today's AI on the old economy), `timeline.js`,
`basecount.js`, `qol-probe.js`, `zerg12-probe.js`, `zerg12-when.js`, `run-after.js`, `stamp.js`, `controls.js` +
`check-controls.js` (8) and `controls2.js` (4), both attack-clock logs, the ledger log, the patch specs and the gate logs.

---

## Kickoff prompt for a fresh chat

Paste everything inside the fence into an empty chat. **Replace the HEAD placeholder with `git log -1 --format=%h`
first** -- committing this file moves it.

```
Repo: C:\Users\zacsl\OneDrive\Documents\Default Project\broodwar
Branch: m10-overnight, which IS origin/main (https://github.com/Zacsluss/Outerworld-War -- a PUBLIC repo; git push
publishes). HEAD: <run git log -1 --format=%h>. Working tree clean, nothing unpushed, no open PRs, no other branches,
no extra worktrees. Keep it that way.
Machine: Windows 11; PowerShell and Git Bash; Node 24. There is no gh CLI and no Blender.

READ IN THIS ORDER, then start:
  1. CLAUDE.md          -- the working agreement. Every rule in it is non-negotiable.
  2. TODO-M18.md        -- its FIRST section, "THE WORK QUEUE": the user's decision on every open item, THEIR ANSWERS
                           to the three questions (ninth session), the order, and what each item needs.
  3. HANDOFF-M18.md     -- the state and the traps, newest session first.
  4. PLAYTEST-M18.md (items 64 on) and RESEARCH-LOBBY.md -- as each item needs them.

THE STATE: node test/all.js is 90 suites, ~5 minutes, ALL GREEN. Build stamp 70eec21987ffeaf7. The whole work queue is
DONE: A (start positions), B (rematch), C (ratings and balanced teams), D (unsigned desktop builds in GitHub Actions),
E (relay safety), F (research that gets stuck: still not reproduced, so the game explains a rule pause and reports an
unexplained one in one line) and G (the two red suites: the AI's worker floor, Terran/Protoss expansion clock and wave
threshold, narrowly -- Terran and Protoss computers attack again; the Zerg computer is still passive).

THE USER'S ANSWERS (do not ask again): G is AUTHORIZED ("you can fix now") -- narrowly, with test/balance.js and
test/proxy.js untouched; D is UNSIGNED BUILDS ONLY (no Apple Developer Program, no paid Windows signing); their playtest
of 88-93 is done and written up in TODO-M18 ("The ninth session"). The user wants EVERY queue item finished: do not
stop between items, and resume anything a message interrupts.

THE SINGLE NEXT ACTION: ask the user two things in one message, then wait for the answers. (1) Their playtest of
PLAYTEST-M18 items 94-100: start the recorder first (node tools/playtest-listen.js, or the `playtest` entry in
.claude/launch.json; they play at http://127.0.0.1:8870) and read it with node tools/playtest-report.js when they say done.
(2) Whether to start one of the two items they are holding: the AI rebalance (TODO-M18 7b -- the Zerg computer first, and
the two budget faults item G found and left) or the terrain art path. Start neither without their word.

THE QUEUE: empty. HELD until the user says so: the AI rebalance (TODO-M18 7b) and the terrain art path.

FOR EVERY ITEM:
  - Research how established games do it first and tell the user what you found, with sources. A research subagent
    must be told never to put an email address or any personal detail in a request, URL or header (one did, once).
  - MEASURE BEFORE FIXING: build the probe first and make it assert its own setup.
  - Every new behaviour gets a negative control that goes cleanly RED (tools/control.js, or a runner like
    .claude/review/starts/controls.js). A check a control does not turn red is a weak check: strengthen it.
  - node test/all.js before every commit; touch nothing in js/ or test/ while it runs. A red rooms/lobby/starts with
    EADDRINUSE is a stray server on the relay ports (CLAUDE.md lists them): re-run that suite alone, then the gate.
  - After any relay or net change run node test/net_many.js by hand; after any AI or simulation change run
    node test/aistyles.js --seed=1 / --seed=5 / --seed=11 and node test/eightplayer.js, and record ALL the numbers.
  - Write a PLAYTEST-M18.md entry saying how to try it by hand; update TODO-M18.md and HANDOFF-M18.md; commit and push.
  - To let the user playtest with a record: node tools/playtest-listen.js (http://127.0.0.1:8870, serves the last
    commit), then node tools/playtest-report.js when they say done.

HARD RULES:
  - Never Math.random() in simulation code (G.rand()). Anything a replay or a rejoin must reproduce goes through the
    G.init options or the command log (test/cmdlog.js).
  - A change to a stamped file (js/data, map, sim, game, combat, abilities, commands, ai, missions, build) moves the
    build stamp: old saves and replays are refused. Say so in the PLAYTEST entry.
  - The relay (test/serve.js) must stay dependency-free: the desktop app's relay is built from it as one executable.
  - Detect line endings per file. Edit with tools/patch.js and write every spec and probe with the Write tool (bash
    mangles backslashes and backticks, heredocs included). Never sed -i.
  - Never start test/balance.js or test/proxy.js without an explicit, double-checked instruction.
  - Never type, store or handle the user's passwords, certificates or API keys. Art or assets someone bought stay out
    of this public repository.
  - The comments in js/ are load-bearing: they record why the obvious thing was not done. Do not delete reasoning.

CLOSE THE SESSION the CLAUDE.md way: a numbered list of what changed FOR A PLAYER (including anything deliberately
different from what was asked, and anything unfinished), how to playtest each item by hand (written into
PLAYTEST-M18.md), a new kickoff prompt at the top of HANDOFF-M18.md, and everything committed and pushed.
```

---

# The eighth session (the menus, researched), kept for the record

Written at the end of the eighth session (2026-09-12). Branch `m10-overnight`, which is `origin/main`. **Everything is
committed and pushed; there are no open pull requests, no other branches and no extra worktrees.** Trust `git log -1`
for HEAD, not a hash written here.

> **READ `TODO-M18.md` FIRST: its first section, THE WORK QUEUE, holds the user's decision on every open item and the
> order to do them in.** The eighth session's own list follows it. `PLAYTEST-M18.md` items 88–93 are how to see this
> session's work by hand. `RESEARCH-LOBBY.md` sections 5 and 6 are its
> research. The seventh session's handoff follows this one and its traps are all still true.

---

## The state

- **The gate is 85 suites and 2 are red, the same two the user accepted as waiting on the rebalance:** `aistyles` and
  `queens` (the computer's pacing under the slower economy). Nothing this session touched the simulation: the build
  stamp is still `71053b300e9bf18a`, and the new suites are `menus` (79 checks) and `hotkeys` (31).
- **By hand, because `js/net.js` changed** (its connection and lobby drawing): `node test/net_many.js` 51/51, and
  `desktop/page-check.js` 22/22. `desktop/dist` refreshed. In the browser: the name prompt, Single Player, the skirmish
  lobby to a started game, MULTIPLAYER to the list and to TRY AGAIN, and a rebound SCV key trained on its new letter.
- **Negative controls:** 40 for the menus (`.claude/review/menus/controls-menus.js`) and 26 for the command-card keys
  (`controls-hotkeys.js`); every one goes cleanly red.
- **The user has decided every open item** (TODO-M18, THE WORK QUEUE): build start positions, a rematch, ratings and
  balanced teams, the Mac build with signing, basic relay safety; fix the stuck research and the two red suites; DEFER
  the AI rebalance and the terrain art. Items 2 and 3 conflict (the reds ARE the rebalance), so the queue's first step is
  to ask. `test/balance.js` and `test/proxy.js` stay untouched until an explicit go, double-checked.
- **`.claude/review/` is local scratch** (gitignored): the negative-control runners and logs there exist on this
  machine only. The probes open work needs are tracked in `tools/` (`stall-probe.js`, `stall-scenes.js`,
  `attack-clock.js`).

---

## What changed this session, in a player's language

The user's message: the menus and the lobby looked unresearched. The research is OpenRA (read from its source: its
main menu, its skirmish lobby, its first-launch prompt, its hotkeys panel) and StarCraft II (its Versus A.I. lobby and
its hotkey editor, through the open-source editor that reproduces it).

1. **The main menu is the title and three buttons.** The tagline and the control hints are gone.
2. **The game asks your name the first time it opens**, before the main menu, and never again (it is changed in
   Settings → Multiplayer). An invite link waits for the name.
3. **Single Player is only its doors**: Skirmish Setup, Campaign, Load Saved Game, Watch Replay, Continue Autosave,
   Map Editor. There is no Start Game button on it.
4. **Skirmish Setup is the multiplayer lobby**, the same screen -- teams, slots with race / difficulty / style / team,
   add A.I., shuffle, the map preview and the rules column, the chat -- without what only other humans need (READY,
   latency, spectators, lock, privacy, room code, invite). BACK instead of QUIT, and a Seed row. START needs a computer
   opponent and a start position for everyone. The setup is remembered; maps made in the editor are offered.
5. **Multiplayer is one click**: it connects and shows the game list. The server box only appears when the server
   cannot be reached, says which server, and has TRY AGAIN.
6. **Settings has a Codex tab.**
7. **The Hotkeys dropdown is gone; the Controls tab is every key.** Standard or Grid at the top; Interface keys; and
   for each race, every command card drawn as the game draws it, where any button's key can be changed. A command on
   many cards (Move, Set Rally) is one key everywhere. A letter used twice on a card, or taken by an Interface key, turns
   red and says why. Reset a key, a card, or everything. The command card shows a chosen letter in the button's corner,
   and F1's help lists the keys as they are set.

8. **Units in different places gather where you right-click** (the user's bug report). A group keeps its shape only
   when it is already together and you click outside it; units spread out, or a click inside a group, all go to the
   point. PLAYTEST 93.

**Deliberately different from the letter of the request, and why:** the skirmish lobby keeps the chat box (OpenRA's
skirmish lobby keeps it too; here it logs every change) and gains a Seed row (the one setting a relay room picks by
itself). Command card keys are letters only: every other key is a global binding or reserved, and those are read first.

**Not done:** nothing from the list. Still open from before: the AI rebalance (gated), a rematch lobby, ratings, choosing
a start position, the research stall (TODO-M18 item 4, not reproduced).

---

## Traps found this session

1. **The skirmish lobby and the multiplayer lobby are the same markup, so they have the same ids.** Every lookup inside a
   lobby goes through `Net.finder(container)`; `document.getElementById` would bind the skirmish lobby's START to the
   multiplayer room. The skirmish lobby's markup is taken out of the page when it is left or started.
2. **Every command-card button must name its command.** `UI.currentCard` resolves keys through `UI.cardKeyFor(b.cmd,
   ...)`; a button with no `cmd` cannot be rebound. New general commands go through `C()` and `UI.CARD_COMMANDS`; a unit,
   building, upgrade or tech passes `cmd: 'unit:' + id` (and so on). **`test/hotkeys.js` section 1 turns red** if
   `UI.cardCatalog()` no longer matches `buildCard` -- update the catalogue in the same change.
3. **Grid's letter for slot 0 is Q.** A check that rebinds the first button to Q cannot tell a choice from Grid; the tests
   use K.
4. **Cancel has no command on purpose.** In Grid only the `hk !== 'Escape'` guard in `currentCard` keeps it on Escape.
5. **The first-launch prompt is versioned** (`bw_intro`, `INTRO_VERSION` in the boot code). Raise the version to ask
   everyone again, as OpenRA does when its prompt gains a setting.
6. **`UI.enterMultiplayer` compares the address actually connected (`Net.url`)**, not the typed one: Settings writes
   `Net.urlTyped` the moment the box changes, so comparing typed values kept a stale connection.
7. **Bash heredocs ate `\\'` in a patch spec again** and left `test/all.js` unparseable. Write specs with the Write tool.
8. **The browser pane's screenshot is a zoomed crop of a large viewport.** For a whole screen, scale the page for the
   screenshot only (`document.body.style` width/height 100vw/100vh, `transformOrigin '0 0'`, `transform 'scale(0.66)'`),
   or translate the panel under the capture; verify state with `javascript_tool`.

## Diagnostics added this session

`.claude/review/menus/` -- the patch scripts and text for both commits, `controls-menus.js` (40), `controls-hotkeys.js`
(26), and the gate logs.

---

## The eighth session's kickoff prompt (SUPERSEDED by the one at the top of this file)

Paste everything inside the fence into an empty chat. **Replace the HEAD placeholder with `git log -1 --format=%h`
first** -- committing this file moves it.

```
Repo: C:\Users\zacsl\OneDrive\Documents\Default Project\broodwar
Branch: m10-overnight, which IS origin/main (https://github.com/Zacsluss/Outerworld-War -- a PUBLIC repo; git push
publishes). HEAD: <run git log -1 --format=%h>. Working tree clean, nothing unpushed, no open PRs, no other branches,
no extra worktrees. Keep it that way.
Machine: Windows 11; PowerShell and Git Bash; Node 24. There is no gh CLI and no Blender. No game servers are running.

READ IN THIS ORDER, then start:
  1. CLAUDE.md          -- the working agreement. Every rule in it is non-negotiable.
  2. TODO-M18.md        -- its FIRST section, "THE WORK QUEUE", is your job: the user's decision on every open item,
                           the order to do them in, and what each needs.
  3. HANDOFF-M18.md     -- the state and the traps, newest session first.
  4. PLAYTEST-M18.md (items 64 on) and RESEARCH-LOBBY.md -- as each item needs them.

THE STATE: node test/all.js is 85 suites, ~5 minutes, and 2 are RED: aistyles and queens. Both are the computer AI's
pacing under the slower economy -- no computer attacks inside ten minutes, and Zerg Queens come a minute late. They
are queue item G and do not block the other items. Build stamp 71053b300e9bf18a.

THE SINGLE NEXT ACTION: send the user the three questions in the queue's "Ask the user first" section --
  (1) items 2 and 3 conflict: may the AI's wave threshold and Queen timing be changed narrowly now to fix the two red
      suites, with test/balance.js and test/proxy.js still untouched?
  (2) the Mac build and code signing need accounts and GitHub repository secrets only the user can create: list them;
  (3) their playtest of PLAYTEST-M18 items 88-93, whenever they are ready --
then start queue item A (choose a start position in the lobby) without waiting for the answers.

THE QUEUE, in order: A start positions in the lobby -> B rematch / back to the lobby -> C ratings and skill-balanced
teams -> D desktop Mac build and code signing (an unsigned CI build first) -> E basic internet-play safety for the
relay -> F research that gets stuck (reproduce first) -> G the two red suites, only as the user answers question 1.
DEFERRED until the user says so: the AI rebalance (TODO-M18 7b) and the terrain art path.

FOR EVERY ITEM:
  - Research how established games do it first (OpenRA, StarCraft II, Age of Empires II, Beyond All Reason) and tell
    the user what you found, with sources -- the user asked for this explicitly after a menu redesign that skipped it.
  - MEASURE BEFORE FIXING: build the probe first and make it assert its own setup.
  - Every new behaviour gets a negative control that goes cleanly RED (tools/control.js, or a runner like
    .claude/review/menus/controls-menus.js).
  - node test/all.js before every commit; touch nothing in js/ or test/ while it runs. A red rooms/lobby with
    EADDRINUSE is a stray server on the relay ports (CLAUDE.md lists them): re-run that suite alone, then the gate.
  - After any relay or net change run node test/net_many.js by hand; after any AI or simulation change run
    node test/aistyles.js --seed=1 / --seed=5 / --seed=11 and node test/eightplayer.js, and record ALL the numbers.
  - Write a PLAYTEST-M18.md entry saying how to try it by hand; update TODO-M18.md and HANDOFF-M18.md; commit and push.
  - If the chat grows long, write the handoff and a new kickoff prompt before starting the next item.

HARD RULES:
  - Never Math.random() in simulation code (G.rand()). Anything a replay or a rejoin must reproduce goes through the
    G.init options or the command log (test/cmdlog.js).
  - A change to a stamped file (js/data, map, sim, game, combat, abilities, commands, ai, missions, build) moves the
    build stamp: old saves and replays are refused. Say so in the PLAYTEST entry.
  - The relay (test/serve.js) must stay dependency-free: the desktop app's relay is built from it as one executable.
  - Detect line endings per file. Edit with tools/patch.js and write every spec and probe with the Write tool (bash
    mangles backslashes and backticks, heredocs included). Never sed -i.
  - Never start test/balance.js or test/proxy.js without an explicit, double-checked instruction.
  - Never type, store or handle the user's passwords, certificates or API keys: the user adds secrets themselves.
    Art or assets someone bought stay out of this public repository.
  - The comments in js/ are load-bearing: they record why the obvious thing was not done. Do not delete reasoning.

CLOSE THE SESSION the CLAUDE.md way: a numbered list of what changed FOR A PLAYER (including anything deliberately
different from what was asked, and anything unfinished), how to playtest each item by hand (written into
PLAYTEST-M18.md), a new kickoff prompt at the top of HANDOFF-M18.md, and everything committed and pushed.
```

---

# The seventh session (the user's second list), kept for the record

Written at the end of the seventh session (2026-09-12). Branch `m10-overnight`, which is `origin/main`. **Everything is
committed and pushed; there are no open pull requests, no other branches and no extra worktrees.** Trust `git log -1`
for HEAD, not a hash written here.

> **READ `TODO-M18.md` FOR THE OPEN LIST** (its first section is this session's list, item by item, with commits).
> `PLAYTEST-M18.md` items 73–87 are how to see this session's work by hand. `RESEARCH-LOBBY.md` is the lobby research.
> `HANDOFF-M17.md`'s traps are all still true; this session's are below, then the sixth session's.

---

## The state

- **The gate is 83 suites and 2 are red, the same two the user already accepted as waiting on the rebalance:**
  `aistyles` and `queens`. Both are the computer's pacing under the slower economy. `queens` joined `zerg12`'s old place
  this session: keeping unit bodies apart shifted the Zerg AI's build (it fields its first army sooner and mines more,
  1–24% over four seeds, but starts the Queen's Nest later, so its Queens arrive about a minute after the ten-minute mark
  the test checks). `zerg12` went green in the same change.
- **Build stamp `71053b300e9bf18a`** (moved once this session, by unit bodies). Saves and replays from before are refused.
- **By hand, on the final tree:** `aistyles` seeds 1/5/11 — the same seven economy lines as before the session's sim
  change, with the long-standing flaky "harasser fields more fast units than turtle" line re-dealt between seeds;
  `eightplayer` 18/19 (the economy-floor line; it was 17/19 before bodies); `net_many` 51/51.
- **Desktop:** `desktop/dist` refreshed. The relay sidecar (`bw-relay`) is rebuilt from `test/serve.js` by `npm run dev`
  and `npm run build` on their own (`beforeDevCommand`), so the desktop HOST button gets the new lobby on the next build.

### The decisions still waiting on the user

1. **The AI rebalance (TODO-M18 7b) is still gated** — the user said "no rebalance yet, still more bugs to fix". It now has
   two more things to absorb, both consequences of units no longer overlapping: fewer melee units can hit one target at
   once (sixteen zerglings on a marine: about five, where sixteen could before), and the Zerg AI's later Queens.
   `test/balance.js` and `test/proxy.js` stay untouched until an explicit go, double-checked.

---

## What changed this session, in a player's language

1. **The dragoon wobble is fixed** — committed on the user's word.
2. **The HUD is 1.4 times its original size** (the doubled one was too big), and now a **HUD size slider** in Settings
   goes from 1.0x to 1.6x and is remembered.
3. **The minimap is black until you explore it**, not a dim map with everything visible.
4. **The mouse cursor has no lag** — it is the real cursor dressed in the game's art, not a drawing a frame behind.
5. **Minerals were measured, not changed**: 48 a worker a minute, against StarCraft II's 54–61. The earlier change had
   landed; the fast rate seen was most likely an old page or an old desktop build.
6. **A builder stays where it finished**, instead of walking back to the minerals (Terran and Protoss both checked).
7. **A worker inside a Refinery stays selected** and shows "Harvesting gas" in the HUD.
8. **Queued buildings show a faint ghost** where they will go, and nothing can be placed on top of one.
9. **Supply Depots lower into the ground and rise again** (R), with StarCraft II's rules.
10. **Units no longer stand inside each other.** Each unit keeps the room its model really takes up: a dozen marines
    told to one spot used to hide 53% of their drawn area under each other and now hide 3%. Mining, repair, archon
    merges, following and melee all still work, each checked. **What it costs, deliberately:** fewer melee units fit
    round one target, one-tile chokes take about twice as long, and the Zerg AI gets its Queens a minute later.
11. **The multiplayer screen is a full hub**: a searchable, filterable, sortable game list with a detail pane (map, players,
    rules), QUICK JOIN, and an **invite link** that connects and joins by itself. Your name, server and race are
    remembered.
12. **Ready means ready**: START waits until every other player has readied and says who it is waiting on; changing
    the map, speed, rules, computers or teams withdraws everyone's ready; the host can **nudge** a player with a bell.
13. **Every player's connection is shown** (bars and milliseconds, red when slower than the command delay), and **chat
    says everything that changed** — joins, leaves, kicks, a new host, the map, each rule.
14. **Teams can be locked and shuffled**, and **a game can no longer hold more players than its map has starts** — a
    fifth player on a four-start map used to be built inside player one's base.
15. **The skirmish rules work online**: starting bank, weather, day and night, destructibles, derelicts, wildlife, the map
    sizes and procedural maps.
16. **Spectators**: watch a lobby or a game already running, with the whole map in view, without taking a seat; the
    players never wait on a spectator.
17. **Settings are in tabs** (Game, Display, Audio, Multiplayer, Controls) with scroll speed, edge scrolling, one master
    volume, and your multiplayer name and server; all remembered except mute. F10 → Settings steps the same values in a
    game.

**Not done, and said so:** the AI rebalance (gated); a **rematch / back-to-the-same-lobby** after a game (the relay would
have to hand a finished room back to its lobby while a player may still be watching its end — a design of its own);
**ratings and skill-balanced teams** (nothing records a result to rate); **choosing a start position** (a seat is its
start, and a choice would have to be read in the stamped `G.init`); the **research stall** (TODO-M18 item 4, still not
reproduced).

---

## Traps found this session

1. **Bash heredocs mangle backslashes too**, not only `node -e`: a quoted heredoc turned `'\\n'` inside a template
   literal into a real newline. Write specs and probes with the Write tool, as CLAUDE.md says.
2. **`sed -i` in Git Bash rewrites a CRLF file as LF.** Git normalises it away, but `tools/patch.js` then sees a different
   ending. Edit with node scripts that keep the file's own ending.
3. **More players than starts is silently accepted by `G.init`**: player i takes `map.starts[i % starts.length]`. The lobby
   now refuses such a room (`capOf` in the relay, `Net.mapCap` in the host's client), but the engine does not — and
   `test/net_many.js` plays five on four-start maps on purpose, so its clients declare eight seats.
4. **Any "close enough to touch" check between two units must be read against bodies**, not footprints. Orders about an
   ally (repair, follow, merge, cast) are covered by the ally-order-target rule in `G.separate`; a NEW reach check that is
   not the unit's `order.target`/`partner` will be held out by bodies. `test/overlap.js` section 3 is the pattern.
5. **The relay does not re-broadcast the lobby state when a countdown ends in a start**: a client's last `lobby` message
   still says `starting` during the game. Test on the `start` message, not on `lobby.state`.
6. **`test/rooms.js` sections 12 and 15 pin lobby markup** (`class="lbTeam"`, `data-join`, `id="lbStart"`, `3/8`,
   `in game`…). Keep those names when restyling the lobby.
7. **Suites that start relay games without readying need `BW_READY=0`**, the way they already set `BW_COUNTDOWN=0`.
8. **`UI.menuItems()` for the end screen reads `G.log`**, which `UI.start` sets and a bare `G.init` does not.
9. **The browser pane's screenshot crops to a zoomed corner when the emulated viewport is larger than the pane.** Verify
   state with `javascript_tool` and do not trust a cropped picture for layout.

## Diagnostics added this session

`.claude/review/overlap/` — `probe.js` (hidden model area, collisions, surround, mining, gap throughput, perf),
`controls.js`, `gap-trace.js`, `queens-sweep.js`, `zerg-econ.js`, `zerg-builds.js`. `tools/bodies.js` measures every
model's body from the bake pipeline (`--table` prints the table for `js/data.js`). `.claude/review/lobby/` — the specs, and
`controls.js` (21), `controls-spectate.js` (12), `controls-settings.js` (13).

---

## The seventh session's kickoff prompt (SUPERSEDED by the one at the top of this file)

Paste everything inside the fence into an empty chat. **Replace the HEAD hash with `git log -1 --format=%h` first** —
committing this file moves it.

```
Repo: C:\Users\zacsl\OneDrive\Documents\Default Project\broodwar
Branch: m10-overnight. HEAD: <run git log -1 --format=%h>. Working tree clean.
origin = https://github.com/Zacsluss/Outerworld-War, whose main IS this branch (git push publishes).
Everything is pushed; there are no open PRs, no other branches, no extra worktrees. Keep it that way.

READ IN THIS ORDER, then start:
  1. CLAUDE.md          -- the working agreement. Every line was earned; none is optional.
  2. HANDOFF-M18.md     -- state, what changed for a player, the traps (this session's first).
  3. TODO-M18.md        -- the open list; its first section is the seventh session's list with commits.
  4. PLAYTEST-M18.md    -- items 73-87, this session's work, by hand.
  5. RESEARCH-LOBBY.md  -- what makes an RTS lobby great, and what this one now has.

THE STATE: the gate (node test/all.js, 83 suites, ~5 min) is 2 RED, both known and accepted by the user as waiting
on the AI rebalance: aistyles and queens (the computer's pacing under the slower economy). Build stamp
71053b300e9bf18a. By hand: aistyles seeds 1/5/11 same seven economy lines; eightplayer 18/19; net_many 51/51.

THE SINGLE NEXT ACTION: ask the user for their playtest of PLAYTEST-M18 items 73-87 and their next list. The user's
last word on the rebalance was "no rebalance yet - still more bugs to fix". Do NOT start TODO-M18 7b, test/balance.js
or test/proxy.js without an explicit go, and double-check when it comes. When it does, it must also absorb two
consequences of units keeping their bodies apart: fewer melee attackers fit round one target, and the Zerg AI's
Queens arrive about a minute later.

IF ASKED FOR MORE LOBBY: the documented next step is a rematch -- the finished room handed back to its lobby with the
same players. Read RESEARCH-LOBBY.md section 4 for why it was left, and design the "a player is still watching the end"
case before writing code.

HOW THIS PROJECT WORKS, none of it negotiable:
  - node test/all.js is the gate before EVERY commit. Relay ports: 8793-8800 rooms, 8810-8813 lobby, 8840 spectate.
    A red rooms/lobby with EADDRINUSE is a stray server: re-run that suite alone, then the gate. Touch nothing in
    js/ or test/ while the gate runs.
  - MEASURE BEFORE FIXING. Build the probe first; make it assert its own setup.
  - EVERY new behaviour gets a negative control that goes cleanly RED.
  - tools/patch.js <spec.js> for every text-anchored edit. Write specs and probes with the Write tool: bash mangles
    backslashes AND backticks here, heredocs included. Never sed -i a CRLF file.
  - Determinism: never Math.random() in sim code (G.rand()), never a native transcendental in a stamped file (DMath).
    Anything a replay must reproduce goes through the command log (test/cmdlog.js).
  - The comments are load-bearing. Do not delete reasoning.

AFTER ANY AI OR SIMULATION CHANGE, by hand, recording ALL the numbers:
  node test/aistyles.js --seed=1 / --seed=5 / --seed=11
  node test/eightplayer.js
  node test/net_many.js     (after any relay or net change)
Expect the samples to RE-DEAL. A different deal is not a failure; a new KIND of failure is.

CLOSE every piece of work the way CLAUDE.md says: a kickoff prompt, a numbered list of what changed FOR A PLAYER, and
how to playtest each item by hand, written into the repo. Commit and push; leave nothing unmerged.
```

---

# The sixth session, kept for the record

## What changed, in a player's language

1. **The multiplayer lobby is finished and shaped like StarCraft II's.** Two columns — teams on the left, a Game
   Settings panel on the right — and a bottom bar of READY / START GAME / MAKE PRIVATE / QUIT. *(item 64)*
2. **Every computer opponent in a lobby is configurable**: race, difficulty, **play style** and team, set by the
   host, removable, and it really plays that way — the style reaches the simulation. Adding another copies the
   last one's settings. *(item 64)*
3. **The lobby draws a real map preview** — the start positions in each seat's colour, and the expansions —
   and each slot shows the colour it will play in. *(item 64)*
4. **A hosted game can be made private** (gone from everyone's list, same code still works) and public again.
   *(item 64)*
5. **START runs a 5-4-3-2-1 countdown**, timed by the server so every player sees the same digit at the same
   moment. During it nothing can change and nobody can join; the host can cancel, and anyone leaving cancels it.
   *(item 65)*
6. **The HUD is twice the size** on any window 1080 px tall or more, and as much bigger as fits on a smaller
   one. Every button, the minimap and the selection strip still click exactly where they are drawn. One
   constant, `HUD_SCALE` in `js/ui.js`, sets it. *(item 66)*
7. **A Queen or Overlord ordered to plant a creep tumour out of range walks into range and plants it**, up to 36
   tiles — a number measured from the maps so it covers every natural and never a trek to an enemy base. Past
   that it says the walk ran out. A tumour spreading creep by itself still refuses past its range. *(item 67)*
8. **The Zerg computer no longer overshoots its creep-tumour cap** (it could reach nine against eight once
   casters walked in to plant). *(item 67)*
9. **Research that gets stuck: NOT reproduced**, after 75 minutes of AI games and nine directed scenes. Every
   candidate cause is ruled out with a reason, and the probes are committed so it can be re-run. There is one
   console line to run if it happens again. *(item 68)*
10. **A unit can no longer morph while riding in a transport.** A Zergling loaded into an Overlord and turned
    into a Baneling used to sit as a frozen cocoon for the whole ride; the computer did it to itself. *(item 69)*
11. **Workers stop when their mineral line runs out** instead of walking to the next base on their own. They go
    idle; an order moves them. One patch running out still moves a worker to another on the same line, gas is
    unchanged, and the computer still re-tasks its own workers. *(item 70)*
12. **The dragoon wobble is measured and fixed, but not on the main line** — see the decision above. *(TODO item 11)*
13. **The economy runs at StarCraft II's pace**: about half the income. The computer barely attacks until task 2
    is done. *(item 72)*

**Deliberately different from what was asked:**
- The lobby has **no handicap** (it scales income — gated balance), **no Category/Mode/Game Duration** (nothing
  simulates them), **no Locked Alliances switch** (alliances are always locked, so it is stated as a fact), **no
  colour picker** (a chosen colour must be read in stamped files and would move the stamp for paint — the lobby
  shows each seat's colour instead) and **no map author** (nothing records one). The panel says all of this on
  screen.
- The **countdown is configurable** (`BW_COUNTDOWN`, 0 turns it off) so the two socket suites don't pay five
  seconds a game.
- The creep tumour **walk is bounded**, as TODO-M18 required, rather than unlimited.
- The **HUD's mouse cursor, pause menu, help and codex are not scaled** — they are not the console band.

**Left unfinished, stated plainly:** the research stall (not reproduced); the dragoon wobble's commit (a
decision); the residual crowd jostle even with the wobble fix (needs per-unit steering or formations); task 2.

---

## Traps found this session

1. **Patching `js/` while a gate is running corrupts the run.** `test/tumour.js` hung on a half-written file
   and had to be discarded. HANDOFF-M17 trap 5 says this about `eightplayer`; it is true of the whole gate.
   Nothing touches `js/` or `test/` until `wall clock` is in the log.
2. **Bash eats backticks in `node -e "..."`**, not only backslashes. A TODO entry lost four `code` names to
   command substitution. Every edit with a backtick in it goes through the Write tool as a file.
3. **A negative control that deletes a guard is not always the control.** Deleting the wobble fix's hold left
   an else-branch that caps every turn anyway, so a real check stayed green for a good reason. The honest
   control put the *original line* back.
4. **A probe that does not create its case reports "ok".** Four of the first stall scenes silently did nothing
   (an Academy cannot lift; a Forge does not research `infW`). Every scene now asserts its own setup.
5. **`canMove` is a getter.** Assigning `false` to it does nothing, so an "immobile" test unit walked.
6. **`tools/patch.js` checks every anchor against the ORIGINAL text**, so a second edit in one spec cannot
   anchor on text the first edit writes.
7. **A by-hand AI sample can hide a real regression behind "it re-dealt".** The rejected wobble variant kept
   the gate seed green while `eightplayer` quietly lost "the AI expanded". Run all of the by-hand checks, not
   just the one that is red.
8. **There are FOUR locked agent worktrees, not three**, all at `e9fe40e`. Their work is now superseded by this
   session's commits. They were not removed; the last removal needed the user's word.

---

## Diagnostics added this session

```
node tools/stall-probe.js --minutes=25 --seeds=3,7,11    every production slot that stalls, with the building's state
node tools/stall-scenes.js                                nine candidate causes of stuck research, each asserting its setup
node tools/wobble-probe.js                                a unit's facing, per frame, during and after a move
node tools/wobble-render.js                               the drawn side: sprite direction, animation, settle spring
node tools/patch.js tools/wobble-fix.js                   the measured wobble fix, waiting on a decision
node test/rooms.js                                        107 checks: sections 13-15 are the lobby slots, countdown, client
node test/qol.js                                          39 checks: the HUD scale and the exhausted mineral line
```

`.claude/review/` (gitignored) holds this session's specs, gate logs and the one-off measurements:
`hud-measure.js`, `tumour-reach.js`, `worker-walk.js`, `lobby-controls.js`, `hud-controls.js`,
`tumour-controls.js`, `wobble-control.js`, `mine-rate.js`.

