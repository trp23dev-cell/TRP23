using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using TrapMadeIt.UI;

namespace TrapMadeIt.EditorTools
{
    /// <summary>
    /// Builds the Bootstrap scene, in one click.
    ///
    /// WHAT IT IS FOR, AND WHAT IT IS NOT
    ///
    /// The determinism guarantee in WP-U03 is GameContext.Current, not this
    /// scene: whatever scene is entered — including a developer pressing Play
    /// on TrapGame — the same graph is composed by the same code. **This scene
    /// is not required for that to hold**, and neither TrapMenu nor TrapGame
    /// was modified.
    ///
    /// What it gives is a single deliberate entry point for a build: an empty
    /// scene that composes and then loads the frontend, so a player's first
    /// frame is not also the frame that constructs the game. That matters more
    /// on a phone than in the editor.
    /// </summary>
    public static class TrapBootstrapSetup
    {
        const string ScenePath = "Assets/Scenes/Bootstrap.unity";

        [MenuItem("TRAP/Build Bootstrap Scene", priority = 5)]
        public static void Build()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var go = new GameObject("TrapGameContext");
            go.AddComponent<GameContext>();

            // Nothing else. A bootstrap scene with content in it is a loading
            // screen, and a loading screen that composes the game is the thing
            // this package exists to remove.
            var loader = new GameObject("BootstrapLoader");
            loader.AddComponent<BootstrapLoader>();

            EditorSceneManager.SaveScene(scene, ScenePath);
            Debug.Log($"[TRAP] bootstrap scene written to {ScenePath}. " +
                      "Add it as the FIRST scene in Build Settings to use it as the entry point.");
        }
    }
}
