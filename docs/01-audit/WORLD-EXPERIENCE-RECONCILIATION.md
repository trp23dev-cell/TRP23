# World Experience Reconciliation

**A read-only audit of what TRP23 has already promised itself.**

**Date:** 9 August 2026 · **Status:** 🟡 **review document — NOT a source of truth.** Nothing implemented, nothing modified.
**Scope:** the Bible, every design and audit document, the web client, the backend, and the Unity project.

> This exists to tell the owner what already exists before the High Street slice is designed. It **does not** rewrite the Bible, resolve contradictions silently, or propose new features as established requirements. Where I could not find evidence, it says so.

---

## Part 1 · Sources

**A** current source of truth · **B** historical but useful · **C** implementation evidence · **D** superseded · **E** ambiguous, needs owner

### Doctrine

| Source | Class | Bears on |
|---|---|---|
| `docs/00-vision/bible/…Volume_3_The_Trapologist_Journey.pdf` | **A** | **The seven stages. The most load-bearing volume for gameplay** |
| `…Volume_9_Product_Design_Bible.pdf` | **A** | *"Collections are chapters, not random drops."* Three questions per garment |
| `…Volume_11_Community_and_Membership_System.pdf` | **A** | *"Membership begins with mindset, not purchases."* TRP Membership rewards access **and products** |
| `…Volume_5_Ecosystem.docx` | **A** | Ten pillars. Clothing as "first interaction with the philosophy". Packaging as narrative |
| `…Volume_10_Storytelling_and_Marketing_Bible.docx` | **A** | Story told *"through the online game and the way of purchasing clothes"* |
| `…Volume_13_Global_Expansion_Strategy.docx` | **A** | TRP WRLD; clothing as "starting point", game as "ultimate goal" |
| `…Volume_2, 6, 7, 8, 12, 14` | **B** | Philosophy, brand standards, leadership, retail, playbook |
| `docs/00-vision/TRP23_Master_Vision_and_Development_Plan.pdf` | **A** | The 28-section directive |
| `docs/00-vision/Team_Brief_The_Real_Build.md` | **A** | Chapter copy and narrative wording |

### Design and audit

| Source | Class | Note |
|---|---|---|
| `docs/02-design/MISSION-DESIGN-BIBLE.md` | **A** | Commitment mechanic, seven verbs, five dimensions |
| `docs/02-design/MERCHANT-AND-PLAYER-BUSINESS-SYSTEM.md` | **A** | The Premises model, five tenancy tiers |
| `docs/02-design/CHARACTER-AND-WARDROBE.md` | **A** | Archetypes not sliders |
| `docs/03-technical/TRAP-COIN-ECONOMY-DESIGN.md` | **A** | Currency separation |
| `docs/03-technical/PHYGITAL-COMMERCE-ARCHITECTURE.md` | **A** | Real-goods flow |
| `docs/01-audit/MASTER-REPOSITORY-AUDIT.md`, `UNITY-MIGRATION-AUDIT.md` | **A** | State of the code |
| `docs/04-plan/DECISION-REGISTER.md` | **A** | 23 decisions, D-100…D-122 |
| `Bible_Planning_Devwork.MD` (superseded Part 1) | **B** | Tensions 1–4 still live |
| `docs/_superseded/COMPLETION-STATUS.md` | **D** | 21/21 "COMPLETE" against a system with no payments |

### Implementation evidence

| Source | Class | What it proves |
|---|---|---|
| `src/data/defaultContent.js` | **C** | 6 chapters, 6 drops, 1:1 mapping, `priceCoins`, `unlockWindow` |
| `src/world/lincolnAnchors.json` | **C** | **The four real-world anchors. Far more advanced than expected** |
| `src/data/defaultWorld.js` | **D** | Fictional shops with stale names, no drops attached |
| `server/mockApiServer.js`, `server/storage/sqliteStore.js` | **C** | Ownership, orders, entitlements, checkout gating |
| `src/game.js`, `index.html` | **C** | 10 panels; the whole current player experience |
| `src/admin.js` | **C** | CMS edits chapters and drops only |
| `Unity/TRP23/Assets/…` | **C** | World + HUD + case file; no game layer |

---

## Part 2 · The intended loop, reconstructed

**Documented intention** and **existing implementation** separated throughout, because they diverge badly.

| # | Intended (Bible + docs) | Implemented |
|---|---|---|
| 1 | **Starts with** a trap to name and nothing earned | 1,600 seeded coins, 6 chapters, chapter 1 unlocked |
| 2 | **Trying to achieve** becoming a Trapologist — Vol 3 Stage 7, *"cannot be bought… must be earned"* | Clear 6 chapters. `trustStatus` exists in schema and **is never written by anything** |
| 3 | **Chapters** = collections. Vol 9: *"Collections are chapters, not random drops"* | 6 chapters, unlock in order, each maps to exactly one drop |
| 4 | **Missions** express doctrine through play (Mission Bible: seven verbs) | `walk`, `board`, `stash`, `inspect`, `own2`, `own3`, `viewall`, `label`. `type`/`requirement`/`limit` are **decorative** |
| 5 | **Progression** across discipline, trust, craft, consistency | `levelsCleared` and coins. Nothing else |
| 6 | **Standing** gates premises and credit | ❌ **does not exist in any form** |
| 7 | **Money** — coins earned, never bought; real money separate (D-107) | Coins seeded and earned; top-up route now off; **no real money anywhere** |
| 8 | **Trap Coins** buy drops | `priceCoins`, atomic ledger, checkout debits coins |
| 9 | **Clothing** = *"the first interaction with the philosophy"*, and Stage 7's *"clothing simply represents that commitment"* | 6 drops with `media: "placeholder-front"`. **No garment looks like a garment** |
| 10 | **Drops** are chapters with a message, story, launch (Vol 9 Ch 2) | Static content array. **No lifecycle, no schedule, no tease, no retirement** |
| 11 | **Real products** delivered physically | ❌ nothing. No address collected anywhere |
| 12 | **Returning to the block** — the world remembers | The block brightens as chapters clear (`MOODS`). Genuinely implemented and good |
| 13 | **Kimani** — founder, barber, brand presence | An anchored door marked **`"Closed for now."`** No NPC, no dialogue |
| 14 | **Lincoln** is the world | 4 km² real city, OSM + LIDAR, streamed to both clients. **The strongest thing here** |

**The gap in one line:** the world is built and the doctrine is written; the *loop between them* is not. Chapters exist, drops exist, and nothing connects a mission to a drop except a discount code.

---

## Part 3 · The web experience

| System | Where | Verdict | Why |
|---|---|---|---|
| Landing / brand | `index.html` | **KEEP AS WEB** | Instant, no install, the shop window |
| Auth, register, 2FA | web + `/api/players/*` | **SHARED BACKEND** · UI keep web | Typing an email is better on a keyboard |
| Account recovery | server | **SHARED BACKEND** | No client should own it |
| Shop / product viewer | `shopPanel`, `storePanel` | **MOVE TO UNITY** (world) · keep a web storefront | Two different jobs: browsing to buy vs trying on in a shop |
| Drops / catalogue | `/api/content`, `/commerce/products` | **SHARED BACKEND** | One catalogue, two presentations |
| Missions / chapters | `src/game.js` | **MOVE TO UNITY** | The frozen client keeps its six rooms; new missions are Unity's |
| Inventory / ownership | `ownership` table | **SHARED BACKEND** | Server-authoritative already |
| Wallet | `bankPanel` + `/wallet` | **SHARED BACKEND** · display both | Balance is information |
| **Banking actions** | `bankPanel` | **MOVE TO PHYSICAL WORLD** | Owner decision. See Part 9 |
| Rewards | `/rewards/claim` | **SHARED BACKEND** | Amounts server-side since 3 Aug |
| Case file | `boardPanel` + Unity | **MOVE TO UNITY** | Already built in both; Unity is the real one |
| Premises / locations | `defaultWorld.js` | **LEGACY PROTOTYPE → REMOVE** | Stale names, superseded by anchors |
| Map | `mapPanel` | **MOVE TO UNITY** | WP-U13 |
| Checkout | `/commerce/checkout` | **SHARED BACKEND** · **real payment on web** | Console rules (D-115) |
| Fulfilment | JSON blob | **SHARED BACKEND**, unbuilt | Writes a fake tracking number |
| Admin / CMS | `admin.html` | **KEEP AS WEB, permanently** | Nobody edits a catalogue in a game engine |

---

## Part 4 · Drops — deep dive

### What exists

A **static array of six** in `defaultContent.js`, each with `id, sku, name, color, priceCoins, demand, active, rarity, campaignMessage, media, unlockWindow`. Admin can edit chapter and drop text. `PUT /api/content` seeds inventory rows for new drops.

### What does not exist — verified in `createOrder`

**Checkout gates on exactly two things: stock, and coin balance.** Nothing else.

| Field | Reality |
|---|---|
| `unlockWindow.startAt/endAt` | **Present on every drop, `null` everywhere, read by nothing.** Pure decoration |
| `rarity`, `demand` | Decorative |
| `active` | Decorative at checkout |
| `campaignMessage` | Displayed only |
| Mission gating | ❌ none |
| Chapter gating | ❌ none — **any drop is buyable from chapter 1** |
| Digital vs physical | ❌ no distinction exists |
| Scheduling, tease, retirement | ❌ none |
| Previous drops / archive | ❌ none |
| `badges`, `earlyAccessFlags` | In the profile shape, **written by nothing** |

**So the honest position: there is a product catalogue, not a drop system.** A "drop" today is a purchasable item with a chapter loosely attached by `dropId`, and the only thing a chapter actually grants is a **discount code** (`stash.code`, e.g. `TRAP-COMEUP10`).

### A target lifecycle, grounded in what exists

Not implemented. Every stage maps to something already present or to a named gap.

| Stage | Uses | Gap |
|---|---|---|
| **CREATE** | admin CMS, `drops[]` | Needs `dropId` → *collection*, not 1:1 with a chapter |
| **TEASE** | `unlockWindow.startAt` | Field exists; **nothing reads it** |
| **MISSIONS AVAILABLE** | chapter + missions | No link from mission → drop entitlement |
| **DROP LIVE** | `active`, `unlockWindow` | Not enforced |
| **PLAYER QUALIFIES** | `reward_claims`, Standing | **Standing does not exist** |
| **OBTAINS / PURCHASES** | `createOrder`, ledger | Works. Coins only |
| **DIGITAL ENTITLEMENT** | `ownership` | Exists but does not distinguish digital from physical |
| **PHYSICAL FULFILMENT** | `/commerce/fulfillments` | Writes a row and a fake tracking number |
| **RETIRES** | `unlockWindow.endAt` | Not enforced. No archive |

**The smallest honest first step** is to make `unlockWindow` and `active` actually gate `createOrder`. That is a server change, it needs no new schema, and it converts three decorative fields into a real drop window.

---

## Part 5 · Mission ↔ drop

### What actually connects them today

**One thing: a discount code.** Clearing the `stash` mission grants `chapter.stash.code`, appended to `entitlements.codes`. Coins are the other reward. `chapter.dropId` associates a chapter with a drop **for display only** — it grants nothing.

Two of the surviving missions (`own2`, `own3`) are still cleared *by purchasing*, which contradicts Vol 11 and is why `own1` was deleted at content v3 (D-108/109).

### The risk, named

> **"Do three chores to unlock a hoodie" is the failure mode, and the current design is one step away from it** — because the only mission that touches product is one that asks you to buy something.

### Principles (recommendations, not designs)

1. **The mission is about the person; the garment is the receipt.** Vol 3 Stage 7 — *"The clothing simply represents that commitment."* The garment marks that something happened; it is not the thing you were doing.
2. **Gate access, not existence.** Vol 11 rewards *"exclusive access"*. Earning the right to buy is on-doctrine; being handed goods for chores is not.
3. **No mission may be cleared by purchasing.** Retire `own2`/`own3` when their chapters are rebuilt.
4. **A drop is a chapter of the story** (Vol 9 Ch 2) — so drop missions are *the* chapter's missions, not a side quest with a shopping list.
5. **The drop should change the world, not just the shop.** A live drop is visible in the flagship window, on the street, in what NPCs mention. That is advertising doing narrative work, rather than narrative doing advertising work.

---

## Part 6 · Phygital entitlement

### Where the concepts are currently conflated

| Concept | Represented as | Conflation |
|---|---|---|
| Digital cosmetic | `ownership` row | **Same row as a physical purchase** |
| Physical product | `ownership` row + order | Indistinguishable from digital |
| Real-money purchase | ❌ | Does not exist |
| Trap Coin purchase | `createOrder` | The only purchase path |
| Gameplay reward | coins + discount code | Cannot grant an item |
| Mission unlock | ❌ | No concept |
| Stock | `inventory.stock` | Applied to coin purchases of items with no physical existence |
| Fulfilment | JSON blob | Not linked to ownership |

**The sharpest conflation: buying a drop with coins decrements physical stock.** A make-believe currency depletes real inventory — harmless today because no inventory is real, and a genuine problem the day one is.

### A model that separates them (proposal only, no schema written)

Three independent axes rather than one `ownership` row:

1. **What the thing is** — `digital-only` · `physical-only` · `digital+physical` (one SKU, two deliverables)
2. **How it was obtained** — `mission-reward` · `purchased-coins` · `purchased-money` · `granted`
3. **What is owed** — digital entitlement (instant) · physical fulfilment (an order with an address)

Plus **eligibility**, which is *not* ownership: `mission-unlocked` and `limited-drop` describe the **right to acquire**, evaluated server-side at checkout.

**Invariants worth keeping whatever the shape:**

- Unity never decides eligibility, price or ownership (already true; `check:api` enforces it)
- Coins and real money never convert (D-107)
- Physical stock is only reserved by something that can actually ship
- A digital entitlement is not evidence of a physical one, or vice versa

---

## Part 7 · Locations

### 🎉 The owner's two "new" decisions are already in the repository

`src/world/lincolnAnchors.json` pins story locations to real Lincoln buildings **by OSM element id, never by name** — because OSM has Kimani's shop tagged under a previous occupant (*"Mankind"*), and an upstream rename must not break mission one. That is a level of care worth knowing about.

| Anchor | In-game name | OSM | Real address | State |
|---|---|---|---|---|
| `0` (chapter) | **`JD`** ⚠️ | `way/241764018` | 311–312 High Street | Chapter 1 entrance |
| `bank` | **`TRAP CENTRAL BANK`** ✅ | `way/399631226` | Mint Street *(the NatWest)* | Bank, walk-in |
| `barber` | **`KIMANI THE BARBER`** | `way/723251372` | 25 Corporation Street | **`"Closed for now."`** placeholder |
| `prison` | `LINCOLN PRISON` | `way/259448186` | Greetwell Road | Placeholder, *"Nobody walks in here by choice."* |

**TRP Central Bank at the NatWest is already built and already correctly named** — the fictional business at the real anchor, exactly as the owner has now specified. This is confirmation, not a new requirement.

**The JD anchor is the exception and it contradicts the owner's own rule.** The building is right; the in-game name is the real retailer's trading name. Per the owner: *"the in-game business is NOT JD Sports."* See Contradiction 1.

### Two location systems that do not know about each other

| | `lincolnAnchors.json` | `defaultWorld.js` |
|---|---|---|
| Real anchors | ✅ 4, by OSM id | ❌ `x: 0, 40, 80` |
| Names | Real/fictional Lincoln | Stale chapter names |
| Drops attached | — | `dropIds: []` on every one |
| Used by | Map tiler, world | `/api/world/locations`, checkout `locationId` validation |
| Verdict | **Keep** | **Superseded** |

### Newly confirmed owner decisions (9 August)

- **TRP Flagship** → JD Sports building, High Street. *Anchor exists; must be renamed and given a purpose.*
- **TRP Central Bank** → NatWest building, Mint Street. *Already implemented as specified.*

---

## Part 8 · NPCs

**There are none.** Not one NPC exists in any client — no dialogue, no schedules, no navmesh agents (the package is installed and unused).

| Character | Evidence | Role | State |
|---|---|---|---|
| **Kimani** | Anchor, `README` copyright, D-101 (owns the project) | Founder · barber · brand | **A door that says "Closed for now."** No NPC, no dialogue, no likeness |
| Bank teller | Mission Bible §8 — the bank as "the game's mirror" | Banking, Standing | Designed, not built |
| The archive author | Chapter text: *"Somebody sat in this room and wrote down what was holding them"* | Implied predecessor | **Strong unused narrative device** |

### Minimum archetypes for the High Street slice

| Archetype | Named? | Why |
|---|---|---|
| **Kimani** | Yes | Real person, real shop, the booking. **Needs his consent on likeness and voice** |
| **Bank teller** | No — a role | Banking, Standing, the "third time this week" mirror |
| **Flagship staff** | No — a role | Product, drops, try-on |
| **Ambient pedestrians** | No | The 30-second loop. Lincoln is currently dead |

**Four is enough.** Recommend inventing no further named characters until a mission needs one.

---

## Part 9 · World-first interaction audit

Against the owner's principle: *prefer places, people and physical interactions over global menu buttons.*

| System | Today | Recommend | Reasoning |
|---|---|---|---|
| **Banking** | `bankPanel`, global button | **MOVE TO PHYSICAL WORLD** | Owner decision. Anchor exists |
| Balance display | Global | **PHONE / INFORMATION ONLY** | Knowing what you have is information; moving it is an act |
| **Shopping** | `shopPanel`, global | **MOVE TO PHYSICAL WORLD** | The flagship is the point of a flagship |
| Browsing the catalogue | Global | **HYBRID** | Browse on the phone/web, buy and try on in the shop |
| **Wardrobe** | `closet` in shop panel | **MOVE TO PHYSICAL WORLD** — home or shop | Owner's example. Needs a home location (**does not exist**) |
| **Case file** | Panel + `C` | **KEEP GLOBAL** | It is your own head. There is nowhere to walk to |
| Mission list | In case file | **PHONE / INFORMATION ONLY** | Reading objectives is information; doing them is the world |
| Map | Panel + `M` | **PHONE / INFORMATION ONLY** | WP-U13 |
| **Rewards claim** | Automatic | **KEEP GLOBAL** (server) | Invisible plumbing, not an interaction |
| Account, 2FA, recovery | Panel | **KEEP GLOBAL** — and prefer web | Nobody wants to type an email in a game |
| **Real-money checkout** | ❌ | **WEB ONLY** | D-115, console rules |
| Barber booking | ❌ | **PHYSICAL WORLD** | The flagship demo |

**One caution.** *Everything* in the world is a cost: every menu that becomes a building needs an interior, an NPC, a walk there, and a walk back. **Account settings and the case file should stay global** — walking to a building to change your password is a worse game, not a more immersive one.

---

## Part 10 · What the slice must demonstrate

*As a product, not a package list.*

**The one sentence it must prove:** *"A real clothing brand, a real city, and a real barber's chair are the same world, and what you do here matters somewhere else."*

| Must demonstrate | Because |
|---|---|
| **Lincoln is real and walkable** | Already true — it is the strongest asset |
| **A named premises you enter, with a person inside** | Proves the Premises model end to end |
| **Banking as a place** | Proves world-first over menu-first |
| **The flagship with a live drop in the window** | Proves drops are narrative, not a catalogue |
| **One coherent mission chain that is not chores** | The whole product risk |
| **A garment you earn access to, then obtain** | Proves eligibility ≠ ownership ≠ fulfilment |
| **The case file, remembering** | Already built. The emotional spine |
| **A real barber booking (test mode)** | **Nobody else on earth can demo this** |
| **The world responding to what you did** | `MOODS` proves the pattern |

**Deliberately not proving:** the whole city · vehicles · multiplayer · player-rented shops · real payments · NPC schedules · character creation depth.

**One honest warning.** The slice needs **one drop, and Trap Made It only.** Do not populate the High Street with fictional competing brands for variety — the owner is explicit, and an empty shopfront reads as a city with shops in it, whereas an invented brand reads as filler.

---

## Part 11 · Contradictions

### 1 · The flagship is currently called "JD"

**Evidence** `lincolnAnchors.json` anchor `0`, `"name": "JD"`, rendered as door signage. Owner: *"the in-game business is NOT JD Sports."* Master audit §3.3 flags trading names as trademark risk.
**Options** (a) rename to a TRP Made It flagship · (b) keep the real name · (c) fictionalise all real names.
**Recommendation** **(a) now, (c) as policy.** The building stays; the sign changes. This is also the cheapest trademark fix available.
**Owner decision required?** **NO** — the owner has already decided in principle; this is applying it.

### 2 · Chapters are fictional rooms, but chapter 1 is anchored to a real shop

**Evidence** Anchor `0` is a `"chapter"` at the JD building. `defaultContent` chapter 1 is "THE COME UP", an abandoned squat. The flagship is meant to be a hero retail location.
**Options** (a) flagship is separate from chapters · (b) chapter 1 becomes the flagship · (c) chapters move off real retail anchors.
**Recommendation** **(a)**. A squat and a flagship store are different places; putting the first chapter inside the shop makes the shop the tutorial.
**Owner decision required?** **YES.**

### 3 · Vol 3 Stage 7 vs a buyable wardrobe

**Evidence** *"The title cannot be bought. It cannot be given. It must be earned."* Vol 11: *"Membership begins with mindset, not purchases."* But every drop is purchasable from chapter 1 with seeded coins, and `own2`/`own3` are cleared **by buying**.
**Options** (a) all drops mission-gated · (b) some gated, some open · (c) leave open.
**Recommendation** **(b)**, and retire `own2`/`own3`. Gating everything makes a shop you cannot shop in.
**Owner decision required?** **YES** — this is the commercial/doctrine trade-off.

### 4 · Two location systems

**Evidence** `lincolnAnchors.json` (real, OSM-pinned) vs `defaultWorld.js` (fictional, `x: 0/40/80`, stale names, still validates checkout `locationId`).
**Recommendation** Anchors become the source of truth; `defaultWorld` retires with the Premises system. Not urgent, but it is load-bearing for checkout and will surprise someone.
**Owner decision required?** **NO.**

### 5 · Kimani is both founder and a closed door

**Evidence** D-101 (owns the project), the barber booking is the flagship mission — and the anchor says `"Closed for now."`, kind `placeholder`.
**Recommendation** Open it in the slice. Also: **his likeness, name and voice need his explicit consent**, which is a different question from owning the project.
**Owner decision required?** **YES** — likeness and how he is portrayed.

### 6 · A drop is a chapter, but also six simultaneous products

**Evidence** Vol 9: *"Collections are chapters, not random drops."* Implementation: 6 chapters × exactly 1 drop, all `active: true`, all buyable at once. Owner now wants **recurring monthly drops**.
**Options** (a) collection = chapter with several garments, released on a cadence · (b) keep 1:1 · (c) decouple entirely.
**Recommendation** **(a)** — closest to Vol 9 and to the owner's cadence. It means `dropId` becomes `collectionId`, which is a content-model change, not a rewrite.
**Owner decision required?** **YES.**

### 7 · Coin purchases decrement physical stock

**Evidence** `createOrder` reserves `inventory.stock` for a `priceCoins` purchase.
**Recommendation** Separate digital entitlement from physical fulfilment before any real stock exists (Part 6).
**Owner decision required?** **NO** — technical, but must precede real inventory.

### 8 · Six discount codes nothing can redeem

**Evidence** `TRAP-COMEUP10` … `TRAP-MADEIT40` granted into `entitlements.codes`. `/api/commerce/discounts` exists, but the seeded chapter codes are **never created as discount rows** — so the code a player earns matches nothing.
**Recommendation** Either create them as real discounts, or stop granting them. Currently the chapter reward is a string that does nothing.
**Owner decision required?** **NO** — a defect.

### 9 · "Wallet" vs "bank" vs "Trap Coins"

**Evidence** `wallet.coins` (cash) and `bank.coins` (saved) are both Trap Coins; the UI says "TRAP COINS" for the wallet and "TRAP CENTRAL BANK" for the other. `TRAP-COIN-ECONOMY-DESIGN.md` proposes a second earned-only currency (TRP).
**Recommendation** Settle naming before Unity builds banking, or two clients will disagree in front of a player.
**Owner decision required?** **YES.**

### 10 · The phone does not exist

**Evidence** The owner's UI philosophy assumes a phone (balance, messages, contacts, map, missions, drops). No phone exists in any client, any doc, or any package.
**Recommendation** Treat "the phone" as the **information surface** and name it now — the map (WP-U13), mission list and drop announcements all currently have no agreed home.
**Owner decision required?** **YES.**

---

## Part 12 · Questions for the owner

Only what evidence cannot answer.

1. **Is the flagship separate from the six chapters, or is it chapter 1?** *(Contradiction 2 — changes the slice's shape.)* Recommend separate.
2. **A collection is a chapter with several garments on a monthly cadence — or one chapter, one garment?** *(6 — changes the content model.)* Recommend collection.
3. **Which drops are mission-gated, and which are simply buyable?** *(3 — the doctrine/commerce trade-off, and the one only you can make.)*
4. **Has Kimani consented to his name, likeness and voice in the game?** *(5 — owning the project is not the same consent.)*
5. **What is the second currency called, and does it exist?** *(9 — Unity is about to build banking.)*
6. **Is there a phone?** *(10 — decides where the map, missions and drop news live.)*
7. **Does the player have a home?** The wardrobe has nowhere to be, and no home location exists anywhere.
8. **Does the flagship sell physical, digital, or both — and can a coin purchase ever ship a real garment?** *(7 — sharpest phygital question, and it gates real inventory.)*

---

## What I did not do

No implementation. No Unity changes. No backend changes. No Bible edits. No roadmap packages. No contradictions silently resolved. **This is a review document and must not be cited as a source of truth until the owner has been through it.**
