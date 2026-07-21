# Junior Handoff - Current Build Status

## What is now implemented

1. Phase 1 modularization is complete and stable.
- Runtime is split and buildable (`index.html`, `src/main.js`, `src/game.js`, `src/styles.css`).
- Original monolithic prototype is preserved (`TRAP-MADE-IT-game.html`).

2. CMS/data scaffold is integrated into runtime with placeholder data.
- Content model and defaults: `src/data/defaultContent.js`
- Content validation: `src/data/contracts.js`
- Content store + sync helpers: `src/data/contentStore.js`
- Runtime consumes mapped CMS placeholders for chapter/drop names, pricing, codes.

3. Admin back-office scaffold is live.
- Route: `/admin.html`
- Files: `admin.html`, `src/admin.js`, `src/admin.css`
- Edits chapter/drop metadata, active flags, unlock windows, moral focus.
- Save/import/export now syncs to API when available and falls back locally.

4. Local mock backend API is added.
- Server: `server/mockApiServer.js`
- Dev scripts:
  - `npm run dev:api` (API only)
  - `npm run dev:full` (web + API)
- Storage files written under `server/storage/`:
  - `trapmadeit.db` (SQLite)
- Endpoints:
  - `GET /api/health`
  - Auth: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
  - CMS: `GET/PUT /api/content`, `GET /api/cms/chapters`, `GET /api/cms/drops`, `PUT /api/cms/chapters/:id`, `PUT /api/cms/drops/:id`, `POST /api/cms/publish`
  - Player: `GET/PUT /api/player/:playerId`
  - Events: `POST /api/events`, `GET /api/events`
  - Commerce: `GET /api/commerce/products`, `PUT /api/commerce/products/:id`, `GET/POST /api/commerce/discounts`, `POST /api/commerce/checkout`, `GET /api/commerce/orders`, `POST /api/commerce/refunds`, `POST /api/commerce/fulfillments`
  - Rewards / anti-abuse: `POST /api/rewards/claim`
  - Ops dashboard: `GET /api/ops/analytics`, `GET/POST /api/ops/moderation`, `PUT /api/ops/moderation/:id`
  - Community: `GET/POST /api/community/stories`, `GET/POST /api/community/opportunities`, `GET/POST /api/community/chapter-events`, `GET /api/community/leaderboard`
  - Audit: `GET /api/ops/audit`

5. Auth/account scaffold is included.
- Local admin users can be created through `POST /api/auth/register` with `role: "admin"`.
- Session tokens and role checks are enforced for protected routes.

6. Commerce lifecycle placeholder is complete for development.
- Inventory, discount logic, checkout, order creation, refunds, and fulfillments are persisted.

7. Ops and community backend rails are in place.
- Analytics metrics, moderation queue, story submissions, opportunity feeds, chapter events, and leaderboard are available via API.

8. Player progress persistence now uses backend-ready profile shape.
- Client profile store: `src/data/playerStore.js`
- Game hydrates/saves player profile and mission progress.
- Event pipeline logs key actions (session start, mission clear, level advance, purchases, top-ups).

9. Front-end API service modules are prepared for future UI integration.
- `src/api/client.js`
- `src/api/services/*`

10. Automated backend smoke test is included.
- Command: `npm run test:api`
- Script: `scripts/smoke-api.mjs`

## What has NOT changed (intentionally)

- No visual redesign or layout changes to gameplay scenes.
- No new joystick/mobile visual controls added.
- Product data remains placeholder-based until real commerce APIs are provided.

## How to run

1. Install:
- `npm install`

2. Full local stack:
- `npm run dev:full`

3. Web only:
- `npm run dev`

4. API only:
- `npm run dev:api`

5. Build:
- `npm run build`

## Next engineering step

1. Replace mock file storage with real DB-backed service while preserving endpoint contracts.
2. Connect real commerce provider credentials and webhooks.
3. Add production auth hardening (password reset, MFA, policy, audit logging).
