# Real-World Integration Register

**Purpose:** every place where TRP23 currently has a placeholder that must one day become real — what it is, what it needs, what it costs, who has to do it, and what breaks if we get it wrong.
**Date:** 3 August 2026
**Answers:** founder instruction 3 August — *"put placeholders and fake stuff in for now and then tie it all together, and keep a document of all the real stuff we will need to plug in later."*

---

## 0. How to use this

The working method is: **build it fake, but build it in the real shape.** A placeholder that has the same interface as the real thing costs nothing extra now and swaps out in an afternoon. A placeholder with the wrong shape costs a rewrite.

Two rules that follow, and they are the difference between this document being useful and being a graveyard:

1. **Every stub must fail loudly in production.** The wallet top-up route creating money from nothing for two weeks on a live deploy happened because a placeholder failed *silently* and helpfully. Stubs return `501 not_implemented` unless explicitly enabled; they never quietly succeed.
2. **Nothing here gets marked done because the code is written.** It is done when the real credential, the real contract or the real advice is in place.

**Status key:** 🔴 blocking a real launch · 🟠 needed before public beta · 🟡 needed before scale · ⚪ future

---

## 1. Payments

The single biggest area, and the one where getting the *shape* wrong is most expensive. There are **three genuinely different kinds of money** in this project, and they must never be allowed to become one thing.

| # | Money | Example | Regulatory weight |
|---|---|---|---|
| **A** | **Game coins** — closed loop, earned, no cash value | Mission rewards, bank deposits | Low, *provided* they can never be bought or cashed out |
| **B** | **Real payment for a real service** | Booking deposit; shopfront rent | Ordinary card payment. Well-trodden |
| **C** | **Real payment for physical goods** | Buying a garment | Ordinary e-commerce + consumer law |

> **The line that must never be crossed: nothing converts between A and B/C.** The moment real money buys coins, or coins redeem for cash, you are arguably holding stored value and the compliance burden multiplies — e-money permissions, safeguarding of funds, Apple's IAP cut on top. Keep them separate and all three stay simple. This is the most important single sentence in this document.

### 1.1 Booking deposit 🔴

You're right that "no payment at all" doesn't survive contact with reality — a no-show costs Kimani a chair he can't resell. So the design changes, and it changes *well*:

**The deposit is a real card payment to the barber for a real service. It is not coins, and it never touches the game economy.** This is exactly what Booksy, Fresha and Treatwell do, which means it's a solved commercial problem with known providers rather than novel financial engineering.

**But here's the part worth getting excited about.** We now have two mechanisms doing the same job — the deposit protects Kimani's money, and Trust protects the game's meaning. Marry them:

> **High Trust books without a deposit. Low Trust pays one.**

Trust stops being a soft narrative stat and becomes **financially meaningful — a credit rating you earned by keeping your word.** A new player pays £5 to hold a slot. A player who has turned up six times running just books. That is the Bible's entire argument, expressed as money, and it's genuinely better than either mechanism alone. It also gives a player a concrete reason to care about Trust on day one.

| Needs | Detail |
|---|---|
| Provider | **Stripe** — recommended. Handles SCA, refunds, disputes. Alternative: whatever Kimani already uses |
| Account | Stripe account in the **barber business's** name — the money is his, not the game's |
| Money flow | Player → Stripe → **Kimani directly**. The game must not sit in the middle and hold funds; that changes what we are |
| Deposit level | His call. £5 is typical. Must be a genuine pre-estimate of his loss, **not a penalty** — this matters legally, see §3.2 |
| Refund policy | Written, shown before payment, enforced in code. Cancel outside the window → automatic refund |
| Waiver | One tap for Kimani to waive a no-show fee, no questions. Illness and no bus fare are real |
| SCA / 3DS | Handled by Stripe, must be tested on a real card |
| Placeholder now | Stripe **test mode** end to end. Test keys only, `501` when unconfigured |

**Blocked on:** Kimani's decision on deposit level and cancellation window; a Stripe account; §3.2 legal check.

### 1.2 Shopfront rent 🟠

You want real money, small: £10–50/month by size and location. That's a sound model — it's a subscription, and it's the clearest revenue line in the project.

One reconciliation with the doctrine, which I think you'll like: I recommended earned tenancies, you want real rent. **Both, and they don't conflict:**

> **Standing decides whether you're *eligible*. Rent is what you *pay* once you are.**

Nobody buys their way onto the High Street — you earn the right to be considered, then you pay to keep the keys. Doctrine intact, revenue intact, and "I earned that unit" stays true.

| Needs | Detail |
|---|---|
| Provider | Stripe **Subscriptions** — recurring billing, dunning, cancellation |
| **VAT** | 🔴 A monthly fee for a digital service is very likely VATable. Registration threshold, invoices, possibly EU/overseas rules. **Accountant, before the first pound** |
| Consumer rights | It's a consumer subscription: clear cancellation, no auto-renew traps, no dark patterns |
| Failed payment | Grace period, then the unit lapses. Their build must be preserved, not destroyed — losing someone's work over a declined card is unforgivable |
| **Shutdown obligation** | If the game closes, people have paid for something that vanishes. Needs a stated policy **before** taking the first payment |
| Placeholder now | Tenancy state machine with rent as a **coin** cost. Real billing swaps in behind the same interface |

### 1.3 Garment sales (real physical product) 🔴

Unchanged and unbuilt. Currently checkout debits *coins* and decrements a database row. No processor, no address collected anywhere, no tax, no shipping, no fulfilment.

**Needs:** Stripe/Shopify decision · delivery address capture · VAT · shipping rates · a 3PL or Kimani's own stock · returns (14-day UK distance-selling right) · chargebacks · order reconciliation · customer support route.

**Open question from the 27 July plan, still open:** Stripe direct or **Shopify headless**? Shopify collapses most of this — tax, shipping, returns, inventory, fulfilment integrations — at the cost of fees and control. For a small team selling a modest number of SKUs, **I'd lean Shopify headless** and revisit later. It converts months of work into a weekend.

### 1.4 Apple / Google 🟠

If the app is on the App Store and coins are ever purchasable in-app, Apple will want IAP and its cut. **Physical goods sold for real money are exempt.** This is precisely why §1's separation matters: keep coins unpurchasable and the question mostly disappears.

**Needs specialist advice before any in-app top-up is built.** Getting it wrong means rejection and a rebuild.

---

## 2. The barber booking

Now that Kimani owns the project, most of the "can we trust this partner" design evaporates — this is his own business, his own data, his own liability. What remains is real and still matters, because his **customers** are third parties.

| Item | Status | Detail |
|---|---|---|
| Agreement | ✅ | He's the owner. No third-party contract needed |
| **How he runs his diary today** | 🔴 **Unknown — blocks design** | Paper book? Booksy? Instagram DMs? Determines everything below |
| Calendar integration | 🔴 | If he uses software, integrate. If it's paper, **the game must not become a second diary he has to check** |
| Slot publishing | 🟠 | He publishes availability; the game never invents a slot |
| Confirmation | 🟠 | Nothing auto-commits his time |
| Staff view | 🟠 | One page: today's bookings, confirm, cancel, waive, mark no-show. Must work on his phone between clients |
| Notifications | 🟠 | Email or SMS to both sides. Needs a provider (§5.2) |
| **Under-18s** | 🔴 | Real appointment, real premises. Recommend **disabled at launch**; guardian-consent path later |
| Data minimisation | 🟠 | He sees a first name and a booking code. Not email, not address, not game profile |
| No-show waiver | 🟠 | One tap, no penalty, no Trust damage |
| **He cancels** | 🟠 | Costs the player nothing. Trust is never damaged by someone else's change of plan |

---

## 3. Legal and compliance

**Nothing in this section is legal advice.** It is a list of questions a professional needs to answer, sized so you know what you're commissioning.

### 3.1 Data protection (UK GDPR) 🔴

We collect email, phone, and soon addresses, payment references, real appointment times and real locations. Currently there is **no privacy policy, no consent capture, no retention policy, no deletion route, no export route, no lawful-basis record**.

| Needed | Note |
|---|---|
| Privacy policy | Before any public sign-up |
| Lawful basis per data type | Contract for bookings; consent for marketing |
| Right to erasure | A **route**, not a manual database edit |
| Right to portability | Export a player's data |
| Retention policy | How long we keep a lapsed account |
| ICO registration | Likely required (small annual fee) |
| DPIA | Likely — real locations, possibly minors, behavioural data |
| **The committed database** | 🔴 **Open.** See §7 |

### 3.2 Consumer and contract 🔴

| Question | Why |
|---|---|
| Is a forfeited deposit enforceable? | UK: must be a genuine pre-estimate of loss, not a penalty. Affects the amount |
| Distance-selling cancellation rights on a dated appointment | Exemptions exist for some dated services; **needs checking, not assuming** |
| Terms of service, and for under-18s | Contracts with minors are a real issue |
| Shopfront rent as consumer subscription | Cancellation, refunds, what happens on shutdown |
| Age rating (PEGI / IARC) | Will ask about drug references. Design the answer in, don't retrofit |

### 3.3 Real places, real names 🟠

We render real Lincoln buildings and label some with **real trading names** — NatWest, JD. That's trademark and potentially passing-off territory, especially once commerce is attached. Kimani's own shop is fine; the others need a view. **Cheapest fix: fictionalise the names, keep the buildings.** The city stays recognisable and the risk goes away.

---

## 4. Rendering Lincoln — and a warning

You mentioned Google Street View. **Please don't build on it.** Google's terms prohibit using Street View imagery to create derivative 3D assets or bulk-downloading it, and an asset pipeline built on it is legally unusable and would have to be thrown away — after the art is made, which is the expensive moment to find out. *(Verify against their current terms before relying on my summary, but treat it as a no.)*

**The good news: you already have the right pipeline, and it's better than Street View anyway.**

| Source | Licence | Status |
|---|---|---|
| **OpenStreetMap** — footprints, roads, land use | ODbL, attributed | ✅ Working. `build-map-tiles.mjs` |
| **Environment Agency LIDAR** — real elevation | OGL v3, attributed | ✅ Working. The Steep Hill climb is real |
| **Your own photography** | You own it outright | ⚪ **Do this.** Walk Lincoln with a phone. Free, legal, unlimited |
| **Photogrammetry from your own photos** | You own it | ⚪ Best route to landmark quality |
| Ordnance Survey OpenData | OGL v3 | ⚪ Worth evaluating |
| Mapillary | CC-BY-SA | ⚪ Usable with care — share-alike affects derivatives |
| ~~Google Street View~~ | ❌ Prohibited | **Do not use** |

A weekend photographing the High Street, the Castle and the Cathedral gives you reference and photogrammetry source that is **yours forever**, at zero licence risk. That is the answer to "how do we make it look real".

---

## 5. Infrastructure

### 5.1 Continuous integration 🔴

Still absent. Five working quality gates run only when someone remembers, and the README claimed workflows that never existed. **Highest-value unbuilt infrastructure in the project** — it is the thing that stops the next `/api/rewards/claim`.

### 5.2 Transactional email / SMS 🟠

Needed for booking confirmations, password reset (**there is currently no way to recover an account**), and receipts. Provider needed — Postmark, SendGrid, Resend. Domain verification, SPF/DKIM.

### 5.3 Error monitoring 🟠
Nothing exists. Sentry or equivalent, both clients and server.

### 5.4 Secrets management 🟠
Currently environment variables on Railway. Adequate now; needs rotation policy and a documented inventory as the team grows.

### 5.5 Backups 🔴
SQLite on one Railway volume. **Is anything backed up? Has a restore ever been tested?** An untested backup is not a backup.

---

## 6. Character creation and the wardrobe problem

You want character setup first: gender, ethnicity, height, build. Agreed — and it's doctrinally right, not just expected. A game about *"separating circumstances from identity"* that opens by letting you author your identity is saying the right thing before a word of dialogue. Representation matters here more than in most games, given the audience.

**But there's a trap in it, and it's the single biggest technical risk in the whole project. Let me be direct about it.**

**Your product is clothing.** Every garment you sell must appear, correctly fitted, on every body a player can create. Continuous sliders — free height, weight, muscle, proportions — mean every garment must deform to arbitrary bodies at runtime. That is genuinely hard, it is where studios lose months, and it directly damages the thing you're actually selling: a hoodie that clips, sags or stretches wrong makes the real product look bad.

**Recommendation: fixed body archetypes, not sliders.**

- A modest set of body types (say 4–6) across height and build, plus full face/skin/hair variation on top.
- Each garment is authored once **per archetype** — a known, finite, schedulable art cost.
- The clothing always fits, because someone made it fit.
- Players get real representation; you get garments that look like the thing you're selling.

This is what most fashion-forward games settle on, and it is the difference between "we'll add a new drop next month" and "a new drop takes a month of fitting work".

| Needs | Detail |
|---|---|
| Base mesh / rig | 🔴 Licensing decision. Options: buy a character system, commission, or build. **Check commercial terms** |
| Archetype count | 🔴 Founder + art call. Every extra archetype multiplies every future garment |
| Garment authoring pipeline | 🔴 Real 3D garments — the longest pole in the project |
| Skin/hair breadth | 🟠 Must be genuinely broad at launch. Getting this thin would be badly received, correctly |
| Opening cinematic | 🟠 Character in development. Needs an art and audio pipeline |
| Placeholder now | Blockout bodies + procedural garments — roughly what exists today |

---

## 7. Open items needing a founder answer

| # | Question | Blocks | Urgency |
|---|---|---|---|
| 1 | **Did anyone outside the team ever sign up?** Determines whether the database in git history is a GDPR breach or just untidy | Whether we act today | 🔴 **Now** |
| 2 | **How does Kimani run his diary today?** | The entire booking design | 🔴 Now |
| 3 | Deposit amount + cancellation window | Booking payments | 🟠 |
| 4 | Under-18 bookings — disable at launch? *(recommend yes)* | Booking scope | 🟠 |
| 5 | Stripe direct or Shopify headless? *(lean Shopify)* | Commerce architecture | 🟠 |
| 6 | Fictionalise real trading names? *(recommend yes)* | Trademark risk | 🟠 |
| 7 | Body archetype count | Every future garment | 🟠 |
| 8 | Accountant engaged for VAT? | Rent + sales | 🟠 |
| 9 | Two-currency model — Trap Coins vs TRP | Economy schema, before real users | 🟡 |

---

## 8. Provider shortlist

Nothing here is signed up for, and nothing will be without your say-so.

| Need | Recommendation | Rough cost |
|---|---|---|
| Payments | **Stripe** | ~1.5% + 20p per transaction |
| Commerce backbone | **Shopify headless** *(decision open)* | From ~£25/mo + fees |
| Email | Postmark / Resend | Free tier, then ~£10/mo |
| Errors | Sentry | Free tier adequate |
| CI | **GitHub Actions** | Free at this scale |
| Hosting | Railway *(current)* | Already running |
| Database at scale | Postgres | When SQLite stops being enough — not yet |

---

*Living document. Update it whenever a placeholder is added or made real.*
