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

### H-12 · Confirm the assembly definitions in Unity
**Who:** Richard · **Time:** 10 min · **Blocks:** WP-U02 · **Needs:** Unity 6000.3.8f1

WP-U01 added three `.asmdef` files and moved five files. Every boundary is proven by CI — including three deliberate violations that correctly failed to compile — but **the editor has not opened the project since**, and there is no Unity licence in the AI's environment.

Five things only the editor can confirm:

1. Open `Unity/TRP23`. **Console clean?** Any red error, paste it and stop.
2. `Window → Analysis → Assembly Definitions` (or check the Project panel) — **TRP23.Core, TRP23.World and TRP23.UI** all present.
3. **TRAP menu** still has *Build World Test Scene* and *Build UI* — this proves the moved editor scripts still compile and still see StarterAssets.
4. `Assets/Scenes/TrapMenu.unity` → **Play** → ENTER → continue as guest → Lincoln loads → **C** opens the case file. This proves no scene GUID broke.
5. Note whether **script compilation feels faster** after the first import — the point of the exercise.

**Worked if:** no console errors, three assemblies listed, TRAP menu intact, the game plays as it did this morning.
**Tell me if:** any assembly fails to resolve `UnityEngine.UI` or `Unity.InputSystem`, or a scene reference broke.

### H-13 · Walk the owned player
**Who:** Richard · **Time:** 15 min · **Blocks:** WP-U03 · **Needs:** Unity 6000.3.8f1

WP-U02 replaced the Starter Assets player with `TrapPlayerController`. Everything compiles in CI, but **CI cannot run Unity and cannot compile `TrapWorldSetup.cs`** (UnityEditor is not stubbed), so the setup tool is unverified by machine.

1. Open `Unity/TRP23`. **Console clean?** Any red error, paste it and stop.
2. Open `Assets/Scenes/TrapGame.unity` → **TRAP → Build World Test Scene**. It should rebuild the scene with a **Player** capsule, not a fly camera.
3. Press **Play**. You should stand on Lincoln, not fall through it.
4. **WASD** walks · **mouse** looks · **Shift** sprints · **Space** jumps.
5. Walk up **Steep Hill** — you should visibly slow. Walk down — slightly quicker.
6. Press **M** for the big map, then **C** for the case file: **the player must not move or turn** while either is open.
7. Close them — control returns.
8. Plug in a **gamepad** if you have one: left stick moves, right stick looks, no code change needed.
9. Walk 300m and confirm **tiles keep streaming** and the **minimap follows**.

**Worked if:** you walk Lincoln, the hill costs you, panels freeze you, and the console is clean.
**Tell me if:** you fall through the ground (ground layer), the camera fights you (two things writing the transform), or look feels wrong on mouse vs stick — mouse and stick are scaled differently on purpose and the constants may need taste.

### H-13a · Re-test the freeze after the repair *(superseded by H-13b)*
**Who:** Richard · **Time:** 3 min · **Blocks:** WP-U02 acceptance

The map never told `PointerFocus` it was open, so the player kept looking around while the world was paused. Repaired — re-test just the freeze:

1. Play, look around normally.
2. Press **M**. Move the mouse **a lot**. **The camera must not rotate.**
3. Try **WASD**, **Space**, **Shift** — nothing should respond.
4. Click on the map to set a waypoint — that **should** still work.
5. Press **M** again. The camera is where you left it, and control returns at once.
6. Repeat with **C**. Same result.
7. Open **M**, then **C**, then close **C** — you should **still** be frozen, because the map is still open.

**Worked if:** step 2 shows no rotation whatsoever, and step 7 stays frozen.

### H-13b · Re-test the freeze — second repair ✅ *verified 9 Aug*
**Who:** Richard · **Time:** 4 min · **Blocks:** WP-U02 acceptance

**Before anything else: `git pull`.** The first repair landed at the very end of the previous session, so it is worth ruling out that the screencast was of the pre-repair build. Then in Unity let it recompile, and **re-run `TRAP → Build World Test Scene`** so the scene picks up the current player.

1. Play. Look around normally.
2. Press **M**. Move the mouse **hard**, in circles. **The view behind the map must not move at all.**
3. **WASD**, **Space**, **Shift** — nothing.
4. Click the map to set a waypoint — that **should** still work.
5. Press **M**. The camera is exactly where you left it, no snap, and control returns.
6. Repeat with **C**.
7. **M**, then **C**, then close **C** — still frozen, because the map is still open.
8. Reverse: **C**, then **M**, close **M** — still frozen, because the case file is still open.

**Worked if:** step 2 shows zero movement and step 5 shows no camera jump.

**If it still rotates,** the console will now tell us why — paste the output of this in the Console while the map is open:

```
Debug.Log($"blocked={TrapMadeIt.GameplayInput.Blocked} " +
          $"holders={TrapMadeIt.PointerFocus.Wanted}");
```

and say whether the camera's parent is `PlayerCameraRoot`. Those two facts distinguish "the gate is not firing" from "something else is writing the transform", and I could not tell them apart from here.

### H-14 · Verify the composition root
**Who:** Richard · **Time:** 10 min · **Blocks:** WP-U03 acceptance · **Needs:** Unity 6000.3.8f1

WP-U03 replaced `SceneFlow` with `GameContext`. Everything compiles and all eight gates pass, but **no Unity licence exists in the AI's environment** — nothing was run.

1. `git pull`, open `Unity/TRP23`, let it recompile. **Console clean?** Any red error, paste it and stop.
2. **`Window → General → Test Runner` → EditMode.** `TRP23.Core.Tests` should list five tests. **Run them — all five should pass.** *(First test assembly in the project.)*
3. Open `Assets/Scenes/TrapMenu.unity`. The `TrapGameContext` object should have a **GameContext** component — **not a missing script** — with `apiBase` still set to the Railway URL and `useMockAuth` off.
4. **Play from TrapMenu** → ENTER → continue as guest → Lincoln loads → **C** opens the case file and saves. *(This is the path that was broken on 4 August.)*
5. **Play from TrapGame directly.** Press **C**. **The case file must still work** — this is the whole point of the package: the graph no longer depends on which scene you entered.
6. Open the **🏦 BANK** panel in both cases. Balance should load, not error.
7. Optional: **`TRAP → Build Bootstrap Scene`**, then add `Assets/Scenes/Bootstrap.unity` as the **first** scene in Build Settings and play from it. It should compose and drop you at the menu.

**Worked if:** five tests pass, no missing scripts, and **step 5 behaves identically to step 4**.
**Tell me if:** the case file or bank fails from one entry point but not the other — that would mean composition is still order-dependent and I have not actually fixed it.

### H-15 · The character trial — decisions, then Unity *(superseded by H-16)*
**Who:** Richard (+ Kimani on the look) · **Time:** 20 min decisions, ~1 hr Unity · **Blocks:** WP-U17b

WP-U17a is a **preflight, not an import.** UMA was researched and verified but **not added to the project** — there is no Unity licence in the AI's environment, so it could not be compiled, run or measured, and importing a large framework blind is the one act here that is hard to undo.

Full findings: [CHARACTER-VISUAL-PIPELINE](../03-technical/CHARACTER-VISUAL-PIPELINE.md).

**First, five decisions** — §11 of that document. The two that matter most:

- **Vendor UMA into `Assets/`** (recommended) rather than a `.unitypackage`. It is not a UPM package, so it cannot be pinned in the manifest, and vendoring is the only route where a fresh clone builds the same game. A `.unitypackage` repeats exactly the Starter Assets problem WP-U02 removed.
- **Animation source.** Must permit **commercial and console redistribution** — checked *before* import. Mixamo is the obvious candidate and its terms have moved over the years.

**Then, in Unity** (only after deciding):

1. Open the project. **Console clean?**
2. `Window → General → Test Runner` → EditMode → **11 tests** in `TRP23.Core.Tests` (5 gate + 6 scale). All should pass.
3. **`TRAP → Build World Test Scene`**, press Play. The body is now a `CharacterVisual` component rather than a loose capsule — **movement, sprint, jump, slope, M and C must all behave exactly as before.** This package changed how the body is attached, not how the player moves.
4. Import UMA per the chosen route, then add `UmaCharacterVisual.cs` to `World/Scripts/CharacterVisual/` **and nowhere else** — `npm run check:repo` fails if UMA appears outside that folder.
5. Set `TrapPlayerController.characterVisual` to the UMA component and press Play.
6. **Measure**: avatar generation time, triangles, bones, materials, draw calls — on a **mid-range Android**, not a desktop. §10 lists the set.

**Worked if:** step 3 is indistinguishable from today, and step 5 puts a human-shaped person in Lincoln at believable scale against a doorway.

**Stop and tell me if:** avatar generation causes a visible hitch on the Android. That is the number that decides whether UMA is viable for this project at all, and no amount of good looks compensates for it.

### H-16 · Decide the character route
**Who:** Richard + Kimani · **Time:** 20 min · **Blocks:** U17b, U16a, U12 (archetypes)

**WP-U17b stopped at import and imported nothing.** Evidence in [CHARACTER-VISUAL-PIPELINE §12](../03-technical/CHARACTER-VISUAL-PIPELINE.md).

The short version: UMA v3.03 is **over 1.3 GB and would not finish downloading**. The C# framework is **12 MB of ~1,616 MB — 0.75%**. The rest is 945 MB of PNG, a demo car, and a stock-library MP3. There are **two licence files in 7,522 entries**, one of them a nested third-party tool — so the tree is provably not under one licence, and nothing states where the art came from. A framework-only import produces no character; making one needs exactly the assets with undocumented provenance.

**And the thing that actually decides it: D-111 already ruled out what UMA is for.** UMA exists for runtime procedural bodies from DNA. You chose fixed archetypes so each garment is authored a known number of times. **Adopting UMA means 1.6 GB and an unresolved licensing question to get a feature we decided not to use.**

**The choice:**

| | |
|---|---|
| **A · Author our own archetypes** *(recommended)* | 4–6 Blender bodies at 1.80 m, one Humanoid skeleton, garments per archetype. Ours outright, megabytes not gigabytes, console-safe, no runtime generation cost. **Costs real art time** |
| **B · Manual UMA import per machine** | Fast to try. **Repeats exactly the Starter Assets failure WP-U02 removed** — not reproducible from a clone |
| **C · UMA as a git submodule** | Pinnable. **1.6 GB checkout on every clone and every CI run** |
| **D · Something else** | Worth a look if you know a licensed archetype pack. Must permit **console redistribution** |

**If A:** the next question is who authors the bodies, and that is a commission, not a coding task.

**One caveat I want on the record:** procedural variety genuinely matters for **crowds**, not for the player. Hand-authoring a convincing crowd is expensive. That trade belongs to U16a with its own evidence — do not let it decide the player character today.
