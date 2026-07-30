# Build Progress

**Runs alongside:** [Team_Brief_The_Real_Build.md](Team_Brief_The_Real_Build.md)
**Last updated:** 27 July 2026

Tick things off here as they land. Every item traces back to a section of the team brief so nothing drifts from the Bible.

**Key:** ✅ done and verified · 🔨 in progress · ⬜ not started · 🚧 blocked

---

## Session 1 — 27 July 2026

Everything below is **done, built and verified running in a real browser**. The game boots, you walk the block, enter a chapter, and come back out. Zero console errors across three full runs.

### The case file flip — the brief's central idea

| # | Change | Status | Where |
|---|---|---|---|
| 1.1 | The eight board cards now read as **your own file**, not a police file | ✅ | `src/game.js` (boardTex) |
| 1.2 | Board panel retitled **"Your Case File"** (was "The Drawing Board") | ✅ | `index.html` |
| 1.3 | Board footer now reads "Clear the board. Find the archive. Get out." | ✅ | `index.html` |
| 1.4 | Locked-door line rewritten to the brief's wording | ✅ | `src/game.js` |

The cards went from `LAST ARREST · SUBJECT · THE PLUG · WAREHOUSE · CASE FILE · THE STASH · DROP 03/12 · LOCATION?` to `SUBJECT: YOU · WHAT'S TRAPPING ME · WHO I BLAME · WHAT I CONTROL · FIRST MOVE · THE WAY OUT · EVIDENCE · CLEARED?`

> One wording note: the brief said `WHAT I ACTUALLY CONTROL`. Shortened to `WHAT I CONTROL` because the longer version overflows the card at the board's text size. Same meaning, fits the art.

### The names

| # | Change | Status |
|---|---|---|
| 2.1 | `THE COOK UP` → **`THE KITCHEN`** | ✅ |
| 2.2 | `THE FRONT` → **`THE SHOP FLOOR`**, subtitle → "Standards are the difference." | ✅ |
| 2.3 | "the stash" → **"the archive"** everywhere the player can see it | ✅ |
| 2.4 | The other four chapter names left exactly as they were | ✅ |
| 2.5 | "LEVEL" → **"CHAPTER"** across the whole UI (Bible Vol 6: collections are chapters) | ✅ |

**Important for the devs:** the mission id is still `stash` in the data. That is deliberate and commented in the code. It is the server-side dedupe key (`playerId:levelId:missionId`) and it is written into every existing player's saved progress — renaming it would orphan every reward already claimed. Only the words the player reads changed.

### The moral lines

| # | Change | Status |
|---|---|---|
| 3.1 | The six `moralFocus` lines now actually **render** — at the top of the case file and on the chapter intro card | ✅ |
| 3.2 | Chapter 02's line changed to **"Strategy: every trap needs an exit plan"** (Bible Vol 2, word for word) | ✅ |

They had been loading into the runtime and never being drawn since the build was written.

### Chapter 01 copy, per the brief

| # | Change | Status |
|---|---|---|
| 4.1 | Objectives rewritten to the brief's wording | ✅ |
| 4.2 | Archive-found text rewritten ("Somebody sat in this room and wrote down what was holding them…") | ✅ |
| 4.3 | Mission titles: "Case the spot" → "Get your bearings", "First flip" → "First move" | ✅ |

### The block — free roam is in the real game

The standalone spike is now the hub the whole game sits on.

| # | Change | Status | Where |
|---|---|---|---|
| 5.1 | Walkable outdoor block: streets, seven buildings, street lamps, enclosing skyline | ✅ | `src/world/freeRoamWorld.js` (new) |
| 5.2 | **Real collision** — you can no longer walk through buildings | ✅ | same |
| 5.3 | **Sprint** (Shift) outdoors; chapters keep the original slow indoor pace | ✅ | `src/game.js` |
| 5.4 | **Minimap / radar** — player-centred, range rings, building footprints, target ring | ✅ | both |
| 5.5 | **Compass** — always shows the nearest place and its distance | ✅ | both |
| 5.6 | **[E] proximity prompt** — walk up to a door, no aiming needed | ✅ | both |
| 5.7 | Lit gold signage above every door, chapter names pulled from the content data | ✅ | world module |
| 5.8 | The bank is now **a building you walk into**, not just a HUD button | ✅ | world module |
| 5.9 | Chapters **unlock in order** — locked ones are greyed, signed, and refuse entry with a toast | ✅ | `src/game.js` |
| 5.10 | Exit door returns you **to the block**, and only the door advances the journey | ✅ | `src/game.js` |
| 5.11 | "Leave" button to back out of a chapter early — does **not** count it as cleared | ✅ | `index.html`, `src/game.js` |
| 5.12 | **The block brightens as you progress** — dusk at chapter one, daylight by the end | ✅ | world module (`MOODS`) |

5.12 is the brief's "world visibly legitimises" arc, now real and driven by chapters cleared.

### Bugs found and fixed along the way

| # | Bug | Status |
|---|---|---|
| 6.1 | `isTouchDevice` undefined at `game.js:2073` — threw inside `startGame()` and killed the opening story message and a progress save | ✅ |
| 6.2 | **Stale content:** the committed dev database served the *old* chapter names and overrode the new ones. Content is now versioned and the server migrates anything older on boot | ✅ |
| 6.3 | Client localStorage cached old content — storage key bumped to v2 | ✅ |
| 6.4 | Room hover tag stayed stuck on screen after leaving a chapter | ✅ |
| 6.5 | Minimap overlapped the Bank/account buttons — moved to the left | ✅ |
| 6.6 | The block was too dark to navigate at chapter one — lighting curve lifted to start at dusk, not night | ✅ |
| 6.7 | Spawn faced the empty end of the block — turned to face the bank and first chapters | ✅ |
| 6.8 | Dead `nextLevel()` removed (superseded by the hub flow) | ✅ |

6.2 is worth flagging to the team: it means **any copy change we make will silently not reach players** unless the content version is bumped. That is now handled, and commented in `src/data/defaultContent.js`.

### How it was verified

Not "it builds" — actually driven end to end in headless Chrome:

- Landing → Enter → guest sign-in → the block loads
- Compass, minimap and objective all populate correctly
- Locked chapter refuses entry with the right message
- Chapter 01 opens, shows the right moral line and the three new mission cards
- Leave returns to the block
- **Zero console errors or uncaught exceptions**, across three full runs
- `npm run build`, `npm run validate:rooms` and `npm run test:api` all pass

---

## Next up — not started

### Chapter 01 finished properly (the brief's first milestone)

| # | Task | Status | Owner |
|---|---|---|---|
| 7.1 | **Name your trap** — the blank card the player writes on, saved to their profile | ⬜ | |
| 7.2 | The same card shown back to them in Chapter 06: "does this still hold you?" | ⬜ | |
| 7.3 | Chapter 01 as real authored 3D art (GLB + HDRI into the existing registry) | ⬜ | |
| 7.4 | Chapters 02–06 written to the Chapter 01 pattern | ⬜ | |

7.1 is the emotional core of the brief and the cheapest big win left. It is a text input, a database column and a callback five chapters later.

### The rest

| # | Task | Status |
|---|---|---|
| 8.1 | Weekly Self Audit — the four Bible questions, with history | ⬜ |
| 8.2 | Trapologist rank, with a test asserting no purchase path can grant it | ⬜ |
| 8.3 | Make the CMS actually drive missions (`type`/`requirement`/`limit` are still decorative) | ⬜ |
| 8.4 | Admin/ops UI over the API that already exists | ⬜ |
| 8.5 | Real payments, addresses, fulfilment | ⬜ |
| 8.6 | Security: credentials and the player database untracked, staff registration closed, `check:repo` + `check:api` in place. **The committed Apple key is still in git history and must be revoked at Apple — deleting the file does not undo the exposure.** | 🚧 |

---

## Open questions for the team

1. **The compass points at locked chapters too.** Right now it names the nearest place whatever its state. Should it only point at places you can actually enter?
2. **The block has no interiors between chapters** — no shops, no NPCs, no props on the street yet. What goes on the block itself is an open design question.
3. **`window.__trapDebug`** is a small test hook in `src/game.js` used by the headless smoke test to move the player. It grants nothing a player couldn't do by walking, but decide whether it gets gated behind a dev flag before launch.
4. **6.8 changed how progression works.** Chapters no longer chain straight into one another; you always come back out to the block. Confirm that is the intent — it is what the free-roam direction implies, but it is a real design change.
