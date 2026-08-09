using NUnit.Framework;
using TrapMadeIt;

namespace TrapMadeIt.Tests
{
    /// <summary>
    /// The character has to be the right size because Lincoln is real.
    ///
    /// These are not arbitrary bounds. The city is OSM footprints on LIDAR
    /// terrain in metres, so a doorway is a real doorway — and the standing
    /// temptation when something looks wrong is to scale the world, which is
    /// the one repair that must never happen. These pin the character instead.
    /// </summary>
    public class CharacterScaleTests
    {
        [Test]
        public void HeightIsAPlausibleAdult()
        {
            Assert.GreaterOrEqual(TrapCharacterScale.Height, 1.5f);
            Assert.LessOrEqual(TrapCharacterScale.Height, 2.0f);
        }

        [Test]
        public void EyesAreInTheHead_NotAboveIt()
        {
            Assert.Less(TrapCharacterScale.EyeHeight, TrapCharacterScale.Height,
                "eye height above total height means the camera floats above the character");
            Assert.Greater(TrapCharacterScale.EyeHeight, TrapCharacterScale.Height * 0.85f,
                "eyes should be near the top of the head, not in the chest");
        }

        [Test]
        public void CapsuleCentreIsHalfTheHeight()
        {
            // If this drifts, the character stands buried or hovering, and the
            // usual "fix" is to nudge the ground check — which hides it.
            Assert.AreEqual(TrapCharacterScale.Height * 0.5f, TrapCharacterScale.CapsuleCentreY, 0.001f);
        }

        [Test]
        public void FitsThroughADoorway()
        {
            // A UK domestic door is 1.981m x 762mm. Diameter, not radius.
            Assert.Less(TrapCharacterScale.Height, 1.981f, "too tall for a standard door");
            Assert.Less(TrapCharacterScale.Radius * 2f, 0.762f, "too wide for a standard door");
        }

        [Test]
        public void StepsOverAKerbButNotAWall()
        {
            // UK kerbs are about 100-125mm; this clears one comfortably without
            // letting the player walk up the side of a building.
            Assert.Greater(TrapCharacterScale.StepOffset, 0.15f);
            Assert.Less(TrapCharacterScale.StepOffset, TrapCharacterScale.Height * 0.3f);
        }

        [Test]
        public void ImportedModelsAreScaledToTheCharacter()
        {
            // The rule this encodes: correct the model, never the world.
            Assert.AreEqual(TrapCharacterScale.Height, TrapCharacterScale.TargetModelHeight, 0.001f);
        }
    }
}
