# Execution Log

One entry per work session, per the master directive §23. Newest last.

---

## Session 1 — 3 August 2026

### Objective

Complete repository audit per master directive §3. Produce `docs/MASTER-REPOSITORY-AUDIT.md`. No implementation until the audit is confirmed.

### Files inspected

All 271 tracked files were listed and classified. Read in full or in substantial part:

- **Docs:** `README.md`, `Build_Progress.md`, `Bible_Planning_Devwork.MD`, `Team_Brief_The_Real_Build.md`, all 8 files in `docs/`, `Bibile /` directory listing (14 volumes, PDF/DOCX — titles and structure only)
- **Server:** `server/mockApiServer.js` (1,790 lines, read in full), `server/storage/sqliteStore.js` (schema + all transaction primitives), `server/rateLimit.js`, `server/totp.js`, `server/dev-full.js`
- **Client:** `src/game.js` (outline + key functions), `src/world/*` (all 8), `src/render/*` (all 5), `src/data/*` (all 5), `src/api/*` (all 10), `src/admin.js`, `index.html`
- **Scripts:** `scripts/build-map-tiles.mjs`, `check-api-security.mjs`, `check-repo-hygiene.mjs`, `export-unity-handoff.mjs`, `lib/*`
- **Unity:** all 28 tracked `.cs` files, `Packages/manifest.json`, `ProjectSettings/ProjectVersion.txt`, scene inventory
- **Config:** `package.json`, `.gitignore`, `vite.config.js`, `railway.json`, `nixpacks.toml`, `capacitor.config.ts`, `.claude/settings.json`
- **Git:** 85 commits, full log since 2026-07-27, `--diff-filter=A` scan for historical secrets

### Commands run

```
npm run validate:rooms     ✅ "registry preflight: clean"
npm run check:repo         ✅ "271 tracked files, no credentials or databases"
npm run build              ✅ 41 modules, 3.01s (chunk-size warning)
npm run test:api           ✅ "all checks passed"
npm run check:api          ✅ 18/18 security checks passed
```

Not run: `npm run check:csharp`, `npm run check:world` (require .NET SDK), Unity editor (no licence in this environment). Unity runtime state is therefore asserted from source — recorded as D14.

### Findings

Full detail in `docs/MASTER-REPOSITORY-AUDIT.md`. Headlines:

- **The project is further along than its own documentation claims.** Real Lincoln from OSM + LIDAR, streamed to two clients from one server, with collision, weather and a progress-driven light arc.
- **Four defects reproduced empirically** against a throwaway server on a clean database (not inferred from reading):
  - `/api/rewards/claim` pays `body.rewardCoins` — asked for 999,999,999 on a 150-coin mission, got it
  - `/api/wallet/topup` — unlimited 1,000,000-coin credits, no payment processor, no env gate
  - `GET /api/commerce/orders` — HTTP 200 with no auth header, returns all orders with player ids
  - Deep-link SPA fallback — `serveStatic(res, "/index.html")` passes 2 args to a 3-arg function; `/some/deep/link` → 404
- **All five quality gates pass green over the above**, because no test covers the economy.
- **CI does not exist.** `README.md` documents three GitHub Actions workflows, two env templates and iOS/Android projects. None are present.
- **`docs/COMPLETION-STATUS.md` marks 21/21 items "COMPLETE"** including commerce and the admin dashboard.
- **Secrets remain in git history** in two copies, including `trapmadeit.db`. The Apple `.p8` was revoked 2026-07-31 and is inert; the database is not, and whether it held real player rows is an open factual question with GDPR consequences.
- **Chapter names disagree across three files** — only `defaultContent.js` reaches the player.

### Decisions

1. **Doc scope** (founder, this session): produce the full document set from the brief, consolidating rather than repeating `Bible_Planning_Devwork.MD`. The audit supersedes that document's Part 1 only.
2. **Money-path fixes** (founder, this session): first implementation batch, immediately after audit sign-off.
3. **Client architecture** (delegated to me, this session): **Unity is the product; the web build becomes a frozen shop window.** Reasoning in audit §G. Conditional on verifying the Unity project actually runs (D14).
4. **Source of truth** established per audit §F. Four documents marked for superseded banners rather than deletion, per §3F of the directive.

### Files changed

- `docs/MASTER-REPOSITORY-AUDIT.md` — new
- `docs/CLAUDE-EXECUTION-LOG.md` — new (this file)

No source code changed. No commits made.

### Unresolved issues

- **D4:** did `server/storage/trapmadeit.db` contain real player rows when committed? Founder question. Determines breach-notification duty.
- **D14:** Unity runtime unverified. Blocks acting on the §G recommendation.
- **Live exposure:** the Railway deploy has D1a/D1b/D1c open right now.
- Founder decisions still open from `Bible_Planning_Devwork.MD` §F: two-currency model, Apple IAP position on coin top-ups, Stripe vs Shopify headless, narrative charter sign-off, launch scope, founder legal name (Kamani Dean Smith vs KimaniTheBarber in the README copyright).

### Next recommended action

Founder reads and confirms the audit. On confirmation: first implementation batch (audit §H), then the remaining directive documents (§4–§21) written against this audit rather than the 27 July snapshot.

---

## Session 2 — 3 August 2026

### Objective

Audit confirmed by founder; Unity confirmed running (closes D14, unblocks audit §G). Two tasks: implement the money-path batch (audit §H), then design the mission system and the premises/merchant system per founder instruction.

### Decisions

1. **Unity verified working by the founder** — the §G recommendation (Unity is the product, web becomes a frozen shop window) is now actionable.
2. **Mission design:** the core mechanic is the **Commitment** — a promise the player sets, measured in real elapsed time, that the world remembers, with a repair path for every break. Rationale in `MISSION-DESIGN-BIBLE.md` §3.
3. **Premises abstraction:** the bank, the barber and future rentable shopfronts are **one system in three operator configurations** (HOUSE / PARTNER / PLAYER), not three features. Building the barber properly *is* building the merchant platform.
4. **The barber booking carries no payment** — paid in the chair, as today. Removes e-money, PSD2, Apple IAP, chargebacks and refunds from v1 entirely, and is why it can ship before real commerce.
5. **Tenancies should be earned with Standing, not bought with money** — recommendation pending founder sign-off; it is a doctrine decision.

### Files changed

**Money-path batch (audit §H):**

- `server/mockApiServer.js`
  - `/api/rewards/claim` — reward amount and discount code now read from the server-held catalogue; unknown missions 404; response reports what was actually granted
  - `/api/wallet/topup` — 404 unless `ALLOW_DEV_TOPUP=1`
  - `/api/commerce/orders` — staff see all and may filter; players see only their own; anonymous 401
  - `serveStatic` deep-link fallback — arg-order bug fixed
  - `/api/health` — added `deploy.devTopup`
- `scripts/check-api-security.mjs` — new **economy integrity** section (12 checks) and a deep-link check
- `scripts/smoke-api.mjs` — real catalogue mission ids; authenticated order-book call
- `index.html` — top-up row hidden by default; removed the "£10 = 1,000 Trap Coins" price the site could not honour
- `src/game.js` — reveals the top-up row only when the server reports the route open
- `README.md` — corrected the false CI and iOS/Android claims

**Design:**

- `docs/MISSION-DESIGN-BIBLE.md` — new
- `docs/MERCHANT-AND-PLAYER-BUSINESS-SYSTEM.md` — new

No commits made.

### Commands run

```
npm run check:api        ✅ 32 checks (was 18) — incl. 12 new economy checks
npm run test:api         ✅ all checks passed
npm run build            ✅ 4.31s
npm run validate:rooms   ✅ clean
npm run check:repo       ✅ 271 tracked files, no credentials or databases
```

Two intermediate failures occurred and were fixed:
- Economy baseline was stale — the `board` claim legitimately paid its catalogue 100 coins, so the assertion, not the server, was wrong.
- `smoke-api.mjs` called the order book unauthenticated, which the fix correctly rejected.

### Findings

Original exploit re-run against the patched server:

| | Before | After |
|---|---|---|
| Claim 999,999,999 on a 150-coin mission | granted | **granted 150** |
| Topup 1,000,000 | granted | **404** |
| `GET /api/commerce/orders` anonymous | 200 + all orders | **401** |
| `GET /some/deep/link` | 404 | **200** |

### Unresolved issues

- **D4 unanswered:** did `server/storage/trapmadeit.db` hold real player rows when committed? Determines GDPR breach-notification duty.
- **The barber has not been asked.** Blocks the flagship mission; his current diary process determines the design.
- Founder decisions open: earned vs bought tenancies; deletion of the purchase-gated `own1` mission; permission to use real trading names (NatWest, JD); two-currency model; under-18 booking policy.
- D2 (single-entry ledger, no idempotency keys) untouched — must be fixed before real money.
- D5 (no CI) untouched — the five gates still run only by hand.

### Next recommended action

Founder answers §13 of the mission bible and §8 of the merchant doc. Highest-value build, independent of those answers: **"Name your trap"** (Chapter 01 card + Chapter 06 callback) — the emotional spine, near-zero technical risk, already scoped in `Build_Progress.md` 7.1.

---

## Session 3 — 3 August 2026

### Objective

Act on founder direction: delete the purchase-gated mission; incorporate booking deposits, real-money shopfront rent, character creation and Lincoln rendering into the design; and produce the register of real-world integrations the founder asked for.

### Context established this session

- **Kimani (the barber) owns the project.** Richard is lead developer. This resolves `Bible_Planning_Devwork.MD` §1.5's open founder-name question and collapses most of the third-party-partner design in the merchant doc — though his *customers* remain third parties whose data and safety are ours to protect.

### Decisions

1. **`own1` deleted** (founder-approved). Content bumped to **v3**; client cache key bumped to match, per the `Build_Progress.md` 6.2 lesson.
2. **`own2`/`own3` retained deliberately.** Same doctrine contradiction, but deleting them bare would leave chapters 03 and 05 with a single mission each. They are **replaced, not deleted**, in the chapter rebuild.
3. **Booking deposits — design revised.** "No payment at all" does not survive contact with a real business: a no-show costs a chair that cannot be resold. A deposit becomes a **real card payment to the barber that never converts to coins**.
4. **The Trust marriage** — high Trust books without a deposit, low Trust pays one. Makes Trust financially meaningful (a credit rating earned by keeping your word) and gives a player a reason to care about it on day one.
5. **Tenancy resolved** — **earned eligibility, paid rent**. Standing decides if you are considered; rent (£10–50/mo by size and location) is what you pay once you are. Preserves doctrine and the revenue line.
6. **Google Street View rejected** as an asset source — its terms prohibit derivative 3D assets. The existing OSM + LIDAR pipeline plus the team's *own* photography and photogrammetry is both legal and better.
7. **Character creation: fixed archetypes, not continuous sliders.** Flagged as the single biggest technical risk in the project — the product is clothing, and every garment must fit every body. 4–6 archetypes make garment fitting a finite authored cost; sliders make it an unbounded runtime problem that damages how the real product looks.
8. **The invariant that keeps everything simple:** game coins and real money never convert in either direction.

### Files changed

- `src/data/defaultContent.js` — `own1` removed; version 2 → 3 with rationale
- `src/data/contentStore.js` — cache key v2 → v3
- `src/game.js` — `own1` removed from `BASE_LEVELS` and from `afterPurchase`
- `docs/REAL-WORLD-INTEGRATION-REGISTER.md` — **new**, the founder-requested register
- `docs/MISSION-DESIGN-BIBLE.md` — §7 revised for deposits + the Trust marriage
- `docs/MERCHANT-AND-PLAYER-BUSINESS-SYSTEM.md` — §3 tenancy resolution, §4 rewritten, §8 updated

No commits made.

### Commands run

```
npm run build      ✅ 11.28s
npm run test:api   ✅ all checks passed
npm run check:api  ✅ all security checks passed
```

### Unresolved issues

- 🔴 **Did anyone outside the team ever sign up?** Unanswered. Determines whether the database in public git history is a reportable GDPR breach. Explained to the founder in plain terms this session: deleting the file does not remove it; history rewrite + force push + cache purge is required.
- 🔴 **How does Kimani run his diary today?** Blocks the entire booking design.
- Register §7 carries seven further open items (deposit level, under-18 policy, Stripe vs Shopify, trading names, archetype count, accountant, two-currency model).

### Next recommended action

Unchanged: **"Name your trap"**. It depends on none of the open questions and is the emotional spine of the game.

---

## Session 4 — 3 August 2026

### Objective

Founder answered both blockers. Build **"Name your trap"** — the card the player writes in Chapter 01 and is asked about in Chapter 06.

### Founder answers

1. **Only the team ever signed up.** The database in git history holds team and test accounts only. **No GDPR breach, no notification duty, no clock.** Recommendation given: leave history alone (a rewrite invalidates every clone for no real gain), but rotate any password reused elsewhere, since scrypt hashes for team accounts are in a public repo. **D4 downgraded from 🔴 to hygiene.**
2. **Kimani takes bookings by DM, phone and walk-in.** No existing software.

### Consequences of answer 2

We are not *integrating* with a booking system — **we are becoming one**. Technically simpler (one source of truth, no sync, no cross-system double-booking) but operationally much higher stakes: if the game holds his diary it must be reliable enough to run a business on.

Two design consequences recorded:

- **Walk-ins are the likeliest failure mode.** He takes someone off the street while the game sells that slot; he gets double-booked once and never trusts it again. The staff view needs *"block out the next hour"* as **one tap**, working on a phone in his pocket.
- **Deposits apply to game bookings only**, never to his existing regulars. Asking a ten-year customer for a card deposit is a good way to lose them.

### Files changed

- `src/data/trapCard.js` — **new.** Pure state machine: five states, plus normalisers
- `scripts/check-trap-card.mjs` — **new.** 17 checks
- `package.json` — added `check:trap`
- `index.html` — `#trapSlot` in the case file panel
- `src/styles.css` — `.trap-card` styling; pinned like the mission cards but paler and tilted the other way, because it is the player's card and not the game's
- `src/game.js` — `state.trapStatement` / `state.trapAnswer`, persisted through `progress`; `renderTrapCard()`; `escapeHtml()`; hover tag corrected **"THE DRAWING BOARD" → "YOUR CASE FILE"** (stale copy missed when the case file was flipped in Build_Progress 1.2 — the panel was retitled, the 3D world was not)

### Design decisions

- **The statement is private.** Shown back only to the player — never on the leaderboard, never in community, never to staff. Verified: it does not appear in `/api/community/leaderboard`. This is deliberate — people will write true things about themselves, and the moment it is public it stops being honest and starts needing moderation.
- **It locks when they leave Chapter 01.** Editable while still there (typos), fixed afterwards. This is what makes Chapter 06 land: they are reading something they could not quietly have edited on the way.
- **Never scored, in either chapter.** *"It still holds me"* is an honest answer and the game says so. The moment it scores, it stops being a mirror and becomes a test.
- **Refactored for testability.** The five-state decision was extracted from the DOM renderer so it can be tested without a browser — no puppeteer in the project and none added.

### Commands run

```
npm run check:trap       ✅ 17/17
npm run build            ✅ 6.94s
npm run validate:rooms   ✅ clean
npm run test:api         ✅ all checks passed
npm run check:api        ✅ all security checks passed
npm run check:repo       ✅ clean
```

Plus, beyond the standard gates:
- **Profile round-trip verified** against a throwaway server: statement written, read back byte-identical (including quotes and a `<script>` tag), answer persisted, and confirmed absent from the public leaderboard.
- **Headless Chrome load** — clean, no console errors, before and after the refactor.

**Not verified:** the visual appearance and click behaviour of the card. No browser automation is available and none was added. The state machine is unit-tested and the page loads clean, but **someone should look at it.**

### Unresolved issues

- The card is unverified visually — needs a human to open Chapter 01 and look.
- `own2`/`own3` still purchase-gated, awaiting chapter rebuild.
- D2 (single-entry ledger, no idempotency), D5 (no CI) untouched.
- Register §7 open items: deposit level, under-18 policy, Stripe vs Shopify, trading names, archetype count, accountant, two-currency model.

### Next recommended action

Founder opens Chapter 01 and looks at the card. Then either the **commitment engine** (the mechanic everything else depends on) or **CI**, which is now the highest-value untouched infrastructure.

---

## Session 5 — 3 August 2026

### Objective

Correct a sequencing error: the trap card was built in the **web** client, which the agreed architecture (audit §G) freezes to bug fixes and content-data updates only. New systems belong in Unity. Port it, and put the shared-logic problem to bed while doing so.

### The error, plainly

Session 4 built a new system in the client we are freezing, because the scaffolding was already there and it was the easier path. The founder caught it. The trade-off should have been raised before starting, not discovered afterwards.

**What survived the correction:** the server work (client-agnostic — Unity hits the same API) and the state machine, which became the specification. **What was misplaced:** the web UI. It is retained as a working visual reference for the Unity version rather than reverted, since deleting it would cost the reference and gain nothing.

### Decisions

1. **The trap card now exists in Unity**, driven by the same server state.
2. **Two implementations, one table.** The state machine exists in JS and C#, and both are held against `src/data/trapCard.cases.json`. This is the direct antidote to audit **D9** (Unity's `MockAuthService` re-typed the web's signup regex by hand, and the two can now disagree with nothing noticing). Add a case to the table and both clients are held to it.
3. **A narrow write route.** `PUT /api/player/:id/case-file`. The general profile route replaces `progress` **wholesale**, so a client sending only the two trap fields would silently destroy `currentLevel`, `missionProgress`, `walked` and `viewed` — the player's entire save. The narrow route can only touch the card.
4. **Server-side normalisation.** The 180-character cap was enforced only by a `maxlength` attribute, which is a suggestion. Trim, cap and the answer whitelist now live on the server.
5. **The case file is a HUD button in Unity, not a prop on a wall.** In the web build it could only be opened by standing in front of a board inside a chapter, which made the one thing that is actually *yours* the hardest thing in the game to look at.

### Files changed

**Unity:**
- `Assets/UI/Scripts/CaseFile/TrapCardState.cs` — **new**, the C# state machine
- `Assets/UI/Scripts/Auth/CaseFileService.cs` — **new**, fetch + narrow write, with hand-rolled JSON string escaping so a player writing `he said "I'm done"` cannot break the request
- `Assets/UI/Scripts/TrapCardController.cs` — **new**, drives the five states; defensively bound so a renamed UXML element cannot take the whole HUD down
- `Assets/UI/Menu/GameHud.uxml` — CASE FILE button + panel
- `Assets/UI/Styles/TrapHud.uss` — `.trap-card`, pale index card against the dark HUD
- `Assets/UI/Scripts/TrapHudController.cs` — wiring

**Server / shared:**
- `server/mockApiServer.js` — `PUT /api/player/:id/case-file`; `TRAP_STATEMENT_MAX`, `TRAP_ANSWERS`
- `src/data/trapCard.cases.json` — **new**, the shared table
- `src/data/trapCard.js` — **bug fixed**, see below
- `scripts/check-trap-card.mjs` — rewritten to run the table against both clients
- `scripts/check-api-security.mjs` — new **case file** section (7 checks)
- `tools/trapcard-check/` — **new** dotnet console runner, compiling the *real* `TrapCardState.cs` rather than a copy (same reasoning as `tools/collision-check`)
- `tools/csharp-check/check.csproj` — covers `UI/Scripts/CaseFile/*.cs`
- `tools/csharp-check/UnityStubs.cs` — added `kHttpVerbPUT`/`DELETE`/`HEAD`; the stub was missing verbs real Unity has

### The parity check found a real bug on its first run

`trapCardState` in JS did a **truthy** check on `answer`, so any junk value that ever reached a saved profile — a legacy string, a typo — counted as an answer and **the player was never asked the question at all**. The C# copy normalised first and was correct. Fixed in JS.

This is exactly the class of defect the shared table exists to catch, and it justified the approach within minutes of existing.

### Commands run

```
npm run check:trap       ✅ 21 cases × 2 implementations
npm run check:csharp     ✅ Build succeeded, 0 errors
npm run check:world      ✅
npm run validate:rooms   ✅
npm run build            ✅
npm run test:api         ✅
npm run check:api        ✅ incl. 7 new case-file checks
npm run check:repo       ✅
```

Manual end-to-end against a throwaway server: a narrow write preserved `currentLevel 3`, `levelsCleared 2`, `walked 42` and `missionProgress` intact; quotes survived; 500 characters stored as 180; `"cleared"` rejected as an answer; and a second player aiming at the first player's id wrote to **their own** card, leaving the first untouched.

### Not verified

- **The Unity UI itself.** `TrapCardController.cs` and `TrapHudController.cs` are not compile-checked — `UnityElements` is not stubbed, and `TrapHudController` was never covered either. This is a **pre-existing gap**, now slightly larger. The editor will report any error immediately on import.
- **`.meta` files** for the four new Unity assets are not created; Unity generates them on first import.

### Unresolved issues

- Unity has a world and a shell but **no chapter flow**, so `_level` in the HUD is hardcoded to 0. The card is reachable and works; which chapter you are "in" is not yet a real concept in Unity.
- `TrapHudController` carries a **hardcoded three-item product catalogue** in C# while the web reads `/api/content` — another D9 instance, not yet fixed.
- Unity HUD still says `LEVEL 01`; content renamed LEVEL → CHAPTER (Vol 6). Stale copy.
- `own2`/`own3` still purchase-gated; D2 (ledger idempotency) and D5 (no CI) untouched.

### Next recommended action

Founder-requested: a full plan system under a restructured `docs/` tree, incorporating the newly added PDF. Then Unity's chapter flow, which is what `_level` is waiting for.

---

## Session 6 — 3 August 2026

### Objective

Restructure `docs/` and build a plan system the team can follow religiously — covering AI-executable work, human-only work, version control, progress tracking, scheduled audits and testing. Incorporate the founder's newly added `TRP23_Master_Vision_and_Development_Plan.pdf`. Target: Unity alone, on PC / iOS / Android, consoles eventually.

### The PDF

27 pages. It is the original master directive, professionally typeset for the team — the same 28 sections, no new requirements. Its value is as the shareable artefact, so it is now the entry point at `00-vision/`. Nothing in the existing design contradicted it.

### Files changed

**Structure** — 25 renames, git history preserved:

```
docs/
  00-vision/     directive PDF · bible/ (14 volumes) · Bible_Planning_Devwork · Team_Brief
  01-audit/      MASTER-REPOSITORY-AUDIT · audits/
  02-design/     missions · merchant · +6 stubs
  03-technical/  TESTING-STRATEGY · RELEASE-AND-PLATFORMS · render · unity handoff · +6 stubs
  04-plan/       MASTER-PLAN · PROGRESS · HUMAN-TASKS · DECISION-REGISTER · AUDIT-SCHEDULE · work-packages/
  05-operations/ real-world register · railway · ios · android · +2 stubs
  06-log/        this file · Build_Progress
  _superseded/   3 files, each with a banner naming its replacement
```

**Fixed on the way:** the Bible lived in a folder called `Bibile ` **with a trailing space**, which git tracked but which breaks tooling and tab-completion. Now `docs/00-vision/bible/`.

**New:** `docs/README.md` (index + source-of-truth table), `04-plan/MASTER-PLAN.md`, `PROGRESS.md`, `HUMAN-TASKS.md`, `DECISION-REGISTER.md`, `AUDIT-SCHEDULE.md`, `work-packages/_TEMPLATE.md` + WP-001..008, `03-technical/TESTING-STRATEGY.md`, `03-technical/RELEASE-AND-PLATFORMS.md`, 14 tracked stubs.

### Design decisions

1. **The work package is the atomic unit.** Nothing gets built that is not a WP with acceptance criteria, verification commands, a named owner (AI or HUMAN) and an explicit "not included" fence.
2. **Full WPs are written one horizon ahead, no further.** Beyond that, titles only. Writing detailed Horizon 4 specs today would be invention, and the directive forbids fake precision where evidence is insufficient.
3. **Done means verified.** A row is ticked only when its commands were run and the output is in this log. Written directly against the failure mode of `_superseded/COMPLETION-STATUS.md`, which marked 21 of 21 items COMPLETE against a system with no payment processor.
4. **Audits are scheduled, not triggered by suspicion** — the faucet survived because nobody was worried.
5. **Console constraints applied now, not at porting time.** Three decisions change today: tenancy billing stays **web-only, outside the game client** (D-115); UGC needs moderation designed in with the feature; every UI must be gamepad-navigable from the first screen.
6. **Model guidance recorded:** Opus for architecture, money, security and safeguarding; Sonnet for mechanical work. Never a smaller model on economy, auth or safeguarding code — that is exactly where a subtle wrong answer looks right.

### Gaps this surfaced that were not in the directive

Recorded in `MASTER-PLAN.md` §4. The two that matter most:

- **No account recovery exists.** No password reset, no email verification. A player who forgets their password is permanently locked out — in production, today.
- **Backups are unproven.** One SQLite file on one Railway volume, never restored. This now blocks WP-005, because a ledger migration without a tested restore is gambling with the only copy.

### Commands run

```
npm run check:trap    ✅   npm run test:api     ✅
npm run check:repo    ✅   npm run check:csharp ✅
npm run build         ✅
```

Plus a link checker across every `.md` in `docs/` and the root README: **0 broken links** after repairing the paths the restructure moved.

### Unresolved issues

- Unchanged and still blocking: **D-01** (how Kimani takes bookings today) and the seven other open decisions.
- **H-01 and H-02 outstanding** — nobody has looked at the trap card in either client.
- 14 design/technical documents are tracked stubs, scheduled but unwritten.
- WP-004 (CI) is the highest-value open package: it is what stops the next silent defect.

### Next recommended action

**WP-004 — continuous integration.** Independent of every open decision, and it converts eight hand-run gates into something that cannot be forgotten.

---

## Session 7 — 3 August 2026

### Objective

WP-004 (continuous integration) and WP-009 (account recovery). Founder also asked, mid-session, that work be committed as it goes and tracked in the docs — both now done.

### Committed

Six commits, having previously worked five sessions without one:

| | |
|---|---|
| `a906aaca` | The client could name its own reward, and did not have to be asked |
| `73f43042` | Remove the mission you completed by buying something |
| `b4a0edb7` | Name your trap, and hand it back five chapters later |
| `51b1bf06` | A documentation tree, and a plan we can actually follow |
| `4529cb0e` | Check it on every push, instead of hoping somebody remembers |
| `10d7382e` | Give people a way back into their own accounts |

### WP-004 — continuous integration ✅

`.github/workflows/quality-gates.yml`. Two jobs: Node gates finish in about a minute, .NET gates need an SDK. A developer waiting on a `dotnet restore` to learn their CSS is broken stops running CI.

Three hardening items folded in, each a one-liner CI would otherwise flag forever:

- **`__trapDebug` behind `import.meta.env.DEV`** — compiled out of production rather than merely unreachable. CI greps the bundle. Verified: 0 occurrences across all six chunks.
- **Private-network CORS off in production.** Verified in both modes: production refuses `192.168.1.50` and `localhost` while still allowing `capacitor://localhost`; development allows all three.
- **`check:repo` fails on README drift** — the exact failure that started this, where three workflows were documented and none existed.

**The drift check needed a second pass.** First version flagged the two `.env.*.example` files my own README explicitly describes as *not existing* — punishing the honesty it exists to encourage. Fixed by skipping paragraphs containing a negation. Then it still failed, because prose wraps: *"What does not exist:"* sat on one line and the filenames on the next, so line-by-line checking saw only the second. Now per paragraph. Verified in both directions — a planted false claim fails, the honest README passes.

### WP-009 — account recovery ✅

Surfaced by the docs restructure as a gap in nobody's plan. There was **no recovery of any kind**: forget your password and the account, progress and wallet were gone permanently, on a live deploy.

Built: password reset by email, username reminder, and ten one-time 2FA recovery codes. Migration 7 adds `auth_tokens` and `recovery_codes`, both storing hashes only.

**The decision that mattered most: a reset must not become a 2FA bypass.** Somebody who has taken an inbox holds one factor; if the reset also cleared two-factor they would hold both, and 2FA would be decoration. The reset changes the password and nothing else, and there is a check named after exactly that.

Also: no enumeration (every recovery route answers identically whether or not the account exists), reset signs every device out, recovery codes use an alphabet without `O`/`0` or `I`/`1`/`l` because they are read back by someone who has just lost their phone.

`server/mailer.js` is an interface with a development transport, and it **fails loudly when unconfigured** rather than pretending to send — a quiet helpful placeholder is precisely how the coin faucet survived two weeks. `/api/health` now reports whether mail can be delivered.

### Commands run

```
check:repo ✅  validate:rooms ✅  build ✅  test:api ✅
check:api  ✅  check:trap ✅  check:csharp ✅  check:world ✅
```

`check:api` is now **52 checks**, up from 18 when this began.

Plus, beyond the gates: CORS verified under `NODE_ENV=production` and development; the drift check verified against both a planted false claim and the honest README; `__trapDebug` confirmed absent from every production chunk.

### One test failed for the wrong reason

The recovery checks failed on first run — no reset token in the outbox. Not a bug in the feature: the rate-limiting section immediately above floods registration until it throttles, which is its job, so the recovery accounts registered afterwards were silently getting 429s. The section now runs *before* it, with a comment explaining why, so nobody re-introduces the ordering.

### Added to the plan

Two work packages from the founder's mid-session request that Unity reach parity with the deployed web build:

- **WP-024** — Unity mobile parity. A feature-by-feature matrix against the Railway build, then the work to close it. Landscape gate, virtual joystick, tap-to-interact and the product viewer do not exist in Unity at all.
- **WP-025** — Unity on the website. Deliberately a **feasibility spike, not a commitment**. Unity WebGL can replace the site, but the current build's superpower is being ~550 KB and playable in three seconds, and a streamed 4 km² city in mobile Safari is a genuinely hard ask. Three honest outcomes are written down in advance, including *"keep Three.js for mobile web"* — which is not a failure but the split the frozen-shop-window model already assumes.

### Unresolved

- 🔴 **H-11 — no email provider.** Reset links are generated and thrown away on the live deploy. The feature is complete and tested; nothing reaches a player until a provider exists.
- 🔴 **H-01/H-02** — nobody has looked at the trap card in either client.
- 🔴 **D-01** — how Kimani takes bookings today. Still blocking WP-017.
- Horizon 0 now blocked on WP-005, 006, 007, 008.

### Next recommended action

**WP-007 (backups)** before **WP-005 (ledger)** — the ledger migration touches live balances, and doing that without a proven restore is gambling with the only copy. WP-007 needs Richard for the Railway steps.

---

## Session 8 — 4 August 2026

### Objective

Push (CI had never run), then verify the Unity case file with the founder at the editor. Turned into a bug-fixing session, which is what verification is for.

### CI ran for the first time

Ten commits had been sitting unpushed, so `quality-gates.yml` existed and had **never executed**. That made it precisely the thing `check:repo`'s drift rule was written to catch, one layer up.

Pushed. **Green on the first run**, both jobs, ~1m25s, and green on all four pushes since.

### WP-018 verified ✅

Founder opened Unity: **0 errors, 0 warnings on import.** `TrapCardController.cs`, `TrapHudController.cs` and `CaseFileService.cs` had never been compiled by anything and were all valid. The card writes, saves, and survives a close and reopen.

### Four bugs, found by looking

None would have been caught by any test we had. All were found by one person using the thing for ten minutes.

**1 · Six red console errors on every launch.** `PlayerRig` disables the CharacterController at spawn on purpose — holding the player until the tile underneath streams in, or they fall through a city that has not arrived. `ThirdPersonController` kept calling `Move()` on it anyway, once per frame, which Unity logs as an error. Working as designed and indistinguishable from a fault. *Console noise that means nothing is where a real error goes to hide, and the founder had to read past it.*

**2 · It took three clicks to open a panel.** One line in `TrapMinimap`:
```cs
else if (mouse.leftButton.wasPressedThisFrame && cursorReleased)
    cursorReleased = false;
```
Any left click re-captured the mouse — including the click on the button. Escape freed the cursor; the click both pressed CASE FILE and re-locked the pointer in the same frame, and whether it registered was a race. Escape is a toggle now, and the recapture-on-click is gone.

**3 · The camera kept turning while a panel was open.** Freezing time does not stop mouse look: Starter Assets deliberately does not multiply it by `Time.deltaTime`, with a comment saying so. At `timeScale 0` the city stood still and the camera carried on — *worse* than not pausing, because you read your case file and look up somewhere else. Gated on cursor lock state.

**4 · A guest had a session and nothing could tell whose it was.**
```cs
if (res.account != null) current = res.account;
```
A guest has no account, by definition. `/api/players/session` returns a playerId and a token and nothing else — confirmed against the live server — so `current` stayed null and every service asking *"who is the player?"* got nothing. **The case file told somebody who had signed in as a guest to sign in. The bank was broken identically**, and nobody had noticed because nobody had opened it as a guest.

### Added while here

- **`C` toggles the case file**, founder's suggestion and the better fix — opening your own case file should not require finding a small button with a cursor you had to release first. It is also the shape a phone tap and a gamepad button need, so the console requirement gets it free.
- **`GameFreeze`** — panels hold the world still, the way the map already does. Same register pattern as `PointerFocus`, because two scripts writing `Time.timeScale` means closing the map un-pauses a panel that is still open. That exact fight had already happened once, with the cursor.
- **UIElements stubbed.** `TrapHudController`, `TrapCardController` and `TrapMenuController` were the only runtime code not compile-checked, so the first thing to compile them was somebody's editor — backwards, for the files most likely to be edited. Adding them found five gaps immediately (`SetEnabled`, `Invoke`, `cKey`).
- **Build artefacts untracked.** `tools/trapcard-check` had committed 28 compiled files because `.gitignore` named the other two dotnet tools individually. Now a pattern, and `check:repo` fails on binaries.

### The correction that mattered most

The founder pushed back on streaming the map to phones. **He was right.** The whole 4 km² city is **5.8 MB gzipped** — 294 tiles, 6,947 buildings — which is a rounding error against a 100–500 MB app. Streaming was a *browser* constraint carried into a platform that does not have one. **WP-026** ships it in the build; the network path survives only so a rebuilt map can reach installs without a store release.

It also narrowed **WP-025**: the map was never the weight in WebGL either. That is the Unity runtime and iOS Safari's memory ceiling.

### Commands run

All eight gates after every change. Green throughout. Guest session shape and the case-file write verified against the **live** Railway deploy, not a local server.

### Not verified

- `ThirdPersonController.cs` **cannot** be compile-checked: it is tracked, but the rest of StarterAssets is not, so a fresh checkout has nothing to compile it against. The editor is its only check — an argument for keeping our patches there small. Currently two, both a few lines.
- The card's *appearance*. It looked small in the screenshot; not yet resized.

### Unresolved

- 🔴 **H-11** — no email provider. Reset links are generated and thrown away on the live deploy.
- 🔴 **D-01** — how Kimani takes bookings today. Still blocks WP-017.
- 🔴 **H-04** — backups still unproven.
- Horizon 0 blocked on WP-005, 006, 007, 008.

### Next recommended action

Unchanged: **WP-007 (backups)** before **WP-005 (ledger)**.

---

## Session 15 — 10 August 2026 · Character route closed, WP-U15a Phone shell

### Decisions recorded, not made by me

**D-C01** UMA rejected — a product/architecture mismatch, explicitly *not* a claim UMA is defective. **D-C02** fixed authored archetypes, no runtime generation, no unrestricted sliders. **D-C03** prove **one** body end to end before any others.

Documentation no longer implies UMA adoption is planned. The containment guard **stays**, re-read as a general third-party boundary — its value was never that it named UMA, and the next candidate gets the same treatment.

`docs/03-technical/CANONICAL-BODY-ASSET-BRIEF.md` is written and complete enough to hand to an artist unchanged. **It is a specification, not an order.** Nothing has been commissioned. **H-16 closed → H-17 opened**, which is a decision about who makes the body and what it costs.

U17b is now **CHARACTER FRAMEWORK ROUTE RESOLVED — ART ASSET REQUIRED**, and is not a blocker for anything else. U15a was chosen to demonstrate that rather than assert it.

### WP-U15a — the Phone

Shell only. Six apps, three of which do something today.

**The doctrine did the design work.** *The Phone tells you; the world is where you do it.* Each app had a moment where it could **do** the thing or **point at** it, and each points: Wallet shows two server-reported balances and offers no transfer; Map asks the existing map to open; Missions opens the existing case file panel. That is also the safer build — the Wallet app holds no money logic to get wrong.

**Nothing was duplicated.** Where a screen already existed, the Phone links to it. Two entry points to one implementation is fine; two implementations of one case file is how the JS and C# trap-card logic drifted apart in the first place.

**No new input mechanism.** The Phone is the third customer of `PointerFocus` / `GameFreeze`, holder name `"phone"`. No pause flag, no focus boolean, no cursor write of its own.

### Two things found on the way

**A gate had quietly switched itself off.** `tools/csharp-check/*.csproj` used non-recursive globs, so `Assets/UI/Scripts/Phone/` compiled **nowhere** — the assembly-boundary check would have passed a UI→World reference in any new folder. All three are now recursive, and the guard was re-proved by planting `using TrapMadeIt.World;` in the new folder (fails, 1 error) and removing it (passes).

That is worth stating plainly: the check did not report a problem, and would not have. It was found because the new code failed to compile for an unrelated reason.

**The assembly boundary was real, not theoretical.** `TRP23.UI` cannot reference `TRP23.World`, so the Map app cannot call `TrapMinimap`. One event in Core — `GameSignals.OpenMapRequested` — rather than a second map inside the Phone or a Map app that says "press M". Not a general message bus; a signal hides who is talking to whom, and that cost is only worth paying where a reference is forbidden.

### Commands run

`check:csharp` (all three assemblies, 0 errors), `check:repo`, `check:trap`, `check:world`, `check:api`. Three new register checks in `check:world` for three-surface nesting, including **the Phone releasing a hold it never took** — `Teardown()` releases unconditionally, so that is the real path rather than a hypothetical.

### Not verified

**Unity has not been run.** There is no licence in this environment. So:

- **Nothing visual has been seen.** Layout, spacing, the glyphs and whether the phone reads as designed rather than as a debug panel are all **unconfirmed**. The USS compiles as text; it has not rendered.
- The `.meta` files were hand-written with fresh GUIDs. Unity may re-import them.
- Open/close, nesting and back navigation are proven **at the register level** and by compilation. The behaviour in a running scene is owner-verified — checklist in the report.

### Unresolved

- 🔴 **H-17** — the body is not commissioned.
- 🔴 **H-11**, 🔴 **H-04**, 🔴 **D-01** — unchanged.
- **H-14** — WP-U03 still needs its Unity pass.

### Next recommended action

**WP-U07, the interaction framework.** Reasons in the report.

---

## Session 16 — 10 August 2026 · WP-U15a repair pass

Owner verified U15a in Unity. Everything passed except one thing, and it was a real design hole rather than a slip.

### The stacking bug

**Root cause: the exclusivity rule had no owner.** `PointerFocus` and `GameFreeze` are *permission* registers — they answer "does anybody want the cursor / the freeze" and are **additive on purpose**, which is why nesting has never broken. Additive is the opposite of exclusive, so nothing in either register says two surfaces must not be on screen together. The map and the case file were both open, both correctly froze the world, both correctly released it. **Every check passed. The screen still had two things on it.**

It was already half-solved the wrong way: I had hand-wired Phone↔panel exclusivity in two places in `TrapHudController`. That is n² relationships, it omitted the map — and it **could not have included** the map, because that code is in `TRP23.UI` and the map is in `TRP23.World`. The bespoke approach was structurally incapable of reaching the surface that was actually broken.

**Fix: `Core/ModalSurface.cs`.** Same shape as the other two registers, opposite rule. A surface knows its own name and how to close itself; a seventh surface is one `Register` call and no edits elsewhere. Nested views never touch it — the Phone claims once and its apps navigate underneath. Both hand-wired checks were deleted.

The one subtlety is re-entrancy: `Claim` clears `current` **before** closing the outgoing surface, so that surface's `Yield` on the way out is a no-op instead of clearing the claim being made. It has its own check.

**Six new checks, proven in both directions** — commenting out the close call fails exactly the three exclusivity assertions, and restoring it passes 26.

### Map zoom

The cap was a hardcoded 2400 m orthographic size — a **4.8 km** view of a world that is 294 tiles at 250 m. Chosen before anything knew how big Lincoln was.

Implemented, because it was genuinely trivial and isolated as the brief allowed: `MapClient.WorldExtent` from the manifest tiles, passed through `WorldStreamer` narrowly (the map needs one fact, not the network layer), clamped in `TrapMinimap`. The old 2400 survives only as the pre-manifest fallback.

**Panning is not clamped, because the map cannot be panned** — it is centred on the player. Recorded that U13 must clamp against the same extent the moment it adds panning, or the same bug returns on the other axis.

### Recorded, not implemented

`docs/04-plan/work-packages/U13-MAP-AND-NAVIGATION-REQUIREMENTS.md`. The routing requirement in full, plus the dependency nobody has costed: **a routable graph does not exist.** The pipeline builds meshes from OSM ways; it does not extract a connected network with junction topology. That extraction is the substantial part of U13 and is **larger than the drawing work it enables** — U13 should be sized against the graph, not the line on the map.

In-world guidance candidates recorded but **not chosen**: D-W17 applies.

### Physical locations — stated plainly

**TRP Central Bank, the Trap Made It flagship, the barber and the starter home do not exist.** No buildings, no interiors, no in-world services. U15a does not satisfy any of those packages and must not be read as progress on them. The Phone *showing* a balance is the doctrine working; it is not the bank existing. **D-W20** — which building is the starter home — remains the owner's, and I must not invent one.

The Bank panel is legacy and is intended to retire when TRP Central Bank exists physically. **Not removed** — no package authorised it, and removing the only route to a balance before its replacement exists is a regression dressed as tidying up.

### Not verified

Unity has not been run here. The coordination is proven at the register level and by compilation; the on-screen behaviour is owner-verified. **The zoom clamp has not been seen** — the arithmetic is checked, the framing is not.

### Next recommended action

Unchanged: **WP-U07**, the interaction framework.

---

## Session 17 — 10 August 2026 · Lincoln visual fidelity audit (read-only)

**Nothing implemented.** Two documents produced: `docs/01-audit/LINCOLN-VISUAL-FIDELITY-AUDIT.md` and `docs/04-plan/VISUAL-ROADMAP.md`.

### The finding

The world is far better instrumented than it looks. The tiler already classifies every building by material, period, listing, ground-floor use and roof shape; already extracts roads with surfaces, paved areas, walls, trees and furniture; already pins story locations to real OSM ids. Unity already generates façade textures with window rows, brick courses and shopfronts.

**None of it is visible because wall albedo is computed twice and the two are multiplied together.** `CityTextures.Base("brick")` returns `(0.216, 0.173, 0.145)`; `BuildingMeshBuilder.WallColour` returns the same constant × the OSM tint; the shader does `texture × _BaseColor × vertexColour`. A typical brick wall lands at **≈ 3.4 % albedo — darker than asphalt.** The façades are being multiplied into the floor of the dynamic range.

The comment in `WallColour` predicts this exactly and is out of date: it says the stand-in colours apply "until the facades are ported". They were ported. The stand-in was never removed.

Second-order: `Tonemapping.mode = 0 (None)` with HDR on, the volume profile is Unity's stock template still carrying `CopyPasteTestComponent2` and `TestAnimationCurveVolumeComponent`, and the scene has `m_Sun: 0`.

### Evidence

Every figure comes from reading the pipeline and querying the shipped 294-tile export, not from memory. The six-tile High Street slice — `(-1,-1) (0,-1) (-1,0) (0,0) (-1,1) (0,1)`, x ∈ [−250, 250], z ∈ [−250, 500] — was **computed**, not chosen by eye: all three existing story anchors fall inside it on nearly the same line, the Bank at world origin.

528 buildings, 252 named, 278 shopfronts, 413 gabled roofs, 535 road segments, **29 step runs**, and **2 street lamps**. That last number decides Part 7: lamps cannot be data-driven in Lincoln and must be procedural.

### Two owner decisions surfaced, not taken

**The Trap Made It flagship has no anchor.** JD, the Bank, the Barber and the Prison are pinned; the flagship is not. I did not invent one — same rule as D-W20.

**`way/705942979` on the High Street is tagged "Toby's Barber Shop"**, while Kimani's anchor is on Corporation Street. High Street footfall against the real address is a product trade-off and not mine to make.

### Not verified

**Unity was not run.** No rendered image was inspected. The visual claims are derived from the shader, the texture generator and the vertex data — the arithmetic is checked, the picture is not. Nothing was downloaded, viewed or imported.

### Next recommended action

**WORLD-V01** — material and lighting baseline. XS–S, reversible, no pipeline or geometry change, and the prerequisite for judging every later visual package. Not authorised.

Gameplay-wise **U07** is still the thing that unblocks shops, the barber, Drops and NPCs. Which of the two goes first is the owner's call.

---

## Session 18 — 10 August 2026 · WORLD-V01 material + lighting baseline

### The defect, corrected

The audit said ≈3.4 % albedo using sRGB arithmetic. The project renders **linear**, and the two channels are not treated alike — a texture is sRGB and converted on sample, a vertex colour is used raw. The real figure is **0.00596 linear against a road at 0.0272: the brick wall was 4.6× darker than the tarmac in front of it.** Worse than reported, same cause.

### The fix is a contract, not a brightness constant

`TrapMaterials.cs` is now the one table. Texture carries material colour and pattern; vertex colour carries per-building variation × AO and is a multiplier around 1.0; `_BaseColor` stays white. Three files stopped deciding what things are made of — `BuildingMeshBuilder`, `CityTextures` and `WorldStreamer` all had their own colour tables, and `WorldStreamer`'s was a *third* one nobody had noticed.

The tint needed care rather than deletion. It is not centred on 1.0 — brick averages `(0.972, 0.801, 0.730)` across 3,452 buildings, because in the web client it was laid over a neutral canvas and carried the brick hue. Using it raw over an already-brick texture re-applies brick-ness. So it is divided by its style's mean and clamped, leaving only how a building differs from the average of its kind — which is what makes a terrace read as separate properties.

**The means are measured from the shipped export, not copied from the tiler's formula**, and `check:materials` recomputes them from that same export. Same discipline as the trap-card shared table.

### Normals without new art or new geometry

Every pattern in `CityTextures` draws recesses dark — mortar joints, sett gaps, roof courses. That is not a stylistic coincidence, it is what those features are, so the albedo's luminance is already a height field and a Sobel of it is already the normal. Eleven maps cover the whole city, one per family, shared. Glass, render, grass and water get none: flat in life.

The shader derives its tangent frame from screen-space derivatives rather than a tangent stream, so no mesh builder was touched and no vertex memory added — which also keeps §8 clean.

### One thing I did not do, and why

The brief asked for an authored TRP volume profile asset. A `VolumeProfile` is a ScriptableObject whose YAML carries GUID references into the URP package, and there is no Unity here to validate it — hand-writing one is a good way to produce a file that diffs cleanly and fails to load. It is built in code instead: project-owned, deterministic, reviewable, and impossible to half-write. Same reasoning for the sun, assigned by `WorldAtmosphere` rather than by editing `TrapGame.unity`.

Unity's stock `DefaultVolumeProfile` still carries `CopyPasteTestComponent2` and friends. They are inert and overridden. Deleting them means hand-editing a Unity asset, so it is an owner task rather than a risk taken in a package about brightness.

### The flagship, and a correction

D-W01 already said the JD anchor must be renamed; my audit said "the flagship has no anchor", which was imprecise — it exists, under the wrong name. Now **TRAP MADE IT FLAGSHIP**, same OSM id, same building, same door, same coordinates.

**The rename did not reach the game at first.** Anchor names are baked into `map-export.json.gz`, and the server refuses an import whose `builtAt` is not newer — correct, defensive behaviour that stops a boot clobbering the database. So the export's `builtAt` had to be bumped for the change to propagate at all. Worth knowing: **editing the export without touching `builtAt` is a silent no-op on any machine that already has the map.**

`kind: "chapter"` is unchanged. D-W01 also wants that reclassified, but it is a gameplay change with content and mission consequences and this is a rendering package.

### Verified

`check:materials` (new, 30 assertions) · `check:csharp` 0 errors ×3 · `check:world` — **geometry byte-identical: 288,726 triangles, 5,969 approaches** · `check:repo` · `check:trap` · `check:api` · `map:verify` all checks passed.

Guard proven both ways: re-planting the original `WallColour` fails exactly the two checks that name it; removing it passes.

### Not verified

**Unity has not been run. No rendered image has been seen.** I can show that the arithmetic is now right and that the geometry did not move. **I cannot tell you it looks good** — whether limestone reads as Lincoln stone, whether the normals are too strong, whether MSAA 4× is affordable. That needs the owner's screenshots, and if the result is technically correct and visually disappointing, that is a real possible outcome of this package.

### Next recommended action

**WORLD-V02, roofs** — but only after the screenshots. Judging V02 against an unverified V01 would repeat the mistake V01 exists to fix.
