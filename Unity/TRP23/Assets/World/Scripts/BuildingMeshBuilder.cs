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
        {
            Extrude(b, sink.Get(WallKey(b)), sink.Get(RoofKey(b)),
                    sink.Get(GroundKey(b)));
        }

        public static void Extrude(BuildingData b, Buffers walls, Buffers roofs,
                                   Buffers ground = null)
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

                if (street > baseY + 0.02f)
                {
                    Quad(walls, ax, az, bx, bz, baseY, street, nx, nz, len, tint, 0.35f, 0.6f, baseY, vSpan);
                }
                // Split the ground floor off, where there is room for one.
                // It is the storey people actually stand in front of, and the
                // one that carries the shopfront.
                float groundTop = Mathf.Min(street + TrapGeo.Storey, top);
                if (ground != null && b.st != "monument" && groundTop > street + 0.4f)
                {
                    Quad(ground, ax, az, bx, bz, street, groundTop, nx, nz, len, tint, 0.55f, 1f, street, vSpan);
                    if (top > groundTop + 0.1f)
                        Quad(walls, ax, az, bx, bz, groundTop, top, nx, nz, len, tint, 0.72f, 1f, street, vSpan);
                }
                else
                {
                    Quad(walls, ax, az, bx, bz, street, top, nx, nz, len, tint, 0.62f, 1f, street, vSpan);
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
