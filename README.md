# TRAP MADE IT - Phase 1 + Phase 2 Foundation

This repository now contains a modular, buildable version of the prototype plus a non-breaking Phase 2 admin/data scaffold.

## Copyright and Proprietary Notice

Copyright (c) 2026 TrapMadeIt and KimaniTheBarber. All rights reserved.

This codebase, game concept, brand elements, assets, content model, and related implementation details are proprietary and confidential intellectual property of TrapMadeIt and KimaniTheBarber.

No part of this repository may be copied, reproduced, distributed, modified, reverse engineered, sublicensed, or used to create derivative works without prior written permission from TrapMadeIt and KimaniTheBarber.

Access to this repository does not grant any license to use associated trademarks, branding, media assets, or commercial gameplay/content systems except where explicitly authorized in writing.

## What Phase 1 delivered

- Migrated from a single monolithic HTML runtime to a proper app structure.
- Preserved the current visual identity and gameplay loop.
- Added a modern dev/build toolchain for reliable local development and deployment.

## Project structure

- `index.html`: App shell and game UI markup.
- `admin.html`: Back-office scaffold page for chapter/drop editing.
- `src/styles.css`: All visual styling (loader, HUD, panels, rooms UI).
- `src/game.js`: Core game runtime (levels, missions, interactions, product viewer).
- `src/main.js`: App entrypoint that wires styles + runtime.
- `src/data/defaultContent.js`: Default chapter/drop/mission dataset.
- `src/data/contracts.js`: Content validation rules.
- `src/data/contentStore.js`: Local storage content store + import/export.
- `src/admin.js`: Admin page logic.
- `src/admin.css`: Admin page styles.
- `docs/PHASE2-FOUNDATION.md`: Notes on what was scaffolded and next integration steps.
- `TRAP-MADE-IT-game.html`: Original single-file prototype kept for reference.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start local dev server:

```bash
npm run dev
```

Optional: run front-end + mock API together:

```bash
npm run dev:full
```

Mock API only:

```bash
npm run dev:api
```

3. Build production assets:

```bash
npm run build
```

Quality and migration checks:

```bash
npm run validate:rooms
npm run test:api
```

Unity handoff export:

```bash
npm run handoff:unity
```

4. Preview production build:

```bash
npm run preview
```

5. Open the admin scaffold while dev server is running:

```text
http://localhost:5173/admin.html
```

6. Mock API health check:

```text
http://localhost:8787/api/health
```

## Why this matters

- Your team can now iterate safely without editing one giant file.
- CI/CD and hosting workflows are now straightforward.
- Phase 2 groundwork is now in place so product managers can manage content structure without editing core gameplay files.

## Notes

- Current build warning about bundle size is expected at this stage because the game runtime is still large and bundled together.
- Optimization (code-splitting and lazy loading) can be tackled as the next step.
- Admin scaffold now syncs to local mock API with local fallback and supports JSON import/export for handoff/versioning.
- Mock API data persists in SQLite at `server/storage/trapmadeit.db`.
- Render pipeline baseline and asset migration plan are documented in `docs/RENDER-PIPELINE.md`.
- Unity handoff packaging and import guidance are documented in `docs/UNITY-HANDOFF.md`.

## Mock API Scope

The local API now includes placeholder implementations for the full planned backend surface:

- Auth and accounts
- CMS publishing and product/chapter management
- Commerce flow (products, discounts, checkout, refunds, fulfillment)
- Player progress and rewards claim anti-abuse rules
- Ops analytics and moderation workflows
- Community stories, opportunities, chapter events, and leaderboard

Admin access for local testing:

- Create a local admin account via `POST /api/auth/register` (set `role: "admin"`).
- Do not ship seeded/default credentials to hosted environments.

## API Groups

- Health: `/api/health`
- Auth: `/api/auth/register`, `/api/auth/login`, `/api/auth/me`
- Content/CMS: `/api/content`, `/api/cms/chapters`, `/api/cms/drops`, `/api/cms/publish`
- Player: `/api/player/:playerId`
- Events: `/api/events`
- Commerce: `/api/commerce/products`, `/api/commerce/discounts`, `/api/commerce/checkout`, `/api/commerce/orders`, `/api/commerce/refunds`, `/api/commerce/fulfillments`
- Rewards: `/api/rewards/claim`
- Ops: `/api/ops/analytics`, `/api/ops/moderation`
- Community: `/api/community/stories`, `/api/community/opportunities`, `/api/community/chapter-events`, `/api/community/leaderboard`

## Front-end API Service Layer

Client-side service modules are ready for integration in future pages/tools:

- `src/api/client.js`
- `src/api/services/auth.js`
- `src/api/services/cms.js`
- `src/api/services/commerce.js`
- `src/api/services/player.js`
- `src/api/services/ops.js`
- `src/api/services/community.js`

## API Smoke Test

Run end-to-end backend verification (starts mock API, executes route checks, then stops):

```bash
npm run test:api
```

## Quality Gates CI

- Workflow: `.github/workflows/quality-gates.yml`
- Runs on push/PR and executes:
	- `npm run validate:rooms`
	- `npm run build`
	- `npm run test:api`
	- `npm run export:unity`

## iOS App Pipeline (TestFlight)

This repository now includes Capacitor scaffolding to package the app for iPhone distribution via TestFlight.

- Config file: `capacitor.config.ts`
- iOS env template: `.env.ios.example`
- Release guide: `docs/IOS-TESTFLIGHT-RELEASE.md`

Common commands:

```bash
npm run ios:prepare
npm run ios:sync
npm run ios:open
```

Note: final iOS archive/signing/upload requires macOS + Xcode and Apple Developer credentials.

Team release automation:

- GitHub Actions workflow: `.github/workflows/ios-testflight.yml`
- Full setup and secrets checklist: `docs/IOS-TESTFLIGHT-RELEASE.md`

## Android App Pipeline (Google Play + Direct APK)

This repository now includes Capacitor scaffolding to package the app for Android distribution via APK or Google Play Store.

- Config file: `capacitor.config.ts`
- Android env template: `.env.android.example`
- Release guide: `docs/ANDROID-RELEASE.md`

Common commands:

```bash
npm run android:prepare
npm run android:sync
npm run android:open
```

Team release automation:

- GitHub Actions workflow: `.github/workflows/android-release.yml`
- Full setup and secrets checklist: `docs/ANDROID-RELEASE.md`

Note: final Android APK signing requires keystore credentials and Google Play distribution requires a developer account (one-time 25 USD).
