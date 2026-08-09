# A High Street Session

**Twenty-five minutes, written as a player experiences it.**

**Date:** 9 August 2026 · **Status:** 🟡 **proposed, for owner review. Nothing implemented.**
**Systems specified in:** [WORLD-AND-GAMEPLAY-SPECIFICATION](WORLD-AND-GAMEPLAY-SPECIFICATION.md)

> **This exists to find out whether the systems compose into a game.** A feature list can look complete and still not be playable. So this is written as one continuous experience, and every system it touches is named in the margin — including the moments where a system we have specified turns out to do nothing.
>
> **It is a test, not a script.** Where it exposes a problem, §Findings says so rather than writing around it.

---

## 0:00 — Waking up somewhere you would rather not

You start in a small flat above a shop on the wrong end of the High Street. Damp patch on the ceiling. A mattress, a kettle, a mirror, a wardrobe with four things in it.

**It is not aspirational and that is deliberate.** *(D-W09)* Vol 3 begins with recognising where you actually are, and a game about untrapping yourself cannot open in a penthouse.

The wardrobe holds what you own. Three of the four items are the plain things you started with. The fourth is a Trap Made It tee you have not earned the right to wear yet — **you can see it, greyed, with a line under it: `TRAP MADE IT · CHAPTER TWO · not yours yet`.** *(§6 acquisition modes — visible, locked)*

> **Design note.** Seeing what you have not earned is more motivating than not knowing it exists, and it is honest — Vol 11 rewards participation with *access*, so access has to be visible to be worth anything.

**Phone buzzes.** *(D-W08)*

---

## 0:02 — The phone tells you; it does not do anything

Three things on the lock screen:

```
TRAP MADE IT          THE ARCHIVE drops Friday. 3 days.
MESSAGE               Ade — "you still coming in thursday or what"
CASE FILE             1 open commitment
```

You open the **Case File**. One line, in your own handwriting from Chapter One:

> *"I say yes to things and then don't turn up."*

Under it, the commitment you made last session: **Thursday, 4pm, the barber. Two days left.** *(§9 Trap Card · §7 COMMIT)*

The phone shows `Wallet: 420 TC · TRP Central Bank: 2,850 TC`. **It shows them. There is no button to move them.** *(D-W08, D-W05)*

---

## 0:05 — Lincoln, on foot

Down the stairs and onto the High Street. It is late morning and overcast — **the server said so**, so it is overcast for everyone *(D-118)*. Wet pavement, people with umbrellas down but not away.

**The street has people in it.** *(§24 ambient)* Someone is pulling a shutter up. Two people outside a café. A delivery van half on the kerb. None of them are missions. They are the reason the city is not a diagram.

You walk up toward the Stonebow. **The ground climbs and you feel it** — Steep Hill is behind you and the gradient is already telling you which way is up. *(`SlopeCost`, already built and tested)*

Your phone map has three markers: **home**, **the flagship**, **the barber**. *(§23)*

---

## 0:08 — The flagship, and a drop you cannot buy yet

The Trap Made It flagship — the building everyone in Lincoln knows as the big sportswear shop on the High Street, except in here it is ours. *(D-W01, §20)*

**The window is the drop.** THE ARCHIVE, three days out. Not a poster: the garments are in the window, lit, with the collection's line on the glass. *(§6, §7 rule 4 — a live drop changes the world, not just the shop)*

Inside, fictional staff — a woman restocking who nods at you, because you have been in before. *(D-W04, §24)*

You try the hoodie on. Your character wears it, in the mirror, in the right size for your archetype. **You cannot buy it.** The tag reads:

```
THE ARCHIVE · Friday
Available to anyone who has kept a commitment this week.
```

*(§6 `MISSION_UNLOCK` — access, not ownership)*

> **This is the moment the whole design either works or does not.** You are not told *"complete 3 tasks."* You are told the thing you already promised to do is the thing that qualifies you. **The mission was not invented for the drop; the drop noticed the mission.**

---

## 0:13 — The bank is a place

You need to move money — you want cash on you for Thursday. **There is no banking button.** *(D-W10)*

TRP Central Bank, Mint Street. The building the city knows as the NatWest; in here it is ours. *(§21)*

Inside is quiet, marble, too big for what it does. A teller. You withdraw 200 TC.

She looks at the screen and says, without any particular tone:

> *"Third time this week."*

That is all. **No penalty, no morality meter, no lecture.** *(§8 — never a number)* But you notice it, because she is right.

> **Design note.** This is the Bible doing work that dialogue usually does badly. Vol 3 Stage 5's Weekly Self Audit asks *"what distracted me?"* — the teller is that question, asked by someone who can see your account.

---

## 0:17 — Thursday is not Thursday yet

Walking back you pass the barber's — 25 Corporation Street, which OSM still thinks is a shop called Mankind. *(§17 — anchored by id, not name)*

**It is open.** *(§22)*

You are not booked until Thursday, so there is nothing to do here. But you go in, because the door works, and a fictional barber tells you they are full today and Thursday still stands.

**Nothing happened, and that matters.** A world where every door is a mission is a menu with walls. *(§14)*

---

## 0:20 — A choice that is not a dialogue wheel

Outside, Ade is waiting — the person from the message. Someone he knows needs a hand shifting stock tonight. **Sixty quid, cash, and it clashes with Thursday.** *(§7 CHOOSE)*

There is no `[GOOD]` / `[BAD]`. There are two things you could do, and one of them is money you could use today.

You say no.

Ade shrugs. He is not offended, and he does not vanish from the game. **He will ask again**, and one day the answer might be different. *(§8 Trust · §18 recurring NPC)*

Your phone, thirty seconds later, without ceremony:

```
CASE FILE  ·  commitment intact
```

**No fanfare. No coins.** *(§7 rule 1 — the mission is about the person)*

---

## 0:24 — What Thursday is worth

Home. The phone has one more thing:

```
TRAP MADE IT
You've kept your word this week.
THE ARCHIVE hoodie unlocks Friday — and there's £15
against the physical one if you want it. 40 left.
```

*(§11 Reward Entitlement · §12 funded campaign — `40 left` is the claim count, and it is decremented at grant)*

**Two distinct things, and the difference is the whole product:**

- **The digital hoodie** — yours Friday, bought with TC, appears in your wardrobe, **touches no physical stock** *(D-W07)*
- **£15 toward the real one** — a funded entitlement, redeemed on the web, against a real garment in a real box *(D-W06)*

You did not buy your way to either. You said no to sixty quid and turned up when you said you would.

**Session ends.** The commitment is still open. Thursday is real, and it is in a diary in a shop you walked past this afternoon.

---

## Findings — does it compose?

**Yes, with four gaps this exercise exposed.** Writing it as a session found things the specification did not.

### It works

**The spine holds.** Home → phone → street → premises → choice → consequence → home. Every beat is a system already specified, and none of them needed a menu.

**The drop is not an advert.** Because the qualifying mission existed for its own reasons and the drop *noticed* it, the commercial moment lands as recognition rather than a task list. That was the biggest product risk and this is the shape that survives it.

**The teller is the best thing in it** — and she is four words. Vol 3's self-audit, delivered by someone with access to your account, costs almost nothing to build.

**Nothing happening at the barber is load-bearing.** A world where every door is a mission is a menu with walls.

### The four gaps

| # | Gap | Why it matters |
|---|---|---|
| **1** | **Nothing in this session earns TC.** The player spends and withdraws; the only rewards are an unlock and an entitlement. **A 25-minute session with no income is not sustainable** — but per §8 money is not progression, so where does spending money come from? Jobs? Chapters only? **Unspecified** |
| **2** | **The `40 left` counter is invisible to the player until the grant.** If two players race for the last claim, the loser is told after the fact. Scarcity is fine; **surprise scarcity is a bad feeling** and needs a design answer |
| **3** | **Nothing here uses Craft, Street or Steadiness.** Only Trust does work. Three of five Standing dimensions are specified and unexercised — either the slice needs a beat that uses them, or the slice needs fewer dimensions |
| **4** | **The player has no way to see why the hoodie unlocked.** They are told they qualified, not what qualified them. **A consequence you cannot trace is indistinguishable from a random reward** — and traceability is the whole point of the case file |

### One thing this session deliberately does not do

**It never tells the player they did the right thing.** No score, no morality prompt, no "+10 Trust". The teller notices, Ade shrugs, the phone states a fact. Vol 3's *"accountability before anyone else needs to"* only works if the game is not the one keeping score out loud.

---

## What this session proves about the slice

If it can be played end to end as written, the slice has demonstrated: a real city walked on foot · a phone that informs and does not act · a drop as narrative · a mission that is a promise rather than a chore · banking as a place · a real premises with a real booking · digital and physical as visibly different things · a funded real-world benefit · and a world that remembered what you did.

**That is the product, in twenty-five minutes, with one street.**
