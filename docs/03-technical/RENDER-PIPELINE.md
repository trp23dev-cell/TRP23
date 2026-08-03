# Render Pipeline Baseline

This project now uses a project-wide visual pipeline designed to scale from stylized procedural rooms to photoreal content as assets are introduced.

## Global Runtime Controls

- Quality tiers: `low`, `medium`, `high`
- Brightness scale: persisted user setting
- Bloom strength: persisted user setting
- Room light profiles: centralized exposure/intensity tuning per room index
- Automatic device-tier default selection based on memory / CPU / platform class

All settings are wired globally in runtime and affect all rooms.

## Core Modules

- `src/render/qualityProfiles.js`
  - `QUALITY_PROFILES`
  - `DEFAULT_VISUAL_SETTINGS`
  - `ROOM_LIGHT_PROFILES`
- `src/render/assetPipeline.js`
  - GLTF + DRACO + KTX2 + HDR loader scaffold
  - PMREM-ready HDR environment conversion helper
- `src/render/roomAssetRegistry.js`
  - Per-room asset slots for GLB/HDR migration
  - Procedural fallback remains active when slots are empty
- `src/render/roomAssetValidation.js`
  - Registry schema validation for staged migration safety
  - Shared formatter for runtime/CI-readable diagnostics

## Asset Structure

- `src/assets/models/` for `.glb/.gltf`
- `src/assets/textures/` for PBR texture sets (prefer KTX2 when possible)
- `src/assets/hdr/` for environment HDR maps

## Migration Strategy (Project-Wide)

1. Keep current procedural rooms as fallback.
2. Fill `src/render/roomAssetRegistry.js` entries with `modelUrl` and `environmentUrl` incrementally.
3. Standardize each room to PBR materials and authored lighting.
4. Use same quality tiers and post effects for all rooms.

### Stage Gating Rule

- A room asset entry only activates when `enabled: true`.
- This allows shipping config progressively without risking half-wired room swaps.
- Disabled entries continue to use procedural fallback.

## Runtime Behavior

- `loadLevel()` now attempts to apply a room asset layer after building the procedural room.
- If no room assets are assigned, current behavior is unchanged.
- If a room GLB/HDR is assigned later, it plugs into the same runtime without changing gameplay flow.
- Startup preflight logs room registry validation issues before room load attempts.

## Preflight Utility

- Run `npm run validate:rooms` to perform migration preflight checks.
- The utility validates:
  - required field types (`enabled`, booleans, vectors, scene config, material tuning)
  - asset URL extension correctness (`.glb/.gltf`, `.hdr`)
  - enabled-room asset presence requirements
  - local file existence for `/src/...` model/HDR paths
- CI behavior:
  - exits non-zero when errors are found
  - keeps warnings non-blocking for disabled draft entries

## Stage 9 Completion

- Quality gates now run in CI via `.github/workflows/quality-gates.yml`.
- The workflow checks registry validity, build health, API smoke, and Unity handoff export generation.

## Unity Migration Export

- Run `npm run handoff:unity` to generate Unity-ready handoff JSON files.
- Output is written to `exports/unity-handoff/`.

## Room Asset Registry Fields

Each room entry in `src/render/roomAssetRegistry.js` can now define:

- `modelUrl`: path to a `.glb/.gltf`
- `environmentUrl`: path to an HDR environment
- `hideProcedural`: hide generated room meshes when authored room is loaded
- `transform`: position / rotation / scale for imported room root
- `sceneConfig`:
  - `fog: [colorHex, density]`
  - `background: colorHex`
  - `spawn: [x, y, z]`
  - `yaw`, `pitch`
  - `bounds: { insetX, insetZ }`
- `materialTuning`:
  - `envMapIntensity`
  - `roughness`
  - `metalness`
  - `normalScale`
  - `flatShading`

## First Room Template

- `src/render/roomAssetRegistry.js` exports `FIRST_ROOM_MIGRATION_EXAMPLE`.
- Copy this shape into level `0` (or any target level), set real asset paths, then switch `enabled: true`.
- Recommended sequence:
  1. Assign `modelUrl` only and verify geometry scale/transform.
  2. Add `environmentUrl` and tune `materialTuning`.
  3. Enable `hideProcedural` when authored room fully covers current scene.
  4. Apply `sceneConfig` overrides for spawn/bounds/fog only after gameplay interaction checks.

## Performance Notes

- Android-first: use `medium` default for device thermal stability.
- Keep `high` quality for desktop/testing.
- Use KTX2 textures and DRACO meshes to reduce memory and load time.
- Runtime now auto-selects a starting quality tier using device profile heuristics; users can still override it in settings.
