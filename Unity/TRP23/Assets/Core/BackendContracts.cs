namespace TrapMadeIt
{
    /// <summary>
    /// Where the server is.
    ///
    /// Separated from <see cref="ISession"/> because it is configuration and a
    /// session is state: the address is decided once at composition and never
    /// changes, whereas who is signed in changes constantly.
    /// </summary>
    public interface IApiEndpoint
    {
        /// <summary>No trailing slash.</summary>
        string BaseUrl { get; }
    }

    /// <summary>
    /// Who is currently signed in, as far as the server is concerned.
    ///
    /// WHY THIS EXISTS
    ///
    /// Every service that talks to the backend needs two things: the address,
    /// and proof of who is asking. Before WP-U03 they got both by reaching
    /// upward — `SceneFlow.Ensure().Auth` — from inside the service. That made
    /// the network layer depend on the composition root, and the composition
    /// root construct the network layer, which is a cycle: it is the reason
    /// TRP23.Network could not be split out of TRP23.UI (WP-U01 §2).
    ///
    /// With this, a service depends on an interface in Core and is handed an
    /// implementation. The direction is one way, the cycle is gone, and the
    /// extraction becomes mechanical rather than architectural.
    ///
    /// It is also the seam that makes services testable: a fake session is four
    /// lines, where faking a MonoBehaviour service locator is not.
    /// </summary>
    public interface ISession
    {
        /// <summary>The server-issued player id, or null when signed out.</summary>
        string PlayerId { get; }

        /// <summary>Bearer token, or null. Never a password — none is ever stored.</summary>
        string Token { get; }

        /// <summary>
        /// Whether there is a usable session.
        ///
        /// A guest counts. `/api/players/session` issues a real playerId and a
        /// real token with no account attached, and treating that as signed-out
        /// is what told a signed-in guest to sign in on 4 August.
        /// </summary>
        bool IsSignedIn { get; }
    }
}
