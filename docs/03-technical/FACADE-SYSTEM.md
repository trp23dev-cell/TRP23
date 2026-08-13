# The façade system

**Built by:** WORLD-V02 · **Scope:** the six-tile High Street slice, gated by `TrapQuality` · **Code:** `Core/FacadeLayout.cs`, `World/Scripts/BuildingMeshBuilder.cs`

---

## 1 · The path a wall took before, exactly

| Step | Where |
|---|---|
| Footprint ring | `TilePayload.b[].p` — OSM, unchanged |
| Winding normalised anticlockwise | `BuildingMeshBuilder.NormalisedOrder` |
| **One quad per wall edge**, full length | `Extrude` → `Quad` |
| Ground floor split off as a second quad | `Extrude`, at `street + 3.2 m` |
| UV | `u = len / 6f`, `v = (y − baseY) / 3.2` |
| Texture | `CityTextures.Wall(style)` — 256², **two windows per tile** |
| Material | `WorldStreamer.Facade("wall:brick")`, ~20 for the city |

**The finding.** The texture tiled by **metres**, not by the wall. A 17 m wall got 2.83 tiles, so the last window was **sliced in half at the corner** — on almost every building in Lincoln. And nothing produced a vertical break anywhere, so a 40 m terrace was one uninterrupted plane with windows marching across it at a spacing unrelated to its own width.

**Which layer owns subdivision:** the mesh builder, not the texture. The texture already draws a good window; it cannot know how wide the wall is. Nothing was duplicated — `CityTextures` is unchanged in what it draws, and only the **UV mapping** moved.

---

## 2 · Bays

`FacadeLayout.Divide(length, id, edge, entranceBay)` — pure, in Core, no engine types, so `check:world` can prove it.

```
length < 6 m                    → one bay, no further thought
target = 4.0 + hash(id, 900+edge) × 1.5      → 4.0–5.5 m, varies per wall
count  = round(length / target)
while length/count > 6.0  count++            → no barn doors
while count > 1 && length/count < 3.5  count--   → no slivers
widths = even × (1 ± hash(id, 1300+…) × 0.14), then normalised to sum exactly
```

**Width first, then count, then the count pulled into range** — in that order, because the *count* has to be an integer and the *width* has to be plausible. The other way round leaves a 40 cm bay at one end of every building.

**Widths are normalised, not remainder-dumped.** Pushing the leftover into the last bay makes the last bay the odd one on every building in the city, which reads as a bug rather than as variety.

### The one change that does most of the work

**`u` now runs 0 → 1 across a bay**, so exactly one texture tile fits it. Windows land inside the bay by construction, at whatever spacing the bay is wide, and a corner is always wall rather than half a window. **Zero extra triangles for that part.**

---

## 3 · Visual subdivision is not cadastral truth

**A bay is not a property.** OSM knows a footprint; it does not know where one shop ends and the next begins, and nothing here can invent it. A terrace tagged as one polygon really is one polygon.

What the system gives it is the *rhythm* of separate properties, because a 40 m frontage with no vertical articulation reads as a warehouse whatever texture is on it. **Nothing downstream may treat a bay as a property, an address or an owner.**

---

## 4 · Determinism

Everything is chosen from `TrapHash.Unit(osmId, salt)` — a C# port of `hashUnit` in `scripts/lib/classify.mjs`, the function the tiler has always used to pick a building's tint *"so a building never changes on reload"*.

**The two are proved to agree.** `scripts/lib/hash.cases.json` holds 62 cases generated from the JS against real High Street ids; `check:world` runs them through the C#. Same discipline as the trap card, after that drifted between languages once already.

Salts are separated by purpose: `77` entrance, `900+edge` bay target, `1300+edge×32+i` width jitter, `2100+edge×32+q` bay tint.

---

## 5 · Ground floor

Where `b.g == "shopfront"` (278 buildings in the slice):

- **Glazing** per bay, from the existing shopfront texture, now one shopfront per bay instead of one every 6 m.
- **Fascia** — a real geometric band, 0.45 m tall, standing 0.10 m proud, at first-floor level. Two faces: front and soffit. The top is 10 cm deep at 3.2 m and is never seen from a pavement.
- **No lettering.** This is the board signage will eventually go on.

---

## 6 · Upper storeys

`FacadeLayout.UpperStoreys(height, groundHeight, 3.2)` divides the height the tiler already resolved — explicit `height` tag → LIDAR measurement → `building:levels × 3.2`. It is a division of the existing answer, **not a second guess at the building's size**.

Windows align to bays because the UV does; vertical rhythm is one texture tile per storey, as before. Checked: a single-storey shop gets no upper windows, and windows never run past the top of the wall.

---

## 7 · Entrances

One per building, on the **longest wall** — a terrace's front is longer than its returns. Never in a corner bay on a frontage of three or more. Recessed **0.16 m** with jambs and a head.

**Nothing here is interactive and nothing leads anywhere.** Doors are U07's, and this must not grow toward it.

---

## 8 · Geometry and cost

Everything merges into the existing per-material buffers. **No GameObject per window, no material per bay, no MonoBehaviour, no `Update`.**

| | Slice (6 tiles) | Whole city, if ungated |
|---|---|---|
| Wall triangles | **15,328 → 71,312 (×4.65)** | 176,492 → 692,828 (×3.93) |
| Bays | 7,550 | 86,051 |
| Pilasters / fascias / doorways | 3,896 / 3,464 / 528 | 42,859 / 11,516 / 6,947 |

Of the +55,984 in the slice: bays 30,912 · **pilasters 23,376** · fascias 13,856 · doorways 3,168.

**Materials: +1 `trim` for the whole city**, plus one `ground:entrance:<style>` per style — so about **+2 draw calls per articulated tile**, not per shopfront. Texture memory **+≈1.4 MB**.

**Pilasters are the expensive third.** If the budget ever bites, they are the first thing to drop to alternate boundaries.

---

## 9 · The gate

`TrapQuality.Facades(tile)` — the six slice tiles today, `FacadesEverywhere` to roll out. This is the audit's **ENHANCED** tier arriving as code, and it stays after V02: the High Street is meant to be richer than the ring road for ever, because detail is a budget and that is where the player is.

---

## 10 · Two things found on the way

**Every generated texture was upside down.** The drawing routines use image convention (row 0 at the top — which is what `fascia at 0.06, stallriser at 0.86` means); `SetPixels32` fills from the bottom row up. Nothing reconciled them, so shopfront fascias rendered at pavement level, stallrisers at first-floor level, and **window sills sat on top of their windows**. Fixed with one flip at the boundary in `Finish`, and the same flip *before* the Sobel in `Normal` — flipping a finished normal map would invert its green channel and light every wall from the wrong side, which looks almost right, which is worse.

**Shadowed walls were near-black, and it was the ambient equator term.** In Trilight ambient a vertical surface samples mostly the equator band, which at `ambient × 0.7` landed around 0.012 linear — a shadowed brick wall reflected about 0.002, and no amount of correct albedo survives that. Raised to `× 1.0`. **That is the only lighting number V02 changed**: lit walls are dominated by the sun and the ground samples the sky and ground terms, both untouched, so it lifts exactly what was failing and leaves the V01 baseline intact.

---

## 11 · Collision is untouched

The OSM footprint remains the only collision authority. Trim stands **0.10 m** proud of it and the recess goes **inward**, so decoration can never push the player into the road or block a pavement — the trade is that you can walk through 10 cm of fascia, which is deliberate. `check:world` confirms geometry is unchanged: **0/288,726 triangles wound wrong, 0/5,969 approaches breached.**
