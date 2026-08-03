# WP-004 · Continuous integration

| | |
|---|---|
| **Horizon** | 0 |
| **Owner** | AI |
| **Effort** | S |
| **Status** | ⬜ open |
| **Depends on** | — |
| **Branch** | `wp/004-continuous-integration` |

## Why

Eight quality gates exist and run only when somebody remembers. `README.md` described three GitHub Actions workflows **that were never created**, so for two weeks nothing was checked on push while the documentation said otherwise — and that is precisely the window in which `/api/rewards/claim` was minting unlimited coins on a live deploy.

Documented-but-absent infrastructure is worse than none, because it stops people looking. This is the highest-value untouched item in the repository: it is what stops the *next* silent defect.

## What

- `.github/workflows/quality-gates.yml` running every gate on push and PR
- Node and .NET set up in CI, with dependency caching
- Branch protection on `main`: cannot merge red
- Two hardening items folded in, because they are one-liners CI would otherwise keep flagging: gate `window.__trapDebug` behind a dev flag (D11), and restrict the private-network CORS allowance to non-production (D13)

## Not included

Deployment (Railway already auto-deploys) · iOS/Android release workflows (WP-021) · Unity Cloud Build · test coverage reporting.

## Design notes

Two jobs, not one: the Node gates are fast, the .NET ones need an SDK. A developer waiting on a dotnet restore to learn their CSS is wrong is a developer who stops running CI.

`check:api` starts its own server on a random port with a throwaway database, so it needs no services. `check:world` and `check:csharp` need .NET 10.

## Steps

1. Create the workflow — job `web` (Node 20: build, validate:rooms, test:api, check:api, check:trap, check:repo) and job `unity-scripts` (.NET 10: check:csharp, check:world)
2. Cache `~/.npm` and `~/.nuget/packages`
3. Gate `window.__trapDebug` on `import.meta.env.DEV`
4. Restrict private-network CORS to `NODE_ENV !== "production"`
5. Extend `check:repo` to fail if `README.md` references a workflow file that does not exist — the exact drift that started this
6. Push, watch it pass, then deliberately break a test and watch it fail
7. Enable branch protection (**human step** — needs repo admin)

## Acceptance criteria

- [ ] Every gate runs on push and PR
- [ ] A deliberately broken test turns the run red
- [ ] `main` cannot be merged into while red
- [ ] `__trapDebug` absent from a production build
- [ ] Private-network CORS refused when `NODE_ENV=production`
- [ ] `check:repo` fails on a README reference to a missing workflow
- [ ] Total runtime under 5 minutes

## Verification

```bash
npm run build && npm run validate:rooms && npm run test:api
npm run check:api && npm run check:trap && npm run check:repo
npm run check:csharp && npm run check:world
NODE_ENV=production node -e "…"   # assert CORS refuses http://192.168.1.5
grep -c "__trapDebug" dist/assets/*.js   # expect 0
```

## Risks

| Risk | Likelihood | If it happens |
|---|---|---|
| .NET setup slow in CI | medium | Cache NuGet; split the job so Node still reports fast |
| `check:api` flaky on a shared runner (it binds a random port) | low | Retry once; widen the port range |
| Branch protection blocks the founder | medium | Allow admin override, documented in HUMAN-TASKS |

## Done

*Not yet.*
