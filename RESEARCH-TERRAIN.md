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
