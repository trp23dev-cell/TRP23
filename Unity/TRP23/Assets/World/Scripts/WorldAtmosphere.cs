using UnityEngine;

namespace TrapMadeIt.World
{
    /// <summary>
    /// The weather, the light, and the time of day — which in this game are the
    /// same thing as the story.
    ///
    /// The web client lifts the world from dusk to daylight as chapters clear:
    /// the fog thins, the sun rises, the streetlamps fade out. That arc is the
    /// point rather than decoration, and Unity had none of it — a fixed sun, no
    /// sky and no fog, which is most of why the city reads as a model of a place
    /// instead of a place.
    ///
    /// Fog is doing the heavy lifting. A city with clear air to the horizon
    /// looks like an architect's drawing; real distance goes soft and grey,
    /// especially in Lincolnshire. It also hides the edge of the loaded tiles,
    /// which is worth having for nothing.
    ///
    /// The numbers are the web client's, unchanged, so the two look like the
    /// same game.
    /// </summary>
    public class WorldAtmosphere : MonoBehaviour
    {
        [System.Serializable]
        public struct Mood
        {
            public Color sky;        // and the fog, which must match or the
                                     // horizon shows as a seam
            public float fog;        // exponential-squared density
            public float sun;
            public float ambient;
        }

        /// Dusk through to daylight, one step per chapter cleared.
        public static readonly Mood[] Moods =
        {
            new Mood { sky = Hex(0x2a2f3d), fog = 0.00180f, sun = 1.20f, ambient = 0.42f },
            new Mood { sky = Hex(0x333949), fog = 0.00168f, sun = 1.50f, ambient = 0.46f },
            new Mood { sky = Hex(0x3d4455), fog = 0.00156f, sun = 1.80f, ambient = 0.50f },
            new Mood { sky = Hex(0x474f62), fog = 0.00144f, sun = 2.10f, ambient = 0.54f },
            new Mood { sky = Hex(0x525b70), fog = 0.00132f, sun = 2.35f, ambient = 0.57f },
            new Mood { sky = Hex(0x5d677e), fog = 0.00120f, sun = 2.55f, ambient = 0.60f },
            new Mood { sky = Hex(0x6a758d), fog = 0.00108f, sun = 2.80f, ambient = 0.62f },
        };

        [Tooltip("Chapters cleared. 0 is dusk on the first night; 6 is full daylight.")]
        [Range(0, 6)] public int cleared = 0;

        [Tooltip("The directional light. Left empty, the brightest one in the scene.")]
        public Light sun;

        [Tooltip("Follows the camera, so fog and sky track wherever you are.")]
        public Camera view;

        int applied = -1;

        void Start()
        {
            if (sun == null) sun = FindBrightestLight();
            if (view == null) view = Camera.main;
            Apply(true);
        }

        void Update()
        {
            // Only when it has actually changed. Writing RenderSettings every
            // frame is cheap but not free, and it makes the profiler noisy for
            // no reason.
            if (applied != cleared) Apply(false);
        }

        public void Apply(bool force)
        {
            var m = Moods[Mathf.Clamp(cleared, 0, Moods.Length - 1)];
            applied = cleared;

            RenderSettings.fog = true;
            // Exponential squared, not linear. Linear fog has a start and an end
            // and reads as a wall of grey at a fixed distance; exponential falls
            // off the way air actually does.
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = m.sky;
            RenderSettings.fogDensity = m.fog;

            // The sky has to be the fog colour, or the horizon is a visible line
            // between the two.
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = m.sky * (m.ambient + 0.35f);
            RenderSettings.ambientEquatorColor = m.sky * (m.ambient * 0.7f);
            // Bounce off the pavement is warmer and darker than the sky.
            RenderSettings.ambientGroundColor = new Color(0.16f, 0.14f, 0.12f) * m.ambient;

            if (view != null)
            {
                view.clearFlags = CameraClearFlags.SolidColor;
                view.backgroundColor = m.sky;
            }

            if (sun != null)
            {
                sun.intensity = m.sun;
                // Low and to the south-west: a northern European afternoon,
                // which puts long shadows down the streets rather than the flat
                // overhead light that makes everything look like clay.
                sun.transform.rotation = Quaternion.Euler(28f + cleared * 3f, 215f, 0f);
                // Warmer at dusk, whiter as the day comes up.
                sun.color = Color.Lerp(new Color(1.00f, 0.82f, 0.62f),
                                       new Color(1.00f, 0.97f, 0.92f),
                                       cleared / (float)(Moods.Length - 1));
                sun.shadows = LightShadows.Soft;
            }
        }

        static Light FindBrightestLight()
        {
            Light best = null;
            foreach (var l in FindObjectsByType<Light>(FindObjectsSortMode.None))
            {
                if (l.type != LightType.Directional) continue;
                if (best == null || l.intensity > best.intensity) best = l;
            }
            return best;
        }

        static Color Hex(int rgb) => new Color(
            ((rgb >> 16) & 0xFF) / 255f,
            ((rgb >> 8) & 0xFF) / 255f,
            (rgb & 0xFF) / 255f);
    }
}
