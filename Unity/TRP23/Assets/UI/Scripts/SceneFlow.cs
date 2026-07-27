using UnityEngine;
using UnityEngine.SceneManagement;

namespace TrapMadeIt.UI
{
    // Persists across the Menu -> Game scene load and owns the auth service.
    // Recreated on every Play session, so mock/guest state is fresh each run.
    public class SceneFlow : MonoBehaviour
    {
        public static SceneFlow Instance { get; private set; }
        public IAuthService Auth { get; private set; }

        [SerializeField] private string menuScene = "TrapMenu";
        [SerializeField] private string gameScene = "TrapGame";

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            if (Auth == null) Auth = new MockAuthService();
        }

        // Guarantees an instance even if the Game scene is entered directly.
        public static SceneFlow Ensure()
        {
            if (Instance == null)
            {
                var go = new GameObject("TrapSceneFlow");
                Instance = go.AddComponent<SceneFlow>();
                Instance.Auth = new MockAuthService();
                DontDestroyOnLoad(go);
            }
            return Instance;
        }

        public void LoadGame() => SceneManager.LoadScene(gameScene);
        public void LoadMenu() => SceneManager.LoadScene(menuScene);
    }
}
