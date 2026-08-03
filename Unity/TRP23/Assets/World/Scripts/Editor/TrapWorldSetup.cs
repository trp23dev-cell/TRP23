using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using TrapMadeIt.UI.EditorTools;

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

        [MenuItem("TRAP/Build World Test Scene", priority = 10)]
        public static void Build()
        {
            // White walls and roofs are not a mistake. TRAP/Vertex Colour
            // multiplies by the mesh's own colour, which is where each
            // building's real brick / limestone / render / glass lives, and a
            // tint here would darken all of it by a flat amount.
            var ground = MakeMaterial(GroundPath, new Color(0.32f, 0.35f, 0.27f), 0.05f);
            // Double-sided. A building is a hollow shell and fly mode puts you
            // inside one constantly; single-sided walls mean you look straight
            // out through the city from in there.
            var wall = MakeMaterial(WallPath, Color.white, 0.08f, doubleSided: true);
            var roof = MakeMaterial(RoofPath, Color.white, 0.10f, doubleSided: true);

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            // Far enough to see the Cathedral from the High Street, 771m away.
            // The web client learned this the hard way: at the old 120m the hill
            // was clipped out of existence and read as missing terrain.
            cam.farClipPlane = 2600f;
            cam.nearClipPlane = 0.1f;
            // Fog reaches the far plane long before geometry does, so the edge
            // of the loaded tiles is never a visible line.
            cam.clearFlags = CameraClearFlags.SolidColor;
            // FlyCamera is added below, and only when there is no character to
            // control -- two components writing the camera transform is the
            // jitter bug that takes an afternoon to find.

            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.shadows = LightShadows.Soft;

            // Sky, fog, sun angle and ambient all come from WorldAtmosphere,
            // which carries the web client's mood arc: dusk on the first night,
            // lifting toward daylight as chapters clear. Setting any of it here
            // as well would mean two places deciding the weather.
            var air = new GameObject("Atmosphere").AddComponent<WorldAtmosphere>();
            air.sun = sun;
            air.view = cam;

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
                    tpc.MoveSpeed = 1.4f;        // a walk
                    tpc.SprintSpeed = 4.5f;      // a run, not a sprint-finish
                }

                // Survives the streaming gap at boot. Without it the controller
                // starts falling before the first tile has arrived.
                player.AddComponent<PlayerRig>();

                // Its own layer, so the map camera can leave it out. Looking
                // straight down at yourself otherwise fills the middle of the
                // map with the top of your own head.
                int playerLayer = EnsureLayer("Player");
                if (playerLayer >= 0) SetLayerRecursive(player.transform, playerLayer);

                // Sit the camera in the character's head. The controller moves
                // PlayerCameraRoot to eye height and points it, so the camera
                // needs no logic of its own -- it just has to be there.
                var head = FindChild(player.transform, "PlayerCameraRoot");
                if (head != null)
                {
                    camGo.transform.SetParent(head, false);
                    camGo.transform.localPosition = Vector3.zero;
                    camGo.transform.localRotation = Quaternion.identity;

                    // Scroll pulls the camera back off the shoulder and pushes
                    // it into the head. The controller aims the head; the boom
                    // only decides how far behind it to sit, so the two never
                    // disagree about where the camera is pointing.
                    var boom = camGo.AddComponent<CameraBoom>();
                    boom.playerLayer = "Player";
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

            var map = worldGo.AddComponent<TrapMinimap>();
            map.world = streamer;
            map.player = streamer.follow;

            // The HUD, in the SAME scene as the city.
            //
            // These were two menu items writing two scenes, both of which
            // called themselves the game: building the world then building the
            // UI replaced Lincoln with a grey placeholder plane. One scene has
            // both now, and it is saved where the menu's Play button looks.
            TrapUiSetup.AddHud();

            TuneRenderPipeline();

            EditorSceneManager.MarkSceneDirty(scene);
            EditorSceneManager.SaveScene(scene, TrapUiSetup.GameScenePath);
            Debug.Log($"[TRAP] saved the game scene to {TrapUiSetup.GameScenePath} — " +
                      "this is what the menu's ENTER button loads.");
            Debug.Log(player != null
                ? "[TRAP] World test scene built, first person. Press Play.\n" +
                  "  mouse   look\n" +
                  "  WASD    walk\n" +
                  "  shift   sprint\n" +
                  "  space   jump\n" +
                  "  M       map (click to set a waypoint)\n" +
                  "  [ ]     zoom the minimap\n" +
                  "You start held in place until the tile under you streams in."
                : "[TRAP] World test scene built, free camera. Press Play.\n" +
                  "  right-drag  look\n" +
                  "  WASD        move\n" +
                  "  double-tap space  fly / walk\n" +
                  "  Q / E       down / up (flying only)\n" +
                  "  shift       hurry");
        }

        /// <summary>
        /// Shadows far enough out to matter, and soft enough to look like
        /// weather rather than a stencil.
        ///
        /// URP keeps these on the pipeline asset rather than the light, and the
        /// default 50m shadow distance means the building across the street
        /// casts nothing. In a city that reads as everything floating.
        /// </summary>
        static void TuneRenderPipeline()
        {
            var rp = UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline
                     as UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset;
            if (rp == null)
            {
                Debug.LogWarning("[TRAP] no URP asset found — shadow distance left at its default, " +
                                 "so distant buildings will not cast shadows.");
                return;
            }

            var so = new SerializedObject(rp);
            // By name, because these are not all public properties and the set
            // that is has changed between URP versions.
            Set(so, "m_ShadowDistance", 220f);
            Set(so, "m_Cascade2Split", 0.25f);
            Set(so, "m_SoftShadowsSupported", true);
            Set(so, "m_ShadowCascadeCount", 3);
            so.ApplyModifiedProperties();
            EditorUtility.SetDirty(rp);
        }

        static void Set(SerializedObject so, string path, object value)
        {
            var prop = so.FindProperty(path);
            if (prop == null) return;
            if (value is float f) prop.floatValue = f;
            else if (value is int i) prop.intValue = i;
            else if (value is bool b) prop.boolValue = b;
        }

        /// <summary>
        /// Add a layer to the project if it is not already there, and return its
        /// index. Layers cannot be created with an API call -- they live in
        /// ProjectSettings/TagManager.asset and have to be written into its
        /// serialised form, which is why this looks the way it does.
        /// </summary>
        static int EnsureLayer(string name)
        {
            int existing = LayerMask.NameToLayer(name);
            if (existing >= 0) return existing;

            var asset = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset");
            if (asset == null || asset.Length == 0) return -1;

            var tagManager = new SerializedObject(asset[0]);
            var layers = tagManager.FindProperty("layers");
            if (layers == null) return -1;

            // 0-7 are Unity's own and must not be touched.
            for (int i = 8; i < layers.arraySize; i++)
            {
                var slot = layers.GetArrayElementAtIndex(i);
                if (!string.IsNullOrEmpty(slot.stringValue)) continue;
                slot.stringValue = name;
                tagManager.ApplyModifiedProperties();
                return i;
            }

            Debug.LogWarning($"[TRAP] no free layer slot for '{name}' — the player " +
                             "will show up in the middle of its own map.");
            return -1;
        }

        static void SetLayerRecursive(Transform root, int layer)
        {
            root.gameObject.layer = layer;
            for (int i = 0; i < root.childCount; i++) SetLayerRecursive(root.GetChild(i), layer);
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
        static Material MakeMaterial(string path, Color colour, float smoothness,
                                     bool doubleSided = false)
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
            if (mat.HasProperty("_Cull")) mat.SetFloat("_Cull", doubleSided ? 0f : 2f);

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
