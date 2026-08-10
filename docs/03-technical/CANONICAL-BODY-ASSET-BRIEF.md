# The canonical body — asset specification

**Status:** prepared, **not commissioned.** Nothing here has been ordered, paid for or started.
**Authority:** D-C02, D-C03. Scale from `TrapCharacterScale.cs`, which is the code the game actually reads.
**Audience:** whoever makes the body — Kimani, a Blender artist, or a commissioning conversation.

---

## 0 · What this is for, in one paragraph

TRP23 needs **one** human body. Not a character creator, not a wardrobe system, not a cast — one body, rigged, that walks around Lincoln at the right size with one garment on it. Everything else in the character plan waits behind proving that one works end to end. This document is what you would hand someone to get exactly that and nothing more.

**It deliberately does not describe a look.** Face, skin, hair, build and clothing style are Kimani's, and the frozen product decisions do not cover them yet. Inventing an art direction here would be the AI making a brand decision by writing it down first, which is not a decision it gets to make.

---

## 1 · The single deliverable

One **male-or-female base body**, whichever Kimani wants first — the pipeline is identical and the second one is not part of this.

Delivered as:

| File | Purpose |
|---|---|
| `TRP_Body_A.blend` | Editable source. **The actual deliverable.** |
| `TRP_Body_A.fbx` | Unity import. Mesh + skeleton + bind pose. |
| `TRP_Garment_Tee.blend` / `.fbx` | One test garment, fitted to the body. |
| `TRP_Body_A_BaseColor.png` etc. | Textures, see §7. |

If only the FBX arrives, the asset is **not** delivered. An FBX cannot be edited, and every future garment is a fitting job against the source mesh.

---

## 2 · Canonical dimensions — non-negotiable

These come from `Assets/Core/TrapCharacterScale.cs` and from Lincoln itself. Lincoln is built from OpenStreetMap footprints and Environment Agency LIDAR heights: it is **real**, in metres. A body that is the wrong size makes doorways, kerbs, market stalls and the cathedral wrong, all at once, everywhere.

| Property | Value |
|---|---|
| **Total height** | **1.80 m** |
| **Eye height** | **1.68 m** — measured to the eyeball, not the brow |
| Collider radius | 0.30 m |
| Scene scale | **1 Blender unit = 1 metre** |
| Up axis (Blender) | **+Z**, exported to Unity's **+Y** |
| Forward | **−Y** in Blender → **+Z** in Unity |
| Origin | **between the feet, on the floor plane.** Not the hips, not the centre of mass |
| Object scale on export | **1.0, applied.** `Ctrl+A → Scale` before exporting |

> **The rule, from D-W19:** if the character looks wrong against Lincoln, **change the character.** Lincoln is measured; the body is drawn. Never scale the city to suit a model.

Eye height matters more than it sounds. TRP23 is first person on foot — 1.68 m is the camera, so it decides what a shopfront sign feels like and whether you can see over a market stall.

---

## 3 · Skeleton

**Unity Humanoid compatible.** This is the hard requirement, because the Humanoid rig is what lets one animation clip drive any body, and D-C02 commits to a shared skeleton across future archetypes.

- All **15 required** Humanoid bones present.
- The **optional** bones we do want: chest, upper chest, neck, shoulders, toes.
- **Fingers: yes**, all three joints per finger. Phone-in-hand and holding a garment are both on the roadmap, and retrofitting fingers to a rigged body is worse than including them.
- Facial bones: **no.** Not until there is a reason.
- **T-pose bind pose**, arms horizontal, palms down, legs straight, feet flat and parallel.
- **No twist bones** in v1. They are a quality upgrade, and they are a compatibility risk against a Humanoid avatar that has to keep working.
- Bone names: Mixamo-style (`mixamorig:` prefix removed) or Unity's own. Consistent, whichever.
- **One root**, at the origin, unrotated, unscaled.

The avatar must configure as **Humanoid** in Unity with **no manual bone assignment and no warnings**. If it needs hand-mapping, it comes back.

---

## 4 · Topology

- **Quads**, with triangles only where unavoidable. Ngons: none.
- Clean **edge loops at every deforming joint** — shoulder, elbow, wrist, hip, knee, ankle. Three loops minimum at knee and elbow.
- **Symmetrical**, mirrored across X, so a change applies to both sides.
- **Watertight and manifold.** No interior faces, no doubled vertices, no zero-area faces.
- **All normals outward**, custom split normals cleared before export.
- Feet modelled **bare and flat** — footwear is a garment, not part of the body.
- Hands modelled properly. Mittens do not survive a phone in the hand.

---

## 5 · Triangle budget

The build targets phones. This is not a stylistic constraint; it is the platform.

| LOD | Triangles | Used at |
|---|---|---|
| **LOD0** | **≤ 18,000** | Player in first person, and any NPC close by |
| **LOD1** | ≤ 8,000 | Mid distance |
| **LOD2** | ≤ 3,000 | Street crowd |

LOD1 and LOD2 may be **decimated from LOD0** rather than modelled — that is a fine use of an hour. LOD0 is the one that must be hand-made.

**Skin influences: 4 bones per vertex maximum.** Unity's mobile skinning quality caps there, and weights above that are silently dropped — which shows up as a shoulder that tears on a phone and looks perfect on the desktop it was made on.

---

## 6 · UVs

- **One UV set**, `UVMap`, in **0–1** space. No tiles, no UDIMs.
- **No overlapping islands** — a future package may bake ambient occlusion or a lightmap, and overlap makes both impossible.
- Symmetrical islands may be mirrored, but **offset by one tile** so they can be separated later if needed.
- **4 px minimum island padding** at 2048, so mip levels do not bleed one body part into another.
- **Head, hands and torso get the texel density**, because those are what a first-person player and a close NPC actually see.

---

## 7 · Materials and textures

**Two material slots on the body**, no more:

| Slot | Covers |
|---|---|
| `M_TRP_Body_Skin` | Head, neck, hands, arms, legs, feet |
| `M_TRP_Body_Eyes` | Eyes only — they need a different shading response |

Textures, **2048 × 2048**, PNG, no baked lighting and no baked shadow:

- `_BaseColor` — albedo only. Flat, unlit, no ambient occlusion painted in.
- `_Normal` — tangent space, OpenGL green channel (**+Y up**), which is what Unity expects.
- `_MaskMap` — URP channel packing: **R** metallic, **G** occlusion, **B** detail, **A** smoothness.

**Do not deliver a shader.** The render pipeline is URP 17.3 and materials are authored in Unity; a Blender shader graph does not survive the trip and re-creating it wastes the artist's time.

---

## 8 · The test garment

One **plain t-shirt.** Not a Trap Made It product — the real garments come later, after this pipeline is proven, and drawing a real one now would burn a design on a test.

- Modelled **as its own mesh**, fitted over the body. Not a texture on skin.
- **Skinned to the same skeleton**, sharing the body's weights through the torso and upper arms.
- **≤ 4,000 triangles**, one material, 1024 × 1024 textures.
- Delivered with **the list of body faces it hides**, or a vertex group naming them. Wearing a shirt should let us hide the torso underneath rather than render two surfaces that fight each other.

This garment is the actual test. It proves a Trap Made It drop can be fitted to this body **without** the body needing to change — which is the whole reason D-C02 rejected procedural bodies.

---

## 9 · First-person compatibility

The player sees this body from inside its head. So:

- The head mesh must be **cleanly separable** — its own vertex group, `head_hide`, so it can be hidden without hiding the neck and shoulders.
- Nothing may **intersect the camera** at 1.68 m when the head is hidden: no hair volume, no collar, no chin.
- **Arms and hands must look right from above at close range.** They are the part of the body the player looks at most and the part artists check least.

---

## 10 · Naming and export

```
TRP_Body_A                 the mesh object
TRP_Body_A_Armature        the skeleton
TRP_Garment_Tee            the garment
```

FBX export settings:

- **Binary FBX 2020** or later
- **Selected objects only** — no cameras, no lights, no empties
- **Apply transform**, scale 1.0
- **+Y up, −Z forward**
- **No animation in the body FBX.** Clips are separate files.
- **No leaf bones**

---

## 11 · Animation — deliberately not in scope

Locomotion clips are **not** part of this. The body must be Humanoid so that clips can come from anywhere, and choosing where is a separate decision with a licence attached to it.

For the D-C03 proof, temporary Mixamo clips are acceptable **in the editor only**, never committed and never shipped — the same condition the WP-U17b brief set. What ships is a separate call.

---

## 12 · Ownership and licence — read before starting

This is the clause that ended UMA, so it is the clause that matters most.

**TRP23 must own this asset outright, or hold a written licence that permits commercial use in a shipped game on PC, iOS, Android and consoles, with no attribution requirement and no per-title fee.**

Concretely:

- **No** Mixamo, Daz, Character Creator, MakeHuman, Blender Studio or asset-store base mesh used as the starting point — even "free" ones — unless its licence is read, cleared and filed.
- **No** scanned or photogrammetry data of a real person without a signed release.
- **No** AI-generated base mesh whose training provenance cannot be stated.
- **No** textures from a source that has not been checked. Skin textures are the usual leak.
- The `.blend` source must be **delivered**, not retained by the artist.
- A one-line statement of origin per asset, filed in `docs/05-operations/REAL-WORLD-INTEGRATIONS.md`.

If a commissioned artist starts from a base mesh they already own, **that is fine** — but it must be stated in writing before work starts, not discovered at ship.

---

## 13 · Acceptance — how we will know it is right

The D-C03 chain, in order. Each step is a thing that can fail on its own:

1. Imports to Unity with **no errors and no warnings**.
2. Configures as **Humanoid** with **no manual bone mapping**.
3. Measures **1.80 m** in the scene, camera at **1.68 m**.
4. Stands correctly on Lincoln's LIDAR ground — no float, no sink.
5. Plays a walk cycle with **no visible skinning tearing** at shoulder, elbow, hip, knee.
6. Wears the test garment with **no poke-through** across the full locomotion range.
7. Head hides cleanly in first person; **nothing clips the camera**.
8. LOD0 ≤ 18,000 triangles, 4 influences, two materials.
9. Implements `ICharacterVisual` through an adapter in `World/Scripts/CharacterVisual/` — **and nothing outside that folder knows it exists.**
10. Runs on a mid-range Android phone at the project's frame target.

**Steps 1–8 are the artist's. Steps 9–10 are ours** — and 9 is already built and waiting, which is why the framework decision cost nothing to change.

---

## 14 · What this does not authorise

- No second body. No archetype set. **One** body, first (D-C03).
- No character creator, no sliders — that is what D-111 and D-C02 rule out.
- No production Trap Made It garments.
- No face customisation.
- No commission. **This is a specification, not an order.** Someone still has to decide who makes it and what it costs.
