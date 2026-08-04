using System.Collections.Generic;

namespace TrapMadeIt
{
    /// <summary>
    /// Who currently wants the game held still.
    ///
    /// Same shape and the same reasoning as <see cref="PointerFocus"/>. Reading
    /// your own case file, or the full map, should not happen while the city
    /// carries on around you — but the map and the HUD are different scripts
    /// that do not know about each other, and if each writes Time.timeScale in
    /// its own Update then closing one un-pauses the other.
    ///
    /// So nothing sets timeScale directly. Anything that needs the game held
    /// says so by name and says when it is done; one place reads the answer and
    /// applies it (TrapMinimap.ApplyPause).
    ///
    /// Names rather than a counter, because a counter goes wrong the first time
    /// something requests twice or releases twice, and a panel being opened
    /// while already open is not unusual.
    /// </summary>
    public static class GameFreeze
    {
        static readonly HashSet<string> holders = new HashSet<string>();

        /// <summary>Anyone holding the game still?</summary>
        public static bool Wanted => holders.Count > 0;

        public static void Request(string who) => holders.Add(who);

        public static void Release(string who) => holders.Remove(who);

        /// Everything lets go. For scene changes, where the things that
        /// requested may no longer exist to release it themselves — and where
        /// a stuck freeze means a scene that never runs again.
        public static void ReleaseAll() => holders.Clear();
    }
}
