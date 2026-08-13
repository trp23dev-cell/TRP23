# Visual roadmap — Lincoln

**Status:** V01 and V02 built + owner-verified. **V03 built 10 Aug.** V04–V07 proposed, **not authorised**.
**Evidence:** [LINCOLN-VISUAL-FIDELITY-AUDIT](../01-audit/LINCOLN-VISUAL-FIDELITY-AUDIT.md)
**Standing constraints:** do not rewrite the world · do not replace the data pipeline · do not rescale Lincoln · do not import asset packs · beautify the slice, not the city.

---

## The ordering principle

**Everything is invisible until the albedo is right.** At ~3.4 % the façade textures, the window rows and the brick courses are all being drawn and none of them can be seen. So V01 comes first not because it is small but because **every other package would be judged against a black city and tuned wrong.**

After that, the order follows *visible change per unit of risk*: roofs change the skyline from across the river, the street is what you stand on, façades are the biggest and slowest, and authored art comes last because it depends on a mechanism that does not exist yet.

```
V01 material + lighting baseline   ← recommended first
     ├── V02 roof upgrade
     ├── V03 street surface upgrade
     │        └── V05 dressing + lamps
     └── V04 façade prototype  (largest)
V06 hero override system  (independent of V02–V05)
     └── V07 first authored landmark   ← needs art
```

---

## WORLD-V01 · Material and lighting baseline **[XS–S]** — ✅ **BUILT, 10 Aug** (owner screenshots pending)

**Objective.** Make the city render at the brightness it was drawn at, and give it a tonemap.

**Prerequisites.** None.

**Files.** `BuildingMeshBuilder.WallColour` · `CityTextures.cs` (add normal generation) · `WorldStreamer.Facade` · `Settings/DefaultVolumeProfile.asset` → new TRP profile · `PC_RPAsset.asset` (MSAA) · `Scenes/TrapGame.unity` (assign sun) · `TrapVertexColour.shader` (sample `_BumpMap`).

**The work.**
1. **Stop double-multiplying.** Vertex colour becomes the *tint only* — the per-building variation from the OSM id — not the material colour again. The material colour stays where it belongs: in the texture.
2. Tonemapping `None` → **Neutral**.
3. Author a TRP volume profile; **delete `CopyPasteTestComponent2`, `TestAnimationCurveVolumeComponent`, `CopyPasteTestComponent3`** — Unity template leftovers currently shipping in our profile.
4. Assign the scene sun (`m_Sun: 0` today).
5. MSAA 4× on PC. Mobile unchanged.
6. **Generate normal maps** from the patterns `CityTextures` already draws — the brick and stone joints exist as colour; emit them as height and convert.

**Non-goals.** No new geometry. No new OSM extraction. No asset imports. No mobile-tier changes beyond what falls out for free.

**Automated checks.** `check:csharp` · `check:world` (geometry unchanged: **288,726 triangles and 5,969 approaches, identical before and after**) · new **`check:materials`**, which turned out to be the better home for the albedo floor — see [MATERIAL-COLOUR-CONTRACT](../03-technical/MATERIAL-COLOUR-CONTRACT.md).

**What actually shipped differed in two places.** The volume profile is built in code rather than authored as an asset — hand-writing a `VolumeProfile` YAML with URP GUID references, with no Unity to validate it, risks a file that diffs cleanly and fails to load. And the scene sun is assigned by `WorldAtmosphere` at runtime rather than by editing `TrapGame.unity`, for the same reason: code beats hand-edited scene YAML when nothing can open the scene to check.

**Owner verification.** Play `TrapGame`. Stand in front of a brick building — **window rows and courses should now be visible where before there was a dark shape.** Look up a street: distance should read as fog, not as black. Check limestone uphill and brick downhill are distinguishable.

**Before → after.** Near-black boxes → a lit city with visible façade texture. **The largest single visual change available anywhere in this roadmap, from the smallest change.**

---

## WORLD-V02 · High Street façade structure — ✅ **BUILT, 10 Aug** (owner screenshots pending)

**The roadmap's V02 was roofs; the owner authorised façades instead**, on the evidence of the V01 screenshots: the dominant remaining defect was façade structure, not the skyline. Roofs move to V03. Recorded rather than quietly renumbered.

Bay subdivision, per-bay UV, shopfront fascias, pilasters, recessed entrances, aligned upper-storey windows. Gated to the six-tile slice by `TrapQuality`. Full detail: [FACADE-SYSTEM](../03-technical/FACADE-SYSTEM.md).

---

## WORLD-V03 · Roofs and architectural silhouette — ✅ **BUILT, 10 Aug** (owner screenshots pending)

Eaves, fascia, soffit, roof thickness, gable ends in wall material, hips from footprint aspect, party-wall chimneys, parapets on flat roofs. General, gated by the same tier as façades. Detail: [ROOF-SYSTEM](../03-technical/ROOF-SYSTEM.md).

<details><summary>The original V03 brief</summary>

**Objective.** A Lincoln skyline: eaves, gable ends, chimneys.

**Prerequisites.** V01.

**Files.** `BuildingMeshBuilder.PitchedRoof` / `FlatRoof` / new `Chimney` · `CityTextures.Roof` · possibly `classify.mjs` for `roof:height`.

**The work.** Eaves overhang 300–450 mm with a fascia — this alone stops roofs looking welded on. Explicit gable-end walls in the wall material. Real hips where `roof:shape` says so. Pitch from `roof:height`/`roof:levels` where tagged. **Chimney stacks on party walls of pitched residential** — the thing that actually says "English terrace".

**Non-goals.** No dormers outside hero tier. No hand-modelled roofs.

**Checks.** `check:world` — roofs must not spill outside walls on the 58 % of footprints that are concave; chimneys must not float.

**Owner verification.** Fly to 100 m over the slice. The roofscape should read as a town, not as a set of lids. 413 gabled roofs in the slice will change at once.

</details>

---

## WORLD-V03 · Street surface upgrade **[M]**

**Objective.** Make what you stand on read as a British street.

**Prerequisites.** V01.

**Files.** `SurfaceMeshBuilder` · `CityTextures.Surface` · `build-map-tiles.mjs` (extract `crossing`, `sidewalk`, `footway`, **road `name`**) · `TileModels.RoadData`.

**The work.** **Real step geometry — 29 step runs in the slice, currently flat ribbons, in the city whose famous street is a staircase.** Crossing extraction and zebra markings. Centre lines. Drain gullies along kerb runs. Surface variation instead of one flat colour. **Carry road names through** — they are read and discarded today, and everything from signage to the Phone saying where you are depends on them.

**Non-goals.** No lane markings — `lanes` is collapsed into width before Unity, and un-collapsing it is a tiler change with its own risk. No routing (that is U13). No setts by street name until names ship.

**Checks.** `check:world` — steps must be walkable by `TrapPlayerController` at the canonical 0.35 m step offset; a step you cannot climb is worse than a ramp.

**Owner verification.** Walk the foot of Steep Hill. Cross a road at a marked crossing.

---

## WORLD-V04 · Façade prototype **[L]** — the big one

**Objective.** Buildings that read as separate properties.

**Prerequisites.** V01. Better after V02.

**Files.** New `FacadeBuilder.cs` · `BuildingMeshBuilder.Extrude` · `CityTextures` modules · `WorldStreamer` atlasing.

**The work.** Bay subdivision (3.5–6 m, dividing evenly into the edge) · storey banding from `h/3.2` · window/door/shopfront modules chosen deterministically from `hashUnit(osm_id, bay)` · sills, lintels, cornices as thin extruded bands · family atlases.

**Non-goals.** No signage yet (V05/art). No per-building unique materials. No hero buildings.

**Checks.** `check:world` — bays must tile an edge exactly with no gap or overlap; the same id must produce the same façade twice; triangle count per tile must stay under budget.

**Owner verification.** Stand on the High Street. A terrace of eight shops should read as **eight shops**, not one long building. 278 shopfronts in the slice.

**Risk.** Highest in the roadmap: most new geometry, most triangles, most chance of a mobile regression. **Should be prototyped on the slice only**, behind the quality tier, before going city-wide.

---

## WORLD-V05 · High Street dressing **[M]**

**Objective.** An inhabited street.

**Prerequisites.** V03. Better after V04.

**Files.** New `PropPlacer.cs` · `SurfaceMeshBuilder.Furniture` · `build-map-tiles.mjs` (railings, bicycle parking, traffic signals) · quality tiers.

**The work.** **Procedural street lamps** — there are **2 tagged in the whole slice**, so this cannot be data-driven; place along carriageway edges at ~25 m, skipping pedestrian zones. Extract railings, bike racks, traffic signals. GPU-instance everything. Density tiers so HERO ≠ BACKGROUND.

**Non-goals.** No uniform scatter. No signage artwork (art). No parked vehicles yet.

**Checks.** Props must not intersect buildings or block a doorway — the anchor door positions are known, so this is testable.

**Owner verification.** Night mood on the High Street: it should be lit. Walk the pavement without weaving through bollards.

---

## WORLD-V06 · Hero building override **[M]**

**Objective.** The mechanism to replace one procedural building with an authored model, safely.

**Prerequisites.** None technically — but pointless before V07 has something to load, so it is scheduled here.

**Files.** New `src/world/lincolnHeroes.json` · `build-map-tiles.mjs` (resolve and flag) · `TileModels.BuildingData` (a suppress flag) · `WorldStreamer` (load prefab, skip procedural) · `check-repo-hygiene.mjs` (every hero id must resolve).

**The work.** Generalise the proven anchor pattern: pin by OSM id, lat/lon fallback, orient from the footprint ring, **keep the footprint collider authoritative** so gameplay and the CI wall test are unaffected by art, fail the build if an id cannot be resolved — exactly as anchors do today.

**Non-goals.** **No models.** The mechanism only.

**Checks.** Hero ids resolve; collision unchanged with the override on and off; **removing a hero model falls back to procedural without a hole in the street.**

**Owner verification.** Point it at a placeholder cube on `way/279984462` (Stone Bow) and confirm the cube appears at the right place, at the right angle, with collision intact.

---

## WORLD-V07 · First authored landmark **[L, art-gated]**

**Objective.** One real Lincoln building, authored.

**Prerequisites.** V06 + **an art asset that does not exist**.

**Recommendation: Stone Bow** (`way/279984462`, tile `0,0`). It is the anchor of the corridor, it is architecturally distinctive, the player walks *through* it, and it is small — a gateway, not a cathedral. The Cathedral is the wrong first choice: it is the largest and least reachable.

**Non-goals.** Not the Cathedral. Not the Castle. Not four landmarks.

**Owner action.** This is a commission or a Blender task, in the same class as **H-17**. It needs a specification of its own before anyone starts.

---

## Summary

| Package | Size | Depends on | Gated by art? |
|---|---|---|---|
| **V01 material + lighting** | **XS–S** | — | ✅ **built** |
| **V02 façades** | **L** | V01 | ✅ **built** |
| **V03 roofs** | S–M | V01 | ✅ **built** |
| V03 street surface | M | V01 | No |
| V04 façades | **L** | V01 | No |
| V05 dressing | M | V03 | Partly |
| V06 hero override | M | — | No |
| V07 first landmark | L | V06 | **Yes** |

**Five of seven need no art at all.** The visual problem is overwhelmingly a code and settings problem, not an asset problem — which is the most useful conclusion in the audit.

---

## Owner actions

| | |
|---|---|
| **Authorise V01** (or not) | It is the prerequisite for everything else |
| ~~Pick the flagship building~~ | ✅ **D-V01** — the JD Sports building, anchor evolved not duplicated |
| ~~Decide the barber's location~~ | ✅ **D-V02** — stays on Corporation Street |
| **Tidy the stock volume profile** | `DefaultVolumeProfile.asset` still carries Unity's `CopyPasteTestComponent2` and friends. Inert and overridden; deleting them means hand-editing a Unity asset, which I would rather you did in the editor |
| **Confirm photographic reference** | Own photos of Lincoln brick, limestone, shopfronts and Steep Hill would improve V01 and V04 and cost nothing but a walk |

---

## Risks

**The albedo fix will change how everything looks at once.** That is the point, but it means every earlier judgement about the city's look was made against a broken image. Expect the palette to need re-tuning afterwards — and expect that to feel like new problems appearing when it is actually old problems becoming visible.

**V04 is genuinely large** and is the one package that could regress mobile performance. Prototype it on the six-tile slice behind the quality tier.

**Data coverage is the hard limit on realism, not the renderer.** 24 % of buildings have a name, 9 % a storey count, 6 % a height, 2 lamps in the whole slice. Beyond a point, more fidelity means more authoring, not more code — and that point arrives sooner than it looks.

**Tier drift.** If ENHANCED quietly becomes the default everywhere, the mobile budget goes. The tier must be enforced by the placer, not by intention.

**None of this is on the critical path for gameplay.** U07 (interaction) is still the thing that unblocks shops, the barber, Drops and NPCs. This roadmap makes the world worth standing in; it does not make it playable. Both matter, and the sequencing between them is the owner's call.
