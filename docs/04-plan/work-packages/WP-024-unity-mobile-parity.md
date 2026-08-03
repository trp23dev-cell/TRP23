# WP-024 · Unity mobile parity with the deployed web build

| | |
|---|---|
| **Horizon** | 1 |
| **Owner** | AI + **HUMAN** (device testing) |
| **Effort** | L |
| **Status** | ⬜ open |
| **Depends on** | WP-010, WP-011, WP-021 |
| **Branch** | `wp/024-unity-mobile-parity` |

## Why

The web build deployed on Railway works on a phone today: landscape lock, thumb joystick, tap-to-enter, a HUD that fits under the notch. **Unity currently has none of that** — it has a fly camera, a desktop HUD and mouse capture.

Before Unity can replace anything, it has to be at least as good as the thing it replaces. The founder's bar, stated plainly: *"UI ON POINT with what we have in Railway, and all functions work as they should."*

## What

A feature-by-feature parity matrix between the deployed web build and Unity, and then the work to close it. Everything the web build does on a phone, Unity does on a phone.

Known gaps to close, from the audit and the code:

| Web build has | Unity has | Gap |
|---|---|---|
| Landscape rotate gate | — | Build it |
| Virtual joystick, left thumb | — | Build it |
| Tap-to-enter proximity prompt | mouse only | Touch input path |
| Minimap + big map + compass | `TrapMinimap.cs` | Verify on a small screen |
| Chapter interiors and doors | — | WP-010 |
| Case file | ✅ HUD button | Verify on touch |
| Store, bank, account panels | ✅ | Hardcoded 3-item catalogue → WP-011 |
| Product inspect viewer | — | Build it |
| Progress-driven day arc | `WorldAtmosphere.cs` | Verify parity |
| Guest session + login + 2FA | `HttpAuthService` | Verify end to end |
| Landmark waypoints | ✅ | Verify |

## Not included

WebGL (see **WP-025** — that is a different build with different constraints) · new features not present in the web build · console input.

## Design notes

**Do not port the web UI markup.** Unity's UI Toolkit already mirrors the visual language in `TrapTokens.uss`. Parity means *the player can do the same things and it looks like the same brand* — not that the DOM was translated element for element.

**The mid-range Android is the target that decides everything.** A flagship phone will run 4 km² of Lincoln; a three-year-old Android is where the budget gets set (see `RELEASE-AND-PLATFORMS.md`).

**The map ships with the app** — see [WP-026](WP-026-offline-map.md). What remains on mobile is a *rendering* budget (how much geometry is live at once), not a delivery one.

**Touch and gamepad are the same problem.** Both are "no mouse, no hover". Building touch properly now makes the console requirement mostly free — so do it once, through Unity's Input System, which is already in the manifest.

## Acceptance criteria

- [ ] Parity matrix published, every row either ✅ or a tracked gap
- [ ] Every web-build function works in Unity on a phone
- [ ] Landscape lock, joystick and tap-to-interact all present
- [ ] Runs within the mobile performance budget on a **mid-range** Android
- [ ] A person who has used the web build can use the Unity build with no explanation
- [ ] No hover-only affordance anywhere

## Risks

| Risk | Likelihood | If it happens |
|---|---|---|
| Mid-range Android cannot hold the streamed city | **medium** | Reduce streaming radius and LOD before reducing the city |
| UI Toolkit fights small screens | medium | Budget for a mobile-specific layout, not just scaling |
| Parity becomes an infinite list | medium | The matrix is the fence. Anything not in the web build is a new feature and a new WP |

## Done

*Not yet.*
