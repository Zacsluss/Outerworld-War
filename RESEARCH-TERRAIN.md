# RESEARCH — terrain art and the map editor: how OpenRA does it (2026-09-13)

The user, on the deferred terrain art path (TODO-M18): **"openRA has a whole map editor in addition to maps - how do they
accomplish this? what is their stack/framework?"** Read 2026-09-13 from OpenRA's source, wiki and site (the development
branch `bleed`; newest stable release `release-20250330`, newest pre-release `playtest-20260222`). *(inferred)* marks what was
not read directly.

---

## 1. OpenRA's stack

- **A custom engine, not Unity or Godot**: "written in C# using SDL and OpenGL", GPL-3.0, since 2010, about 31,000 commits.
  Roughly 200,000 lines of C# *(estimated from GitHub's byte count)*, plus Lua for missions and YAML for all game data.
  [repo](https://github.com/OpenRA/OpenRA)
- **.NET**: .NET Framework / Mono until 2023; .NET 6 from `release-20230225`; Mono removed January 2025; .NET 8 first shipped in
  `playtest-20260222`; `bleed` targets .NET 10. [INSTALL](https://github.com/OpenRA/OpenRA/blob/release-20230225/INSTALL.md),
  [#21682](https://github.com/OpenRA/OpenRA/pull/21682), [Directory.Build.props](https://github.com/OpenRA/OpenRA/blob/bleed/Directory.Build.props)
- **Window, input, audio, fonts**: their own bindings for SDL2, OpenAL and FreeType. **Rendering**: OpenGL 3.2 Core or
  OpenGL ES 3.0 (through ANGLE on Windows), about twelve GLSL shaders.
  [Sdl2PlatformWindow.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Platforms.Default/Sdl2PlatformWindow.cs)
- **Scripting**: Lua 5.1 through their own fork of Eluant, attached per map. **Data**: MiniYaml, their own YAML dialect with
  inheritance (`Inherits:`, `-Key:` removes). **UI**: "chrome" YAML widget trees, each panel naming a C# logic class.
  [MiniYaml](https://www.openra.net/book/modding/miniyaml/index.html), [editor.yaml](https://github.com/OpenRA/OpenRA/blob/bleed/mods/common/chrome/editor.yaml)
- **Packaging**: NSIS on Windows, a `.dmg` on macOS, an AppImage per game on Linux.

## 2. Its map editor

- **A mode of the game, not a separate program**: Extras -> Map Editor starts the same engine with `WorldType.Editor`,
  which builds an `EditorWorld` from a trait list in YAML (actor layer, resource layer, action manager, markers, path tiler,
  map generator). The world, renderer and UI are the game's own. [Game.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Game/Game.cs),
  [world.yaml](https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/rules/world.yaml)
- **Units are not simulated there**: placed actors are lightweight previews, saved as `Actor0...` in the map.
- **Undo is a list of actions**: every edit is an `IEditorAction` with Do/Undo on two unbounded stacks, and a History tab
  jumps to any entry. [EditorActionManager.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/Traits/World/EditorActionManager.cs)
- **Tools**: select/copy/paste/delete an area; a tile palette (click, drag, Shift+click flood fill); resources; actors with
  owner, facing, health and script tags; marker tiles with mirroring; the Path Tiler; the Map Generator; history.
  Players are made by placing spawn points; lobby options are typed into `map.yaml` by hand.
- **Recent**: a **random map generator** (merged January 2025, first shipped in `playtest-20260222`: seeded noise for
  elevation, coasts and cliffs tiled along paths, symmetry, spawns and ore; "Generated maps work both in Skirmish and
  Multiplayer") and the **Path Tiler** (May 2025: click a route and it lays matching beach, cliff or road pieces, a
  Dijkstra-style search). [#21637](https://github.com/OpenRA/OpenRA/pull/21637), [news](https://www.openra.net/news/playtest-20260222/),
  [Path Tiler](https://github.com/OpenRA/OpenRA/wiki/Path-Tiler)

## 3. Maps and terrain

- **An `.oramap` is a zip**: `map.yaml` (metadata, players, actors, rule overrides), `map.bin` (per cell: a terrain piece id
  and variant, height, resource type and density), a `map.png` preview, optional rules and Lua.
  [Map-Format](https://github.com/OpenRA/OpenRA/wiki/Map-Format), [Map.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Game/Map/Map.cs)
- **Terrain is tileset pieces**: a tileset YAML defines terrain TYPES (Clear, Rough, Road, Water...) that movement reads
  (`TerrainSpeeds`), and multi-cell TEMPLATES, each pointing at an original Westwood image and giving each cell a type.
  [temperat.yaml](https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/tilesets/temperat.yaml)
- **No auto-tiling for Red Alert's art**: the tile brush stamps a piece and never looks at its neighbours -- mappers chose
  matching edge pieces by hand for fifteen years, until the 2025 Path Tiler added edge data to the tilesets.
  [EditorTileBrush.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/EditorBrushes/EditorTileBrush.cs)
- **The art is not in OpenRA**: each player installs Westwood's original files -- copied from a disc, Steam, Origin or the
  Remastered Collection, or downloaded from community mirrors -- under EA's freeware release and modding guidelines; music
  is never downloaded. [Game-Content](https://github.com/OpenRA/OpenRA/wiki/Game-Content), [download](https://www.openra.net/download/)
- **A game on the same engine with its own free art, OpenHV**: 20x20 PNG tiles under CC BY / BY-SA; every terrain piece
  lists its 8 edge and 4 corner neighbours, and an `EditorAutoTiler` places the right pieces as you paint.
  [OpenHV](https://github.com/OpenHV/OpenHV), [EditorAutoTiler.cs](https://github.com/OpenHV/OpenHV/blob/main/OpenRA.Mods.HV/Traits/World/EditorAutoTiler.cs)

## 4. Map sharing

- A map's id is a **SHA1 of its files**; a player missing the lobby's map is offered an Install button that fetches it by
  that hash from the Resource Center (resource.openra.net). [LobbyLogic.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/Widgets/Logic/Lobby/LobbyLogic.cs)
- **Generated maps are never uploaded**: replays and games carry the generator, its settings and the seed, and a mismatch
  of the regenerated hash is an error. [#22254](https://github.com/OpenRA/OpenRA/pull/22254)

---

## 5. What this game has today (read from the code, 2026-09-13)

- **Stack**: plain JavaScript and the 2D canvas, no framework; the relay is dependency-free Node (`test/serve.js`); the
  desktop app is Tauri (Rust around the system's web view) with the relay as a single-executable sidecar.
- **The map editor is already a mode of the game** (`js/editor.js`, 330 lines): paints the height grid (low, ramp, high) and
  rocks, places mineral bases, geysers and start locations; round or square brush, rectangles, 2- or 4-way mirroring, undo and
  redo (whole-map snapshots, 50 deep), a tileset choice; maps save in the browser (`bw_maps`) and appear in Single Player.
- **Terrain art is procedural**: a tileset is a palette and drawing functions (`js/terrain.js`: Badlands, Jungle, Ice...),
  drawn from the height grid and cached in chunks. There are no tile images, so there is nothing to join by hand.
- **A procedural generator already exists** (`gen:` archetypes), and like OpenRA's it travels as a key and a seed.
- **Not there, measured against OpenRA's editor**: placing units, buildings, neutral life or destructibles; copy and paste;
  a history list; per-cell terrain TYPES beyond height and rock; **custom maps online** -- the network lobby offers only
  built-in and procedural maps (`Net.maps`, custom maps are local only), because a map drawn in one browser is not sent to
  the others.

## 6. What transfers, and the choices it leaves

1. **Keep the map format independent of the art** (OpenRA stores piece ids and terrain types; movement reads types). Here the
   map is already height, rock and resources, and the tileset draws it -- so an art change need not touch the editor, the
   pathing or the generator.
2. **If tile images come, they must join by themselves** -- OpenHV's 8 edges + 4 corners and an auto-tiler, not OpenRA's
   fifteen years of hand-placed edges. Painted height -> the renderer picks the joining piece.
3. **The editor as a mode, undo as actions** -- this game already does the first; the second matters once the editor places
   more than terrain.
4. **Maps by hash, generated maps by seed** -- the seed half is done; the hash half is what online custom maps would need
   (the host sends the map, or clients fetch it by hash).

**The art itself** (TODO-M18's options: a 3D pack rendered to 2D, the Daniel Thomas painted packs, or both). OpenRA's answer
to "art we may not redistribute" is that the PLAYER installs it. For bought art here the questions are the pack's licence
(most allow shipping it inside a game but not publishing the source files) and the **public** repository: bought files stay
out of git either way. Free or self-made art has no such limit. No Blender is installed for rendering a 3D pack.

---

## 7. The Badlands test run (2026-09-13) -- what worked, what did not, the numbers

The user chose "great looking maps" over an editor, approved a test on one tileset, and said of the result: **"this looks
amazing so far - exactly the direction i want."** The approved before/after is `docs/terrain/test-run-badlands-centre.jpg` and
`docs/terrain/test-run-badlands-base.jpg`. Code: `js/terrain.js` (`TERRAIN_TEX`, `TERRAIN_GRADE`, `Terrain.texSet()`,
`renderChunkTex()`), off unless `?hd=1` is in the address. Tool: `tools/terrain-shot.js` (launch entry `terrain-shot`, port 8897).

**Textures** (Poly Haven, CC0, 1k JPG diffuse, `assets/terrain/SOURCES.md`): `aerial_ground_rock` (20 m) low ground,
`dirt_aerial_03` (25 m) high ground, `dirt_aerial_02` (20 m) ramps, `cliff_side` (1.8 m, horizontal strata) cliffs and rock.
AERIAL scans covering 20-25 m were the right choice: at `TEX_PX` 512 (a repeat is 16 tiles) a metre is about 25 px, a
Marine's width, so their detail sits at unit scale. A 2-4 m close-up texture would be blown up into mush or repeat every
two tiles.

**The three passes, each judged on a real in-game screenshot, never a mockup:**
1. Smoothstep-bilinear heights from tile centres, full-strength ramp texture, heavy cast shadow. **Failed:** cliffs traced the
   32 px grid as staircases with a wide soft black band; the ramp all but vanished; rock zones were flat orange walls.
2. A 3x3 blur of the tile grid, a +-11 px noise warp of where the grid is read, rock only where the ground is STEEP, lumpy
   rock zones. **Failed differently:** a cliff tile at height 0.6 between low 0 and high 1, smoothstepped between centres,
   has zero slope at every centre -- two small steps with a shelf, which reads as a TRENCH; the ramp texture at grade 1.24
   and full weight made glaring orange squares; high and low ground too alike.
3. **Approved.** Heights read LINEARLY (low 0, ramp or cliff 0.5, high 1) and pushed through a steep curve
   `sm(clamp((lin - 0.5) / 0.36 + 0.5))`, so a cliff is ONE drop about two thirds of a tile wide at the cliff tile; ramps keep
   the linear value (an even climb end to end) and their texture at half strength ("worn tracks, not a new floor"); rock where
   `steep` is past 0.016 (ramps excluded); grades low `[0.74, 0.72, 0.7]`, high `[1.2, 1.11, 0.98]`, ramp `[1.04, 0.98, 0.9]`,
   rock `[0.92, 0.8, 0.7]` -- the high ground clearly lighter and warmer than the low.

**The light:** normal from the height field's gradient (`RISE` 22 world px per unit) plus the rock texture's own brightness
gradient as relief (`BUMP` 4), against a sun at (-0.5, -0.6, 0.62) -- upper left and above, as every baked sprite and doodad
is lit (`tools/raster.js`). Shade clamped to 0.5-1.35; the cast shadow samples the height 11 px up and 9 px left and darkens by
up to 0.32; broad noise varies brightness by +-9% as cloud or wear. No posterise and no dither: the period look belongs to the
palette tilesets. Two samples of each texture (the second transposed and scaled 0.83) mixed by 230 px noise hide the repeat.

**Cost:** a textured chunk is baked at ratio 1 whatever the display (a photograph survives the upscale). 21 chunks at 1600x900
took 395-415 ms, about 19 ms a chunk, against 559 ms for the palette version of the same view -- the textured path has no
vector pass and no dither. Not yet measured: the 256x256 map, zoomed out, scrolling, a dpr-2 display.

**Honest gaps the user saw, which are the terrain queue:** open ground is empty; ramps are boxy and walkable from their sides;
Jungle, Ice, Desert and Space Platform are untextured; the strategic zoom (`overview()`) and the minimap (`buildMini()`) still use
the palette colours; the look is not yet the default.

---

## 8. Research for the terrain queue (2026-09-13)

Read from primary sources where they could be fetched; *(excerpt)* = the page refused a fetch and the fact is the search
engine's excerpt of it; *(inferred)* = reasoning, not a source; *(measured)* = run on this machine.

### 8.1 Props on open ground (queue item: rocks, debris, dry plants)

- **Cosmetic, not blocking, is the norm for small dressing.** StarCraft II doodads do not block unless pathing is painted or a
  footprint attached, and the ladder checklist says "Neither ground nor air units should be able to clip into doodads"
  ([best practices](https://s2editor-guides.readthedocs.io/Classic_Tutorials/04_Misc/mapmaking-best-practices/),
  [checklist](https://s2editor-guides.readthedocs.io/Classic_Tutorials/04_Misc/mastering-mapmaking/)). OpenRA's craters and scorch
  are a separate never-blocking smudge layer ([world.yaml](https://github.com/OpenRA/OpenRA/blob/bleed/mods/ra/rules/world.yaml)).
  Age of Empires II calls them "eye candy", generated per terrain with a density each ([aoe2.rocks](https://ugc.aoe2.rocks/scenarios/),
  [Terrain.h](https://github.com/sandsmark/genieutils/blob/master/include/genie/dat/Terrain.h)). Brood War's "provides cover" tiles
  change hit chance ([openbw bwgame.h](https://github.com/OpenBW/openbw/blob/master/bwgame.h)) -- so baked props must never look
  like cover or a blocker *(inferred)*.
- **Keep gameplay areas readable.** StarCraft II: "keep areas of gameplay unobstructed and leave most of the doodads to be placed
  in non-playable areas" (best practices, above); Riot clamped the ground's saturation and value "to make teamfights more readable"
  ([SA20](https://www.surrenderat20.net/2014/06/red-post-collection-more-on-summoners.html)). Exclusions are radii in tiles
  (Age of Empires II `actor_area_radius`, [RMS features](https://www.forgottenempires.net/age-of-empires-ii-definitive-edition/rms-features)).
  Density: StarCraft II calls 200 trees in one view "unnecessarily tough" and advises half as many with more space.
- **Light them like everything else.** Brood War's shadows darken whatever pixels are already there through the tileset's dark
  table ([openbw ui.h](https://github.com/OpenBW/openbw/blob/master/ui/ui.h)), so a shadow matches any ground *(for here: shade
  props with the terrain's sun (-0.5, -0.6, 0.62) and draw the shadow as a darkening of the baked ground, offset down-right)*.
- **Placement that bakes chunk by chunk without seams.** Bridson's Poisson disc (min distance r, grid cell r/sqrt 2, k = 30
  tries, O(N)) ([paper](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph07-poissondisk.pdf)); Red Blob Games now recommends
  Poisson disc or a jittered grid (jitter <= 0.6 avoids distance outliers) ([terrain from noise](https://www.redblobgames.com/maps/terrain-from-noise/),
  [jittered grid](https://www.redblobgames.com/x/1830-jittered-grid/)); Wei 2008's parallel sampling uses far-apart cells that
  cannot conflict ([SIGGRAPH](https://history.siggraph.org/learning/parallel-poisson-disk-sampling-by-wei/)). *A recipe for the
  8x8-tile bake: one hashed candidate per cell of size r/sqrt 2; keep it if its hashed priority beats every candidate within r
  (a fixed +-2-cell neighbourhood) and a second hash is under a density of low-frequency noise times the exclusion masks -- each
  decision is local, so chunks bake in any order and agree at their seams.*

### 8.2 Ramps entered only from their ends (queue item: walled ramps)

- **Every RTS found blocks a ramp's sides with unwalkable CELLS, not blocked edges.** StarCraft II's pathing grid and nav mesh
  ([GDC 2011](https://gdcvault.com/play/1014514/AI-Navigation-It-s-Not)), Brood War's 8x8 px walkability mini-tiles drawn into the
  tile art (a tile is walkable when more than 12 of 16 are; partly walkable tiles are unbuildable) (openbw bwgame.h), Tiberian
  Sun's cliff land type ([modenc](https://modenc.renegadeprojects.com/TMP)). *Blocked edges would be invisible to everything here
  that reads per-tile walkability -- flood fills, `findFreeTile`, the unit-radius probes, the AI's choke logic -- until each learned
  about edges; wall tiles need no new concept and make the ramp a choke for free, at one tile of width a side.*
- **Ramps are unbuildable** in both games (python-sc2 detects them as pathable, not buildable, uneven 3x3 --
  [game_info.py](https://github.com/BurnySc2/python-sc2/blob/develop/sc2/game_info.py)); this repo's `canPlace` already refuses them.
  StarCraft II main ramps are standard enough that bots hard-code a two-depot-and-barracks wall at the top
  ([Blizzard](https://news.blizzard.com/en-us/article/5740267/game-guide-terran-ramp-defense)). No published ramp width in cells.
- **Pitfalls:** diagonal corner-cutting -- the benchmark rule is "agents cannot cut corners through walls"
  ([movingai](https://movingai.com/benchmarks/formats.html)), so a staircase wall must be 4-connected; units snagging on wall corners
  and Brood War's "ramp vortex" ([SDA](https://kb.speeddemosarchive.com/StarCraft/Game_Mechanics_and_Glitches)); AI wall and choke
  logic that assumes a standard ramp shape ([TyrAI](https://tyrai.wordpress.com/2018/07/22/finding-a-wall/)).
- **Here** *(read and measured)*: `generate()` rings high ground with a ONE-tile cliff and stamps ramp rectangles 3-12 tiles long
  through and past it, so the tiles beside a ramp's lower half (low ground) and upper half (plateau) stay walkable: 132 of 158
  ramps side-open (TODO-M18, THE TERRAIN QUEUE).

### 8.3 A matching strategic zoom and minimap

- **Three established ways:** (a) a hand-picked colour per terrain type -- OpenRA `TerrainType Color`, Age of Empires II
  `map_color_hi/med/low` and cliff colours ([openage terrain.py](https://github.com/SFTtech/openage/blob/master/openage/convert/value_object/read/media/datfile/terrain.py));
  (b) the average of the art -- Tiberian Sun's FrameColor "is the average colour of all non-transparent pixels", for the radar, and
  its cells keep separate edge colours so terrain borders show ([SHP](https://moddingwiki.shikadi.net/wiki/Westwood_SHP_Format_(TS)));
  (c) a render of the map -- StarCraft II's map image at 256-1024 px
  ([map properties](https://s2editor-guides.readthedocs.io/New_Tutorials/01_Introduction/008_Map_Properties/)).
- **Height shading:** OpenRA scales minimap brightness by height (1.0-1.6 on the Tiberian Sun set)
  ([Map.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Game/Map/Map.cs)). **Average in linear light**, or a coarse texel of 0.5
  shows at a quarter of the brightness ([GPU Gems 3, ch. 24](https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-24-importance-being-linear)).
  **Props and decals do not belong far out** -- Supreme Commander drops them with distance
  ([graphics study](https://www.adriancourreges.com/blog/2015/06/23/supreme-commander-graphics-study/)). OpenRA refuses player colours
  too close to terrain colours ([ColorPickerManager.cs](https://github.com/OpenRA/OpenRA/blob/bleed/OpenRA.Mods.Common/Traits/World/ColorPickerManager.cs))
  -- *a green jungle or white snow minimap can hide a player colour; check the eight lobby colours against each tileset.*
- *For here: each material's mean colour computed once in linear light, times `TERRAIN_GRADE`, blended by the tile's
  low/high/ramp/rock weights and slope shade -- the same inputs the bake uses.* `overview()` 17.4 ms and `buildMini()` 1.2 ms on
  128x128 *(measured, V8)*.

### 8.4 Speed

- *(measured, Node 24 V8, 256 chunks of Lost Ruins, putImageData stubbed)* `renderChunkTex` median **18.5 ms** a chunk (mean 19.8,
  p95 24.5, max 39.6); the palette `renderChunk` median **21.7 ms**. **Inside a `vm.createContext` harness the same code ran
  190-230 ms a chunk -- ten times slower; never time a bake there.**
- *(inferred from those)* At zoom 1 `Terrain.draw` has NO bake budget: a camera jump to unbaked ground bakes 32-45 chunks in one
  frame (~0.6-0.85 s); crossing a chunk boundary bakes a column (4-5 chunks, ~75-95 ms) or a row (8-9, ~150-165 ms). The Long
  March is 1024 chunks, ~19 s single-threaded; a chunk is 262,144 B; `CHUNK_CAP` 160 is ~40 MiB. `Render.syncFeatures` clears
  EVERY chunk when any map feature changes (a destructible broken) -- a full re-bake of the view.
- **Budgets:** produce a frame in 10 ms, do idle work in chunks of 50 ms or less ([RAIL](https://web.dev/articles/rail)); a
  long task is 50 ms ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongTaskTiming)); frame-time variation, not the
  average, drives quality of experience (Claypool et al., CHI 2023,
  [paper](https://web.cs.wpi.edu/~claypool/papers/frame-variation-chi-23/paper.pdf)). No RTS-specific hitch threshold was found; ~50 ms
  is the working target.
- **Background baking:** OffscreenCanvas 2D in Chrome 69 / Edge 79 (so WebView2), Firefox 105, Safari **16.4** -- WKWebView on
  macOS 13.3+ ([MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/OffscreenCanvas.json),
  [WebKit 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/), [Tauri webviews](https://v2.tauri.app/reference/webview-versions/)).
  Without it: bake into a `Uint8ClampedArray` in a worker and TRANSFER its ArrayBuffer (ImageData is not transferable;
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)). `requestIdleCallback` is not in Safari
  ([caniuse](https://caniuse.com/requestidlecallback)). Close ImageBitmaps after use. SharedArrayBuffer needs cross-origin isolation --
  copy the few MB of textures to the worker once instead. A `Uint32Array` view writes a pixel in one store
  ([Mozilla hacks](https://hacks.mozilla.org/2011/12/faster-canvas-pixel-manipulation-with-typed-arrays/)). *Feature-detect; keep the
  main-thread bake as the fallback; a per-frame budget with the overview underneath is the first, cheapest fix.*

### 8.5 Textures for the four tilesets (Poly Haven, CC0; API read 2026-09-13)

859 textures, **only 30 aerial**, and **no ice texture at all** (7 snow, 1 aerial). Every id below exists; sizes from
`/info/<id>` (real) and `/files/<id>` (1k diffuse JPG). `*` = aerial. Badlands uses 20/25/20 m ground and a 1.8 m cliff. At
`TEX_PX` 512 a 2 m texture shows ten times bigger detail than a 20 m one -- prefer the big scans for ground; metal plating
repeats by plate size (a plate about 1-2 tiles), not by metres.

| Tileset | Slot | Candidates (real size, 1k JPG KB) |
|---|---|---|
| Jungle | low | `rocky_terrain_02`* (90 m, 823), `forest_leaves_02` (3 m, 428) |
| Jungle | high | `aerial_grass_rock`* (15 m, 651), `rocky_terrain_03`* (90 m, 935) |
| Jungle | ramp | `aerial_wood_snips`* (30 m, 815), `aerial_mud_1`* (8 m, 475) |
| Jungle | cliff | `aerial_rocks_04`* (80 m, 822), `aerial_rocks_01`* (80 m, 794) |
| Ice | low | `snow_field_aerial`* (80 m, 737), `snow_04` (4 m, 559) |
| Ice | high | `snow_02` (2 m, 318), `marble_cliff_05`* (20 m, 965; grade it cold) |
| Ice | ramp | `snow_01` (2 m, 348), `snow_05` (3 m, 593) |
| Ice | cliff | `aerial_rocks_02`* (50 m, 768), `dark_rock` (2.4 m, 521) |
| Desert | low | `aerial_sand`* (15 m, 479), `aerial_beach_01`* (30 m, 113; little fine detail) |
| Desert | high | `coast_sand_05`* (25 m, 854), `dry_ground_01` (4 m, 591) |
| Desert | ramp | `aerial_beach_03`* (20 m, 222), `sandy_gravel_02` (2.5 m, 925) |
| Desert | cliff | `marble_cliff_03`* (5.75 m, 873), `marble_cliff_02`* (6.8 m, 1153) |
| Space Platform | low | `blue_metal_plate` (2.5 m, 387), `metal_plate_02` (2 m, 611) |
| Space Platform | high | `rusty_metal_sheet` (2 m, 774), `rusty_metal_grid` (1.8 m, 712) |
| Space Platform | ramp | `metal_plate` (0.5 m, 676), `metal_grate_rusty` (0.5 m, 908) |
| Space Platform | cliff/wall | `corrugated_iron_02` (2.7 m, 555), `container_side` (1.9 m, 652) |

Licence: CC0, no credit needed ([polyhaven.com/license](https://polyhaven.com/license)); textures are "seamless on all axes"
([standards](https://docs.polyhaven.com/en/technical-standards/textures), *excerpt*).

### 8.6 What phase 2 chose, and why *(measured and judged on screenshots, 2026-09-13; PLAYTEST-M18 111)*

| Tileset | low | high | ramp | cliff/rock | laid |
|---|---|---|---|---|---|
| Jungle | `rocky_terrain_02` | `aerial_grass_rock` | its high | `aerial_rocks_04` | squares |
| Ice | `snow_field_aerial` | `snow_02`, healed | its high, healed | `dark_rock` x5 | squares |
| Desert | `dry_ground_rocks` | `aerial_beach_01` | its high | `marble_cliff_03` | squares |
| Space Platform | `rusty_metal_sheet` | `metal_plate_02` | `metal_plate` | `corrugated_iron_02` | deck in squares, tiles unblurred |

- **A ramp may reuse its high ground's texture** -- a ramp's own texture shows at only `RAMP_TRACKS` 0.15 -- so thirteen files cover
  sixteen slots. `aerial_beach_03` was fetched and rejected: tyre tracks across it.
- **Brightness, graded texture means in linear light:** high over low Badlands 2.2, Jungle 3.5, Ice 3.5, Desert 3.9, Space Platform
  5.7; cliff rock over high ground 0.45, 0.43, 0.45, 0.29, 1.0. Ice's rock was 0.06 at first and read as a black stroke round each
  plateau; Space Platform's was 0.2 and read the same way, and at 2 its rock zones glared brighter than the plateaus.
- **Snow is a two-metre scan laid over sixteen tiles**, so each twig in `snow_02` was a tile-long black squiggle: `Terrain.healFlecks`
  blends every texel darker than 0.97 of its 24-texel neighbourhood to that neighbourhood's mean, once, at load.
- **Space Platform**: laid as the shortlist had it (plates below, the stained sheet above, 256 texels a repeat, one sample), the
  sheet's rust blotches marched across every plateau in rows and the blurred height field made every plateau a melted blob. Swapped,
  at 512, with the height field read straight from the tiles: a plated platform with square steps and a steel lip.
- **Repeats**: with two samples mixed by broad noise (the test run's way), every texture's recognisable features -- Badlands' pale
  patches included -- repeated in a sixteen-tile grid across open ground, and high-pass flattening at 32 and 64 texels did not
  help (the features are one to three tiles across). Laying the texture in squares with hashed offsets did: judged at 4, 6 and 9
  tiles; 6 kept. Hex-tiling (Mikkelsen, "Practical Real-Time Hex-Tiling", 2022) is the better-known answer and blends three samples
  at every pixel; squares need one sample in most of a square, which matters on a CPU bake.

### 8.7 What phase 3 chose for props, and why *(judged on screenshots, 2026-09-13; PLAYTEST-M18 112)*

- **Baked into the chunk, not drawn as sprites each frame**: the chunk is already a per-pixel loop with the sun in it, so a prop costs
  a few thousand extra pixel writes once (about 1.4 ms a chunk) and nothing per frame, and its light is the ground's light by
  construction. Sprites from `tools/bake.js` were the other road (8.1): a new asset pipeline for what four primitives draw.
- **Placement is a hash per tile under a density times a cluster weight**, not Poisson-disc sampling (8.1): one candidate a tile, kept
  in the middle three fifths of it, already never overlaps a neighbour's centre and leaves no seam to agree across; the cluster weight
  (broad noise, squared) gives the clumps and clearings a jittered grid lacks.
- **What reads as what, at 32 px a tile** (each learned from a screenshot): rocks need flat faces and sharp ridges -- a dome or a cone
  reads as clay or a snowball; a scatter of stones needs one larger stone and uneven gaps -- even stones in a ring read as a paw print;
  a dry bush needs many thin branches -- five read as a spider; a pipe needs square ends -- rings at both read as a bone; plants need
  uneven leaves and a colour darker than the ground's brightest -- evenly spaced leaves lit to 1.4 read as lime stars; metal props need
  to be made of the floor -- small bright squares read as icons.
- **Scale and density**: boulders 12-22 px, most props under a Marine's width; density 0.2 of the allowed ground on the natural sets
  (0.12 read as empty), 0.09 on Space Platform, whose props are larger.
