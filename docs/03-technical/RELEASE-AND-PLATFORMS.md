# Release and Platforms

**Date:** 3 August 2026 · **Status:** design
**Answers:** founder instruction 3 August — *"UNITY alone, mobile download (iOS/Android), PC game download, and eventually consoles."*

---

## Targets

| Platform | Horizon | Store | Hardest part |
|---|---|---|---|
| **PC (Windows)** | H1 | Direct download → Steam later | Least constrained. Start here |
| **Android** | H1 | Google Play | Mid-range devices vs 4 km² of Lincoln |
| **iOS** | H1 | App Store | Review, and IAP rules on anything resembling currency |
| **macOS / Linux** | opportunistic | — | Nearly free from Unity; not a priority |
| **Consoles** | H5 | Certification | Approval, and it constrains decisions **now** |

**The web build is not on this list.** It stays as the instant-play shop window — the one thing Unity can never match — frozen at its current feature set.

---

## Why consoles are decided now

Consoles are years away. Deciding for them is not premature, because certification **forbids things we might otherwise build**, and retrofitting is expensive.

### The four that change decisions today

**1 · Real-money rent for player shops.** Selling ongoing digital access is exactly what platform billing rules scrutinise. **Keep tenancy billing web-only, outside the game client** ([D-115](../04-plan/DECISION-REGISTER.md)). Players manage a shop on the website and see it in-game. Build it as an in-client subscription and you may have to tear it out.

**2 · User-generated content needs moderation before approval.** Tier 1 tenancy — players decorating spaces — is UGC. Shop names, signage, layouts. Plan moderation **with** the feature.

**3 · Gamepad from the first screen.** Every UI built from Horizon 1 must be fully navigable without a mouse: focus order, no hover-only affordances, on-screen keyboard for text entry. The trap card is a **text input** — on a console that is a controller keyboard, and it needs designing for, not adapting.

**4 · Age ratings ask about drug references.** Chapter names like *THE KITCHEN*, and a setting rooted in the trap, will be questioned. The Bible's answer is genuinely good — this is a journey *out*, and the world literally brightens as you leave it. But that has to be **evidenced in the build**, not asserted in a covering letter. Keep the mission grammar (`MISSION-DESIGN-BIBLE.md` §4) as the evidence.

### Also true

Offline play (a console cannot require a server for single-player) · certification requires stability under abuse — no crash on suspend, resume, or network loss mid-transaction · account linking across platforms · no external payment links in-client · long lead times, so submit early.

---

## Build matrix

| | PC | Android | iOS | Console |
|---|---|---|---|---|
| Render pipeline | URP | URP, reduced | URP, reduced | URP |
| Target frame rate | 60 | 30–60 | 60 | 60 |
| Texture budget | full | halved | halved | full |
| Streaming radius | 3×3 tiles | 2×2 | 2×2 | 3×3 |
| Shadows | dynamic | baked + one dynamic | baked + one dynamic | dynamic |
| Text entry | keyboard | touch | touch | controller keyboard |
| Payments | web | Play Billing / web | IAP / web | platform only |

URP is already the project's pipeline and is the right call — HDRP would rule out mobile entirely, and mobile is a launch target.

---

## Performance budgets

Set against the **worst** supported device, not the development machine. Provisional until measured on real hardware (WP-021).

| | PC | Mid-range Android |
|---|---|---|
| Frame time | 16.6 ms | 33 ms |
| Draw calls | < 2,000 | < 400 |
| Triangles | < 3 M | < 500 k |
| Texture memory | < 2 GB | < 512 MB |
| Streaming hitch | < 5 ms | < 10 ms |
| Cold start | < 15 s | < 25 s |

**Stable playability beats screenshots.** The directive is explicit: a stable 60 FPS unless another target is deliberately approved.

---

## Release process

1. Green CI on `main`
2. Tag the horizon
3. Build all targets from one commit — never a hand-built store binary
4. Smoke test on real devices, every target
5. Internal track first (TestFlight / Play internal testing)
6. Publish notes, tag, log

**Signing keys never touch the AI, never touch git.** The Apple `.p8` was committed once already and had to be revoked.

---

## Current state, honestly

- `capacitor.config.ts` exists; `ios/` and `android/` **do not**
- No `.env.*.example`; no release workflows
- The `ios:*`/`android:*` npm scripts wrap the **web** build, which is the frozen client — they will need repointing at Unity output, or removing
- Nothing has ever been built for a phone

Everything above is Horizon 1, WP-021.
