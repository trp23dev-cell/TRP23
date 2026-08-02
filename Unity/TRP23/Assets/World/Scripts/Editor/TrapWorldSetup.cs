using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace TrapMadeIt.World.EditorTools
{
    /// <summary>
    /// Builds a scene that flies over the real Lincoln terrain, in one click.
    ///
    /// Hand-wiring a scene is where a working system goes wrong for reasons
    /// nobody can reproduce — a missing component, a material left unassigned.
    /// This does it the same way every time.
    /// </summary>
    public static class TrapWorldSetup
    {
        const string MaterialPath = "Assets/World/Materials/TrapGround.mat";

        [MenuItem("TRAP/Build World Test Scene")]
        public static void Build()
        {
            var ground = GroundMaterial();

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            // Far enough to see the Cathedral from the High Street, 771m away.
            // The web client learned this the hard way: at the old 120m the hill
            // was clipped out of existence and read as missing terrain.
            cam.farClipPlane = 2600f;
            cam.nearClipPlane = 0.1f;
            camGo.AddComponent<FlyCamera>();

            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.intensity = 1.4f;
            sun.transform.rotation = Quaternion.Euler(45f, -30f, 0f);

            // An empty scene has no ambient light at all, which leaves anything
            // facing away from the sun completely black.
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.45f, 0.50f, 0.60f);
            RenderSettings.ambientEquatorColor = new Color(0.30f, 0.32f, 0.34f);
            RenderSettings.ambientGroundColor = new Color(0.16f, 0.15f, 0.13f);

            var worldGo = new GameObject("TrapWorld");
            worldGo.AddComponent<MapClient>();
            var streamer = worldGo.AddComponent<WorldStreamer>();
            streamer.follow = camGo.transform;
            streamer.groundMaterial = ground;

            EditorSceneManager.MarkSceneDirty(scene);
            Debug.Log("[TRAP] World test scene built. Press Play. " +
                      "Right-drag to look, WASD to move, Q/E down and up, shift to hurry.");
        }

        /// <summary>
        /// A real material asset, not one built in memory.
        ///
        /// A material created with `new Material(...)` inside an editor script
        /// is not saved anywhere, so the reference dies on entering Play mode
        /// and the renderer falls back to Unity's default — which is why the
        /// ground came out flat cyan.
        /// </summary>
        static Material GroundMaterial()
        {
            var existing = AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
            if (existing != null) return existing;

            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null)
            {
                Debug.LogWarning("[TRAP] URP Lit shader not found; falling back to Standard.");
                shader = Shader.Find("Standard");
            }
            if (shader == null)
            {
                Debug.LogError("[TRAP] no usable shader found — the ground will render untextured.");
                return null;
            }

            var mat = new Material(shader) { name = "TrapGround" };
            // URP uses _BaseColor. Material.color writes _Color, which URP/Lit
            // does not have, so it silently does nothing.
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", new Color(0.32f, 0.35f, 0.27f));
            else mat.color = new Color(0.32f, 0.35f, 0.27f);
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 0.05f);

            Directory.CreateDirectory(Path.GetDirectoryName(MaterialPath));
            AssetDatabase.CreateAsset(mat, MaterialPath);
            AssetDatabase.SaveAssets();
            Debug.Log($"[TRAP] created {MaterialPath} using shader '{shader.name}'.");
            return mat;
        }
    }
}
