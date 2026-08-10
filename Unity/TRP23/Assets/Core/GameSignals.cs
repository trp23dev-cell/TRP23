using System;

namespace TrapMadeIt
{
    /// <summary>
    /// The few things one assembly needs to ask another for, without being
    /// allowed to reference it.
    ///
    /// WHY THIS EXISTS AT ALL
    ///
    /// TRP23.UI cannot reference TRP23.World — WP-U01 drew that line on purpose,
    /// and check:assemblies fails if it is crossed. So when the Phone's Map app
    /// wants to open the full map, it cannot call TrapMinimap. The choice was
    /// between an event, a duplicate map inside the Phone, or a Map app that
    /// tells the player to press M instead. Only one of those is honest.
    ///
    /// WHAT BELONGS HERE
    ///
    /// Requests that cross an assembly boundary and have exactly one sensible
    /// listener. Not a general message bus, and not a place to put things that
    /// could be a direct call — a signal hides who is talking to whom, which is
    /// a real cost and is only worth paying where a reference is forbidden.
    ///
    /// LISTENERS MUST UNSUBSCRIBE
    ///
    /// These are static, so a scene object that subscribes in OnEnable and
    /// forgets to unsubscribe in OnDisable keeps a dead object alive and gets
    /// called after its scene has gone. Subscribe and unsubscribe in pairs.
    /// </summary>
    public static class GameSignals
    {
        /// <summary>
        /// Someone asked for the full map. Raised by the Phone; answered by
        /// TrapMinimap, which owns the map and remains the only thing that
        /// knows how it opens.
        /// </summary>
        public static event Action OpenMapRequested;

        /// <summary>
        /// Ask for the map. Safe to call when nothing is listening — that is
        /// the menu scene, where there is no map and no error either.
        /// </summary>
        public static void RequestOpenMap() => OpenMapRequested?.Invoke();

        /// <summary>
        /// Drop every listener. Called on a hard scene teardown so a stale
        /// subscriber cannot outlive the scene that made it. Not needed in
        /// normal play, where OnDisable does its half of the pair.
        /// </summary>
        public static void ResetForTests() => OpenMapRequested = null;
    }
}
