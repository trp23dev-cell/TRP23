# WP-025 · Unity on the website — feasibility first

| | |
|---|---|
| **Horizon** | 1 (spike) → 2 (decision) |
| **Owner** | AI + **HUMAN** |
| **Effort** | S (spike) → L (if pursued) |
| **Status** | ⬜ open |
| **Depends on** | WP-024 |
| **Branch** | `wp/025-webgl-spike` |

## Why

The founder's intent is to **replace the web build on the website with Unity**. That is the right long-term direction — one codebase, one source of truth — but it deserves a spike before it becomes a commitment, because it is not the same as shipping Unity to phones as an app.

**The honest risk, stated up front — and narrowed.** The current web build's superpower is that it is **~550 KB and playable in three seconds from a link**. For a clothing brand, that low-friction shop window is worth a great deal.

**The map is not the problem.** All of Lincoln is 5.8 MB gzipped, which is unremarkable. The weight is the **Unity WebGL runtime and the engine's memory footprint** — tens of megabytes before any content, against a hard ceiling in iOS Safari in particular. Unity 6 has improved this materially (WebGPU, better memory handling), but it has not made mobile web equivalent to native.

So the question is narrower than it first looked: not *"can we deliver the city to a browser"* — plainly yes — but *"does a Unity WebGL page still load fast enough, and survive on an iPhone, to do the job the current page does?"*

So the question is not "can Unity build to the web" — it can. It is: **does the resulting page still do the job the current one does?** If it takes 30 seconds to load and dies on an iPhone, replacing the web build makes the funnel worse, not better.

That is worth an afternoon to find out, and expensive to discover after committing.

## What

A time-boxed spike producing evidence, not opinion:

1. A Unity WebGL build of the existing world scene
2. Measured on real hardware: compressed size, cold start, sustained frame rate, peak memory
3. Tested on **desktop Chrome/Safari/Firefox, iOS Safari, and a mid-range Android browser**
4. A recommendation with numbers attached

## The three outcomes

| Outcome | Meaning | Then |
|---|---|---|
| **Works everywhere** | Acceptable size and start-up; usable on mobile browsers | Plan the replacement. Retire the Three.js build |
| **Desktop only** | Fine on desktop, poor on mobile browsers | **Serve both**: Unity WebGL on desktop, keep the Three.js build for mobile web. One extra build target, and the instant-play funnel survives |
| **Not viable** | Too large or too fragile | Keep Three.js as the web shop window permanently; Unity is the downloadable game. **This is not a failure** — it is the right split, and it is what the audit's §G frozen-shop-window model already assumes |

## Not included

Actually performing the replacement · retiring the Three.js build · SEO or storefront work.

## Acceptance criteria

- [ ] A WebGL build exists and loads
- [ ] Size, cold start, frame rate and peak memory measured on **five** browser/device combinations
- [ ] Compared side by side against the deployed Three.js build on the same devices
- [ ] A recommendation with numbers, and a decision recorded in `DECISION-REGISTER.md`

## Risks

| Risk | Likelihood | If it happens |
|---|---|---|
| iOS Safari cannot hold the build | **medium-high** | Outcome 2 or 3. Precisely why this is a spike |
| Build size destroys the instant-play funnel | medium | Outcome 2 — keep the light build for the link-in-bio path |
| Spike expands into a port | medium | Time-box it. The deliverable is numbers, not a shipped page |

## Done

*Not yet.*
