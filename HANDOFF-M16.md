# HANDOFF — M16

Written at the end of the session that closed `FIXLIST-M15.md`. Branch `m10-overnight`. (HEAD moves as
this file is committed — trust `git log -1`, not a hash written here.)

> **THE PROJECT'S TO-DO LIST IS EMPTY.** Every reported item in `FIXLIST-M14.md` and `FIXLIST-M15.md`
> is closed. **The only thing queued is the balance run, and it is gated.** Nothing else is waiting on
> anything.
>
> The one entry that did not end the way it was planned is **D1**, and it is the most useful thing in
> this file. It was attempted four ways, measured over six 20-minute games, and **reverted**. Read the
> Group D section of `FIXLIST-M15.md` before touching `js/ai.js` — the four things that did not work
> are worth more than the diagnosis that led to them.

`PLAYTEST-M15.md` is how to see every item by hand. `HANDOFF-M15.md` remains true for the traps and
for the Group D measurements it originated; everything in `HANDOFF-M13.md` and `HANDOFF-M14.md` is
still true except where a later file says otherwise.

---

## State

- **68 test suites green.** `node test/all.js`, ~3.8 minutes. That is the gate before any commit.
- **FIXLIST-M15 is complete.** Nine entries: A1, A2, A3, B1, B2, B3, C1, C2, C3, plus D1 measured and
  reverted and D2 re-blocked on a different thing than before.
- **One new suite this session**: `creepspeed` (67 → 68). `tumour` grew from 29 checks to 48.
- **The build stamp moved**, as expected — C1, C2 and C3 are all simulation changes. Saves and replays
  from before this milestone will be refused, which is the stamp doing its job.

### The three known reds, unchanged

All three were measured before and after every change this session and none of them moved.

1. **`test/soak.js`** fails `every tier-1/2 M12 def is fielded` — Swarm Host. Not weakened.
2. **`test/aistyles.js` on seeds 1 and 11** fails four assertions: no style attacks inside its
   12,000-frame window. Pre-existing. Seed 5, the one in the gate, is clean.
3. **`test/eightplayer.js` is 19/19**, but its money assertion passes by only 4% (2405 against a 2500
   threshold). If it flips, the cause is `AI.macro`'s `wantHalls` floor -- `js/ai.js:700` today. HANDOFF-M15 said line 141 and that is
   stale; 141 is an AI_COMP comment. Search for the identifier, not the line.
   **This nearly went red this session** — the D1 bounds pushed one AI's bank from 796 to 5,019
   minerals. It is back where it was because D1 was reverted, but it is the assertion any future AI
   spending change will hit first.

4. **`test/net_many.js` fails one of 44** — `phase 4: the promoted host's host-only command is obeyed`.
   **NEWLY RECORDED, PRE-EXISTING, AND THE ASSERTION IS THE THING THAT IS WRONG.** Verified identical
   at `57d61d2` (before this milestone) and at HEAD: 43 passed, 1 failed, the same assertion, both trees.

   The relay gates `case 'set'` on `!lobby.started` (`test/serve.js`), so once a game begins NO settings
   change is accepted from anyone, host or not. That rule is deliberate, and the same rule is what makes
   *"the relay refuses a map change once the game is running"* PASS in game C of the same file. Phase 4
   promotes a new host mid-game and then asserts that the new host's speed change takes effect — but
   there is no host-only setting that CAN be changed mid-game, so it asserts something the design
   deliberately forbids.

   **Host migration itself is fine, and the same run proves it:** dropping the host promotes the next
   surviving human, every remaining client is told who the new host is, and phase 5 passes — the role is
   handed back when the original host rejoins its own slot.

   **Do not "fix" this by loosening the relay.** The fix is a replacement assertion that shows the
   promotion is real using a power that exists mid-game, or moving the check into a lobby-phase test.

### Multiplayer, run by hand this session

Neither net test is in the gate — both are slow and environment-dependent — and this milestone changed
the movement path, which is exactly what deterministic lockstep rests on. So both were run against HEAD
rather than assumed:

- **`node test/net.js` — ALL PASS.** Two clients plus an AI over real sockets: 14,400 frames of random
  orders with state hashes matching at every 48-frame checkpoint; a killed client whose units stop on
  the relay-chosen frame that both clients agree on; a rejoin served from a live player's snapshot
  rather than a re-simulation from frame 0; and an artificially injected divergence reported by both
  clients at the same frame, which is what makes the other three results mean anything.
- **`node test/net_many.js` — 43 of 44**, the one failure being the assertion above. Four humans in
  lockstep, host migration, two players dropping and rejoining in the same tick of the event loop, and
  a rejoin into a game old enough to have mined a mineral patch out all pass.

**What LAN multiplayer is and is not.** `test/serve.js` is the static server and the WebSocket relay in
one file with no dependencies; it binds every interface and prints its LAN URLs on startup, and a client
points its socket back at whatever host served the page. So everyone on one LAN opening one URL works
with nothing installed. There is **no NAT traversal, no matchmaking, no TLS and no auth**, and the relay
holds one lobby and one game — internet play needs a port forward or a tunnel, and anyone who can reach
the port can join the lobby.

---

## What this session changed

Nine entries, one commit each except B1+B3 which were one bug.

- **A1** — every armed thing in the game has its own shot. It was 34 of 63 firing the same white dot.
- **A2** — all 80 abilities describe themselves, and say what to click as well as what they do.
- **A3** — creep bubbles, as an overlay, without touching the chunk cache or the build stamp.
- **B1 + B3** — the Zerg larva card was shifted one slot, which is where "Requires Spire" came from.
- **B2** — seven bare `Invalid target.` refusals now name the condition that failed; an eighth said
  nothing at all and does now.
- **C1** — Creep Tumour costs 25 energy and the Overlord has a 200 pool that fills off the existing
  regen. Measured before: one Overlord planted **30 of 30** free tumours.
- **C2** — tumour cast range is a real limit, in **both** the places it could be broken. The fixlist
  said one of those halves already worked; it did not.
- **C3** — Zerg move 30% faster on creep, with SC2's exceptions. Measured absent in all 23 cases first.
- **D1** — bounded four ways, measured, **reverted**. See below.

---

## D1, and why it is the important part

`AI.production()` buys the cheapest affordable unit when its top-ranked pick cannot be paid for. That
diagnosis is correct. Four bounds were implemented and each measured on six arms (three races × seeds
1 and 5, 20 minutes, solo, hard):

| bound | what happened |
|---|---|
| cost floor — nothing strictly cheaper than what money refused | Zerg misallocation 105 → **38**, army 238 → **26.5 supply**, 547m floating |
| share floor — nothing at or over its intended share | bit-identical to the cost floor |
| share floor armed only by held money (`trainReserve`) | half the arms good, half bad; Zerg to 50 supply on 1,105m |
| share floor with a lapse valve | near no-op; three arms bit-identical, one worse |

**The ledger explains all four in one line.** Claim 7 of `budget()` — the composition's top pick — is
funded in full on **4%** of the thinks it arms, **before the bound and after it, unchanged**. The six
claims above it each take `min(p.minerals, …)`, so they grow with the bank: saving does not fill claim
7, it fills claims 1–6. Money `production()` declines becomes buildings and upgrades, because
`research()` runs two phases later and takes it.

**The only thing that moves claim 7 is the claim order in `budget()`, and that is gated.** It is priced
per race in `HANDOFF-M15.md` and it trades most of the AI's upgrades for a much bigger army.

**D2 is blocked on that gated decision, not on D1.** The weights are read and the ranking off them is
right; what fails is funding. No version of D1 unblocks D2.

---

## Traps found this session

On top of everything in `HANDOFF-M13.md`, `HANDOFF-M14.md` and `HANDOFF-M15.md`. Every one of these
cost real time here.

1. **`GameMap.blocked` is an `Int32Array` where `-1` MEANS FREE.** Not a boolean. `if (m.blocked[i])`
   is true for every unoccupied tile, so a probe filtering on it finds nothing anywhere and reports
   "no legal ground on the map". Use `m.blocked[i] !== -1`.
2. **A `git checkout <file>` to restore a negative control reverts YOUR EDITS too.** One control
   restored `js/data.js` and silently threw away all of C1's data changes; the next control then
   failed with "anchor count 0" rather than a wrong answer, which is the only reason it was noticed.
   `tools/_ctl.js` (scratch, not committed) applies a control, runs a test and restores the original
   from memory — use that shape instead.
3. **A negative control that deletes a data key CRASHES a `J()`-style probe.** `JSON.stringify(undefined)`
   is the string `"undefined"` and `JSON.parse` throws on it, so the control kills the file and hides
   every other result. This is HANDOFF-M15's trap 8 in a new costume. Guard every lookup a control can
   delete with `|| 0` or `|| null`.
4. **Distance travelled is a bad way to measure a speed change**, and it went red against correct code
   twice. It saturates when the unit arrives, and it is swamped by `facing`: `Unit`'s constructor sets
   a random facing and `moveTo` cuts a ground unit's step to 45% while it is turning more than 1.2
   radians, so two units spawned back to back are not comparable over a short run. Pin the heading and
   compare the biggest single step.
5. **A determinism arm can be VACUOUS and look like a pass.** The first C3 replay check played four
   minutes of a hard Zerg AI and hashed the result with and without the bonus. All three arms hashed
   bit-identically — because four minutes of Zerg is drones and overlords, the Drone has no bonus and
   the Overlord flies. Drive the thing you are testing yourself.
6. **A move order SURFACES a burrowed unit** (`Unit.applyOrder`, `BURROW_SURFACES`), so ordering a
   burrowed unit to walk measures an unburrowed one. Read `u.speed` directly instead.
7. **A point ability cast by a BUILDING never reaches `Abilities.orderTick`.** `issue()` has its own
   branch that resolves it immediately. Any rule written into `orderTick` silently does not apply to
   Comsats, Orbital Commands, Nexuses, Nydus Canals or creep tumours. This was half of C2 and the
   fixlist had it backwards.
8. **`js/build.js` hashes `DATA` and does NOT hash arbitrary globals.** A new tuning table declared as
   a bare `const` changes the simulation without moving the build stamp, which is the exact desync the
   stamp exists to refuse. `CHURN_SLOW` in `js/map.js` still has that hole. Put tables in `DATA`.

---

## Diagnostics available

```
node test/all.js                                  68 suites, ~3.8 min, the pre-commit gate
node test/ledger.js [min] [seed] [solo|vs] [race] per-think spend, claim funding, refusals by gate
                                                  section 6 is intended vs actual supply share
node test/creepspeed.js                           the creep multipliers, per unit, with the exceptions
node test/tumour.js                               two tumour sources, one budget, energy, and range
node test/techtime.js [min] [seeds] [solo|vs]     when the AI reaches each tier  -- USE A WORKTREE
node test/soak.js [--frames=] [--seeds=]          every matchup, coverage report -- USE A WORKTREE
node test/longgame.js                             60-minute game and its replay, ~9 min
node test/eightplayer.js                          eight players on a 192x192 custom map
node test/aistyles.js --seed=N                    ONE seed by default; run 1, 5 and 11
node tools/bake.js                                re-bake sprites after art changes
```

**`test/ledger.js`, `test/soak.js` and `test/techtime.js` each re-read `js/` per run.** Editing the
tree while one is running silently contaminates it. Run long measurements in a `git worktree` under
`.claude/worktrees/` (gitignored) so before and after can run in parallel.

---

## Kickoff prompt for a fresh chat

**The to-do list is empty, so this prompt asks a question rather than naming a next action.** Paste
everything inside the fence into an empty chat. **Replace the HEAD hash with `git log -1 --format=%h`
first** — committing this file moves it.

```
Repo: C:\Users\zacsl\OneDrive\Documents\Default Project\broodwar
Branch: m10-overnight. HEAD: <run git log -1 --format=%h>. Working tree clean.

Read CLAUDE.md, then HANDOFF-M16.md, then PLAYTEST-M15.md.

THE PROJECT'S TO-DO LIST IS EMPTY. FIXLIST-M14 and FIXLIST-M15 are both closed -- forty
reported-or-found items across the two. There is no queued work. Do not invent some.

So the first thing to do is ASK ME what this session is for, and offer these three, which
are the only things actually outstanding:

  1. THE BALANCE RUN. It is the one thing queued and it is GATED -- test/balance.js and
     test/proxy.js need my explicit instruction and you should double-check with me if I
     appear to give one. Every balance number in HANDOFF.md is stale. M15 added three more
     things it has to price: creep tumours costing 25 energy, tumour cast range becoming a
     real limit, and a 30% Zerg creep movement bonus, which is the largest single balance
     change in either fixlist. The Overlord also became a legal Feedback and EMP target,
     which is new and unpriced.

  2. THE AI's SPENDING PRIORITIES. This is the only known correctness problem left and it
     is a balance question, which is why it is not a to-do. The AI ignores its own
     composition table in all three races. D1 measured WHY and it is not what anyone
     thought: production()'s fall-through is the mechanism but not the cause. budget()
     funds the composition's top pick in full on 4% of the thinks it arms, and that number
     does not move under any bound -- four were tried and measured, all reverted. The fix
     is the claim order in budget(), it is priced per race in HANDOFF-M15.md, and it trades
     most of the AI's upgrades for a much bigger army. Do not take it without my say-so.

  3. PLAYTEST FEEDBACK. I may have played M15 and have new reports. If so, that is a new
     FIXLIST, written the way FIXLIST-M15.md is: every entry checked against the code
     before it is written, with the number where the report and the code disagree, and the
     probe named where it could not be reproduced.

THE GATE: node test/all.js, 68 suites, about four minutes, before EVERY commit. Green means
green. If a change fixes a real fault but turns a marginal assertion red, revert it anyway
and say so -- that has happened four times in this project and all four reverts were right.

MEASURE BEFORE FIXING. It is a rule here, not advice. It earned its place three more times
in M15: the fixlist's own account of C2 was wrong and the probe caught it, the first D1 fix
looked perfect on the composition number and had destroyed the army, and a determinism check
passed while testing nothing at all.

Every new behaviour gets a negative control that goes RED when the feature is removed, and it
must produce a CLEAN red rather than a crash.

KNOWN REDS, none of which block:
  - test/soak.js fails one tier-1/2 coverage assertion (Swarm Host). Do not weaken it.
  - test/aistyles.js on seeds 1 and 11 fails four assertions -- no style attacks inside its
    12,000-frame window. Pre-existing. Seed 5, the one in the gate, is clean.
  - test/eightplayer.js is 19/19, but its money assertion passes by only 4% (2405 against a
    2500 threshold). It is the first thing any AI spending change will break -- the D1
    attempts pushed one bank from 796 to 5,019 minerals before they were reverted.
  - test/net_many.js fails 1 of 44 (the promoted host's mid-game setting). NOT IN THE GATE, and
    the ASSERTION is what is wrong -- the relay refuses every settings change once a game has
    started, by design. Verified identical at 57d61d2. Do not loosen the relay to make it pass.

Read the traps section of HANDOFF-M16.md before writing any probe, and the ones in M13, M14
and M15 too. Eight new ones this session, including that GameMap.blocked is an Int32Array
where -1 means FREE, and that a point ability cast by a BUILDING never reaches
Abilities.orderTick at all.
```

---

## Conventions that are not negotiable

Unchanged, and every one of them earned its place again:

- **Determinism.** Never `Math.random()` in sim code — use `G.rand()`.
- **`node test/all.js` is the gate.** Green means green.
- **Measure before fixing.** Three more of this milestone's entries were not what the report — or the
  fixlist — said they were, and all three were caught by a probe rather than by reading.
- **Every new behaviour gets a negative control**, and it must produce a clean red rather than a crash.
- **Read the constant, never the literal.**
- **Build stamp scope.** `js/build.js` hashes simulation files and `DATA`, and nothing else. A tuning
  table outside `DATA` is not stamped.
- **The balance run is gated.**
