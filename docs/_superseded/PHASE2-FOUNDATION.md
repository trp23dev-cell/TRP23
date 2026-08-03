> ⚠️ **SUPERSEDED — 3 August 2026.** Replaced by [`docs/01-audit/MASTER-REPOSITORY-AUDIT.md`](../../docs/01-audit/MASTER-REPOSITORY-AUDIT.md).
>
> Describes the Phase 2 scaffold as it was designed, not as it turned out.
>
> Kept for history. **Do not treat as current status.**

---

# Phase 2 Foundation (Non-Breaking)

This scaffold adds content management primitives without changing the live gameplay code paths yet.

## Added in this step

- Content model with chapters/drops/missions:
  - `src/data/defaultContent.js`
- Content validation contract:
  - `src/data/contracts.js`
- Local store + import/export utilities:
  - `src/data/contentStore.js`
- Admin editing surface:
  - `admin.html`
  - `src/admin.js`
  - `src/admin.css`

## Why this is safe

- Existing game logic in `src/game.js` remains intact.
- Existing game shell in `index.html` remains operational.
- New admin route is isolated (`/admin.html`).

## Product manager workflow (current scaffold)

1. Open `/admin.html`.
2. Edit chapter names, drop mapping, stash codes, and drop pricing.
3. Save to browser local storage.
4. Export JSON for handoff/versioning.
5. Import JSON when reviewing or restoring prior versions.

## Next integration task (Phase 2.1)

Wire `src/game.js` to read validated content from `contentStore` with fallback to hardcoded defaults, then progressively move static constants into managed content.
