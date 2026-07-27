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
    // fully wired. Run from the Unity menu: TRAP > Build UI (Menu + Game).
    public static class TrapUiSetup
    {
        const string SettingsPath = "Assets/UI/Settings/TrapPanelSettings.asset";
        const string ThemePath    = "Assets/UI/Styles/TrapRuntimeTheme.tss";
        const string MenuUxml     = "Assets/UI/Menu/TrapLanding.uxml";
        const string HudUxml      = "Assets/UI/Menu/GameHud.uxml";
        const string MenuScene    = "Assets/Scenes/TrapMenu.unity";
        const string GameScene    = "Assets/Scenes/TrapGame.unity";

        [MenuItem("TRAP/Build UI (Menu + Game)")]
        public static void Build()
        {
            var panel = EnsurePanelSettings();
            BuildMenuScene(panel);
            BuildGameScene(panel);
            AddScenesToBuild();
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            EditorSceneManager.OpenScene(MenuScene);
            Debug.Log("[TRAP] UI built. Press Play — Menu scene is first in Build Settings.");
        }

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

            var flow = new GameObject("TrapSceneFlow");
            flow.AddComponent<SceneFlow>();

            var ui = new GameObject("TrapMenuUI");
            var doc = ui.AddComponent<UIDocument>();
            doc.panelSettings = panel;
            doc.visualTreeAsset = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(MenuUxml);
            ui.AddComponent<TrapMenuController>();

            EditorSceneManager.SaveScene(scene, MenuScene);
        }

        static void BuildGameScene(PanelSettings panel)
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var camGo = NewCamera("Main Camera", new Color(0.05f, 0.04f, 0.03f));
            camGo.transform.position = new Vector3(0, 2.2f, -4f);
            camGo.transform.rotation = Quaternion.Euler(18f, 0, 0);

            var lightGo = new GameObject("Directional Light");
            var light = lightGo.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.1f;
            lightGo.transform.rotation = Quaternion.Euler(50f, -30f, 0);

            // Placeholder gameplay ground (stands in for the real 3D world).
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "PlaceholderGround";
            ground.transform.localScale = new Vector3(4, 1, 4);

            NewEventSystem();

            var ui = new GameObject("TrapHudUI");
            var doc = ui.AddComponent<UIDocument>();
            doc.panelSettings = panel;
            doc.visualTreeAsset = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(HudUxml);
            ui.AddComponent<TrapHudController>();

            EditorSceneManager.SaveScene(scene, GameScene);
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
