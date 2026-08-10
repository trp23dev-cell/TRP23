using System;
using System.Collections.Generic;

namespace TrapMadeIt
{
    /// <summary>
    /// Which primary surface has the screen. **Exactly one, or none.**
    ///
    /// WHY THE EXISTING REGISTERS DID NOT ALREADY DO THIS
    ///
    /// PointerFocus and GameFreeze are *permission* registers. They answer
    /// "does anybody want the cursor" and "does anybody want the world held
    /// still", and they are deliberately **additive** — any holder is enough,
    /// and they compose in any order. That is exactly right for what they do,
    /// and it is why nesting has never broken.
    ///
    /// But additive is the opposite of exclusive. Nothing in either register
    /// says two surfaces must not be on screen together, so the map and the
    /// case file were both allowed to be open, both correctly froze the world,
    /// and both correctly released it. Every check passed. The screen still had
    /// two things on it.
    ///
    /// This is the missing register, not a patch on those two. Same shape —
    /// named holders, static, release-safe — and the opposite rule.
    ///
    /// WHY IT IS NOT PAIRWISE CHECKS
    ///
    /// The stacking bug was already half-fixed the wrong way: the Phone knew
    /// about panels and panels knew about the Phone, hand-wired in two places.
    /// That is n² relationships, it silently omitted the map, and it could not
    /// have included the map — TRP23.UI cannot reference TRP23.World. Here a
    /// surface only knows its own name and how to close itself. Adding a
    /// seventh surface is one Register call and no edits anywhere else.
    ///
    /// WHAT IS *NOT* A PRIMARY SURFACE
    ///
    /// Anything nested inside one. The Phone's home screen and its apps are
    /// views within the Phone, so the Phone claims once when it opens and its
    /// internal navigation never touches this. Same for the panels: the HUD
    /// panel layer is one surface called "hud", and which panel is showing is
    /// its own business.
    /// </summary>
    public static class ModalSurface
    {
        static readonly Dictionary<string, Action> closers = new Dictionary<string, Action>();
        static string current;

        /// <summary>The surface currently holding the screen, or null.</summary>
        public static string Current => current;

        /// <summary>True when any primary surface is open.</summary>
        public static bool AnyOpen => current != null;

        /// <summary>
        /// Say this surface exists and how to shut it. Called on enable; pair
        /// with <see cref="Unregister"/> on disable, or a destroyed object gets
        /// asked to close itself after its scene has gone.
        /// </summary>
        public static void Register(string name, Action close)
        {
            if (string.IsNullOrEmpty(name) || close == null) return;
            closers[name] = close;
        }

        public static void Unregister(string name)
        {
            if (string.IsNullOrEmpty(name)) return;
            closers.Remove(name);
            if (current == name) current = null;
        }

        /// <summary>
        /// Take the screen. Whatever held it is asked to close first.
        ///
        /// The order matters and is the only subtle thing here. `current` is
        /// cleared **before** the outgoing surface is closed, because closing it
        /// will call Yield — and a Yield that ran while `current` still named
        /// the outgoing surface would be correct, but a Yield that ran after
        /// `current` had already been set to the incoming one would clear the
        /// claim we are in the middle of making. Clearing first makes that
        /// re-entrant Yield a harmless no-op, whichever way round it happens.
        /// </summary>
        public static void Claim(string name)
        {
            if (string.IsNullOrEmpty(name)) return;
            if (current == name) return;              // already ours; opening twice is not an event

            if (current != null && closers.TryGetValue(current, out var close))
            {
                current = null;
                close();
            }

            current = name;
        }

        /// <summary>
        /// Give the screen back, if we still have it. Safe to call when we do
        /// not — a surface closing because something else claimed has already
        /// been let go, and must not clear the new holder on its way out.
        /// </summary>
        public static void Yield(string name)
        {
            if (current == name) current = null;
        }

        /// <summary>
        /// Forget everything. For a scene teardown and for tests — it drops the
        /// registrations too, which is the difference between this and Yield.
        /// </summary>
        public static void ReleaseAll()
        {
            current = null;
            closers.Clear();
        }
    }
}
