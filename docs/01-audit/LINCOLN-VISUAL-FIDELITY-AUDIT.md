# Lincoln visual fidelity audit

**Date:** 10 August 2026 · **Type:** read-only audit · **Nothing was implemented.**
**Scope:** why Lincoln reads as blocked-out geometry, what data we already have and are not using, and what to build.

**Method:** every number below comes from reading the pipeline and querying `server/storage/map-export.json.gz` — the 294-tile export the game actually serves. Nothing is estimated from memory. Unity was not run, so **no rendered image was inspected**; the visual claims are derived from the shader, the texture generator and the vertex data, and I say so where that matters.

---

# 0 · The headline

**The world is far better instrumented than it looks.** The tiler already classifies every building by material, period, listing, ground-floor use and roof shape; already extracts roads with surfaces, paved areas, walls, trees and street furniture; already pins story locations to real OSM buildings. Unity already generates procedural façade textures with window rows, shopfronts and brick courses.

**The reason it does not look like that is a two-line bug.**

Wall albedo is computed **twice** and the two are multiplied together. `CityTextures.Base("brick")` returns `(0.216, 0.173, 0.145)`. `BuildingMeshBuilder.WallColour` returns *the same constant* × the OSM tint, and the shader does `texture × _BaseColor × vertexColour`. So a typical brick building — tint `(255, 202, 200)`, mid-wall AO shade `0.72` — lands at:

```
0.216 × (0.216 × 1.00 × 0.72)  =  0.0336   red
0.173 × (0.173 × 0.79 × 0.72)  =  0.0170   green
0.145 × (0.145 × 0.78 × 0.72)  =  0.0118   blue
```

**≈ 3.4 % albedo.** Fresh asphalt is about 4 %. **Lincoln's brick currently renders darker than the road it stands on**, and at that level the window rows, courses and shopfronts drawn into the texture are mathematically present but below the threshold at which anyone can see them. The city reads as black boxes because the façades are being multiplied into the floor of the dynamic range.

The comment in `BuildingMeshBuilder.WallColour` says so, and is simply out of date:

> *"Unity has no such texture yet... Until the facades are ported, the base colours from `src/world/cityTextures.js` stand in for them"*

The façades **were** ported — `CityTextures.Wall` is wired up in `WorldStreamer.Facade`. The stand-in was never removed. **This is the single highest-impact, lowest-risk finding in the audit**, and it is why the first recommended package is a material baseline rather than new geometry.

---

# PART 1 · The pipeline, end to end

| Stage | File | What happens |
|---|---|---|
| **Source: geometry** | `scripts/build-map-tiles.mjs` | `api.openstreetmap.org/api/0.6/map?bbox=` — **the raw map API, not Overpass.** Returns *every* node/way/relation in the bbox **with all tags**. Chunked at 0.011° because OSM refuses >50,000 nodes |
| **Source: terrain** | `scripts/lib/terrainSource.mjs`, `geotiff.mjs`, `osgb.mjs` | Environment Agency LIDAR GeoTIFF, OSGB36 → local ENU |
| **Projection** | `src/world/geo.js` | Local ENU about `53.22940, -0.54079`. `TILE_SIZE = 250 m`. **z is negated so north is −z** |
| **Classification** | `scripts/lib/classify.mjs` | Per-building style / ground floor / roof / height / tint, from tags + period + listing + elevation |
| **Heights** | `build-map-tiles.mjs` | `height` tag → **LIDAR-measured** → `building:levels × 3.2` → type default × deterministic jitter |
| **Anchors** | `src/world/lincolnAnchors.json` | Story locations pinned **by OSM id**, with a lat/lon fallback and an automatic door-placement pass |
| **Tile format** | `TileModels.cs` | `b` buildings · `r` roads · `a` paved areas · `c` cover · `w` trees · `l` walls · `f` furniture · `t` terrain |
| **Transport** | `server/mockApiServer.js` → `MapClient.cs` | 294 tiles, **5.8 MB gzipped**, manifest + per-tile fetch |
| **Streaming** | `WorldStreamer.cs` | `loadRadius = 2` (5×5 tiles), unload at radius+1 to stop thrash |
| **Geometry** | `BuildingMeshBuilder.cs`, `SurfaceMeshBuilder.cs`, `TerrainMeshBuilder.cs` | Ear-clipped roofs, winding normalised, per-material buffers |
| **Materials** | `WorldStreamer.Facade` + `CityTextures.cs` | ~20 procedurally drawn textures, cached |
| **Shader** | `TrapVertexColour.shader` | URP PBR, `texture × _BaseColor × vertexColour`, ShadowCaster + DepthOnly |
| **Collision** | `WorldCollision.cs` | Footprint-based; CI-verified — **0/5969 approaches breach a wall** |
| **Atmosphere** | `WorldAtmosphere.cs` | Seven moods, dusk → daylight, one step per chapter |

**This pipeline is sound and must be preserved.** Everything below builds on it.

---

# PART 2 · OSM data inventory

Because the tiler uses the **raw map API**, every tag on every element in the bbox is already on disk during a build. Nothing in category D is unavailable for technical reasons — only for coverage reasons.

Coverage figures are the tiler's own measurements across the 2,004 city-centre buildings, plus my queries against the shipped export.

## A · Read and used

`building` (100%) · `building:levels` (9%) · `height` (6%) · `roof:shape` · `roof:levels` · `building:material` (0.5%) · `building:colour` (0.4%) · `colour` · `name` (24%) · `shop` · `amenity` (with shop, 17%) · `office` · `tourism` · `historic` (2%) · `listed_status` (4%) · `start_date` (4%) · `castle_type` · `barrier` · `man_made` · `natural` · `area` · `building:part` · `highway` · `surface` · `lanes` (→ width) · `width` · `bridge`

## B · Read but discarded before Unity sees it

| Tag | Where it dies | Cost |
|---|---|---|
| **Road `name`** | Roads ship as `{p,e,w,k,s,br}` — no name field | **No street names.** Blocks signage, and blocks the Phone saying where you are |
| **`lanes`** | Collapsed into a single width number | Cannot draw lane markings — the count is gone by Unity |
| **`oneway`** | Not carried | No directional markings |
| Full `tags` on buildings | Kept in the tiler's intermediate object, dropped at serialisation | Any new façade rule needs a re-tile, not just a client change |

## C · In the source, never extracted

**Buildings:** `min_height` (floating upper storeys — matters for Stonebow's arch) · `roof:height` · `roof:material` · `roof:colour` · `building:part` beyond exclusion.

**Roads:** `sidewalk=left/right/both` · `crossing=zebra/traffic_signals` · `lit` · `maxspeed` · `footway=sidewalk/crossing` · `kerb` · `tactile_paving`.

**Environment:** `natural=tree` individually · `natural=tree_row` · `barrier=fence/railing` (only `wall`/`hedge` today) · `amenity=bicycle_parking` · `highway=traffic_signals` · `highway=street_lamp` · `man_made=utility_pole` · `amenity=parking` · `waterway=*` as a line · `leisure=*`.

## D · Genuinely unavailable

Nothing structurally. But **coverage is the real constraint, and it is severe for exactly the things that dress a street.** Measured in the 6-tile High Street slice:

| | Count |
|---|---|
| **Street lamps** | **2** |
| Benches | 29 |
| Bins | 29 |
| Bus stops | 28 |
| Bollards | 15 |
| Postboxes | 6 |
| Trees | 64 |

**Two lamp posts across 750 × 750 m of city centre.** OSM does not systematically map street lighting in Lincoln. Any plan that assumes lamps come from data will produce an unlit High Street. **Lamps must be procedural** — placed by rule along carriageway edges. This is the clearest data-coverage conclusion in the audit and it changes the design of Part 7.

---

# PART 3 · Building visual audit

## How a building becomes visible today

Footprint ring → winding normalised anticlockwise (OSM disagrees with itself: **217 clockwise, 300 anticlockwise** in Lincoln) → per-edge quads from `s` (highest ground beneath, so shopfronts are not buried on a slope) to `s+h` → ground floor split off as its own quad and its own material → roof by oriented bounding box: **pitched if fill > 0.78 and min side > 3.5 m, otherwise ear-clipped flat**.

Special massings bypass extrusion entirely: `gateway`, `cathedral`, `castle`. That is why Stonebow is an arch and not a block.

## Weaknesses, ranked by impact

| # | Weakness | Impact | Cost |
|---|---|---|---|
| **1** | **Double-darkened albedo** — texture × the same constant again | **Critical.** Everything below is invisible until this is fixed | **XS** |
| **2** | **No tonemapping** — `Tonemapping.mode = 0 (None)` with HDR on | High. Sky clips, mid-tones sit flat | XS |
| **3** | **Vertex-normal shading only** — `normalTS = (0,0,1)`, no normal map | High. Brick and stone have no relief at any distance | S |
| **4** | **One texture per style** — every brick building is *the same* brick | High. A terrace reads as one extruded object | S |
| **5** | **No façade subdivision** — a 40 m frontage is one quad | High. No bay rhythm, no party walls between shops | M |
| **6** | UV `vSpan` is per-storey, but **windows do not align to real storeys** | Medium | S |
| **7** | **No sills, lintels, cornices, string courses** — zero surface relief | Medium | M |
| **8** | Flat roofs get planar UVs at `/8f`; **pitched roofs are untextured geometry** | Medium | S |
| **9** | **Vertex AO only** (`bottomShade` 0.35–0.72) — no contact darkening | Medium | S |
| **10** | Ground floor is one flat texture — no fascia, no stall riser depth, **no signage** | Medium | M |

**Why buildings read as blocks, in one sentence:** they are the correct shape and the correct height with a correct texture that has been multiplied down to near-black, no relief, and no repetition-breaking — so the eye gets silhouette and nothing else.

---

# PART 4 · Roofs

**Today:** two outcomes. `PitchedRoof` from an oriented bounding box, or `FlatRoof` ear-clipped. In the slice: **413 gabled, 115 flat.** The gate on pitching (`fill > 0.78`, `min(w,d) > 3.5`) is sensible — it refuses to put a ridge on an L-shaped footprint where it would spill outside the walls.

**What is missing** is everything between "a ridge exists" and "that is a Lincoln roofline":

| | Today | Proposed |
|---|---|---|
| Gable ends | Implicit in the OBB | Explicit gable wall, brick/stone, matching the wall material |
| Hips | Treated as gabled | Real hip when `roof:shape` says so |
| Eaves overhang | None | 300–450 mm, with a fascia — **this is what stops a roof looking welded on** |
| Roof pitch | Fixed | From `roof:height`/`roof:levels` where tagged, 40–45° default |
| Material | `slate` uphill / `pantile` downhill by style | Keep — it is a real geographic split |
| Chimneys | None | **Procedural, on party walls of pitched residential** — Lincoln's downhill terraces are defined by chimney stacks |
| Dormers | None | Hero tier only |

**Procedural city roof vs hero roof.** Procedural: OBB ridge + eaves + gable end + chimney rule + two materials. That covers 528 buildings in the slice with no authoring. Hero: the Cathedral, the Castle, Stonebow, the Guildhall — these already have bespoke massing functions and should get bespoke *models* later, not better procedural roofs.

**Do not hand-model roofs.** The chimney rule alone will change the skyline more than any single authored building.

---

# PART 5 · Procedural façade strategy

*(Design only. Not implemented.)*

The classifier already emits everything this needs: `st` (style), `g` (ground floor), `h`, and a deterministic per-building tint from the OSM id.

## The system

**1 · Bay subdivision.** Split each wall edge into bays of 3.5–6 m, chosen so bays divide evenly into the edge length. This is the missing primitive — it turns one 40 m quad into eight shop-width bays and gives every later rule something to attach to.

**2 · Storey banding.** `floor(h / 3.2)` storeys; ground floor already split. Window rows land on real storey lines instead of a repeating UV.

**3 · Module selection**, deterministic from `hash(osm_id, bay_index)`:

| Ground floor | Modules |
|---|---|
| `shopfront` (278 in slice) | glazing + stall riser + fascia + recessed door |
| `residential` (247) | door + window, or window only |
| `blank` (3) | plain wall |

Upper storeys: sash / casement / blind bay, weighted by style.

**4 · Material families** — five, not five hundred: `brick`, `limestone`, `render`, `modern`, `monument`. Atlased into **one** texture page per family so a whole tile of walls is one draw call.

**5 · Trim** as a thin extruded band — sill, lintel, cornice at the parapet. Geometry, not texture, because it must catch light.

**6 · Determinism.** `hashUnit(id, salt)` already exists in `classify.mjs` and is the correct pattern: same building, same façade, every run, on every device, with no stored state.

**Constraints it must respect:** reproducible · mobile-conscious (atlas + instancing, no per-building material) · streaming-compatible (built per tile on load, as now) · **overrideable** — a hero building skips the whole system.

**Estimated cost:** bays and storey banding are S. Modules and trim are M–L. This is the largest single item in the roadmap and should not be attempted before the material baseline is fixed, because it would be invisible.

---

# PART 6 · Roads and pavements

**Already built, and better than expected.** `SurfaceMeshBuilder` draws road ribbons with **per-vertex elevation** (so carriageways follow the hill rather than cutting a shelf), **125 mm kerb upstands** — a real British kerb height — footways on both sides, and **paved areas as filled polygons** rather than ribbons. That last one matters: 276 Lincoln ways are `area=yes`, the High Street among them, and tracing them as centre lines turns the main shopping street into a footpath following its own kerb.

Slice data: **535 road segments** — 224 footway, 148 service, 53 pedestrian, 30 secondary, **29 steps**, 9 cycleway. Surfaces: 273 asphalt, 240 paving, 19 concrete, **3 cobble**.

## Gaps

| Gap | Data-driven? | Note |
|---|---|---|
| **Road markings** | Partly | Centre lines yes, from the ribbon. Lane lines **no** — `lanes` is collapsed into width before Unity |
| **Crossings** | **Yes** | `highway=crossing` + `crossing=zebra` exist in source, never extracted |
| **Steps** | **Yes — 29 in the slice** | Drawn as flat ribbons today. **Steep Hill is steps.** Real treads and risers would be a large visible win |
| **Cobbles/setts** | Partly | Only 3 tagged. Steep Hill and Bailgate are setts in reality — this needs an **authored override by street name**, and street names are currently discarded (Part 2B) |
| **Drains, gullies, manholes** | No | Procedural along kerb lines |
| **Surface variation** | No | Currently one flat colour per surface kind |
| **Footway hierarchy** | Yes | `footway=sidewalk` vs `crossing` not extracted |

**Biggest single street-level win: real steps.** Twenty-nine step runs in the slice, drawn flat, in a city whose most famous street is a staircase.

---

# PART 7 · Street furniture

**Already shipping:** 109 furniture items and 64 trees in the slice; 612 and 348 across the city. `SurfaceMeshBuilder.Furniture` draws them.

## Classification

**DATA-DRIVEN** — good OSM coverage, extract and place:
benches (29) · bins (29) · bus stops (28) · bollards (15) · postboxes (6) · trees (64) · walls and hedges (229 in slice) · **bicycle parking, traffic signals, fences/railings** *(present in source, not yet extracted)*.

**PROCEDURAL** — rule-placed, because the data is not there:
**Street lamps** — only 2 tagged in the entire slice; place along carriageway edges at ~25 m, skipping pedestrianised areas · **drain gullies** along kerb runs · **utility boxes** at junction corners, sparse · **planters** in pedestrian zones · **wall-mounted signage** on `shopfront` bays.

**AUTHORED** — hero areas only:
Shopfront signage for the ~252 named buildings · the Stonebow arch dressing · market stalls on Cornhill · Trap Made It flagship frontage · anything the player is meant to remember.

**The discipline:** density tiers, not uniform scatter. HERO gets everything; STANDARD gets lamps and bins only; BACKGROUND gets nothing. A city evenly covered in bollards looks like an asset test.

---

# PART 8 · Hero building override

**A working precedent already exists** and should be generalised rather than replaced.

`src/world/lincolnAnchors.json` pins story locations to buildings **by OSM element id, never by name** — with a recorded reason:

> *"OSM already has Kimani's shop tagged under a previous occupant ('Mankind'), and an upstream rename must not be able to break mission one."*

That is exactly the right instinct, and it already carries a lat/lon fallback, an automatic door-placement pass that finds a wall opening onto clear ground, and a **hard failure if any anchor cannot be resolved** — the tiler refuses to publish a map missing a story location.

## Proposed: `lincolnHeroes.json`, same shape, different payload

```jsonc
{ "osm": "way/279984462",     // Stone Bow — pinned by id, as anchors are
  "lat": 53.2277, "lon": -0.5396,   // fallback if the id is deleted upstream
  "model": "Heroes/StoneBow",       // authored prefab, or null = procedural
  "yaw": "from-footprint",          // orient from the OSM ring, never hand-typed
  "suppress": "walls+roof",         // what the procedural builder must skip
  "collision": "keep-footprint" }   // gameplay must not change with the art
```

**Preserved by construction:** the OSM anchor (id, with fallback) · world coordinates (footprint centroid + ring orientation) · **collision** — the footprint collider stays authoritative, so the CI wall test keeps passing whatever the art does · map location · gameplay references, which key off `buildingId` and never off the mesh.

**Candidates already in the data, with real ids:**

| | OSM id | Tile |
|---|---|---|
| **Stone Bow** | `way/279984462` | `0,0` |
| **Guildhall** | `way/399631224` | `0,0` |
| Lincoln Cathedral | in manifest landmarks | `1,-3` |
| Newport Arch | `way/395862180` | `0,-4` |
| Westgate Water Tower | in manifest landmarks | — |
| St Mary's Guildhall | `way/610240193` | `-1,3` |

**Do not hand-model anything in this pass.** The mechanism is the deliverable; the models are Part 15's art column.

---

# PART 9 · The High Street slice

Computed from the shipped export, not chosen by eye.

## Bounds

**Six tiles: `(-1,-1) (0,-1) (-1,0) (0,0) (-1,1) (0,1)`**
World-space **x ∈ [−250, +250], z ∈ [−250, +500]** — 500 m east–west × 750 m north–south.
Real-world: **Stonebow at the centre, High Street running south, the foot of Steep Hill just off the north edge.**

## Why these six

All three existing story anchors fall inside them, on almost exactly the same line:

| Anchor | World x, z | Tile |
|---|---|---|
| **TRAP CENTRAL BANK** | `-0.2, 0.0` | `-1,0` |
| **KIMANI THE BARBER** | `-1.8, -129.0` | `-1,-1` |
| **JD** (chapter 0) | `2.9, 165.4` | `0,0` |

## What is in it

| | |
|---|---|
| Buildings | **528** — of which **252 are named** |
| Ground floors | **278 shopfront**, 247 residential, 3 blank |
| Styles | 393 brick · 108 render · 10 limestone · 10 modern · 7 monument |
| Roofs | 413 gabled · 115 flat |
| Roads | 535 segments · **29 step runs** |
| Paved areas | 135 · walls 229 · trees 64 · furniture 109 |

## Named buildings nearest Stonebow — real ids

`Market Hall way/241765479` (22 m, limestone) · `Mountain Warehouse way/241765564` · `Goddards way/201886756` · `Cornhill Market way/214291759` · `Santander way/241760962` · `WHSmith way/620328712` · `Lloyds Bank way/705942980` · `River Island way/705942982` · **`Toby's Barber Shop way/705942979`**

## Two things the owner must decide

**1 · The Trap Made It flagship has no anchor.** `lincolnAnchors.json` has JD, the Bank, the Barber and the Prison. There is no flagship. **I must not invent one** — same rule as D-W20. Pick a real building on this stretch and I will pin it by OSM id.

**2 · `way/705942979` on the High Street is tagged `Toby's Barber Shop`.** Kimani's anchor is currently on Corporation Street (`way/723251372`). Whether the in-game barber should sit on the High Street where the player walks, or stay at the real address, is a product decision with a real trade-off — authenticity against footfall — and it is not mine.

### Selection method, if you want to choose in Unity

Fly to world origin `(0, 0)` — that is the Bank anchor, at Stonebow. Walk south along −x/+z for High Street, north for Steep Hill. The tile under you is `floor(x/250), floor(z/250)`. Read a building's OSM id off the GameObject name in the hierarchy and send me the `way/…`.

---

# PART 10 · Lighting and atmosphere

## Today

`WorldAtmosphere.cs` drives seven moods, dusk → daylight, one per chapter cleared — sky colour, exponential-squared fog, sun intensity, ambient. Fog matches sky (they must, or the horizon splits). `TrapWorldSetup` creates a directional sun with soft shadows and pushes **shadow distance to 220 m** with 3 cascades, over Unity's default 50 m — a deliberate fix, because at 50 m the building across the street casts nothing.

URP: PC 2048 shadowmap / 220 m / soft / MSAA 1× / HDR on. Mobile 50 m / render scale 0.8 / soft shadows off.

## Findings

| # | Finding | Fix |
|---|---|---|
| **1** | **Tonemapping is `None`** with HDR on | Set **Neutral**. One field. Immediate improvement to every shot |
| **2** | The volume profile is **Unity's stock template**, still carrying `CopyPasteTestComponent2`, `TestAnimationCurveVolumeComponent` | Author a TRP profile; delete the test components |
| **3** | Scene lighting has **`m_Sun: 0`** and the default procedural skybox | Assign the sun; a gradient sky matched to `WorldAtmosphere` |
| **4** | **No SSAO** | URP renderer feature, PC/high tier only. Contact shadows are most of what makes a street look inhabited |
| **5** | **MSAA 1×** on PC | 4× — this is a city of hard vertical edges, which is the worst case for aliasing |
| **6** | Moods are chapter-driven only | D-W02 makes time **server-authoritative** and weather **server-directed**; the mood table becomes a target the server selects |

## The five moods to support

Overcast morning · wet afternoon · dusk · night High Street · foggy uphill. All five are reachable with **sky colour + fog density + sun angle/intensity/colour + ambient**, which the existing `Mood` struct already carries. Wet needs one addition — a smoothness multiplier on ground materials — and nothing else.

**No expensive desktop-only baseline.** SSAO and MSAA 4× are PC-tier. Mobile keeps 50 m shadows, render scale 0.8, no SSAO, and still gets tonemapping and the corrected albedo, which is where most of the win is.

---

# PART 11 · Material system

**Today:** ~20 procedurally drawn textures, cached, one material per key. Walls split by style; ground floors by kind × style; roofs slate/pantile; 16 flat-colour palette entries for surfaces, cover, walls, trees, furniture.

The generate-don't-import decision is **correct and should be kept**. Its reasoning is in `CityTextures.cs` and it is sound: the geometry tiles at exactly 6 m across and one storey up, so a generated texture lines up floor-for-floor along a terrace, which a bought 4K brick photo cannot do because it does not know where the storeys are. No licence to check, nothing to keep out of a public repo, ~1 MB of memory for the lot.

## Proposed library — families, not thousands

| Family | Members | Source |
|---|---|---|
| **Brick** | Lincolnshire red, dark red, painted | Generated + **normal map** |
| **Stone** | Limestone ashlar, coursed rubble, weathered monument | Generated + normal |
| **Render** | Painted, pebbledash | Generated |
| **Modern** | Panel, curtain glass | Generated |
| **Roof** | Slate, clay pantile | Generated + normal |
| **Ground** | Asphalt, paving flag, sett, concrete, gravel | Generated at **real size** — a flag is 600 mm because a flag is 600 mm |
| **Detail** | Glass, painted metal, timber | Generated |

**The one addition that matters most: normal maps.** The generator already draws brick courses and stone joints as colour. Emitting the same pattern as a height field and converting to a tangent-space normal is cheap, needs no new art, and is the difference between a photograph of a wall and a wall.

**Batching:** atlas each family into one page so a tile of walls is one draw call per family instead of one per style. Enable GPU instancing on the shared materials. Texture tiers: 512 mobile / 1024 desktop, generated at load, so there is no download cost either way.

---

# PART 12 · Landmark and reference data — what is lawful

| Approach | Verdict |
|---|---|
| **Our own photographs** of Lincoln | ✅ **Best.** We own them outright. Reference *and* texture source |
| **Team-supplied photographs** | ✅ With a written assignment on file — same clause as the body brief §12 |
| **Open-licensed imagery** (CC0/CC-BY, Wikimedia) | ⚠️ Per-image. CC-BY needs attribution *in the shipped game*, which is a build requirement, not a footnote |
| **Open municipal data** (OS Open, EA LIDAR) | ✅ Already doing this. OGL v3 — attribution required and already recorded |
| **Manual Blender modelling** from our own photos | ✅ Cleanest for hero buildings |
| **Photogrammetry from imagery we own** | ✅ Lawful. ⚠️ Expensive, and output needs heavy retopology to hit a mobile budget |
| **AI-assisted texture generation** | ⚠️ **Provenance cannot be stated.** Acceptable for *reference*, not for shipped assets, on exactly the D-C01 grounds |
| **Procedural recreation** from public dimensions | ✅ Already doing this — the Cathedral's 83 m tower is a matter of public record |

## Do NOT use

**Google Street View / Maps / Earth imagery** — terms of service forbid deriving assets, including tracing. Named because it is the obvious thing to reach for.
**Bing Streetside**, likewise. **Photographs from the internet without a licence.** **Asset-store models of real landmarks** — the seller usually cannot grant what they are selling. **Scans of a real person.** **Anything whose licence we have not read and filed.**

**Nothing was downloaded, viewed or imported during this audit.**

---

# PART 13 · Performance strategy

| Technique | Today | Proposed |
|---|---|---|
| **Mesh combining** | ✅ Per material per tile | Keep. It is why a tile is a handful of draw calls, not 500 |
| **Instancing** | ❌ None | Furniture, lamps, trees, chimneys — `Graphics.DrawMeshInstanced` |
| **Material count** | ~20 | Atlas to ~7 families |
| **LODs** | ❌ **None anywhere** | LOD1 drops façade trim; LOD2 is the extruded box, which is what we have today — **the current world is already the LOD2 target** |
| **Occlusion** | ❌ None | Not culling-baked (streamed); rely on distance tiers |
| **Streaming** | ✅ radius 2, unload at 3 | Keep; consider radius 3 on PC |
| **Shadow distance** | 220 PC / 50 mobile | Keep |
| **Façade detail distance** | n/a | Trim geometry only within ~60 m |
| **Prop density** | Uniform | **Tiered** — see Part 14 |
| **Texture resolution** | Single tier | 512 mobile / 1024 desktop |

**The High Street may be richer than everywhere else, and should be.** Detail is a budget spent where the player is, and the tier system is how that is expressed rather than a per-street exception.

---

# PART 14 · Quality tiers

| Tier | Where | Buildings | Roads | Props | Materials |
|---|---|---|---|---|---|
| **HERO** | Stonebow, Cathedral, Castle, flagship, Bank, barber | Authored model, override system | Real steps, setts, markings, crossings | Full authored dressing + signage | Unique + atlas |
| **ENHANCED** | The 6-tile slice | Procedural + bays + trim + chimneys | Kerbs, markings, crossings, real steps | Lamps, bins, benches, bollards, trees | Family atlas + normals |
| **STANDARD** | Rest of the city centre | Procedural façade, roof, chimneys | Kerbs + surfaces | Lamps and bins only | Family atlas + normals |
| **BACKGROUND** | Beyond ~400 m | Extruded box + roof + flat texture | Ribbon + surface colour | None | One atlas, no normals |

**BACKGROUND is what exists today.** That framing matters: the current world is not broken, it is the far-distance tier being drawn at arm's length.

---

# PART 15 · What I can build vs what needs art

## CODE — I can implement, no assets needed

Albedo fix · tonemapping and volume profile · **normal-map generation from the existing texture generator** · bay subdivision · storey banding · window/door modules · trim geometry · roof eaves, gable ends, hips, **chimney rule** · material atlasing · GPU instancing · LOD generation · **street-lamp procedural placement** · crossing and marking extraction · **real step geometry** · sidewalk/crossing/railing/bicycle-parking tag extraction · road name extraction · hero override infrastructure · quality-tier system · prop density tiers · an editor tool to pick a building and print its OSM id.

## ART — needs assets or an owner/art workflow

Stonebow, Cathedral, Castle, Guildhall models · Trap Made It flagship frontage and interior · Bank frontage · barber frontage · **shopfront signage artwork** — the single biggest authored win, because 252 named buildings on the slice currently have no name on them · photographic reference for Lincoln brick and limestone · bespoke market stalls.

## HYBRID — I build the tool, art supplies the content

**Signage system**: I build atlas-driven fascia rendering keyed off the existing `name` tag; art supplies the lettering style. **Hero override**: I build the mechanism; art supplies models. **Material families**: I generate the base; art supplies photographic reference to tune it against. **Interiors**: I build the door/anchor/transition system — the door placement already exists; art supplies the rooms.

---

# The recommended first package

**WORLD-V01 — Material and lighting baseline. Size XS–S.**

Fix the double-multiply. Set tonemapping to Neutral. Author a TRP volume profile and delete the stock test components. Assign the scene sun. MSAA 4× on PC. Add normal-map generation to `CityTextures`.

**Why this one:**

- **Safely reversible** — it changes constants, a render setting and one generator function. No geometry, no pipeline, no data.
- **Does not touch the world pipeline** — OSM, LIDAR, tiles, coordinates and collision are untouched. The CI wall test cannot be affected.
- **Meaningfully visible** — it takes the city from ~3.4 % albedo to correct exposure, which reveals window rows, brick courses and shopfronts **that are already being drawn and cannot currently be seen**.
- **Not disposable polish** — every later package is invisible until this is right. Façade work judged against a black city would be tuned wrong and re-tuned later.
- **Owner-testable in Unity** in about two minutes: press play, look at a wall.

The full sequence is in [VISUAL-ROADMAP](../04-plan/VISUAL-ROADMAP.md). **Nothing has been implemented.**
