# Decision Register

Every decision that shapes the product: what was decided, by whom, when, and why. Reversing one is fine — **reversing one without knowing it was ever made is not**, which is what this file prevents.

**Updated:** 3 August 2026

**Status:** ✅ decided · 🔨 open · 🚧 needs outside advice

---

## Open — blocking work

| # | Decision | Recommendation | Blocks | Who |
|---|---|---|---|---|
| **D-01** | **How does Kimani take bookings today?** Paper book, phone, Instagram DMs? | — need the fact | WP-017 | Kimani |
| **D-02** | Deposit amount and cancellation window | £5, 24 hours. Must be a genuine estimate of his loss, not a penalty | WP-017 | Kimani |
| **D-03** | Under-18 bookings at launch | **Disable.** A minor travelling to meet an adult, arranged by software, needs a guardian-consent path we have not built | WP-017 | Kimani |
| **D-04** | Stripe direct or Shopify headless for garments | **Shopify headless.** Collapses tax, shipping, returns, inventory and fulfilment into a weekend | H2 | Both |
| **D-05** | Real trading names (NatWest, JD) in-world | **Fictionalise the names, keep the buildings.** City stays recognisable, trademark risk disappears | WP-015 | Kimani |
| **D-06** | Body archetype count | **6.** Every extra archetype multiplies every future garment's fitting cost | WP-012 | Both |
| **D-07** | Two-currency model | **Yes.** Trap Coins (spendable) and TRP (earned only, gates rank). They never convert | WP-005 | Kimani |
| **D-08** | Accountant engaged for VAT | Before the first pound of rent or sales | H2 | Richard |

---

## Decided

| # | Decision | Outcome | Date | By |
|---|---|---|---|---|
| D-100 | Brand naming | Trapology = philosophy · Trap Made It = game and shop · TRP 23 = internal short form | 27 Jul | Kimani |
| D-101 | Founder identity | Kimani owns the project; Richard is lead developer | 3 Aug | Kimani |
| D-102 | **Client architecture** | **Unity is the product. The web build freezes as the instant-play shop window** — bug fixes and content data only, no new systems | 3 Aug | Richard (delegated to AI, confirmed) |
| D-103 | Platform targets | PC, iOS, Android at minimum. Consoles eventually — constraints applied from now | 3 Aug | Kimani |
| D-104 | Booking payment | A **real card deposit paid to Kimani's business**, never converted to coins. Revised from "no payment at all", which does not survive a real no-show | 3 Aug | Kimani |
| D-105 | Trust and deposits | **High Trust books without a deposit; low Trust pays one.** Trust becomes a credit rating earned by keeping your word | 3 Aug | AI, accepted |
| D-106 | Tenancy model | **Earned eligibility, paid rent.** Standing decides if you are considered; rent (£10–50/mo by size and location) keeps the keys | 3 Aug | Kimani + AI |
| D-107 | Currency separation | **Game coins and real money never convert, in either direction.** The single rule that keeps this legally ordinary | 3 Aug | AI, accepted |
| D-108 | `own1` deleted | A mission cleared by *buying* contradicts Vol 11. Content v3 | 3 Aug | Kimani |
| D-109 | `own2`/`own3` retained for now | Same contradiction, but deleting them bare leaves chapters 03 and 05 with one mission each. **Replaced, not deleted** | 3 Aug | AI |
| D-110 | Google Street View rejected | Terms prohibit derivative 3D assets. Own photography + OSM + LIDAR instead — legal, owned, and better | 3 Aug | AI, accepted |
| D-111 | Character creation | **Fixed archetypes, not continuous sliders.** The product is clothing; sliders make every drop an unbounded fitting problem | 3 Aug | AI, accepted |
| D-112 | Old database in git history | **Leave it.** Founder confirmed team-only accounts — no breach, no notification duty. A history rewrite invalidates every clone for no real gain | 3 Aug | Kimani |
| D-113 | Trap card is private | Shown only to its author. Never leaderboard, never community, never staff. Public would make it dishonest and would need moderation | 3 Aug | AI |
| D-114 | Shared logic parity | Where logic must exist in both JS and C#, both are held to one shared table. Found a real bug within minutes | 3 Aug | AI |
| D-115 | Console constraint on rent | Tenancy billing stays **web-only, outside the game client** — in-client digital subscriptions are what certification scrutinises | 3 Aug | AI |
| D-116 | **Own the character controller** | Build a small controller against the already-tracked `InputSystem_Actions` rather than dragging 86 MB of Starter Assets. Solves reproducible builds, gamepad/touch adoption and future platform work in one move | 4 Aug | Kimani |
| D-117 | **World time** | **Server-authoritative.** Shared truth — missions and events depend on it | 4 Aug | Kimani |
| D-118 | **Weather** | **Server-directed, client-rendered.** Server owns a compact state — kind (Clear/Overcast/Rain/HeavyRain/Fog), intensity, transition start, wind, seed. Unity owns particles, wet surfaces, fog, puddles, audio. *Revised from the AI recommendation of client-owned weather:* otherwise two players stand side by side in different weather and anything tied to it becomes unreliable | 4 Aug | Kimani |
| D-119 | **Character appearance** | **Server-authoritative**, client may cache. Cosmetics, clothing and ownership will matter | 4 Aug | Kimani |
| D-120 | **Typed progression** | Yes, **but migrate incrementally.** Extract stable authoritative concepts as they are defined; do not explode every conceivable future field into columns now. Preserve a migration path from the blob | 4 Aug | Kimani |
| D-121 | **Addressables** | **Not now.** Establish boundaries; adopt when the first real consumer appears. Do not add infrastructure for a someday | 4 Aug | Kimani |
| D-122 | **Vertical slice area** | **The High Street**, Stonebow to the foot of Steep Hill. Real geography, Kimani's shop, commerce, pedestrians, interiors and the phygital layer in one small zone | 4 Aug | Kimani |

---

## Needs outside advice

| # | Question | Who | Before |
|---|---|---|---|
| **A-01** | Is a forfeited deposit enforceable, and at what level? | Solicitor | Live payments |
| **A-02** | Do distance-selling cancellation rights apply to a dated appointment? | Solicitor | Live bookings |
| **A-03** | VAT on: subscriptions, garments, deposits | Accountant | First pound |
| **A-04** | Apple/Google IAP position on coins | Payments-aware advisor | Any in-app top-up |
| **A-05** | Marketplace liability for player-sold goods | Solicitor | Tenancy Tier 3+ |
| **A-06** | Terms of service, incl. under-18s | Solicitor | Public beta |
| **A-07** | Age rating strategy (PEGI/IARC), drug references | Ratings consultant | Store submission |

**Do not let the AI answer these.** It can describe the shape of the question — it must not manufacture the answer.
