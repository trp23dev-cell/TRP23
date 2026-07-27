# TRAP MADE IT — Unity UI (UI Toolkit)

A faithful recreation of the web landing/menu + in-game HUD, in UI Toolkit.
It does **not** touch the web frontend or the backend — auth runs on an
in-memory `MockAuthService` with the same rules, behind an `IAuthService`
interface you can later point at the real `/api/players/*`.

## One-time setup (in the Unity Editor)
1. Let the project finish importing (transient GUID warnings on first import are
   normal — do **Assets ▸ Reimport All** if any linger).
2. Run the menu command: **TRAP ▸ Build UI (Menu + Game)**.
   This creates `TrapPanelSettings.asset`, the **TrapMenu** and **TrapGame**
   scenes (fully wired: UIDocument + controllers + EventSystem + camera), and
   adds them to Build Settings (Menu first).
3. Press **Play**. Flow: Home (logo + Enter) → Sign Up / Log In / Guest →
   Loading → **TrapGame** placeholder scene with the HUD (Store / Bank / Account).

## Structure
- `Menu/TrapLanding.uxml` — Home / Auth / 2FA screens
- `Menu/GameHud.uxml` — HUD + Store / Bank / Account panels
- `Styles/*.uss` + `TrapRuntimeTheme.tss` — design system (mirrors `src/styles.css`)
- `Scripts/` — controllers, `SceneFlow`, and `Auth/` (interface + mock service)
- `Scripts/Editor/TrapUiSetup.cs` — the build command
- `Textures/` — logo (transparent, gold-tinted in USS) + landing background
- `Fonts/` — drop the TTFs here to match the web typography (see Fonts/README)

## Later: wire the real backend
Implement `IAuthService` with `UnityWebRequest` calls to the deployed
`/api/players/session|register|login|2fa` and swap it in `SceneFlow.Awake()`.
Nothing else changes.
