# M11 — the spiritual successor

Chosen from a 25-idea brainstorm on 2026-09-09. Fifteen in, nine out, one deferred. This file is the
contract: what was picked, why, what it touches, and in what order. Anything not listed here is out of
scope, and "out" is a decision, not an oversight.

The three-word version: **attrition, position, consequence.** Every accepted idea pushes toward a game
where losses are permanent, where *where* a unit stands matters as much as what it is, and where the
map remembers what happened on it.

---

## In

| # | Idea | Touches | Risk |
|---|---|---|---|
| 25 | Supply cap 200 -> 500 | data | low |
| 24 | Cut the hard-counter matrix: roles, not counters | data, combat | **high** |
| 2 | Veterancy with scars -- ranks that stick, damage that does not fully heal | sim, render | medium |
| 6 | Directional armour -- rear and flank hits hurt more | sim, combat | medium |
| 7 | Suppression, as a per-unit unlock researched at the building that trains it | data, sim, ui | medium |
| 1 | Attrition economy -- finite minerals that visibly strip the ground | sim, render | medium |
| 9 | Terrain destruction -- craters and wreckage that block pathing and sight | sim, render | **high** |
| 5 | Fog that lies -- explored ground shows its last known state, not the truth | sim, render | medium |
| 11 | Readable weapon arcs and reload cadence | render, sim | low |
| 19 | Weather and day/night -- sight and air movement under real pressure | sim, render | medium |
| 15 | Diegetic UI, one per race, that takes damage and glitches | ui, hud | medium |
| 16 | Audio that changes when a fight starts and when it ends | audio | low |
| 17 | Unit flavour kept and pushed further -- more thematic, not less | data, audio | low |
| 14 | Morally weighted objectives, remembered quietly | missions | medium |
| 13 | **Deferred to last.** Campaign attrition: losing a facility closes that branch for good | missions | **high** |

## Out, and why

- **4 supply as morale** -- superseded by 25. A 500 cap and a morale system are two answers to one question.
- **8 siege ammunition** -- logistics without supply lines (18, also out) is a chore, not a decision.
- **10 routing** -- overlaps 2. Veterancy already makes a damaged unit a decision.
- **12 casualty ledger** -- 2 carries the attachment; a list of names is the weaker half.
- **18 supply lines** -- the biggest idea on the list and the biggest change to how a match is played.
  Out for now, and the one most worth revisiting.
- **20 asymmetric win conditions** -- would fork the balance work three ways before it has converged once.
- **21 persistent map between matches**, **22 commander abilities**, **23 cut worker micro** -- each a
  different game, not a better version of this one.

## Order, and the reason for it

Sequenced by blast radius, cheapest and most contained first, so each lands on a stable base.

1. **25** supply cap. One number.
2. **17** unit flavour. Data only, cannot break anything.
3. **16** combat audio state. Render-side, no stamp movement.
4. **11** weapon arcs and cadence. Mostly render.
5. **2** veterancy. New unit fields; snapshot picks them up automatically.
6. **6** directional armour. Combat maths, wants duel measurement.
7. **7** suppression tech. Data plus a research entry plus a status effect.
8. **5** fog that lies. Vision memory; the render half is the visible half.
9. **19** weather and day/night. A global clock that modulates sight and air speed.
10. **1** attrition economy. Resource depletion plus the visual scarring.
11. **9** terrain destruction. The hardest: pathing, vision and the chunk cache all move.
12. **15** diegetic per-race UI. Large but self-contained.
13. **24** cut hard counters. **Last of the mechanics**, because it invalidates every balance number
    and should land on top of everything else that also does.
14. **14** moral objectives, then **13** campaign attrition.

## Standing decisions

- **Balance measurement is suspended until 24 lands.** Ideas 25, 24, 2, 6, 7 and 1 each move balance on
  their own; measuring between them measures noise. One authoritative run at the end.
- **The eight invariants in HANDOFF.md still hold.** Determinism, sim/render separation and build-stamp
  scope are not negotiable for any of this.
- **Every sim change ships with a test.** M10 shipped a one-line build-script bug that cost Protoss its
  whole tech tree and was invisible to every existing check; test/aiscripts.js exists because of it.
