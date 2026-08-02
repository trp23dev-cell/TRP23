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
        const string VertexShaderPath = "Assets/World/Shaders/TrapVertexColour.shader";

        [MenuItem("TRAP/Build World Test Scene")]
        public static void Build()
        {
            // White walls and roofs are not a mistake. TRAP/Vertex Colour
            // multiplies by the mesh's own colour, which is where each
            // building's real brick / limestone / render / glass lives, and a
            // tint here would darken all of it by a flat amount.
            var ground = MakeMaterial(GroundPath, new Color(0.32f, 0.35f, 0.27f), 0.05f);
            var wall = MakeMaterial(WallPath, Color.white, 0.08f);
            var roof = MakeMaterial(RoofPath, Color.white, 0.10f);

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
            Debug.Log("[TRAP] World test scene built. Press Play.\n" +
                      "  right-drag  look\n" +
                      "  WASD        move\n" +
                      "  double-tap space  fly / walk\n" +
                      "  Q / E       down / up (flying only)\n" +
                      "  shift       hurry");
        }

        /// <summary>
        /// A real material asset, not one built in memory.
        ///
        /// A material created with `new Material(...)` inside an editor script
        /// is not saved anywhere, so the reference dies on entering Play mode
        /// and the renderer falls back to Unity's default — which is why the
        /// ground came out flat cyan.
        /// </summary>
        static Material MakeMaterial(string path, Color colour, float smoothness)
        {
            EnsureFolder(Path.GetDirectoryName(path));

            // Load the vertex-colour shader as an ASSET. Shader.Find works in
            // the editor and then returns null in a player build, which is the
            // magenta; loading by path puts a hard reference in the material,
            // and a referenced shader gets built in.
            var shader = AssetDatabase.LoadAssetAtPath<Shader>(VertexShaderPath);
            if (shader == null)
            {
                Debug.LogWarning($"[TRAP] {VertexShaderPath} missing — falling back to URP/Lit. " +
                                 "Buildings will all be one colour.");
                shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            }
            if (shader == null)
            {
                Debug.LogError("[TRAP] no usable shader found — surfaces will render untextured.");
                return null;
            }

            // Repair rather than reuse. An existing asset may be one of the
            // broken ones from an earlier run, and silently handing it back is
            // how a fix fails to take effect.
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null)
            {
                mat = new Material(shader) { name = Path.GetFileNameWithoutExtension(path) };
                AssetDatabase.CreateAsset(mat, path);
            }
            else
            {
                mat.shader = shader;
            }

            // URP uses _BaseColor. Material.color writes _Color, which URP/Lit
            // does not have, so setting it silently does nothing at all.
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", colour);
            else mat.color = colour;
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", smoothness);

            EditorUtility.SetDirty(mat);
            AssetDatabase.SaveAssets();

            // Prove it landed. A material that only exists in memory dies on
            // entering Play mode and the renderer falls back to Unity's
            // default — which is the magenta, and it is the SECOND time that
            // has happened, so it is checked now rather than assumed.
            var saved = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (saved == null)
            {
                Debug.LogError($"[TRAP] could not save {path}. Surfaces will render magenta.");
                return mat;
            }
            return saved;
        }

        /// <summary>
        /// Create a folder through the AssetDatabase, not through the file
        /// system. Directory.CreateDirectory makes it on disk, but Unity does
        /// not know it exists until a refresh, and CreateAsset into a folder
        /// Unity has never heard of fails — quietly.
        /// </summary>
        static void EnsureFolder(string folder)
        {
            folder = folder.Replace('\\', '/');
            if (AssetDatabase.IsValidFolder(folder)) return;

            var parts = folder.Split('/');
            var built = parts[0];              // "Assets"
            for (int i = 1; i < parts.Length; i++)
            {
                var next = $"{built}/{parts[i]}";
                if (!AssetDatabase.IsValidFolder(next)) AssetDatabase.CreateFolder(built, parts[i]);
                built = next;
            }
            AssetDatabase.Refresh();
        }
    }
}
