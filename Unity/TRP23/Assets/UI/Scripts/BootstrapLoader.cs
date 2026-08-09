using UnityEngine;

namespace TrapMadeIt.UI
{
    /// <summary>
    /// Composes the game, then hands over to the frontend.
    ///
    /// Deliberately almost nothing. Touching GameContext.Current is what builds
    /// the graph; the load is the only other thing that happens here. A
    /// bootstrap that does more becomes a place where start-up order matters
    /// again, which is what WP-U03 removed.
    /// </summary>
    public sealed class BootstrapLoader : MonoBehaviour
    {
        void Start()
        {
            var context = GameContext.Current;   // composes on first touch
            context.LoadMenu();
        }
    }
}
