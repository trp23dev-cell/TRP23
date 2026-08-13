# The material colour contract

**Established by:** WORLD-V01 · **Enforced by:** `npm run check:materials` · **Code:** `Assets/World/Scripts/TrapMaterials.cs`

---

## 1 · The rule

**Every surface's colour is decided in exactly one place.**

| Channel | Carries | Never carries |
|---|---|---|
| **Texture** (sRGB) | The material's colour **and** its pattern | — |
| **Vertex colour** (linear, raw) | Per-building variation × ambient occlusion. A multiplier around **1.0** | A material colour |
| **`_BaseColor`** | White | Anything else, except a value handed in from `TrapMaterials` |

`TrapMaterials.Base`, `.Surface` and `.Roof` are the one table. Nothing else in `World/Scripts` may define what a thing is made of.

---

## 2 · What happened without it

`CityTextures.Base("brick")` returned `(0.216, 0.173, 0.145)`. `BuildingMeshBuilder.WallColour` returned **the same constant** × the OSM tint. The shader multiplied them.

The project renders **linear**, and the two channels are not treated alike — a texture is sRGB and converted on sample, a vertex colour is used raw. So:

```
texture   sRGB 0.216 → linear 0.0383
vertex    0.216 × tint 1.00 × AO 0.72 = 0.1555
product                                = 0.00596 linear
```

Asphalt was `0.18` sRGB → **0.0272 linear**. **The brick wall was 4.6× darker than the tarmac in front of it.**

Every window row, brick course and shopfront `CityTextures` draws was present and sitting below the threshold at which anyone could see it. The city read as black boxes not because it lacked detail but because the detail was multiplied into the floor of the dynamic range.

*(The audit quoted ≈3.4 % using sRGB arithmetic. The linear figure above is the correct one, and it is worse.)*

**The comment on `WallColour` predicted this exactly and was out of date** — it said the stand-in applied *"until the facades are ported"*. They were ported. The stand-in was never removed.

---

## 3 · The tint normalisation

The tiler's per-building tint is **not** centred on 1.0. Measured across the shipped export:

| Style | Mean tint | Buildings |
|---|---|---|
| brick | `0.9719, 0.8008, 0.7298` | 3,452 |
| limestone | `0.9703, 0.9513, 0.8694` | 2,354 |
| render | `0.9609, 0.9573, 0.9250` | 966 |
| modern | `0.9498, 0.9565, 0.9752` | 127 |
| monument | `0.9850, 0.9703, 0.8929` | 48 |

Brick's mean is visibly red-shifted, because in the web client the tint was laid over a **neutral** canvas — it carried the brick hue. Using it raw over an already-brick texture re-applies brick-ness.

So `TrapMaterials.Variation` divides each tint by its style's mean and clamps to **0.82–1.18**. What survives is *how this building differs from the average building of its style* — which is what makes a terrace read as separate properties. What is removed is the style's own colour, which now lives once, in the texture.

**The means are measured, not copied from the tiler's formula**, and `check:materials` recomputes them from the same export. If the tiler's palette moves, the check fails rather than the city quietly shifting colour. Same discipline as the trap-card shared table: the client and the data agree because something checks.

---

## 4 · The guard

`npm run check:materials` asserts:

1. **One table** — no other World script defines a style colour; `WallColour` delegates to `Variation`; `_BaseColor` is never a literal written at the call site.
2. **Plausible albedo** — every family lands in a real-world linear reflectance range, brick and limestone separate by value, and **brick is brighter than the road it stands on** — the regression, named.
3. **Tint means match the shipped data**, within 0.01.
4. **The post-process baseline stays restrained** — Neutral tonemapping, `overrideState` set, and nothing else added.

**Proven in both directions.** Re-planting the original `WallColour` fails checks 1 and 2; removing it passes all of them.

Deliberately **not** a test that each constant equals a literal. Those are meant to be tuned, and a test that forbids tuning is a test that gets deleted. What is contractual is the *shape*: one source, sane range, correct ordering, agreement with the data.

---

## 5 · Adding a material

1. Add it to `TrapMaterials.Base` / `.Surface` / `.Roof`.
2. Give it a smoothness in `TrapMaterials.Smoothness` if it is not matte.
3. If it has relief, add a case to `CityTextures.NormalFor`. If it is flat in life — glass, render, water, grass — **do not**.
4. Add it to `RANGE` in `check-materials.mjs` so its brightness is guarded too.

Do not add a colour anywhere else. That is the whole contract.
