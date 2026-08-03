# WP-008 · Unity project health and package audit

| | |
|---|---|
| **Horizon** | 0 |
| **Owner** | AI + **HUMAN** (Richard, at the editor) |
| **Effort** | S |
| **Status** | ⬜ open |
| **Branch** | `wp/008-unity-health` |

## Why

Unity is now the product ([D-102](../DECISION-REGISTER.md)), and everything in Horizon 1 is built on it — but the audit could only read it from source. No licence is available to the AI, so **nothing about the Unity runtime has been verified by anything except the founder pressing Play once.**

Before committing a horizon of work, we should know what state it is actually in.

## What

- A Unity section in the audit backed by the editor, not by reading files
- Every package justified: reason, licence, version, platform support, maintenance status, lock-in (directive §14)
- The Starter Assets question settled — it is gitignored except one file, so a fresh clone has no character controller
- `.meta` files generated and committed for the new CaseFile scripts
- UIElements stubbed in `tools/csharp-check` so `TrapHudController` and `TrapCardController` stop being invisible to CI
- Console-readiness noted early: render pipeline, input, memory

## Not included

Actually building for console · Addressables migration (H1) · art pipeline.

## Design notes

The **Starter Assets** decision matters more than it looks. 86 MB of Asset Store character art is gitignored, so a fresh checkout falls back to a fly camera. That is a deliberate, documented choice — but it means the repo does not clone-and-run, which will cost a future hire a day and is exactly the kind of friction that makes people work around the build.

Options: commit it and accept permanent git weight; build a minimal controller we own; or script the import. My lean is the third — reproducible, no licence weight, no surprise.

## Steps

1. **HUMAN:** open the project, record Unity version, console errors and warnings verbatim
2. **HUMAN:** run `TRAP > Build World Test Scene`, confirm Lincoln streams and is walkable, note frame rate
3. **HUMAN:** confirm the CASE FILE panel opens and saves (H-02)
4. **HUMAN:** let Unity generate `.meta` files, commit them
5. **AI:** package audit table from `manifest.json`
6. **AI:** stub UIElements so the UI scripts compile-check
7. **AI:** write up as `01-audit/2026-XX-XX-unity-health.md`
8. **Both:** decide Starter Assets, record as a decision

## Acceptance criteria

- [ ] Unity opens with **zero** console errors
- [ ] Lincoln streams and is walkable; frame rate recorded on a named machine
- [ ] Every package has a documented justification
- [ ] `.meta` files committed for all new scripts
- [ ] `npm run check:csharp` covers the UI scripts
- [ ] Starter Assets decided and recorded
- [ ] Audit published

## Verification

```bash
npm run check:csharp   # must now include TrapHudController + TrapCardController
npm run check:world
git status --porcelain Unity/   # expect clean: no untracked .meta
```

## Risks

| Risk | Likelihood | If it happens |
|---|---|---|
| UIElements too large to stub usefully | medium | Stub only what our scripts touch; document the boundary |
| Unity opens with errors on a clean clone | medium | That *is* the finding. Fix before Horizon 1 |
| Package versions incompatible with console targets | low | Record now; cheaper than discovering at certification |

## Done

*Not yet.*
