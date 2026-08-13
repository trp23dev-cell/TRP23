using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace TrapMadeIt.World
{
    /// <summary>
    /// The project's post-processing baseline. Restrained on purpose.
    ///
    /// WHAT IT DOES
    ///
    /// Neutral tonemapping, and nothing else.
    ///
    /// The project renders HDR with tonemapping set to None, which is not a
    /// look — it is an unfinished setting. Without a tonemap, anything above
    /// 1.0 clips flat, so a sunlit limestone wall and the sky behind it become
    /// the same white, and the mid-tones sit compressed underneath. Neutral is
    /// the honest choice here: it maps the range without imposing a colour
    /// grade, which is what a baseline is for. ACES would look more filmic and
    /// would also be a stylistic decision this package is explicitly not
    /// allowed to make.
    ///
    /// WHY IT IS CODE RATHER THAN AN ASSET
    ///
    /// A VolumeProfile is a ScriptableObject whose YAML carries GUID references
    /// into the URP package. Hand-authoring one outside the editor is a good
    /// way to produce a file that looks right in a diff and fails to load, and
    /// there is no Unity here to author it properly. Built at runtime, the
    /// profile is project-owned, deterministic, reviewable as code, and cannot
    /// be half-written.
    ///
    /// It runs at priority 100, above the default volume, so its tonemapping
    /// wins. Unity's stock DefaultVolumeProfile still ships in
    /// Assets/Settings and still contains template leftovers —
    /// CopyPasteTestComponent2, TestAnimationCurveVolumeComponent,
    /// CopyPasteTestComponent3. They are inert, they are overridden, and
    /// deleting them means editing a Unity-authored asset by hand, which is not
    /// worth the risk in a package about brightness. Recorded as an owner task
    /// instead.
    ///
    /// WHAT IT MUST NOT BECOME
    ///
    /// Bloom, vignette, chromatic aberration, film grain and colour grading are
    /// all one line each and all belong to a later package with a written
    /// intention. A baseline that has already been graded cannot be used to
    /// judge whether the materials underneath it are right — which is the whole
    /// purpose of WORLD-V01.
    /// </summary>
    [DisallowMultipleComponent]
    public class TrapPostProcess : MonoBehaviour
    {
        [Tooltip("Above the default volume, so this tonemap is the one that applies.")]
        public float priority = 100f;

        Volume volume;
        VolumeProfile profile;

        void OnEnable()
        {
            if (volume != null) return;

            profile = ScriptableObject.CreateInstance<VolumeProfile>();
            profile.name = "TRP23_Baseline";

            var tone = profile.Add<Tonemapping>(true);
            tone.mode.overrideState = true;
            tone.mode.value = TonemappingMode.Neutral;

            volume = gameObject.AddComponent<Volume>();
            volume.isGlobal = true;
            volume.priority = priority;
            volume.profile = profile;
        }

        void OnDisable()
        {
            // The profile is created rather than loaded, so nothing else will
            // ever collect it.
            if (profile != null) Destroy(profile);
            profile = null;
        }
    }
}
