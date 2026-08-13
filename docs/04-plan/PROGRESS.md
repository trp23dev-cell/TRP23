# Progress Ledger

**The single place that says what is done.** One row per work package.

**Updated:** 3 August 2026

> **A row is only ticked when the verification commands were actually run and the output is recorded in [`06-log/CLAUDE-EXECUTION-LOG.md`](../06-log/CLAUDE-EXECUTION-LOG.md).** Code being written is not done. "It should work" is not done. This rule exists because `_superseded/COMPLETION-STATUS.md` once marked 21 of 21 items COMPLETE against a system with no payment processor.

**Status key:** ✅ done and verified · 🔨 in progress · ⬜ open · 🚧 blocked · ⏸️ deferred · ❌ rejected

---

## Horizon 0 — Stabilise and understand

| WP | Title | Owner | Status | Evidence |
|---|---|---|---|---|
| [001](work-packages/WP-001-repository-audit.md) | Complete repository audit | AI | ✅ | [Audit](../01-audit/MASTER-REPOSITORY-AUDIT.md) · log S1. 271 files, 5 gates run, 4 defects reproduced |
| [002](work-packages/WP-002-close-money-paths.md) | Close client-controlled money paths | AI | ✅ | log S2. Mint→150, faucet→404, orders→401, deep link→200. `check:api` 18→32 checks |
| [003](work-packages/WP-003-docs-and-plan-system.md) | Docs restructure + plan system | AI | ✅ | This folder. log S6 |
| [004](work-packages/WP-004-continuous-integration.md) | Continuous integration | AI | ✅ | log S7. Two-job workflow; drift check verified in both directions; `__trapDebug` absent from bundle; prod CORS refuses private networks |
| [005](work-packages/WP-005-ledger-integrity.md) | Ledger idempotency + double-entry | AI | ⬜ | — |
| [006](work-packages/WP-006-founder-decisions.md) | Founder decisions resolved | **HUMAN** | 🔨 | 2 of 8 resolved — see [DECISION-REGISTER](DECISION-REGISTER.md) |
| [007](work-packages/WP-007-backups.md) | Backups + a tested restore | AI + **HUMAN** | ⬜ | — |
| [008](work-packages/WP-008-unity-health.md) | Unity health + package audit | AI + **HUMAN** | ⬜ | Unity confirmed running by founder 3 Aug; formal audit outstanding |
| [009](work-packages/WP-009-account-recovery.md) | Account recovery | AI | ✅ | log S7. 15 checks incl. the 2FA-bypass test. **No mail provider yet — H-11** |

**Horizon 0 exit:** ⬜ blocked on 005, 006, 007, 008.

---

## Horizon 1 — The Unity vertical slice

Full work packages are written **as each is picked up**, one horizon ahead — not now. Titles are committed; detail follows evidence.

| WP | Title | Owner | Effort | Status | Depends on |
|---|---|---|---|---|---|
| ~~010~~ | ~~Unity chapter/scene flow + game state~~ | — | — | 🗑️ | **superseded by U06** |
| ~~011~~ | ~~Server-driven content in Unity~~ | — | — | 🗑️ | **superseded by U09/U18** |
| 012 | Character creation — fixed archetypes | AI + art | L | ⬜ | D-06 |
| 013 | The commitment engine | AI | M | ⬜ | 005 |
| ~~014~~ | ~~Ambient life — Tier 1 NPCs~~ | — | — | 🗑️ | **superseded by U11** |
| ~~015~~ | ~~Premises system + one interior~~ | — | — | 🗑️ | **superseded by U08** |
| 016 | The bank, and Standing | AI | M | ⬜ | 013, 015 |
| 017 | **The barber booking** | AI + **HUMAN** | M | 🚧 | D-01, D-02, D-03 |
| 018 | Case file in Unity | AI | S | ✅ | log S8. Verified in the editor by the founder: writes, saves, survives close/reopen |
| ~~019~~ | ~~Versioned save/load~~ | — | — | 🗑️ | **superseded by U06** |
| ~~020~~ | ~~Performance budgets + scene validation~~ | — | — | 🗑️ | **superseded by U12** |
| 021 | Mobile builds on real devices | **HUMAN** + AI | M | ⬜ | 010 |
| 022 | Accessibility baseline | AI | S | ⬜ | 010 |
| 023 | Analytics with consent | AI | S | ⬜ | — |
| [024](work-packages/WP-024-unity-mobile-parity.md) | **Unity mobile parity with the deployed web build** | AI + **HUMAN** | L | ⬜ | 010, 011, 021 |
| [025](work-packages/WP-025-unity-on-the-website.md) | Unity on the website — WebGL feasibility spike | AI + **HUMAN** | S | ⬜ | 024 |
| [026](work-packages/WP-026-offline-map.md) | **Ship the map with the app** (5.8 MB — stop streaming on mobile) | AI + **HUMAN** | M | ⬜ | 008 |

**Unity migration queue** — full detail in [UNITY-MIGRATION-ROADMAP](UNITY-MIGRATION-ROADMAP.md), sequenced in [IMPLEMENTATION-DEPENDENCY-MAP](IMPLEMENTATION-DEPENDENCY-MAP.md).

> ⚠️ **Roadmap collision.** Entries `010`, `011`, `014`, `015`, `019` and `020` in the Horizon 1 table above **duplicate U06, U09, U11, U08, U06 and U12**. The **U-series supersedes them** — see the dependency map §1. They are struck through rather than deleted so nobody re-adds them.

| WP | Title | Owner | Effort | Status | Depends on |
|---|---|---|---|---|---|
| [U01](work-packages/WP-U01-assembly-definitions.md) | Assembly definitions | AI | M | ✅ | log S9. 3 assemblies; **all 3 boundaries proven by deliberate violation**; CI enforces the graph. **Unity editor unverified — H-12** |
| [U02](work-packages/WP-U02-owned-player-controller.md) | **Own the character controller** | AI | M | ✅ | log S10 + repair S11. `TrapPlayerController`; StarterAssets no longer required; fresh-clone audit clean; slope curve and freeze contract tested. **Unity runtime unverified — H-13** |
| U03 | Bootstrap + GameContext composition root | AI | M | ✅ | log S12. `SceneFlow` retired; **Auth↔SceneFlow cycle broken**; cycle guard in `check:repo`; first test assembly. **Unity unverified — H-14** |
| U04 | Platform abstraction + IL2CPP | AI + **HUMAN** | M | ⬜ | U01, U03 |
| U05 | Typed API client, generated geo constants | AI | M | ⬜ | U01, U03 |
| U06 | Game state + versioned save (incremental typing, D-120) | AI | L | ⬜ | U05 |
| U07 | Interaction framework | AI | M | ⬜ | U06 |
| U08 | Premises + Kimani's interior | AI + art | L | ⬜ | U07, D-01 |
| U09 | Server-driven content in Unity | AI | S | ⬜ | U05 |
| U10–U12 | High Street slice: dressing, pedestrians, budgets | AI | L | ⬜ | Phase B |
| U17a | Character visual seam + UMA preflight | AI | M | ✅ | log S13. Seam built, guarded, tested. Scale canon + 11 tests |
| U17b | Character framework route | AI | M | ✅ **ROUTE RESOLVED — ART ASSET REQUIRED** | log S14. UMA rejected (D-C01); fixed archetypes chosen (D-C02). **Not a technical blocker for other packages** |
| V02 | **High Street façade structure** | AI | L | ✅ | log S20. Bays, shopfronts, entrances, window alignment. Slice-gated. **Owner screenshots pending** |
| V01 | **Material + lighting baseline** | AI | S | ✅ | log S18. Albedo contract, normals, tonemapping, sun, MSAA. **Owner screenshots pending** |
| — | **Lincoln visual fidelity audit** | AI | M | ✅ | log S17. Read-only. [audit](../01-audit/LINCOLN-VISUAL-FIDELITY-AUDIT.md) + [roadmap](VISUAL-ROADMAP.md). **V01 recommended, not authorised** |
| U15a | **Phone shell** | AI | M | ✅ **verified** | log S15/S16. Shell + 6 apps; links rather than duplicates. Owner-verified in Unity; modal stacking repaired (ModalSurface) |
| U14–U22 | **Standing · Phone · NPCs · character · drops · entitlements · opportunities · flagship · bank** | AI + art | — | ⬜ | See [dependency map](IMPLEMENTATION-DEPENDENCY-MAP.md) §2 |
| [U13](work-packages/WP-U13-navigational-map.md) | Navigational map + route planning (road graph, not a straight line) | AI + design | L–XL | ⬜ **backlog** | U03, 026, U07 |

---

## Horizons 2–5

Titles only, deliberately. See [MASTER-PLAN §3](MASTER-PLAN.md). Writing detailed packages this far out would be invention.

---

## Carried debt

Known, accepted for now, tracked so it is never *forgotten* rather than *decided*.

| Ref | Item | Where it goes |
|---|---|---|
| D2 | Ledger single-entry, no idempotency keys | WP-005 |

| D7 | Two persistence models (relational + JSON blobs) | H2 |
| D8 | 1,790-line if-chain server, no router or validation layer | H2 |
| D9 | Duplicated contracts JS↔C# | Pattern solved in WP-018; apply in WP-011 |
| D10 | `src/game.js` monolith | Frozen client — will not be fixed |

| D12 | No GDPR posture, no age gate | WP-006 + H2 |

| D16 | Single-instance assumptions | H3 |
| — | `own2`/`own3` still purchase-gated | WP-010 |
| — | Unity HUD says "LEVEL", content says "CHAPTER" | WP-011 |
| — | `TrapWorldSetup.cs` not compile-checked (UnityEditor unstubbed) | pre-existing; would need UnityEditor stubs |

---

## Rejected

Recorded so they are not re-proposed. Rationale in [DECISION-REGISTER](DECISION-REGISTER.md).

| Item | Why |
|---|---|
| Google Street View as an asset source | Terms prohibit derivative 3D assets. Pipeline would be unusable |
| Blockchain / NFTs / speculative tokens | Directive §11 |
| Loot boxes, login streaks, FOMO timers | Directive §19; contradicts a Bible about not being controlled |
| Morality meter | Turns a mirror into a scoreboard |
| Purging git history of the old database | Founder confirmed team-only data — no breach; disruption not justified |
| Extending the web client with new systems | Audit §G |
