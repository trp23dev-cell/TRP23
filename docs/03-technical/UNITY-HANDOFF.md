# Unity Handoff Readiness

This project can now generate a Unity migration package from active runtime contracts.

## What is exportable today

- Story/content schema (chapters, drops, missions)
- Room migration registry (enabled state, model/HDR paths, transform, scene overrides)
- Render baseline profiles (quality tiers, default settings, per-room light multipliers)

## Generate handoff package

```bash
npm run export:unity
```

Output folder:

- `exports/unity-handoff/unity-content.json`
- `exports/unity-handoff/unity-room-registry.json`
- `exports/unity-handoff/unity-render-profiles.json`
- `exports/unity-handoff/README.md`

## Recommended Unity mapping

1. Create ScriptableObjects from `unity-content.json`.
2. Bind room prefabs/GLBs per `levelIndex` from `unity-room-registry.json`.
3. Map `sceneConfig.spawn` to player spawn transforms.
4. Apply render quality and room light multipliers from `unity-render-profiles.json`.

## Current limits

- Procedural room geometry in `src/game.js` does not auto-convert to Unity scenes.
- Full photoreal parity still requires authored GLB/PBR/HDR assets.
- Interaction logic must be reimplemented in Unity gameplay scripts.

## Practical next step

Keep this repo as source-of-truth for content and room config while Unity implementation catches up. Regenerate the handoff package whenever content or room registry changes.
