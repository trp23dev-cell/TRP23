using NUnit.Framework;
using TrapMadeIt;

namespace TrapMadeIt.Tests
{
    /// <summary>
    /// The first Unity test assembly, established by WP-U03.
    ///
    /// It covers the freeze contract, which is worth pinning twice: the same
    /// rules are already checked in CI by tools/collision-check, because Core
    /// is engine-free and can be compiled without Unity. Having them here as
    /// well is deliberate — it establishes the assembly and the pattern that
    /// PlayMode tests will need, and it gives the owner a Test Runner that is
    /// not empty.
    ///
    /// Composition tests belong in a PlayMode assembly and come with WP-U06,
    /// once there is game state worth asserting about.
    /// </summary>
    public class GameplayGateTests
    {
        [SetUp]
        public void Reset()
        {
            PointerFocus.ReleaseAll();
            GameFreeze.ReleaseAll();
        }

        [Test]
        public void NothingHeld_InputIsAllowed()
        {
            Assert.IsTrue(GameplayInput.Allowed);
            Assert.IsFalse(GameplayInput.Blocked);
        }

        [Test]
        public void AnyPointerHolder_BlocksGameplayInput()
        {
            PointerFocus.Request("map");
            Assert.IsTrue(GameplayInput.Blocked, "a UI holding the pointer must block gameplay input");
        }

        [Test]
        public void ClosingOneOfTwoHolders_StaysBlocked()
        {
            PointerFocus.Request("map");
            PointerFocus.Request("hud");
            PointerFocus.Release("map");
            Assert.IsTrue(GameplayInput.Blocked, "the case file is still open");
        }

        [Test]
        public void ReleasingTwice_DoesNotBreakTheNextHold()
        {
            // A counter would read -1 then 0 here and fail to block. These are
            // named sets precisely so double-release cannot corrupt them.
            GameFreeze.Request("hud");
            GameFreeze.Release("hud");
            GameFreeze.Release("hud");
            GameFreeze.Request("map");
            Assert.IsTrue(GameFreeze.Wanted);
        }

        [Test]
        public void SteepHill_CostsAboutAThirdOfYourPace()
        {
            // Naismith's rule, which is why the default penalty is 3.5.
            Assert.AreEqual(0.63f, SlopeCost.For(1f / 6f, 3.5f), 0.03f);
        }
    }
}
