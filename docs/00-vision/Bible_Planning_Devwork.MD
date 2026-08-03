# Bible → Planning → Dev Work

**Project:** TRP23 / TRAP MADE IT / Trapology
**Date compiled:** 2026-07-27
**Author:** Engineering audit + Founder Bible synthesis
**Status of this document:** Master planning reference. Everything below is derived from (a) a full read of the 14 Founder Bible volumes in `Bibile /`, and (b) a full audit of the code in this repository.

---

## PART 0 — HOW TO READ THIS DOCUMENT

Three parts:

1. **Part 1 — The Audit.** What actually exists in this repo today, honestly assessed. No marketing language.
2. **Part 2 — The Bible, Compiled.** All 14 volumes distilled into one coherent doctrine, plus the strategic tensions I found in it.
3. **Part 3 — The Development Work, In Full.** Everything that must be built to deliver what the Bible describes, broken into phases, with dependencies, effort sizing, and acceptance criteria.

If you only read one thing, read **Part 3, Section A ("The Ten Things Standing Between You And Launch")**.

---

# PART 1 — THE AUDIT: WHAT YOU ACTUALLY HAVE

## 1.1 What this project is

You are building **a clothing brand delivered through a video game**. Not a shop with a game attached — the game *is* the storefront. A player walks a world, enters chapter locations, completes missions, earns Trap Coins, and buys real apparel that exists as a physical product. The Bible (Vol 13, Ch 6) states the endgame explicitly: *"the clothing part of the brand is the starting point of the journey, while the gaming world is the ultimate goal"* — a GTA-scale open world, named as competing with Rockstar.

That is an enormous ambition. The audit below measures the current codebase against it.

## 1.2 Repository inventory

| Area | Location | State |
|---|---|---|
| Web game runtime | `src/game.js` (2,205 lines), `src/main.js`, `index.html` (331 lines) | **Working prototype.** Three.js, 6 room-based levels, missions, stash flow, product inspect viewer, HUD, display settings |
| Landing / auth UI | `index.html` lines 19–61 | **Working.** Home → mandatory signup/login → game, with guest bypass and TOTP 2FA enrolment |
| Styling | `src/styles.css` | Working, carries the visual identity |
| Backend API | `server/mockApiServer.js` (1,386 lines), raw `node:http` | **Extensive scaffold.** ~60 endpoints across auth, CMS, commerce, wallet, bank, world, rewards, ops, community |
| Persistence | `server/storage/sqliteStore.js` + `trapmadeit.db` (better-sqlite3) | Working. Server-authoritative wallet + ledger |
| 2FA | `server/totp.js` (87 lines) | Working RFC 6238 TOTP implementation |
| Admin back-office | `admin.html`, `src/admin.js` (176 lines) | **Thin scaffold.** Edits chapter/drop metadata only |
| Content model | `src/data/defaultContent.js`, `contracts.js`, `contentStore.js` | 6 chapters, 6 drops, mission definitions, validation rules |
| Open-world data | `src/data/defaultWorld.js` | Location list with coordinates — data only, no renderer consumes it in the main game |
| Render pipeline | `src/render/*` (5 files) | Quality profiles, device profiling, room asset registry + validation. **Registry is templates, not real assets** |
| API client layer | `src/api/client.js` + 9 service modules | Written, partially wired |
| Free-roam prototype | `FP FREE ROAM TEST PHASE 1/` (untracked) | **Standalone spike.** First-person walk, building collision, bank interior, 6 mission buildings, CDN Three.js. Deliberately isolated — shares no code with main app |
| Unity project | `Unity/TRP23/` | **Early.** 4 real scripts: `SceneFlow`, `TrapMenuController`, `TrapHudController`, `MockAuthService` + editor setup. Menu→Game scene flow and a mock auth service mirroring web rules |
| Mobile packaging | `capacitor.config.ts`, docs for iOS/Android | Config + docs only; no `ios/` or `android/` folders generated |
| Deployment | `railway.json`, `nixpacks.toml` | Railway, Node provider forced (Unity `.csproj` was tripping .NET detection) |
| Docs | `docs/` (7 files) | Handoff, render pipeline, completion status, platform release guides |

## 1.3 What genuinely works today

- A playable 3D web prototype with a real gameplay loop (explore → missions → stash → reward → purchase).
- Real accounts: username/email/phone/password, scrypt hashing, session tokens, working TOTP 2FA.
- A server-authoritative economy: wallet, ledger, bank deposit/withdraw/transfer, checkout that debits coins and decrements inventory.
- Content editable outside the game code via the admin page and CMS endpoints.
- A build/deploy path that works (Vite → Railway).

That is a real foundation. Most brands at this stage have a Shopify theme.

## 1.4 The honest gaps

**`docs/COMPLETION-STATUS.md` says "COMPLETE" against nearly every line item.** That document is measuring *scaffolding existence*, not *shippability*, and it says so in its own footnote. Read against the Bible, here is the true position:

### Critical (blocks any real launch)

1. **No real money exists anywhere in the system.** Grep for `stripe|paypal|payment` returns only variable names. `POST /api/wallet/topup` credits coins with no payment processor behind it. Checkout debits *coins*, not currency. There is no way for a customer to actually buy a garment. **The commerce system is a simulation.**
2. **No fulfilment reality.** `POST /api/commerce/fulfillments` writes a record. Nothing connects to a warehouse, 3PL, shipping label provider, or courier. No addresses are collected anywhere in the signup or checkout flow.
3. **Secrets are committed to a public-capable git repo.** `AuthKey_7373KM27U2(1).p8` (an Apple private key), `distribution.cer`, `CertRequest.csr`, `TRAP_Made_It_CI.mobileprovision` are all tracked. The `.p8` is an App Store Connect private key — **treat it as compromised, revoke and reissue it.**
4. **`server/storage/trapmadeit.db` is committed.** A SQLite file in version control means the deployed database is whatever was last committed, player data is overwritten on every deploy, and any real account data ends up in git history. Railway's filesystem is also ephemeral — **player accounts do not survive a redeploy.**
5. **The CI workflows referenced in the README do not exist.** `.github/` is absent. `quality-gates.yml`, `ios-testflight.yml`, `android-release.yml` are documented but not present. Nothing is being tested on push.

### Major (blocks the Bible's vision)

6. **Zero real 3D or product assets.** `roomAssetRegistry.js` is six `createRoomAssetTemplate()` calls. Every product `media` field is `"placeholder-front"` / `"placeholder-back"`. The rooms are procedurally drawn canvas textures. **No garment in the game looks like a garment you sell.**
7. **The open world doesn't exist in the shipped game.** `defaultWorld.js` has coordinates; the free-roam prototype proves the movement feel; neither is in `src/game.js`. The live game is still six discrete rooms.
8. **Three parallel clients diverging.** Web (`src/game.js`), free-roam spike (`FP FREE ROAM TEST PHASE 1/`), and Unity (`Unity/TRP23/`) each have their own auth, their own world model, their own HUD. Unity has a `MockAuthService` re-implementing the web's signup regex by hand. **This will not converge on its own — it needs an architectural decision, now.**
9. **The Bible's ecosystem is ~10% represented in code.** Vol 5 names ten pillars: Clothing, Storytelling, Packaging, Community, Technology, Gaming, TRP Rewards, Run Club, Barbering, Future Ecosystem. The code has API stubs for Community and Rewards; Packaging, Run Club, Barbering, Education/Mentorship, Ambassadors, Events, and Retail have **no representation at all**.
10. **Admin can't run the business.** The admin page edits chapter and drop text. It cannot: view orders, process a refund, manage inventory, moderate a story, view analytics, manage members, or publish a campaign. The API endpoints exist; **no UI drives them.**

### Notable (quality / risk)

11. `src/game.js` at 2,205 lines is one monolith — a re-monolithing of the file Phase 1 broke up. Vite already warns on bundle size.
12. `mockApiServer.js` is a 1,386-line `if (pathname === ...)` chain with no router, no middleware, no request validation layer, no rate limiting, and no automated tests beyond a smoke script.
13. No test suite. `scripts/smoke-api.mjs` is a route liveness check, not tests.
14. No GDPR/data-protection posture despite collecting email, phone, and (eventually) addresses and payment data from UK consumers.
15. `pnpm-lock.yaml` and `pnpm-workspace.yaml` are gitignored but still present on disk — a build-tool ambiguity trap.

## 1.5 Brand naming — RESOLVED 2026-07-27

Confirmed by the founder:

- **Trapology** — the philosophy. What the Bible documents; the doctrine everything is built against.
- **Trap Made It** — the official name of the game and the shop. The customer-facing name, the store-listing name.
- **TRP 23** — the short form, for internal and repo use.

**Still open:** the founder name. The Bible is signed **Kamani Dean Smith**; the README copyright says **KimaniTheBarber**. One answer is needed before any store listing or trademark filing.

Also still to place: **"TRP WRLD"** (Vol 13) as the name of the open world, and **"TRP"** as the earned-currency name (see Tension 2). Neither conflicts with the above, but both should be confirmed as product names beneath *Trap Made It* rather than alternatives to it. Code and docs using any other name for the product should be corrected as they are touched.

---

# PART 2 — THE BIBLE, COMPILED

I read all 14 volumes. Here is the whole doctrine in one place.

## 2.1 The volumes

| Vol | Title | Format | Core contribution |
|---|---|---|---|
| 1 | Foundation | PDF | Founder's letter, principles, why Trapology exists |
| 2 | The Philosophy | PDF | The 11-concept mental framework |
| 3 | The Trapologist Journey | PDF | The 7-stage progression system |
| 4 | Founder Questions | PDF | 10 leadership principles as Q&A |
| 5 | The Ecosystem | DOCX | The 10 business pillars |
| 6 | Brand Standards | PDF | Non-negotiables: identity, colour, logo, tone, packaging |
| 7 | Legacy & Manifesto | PDF | The manifesto and community promises |
| 8 | Leadership & Culture | DOCX | Hiring, culture, accountability, future leaders |
| 9 | Product Design Bible | PDF | 9 chapters of product/garment standards |
| 10 | Storytelling & Marketing | DOCX | Campaigns, photography, film, social, launch strategy |
| 11 | Community & Membership | PDF | TRP Membership, Run Club, ambassadors, mentorship |
| 12 | Luxury Retail Experience | PDF | 9 chapters of physical store standards |
| 13 | Global Expansion | DOCX | Market selection, digital expansion, **the GTA-scale game goal** |
| 14 | The Complete Playbook | DOCX | Everything condensed into an operating manual |

## 2.2 The single idea

> **Trapology exists to help people untrap themselves mentally.** Clothing is the entry point; transformation is the destination. *(Vol 1, 4, 7, 14 — repeated verbatim across volumes.)*

Everything else is downstream of that sentence. The Decision Framework (Vol 6, 8, 14) is the test applied to every choice:

1. Does this protect the vision?
2. Does it help people untrap themselves?
3. Does it strengthen the brand long term?

**If no — do not do it.** Three questions that should be a literal checklist in your PR template and your CMS publish flow.

## 2.3 The Trapologist Journey (Vol 3) — this is your game design document

Seven stages, and they map almost perfectly onto a progression system:

| Stage | Bible definition | Game system it implies |
|---|---|---|
| 1. Overstanding | Knowledge becomes behaviour. Study your influences, don't blame them | Onboarding / tutorial chapter; reflective prompts, not skippable text |
| 2. Acknowledgement | Admit honestly where you are. Responsibility, not weakness | A "name your trap" intake — a real, saved, private player input |
| 3. Strategy | Write what traps you. Objectives → weekly actions. Measure relentlessly | Goal-setting UI; player-authored objectives stored on the profile |
| 4. Action | Imperfect action beats perfect ideas. One action daily | Daily action system; streaks; momentum meter |
| 5. Weekly Self Audit | Four fixed questions, every week | **A weekly ritual loop** — the single strongest retention mechanic in the whole Bible |
| 6. Discipline | Consistency → obsession → passion → lifestyle → movement | Long-horizon progression; a visible ladder tied to consistency, not spend |
| 7. Becoming a Trapologist | The title is earned, never bought | **A rank that money cannot purchase.** Hard-enforced in code |

Stage 7 is a product constraint with teeth: **no amount of spending may confer Trapologist status.** Vol 11 restates it — *"membership begins with mindset, not purchases"* — and Vol 6 — *"the community is built on action, not status."*

## 2.4 The ecosystem (Vol 5) — the ten pillars

1. **Clothing** — first interaction; every collection is a chapter
2. **Storytelling** — every collection teaches a lesson
3. **Packaging** — evidence bags, newspapers, archive folders; unboxing *is* chapter one
4. **Community** — accountability between members
5. **Technology** — the philosophy available daily
6. **Gaming** — challenges mirroring real-life traps
7. **TRP Rewards** — earned by participation, **not spend**
8. **Trapology Run Club** — physical discipline as mental discipline
9. **Barbering Philosophy** — presentation as self-respect
10. **Future Ecosystem** — luxury house + education + events + creative spaces + fundraisers, giveaways, and workshops in schools/workplaces/charities

## 2.5 Brand standards that are technical requirements (Vol 6, 9)

- **Colour is doctrine, not decoration.** Black = resilience. Grey = growth through uncertainty. Rose gold = progress and achievement. *(Note: the code currently uses a gold `0xc9a06a` — reconcile "gold" vs "rose gold" and write the exact hex values into a design-token file.)*
- **No random drops.** Every release is a chapter; the chapter defines the product. This should be **enforced by the CMS**: a drop cannot be published without a parent chapter, a lesson, and a story.
- **Every garment must answer three questions** (Vol 9, Ch 3): Why does it exist? What lesson does it teach? How does it strengthen the philosophy? → These are **three required non-empty fields** on the product model.
- **The logo is a symbol of mental progress**, not decoration — governs where and how it may be placed in-game.
- **Tone of voice:** confident, honest, purposeful. Inspire, don't impress. Challenge without arrogance. → A copy style guide every string in the game must pass.

## 2.6 Community & membership (Vol 11)

TRP Membership rewards **participation, contribution, and consistency** with access, education, events, and products. Recognition celebrates *meaningful milestones*, explicitly **not superficial status**. Ambassadors are chosen for naturally living the philosophy. Education and mentorship — workshops and mentoring — are named as core, not nice-to-have. Local communities, one global culture.

## 2.7 Storytelling & marketing (Vol 10)

The founder's own words: *"compared to all other high street brands we are going to keep a clear and concise story, which is told through the online game and the way of purchasing clothes."* The game is the marketing channel. Campaigns run on one idea across photography, film, copy, and launch events. Success is measured by *loyalty, engagement, impact, and long-term brand strength — not only sales.* → Your analytics dashboard must not be a revenue dashboard.

## 2.8 Retail (Vol 12) and expansion (Vol 13)

Physical stores as philosophy environments: store design, customer journey, hospitality, story-led merchandising, music/scent/atmosphere, the packaging ritual, events, operational standards. Expansion is deliberate — creative/cultural cities first, community before commerce, partners who respect the mission, fifty-year thinking.

And the technical north star, stated plainly (Vol 13, Ch 6): **a full TRP WRLD game competing with Rockstar/GTA.**

## 2.9 Strategic tensions I have to flag

These are not criticisms of the Bible; they are places where the doctrine and the current build disagree, and where a decision is needed before dev work locks it in.

**Tension 1 — The trap-house aesthetic vs. the untrapping message.**
The game's chapters are "The Come Up", "The Cook Up", "Graveyard Shift", "The Front", "Top Floor", "The Warehouse", with "find the stash" missions and "abandoned squat" / "derelict kitchen" rooms. The Bible is emphatically about *escaping* that world — "the trap was never your environment; the trap was believing you couldn't change" (Vol 7).

The code already tries to bridge this: every chapter carries a `moralFocus` field ("Awareness: you are not stuck forever", "Discipline: craft over chaos"). That instinct is right, and the free-roam README's framing — *"GTA-style, no violence"* — is right too.

**This needs to be made explicit and airtight, because it is your single biggest reputational and app-store risk.** The narrative must clearly read as *a journey out*, not a glamorisation. Recommended: an in-game framing device (the world is the trap you are escaping; each chapter you complete visibly changes the world state toward light) and a written narrative charter that every chapter is reviewed against. Concretely: as the player progresses, the world should get brighter, cleaner, more legitimate — the visual arc carries the moral arc. Age ratings (PEGI/ESRB/IARC) will ask about drug references; have the answer designed in, not retrofitted.

**Tension 2 — "TRP earned by participation, not spend" vs. buyable coins.**
The bank sells Trap Coins for real money (free-roam README: *"buy Trap Coins with real money"*). The Bible says rewards come from participation, not purchase. Both can coexist — **but only if they are two separate currencies.** Recommendation: **Trap Coins** (purchasable, spendable on product) and **TRP** (earned only, never purchasable, gates rank/access/membership). Never let one convert into the other. This resolves the tension cleanly and is a schema decision that must be made before the economy has real users.

**Tension 3 — Buying coins with real money to buy clothes.**
A closed-loop purchasable in-game currency that redeems for physical goods attracts financial-regulation attention (e-money / stored value), payment-processor scrutiny, and, on iOS, Apple's IAP rules. **Apple will likely require in-app purchase (30%) for coin top-ups if coins are consumed in-app**, while physical goods sold for real currency are exempt. Get this reviewed by a payments-aware advisor *before* building the top-up flow — a wrong answer here means an App Store rejection and a rebuild.

**Tension 4 — Scope.** The Bible describes a luxury fashion house, a global retail chain, a run club, a barbershop philosophy, an education programme, a community platform, and a GTA competitor. That is five companies. The dev plan below sequences it so that each phase is independently valuable and the later phases are optional, not load-bearing.

---

# PART 3 — THE DEVELOPMENT WORK, IN FULL

## Section A — The Ten Things Standing Between You And Launch

In priority order. Nothing in later phases matters if these aren't done.

1. **Revoke and remove the committed Apple `.p8` key and certificates** — then purge them from git history and move to CI secrets.
2. **Get the SQLite DB out of git and onto durable storage** (Postgres, or a Railway volume) — today, real accounts die on every deploy.
3. **Pick the client architecture** — web-Three.js, or Unity, or Unity-with-web-shell. Three diverging clients is the most expensive problem in the repo.
4. **Decide the two-currency model** (Trap Coins purchasable / TRP earned) and migrate the schema before you have users.
5. **Integrate a real payment processor** and a real checkout with addresses, tax, and shipping.
6. **Build order fulfilment** — an actual path from "player buys" to "garment ships".
7. **Produce real 3D and product assets** — the rooms and garments have to look like the brand.
8. **Build the admin/ops UI** over the API surface that already exists.
9. **Write the narrative charter** resolving Tension 1, and design the world's visual arc around it.
10. **Stand up CI, tests, and error monitoring** — the workflows the README already claims exist.

---

## Section B — Phased development plan

Effort key: **S** ≈ days · **M** ≈ 1–3 weeks · **L** ≈ 1–2 months · **XL** ≈ a quarter or more (all assuming one focused developer; parallelisable where noted).

---

### PHASE 0 — SECURITY, INFRASTRUCTURE & HYGIENE
*Blocking. Nothing ships on top of this until it's done.*

| # | Task | Effort | Notes |
|---|---|---|---|
| 0.1 | Revoke Apple `.p8` key in App Store Connect; reissue | S | **Do first.** Assume compromised |
| 0.2 | Remove `.p8`, `.cer`, `.csr`, `.mobileprovision` from repo + purge history (`git filter-repo`), force-push, rotate anything else exposed | S | Coordinate — rewrites history |
| 0.3 | Add all cert/key patterns to `.gitignore`; add a secret-scanning pre-commit hook (gitleaks) | S | |
| 0.4 | Migrate SQLite → **Postgres** (Railway managed); write a migration + repository layer so `sqliteStore.js`'s interface is preserved | M | Or, minimum viable: Railway persistent volume. Postgres is the right call |
| 0.5 | Untrack `server/storage/trapmadeit.db`; make it dev-only | S | |
| 0.6 | Create `.github/workflows/quality-gates.yml` — lint, build, `validate:rooms`, `test:api`, `export:unity` | S | README already documents it |
| 0.7 | Delete stray `pnpm-lock.yaml` / `pnpm-workspace.yaml` from disk | S | |
| 0.8 | Environment config: `.env.example`, secrets via Railway/GitHub, no hardcoded ports/URLs | S | |
| 0.9 | Error monitoring + structured logging (Sentry + pino) across server and client | S | |
| 0.10 | Automated DB backups + a tested restore procedure | S | |
| 0.11 | Security hardening on the API: rate limiting, CORS allowlist, security headers, body-size limits, input validation (zod) on every route | M | The `if (pathname ===)` chain needs a validation layer regardless |
| 0.12 | Independent security review of auth: session token entropy/expiry/rotation, scrypt params, 2FA recovery codes, account-enumeration on login, password reset (**currently missing entirely**) | M | Password reset is a genuine gap — users who forget are locked out permanently |

**Acceptance:** No secrets in the repo or its history. A deploy does not destroy player data. Push runs a green pipeline. A forgotten password is recoverable. Errors reach a dashboard.

---

### PHASE 1 — THE ARCHITECTURE DECISION
*One decision that determines the cost of everything after it.*

**The problem:** three clients, three auth implementations, three world models.

**Option A — Web-first (Three.js), Unity shelved.**
Fastest to revenue. One codebase, instant distribution, Capacitor for mobile stores. Ceiling: a browser game will not credibly "compete with GTA". Effort to consolidate: **M**.

**Option B — Unity-first, web becomes a marketing site + shop.**
Matches the Vol 13 endgame. Real console/PC path, proper asset pipeline. Costs: restart much of the gameplay work, Unity talent required, slower to revenue. Effort: **XL**.

**Option C — Hybrid (recommended).**
Web stays the shop, the story, and the accessible chapter experience — it earns money now. Unity becomes **TRP WRLD**, the long-horizon open world, sharing *one backend* and *one account*. The free-roam prototype's proven mechanics inform the Unity build, then that folder is archived.

**Recommendation: Option C**, with a hard rule — **the backend is the single source of truth; no client re-implements business logic.** Unity's `MockAuthService` re-implementing signup regex is the exact pattern to eliminate.

| # | Task | Effort | Notes |
|---|---|---|---|
| 1.1 | Write and circulate an architecture decision record capturing the choice | S | |
| 1.2 | Define the canonical **REST/JSON contract** as an OpenAPI spec — every client generates from it | M | Kills the divergence at the root |
| 1.3 | Replace Unity's `MockAuthService` with a real `HttpAuthService` against the live API | M | Keep the mock behind an interface for offline dev |
| 1.4 | Extract shared game/world data (chapters, drops, locations, missions) into a versioned content bundle both clients fetch | M | |
| 1.5 | Fold the free-roam prototype's movement, collision, and interaction into the chosen client; archive the folder | M | Don't lose it — it's the best movement feel in the repo |
| 1.6 | Break up `src/game.js` (2,205 lines) into modules: world, player, missions, UI, economy, render | M | Also fixes the bundle-size warning via code-splitting |
| 1.7 | Refactor `mockApiServer.js` into a real router with middleware (keep it Node-native or adopt Fastify) — rename it; it isn't a mock any more | M | |

**Acceptance:** One documented contract. Every client authenticates against the real backend. No duplicated business rules. `game.js` under 400 lines per module.

---

### PHASE 2 — REAL COMMERCE
*This is where the project stops being a prototype.*

| # | Task | Effort | Notes |
|---|---|---|---|
| 2.1 | **Decide the two-currency model** (Trap Coins purchasable / TRP earned-only) and migrate the schema | M | Bible-mandated (Vol 5, 11). Do before real users |
| 2.2 | Payment processor integration — Stripe recommended (Payment Intents, webhooks, SCA/3DS for UK/EU) | L | |
| 2.3 | Real checkout: shipping address capture + validation, tax (UK VAT + destination rules), shipping rates, order confirmation | L | Nothing collects an address today |
| 2.4 | Coin top-up via real payment, with a full audit trail | M | **Resolve the Apple IAP question first (Tension 3)** |
| 2.5 | Inventory management: real stock levels, size/variant matrix, reservations at checkout, oversell prevention, back-in-stock | L | Current inventory is a single number per drop |
| 2.6 | Order lifecycle: created → paid → picked → packed → shipped → delivered → returned, with player-visible status | M | |
| 2.7 | Fulfilment integration — 3PL or Shopify-as-backend, plus label generation and tracking | L | Decide: self-fulfil vs 3PL vs Shopify headless. **Strategic call needed** |
| 2.8 | Returns & refunds: real refund to the original payment method, RMA flow, restocking | M | |
| 2.9 | Transactional email/SMS: order confirmation, shipping, delivery, password reset, 2FA backup | M | |
| 2.10 | Fraud, chargebacks, and reconciliation reporting | M | |
| 2.11 | Legal: T&Cs, privacy policy, cookie consent, GDPR (SAR/erasure/portability endpoints), UK consumer distance-selling rights, age gating | M | Not optional for UK consumer sales |
| 2.12 | PCI posture — keep card data entirely inside Stripe Elements; never touch the server | S | Enforce architecturally |

**Acceptance:** A stranger can create an account, earn coins, buy a real garment with a real card, receive an email, track it, get it delivered, and return it.

---

### PHASE 3 — CONTENT, ASSETS & THE BRAND MADE VISIBLE
*Right now the game does not look like a luxury brand. This phase fixes that. Parallelisable with Phase 2.*

| # | Task | Effort | Notes |
|---|---|---|---|
| 3.1 | **Design-token system**: exact hex for black/grey/rose-gold, type scale, spacing, motion — one source consumed by web, Unity, and admin | M | Vol 6/9 colour doctrine becomes code. Resolve gold vs rose-gold |
| 3.2 | Logo and brand asset pipeline — proper vector/raster set at all densities, correct placement rules | S | Replaces the current single `trap-logo.jpg` |
| 3.3 | **Real 3D room environments** for all six chapters — model, texture, light, optimise | XL | Biggest single art cost. Needs a 3D artist |
| 3.4 | **Real garment assets** — photogrammetry or modelled 3D, per colourway, with the inspect viewer rebuilt around them | XL | Every product is `"placeholder-front"` today |
| 3.5 | Product photography + campaign imagery per Vol 10 (authentic, cinematic, emotionally driven) | L | Non-engineering, on the critical path |
| 3.6 | Asset delivery pipeline: CDN, compression (Draco/KTX2/basis), LODs, progressive loading, per-device budgets | L | Extends `src/render/assetPipeline.js` |
| 3.7 | Replace `roomAssetRegistry.js` templates with real registered assets; make `validate:rooms` fail CI on placeholders | M | Turns the existing validator into a real gate |
| 3.8 | Audio: music direction, signature sound identity, SFX, spatial audio (Vol 12, Ch 6 — atmosphere is doctrine) | L | Currently silent |
| 3.9 | **The narrative charter** (resolves Tension 1) + rewrite of every chapter's story so the arc reads as escape | M | Do this *before* 3.3, so the art serves it |
| 3.10 | The world's visual arc: environments visibly brighten/legitimise as the player progresses | L | The mechanic that makes the moral arc felt rather than stated |
| 3.11 | Copy pass: every string against the Vol 6 tone of voice | M | |
| 3.12 | Accessibility: contrast, subtitles, remappable controls, motion sensitivity, screen-reader support on all 2D UI | M | Also an app-store requirement |

**Acceptance:** A screenshot of the game is indistinguishable in quality from the brand's campaign imagery. `validate:rooms` passes with zero placeholders.

---

### PHASE 4 — THE TRAPOLOGIST JOURNEY AS A SYSTEM
*Vol 3 turned into software. This is what makes it Trapology rather than a shop with a 3D skin.*

| # | Task | Effort | Notes |
|---|---|---|---|
| 4.1 | **Stage 2 — "Name your trap"** intake: private, persisted, revisitable player input at onboarding | M | The moment a player commits |
| 4.2 | **Stage 3 — Strategy builder**: player-authored objectives broken into weekly actions, with progress tracking | L | |
| 4.3 | **Stage 4 — Daily Action**: one action a day, streaks, a momentum meter | M | |
| 4.4 | **Stage 5 — Weekly Self Audit**: the four Bible questions, weekly, with history and reflection | L | **The strongest retention mechanic in the Bible.** Prioritise it |
| 4.5 | **Stage 6 — Discipline ladder**: long-horizon progression driven by consistency, not spend | M | |
| 4.6 | **Stage 7 — Trapologist rank**: earned only. **Enforce in code that no purchase path can grant it** | M | Bible-critical constraint; write a test that asserts it |
| 4.7 | Reflection journal — private, exportable, the player's own record | M | |
| 4.8 | Notification/reminder system for daily actions and the weekly audit (push, email, in-game) | M | |
| 4.9 | Progression analytics: are people actually transforming? Measure per Vol 10 (loyalty/engagement/impact, not sales) | M | |
| 4.10 | Anti-gaming: the self-audit must resist being farmed for rewards | M | Extends the existing anti-abuse rules |

**Acceptance:** A player who never spends a penny has a complete, meaningful, months-long journey — and can reach Trapologist. A player who spends heavily cannot skip a single stage.

---

### PHASE 5 — ADMIN, OPS & RUNNING THE BUSINESS
*The API exists. Nothing drives it. Parallelisable with Phase 3/4.*

| # | Task | Effort | Notes |
|---|---|---|---|
| 5.1 | Replace `admin.html` with a real admin application (React/Svelte, role-based access) | L | 176 lines of `admin.js` is not a back office |
| 5.2 | Order management: search, view, fulfil, refund, annotate, export | M | |
| 5.3 | Inventory management: stock, variants, restock, low-stock alerts | M | |
| 5.4 | **Chapter/campaign CMS with Bible enforcement**: a drop cannot publish without a parent chapter, a lesson, and answers to Vol 9's three questions | M | The Decision Framework, encoded |
| 5.5 | Scheduled publishing / unlock windows with preview and rollback | M | Fields exist; no scheduler runs them |
| 5.6 | Player/member admin: search, support actions, refunds, moderation, GDPR erasure | M | |
| 5.7 | Moderation queue UI over the existing endpoints | M | |
| 5.8 | Analytics dashboard measuring **loyalty, engagement, impact, brand strength** — not just revenue (Vol 10) | L | |
| 5.9 | Audit log UI over `GET /api/ops/audit` | S | |
| 5.10 | Discount/campaign codes with real rules, limits, and abuse protection | M | |
| 5.11 | Admin 2FA enforcement + IP allowlist option | S | |
| 5.12 | Runbooks: incidents, deploys, rollbacks, on-call | S | |

**Acceptance:** The business can be operated for a full week by a non-developer without anyone touching the codebase.

---

### PHASE 6 — COMMUNITY & MEMBERSHIP (VOL 11)
*Vol 11 in full. Endpoints exist for stories, opportunities, events, leaderboard — nothing surfaces them.*

| # | Task | Effort | Notes |
|---|---|---|---|
| 6.1 | Member profiles: journey stage, contributions, milestones — **no spend-based status displayed** | M | |
| 6.2 | TRP Membership tiers earned through participation, with real benefits (access, education, events, products) | L | |
| 6.3 | Story submission + moderation + publishing surface | M | API exists; no UI |
| 6.4 | Community feed / accountability groups — members holding each other accountable (Vol 5) | L | |
| 6.5 | Events system: creation, RSVP, check-in, post-event content | L | |
| 6.6 | **Run Club**: activity logging (Strava/Apple Health/Google Fit integration), club challenges, streaks | L | Vol 5 + Vol 11 pillar with zero code |
| 6.7 | Ambassador programme: application, selection, tooling, tracking | M | |
| 6.8 | Education & mentorship: workshop catalogue, booking, mentor matching, content library | XL | Named as core in Vol 11 |
| 6.9 | Recognition system celebrating meaningful milestones (explicitly not superficial status) | M | |
| 6.10 | Local chapters / global community structure | L | |
| 6.11 | Safeguarding & moderation policy — mandatory for community features, doubly so with the schools/youth ambition in Vol 5 | M | Includes reporting, blocking, escalation, age verification |

**Acceptance:** The community is a place people return to when there is no drop. Status is visibly earned, never bought.

---

### PHASE 7 — TRP WRLD: THE OPEN WORLD
*The Vol 13 endgame. Only start once Phases 0–5 are stable and generating revenue.*

| # | Task | Effort | Notes |
|---|---|---|---|
| 7.1 | Full game design document for TRP WRLD, grounded in the narrative charter | L | |
| 7.2 | World architecture: streaming, districts, LODs, save system | XL | |
| 7.3 | Traversal: walking, sprinting, vehicles (if any), fast travel | XL | Free-roam prototype is the seed |
| 7.4 | Interiors: shops, bank, chapter buildings, barbershop, run club HQ, retail flagship | XL | |
| 7.5 | NPCs, dialogue, and mission systems — **all non-violent** | XL | The differentiator; design it as a strength |
| 7.6 | Multiplayer / shared world (decide early — retrofitting is prohibitive) | XL | Big cost and ops driver. Consider "social hub only" |
| 7.7 | Real-world tie-ins: in-game garment = owned physical garment, wearable in-world | L | The core magic. Prioritise within this phase |
| 7.8 | Console/PC platform work, certification, store presence | XL | |
| 7.9 | Anti-cheat, economy protection, live-ops tooling | L | |
| 7.10 | Live content cadence: seasons as chapters | L | |

**Acceptance:** A player can walk a real city block, enter a chapter building, complete a mission, buy a garment, and see it on their character — no loading screen back to a menu.

---

### PHASE 8 — PHYSICAL WORLD (VOL 12) & GLOBAL (VOL 13)
*Mostly not software, but each needs software support.*

| # | Task | Effort | Notes |
|---|---|---|---|
| 8.1 | Retail POS integration + unified inventory across online/in-store | L | |
| 8.2 | In-store digital experiences (the game present in the store) | L | Vol 12, Ch 1–2 |
| 8.3 | Clienteling tools for store staff | M | Vol 12, Ch 4 hospitality standards |
| 8.4 | **Packaging system** (Vol 5 + Vol 9, Ch 8): evidence bags, newspapers, archive folders — per chapter. Needs a design pipeline and per-chapter packaging records in the CMS | L | A named pillar with no code |
| 8.5 | Packaging → digital bridge: QR/NFC in the box unlocks in-game content | M | Closes the physical/digital loop. High impact, moderate cost |
| 8.6 | Multi-currency, multi-language, regional tax/shipping | L | Vol 13 |
| 8.7 | Region-specific content and local community tooling | L | |
| 8.8 | Trademark, IP protection, and brand-standards enforcement per market | M | Do the naming decision (§1.5) first |

---

## Section C — Cross-cutting work (runs through every phase)

| Area | Work |
|---|---|
| **Testing** | Unit tests (business logic, economy, anti-abuse), integration tests (API), E2E (Playwright), Unity play-mode tests, load testing before any drop. **Currently: none** |
| **Performance** | Frame-rate budgets per device tier, bundle budgets in CI, API latency SLOs, DB indexing |
| **Observability** | Sentry, structured logs, uptime monitoring, business dashboards, alerting |
| **Documentation** | Keep `docs/` truthful — **rewrite `COMPLETION-STATUS.md`, which currently overstates readiness**. Onboarding guide, ADRs, runbooks |
| **Bible compliance** | Add the three Decision Framework questions to the PR template and the CMS publish gate. Quarterly review of the product against Vols 6, 9, and 11 |
| **Legal/compliance** | GDPR, consumer law, age rating (PEGI/ESRB/IARC), accessibility, payments/e-money, safeguarding |

---

## Section D — Recommended sequence

```
NOW      ── Phase 0 (security + infra)          ── blocking, ~2–4 weeks
         └─ §1.5 naming decision + Tension 1–3 decisions ── ~1 week, parallel

THEN     ── Phase 1 (architecture)              ── ~4–6 weeks
            │
            ├─ Phase 2 (real commerce)          ── ~8–12 weeks  ┐
            ├─ Phase 3 (assets + brand)         ── ~12+ weeks   ├─ parallel
            └─ Phase 5 (admin/ops)              ── ~6–8 weeks   ┘

LAUNCH   ── First real chapter drop with real product, real payment,
            real fulfilment.  ← the milestone that changes everything

AFTER    ── Phase 4 (Trapologist Journey)       ── makes it Trapology
         ── Phase 6 (community)                 ── makes it a movement
         ── Phase 7 (TRP WRLD)                  ── makes it the vision
         ── Phase 8 (retail + global)           ── makes it a house
```

**The critical insight:** you can launch and sell garments after Phases 0, 1, 2, 3, 5 — **without** the open world, the community platform, or the full journey system. Ship that. Fund the rest with it. Phase 7 is a multi-year, multi-person, capital-intensive undertaking and should be financed by a working business, not attempted before one.

## Section E — Resourcing reality

The plan above is not a one-person job. Minimum realistic team to reach launch:

- **1 full-stack engineer** (backend, commerce, admin) — the critical path
- **1 game/graphics engineer** (Three.js and/or Unity)
- **1 3D artist** (environments + garments) — currently the hardest gap; Phase 3 is the longest pole
- **Fractional:** DevOps/security, designer (brand system), payments/legal advisor

For TRP WRLD (Phase 7), multiply by five and add a producer.

## Section F — Decisions needed from you before work starts

1. ~~Canonical brand name~~ — **resolved** (§1.5): Trapology = philosophy, Trap Made It = game/shop, TRP 23 = short form. Founder name and legal owner still open.
2. Client architecture — A, B, or C (Phase 1). *Recommendation: C.*
3. Two-currency model — yes or no (Tension 2). *Recommendation: yes.*
4. Real-money coin top-up — proceed, and how, given Apple IAP (Tension 3). *Needs advice before building.*
5. Commerce backbone — build on Stripe direct, or Shopify headless (2.7)? *Shopify headless would collapse much of Phase 2's effort; the trade is control and fees.*
6. Narrative charter — sign off on how the trap-house imagery reads as escape (Tension 1, 3.9).
7. Launch scope — which chapters, how many SKUs, which market.
8. Multiplayer in TRP WRLD — decide early, it changes the architecture (7.6).

---

## Appendix — Bible → Code traceability

| Bible requirement | Source | Code today | Gap |
|---|---|---|---|
| Untrap people mentally | Vol 1/4/7/14 | `moralFocus` fields | No journey system → **Phase 4** |
| Decision Framework | Vol 6/8/14 | None | Encode in CMS + PR template → **5.4** |
| 7-stage journey | Vol 3 | None | **Phase 4** |
| Collections are chapters, no random drops | Vol 6/9 | Chapter/drop model exists | Not enforced → **5.4** |
| Every garment answers 3 questions | Vol 9 Ch 3 | None | Required fields → **5.4** |
| Colour doctrine | Vol 6/9 | Ad-hoc gold `0xc9a06a` | Design tokens → **3.1** |
| Packaging as storytelling | Vol 5/9/12 | None | **8.4 / 8.5** |
| TRP earned not bought | Vol 5/11 | Single buyable currency | Two-currency → **2.1 / 4.6** |
| Trapologist title earned | Vol 3/11 | None | **4.6** |
| Community accountability | Vol 5/11 | API stubs only | **Phase 6** |
| Run Club | Vol 5/11 | None | **6.6** |
| Barbering philosophy | Vol 5 | None | Phase 7 interior / brand content |
| Education & mentorship | Vol 11 | None | **6.8** |
| Ambassadors | Vol 11 | None | **6.7** |
| Storytelling-led marketing | Vol 10 | Campaign message field | **Phase 3 / 5.4** |
| Success ≠ sales | Vol 10 | Basic analytics | **5.8** |
| Luxury retail | Vol 12 | None | **Phase 8** |
| Global expansion | Vol 13 | None | **Phase 8** |
| **TRP WRLD, GTA-scale** | **Vol 13 Ch 6** | Free-roam prototype | **Phase 7 — the north star** |

---

*The trap was never your environment. The trap was believing you couldn't change.* — Vol 7

The same applies to this codebase. It is further along than most, and the gap between it and the Bible is entirely closeable — in sequence, with the security work first and the honest scope second.
