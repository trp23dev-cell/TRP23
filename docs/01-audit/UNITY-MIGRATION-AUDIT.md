# Unity Migration Audit

**Date:** 4 August 2026 · **Scope:** `Unity/TRP23` and every repository system Unity must consume
**Status:** investigation and design. **No refactor performed.** Nothing deleted, nothing moved.
**Companions:** [UNITY-TECHNICAL-ARCHITECTURE](../03-technical/UNITY-TECHNICAL-ARCHITECTURE.md) · [PLATFORM-ARCHITECTURE](../03-technical/PLATFORM-ARCHITECTURE.md) · [UNITY-MIGRATION-ROADMAP](../04-plan/UNITY-MIGRATION-ROADMAP.md)
**Builds on:** [MASTER-REPOSITORY-AUDIT](MASTER-REPOSITORY-AUDIT.md) — this does not repeat it.

> **Verification limit, stated up front.** There is no Unity licence in this environment. Nothing here was run in the editor. C# is verified by `npm run check:csharp`, which compiles against hand-written stubs; geometry by `npm run check:world`. **Scene contents, prefab wiring, rendering and runtime behaviour are read from source and asset files, not observed.** Every claim below is evidenced by a file, a setting or a command — where it is inference, it says so.

---

## 1. Executive assessment

Unity has **a genuinely good world and almost no game**.

`Unity/TRP23/Assets/World/Scripts` is ~3,300 lines of careful, well-reasoned code that streams real Lincoln — OSM footprints on Environment Agency LIDAR terrain, triangulated into meshes, collided, textured, lit and minimapped. It shares tile data with the web client by design. This is the most valuable code in the repository and **nothing in this audit proposes changing it**.

`Assets/UI/Scripts` is ~1,100 lines that authenticate, show a HUD, and now carry the case file. It works.

Between those two there is nothing. **There is no game layer at all**: no chapter flow, no mission system, no interaction framework, no NPCs, no inventory in-client, no save beyond a session token, no state machine of any kind. `TrapHudController` holds a hardcoded three-item shop catalogue because there is nowhere else for it to live.

The migration is therefore **not a port**. Almost nothing needs moving from the web client, because the web client's gameplay is six hand-built rooms that the Unity direction supersedes. The migration is **building the missing middle**, on top of a world that already works, against a backend that is already server-authoritative.

That is a much better position than "rewrite the game in Unity". It is also a more dangerous one, because a missing middle is exactly where architecture gets invented ad hoc, one `FindAnyObjectByType` at a time.

### The five things that matter most

| # | Finding | Severity |
|---|---|---|
| 1 | **A fresh clone cannot build the player.** 3 of 273 StarterAssets files tracked; `PlayerArmature.prefab` is not among them | 🔴 blocks CI, blocks a second developer |
| 2 | **No assembly definitions.** Everything is one `Assembly-CSharp` | 🟠 compounds daily |
| 3 | **No tests of any kind** in the Unity project | 🟠 |
| 4 | **The tracked input actions asset is unused**; the one actually used is untracked | 🟠 and slightly absurd |
| 5 | **No content is server-driven in Unity** — hardcoded catalogue, hand-copied geo constants | 🟠 contract drift |

---

## 2. The Unity project, as it actually is

### 2.1 Foundations

| | Evidence | Note |
|---|---|---|
| Unity | **6000.3.8f1** | `ProjectVersion.txt` |
| Pipeline | **URP 17.3.0** | `manifest.json`. `PC_RPAsset` + `Mobile_RPAsset` + matching renderers exist under `Assets/Settings/` |
| Input | **Input System 1.18.0**, `activeInputHandler: 1` | New system only — the old one is off |
| Colour space | not asserted | Not confirmed from source; check in editor |
| Scripting backend | not set per-platform | `scriptingBackend:` empty, `apiCompatibilityLevel: 6`. **IL2CPP is required for iOS and consoles** — see WP-U04 |
| Quality levels | **2** | Thin for PC + mobile + console |
| Product name | `TRP23`, company `DefaultCompany`, version `0.1.0` | Placeholders |

**Packages present and relevant:** `ai.navigation` 2.0.10 (navmesh — installed, unused), `inputsystem`, `render-pipelines.universal`, `test-framework` 1.6.0 (**installed, zero tests**), `timeline`, `ugui`, `visualscripting`, `multiplayer.center` 1.0.1.

**Notable absences:** no Addressables, no Cinemachine (deliberate — `TrapWorldSetup` explains the camera parents to the controller instead), no Localization, no analytics SDK, no DOTS.

`com.unity.visualscripting` and `com.unity.multiplayer.center` appear to be Unity template defaults and are used by nothing. Removal is safe but low value — noted, not urgent.

### 2.2 Scripts, by domain

**28 tracked `.cs` files, ~5,710 lines** (including the 512-line third-party controller).

#### World — `Assets/World/Scripts` · ~3,300 lines · **the crown jewels**

| File | Lines | State | Verdict |
|---|---|---|---|
| `BuildingMeshBuilder.cs` | 663 | 🔵 working | **Retain.** Also compiled by `check:world` |
| `WorldStreamer.cs` | 457 | 🔵 working | **Retain**, refactor loading source (WP-026) |
| `TrapMinimap.cs` | 447 | 🔵 working | **Retain**, extract cursor/pause ownership |
| `CityTextures.cs` | 351 | 🔵 working | **Retain** |
| `SurfaceMeshBuilder.cs` | 301 | 🔵 working | **Retain** |
| `WorldCollision.cs` | 237 | ✅ tested | **Retain.** Covered by `check:world` |
| `MapClient.cs` | 164 | 🔵 working | **Retain**, becomes one of two loaders |
| `TileModels.cs` | 152 | 🔵 working | **Retain** — the wire DTOs |
| `FlyCamera.cs` | 150 | 🔵 dev tool | Retain as an editor affordance; must not ship |
| `PlayerRig.cs` | 140 | 🔵 working | **Retain.** Solves a real streaming problem well |
| `CameraBoom.cs` | 137 | 🔵 working | Retain |
| `WorldAtmosphere.cs` | 131 | 🟡 partial | Retain. `cleared` is an **inspector slider**, not wired to progression |
| `TerrainMeshBuilder.cs` | 108 | 🔵 working | Retain |
| `TrapGeo.cs` | 53 | ⚠️ **duplicated** | Retain, but generate — see §5 |
| `PointerFocus.cs` | 35 | ✅ good pattern | **Retain and extend.** The right answer to shared-resource arbitration |
| `GameFreeze.cs` | new | ✅ | Same pattern, added 4 Aug |

**Assessment.** This is the strongest code in the repository and it is not prototype-grade by accident — the comments record the specific failures each decision came from. The one architectural smell is that `TrapMinimap` owns cursor *and* pause application for the whole game, which is a lot of authority for a map.

#### UI — `Assets/UI/Scripts` · ~1,100 lines

| File | Lines | State | Verdict |
|---|---|---|---|
| `TrapHudController.cs` | ~290 | 🟡 partial | Retain, but **strip the hardcoded catalogue** and split. It is becoming the god object |
| `TrapCardController.cs` | ~170 | ✅ verified 4 Aug | Retain |
| `TrapMenuController.cs` | 137 | 🔵 working | Retain |
| `SceneFlow.cs` | 68 | 🟡 | **This is the de facto service locator.** Formalise it (§6) |
| `Auth/HttpAuthService.cs` | 192 | 🔵 working | Retain behind an interface — already is |
| `Auth/WalletService.cs` | 177 | 🔵 working | Retain |
| `Auth/CaseFileService.cs` | new | ✅ | Retain — the template for future services |
| `Auth/MockAuthService.cs` | 87 | ⚠️ **duplicated** | **Retire.** Re-implements the server's signup regex by hand |
| `Auth/AuthModels.cs` | 63 | 🔵 | Retain as **DTOs only** — do not let them become domain models |
| `Auth/IAuthService.cs` | 16 | ✅ | Good |
| `CaseFile/TrapCardState.cs` | new | ✅ **best-in-repo** | Pure logic, no engine surface, held to a shared table with JS |

#### Editor — 526 lines

`TrapWorldSetup.cs` (360) builds the world scene in one click; `TrapUiSetup.cs` (166) builds the UI. **Retain both** — deterministic scene assembly is the right instinct and will matter more, not less.

### 2.3 What does not exist

Stated plainly, because absence is the main finding.

| Expected | Present? |
|---|---|
| Assembly definitions | ❌ **none** — one `Assembly-CSharp` |
| Tests (EditMode or PlayMode) | ❌ **none**, despite `test-framework` installed |
| ScriptableObjects for content | ❌ none (only Unity's tutorial `Readme`) |
| Addressables | ❌ not installed |
| `Resources/` | ❌ absent (**good** — it is a trap) |
| `StreamingAssets/` | ❌ absent (**will be needed** — WP-026) |
| Platform-conditional code | ❌ **zero** `UNITY_ANDROID` / `UNITY_IOS` / `SystemInfo` |
| Save system | ❌ PlayerPrefs holds a session token, nothing else |
| Game state / chapter flow | ❌ none. `_level` is hardcoded `0` |
| Interaction framework | ❌ none |
| NPCs | ❌ none. Navmesh package installed, unused |
| Audio | ❌ none beyond StarterAssets footsteps |
| Localisation | ❌ none |

### 2.4 Scenes

`TrapMenu.unity` (12 KB) and `TrapGame.unity` (33 KB), both in build settings. `SampleScene.unity` and `MAIN.unity` exist and are **not** in the build — dead, harmless, leave them.

`TrapGame` contains `TrapWorld`, `Sun`, `EventSystem`, `TrapHudUI` with `TrapHudController`. One flat scene. **No bootstrap scene, no persistent-systems scene, no additive loading.** `SceneFlow` survives the transition via `DontDestroyOnLoad`, which works but means the object graph depends on which scene you entered from — the exact cause of the "sign in" bug on 4 August.

---

## 3. 🔴 The finding that blocks everything else

**A fresh clone of this repository cannot build a playable game.**

```
StarterAssets tracked:  3 files   (ThirdPersonController.cs, its .meta, license.txt)
StarterAssets on disk:  273 files
PlayerArmature.prefab tracked:  0
```

`.gitignore` excludes `Unity/**/Assets/StarterAssets/` and tries to re-include one script. **Git cannot re-include a file whose parent directory is excluded** — the negation appears to work only because the file was committed before the rule existed.

Consequences, all of them real today:

- **CI can never build the game.** It can compile scripts (it does) but cannot produce a player.
- **A second developer gets no character.** `TrapWorldSetup` detects the missing prefab and falls back to `FlyCamera`, saying so in the console. Graceful, and still not a game.
- **The `.inputactions` actually used is untracked**, while the tracked one is unused (§4).
- **Consoles and mobile stores need reproducible builds.** This forecloses that.

`.gitignore` records this as a deliberate decision — 86 MB of character art, permanent git weight, "cannot be undone by a later commit". That reasoning was sound *for an experiment*. It is not sound for the authoritative client.

**Three options, in order of preference:**

| | Cost | Result |
|---|---|---|
| **A · Own the controller** | ~M | Write a ~300-line character controller against `InputSystem_Actions`. No third-party dependency, no licence question, fully tracked. Recommended |
| **B · Commit Starter Assets** | 86 MB, permanent | Immediate, reversible only by history rewrite. Unity Companion Licence permits it |
| **C · Package dependency** | ~S | Only if a suitable licensed package exists; adds lock-in |

**Recommendation: A.** The project already patches `ThirdPersonController` twice and cannot compile-check it. Owning ~300 lines is cheaper than carrying an uncheckable dependency into a console submission — and this is the one place where a rewrite is genuinely justified by evidence.

---

## 4. The input situation

Both are true simultaneously:

- `Assets/InputSystem_Actions.inputactions` is **tracked**, and already defines control schemes for **Keyboard&Mouse, Gamepad, Touch, Joystick and XR**, with `Player` (Move, Look, Interact, Jump, Sprint, Crouch, Attack, Previous, Next) and `UI` (Navigate, Submit, Cancel, Point, Click, ScrollWheel…) maps. It is bound in `EditorBuildSettings` as the project-wide actions asset.
- **Nothing uses it.** `ThirdPersonController` uses `StarterAssets.inputactions`, which is untracked.

So the asset that would give gamepad and touch for free is sitting unused, and the one in play cannot be checked out. Resolving §3 by option A resolves this at the same time: a controller written against `InputSystem_Actions` gets keyboard, gamepad and touch schemes immediately, which is most of the cross-platform input requirement.

---

## 5. Duplication between Unity and the web client

Audit **D9** in the master audit. Current instances:

| Duplicated | Web | Unity | Risk |
|---|---|---|---|
| Signup validation | `mockApiServer.js:13-15` | `MockAuthService.cs` hand-typed regex | Drifts silently. **Retire the mock** |
| Projection constants | `src/world/geo.js` | `TrapGeo.cs` hand-copied | **A wrong constant mirrors the city** and reads as corrupt map data |
| Tile parsing / mesh building | `mapStream.js`, `buildingMesh.js` | `MapClient`, `BuildingMeshBuilder` | Unavoidable across JS/C#. Acceptable — the *data* is shared |
| Product catalogue | `/api/content` | `TrapHudController` hardcoded 3 items | **Unity shows a fiction** |
| Chapter naming | content v3 says CHAPTER | HUD says `LEVEL 01` | Stale copy |
| Trap card state machine | `trapCard.js` | `TrapCardState.cs` | ✅ **solved** — one shared table, `check:trap`. **This is the pattern to copy** |

`TrapCardState.cs` + `trapCard.cases.json` is the answer to this whole category and it already caught a real divergence. Extend it: generate `TrapGeo.cs` constants from `geo.js` (the export script already emits `exports/unity-world.json`), and make the catalogue server-driven.

---

## 6. Non-Unity systems — reuse classification

**A** reuse unchanged · **B** reuse behind an adapter · **C** reimplement in Unity, server keeps authority · **D** reference only · **E** retire

| System | Where | Class | Why |
|---|---|---|---|
| Authentication, sessions | `mockApiServer.js`, `sqliteStore` | **A** | Works, hardened, rate-limited, tested. `HttpAuthService` already consumes it |
| 2FA (TOTP) | `server/totp.js` | **A** | RFC 6238, works. Unity has no UI for it yet |
| Account recovery | new, 4 Aug | **A** | Needs a mail provider (H-11), not a rewrite |
| Player profile | `/api/player/:id` | **B** | Reuse, but Unity needs a typed client. `progress` is a wholesale-replaced blob — hazardous, see §7 |
| Case file | `/case-file` | **A** | Narrow route, designed for exactly this |
| Wallet / bank / ledger | `sqliteStore` | **A** | Atomic, never negative, server-authoritative. **Never move to the client** |
| Transactions / idempotency | — | **A**, incomplete | Single-entry, no idempotency keys (D2, WP-005). Fix server-side |
| Products / catalogue | `/api/commerce/products` | **B** | Unity must consume it instead of hardcoding |
| Stock / inventory | `sqliteStore` | **A** | Reserved inside the checkout transaction |
| Orders / fulfilment | `/api/commerce/*` | **A** for orders, **D** for fulfilment | Fulfilment writes a row and a fake tracking number |
| Real payments | — | **does not exist** | Not a migration concern |
| World locations | `defaultWorld.js` | **E** | Superseded by the real map; still validates `locationId`. Retire with the premises system |
| Missions / rewards | content + `/rewards/claim` | **C** | Server owns amounts (fixed 3 Aug). Unity owns presentation and the state machine |
| Content / chapters | `defaultContent.js`, versioned | **B** | Good model. Unity should consume it, ideally as generated ScriptableObjects |
| Weather / day-night | `MOODS` in both clients | **C** | Presentation is Unity's. **World time must become server state** — §7 |
| Lincoln map generation | `scripts/build-map-tiles.mjs` | **A** | 1,189 lines, licence-clean, irreplaceable. Do not touch |
| OSM / LIDAR processing | `scripts/lib/*` | **A** | Same |
| Map tiles + manifest | `/api/map/*` | **A**, plus bundling | Keep the route for updates; ship the data (WP-026) |
| Unity handoff export | `export-unity-handoff.mjs` | **B** | Should generate `TrapGeo` constants too |
| Three.js gameplay | `src/game.js` | **D** | Reference for the chapter loop. Not ported |
| Admin / CMS | `admin.html` | **A** | Web's job permanently |

---

## 7. Source-of-truth matrix

**The rule:** if it has value, or another player could be affected by it, the server owns it. Unity may cache and predict; it may never decide.

| State | Authority | Unity's role | Notes |
|---|---|---|---|
| Identity, credentials | **Server** | send, never store | ✅ |
| Session token | **Server** issues | PlayerPrefs cache | ⚠️ PlayerPrefs is not a secret store — acceptable now, revisit for consoles |
| 2FA secret / recovery codes | **Server** | never sees them | ✅ |
| Trap Coin balance | **Server ledger** | display only | ✅ `WalletService` already correct |
| Bank balance, transfers | **Server** | display only | ✅ |
| Purchases / orders | **Server** | request only | ✅ |
| Real-money payment | **Payment provider** | never touches it | Does not exist yet |
| Inventory / ownership | **Server** | display | ✅ |
| Mission completion | **Server** validates | reports *what*, never *what it is worth* | Fixed 3 Aug |
| Chapter progression | **Server** (`progress`) | reads, requests advance | ⚠️ wholesale-replaced blob |
| Case file statement | **Server** | display + write via narrow route | ✅ |
| Standing / reputation | **Server** | display | Not built |
| Player transform | **Unity** | authoritative in session | Persist coarsely — district, not centimetres |
| Character appearance | **Server** | renders | 🔶 **Decision needed.** Cosmetics may become purchasable → server |
| World time / day-night | **🔶 UNDECIDED** | — | Single-player: Unity. Shared/events: server. **Decide before missions depend on it** |
| Weather | **🔶 UNDECIDED** | — | Same. Cheap now, expensive after content depends on it |
| NPC state | **Unity** initially | full authority | Server later if NPCs remember across sessions |
| Property / tenancy | **Server** | display | Not built. Real rent → server, absolutely |
| Vehicles | **🔶 UNDECIDED** | — | Not built. Ownership → server; physics → client |
| Owned businesses | **Server** | display | Not built |
| Achievements | **Server**, mirrored to platform | reports | Consoles require platform mirroring |
| Local settings | **Unity** | full authority | Graphics, audio, controls. Never server |
| Save data | **split** | see [PLATFORM-ARCHITECTURE §7](../03-technical/PLATFORM-ARCHITECTURE.md) | **A local save must never be authoritative for value** |

### Decisions genuinely required

1. **World time and weather — client or server?** Blocks any mission that says "come back tomorrow evening".
2. **Character appearance — server or local?** If cosmetics are ever sold, it must be server. *Recommend server now.*
3. **`progress` blob or typed columns?** It is wholesale-replaced, which already forced a narrow route for the case file. Every future field repeats that. *Recommend typed columns.*
4. **Player transform granularity.** *Recommend district + interior, not exact coordinates.*

---

## 8. Security and economy boundary

The master audit found and fixed three client-controlled money paths. The migration must not re-open them, so this is the standing rule:

**Unity must never be trusted with:** currency amounts · reward values · prices · discount codes · inventory ownership · order creation · progression that gates value · fulfilment state · another player's anything.

**Current state:** ✅ enforced and tested. `check:api` is 52 checks including 12 economy-integrity checks that exist *because* `/api/rewards/claim` paid 999,999,999 on a 150-coin mission for two weeks.

**Open server-side gaps** (not migration issues, but they become worse under a client that retries): no idempotency keys (WP-005), single-entry ledger, no replay protection on claims beyond dedupe. A mobile client on a flaky connection **will** retry — fix before Unity does anything transactional.

No DRM, no anti-cheat. Out of scope and premature.

---

## 9. Migration risk register

| # | Risk | Likelihood | Impact | Mitigation | Early warning |
|---|---|---|---|---|---|
| R1 | **Fresh clone cannot build** | **certain — true now** | High | §3 option A | A new dev sees a fly camera |
| R2 | **Architectural drift from AI-generated code** | **high** | High | Assembly boundaries make wrong dependencies *fail to compile*. WP-U01 | `FindAnyObjectByType` count rising |
| R3 | Mobile performance on mid-range Android | high | High | Budgets before content; measure early | Frame time on the oldest device |
| R4 | One assembly → 60s+ compiles | high | Medium | WP-U01 | Iteration time |
| R5 | Client/server duplication drifts | **high** | High | Shared-table pattern (`check:trap`) | Two definitions of one rule |
| R6 | Asset explosion | medium | High | Addressables when it earns it, not before | Build size per release |
| R7 | World-scale float precision | low-medium | High | Lincoln is ±2 km — fine. **Re-evaluate before a second city** | Jitter far from origin |
| R8 | Save incompatibility | medium | Medium | Version from the first save | A migration that cannot be written |
| R9 | Multiplayer assumptions embedded early | medium | High | No networking package until a use case exists | "We'll need this for multiplayer" in a PR |
| R10 | `TrapHudController` becomes the god object | **high** | Medium | Split now, while it is 290 lines | Every feature adds a field to it |
| R11 | Console requirements retrofitted | medium | High | Gamepad + safe areas from the first screen | A hover-only affordance ships |
| R12 | Unity work outpaces server capacity | medium | Medium | Server-first for anything valuable | Client holds state "temporarily" |
| R13 | ThirdPersonController patches lost | medium | Low-Medium | §3 option A removes the file | A third patch is proposed |

---

## 10. Legacy web strategy

Confirms [audit §G](MASTER-REPOSITORY-AUDIT.md) with migration detail.

**The web build becomes:** the brand site · account management · the real-product storefront · community and news · **admin/CMS permanently** · a lightweight instant-play Lincoln teaser.

| Web system | Fate |
|---|---|
| `admin.html` + `src/admin.js` | **Maintain** — web's job for good |
| Auth / account UI | **Maintain** — better on web |
| Storefront | **Grow** — the commercial surface |
| `src/game.js` chapter loop | **Freeze.** Bug fixes and content data only |
| `src/world/*` | **Freeze.** Still the reference implementation for tile streaming |
| `FP FREE ROAM TEST PHASE 1/` | **Retire** — superseded, tracked, 479 lines |
| `TRAP-MADE-IT-game.html` (1.1 MB) | Keep as history; never maintain |

**Never two authoritative game implementations.** Anything gameplay-shaped built on the web from here is a prototype, and must be labelled one.

---

## 11. Vertical slice recommendation

**The High Street between the Stonebow and the foot of Steep Hill.** Roughly 400 m of real street.

Chosen because it contains, in reality: **Kimani's shop** (the barber booking — the thing nobody else can build), the **NatWest on Mint Street** (the bank, already the map origin), dense continuous shopfronts (commercial-quality density without modelling a city), the start of the Steep Hill climb (proves LIDAR terrain visibly), and enough foot traffic to justify pedestrians.

Full scope, acceptance criteria and exclusions in [UNITY-MIGRATION-ROADMAP §4](../04-plan/UNITY-MIGRATION-ROADMAP.md).

---

## 12. Checks run

```
npm run check:repo       ✅   npm run check:api     ✅ (52 checks)
npm run validate:rooms   ✅   npm run check:trap    ✅ (both implementations)
npm run build            ✅   npm run check:csharp  ✅ Build succeeded, 0 errors
npm run test:api         ✅   npm run check:world   ✅
```

**Not run — no Unity licence in this environment:** editor compilation, EditMode/PlayMode tests (none exist), player builds for any platform, scene load, rendering, frame timing. Section 2 is read from source and asset files. **This is stated rather than glossed.**

---

## 13. Answers needed from the owner

| # | Question | Blocks | Recommendation |
|---|---|---|---|
| 1 | Character controller — own it, or commit Starter Assets? | CI, second developer, console builds | **Own it** (§3 option A) |
| 2 | World time and weather — client or server? | Any time-dependent mission | Server for time, client for weather presentation |
| 3 | Character appearance — server or local? | Character creation | **Server** — cosmetics will be sold |
| 4 | `progress` blob → typed columns? | Every new persisted field | **Yes**, before more fields |
| 5 | Adopt Addressables now or later? | Asset pipeline | **Later.** No consumer yet (§10 R6) |
| 6 | Is the High Street slice the right area? | All of Horizon 1 | Yes — it is where the barber is |

---

*Investigation only. No production code changed in this pass.*
