# WP-026 · Ship the map with the app

| | |
|---|---|
| **Horizon** | 1 |
| **Owner** | AI + **HUMAN** (device measurement) |
| **Effort** | M |
| **Status** | ⬜ open |
| **Depends on** | WP-008 |
| **Branch** | `wp/026-offline-map` |

## Why

Unity streams Lincoln from the server in 3×3 tile blocks, because that is what the **web** build had to do — a browser cannot hand somebody 6 MB before they start playing.

**An installed app has no such constraint, and the numbers make that plain:**

| | |
|---|---|
| Whole 4 km² map, gzipped | **5.8 MB** |
| Uncompressed JSON | 20.9 MB |
| Tiles | 294 |
| Buildings | 6,947 |
| Road and surface features | 4,822 |
| `JSON.parse` of the whole export | 190 ms (desktop) |

5.8 MB is a rounding error against a typical 100–500 MB mobile game. Streaming it over the network buys nothing on a phone and costs plenty: a loading pause whenever someone walks briskly, a hard dependency on connectivity, and a server bill for handing out the same 294 tiles forever.

**The founder called this out and was right.** The plan had carried a browser constraint into a platform that does not have it.

## What

- The map ships **inside the build**, not fetched at runtime
- Pre-baked at build time rather than parsed at launch (see below)
- The tile streamer becomes a **loader over local data** — same LOD and culling, no network
- The network path is kept, but only for **map updates**: a rebuilt Lincoln can reach existing installs without a store release, checked against the manifest's `builtAt`
- Measured cold-start and memory on a mid-range Android

## The parse question

190 ms on desktop is roughly 0.6–1.2 s on a mid-range phone — acceptable once, but it is a second of nothing at launch, and it is avoidable.

**Better: bake at build time.** An editor step converts the 294 tile payloads into Unity meshes (or a compact binary buffer) as part of the build, so the runtime loads geometry directly instead of parsing JSON and triangulating on the device. `BuildingMeshBuilder.cs` already does the triangulation — this moves *when* it runs, not what it does.

That also kills a whole class of runtime failure: malformed tile data becomes a build error rather than a hole in the city.

**Not baking is a legitimate fallback** if the editor step proves fiddly — a second at launch is survivable. Measure before deciding.

## Not included

Changing the map's *content* or extent · the web build, which keeps streaming because it must · WebGL (WP-025) · terrain LOD improvements beyond what exists.

## Design notes

**This does not solve rendering.** Having 6,947 buildings on disk is not the same as drawing them. The remaining mobile question is how much geometry is live at once — LOD, culling, GPU instancing — and that is unchanged by where the data came from. It is a normal problem with normal answers, and 7k buildings across 4 km² is a modest scene by modern standards.

**Keep the network path.** Offline-first, not offline-only. The manifest already carries `builtAt`, so an install can notice the server has a newer Lincoln and pull the difference. Without that, fixing a wrong building means a store submission.

**Consoles want this anyway.** Certification expects single-player content to work without a server.

## Acceptance criteria

- [ ] The app runs the full map with **no network**, from a cold install
- [ ] Cold start within the budget in `RELEASE-AND-PLATFORMS.md`, measured on a mid-range Android
- [ ] No streaming hitch while walking — the whole city is resident or LOD'd, never fetched
- [ ] A newer server map is detected and updated without a store release
- [ ] Build size increase recorded

## Verification

```bash
npm run map:verify          # the export is intact before it is baked
npm run check:world         # geometry still passes
# HUMAN: aeroplane mode, cold start, walk the High Street to the Cathedral.
```

## Risks

| Risk | Likelihood | If it happens |
|---|---|---|
| Baked meshes balloon the build | medium | Compare against shipping JSON + runtime build; pick on measured numbers |
| Editor bake step is slow or brittle | medium | Fall back to runtime parse; a second at launch is survivable |
| Memory ceiling with the whole city resident | **medium** | This is the real constraint. LOD and culling, not streaming — WP-020 |

## Done

*Not yet.*
