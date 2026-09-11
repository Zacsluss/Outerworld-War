# REVIEW-M17 — full codebase review

**This file is the review's workspace and its deliverable.** It is committed at the baseline with the
scope, the rules and the map already filled in; the review fills in the two lists at the bottom.

> **OUTCOME (2026-09-11, two sessions).** The review is done and its ten questions are answered and carried
> out: **16 commits** since `pre-review-m17`, every one gated. The four lists at the bottom are filled in —
> 24 open tasks, 10 questions with a decisions table saying what each became, 17 things fixed, 13
> deliberately not done. The gate is **74 suites**. Facts in the brief above that moved: the fourth known
> red (`net_many`) is gone (the assertion was wrong and was replaced); `eightplayer` was never "19/19 by
> 4%" at that tree, is 19/19 now, and stays out of the gate as a measurement; the gate's `aistyles` seed
> is 1. The build stamp is `bb40caab900717ee` at the last simulation change; the appendix is regenerated.
> `HANDOFF-M17.md` carries the kickoff prompt; `PLAYTEST-M17.md` says how to see each fixed item by hand.

---

## Baseline

| | |
|---|---|
| branch | `m10-overnight` |
| baseline commit | tagged **`pre-review-m17`** — diff against it to see everything the review changed |
| gate at baseline | `node test/all.js` — **69 suites, 0 failed**, ~3 minutes |
| build stamp at baseline | `c4fe57ceca68627b` |
| size | **39,142 lines** — `js/` 17,487, `test/` 19,976, `tools/` 1,679 |
| open to-dos before this review | **none.** `FIXLIST-M14.md` and `FIXLIST-M15.md` are both closed |

Everything the review changes should be measurable against that tag:

```bash
git diff --stat pre-review-m17
```

---

## What this review is for

A total scan for **refactor opportunities, bugs, best-practice violations, and anything a working dev
team would raise in review.** Not a milestone, not a feature. The deliverable is the two numbered
lists at the bottom of this file, plus whatever was safe to fix along the way.

**Read these first, in this order.** They are the accumulated decisions of fifteen milestones and most
of them explain why something that looks wrong is deliberate:

1. `CLAUDE.md` — the working agreement. Short, and every line of it was earned.
2. `HANDOFF-M16.md` — current state, the four known reds, sixteen traps, and what is gated.
3. `FIXLIST-M15.md` — the last forty items, and the Group D section in particular.
4. `HANDOFF-M15.md`, `HANDOFF-M14.md`, `HANDOFF-M13.md` — older traps, all still true.
5. `PLAYTEST-M15.md` — what the game actually does, in a player's language.

---

## Non-negotiable — these are not style preferences

Violating any of these produces a change that must be reverted, so check them before writing code.

1. **`node test/all.js` is the gate before every commit.** 69 suites, ~3 minutes. Green means green.
   **If a change fixes a real fault but turns a marginal assertion red, revert it anyway and say so.**
   That has happened five times in this project and all five reverts were right.
2. **Determinism.** Never `Math.random()` in simulation code — use `G.rand()`. The game is lockstep
   multiplayer and replays are a seed plus a command log; anything a replay or a rejoining client must
   reproduce goes through `G.init` options or the command log. `test/determinism.js`,
   `test/longgame.js` and `test/net.js` are the ones that catch a mistake here.
3. **Every new behaviour gets a negative control** — a check that goes RED when the feature is removed,
   and that produces a **clean red rather than a crash**. A check that still passes with the feature
   deleted is not a check.
4. **Measure before fixing.** In this codebase every fix that started from a measurement was right the
   first time and every fix that started from a hypothesis had to be reverted. Build the probe first.
5. **Read the constant, never the literal.**
6. **The balance run is GATED.** Do not run `test/balance.js` or `test/proxy.js`, and do not change
   anything whose justification is "this is better balance", without an explicit instruction.
7. **`test/patch10.js`, `patch11.js`, `patch15.js` are NOT tests.** They are one-off codemods that
   rewrite `js/`. They refuse to run without a flag. Leave it that way.
8. **The comments are load-bearing.** This codebase documents *why*, including why the obvious thing
   was not done and what was measured before rejecting it. A refactor that deletes the reasoning is a
   net loss even when the code gets shorter. If a comment is wrong, fix the comment — do not drop it.

---

## The four known reds. None block. Do not "fix" them without reading why.

1. **`test/soak.js`** — one tier-1/2 coverage assertion, Swarm Host never fielded. Deliberately not
   weakened. Not in the gate.
2. **`test/aistyles.js` seeds 1 and 11** — four assertions, no style attacks inside a 12,000-frame
   window. Pre-existing. Seed 5, the one the gate runs, is clean.
3. **`test/eightplayer.js` is 19/19 but its money assertion passes by 4%** (2405 against a 2500
   threshold). It is the first thing any AI spending change breaks — four attempts at FIXLIST-M15 D1
   pushed one bank from 796 to 5,019 minerals before being reverted. The cause the assertion names is
   `AI.macro`'s `wantHalls` floor (search the identifier, not a line number).
4. **`test/net_many.js` fails 1 of 44** — `phase 4: the promoted host's host-only command is obeyed`.
   **The assertion is what is wrong.** The relay refuses every settings change once a game has started,
   by design, and the same rule makes a different assertion in the same file pass. Verified identical
   at `57d61d2`. **Do not loosen the relay to make it pass.**

---

## What is gated, and is therefore not yours to decide

- **The balance run.** Every number in `HANDOFF.md` is stale. M15 added four things it must price:
  creep tumours costing 25 energy, tumour cast range becoming a real limit, the **30% Zerg creep
  movement bonus** (the largest single balance change in the project), and the Overlord becoming a
  legal Feedback/EMP target.
- **The AI's spending priorities.** The only known correctness problem left, and it is a balance
  question. `budget()` funds the composition's top pick in full on **4%** of the thinks it arms, and
  that number does not move under any bound — four were implemented and measured in FIXLIST-M15 D1 and
  all four reverted. The fix is the claim order in `budget()`, priced per race in `HANDOFF-M15.md`.
  **Flag it; do not take it.**

---

## Seed findings — already spotted, not yet investigated

Starting points, not conclusions. Verify each before acting; two of the last three "obvious" findings
in this project turned out to be the opposite of what they looked like.

1. **Six suites are neither in the gate nor in `test/all.js`'s documented exclusion list.**
   `test/all.js` opens with a careful list of what it deliberately does not run and why. These six are
   not on it and not in the gate either: **`saveload`, `eightplayer`, `longgame`, `ledger`, `techtime`,
   `net_many`**. `saveload.js` is the one that should worry you — 298 lines covering "saving and
   restoring while something is halfway through happening", running never. Decide for each: gate it,
   or document why not.
2. **`CHURN_SLOW` in `js/map.js` is a bare `const` that the build stamp does not hash.** `js/build.js`
   hashes `DATA` and a list of named globals; a tuning constant outside that can change the simulation
   while leaving the stamp still, which is the exact desync the stamp exists to refuse. `DATA.creepSpeed`
   was put in `DATA` for this reason. Audit for others.
3. **`test/` is larger than `js/`** — 19,976 lines against 17,487. Not wrong on its own, but worth
   asking whether there is duplication across the 102 suites that a shared harness would remove. Note
   that most files rebuild the same `vm` context boilerplate by hand.
4. **Line endings are mixed** — 71 CRLF, 77 LF-only, 2 already mixed (`HANDOFF.md`,
   `HANDOFF-M13.md`). `core.autocrlf` is true so git normalises on commit and this is mostly
   cosmetic, but it breaks naive patch scripts. Decide whether to normalise the tree once and add a
   `.gitattributes`, or leave it.
5. **The relay has no TLS and no authentication beyond the room code**, which is fine for friends and
   not fine for a public address. If internet play is going to be real, that is a decision to take
   deliberately rather than by default.

---

## How to deliver

Fill in the two lists below, in this file, and commit it.

- **Keep them numbered and keep them separate.** One list is work the user has to decide on; the other
  is work already done.
- **Open tasks need enough detail to act on without this chat** — file, what is wrong, what the fix
  would be, and what it would cost.
- **Questions and decisions are for things a reviewer genuinely cannot settle alone**: balance,
  scope, product direction. Not things you could have measured.
- **Fixed/changed needs the evidence**, in this project's house style: what was measured before, what
  after, which negative control was run, and the gate result.
- Anything you decide NOT to do belongs in a list too, with the reason. A review that silently drops
  its own findings is worse than one that never made them.

---

# 1. Open tasks / to-dos

**NEXT UP — the user's three Zerg notes (2026-09-11, end of the second session), measured and queued as
tasks 25-27 below; take them first, then task 1 and task 23.** Then the Tauri relay question, task 28.

Each entry names the file, what is wrong, the fix, and what it would cost. Everything measured says so;
"reviewer" means one of the six read-only region reviews, whose claims were verified before they were
listed here. Ordered by what I would do first.

1. **`js/hud.js` overrides eight `UI` draw methods at load, and two shipped features never draw.**
   `Object.assign(UI, {...})` in `hud.js` replaces `drawConsole`, `drawUnitInfo`, `drawTop`, `drawMessages`,
   `drawHelp`, `drawMenu`, `miniRect` and `cardRect` from `ui.js`. The only callers of `UI.drawSelGrid`
   (the "three regimes" grouped selection strip, M12 item 2, which PLAYTEST-M12 promises makes a
   130-unit selection readable) and `UI.drawDayDial` (the day/night countdown, M11 idea 19) are inside
   the replaced bodies, so in the browser neither ever draws: the live strip at `hud.js` `drawConsole`
   has no cap, no grouping and no "+N more", and tiles past about eighteen units land below the screen.
   `test/daynight.js` and `test/qol.js` pass because they call the functions directly. Fix: call
   `this.drawSelGrid` from the HUD's multi-selection branch and `this.drawDayDial` from its `drawTop`
   (after the clock plate), look at both in the browser, then delete the eight dead `ui.js` bodies
   (~250 lines; one of them, the dead `drawUnitInfo`, splices `u.cargo` and calls the unwrapped
   `G.unloadOne` — a replay bypass that is only dead because `hud.js` loads). Cost M, and it needs eyes
   on a screen, which is why it is not done here.
2. **Cross-engine floating point in the simulation.** 75 transcendental calls (26 `Math.cos`, 24
   `Math.sin`, 16 `Math.atan2`, 9 `Math.hypot`) in the stamped files. `Math.sqrt` is correctly rounded
   by IEEE; those four are not required to be and engines differ in the last bit. Lockstep hashes
   positions at 1/16 px, so two *different browsers* on the same build can drift apart over minutes.
   Same-browser play is unaffected. The cheap half is `hypot` → `sqrt(dx*dx + dy*dy)` in the two
   helpers and nine inline sites (S); sin/cos/atan2 need one deterministic table in a stamped file (M).
   Moves the stamp, changes results by ulps. **Blocked on question 1.**
3. **Bunkered infantry fire at double rate.** `Unit.tick` decrements `cooldown`, then the bunker loop in
   `tickBuilding` decrements it again: measured 7.5-frame gaps against 15 for a free Marine. Deleting
   the second decrement is one line and halves bunker DPS — a balance consequence. **Question 7.**
4. **The 12-frame micro cadence exists only for player 0.** `AI.tick` runs micro on `G.frame % 12 === 0`
   inside a think-gate, but `G.tick` schedules player *i*'s AI on `frame % 4 === i % 4`, and 12 is a
   multiple of 4, so players 1-3 never land on a multiple of 12: their micro runs only on think frames,
   and `turn(id, n)` collapses to a few residues. Reviewer's probe: player 0 ran micro 400-560 times in
   4,800 frames, players 1-3 66-239 times, zero on a multiple of 12. On normal, players 1-2 can never
   Comsat scan and their crawlers never move; on easy, no Chrono Boost and no MULE. The human is player
   0, so **every computer opponent on easy and normal is the degraded one**. Fix: count micro ticks on
   the AI (`this.microN++`) and key `turn()` on that. Cost S — but it changes what every AI casts and
   sieges, so it belongs with the balance run. **Question 8.**
5. **`research()` cannot find a tech's building once it has morphed.** It selects `bld` by
   `u.def.id === td.bld`; a Lair morphed to a Hive carries the same techs but not the id, so after the
   Hive, `pneumatized`, `ventral_sacs` and `antennae` are unresearchable for the AI (the harasser style
   fronts one of them). Fix: select by `(u.def.tech || []).includes(id)`, the test `queueTech` already
   makes. Cost S; changes Zerg late research spend, so run aistyles seeds 1/5/11 and eightplayer first.
6. **Seven hand-copied supply-block tests disagree** (`queueUnit`, `larvaMorph`, `warpIn`,
   `tickProduction`, `tickAlerts`, and two more): only `queueUnit` honours `notUnit`, `warpIn` omits
   `pair`, and a nuke (`sup: 8, notUnit: true`) queued at the cap is accepted, never starts, and is
   reported as "supply blocked" (measured). One `G.supplyBlocked(p, def)` at all seven sites. Cost S-M;
   touches production for every race, so probe first.
7. **The Raven and the Disruptor are bought and never moved.** Neither has a weapon, so `armyUnits()`
   excludes them, and neither is in `supportUnits()`; 100/150 and 150/150 per unit that stands at the
   rally for the game. Fix: add both to `supportUnits()` — or derive the list (`!weapon && !worker &&
   !cargo && from`), which is exactly the current twelve plus these two. Cost S; changes where the AI
   army goes with them, not what it builds.
8. **`morph()` and `addon()` never `release()` their head-step claim**, unlike `train()` and
   `research()`, so a Lair/Hive/Orbital/add-on head step stays charged against `commitMin` for the rest
   of that think and `afford()` under-reports. Cost S; one think's worth of money per morph — probe
   with the ledger before and after.
9. **The "needs a detector" counter has never fired**: `if (needDet && ud.detector)` reads a key no def
   carries (they carry `det: true`), and `sawCloak()` tests `d.cloak || d.burrow`, which no unit has
   (they are abilities). The ×2.5 detector weight has been dead since it was written. A one-word fix
   that starts changing composition the day it lands — gated-adjacent; **question 8**.
10. **Eleven `energy:` techs do nothing** (`caduceus`, `moebius`, `apollo`, `titan`, `colossus_reactor`,
    `gamete`, `metasynaptic`, `khaydarin_amulet`, `argus_talisman`, `argus_jewel`, `khaydarin_core`):
    `maxEnergy = def.energy` is the only writer and nothing reads the tech's key, yet the AI buys them
    at 150-200 each. Either `+50 maxEnergy` in the one getter, or remove them from the cards and
    `AI_RESEARCH`. **Question 9** (balance either way).
11. **`p.seen` is computed for every player every three frames and snapshotted, and no renderer reads
    it.** The comment at `G.rememberSeen` promises a building destroyed while unwatched stays on your
    map; `render.js` draws enemy buildings from the live list, so it vanishes at once. Either wire the
    renderer to `p.seen` (M, a feature) or delete it and `test/fognight.js`'s memory checks (S); at
    minimum gate the computation on `p.human`. **Question 10.**
12. **Static-only checks worth making live.** `test/review17.js` guards `AI.micro`'s ally test by
    regex; a team game with an allied caster at full energy inside your marines would prove it.
    `test/review17ui.js` checks the terrain clamp, the minimap palette and the help text by regex;
    a 64×128 editor map drawn through the recorder harness in `test/zoom.js` would prove the clamp.
    `test/rooms.js` checks the keepalive by regex; a 45-second silence is too long for the gate, so it
    stays a hand check. Cost S each.
13. **Relay: a batch frame far in the future poisons rejoins.** `case 'cmds'` takes `m.f | 0` with no
    window; a batch at `f: 2147483647` sets `maxFrame`, and every later rejoin's catch target and stop
    frame come from it. Fix: drop batches with `f > maxFrame(L) + 2 * DELAY + 24` (a client is never more
    than DELAY ahead). Measure the window against `test/net_many.js` before committing it. Cost S.
14. **Relay: a rejoin after game over applies one batch twice.** `G.tick()` no-ops once `G.over`, so
    `appliedFrame === G.frame` with that frame's batch already applied; a donor snapshot taken then
    carries `frame: G.frame`, the rejoiner sets `appliedFrame = G.frame - 1` and re-applies it. Only
    matters if "Continue playing" follows. Cost S.
15. **Hard-coded keys outside the bindings table.** Ctrl+M, Ctrl+V, Ctrl+B, F8, F9/Pause, the digit
    groups and the F2-F8 camera slots are read directly in `onKey`, while the comment above the table
    says every read goes through `UI.key(action)` so nothing is unrebindable; `test/controls.js` checks
    only the declared→consulted direction, so a rebind that collides with a hard-coded key is a silent
    two-actions-on-one-key. Fix: a `RESERVED` list that `setBinding` refuses, and the reverse assertion.
    Cost M.
16. **Presentation cost, unmeasured — measure before touching** (`test/perf_render.js` needs a browser):
    the fog `ImageData` is rebuilt every drawn frame though vision changes every third sim frame
    (`render.js` ~510); one `createRadialGradient` per additive particle per frame (`fx.js` ~144) and
    per Pylon/Nexus/Cannon per frame (`sprites_buildings.js` ~286, six lines above a comment that says
    never to); a canvas `filter` per corpse per frame (`fx.js` ~175); the minimap creep pass scans a
    quarter of the map and issues a `fillRect` per visible creep cell per frame (`hud.js` ~824); the
    editor minimap does W×H `fillRect`s per frame; per-unit string keys built twice per frame in
    `sprites.js`/`atlas.js`. Each S once measured.
17. **`_x`, `_y`, `_alpha` are written on `Unit` by the draw pass** (`render.js` ~340) while the file's
    own comment explains that the settle spring lives off the Unit because a field on one rides the
    reflective snapshot and the rejoin. They do ride it (three floats per unit per checkpoint; not a
    hash divergence, `stateHash` lists its fields). Move them into `Render.motion` or have
    `Snapshot.enc` skip `_`-prefixed keys and say so. Cost S.
18. **`test/observer.js` keeps two wall-clock budgets** (`backMs < 1500`, `backMs * 3 < scratchMs`)
    in a gate whose header promises none; 198 ms measured here against 1500. Count `G.tick()` calls
    during the seek instead. Cost S.
19. **Gate suites cannot see an AI exception.** `test/aiadapt.js`, `aistyles.js`, `wavetarget.js` stub
    `console.error` to a no-op; `G.tickErrors` now counts throws inside `G.tick` and `AI.tick`, so each
    should end with `ok(G.tickErrors === 0)`. Cost S per suite.
20. **Coverage the gate does not have** (reviewer's identifier sweep): 18 of 80 abilities are never
    named in any gate suite — `restoration`, `optical_flare`, `lockdown`, `cloak_ghost`,
    `defensive_matrix`, `emp`, `yamato`, `parasite`, `ensnare`, `nydus_exit`, `feedback`, `maelstrom`,
    `disruption_web`, `build_scarab`, `build_interceptor` among them (the Overlord became a Feedback/EMP
    target in M15 and neither cast is exercised); Infest Command Center is never driven; Interceptor
    docking and loss on Carrier death, Scarab pathing, worker re-targeting when a patch mines out, and a
    transport killed with cargo are untested. **One feature gap, not a coverage gap:** README promises
    "Terran buildings burning below one third health" and there is no code path for it.
21. **Test-harness duplication.** 88 files carry their own `document` stub, 71 their own `ok`, through
    11 differently named builders; ~870 lines of boilerplate (reviewer's catalogue is in the
    agent-F section of `.claude/review/` while it exists, and summarised here: six file-list shapes,
    three DOM tiers, four canvas stubs, two `ok` argument orders). A `test/_harness.js` would remove
    ~800-900 lines; the low-risk first slice is the 42 sim-only suites that share a byte-identical stub.
    Cost L — a 90-file diff, every suite's PASS/FAIL count diffed against the baseline log. A milestone,
    not a review.
22. **Small refactors, results unchanged:** the scarab/interceptor caps (`hasTech('reaver_capacity')
    ? 10 : 5`) are written three times and the defs carry `scarabTech`/`interceptorTech` that nothing
    reads (and the AI's reaver loop reads the literal 5, so Reaver Capacity is bought and never used);
    cargo capacity is written twice; `Unit.suppresses` iterates `p.tech` on every `damage()` call and
    could be cached per player; five comments in `abilities.js` justify code living in the wrong file
    by a branch constraint that expired at M13 (`EQUIV` mutated at load, `tickTerran`/`muleHaul`/
    `reactorTick`/`tickZergNet` hung off `tickFields`) — relocate and rewrite the comments; the
    energy literals in the older micro clauses (27 of them; all equal to `DATA` today except cloak 50
    vs 25) should read the ability; `HOVER` in `abilities.js` and `hover: true` in the data disagree
    on membership (six ids vs three); `seenSup` decays per call, not per frame; `AI_COMP` lists the
    Raven and Disruptor (see 7).
23. **The AI's Queen follows the army.** `supportUnits()` lists `queen`, so once the army leaves the
    base she goes with it, out of `injectHall`'s 26-tile reach, and stops injecting. Keep a Queen home
    while any hatchery is short of larvae (or exclude her from `supportUnits()` until every hatchery is
    full). Cost S; changes what the AI's army carries, so run the canaries.
24. **`tools/`:** `raster.js` exports `mesh`, `V`, `M` and `models.js` exports `C` with no consumer;
    `bake.js` writes `META.dirs` into `assets/atlas.js` (16) while five units bake at 32 and
    `js/atlas.js` never reads it. Cosmetic; a re-bake is not worth it for this alone.
25. **Spawn Larva should raise a hatchery's larvae to 12; today it only refills to 3.** Measured in the
    code: natural spawning stops at three (`Unit.tickBuilding`, `if (this.larvae.length < 3)`), and the
    inject resolution in `Abilities.tickFields` spawns `for (n = larvae.length; n < cap; n++)` with
    `larva_inject.cap = 3` — M12 item 11 chose "fill, don't raise". The user's rule: **with Spawn Larva a
    hatchery, lair or hive may hold up to 12 larvae; without it, exactly as today (three, spawning one
    per `LARVA_TIME`).** Fix: `larva_inject` gets `per: 3, cap: 12`; the resolution adds `per` larvae up
    to `cap`; natural spawning keeps its `< 3` and is untouched; `AI.injectHall` skips a hall at the
    new cap or already injecting (not one at three). `test/zerg12.js` asserts the M12 behaviour ("inject
    fills a hatchery rather than raising its ceiling") and must change with it — read it first. Cost S.
    Moves the stamp; changes Zerg macro for players and AI alike; on the balance list.
26. **The AI has one Queen for the whole game and injects only the two hatcheries nearest her.** Measured
    (`.claude/review/larva-probe.js`, a solo Zerg AI, normal and hard, ten minutes): Queens by minute =
    1 throughout (the starting one; the AI never trains another though it ends with 227-355 gas), and
    injects per hall = 8/10/0/0/0 (normal), 9/7/0/0/0 (hard) — `injectHall` reaches 26 tiles from where
    she is, and the expansions are farther. The user's rule: **Queens are produced for all hatcheries,
    lairs and hives, and each one is injected.** Fix: a macro rule `queens < halls → train a Queen` when
    affordable (100/100; place it above the composition's top pick, as supply is), each Queen homes to
    a hall (`queen.home`; `injectHall` prefers her home, and she flies there when idle), and
    `supportUnits()` leaves a homed Queen out of the army (open task 23 is the same fault from the
    other side). Measure with the probe: injects on every hall, larvae never sitting at cap while a
    Queen has energy. Cost M. Changes what the AI builds and where its Queens are; run the canaries.
27. **Are larvae used from every hatchery?** Yes — measured: at ten minutes every hall's larvae read 0
    and the later hatcheries never sat at their cap (seconds at cap: 59/64/18/0/0 of 600). `AI.train`
    takes `this.mine(u => u.def.larva)[0]`, the oldest larva in `G.units` order, which drains the
    oldest hatchery first; with task 25's higher cap that becomes a real waste, so pick the larva from
    the hatchery holding the most. Cost S, part of task 25.
28. **Peer hosting in a Tauri build.** Decision (2026-09-11): multiplayer is peer-hosted only, no server
    of yours. `test/serve.js` is a Node process; a Tauri app ships a webview, not Node, so a sold copy
    cannot host a game until the relay ships with it — as a bundled Node sidecar, or as a port of
    `serve.js` (184 lines, no dependencies) to the Tauri (Rust) side behind the same WebSocket
    protocol. Until then `PLAY.bat` / `PLAY-ONLINE.bat` on the host's machine is the way. Cost M for a
    sidecar, L for a port; the protocol is pinned by `test/rooms.js`, `test/net.js` and
    `test/net_many.js`, which a port would have to pass.

# 2. Questions and decisions for the user

**DECISIONS (2026-09-11, second session).** Answered by the user, one line each; the status column
says what happened to each, and the numbered entries in section 3 hold the measurements.

| # | question | decision | status |
|---|---|---|---|
| 1 | mixed-browser multiplayer? | **Yes** — the game will be sold, wrapped in Tauri (WebView2 on Windows, WebKit on macOS) | deterministic sin/cos/atan2/hypot in the simulation: **done**, entry 15 |
| 2 | `eightplayer` red since C3 | **touch the AI's expansion floor now** | measured first: the floor was not the cause — no base left to take, and the Zerg AIs at zero larvae with income outrunning six hatcheries. A larva-starvation clause in the hall rule instead (entry 12), then the starting Queen (entry 16): every bank under 2,500. The money line stays a hand-run measurement, not a gate member — a Terran floats minerals under the flat-3 production rule kept on purpose, and any rounding-step change re-deals the game |
| 3 | line endings | **yes**, `.gitattributes` + one re-checkout | **done**, entry 13 |
| 4 | relay: min code length, join rate limit, cheats online | **all three; block cheats** | **done**, entry 14 |
| 5 | 23 stale worktrees | asked what they hold | all four dirty ones were superseded drafts of work that landed (an M9 build-stamp edit that is in `js/build.js` today; the three M12 wave-four race agents, whose tests in HEAD are the longer, later versions); **deleted** on the follow-up answer |
| 6 | balance run, claim order | **OK** — stay gated | unchanged |
| 7 | bunker double fire rate | **FIX** | **done**, entry 12 |
| 8 | AI micro cadence, dead detector weight | **FIX NOW** | **done**, entry 12 |
| 9 | eleven inert energy techs | **+50 max energy** | **done**, entry 12 |
| 10 | fog memory | **the fog shows the last state a unit of yours saw, not what is there now** | **done**, entry 17 |
| — | Tauri: who runs the relay for sold copies? | **peer hosting only** | open task 28: the relay has to ship with the app (Tauri has no Node); `PLAY.bat` on the host's machine until then |
| — | delete the stale worktrees? | **yes, the merged ones** | **done**: all 23 were on merged commits (the four dirty ones held superseded drafts); worktrees and their 22 agent branches removed |
| — | (mid-session) Zerg should start with a Queen; is she injecting to the maximum? | **they should** | **done**, entry 16. She injects whenever energy allows and a hatchery within 26 tiles is short of larvae; energy bounds her to one cast per 33 s sustained. One follow-up in open task 23: the AI's Queen follows the army |

The questions as they were put, kept for the record:

1. **Is mixed-browser multiplayer a target?** If yes, open task 2 is real work; if "everyone uses the
   same browser", it is a documented limitation and nothing else.
2. **`test/eightplayer.js` has been RED since FIXLIST-M15 C3, not "19/19 passing by 4%".** Measured
   three times at the baseline tag (deterministic: identical banks each run) and bisected: 19/19 with
   the handoff's 2405 at `57d61d2`, 19/19 at C1 and C2, **18/19 from `89f2e40` (C3, the creep speed
   bonus) onward** — one AI ends with 2630 minerals against the 2500 threshold. It printed byte-identical
   banks before and after every simulation change in this review, so nothing here moved it. The cause
   the test names (`AI.macro`'s `wantHalls` floor) is AI spending, which is gated, and the threshold is
   the canary the handoffs rely on, so I have not moved it. Decision: accept it as a known red until the
   balance work, or authorise a change.
3. **Line endings.** 71 CRLF, 77 LF-only, 2 mixed in the working copy; the index is LF throughout
   (`core.autocrlf=true`), so this is purely a working-copy artefact of tools writing LF after
   checkout. (a) Leave it and keep the detect-per-file rule; (b) add a `.gitattributes` (`* text=auto`,
   `*.bat text eol=crlf`) so every clone normalises the same way, then re-check out the working copy
   once (`git rm --cached -r . && git reset --hard`) — no history rewrite, no blame pollution, one
   one-line commit. I recommend (b). Say which.
4. **The relay has no TLS and no auth beyond the room code** (seed finding 5). TLS is answered by the
   tunnel `PLAY-ONLINE.bat` puts in front (the client picks `wss://` on an https page); auth is the room
   code. This review hardened what exists (the relay validates every field, stamps the sender on every
   command, refuses strangers cleanly, drops silent connections, caps frames, serves only the game).
   Two things remain product decisions: a minimum code length and a join rate limit (both S), and
   whether cheats should work in multiplayer at all — `G.cheat` is in `CMD.apply`, the relay forwards
   it, and `test/net.js` relies on it for god mode, so today anyone can `show me the money` on every
   client with only their own screen saying "Cheat enabled". Allow-and-announce, or refuse when
   `Net.active` (and give `test/net.js` an invulnerability option instead)?
5. **22 stale agent worktrees** under `.claude/worktrees/` plus one at `%TEMP%\pre-m12`. All 23 are on
   commits already merged into this branch. 19 are clean; **four hold uncommitted M12-era edits**
   (`agent-a8b7db…`: `js/build.js`; `agent-ac63287…` and `agent-af39846…`: nine files each, mostly
   sprites, models and a race test; `agent-ac730fb…`: five). I did not create them and have not touched
   them. May I `git worktree remove` the 19 clean ones, and what do you want done with the four dirty?
   (Two more were added by this review, `review-base` and `review-bisect`; I will remove those.)
6. **The balance run and the AI claim order** stay gated, as briefed. Nothing in this review touches
   either. Three things this review found belong on the balance run's list: Charon Boosters now
   lengthen the Goliath's air range to 8 instead of shortening it to 3 (fixed here as a data bug; the
   AI buys Charon), and open tasks 3 and 4.
7. **Bunker double fire rate** (open task 3): fix it, and accept that bunkers get weaker?
8. **The AI cadence bug and the dead detector weight** (open tasks 4 and 9): both are one-line fixes
   that change what the computer does on easy and normal. Take them together with the balance run, or
   now?
9. **The eleven inert energy techs** (open task 10): implement (+50 max energy) or remove?
10. **`p.seen`** (open task 11): a feature to wire, or dead weight to remove?

# 3. Fixed / changed / updated

1. **The build stamp now covers the simulation.** *(commit `e35c828`)* `js/build.js` named nine
   tables and six singletons and nothing else; a top-level `const`, `function` or `class` in a classic
   script is not a property of the global object, so nothing else was reachable.
   **Measured before:** a probe over the ten stamped files found **76 top-level bindings, 56 not reached**
   — among them the whole of `Combat`, `DMG_MULT`, `MINE_TIME`, `MINERS_PER_PATCH`, `SUPPLY_CAP`,
   `CHURN_SLOW`, `FACE_MULT`, `HOVER`, `MAP_SIZES`, `Archetypes`, `MapModes`, `Replay.applyPending`, and
   the helpers `dist`, `distPt`, `clamp`, `daylightAt`, `hitFacing`, `repairableDef`. A second probe
   applied **17 simulation edits** (a `Combat.fire` body change, `DMG_MULT`, `MINE_TIME` 75→76,
   `MINERS_PER_PATCH` 2→3, `SUPPLY_CAP` 500→400, `CHURN_SLOW`, `HOVER`, `HALL_PULL`, …) and **17 of 17
   left the hash unchanged.** Every one would have loaded an old save and drifted.
   **Fix:** `BUILD` now carries explicit lists — `TABLES`, `TUNING`, `HELPERS`, `SINGLETONS`, `CLASSES`
   — and a `NOT_SIM` map naming every top-level binding that is deliberately not hashed, with the reason
   (presentation strings, colours, caches, the id counter). `parts()` walks the lists.
   **The list cannot rot:** `test/version.js` parses every stamped file for its top-level declarations
   (multi-name lines included) and fails if a name is in no list, in two lists, or in a list but no
   longer declared; plus ten new edit checks, one per class of thing that was blind.
   **Measured after:** the 17-edit probe reports 0 blind (the one edit still inert was `G.pathBudget`'s
   initial value, which `tick()` overwrote with a hashed literal — fixed in entry 4).
   **Negative controls:** removing `CHURN_SLOW` from `TUNING` → two clean reds (`editing map.js …
   changes the hash` and `every top-level binding … is in a BUILD list  map.js:288 CHURN_SLOW`);
   adding a name that no file declares → two clean reds. Both restored byte-identical.
   **Gate:** 69 of 69, 176.7 s. **The stamp moved: `c4fe57ceca68627b` → `14ec639729837842`.** Every
   save and replay from before this commit is refused, which is the stamp doing its job.
2. **`.gitignore` ignores `.claude/review/`**, where this review's probes and logs live.
3. **`test/saveload.js` is in the gate, and the other five unlisted suites are on the exclusion list
   with reasons.** *(commit `b13d7a2`)* Seed finding 1: six suites were neither run by
   `test/all.js` nor named in its "deliberately not in this suite" list. Each was run once at the
   baseline tag, in a worktree so nothing else could touch `js/` meanwhile:

   | suite | result at baseline | wall time | decision |
   |---|---|---:|---|
   | `saveload` | 54 passed, 0 failed | 35 s | **gated** — deterministic, no sockets (`WebSocket` is stubbed), no seeds sampled; it covers the one thing a seed-plus-log save cannot fake, a nuke, a morph and a Recall all halfway through |
   | `eightplayer` | **18 passed, 1 failed** | 37 s | excluded — the money assertion is red (question 2); gate it the day it is green |
   | `net_many` | 43 passed, 1 failed | 65 s | excluded — real sockets, and the one failure is the assertion HANDOFF-M16 says is wrong |
   | `longgame` | 19 passed, 0 failed; 5.2 ms/frame at 60:00, heap 8 → 16 MB | 14 min here | excluded — many times the slowest gate member |
   | `ledger` | prints, never fails | 1 s at 2 min | excluded — a measurement |
   | `techtime` | prints, never fails | 2 s at 2 min | excluded — a measurement |

   The gate is **70 suites**, 177 s. The exclusion comment in `test/all.js` now also names the three
   codemods that are not tests.
4. **One literal made a constant, seven dead definitions removed, four stale references replaced, and
   the living handoff pointed at the present.** *(commit: small fixes)*
   - `PATH_BUDGET` in `js/game.js`: the per-tick pathfinder budget was a literal `40` in two places,
     one of them dead. One stamped constant now, in `BUILD.TUNING` — and the version audit refused
     the tree until it was listed, which is the audit doing its job on its first day.
   - Dead, each with exactly one hit in `js/`, `index.html`, `test/`, `tools/` and `assets/` — its own
     definition: `Abilities.needsTarget`, `HUD.spacedWidth`, `GameMap.wreckAt`, `GameMap.walkableTerrain`,
     `Unit.supCost`, `Terrain.getChunk` (the render loop inlines its own budgeted chunk fetch). `AI_KEEP`
     in `js/snapshot.js` was declared and then bypassed by the literal `'__ai'` on the next line; it is
     used now.
   - The four `file:line` references in test messages name identifiers instead (`wantHalls`,
     `Snapshot.restore`, `G.removeResource`, `Abilities.orderTick` / `instant`).
   - `HANDOFF.md`: the banner points at `HANDOFF-M16.md` and this review; "49 fast checks" is 70.

   No negative control applies to a deletion; the evidence is the cross-reference count. Gate 70 of 70,
   166.9 s. The stamp moved again, `14ec639729837842` → `a82605150bc95a01` (source in `game.js`,
   `sim.js`, `map.js` and `abilities.js` changed).
5. **Test hygiene: the runner reads every failure, shows every FAIL line, and turns a hang into a
   failure; four vacuous anchors have count guards; a mangled regex is repaired; the wall-clock
   budgets are gone.** *(commit: test hygiene)* All test/ and tools/, no simulation change.
   - `test/all.js`: `summarize()` only knew `ALL PASS`/`FAIL`; **thirteen gate suites print `FAILURES`
     on their red path** and fell through to "(exit code only)" — the path that matters. Fixed with one
     alternative; the three shapes were re-checked against the regex. A child is now killed after 15
     minutes with a clean FAIL line (the slowest honest member is under three). Every `FAIL` line of a
     failing child is printed before the 60-line tail, because nine gate suites print a PASS line per
     check and have more than sixty (`neutrals` has 383), so a FAIL in the first 300 lines was cut.
   - `test/rooms.js`: `c.open` waited on `onopen` alone, so a relay port held by anything else (a
     second gate, a stray server) hung the whole gate. **Measured:** with a dummy server on 8793 the
     old file waited forever; the new one exits red in 10.6 s naming the port. Error, close and a
     10 s deadline all reject, marked handled.
   - Vacuous anchors, each now guarded by the count it finds today: `test/shots.js` searched the whole
     of `fx.js` for `case 'kind'` and **js/fx.js has two switches with the same labels** — twelve of
     nineteen kinds matched the impact switch, found no `lerpPos`, and were skipped; scoped to
     `drawEffect` and reading `lerpPos(e, T)` through its `const T`, it finds nine (was seven) and
     asserts that. `test/describe.js` (eight buttons), `test/sensor.js` (an 800-char slice) get the
     same guard. `test/onmove.js`'s third regex alternative had lost its backslashes (HANDOFF-M13 trap
     6 in a committed test) — repaired. `test/neutrals.js` printed an unconditional PASS after a loop
     of FAILs; `test/terran12.js` would have passed on `String(undefined)`; `test/snapshot.js:111`
     read `=== ref[4500] || true` — always green and against the wrong frame; the reference run now
     records 4800 and the comparison is real.
   - `test/snapshot.js`'s two millisecond budgets (take < 400, restore < 400; measured 3 ms and 2 ms)
     are printed, not asserted: `test/all.js`'s header promises no wall-clock budgets in the gate.
     `test/observer.js` keeps its 1500 ms seek budget for now (198 ms measured here; open task 3).
   - `tools/inventory.js` counted one line too many per file (split pieces, not newlines: +131 on the
     repo total) and its header said fourteen suites are outside the gate (32). `test/patch15.js`
     carried `patch10.js`'s header verbatim. Two more stale comments in non-gate files, one dead helper.
   **Gate:** 70 of 70, 167 s.
6. **Every order the interface can issue now survives the command log.** *(commit: command log)*
   Three reviewers found the first of these independently.
   - **Autocast arming never entered the log.** `G.setAutocast` was not in `CMD.install`'s wrap list;
     `u.armed` is read inside the tick by `G.tickAutocast`, so a replay of any game where a Medic was
     armed re-ran without the heals, and a LAN peer never received the arm at all — a guaranteed
     desync the moment anyone pressed the button. **Measured before:** arming logged 0 commands; a
     400-frame scene with an armed Medic and a wounded Marine replayed from its log to a different
     state hash (Marine at 10 hp live vs unhealed in the replay). Wrapped now, with a packer and an
     `apply` case; the card works out ON/OFF locally because in a net game the wrapper returns before
     anything has changed.
   - **The ferry route was unreachable from the interface.** `packOrder` kept seven fields and not the
     route, so a ferry order from `js/ui.js` packed as `{type:'ferry'}`, failed `apply`'s target-less
     allow-list and left the ship idle. `test/ferry.js` drove the feature through `applyOrder`, which
     bypasses the packer, so it passed with the feature dead. `ORDER_KEYS` now names every plain field
     an order can carry and `ferry` is on the allow-list.
   - **A dead target dereferenced to its corpse on a live client and to null on a rejoiner** (a restored
     snapshot has no unreferenced corpses), so the two disagreed on one command in the drop window.
     `CMD.deref` returns null for a dead unit; both drop it.
   - **A malformed log was replayed anyway.** An entry without a command threw out of `G.tick`; frames
     out of order stalled `applyPending` so every later command was dropped in silence. `UI.logError`
     checks the shape and `startFromLog` refuses with a sentence on the stamp's alert path.
   - **The packers are stamped** (`CMD.pack` in `BUILD.TABLES`; `fns` had skipped it because it is not a
     function), and `Replay` is no longer hashed whole — only `Replay.applyPending` decides simulation
     order; the rest is download and autosave plumbing whose wording should not refuse a save.
   **Test:** `test/cmdlog.js`, 20 checks, in the gate (71). **Negative controls:** run before the fix,
   seven clean reds across autocast, ferry and deref; with the log check removed, five clean reds
   (the malformed logs reach `start()`); all restored byte-identical. **Gate:** 71 of 71, 166 s. The stamp
   moved again (`CMD`, `G.setAutocast`'s wrapper and the packers are hashed).
7. **Eight simulation faults, each measured by probe before it was touched.** *(commit: simulation
   bugs)* Every one is pinned in `test/review17.js` (28 checks, in the gate), which was run against the
   old tree first: **21 clean reds**, no crash — that run is the negative control for the lot.
   - **The Carrier's launch cooldown froze.** It ticked only while `launched[]` was non-empty, so if
     the only Interceptor out died within its eight frames the Carrier never launched again — bricked
     for the game with ammo aboard. Measured: one launch, then none in 400 frames of attack orders,
     cooldown stuck at 7. Now it ticks unconditionally.
   - **A field cured a longer status.** Jam, Time Warp, Fungal and Disruption Web *assigned* their
     status (`blind = 3`) each frame, so an Optical Flare (`blind = 1e9`) under a Jam ended with the
     Jam; measured for all three pairs (576→0, 1e9→0, 144→0). `Math.max` at the four sites.
   - **A sieged tank walked.** move/attackmove/patrol were refused at order time; follow, load, gather,
     repair and construct reached `moveTo` and walked it, siege and all — 275 px on a follow order,
     which a right-click on a friendly unit issues. Refused in `moveTo` the way burrow is, so every
     caller drops the order through the existing `moveFailed` paths.
   - **A cloaked unit below 25 energy could not decloak.** The energy gate ran before the free
     toggle-off branch; "Not enough energy" until it regenerated. Decloaking skips the gate.
   - **A larva could become an SCV.** `larvaMorph` checked requirements, money and supply and never
     `from`; measured: accepted, one Zerg-owned SCV. Gated by the data now (FIXLIST-M14 A4 class).
   - **A worker with no hall scanned every frame, forever.** `tickReturn` reset `waitT` to 24 and
     decremented it once, so it never expired and `G.nearestDepot` walked `G.units` 638 times in 240
     frames. It polls every 24 frames and keeps the order, so a hall under construction still resumes it.
   - **An exception inside a unit's or AI's tick was invisible.** Caught, logged to a console most
     suites stub to silence, and forgotten. `G.tickErrors` counts them; `review17` asserts zero and
     proves the counter with a unit whose tick throws.
   - **Charon Boosters shortened the Goliath's air range.** `rangeTech` is absolute everywhere else in
     the file; this one read `['charon', 3]` against a base of 5, so the research cut it. Brood War's
     8 now. *Balance-relevant: the AI buys Charon. Veto it if you want the old number back, but the sign
     was a bug either way.*
   - Data: the Infested Command Center (a repairable building) had no `min`, so its repair cost was
     NaN; `needsNuke` was a flag nothing read; four ability descriptions stated the wrong fact (Stim
     omitted the Marauder and Reaper, the MULE said 90 s for a 75 s lifetime, Blink named a Stalker
     that does not exist, the Mothership was "two Dark Templar" rather than two Arbiters).
   **Gate:** 72 of 72, 165 s. The stamp moved (`sim`, `game`, `abilities`, `combat`, `data`).
8. **Literals that duplicated a constant, dead code, comments that contradicted the code, and four AI
   faults that change nothing in a game without teams or neutrals.** *(commit: literals and comments)*
   **Identity check:** `test/eightplayer.js` (a deterministic eight-AI game) prints byte-identical banks
   before and after the batch, so nothing here changed a plain game.
   - Three techs (`u238`, `ion_thrusters`, `ocular`) carried an `effect` key nothing read while
     `js/sim.js` applied each by unit id with the number repeated as a literal. The effect lives on the
     Marine's weapon, the Vulture and the Ghost now, through the `rangeTech`/`speedTech`/`sightTech`
     fields twenty other defs already use; the three special cases are gone.
   - `WORKER_HAUL` (four literal 8s), `GAS_DEPLETED`, `MODE_TRANS` (three literal 40s for siege, the
     Viking transform and an abducted tank), the sieged tank's range now reads `SIEGE_W.range`, and
     abduct un-burrows through `Unit.surface()` so a Widow Mine's own timing is honoured. All stamped.
   - Dead: an empty Science Vessel branch, `if (d.suicide) { }`, an unreachable larva/egg score, a
     no-op fallthrough, three empty branches in `game.js`, an unused `const d`, two always-true tests in
     the glaive bounce (`o.isBuilding && false`; `!swarmed || b > 0` where a glaive is never swarmed), an
     empty hatchery branch in `map.js`, `workers.length < 18 ? 3 : 3`, `!(id === 'lurker' && false)`.
   - Comments: six in `map.js`/`snapshot.js` still said the snapshot does not carry `height` (it has
     since the crater rule) or that the stamp does not know Archetypes/MapModes/HAZARDS (it does now) or
     that the hazard tick "is not made yet" (it is, in `G.tick`) or that feature damage "is not wired"
     (it is); one in `sim.js` said being shot at turns hold into attack (`G.onHit` only retaliates when
     idle); `ai.js`'s budget comment listed four claimants (there are seven), named the wrong claimant
     number, and said "turn() holds money" (`budget()` does). Fixed in place, reasoning kept.
   - AI, verified identical in a plain game: **26 clauses in `AI.micro` tested an enemy by
     `o.owner !== p.id`**, so an allied AI stormed, irradiated and locked down its partner's units in a
     team game — all use `G.allied` now, like the M12 clauses; **the wave target could be a derelict and
     the wildlife counted as enemy army** when the skirmish screen turns neutrals on (measured: a
     derelict on three of three seeds, 11-14 supply of grubs) — `pickTarget`, its fallback and
     `seenEnemyArmy` skip the neutral owner; a hall on the exact map centre divided by zero for its
     rally; a style name from a payload was looked up with inherited keys (`'constructor'` was a style).
   - The Terran tech called `colossus` (Colossus Reactor) shared its id with the Protoss unit; it is
     `colossus_reactor` in the data, the Physics Lab and `AI_RESEARCH`.
   **Tests:** `test/review17.js` gained the neutral scene (three seeds; two negative controls run — the
   `pickTarget` guard removed picks `derelict_foundry`, the `seenEnemyArmy` guard removed counts 11) and a
   static guard on `micro` (no owner-only clause, ≥ 26 `G.allied` ones). **Gate:** 72 of 72, 199 s.
9. **Interface: keys, effects, the editor, a clamp, and the dead code around them.** *(commit:
   presentation)* None of it is stamped except one line in `js/game.js`. Pinned in `test/review17ui.js`
   (32 checks, in the gate), run against the old tree first: **12 clean reds and one crash** on a
   method that did not exist yet.
   - **Keys leaked into text fields and the main menu.** `UI.onKey` had no target or running-game guard:
     with the Name box focused, Enter opened an invisible chat buffer that ate every key until Escape,
     Backspace and Tab were swallowed, and F5 threw inside `Replay.data()`. Three guards now; the codex
     key still works from the menu; input is also refused while a rejoin catches up (an order issued then
     was stamped with a frame the live clients had passed, and the rejoiner desynced on its next hash).
   - **The zoom keys never matched.** `zoomIn` was bound to `'='` and read with Shift held, when
     `e.key` is `'+'`; the speed line matched `'+'` instead, so Shift+= sped the game up and nothing
     zoomed. The bindings are the shifted characters now and the bare `=`/`-` fallbacks are gone.
   - **F8 replaced a running game with the autosave in silence** while the help text called it a
     camera slot. It asks first when a game is running; the help text names F2 F4 F6 F7 as camera
     slots and F8 as the autosave, which is what README says.
   - **Tab never turned the card page** in Brood War hotkey mode: `cycleSubgroup` took it before the
     'More' button (whose key it is) even with one kind selected. It yields when there is nothing to
     cycle.
   - **An ally's ping never became "jump to last alert"**: `G.signal` recorded it on `G`, the key read
     UI's own record. Both carry a frame now and the key takes the later.
   - **In a network game the draw pass paced on `speedIdx` while the sim paced on `Net.speed`**, so
     units stepped instead of gliding; the +/- keys changed a number nothing read. One `speedIndex()`
     for both, and the keys say the host sets the speed. **A menu open on one client froze every peer**
     (`simStep` returned before the lockstep branch) — the lockstep runs behind a menu in a net game.
   - **The editor went blank on its second open**: the draw loop was made once and never re-armed.
   - **Effects fired per drawn frame, not per sim frame.** Decals aged 2.5× too fast at 60 Hz and the
     rocket, missile, flame, big-boom and nuke spawns ran two or three times per tick — the trap
     `ambient()` already documents, in five more places. `FX.once(e)` gates them; measured: a decal
     drawn three times in one frame ages 24, not 72. The rocket's trail used keys `p()` does not read
     (`r/c/g`) and drew an additive orange dot instead of grey smoke.
   - **A non-square map lost its lower chunk rows**: the y clamp used the map width. **The minimap was
     five badlands browns on every tileset**; it reads the tileset's palette like `overview()`.
   - **The manual could not be wheel-scrolled**: the wheel handler returned before `Codex.wheel`,
     whose only caller was a test.
   - Dead: an empty `dblclick` listener, a `setPending('land')` overwritten on the next statement, an
     empty Reaver/Carrier branch, a 'waiting' menu nothing set, two Interceptor projectile branches for
     a projectile never pushed, a stray path before a `save()`; `decal()` capped at a literal 400
     against `MAX_DECALS` 260; a comment that called `FX.rnd` seeded (it is `Math.random`).
   **Gate:** 73 of 73, 173 s. `test/larvacard.js` starts its game with `G.init` and drives the D key
   through `UI.onKey`, so it now says `UI.running = true` itself.
10. **The relay stops trusting its clients.** *(commit: networking)* Every item was probed against the
    old relay by the networking reviewer and re-probed here; `test/rooms.js` (in the gate) gained a
    section of 20 checks, and `test/net_many.js` and `test/net.js` were run by hand: **51 of 51 and
    all pass**.
    - **One HTTP request took every room down.** `GET /%` threw out of `decodeURIComponent` and exited
      the process. A 400 now, and the relay stays up.
    - **The whole checkout was served** — `/.git/HEAD`, every handoff, `test/serve.js` itself — to
      anyone holding the tunnel link, and the path check had no trailing separator. Only
      `/index.html`, `/js/` and `/assets/` are served.
    - **Any player could order another player's units.** The envelope carried the slot the relay knew;
      the commands inside carried whatever `p` the sender wrote, and `CMD.apply` trusted it — a
      `game over man` on your opponent, deterministically, on every client, with no desync to show.
      The relay re-stamps `p` on every command and the client does the same on receipt.
    - **A batch that was not a list was forwarded** and threw inside every receiver's `beforeTick`; a
      falsy one blocked the frame forever. Dropped at the relay; treated as an empty batch that arrived
      by the client.
    - **A refused stranger counted as in the room**: it received every broadcast, and the room was
      never reset when the real players left. `c.room` is set only when a join succeeds. A live player
      re-sending `join` with a dropped player's name took that slot (two slots, one id, and the game
      wedged on the hijacked one's batch); refused now, and the real owner can still rejoin.
    - **Anyone could answer a snapshot request** — a wrong snapshot is a silent desync for the
      rejoiner. The donor's id is recorded and required.
    - **Unvalidated lobby fields**: a race of `"QQ"` reached `G.init` and threw on every client after
      the relay had already marked the room playing; team, layout and difficulty were stored verbatim
      (500 characters of difficulty, rendered into every lobby). Whitelisted.
    - **Names went into `innerHTML` unescaped**: 16 characters fit `<svg/onload=x()>`. Escaped.
    - **The LAN room's second game could not change a setting**: the reset left `started` behind and
      `set`/`addai` gate on it — the ordinary "play again" flow. Cleared on reset.
    - **A kicked client kept hearing the lobby** and a re-sent join put it straight back. It leaves
      the room and is told why.
    - **A frame could claim 2^63 bytes** and was streamed into memory; chunks were re-concatenated per
      piece. A 16 MB cap (a rejoin snapshot is ~1 MB at 20 minutes), one concat per frame, fragmented
      frames refused explicitly, a well-formed pong past 125 bytes.
    - **No keepalive**: a connection that died without a FIN was never `leave()`d, so every peer
      waited on the OS TCP timeout and the player's own reconnect was refused. The relay pings every
      15 s and drops 45 s of silence. *(Hand-verified; it takes 45 s, so the gate checks it by regex.)*
    - Client: `theirHashes` was pruned by the local keys only (a peer's hashes for frames we never
      hashed piled up forever); the page insists on a room code over https; the header and two
      comments described the pre-snapshot rejoin; `hasRooms`, `serverState`, `chatLog` (unbounded,
      never read) removed.
    - **`test/net_many.js`'s fourth known red is gone.** The assertion — "the promoted host's speed
      change is obeyed mid-game" — contradicted the relay's rule that nothing is mutable once a game
      has started. It asserts the rule now (from the promoted host and anyone else), and a new
      lobby-phase block in its own room proves the promotion where host-only powers exist: the
      promoted host's speed is obeyed as seen by a third client, a non-host's is refused, the host can
      add a computer player and kick, the kicked client is told. `test/net.js`'s frame literal
      (`>= 16000`) is `> FRAMES`, so a shorter run no longer reads red against correct code.
    - Docs: README's multiplayer paragraph (rooms, the snapshot rejoin, F8 asks first, internet play
      via `PLAY-ONLINE.bat`), and `PLAY-ONLINE.bat` no longer says "no code lands you in an empty room
      of your own" — no code is the shared LAN room.
    **Negative controls:** the relay's `p` re-stamp removed → the forged-command check goes red; the
    static allowlist removed → the three 404 checks go red; both restored byte-identical. **Gate:** 73
    of 73, 186 s.
11. **Docs and the close-out.** *(commit: docs)* `PLAYTEST-M17.md` says how to see every fixed item by
    hand, 29 entries, with the invisible ones named as such and the test to run instead.
    `HANDOFF-M17.md` carries the state (73 suites; two known reds, not four; `eightplayer` recorded
    honestly), ten new traps, the diagnostics, and the kickoff prompt for a fresh chat, whose first
    action is answering the questions in section 2 above. `CLAUDE.md` points at the M17 files and says
    73 suites; README, `HANDOFF.md` and the appendix below (regenerated from `tools/inventory.js`) agree.
    The two worktrees the review made (`review-base`, `review-bisect`) are removed; the 23 older ones
    are question 5.
12. **Decisions 2, 7, 8 and 9: the eight-player bank, the bunker, the AI cadence and detector, the
    energy techs.** *(commit: decisions)* Pinned in `test/review17.js` sections 12-16 (44 checks now).
    - **Question 2, measured first.** The test's own message blamed `wantHalls`; the probe said
      otherwise: no AI had a base left to take (16 bases, 8 players), every AI was out of gas, and the
      three Zerg AIs sat at 2,000-2,600 minerals with **zero larvae and six eggs each** — income outran
      what six hatcheries hatch, and the hall rule allowed one new hatchery per 45 s. A Zerg with over a
      thousand minerals and no larva may now add one every 15 s (still one at a time). Control: with
      the clause removed a drone is sent at 45 s, with it at 16 s. Banks went 2054/2630/108/1749/2092/
      397/1092/2139 → 234/1198/405/2088/2077/352/1093/2475: the Zerg banks fell, one to 2475 against
      2500. **It was gated for one commit and taken out again** — the deterministic maths (entry 15)
      moved every position by a rounding step, dealt a different game, and a *Terran* crossed 2,500 on
      full geysers with eight production buildings: the flat-3 production rule `AI.macro` keeps on
      purpose ("THE FLAT 3 STAYS", measured twice), which is gated. The money line is AI variance on
      this map, not a check; it stays a hand-run measurement, and the note in `test/all.js` says so.
    - **Bunkered infantry fired at double rate** (`Unit.tick` and the bunker loop both decremented
      `cooldown`): 7.5-frame gaps against 15, measured; one decrement now, 15 against 15.
    - **The 12-frame micro cadence existed only for player 0.** `G.tick` runs AI *i* on frames ≡ *i*
      (mod 4) and 12 is a multiple of 4, so `G.frame % 12 === 0` never came true for players 1-3. Keyed
      on the player's own tick now; measured over 1,200 frames: 100/17/17/17 micro calls → about equal.
      **The detector weight had never fired**: it read `ud.detector` (the data says `det`) and
      `sawCloak` tested `d.cloak || d.burrow`, flags no unit has (they are abilities). Both read the
      real keys; an Observatory and an Arbiter Tribunal count as cloak tech too.
    - **Eleven energy techs give +50 max energy** to the unit each names (`ENERGY_TECH`, stamped);
      `maxEnergy` is an accessor over `_maxE` so a building morph and an older snapshot still assign
      through it. A Medic is 200 before Caduceus Reactor and 250 after; regen fills to the new cap.
    **Canaries:** `aistyles` seed 5 green (131), seeds 1 and 11 at their same four known reds — the
    cadence change did not create a fifth anywhere. **Gate:** 73 of 73, 192 s, before `eightplayer`
    joined.
13. **Decision 3: one line-ending rule.** *(commit: .gitattributes)* `* text=auto`, `*.bat text
    eol=crlf`, `*.png binary`; the working copy was re-checked out once (`git rm --cached -r . && git
    reset --hard`, no content change, no history rewrite). Before: 71 CRLF, 77 LF-only, 2 mixed; after:
    134 CRLF, 0 LF, 0 mixed (`tools/inventory.js`). The detect-per-file rule in `CLAUDE.md` stays,
    because a tool that writes LF after checkout still can.
14. **Decision 4: the room code is at least four characters, an address may join sixty times a minute,
    and cheats are off in a network game.** *(commit: relay decisions)* The relay refuses a shorter
    code with the rule, throttles joins per address (read from the `cf-connecting-ip` /
    `x-forwarded-for` headers a tunnel sets, else the socket), and drops any `cheat` command from a
    batch unless it was started with `BW_CHEATS=1`; the start message carries `cheats`, and
    `CMD.apply` refuses a cheat on every client when it is off, so the refusal is deterministic.
    `test/net.js` and `test/net_many.js` start their relays with `BW_CHEATS=1` because they keep their
    humans alive with `power overwhelming`; both pass (51 of 51, all pass). `test/rooms.js` section 10:
    a two-character code refused and a four-character one accepted, a cheat inside a batch dropped
    while the rest of the batch arrives, a `BW_CHEATS=1` relay forwarding it, and the fourth join from
    one address refused when the limit is three (53 checks). The re-stamp check in section 9 now uses
    an ordinary command, since a cheat is dropped outright. **Gate:** 74 of 74, 217 s.
15. **Decision 1: the simulation's transcendentals are the same bits on every engine.** *(commit:
    deterministic maths)* `Math.sin`, `cos`, `atan2` and `hypot` are not required to be correctly
    rounded and engines differ in the last bit (V8 and SpiderMonkey carry fdlibm ports; JavaScriptCore
    calls the platform libm), so a Tauri build on Windows (WebView2) against one on macOS (WebKit), or
    Chrome against Firefox, drifted apart over minutes. `DMath` in `js/data.js` computes the four with
    +, −, ×, ÷, `sqrt` and `floor` only (all correctly rounded by IEEE 754): range reduction by whole
    turns, a fold, and a Taylor series to ~1e-16; `atan` by argument reduction to |x| ≤ tan(π/12).
    **75 call sites** in the stamped files (66 trig, 9 hypot) now read it; presentation keeps the
    natives. `test/dmath.js` (14 checks, in the gate): sin/cos/atan2 within 4e-15 of Math over 100,000
    points and hypot within 1e-15 relative, the edges (exact zeros, the axes, a million radians, a
    non-finite angle is 0 not NaN), DMath's own source calls no native transcendental, no stamped file
    calls one in code (a scrape with a count guard: 75 DMath calls), and two contexts reach the same
    hash after 2,400 frames. Negative control: one `Math.hypot` put back in `sim.js` → two clean reds.
    The `version.js` audit refused a stale edit anchor on the way, which is the guard working. The
    stamp moved; results change by ulps, which is why entry 12's canary re-dealt. **Gate:** 74 of 74, 180 s (with `dmath` in and `eightplayer` out).
16. **A Zerg player starts with a Queen** (user decision, second session), **and the AI injects with her
    from the first minute.** *(commit: the starting Queen)* Measured first: Zerg started with a hall, four
    drones, three larvae and an Overlord; the AI's Queen clause already casts Spawn Larva whenever her
    energy allows and a hatchery within 26 tiles is short of larvae — it simply had no Queen, because
    she costs 100 gas and the gas went on tech. Spawn Larva refills a hatchery to its three larvae after
    ten seconds (M12 item 11 keeps that ceiling on purpose); a starting Queen with 50 energy is two casts
    as soon as the first drones come off the larvae, and energy regeneration then bounds her to one cast
    per 33 s. **Eight-player banks with her:** 296/1397/241/2000/926/90/24/1440 (the Zerg AIs were
    1798/2091/569 the run before; every player under 2,500 for the first time).
    **What it cost, measured:** the Queen's random starting facing shifts the RNG stream, so every
    `aistyles` arm is a fresh sample, and seed 5 — the gate's — went red on the four first-wave
    comparisons. The dump showed why they were fragile: without her they rested on one Protoss arm
    attacking at frame 10,944 of a 12,000 window, while the test's own comment calls the window "ten
    minutes" (14,400). The constant now says what the comment says. At ten minutes with the Queen:
    **seed 1 is clean (131), seed 5 fails one economy line** (expander vs turtle workers at five minutes,
    54 vs 61 — the Protoss expander arm re-dealt from 42 workers to 17), **seed 11 fails two.** Before:
    seed 5 clean, seeds 1 and 11 four reds each. The gate runs seed 1 now; 5 and 11 are the known reds
    (HANDOFF-M17). `test/review17.js` section 17: one Queen at 50 energy inside the starting supply, a
    Terran gets none, and a Zerg AI casts Spawn Larva at least twice in its first minute (before the
    change: zero Queens, zero casts). **Gate:** 74 of 74, 169 s. Not done, and listed as an open task: the AI's
    Queen is a `supportUnits()` member and follows the army, so once the army leaves she stops injecting.
17. **Decision 10: the fog shows the last state one of your units saw, not what is there now.** *(commit:
    fog memory)* `G.rememberSeen` has kept that memory per player since M11 — every enemy building a
    unit of yours saw, corrected only by sight — and nothing drew it: the renderer drew the *live* enemy
    building on explored ground, so one destroyed while you were not watching vanished at once. Now an
    enemy building is drawn live only where you can see this instant, and `Render.remembered()` turns
    each memory entry on explored-but-fogged ground into a ghost — a proxy whose reads fall through to
    the real unit (its sprite, its footprint) with the remembered position, owner, hp and completion laid
    over it, at fog alpha, writing nothing to the unit. The memory record gained `hp` and `done`, so what
    you see is the state you saw. Observers see everything and remember nothing. `test/review17ui.js`
    section 12 (38 checks): a depot placed at the map centre is remembered while a Marine watches, the
    Marine leaves, the depot is destroyed unseen, and the fog still draws it at its footprint at 0.75
    alpha; while the tile is visible nothing comes from memory; the ghost is a proxy and the unit is
    untouched; plus two static checks on the draw list. **Negative control:** the memory pass returning
    nothing → two clean reds; the draw-list wiring dropped → one clean red. **Gate:** 74 of 74, 168 s.

# 4. Considered and deliberately not done

1. **Hashing every own property of `G`** (which would have caught `G.cell` without naming it). No:
   almost all of them are runtime state, and `BUILD.hash()` is lazy — the first call can happen
   mid-game, so the stamp would depend on *when* it was first computed. `G.cell` is named in `TUNING`
   instead.
2. **Stamping the presentation strings that live in stamped files** (`UNEXPLORED_MSG`, `HAZARD_SAYS`,
   `FEATURE_SAYS`, `PLAYER_COLORS`, `TILESET_NAMES`, `DESC_MAX`, `ALERTS`). No: the header comment's
   rule is that stamping presentation would refuse a save for a wording tweak. Each is in `NOT_SIM`
   with its reason, and the audit makes the omission a decision rather than a hole.
3. **Moving the `eightplayer` money threshold** to make it green. No: it is the canary every handoff
   points at, and the cause is gated (question 2).
4. **Updating `file:line` references inside the closed `FIXLIST-M14.md`.** No: it is a frozen record
   and the references were true when written. Living documents are a different matter.
5. **Deleting the 23 stale worktrees** — deferred until question 5 was answered; then done.
6. **Migrating the 90 suites to a shared harness inside this review.** No: open task 2 says why.
7. **Defaulting `min: 0` in the def constructors** so no def could ever be priced NaN. Done, gated,
   **reverted**: `test/veterancy.js` pins "a spider mine is a munition with no `min` key" as the project's
   own definition of a munition (the mine's missing price was the original NaN bug, fixed by refusing to
   repair munitions), and the constructor default turned that assertion red. The rule says revert, so
   the narrow fix stands instead: an explicit zero on the one repairable def that lacked one, and a
   check that every def `repairableDef()` admits carries a number.
8. **Bunkered infantry fire at double rate** (`Unit.tick` decrements `cooldown`, then the bunker loop
   decrements it again; measured 7.5-frame gaps against 15 for a free Marine). A one-line fix that
   halves bunker DPS — a balance consequence, so it is gated. Question 7.
9. **The seven hand-copied supply-block tests** (`queueUnit`, `larvaMorph`, `warpIn`, `tickProduction`,
   `tickAlerts`…) that disagree on `notUnit` and `pair`, and leave a nuke queued at the supply cap never
   starting while the alert reports "supply blocked". A `G.supplyBlocked(p, def)` helper at all seven
   sites is the fix; it touches production for every race, so it is an open task with a probe, not a
   review-time change.
10. **A frame window on the relay's `cmds`** (open task 13) and **the rejoin-after-game-over double
    apply** (open task 14): both S, both untested against `test/net_many.js`'s timing, and the review
    already changed enough of the relay for one pass. Measure the window first.
11. **Refusing cheats in multiplayer.** `test/net.js` uses the cheat stream for god mode, and whether a
    friends' game should allow cheats at all is a product call (question 4). Not changed.
12. **Wiring `drawSelGrid` and `drawDayDial` into the HUD** (open task 1). Two shipped features that
    never draw is the largest presentation finding in the review, and the fix needs eyes on a screen
    to say the diegetic HUD still reads right with the grouped strip inside it. Not done blind.
13. **The AI reviewer's behaviour fixes** (open tasks 4, 5, 7, 8, 9): each changes what the computer
    does; `eightplayer` is already red and `aistyles` seeds 1 and 11 are known reds, so a behaviour
    change now would muddy the two canaries the balance work will need. Flagged with their probes.

---

# Appendix — the map

Regenerate at any time with `node tools/inventory.js --md`. Every description below is the file's own
first comment line, so it cannot drift from the file.

### js/ — the game  — 24 files, 17,736 lines

| file | lines | eol | what it is |
|---|---:|---|---|
| `abilities.js` | 932 | CRLF | Abilities & spells, status fields, auto-cast behaviours. |
| `ai.js` | 1920 | CRLF | Computer opponent: scripted opening, macro loop, army control, basic micro. |
| `atlas.js` | 65 | CRLF | Runtime loader for baked sprite sheets (assets/atlas.js + PNGs). |
| `audio.js` | 254 | CRLF | Voice (Web Speech synthesis, original lines) and generative ambient music. |
| `build.js` | 176 | CRLF | Build stamp. Saves and replays are a seed plus a command log, so they only |
| `codex.js` | 579 | CRLF | CODEX -- the field manual (M11 wave two, idea 25). |
| `combat.js` | 123 | CRLF | Combat: weapon firing, splash, special attack types, projectiles. |
| `commands.js` | 166 | CRLF | Deterministic RNG, command interception/recording, replay + save/load. |
| `data.js` | 2083 | CRLF | Brood War data tables. Times are in game frames (24/s = "Fastest"). |
| `editor.js` | 330 | CRLF | In-browser map editor. Paints the height grid (low / ramp / high) and rocks, |
| `fx.js` | 369 | CRLF | FX: particles (render-side), ground decals (scorch, blood, corpses), |
| `game.js` | 1203 | CRLF | Game state container G: units, players, spatial hash, vision, production, |
| `hud.js` | 1002 | CRLF | HUD: BW-style console (minimap, unit panel, command card), resource bar, |
| `map.js` | 1792 | CRLF | Map: terrain grid, cliffs/ramps, resources, creep, psi power, placement. |
| `missions.js` | 621 | CRLF | Scenario missions: scripted setups with custom objectives and briefings. |
| `net.js` | 147 | CRLF | LAN multiplayer client: deterministic lockstep over a WebSocket relay. |
| `render.js` | 1610 | CRLF | Renderer: composes terrain chunks, creep, decals, sprites, effects, fog. |
| `sim.js` | 673 | CRLF | Simulation core: Game state, Player, Unit, orders, movement, combat, |
| `snapshot.js` | 219 | CRLF | Simulation snapshots. A replay is a seed plus a command log, so seeking |
| `sprites.js` | 102 | CRLF | Sprite cache: pre-renders unit painters per facing (16 dirs, 32 for a few) and building |
| `sprites_buildings.js` | 346 | CRLF | Building sprite painters (static) + animated overlays. Origin = footprint |
| `sprites_units.js` | 401 | CRLF | Unit sprite painters with animation state. Each paints a unit facing +x at |
| `terrain.js` | 625 | CRLF | Terrain renderer: procedural "Badlands"-style tileset. Chunk-cached. |
| `ui.js` | 1998 | CRLF | UI: input, selection, command card, console panel, minimap, hotkeys, |

### test/ — the suites  — 106 files, 21,069 lines

| file | lines | eol | gate | what it is |
|---|---:|---|---|---|
| `addons.js` | 158 | CRLF | ✅ | FIXLIST-M14 B5 (item 15) -- an add-on keeps its own card, and the page turn has a slot. |
| `aiadapt.js` | 175 | CRLF | ✅ | The AI scouts, and what it finds changes what it does. |
| `aiaudit.js` | 134 | CRLF | — | AI audit: watch AI-vs-AI games and count the things a human player would never do. |
| `aiscripts.js` | 62 | CRLF | ✅ | The AI build scripts have one invariant that is easy to break and expensive to notice: the steps must |
| `aistyles.js` | 302 | CRLF | ✅ | AI play styles: turtle, rusher, expander, harasser, and 'standard' -- which is the default and must |
| `alerts.js` | 230 | CRLF | ✅ | Player alerts: idle production, supply block, an empty Carrier, an undefended expansion under attack. |
| `all.js` | 217 | CRLF | — | The fast, deterministic checks, in one run, with one summary and a non-zero exit on any failure. |
| `auras.js` | 92 | CRLF | ✅ | Building auras (M11 wave two, item 11). The data contract is documented at length in js/data.js above |
| `baked.js` | 71 | CRLF | ✅ | Every unit and building has a baked sprite. |
| `balance.js` | 81 | CRLF | — | AI-vs-AI balance matrix: every matchup on every layout, both sides, N seeds, run in parallel. |
| `balance_ab.js` | 64 | CRLF | — | Paired A/B of two balance logs:  node test/balance_ab.js before.log after.log [--race=T] [--matchup=TZ] |
| `balance_stats.js` | 84 | CRLF | — | The statistics behind test/balance.js. Every wrong turn in M3's balance work came from reading a |
| `branch.js` | 115 | CRLF | ✅ | Branching replay: take control mid-replay and play the what-if. M11 wave three, item 24. |
| `campaign.js` | 433 | CRLF | ✅ | The campaign: weighted choices, the record of them, and what the record takes away. |
| `card.js` | 67 | CRLF | ✅ | The command card is 4x3 and paginates (M11 decision, 2026-09-09). It used to be 3x3 with Cancel |
| `cardsay.js` | 323 | CRLF | ✅ | Every greyed command-card button must say why it is greyed. |
| `casters.js` | 101 | CRLF | — | Caster audit: which of the spells the AI ever actually casts, and why the rest do not. |
| `clearance.js` | 179 | CRLF | ✅ | FIXLIST-M14 C6 (item 18) -- a wide unit gets a path its BODY can walk. |
| `clicking.js` | 334 | CRLF | ✅ | FIXLIST-M14 B1, B2 and B3 -- what a click can reach. |
| `cmdlog.js` | 137 | CRLF | ✅ | REVIEW-M17 -- every order the interface can issue survives the command log. |
| `codex.js` | 396 | CRLF | ✅ | The unit codex (M11 wave two, idea 25), and above all its damage calculator. |
| `commit.js` | 48 | CRLF | ✅ | Two M11 rules that are easy to regress and invisible when they do: |
| `controls.js` | 96 | CRLF | ✅ | Rebindable controls. M12 item 10, the half of the menu work that did not exist in any form. |
| `craters.js` | 164 | CRLF | ✅ | Craters, wreckage and stripped ground -- M11 wave one, idea 9 (terrain destruction) and idea 1 |
| `creeplife.js` | 171 | CRLF | ✅ | FIXLIST-M15 A3 -- creep that looks alive, without paying for it. |
| `creepspeed.js` | 270 | CRLF | ✅ | FIXLIST-M15 C3 (item 5, second half) -- the swarm moves faster over its own ground. |
| `curve.js` | 162 | CRLF | ✅ | FIXLIST-M14 C7 (item 16) -- freehand formation shapes. |
| `daynight.js` | 116 | CRLF | ✅ | The day/night cycle as the player meets it. M11 wave one, idea 19. |
| `defeat.js` | 176 | CRLF | ✅ | FIXLIST-M14 B4 (item 8) -- the defeat screen, and why it was never showing. |
| `describe.js` | 242 | CRLF | ✅ | FIXLIST-M14 A1 -- every unit and every building says what it is FOR. |
| `determinism.js` | 33 | CRLF | ✅ | Determinism + replay test: node test/determinism.js |
| `diag.js` | 8 | CRLF | — |  |
| `diegetic.js` | 539 | CRLF | ✅ | The diegetic console (M11 wave one, idea 15): a HUD that belongs to the commander, takes damage and |
| `diverge.js` | 24 | CRLF | — | Finds the first frame where two identical simulations diverge. node test/diverge.js [frames] |
| `dmath.js` | 87 | LF | ✅ | REVIEW-M17 decision 1 -- the simulation's transcendentals are the same bits on every engine. |
| `duel.js` | 111 | CRLF | — | Equal-supply duels: the third proxy candidate, and the one that is supposed to show nothing. |
| `editor.js` | 207 | CRLF | — | Map editor test: builds a custom 2-player map the way the editor does, validates it, |
| `eightplayer.js` | 220 | CRLF | — | Eight players on a 192x192 map, which nothing has ever run. |
| `facing.js` | 51 | CRLF | ✅ | Directional armour (M11 idea 6). A hit from behind hurts more than one you are facing, so where a |
| `features.js` | 132 | CRLF | ✅ | Headless feature tests: node test/features.js |
| `ferry.js` | 95 | CRLF | ✅ | Transport ferry routes that run themselves. M11 wave three, item 4. |
| `fields.js` | 97 | CRLF | ✅ | Every persistent field draws SOMETHING. |
| `flavour.js` | 305 | CRLF | ✅ | Unit flavour (M11 wave-one idea 17): the voice lines, and the state-aware delivery on top of them. |
| `fogbuild.js` | 170 | CRLF | ✅ | FIXLIST-M14 C1 (item 9) -- you may not build on ground you have never seen. |
| `fognight.js` | 69 | CRLF | ✅ | Fog that lies (M11 wave one, idea 5) and the day/night cycle (idea 19's second half). |
| `formation.js` | 80 | CRLF | ✅ | Drag-line formation (M11 wave three, idea 9), as Beyond All Reason has it: hold right, drag a line, |
| `gated.js` | 212 | CRLF | ✅ | FIXLIST-M14 A4 -- nothing is gated by convention. The audit, made durable. |
| `highground.js` | 123 | CRLF | ✅ | High ground applied, and the vision bug that finding it uncovered. |
| `larvacard.js` | 168 | CRLF | ✅ | FIXLIST-M15 B1 + B3 -- the Zerg larva card, and one refused click saying one thing. |
| `ledger.js` | 350 | CRLF | — | THE PER-THINK SPEND LEDGER. A measurement, not a check -- it prints, it never fails. |
| `line.js` | 176 | CRLF | ✅ | FIXLIST-M14 C5 (item 20) -- the Hellion's line attack, and the three things wrong with it. |
| `longgame.js` | 210 | CRLF | — | A sixty-minute game, which nothing in this repo has ever run. |
| `mapfeatures.js` | 486 | CRLF | ✅ | Destructible and dynamic map features, and the procedural archetypes that place them. |
| `mapmodes.js` | 296 | CRLF | ✅ | Map sizes as modes, and the sandstorm. |
| `menucodex.js` | 105 | CRLF | ✅ | The CODEX button on the main menu, which did nothing at all until 2026-09-09. |
| `micro.js` | 11 | CRLF | — |  |
| `missions.js` | 43 | CRLF | — | Mission test: runs every campaign mission headlessly and checks that the setup placed what it promised, |
| `movement.js` | 125 | CRLF | ✅ | Movement edge cases that used to hang a unit forever with a live order. |
| `net.js` | 67 | CRLF | — | Multiplayer robustness test: two headless lockstep clients + one AI through the relay. |
| `net_many.js` | 389 | CRLF | — | Multiplayer with more than two humans, and what happens when two of them leave at once. |
| `neutrals.js` | 435 | CRLF | ✅ | The fourth race, which is not a race: neutral hostile life (M11 wave two, item 1) and capturable |
| `neutralsim.js` | 165 | CRLF | ✅ | The neutral owner, wired into the simulation. M11 wave two, items 1 (hostile life) and 8 (derelicts). |
| `newbuildings.js` | 251 | CRLF | ✅ | The nine buildings M11 wave two adds -- a field hospital, a jamming tower and a wall for each race -- |
| `observer.js` | 142 | CRLF | ✅ | Observer / replay controls: per-player vision switching, the production overlay and the |
| `onmove.js` | 168 | CRLF | ✅ | FIXLIST-M14 C4 (item 19) -- the Cyclone fires while moving. |
| `patch10.js` | 99 | CRLF | — | NOT A TEST. This is a one-off codemod from M10: it REWRITES FILES IN js/ and was applied once, |
| `patch11.js` | 64 | CRLF | — | NOT A TEST. This is a one-off codemod from M11: it REWRITES FILES IN js/ and was applied once, |
| `patch15.js` | 34 | CRLF | — | NOT A TEST. This is a one-off codemod from M15: it REWRITES FILES IN js/ and was applied once, |
| `perf.js` | 53 | CRLF | — | Performance test: 4 players at ~200 supply fighting in the middle of the map. |
| `perf_render.js` | 142 | CRLF | — | Render-side performance:  node test/perf_render.js [port] |
| `playtest.js` | 66 | CRLF | — | Scripted human play-test. Drives a full game per matchup through the UI layer |
| `playtest_bot.js` | 102 | CRLF | — | Harness-side "human": UI-level actions + invariant/stuck checks. Loaded into the game VM by playtest.js. |
| `playtest_scripts.js` | 172 | CRLF | — | Race scripts for the scripted human (see playtest.js). Each think() runs once per second of game time |
| `protoss12.js` | 667 | CRLF | ✅ | M12 wave four, the Protoss half: ten new units, the Warp Gate, Chrono Boost and Blink. |
| `proxy.js` | 168 | CRLF | — | A cheap directional proxy for the balance number. |
| `proxy_validate.js` | 107 | CRLF | — | Does the cheap proxy in test/proxy.js actually predict the balance number? |
| `push.js` | 108 | CRLF | ✅ | Unit collision push. M12 wave three, item 14. |
| `qol.js` | 173 | CRLF | ✅ | M12 wave one: the quality-of-life layer. |
| `rates.js` | 255 | CRLF | ✅ | Rate of fire: does every weapon actually fire at the interval the table says? |
| `refusals.js` | 175 | CRLF | ✅ | FIXLIST-M15 B2 -- a refused ability says WHY, and no ability refuses in silence. |
| `rejoindiag.js` | 124 | CRLF | — | Diagnostic for the net.js rejoin desync: isolate which of the two things a rejoin does to a snapshot |
| `renderfeel.js` | 552 | CRLF | ✅ | The three render changes of this commit, checked as far as render code can be checked. |
| `review17.js` | 381 | CRLF | ✅ | REVIEW-M17 -- the simulation faults the review measured, fixed, and pinned. |
| `review17ui.js` | 259 | CRLF | ✅ | REVIEW-M17 -- the interface faults the review found, fixed, and pinned. |
| `rooms.js` | 335 | LF | ✅ | Rooms, the join code, the player cap and the configurable lockstep delay. |
| `saveload.js` | 297 | CRLF | ✅ | Saving and restoring while something is halfway through happening. |
| `sensor.js` | 222 | CRLF | ✅ | FIXLIST-M14 C2 (item 12) -- the Sensor Tower reports movement, it does not reveal ground. |
| `serve.js` | 237 | CRLF | — | Static server + multiplayer relay (WebSocket, no dependencies):  node test/serve.js [port] [delay] |
| `shots.js` | 211 | CRLF | ✅ | FIXLIST-M15 A1 -- every weapon has its own shot, and every shot actually draws. |
| `skirmish.js` | 322 | CRLF | ✅ | The skirmish setup screen (M11 wave two, item 22). |
| `smoke.js` | 22 | CRLF | — | Headless smoke test: loads the game scripts in a VM, runs an AI-vs-AI game for N frames. |
| `snapshot.js` | 154 | CRLF | ✅ | Simulation snapshots. The whole point is that restoring one and carrying on must be |
| `soak.js` | 327 | CRLF | — | M12 wave five: the long run, across every matchup. |
| `suppress.js` | 56 | CRLF | ✅ | Suppressing fire (M11 idea 7). One research per building that trains ranged units; everything that |
| `targeting.js` | 67 | CRLF | ✅ | Target selection (M11 wave three, idea 5). Scoring purely by distance makes a unit walk past the thing |
| `techtime.js` | 97 | CRLF | — | WHEN DOES THE AI REACH EACH TIER? A measurement, not a check. |
| `techtree.js` | 116 | CRLF | ✅ | Can everything actually be built?  node test/techtree.js [--quiet] |
| `terran12.js` | 552 | CRLF | ✅ | M12 wave four, the Terran half: fifteen new entries, the MULE (item 11), the Reactor and the Viking. |
| `tumour.js` | 361 | CRLF | ✅ | FIXLIST-M14 C3 (item 5) -- the Queen plants creep tumours, and the Overlord still does. |
| `version.js` | 132 | CRLF | ✅ | Build stamp: saves and replays carry a digest of the simulation, and a log from a |
| `verticality.js` | 406 | CRLF | ✅ | Vertical layers: the height query the simulation reads, and the promise that a ramp is the only |
| `veterancy.js` | 70 | CRLF | ✅ | Veterancy and scarring (M11 idea 2). Both are derived rather than stored -- rank comes from `kills`, |
| `wavetarget.js` | 208 | CRLF | ✅ | FIXLIST-M14 D1 (item 6) -- what a wave walks at. |
| `wrongthing.js` | 651 | CRLF | ✅ | Do the wrong thing on purpose, and require that the game neither crashes nor hangs. |
| `zerg12.js` | 601 | CRLF | ✅ | M12 wave four, the Zerg half: ten new defs, two macro mechanics, and one promise. |
| `zoom.js` | 574 | CRLF | ✅ | Strategic zoom, and the render half of day/night. |

### tools/ — build and diagnostics  — 7 files, 1,733 lines

| file | lines | eol | what it is |
|---|---:|---|---|
| `bake.js` | 93 | CRLF | Sprite baking pipeline:  node tools/bake.js [--only id,id] [--ss N] [--pv N] |
| `control.js` | 17 | LF | Negative control runner (REVIEW-M17), in the shape HANDOFF-M16 trap 2 asks for: apply a text edit to one file, |
| `inventory.js` | 78 | CRLF | A map of the repo, generated rather than maintained by hand so it cannot go stale. |
| `models.js` | 1237 | CRLF | 3D model definitions for the sprite baker. Model space: X forward, Y up, |
| `patch.js` | 40 | LF | Multi-file, line-ending-safe patch runner (REVIEW-M17; every review patch went through it). All-or-nothing: every edit is checked against the |
| `raster.js` | 210 | CRLF | Software 3D rasterizer + PNG writer for the sprite baking pipeline. |
| `tilesets.js` | 58 | CRLF | Side-by-side screenshot of every tileset:  node tools/tilesets.js [port] |

### Totals

| | files | lines |
|---|---:|---:|
| `js/` (the game) | 24 | 17,736 |
| `test/` | 106 | 21,069 |
| `tools/` | 7 | 1,733 |
| **all** | **137** | **40,538** |

**In the gate:** 74 of 106 suites.

**NOT in the gate** (32, deliberately — `test/all.js` says why at the top of the file): `aiaudit`, `all`, `balance`, `balance_ab`, `balance_stats`, `casters`, `diag`, `diverge`, `duel`, `editor`, `eightplayer`, `ledger`, `longgame`, `micro`, `missions`, `net`, `net_many`, `patch10`, `patch11`, `patch15`, `perf`, `perf_render`, `playtest`, `playtest_bot`, `playtest_scripts`, `proxy`, `proxy_validate`, `rejoindiag`, `serve`, `smoke`, `soak`, `techtime`.
