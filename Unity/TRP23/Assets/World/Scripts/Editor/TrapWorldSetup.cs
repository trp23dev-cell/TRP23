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
        [MenuItem("TRAP/Build World Test Scene")]
        public static void Build()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            // Far enough to see the Cathedral from the High Street, 771m away.
            // The web client learned this the hard way: at the old 120m the hill
            // was clipped out of existence and looked like missing terrain.
            cam.farClipPlane = 2600f;
            cam.nearClipPlane = 0.1f;
            camGo.AddComponent<FlyCamera>();

            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.intensity = 1.2f;
            sun.transform.rotation = Quaternion.Euler(45f, -30f, 0f);

            var worldGo = new GameObject("TrapWorld");
            worldGo.AddComponent<MapClient>();
            var streamer = worldGo.AddComponent<WorldStreamer>();
            streamer.follow = camGo.transform;
            streamer.groundMaterial = DefaultGroundMaterial();

            EditorSceneManager.MarkSceneDirty(scene);
            Debug.Log("[TRAP] World test scene built. Press Play. " +
                      "WASD to move, right-drag to look, shift to go faster.");
        }

        /// A plain lit material, so the scene works before any art exists.
        static Material DefaultGroundMaterial()
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            var mat = new Material(shader) { name = "TrapGround" };
            mat.color = new Color(0.30f, 0.33f, 0.26f);
            return mat;
        }
    }
}
