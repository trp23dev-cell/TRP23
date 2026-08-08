# Human Tasks

**Things the AI cannot do, or must not do, written so you can follow them without knowing the codebase.**

**Updated:** 3 August 2026

Three reasons a task lands here:

- **Cannot** — needs Unity open, a phone in your hand, or eyes on a screen.
- **Must not** — real money, real credentials, real contracts, real people. An AI should never be the one who signs, pays, or accepts liability.
- **Should not** — doctrine. What TRP23 *means* is Kimani's call.

Each task says who, how long, what you need first, and how to know it worked.

---

## 🔴 Do these first

### H-01 · Look at the trap card ✅ *superseded*
**Who:** Richard · **Time:** 10 min · **Blocks:** WP-018 · **Needs:** nothing

**Superseded 4 Aug.** The card was verified in Unity instead, which is the client that matters — the web build is frozen. Do this only if you want to compare them side by side.

1. `npm run dev:full`, open **http://localhost:5173**
2. Enter → continue as guest
3. Walk to the nearest door (compass names it), press **E**
4. Inside, put the crosshair on the wall board and **click** — it should read **YOUR CASE FILE**
5. The card is at the top: *"What's trapping me"*. Type something, click **Put it on the board**
6. Leave by the exit door, walk into Chapter 02, open its board

**Worked if:** the card appears, saves, and in Chapter 02 is **read-only** with *"In your words, Chapter 01."*
**Tell me if:** it is editable in Chapter 02 (serious — breaks the whole mechanic), it looks wrong, or the text overflows.

---

### H-02 · The same card in Unity ✅ *done 4 Aug*
**Who:** Richard · **Time:** 15 min · **Blocks:** WP-018 · **Needs:** Unity 6000.3.8f1

**Done 4 August.** Verified in the editor: 0 errors on import, panel opens, text saves and survives a close/reopen. Four real bugs were found and fixed in the process — see log S8. UIElements is stubbed now, so these files are compile-checked in CI.

1. Open `Unity/TRP23` and let it import
2. **Check the console first.** Any red error, paste it to me and stop
3. Open `Assets/Scenes/TrapGame.unity`, press Play
4. Click **📂 CASE FILE** in the top-right actions
5. Type into the card, click **PUT IT ON THE BOARD**

**Worked if:** no console errors, the panel opens, text saves, and reopening shows it still there.
**Note:** Unity has no chapter flow yet, so it will always behave as Chapter 01. That is expected (WP-010).

---

### H-03 · Answer the blocking decisions
**Who:** Kimani (with Richard) · **Time:** 45 min · **Blocks:** WP-017 and most of Horizon 1

Sit down with [DECISION-REGISTER.md](DECISION-REGISTER.md) and work through **D-01 to D-08**. Each has a recommendation — agreeing with it is a complete answer.

**Most urgent: D-01.** How does Kimani take bookings *today* — paper book, phone notes, Instagram DMs, or something else? Everything about WP-017 changes depending on the answer.

**Worked if:** every decision has an answer and a date in the register.

---

### H-04 · Prove the backups
**Who:** Richard · **Time:** 1 hr · **Blocks:** WP-007

Player accounts live in SQLite on one Railway volume. **We do not know whether anything is backed up, and nobody has ever restored one.**

1. Railway dashboard → the TRP23 service → check whether volume backups are on
2. Turn them on if not
3. Download a backup
4. Restore it locally: `DATA_DIR=/tmp/restore-test PORT=8788 node server/mockApiServer.js`, having put the restored `trapmadeit.db` in `/tmp/restore-test/`
5. `curl http://localhost:8788/api/health` and confirm it reports players

**Worked if:** a downloaded backup boots and contains real rows. Until that has happened, assume there are no backups.

---

## 🟠 Before real money

### H-05 · Stripe account, test mode only
**Who:** Kimani · **Time:** 1 hr · **Blocks:** WP-017 · **Needs:** business details, bank account

The barber deposit is a real payment **to Kimani's business**, not to the game. The account must be in the business's name.

1. Create a Stripe account for the barber business
2. Complete verification (business details, bank account)
3. **Stay in test mode.** Do not activate live payments yet
4. Give Richard the **test** publishable and secret keys — never live keys, never in git, never in a chat message

**Worked if:** test keys exist and a test card completes a payment in the Stripe dashboard.
**Do not:** send me live keys. I will not use them and they should not exist in writing.

### H-06 · Accountant, on VAT
**Who:** Richard · **Time:** 2 hr + their turnaround · **Blocks:** Horizon 2

Ask specifically: (a) VAT on a monthly digital subscription for a shopfront, (b) VAT on physical garment sales, (c) VAT on a booking deposit for a service, (d) whether the registration threshold is near, (e) whether the game taking a deposit on the barber's behalf changes anything.

### H-07 · Legal review before any player sells anything
**Who:** Kimani + Richard · **Blocks:** Horizon 4 · **Do not skip**

Needed before **Tier 3+** tenancy: marketplace liability, consumer rights, product safety, distance selling, deposit forfeiture enforceability, terms for under-18s, and what happens to paid tenancies if the game shuts down.

### H-11 · An email provider
**Who:** Richard · **Time:** 1 hr · **Blocks:** account recovery actually reaching anyone · **Needs:** domain access

Password reset is built and tested, but **there is no email provider**, so on the live deploy a reset link is generated and thrown away. A player would ask for one, be told it was sent, and never receive it.

The server refuses to pretend: unconfigured, it logs the failure loudly and `/api/health` reports `mail: false`. But nothing reaches a player until this is done.

1. Pick a provider — **Postmark** or **Resend** (both have free tiers adequate for this)
2. Verify the sending domain (SPF and DKIM records on DNS)
3. Add to Railway: `MAIL_TRANSPORT`, `MAIL_FROM`, `PUBLIC_BASE_URL`, and the provider's API key
4. Implement the transport branch in `server/mailer.js` — or ask me to, once the account exists
5. Request a reset for your own account and confirm the email arrives

**Worked if:** `/api/health` reports `"mail": true` and a real reset email lands in a real inbox.

**`PUBLIC_BASE_URL` matters more than it looks.** Without it the reset link is built from the `Host` header, which behind a proxy can be spoofed — and a reset email is the worst possible place to send somebody to an attacker's domain.

---

## 🟡 Ongoing

### H-08 · Photograph Lincoln
**Who:** anyone · **Time:** a weekend · **Feeds:** WP-012, WP-015

The cheapest, most legally clean art source you have. **You own these photos outright.** Google Street View is prohibited as an asset source — see [the register §4](../05-operations/REAL-WORLD-INTEGRATION-REGISTER.md).

Shoot: the High Street climb, Steep Hill, the Castle and Cathedral exteriors, **Kimani's shop inside and out**, the NatWest on Mint Street, shopfront details, brick and render textures, pavements and kerbs, street furniture.

**How:** overcast day (no hard shadows), lots of overlap for photogrammetry, straight-on for textures, note where each shot was taken. Photograph **buildings, not people** — a recognisable member of the public in a commercial product is a problem you do not need.

### H-09 · Rotate reused passwords
**Who:** Richard + Kimani · **Time:** 15 min

The old database was committed to a public repo. Founder confirmed team-only accounts, so **no breach** — but your scrypt password hashes are in public history. If either of you used those passwords anywhere else, change them there.

### H-10 · Device testing
**Who:** Richard · **Recurring from WP-021**

An iPhone, a mid-range Android and a PC. **The mid-range Android is the one that matters** — it is where 4km² of Lincoln will hurt first, and it decides the performance budget.

---

## Standing rules

**Never give the AI:** live payment keys · production database credentials · Apple/Google signing keys · customer personal data · anything you would not paste into a public document.

**Always confirm before:** deploying to production · taking a real payment · emailing players · rewriting git history · deleting a system.

**The AI must never:** make a purchase · connect a live payment account · deploy automatically · accept a contract · make an irreversible moderation, financial or safeguarding decision. If it offers, say no — and tell me, because it means these instructions are being ignored.
