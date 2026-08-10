# U13 — Map & navigation requirements

**Status:** recorded, **not implemented.** Raised from owner verification of WP-U15a, 10 August 2026.
**Owner of this scope:** the Map/navigation package (U13 / U13a). Nothing here is authorised.

---

## 1 · Zoom and pan must be bounded by the world

**Reported:** the big map zooms out well past the edge of the map that exists, so the player ends up looking at a small Lincoln in the middle of a large nothing.

**Cause:** the zoom cap was a hardcoded `2400 m` of orthographic size — a **4.8 km** view. Lincoln is 294 tiles at 250 m, which is not 4.8 km across. The number was chosen before anything knew how big the world was.

**Fixed in the U15a repair pass**, because the clamp turned out to be genuinely trivial and isolated — three small pieces and no behavioural surface beyond the cap:

- `MapClient.WorldExtent` — the bounding box of the tiles the server says it has, computed once when the manifest lands. Tile `(x,z)` covers `[x·250, (x+1)·250)`, so the far edge is `max+1`; getting that wrong loses a tile off two sides.
- `WorldStreamer.WorldExtent` — passes it through. Narrow on purpose: the map needs one fact, not the network layer.
- `TrapMinimap.MaxBigMapMetres()` — half the larger side, plus 8% so the edge is not flush against the screen. The old 2400 survives **only** as the fallback for the moment before the manifest lands, when nothing yet knows how big the world is.

### Still outstanding — belongs to U13

**Panning is not clamped, because the big map cannot be panned.** It is centred on the player. The moment U13 adds panning it must clamp against **the same `WorldExtent`**, or the identical bug returns on the other axis — and this time in a form where the player can lose the city off the side of the screen entirely.

**Minimum zoom** is still the hardcoded 120 m. It is a defensible floor, but it is not derived from anything. U13 should decide it from what is legible at the smallest supported screen, not from what looked right on a desktop.

---

## 2 · Waypoints must produce a route, not just a marker

**Reported:** placing a waypoint works, but it only drops a destination marker. There is no route.

This is the honest state of it: the current feature is *"remember where I pointed"*, not navigation. A straight line to a marker in a real street layout is close to useless — Lincoln has a river, a railway and a steep hill, and the direct line crosses all three.

### Required of U13

| | |
|---|---|
| **Route calculation** | Over a **road / pavement / path graph**, not open ground |
| **Drawn on the map** | Visibly, following actual streets |
| **Destination marker** | Kept — it already works |
| **Distance** | Along the route, not as the crow flies |
| **Modes** | Walking first; vehicle routing later |
| **In-world guidance** | See below |

### In-world guidance — candidates, not decisions

Highlighted route line · road/path breadcrumb · subtle directional cue · junction and turn cues.

**Not chosen here.** These are presentation decisions with a real cost to the feel of the street, and D-W17 applies: a written session before the scope is authorised.

### The dependency nobody has costed yet

**A routable graph does not currently exist.** The map pipeline builds meshes from OpenStreetMap ways; it does not extract a connected, traversable network with junction topology. The data is in OSM — `highway=*`, `footway`, `crossing` — but turning 294 tiles of it into a graph that can be queried at runtime on a phone is the substantial part of U13, and it is **larger than the drawing work it enables**.

U13 should be sized against the graph, not against the line on the map.

---

## 3 · What U15a did *not* deliver

Recorded explicitly because the owner asked, and because it would be easy to read a working Phone as more progress than it is.

**These are not built and are not started:**

- **TRP Central Bank** — no physical building, no interior, no in-world banking
- **Trap Made It flagship** — no physical store, no interior
- **The barber** — no physical shop, no interior, no service interaction
- **The starter home** — no building chosen (**D-W20** is still open, and the AI must not invent one)

The Phone **shows** a bank balance. That is the doctrine working as intended — *the Phone tells you, the world is where you do it* — and it is emphatically **not** the bank existing.

**The current Bank panel is legacy.** It is a HUD panel inherited from the web build, and it is intended to be **retired** once TRP Central Bank exists as a physical location with in-world banking. It is **not** being removed now — no package has authorised that, and removing the only route to a balance before its replacement exists would be a regression dressed as tidying up.
