using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem.UI;
using UnityEngine.SceneManagement;
using UnityEngine.UIElements;

namespace TrapMadeIt.UI.EditorTools
{
    // One-click assembly of the TRAP UI: PanelSettings + Menu scene + Game scene,
    // fully wired. Run from the Unity menu: TRAP > Build UI (Menu only).
    public static class TrapUiSetup
    {
        const string SettingsPath = "Assets/UI/Settings/TrapPanelSettings.asset";
        const string ThemePath    = "Assets/UI/Styles/TrapRuntimeTheme.tss";
        const string MenuUxml     = "Assets/UI/Menu/TrapLanding.uxml";
        const string HudUxml      = "Assets/UI/Menu/GameHud.uxml";
        const string MenuScene    = "Assets/Scenes/TrapMenu.unity";
        const string GameScene    = "Assets/Scenes/TrapGame.unity";

        /// <summary>
        /// Everything, in the order that works.
        ///
        /// This exists because the order MATTERED and nothing said so. The
        /// world setup writes the game scene; the menu setup writes the menu
        /// and points Play at the game scene. Run only the second and the menu
        /// happily loads whatever the game scene was last time -- which, for a
        /// project that once had a placeholder plane in it, is a flat grey
        /// nothing and no city. That is not a mistake a person should be able
        /// to make from a menu, so here is the one item that does both.
        /// </summary>
        [MenuItem("TRAP/Build Everything (City + Menu)", priority = 0)]
        public static void BuildAll()
        {
            TrapMadeIt.World.EditorTools.TrapWorldSetup.Build();   // writes the game scene
            var panel = EnsurePanelSettings();
            BuildMenuScene(panel);
            AddScenesToBuild();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            EditorSceneManager.OpenScene(MenuScene);
            Debug.Log("[TRAP] City and menu built. Press Play — the menu is first in " +
                      "Build Settings, and ENTER loads Lincoln.");
        }

        [MenuItem("TRAP/Build UI (Menu only)", priority = 20)]
        public static void Build()
        {
            var panel = EnsurePanelSettings();
            BuildMenuScene(panel);
            AddScenesToBuild();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            EditorSceneManager.OpenScene(MenuScene);
            Debug.Log("[TRAP] Menu built. The GAME scene comes from " +
                      "TRAP > Build World Test Scene, which builds Lincoln and the " +
                      "HUD together into the same scene.");
            WarnIfGameSceneHasNoCity();
        }

        /// <summary>
        /// Say so, loudly, if the scene the menu's Play button loads has no city
        /// in it. Silence here means pressing Play and finding an empty world,
        /// with nothing anywhere pointing at why.
        /// </summary>
        static void WarnIfGameSceneHasNoCity()
        {
            var text = System.IO.File.Exists(GameScene) ? System.IO.File.ReadAllText(GameScene) : "";
            if (text.Contains("WorldStreamer")) return;

            Debug.LogWarning($"[TRAP] {GameScene} has no WorldStreamer, so ENTER will load an " +
                             "empty scene. Run TRAP > Build Everything (City + Menu), or " +
                             "TRAP > Build World Test Scene first.");
        }

        /// <summary>
        /// The in-game HUD, added to whatever scene is open.
        ///
        /// This used to be built into a scene of its own with a flat grey plane
        /// standing in for "the 3D world". That placeholder outlived its
        /// purpose the moment the real city arrived, and because both menu
        /// items wrote a scene called the game scene, running one threw away
        /// the other -- build the world, build the UI, and the world was gone.
        ///
        /// One scene owns both now, and this is the piece the world setup calls.
        /// </summary>
        public static void AddHud()
        {
            var panel = EnsurePanelSettings();
            NewEventSystem();

            var ui = new GameObject("TrapHudUI");
            var doc = ui.AddComponent<UIDocument>();
            doc.panelSettings = panel;
            doc.visualTreeAsset = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(HudUxml);
            ui.AddComponent<TrapHudController>();
        }

        /// Where the world setup should save, so the menu's Play button finds it.
        public static string GameScenePath => GameScene;

        static PanelSettings EnsurePanelSettings()
        {
            var panel = AssetDatabase.LoadAssetAtPath<PanelSettings>(SettingsPath);
            if (panel == null)
            {
                panel = ScriptableObject.CreateInstance<PanelSettings>();
                AssetDatabase.CreateAsset(panel, SettingsPath);
            }
            var theme = AssetDatabase.LoadAssetAtPath<ThemeStyleSheet>(ThemePath);
            if (theme != null) panel.themeStyleSheet = theme;
            panel.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            panel.referenceResolution = new Vector2Int(1920, 1080);
            panel.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
            panel.match = 0.5f;
            EditorUtility.SetDirty(panel);
            return panel;
        }

        static void BuildMenuScene(PanelSettings panel)
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            NewCamera("Main Camera", new Color(0.02f, 0.02f, 0.02f));
            NewEventSystem();

            var context = new GameObject("TrapGameContext");
            context.AddComponent<GameContext>();

            var ui = new GameObject("TrapMenuUI");
            var doc = ui.AddComponent<UIDocument>();
            doc.panelSettings = panel;
            doc.visualTreeAsset = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(MenuUxml);
            ui.AddComponent<TrapMenuController>();

            EditorSceneManager.SaveScene(scene, MenuScene);
        }

        static GameObject NewCamera(string name, Color bg)
        {
            var go = new GameObject(name);
            var cam = go.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = bg;
            go.tag = "MainCamera";
            return go;
        }

        static void NewEventSystem()
        {
            var go = new GameObject("EventSystem");
            go.AddComponent<EventSystem>();
            go.AddComponent<InputSystemUIInputModule>();
        }

        static void AddScenesToBuild()
        {
            EditorBuildSettings.scenes = new[]
            {
                new EditorBuildSettingsScene(MenuScene, true),
                new EditorBuildSettingsScene(GameScene, true),
            };
        }
    }
}
