# HANDOFF — M18 (the looks queue is DONE: a finished first frame, continuous creep, taller cliffs, and every map redesigned)

Written 2026-09-17, at the end of the session that did the looks queue -- the user's four items of 2026-09-14. Branch
`m10-overnight`, which is `origin/main`. **Everything is committed and pushed; no open pull requests, no other branches, no extra
worktrees.** Trust `git log -1` for HEAD, not a hash written here.

> **The looks queue is DONE** (TODO-M18's first section; PLAYTEST-M18 118-122). Nothing is queued. The terrain queue's close, as
> written before the looks queue, follows this section and is kept for the record; its traps still hold. `SHIPPING.md` is what must
> be done before the final build ships.

---

## Kickoff prompt for a fresh chat

Open the new chat with the repository folder as its working directory, so `CLAUDE.md` loads by itself. Paste everything inside the
fence. **Replace the HEAD placeholder with `git log -1 --format=%h` first** -- committing this file moves it.

```
Repo: C:\Users\zacsl\OneDrive\Documents\Default Project\broodwar
Branch: m10-overnight, which IS origin/main (https://github.com/Zacsluss/Outerworld-War -- PUBLIC: git push publishes).
HEAD: <run git log -1 --format=%h>. Working tree clean, nothing unpushed, no open PRs, no other branches, no extra worktrees.
Machine: Windows 11; PowerShell 5.1 and Git Bash; Node 24; Rust + the Tauri CLI under desktop/; no gh CLI, no Blender.
The gate (node test/all.js) is 101 suites, about four minutes, ALL GREEN; no known reds. Build stamp 678387e310c2c3fe.
test/balance.js and test/proxy.js are GATED: never start them without an explicit, double-checked instruction.

STATE: THE LOOKS QUEUE is DONE (the user's four items of 2026-09-14; PLAYTEST-M18 118-122): 1. a loading screen, so a game opens on
its finished ground and never shows the old textures first; 2. creep as one continuous mass with a soft edge; 3. cliffs that look about
twice as tall; 4. every map redesigned to StarCraft II's structure -- a main up one ramp, the natural behind a choke, thirds, rich
bases, lanes, rocks on the back doors, two-player maps turned half round, and the generated maps' mains up a ramp and two-player
corners filled. The terrain queue before it is DONE too (PLAYTEST-M18 110-117).
THE CREEP'S TEXTURE is DONE too (PLAYTEST-M18 123): the user picked Abstract Organic 002 (CC0) and said yes to its two files; the creep
is made from them, kept purple, and falls back to the creep made in code where they cannot load.
THE USER WILL PLAYTEST: when they say so, restart the playtest recorder (preview_start "playtest", port 8870) and give them the link.
DEFERRED by the user until they say: the AI rebalance (TODO-M18 7b); it now also owns three loose style comparisons that flip on the
new Lost Ruins (PLAYTEST-M18 122; test/aistyles.js runs its style games on the old ground as a fixture). SKIPPED by the user: a
look-and-feel pass of PLAYTEST-M18 101-108.

THE NEXT ACTION: nothing is queued. When the user says they are ready to playtest, set up the recorder; then work what they report
from PLAYTEST-M18 118-123 the way every item here was worked.

READ, in this order, before touching anything:
  1. CLAUDE.md          -- the working agreement; every rule in it is non-negotiable.
  2. HANDOFF-M18.md     -- this top section, then the traps in the sections under it.
  3. TODO-M18.md        -- THE LOOKS QUEUE (all four items, measured), then THE TERRAIN QUEUE.
  4. SHIPPING.md        -- before any release: Actions -> Desktop builds -> Run workflow (it ignores js/ and assets/), and open
                           the Mac app on a real Mac (never done: there is no Mac here).

HOW TO WORK, every finding:
  - MEASURE BEFORE CHANGING: build the probe first and make it assert its own setup.
  - Every new behaviour gets a negative control that goes cleanly RED (tools/control.js applies one and restores the file).
  - Judge anything visible on real screenshots (preview_start "terrain-shot", tools/terrain-shot.js, port 8897) and send the user
    a before/after (SendUserFile) -- they judge by eye.
  - node test/all.js before every commit; touch nothing in js/ or test/ while it runs.
  - A PLAYTEST-M18.md entry per item saying how to see it by hand; update TODO-M18.md and HANDOFF-M18.md; commit and push.

HARD RULES:
  - Never Math.random() in simulation code (G.rand()); no native Math.sin/cos/atan2/hypot in stamped files (DMath). Anything a replay
    or a rejoin must reproduce goes through G.init or the command log. Terrain drawing is not simulation, but props must stay a pure
    function of the map, its seed and the tile.
  - A change to a stamped file (js/data, map, sim, game, combat, abilities, commands, ai, missions, build) moves the build stamp: say
    so in its PLAYTEST entry and run node test/net_many.js and node .claude/review/aipace/run-after.js <tag>.
  - A new map is judged three ways: node .claude/review/maps/map-png.js <id> (a picture with the walking distances), node
    test/maplayouts.js (StarCraft II's structure), and in-game screenshots.
  - The relay (test/serve.js) stays dependency-free.
  - Detect line endings per file. Edit with tools/patch.js; write every spec and probe with the Write tool; never sed -i.
  - Never type, store or handle the user's passwords, certificates or API keys. Art or assets someone bought stay out of this
    public repository. Nothing that costs money.
  - The comments in js/ are load-bearing: they record why the obvious thing was not done. Do not delete reasoning.
```

---

## The state

- **THE LOOKS QUEUE IS DONE** (the user, 2026-09-14; TODO-M18's first section), each item committed and pushed: 1. a loading screen
  makes a game's first frame its finished ground (PLAYTEST-M18 118); 2. creep as a continuous mass (119; and 120, a game started in a
  background tab); 3. cliffs that look about twice as tall (121); 4. every map redesigned to StarCraft II's structure (122).
- **The gate is 101 suites, ALL GREEN**, about four minutes (`maplayouts` is new). **Build stamp `678387e310c2c3fe`** -- item 4
  (`js/map.js`) moved it from `ca141a3b7ffcb528`; items 1-3 were drawing only. Older saves and replays are refused.
- **By hand after item 4:** `net_many` 51/51; `aistyles` on its pinned ground 132 / 131 / 132 on seeds 1 / 5 / 11 (seed 5's red is the
  known harasser line, 7b) with every style row identical to before the item; `queens` 25/25; `eightplayer` 19/19;
  `desktop/page-check.js` 22/22 (`desktop/dist` refreshed). Seventeen negative controls for item 4, every one red
  (`.claude/review/maps/controls-maps.log`).
- **The desktop app**: `desktop/window-check.js` 25/25 on a debug build at item 1. **The installers on GitHub are from `f68e8f3`,
  before any terrain work** -- `SHIPPING.md`.
- **The creep's texture is DONE** (PLAYTEST-M18 123): Abstract Organic 002, the user's pick; ten negative controls red. Drawing only,
  so the build stamp did not move. **Waiting on the user:** their playtest (the recorder on their word). **Deferred by the user until
  they say:** the AI rebalance (TODO-M18 7b). **Skipped by the user:** a look-and-feel pass of PLAYTEST-M18 101-108.
- **The repository is PUBLIC.** **The playtest recorder is left running for the user** (`playtest` in `.claude/launch.json`,
  `tools/playtest-listen.js`, port 8870); the screenshot servers were stopped at the close.

## What changed, in a player's language

1. **A game opens on its finished ground**: a loading screen with the map's name and picture, the players and a bar, while the
   detailed ground is prepared -- no classic textures first, no chunks sharpening one by one (118).
2. **Zerg creep is one continuous mass**: a soft ragged edge, no tiles and no lines, spreading and receding smoothly (119), and made from
   the texture the user picked, Abstract Organic 002 -- wet, folded, purple (123). A game started in a background tab starts with its
   detailed ground (120).
3. **Cliffs look about twice as tall**: a wider rock face and a shadow twice as long below each plateau and rock formation; ramps look as
   before (121).
4. **Every map is laid out like a StarCraft II map** (122): your main up one ramp, your natural beside it behind a choke, thirds further
   out, rich bases in the contested middle, lanes broken by rock, back doors shut by rocks you can destroy. Lost Ruins after Lost Temple
   (a temple of rich bases in the middle); Blood Pit a ring-walled pit of rich bases; Twilight Valley and Close Quarters turned half round
   with bases in every corner; Close Quarters has high ground at last; more bases a player on every map but Lost Ruins; The Long March at
   1300 a patch. The generated Open Basin's mains are up a ramp; a two-player generated map fills all four corners.

**Deliberately different from what was asked, all in the PLAYTEST entries:** a loading screen of one to two seconds was added, and a
restart prepares the ground again (118); creep is drawn at 1x on a 150% display (119); the picked texture is kept purple and only its colour and
displacement maps are used (123); "twice as tall" is the shadow and
the face -- a top-down view cannot show a wall's side (121); no watchtowers, sight blockers or mineral walls, two heights not three, rich
bases not coloured gold, the generated maps keep their own shapes, Lost Ruins' third moved rather than the AI changed, and the AI style
comparisons run on the old Lost Ruins (122). **Unfinished: nothing.** The AI rebalance waits for the user's word.

## How to playtest it by hand

Every item has its steps in PLAYTEST-M18 118-122. In short:
1. **Single Player -> Skirmish, Lost Ruins, START.** *Working:* a loading screen, then the detailed ground at once -- no flat textures
   first (118).
2. **Skirmish as Zerg**: look at the creep round your Hatchery, and build a Creep Colony. *Working:* one soft-edged mass, no squares or
   lines, growing smoothly (119).
3. **Look at your main's edge** beside its ramp. *Working:* a broad rock face and a long shadow below it (121).
4. **Press Enter, type black sheep wall, Enter, and zoom out** on Lost Ruins, Blood Pit, Twilight Valley and the four map sizes.
   *Working:* the layouts of PLAYTEST-M18 122 -- a main up one ramp to its natural, thirds, a rich middle, lanes, rock formations in
   the narrow back doors; the two-player maps look the same turned upside down (122).
5. **Procedural: Chokepoint Valley, size small.** *Working:* bases in all four corners (122).

---
---

# The terrain queue's close, as written 2026-09-13 and updated during the looks queue (kept for the record; its traps still hold)

## HANDOFF — M18 (the terrain queue is DONE: detailed terrain on every map, for everyone)

Written 2026-09-13, at the end of the session that did the whole terrain queue -- its five items and phase 1's leftovers. Branch
`m10-overnight`, which is `origin/main`. **Everything is committed and pushed; no open pull requests, no other branches, no extra
worktrees.** Trust `git log -1` for HEAD, not a hash written here.

> **The looks queue is in hand** (the user's four items of 2026-09-14, TODO-M18's first section): item 1 done (PLAYTEST-M18 118),
> item 2 next. `TODO-M18.md`, THE TERRAIN QUEUE, has the account of every
> phase before it; `SHIPPING.md` is what must be done before the final build ships.

---

## Kickoff prompt for a fresh chat

Open the new chat with the repository folder as its working directory, so `CLAUDE.md` loads by itself. Paste everything inside the
fence. **Replace the HEAD placeholder with `git log -1 --format=%h` first** -- committing this file moves it.

```
Repo: C:\Users\zacsl\OneDrive\Documents\Default Project\broodwar
Branch: m10-overnight, which IS origin/main (https://github.com/Zacsluss/Outerworld-War -- PUBLIC: git push publishes).
HEAD: <run git log -1 --format=%h>. Working tree clean, nothing unpushed, no open PRs, no other branches, no extra worktrees.
Machine: Windows 11; PowerShell 5.1 and Git Bash; Node 24; Rust + the Tauri CLI under desktop/; no gh CLI, no Blender.
The gate (node test/all.js) is 100 suites, about two minutes, ALL GREEN; no known reds. Build stamp ca141a3b7ffcb528.
test/balance.js and test/proxy.js are GATED: never start them without an explicit, double-checked instruction.

STATE: the terrain queue is DONE (PLAYTEST-M18 110-115) -- the user's "i just want great looking maps": ramps entered only at their
ends, and mined-out mineral patches that never open a cliff; detailed terrain on all five tilesets with rocks and plants lit like the
units; a matching far view and minimap; no hitch over 50 ms on The Long March; detailed terrain on by default with Classic one click
away in Settings. THE LOOKS QUEUE (TODO-M18's first section) is in hand: 1. no old textures before the new ones (DONE, a loading
screen, PLAYTEST-M18 118); 2. creep with no lines or tiles (DONE, 119-120); 3. cliffs about twice as tall (DONE, 121); 4. every map to StarCraft II's structure.
DEFERRED by the user until they say: the AI rebalance (TODO-M18 7b). SKIPPED by the user: a
look-and-feel pass of PLAYTEST-M18 101-108.

THE NEXT ACTION: the looks queue (TODO-M18's first section), item 4 -- every map redesigned to StarCraft II's structure (the research
brief: .claude/review/maps/research-brief.md). Items 1-3 are done (PLAYTEST-M18 118-121).

READ, in this order, before touching anything:
  1. CLAUDE.md          -- the working agreement; every rule in it is non-negotiable.
  2. HANDOFF-M18.md     -- this top section, then the traps in the terrain queue's section under it.
  3. TODO-M18.md        -- THE TERRAIN QUEUE (every phase, measured) and THE USER'S ANSWERS DURING THE TERRAIN QUEUE.
  4. SHIPPING.md        -- before any release: Actions -> Desktop builds -> Run workflow (it ignores js/ and assets/), and open
                           the Mac app on a real Mac (never done: there is no Mac here).

HOW TO WORK, every finding:
  - MEASURE BEFORE CHANGING: build the probe first and make it assert its own setup.
  - Every new behaviour gets a negative control that goes cleanly RED (tools/control.js applies one and restores the file).
  - Judge anything visible on real screenshots (preview_start "terrain-shot", tools/terrain-shot.js, port 8897) and send the user
    a before/after (SendUserFile) -- they judge by eye.
  - node test/all.js before every commit; touch nothing in js/ or test/ while it runs.
  - A PLAYTEST-M18.md entry per item saying how to see it by hand; update TODO-M18.md and HANDOFF-M18.md; commit and push.

HARD RULES:
  - Never Math.random() in simulation code (G.rand()); no native Math.sin/cos/atan2/hypot in stamped files (DMath). Anything a replay
    or a rejoin must reproduce goes through G.init or the command log. Terrain drawing is not simulation, but props must stay a pure
    function of the map, its seed and the tile.
  - A change to a stamped file (js/data, map, sim, game, combat, abilities, commands, ai, missions, build) moves the build stamp: say
    so in its PLAYTEST entry and run node test/net_many.js and node .claude/review/aipace/run-after.js <tag>.
  - The relay (test/serve.js) stays dependency-free.
  - Detect line endings per file. Edit with tools/patch.js; write every spec and probe with the Write tool; never sed -i.
  - Never type, store or handle the user's passwords, certificates or API keys. Art or assets someone bought stay out of this
    public repository. Nothing that costs money.
  - The comments in js/ are load-bearing: they record why the obvious thing was not done. Do not delete reasoning.
```

---

## The state

- **THE LOOKS QUEUE IS IN HAND** (the user, 2026-09-14; TODO-M18's first section): 1. no old textures before the new ones -- DONE,
  a loading screen makes the first frame the finished ground (PLAYTEST-M18 118); 2. creep as a continuous mass, no lines or tiles --
  DONE (119; and 120, a game started in a background tab); 3. cliffs that look about twice as tall -- DONE (121); 4. every map redesigned
  to StarCraft II's structure (a stamped change) -- NEXT.
- **THE USER IS PLAYTESTING IT** (the recorder, `node tools/playtest-listen.js`; TODO-M18, THE USER'S PLAYTEST OF THE TERRAIN QUEUE).
  Findings so far, both fixed: dark grid lines on the ground when zoomed (PLAYTEST-M18 116); the ground and props too soft on a
  150% display -- detailed terrain now draws at the display's real resolution and sharpens a frame at a time (117).
- **THE TERRAIN QUEUE is DONE** -- all five of the user's items and phase 1's leftovers, each committed and pushed: walled ramps
  (PLAYTEST-M18 110), detailed terrain on all five tilesets (111), props on open ground (112), the far view, the minimap and speed
  (113), mined-out mineral patches that open nothing (114), and detailed terrain on by default with Classic in Settings (115).
- **The gate is 100 suites, ALL GREEN.** **Build stamp `ca141a3b7ffcb528`** (phase 1 and 114 moved it; the drawing phases did not).
  By hand, `aistyles` fails some check on about half of sixteen seeds other than the gate's, before the ramp walls and after
  (PLAYTEST-M18 114): the AI rebalance's business.
- **The desktop app**: a debug build shows detailed terrain and loads every texture (`desktop/window-check.js`, PLAYTEST-M18 115).
  **The installers on GitHub are from `f68e8f3`, before any terrain work** -- `SHIPPING.md`.
- **Deferred by the user until they say:** the AI rebalance (TODO-M18 7b). **Skipped by the user:** a look-and-feel pass of
  PLAYTEST-M18 101-108. **Accepted by the user:** the terrain calls made without them (TODO-M18, THE USER'S ANSWERS DURING THE
  TERRAIN QUEUE).
- **The repository is PUBLIC.** **Nothing is left running** (the `terrain-shot` preview server was stopped at the close).

## What changed, in a player's language

1. **Ramps have walls**: you go up a ramp at its foot and come down at its top, never over its side; ramps are at most three tiles
   long, and every base and route a large unit had is still there (110).
2. **A mineral line mined out never opens a cliff**: patches on a plateau's edge used to leave steps through it -- five back doors
   into every small Vertical Cliffs main -- and a patch beside a ramp reopened its side. Walled now; a patch on a leftover slab in open
   ground leaves plain floor (114). The build stamp moved: older saves and replays are refused.
3. **Detailed terrain on every tileset**: Badlands, Jungle, Ice, Desert and Space Platform are photographic ground, a lighter plateau
   with one crisp cliff edge, and no repeating pattern on open ground (111).
4. **Rocks, debris and plants on open ground**, lit and shadowed like the units, never in a mineral line, on a ramp or round a base (112).
5. **The zoomed-out view and the minimap show the same ground**, unit dots on the minimap have a dark rim, and the biggest map never
   stutters when the camera jumps, scrolls or a rock formation breaks (113).
6. **All of it is on for everyone**, with **Classic** one click away in Settings -> Display or Esc -> Settings (115).
7. **`SHIPPING.md`**: before the final build ships, rebuild the installers by hand on GitHub and open the Mac app on a Mac.

**Deliberately different from what was asked, all in the PLAYTEST entries:** ramps walled the whole length of a much shorter ramp
(110); thirteen textures, 8.3 MB, for "about twelve, a few MB" (111); no web worker, since the frame budget alone kept every frame
under 50 ms (113); the minimap's dots gained a rim (113); the look is two named buttons rather than a checkbox, and not on a key (115).
**Unfinished: nothing.** The AI rebalance waits for the user's word.

## How to playtest it by hand

Every item has its steps in PLAYTEST-M18 110-115. In short, with nothing added to the game's address:
1. **Single Player -> Skirmish, Lost Ruins, START.** Detailed ground; walk a Marine beside your main's ramp and right-click the
   plateau -- it goes round to the ramp's foot (110, 111, 112).
2. **Skirmish on each tileset** -- Contested Ground (Jungle), Nightfall or The Long March (Ice), Dust Bowl (Desert), Open Basin with
   Seed 1 (Space Platform): the ground reads, plateaus lighter than the low ground, rocks and plants on open ground (111, 112).
3. **The Long March**: zoom far out -- the same country from above; click the far corner of the minimap and scroll about -- no
   freezes (113).
4. **Esc -> Settings -> Terrain: Detailed**, press it: Classic; press again: Detailed. Main menu -> Settings -> Display has the same
   choice, remembered (115).
5. **Vertical Cliffs, Small**: mine your main's mineral line out (or, in a browser, remove the patches from the console -- 114 gives
   the line), then send a unit to the lane beyond it: it goes round by the ramp (114).

---
---

# The terrain queue's handoff, as it stood while the queue was worked (kept for the record; its traps still hold)

*Everything from here down describes the state before phase 5 -- "OFF unless ?hd=1", "the next action is phase 5". The top of this
file is current.*

Written 2026-09-13, at the end of the session that closed the tenth session's list, tested the desktop app, researched OpenRA and
ran the terrain test run. Branch `m10-overnight`, which is `origin/main`. **Everything is committed and pushed; no open pull
requests, no other branches, no extra worktrees.** Trust `git log -1` for HEAD, not a hash written here.

> **READ `TODO-M18.md` FIRST -- its first section, THE TERRAIN QUEUE**: the user's five items in their words, what is approved,
> the measured ramp baseline and the build path. `RESEARCH-TERRAIN.md` sections 7-8 are the test run and this queue's research;
> `docs/terrain/` is the approved look.

---

## The state

- **THE TERRAIN QUEUE, phases 1-4 are DONE and committed**: walled ramps (PLAYTEST-M18 110), detailed terrain on all five tilesets
  (111), props on open ground (112), and the far view, the minimap and speed (113); and phase 1's leftovers -- a mined-out mineral
  patch never opens a way through a cliff or onto a ramp's side (114). TODO-M18, THE TERRAIN QUEUE, has the whole account of each.
  **The next action is phase 5: detailed terrain on by default, the classic look in Settings.**
- **The gate is 100 suites, ALL GREEN** (about two minutes; `ramps`, `terraintex` and `terrainview` are new). **Build stamp `ca141a3b7ffcb528`** -- phase 1
  moved it to `eff84c60f4bc9cf2` (`js/map.js`, `js/build.js`) and the mined-out patches (114, `js/map.js`) moved it again; phase 5 is
  drawing only and must not move it. No known reds in the gate. By hand, `aistyles` fails some check on about half of sixteen seeds
  other than the gate's, before the ramp walls and after (PLAYTEST-M18 114): the AI rebalance's business (7b, deferred).
- **Detailed terrain is committed and OFF unless `?hd=1` is in the address** (`7f8cf40` and phase 2; PLAYTEST-M18 109, 111). Every
  tileset is painted from Poly Haven CC0 textures, lit from the upper left like the sprites, with rocks, debris and plants on its
  open ground (PLAYTEST-M18 112); the strategic zoom and the minimap are painted from the same textures (113). The user, of the Badlands test run: **"this looks amazing so far - exactly the direction i want."**
- **Measured baselines for the queue:** 132 of 158 ramps are walkable from a side (`.claude/review/terrain/ramp-probe.js`); a textured
  chunk bakes in a median 18.5 ms against the palette's 21.7 ms (V8, outside any vm harness); at zoom 1 there is no bake budget, so a
  camera jump to unbaked ground stalls about 0.6-0.85 s and crossing a chunk boundary 75-165 ms; `overview()` 17.4 ms and
  `buildMini()` 1.2 ms on 128x128.
- **The desktop app** (this session, the user: "test this yourself"): Actions built all three installers green from `f68e8f3`; the
  Windows installer, built locally with the CI's command, installed silently, passed `desktop/window-check.js` 23/23 as installed,
  and uninstalled clean. **The Desktop builds workflow does not rebuild for changes to `js/` or `assets/`** -- a terrain change reaches
  the installers only through Actions -> Desktop builds -> Run workflow (or a change under `desktop/` or to `test/serve.js`).
  **`SHIPPING.md`** holds that for the day the final build ships, with opening the Mac app on a real Mac (never done: no Mac here).
- **The repository is PUBLIC** (the user made it private briefly on 2026-09-13 and public again). Bought art stays out of it.
- **Deferred by the user until they say:** the AI rebalance (TODO-M18 7b; "defer until i say", again on 2026-09-13). **Skipped by the
  user:** a look-and-feel pass of PLAYTEST-M18 101-108. **Closed:** the research stall (the user: fixed). **Accepted by the user:** the
  terrain calls made without them (TODO-M18, THE USER'S ANSWERS DURING THE TERRAIN QUEUE).
- **Nothing is left running** (the `terrain-shot` preview server was stopped at the close).

## What changed this session, in a player's language

1. **Desktop builds and the Windows installer were checked end to end without the user** -- installed, hosted a game, a second
   player joined, uninstalled clean. (Not a Mac: there is none here.)
2. **`RESEARCH-TERRAIN.md`**: how OpenRA does its map editor and terrain, what this game already had, and -- once the user said
   "i do not need an editor. i just want great looking maps" -- the terrain queue's research.
3. **Detailed terrain, the Badlands test run** (PLAYTEST-M18 109): add `?hd=1` to the address and play Lost Ruins. Photographic
   ground, a lighter plateau with one natural cliff edge -- sunlit orange rock on its upper and left faces, shadow on its lower and
   right -- calm ramps, lumpy rock. The game is unchanged without `?hd=1`.

**Not done -- it is the queue:** props on open ground, ramps walled on both sides, the other four tilesets, a matching strategic zoom
and minimap, the speed work on The Long March, and switching it on for everyone.

## Traps found this session

1. **Judge terrain only on real in-game screenshots.** Two passes that looked right in the code were wrong on screen: smoothstepped
   heights between tile centres traced the 32 px grid as staircases, and a cliff tile at mid height smoothstepped between centres
   made a double step that read as a trench; a ramp grade of 1.24 at full weight made glaring squares. `RESEARCH-TERRAIN.md`
   section 7 has what fixed each.
2. **Never time a chunk bake inside a `vm.createContext` harness** -- it runs about ten times slower than the browser or plain V8
   (190-230 ms against 18.5 ms a chunk).
3. **Textures load asynchronously.** `Terrain.texSet()` returns null until every texture of the set has loaded (the palette paints
   meanwhile) and drops the chunk cache as each arrives. The headless suites have no `Image`, so they only ever run the palette
   path: a test of the textured path must hand `renderChunkTex` its texture data directly.
4. **A textured chunk is baked at ratio 1**, a palette chunk at the display ratio (`bakeDpr`): on a dpr-2 display the textured bake is
   the cheaper of the two by far.
5. **`Render.syncFeatures` clears EVERY terrain chunk** when any map feature changes (a destructible broken, a gate opened) -- a
   re-bake of the whole view, textured or not.
6. **`tools/terrain-shot.js`** serves the working tree (never `.git` or `.claude`) and writes what is posted to
   `/save?name=` into `.claude/review/terrain/shots/<name>.png` -- a JPEG data URL is written with a `.png` name; rename it. In the page:
   `UI.start(...)` starts the real loop, so set `G.paused = true` and draw with `Render.frame(1)` yourself; `UI.viewAll = true` to see
   through fog; `resize_window` 1600x900 for comparable shots; a hidden Browser pane still renders when you call the frame.
7. **Poly Haven has no ice texture and only 30 aerial scans**; its metal textures are 0.5-2.7 m, so Space Platform must repeat by
   plate size, not by real metres (`RESEARCH-TERRAIN.md` 8.5).
8. **`GameMap.generate` stamps ramp rectangles through a one-tile cliff ring**; `sealElevations` guarantees high never touches low and
   says nothing about a ramp's sides; `repairConnectivity` carves ramps of its own on archetypes and the seal demotes one-tile slopes.
   A wall rule has to run after all of them.
9. **Look at the middle of the map, not only the bases.** Phase 2's first screenshots were of mains and looked right; the open ground
   in the middle showed every texture repeating in a sixteen-tile grid. And a texture's own brightness decides a cliff: measure the
   graded rock against the high ground (Badlands 0.45) before judging an outline.
10. **The browser drops a canvas's 2D context under canvas churn.** Baking ~1,500 chunks in a few minutes in one page (a measuring
    loop) lost the game canvas: everything drew transparent with no error, and `getContext('2d').isContextLost()` said so. Reload.
11. **A negative control can be hidden by a second mechanism.** `terraintex`'s "cells never used" control first stayed GREEN: without
    cells the texture fell back to the transposed second sample, which also defeats a repeat on the probe's chunks. The check now
    turns the second sample off for both of its bakes.
12. **`tools/terrain-shot.js` refuses `.claude` paths (403)**, so a helper cannot be fetched into the page: keep it in
    `localStorage` and `eval` it after each reload (`.claude/review/terrain/helper-T.js` is the source).
13. **The terrain bakes a little a frame now** (phase 4): one frame no longer draws the whole view, and a frame with nothing missing
    bakes a chunk of the ring round the view. A suite that counts draw calls or cached chunks must let the terrain settle first --
    draw until `Terrain.chunks.size` stops changing (`test/zoom.js`, `test/seldraw.js` do).
14. **Measure frame times over thousands of frames, and instrument the slow ones.** A 240-frame run looked clean and the next one did
    not: frames of 40-159 ms with no drawing work in them were the collector, fixed by reusing a bake's scratch memory and freeing a
    retired chunk's canvas (`Terrain.scratch`, `imageFor`, `releaseChunk`). Never wrap `Terrain.vnoise` or `hash` to profile: the
    wrapper makes a bake 30 times slower.
15. **Judge a map rule on screenshots too, not only on its counts.** `GameMap.wallMinedGround`'s first version passed every count --
    nothing reached changed, no ramp side opened, no slope left, on 1,037 maps -- and its before/after screenshot showed a block of
    wall standing in open ground on Chokepoint Valley. The count that catches it ("every wall is joined to a cliff") came after the
    picture.
16. **`net_many`'s hashes change on every run**: the relay picks a random seed for every game (`test/serve.js`). Compare them only
    across the clients of one run.
17. **A baked chunk's pixels cannot be read back later** in a headless suite: every bake writes one shared ImageData
    (`Terrain.imageFor`) and the mock canvas keeps a reference to it. Copy the pixels at once, or count which way each chunk was
    baked (`test/terrainview.js` section 8 wraps `renderChunk` and `renderChunkTex`).
18. **The Browser pane under viewport emulation** can tile a screenshot or time out, and a pane that is not on screen throttles
    `requestAnimationFrame`, so the game loop crawls. Drive `Render.frame(1)` yourself; for the whole canvas, call
    `UI.drawConsole()`, `UI.drawTop()` and `UI.drawMenu()` after it -- `Render.frame` draws only the world.
19. **The desktop app embeds `desktop/dist` when it is compiled**: run `node desktop/dist.js` before `cargo build`, or the app
    carries whatever dist held. A check on the app's own files needs a control build with one of them left out (phase 5 did).

## Diagnostics added this session

`tools/terrain-shot.js` (tracked; launch entry `terrain-shot`, port 8897). `docs/terrain/` (tracked): the approved before/after.
`.claude/review/terrain/` (gitignored): `ramp-probe.js` and its log (the side-open baseline), `spec-tex1..3.js` (the three passes),
`shots/` (every screenshot), the gate logs. `.claude/review/tenth/install-test.js` (the installer cycle) and `wait-ci.js` (a Desktop
builds run, read from the public API).

---

## The kickoff prompt the queue was worked from (kept for the record -- the current one is at the top of this file)

```
(The queue's kickoff, done: every phase below is committed.)

THE JOB -- make every map look great. The user: "i do not need an editor. i just want great looking maps." Of the Badlands test
run (docs/terrain/*.jpg, PLAYTEST-M18 109, on with ?hd=1): "this looks amazing so far - exactly the direction i want." Their list:
  1. Scattered rocks, debris and dry plants on open ground, lit like the units.
  2. Better-shaped ramps -- "can only go up them from base, NOT from sides of ramp".
  3. The other four tilesets (Jungle, Ice, Desert, Space Platform): about 12 more free textures, a few MB.
  4. A matching zoomed-out view and minimap, plus a speed check on the biggest map (The Long March, 256x256).
  5. Switch it on by default and commit.
BUILD ORDER: 2 (ramps -- the only SIMULATION change, so props and art land on final geometry and the stamp moves once), then 3,
then 1, then 4, then 5. TODO-M18.md, THE TERRAIN QUEUE, gives the reasons and each phase's acceptance. PHASES 1-4 (item 2, ramps;
item 3, the four tilesets; item 1, props; item 4, the far view, the minimap and speed) ARE DONE, with phase 1's leftovers
(PLAYTEST-M18 110-114, build stamp ca141a3b7ffcb528): start at phase 5 (item 5, on by default), and do not move the build stamp again.

READ, in this order, before touching anything:
  1. CLAUDE.md                -- the working agreement; every rule in it is non-negotiable.
  2. HANDOFF-M18.md           -- the top section: state, measured baselines, traps.
  3. TODO-M18.md              -- THE TERRAIN QUEUE.
  4. RESEARCH-TERRAIN.md      -- section 7 (the test run: every parameter, the two failed passes and why) and section 8 (this
                                 queue's research, sourced: props, ramps, minimap, speed, and a texture table for the four tilesets).
  5. docs/terrain/*.jpg       -- the approved look. That is the bar for every tileset.
  6. Code: js/terrain.js (TERRAIN_TEX, TERRAIN_GRADE, texSet, renderChunkTex, overview, buildMini, draw), js/map.js (generate
     ~657-730, sealElevations ~1262-), js/render.js (frame, syncFeatures), tools/terrain-shot.js, tools/bake.js + tools/models.js +
     tools/raster.js (the sprite baker and its sun).

APPROVED -- do not ask again: the direction; downloading about twelve more Poly Haven CC0 textures, a few MB (1k JPG diffuse;
name each file and its size in the chat as you fetch it, look at it before using it, record it in assets/terrain/SOURCES.md);
no editor work. NOT approved: anything paid, anything not CC0.

ALREADY MEASURED (re-measure only to compare):
  - Ramps (DONE in phase 1): 132 of 158 were walkable from a side; GameMap.wallRamps walls them, at most RAMP_LEN 3 tiles long, and
    measures itself (test/ramps.js). The textured bake reads ramp heights and wall heights from Terrain.rampLevels().
    GameMap.wallMinedGround keeps a mined-out mineral patch from opening a cliff or a ramp's side (PLAYTEST-M18 114).
  - Props (DONE in phase 3): TERRAIN_PROPS, Terrain.propMask/propAt/propLayer/drawProp; about 1.4 ms a chunk (7.5%); The Long March
    has 7,408. They are baked into the chunks, so the strategic view and the minimap do not show them unless phase 4 decides to.
  - Speed (DONE in phase 4; V8 or the browser, never inside a vm harness -- that is ten times slower): the bake is budgeted at every
    zoom with the overview under missing chunks and the ring baked ahead; a feature change drops only nearby chunks; no frame over 50 ms
    on The Long March in PLAYTEST-M18 113's measurements. The textured overview paints in about 200 ms at a game's start there.
    OffscreenCanvas 2D: WebView2 yes, WKWebView from macOS 13.3 (Safari 16.4); requestIdleCallback is not in Safari.
  - Textures (DONE in phase 2): every tileset's set, grade and look are in js/terrain.js (TERRAIN_TEX, TERRAIN_GRADE, TERRAIN_LOOK;
    RESEARCH-TERRAIN.md 8.6 says what was chosen and why). Open ground is laid in six-tile squares (look.cells): the textured bake is
    10.1-10.6 ms a chunk plain and 11.6-12.3 ms in squares, median, in the browser on Contested Ground. test/terraintex.js hands
    renderChunkTex texture data (the headless suites have no images) -- extend it for props rather than starting another.

HOW TO WORK, every phase:
  - Research with sources first (section 8 is a start) and tell the user what you found. Tell every research subagent never to put
    an email address or any personal detail in a request, URL or header.
  - MEASURE BEFORE CHANGING: build the probe first and make it assert its own setup.
  - Every new behaviour gets a negative control that goes cleanly RED (.claude/review/aipace/arms.js runs controls on copies of the
    tree; relay suites must be in its PORTED set). A check no control turns red is a weak check: strengthen it.
  - JUDGE THE LOOK ON REAL SCREENSHOTS, NEVER MOCKUPS: preview_start "terrain-shot" (tools/terrain-shot.js, port 8897); in the page
    UI.start(...), G.paused = true, UI.viewAll = true, UI.centerOn(x, y), Render.frame(1), then POST the canvas's data URL to
    /save?name=...; shots land in .claude/review/terrain/shots/. Send the user a before/after for every visible change (SendUserFile)
    -- they judge by eye. Keep what the approved images have: high ground clearly lighter than low, ONE crisp drop per cliff, calm
    ramps, units and minerals standing out, no cartoon strokes.
  - node test/all.js before every commit; touch nothing in js/ or test/ while it runs.
  - The ramp change moves the build stamp (js/map.js is stamped): say so in its PLAYTEST entry, and run node test/net_many.js and
    node .claude/review/aipace/run-after.js <tag> (aistyles seeds 1/5/11, queens, eightplayer), recording every number.
  - Check what draws over the ground still reads on textured terrain: creep, fog and explored ground, night, the sandstorm, craters
    and wreck decals, building placement ghosts, the strategic icons, and the eight lobby colours on each tileset's minimap.
  - For item 5: keep the classic look one click away in Settings (UI.readPref/savePref, like edge scroll), make the headless suites
    cover the textured path by handing it texture data, run desktop/window-check.js on a debug build so the textures are known to
    load inside the desktop app, and tell the user the installers need Actions -> Desktop builds -> Run workflow to pick it up
    (the workflow ignores js/ and assets/).
  - A PLAYTEST-M18.md entry per item saying how to see it by hand; update TODO-M18.md and HANDOFF-M18.md; commit and push per phase.

HARD RULES:
  - Never Math.random() in simulation code (G.rand()); no native Math.sin/cos/atan2/hypot in stamped files (DMath). Anything a replay
    or a rejoin must reproduce goes through G.init or the command log. Drawing is not simulation, but props must be a pure function
    of the map, its seed and the tile (Terrain.hash) so every redraw is identical.
  - A change to a stamped file (js/data, map, sim, game, combat, abilities, commands, ai, missions, build) moves the build stamp.
  - The relay (test/serve.js) stays dependency-free.
  - Detect line endings per file. Edit with tools/patch.js; write every spec and probe with the Write tool; never sed -i.
  - Never type, store or handle the user's passwords, certificates or API keys. Art or assets someone bought stay out of this
    public repository. Nothing that costs money.
  - The comments in js/ are load-bearing: they record why the obvious thing was not done. Do not delete reasoning.

DONE MEANS: every tileset looks as good as the approved Badlands -- textured, lit, with props -- on every map; no ramp can be
entered from its side; the strategic zoom and the minimap match the ground; The Long March has no camera or scroll hitch over about
50 ms (measured before and after); detailed terrain is on by default with Classic in Settings; the gate is green; PLAYTEST entries
are written; everything is committed and pushed. Then close the CLAUDE.md way: a numbered list of what changed FOR A PLAYER
(including what is deliberately different from what was asked, and anything unfinished), how to playtest each item by hand, and a
new kickoff prompt at the top of HANDOFF-M18.md.
```

---

# The tenth session (the user's playtest of 94-100, every finding fixed), kept for the record

Written at the end of the tenth session (2026-09-13). Branch `m10-overnight`, which is `origin/main`. **Everything is
committed and pushed; there are no open pull requests, no other branches and no extra worktrees.** Trust `git log -1` for
HEAD, not a hash written here.

> **READ `TODO-M18.md` FIRST.** Its first section, THE TENTH SESSION'S QUEUE, holds the user's findings in their words, what
> was measured before each change, and what was done in three batches. `PLAYTEST-M18.md` items 101-108 are this session's
> work by hand.

---

## The state

- **The gate is 97 suites and ALL GREEN** (new: `forceattack` 12, `escmenu` 14, `joincode` 8, `aislots` 12, `colours` 18,
  `leaver` 15, `harass` 12; `starts` grew to 62). About two minutes wall on this machine. New relay ports: 8900 `joincode`,
  8904 `aislots`, 8908 `colours`, 8912-8913 `leaver` (CLAUDE.md lists every port).
- **Build stamp `56406f9d777368ac`**, moved twice: items 1-3 and 5-6 (`js/sim.js`, `js/game.js`) made it `096229469e3da005`,
  items 4 and 8 (`js/commands.js`, `js/ai.js`) made it this. Item 7's fixes touched no stamped file.
- **By hand after the last AI and relay change:** `net_many` 51/51; `aistyles` 132/0 on seeds 1, 5 and 11 with every style row
  identical to the first batch's; `queens` 25/0; `eightplayer` 19/19; `desktop/page-check.js` 22/22; the relay rebuilt as the
  desktop executable from today's `test/serve.js`, `desktop/relay/check.js` 7/7.
- **The desktop app, tested on this machine:** `desktop/window-check.js` 23/23 on a debug build of today's tree, and 23/23 on
  the NSIS installer built with the CI's command, installed silently, run and uninstalled clean
  (`.claude/review/tenth/install-test.js`).
- **46 negative controls this session, every one cleanly red** (`.claude/review/tenth/controls-*.js`, run with
  `.claude/review/aipace/arms.js`).
- **The repository is public** (the user made it private for a while on 2026-09-13, when it answered 404 to anonymous
  requests, and public again). **The Desktop builds rebuild when `desktop/`, `test/serve.js` or the workflow changes -- not
  for the game page alone**: `ad06d00` and `372c4cc` built all three installers green; `f68e8f3` rebuilt them from today's whole
  game. Private would cost those builds: 2,000 free Actions minutes a month and 500 MB of artifact storage (three installers
  are ~210 MB a run, kept 90 days) instead of free, blocked rather than billed once used.
- **The user's playtest was recorded** (`.claude/review/playtest/2026-09-13_09-39-07/`, `report-2.txt`). Their six findings
  and the item they locked in mid-session (8) are fixed; what the recording shows they did not reach was run without them
  (item 7, PLAYTEST 108).
- **The `broodwar` preview server** (8899) may still be running from the two-tab walk. Harmless, and on no gate port.

## What changed this session, in a player's language

1. **ATTACK on your own unit or building attacks it** (workers too), and the victim stands and takes it; a right-click on your
   own side still never attacks. On the way: melee units now reach small buildings from every side -- they gave up a tile
   short in 107 approaches of 384. (PLAYTEST 101)
2. **Escape opens the game menu** -- after first cancelling a placement, a target, a build menu or the chat line. It never
   cancels a queued unit or a building going up (their Cancel buttons have no key now). F10 is free; the menu key is a
   binding, and the HUD, the help and the menu's own lines name whatever it is. (102, 108)
3. **Join by code only joins a game that exists**: "No game here has the code FEWRG." and no empty lobby. (103)
4. **A computer slot is always ready and always the host's**: a gear instead of a ready tick, REMOVE in words, "host sets"
   for a guest; the host may change or remove it during the countdown, which calls the count off. (104)
5. **Choose your colour in the lobby**, online and in the skirmish lobby: nobody shares one, Auto gives yours back, the host
   picks a computer's; the game and its replay are painted with it. (105)
6. **A player who leaves is out**: Quit to menu in a running online game is a surrender and a duel ends within a second; a
   player whose connection drops has 60 seconds to rejoin by name, then is out; a team game goes on; the replay ends the
   same way; a seat that quit cannot be taken back. (106)
7. **A computer's workers fight an enemy worker that attacks its base**: up to three for each attacker, then back to mining;
   a runner is chased only to the edge of the base; a scout that only looks, and soldiers, pull none. (107)
8. **What the playtest did not reach was run without the user** -- all as written -- and it found three wrong words, fixed:
   the menu's Resume and Back said "(Esc)" whatever the key; the lobby map offered "click to give it back" on a start another
   player chose; the lobby note said colours follow the seats. And a quit out of a rated duel is rated for the one who stayed.
   (108)

**Deliberately different from what was asked, or from the games researched:**
- Escape never cancels a queued unit or building (StarCraft II's does), so reaching for the menu cannot lose one.
- A quit is out at once and a drop after 60 seconds, by itself -- no vote to drop a player as in StarCraft II. A leaver's
  units stay on the map, stopped, as in Brood War.
- A computer pulls up to three workers per attacking worker, where Brood War's AI pulls every worker near the one hit -- so the
  rest keep mining (two, three and four were measured; all killed a lone attacker with no loss).
- An Auto colour is the seat's own or the first free one, the rule the starts use, rather than a random one.

**Not done, and why:**
- **Deferred by the user until they say:** the AI rebalance (TODO-M18 7b -- the Zerg computer is still passive for ten
  minutes). **Optional:** a look-and-feel pass of 101-108 -- everything in them is tested automatically. **Being discussed:**
  the terrain art path (`RESEARCH-TERRAIN.md`). **Closed:** the research stall (the user says it is fixed).
- **No Mac test**: there is no Mac here. The CI's Mac jobs build the app and check its relay and page; nothing opens it. The
  Windows installer was tested as built locally with the CI's command, not as downloaded (an artifact needs a signed-in
  account).

## Traps found this session

1. **A trailing `//` comment inserted into a one-line, many-statement line swallows the rest of it** (a SyntaxError in
   `js/hud.js`). Put a new comment on its own line, or at the very end.
2. **`Math.hypot` slipped into `js/sim.js`**; `dmath` caught it. Stamped files use `DMath`.
3. **`node -e "require('./test/all.js')"` RUNS THE GATE.** Read a suite list with the Read tool.
4. **Escaping inside spec files:** a single-quoted string in the TARGET file that holds `\'` is written `\\'` inside a
   double-quoted spec string; a `\\'` typed where `\'` was meant broke `test/harass.js` once.
5. **A replay applies commands INSIDE `G.tick`; live play applies them before it.** A command that calls `G.checkVictory` itself
   ends the replay one frame later than the live game -- leave the victory to the tick's own check (`leave` does).
6. **A guard written twice keeps its negative control green**: the rejoin search refused a quit seat both by a `quit` flag and
   by `L.out`, so removing either passed. The flag went (it also outlived the game).
7. **`Snapshot.restore` makes new unit objects**: a test holding a unit across a restore orders a dead copy about. Find units by
   id after a restore.
8. **The lobby re-renders on every message and keeps typed field values**: a script holding an input element from before types
   into a detached copy (it looked like "join by code fails after a wrong code" -- it does not).
9. **`.claude/review/aipace/arms.js` gives relay suites their own ports only if they are in its PORTED set**; `starts`,
   `rematch`, `safety` and `ratings` were added. `run-after.js`'s default tag `after` overwrites the last run's logs -- pass one.
10. **In the Browser pane, every tab shares one localStorage** -- one name, one browser key, so ratings see "two players share
    one browser". Set `Net.name` in each tab before hosting or joining. A hidden pane still moves the lockstep, but the end
    screen (drawn from `requestAnimationFrame`) does not open: read `G.over`.
11. **The Desktop builds workflow does not rebuild for a change to the game page alone** (`js/`, `index.html`, `assets/`), so
    an installer can be older than the game: run it by hand (Actions -> Desktop builds -> Run workflow) before testing one.
    Its runs, jobs and artifacts read from `api.github.com` without signing in -- while the repository is public.
12. **`desktop/window-check.js` is in no gate and no CI job**, so it drifted from the page for two sessions -- a START button,
    a name field and a room field the eighth session's menus removed -- and failed at its fifth check. Run it after any change
    to the Multiplayer screen or `js/desktop.js` (a debug build first: `npm run build:relay`, `npm run build:dist`, then
    `cargo build` in `desktop/src-tauri`), and `.claude/review/tenth/install-test.js` for the installer cycle.

## Diagnostics added this session

`.claude/review/tenth/` (gitignored): `replay-targets.js` (what the user's recorded attack orders hit), `probe-pylon*.js`,
`melee-probe.js` and `arms-melee.js` (the 384 approaches), `harass-probe.js`, `arms-harass.js` (pulls of 2, 3, 4),
`harass-group-probe.js` (1, 3 and 5 attackers), `walk-92.js`, `walk-98-quit.js`, the controls (`controls-1-5.js`,
`controls-2-3-6.js`, `controls-4-8.js`, `controls-4b.js`, `controls-4-8b.js`, `controls-words.js`) with their logs, every patch
spec, and the gate logs (`gate-1.log` to `gate-5.log`). `.claude/review/aipace/tenth1-*.log` and `after-*.log` are the AI
tables before and after items 4 and 8.

---

## The tenth session's kickoff prompt (SUPERSEDED by the one at the top of this file)

Open the new chat with the repository folder as its working directory, so `CLAUDE.md` loads by itself. Paste everything
inside the fence. **Replace the HEAD placeholder with `git log -1 --format=%h` first** -- committing this file moves it.

```
Repo: C:\Users\zacsl\OneDrive\Documents\Default Project\broodwar
Branch: m10-overnight, which IS origin/main (https://github.com/Zacsluss/Outerworld-War). HEAD: <run git log -1 --format=%h>.
Working tree clean, nothing unpushed, no open PRs, no other branches, no extra worktrees. Keep it that way.
The repository is PUBLIC: git push publishes. No secrets, nothing bought, no personal data in it.
Machine: Windows 11; PowerShell 5.1 and Git Bash; Node 24. There is no gh CLI and no Blender.

READ IN THIS ORDER, then start:
  1. CLAUDE.md          -- the working agreement. Every rule in it is non-negotiable.
  2. TODO-M18.md        -- its first section, THE USER'S DECISIONS AFTER THE TENTH SESSION (what is closed, what is
                           deferred), then THE TENTH SESSION'S QUEUE: their playtest findings, measured and done.
  3. HANDOFF-M18.md     -- the state and the traps, newest session first.
  4. RESEARCH-TERRAIN.md for the terrain art discussion; PLAYTEST-M18.md items 101-108; RESEARCH-LOBBY.md as needed.

THE STATE: node test/all.js is 97 suites, about two minutes, ALL GREEN. Build stamp 56406f9d777368ac. Every finding of the
user's playtest of 2026-09-13 is fixed (PLAYTEST 101-107: force-attack your own side, Escape opens the menu, join by code,
computer slots, colours, a leaver is out, workers answer a harassing worker), and what they did not reach was run without
them (108, which found and fixed three wrong words).

THE SINGLE NEXT ACTION: ask the user where the terrain art discussion stands, and wait. They asked how OpenRA does its map
editor and what its stack is; RESEARCH-TERRAIN.md holds the answer, what this game already has, and the choices it leaves.
The rest: the AI rebalance (TODO-M18 7b) is DEFERRED until they say; a look-and-feel pass of PLAYTEST-M18 101-108 is
OPTIONAL (when they want it: the `playtest` entry in .claude/launch.json, then node tools/playtest-report.js); the research
stall is CLOSED. Start nothing deferred without their word.

FOR EVERY ITEM:
  - Research how established games do it first and tell the user what you found, with sources. Tell every research
    subagent never to put an email address or any personal detail in a request, URL or header.
  - MEASURE BEFORE FIXING: build the probe first and make it assert its own setup.
  - Every new behaviour gets a negative control that goes cleanly RED. .claude/review/aipace/arms.js runs controls on copies
    of the tree, suites side by side (relay suites need to be in its PORTED set). A check no control turns red is weak.
  - node test/all.js before every commit; touch nothing in js/ or test/ while it runs. A red relay suite with EADDRINUSE is a
    stray server on a relay port (CLAUDE.md lists them): re-run that suite alone, then the gate.
  - After any relay or net change run node test/net_many.js; after any AI or simulation change run
    node test/aistyles.js --seed=1 / --seed=5 / --seed=11, node test/queens.js and node test/eightplayer.js
    (node .claude/review/aipace/run-after.js <tag> runs all five), and record ALL the numbers.
  - Lobby and online changes: walk them in two Browser pane tabs on the `broodwar` server (port 8899) as well --
    set Net.name in each tab; they share one localStorage.
  - Write a PLAYTEST-M18.md entry saying how to try it by hand; update TODO-M18.md and HANDOFF-M18.md; commit and push.

HARD RULES:
  - Never Math.random() in simulation code (G.rand()), and no native Math.sin/cos/atan2/hypot in stamped files (DMath).
    Anything a replay or a rejoin must reproduce goes through the G.init options or the command log.
  - A change to a stamped file (js/data, map, sim, game, combat, abilities, commands, ai, missions, build) moves the build
    stamp: old saves and replays are refused. Say so in the PLAYTEST entry.
  - The relay (test/serve.js) must stay dependency-free: the desktop app's relay is built from it as one executable.
  - Detect line endings per file. Edit with tools/patch.js and write every spec and probe with the Write tool. Never sed -i.
  - Never start test/balance.js or test/proxy.js without an explicit, double-checked instruction.
  - Never type, store or handle the user's passwords, certificates or API keys: the user adds secrets themselves. Art or
    assets someone bought stay out of this repository.
  - The comments in js/ are load-bearing: they record why the obvious thing was not done. Do not delete reasoning.
  - Nothing that costs money (no paid services, no paid signing).

CLOSE THE SESSION the CLAUDE.md way: a numbered list of what changed FOR A PLAYER (including anything deliberately different
from what was asked, and anything unfinished), how to playtest each item by hand (written into PLAYTEST-M18.md), a new
kickoff prompt at the top of HANDOFF-M18.md, and everything committed and pushed.
```

---

# The ninth session (the whole work queue, A to G), kept for the record

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

## The ninth session's kickoff prompt (SUPERSEDED by the one at the top of this file)

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

