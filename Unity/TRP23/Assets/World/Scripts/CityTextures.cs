using UnityEngine;

namespace TrapMadeIt.World
{
    /// <summary>
    /// Facades, drawn rather than downloaded.
    ///
    /// A city of flat-coloured boxes reads as blocking-out, whatever the
    /// heights are: what says "building" at street level is windows in rows,
    /// courses in the stonework, and a shopfront where the ground floor meets
    /// the pavement. The web client draws all of that into canvases at load
    /// time; this is the same idea in C#.
    ///
    /// Generating beats importing here, for reasons that are not just about
    /// saving a download. The geometry already tiles at exactly 6 metres across
    /// and one storey up, so a texture made to that measure lines up floor for
    /// floor along a terrace -- a bought 4K brick photo does not know where the
    /// storeys are. There is no licence to check, nothing to keep out of a
    /// public repo, and it costs about a megabyte of memory for the lot.
    ///
    /// Bought PBR materials are still worth having later. They belong UNDER
    /// this as surface detail -- normal and roughness on the brick itself --
    /// not instead of it, because they cannot place a window.
    /// </summary>
    public static class CityTextures
    {
        // One tile is 6m wide and one storey tall, matching the wall UVs in
        // BuildingMeshBuilder.Quad. Change one and the other has to follow.
        const int Size = 256;
        const float MetresAcross = 6f;

        /// <summary>Deterministic noise, so the city looks the same every run.</summary>
        struct Rng
        {
            uint state;
            public Rng(int seed) { state = (uint)(seed * 2654435761u) | 1u; }
            public float Next()
            {
                state ^= state << 13; state ^= state >> 17; state ^= state << 5;
                return (state & 0xFFFFFF) / (float)0xFFFFFF;
            }
            public float Range(float a, float b) => a + Next() * (b - a);
        }

        /// <summary>
        /// Upper-floor wall for a style, with a row of windows.
        /// </summary>
        public static Texture2D Wall(string style, bool windows = true)
        {
            var px = new Color32[Size * Size];
            var rng = new Rng(StyleSeed(style));

            Fill(px, Base(style));
            switch (style)
            {
                case "limestone": Courses(px, ref rng, 26, new Color(0.06f, 0.06f, 0.05f, 1f), true); break;
                case "monument": Courses(px, ref rng, 20, new Color(0.05f, 0.05f, 0.04f, 1f), true); break;
                case "brick": Bricks(px, ref rng); break;
                case "modern": Panels(px, ref rng); break;
                default: Grain(px, ref rng, 0.05f); break;   // render: flat, slightly mottled
            }

            if (windows) WindowRow(px, ref rng, style);
            Grain(px, ref rng, 0.03f);
            return Finish(px, $"facade_{style}");
        }

        /// <summary>
        /// The ground floor, which is a different thing from the storeys above
        /// it: a shop is mostly glass, a house is a door and a window, and a
        /// blank flank wall is neither.
        /// </summary>
        public static Texture2D Ground(string kind, string style)
        {
            var px = new Color32[Size * Size];
            var rng = new Rng(StyleSeed(style) + kind.GetHashCode());

            Fill(px, Base(style));
            if (style == "brick") Bricks(px, ref rng);
            else if (style == "limestone" || style == "monument") Courses(px, ref rng, 26, new Color(0.06f, 0.06f, 0.05f, 1f), true);

            if (kind == "shopfront") Shopfront(px, ref rng);
            else if (kind == "residential") DoorAndWindow(px, ref rng);

            Grain(px, ref rng, 0.03f);
            return Finish(px, $"ground_{kind}_{style}");
        }

        /// <summary>Roof covering. Slate courses or clay pantiles.</summary>
        public static Texture2D Roof(string kind)
        {
            var px = new Color32[Size * Size];
            var rng = new Rng(kind == "pantile" ? 91 : 17);

            bool pantile = kind == "pantile";
            Fill(px, pantile ? new Color(0.30f, 0.16f, 0.11f) : new Color(0.16f, 0.17f, 0.19f));

            // Courses run across the slope. Tiles are small, so plenty of them.
            int rows = pantile ? 14 : 20;
            for (int r = 0; r < rows; r++)
            {
                int y = Mathf.RoundToInt(r / (float)rows * Size);
                HLine(px, y, new Color(0f, 0f, 0f, 0.55f));
                for (int x = 0; x < Size; x++)
                {
                    // Per-tile variation, so a roof is not a flat sheet.
                    if (x % (pantile ? 18 : 26) != 0) continue;
                    VLineSegment(px, x, y, y + Size / rows, new Color(0f, 0f, 0f, 0.35f));
                }
            }
            Grain(px, ref rng, 0.06f);
            return Finish(px, $"roof_{kind}");
        }

        // ------------------------------------------------------------ drawing

        static Color Base(string style)
        {
            switch (style)
            {
                case "limestone": return new Color(0.427f, 0.408f, 0.341f);
                case "brick": return new Color(0.216f, 0.173f, 0.145f);
                case "modern": return new Color(0.290f, 0.290f, 0.298f);
                case "monument": return new Color(0.455f, 0.435f, 0.365f);
                default: return new Color(0.376f, 0.353f, 0.318f);   // render
            }
        }

        static int StyleSeed(string style) => style == null ? 3 : style.Length * 31 + style[0];

        static void Fill(Color32[] px, Color c)
        {
            var v = (Color32)c;
            for (int i = 0; i < px.Length; i++) px[i] = v;
        }

        /// Ashlar: level courses with staggered vertical joints.
        static void Courses(Color32[] px, ref Rng rng, int rows, Color joint, bool stagger)
        {
            int h = Size / rows;
            for (int r = 0; r < rows; r++)
            {
                int y = r * h;
                HLine(px, y, joint);
                // Each block slightly its own shade -- that is what reads as stone.
                int offset = stagger && (r % 2 == 1) ? h : 0;
                for (int x = offset; x < Size; x += h * 2)
                {
                    VLineSegment(px, x, y, y + h, joint);
                    Shade(px, x, y, Mathf.Min(h * 2, Size - x), h, rng.Range(-0.035f, 0.035f));
                }
            }
        }

        /// Stretcher bond: courses half a brick out from the one below.
        static void Bricks(Color32[] px, ref Rng rng)
        {
            const int rows = 34;             // ~75mm courses over a 3m storey
            int h = Size / rows;
            int w = h * 4;                   // a brick is about four courses long
            for (int r = 0; r < rows; r++)
            {
                int y = r * h;
                HLine(px, y, new Color(0.55f, 0.53f, 0.49f, 0.30f));   // lime mortar
                int offset = (r % 2) * (w / 2);
                for (int x = -offset; x < Size; x += w)
                {
                    VLineSegment(px, Wrap(x), y, y + h, new Color(0.55f, 0.53f, 0.49f, 0.25f));
                    Shade(px, Wrap(x), y, w, h, rng.Range(-0.05f, 0.05f));
                }
            }
        }

        /// Post-war panel: big flat divisions, nothing fine-grained.
        static void Panels(Color32[] px, ref Rng rng)
        {
            for (int i = 0; i <= 4; i++)
            {
                VLineSegment(px, i * Size / 4, 0, Size, new Color(0f, 0f, 0f, 0.45f));
                HLine(px, i * Size / 4, new Color(0f, 0f, 0f, 0.30f));
            }
            Grain(px, ref rng, 0.02f);
        }

        /// <summary>
        /// Two window bays across the 6m tile, so a terrace reads as houses
        /// rather than as one long wall.
        /// </summary>
        static void WindowRow(Color32[] px, ref Rng rng, string style)
        {
            bool wide = style == "modern";
            int bays = wide ? 2 : 2;
            float bayWidth = wide ? 0.40f : 0.26f;
            float top = 0.28f, bottom = 0.80f;   // within the storey

            for (int i = 0; i < bays; i++)
            {
                float centre = (i + 0.5f) / bays;
                int x0 = Mathf.RoundToInt((centre - bayWidth / 2f) * Size);
                int x1 = Mathf.RoundToInt((centre + bayWidth / 2f) * Size);
                int y0 = Mathf.RoundToInt(top * Size);
                int y1 = Mathf.RoundToInt(bottom * Size);

                // Glass. Dark, and occasionally lit -- a street where every
                // window is black is as wrong as one where they all glow.
                bool lit = rng.Next() < 0.16f;
                var glass = lit ? new Color(0.79f, 0.63f, 0.42f) : new Color(0.07f, 0.07f, 0.08f);
                Rect(px, x0, y0, x1, y1, glass);

                // Reveal and sill, which is most of what makes it read as set
                // into a wall rather than painted on.
                Outline(px, x0, y0, x1, y1, new Color(0f, 0f, 0f, 0.55f));
                Rect(px, x0 - 2, y1, x1 + 2, y1 + 3, new Color(0.62f, 0.60f, 0.54f));

                // Glazing bars. Georgian and Victorian sashes are divided;
                // without these a window is a black rectangle.
                if (!wide)
                {
                    VLineSegment(px, (x0 + x1) / 2, y0, y1, new Color(0.5f, 0.49f, 0.45f, 0.75f));
                    HLineSegment(px, (y0 + y1) / 2, x0, x1, new Color(0.5f, 0.49f, 0.45f, 0.75f));
                }
            }
        }

        /// Glazing, stallriser and fascia: a shop, in the order you see them.
        static void Shopfront(Color32[] px, ref Rng rng)
        {
            int fascia0 = Mathf.RoundToInt(0.06f * Size);
            int fascia1 = Mathf.RoundToInt(0.24f * Size);
            int glass0 = fascia1 + 3;
            int glass1 = Mathf.RoundToInt(0.86f * Size);

            // Fascia board: where the sign goes.
            Rect(px, 0, fascia0, Size, fascia1, new Color(0.11f, 0.10f, 0.10f));

            // The window itself, in two lights with a mullion.
            Rect(px, 8, glass0, Size - 8, glass1, new Color(0.09f, 0.10f, 0.12f));
            for (int i = 1; i < 3; i++)
                VLineSegment(px, i * Size / 3, glass0, glass1, new Color(0.24f, 0.23f, 0.21f));

            // Lit from inside, most of the time. A parade of dark shops at
            // street level is the single biggest thing that reads as "empty".
            if (rng.Next() < 0.7f)
                Rect(px, 12, glass0 + 6, Size - 12, glass1 - 30, new Color(0.34f, 0.29f, 0.22f));

            // Stallriser under the glass, and the pavement line.
            Rect(px, 0, glass1, Size, Size, new Color(0.13f, 0.12f, 0.11f));
            Outline(px, 8, glass0, Size - 8, glass1, new Color(0f, 0f, 0f, 0.6f));
        }

        /// A front door and one window: the domestic ground floor.
        static void DoorAndWindow(Color32[] px, ref Rng rng)
        {
            int y0 = Mathf.RoundToInt(0.34f * Size);
            int y1 = Mathf.RoundToInt(0.92f * Size);

            int dx0 = Mathf.RoundToInt(0.10f * Size);
            int dx1 = Mathf.RoundToInt(0.24f * Size);
            Rect(px, dx0, y0, dx1, y1, new Color(0.16f, 0.13f, 0.11f));
            Outline(px, dx0, y0, dx1, y1, new Color(0f, 0f, 0f, 0.6f));

            int wx0 = Mathf.RoundToInt(0.42f * Size);
            int wx1 = Mathf.RoundToInt(0.78f * Size);
            bool lit = rng.Next() < 0.3f;
            Rect(px, wx0, y0, wx1, y1 - 6, lit ? new Color(0.72f, 0.58f, 0.39f) : new Color(0.07f, 0.07f, 0.08f));
            Outline(px, wx0, y0, wx1, y1 - 6, new Color(0f, 0f, 0f, 0.55f));
            VLineSegment(px, (wx0 + wx1) / 2, y0, y1 - 6, new Color(0.5f, 0.49f, 0.45f, 0.8f));
        }

        // ------------------------------------------------------- pixel helpers

        static int Wrap(int x) => ((x % Size) + Size) % Size;

        static void Blend(Color32[] px, int x, int y, Color c)
        {
            if (x < 0 || x >= Size || y < 0 || y >= Size) return;
            int i = y * Size + x;
            var d = px[i];
            float a = c.a;
            px[i] = new Color32(
                (byte)(d.r * (1f - a) + c.r * 255f * a),
                (byte)(d.g * (1f - a) + c.g * 255f * a),
                (byte)(d.b * (1f - a) + c.b * 255f * a),
                255);
        }

        static void Rect(Color32[] px, int x0, int y0, int x1, int y1, Color c)
        {
            for (int y = Mathf.Max(0, y0); y < Mathf.Min(Size, y1); y++)
                for (int x = Mathf.Max(0, x0); x < Mathf.Min(Size, x1); x++)
                    Blend(px, x, y, new Color(c.r, c.g, c.b, c.a <= 0f ? 1f : c.a));
        }

        static void Outline(Color32[] px, int x0, int y0, int x1, int y1, Color c)
        {
            HLineSegment(px, y0, x0, x1, c);
            HLineSegment(px, y1 - 1, x0, x1, c);
            VLineSegment(px, x0, y0, y1, c);
            VLineSegment(px, x1 - 1, y0, y1, c);
        }

        static void HLine(Color32[] px, int y, Color c) => HLineSegment(px, y, 0, Size, c);

        static void HLineSegment(Color32[] px, int y, int x0, int x1, Color c)
        {
            for (int x = Mathf.Max(0, x0); x < Mathf.Min(Size, x1); x++) Blend(px, x, y, c);
        }

        static void VLineSegment(Color32[] px, int x, int y0, int y1, Color c)
        {
            for (int y = Mathf.Max(0, y0); y < Mathf.Min(Size, y1); y++) Blend(px, x, y, c);
        }

        /// Lighten or darken a block, for per-brick and per-stone variation.
        static void Shade(Color32[] px, int x0, int y0, int w, int h, float by)
        {
            var c = by > 0f ? Color.white : Color.black;
            Rect(px, x0, y0, x0 + w, y0 + h, new Color(c.r, c.g, c.b, Mathf.Abs(by)));
        }

        static void Grain(Color32[] px, ref Rng rng, float strength)
        {
            for (int i = 0; i < px.Length; i++)
            {
                float n = (rng.Next() - 0.5f) * 2f * strength;
                var d = px[i];
                px[i] = new Color32(
                    (byte)Mathf.Clamp(d.r + n * 255f, 0f, 255f),
                    (byte)Mathf.Clamp(d.g + n * 255f, 0f, 255f),
                    (byte)Mathf.Clamp(d.b + n * 255f, 0f, 255f),
                    255);
            }
        }

        static Texture2D Finish(Color32[] px, string name)
        {
            var tex = new Texture2D(Size, Size, TextureFormat.RGBA32, true)
            {
                name = name,
                // Repeat, because the wall UVs run past 1 in both directions --
                // Clamp would smear the last row of pixels up a tall building.
                wrapMode = TextureWrapMode.Repeat,
                filterMode = FilterMode.Bilinear,
                anisoLevel = 8,
            };
            tex.SetPixels32(px);
            tex.Apply(true, true);   // build mips, then drop the CPU copy
            return tex;
        }
    }
}
