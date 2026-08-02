using UnityEngine;
using UnityEngine.SceneManagement;

namespace TrapMadeIt.UI
{
    // Persists across the Menu -> Game scene load and owns the auth service.
    public class SceneFlow : MonoBehaviour
    {
        public static SceneFlow Instance { get; private set; }
        public IAuthService Auth { get; private set; }

        [SerializeField] private string menuScene = "TrapMenu";
        [SerializeField] private string gameScene = "TrapGame";

        [Header("Server")]
        [Tooltip("Off = the real server. On = fake accounts held in memory, for working without a connection.")]
        [SerializeField] private bool useMockAuth = false;

        [Tooltip("No trailing slash. Use http://localhost:8787 when running the server locally.")]
        [SerializeField] private string apiBase = "https://trp23-production.up.railway.app";

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            if (Auth == null) Auth = CreateAuth();
        }

        /// <summary>
        /// The real service by default; the mock only when it is asked for.
        ///
        /// HttpAuthService is a MonoBehaviour — it needs a coroutine to run a
        /// web request — so it is attached to this object rather than newed up.
        /// That also means the live session survives the scene load, because
        /// this object does.
        /// </summary>
        private IAuthService CreateAuth()
        {
            if (useMockAuth)
            {
                Debug.LogWarning("[auth] MOCK service in use — accounts are invented and nothing is saved");
                return new MockAuthService();
            }
            var http = gameObject.AddComponent<HttpAuthService>();
            http.apiBase = apiBase;
            return http;
        }

        // Guarantees an instance even if the Game scene is entered directly.
        public static SceneFlow Ensure()
        {
            if (Instance == null)
            {
                var go = new GameObject("TrapSceneFlow");
                // AddComponent runs Awake before it returns, which sets Auth.
                // Assigning it again here would build a second service and
                // leave the session on whichever one lost.
                Instance = go.AddComponent<SceneFlow>();
                DontDestroyOnLoad(go);
            }
            return Instance;
        }

        public void LoadGame() => SceneManager.LoadScene(gameScene);
        public void LoadMenu() => SceneManager.LoadScene(menuScene);
    }
}
