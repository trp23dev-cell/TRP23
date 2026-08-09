# Character Visual Pipeline

**WP-U17a preflight: UMA 3 evaluation, the seam, and the canonical scale.**

**Date:** 9 August 2026 · **Status:** 🔴 **WP-U17b STOPPED at import. UMA vendoring route rejected on evidence — see §12.** The U17a seam stands and is unaffected.
**Package:** WP-U17a · **Design baseline:** [WORLD-AND-GAMEPLAY-SPECIFICATION](../02-design/WORLD-AND-GAMEPLAY-SPECIFICATION.md) · [CHARACTER-AND-WARDROBE](../02-design/CHARACTER-AND-WARDROBE.md)

> **Two things this package could not do, stated first.** There is no Unity licence in this environment, so UMA was **not imported**, no character was generated, nothing was rendered and no performance was measured. And importing a large third-party framework that cannot be compiled or run here would be the one genuinely hard-to-reverse act available — so it was not done. What follows is verified research, a reversible seam, and an exact handover.

---

## 1 · What UMA actually is, verified

Checked against the source on 9 August 2026, not against the brief.

| | Finding | Evidence |
|---|---|---|
| **Source** | `github.com/umasteeringgroup/UMA` | [repository](https://github.com/umasteeringgroup/UMA) |
| **Latest release** | **v3.03**, 8 August 2026 — *one day old* | [releases](https://github.com/umasteeringgroup/UMA/releases) |
| **Prior releases** | v3.02 (26 Jul), v3.01/`V3.0f1` (23 Jul), v3.0/`V3.0f0` (6 Jun) | same |
| **Unity requirement** | *"URP and UNITY 6.3 Required for this release"* — v3.0 notes | same |
| **Later compatibility** | v3.01: *"Unity 6.5 compatibility changes. HDRP compatibility changes."* | same |
| **Licence (code)** | **MIT**, © 2013 Fernando Ribeiro. Standard unmodified text | [LICENSE](https://github.com/umasteeringgroup/UMA/blob/master/LICENSE) |
| **Distribution form** | **A Unity *project*, not a UPM package.** Root is `UMAProject/`, `LICENSE`, `README.md` — **no `package.json`** | repository contents |

**Our project is Unity 6000.3.8f1 (= 6.3) on URP 17.3.** That is precisely the stated requirement — not "probably fine", but the exact configuration the release names.

### The licensing gap, stated honestly

MIT covers the repository. **What I could not establish is whether the bundled art carries the same terms.**

There is **one `LICENSE` at root and no `THIRD-PARTY`, `ATTRIBUTION` or nested licence file**. The project ships demo content — `funky3_slot.asset` (1.4 MB), `FaceRed.asset`, `SourceShaders.zip` (6 MB), `HDRPDefaultResources/`.

**An absent third-party notice is not evidence that none is needed.** It is equally consistent with nobody having documented it. For code we are on firm ground; for bundled meshes, textures and any animation, the position is **undocumented rather than confirmed**.

> **This does not block the trial** — the recommendation below imports the framework and none of the demo art. It **would** block shipping a bundled example character, and that distinction needs to hold.

---

## 2 · Accept, reject, or neither

> **Recommendation: PROCEED TO TRIAL — do not adopt yet.** Nothing found is a blocker. Nothing found is proof either, because the decisive facts are all runtime facts and no runtime was available.

Against the brief's rejection criteria:

| Criterion | Finding |
|---|---|
| Incompatible Unity/URP | ❌ no blocker — 6.3 + URP is the stated target |
| Unacceptable licence | ❌ no blocker for code (MIT). ⚠️ **bundled art undocumented** |
| Unavoidable gameplay coupling | ❌ no blocker — the seam below prevents it, and CI enforces the seam |
| Cannot support our own garments | ❓ **unverified.** The decisive question and it needs the editor |
| Unacceptable mobile cost | ❓ **unverified.** Runtime mesh generation on a mid-range Android is the real risk |
| Unreproducible install | ⚠️ **partly.** Not a UPM package, so no manifest pin — see §7 |
| Replacement prohibitively hard | ❌ **addressed** — one adapter folder, enforced |

**The two ❓ rows are the trial.** They are why this is a preflight and not an adoption.

---

## 3 · The seam

```
TrapPlayerController        ← gameplay. Movement, input, slope, grounding, freeze
        │  drives, via ICharacterVisual
        ↓
Player root (GameObject)
 ├── CharacterController    ← collision. Authoritative
 ├── PlayerRig              ← holds the player until the tile streams in
 ├── PlayerCameraRoot       ← camera target at eye height
 └── CharacterVisual        ← ICharacterVisual
      ├── CapsuleCharacterVisual   ✅ built, permanent fallback
      └── UmaCharacterVisual       ⬜ not written — the only file allowed to see UMA
```

`ICharacterVisual` is deliberately tiny: `Root`, `Animator` *(nullable)*, `IsReady`, `SetLocomotion(speed, grounded)`, `SetVisible(bool)`.

**An interface with one implementation is usually speculative, and this project rejects those.** It earns its place because replaceability *is* the requirement here: a trial you cannot walk back from is not a trial. And it is a mechanism rather than an intention — **`check:repo` fails if a `using UMA` or `UMA.` reference appears anywhere outside `World/Scripts/CharacterVisual/`.** Verified in both directions.

`Animator` being nullable is not defensive padding. **UMA assembles its mesh asynchronously**, so code assuming an Animator on the first frame works in the editor and fails on a phone. The capsule returns null permanently, which means anything written against it handles the UMA case correctly by construction.

**`CapsuleCharacterVisual` stays permanently.** WP-U02 removed the last dependency on an asset nobody had; putting the only body behind a third-party import would quietly restore that. A fresh clone with no UMA still walks around Lincoln.

---

## 4 · Canonical scale

`TrapCharacterScale` in **Core** — engine-free, so every layer reads the same numbers instead of repeating literals.

| | Value | Why |
|---|---|---|
| Height | **1.80 m** | Near the UK adult mean |
| Eye height | **1.68 m** | **Matches the web client**, so the city reads at one scale in both |
| Radius | 0.30 m | 0.6 m across — through a 762 mm door with room |
| Capsule centre | 0.90 m | Half the height, by definition |
| Step offset | 0.35 m | A kerb is ~100–125 mm. Not a wall |
| Slope limit | 50° | Steep Hill is ~1 in 6 |
| Target model height | **1.80 m** | Imported models are scaled to this |

> **If the character looks wrong against Lincoln, change these numbers. Never scale Lincoln.** The city is OSM footprints on LIDAR terrain in metres — it is the accurate part, and rescaling it to flatter a badly-authored model would corrupt the one asset that cannot be regenerated.

Six EditMode tests pin this, including *fits through a standard UK doorway* and *steps over a kerb but not a wall*.

---

## 5 · Animation — nothing yet, and a licensing trap

**No animation is included and none was chosen.** Locomotion needs idle, walk, run and a fall/land at minimum, Humanoid-retargetable.

**The trap worth naming now:** Mixamo is the obvious free source and its terms have shifted over the years around redistribution inside a commercial product. Whatever is chosen must permit **commercial redistribution, including on consoles**, and that must be checked *before* import — the same rule that removed Starter Assets in WP-U02.

Any temporary clip must be recorded as temporary in this document, with its source, or it becomes permanent by forgetting.

---

## 6 · Trap Made It garment pipeline — proposed

```
physical garment
   ↓  photograph flat + on a body · measure · get the artwork files
reference pack
   ↓  Blender, fitted to the canonical TRP23 body at 1.80 m
mesh + UVs
   ↓  materials — base colour, normal, roughness. Artwork as a decal layer
   ↓  rig and skin weights against the same skeleton
wardrobe asset  (UMA slot + overlay, if UMA is adopted)
   ↓  LOD0 / LOD1 / LOD2
Unity
   ↓
digital product ── the twin of a real SKU
```

**What an artist needs:** the canonical body as a Blender file, the shared skeleton, a material template, and a naming and LOD convention.

**In git:** source `.blend`, UVs, LOD meshes, material definitions, the wardrobe asset, and the SKU mapping. These are the product and must be versioned.

**Not in git:** raw photography, multi-hundred-megabyte texture sources, and — importantly — **anything whose licence does not permit redistribution**. Large binaries in git are permanent; that lesson is already recorded in `.gitignore`.

**Colourways** should be overlay/material variants of one mesh, not duplicated geometry. One garment, several colours, one fitting cost — which is exactly why D-111 chose fixed archetypes over sliders.

**Mobile LODs** generated at export, budgeted per the platform tiers.

---

## 7 · Reproducibility — the one real reservation

**UMA is not a UPM package.** No `package.json`, so it cannot be pinned in `Packages/manifest.json` the way every other dependency is.

That leaves three options, and none is as clean as a manifest line:

| | Trade |
|---|---|
| **Vendor the minimum tree into `Assets/`, tag recorded here** | Reproducible and self-contained. **Adds MIT-licensed third-party source to our repo** and makes upgrades a manual diff |
| **UPM git dependency** | Pinnable — *if* a subfolder resolves as a package, which the layout suggests it will not |
| **`.unitypackage` from a release, tag recorded** | Simple. **Not reproducible from a clone** and repeats the Starter Assets failure |

**Recommend vendoring, with the exact tag recorded here and the demo content excluded.** It is the only option where a fresh clone builds the same game — which is the standard WP-U02 set and should not be relaxed one package later.

---

## 8 · NPC reuse — assessed, not built

The relevant question for U16a: **can one humanoid pipeline serve the player, named NPCs and ambient pedestrians?**

On the public evidence UMA is designed for exactly that — procedural variation from a shared base is its purpose, which is a better fit for a crowd than for a single hero. `ICharacterVisual` is not player-specific and an NPC can hold one.

**The unverified half is cost.** A crowd of runtime-generated avatars on a mid-range Android is precisely where this either works or does not, and that measurement belongs to U16a. Ambient pedestrians may well need a cheaper path — baked variants rather than runtime generation — even if UMA serves the player and named NPCs well.

**No NPC code was written.**

---

## 9 · Persistence boundary — documented, not implemented

**No appearance persistence exists and none was added.**

| Server owns | Unity owns |
|---|---|
| Chosen archetype id | Mesh generation |
| Appearance parameter ids | Materials and textures |
| Owned garment ids | Animation |
| Equipped garment ids | Visual assembly |
| Hairstyle id | LODs |

> **Never serialize a UMA runtime blob into authoritative state.** It would tie the player's saved identity to one framework's internal format — so replacing the framework would mean migrating every player, which is the opposite of the replaceability this package was built to protect. **Stable TRP23 identifiers, translated into visuals at runtime.**

---

## 10 · Performance baseline

**Not measured.** No Unity, no build, no device.

What U17b must capture: skinned mesh renderer count · material count · bone count · triangles · texture resolution · **runtime generation cost in milliseconds** · peak memory · whether mesh combining is on · LOD strategy.

**The number that decides adoption is runtime avatar generation time on a mid-range Android.** If building a character causes a visible hitch, UMA is a desktop tool for this project regardless of how good it looks.

---

## 11 · Owner decisions

| # | Decision | Why it cannot be inferred |
|---|---|---|
| **1** | **Proceed with the UMA trial?** | Nothing found blocks it; nothing found proves it. Recommend yes, on the vendoring route |
| **2** | **Vendor UMA into `Assets/`** *(recommended)*, UPM git, or `.unitypackage`? | §7. Vendoring is the only one where a clone builds the same game |
| **3** | **Animation source** | §5. Must permit commercial and console redistribution, checked before import |
| **4** | **First or third person for the character proof?** | The baseline has not fixed the product camera. U17a deliberately did not invent an answer — the body is hidden in first person and the proof can be done in Scene view |
| **5** | Confirm **1.80 m / 1.68 m** as canon | Everything downstream scales to it |


---

# 12 · WP-U17b — stopped at import, with evidence

**Authorised:** vendor UMA v3.03 into `Assets/ThirdParty/UMA/`, framework only, excluding demo art.
**Outcome:** **not done.** The brief said *"If a minimum viable import cannot be made safely without uncertain assets, STOP and report that before continuing."* It cannot. This is that report.

## 12.1 · The archive could not even be retrieved

| Attempt | Result |
|---|---|
| `git clone --depth 1 --branch v3.03` | **timed out** at 280 s |
| `curl` tarball, 540 s window | **failed at 1.3 GB, still incomplete** |

The v3.03 source tarball is **over 1.3 GB compressed** — the download never finished. Everything below is measured from the 7,522 entries that did arrive, so the real totals are **higher**, not lower.

## 12.2 · The framework is 0.75% of the project

| | Size | Files |
|---|---|---|
| **C# framework** | **12.18 MB** | 636 |
| **Everything else** | **1,603.79 MB** | *(partial)* |

By type: **945.7 MB of PNG** (851 files) · 141.0 MB TGA · 117.1 MB `.asset` · **90.4 MB `.umaShaderPack`** · 59.1 MB FBX · 43.4 MB PSD · 39.3 MB scenes · **26.0 MB MP3**.

`UMAProject/Assets/UMA` alone is **1,108.9 MB**.

Also present: a **SkyCar** demo vehicle with 8 MB textures, road and ground textures, and `space-atmospheric-background-124841.mp3`.

> **A character framework should not ship a car and a music track.** That is not a criticism of UMA — it is a full Unity demo project, and it is entirely reasonable as one. It is simply not a thing that can be vendored into another repository.

## 12.3 · The licensing question got sharper, not softer

U17a found MIT at root and no attribution file. Two further findings:

**The tree is not licence-uniform.** There is a second licence inside it — `UMA/SRP/ShaderPackages/ShaderPackager-main/LICENSE` — a bundled third-party tool with its own terms. That is direct evidence against assuming one licence covers everything.

**Only two licence files exist in 7,522 entries.** Nearly 1.6 GB of PNG, TGA, PSD, FBX and audio, and nothing states its provenance.

**And `space-atmospheric-background-124841.mp3` is a stock-library filename.** That numeric-suffix pattern is characteristic of stock audio sites. Its presence under a blanket MIT is a question, not an accusation — and it is exactly the kind of question that must be answered before art enters a commercial product headed for console certification.

*I am not asserting UMA's licensing is invalid.* MIT plausibly is intended to cover everything. **But it is not verifiable from the repository, and there is positive evidence of non-uniformity.**

## 12.4 · A framework-only import produces nothing

The 12 MB of C# is inert on its own. Generating one humanoid additionally requires a race definition, base slot meshes, overlays and **90.4 MB of shader packs** — i.e. precisely the undocumented-provenance assets the authorisation excluded.

**So the two instructions cannot both be satisfied: "exclude uncertain art" and "produce one humanoid".**

## 12.5 · The decision that changes the recommendation

> **D-111 already ruled out the thing UMA is for.**

*"Fixed archetypes, not continuous sliders. The product is clothing; sliders make every drop an unbounded fitting problem."*

UMA's central value is **runtime procedural avatar generation from DNA** — continuous, per-player bodies. TRP23 decided on **4–6 fixed archetypes** precisely so each garment is authored a known number of times.

With fixed archetypes we need: a base mesh per archetype, one shared Humanoid skeleton, and garments fitted per archetype. **None of that requires UMA.** Adopting it would mean carrying 1.6 GB, an unresolved provenance question and an unmeasured mobile generation cost — to obtain a capability we have already decided not to use.

That is not a defect in UMA. It is a mismatch between UMA and this project, and it only became visible when the import was examined rather than assumed.

## 12.6 · Status

> **REJECT the vendoring route. UMA-as-technology remains UNPROVEN rather than disproven — no runtime evidence was obtainable.**

Not ACCEPT: no humanoid was rendered and nothing was measured.
Not CONDITIONAL: that implies a desktop proof that pending mobile work would confirm, and there is no desktop proof.

## 12.7 · Recommended route instead

**Authored archetype bodies, owned by TRP23.**

| | |
|---|---|
| **What** | 4–6 base bodies authored in Blender to `TrapCharacterScale` (1.80 m), one shared Unity Humanoid skeleton, garments fitted per archetype |
| **Licensing** | Ours outright. No provenance question, console-safe |
| **Size** | Megabytes, not gigabytes. Vendorable, diffable, reproducible from a clone |
| **Mobile** | No runtime mesh generation, so the hitch risk that would have decided UMA does not arise |
| **Fits** | **Exactly what D-111 already specified** |
| **Cost** | Real art work, and we lose procedural variety — which matters for **crowds** (U16a) far more than for the player |

**The honest trade:** ambient pedestrians are where procedural variation genuinely earns its keep, and hand-authoring a crowd is expensive. Options there — palette and material variation over a few base bodies, or a cheaper crowd-specific system — belong to U16a with its own evidence, not to a decision made now.

**Alternatives if the owner still wants UMA:** import it manually per-machine *(rejected — this is exactly the Starter Assets failure WP-U02 removed)*, or a git submodule *(a 1.6 GB checkout for every clone and every CI run)*. Neither is better than authoring our own.

## 12.8 · What U17b did not change

**Nothing was imported. No files were added to `Assets/`.** The U17a seam, `CapsuleCharacterVisual`, `TrapCharacterScale`, the eleven tests and the UMA containment guard are all untouched and still passing — and the guard remains correct and useful whatever character technology is eventually chosen.
