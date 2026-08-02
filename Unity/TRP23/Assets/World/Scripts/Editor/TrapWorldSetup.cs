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
        const string PlayerPrefab = "Assets/StarterAssets/ThirdPersonController/Prefabs/PlayerArmature.prefab";
        // Note there is no follow-camera prefab here. That one is a Cinemachine
        // virtual camera, Cinemachine is not installed, and in first person it
        // would be doing nothing anyway: the camera simply parents to the
        // character's PlayerCameraRoot, which the controller already drives.

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
            // FlyCamera is added below, and only when there is no character to
            // control -- two components writing the camera transform is the
            // jitter bug that takes an afternoon to find.

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

            // Drop the Starter Assets player in, if it has been imported. The
            // free camera stays the fallback: it is what you want for looking
            // at the city, and it does not need a character at all.
            var playerPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(PlayerPrefab);
            GameObject player = null;
            if (playerPrefab != null)
            {
                player = (GameObject)PrefabUtility.InstantiatePrefab(playerPrefab);
                player.name = "Player";

                // The streamed city is built at runtime on the Default layer, so
                // that is what the controller has to treat as ground. Left at
                // Nothing -- which is the prefab's default -- CheckSphere never
                // finds the floor, Grounded stays false, and the player falls
                // through Lincoln for ever while looking perfectly fine.
                var tpc = player.GetComponent<StarterAssets.ThirdPersonController>();
                if (tpc != null)
                {
                    tpc.GroundLayers = 1 << 0;   // Default
                    tpc.FirstPerson = true;
                    tpc.JumpHeight = 0.55f;      // a person, not a pole vaulter
                }

                // Survives the streaming gap at boot. Without it the controller
                // starts falling before the first tile has arrived.
                player.AddComponent<PlayerRig>();

                // Sit the camera in the character's head. The controller moves
                // PlayerCameraRoot to eye height and points it, so the camera
                // needs no logic of its own -- it just has to be there.
                var head = FindChild(player.transform, "PlayerCameraRoot");
                if (head != null)
                {
                    camGo.transform.SetParent(head, false);
                    camGo.transform.localPosition = Vector3.zero;
                    camGo.transform.localRotation = Quaternion.identity;
                }
                else
                {
                    Debug.LogWarning("[TRAP] no PlayerCameraRoot on the player prefab — " +
                                     "the camera will not follow the character.");
                }
            }
            else
            {
                camGo.AddComponent<FlyCamera>();
                Debug.Log("[TRAP] Starter Assets not found — free camera only. " +
                          "Import it and run this again to get a walking player.");
            }

            var worldGo = new GameObject("TrapWorld");
            worldGo.AddComponent<MapClient>();
            var streamer = worldGo.AddComponent<WorldStreamer>();
            // Stream around whoever is actually moving.
            streamer.follow = player != null ? player.transform : camGo.transform;
            streamer.groundMaterial = ground;
            streamer.buildingMaterial = wall;
            streamer.roofMaterial = roof;

            EditorSceneManager.MarkSceneDirty(scene);
            Debug.Log(player != null
                ? "[TRAP] World test scene built, first person. Press Play.\n" +
                  "  mouse   look\n" +
                  "  WASD    walk\n" +
                  "  shift   sprint\n" +
                  "  space   jump\n" +
                  "You start held in place until the tile under you streams in."
                : "[TRAP] World test scene built, free camera. Press Play.\n" +
                  "  right-drag  look\n" +
                  "  WASD        move\n" +
                  "  double-tap space  fly / walk\n" +
                  "  Q / E       down / up (flying only)\n" +
                  "  shift       hurry");
        }

        /// Depth-first search by name, because the prefab nests the camera root
        /// several levels down inside the armature.
        static Transform FindChild(Transform root, string name)
        {
            if (root.name == name) return root;
            for (int i = 0; i < root.childCount; i++)
            {
                var hit = FindChild(root.GetChild(i), name);
                if (hit != null) return hit;
            }
            return null;
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
