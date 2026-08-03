using System.Collections.Generic;

namespace TrapMadeIt
{
    /// <summary>
    /// Who currently needs the mouse pointer.
    ///
    /// Looking around needs the pointer captured and hidden. Clicking a button
    /// needs it back. Those two demands come from different scripts that do not
    /// know about each other, and the usual result is each setting Cursor state
    /// in its own Update and the last one to run winning -- which reads as a
    /// pointer that flickers, or a HUD you cannot click.
    ///
    /// So nothing sets the cursor directly. Anything that needs the pointer
    /// says so by name and says when it is done; one place reads the answer and
    /// applies it. Names rather than a counter, because a counter goes wrong the
    /// first time something requests twice or releases twice, and a panel that
    /// gets opened while already open is not an unusual thing.
    /// </summary>
    public static class PointerFocus
    {
        static readonly HashSet<string> holders = new HashSet<string>();

        /// <summary>Anyone holding the pointer? If so it must be visible.</summary>
        public static bool Wanted => holders.Count > 0;

        public static void Request(string who) => holders.Add(who);

        public static void Release(string who) => holders.Remove(who);

        /// Everything lets go. For scene changes, where the things that
        /// requested may no longer exist to release it themselves.
        public static void ReleaseAll() => holders.Clear();
    }
}
