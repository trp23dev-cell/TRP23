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
            => Finish(RawWall(style, windows), $"facade_{style}");

        /// <summary>
        /// The pixels, before they become a texture. Split out so the normal
        /// map can be derived from exactly the same draw rather than from a
        /// second pattern that would drift out of step with it.
        /// </summary>
        static Color32[] RawWall(string style, bool windows = false)
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
            return px;
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
            else if (kind == "entrance") Entrance(px, ref rng);

            Grain(px, ref rng, 0.03f);
            return Finish(px, $"ground_{kind}_{style}");
        }

        /// <summary>
        /// What you are walking on.
        ///
        /// The ground tiles at the same 6 metres as the walls, so these are
        /// drawn at real size: a paving flag is 600mm because a paving flag is
        /// 600mm, and setts are 100mm across because that is what the setts on
        /// Steep Hill are. Get that wrong and the street reads as the right
        /// pattern at the wrong scale, which is worse than no pattern -- it
        /// makes the whole city feel like a different size.
        /// </summary>
        public static Texture2D Surface(string kind)
        {
            var px = RawSurface(kind);
            return px == null ? null : Finish(px, $"surface_{kind}");
        }

        static Color32[] RawSurface(string kind)
        {
            var px = new Color32[Size * Size];
            var rng = new Rng(kind == null ? 5 : kind.Length * 17 + kind[0]);

            switch (kind)
            {
                case "paving":
                    // 600mm flags: ten across a six-metre tile.
                    Fill(px, TrapMaterials.Surface("paving"));
                    Grid(px, ref rng, 10, new Color(0f, 0f, 0f, 0.35f), 0.045f);
                    break;

                case "cobble":
                    // Setts, not cobbles, and about 100mm. Staggered, because
                    // they are laid in courses rather than a grid.
                    Fill(px, TrapMaterials.Surface("cobble"));
                    Setts(px, ref rng, 60);
                    break;

                case "kerb":
                    // Long kerbstones with a joint every 900mm.
                    Fill(px, TrapMaterials.Surface("kerb"));
                    for (int i = 0; i < 7; i++)
                        VLineSegment(px, i * Size / 7, 0, Size, new Color(0f, 0f, 0f, 0.4f));
                    Grain(px, ref rng, 0.04f);
                    break;

                case "asphalt":
                    Fill(px, TrapMaterials.Surface("asphalt"));
                    Grain(px, ref rng, 0.055f);
                    Chips(px, ref rng, 900, new Color(0.42f, 0.41f, 0.39f, 0.5f));
                    break;

                case "concrete":
                    Fill(px, TrapMaterials.Surface("concrete"));
                    Grid(px, ref rng, 3, new Color(0f, 0f, 0f, 0.28f), 0.02f);
                    Grain(px, ref rng, 0.03f);
                    break;

                case "gravel":
                    Fill(px, TrapMaterials.Surface("gravel"));
                    Chips(px, ref rng, 2600, new Color(0.52f, 0.47f, 0.38f, 0.55f));
                    Grain(px, ref rng, 0.07f);
                    break;

                case "grass":
                    Fill(px, TrapMaterials.Surface("grass"));
                    Chips(px, ref rng, 3200, new Color(0.33f, 0.44f, 0.20f, 0.5f));
                    Chips(px, ref rng, 1400, new Color(0.16f, 0.24f, 0.11f, 0.5f));
                    break;

                case "wood":
                    Fill(px, TrapMaterials.Surface("wood"));
                    Chips(px, ref rng, 2200, new Color(0.10f, 0.17f, 0.08f, 0.6f));
                    break;

                default:
                    return null;   // water and anything else stays plain
            }
            return px;
        }

        /// A square grid of joints, for flags and concrete bays.
        static void Grid(Color32[] px, ref Rng rng, int cells, Color joint, float variation)
        {
            int step = Size / cells;
            for (int i = 0; i < cells; i++)
            {
                HLine(px, i * step, joint);
                VLineSegment(px, i * step, 0, Size, joint);
                for (int j = 0; j < cells; j++)
                    Shade(px, i * step, j * step, step, step, rng.Range(-variation, variation));
            }
        }

        /// Setts: small, staggered, and each its own shade.
        static void Setts(Color32[] px, ref Rng rng, int across)
        {
            int w = Mathf.Max(2, Size / across);
            for (int r = 0; r * w < Size; r++)
            {
                int y = r * w;
                HLine(px, y, new Color(0f, 0f, 0f, 0.45f));
                int offset = (r % 2) * (w / 2);
                for (int x = -offset; x < Size; x += w)
                {
                    VLineSegment(px, Wrap(x), y, y + w, new Color(0f, 0f, 0f, 0.4f));
                    Shade(px, Wrap(x), y, w, w, rng.Range(-0.09f, 0.09f));
                }
            }
        }

        /// Scattered specks: aggregate in asphalt, stones in gravel, blades in grass.
        static void Chips(Color32[] px, ref Rng rng, int count, Color c)
        {
            for (int i = 0; i < count; i++)
            {
                int x = (int)(rng.Next() * Size);
                int y = (int)(rng.Next() * Size);
                Blend(px, x, y, c);
                if (rng.Next() < 0.4f) Blend(px, x + 1, y, c);
                if (rng.Next() < 0.3f) Blend(px, x, y + 1, c);
            }
        }

        /// <summary>Roof covering. Slate courses or clay pantiles.</summary>
        public static Texture2D Roof(string kind) => Finish(RawRoof(kind), $"roof_{kind}");

        static Color32[] RawRoof(string kind)
        {
            var px = new Color32[Size * Size];
            var rng = new Rng(kind == "pantile" ? 91 : 17);

            bool pantile = kind == "pantile";
            Fill(px, TrapMaterials.Roof(kind));

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
            return px;
        }

        // ------------------------------------------------------------ drawing

        /// <summary>
        /// The material's colour. Delegated, so there is exactly one table --
        /// this method existing separately is how the same constant ended up in
        /// two places and got multiplied by itself.
        /// </summary>
        static Color Base(string style) => TrapMaterials.Base(style);

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
        /// <summary>
        /// The way in to a shop.
        ///
        /// One per building, in the recessed bay. It is a door and a fanlight
        /// and nothing else -- no handle detail, no numbers, no name. **It does
        /// not open and it does not lead anywhere**: interaction is U07's and
        /// this must not grow toward it.
        /// </summary>
        static void Entrance(Color32[] px, ref Rng rng)
        {
            int fascia0 = Mathf.RoundToInt(0.06f * Size);
            int fascia1 = Mathf.RoundToInt(0.24f * Size);

            // Same fascia line as the shopfronts either side, so the band runs
            // across the frontage instead of stepping at the door.
            Rect(px, 0, fascia0, Size, fascia1, new Color(0.11f, 0.10f, 0.10f));

            int frame = Mathf.RoundToInt(0.20f * Size);
            int doorTop = fascia1 + 6;

            // Surround, then the leaf inside it.
            Rect(px, frame - 6, doorTop, Size - frame + 6, Size, new Color(0.16f, 0.15f, 0.14f));
            Rect(px, frame, doorTop + 8, Size - frame, Size, new Color(0.10f, 0.11f, 0.13f));

            // Fanlight over the door, and glazing in the upper leaf.
            Rect(px, frame + 4, doorTop + 12, Size - frame - 4,
                 Mathf.RoundToInt(0.30f * Size), new Color(0.26f, 0.23f, 0.18f));
            Rect(px, frame + 8, Mathf.RoundToInt(0.34f * Size), Size - frame - 8,
                 Mathf.RoundToInt(0.62f * Size), new Color(0.05f, 0.06f, 0.08f));
            Outline(px, frame + 8, Mathf.RoundToInt(0.34f * Size), Size - frame - 8,
                    Mathf.RoundToInt(0.62f * Size), new Color(0f, 0f, 0f, 0.6f));

            // Threshold.
            Rect(px, frame - 8, Size - 8, Size - frame + 8, Size, new Color(0.22f, 0.21f, 0.19f));
        }

        /// <summary>
        /// Painted trim: fascias and pilasters, for the whole city.
        ///
        /// ONE texture, not one per building. Trim is painted timber and
        /// rendered stone everywhere, and its job is to be a clean surface that
        /// separates things -- variation comes from the vertex tint, which
        /// costs nothing.
        /// </summary>
        public static Texture2D Trim()
        {
            var px = new Color32[Size * Size];
            var rng = new Rng(613);
            Fill(px, TrapMaterials.Surface("trim"));
            Grain(px, ref rng, 0.035f);
            // A faint horizontal parting, so a long fascia is not a dead flat
            // band of colour across forty metres.
            HLine(px, Mathf.RoundToInt(0.5f * Size), new Color(0f, 0f, 0f, 0.16f));
            return Finish(px, "trim");
        }

        static void Shopfront(Color32[] px, ref Rng rng)
        {
            int fascia0 = Mathf.RoundToInt(0.06f * Size);
            int fascia1 = Mathf.RoundToInt(0.24f * Size);
            int glass0 = fascia1 + 3;
            int glass1 = Mathf.RoundToInt(0.86f * Size);

            // Fascia board: where the sign goes.
            Rect(px, 0, fascia0, Size, fascia1, new Color(0.11f, 0.10f, 0.10f));

            // The window itself, in two lights with a mullion. Darker than the
            // wall by a long way: glass reads as glass because it is a hole in
            // a lit surface with a sharp specular on it, not because it is
            // blue. The specular comes from the material's smoothness.
            Rect(px, 8, glass0, Size - 8, glass1, new Color(0.045f, 0.055f, 0.075f));
            for (int i = 1; i < 3; i++)
                VLineSegment(px, i * Size / 3, glass0, glass1, new Color(0.24f, 0.23f, 0.21f));

            // Lit from inside, most of the time. A parade of dark shops at
            // street level is the single biggest thing that reads as "empty".
            if (rng.Next() < 0.7f)
            {
                Rect(px, 12, glass0 + 6, Size - 12, glass1 - 30, new Color(0.30f, 0.26f, 0.20f));
                // Falls off toward the back of the shop. A flat rectangle of
                // light reads as a lightbox; a gradient reads as a room.
                Rect(px, 12, glass0 + 6, Size - 12, glass0 + 26, new Color(0.40f, 0.35f, 0.27f, 0.7f));
            }

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

        /// <summary>
        /// A normal map derived from the albedo we just drew.
        ///
        /// WHY THIS WORKS RATHER THAN BEING A TRICK
        ///
        /// Every pattern here draws recesses DARK: mortar joints, sett gaps,
        /// paving grout, roof courses. That is not a coincidence of style, it
        /// is what those features are -- a joint is a groove, and a groove is
        /// in shadow. So the luminance of the albedo is already a height field,
        /// and a Sobel of it is already the surface normal.
        ///
        /// The alternative was a second hand-authored pattern pass per
        /// material, which would be more code, would drift out of step with the
        /// albedo the first time anyone tuned a colour, and would produce the
        /// same answer.
        ///
        /// Written as a plain RGB vector in a LINEAR texture and unpacked in
        /// the shader as rgb*2-1. Deliberately not Unity's DXT5nm convention:
        /// that packing exists for compression we are not using, and a runtime
        /// Texture2D that merely looks like a normal map is a well-known way to
        /// get a wall that lights inside out.
        /// </summary>
        static Texture2D Normal(Color32[] albedo, string name, float strength)
        {
            // Same flip as Finish, and BEFORE the Sobel rather than after.
            // Flipping the finished normal map would invert its green channel
            // and light every wall from the wrong side -- which looks almost
            // right, which is worse.
            albedo = FlipRows(albedo);

            var h = new float[Size * Size];
            for (int i = 0; i < h.Length; i++)
            {
                var c = albedo[i];
                h[i] = (c.r * 0.299f + c.g * 0.587f + c.b * 0.114f) / 255f;
            }

            var px = new Color32[Size * Size];
            for (int y = 0; y < Size; y++)
            {
                for (int x = 0; x < Size; x++)
                {
                    // Wrapping, because these textures tile -- sampling the far
                    // edge is correct here, not a mistake.
                    float l = h[y * Size + ((x - 1 + Size) % Size)];
                    float r = h[y * Size + ((x + 1) % Size)];
                    float d = h[((y - 1 + Size) % Size) * Size + x];
                    float u = h[((y + 1) % Size) * Size + x];

                    var n = new Vector3((l - r) * strength, (d - u) * strength, 1f).normalized;
                    px[y * Size + x] = new Color32(
                        (byte)Mathf.Clamp(Mathf.RoundToInt((n.x * 0.5f + 0.5f) * 255f), 0, 255),
                        (byte)Mathf.Clamp(Mathf.RoundToInt((n.y * 0.5f + 0.5f) * 255f), 0, 255),
                        (byte)Mathf.Clamp(Mathf.RoundToInt((n.z * 0.5f + 0.5f) * 255f), 0, 255),
                        255);
                }
            }

            // linear: true. A normal is a direction, not a colour, and putting
            // it through the sRGB curve bends every one of them.
            var tex = new Texture2D(Size, Size, TextureFormat.RGBA32, true, true)
            {
                name = name,
                wrapMode = TextureWrapMode.Repeat,
                filterMode = FilterMode.Bilinear,
                anisoLevel = 8,
            };
            tex.SetPixels32(px);
            tex.Apply(true, true);
            return tex;
        }

        /// <summary>
        /// The normal map for a material family, or null where relief would be
        /// wrong or wasted.
        ///
        /// Deliberately NOT one per building, and not one per key: eleven maps
        /// cover the whole city. Glass and painted render are flat surfaces in
        /// life, so giving them relief would be worse than giving them none,
        /// and it would cost memory on a phone to do it.
        /// </summary>
        public static Texture2D NormalFor(string family)
        {
            if (normals.TryGetValue(family, out var cached)) return cached;

            Texture2D made = null;
            switch (family)
            {
                case "brick":     made = Normal(RawWall("brick"), "n_brick", 7f); break;
                case "limestone": made = Normal(RawWall("limestone"), "n_limestone", 5f); break;
                case "monument":  made = Normal(RawWall("monument"), "n_monument", 5f); break;
                case "modern":    made = Normal(RawWall("modern"), "n_modern", 3f); break;
                case "slate":     made = Normal(RawRoof("slate"), "n_slate", 5f); break;
                case "pantile":   made = Normal(RawRoof("pantile"), "n_pantile", 8f); break;
                case "paving":    made = Normal(RawSurface("paving"), "n_paving", 5f); break;
                case "cobble":    made = Normal(RawSurface("cobble"), "n_cobble", 9f); break;
                case "kerb":      made = Normal(RawSurface("kerb"), "n_kerb", 4f); break;
                case "asphalt":   made = Normal(RawSurface("asphalt"), "n_asphalt", 2f); break;
                case "gravel":    made = Normal(RawSurface("gravel"), "n_gravel", 4f); break;
                // Trim is painted and flat by nature; relief on it would fight
                // the geometry that already gives it depth.
                // render, glass, grass, water, wood: flat by nature.
            }
            normals[family] = made;
            return made;
        }

        static readonly System.Collections.Generic.Dictionary<string, Texture2D> normals =
            new System.Collections.Generic.Dictionary<string, Texture2D>();

        /// <summary>
        /// Turn the drawing over.
        ///
        /// Every draw routine here works in image convention -- row 0 at the
        /// TOP -- which is what anyone writing `fascia at 0.06, stallriser at
        /// 0.86` means. Texture2D.SetPixels32 fills from the BOTTOM row up.
        /// Nothing reconciled the two, so every generated texture rendered
        /// upside down: shopfront fascias at pavement level, stallrisers at
        /// first-floor level, and window sills sitting on top of their windows.
        ///
        /// Found while adding bays, and it had to be fixed here rather than
        /// worked around, because the bay system aligns real geometry -- the
        /// fascia band -- to a painted band that was at the wrong end of the
        /// wall.
        ///
        /// One flip at the boundary, so the drawing code stays in the
        /// convention it was written in and every texture is corrected at once.
        /// </summary>
        static Color32[] FlipRows(Color32[] px)
        {
            var flipped = new Color32[px.Length];
            for (int y = 0; y < Size; y++)
            {
                int from = (Size - 1 - y) * Size;
                int to = y * Size;
                for (int x = 0; x < Size; x++) flipped[to + x] = px[from + x];
            }
            return flipped;
        }

        static Texture2D Finish(Color32[] px, string name)
        {
            px = FlipRows(px);
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
