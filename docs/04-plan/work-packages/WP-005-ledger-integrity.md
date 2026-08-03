# WP-005 · Ledger idempotency and double-entry

| | |
|---|---|
| **Horizon** | 0 |
| **Owner** | AI |
| **Effort** | M |
| **Status** | ⬜ open |
| **Depends on** | D-07 (two-currency model) |
| **Branch** | `wp/005-ledger-integrity` |

## Why

The `ledger` table records `playerId, account, delta, balanceAfter, reason, refType, refId, at`. Every movement is atomic and cannot drive a balance negative — the primitives are genuinely good. But there is **no idempotency key and no unique constraint on `refId`**.

So: a player checks out on a train, the tunnel eats the response, the client retries, and they are charged twice. That is a bug today with play money. It is a chargeback, a support ticket and a refund once real money and real garments are involved — and the migration is far cheaper **now**, before there are balances to preserve.

The directive is explicit (§11): every transaction should carry a unique ID, idempotency key, status, reason and audit metadata, on a double-entry or equivalently robust model.

## What

- `idempotencyKey` on every value-changing operation, unique-indexed. A repeat returns the **original** result rather than performing the work again
- Every movement recorded as a balanced pair — where value came *from* as well as where it went — so the books can be proven rather than trusted
- A reconciliation check that sums the ledger and compares against stored balances, run in CI
- Schema migration (append-only, per the existing `PRAGMA user_version` discipline)
- If D-07 lands as "yes": distinct currencies, with a constraint making conversion between them **impossible rather than merely absent**

## Not included

Real payments (H2) · merchant balances or payouts (H4) · Postgres (H3).

## Design notes

Full double-entry with a chart of accounts is the textbook answer and is probably over-engineered for a closed loop with one player-facing balance. The property that actually matters is **provability**: every credit has a matching debit against a system account, so `SUM(ledger) == 0` across the whole book and any drift is detectable.

That gives the audit trail the directive asks for without an accounting system nobody on the team wants to maintain.

Idempotency keys are client-generated (a UUID per user action) but **server-enforced**. The server stores the key with its response and replays it on a repeat.

## Steps

1. Migration: add `idempotencyKey TEXT UNIQUE`, `status`, `counterAccount` to `ledger`; create `system_accounts`
2. Wrap `postTransaction`, `transferInternal`, `transferBetweenPlayers`, `createOrder`, `refundOrder`, `claimReward` so each takes a key and replays on repeat
3. Every credit gets a matching debit against a system account (`system:rewards`, `system:seed`, `system:sales`)
4. `npm run check:ledger` — reconciliation: book sums to zero, balances match, no orphan entries
5. Backfill existing rows with synthetic counter-entries so historic data reconciles
6. Extend `check:api`: submit the same checkout twice with one key, assert one charge
7. Add reconciliation to CI

## Acceptance criteria

- [ ] The same checkout submitted twice with one key charges once and returns the same order
- [ ] The same reward claimed twice with one key pays once
- [ ] `SUM(delta)` across the book is zero
- [ ] Every player balance equals the sum of their ledger entries
- [ ] Migration runs clean on a database with existing data
- [ ] Reconciliation runs in CI

## Verification

```bash
npm run check:ledger
npm run check:api
# Migration against a copy of a real database, then reconcile.
```

## Risks

| Risk | Likelihood | If it happens |
|---|---|---|
| Backfill cannot balance historic rows | medium | One dated `system:opening-balance` entry; documented, not hidden |
| Migration corrupts live data | low, severe | **WP-007 (tested restore) must land first.** Rehearse on a copy |
| D-07 unanswered, forcing rework | medium | Design the schema so a second currency is additive |

## Done

*Not yet.*
