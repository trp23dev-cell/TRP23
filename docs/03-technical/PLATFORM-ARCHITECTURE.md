# Platform Architecture

**One project, five platforms, no platform code in gameplay.**

**Date:** 4 August 2026 · **Status:** proposed, for owner approval. **Not implemented.**
**Targets and budgets:** [RELEASE-AND-PLATFORMS](RELEASE-AND-PLATFORMS.md) — not duplicated here.
**Architecture:** [UNITY-TECHNICAL-ARCHITECTURE](UNITY-TECHNICAL-ARCHITECTURE.md) · **Evidence:** [UNITY-MIGRATION-AUDIT](../01-audit/UNITY-MIGRATION-AUDIT.md)

---

## 1. The rule

> **No gameplay code may reference an Android, iOS, Windows or console API. Ever. Only the `Platform` assembly may, and gameplay talks to interfaces.**

Enforced by assembly references, not by discipline — see [the asmdef plan](../04-plan/UNITY-MIGRATION-ROADMAP.md#wp-u01).

**Current state: perfect, by accident.** There is not one `UNITY_ANDROID`, `UNITY_IOS` or `SystemInfo` reference in the project. Nothing to unpick. This document exists to keep it that way, because the cost of platform code leaking into gameplay is only paid at porting time, when it is too late to be cheap.

---

## 2. `IPlatformServices`

```csharp
public interface IPlatformServices
{
    IInputScheme      Input        { get; }
    ILocalStorage     Storage      { get; }
    ISafeArea         SafeArea     { get; }
    IQualityTier      Quality      { get; }
    IPlatformIdentity Identity     { get; }   // null until a store exists
    IAchievements     Achievements { get; }   // no-op until consoles
    ILifecycle        Lifecycle    { get; }   // suspend / resume / low memory
}
```

Unimplemented capabilities return a **no-op that says so in the log**, never a silent success. That is the same rule the mailer follows: a stub that pretends to work is how the coin faucet survived two weeks on a live deploy.

---

## 3. Input

**The luckiest finding in the audit:** `Assets/InputSystem_Actions.inputactions` is tracked and already defines **Keyboard&Mouse, Gamepad, Touch, Joystick and XR** schemes, with full `Player` and `UI` maps. It is bound project-wide in `EditorBuildSettings`.

**Adopted by WP-U02.** `TrapPlayerController` consumes it through `InputSystem.actions` — the Input System property that returns whichever asset is set project-wide, which is this one. Asset path and accessor are two names for the same thing; there is no second gameplay input asset.

So adopting it is not new work — it is *using what is already there*, and it delivers gamepad and touch nearly for free.

| Platform | Scheme | Notes |
|---|---|---|
| PC | Keyboard&Mouse | Cursor lock for look; **Escape toggles** (fixed 4 Aug) |
| PC / consoles | Gamepad | Every screen must be navigable without a pointer |
| Android / iOS | Touch | Scheme exists and the controller is compatible. **On-screen controls not built** — WP-024 |
| Consoles | Gamepad | Same scheme. Certification checks it |

### Three rules that cost nothing now and a rebuild later

1. **No hover-only affordance, anywhere.** Touch has no hover; gamepads have no pointer. A tooltip that only appears on hover is a feature two of five platforms cannot reach.
2. **Every action is rebindable from the first screen.** Also the cheapest accessibility win available.
3. **Prompts follow the active device.** `[E]` / `Ⓐ` / `TAP` from one source, resolved at display time.

**`C` toggles the case file** (added 4 August) is the shape: a discrete action, bindable to a key, a gamepad face button, or a screen tap, with no pointer required. Every panel should follow it.

---

## 4. Screen and safe area

| | |
|---|---|
| PC | 16:9 → 21:9, windowed and full-screen |
| Android | notches, punch-holes, gesture bars, 18:9 → 21:9 |
| iOS | notch, Dynamic Island, home indicator |
| Consoles | **TV title-safe margins are a certification requirement** |

One `ISafeArea` returning a rect; all HUD anchors inside it. The web build already learned this — `index.html` has a notch comment and a landscape gate. Unity has neither yet.

**Landscape only.** The web build enforces it; Unity must too. Portrait would mean a second HUD layout for no gain.

---

## 5. Quality tiers

Two levels exist. That is thin for PC + mobile + console, and `PC_RPAsset` / `Mobile_RPAsset` already exist unused-by-code under `Assets/Settings/`.

| Tier | Target | Chosen by |
|---|---|---|
| `Low` | Mid-range Android | device tier |
| `Medium` | Recent phones, low-spec PC | device tier |
| `High` | PC default, consoles | platform |
| `Ultra` | High-end PC | user only |

**Detected once at boot, overridable, persisted locally.** What varies: streaming radius (until the map is bundled — WP-026), LOD bias, shadow distance and cascades, texture limit, post-processing, crowd density.

**What must never vary:** anything that changes what a player can *do* or *see* competitively. A shop must be visible on every tier.

---

## 6. Storage

| Data | Where | Authority |
|---|---|---|
| Settings | `Application.persistentDataPath` | **Local** |
| Session token | Platform secure store, PlayerPrefs fallback | Server issues |
| Map cache | `persistentDataPath`, or bundled (WP-026) | Server builds |
| Content cache | `persistentDataPath` | Server |
| **Anything valuable** | **Server** | **Server** |

**PlayerPrefs holds the session token today.** On desktop that is a plain text file. Acceptable for a pre-launch build, **not** acceptable at console certification or for an account carrying real order history. Tracked, not urgent.

---

## 7. Saves

**Two kinds, and conflating them is the failure mode.**

**Local settings** — graphics, audio, bindings, subtitles. Versioned, migrated, disposable. Losing them is an annoyance.

**Authoritative player state** — currency, inventory, orders, progression, Standing. **Lives on the server.** The client holds a cache with a fetch timestamp, never a save file.

> **A local save must never be authoritative for anything with value.** If it can be edited with a text editor, it is not a balance — it is a suggestion.

**Versioning from the first save.** Every payload carries a schema version; migrations are append-only and never edited once shipped — exactly the `PRAGMA user_version` discipline `sqliteStore.js` already follows, and the reason content v3 reached players when v2 had not.

**Corruption:** write to a temp file, fsync, atomic rename. On parse failure, fall back to defaults and log — never crash, and never silently discard without saying so.

**Conflict resolution:** for settings, last-write-wins. For value, **there is no conflict** — the server is the only writer.

---

## 8. Lifecycle

| Event | Behaviour |
|---|---|
| Suspend (mobile / console) | Pause, flush settings, release the pointer. **Do not** assume return |
| Resume | Revalidate the session, refetch authoritative state, resume paused |
| Low memory (iOS especially) | Evict distant tiles and textures before the OS kills the process |
| Network lost | Read from cache marked stale; **refuse value writes**, do not queue |
| Network returned | Refetch, discard local guesses |
| Backgrounded mid-request | Coroutines die with the object — already the pattern; keep it |

**iOS memory pressure is the sharpest of these.** The OS terminates rather than degrades, and a 4 km² city with everything resident is exactly the profile it kills. Another reason bundling the map ([WP-026](../04-plan/work-packages/WP-026-offline-map.md)) is about eviction strategy as much as download size.

---

## 9. Console readiness — seams, not code

**No console SDK. No console-conditional code. No submission work.** Not now.

What is done now is only what is expensive to retrofit ([RELEASE-AND-PLATFORMS](RELEASE-AND-PLATFORMS.md) explains why consoles are decided early):

| Requirement | Now | Why now |
|---|---|---|
| Gamepad on every screen | ✅ design rule | Retrofitting a pointer-first UI is a rewrite |
| Title-safe margins | ✅ `ISafeArea` | Same shape as the notch problem |
| Achievements behind an interface | ✅ no-op | Platform-mirrored later |
| Identity behind an interface | ✅ no-op | Console accounts are not our accounts |
| **Real money never in the client** | ✅ enforced | Console purchases must go through the platform |
| Offline single-player | ✅ WP-026 | Certification expects it |
| No forced online | ✅ | Same |

**The commercial consequence, stated once:** shopfront rent is a real-money subscription, and platform holders take a cut of anything sold in-app. **Tenancy is billed on the web, outside the game client** — decided in [RELEASE-AND-PLATFORMS](RELEASE-AND-PLATFORMS.md), repeated here because it is the constraint most likely to be forgotten by someone reading only this file.

---

## 10. Build matrix

| Platform | Backend | Status |
|---|---|---|
| Windows PC | Mono or IL2CPP | Buildable in the editor · **not in CI** |
| Android | **IL2CPP, ARM64** | Not configured. Play Store requires 64-bit |
| iOS | **IL2CPP** | Not configured. Needs macOS + Xcode |
| Xbox / PlayStation | IL2CPP | Not started. Deliberately |

**`scriptingBackend` is unset** in `ProjectSettings.asset`. IL2CPP is mandatory for iOS and consoles, and it surfaces AOT problems — reflection, generic virtual methods, `JsonUtility` edge cases — that Mono hides. **Configure it early**, so those are found in a quiet week rather than during a submission.

**No platform can be built in CI today**, because the player prefab is untracked ([audit §3](../01-audit/UNITY-MIGRATION-AUDIT.md)). That is the first thing the roadmap fixes.
