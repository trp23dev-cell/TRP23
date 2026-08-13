namespace TrapMadeIt
{
    /// <summary>
    /// The project's deterministic hash, in C#.
    ///
    /// This is a port of `hashUnit` in scripts/lib/classify.mjs, not a new
    /// invention. The tiler has used it since the beginning to decide a
    /// building's tint and height jitter, with the reason written next to it:
    /// "so a building never changes on reload". The façade system needs the
    /// same guarantee for bay widths and entrance placement, and the same
    /// guarantee is worth nothing if the two sides disagree.
    ///
    /// FNV-1a, seeded by a salt so one id can drive many independent decisions
    /// without them correlating. `Math.imul` in the JS is a 32-bit multiply,
    /// which is what `unchecked` gives here.
    ///
    /// Verified against the JS by scripts/lib/hash.cases.json, generated from
    /// the real implementation and checked in check:world. Same discipline as
    /// the trap card: the two languages agree because something proves it,
    /// after they quietly diverged once already.
    /// </summary>
    public static class TrapHash
    {
        /// <summary>0..1 from an id and a salt. Same inputs, same answer, for ever.</summary>
        public static float Unit(string id, int salt = 0)
        {
            if (string.IsNullOrEmpty(id)) return 0f;

            unchecked
            {
                uint h = (uint)(2166136261 ^ salt);
                for (int i = 0; i < id.Length; i++)
                {
                    h ^= id[i];
                    h *= 16777619u;
                }
                return (h % 10000u) / 10000f;
            }
        }

        /// <summary>
        /// A symmetric spread about zero: -1..1. Convenience for "vary this by
        /// a bit either way", which is most of what the façade system wants.
        /// </summary>
        public static float Signed(string id, int salt = 0) => Unit(id, salt) * 2f - 1f;
    }
}
