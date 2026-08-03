# Testing Strategy

**Date:** 3 August 2026 · **Status:** current

---

## The principle

> **Every defect gets a test before it gets a fix.**

Not dogma — a lesson. `/api/rewards/claim` paid out whatever number the caller put in the request body, on a live deploy, for two weeks. Five quality gates passed over it on every run. Auth was tested. CORS was tested. Rate limiting was tested. **The money was not.**

A test suite is not a measure of how much code you have covered. It is a record of every way you already know this system can be wrong.

---

## What we have

| Gate | Command | Covers | Runtime |
|---|---|---|---|
| Build | `npm run build` | Web bundle compiles | ~5 s |
| Rooms | `npm run validate:rooms` | Asset registry integrity | <1 s |
| API liveness | `npm run test:api` | Every route answers on a throwaway server | ~10 s |
| Security + economy | `npm run check:api` | Auth, bootstrap, CORS, rate limits, **money**, case file, restart survival | ~60 s |
| Shared logic | `npm run check:trap` | Web and Unity agree, against one shared table | ~10 s |
| C# | `npm run check:csharp` | Unity scripts compile without the editor | ~15 s |
| World | `npm run check:world` | Collision and geometry | ~10 s |
| Hygiene | `npm run check:repo` | No credentials or databases tracked | <1 s |

Every suite starts its own server on a random port with a throwaway database. **Repeatability was designed in** — an earlier version ran against a shared instance and the rate limiter counted its own checks, so a second run inside the hour went red for no reason. A test that cannot be run twice is not a test.

## What we do not have

| Gap | Consequence | Fixed by |
|---|---|---|
| **No CI** | All of the above runs only when someone remembers | WP-004 |
| No UI test, either client | The trap card's *appearance* is unverified by anything but a human eye | WP-020 |
| No Unity play-mode tests | Runtime behaviour unproven | WP-008 |
| No ledger reconciliation | Books cannot be proven to balance | WP-005 |
| No load testing | Unknown concurrency ceiling | H3 |
| No device performance test | The mid-range Android is where this hurts, and it is untested | WP-021 |

---

## The pyramid, as it applies here

**Parity tests — the layer most projects do not have and this one needs.** Where logic must exist in both JavaScript and C#, neither copy owns the truth: both run against one shared table (`src/data/trapCard.cases.json`). This caught a real divergence within minutes of existing — the JS treated any junk answer as a valid one, so a player with a corrupt profile would never have been asked the final chapter's question at all.

**Extend this pattern to every shared rule.** Validation regexes, price calculation, progression thresholds, mission state. Audit D9 exists because Unity's `MockAuthService` re-typed the web's signup regex by hand and the two can now disagree with nothing noticing.

**Integration over unit.** This codebase's real risks are at boundaries — client/server, JS/C#, game/money. A unit test of `applyBalance` would have told us nothing about the faucet; a test that asked *"can a player create coins from nothing?"* would have caught it on day one.

**Test the property, not the implementation.** *"A reward pays the catalogue amount, not the amount asked for"* survives a refactor. *"`claimReward` is called with 150"* does not.

---

## Writing a check

Match the existing style — plain Node scripts, no framework, `check(name, actual, expected)`, human-readable output.

```js
check("a reward pays the catalogue amount, not the amount asked for",
  greedy.json?.rewardCoins === 150,
  `claimed 999,999,999 and was granted ${greedy.json?.rewardCoins}`);
```

Name the check as **the property being defended**, and put the real numbers in the detail — so a failure is diagnosable from the output alone, without opening the file.

**Never let a check pass because it did not run.** When `check:trap` cannot find dotnet it says so loudly and skips; it does not report success. A silently skipped check is worse than a missing one.

---

## Before a release

1. Every gate green in CI
2. Ledger reconciliation clean
3. Restore drill within the quarter
4. Performance within budget on the **worst** supported device
5. Manual pass: create an account, play the slice start to finish, buy something in test mode, book something in test mode
6. Security + economy audit within the month
7. Accessibility pass
8. Gamepad pass — every screen navigable without a mouse

---

## Unity testing

Currently: compile-checking only, via `tools/csharp-check` against hand-written Unity stubs. It proves the code is valid; it proves nothing about behaviour.

**Where it goes:**
- **Edit-mode tests** for pure logic (`TrapCardState` and successors) via Unity Test Framework, already in the manifest
- **Play-mode tests** for streaming, collision, save/load
- **Scene validation** in CI: missing references, missing colliders, texture sizes, draw-call budgets (directive §15)
- Keep the pure logic **outside** MonoBehaviours wherever possible. `TrapCardState.cs` is testable precisely because it touches no engine surface, and that is the pattern.
