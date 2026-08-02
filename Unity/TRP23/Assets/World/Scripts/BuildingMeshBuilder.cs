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

        public static void Extrude(BuildingData b, Buffers walls, Buffers roofs)
        {
            var ring = b.p;
            if (ring == null || ring.Length < 6) return;

            int n = ring.Length / 2;
            var order = NormalisedOrder(ring);

            float street = b.s;          // the highest ground under it
            float baseY = b.y;           // the lowest, less a skirt
            float top = street + b.h;

            var tint = b.c != null && b.c.Length >= 3
                ? new Color(b.c[0] / 255f, b.c[1] / 255f, b.c[2] / 255f)
                : new Color(0.9f, 0.86f, 0.8f);

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
                Quad(walls, ax, az, bx, bz, street, top, nx, nz, len, tint, 0.62f, 1f, street, vSpan);
            }

            // Roof. Flat only for now — pitched roofs and the bespoke massing
            // (gateways, the cathedral, the castle) come next.
            var tris = Triangulate(ring, order);
            int vbase = roofs.vertices.Count;
            for (int k = 0; k < n; k++)
            {
                int i = order[k];
                roofs.vertices.Add(new Vector3(ring[i * 2], top, ring[i * 2 + 1]));
                roofs.normals.Add(Vector3.up);
                roofs.uvs.Add(new Vector2(ring[i * 2] / 8f, ring[i * 2 + 1] / 8f));
                roofs.colors.Add(tint);
            }
            // Anticlockwise in plan faces DOWN once lifted, so the order flips.
            for (int t = 0; t < tris.Count; t += 3)
            {
                roofs.triangles.Add(vbase + tris[t]);
                roofs.triangles.Add(vbase + tris[t + 2]);
                roofs.triangles.Add(vbase + tris[t + 1]);
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
