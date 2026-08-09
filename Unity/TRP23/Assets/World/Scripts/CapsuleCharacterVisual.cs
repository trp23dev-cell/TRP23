using UnityEngine;

namespace TrapMadeIt.World
{
    /// <summary>
    /// The capsule, as a proper implementation rather than a loose primitive.
    ///
    /// This is what a fresh clone gets, and it stays in the project after UMA
    /// arrives. Two reasons, both practical:
    ///
    /// **It keeps the repository self-contained.** WP-U02 removed the last
    /// dependency on an asset nobody had; putting the only body behind a
    /// third-party import would quietly restore that problem. A clone with no
    /// UMA still walks around Lincoln.
    ///
    /// **It is the fallback if the trial fails.** If UMA is rejected on mobile
    /// cost or asset licensing, this is what the game falls back to while a
    /// replacement is chosen — not a broken scene.
    ///
    /// It has no animator, so <see cref="Animator"/> is null and callers that
    /// handle that correctly here will handle a mid-build UMA correctly too.
    /// The capsule leans very slightly as it moves, which is not styling: it is
    /// the cheapest possible proof that SetLocomotion is actually being driven.
    /// </summary>
    public sealed class CapsuleCharacterVisual : MonoBehaviour, ICharacterVisual
    {
        [Tooltip("Degrees of lean at full sprint. Purely so movement is visible " +
                 "on a body with no animation.")]
        public float leanDegrees = 6f;

        [Tooltip("Sprint speed, for scaling the lean. Matches TrapPlayerController.")]
        public float referenceSpeed = 4.5f;

        Renderer[] renderers;
        float lean;

        public Transform Root => transform;
        public Animator Animator => null;          // a capsule has no rig, and callers must cope
        public bool IsReady => true;

        void Awake() => renderers = GetComponentsInChildren<Renderer>(true);

        public void SetLocomotion(float speed, bool grounded)
        {
            float target = grounded && referenceSpeed > 0.01f
                ? Mathf.Clamp01(speed / referenceSpeed) * leanDegrees
                : 0f;
            // Smoothed, and unscaled-independent: this is presentation, so it
            // uses the same deltaTime as everything else and simply stops when
            // the world is frozen, which is correct.
            lean = Mathf.Lerp(lean, target, Time.deltaTime * 8f);
            transform.localRotation = Quaternion.Euler(lean, 0f, 0f);
        }

        public void SetVisible(bool visible)
        {
            if (renderers == null) return;
            // Renderers, not the GameObject. Disabling the object would stop
            // this component and any future animator with it.
            foreach (var r in renderers) if (r != null) r.enabled = visible;
        }
    }
}
