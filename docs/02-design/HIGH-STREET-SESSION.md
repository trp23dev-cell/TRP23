# A High Street Session

**Twenty-eight minutes, written as a player experiences it. Revision 3.**

**Date:** 9 August 2026 · **Status:** 🟡 **proposed, for owner review. Nothing implemented.**
**Systems:** [WORLD-AND-GAMEPLAY-SPECIFICATION](WORLD-AND-GAMEPLAY-SPECIFICATION.md) · **Decisions:** D-W01–D-W23

> **This is a product test, not a script.** Revision 1 exposed four gaps: no way to earn money, Standing dimensions that did nothing, invisible campaign scarcity, and a reward the player could not trace. Revision 2 answered all four.
>
> **Revision 3 is a minimal correction only.** D-W18 rules out employment, so the flagship activity is reframed from *a paid shift* to *a one-off favour somebody asked you for by name*. Naomi, the quality standard, the overpayment, the Trust consequence, the earning and the entitlement causality are all unchanged. §Validation says honestly where it still falls short.

---

## 0:00 — The flat above the chip shop

You wake where Chapter One started, because it is also where you live. *(D-W13)*

One room over a takeaway at the wrong end of the High Street. The extractor runs until eleven and you can smell it. A kettle, a mattress, a mirror, a wardrobe with four things in it, and a window that looks at a wall.

**It is not aspirational and that is the whole point.** Vol 3 opens with recognising where you actually are. You will be able to leave here eventually. Not today.

On the wall by the door, where you pinned it: **the card, in your handwriting.**

> *"I say yes to things and then don't turn up."*

*(§9 Trap Card — Vol 3 Stage 3, written here in Chapter One and still here afterwards)*

The wardrobe has your four things and, greyed out, a fifth:

```
THE ARCHIVE · hooded top
Not yours yet.
```

**You can see what you have not earned.** That is deliberate — Vol 11 rewards participation with *access*, and access nobody can see is worth nothing. *(§6)*

---

## 0:03 — The phone, which tells you things and does nothing

*(D-W08)*

```
NAOMI            "ade says you're about. drop lands friday and
                 i'm two people short getting it out. worth
                 your while if you fancy an hour"

TRAP MADE IT     Anyone who helps get THE ARCHIVE ready this
                 week gets a funded contribution toward it.
                 61 places left · closes Friday

ADE              "thursday still on?"

CASE FILE        Thursday 4pm — the barber. 2 days.
```

**Read the second line again.** *"61 places left · closes Friday."* You know the campaign is limited **before** you spend an hour on it. That was Revision 1's worst failure — a player finished the work and was then told they had lost a race nobody mentioned. *(§12, campaign availability)*

Wallet says `Wallet: 40 TC · TRP Central Bank: 0 TC`. **You are broke.** That is not a soft-launch balance; it is Chapter One.

---

## 0:06 — Uphill, which you feel

Out and left, up the High Street toward the Stonebow. Overcast — **the server decided that, so it is overcast for everyone** *(D-118)*. Pavements still wet from earlier.

The city is doing things that are not about you: a delivery van half on the kerb, a man wrestling a shutter, two people outside a café not moving out of your way. *(§24 ambient)*

The ground climbs and **you notice it in the walk** — this is the bottom of the hill Lincoln is built on, and the pace change is real, not cosmetic. *(`SlopeCost`, built and tested)*

Phone map shows three markers. You walk. It takes four minutes and that is fine — four minutes of a city you recognise is not dead time.

---

## 0:10 — The flagship, on delivery day

The Trap Made It flagship. Everyone in Lincoln knows this building as the big sportswear shop; **in here it is ours.** *(D-W01, D-W14, §20)*

The window is **THE ARCHIVE** — the collection, lit, three days out. Not a poster. The garments. *(§6)*

Inside is boxes. **Naomi**, who runs the floor, is trying to get a drop into a shop with two people. *(§24 fictional staff — D-W04)*

> *"You came. Right — steamer's out back. Everything on that rail wants doing before Friday, and I'd rather it was done properly than done fast."*

**You were asked, by name, because somebody vouched for you. You could have said no and the session would have gone somewhere else.** *(D-W18 — an opportunity, not a shift)*

### The work — this is the earn loop *(§ economy · D-W18, D-W22)*

You steam and hang the drop. It is a real activity with a real dial: **fast, or properly.**

- **Fast** — more garments through, a rail that looks fine from three feet
- **Properly** — fewer done, seams straight, hang lines right

**Naomi can tell the difference, and she looks.** *(Craft — §8)*

You do it properly. You get through fewer than you might have. She runs a hand down a sleeve on her way past and says nothing, which from her is quite a lot.

> **Why this is not a chore, and not a job.** A chore has one correct execution — you did it or you did not. This has a **standard**, and the standard is the brand's (Vol 9: *"every product must communicate purpose before appearance"*). Doing it properly costs throughput and buys something you cannot see yet.
>
> **And it is a one-off.** There is no rota, no rate, no clocking in, and no way to come back tomorrow and do it again for more money. Naomi needed help this week because a drop lands Friday. **Next week she will not.** *(D-W18)*

### The thing you notice

Halfway through, the count is wrong. The rail is short of the manifest taped to the box — **two hooded tops that are on the paperwork and not in the room.** *(Street — §8)*

Nothing highlights it. There is no glowing outline. You either read the manifest or you did not.

You tell Naomi. She swears mildly, checks the back, finds them in a second box that was mislabelled, and says: *"Good spot."*

> **What just happened mechanically:** noticing exercised **Street**. Saying so exercised **Trust**. **Neither produced a number and neither was announced.** The consequence is that Naomi now knows something about you.

### Paid

`+180 TC`. She counts it out.

> *"Said an hour. You've been here two."*
> *"...it was an hour and a half."*
> *"Call it two."*

**She has decided to round up.** *(Trust, offered rather than tested)*

You can take it or you can say something. There is no `[HONEST]` / `[GREEDY]` prompt — just a woman holding notes and a pause that is slightly too long.

*If you correct her:* she shrugs, pays you for the hour and a half, and **remembers.** *If you don't:* nothing happens, today.

> **This is the honesty beat and it is deliberately small.** Vol 3 Stage 5 asks *"did I do what I promised myself?"* — a question you answer when nobody is checking. Forty coins is exactly the right size for it: enough to notice, not enough to be a moral crisis.

---

## 0:19 — The drop you still cannot buy

On the way out you stop at the rail you just hung.

You can try it on — your character wears it, in your archetype's fit, in the mirror. **You cannot buy it.** *(§6 `MISSION_UNLOCK`)*

```
THE ARCHIVE · Friday
Open to anyone who helped get it ready.
You did.
```

**You qualified an hour ago and you did not know that was what you were doing.** The work was the work. The unlock noticed it.

> This is the moment the whole design lives or dies. Revision 1 got it right and it survives unchanged: **the mission was not invented for the drop — the drop noticed the mission.**

---

## 0:21 — The bank, and the first real decision

`Wallet: 220 TC`. In your pocket, in a game where you have never had 220 TC.

**There is no banking button.** *(D-W10)* TRP Central Bank, Mint Street — the building the city knows as the NatWest. *(§21)* Marble, quiet, too big for what it does.

The teller. You have been in twice this week already, both times taking money out.

**The decision:** *(§ spend/save)*

| | |
|---|---|
| **Keep it** | Thursday's appointment costs 45. THE ARCHIVE digital is 900 — you cannot afford it either way |
| **Bank it** | It is out of reach, which is the point, and the bank starts noticing a pattern that is not withdrawals |

You put 150 in and keep 70.

She looks at the screen — the same screen that has watched you empty it twice — and says:

> *"First time this month that's gone the other way."*

**No penalty. No prompt. No number.** *(§8 — never a number)* She just says the true thing, which is what the bank is for. *(§21 — the bank as the game's mirror, not an ATM with a face)*

> **Why the money mattered.** It was not a score going up. It was 220 coins and three things that wanted them, and you had to pick. *(D-W16 — money is choices, not progression)*

---

## 0:25 — Thursday is still Thursday

Corporation Street on the way home. The barber's is open — the shop OSM still thinks is called Mankind. *(§17, D-W14)*

You are not booked until Thursday. **You go in anyway**, and a barber you have met twice confirms Thursday still stands and tells you to come earlier if it rains.

Nothing happened. **A world where every door is a mission is a menu with walls.** *(§14)*

---

## 0:27 — What you actually earned

Home. Phone, once, without ceremony:

```
DROP 01 · COMMUNITY REWARD

You helped Naomi get THE ARCHIVE ready before Friday.
That's what qualified you.

£10 toward THE ARCHIVE hooded top — physical.
Funded by Trap Made It. 60 places left.
Expires 30 days after the drop closes.

It is not Trap Coins and it cannot be cashed.
It comes off the price of that garment, on the website.
```

*(§11 Reward Entitlement · §12 funded campaign · D-W11, D-W15)*

**Four things that message does deliberately:** it says *what happened*, *why you qualified*, *what it is worth and on what*, and *that it is not money*. **Nothing is auto-redeemed.** *(§causality)*

> Revision 1 failed here. The player was told they had qualified and not what for. **A consequence you cannot trace is indistinguishable from a random reward**, and the case file exists to make consequences traceable.

---

## End state — what changed

| | Before | After |
|---|---|---|
| Wallet | 40 TC | **70 TC** |
| TRP Central Bank | 0 TC | **150 TC** |
| Digital entitlement | — | **THE ARCHIVE unlocked** — buyable Friday, 900 TC. *You cannot afford it yet* |
| Reward Entitlement | — | **£10 toward the physical**, funded, 30-day expiry, not cashable |
| Trust | — | Naomi knows you flag things. *And knows whether you corrected her about the money* |
| Craft | — | The rail is right, and she looked |
| Street | — | You read the manifest when nothing asked you to |
| Contacts | Ade | **+ Naomi** |
| Commitment | Thursday 4pm | **Still open.** Two days |
| Chapter | 01 | 01 — *unchanged, and that is fine* |

**You are still broke, still in the flat, still owe Thursday.** But you have 150 saved for the first time, somebody on the High Street knows your name, and there is a hooded top on Friday you can afford about a fifth of.

---

# Validation

## Is there agency?

**Yes — four decisions, none of them a dialogue wheel.**

Work fast or properly · read the manifest or don't · correct the overpayment or don't · bank it or keep it. **None is labelled right or wrong**, and three of them cost something either way.

**Weakest:** the manifest is closest to a hidden collectible. It survives because you can miss it entirely and the session still works, and because it pays in reputation rather than loot.

## Is there an earn loop?

**Yes. `+180 TC` for four hours of prep work at the flagship**, paid by a person, for a reason that makes sense in the world.

It earns its place because **payment is narratively obvious** (a shop is short-staffed in drop week) and because it is **not repeatable on demand** — it is drop week, not a job board. It does not turn TRP23 into a job simulator because there is no job to grind; there is a shop that needed help this week.

**Weakness: it works once.** See §Weaknesses 1.

## Is there a spend/save decision?

**Yes, and it is real because the player is poor.** 220 coins, three claims on it, and one of them (the 900 TC digital top) is out of reach either way — which is what makes banking the surplus a *choice* rather than obviously correct.

**Weakness: only clothing and the haircut want the money.** A currency with one real sink is a score with extra steps. See §Weaknesses 3, and spec Q7.

## Did Standing matter?

**Three of five, all through behaviour rather than award.**

| | Where |
|---|---|
| **Craft** | Doing the rail properly when fast would have passed |
| **Street** | Reading the manifest with nothing prompting it |
| **Trust** | Flagging the short count · the overpayment · Thursday still open |

**Standing** and **Steadiness** are untouched, correctly — Standing needs public visibility this session does not have, and Steadiness is measured across weeks and cannot be shown in twenty-eight minutes. **Forcing all five would have been artificial**, which is what the brief warned against.

**No dimension produced a number, a popup or a sound.** The consequence is that Naomi has an opinion.

## Did Lincoln matter?

**Yes.** The walk up the High Street has a gradient you feel, the flagship is a building people know, the bank is at Mint Street because that is where it is, and the barber is on Corporation Street. **The session could not happen in a menu, and could not happen in a generic city** — the specific geography is doing work.

**Weakest:** the 0:06 walk is four minutes of nothing happening. Justified now by ambient life and the hill; **it would not survive a second identical walk in the same session.**

## Did the physical world matter?

**Every meaningful action required being somewhere.** The work is at the flagship, the money moves at the bank, the appointment is at the shop. The phone told you three things and did none of them. *(D-W08, D-W10)*

## Did Trap Made It matter?

**Yes — the brand is the gameplay, not an advert in it.** The paid work *is* preparing the collection; the quality standard *is* the brand's standard (Vol 9); the drop in the window is the reason the shop is busy. The player earns money from the brand, earns access to the brand, and earns a funded contribution toward the brand's physical product — **without being sold to once.**

## Did the real-world connection matter?

**Yes, and it stays in proportion.** One message at the end, £10, clearly labelled as not-money, nothing auto-redeemed. It is a consequence of the session rather than the point of it — **you could ignore it entirely and the session still worked.**

## Was causality understandable?

**Yes, now.** Every consequence traces: paid because you worked · unlocked because you worked a drop-week shift · entitled because of the same, stated in the message · Naomi's opinion because of what you did in front of her.

**One gap:** if you *did not* correct the overpayment, nothing tells you that mattered. That is intentional — the game does not keep score out loud — but it means **an invisible consequence is indistinguishable from no consequence** until it surfaces later. See §Weaknesses 4.

## Was it fun?

**Honest assessment: it is quietly good, and it is not yet exciting.**

**What works.** The overpayment pause is the best thing in it — a moment of genuine discomfort with no interface. The teller's *"first time this month that's gone the other way"* does more with eight words than a progression bar. Steaming garments to a standard is unexpectedly satisfying because the standard is real and someone checks. And **the drop noticing work you did for other reasons** is the design's central trick, and it lands.

**What does not.** There is **no jeopardy anywhere in these twenty-eight minutes.** Nothing can go wrong, nobody wants anything from you that costs you, and the worst outcome available is being slightly less liked. That is fine for a session-one slice and it will not carry a game.

**Nothing here is a tutorial, an advert, or a menu in a room.** The four minutes of walking is the only stretch approaching filler.

---

## Remaining weaknesses

| # | Weakness | Why it is not fixed here |
|---|---|---|
| **1** | **The earn loop works once — by design now.** D-W18 rules out employment, so this is correct rather than a gap. **The open question is what an ordinary Tuesday offers instead** — missions with narrative payment, discoveries, events, drop activity. Several such opportunities must exist or the economy has one door | **Reframed by D-W18.** No longer "add a job"; now "author enough opportunities" |
| **2** | **No jeopardy.** Nothing can go badly wrong | Session-one slice. Per **D-W21** the answer is *not* inserted danger — the available stakes are the Thursday commitment, the finite 61 places, and the 900 TC you cannot afford. **Those exist and are simply not pressed hard enough yet** |
| **3** | **One meaningful money sink.** Clothing, plus a 45 TC haircut | **D-W19** settles the direction — appearance services, food where it supports an activity, transport, home improvements, social activities. **None exist yet**, and "spending should create experience rather than change a number" is the bar |
| **4** | **Silent consequences are invisible.** Not correcting the overpayment does something, and the player cannot tell | Deliberate — the game must not keep score out loud — but it needs to *surface* eventually, probably via the case file |
| **5** | **Standing and Steadiness untested** in any session yet written | Both need multi-session content. A twenty-eight-minute test cannot exercise a dimension defined by weeks |
| **6** | **Naomi is the only real character.** One relationship carrying the whole session | Acceptable for a slice; thin for a district |
| **7** | **Chapter progress did not move.** The session is entirely live-world | Arguably correct — chapters should not advance every session — but it means the slice does not demonstrate chapter progression at all |
