# Merchant and Player Business System — the Premises model

**Status:** Design, for founder sign-off. Nothing here is built yet.
**Date:** 3 August 2026
**Answers:** master directive §9 · founder instruction 3 August (NatWest banking NPC; barber shop with real bookings; "all the shop fronts available for rent or to buy so people can open shops")
**Companion to:** [MISSION-DESIGN-BIBLE.md](MISSION-DESIGN-BIBLE.md)

---

## 1. The central insight

You described three things: a bank you walk into and do your banking, a barber shop where you book a real appointment, and — eventually — shopfronts that players can rent or buy to open their own shops.

**These are not three features. They are one system in three configurations.**

Every one of them is: *a real building in Lincoln, with a door, an interior, a person inside, a service, and consequences that may reach outside the game.*

```
                    PREMISES
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
  HOUSE             PARTNER            PLAYER
  operated          operated           operated
    │                  │                  │
 NatWest            The barber        Rented shopfront
 (banking)          (real booking)    (retail / studio)
```

Same door, same interior system, same NPC framework, same service contract, same audit trail. What changes is **who operates it** and **what service it offers**.

This matters commercially: building the barber properly *is* building the merchant platform. You are not doing a favour for a colleague and then starting the real work later. **The barber is v1 of the thing you eventually want for everyone**, and having exactly one trusted partner is the ideal way to discover what verification, no-shows, liability and support actually cost — while the blast radius is one friend and one shop.

---

## 2. The model

### Premises

Anchored to a **real OSM building id**, never a name — the pattern already established in `src/world/lincolnAnchors.json`, and it's the right one: names change, ids don't.

```
premises
  id, osmBuildingId, displayName, districtId
  operatorType   HOUSE | PARTNER | PLAYER
  operatorId
  serviceType    BANKING | BOOKING | RETAIL | WORKSHOP | COMMUNITY | VACANT
  interiorKey, state, publishedAt
```

### Service types

| Service | What a player does inside | Money | v1? |
|---|---|---|---|
| **BANKING** | Deposit, withdraw, Standing, business account | Game coins only | ✅ |
| **BOOKING** | Reserve a real slot with a real business | **None — paid in person** | ✅ |
| **RETAIL** | Browse and buy garments | Coins now; real money later | 🔶 partial |
| **WORKSHOP** | PRACTISE a craft; produce something | None | Later |
| **COMMUNITY** | Events, notices, meeting | None | Later |
| **VACANT** | A door with a TO LET sign — visible future | — | ✅ (as set dressing) |

**VACANT ships in v1 deliberately.** Empty shopfronts with TO LET signs cost almost nothing, make Lincoln feel real, and *advertise the eventual platform to every player who walks past*. The city tells your roadmap for you.

### Operator types

| Operator | Who | Verified? | Real-world liability | Stage |
|---|---|---|---|---|
| **HOUSE** | You | n/a | Yours | Now |
| **PARTNER** | Verified real Lincoln business | Yes — company/sole-trader check, in person | **Theirs**, under a written agreement | Now (the barber) |
| **PLAYER** | A player with a tenancy | Staged — see §4 | Depends on tier | Later |

---

## 3. Tenancy: the staged ladder

Your brief is explicit: *"Do not create a system where arbitrary players can immediately sell unverified physical products."* Agreed, and strongly. Five rungs, each independently shippable, each proving the one above is safe.

| Tier | What they get | Can sell | Verification | Risk |
|---|---|---|---|---|
| **0 · Vacant** | Nothing — a TO LET door | — | — | None |
| **1 · Cosmetic lease** | Dress a space; a name over the door; friends can visit | **Nothing** | Account + Standing | Moderation only |
| **2 · Creator pop-up** | Time-limited; show digital work, take commissions off-platform | Nothing on-platform | Identity + content review | Low |
| **3 · Approved merchant** | Sell **our** approved goods on consignment; earn a cut | Our stock only | Identity + agreement | Medium — we still fulfil |
| **4 · Independent merchant** | Sell their own physical goods | Their own goods | Full: company, VAT, product safety, insurance, IP | **High — needs legal review** |

**Recommendation: build Tier 1, then stop and look.** A cosmetic lease is genuinely fun, has no financial regulation, no product safety, no fulfilment and no payouts — and it will tell you whether players actually want to run a space at all before you build a marketplace for a demand you have assumed.

**Tier 4 must not be built without specialist UK advice.** At that point you are a marketplace: consumer rights, distance selling, product liability, VAT collection, payouts, money-laundering checks, dispute resolution. That is not a sprint, it's a company.

### Earned eligibility, paid rent — the resolution

*Revised 3 August after the founder confirmed rent should be real money at real-ish levels (£10–50/month by size and location).*

The doctrine risk in selling tenancies is that the richest player gets the High Street and the game's message inverts — it becomes about capital rather than untrapping. The commercial reality is that rent is the clearest revenue line in the project. Both are true, and they resolve cleanly:

> **Standing decides whether you're *eligible*. Rent is what you *pay* once you are.**

Nobody buys their way onto the High Street. You earn the right to be considered, then you pay to keep the keys — which is also, precisely, how commercial tenancy works in the real world, and the founder's stated aim is that this feels like "a real-world bit in digital."

Doctrine intact. Revenue intact. *"I earned that unit"* stays true.

Pricing by size and location makes the map itself meaningful: a High Street unit costs more than a side street, so the city acquires an economic geography that mirrors the real one. Rent levels, VAT treatment, failed-payment grace and the shutdown obligation are all in [REAL-WORLD-INTEGRATION-REGISTER.md](../05-operations/REAL-WORLD-INTEGRATION-REGISTER.md) §1.2.

---

## 4. The barber — first BOOKING premises

Full design in [MISSION-DESIGN-BIBLE.md](MISSION-DESIGN-BIBLE.md) §7. The platform-level points:

**Kimani owns the project**, so this is not a third-party partnership — it is the founder's own business, and the verification, contracting and counterparty-trust problems that make PARTNER tenancy hard mostly evaporate. What remains is real: **his customers are third parties**, and their data, their safety and his diary are all genuinely at stake.

**Why it still goes first:** it forces confirmation, no-shows, deposits, personal data, notifications and support to be solved *properly*, at a scale where a mistake is a conversation across the office rather than a regulator's letter. Everything learned here is what a stranger's tenancy needs later.

**Money — revised 3 August.** A no-show costs him a chair he cannot resell, so "no payment at all" does not survive contact with a real business. It becomes **a real card deposit, paid to him, that never becomes coins** — an ordinary payment for a service, which is what Booksy and Fresha do. Real money and game money never convert in either direction, and that one rule is what keeps the whole system legally ordinary. Paired with the **Trust marriage** in the mission bible: high Trust books without a deposit, low Trust pays one.

**He must save time, not spend it.** If he already runs booking software, integrate with it. If he runs a paper book, the game must not become a second diary he has to remember to check. **This is the open question that determines the design** — more than anything else in this document.

**Data minimisation:** he sees a first name and a booking code. Not an email, not an address, not a game profile.

---

## 5. The bank — first HOUSE premises, and the on-ramp

The bank is not an ATM with a face. It is where a player becomes a *business*:

```
show up → Trust → the bank takes you seriously → Standing → business account → tenancy
```

A business account is the gate to Tier 1 tenancy. That makes the bank the tutorial for §3, and it means the merchant platform has a natural, earned, in-fiction entry point rather than a menu labelled "Apply for a shop".

Everything the teller does is already backed by working, atomic, ledger-writing code in `sqliteStore.js`. **The bank NPC is mostly a fiction layer over a system that already exists and works.** It is the cheapest of the three to build.

---

## 6. What must be designed before any player sells anything

Recording these now so Tier 3–4 is never started casually. Each needs a real answer:

**Onboarding:** identity, company/sole-trader status, VAT registration, bank account, agreement. **Products:** approval queue, prohibited items, IP checks, product safety, age-restricted goods. **Operations:** who fulfils, who handles returns, who pays the VAT, commission, payout schedule, disputes, chargebacks, fraud, abandoned shops, tenancy expiry, market saturation, discovery. **Trust and safety:** shop content moderation, reporting, ratings and their manipulation, harassment via a shopfront.

Plus, distinctively for a *geographic* game: **a premises is a real building someone actually owns.** Putting a player's shop on a real Lincoln address raises a question no other platform has — what happens when the actual occupant objects? Answer it before it happens: an objection route, and a policy of only assigning tenancies to premises we've cleared.

---

## 7. Build order

| # | Build | Unblocks | Effort |
|---|---|---|---|
| 1 | **Premises table + service contract + interior loading** | Everything | M |
| 2 | **VACANT dressing** — TO LET on real empty units | Advertises the platform; near-free | S |
| 3 | **BANKING (HOUSE)** — teller NPC over the existing ledger | Standing, business accounts | M |
| 4 | **BOOKING (PARTNER)** — the barber | The demo. Proves the partner model | M |
| 5 | **Tier 1 cosmetic lease** | Proves players want this at all | M |
| 6 | *Stop and evaluate* | — | — |
| 7 | Tier 2–3 | Only if 5 shows real demand | L |
| 8 | Tier 4 | Only with legal advice | XL |

---

## 8. Open questions for the founder

1. ~~Has the barber agreed?~~ **Resolved 3 August** — Kimani owns the project. Still open and still blocking: **how does he run his diary today?**
2. ~~Earned vs bought tenancies~~ **Resolved 3 August** — earned eligibility, paid rent (§3).
3. **Which real Lincoln premises may we use?** Kimani's own shop is fine. NatWest and JD are not — real trading names raise trademark and passing-off questions. *Recommendation: fictionalise the names, keep the buildings. The city stays recognisable and the risk disappears.*
4. **Tier ambition** — Tier 1 (players decorate spaces) or Tier 4 (a real marketplace)? They are different companies. *Recommendation: build to Tier 1, decide the rest with evidence.*
5. **Rent levels and VAT** — £10–50/month is the founder's intent. VAT treatment needs an accountant before the first pound. See [REAL-WORLD-INTEGRATION-REGISTER.md](../05-operations/REAL-WORLD-INTEGRATION-REGISTER.md) §1.2.

---

*Design only. Nothing in this document is implemented.*
