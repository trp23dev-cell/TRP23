using UnityEngine;
using UnityEngine.SceneManagement;

namespace TrapMadeIt.UI
{
    /// <summary>
    /// The composition root. The only place that knows which concrete services
    /// exist and how they are wired together.
    ///
    /// WHAT IT REPLACES
    ///
    /// `SceneFlow` was a service locator: it owned the auth service, and every
    /// service reached back up to it to find the address and the acting player.
    /// Two problems came out of that, and both were real rather than
    /// theoretical.
    ///
    /// The graph depended on which scene you started in. Entering TrapGame
    /// directly produced a different object graph from entering via TrapMenu,
    /// which is how a signed-in guest was told to sign in on 4 August. The
    /// scene you happened to press Play on should never change what exists.
    ///
    /// And it was a dependency cycle. Services depended on SceneFlow; SceneFlow
    /// constructed the services. That is why TRP23.Network could not be split
    /// out of TRP23.UI in WP-U01 — there was no direction to split along.
    ///
    /// HOW THIS IS DIFFERENT
    ///
    /// Construction goes one way. GameContext builds the services and hands
    /// each one what it needs; nothing reaches back. Services depend on
    /// interfaces in Core (IApiEndpoint, ISession) and know nothing about this
    /// class, so extracting them into their own assembly later is a matter of
    /// moving files rather than untangling anything.
    ///
    /// WHY NOT A DI CONTAINER
    ///
    /// One project, one team, no runtime graph swapping. A container would be
    /// ceremony. Plain statics were the other option and are what we are
    /// leaving: they cannot be substituted in a test and they hide what depends
    /// on what.
    ///
    /// WHERE IT LIVES
    ///
    /// TRP23.UI, for now, because that is where the services still are. It
    /// belongs in a TRP23.App assembly, which is created when TRP23.Network is
    /// extracted — putting App here today would mean UI referencing App and App
    /// referencing UI, which is the cycle again wearing a different name.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class GameContext : MonoBehaviour
    {
        // ------------------------------------------------------------ services

        /// <summary>Signing in, registering, two-factor, guest sessions.</summary>
        public IAuthService Auth { get; private set; }

        /// <summary>Where the backend is. Configuration, fixed at composition.</summary>
        public IApiEndpoint Endpoint { get; private set; }

        /// <summary>Who is signed in. Changes as the player signs in and out.</summary>
        public ISession Session { get; private set; }

        /// <summary>Balances, deposits, withdrawals. Display only — the ledger is the server's.</summary>
        public WalletService Wallet { get; private set; }

        /// <summary>The trap card.</summary>
        public CaseFileService CaseFile { get; private set; }

        // ------------------------------------------------------------- config

        [Header("Server")]
        [Tooltip("No trailing slash. http://localhost:8787 for local work.")]
        [SerializeField] string apiBase = "https://trp23-production.up.railway.app";

        [Tooltip("On = fake accounts held in memory, for working without a connection. " +
                 "Nothing is saved and no server is contacted.")]
        [SerializeField] bool useMockAuth = false;

        [Header("Scenes")]
        [SerializeField] string menuScene = "TrapMenu";
        [SerializeField] string gameScene = "TrapGame";

        // ------------------------------------------------------------ lifetime

        static GameContext instance;

        /// <summary>
        /// The context, built if it does not exist yet.
        ///
        /// **This is the determinism guarantee.** Whatever scene the player —
        /// or a developer pressing Play — enters through, the same graph is
        /// built by the same code. There is no partially-composed state, and no
        /// scene that happens to be "the one that sets things up".
        /// </summary>
        public static GameContext Current
        {
            get
            {
                if (instance != null) return instance;

                // AddComponent runs Awake before it returns, and Awake does the
                // composing — so by the time this assignment happens the graph
                // is already whole. Composing again here would build a second
                // set of services and leave the session on whichever lost.
                var go = new GameObject("TrapGameContext");
                instance = go.AddComponent<GameContext>();
                return instance;
            }
        }

        /// <summary>Whether a context exists without creating one. For tests and teardown.</summary>
        public static bool Exists => instance != null;

        void Awake()
        {
            // Two contexts would mean two sessions, and the player would be
            // signed in on one of them at random.
            if (instance != null && instance != this)
            {
                Destroy(gameObject);
                return;
            }
            instance = this;
            DontDestroyOnLoad(gameObject);
            Compose();
        }

        void OnDestroy()
        {
            if (instance == this) instance = null;
        }

        // ------------------------------------------------------------ compose

        /// <summary>
        /// Build the graph, once, in dependency order.
        ///
        /// Everything lives on this GameObject rather than being newed up,
        /// because the services run coroutines for web requests — and a
        /// coroutine on an object that dies with the scene cancels a request
        /// mid-flight. This object survives the scene load, so the requests do.
        /// </summary>
        void Compose()
        {
            if (Endpoint != null) return;   // already composed

            Endpoint = new ApiEndpoint(apiBase);

            // Auth first: it holds the token, so it is also the session that
            // everything downstream authenticates with.
            if (useMockAuth)
            {
                Debug.LogWarning("[context] MOCK auth in use — accounts are invented and nothing is saved");
                var mock = new MockAuthService();
                Auth = mock;
                Session = mock;
            }
            else
            {
                var http = gameObject.AddComponent<HttpAuthService>();
                http.Bind(Endpoint);
                Auth = http;
                Session = http;
            }

            // Then the services that need a session. They are handed it; they
            // do not go looking for it, which is the whole point.
            Wallet = gameObject.AddComponent<WalletService>();
            Wallet.Bind(Endpoint, Session);

            CaseFile = gameObject.AddComponent<CaseFileService>();
            CaseFile.Bind(Endpoint, Session);
        }

        // -------------------------------------------------------------- scenes

        public void LoadGame() => SceneManager.LoadScene(gameScene);
        public void LoadMenu() => SceneManager.LoadScene(menuScene);

        /// <summary>
        /// Immutable, so nothing can point the game at a different server after
        /// composition — including a service that decided to be helpful.
        /// </summary>
        sealed class ApiEndpoint : IApiEndpoint
        {
            public ApiEndpoint(string baseUrl) { BaseUrl = (baseUrl ?? string.Empty).TrimEnd('/'); }
            public string BaseUrl { get; }
        }
    }
}
