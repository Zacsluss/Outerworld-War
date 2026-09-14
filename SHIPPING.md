# SHIPPING — what must be done before the final build goes out

The user, 2026-09-13: *"Note it in Documents that when I go to ship the final build, we need to make sure this is done."*
Read this before handing anyone an installer. Each step says why it exists.

---

## 1. Rebuild the desktop installers from the commit you are shipping

**Actions → Desktop builds → Run workflow** (branch `main`), on github.com/Zacsluss/Outerworld-War.

**Why:** the Desktop builds workflow (`.github/workflows/desktop.yml`) starts by itself only when `desktop/`, `test/serve.js` or
the workflow file changes, or when a `v*` tag is pushed. **Changes to the game itself -- `js/`, `assets/`, `index.html` -- do not
start it**, so the newest installers on the Actions page can be older than the game on `main`. When this file was written the
newest installers were built from `f68e8f3` (2026-09-13), which is before walled ramps, detailed terrain on every tileset, the
rocks and plants, the detailed far view and minimap, and detailed terrain switched on (PLAYTEST-M18 110-115).

1. Open the repository on GitHub → **Actions** → **Desktop builds** → **Run workflow** → branch `main` → **Run workflow**.
   (Pushing a tag such as `v1.0.0` starts the same build.)
2. Wait for all three jobs to go green: Windows x64 (about 5 minutes), macOS Intel (about 4-5), macOS Apple silicon (about 3).
3. On the run's page, check that its commit is the commit you mean to ship.
4. Download the three artifacts at the bottom of the run (you must be signed in): `brood-war-remake-windows-x64`,
   `brood-war-remake-macos-apple-silicon`, `brood-war-remake-macos-intel`.

## 2. Open the Mac app on a real Mac

**Why:** there is no Mac on the development machine. The workflow builds both Mac apps and checks that their relay answers and
their page loads, but **nothing has ever opened the Mac app itself.** The Windows installer was installed and driven end to end
(2026-09-13, TODO-M18); the Mac one never has been.

On an Apple silicon Mac (and an Intel one if you have it -- each has its own build and the wrong one will not start):
1. Open the `.dmg`, drag the app to Applications, and open it. It is unsigned (the Apple Developer Program costs money, so it was
   skipped): the first open is refused -- **System Settings → Privacy & Security → Open Anyway**, or right-click → Open. If it says
   the app "is damaged", run `xattr -dr com.apple.quarantine "/Applications/Brood War Remake.app"` once. (PLAYTEST-M18 item 96.)
2. **Single Player → Skirmish**, any map, START. *Working:* photographic ground with rocks and plants -- the detailed terrain's
   textures load inside the app -- and the minimap shows the same ground.
3. **Multiplayer → Host a Game.** *Working:* the app starts its own server on the Mac and shows the address other players type.

## 3. The Windows installer, the same way

Run the Windows installer from step 1 (SmartScreen: **More info → Run anyway** -- also unsigned), then the same two checks as the
Mac's steps 2 and 3. For the automated version, `desktop/window-check.js` drives a real window of the app (host, a second
player joins by the code, stop, close); PLAYTEST-M18 item 96 and TODO-M18 say how it was run against the installed app.

## 4. The gate on that commit

`node test/all.js` all green on the commit you ship (CLAUDE.md). A red suite is a reason not to ship.
