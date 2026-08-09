namespace TrapMadeIt
{
    /// <summary>
    /// How big a person is in TRP23. One place, because Lincoln is real.
    ///
    /// WHY THIS MATTERS MORE HERE THAN IN MOST GAMES
    ///
    /// The city is built from OpenStreetMap footprints on Environment Agency
    /// LIDAR terrain, in metres. A doorway is a real doorway and a kerb is a
    /// real kerb. So the character is the one thing that can be wrong, and the
    /// temptation when something looks off is to scale the world — which is
    /// exactly the wrong repair, because the world is the accurate part.
    ///
    /// **If the character looks wrong against Lincoln, change these numbers.
    /// Never scale Lincoln.**
    ///
    /// Engine-free scalars, so they live in Core and every layer — controller,
    /// setup tooling, character visual, future wardrobe — reads the same values
    /// instead of repeating literals.
    /// </summary>
    public static class TrapCharacterScale
    {
        /// <summary>Total height in metres. Close to the UK adult mean.</summary>
        public const float Height = 1.8f;

        /// <summary>
        /// Eye height in metres. Also what the web client uses, so the city
        /// reads at the same scale in both — which is how the two stayed
        /// comparable while the Unity client was catching up.
        /// </summary>
        public const float EyeHeight = 1.68f;

        /// <summary>CharacterController radius. Wide enough not to catch on door frames.</summary>
        public const float Radius = 0.3f;

        /// <summary>Capsule centre above the feet — half the height, by definition.</summary>
        public const float CapsuleCentreY = Height * 0.5f;

        /// <summary>A kerb is not a wall and a doorstep is not a climb. Lincoln has plenty of both.</summary>
        public const float StepOffset = 0.35f;

        /// <summary>Steep Hill is roughly 1 in 6; this allows considerably worse.</summary>
        public const float SlopeLimit = 50f;

        /// <summary>
        /// What an imported humanoid should be scaled to. A model authored at a
        /// different height is corrected here, on the model — not by moving the
        /// camera or resizing the collider to match bad art.
        /// </summary>
        public const float TargetModelHeight = Height;
    }
}
