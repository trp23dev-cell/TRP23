using UnityEngine;

namespace TrapMadeIt.World
{
    /// <summary>
    /// THE MATERIAL COLOUR CONTRACT.
    ///
    /// One deliberate source of base colour per surface, and exactly one.
    ///
    ///   TEXTURE       carries the material's colour AND its pattern. This is
    ///                 the single source of "what is brick, what is limestone".
    ///                 Authored sRGB; the project renders linear, so Unity
    ///                 converts on sample.
    ///
    ///   VERTEX COLOUR carries per-building VARIATION and ambient occlusion,
    ///                 and nothing else. It is a multiplier around 1.0 --
    ///                 never a material colour. Vertex colours are NOT gamma
    ///                 converted, so anything but a near-unit multiplier here
    ///                 lands in linear space and hits far harder than it looks.
    ///
    ///   _BaseColor    stays white. It is not a third place to tint things.
    ///
    /// WHY THIS FILE EXISTS
    ///
    /// It did not, and the rule was broken as a result. CityTextures.Base put
    /// the material colour in the texture; BuildingMeshBuilder.WallColour put
    /// THE SAME CONSTANT in the vertex colour; the shader multiplied them.
    /// Brick came out at 0.006 linear against a road at 0.027 -- the wall was
    /// 4.6x darker than the tarmac in front of it, and every window row, brick
    /// course and shopfront drawn into the texture was sitting below the
    /// threshold at which anyone could see it.
    ///
    /// The comment on WallColour predicted this exactly and was out of date: it
    /// said the stand-in applied "until the facades are ported". They were
    /// ported. The stand-in was never removed. So the fix is not a brightness
    /// constant bolted on top -- it is deleting the second source.
    ///
    /// THE TINT NORMALISATION, AND WHY IT IS NOT A FUDGE
    ///
    /// The tiler's per-building tint is not centred on 1.0. Brick averages
    /// (0.972, 0.801, 0.730) across 3,452 buildings -- it carries the brick
    /// HUE, because in the web client it was multiplied over a neutral canvas.
    /// Using it raw here would re-apply brick-ness to an already-brick texture.
    ///
    /// So each tint is divided by its style's mean. What survives is exactly
    /// how this building differs from the average building of its style, which
    /// is what makes a terrace read as separate properties. What is removed is
    /// the style's own colour, which now lives once, in the texture.
    ///
    /// The means below are MEASURED from the shipped 294-tile export, not
    /// copied from the tiler's formula, and `npm run check:materials`
    /// recomputes them from that same export and fails if they drift. That is
    /// the same shared-table discipline as the trap card: the client and the
    /// data agree because something checks, not because someone remembered.
    /// </summary>
    public static class TrapMaterials
    {
        /// <summary>
        /// Mean tint per style, measured across all 6,947 buildings.
        /// Keep in step with scripts/check-materials.mjs, which verifies them.
        /// </summary>
        public static Vector3 MeanTint(string style)
        {
            switch (style)
            {
                case "brick":     return new Vector3(0.9719f, 0.8008f, 0.7298f);
                case "limestone": return new Vector3(0.9703f, 0.9513f, 0.8694f);
                case "render":    return new Vector3(0.9609f, 0.9573f, 0.9250f);
                case "modern":    return new Vector3(0.9498f, 0.9565f, 0.9752f);
                case "monument":  return new Vector3(0.9850f, 0.9703f, 0.8929f);
                default:          return new Vector3(0.9719f, 0.8008f, 0.7298f);
            }
        }

        /// <summary>How far a building may stray from its style's average.</summary>
        const float MinVariation = 0.82f;
        const float MaxVariation = 1.18f;

        /// <summary>
        /// The per-building variation multiplier: this building against the
        /// average of its kind. Returns ~1.0 for a typical building.
        ///
        /// Clamped, because a single odd tint in the data must not produce one
        /// glowing building in an otherwise sober street -- and because an
        /// explicit building:colour tag, which bypasses the style range
        /// entirely, would otherwise land anywhere.
        /// </summary>
        public static Color Variation(int[] tint255, string style)
        {
            if (tint255 == null || tint255.Length < 3) return Color.white;

            var mean = MeanTint(style);
            return new Color(
                Mathf.Clamp(tint255[0] / 255f / Mathf.Max(mean.x, 0.01f), MinVariation, MaxVariation),
                Mathf.Clamp(tint255[1] / 255f / Mathf.Max(mean.y, 0.01f), MinVariation, MaxVariation),
                Mathf.Clamp(tint255[2] / 255f / Mathf.Max(mean.z, 0.01f), MinVariation, MaxVariation));
        }

        /// <summary>
        /// Base colours, sRGB, one per material family. THE single source.
        ///
        /// Chosen as conservative, believable reflectances rather than matched
        /// to a photograph from memory -- which the package brief rules out and
        /// which would be guessing anyway. Lincoln brick is a mid red-brown;
        /// Lincolnshire limestone is pale honey, the same stone as the
        /// Cathedral; render is off-white.
        ///
        /// These replace values that were roughly a third as bright and were
        /// never meant to survive being multiplied by themselves.
        /// </summary>
        public static Color Base(string style)
        {
            switch (style)
            {
                // #8f5b46 -- Lincolnshire red brick, weathered.
                case "brick":     return new Color(0.561f, 0.357f, 0.275f);
                // #c9c0a4 -- limestone ashlar, the Cathedral's stone.
                case "limestone": return new Color(0.788f, 0.753f, 0.643f);
                // #d2cabb -- painted render, off-white and slightly warm.
                case "render":    return new Color(0.824f, 0.792f, 0.733f);
                // #8e949a -- concrete panel and curtain wall.
                case "modern":    return new Color(0.557f, 0.580f, 0.604f);
                // #cec6ac -- weathered ashlar, paler and greyer than new stone.
                case "monument":  return new Color(0.808f, 0.776f, 0.675f);
                default:          return new Color(0.706f, 0.678f, 0.612f);
            }
        }

        /// <summary>
        /// Ground and roof surfaces, sRGB. Same contract: this is the only
        /// place their colour is decided.
        ///
        /// Asphalt sits at 0.29 sRGB, which is about 0.067 linear -- within the
        /// 0.04-0.12 real asphalt actually reflects. It was 0.18, which is dark
        /// even for wet tarmac and which set the reference everything else was
        /// judged against.
        /// </summary>
        public static Color Surface(string kind)
        {
            switch (kind)
            {
                case "asphalt":  return new Color(0.290f, 0.282f, 0.271f);
                case "paving":   return new Color(0.596f, 0.584f, 0.549f);
                case "cobble":   return new Color(0.435f, 0.412f, 0.384f);
                case "concrete": return new Color(0.545f, 0.541f, 0.529f);
                case "gravel":   return new Color(0.475f, 0.439f, 0.376f);
                case "grass":    return new Color(0.322f, 0.435f, 0.220f);
                case "wood":     return new Color(0.231f, 0.333f, 0.161f);
                // Water stays dark on purpose: it is the one smooth thing in
                // the city, so what reads as water is the sky in it, not its
                // own colour.
                case "water":    return new Color(0.098f, 0.157f, 0.204f);
                case "wall":     return new Color(0.588f, 0.561f, 0.494f);
                case "hedge":    return new Color(0.204f, 0.302f, 0.153f);
                case "bark":     return new Color(0.325f, 0.263f, 0.196f);
                case "foliage":  return new Color(0.271f, 0.396f, 0.204f);
                case "furniture":return new Color(0.267f, 0.271f, 0.278f);
                // Kerbstone: paler than the road, darker than the flags behind
                // it. That contrast is what makes the line along the
                // carriageway read at all, so the gap matters more than either
                // value on its own.
                case "kerb":     return new Color(0.643f, 0.631f, 0.596f);
                // Painted trim: fascias and pilasters. Deliberately close to
                // the render family and slightly cooler, so it reads as
                // paintwork against brick without becoming a highlight. A
                // High Street terrace should not turn into a rainbow.
                case "trim":     return new Color(0.396f, 0.384f, 0.361f);
                default:         return new Color(0.500f, 0.490f, 0.470f);
            }
        }

        /// <summary>Roof colours. Slate uphill, clay pantile downhill.</summary>
        public static Color Roof(string kind) =>
            kind == "slate" ? new Color(0.310f, 0.325f, 0.345f)
                            : new Color(0.541f, 0.325f, 0.220f);

        /// <summary>
        /// Smoothness per family. Restrained: a city where everything is
        /// slightly wet reads as plastic, and the point of this package is a
        /// truthful baseline rather than a look.
        /// </summary>
        public static float Smoothness(string family)
        {
            switch (family)
            {
                // Glass. Higher than V01: what actually reads as glass is a
                // tight specular on a dark surface, and 0.55 gave a broad soft
                // sheen that read as polished stone. Still short of a mirror --
                // real shop glass is dirty, and reflection probes are not in
                // this package.
                case "shopfront": return 0.74f;
                case "entrance":  return 0.60f;
                case "trim":      return 0.22f;   // painted timber, satin
                case "modern":    return 0.45f;
                case "water":     return 0.90f;
                case "asphalt":   return 0.18f;   // tarmac is not matte
                case "paving":    return 0.12f;
                case "slate":     return 0.25f;
                default:          return 0.06f;
            }
        }
    }
}
