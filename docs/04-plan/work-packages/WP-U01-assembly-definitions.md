# WP-U01 · Unity assembly definitions

| | |
|---|---|
| **Horizon** | 1 (Unity migration, Phase A) |
| **Owner** | AI |
| **Effort** | M |
| **Status** | ✅ done — 4 August 2026 |
| **Authorised by** | Kimani, 4 Aug, with six constraints |

## Objective

Replace one `Assembly-CSharp` with bounded assemblies, so a prohibited dependency **fails to compile** rather than being caught in review.

## The graph as implemented

```text
TRP23.Core            (noEngineReferences — no UnityEngine at all)
   ↑                   PointerFocus · GameFreeze · TrapCardState
   ├── TRP23.World     → Core, Unity.InputSystem, UnityEngine.UI
   │                    15 files: streaming, terrain, buildings, collision,
   │                    textures, minimap, atmosphere, camera, PlayerRig
   │
   └── TRP23.UI        → Core, Unity.InputSystem
                         11 files: HUD, menu, case file, SceneFlow, Auth/*

Assembly-CSharp-Editor  (predefined — auto-references every asmdef AND
                         Assembly-CSharp)
   └── Assets/Editor/World/TrapWorldSetup.cs
       Assets/Editor/UI/TrapUiSetup.cs

Assembly-CSharp         (predefined — StarterAssets, TutorialInfo)
```

**Three assemblies, not nine.** The roadmap proposed nine; six of them would have been empty. `Network`, `Gameplay`, `Character`, `Platform`, `NPC` and `App` are created when they have contents — creating them now would be the assembly-definition bureaucracy the constraints warned against.

**`TRP23.World` and `TRP23.UI` cannot see each other.** Neither lists the other, and neither needs to.

## Verified by deliberate violation

Each boundary was broken on purpose, the failure observed, and the change reverted:

| Test | Result | Compiler |
|---|---|---|
| `using UnityEngine;` in Core | ✅ **failed to compile** | `CS0246: 'UnityEngine' could not be found` |
| `using TrapMadeIt.UI;` in World | ✅ **failed to compile** | `CS0234: 'UI' does not exist in 'TrapMadeIt'` |
| `using TrapMadeIt.World;` in UI | ✅ **failed to compile** | `CS0234: 'World' does not exist in 'TrapMadeIt'` |

Then all three rebuilt clean. `git diff` on the three files: empty.

**CI enforces the same graph.** `check:csharp` was one project compiling everything together — which could never have caught a cross-boundary reference. It is now three projects mirroring the asmdefs: `Core.csproj` (no stubs at all, so Core's engine-freedom is enforced), `World.csproj` (no UI sources), `UI.csproj` (no World sources).

## Files moved — five, each forced

Moves were kept to what compilation required. All five are **static classes or editor scripts**: no `MonoBehaviour`, so no scene or prefab reference can point at them, and `.meta` files moved alongside so GUIDs are preserved. Git recorded all five as renames.

| File | From | To | Why |
|---|---|---|---|
| `PointerFocus.cs` | `World/Scripts/` | `Core/` | Used by **both** World and UI. Left in World it forces `UI → World` |
| `GameFreeze.cs` | `World/Scripts/` | `Core/` | Same |
| `TrapCardState.cs` | `UI/Scripts/CaseFile/` | `Core/` | Pure logic with no engine surface; belongs where it can be tested without Unity |
| `TrapWorldSetup.cs` | `World/Scripts/Editor/` | `Editor/World/` | See §"blocked directions" #1 |
| `TrapUiSetup.cs` | `UI/Scripts/Editor/` | `Editor/UI/` | Same |

**Namespaces were not changed.** `PointerFocus` stays `TrapMadeIt`, `TrapCardState` stays `TrapMadeIt.CaseFile`. Assembly ≠ namespace, and renaming would have churned every call site for no compile-time benefit.

## Blocked directions found

Every case where an existing script prevented the desired dependency direction.

### 1 · `TrapWorldSetup` → `StarterAssets.ThirdPersonController` — **resolved by moving**

`Assets/Editor/World/TrapWorldSetup.cs:86` sets five fields on `StarterAssets.ThirdPersonController` (ground layers, first-person, jump height, walk and run speeds).

**Why it exists:** the streamed city is built at runtime on the Default layer, so the controller must be told that is ground — otherwise `CheckSphere` never finds the floor and the player falls through Lincoln for ever while looking perfectly fine.

**The block:** StarterAssets has no asmdef, so it lives in `Assembly-CSharp`. **An asmdef assembly cannot reference `Assembly-CSharp`.** Had `TRP23.World` covered `World/Scripts/Editor/`, this would not compile.

**Changed:** moved both Editor folders to `Assets/Editor/`, which is compiled into the predefined `Assembly-CSharp-Editor` — and predefined assemblies auto-reference *both* every asmdef and `Assembly-CSharp`. **Zero code change.** The alternative was rewriting the StarterAssets reference reflectively, which is uglier and pointless given WP-U02 deletes the dependency.

**Later:** WP-U02 removes StarterAssets entirely. The Editor scripts can then take their own asmdef.

### 2 · `Auth/*` ↔ `SceneFlow` — **circular. Not changed. Reported.**

```
WalletService.cs:60,125    → SceneFlow.Ensure().Auth
CaseFileService.cs:51,58   → SceneFlow.Ensure().Auth
SceneFlow.cs:43,45         → new MockAuthService() / AddComponent<HttpAuthService>()
```

**Why it exists:** `SceneFlow` is the de facto service locator and owns the auth service; the network services need the base URL and the acting player, and reach back up to get them.

**The block:** this is a **genuine cycle**, so `Network` cannot be split from `UI` without breaking it. Splitting them was the roadmap's plan.

**Changed: nothing.** Per constraint 4, the options were extract an interface, invert, or report. Inverting means introducing the composition root — which **is** WP-U03. Doing it here would be the broad architecture rewrite U01 was told not to attempt. So `Auth/*` stays inside `TRP23.UI` for now.

**Later — WP-U03.** `GameContext` constructs services and injects `apiBase` and an `ISessionProvider`; services stop reaching upward; `TRP23.Network` becomes extractable. **This is the single largest structural debt remaining after U01**, and it is already scheduled.

### 3 · `TrapMinimap` owns cursor and pause — **suspicious, still valid, not changed**

`TrapMinimap.ApplyCursor()` and `ApplyPause()` set `Cursor.lockState`, `Cursor.visible` and `Time.timeScale` **for the whole game**, every frame, reading `PointerFocus` and `GameFreeze`.

**Why it exists:** deliberately. Both registers exist because two scripts writing the same global state produce a cursor that flickers or a HUD that cannot be clicked — a fight that had already happened. One applier is correct; the questionable part is that the applier is *the map*.

**Does the new graph make it invalid?** **No.** The registers moved to `Core`, `TrapMinimap` is in `World`, and `World → Core` is permitted. It compiles and the arbitration still works.

**Changed: nothing**, per constraint 5 — smallest safe change only, and none was required.

**Later:** the applier belongs on a persistent systems object created by `GameContext` (WP-U03), not on a map that could in principle be disabled. Recorded as debt, not urgent.

### 4 · `Core` purity — **confirmed achievable**

All three Core files were already free of `UnityEngine` (only `System.Collections.Generic`), so `noEngineReferences: true` was set. Nothing had to change to make it true — and now nothing can quietly make it false, because `Core.csproj` compiles with no stubs at all.

## Constraint compliance

| # | Constraint | Compliance |
|---|---|---|
| 1 | Do not begin WP-U02 | ✅ not started. `ThirdPersonController.cs` untouched |
| 2 | No `IWorldClock` / `IWeatherState` / world-state endpoint | ✅ none written. `Core` is where they will go — a `World → Core → UI` shape reads them without either domain seeing the other |
| 3 | Do not refactor `Assets/World` internally | ✅ **zero edits** to any World script. Two files moved out; none modified |
| 4 | Prefer extract / invert / report over rewriting | ✅ #1 extracted by relocation, #2 **reported not fixed**, #3 reported |
| 5 | `TrapMinimap` cursor/pause is suspicious | ✅ documented; graph does not invalidate it; unchanged |
| 6 | Conservative assembly count | ✅ **three**, not the nine proposed |
| 7 | Future controller must not need `Character → UI` or `Character → World` | ✅ `InputSystem_Actions` is a project asset, not owned by an assembly. `PlayerRig` stays in World and couples via `GetComponent<CharacterController>()` — a UnityEngine type, not ours — so a `Character` assembly referencing only `Core` and `Platform` is achievable |
| 8 | Preserve scene and prefab references | ✅ only static classes and editor scripts moved; `.meta` GUIDs preserved; no `MonoBehaviour` moved. `TrapGame.unity` still resolves `TrapHudController` by GUID |

## Verification

```
npm run check:csharp   ✅ 3 assemblies build, 0 errors
npm run check:world    ✅   npm run check:trap  ✅ (both implementations)
npm run check:repo     ✅   npm run check:api   ✅ (52)
npm run build ✅  npm run test:api ✅  npm run validate:rooms ✅
```

Plus the three deliberate-violation tests above.

## ⚠️ Not verified

**Unity is not available in this environment — no licence.** The editor has not opened this project since the change.

Static inspection covers the compile graph, and the three csprojs mirror the asmdefs deliberately so CI catches what the editor would. What CI **cannot** confirm:

- Unity accepts the three `.asmdef` files and generates the expected assemblies
- The `UnityEngine.UI` and `Unity.InputSystem` reference names resolve in-editor
- `Assets/Editor/` compiles into `Assembly-CSharp-Editor` and still sees `StarterAssets`
- `TRAP > Build World Test Scene` and `TRAP > Build UI` still appear and run
- Both scenes still play and resolve their `MonoBehaviour` GUIDs

**A human must open Unity and confirm those five.** Recorded as **H-12**.

## Done

4 August 2026.
