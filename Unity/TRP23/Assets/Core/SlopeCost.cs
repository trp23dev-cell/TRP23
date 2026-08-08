namespace TrapMadeIt
{
    /// <summary>
    /// What a gradient costs you on foot.
    ///
    /// Lincoln is built on a hill and Steep Hill is called that for a reason.
    /// At a flat speed the climb that takes eight minutes on foot takes the
    /// same time as the level ground beside it, which is what makes a city read
    /// as a floor plan rather than a place.
    ///
    /// Scalar in and scalar out, with no Vector3 and no engine types, so it
    /// lives in Core and is checked in CI without a Unity licence. The caller
    /// works out the gradient from whatever surface it found; this only decides
    /// what that gradient is worth.
    /// </summary>
    public static class SlopeCost
    {
        /// <summary>Slowest you can be made to walk uphill — 30% of pace.</summary>
        public const float SlowestUphill = 0.3f;

        /// <summary>Fastest a descent can carry you — 12% over the flat.</summary>
        public const float FastestDownhill = 1.12f;

        /// <summary>Past 1 in 4 you are picking your way down, not striding.</summary>
        public const float ComfortableDescent = 0.25f;

        /// <summary>
        /// Speed multiplier for a gradient in the direction of travel.
        ///
        /// <paramref name="grade"/> is rise over run: positive uphill, negative
        /// down, 0 flat. So 0.166 is a 1-in-6 climb.
        ///
        /// <paramref name="penalty"/> of 3.5 is close to Naismith's rule, the
        /// one walkers actually plan routes with — a 1-in-6 climb costs about a
        /// third of your pace.
        /// </summary>
        public static float For(float grade, float penalty)
        {
            if (grade > 0f)
            {
                float uphill = 1f / (1f + penalty * grade);
                return uphill < SlowestUphill ? SlowestUphill : (uphill > 1f ? 1f : uphill);
            }

            float drop = -grade;
            if (drop < ComfortableDescent)
            {
                // Eases in rather than jumping to the full benefit at the first
                // hint of a slope.
                return 1f + (FastestDownhill - 1f) * (drop / ComfortableDescent);
            }

            // Steeper than comfortable and it starts costing again.
            float steep = FastestDownhill - (drop - ComfortableDescent) * 1.4f;
            return steep < 0.45f ? 0.45f : (steep > FastestDownhill ? FastestDownhill : steep);
        }
    }
}
