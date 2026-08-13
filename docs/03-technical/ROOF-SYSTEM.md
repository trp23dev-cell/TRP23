# The roof system

**Built by:** WORLD-V03 · **General, not slice-specific** — gated by the same `TrapQuality` tier as façades · **Code:** `BuildingMeshBuilder.PitchedRoof` / `Eave` / `Chimney` / `Parapet`

---

## 1 · What was there

Six triangles: two slope quads and two gable triangles, from an oriented bounding box.

**Zero thickness. Zero overhang. Welded flush to the wall.** And the gable triangles went into the *roof* buffer — so **every gable end in Lincoln was rendered in slate**, a masonry wall wearing a roof texture.

That is a prism on a box, and no amount of texture fixes it, because what says "roof" from a street is the **edge**: the shadow line under an overhang, the depth of a fascia against the sky, and a chimney breaking the ridge.

---

## 2 · What it does now

| Element | Triangles | Why it earns them |
|---|---|---|
| **Eaves overhang + fascia + soffit** | 8/building | The single strongest silhouette cue. A vertical board catching sky over a horizontal one in permanent shadow — the dark line between them *is* a roof edge |
| **Roof thickness** (0.20 m) | — | Gives the fascia a face to be. Flush is the look this fixes |
| **Gable ends in wall material** | 2/building | One line moved. Masonry stops being slate |
| **Hips** | 8 vs 6 | Where the data supports it — see §3 |
| **Chimneys** | 20/building | On the **party walls**, where a terrace's flues actually run |
| **Parapets + coping** | 4/edge | Flat roofs on a high street are shops; what you see is the parapet against the sky |

**Eaves only, never the gable ends.** In a terrace the gable is a party wall shared with next door, and a verge overhang there pushes straight through the neighbour's roof — wrong architecturally *and* a z-fighting seam down every terrace in Lincoln. English terraces have flush verges for the same reason.

---

## 3 · Hips, and what the data actually supports

`rs` in the shipped tiles is **`gabled` or `flat` only** — `classify.mjs` folded hip, pyramid and mansard into `gabled`, so an explicit `roof:shape=hipped` never reached the client.

Two changes, in order of authority:

1. **`classify.mjs` now emits `"hipped"`**, so the next re-tile carries the real tag. Mansard stays gabled: its street silhouette is a steep pitch with a ridge, which is what the gable path draws.
2. **Until then, footprint aspect decides.** A near-square plan (aspect < 1.35) is hipped or pyramidal far more often than gabled; a long thin plan is almost never hipped.

The footprint is **real measured data**, not an invention — but it is a weaker signal than someone standing in the street and tagging the roof, so **an explicit tag outranks it** the moment one arrives.

---

## 4 · Chimneys

On the **gable ends**, because that is where the flues run — up the wall shared with next door. Two per terrace building; one near the ridge end on a hipped roof, where a detached house has it.

Skipped on `modern` and `monument` fabric, which does not have them, and on anything with a half-depth under 2.2 m — too small for a fireplace.

Heights are `0.85–1.55 m`, deterministic from `TrapHash.Unit(id, 4100/4200)`, so a terrace has the same chimneys every run and two neighbours do not accidentally match.

**No pots.** Eight more triangles each on something that is a silhouette blob at any distance you actually see a roofline from.

---

## 5 · What was deliberately not built

| | Cost | Why not |
|---|---|---|
| **Ridge caps** | 2/building | Invisible past ~20 m, and already implied by two slopes meeting |
| **Chimney pots** | 8+/stack | Silhouette blob at street distance |
| **Inner parapet faces** | 14/building | You cannot see into a flat roof from a pavement. **From Steep Hill looking down you could** — the one place this is knowingly wrong |
| **Dormers** | — | Hero tier, later |

All four are choices, not oversights.

---

## 6 · The budget, measured

`check:world` runs the **real mesh builder over the real shipped tiles**, twice — detail off and on — and counts what comes out. An arithmetic estimate of a geometry budget is a guess dressed as a number.

```
slice (528 buildings)     25,547 ->  87,965 tris  (x3.44)   50,331 -> 175,167 verts
city  (6,947 buildings)  288,726 -> 772,174 tris  (x2.67)
materials per build: 19 plain, 21 articulated
```

### Being ruthless, with evidence

The per-material breakdown made one answer obvious: **`trim` was 54.6 % of every triangle in the slice.** Two cuts followed, both of which are *also* the more correct architecture:

**Pilasters restricted to shopfronts, ground floor only.** They were on every frontage at full height — 23,376 triangles, a quarter of everything. A pilaster framing a bay is a **commercial** device: it holds up a Victorian shopfront and stops at the fascia. A brick terrace of houses is divided by its party walls and chimneys, not pilasters, and running them full height turns every corner shop into a bank. What separates the upper storeys is the per-bay tint, which costs nothing — continuous brick above, articulated shopfronts below, which is how a real terrace reads.

**Entrance materials collapsed from five to one.** `ground:entrance:<style>` bought five materials to vary a strip of surround that sits inside a 16 cm recess and is in shadow whenever it is visible at all.

Together: **96,569 → 87,965** in the slice, and city-wide **×3.38 → ×2.67**. Materials **25 → 21**.

`trim` is still 50 % and remains the first place to look if the budget ever bites.

---

## 7 · A stub was lying, and it took a sabotage to find it

The guard against a runaway chimney did not fire when a chimney was sabotaged to **40 metres tall**.

**`Vector3.up` in `tools/csharp-check/UnityStubs.cs` returned `default` — (0,0,0).** So every `Vector3.up` in the codebase evaluated to nothing under CI: chimneys had no height, parapets had no height, and the check meant to catch a runaway chimney was measuring a chimney lying flat on the roof.

Unity would have built them correctly. **CI was measuring geometry that did not exist.**

Same lesson as the assembly graph, one level down: **a stub that compiles is not a stub that behaves**, and a number measured through a wrong stub is worse than no number, because it reads as evidence.

Found only because the guard was tested by breaking it. A guard nobody sabotages is a guard nobody has checked.

**A second weak check went the same way.** Roof determinism compared *triangle counts* — and a chimney with a random height has exactly as many triangles as one with a deterministic height, so it passed while the roofs reshuffled every build. It now hashes every vertex position, quantised to a millimetre.

---

## 8 · Safety

Collision is still the OSM footprint and nothing else. Eaves stand **0.34 m** proud at roof height, where nothing walks; chimneys are above the ridge. `check:world` confirms **0/288,726 triangles wound against their normal** and **0/5,969 approaches breached**.

New assertions: nothing buried below the world, nothing rising implausibly above its own wall top (worst 6.75 m = 5.2 m ridge + 1.55 m stack, exactly as designed), and the tallest thing in the slice is still a building.
