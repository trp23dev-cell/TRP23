using System.Collections.Generic;
using UnityEngine;

namespace TrapMadeIt.World
{
    /// <summary>
    /// Footprints into walls and roofs.
    ///
    /// A direct port of src/world/buildingMesh.js, and the rules below were
    /// each a bug in the web client first. They are not stylistic:
    ///
    ///   WINDING. OSM does not agree which way round a footprint goes — 217 of
    ///   Lincoln's are clockwise and 300 anticlockwise. Emitting in ring order
    ///   builds two fifths of the city inside out, and with backface culling on
    ///   you see straight through it.
    ///
    ///   TRIANGLE ORDER. Culling reads the winding, NOT the normal. Setting a
    ///   correct normal on a backwards triangle renders nothing and every test
    ///   of the normals still passes.
    ///
    ///   ROOFS. 58% of footprints are concave — L-shaped corner shops, terraces
    ///   with back extensions. A fan from vertex zero spills roof outside the
    ///   walls on every one, so they are ear-clipped.
    ///
    ///   HEIGHTS. Walls run from `s` (street level, the HIGHEST ground under the
    ///   footprint) to s + h. Between `y` (the lowest ground) and `s` goes a
    ///   plinth. Founding at `y` buries the shopfront on every sloping site,
    ///   which on Steep Hill is most of them.
    /// </summary>
    public static class BuildingMeshBuilder
    {
        public class Buffers
        {
            public readonly List<Vector3> vertices = new List<Vector3>();
            public readonly List<Vector3> normals = new List<Vector3>();
            public readonly List<Vector2> uvs = new List<Vector2>();
            public readonly List<Color> colors = new List<Color>();
            public readonly List<int> triangles = new List<int>();

            public Mesh ToMesh(string name)
            {
                if (vertices.Count == 0) return null;
                var mesh = new Mesh
                {
                    name = name,
                    indexFormat = vertices.Count > 65000
                        ? UnityEngine.Rendering.IndexFormat.UInt32
                        : UnityEngine.Rendering.IndexFormat.UInt16,
                };
                mesh.SetVertices(vertices);
                mesh.SetNormals(normals);
                mesh.SetUVs(0, uvs);
                mesh.SetColors(colors);
                mesh.SetTriangles(triangles, 0);
                mesh.RecalculateBounds();
                return mesh;
            }
        }

        /// Signed area of a flat [x,z,...] ring. Negative is clockwise.
        public static float SignedArea(float[] ring)
        {
            float a = 0f;
            int n = ring.Length / 2;
            for (int i = 0, j = n - 1; i < n; j = i++)
            {
                a += ring[j * 2] * ring[i * 2 + 1] - ring[i * 2] * ring[j * 2 + 1];
            }
            return a * 0.5f;
        }

        /// Vertex order guaranteed anticlockwise, whatever OSM did.
        public static int[] NormalisedOrder(float[] ring)
        {
            int n = ring.Length / 2;
            var order = new int[n];
            bool reverse = SignedArea(ring) < 0f;
            for (int i = 0; i < n; i++) order[i] = reverse ? n - 1 - i : i;
            return order;
        }

        /// <summary>
        /// Ear clipping. Slower than a fan and correct on concave shapes, which
        /// most of these are. Runs once per building.
        /// </summary>
        public static List<int> Triangulate(float[] ring, int[] order)
        {
            var outIdx = new List<int>();
            int n = order.Length;
            if (n < 3) return outIdx;

            float Px(int k) => ring[order[k] * 2];
            float Pz(int k) => ring[order[k] * 2 + 1];
            float Cross(float ax, float az, float bx, float bz, float cx, float cz)
                => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);

            bool InTriangle(float ax, float az, float bx, float bz, float cx, float cz, float x, float z)
            {
                float d1 = Cross(ax, az, bx, bz, x, z);
                float d2 = Cross(bx, bz, cx, cz, x, z);
                float d3 = Cross(cx, cz, ax, az, x, z);
                bool neg = d1 < 0 || d2 < 0 || d3 < 0;
                bool pos = d1 > 0 || d2 > 0 || d3 > 0;
                return !(neg && pos);
            }

            var live = new List<int>(n);
            for (int i = 0; i < n; i++) live.Add(i);

            int guard = 0;
            while (live.Count > 3 && guard < n * n + 16)
            {
                guard++;
                bool clipped = false;
                for (int k = 0; k < live.Count; k++)
                {
                    int i0 = live[(k - 1 + live.Count) % live.Count];
                    int i1 = live[k];
                    int i2 = live[(k + 1) % live.Count];
                    float ax = Px(i0), az = Pz(i0);
                    float bx = Px(i1), bz = Pz(i1);
                    float cx = Px(i2), cz = Pz(i2);

                    // Anticlockwise ring, so an ear turns left.
                    if (Cross(ax, az, bx, bz, cx, cz) <= 0f) continue;

                    bool contains = false;
                    foreach (int m in live)
                    {
                        if (m == i0 || m == i1 || m == i2) continue;
                        if (InTriangle(ax, az, bx, bz, cx, cz, Px(m), Pz(m))) { contains = true; break; }
                    }
                    if (contains) continue;

                    outIdx.Add(i0); outIdx.Add(i1); outIdx.Add(i2);
                    live.RemoveAt(k);
                    clipped = true;
                    break;
                }
                // Degenerate or self-intersecting (OSM has a few). Fall back
                // rather than spin: a slightly wrong roof beats a hang.
                if (!clipped) break;
            }

            for (int i = 1; i < live.Count - 1; i++)
            {
                outIdx.Add(live[0]); outIdx.Add(live[i]); outIdx.Add(live[i + 1]);
            }
            return outIdx;
        }

        /// <summary>
        /// One buffer per material, created as needed.
        ///
        /// Every building in a tile used to merge into a single walls mesh with
        /// a single material, which meant a brick terrace and a limestone
        /// cathedral had to be the same surface -- no facade could be given to
        /// either without giving it to both. Splitting by material is what makes
        /// the textures possible at all; the merge still happens, just once per
        /// material rather than once per tile, so a tile costs a handful of draw
        /// calls instead of one, and nowhere near one per building.
        /// </summary>
        public class Sink
        {
            readonly Dictionary<string, Buffers> byMaterial = new Dictionary<string, Buffers>();

            public Buffers Get(string key)
            {
                if (!byMaterial.TryGetValue(key, out var buf))
                {
                    buf = new Buffers();
                    byMaterial[key] = buf;
                }
                return buf;
            }

            public Dictionary<string, Buffers> All => byMaterial;
        }

        /// The material key for a building's upper storeys.
        public static string WallKey(BuildingData b) => "wall:" + (b.st ?? "brick");

        /// The material key for its ground floor, which is a different surface:
        /// a shop is glass, a house is a door, a flank wall is neither.
        public static string GroundKey(BuildingData b) =>
            "ground:" + (b.g ?? "blank") + ":" + (b.st ?? "brick");

        /// Slate or clay pantile. Lincoln is mostly pantile downhill and slate
        /// on the grander uphill roofs, which follows the same split as the
        /// walls: the limestone belt is where the money was.
        public static string RoofKey(BuildingData b) =>
            "roof:" + (b.st == "limestone" || b.st == "monument" ? "slate" : "pantile");

        public static void Extrude(BuildingData b, Sink sink)
            => Extrude(b, sink, facades: false);

        /// <param name="facades">
        /// WORLD-V02 bay subdivision. Gated per tile by TrapQuality, so the
        /// High Street gets articulated frontages and the ring road keeps the
        /// cheap path. Passed in rather than looked up: this class does the
        /// geometry and does not get to decide policy.
        /// </param>
        public static void Extrude(BuildingData b, Sink sink, bool facades)
        {
            Extrude(b, sink.Get(WallKey(b)), sink.Get(RoofKey(b)),
                    sink.Get(GroundKey(b)),
                    facades ? sink.Get(TrimKey) : null,
                    facades ? sink.Get(EntranceKey(b)) : null,
                    facades);
        }

        /// Fascias and pilasters. ONE key for the whole city, not one per
        /// building -- trim is painted timber and stone everywhere, and a
        /// material per bay is the fastest way to turn a tile into a thousand
        /// draw calls.
        public const string TrimKey = "trim";

        /// The door bay of a shop. Houses already have a door in their ground
        /// texture, so they keep it and cost nothing extra.
        public static string EntranceKey(BuildingData b) =>
            b.g == "shopfront" ? "ground:entrance:" + (b.st ?? "brick") : GroundKey(b);

        public static void Extrude(BuildingData b, Buffers walls, Buffers roofs,
                                   Buffers ground = null, Buffers trim = null,
                                   Buffers entrance = null, bool facades = false)
        {
            var ring = b.p;
            if (ring == null || ring.Length < 6) return;

            int n = ring.Length / 2;
            var order = NormalisedOrder(ring);

            var tintEarly = WallColour(b);

            // Some things are not a footprint with storeys on top. A city gate
            // is a hole in a wall you walk through; a cathedral is a nave with
            // towers; a castle is a curtain wall around a bailey. Extruding
            // their outline is not a slightly-wrong version of them, it is a
            // different object — Stonebow came out as a solid block across the
            // road, and the Cathedral as a slab.
            if (b.m == "gateway") { Gateway(ring, order, b.s, b.h, tintEarly, walls); return; }
            if (b.m == "cathedral") { Cathedral(ring, order, b.s, b.h, tintEarly, walls, roofs); return; }
            if (b.m == "castle") { CurtainWall(ring, order, b.s, b.h, tintEarly, walls); return; }

            float street = b.s;          // the highest ground under it
            float baseY = b.y;           // the lowest, less a skirt
            float top = street + b.h;

            var tint = WallColour(b);

            // Monuments map one texture over the whole elevation. Per storey
            // gave an 83m cathedral twenty-six rows of office windows.
            float vSpan = b.st == "monument" ? Mathf.Max(b.h, 1f) : TrapGeo.Storey;

            // Which wall is the frontage, and therefore carries the door.
            // The longest one: a terrace's front is longer than its returns,
            // and a corner shop's front is the side facing the wider street.
            int frontEdge = -1;
            float frontLen = 0f;
            if (facades)
            {
                for (int k = 0; k < n; k++)
                {
                    int i2 = order[k], j2 = order[(k + 1) % n];
                    float dx = ring[j2 * 2] - ring[i2 * 2], dz = ring[j2 * 2 + 1] - ring[i2 * 2 + 1];
                    float l2 = Mathf.Sqrt(dx * dx + dz * dz);
                    if (l2 > frontLen) { frontLen = l2; frontEdge = k; }
                }
            }

            for (int k = 0; k < n; k++)
            {
                int i = order[k];
                int j = order[(k + 1) % n];
                float ax = ring[i * 2], az = ring[i * 2 + 1];
                float bx = ring[j * 2], bz = ring[j * 2 + 1];

                float ex = bx - ax, ez = bz - az;
                float len = Mathf.Sqrt(ex * ex + ez * ez);
                if (len < 0.01f) continue;

                // Anticlockwise ring: the outward normal is the edge turned right.
                float nx = ez / len, nz = -ex / len;
                float ux = ex / len, uz = ez / len;   // along the wall

                if (street > baseY + 0.02f)
                {
                    // The plinth stays whole. It is below the pavement line and
                    // has no openings, so dividing it would cost triangles to
                    // draw exactly the same thing.
                    Quad(walls, ax, az, bx, bz, baseY, street, nx, nz, len, tint, 0.35f, 0.6f, baseY, vSpan);
                }

                float groundTop = Mathf.Min(street + TrapGeo.Storey, top);
                bool hasGround = ground != null && b.st != "monument" && groundTop > street + 0.4f;

                if (!facades || b.st == "monument")
                {
                    // The cheap path, unchanged. Background tiles and monuments
                    // -- a cathedral has no shopfront and no bay rhythm.
                    if (hasGround)
                    {
                        Quad(ground, ax, az, bx, bz, street, groundTop, nx, nz, len, tint, 0.55f, 1f, street, vSpan);
                        if (top > groundTop + 0.1f)
                            Quad(walls, ax, az, bx, bz, groundTop, top, nx, nz, len, tint, 0.72f, 1f, street, vSpan);
                    }
                    else
                    {
                        Quad(walls, ax, az, bx, bz, street, top, nx, nz, len, tint, 0.62f, 1f, street, vSpan);
                    }
                    continue;
                }

                // ---- WORLD-V02: bays ----
                int doorBay = -1;
                if (k == frontEdge)
                    doorBay = FacadeLayout.EntranceBay(FacadeLayout.CountFor(len, b.i, k), b.i);

                var bays = FacadeLayout.Divide(len, b.i, k, doorBay);
                bool frontage = len >= FacadeLayout.MinArticulated && bays.Count > 1;

                for (int q = 0; q < bays.Count; q++)
                {
                    var bay = bays[q];
                    float sx = ax + ux * bay.Start, sz = az + uz * bay.Start;
                    float exx = ax + ux * bay.End, ezz = az + uz * bay.End;

                    // Each bay gets its own colour, very slightly. This is the
                    // cheapest cue there is -- no triangles at all -- and it is
                    // most of what makes a terrace stop reading as one object.
                    // Kept tiny on purpose: a High Street is not a rainbow.
                    var bayTint = tint * (1f + TrapHash.Signed(b.i, 2100 + k * 32 + q) * 0.06f);

                    if (hasGround)
                    {
                        var surface = bay.Entrance && entrance != null ? entrance : ground;

                        if (bay.Entrance)
                        {
                            // A recessed doorway. One per building, so the cost
                            // is bounded, and it is the single clearest signal
                            // that a frontage has a way in.
                            Recess(surface, walls, sx, sz, exx, ezz, street, groundTop,
                                   nx, nz, bay.Width, bayTint, street, vSpan, 0.16f);
                        }
                        else
                        {
                            BayQuad(surface, sx, sz, exx, ezz, street, groundTop,
                                    nx, nz, bayTint, 0.55f, 1f, street, vSpan);
                        }

                        // Fascia: the signboard band over a shopfront. Only on
                        // shops, and only on an articulated frontage -- a
                        // fascia round the back of a building is nonsense.
                        if (trim != null && frontage && b.g == "shopfront")
                            Fascia(trim, sx, sz, exx, ezz, groundTop, nx, nz, bayTint);

                        if (top > groundTop + 0.1f)
                            BayQuad(walls, sx, sz, exx, ezz, groundTop, top,
                                    nx, nz, bayTint, 0.72f, 1f, street, vSpan);
                    }
                    else
                    {
                        BayQuad(walls, sx, sz, exx, ezz, street, top,
                                nx, nz, bayTint, 0.62f, 1f, street, vSpan);
                    }

                    // Pilaster on the joint between this bay and the next. Not
                    // after the last one -- that is the building corner, which
                    // already reads as a break.
                    if (trim != null && frontage && q < bays.Count - 1)
                        Pilaster(trim, ax + ux * bay.End, az + uz * bay.End,
                                 ux, uz, nx, nz, street, top, tint);
                }
            }

            // Roof. Lincoln has almost no flat domestic roofs, and a ridge
            // changes the skyline more than any texture does — so anything
            // close enough to rectangular gets one, and awkward shapes fall
            // back to flat.
            var obb = OrientedBox(ring, order);
            float area = Mathf.Abs(SignedArea(ring));
            float fill = obb.valid ? area / Mathf.Max(obb.w * obb.d, 0.001f) : 0f;

            if (b.rs != "flat" && obb.valid && fill > 0.78f && Mathf.Min(obb.w, obb.d) > 3.5f)
            {
                PitchedRoof(roofs, obb, top, tint);
            }
            else
            {
                FlatRoof(roofs, ring, order, top, tint);
            }
        }

        /// <summary>
        /// The per-building VARIATION written into the vertex colour.
        ///
        /// Not the material colour. That lives in the texture, once -- see
        /// TrapMaterials for the contract and for what happened when this
        /// method returned a material colour too.
        ///
        /// The tiler's tint carries its style's hue, because in the web client
        /// it was laid over a neutral canvas. Dividing by the style mean leaves
        /// only how this building differs from the average of its kind, which
        /// is what makes a terrace read as separate properties rather than one
        /// long extrusion.
        /// </summary>
        static Color WallColour(BuildingData b) => TrapMaterials.Variation(b.c, b.st);

        static void FlatRoof(Buffers b, float[] ring, int[] order, float top, Color tint)
        {
            var tris = Triangulate(ring, order);
            int vbase = b.vertices.Count;
            for (int k = 0; k < order.Length; k++)
            {
                int i = order[k];
                b.vertices.Add(new Vector3(ring[i * 2], top, ring[i * 2 + 1]));
                b.normals.Add(Vector3.up);
                b.uvs.Add(new Vector2(ring[i * 2] / 8f, ring[i * 2 + 1] / 8f));
                b.colors.Add(tint);
            }
            // Anticlockwise in plan faces DOWN once lifted, so the order flips.
            for (int t = 0; t < tris.Count; t += 3)
            {
                b.triangles.Add(vbase + tris[t]);
                b.triangles.Add(vbase + tris[t + 2]);
                b.triangles.Add(vbase + tris[t + 1]);
            }
        }

        public struct Obb
        {
            public bool valid;
            public float cx, cz, ux, uz, w, d;
        }

        /// <summary>
        /// Smallest-area rectangle enclosing the footprint, by rotating
        /// calipers over every edge direction. Gives a roof a ridge that runs
        /// the way the building actually runs, rather than along whichever axis
        /// happens to be north.
        /// </summary>
        public static Obb OrientedBox(float[] ring, int[] order)
        {
            var best = new Obb { valid = false };
            int n = order.Length;
            if (n < 3) return best;

            float bestArea = float.MaxValue;
            for (int k = 0; k < n; k++)
            {
                int i = order[k];
                int j = order[(k + 1) % n];
                float ex = ring[j * 2] - ring[i * 2];
                float ez = ring[j * 2 + 1] - ring[i * 2 + 1];
                float len = Mathf.Sqrt(ex * ex + ez * ez);
                if (len < 0.5f) continue;
                float ux = ex / len, uz = ez / len;

                float minU = float.MaxValue, maxU = float.MinValue;
                float minV = float.MaxValue, maxV = float.MinValue;
                for (int m = 0; m < n; m++)
                {
                    int p = order[m];
                    float u = ring[p * 2] * ux + ring[p * 2 + 1] * uz;
                    float v = -ring[p * 2] * uz + ring[p * 2 + 1] * ux;
                    if (u < minU) minU = u;
                    if (u > maxU) maxU = u;
                    if (v < minV) minV = v;
                    if (v > maxV) maxV = v;
                }
                float a = (maxU - minU) * (maxV - minV);
                if (a >= bestArea) continue;

                bestArea = a;
                float cu = (minU + maxU) * 0.5f, cv = (minV + maxV) * 0.5f;
                best = new Obb
                {
                    valid = true,
                    cx = cu * ux - cv * uz,
                    cz = cu * uz + cv * ux,
                    ux = ux, uz = uz,
                    w = maxU - minU,
                    d = maxV - minV,
                };
            }
            return best;
        }

        /// A gabled roof: ridge along the long axis, two slopes, two gable ends.
        static void PitchedRoof(Buffers b, Obb o, float top, Color tint)
        {
            bool alongLong = o.w >= o.d;
            float halfLong = (alongLong ? o.w : o.d) * 0.5f;
            float halfShort = (alongLong ? o.d : o.w) * 0.5f;
            // ~38 degrees, the usual British pitch, capped so a wide building
            // does not grow a spire.
            float rise = Mathf.Min(halfShort * 0.78f, 5.2f);
            float ridgeY = top + rise;

            float lx = alongLong ? o.ux : -o.uz;
            float lz = alongLong ? o.uz : o.ux;
            float sx = -lz, sz = lx;

            Vector3 P(float l, float sOff, float y)
                => new Vector3(o.cx + lx * l + sx * sOff, y, o.cz + lz * l + sz * sOff);

            var eaveA0 = P(-halfLong, -halfShort, top);
            var eaveA1 = P(halfLong, -halfShort, top);
            var eaveB0 = P(-halfLong, halfShort, top);
            var eaveB1 = P(halfLong, halfShort, top);
            var ridge0 = P(-halfLong, 0f, ridgeY);
            var ridge1 = P(halfLong, 0f, ridgeY);

            float slope = Mathf.Sqrt(halfShort * halfShort + rise * rise);
            AddQuad(b, eaveA0, eaveA1, ridge1, ridge0, halfLong * 2f, slope, tint);
            AddQuad(b, ridge0, ridge1, eaveB1, eaveB0, halfLong * 2f, slope, tint);
            // Gable ends, or you see daylight through the roof from the side.
            AddTri(b, eaveA0, ridge0, eaveB0, tint);
            AddTri(b, eaveB1, ridge1, eaveA1, tint);
        }

        static Vector3 FaceNormal(Vector3 p, Vector3 q, Vector3 r)
        {
            var nrm = Vector3.Cross(q - p, r - p);
            return nrm.sqrMagnitude < 1e-9f ? Vector3.up : nrm.normalized;
        }

        static void AddQuad(Buffers b, Vector3 p0, Vector3 p1, Vector3 p2, Vector3 p3,
                            float uSpan, float vSpan, Color tint)
        {
            int i = b.vertices.Count;
            var nrm = FaceNormal(p0, p1, p2);
            b.vertices.Add(p0); b.vertices.Add(p1); b.vertices.Add(p2); b.vertices.Add(p3);
            for (int k = 0; k < 4; k++) { b.normals.Add(nrm); b.colors.Add(tint); }
            b.uvs.Add(new Vector2(0f, 0f));
            b.uvs.Add(new Vector2(uSpan / 8f, 0f));
            b.uvs.Add(new Vector2(uSpan / 8f, vSpan / 8f));
            b.uvs.Add(new Vector2(0f, vSpan / 8f));
            b.triangles.Add(i); b.triangles.Add(i + 1); b.triangles.Add(i + 2);
            b.triangles.Add(i); b.triangles.Add(i + 2); b.triangles.Add(i + 3);
        }

        static void AddTri(Buffers b, Vector3 p0, Vector3 p1, Vector3 p2, Color tint)
        {
            int i = b.vertices.Count;
            var nrm = FaceNormal(p0, p1, p2);
            b.vertices.Add(p0); b.vertices.Add(p1); b.vertices.Add(p2);
            for (int k = 0; k < 3; k++)
            {
                b.normals.Add(nrm);
                b.colors.Add(tint);
                b.uvs.Add(new Vector2(0f, 0f));
            }
            b.triangles.Add(i); b.triangles.Add(i + 1); b.triangles.Add(i + 2);
        }


        // ---------------------------------------------------------- massing

        /// A box, given a centre, two axes and a height range. The workhorse
        /// for everything built rather than extruded.
        static void Box(Buffers b, Vector3 c, Vector3 along, Vector3 across,
                        float halfA, float halfC, float y0, float y1, Color tint)
        {
            Vector3 P(float a, float x, float y) => new Vector3(
                c.x + along.x * a + across.x * x, y, c.z + along.z * a + across.z * x);

            var corners = new[]
            {
                new[] { P(-halfA, -halfC, y0), P(halfA, -halfC, y0), P(halfA, -halfC, y1), P(-halfA, -halfC, y1) },
                new[] { P(halfA, halfC, y0), P(-halfA, halfC, y0), P(-halfA, halfC, y1), P(halfA, halfC, y1) },
                new[] { P(halfA, -halfC, y0), P(halfA, halfC, y0), P(halfA, halfC, y1), P(halfA, -halfC, y1) },
                new[] { P(-halfA, halfC, y0), P(-halfA, -halfC, y0), P(-halfA, -halfC, y1), P(-halfA, halfC, y1) },
            };
            foreach (var f in corners) AddQuad(b, f[0], f[1], f[2], f[3], halfA * 2f, y1 - y0, tint);
            AddQuad(b, P(-halfA, -halfC, y1), P(halfA, -halfC, y1), P(halfA, halfC, y1), P(-halfA, halfC, y1),
                    halfA * 2f, halfC * 2f, tint);
        }

        /// <summary>
        /// A city gate: two piers with an archway between them.
        ///
        /// Lincoln has twelve, every one tagged in OSM. Extruded as plain
        /// footprints they became solid blocks parked across the road, which is
        /// why the Stone Bow had no arch in it.
        /// </summary>
        static void Gateway(float[] ring, int[] order, float street, float height, Color tint, Buffers b)
        {
            var o = OrientedBox(ring, order);
            if (!o.valid) return;

            bool alongLong = o.w >= o.d;
            float halfLong = (alongLong ? o.w : o.d) * 0.5f;
            float halfShort = (alongLong ? o.d : o.w) * 0.5f;
            var along = new Vector3(alongLong ? o.ux : -o.uz, 0f, alongLong ? o.uz : o.ux);
            var across = new Vector3(-along.z, 0f, along.x);
            var c = new Vector3(o.cx, 0f, o.cz);

            float openHalf = Mathf.Min(halfLong * 0.42f, 4.2f);
            float archTop = street + Mathf.Min(height * 0.62f, 5.0f);
            float top = street + height;

            // Piers at the ends, and the span over the opening.
            float pierHalf = (halfLong - openHalf) * 0.5f;
            Box(b, c + along * (openHalf + pierHalf), along, across, pierHalf, halfShort, street, top, tint);
            Box(b, c - along * (openHalf + pierHalf), along, across, pierHalf, halfShort, street, top, tint);
            Box(b, c, along, across, openHalf, halfShort, archTop, top, tint);

            // Stepped chamfers into the arch head, so the opening is not a bare
            // rectangle. Cheaper than a curve and reads the same at this size.
            for (int i = 0; i < 3; i++)
            {
                float t = (i + 1) / 4f;
                float inset = openHalf * (1f - t * 0.55f);
                float y1 = archTop - (archTop - street) * 0.06f * i;
                float y0 = archTop - (archTop - street) * 0.06f * (i + 1);
                Box(b, c, along, across, inset, halfShort, y0, y1, tint);
            }
        }

        /// <summary>
        /// Lincoln Cathedral: a nave with a central tower and two west towers.
        ///
        /// Its outline is one big polygon, so extruding it to a real 83m
        /// produced a cliff of windows. The silhouette people recognise is the
        /// tower group, and that has to be built rather than inferred.
        /// </summary>
        static void Cathedral(float[] ring, int[] order, float street, float height,
                              Color tint, Buffers walls, Buffers roofs)
        {
            var o = OrientedBox(ring, order);
            float naveTop = street + Mathf.Min(height * 0.29f, 26f);

            // The body of the church at its real footprint.
            int n = order.Length;
            for (int k = 0; k < n; k++)
            {
                int i = order[k];
                int j = order[(k + 1) % n];
                float ax = ring[i * 2], az = ring[i * 2 + 1];
                float bx = ring[j * 2], bz = ring[j * 2 + 1];
                float ex = bx - ax, ez = bz - az;
                float len = Mathf.Sqrt(ex * ex + ez * ez);
                if (len < 0.01f) continue;
                Quad(walls, ax, az, bx, bz, street, naveTop, ez / len, -ex / len, len,
                     tint, 0.62f, 1f, street, Mathf.Max(naveTop - street, 1f));
            }
            FlatRoof(roofs, ring, order, naveTop, tint);
            if (!o.valid) return;

            bool alongLong = o.w >= o.d;
            float halfLong = (alongLong ? o.w : o.d) * 0.5f;
            float halfShort = (alongLong ? o.d : o.w) * 0.5f;
            var along = new Vector3(alongLong ? o.ux : -o.uz, 0f, alongLong ? o.uz : o.ux);
            var across = new Vector3(-along.z, 0f, along.x);
            var c = new Vector3(o.cx, 0f, o.cz);

            // The central tower — for three centuries, with its spire, the
            // tallest structure in the world.
            float tw = Mathf.Min(halfShort * 0.72f, 9f);
            Box(walls, c, along, across, tw, tw, naveTop - 1f, street + height, tint);

            // The two west towers, at the lower-x end so the front faces west.
            float wt = Mathf.Min(halfShort * 0.46f, 6.5f);
            float wl = halfLong - wt - 1f;
            float sign = along.x < 0f ? 1f : -1f;
            float wtTop = street + height * 0.74f;
            float off = Mathf.Min(halfShort - wt - 0.5f, wt * 2.1f);
            for (int s2 = -1; s2 <= 1; s2 += 2)
            {
                Box(walls, c + along * (sign * wl) + across * (off * s2),
                    along, across, wt, wt, naveTop - 1f, wtTop, tint);
            }
        }

        /// <summary>
        /// A castle: curtain wall around the perimeter, towers along it, and the
        /// bailey left as open ground.
        ///
        /// OSM gives Lincoln Castle as one polygon covering the whole precinct,
        /// so extruded it is a featureless block the size of a district sitting
        /// where the bailey should be. What is actually there is a wall you walk
        /// around.
        /// </summary>
        static void CurtainWall(float[] ring, int[] order, float street, float height, Color tint, Buffers b)
        {
            int n = order.Length;
            float top = street + height;
            const float thickness = 1.6f;

            for (int k = 0; k < n; k++)
            {
                int i = order[k];
                int j = order[(k + 1) % n];
                float ax = ring[i * 2], az = ring[i * 2 + 1];
                float bx = ring[j * 2], bz = ring[j * 2 + 1];
                float ex = bx - ax, ez = bz - az;
                float len = Mathf.Sqrt(ex * ex + ez * ez);
                if (len < 0.5f) continue;

                float nx = ez / len * thickness, nz = -ex / len * thickness;
                // Outer and inner face, plus the wall-walk on top.
                Quad(b, ax, az, bx, bz, street, top, ez / len, -ex / len, len, tint, 0.5f, 1f, street, 8f);
                Quad(b, bx - nx, bz - nz, ax - nx, az - nz, street, top, -ez / len, ex / len, len, tint, 0.5f, 1f, street, 8f);
                AddQuad(b, new Vector3(ax, top, az), new Vector3(bx, top, bz),
                        new Vector3(bx - nx, top, bz - nz), new Vector3(ax - nx, top, az - nz),
                        len, thickness, tint);

                // A tower every so often, as a real curtain has.
                if (k % 3 == 0 && len > 8f)
                {
                    var c = new Vector3(ax, 0f, az);
                    Box(b, c, new Vector3(1f, 0f, 0f), new Vector3(0f, 0f, 1f),
                        3.2f, 3.2f, street, street + height * 1.5f, tint);
                }
            }
        }

        // ------------------------------------------------ WORLD-V02 façade parts
        //
        // Every one of these is a handful of quads and none of them is a
        // GameObject, a component or an Update. A tile's bays, fascias,
        // pilasters and doorways all merge into the same per-material buffers
        // the walls already use, so an articulated High Street tile costs a few
        // more draw calls than a plain one -- not one per window.

        /// <summary>
        /// One bay of wall. The whole point is the UV: **u runs 0 to 1 across
        /// the bay**, so exactly one texture tile fits it.
        ///
        /// That single change is what aligns windows to bays. The old code
        /// tiled by metres (u = len / 6), which meant a 17m wall got 2.83 tiles
        /// and the last window was sliced in half at the corner on almost every
        /// building in Lincoln. Now the texture's two windows land inside the
        /// bay by construction, at whatever spacing the bay is wide, and a
        /// corner is always a wall rather than half a window.
        /// </summary>
        static void BayQuad(Buffers b, float ax, float az, float bx, float bz,
                            float y0, float y1, float nx, float nz,
                            Color tint, float bottomShade, float topShade,
                            float baseY, float vSpan)
        {
            int i = b.vertices.Count;
            b.vertices.Add(new Vector3(ax, y0, az));
            b.vertices.Add(new Vector3(bx, y0, bz));
            b.vertices.Add(new Vector3(bx, y1, bz));
            b.vertices.Add(new Vector3(ax, y1, az));

            var normal = new Vector3(nx, 0f, nz);
            for (int k = 0; k < 4; k++) b.normals.Add(normal);

            float v0 = (y0 - baseY) / vSpan;
            float v1 = (y1 - baseY) / vSpan;
            b.uvs.Add(new Vector2(0f, v0));
            b.uvs.Add(new Vector2(1f, v0));
            b.uvs.Add(new Vector2(1f, v1));
            b.uvs.Add(new Vector2(0f, v1));

            var lo = tint * bottomShade;
            var hi = tint * topShade;
            b.colors.Add(lo); b.colors.Add(lo); b.colors.Add(hi); b.colors.Add(hi);

            b.triangles.Add(i); b.triangles.Add(i + 2); b.triangles.Add(i + 1);
            b.triangles.Add(i); b.triangles.Add(i + 3); b.triangles.Add(i + 2);
        }

        /// <summary>A quad from four corners, for the parts that are not vertical wall.</summary>
        static void Face(Buffers b, Vector3 p0, Vector3 p1, Vector3 p2, Vector3 p3,
                         Vector3 normal, Color tint, float uMax = 1f, float vMax = 1f)
        {
            int i = b.vertices.Count;
            b.vertices.Add(p0); b.vertices.Add(p1); b.vertices.Add(p2); b.vertices.Add(p3);
            for (int k = 0; k < 4; k++) b.normals.Add(normal);
            b.uvs.Add(new Vector2(0f, 0f));
            b.uvs.Add(new Vector2(uMax, 0f));
            b.uvs.Add(new Vector2(uMax, vMax));
            b.uvs.Add(new Vector2(0f, vMax));
            for (int k = 0; k < 4; k++) b.colors.Add(tint);
            b.triangles.Add(i); b.triangles.Add(i + 2); b.triangles.Add(i + 1);
            b.triangles.Add(i); b.triangles.Add(i + 3); b.triangles.Add(i + 2);
        }

        /// <summary>How far trim stands proud of the wall. Deliberately tiny.</summary>
        const float TrimDepth = 0.10f;
        const float PilasterWidth = 0.34f;
        const float FasciaHeight = 0.45f;

        /// <summary>
        /// The vertical strip between two bays.
        ///
        /// Real geometry rather than a painted stripe, because a pilaster's
        /// whole job is to catch the light from one side and shade on the
        /// other -- at the grazing angles you walk a street at, a painted one
        /// simply is not there.
        ///
        /// 10cm proud. That is enough to read and far too little to interfere
        /// with the pavement: collision comes from the OSM footprint and is
        /// untouched, so this can never push the player into the road.
        /// </summary>
        static void Pilaster(Buffers b, float x, float z, float ux, float uz,
                             float nx, float nz, float y0, float y1, Color tint)
        {
            float hw = PilasterWidth * 0.5f;
            var along = new Vector3(ux, 0f, uz);
            var outward = new Vector3(nx, 0f, nz);
            var at = new Vector3(x, 0f, z);

            var l0 = at - along * hw;
            var r0 = at + along * hw;
            var l1 = l0 + outward * TrimDepth;
            var r1 = r0 + outward * TrimDepth;

            float h = Mathf.Max(y1 - y0, 0.1f);
            var shade = tint * 0.92f;

            // Front, then the two returns. The back is against the wall.
            Face(b, new Vector3(l1.x, y0, l1.z), new Vector3(r1.x, y0, r1.z),
                    new Vector3(r1.x, y1, r1.z), new Vector3(l1.x, y1, l1.z),
                    outward, tint, 1f, h / TrapGeo.Storey);
            Face(b, new Vector3(l0.x, y0, l0.z), new Vector3(l1.x, y0, l1.z),
                    new Vector3(l1.x, y1, l1.z), new Vector3(l0.x, y1, l0.z),
                    -along, shade, 1f, h / TrapGeo.Storey);
            Face(b, new Vector3(r1.x, y0, r1.z), new Vector3(r0.x, y0, r0.z),
                    new Vector3(r0.x, y1, r0.z), new Vector3(r1.x, y1, r1.z),
                    along, shade, 1f, h / TrapGeo.Storey);
        }

        /// <summary>
        /// The signboard band over a shopfront, and the line that separates it
        /// from the storeys above.
        ///
        /// Two faces, not three: the front and the underside. The top surface
        /// is 10cm deep and sits at first-floor level, so from the pavement it
        /// is never seen, and paying four triangles a bay across a city for a
        /// surface nobody looks at is how budgets go.
        ///
        /// **No lettering.** Signage is a later authored package -- this is the
        /// board it will eventually go on.
        /// </summary>
        static void Fascia(Buffers b, float ax, float az, float bx, float bz,
                           float yTop, float nx, float nz, Color tint)
        {
            var outward = new Vector3(nx, 0f, nz);
            float yBot = yTop - FasciaHeight;

            var a0 = new Vector3(ax, yBot, az) + outward * TrimDepth;
            var b0 = new Vector3(bx, yBot, bz) + outward * TrimDepth;
            var a1 = new Vector3(ax, yTop, az) + outward * TrimDepth;
            var b1 = new Vector3(bx, yTop, bz) + outward * TrimDepth;

            Face(b, a0, b0, b1, a1, outward, tint);
            // Underside, in shadow: this is the soffit, and it is what makes
            // the board read as standing off the wall rather than painted on.
            Face(b, new Vector3(ax, yBot, az), a0, b0, new Vector3(bx, yBot, bz),
                 Vector3.down, tint * 0.6f);
        }

        /// <summary>
        /// A doorway set back into the frontage, with its reveals.
        ///
        /// The recess is the cue. A shop door flush with the glass reads as a
        /// panel; set back 16cm with jambs and a head, it reads as somewhere
        /// you could walk in -- which is the whole ask, and it stops there.
        /// **Nothing here is interactive and nothing leads anywhere**: doors
        /// are U07's, and this must not grow toward it.
        ///
        /// One per building, on the longest wall, so the cost is bounded at
        /// roughly 500 doorways across the slice.
        /// </summary>
        static void Recess(Buffers face, Buffers reveal,
                           float ax, float az, float bx, float bz,
                           float y0, float y1, float nx, float nz, float width,
                           Color tint, float baseY, float vSpan, float depth)
        {
            var inward = new Vector3(-nx, 0f, -nz) * depth;

            float rx0 = ax + inward.x, rz0 = az + inward.z;
            float rx1 = bx + inward.x, rz1 = bz + inward.z;

            // The door itself, pushed back.
            BayQuad(face, rx0, rz0, rx1, rz1, y0, y1, nx, nz, tint * 0.9f, 0.6f, 1f, baseY, vSpan);

            var along = new Vector3(bx - ax, 0f, bz - az).normalized;
            float h = Mathf.Max(y1 - y0, 0.1f);

            // Jambs, facing each other across the opening.
            Face(reveal, new Vector3(ax, y0, az), new Vector3(rx0, y0, rz0),
                         new Vector3(rx0, y1, rz0), new Vector3(ax, y1, az),
                         along, tint * 0.7f, depth, h / TrapGeo.Storey);
            Face(reveal, new Vector3(rx1, y0, rz1), new Vector3(bx, y0, bz),
                         new Vector3(bx, y1, bz), new Vector3(rx1, y1, rz1),
                         -along, tint * 0.7f, depth, h / TrapGeo.Storey);
            // Head.
            Face(reveal, new Vector3(rx0, y1, rz0), new Vector3(rx1, y1, rz1),
                         new Vector3(bx, y1, bz), new Vector3(ax, y1, az),
                         Vector3.down, tint * 0.55f, width, depth);
        }

        static void Quad(Buffers b, float ax, float az, float bx, float bz,
                         float y0, float y1, float nx, float nz, float len,
                         Color tint, float bottomShade, float topShade, float baseY, float vSpan)
        {
            int i = b.vertices.Count;
            b.vertices.Add(new Vector3(ax, y0, az));
            b.vertices.Add(new Vector3(bx, y0, bz));
            b.vertices.Add(new Vector3(bx, y1, bz));
            b.vertices.Add(new Vector3(ax, y1, az));

            var normal = new Vector3(nx, 0f, nz);
            for (int k = 0; k < 4; k++) b.normals.Add(normal);

            // Tiled by real metres, so a wide building gets more windows rather
            // than stretched ones and a street lines up floor for floor.
            float u = len / 6f;
            float v0 = (y0 - baseY) / vSpan;
            float v1 = (y1 - baseY) / vSpan;
            b.uvs.Add(new Vector2(0f, v0));
            b.uvs.Add(new Vector2(u, v0));
            b.uvs.Add(new Vector2(u, v1));
            b.uvs.Add(new Vector2(0f, v1));

            // Cheap ambient occlusion: walls darken toward the ground.
            var lo = tint * bottomShade;
            var hi = tint * topShade;
            b.colors.Add(lo); b.colors.Add(lo); b.colors.Add(hi); b.colors.Add(hi);

            // Wound so the front face is the one the normal points at. The other
            // way round deletes every wall in the city and the normals still
            // look perfect.
            b.triangles.Add(i); b.triangles.Add(i + 2); b.triangles.Add(i + 1);
            b.triangles.Add(i); b.triangles.Add(i + 3); b.triangles.Add(i + 2);
        }
    }
}
