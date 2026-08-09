using UnityEngine;

namespace TrapMadeIt.World
{
    /// <summary>
    /// What the player looks like, kept at arm's length from what the player is.
    ///
    /// WHY AN INTERFACE, WHEN THERE IS CURRENTLY ONE IMPLEMENTATION
    ///
    /// Normally that would be a speculative abstraction and this project rejects
    /// those. It earns its place here because the *product requirement* is
    /// replaceability: WP-U17a is a trial of UMA, and a trial you cannot walk
    /// back from is not a trial. If UMA turns out to be wrong for mobile, or its
    /// bundled art licensing cannot be cleared, the cost of leaving must be one
    /// adapter rather than every file that touched a character.
    ///
    /// It is also enforced rather than intended: check:repo fails if a UMA
    /// namespace appears anywhere outside the adapter folder.
    ///
    /// WHAT GAMEPLAY IS ALLOWED TO KNOW
    ///
    /// That there is a body, roughly how fast it is moving, and whether it is on
    /// the ground. Nothing about meshes, bones, wardrobe slots or DNA.
    ///
    /// WHAT THIS MUST NEVER BECOME
    ///
    /// The movement controller, the input authority, the save authority or the
    /// streaming authority. Those live in TrapPlayerController, GameplayInput,
    /// the server and WorldStreamer respectively, and a character framework that
    /// starts owning any of them is the coupling this seam exists to prevent.
    /// </summary>
    public interface ICharacterVisual
    {
        /// <summary>The visual root. Parented under the gameplay root, never the other way round.</summary>
        Transform Root { get; }

        /// <summary>
        /// The humanoid animator, or null while a framework is still building
        /// its mesh. Callers must tolerate null — UMA in particular assembles
        /// asynchronously, and code that assumes an Animator on the first frame
        /// works in the editor and fails on a phone.
        /// </summary>
        Animator Animator { get; }

        /// <summary>False until the body exists and can be posed.</summary>
        bool IsReady { get; }

        /// <summary>
        /// Tell the body what it is doing. Metres per second and a ground flag —
        /// deliberately not an animation state name, because which clip that
        /// becomes is the visual layer's business.
        /// </summary>
        void SetLocomotion(float speed, bool grounded);

        /// <summary>
        /// Show or hide the body without disabling the GameObject.
        ///
        /// First person needs the head out of the camera; the gameplay root and
        /// its collider must keep running regardless, so this is a renderer
        /// concern rather than an active-state one.
        /// </summary>
        void SetVisible(bool visible);
    }
}
