# WP-U13 · Navigational map and route planning

| | |
|---|---|
| **Horizon** | 1 (late) or 2 |
| **Owner** | AI + design |
| **Effort** | **L–XL** — larger than it sounds, see §Why |
| **Status** | ⬜ **backlog — recorded, not authorised** |
| **Depends on** | WP-U03 (bootstrap), WP-026 (bundled map), WP-U07 (interaction) |
| **Raised by** | Kimani, 9 August 2026 |

> **Nothing here is authorised or started.** Recorded during the WP-U02 repair so the direction is not lost.

## Why this is bigger than a UI job

`TrapMinimap` today is an orthographic camera pointing down at geometry that already exists, rendered to a `RenderTexture`. That is a clever and cheap way to get a picture of the city, and for a minimap it is the right answer.

**It is the wrong foundation for navigation**, because a downward camera knows nothing. It cannot name a street, mark a shop, or tell you how to get anywhere — every pixel is just whatever mesh happened to be under it. Route planning needs a **graph**: nodes, edges, names, and what connects to what.

**The good news is we already have the source.** `scripts/build-map-tiles.mjs` reads the OSM ways that become roads and pavements — including their `name` tags — and throws most of that away once geometry is generated. The navigation graph is a **pipeline output we are not currently emitting**, not new data to find.

**That is the shape of the work:** extend the tiler to emit a routable graph alongside the geometry, then build a map UI on top of it. Roughly one-third pipeline, one-third routing, one-third interface.

## Required direction

From the owner, 9 August:

**Presentation** — more detailed map · named streets and roads where feasible · important locations and premises as markers · categorised points of interest · player position **and heading** · zoom and pan · world/map coordinate consistency.

**Navigation** — selectable destinations · route planning · **route geometry following the road and pavement network, not a straight bird's-eye line** · route distance · destination marker · walking first, architected so vehicle routing can follow.

**Interaction** — mobile and controller friendly. No hover-only affordances, and a pointer must not be required.

**Optional later** — discovered/undiscovered locations, if the design wants fog-of-war.

> **The route planner must derive routes from a navigable road/path graph. A straight line between two points is explicitly not acceptable** — in a city built on a hill, with a river and a one-way High Street, a straight line is often actively wrong.

## Likely shape

1. **Graph extraction** — the tiler emits nodes, edges, lengths, names and a pedestrian/vehicle flag per edge. Versioned alongside the tile format.
2. **Graph runtime** — load, index spatially, A\* or contraction hierarchies. Pure logic, so it belongs in **`TRP23.Core`** and can be tested in CI without a licence, the way `SlopeCost` is now.
3. **Map UI** — pan, zoom, markers, categories, selection. Gamepad and touch from the first screen.
4. **Route display** — polyline in the map and, optionally, in the world.

## Open questions

Pedestrian vs vehicle graphs — one edge set with flags, or two? · Where do premises markers come from — the premises system (WP-U08) or a separate content list? · Are street names shown as labels on the map, or only in the route description? · Does the route persist across sessions? · Does the map render live geometry or a pre-baked tile image? *(Live is what exists; baked is cheaper on mobile and is probably the answer at scale.)*

## Not included

Vehicles · public transport · turn-by-turn voice · traffic-aware routing · multiplayer player markers.

## Why not now

WP-U03 has not landed, so there is no composition root to own a routing service. WP-026 has not landed, so the map data source is still in flux. And building a route planner before there is anywhere worth routing *to* — premises, WP-U08 — would be solving the second problem first.
