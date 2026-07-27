# TRAP — Free Roam (Test Phase 1)

A **standalone** first-person open-world sandbox to explore the "GTA-style, no
violence" direction: walk the block, physically visit the **bank**, and find the
**mission spots** (the chapters as buildings you walk up to and enter).

> ⚠️ Completely separate from the main game/site/backend. It shares **no** code,
> no `package.json`, no server — Three.js is loaded from a CDN. Running or
> changing this cannot affect the live site in any way.

## Run it
It uses ES modules, so it needs to be served over http (not opened as a file).
From **inside this folder**:

```bash
# any static server works — pick one:
python3 -m http.server 8000
#   …or…
npx serve .
```
Then open **http://localhost:8000/** (or the URL the server prints).

## Controls
- **W A S D** — move · **Shift** — sprint · **Mouse** — look
- **E** — enter a building when the prompt shows
- **Esc** — release the cursor / close a panel
- Click **Enter the World** to start (locks the mouse for first-person look)

## What's in Phase 1
- Walkable street block with lamps, fog, moonlight.
- **Trap Central Bank** — enter to buy Trap Coins (mock) and deposit/withdraw.
- Six **mission spots** (The Come Up → The Warehouse) as buildings you can walk
  to and enter (panel placeholder — in the full game these drop you into the room).
- First-person movement with building collision; a compass showing the nearest place.

## Where this is heading
- Bank → **buy Trap Coins with real money** (in-game currency top-up).
- Mission spots → the actual chapter rooms, where **the apparel you buy is a real
  item**.
- More of the world filled in: proper streets, interiors, NPCs/props.

Nothing here is wired to the real backend yet — the economy is local/mock so the
sandbox stays isolated. Say the word when you want it connected.
