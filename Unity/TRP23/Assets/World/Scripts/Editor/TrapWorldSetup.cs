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
        const string GroundPath = "Assets/World/Materials/TrapGround.mat";
        const string WallPath = "Assets/World/Materials/TrapWall.mat";
        const string RoofPath = "Assets/World/Materials/TrapRoof.mat";

        [MenuItem("TRAP/Build World Test Scene")]
        public static void Build()
        {
            var ground = MakeMaterial(GroundPath, new Color(0.32f, 0.35f, 0.27f), 0.05f);
            var wall = MakeMaterial(WallPath, new Color(0.55f, 0.50f, 0.44f), 0.08f, vertexColour: true);
            var roof = MakeMaterial(RoofPath, new Color(0.20f, 0.21f, 0.23f), 0.10f, vertexColour: true);

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
            streamer.buildingMaterial = wall;
            streamer.roofMaterial = roof;

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
        static Material MakeMaterial(string path, Color colour, float smoothness, bool vertexColour = false)
        {
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null) return existing;

            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            if (shader == null)
            {
                Debug.LogError("[TRAP] no usable shader found — surfaces will render untextured.");
                return null;
            }

            var mat = new Material(shader) { name = Path.GetFileNameWithoutExtension(path) };
            // URP uses _BaseColor. Material.color writes _Color, which URP/Lit
            // does not have, so setting it silently does nothing at all.
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", colour);
            else mat.color = colour;
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", smoothness);

            // Per-building colour is baked into the mesh vertices, so the
            // shader has to be told to read them.
            if (vertexColour) mat.EnableKeyword("_VERTEX_COLOR");

            Directory.CreateDirectory(Path.GetDirectoryName(path));
            AssetDatabase.CreateAsset(mat, path);
            AssetDatabase.SaveAssets();
            return mat;
        }
    }
}
