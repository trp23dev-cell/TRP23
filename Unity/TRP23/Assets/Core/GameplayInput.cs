namespace TrapMadeIt
{
    /// <summary>
    /// The one answer to "may gameplay read input right now?"
    ///
    /// WHY THIS EXISTS RATHER THAN EACH COMPONENT ASKING PointerFocus
    ///
    /// The first repair gated the player controller on <see cref="PointerFocus"/>
    /// and that was correct — but it is a *convention*, and a convention only
    /// holds while every author remembers it. `FlyCamera` reads
    /// `Mouse.current.delta` and rotates the camera with no gate at all; drop it
    /// into a scene and the map stops freezing the view, with nothing to warn
    /// you. That is the same shape of bug twice.
    ///
    /// So the gate moves to the SOURCE. The player action map is switched off
    /// while input is blocked, which means every reader — present and future,
    /// careful or not — reads zero. Per-consumer checks stay as belt and
    /// braces, but they are no longer the thing holding the line.
    ///
    /// WHAT THIS DOES NOT KNOW
    ///
    /// That a map exists, or a shop, or a pause menu. Only that somebody is
    /// holding the pointer, which is what "a UI is in front of the player"
    /// means everywhere in this project.
    /// </summary>
    public static class GameplayInput
    {
        /// <summary>
        /// True when a UI has the pointer and gameplay must not act on input.
        ///
        /// Derived rather than stored: a second flag would be a second source of
        /// truth, and the whole reason this file exists is that there should be
        /// exactly one.
        /// </summary>
        public static bool Blocked => PointerFocus.Wanted;

        /// <summary>Convenience for the common `if (!GameplayInput.Allowed) return;`.</summary>
        public static bool Allowed => !Blocked;
    }
}
