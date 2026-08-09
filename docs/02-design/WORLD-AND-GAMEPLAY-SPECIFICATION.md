# TRP23 World & Gameplay Specification

**Proposed authoritative specification — for owner review.**

**Date:** 9 August 2026 · **Status:** 🟡 **proposed. Not yet a source of truth. Nothing implemented.**
**Built from:** the 14 Bible volumes · [WORLD-EXPERIENCE-RECONCILIATION](../01-audit/WORLD-EXPERIENCE-RECONCILIATION.md) · decisions **D-W01–D-W10** · implementation evidence
**Companion:** [HIGH-STREET-SESSION](HIGH-STREET-SESSION.md) — the same systems as a played session

> **This reconciles the Bible; it does not replace it.** Where the Bible speaks, it is quoted and obeyed. Where it is silent, this proposes and says so. Where they would conflict, the conflict is named in §27 rather than resolved quietly.

---

## 1 · Core identity

> **TRP23 is a clothing brand delivered through a living Lincoln, in which the work you do inside the world can reach your real life — through rewards that are funded, limited and auditable.**

Three claims, each load-bearing:

**A clothing brand first.** Vol 5: clothing is *"the first interaction with the philosophy."* Vol 13 puts it plainly — the clothing is the starting point, the world is the destination. Trap Made It is the only apparel brand in the world at launch (owner, 9 Aug); an empty shopfront reads as a real city, an invented competitor reads as filler.

**A real city, not a set.** 4 km² of Lincoln from OSM and LIDAR already exists and streams to both clients. It is the most valuable thing in the repository and the one asset no competitor can copy cheaply.

**Real consequence, bounded.** The differentiator, and the thing most likely to cause harm if built carelessly. **D-W06's invariant governs everything downstream: gameplay cannot manufacture unlimited real-world monetary liability.**

---

## 2 · Player fantasy

Not *"I am a criminal getting rich."* Not *"I am shopping."*

> **"I know this city. People here know me. What I did today counted for something."**

Recognition, standing, and consequence — in a place the player may actually be able to walk through tomorrow. The Bible's word for the destination is **Trapologist**, and Vol 3 Stage 7 is unambiguous: *"The title cannot be bought. It cannot be given. It must be earned. […] The clothing simply represents that commitment."*

That sentence is the design brief for the entire economy. **The garment is the receipt, not the achievement.**

---

## 3 · The six chapters

Permanent, authored, finite. They are the spine of the personal journey and they **end** — a player finishes them.

Mapped to Vol 3's seven stages, which the chapters currently only gesture at:

| Chapter | Vol 3 stage | The question it asks |
|---|---|---|
| 01 THE COME UP | Overstanding · Acknowledgement | What is trapping you? *(the Trap Card)* |
| 02 THE KITCHEN | Strategy | Fast money, or the thing that compounds? |
| 03 THE GRAVEYARD SHIFT | Action | Can you keep going when it stops being exciting? |
| 04 THE SHOP FLOOR | Discipline | Is the work good enough to put your name on? |
| 05 TOP FLOOR | — | Will you stake your standing on someone else? |
| 06 THE WAREHOUSE | Becoming a Trapologist | Does it still hold you? *(the card returns)* |

**Stage 5, the Weekly Self Audit, has no chapter** — it is a recurring ritual, not a stage, and belongs to the live world (§4).

---

## 4 · The ongoing live world

Where the game continues after chapter six, and where most players will spend most of their time.

Collections and Drops (§6) continue indefinitely — **D-W02**. Standing keeps accruing. Premises keep operating. The Weekly Self Audit recurs. Live events, city events and seasonal content live here.

**Design consequence:** nothing in the world may be gated on *"has finished the chapters."* The chapters are a spine, not a wall.

---

## 5 · Trap Made It's role

Not a sponsor inside a game. **The brand is the world's economy, and the world is the brand's story** — Vol 10: the story is told *"through the online game and the way of purchasing clothes."*

The **flagship** (§21) is where that becomes concrete: the drop in the window is the current chapter of the brand's story, and the same garment exists digitally on your character and physically in a box with an evidence-bag aesthetic (Vol 5, Packaging).

---

## 6 · Story Chapter / Collection / Drop / Product

**D-W02.** Four distinct concepts. Conflating them is what produced the current 1:1 chapter↔drop model that caps the brand at six ranges forever.

| Entity | Is | Lifetime | Count |
|---|---|---|---|
| **StoryChapter** | A permanent narrative/progression stage | Permanent | Exactly 6 |
| **Collection** | A coherent apparel range with a creative theme | Permanent once created | Unbounded |
| **Drop** | A scheduled event releasing Collection products | Windowed — teases, opens, closes | Unbounded |
| **Product** | A specific item, with digital and/or physical form | Permanent | Unbounded |

**Relationships:** a Collection *contains* Products. A Drop *releases* some or all of a Collection's Products for a window. A StoryChapter *may reference* a Collection thematically — **it does not own one**.

**Vol 9 preserved as creative doctrine.** *"Collections are chapters, not random drops"* means a collection must have narrative meaning and coherence. It is a rule about **creative standards**, not about database identity. Reading it as identity would have capped Trap Made It at six ranges for life.

**Cadence is content-controlled** — never hard-coded monthly. A drop opens when the work is ready.

### Acquisition modes — D-W03

| Mode | Meaning |
|---|---|
| `OPEN_PURCHASE` | Buy it. No gate |
| `PROGRESSION_UNLOCK` | Reaching a chapter or Standing opens the right to buy |
| `MISSION_UNLOCK` | A specific mission opens the right to buy |
| `MISSION_REWARD` | Granted outright by gameplay |
| `LIMITED_EVENT` | Drop window and/or a claim cap |
| `LEGACY` | Retired. Owned forever, never re-sold |

> **Purchase must never represent achievement.** `own2`/`own3` are exactly that pattern and retire when their package is authorised — **not now**.

**Unlock ≠ ownership.** `MISSION_UNLOCK` grants *eligibility to buy*, which is Vol 11's *"exclusive access"*. `MISSION_REWARD` grants the thing. Keeping these separate is what stops the game becoming *"do three chores, get a hoodie."*

---

## 7 · Mission philosophy

Governed by [MISSION-DESIGN-BIBLE](MISSION-DESIGN-BIBLE.md), unchanged and still correct: **a mission is a commitment you keep or break, measured over time, that the world remembers.** Seven verbs — COMMIT, PRACTISE, CHOOSE, REPAIR, NOTICE, VOUCH, BUILD. No FETCH, no KILL, no COLLECT.

**Applied to drops**, four rules:

1. **The mission is about the person; the garment is the receipt.**
2. **Gate access, not existence** — earning the right to buy is on-doctrine; being handed goods for chores is not.
3. **No mission is ever cleared by purchasing.**
4. **A live drop changes the world, not just the shop** — the window, the street, what people mention. Narrative doing the advertising, rather than advertising wearing narrative.

---

## 8 · Standing and progression

**Standing does not exist in any form today.** `trustStatus` is in the schema and written by nothing.

Five dimensions, each with a real cost, **never shown as a number** — the case file describes them in words:

| | Earned by | Costs you |
|---|---|---|
| **Trust** | Kept commitments, repairs | Slow to build, fast to lose. People expect things |
| **Craft** | Practice, finished work | Time not spent earning |
| **Street** | Noticing, surviving being played | **Legit people find you guarded** |
| **Standing** | Public, legitimate, visible activity | **Visibility.** Old associations resurface |
| **Steadiness** | Showing up over time | Decays. Needs maintenance |

**Street vs Standing is the central tension and the Bible's actual subject:** the skills that kept you alive in the trap are real skills that cost you something in the legitimate world.

**Money is not progression.** Coins buy things; they open nothing.

---

## 9 · The Trap Card

Vol 3 Stage 3: *"Write down exactly what is trapping you."* **The card is not an interpretation of the doctrine — it is the doctrine, implemented**, and it already works in both clients.

Written in Chapter 01, locked when you leave, returned in Chapter 06: *"Does this still hold you?"* Never scored. Private to its author — never leaderboard, never community, never staff (D-113).

**Proposed extension, for review:** the card is the natural home of the **Weekly Self Audit** (Vol 3 Stage 5, four questions), which currently has no home anywhere. That would make the case file a living document rather than a bookend.

---

## 10 · The Trap Coin economy

**D-W05. One currency: Trap Coins (TC).** Wallet and TRP Central Bank hold the same currency in two places — `Wallet: 420 TC · TRP Central Bank: 2,850 TC`. No second fictional currency without demonstrated need.

Already built and sound: atomic ledger, never negative, server-authoritative, deposit/withdraw/transfer.

**Still true and non-negotiable (D-107):** TC and real money never convert in either direction.

---

## 11 · Earned vs purchased value — a proposal

**D-W05 requires the economy to distinguish purchased value from earned value.** The obvious implementation — tagging provenance onto the currency — creates an accounting problem: once earned and purchased TC mix in one balance, every spend needs a rule for which units it consumes, and every refund needs to put the right kind back.

**Proposed instead: do not put provenance on the currency at all.**

| | What it is | Where it comes from | What it does |
|---|---|---|---|
| **Trap Coins (TC)** | In-game spending money | Earned, or purchased with real money | Buys digital things in the world. **Never redeems for real-world value** |
| **Reward Entitlements** | A claim on a specific, funded, real-world benefit | **Gameplay only** | Redeemed against a real garment, service or discount |

TC stays one simple currency. The real-world-facing thing is a **separate, non-currency entitlement** that only gameplay can produce and that always points at a funded campaign (§12).

**Why this satisfies D-W05 better than tagging:**

- Purchased value can never create real-world benefit, **structurally** — it only ever becomes TC, and TC never redeems for real value
- No provenance accounting, no FIFO, no refund ambiguity
- No cash-out loop can exist, because there is no path from TC to anything with a price in GBP
- D-W06's invariant becomes enforceable at the point of grant rather than the point of spend

**This is a proposal, not a decision** — it is the sharpest open question in this document. See §28 Q1.

---

## 12 · Funded real-world rewards

**D-W06 invariant: gameplay cannot manufacture unlimited real-world monetary liability.**

Every Reward Entitlement points at a **Campaign** with a funding authority. Conceptually a campaign carries: funding source · total budget or claim count · claims remaining · eligible reward · eligible SKU or service · start and end dates · redemption rules · maximum contribution per claim · expiry.

**Three rules that make the invariant hold:**

1. **No campaign, no entitlement.** A mission cannot grant a real-world benefit that is not already funded and in stock.
2. **The claim is decremented at grant, not at redemption** — otherwise a thousand players hold entitlements against a budget of ten.
3. **Expiry is mandatory.** An open-ended liability is an unfunded one eventually.

Funding sources (D-W06): promotional budget · campaign budget · partner funding · sponsorship · allocated inventory · product margin · limited pool · revenue share.

**General GBP cash-out is not approved** and is a research item requiring regulatory, payment-provider and platform review before it is even designed.

---

## 13 · Digital entitlement vs physical fulfilment

**D-W07.** Two authorities, deliberately separate.

| | Pays with | Produces | Touches physical stock? |
|---|---|---|---|
| **Digital purchase** | TC | Digital entitlement | ❌ **Never** |
| **Physical purchase** | GBP, on the web | Inventory reservation → order → fulfilment | ✅ |
| **Funded reward** | Entitlement (§11) | Contributes to or fully funds a configured physical item | ✅ against campaign allocation |

A physical purchase **may** grant the digital twin where configured. **A digital purchase must never consume real stock** — which it does today: `createOrder` reserves `inventory.stock` for a `priceCoins` purchase. Harmless while no stock is real; a defect the day one is.

---

## 14 · World-first interaction

**D-W10.** *If an action can reasonably be an interesting physical interaction, prefer the place, person or object over a permanent global menu button.* **Not dogmatically.**

| Stays UI | Because |
|---|---|
| Account, password, 2FA | Walking somewhere to change a password is a worse game |
| Settings, accessibility, bindings | Same, and an accessibility feature you must walk to is not one |
| The Case File | It is your own head. There is nowhere to walk to |
| Real-money checkout | Web only (D-115, console rules) |

**Every menu that becomes a building costs an interior, an NPC, a walk there and a walk back.** That price is worth paying for banking and shopping. It is not worth paying for settings.

---

## 15 · The Phone

**D-W08.** *The phone informs, communicates and navigates. The world is where the player acts.*

| Function | Shows | Acting happens |
|---|---|---|
| Map | Lincoln, markers, routes | Walking there |
| Messages | From NPCs, the brand | In person |
| Missions / Case File | Objectives, the card | In the world |
| Drops | Announcements, teases | At the flagship |
| Contacts | People you know | Their premises |
| Wallet | `Wallet: 420 TC` · `Bank: 2,850 TC` | **Bank or ATM** |

**The test for any new phone feature: does it inform, or does it act?** If it acts, it belongs somewhere in Lincoln.

---

## 16 · The player's home

**D-W09.** The first home **reinforces THE COME UP** — it is not aspirational, and that is the point. Vol 3 begins with recognising where you actually are.

Rest and save · wardrobe · mirror and appearance · storage · personal items. The living situation **may** become a progression system later; **no property system is designed here.**

**Not yet decided: where it is.** No home exists in `lincolnAnchors.json` or anywhere else. See §28 Q3.

---

## 17 · Location taxonomy

Anchored to real buildings by **OSM element id, never by name** — because OSM already has the barber's shop tagged under a previous occupant (*"Mankind"*), and an upstream rename must not break a mission. This is already implemented and is quietly excellent.

| Category | Meaning | Examples |
|---|---|---|
| `FLAGSHIP` | Trap Made It hero retail | The flagship |
| `FINANCE` | Money as a place | TRP Central Bank, ATMs |
| `SERVICE` | Book or receive something | The barber |
| `HOME` | The player's own | Chapter-one home |
| `STORY` | Authored chapter interior | THE COME UP |
| `AMBIENT` | Dressing. Not enterable yet | High Street shopfronts |
| `VACANT` | A door with a TO LET sign | Future tenancy |
| `LANDMARK` | Navigation and place | Cathedral, Castle, Stonebow |

**`VACANT` earns its place at launch:** empty shopfronts cost almost nothing, make Lincoln feel real, and advertise the eventual tenancy platform to everyone who walks past.

**Real trading names are not used as in-game business identities.** The building is the anchor; the business is ours or fictional.

---

## 18 · NPC philosophy

**D-W04: there is no Kimani character.** No likeness, no voice, no dialogue, no digital representation. His involvement is brand and business. **Premises use fictional staff.**

Four tiers (unchanged from [NPC-AND-SOCIAL-SIMULATION](NPC-AND-SOCIAL-SIMULATION.md)): ambient population · local recurring · story characters · bounded dynamic agents. **No unrestricted player text into an unmoderated language model — ever.**

**Invent as few named characters as possible.** Every name is a voice, a schedule, a memory and a continuity obligation.

---

## 19 · The High Street slice — product specification

**What it must prove, in one sentence:**

> *A real clothing brand, a real city and a real service are one world, and what you do here counts somewhere else.*

**Area:** the High Street between the Stonebow and the foot of Steep Hill — about 400 m, containing the flagship anchor, the bank anchor, the barber anchor, continuous shopfronts, and the start of the LIDAR climb.

| Must demonstrate | Proves |
|---|---|
| Lincoln is real and walkable | Already true |
| A phone that informs and navigates | D-W08 |
| A home you leave and return to | D-W09 |
| Banking as a **place** | D-W10 |
| A flagship with a **live drop in the window** | Drops are narrative |
| One mission chain that is **not chores** | The core product risk |
| A garment whose access is **earned**, then obtained | Eligibility ≠ ownership ≠ fulfilment |
| One **funded** real-world reward | D-W05/06, and the differentiator |
| Digital ≠ physical, visibly | D-W07 |
| The case file remembering | Already built |
| The world responding | `MOODS` proves the pattern |

**Not proving:** the rest of Lincoln · vehicles · multiplayer · player tenancy · real payments at scale · NPC schedules · deep character creation · route planning beyond markers.

---

## 20 · Trap Made It flagship

**Anchor: the JD Sports building, 311–312 High Street** (`way/241764018`). **In-game identity: the Trap Made It flagship.** The real retailer's identity is not used.

**D-W01: it is no longer Chapter 1.** The anchor is currently `kind: "chapter"` and named `"JD"` — both must change. THE COME UP moves elsewhere.

What it is: the current drop in the window, changing per drop · digital try-on against your archetype · physical purchase routed to the web · mission-unlocked items visibly locked *(you can see what you have not earned)* · fictional staff · the brand's story as a place.

---

## 21 · TRP Central Bank

**Anchor: the NatWest building, Mint Street** (`way/399631226`). **Already implemented and already correctly named** — this is confirmation, not new work.

**It is not an ATM with a face.** It is where short-term survival thinking meets long-term ownership: the teller notices patterns without judging them — *"third time this week you've taken it all back out"* — and Standing is what she actually gates. A business account is the eventual on-ramp to tenancy.

`Wallet: 420 TC` and `Bank: 2,850 TC` are one currency in two places (D-W05).

---

## 22 · The barber

**Anchor: 25 Corporation Street** (`way/723251372`), currently `"Closed for now."`

**Open the shop; do not represent the person** (D-W04). Fictional staff.

The real-world booking — a real appointment at a real chair — remains the single most distinctive thing available, and it is a **business function, not a character representation**, so D-W04 does not block it. **But it now needs re-confirming**, because the reconciliation assumed a Kimani NPC would take the booking. See §28 Q2.

Design constraints if it proceeds, unchanged: **no payment through the game** beyond a deposit paid to the business · high Trust books without a deposit, low Trust pays one · the shop sees a first name and a code, nothing else · a waived no-show costs nothing · **walk-ins must be blockable in one tap**, or a double-booking destroys trust in it immediately.

---

## 23 · Map and navigation

The phone's map (D-W08). For the slice: player position and heading, named locations, mission destinations, zoom and pan.

**Full route planning is [WP-U13](../04-plan/work-packages/WP-U13-navigational-map.md) and is not in the slice.** Worth restating why it is bigger than it looks: the current map is a camera pointing down, and a camera knows nothing — it cannot name a street or find a path. Routing needs a graph, and the graph is already in the OSM data the tiler reads and discards.

---

## 24 · First NPCs

Four archetypes. **No Kimani.** No further named characters until a mission needs one.

| Archetype | Named? | Job |
|---|---|---|
| Flagship staff | Fictional, named | Product, drops, try-on. The brand with a face |
| Bank teller | Fictional, named | Banking, Standing, the mirror |
| Barber staff | Fictional, named | The booking |
| Ambient pedestrians | No | The 30-second loop. **Lincoln is currently dead** |

---

## 25 · Phygital principles

1. **The garment is the receipt, not the achievement** (Vol 3 Stage 7)
2. **Digital and physical are separate authorities** (D-W07)
3. **Real-world value is always funded** (D-W06)
4. **Coins never become money** (D-107)
5. **The client is never trusted with value** — already enforced and tested
6. **Packaging is the last chapter of the story** (Vol 5) — evidence bags, archive folders. *Opening the box should feel like starting a chapter*
7. **No player is disadvantaged for declining real-world linkage**

---

## 26 · Deliberately out of scope

Vehicles · multiplayer · player tenancy and rented shops · other real brands · NFTs and blockchain (Vol/directive) · GBP cash-out (§12) · full property progression · route planning (WP-U13) · dynamic AI NPCs · run club, barbering programme, education, ambassadors (Vol 5 pillars, later) · cities beyond Lincoln · consoles.

---

## 27 · Contradictions this specification does not resolve

| # | Contradiction | Why it is left open |
|---|---|---|
| 1 | **Chapter 1 needs a new home.** D-W01 frees the JD anchor, but THE COME UP now has no location | Needs a building. §28 Q3 |
| 2 | **Coin purchases decrement physical stock** | D-W07 settles the principle; the fix is a package, not a decision |
| 3 | **Six discount codes redeem against nothing** | Defect. `TRAP-COMEUP10` etc. are granted but no discount rows exist |
| 4 | **`defaultWorld.js` still validates checkout `locationId`** with stale fictional shops | Retires with the Premises system |
| 5 | **Vol 5's ten pillars are ~10% represented** | Run club, barbering, education, ambassadors have no representation. Deliberate, not forgotten |
| 6 | **Standing is designed twice** — five dimensions here, `trustStatus` in the schema | Reconcile when Standing is built |
| 7 | **Nothing in a normal session earns TC.** §8 says money is not progression; the session ([HIGH-STREET-SESSION](HIGH-STREET-SESSION.md) finding 1) shows a player spending with no income. Where does spending money come from? | Surfaced by writing the session. Needs a design answer, not a decision |
| 8 | **Three of five Standing dimensions go unexercised** in the slice — only Trust does work | Either the slice gains a beat that uses Craft/Street/Steadiness, or the model has more dimensions than the game currently needs |

---

## 28 · Remaining owner decisions

Only what this specification cannot settle from evidence or from D-W01–D-W10.

**Q1 · Reward Entitlements, or provenance-tagged Trap Coins?** *(§11 — the sharpest question here.)* I propose a separate non-currency entitlement, because tagging provenance onto one balance creates spend-order and refund-order accounting that has to be right every time or the invariant leaks. **Recommend entitlements.** This shapes the economy schema, so it wants deciding before anything is built.

**Q2 · Does the real barber booking survive D-W04?** The booking is a business function and a fictional member of staff can take it — but the reconciliation assumed Kimani's own presence, and you may feel differently now the character is gone. **No recommendation: this is a business relationship question, not a design one.**

**Q3 · Where are THE COME UP and the player's home?** D-W01 frees the JD building and D-W09 asks for a home; neither now has a location. They could be the same building — a chapter-one home you later return to — which is cheap and thematically apt. **Recommend one building serving both, subject to your view on the geography.**

**Q4 · Which real Lincoln premises may we anchor to at all?** Buildings are anchored by OSM id and named fictionally, which handles trading names. It does not handle an actual occupant objecting to their premises being in a game. **Recommend a written policy before the slice ships.**

**Q5 · What is the first funded campaign?** §12 needs one real example to prove the loop — a discount on a real garment, a contribution toward an appointment, something small and genuinely funded. **Recommend the smallest thing that is real**, because a fake one proves nothing.

---

*Proposed, not adopted. No implementation, no work packages, no Unity or backend changes.*
