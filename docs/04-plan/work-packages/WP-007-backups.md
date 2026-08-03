# WP-007 · Backups, and a restore that has actually been tested

| | |
|---|---|
| **Horizon** | 0 |
| **Owner** | AI + **HUMAN** (Richard) |
| **Effort** | S |
| **Status** | ⬜ open |
| **Branch** | `wp/007-backups` |

## Why

Player accounts — emails, phone numbers, password hashes, wallets, ledgers and progress — live in one SQLite file on one Railway volume. **We do not know whether it is backed up, and nobody has ever restored one.**

An untested backup is not a backup. This blocks WP-005, because a ledger migration against live data without a proven restore is gambling with the only copy.

## What

- Volume backups confirmed on, with a known retention window
- A documented restore procedure that has been **executed**, not just written
- `npm run db:export` for an on-demand snapshot
- A quarterly restore drill in `AUDIT-SCHEDULE.md`
- A runbook in `05-operations/runbooks/`

## Not included

Postgres migration (H3) · point-in-time recovery · off-site replication.

## Steps

1. **HUMAN:** Railway → service → confirm volume backups enabled and note retention
2. **HUMAN:** download a backup
3. **HUMAN:** restore locally and boot the server against it
4. **HUMAN:** confirm `/api/health` reports real player counts
5. **AI:** write `scripts/db-export.mjs` (safe snapshot via SQLite backup API, not a file copy of a live database)
6. **AI:** write the runbook, including how long a restore actually took
7. **AI:** add the drill to the audit schedule

## Acceptance criteria

- [ ] Backups confirmed enabled, retention documented
- [ ] A backup has been downloaded, restored and booted — with the date recorded
- [ ] `npm run db:export` produces a restorable snapshot
- [ ] The runbook was followed by someone other than its author
- [ ] Quarterly drill scheduled

## Verification

```bash
npm run db:export
DATA_DIR=/tmp/restore-test PORT=8788 node server/mockApiServer.js
curl -s http://localhost:8788/api/health | jq '.deploy'
```

## Risks

| Risk | Likelihood | If it happens |
|---|---|---|
| Backups were never on | **medium** | Turn on now; accept that everything before today is unrecoverable |
| A file-copy snapshot of a live SQLite DB is corrupt | medium | Use the backup API, never `cp`. This is why step 5 exists |

## Done

*Not yet.*
