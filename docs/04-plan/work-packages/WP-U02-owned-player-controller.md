# WP-U02 · Owned player controller

| | |
|---|---|
| **Horizon** | 1 (Unity migration, Phase A) |
| **Owner** | AI |
| **Effort** | M |
| **Status** | ✅ done — 4 August 2026 |
| **Authorised by** | Kimani, 4 Aug |

## Objective

Remove the runtime dependency on the untracked Starter Assets player, so a fresh clone contains everything needed to produce a playable character.

## What the old player did — audit before replacing

`ThirdPersonController.cs` was 512 lines, of which TRP23 used a fraction. Four features were **local patches** rather than Starter Assets behaviour, and those are the ones that mattered:

| Behaviour | Kept? | Note |
|---|---|---|
| First person, eye height 1.68m | ✅ | TRP23 patch. Matches the web client so the city reads at one scale |
| Slope cost (`SlowOnSlopes`, penalty 3.5) | ✅ | TRP23 patch. Naismith's rule — now in Core and **tested** |
| Guard when the controller is disabled | ✅ | TRP23 patch (added 4 Aug). Generalised into `CanAct` |
| Camera not turning while frozen | ✅ | TRP23 patch (added 4 Aug). Now `PointerFocus`-driven |
| Walk / sprint / acceleration ramp | ✅ | 1.4 / 4.5 m/s, `speedChangeRate` |
| Gravity, jump, terminal velocity, timeouts | ✅ | Same constants |
| `CheckSphere` grounding on the Default layer | ✅ | Same |
| First-person strafe heading | ✅ | Kept — without it, releasing a key stops you dead |
| **Third-person orbit, rotation smoothing** | ❌ | Never used. `FirstPerson` was hard-set true, and the whole orbit path came along for the ride |
| **Animator (`_animIDSpeed`, blend, IK)** | ❌ | No character model is tracked. Reinstates with WP-012 archetypes |
| **Footstep and landing audio** | ❌ | Depended on untracked clips |
| **`BasicRigidBodyPush`, `PlayerInput` component** | ❌ | Not needed; input is resolved directly |

**Result: 512 lines → ~330**, with nothing TRP23 used left behind.

## Architecture

`TrapPlayerController` in **`TRP23.World`**, alongside `PlayerRig`. Per the authorisation: World already owns player placement, and creating a `TRP23.Character` assembly for one script would be the premature architecture U01 avoided.

> **What would justify splitting `TRP23.Character` later:** a second consumer of player state that is not the world — character appearance (server-authoritative, D-119), animation, or inventory-driven visuals. At that point Character depends on `Core` + `Platform` only, and `PlayerRig` stays in World because holding the player until a tile streams in is genuinely a world concern.

**Input — one asset, two names for it.** These refer to the same thing and the distinction is worth stating once:

| | |
|---|---|
| **The asset** (authoritative path) | `Unity/TRP23/Assets/InputSystem_Actions.inputactions` |
| **The C# accessor** | `InputSystem.actions` — the Input System property returning the *project-wide* asset set in Project Settings |
| **How they connect** | `EditorBuildSettings` binds the asset as project-wide (`com.unity.input.settings.actions`), so `InputSystem.actions` resolves to it |

**There is exactly one gameplay input asset and this package created none.** `StarterAssets.inputactions` still exists on disk, untracked, and is now referenced by nothing.

Resolved once in `Awake` into four typed `InputAction` fields — no serialized reference to forget to wire.

| Action | Map | Used for |
|---|---|---|
| `Move` | Player | Walk direction, analogue magnitude |
| `Look` | Player | Yaw and pitch |
| `Jump` | Player | `WasPressedThisFrame` |
| `Sprint` | Player | `IsPressed` |

**No key or button name appears anywhere in the controller.** Device differences live in bindings, which is why the asset's existing **Gamepad** and **Touch** schemes work with no code. Missing actions warn by name rather than failing silently on a rename.

**Mouse and stick are scaled differently, on purpose.** A mouse reports a *distance already moved*, so multiplying it by frame time makes sensitivity depend on frame rate. A stick reports a *rate held*, so it must be. Same input, opposite treatment — getting this backwards is why ported controllers feel wrong on one device or the other.

**Touch — status, precisely.**

| | |
|---|---|
| Gamepad bindings | **Present in the asset**, consumed by the controller. **Owner hardware verification pending** (H-13 step 8) |
| Touch architecture | **Compatible.** The asset carries a Touch scheme and the controller reads *actions*, never devices |
| On-screen controls | ❌ **Not implemented.** No joystick, no buttons, no mobile HUD |

The seam is that an on-screen stick would feed `Move`/`Look` and the controller would never know it existed. **That is a seam, not a mobile control scheme** — building one is WP-024.

**Freeze.** `CanAct` gates both `Update` and `LateUpdate` on `PointerFocus.Wanted` and on the CharacterController being enabled. No new pause system; it reads the register that already exists.

## Files

**Created:** `Assets/World/Scripts/TrapPlayerController.cs` · `Assets/Core/SlopeCost.cs` · this document
**Changed:** `Assets/Editor/World/TrapWorldSetup.cs` (builds the owned player) · `.gitignore` · `scripts/check-repo-hygiene.mjs` · `tools/csharp-check/UnityStubs.cs` · `tools/collision-check/{check.csproj,Program.cs}` · `docs/04-plan/{PROGRESS,HUMAN-TASKS}.md`
**Deleted:** `Assets/StarterAssets/ThirdPersonController/Scripts/ThirdPersonController.cs` (+ `.meta`)
**Moved:** none.

### No prefab, deliberately

The player is **constructed by `TrapWorldSetup.BuildPlayer()`** rather than instantiated from a prefab. A prefab would have to reference a character mesh, and **we do not own one yet** — referencing a Starter Assets mesh would reintroduce exactly the dependency this package removes. A capsule is honest about that.

This also matches the project's existing pattern of deterministic scene assembly, and it is why nothing in `TrapGame.unity` needed changing: the scene never contained a player. It was built by the setup tool, which previously fell back to `FlyCamera` on any machine without Starter Assets — i.e. every fresh clone.

**When WP-012 lands real archetypes, this becomes a prefab and `BuildPlayer()` becomes one line.**

## Starter Assets: what went, what stayed

| | Status |
|---|---|
| `ThirdPersonController.cs` | **Deleted** — was the only tracked player code |
| `StarterAssetsInputs.cs`, `PlayerArmature.prefab`, meshes, animations, audio | Never tracked. Still on a developer's disk, required by nothing |
| `Mobile/` virtual joystick samples | Never tracked. **Useful reference for WP-024**, so not deleted from disk |
| `license.txt` | **Still tracked.** The folder may exist locally and the licence should travel with the repo that references it |

The `.gitignore` negation that re-included `ThirdPersonController.cs` is gone. **Git cannot re-include a file whose parent directory is excluded** — it only ever appeared to work because the file predated the rule, and that is precisely how a fresh clone ended up with no player.

## Fresh-clone reproducibility — the acceptance criterion

Every file required to produce the player, verified tracked and not ignored:

```
Unity/TRP23/Assets/World/Scripts/TrapPlayerController.cs   ✓
Unity/TRP23/Assets/World/Scripts/PlayerRig.cs              ✓
Unity/TRP23/Assets/World/Scripts/CameraBoom.cs             ✓
Unity/TRP23/Assets/World/Scripts/TRP23.World.asmdef        ✓
Unity/TRP23/Assets/Core/PointerFocus.cs                    ✓
Unity/TRP23/Assets/Core/SlopeCost.cs                       ✓
Unity/TRP23/Assets/Core/TRP23.Core.asmdef                  ✓
Unity/TRP23/Assets/InputSystem_Actions.inputactions        ✓
Unity/TRP23/Assets/Editor/World/TrapWorldSetup.cs          ✓
Unity/TRP23/ProjectSettings/*                              ✓
Unity/TRP23/Packages/manifest.json                         ✓
```

**No tracked file lives under an ignored parent** — checked across all 334 tracked files. That is the broken pattern that caused this, and it no longer exists anywhere in the repository.

`check:repo` now **fails** if any tracked Unity script references Starter Assets. Verified by planting a violation: it fired and named the file.

## Tests

**`SlopeCost` is pure scalar logic in Core**, so it runs in CI without a licence — eight checks in `npm run check:world`:

```
ok  flat ground costs nothing — 1.000
ok  a 1-in-6 climb costs about a third — 0.632   ← Naismith's rule
ok  a steeper climb is always slower than a shallower one
ok  uphill never stops you completely — a cliff still leaves 0.30
ok  a gentle descent is quicker than the flat
ok  but a plunge is not — 1-in-1 down gives 0.45
ok  descent benefit is capped
ok  no discontinuity where the descent curve turns — 1.120 vs 1.119
```

That last one matters: a jump at the gradient where the curve changes shape would be felt as a lurch while walking.

**No EditMode or PlayMode tests were added.** No test assemblies exist, and writing tests that cannot be run would be manufacturing evidence. They belong with WP-U03's test assemblies, against a bootstrap that makes instantiation meaningful.

## ⚠️ Not verified

**No Unity licence in this environment.** Specifically:

- **`TrapWorldSetup.cs` is not compile-checked** — it needs `UnityEditor`, which is not stubbed. It was edited substantially. Brace and paren balance were checked and the changed regions read back, but **the editor is the first thing to compile it.** Pre-existing gap, now carrying more weight.
- Nothing was run: no walking, no jumping, no streaming, no gamepad.
- Movement *feel* is unverified. Constants match the old controller, but a lerp and a raycast are not a playtest.
- Whether `InputSystem.actions` resolves at runtime — correct for Unity 6 project-wide actions, unproven here.

**H-13** covers all of it in nine steps.

## Risks introduced

| Risk | Likelihood | Mitigation |
|---|---|---|
| `TrapWorldSetup` fails to compile | **medium** — it is unchecked and was edited | H-13 step 1 catches it immediately |
| `InputSystem.actions` null at runtime | low | Warns clearly and disables movement rather than throwing |
| Look feel wrong on mouse or stick | medium | Two separate sensitivities, both inspector-exposed |
| Capsule player looks unfinished | certain, accepted | It is honest. WP-012 brings archetypes |
| Losing the FlyCamera fallback | low | Component still exists; add by hand to a camera with no player |

## Known limitations

Third person, animation, audio, crouch, climb, swim, root motion and foot IK are all **out of scope and absent**. The player is a capsule. There is no character model, because we do not own one.

## Done

4 August 2026.
