# Audit Schedule

Audits are **scheduled**, not triggered by suspicion. The point is to catch what nobody is worried about — the coin faucet ran on a live deploy for two weeks while five quality gates passed over it every time.

**Updated:** 3 August 2026

---

## The rhythm

| Audit | When | Scope | Output |
|---|---|---|---|
| **Horizon audit** | End of every horizon, before the next starts | Everything | `01-audit/YYYY-MM-DD-horizon-N.md` |
| **Security + economy** | Monthly, and before any release | Auth, money, personal data, client-writable state | Section in the horizon audit, or its own file |
| **Doctrine audit** | End of every horizon | Does the build still say what the Bible says? | Section, reviewed by Kimani |
| **Dependency + licence** | Quarterly, and before any store submission | Every package and asset: licence, version, maintenance | Section |
| **Performance** | Every Horizon-1+ milestone | Frame time, memory, load, draw calls on the **worst** target device | Section |
| **Restore drill** | Quarterly | Restore a real backup and boot it | Pass/fail in the log |

---

## Horizon audit checklist

Never edited after publication. If it was wrong, write a new one.

**1 · Truth**
- Does every ✅ in `PROGRESS.md` have evidence in `06-log/`? Spot-check three at random.
- Does any document claim something the filesystem contradicts? *(The README claimed three CI workflows that never existed.)*
- Does `_superseded/` contain anything still being treated as current?

**2 · Money and value**
- Can the client change any balance, entitlement, price or ownership? Prove it, do not assume.
- Does every value-changing route have a test?
- Ledger: is every movement atomic, idempotent and auditable?
- Any route that creates value with no payment behind it?

**3 · Identity and data**
- What personal data do we hold, and under what lawful basis?
- Do erasure and export work — as routes, not manual edits?
- Is anything sensitive reachable in git history?
- Account recovery: can a player who forgets their password get back in?

**4 · Safety**
- Age gates where money or real-world meetings are involved.
- Is any player-written text reachable by another player without moderation?
- Real-world features: consent, location safety, minors, opt-out.

**5 · Engineering**
- Is `main` green? Has CI been red and ignored?
- Any logic duplicated across JS/C# without a shared parity check?
- Any file that has become a monolith?
- Any TODO older than a horizon?

**6 · Doctrine** *(Kimani reviews)*
- Does any mechanic reward the trap rather than the way out?
- Any mission cleared by spending money?
- Has anything become preachy — saying it in text where a system should say it?
- Which Bible volumes still have no representation in gameplay?

**7 · Platform**
- Would this pass console certification today? If not, what would fail?
- Does every UI work on a gamepad?
- Are we within performance budget on the **worst** supported device?

---

## Scheduled

| Audit | Due | Status |
|---|---|---|
| Horizon 0 exit | On WP-004..008 complete | ⬜ |
| Security + economy | 1 September 2026 | ⬜ |
| Restore drill | With WP-007 | ⬜ |
| Dependency + licence | 1 November 2026 | ⬜ |

## History

| Date | Audit | Result |
|---|---|---|
| 3 Aug 2026 | [Master repository audit](../01-audit/MASTER-REPOSITORY-AUDIT.md) | 4 defects reproduced, all fixed same day. Doc drift found and corrected |
