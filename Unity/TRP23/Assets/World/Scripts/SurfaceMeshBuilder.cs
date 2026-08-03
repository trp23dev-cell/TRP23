using System.Collections.Generic;
using UnityEngine;

namespace TrapMadeIt.World
{
    /// <summary>
    /// Everything that is not a building: roads, paved areas, land cover,
    /// walls, trees and street furniture.
    ///
    /// All of it is already in the tiles and was simply not being read. The
    /// web client learned two things here worth carrying over:
    ///
    ///   AREAS ARE POLYGONS. 276 of Lincoln's ways are tagged area=yes — the
    ///   High Street among them. They are the OUTLINE of a paved space, not a
    ///   centre line, and drawing them as ribbons turns the main shopping
    ///   street into a footpath tracing its own kerb. The tiler already
    ///   tessellates them onto the terrain, so they arrive ready to draw.
    ///
    ///   WATER IS LEVEL. It comes with its own height and must not be draped
    ///   over the heightmap, or the Brayford becomes a hillside.
    /// </summary>
    public static class SurfaceMeshBuilder
    {
        /// The surface kinds the tiler emits, each wanting its own material.
        public static readonly string[] Surfaces =
            { "asphalt", "paving", "cobble", "concrete", "gravel", "kerb" };

        public static readonly string[] Covers = { "grass", "wood", "water" };

        /// <summary>
        /// Road ribbons, one buffer per surface.
        ///
        /// Elevations come per vertex from the tiler, so a carriageway follows
        /// the hill instead of cutting a level shelf through it — and a bridge
        /// deck carries its own heights and stays clear of the water.
        /// </summary>
        /// A kerb is 125mm in this country, and that upstand is what makes a
        /// street read as a street rather than a coloured stripe on the ground.
        const float KerbHeight = 0.125f;

        /// Footway each side. Narrow enough for a medieval lane, wide enough to
        /// walk two abreast, which is what most of Lincoln actually has.
        const float PavementWidth = 1.9f;

        /// Below this it is a footpath or an alley, and kerbing it would lay a
        /// pavement beside something that already IS the pavement.
        const float KerbedFrom = 4.5f;

        public static void Roads(RoadData[] roads, Dictionary<string, BuildingMeshBuilder.Buffers> byS,
                                 bool kerbs = true)
        {
            if (roads == null) return;
            foreach (var r in roads)
            {
                if (r.p == null || r.p.Length < 4) continue;
                var buf = Pick(byS, r.s, "asphalt");
                var kerbBuf = Pick(byS, "kerb", "concrete");
                var pavementBuf = Pick(byS, "paving", "concrete");

                float half = Mathf.Max(r.w, 0.5f) * 0.5f;
                // A bridge deck carries its own heights and has a parapet, not a
                // kerb and a footway laid on ground that is not underneath it.
                bool kerbed = kerbs && r.w >= KerbedFrom && r.br != 1;
                int count = r.p.Length / 2;
                float along = 0f;

                for (int i = 0; i < count - 1; i++)
                {
                    float ax = r.p[i * 2], az = r.p[i * 2 + 1];
                    float bx = r.p[i * 2 + 2], bz = r.p[i * 2 + 3];
                    float ay = r.e != null && r.e.Length > i ? r.e[i] : 0f;
                    float by = r.e != null && r.e.Length > i + 1 ? r.e[i + 1] : ay;

                    float ex = bx - ax, ez = bz - az;
                    float len = Mathf.Sqrt(ex * ex + ez * ez);
                    if (len < 0.01f) continue;

                    float ux = ez / len, uz = -ex / len;      // across the road
                    float nx = ux * half, nz = uz * half;

                    AddQuad(buf,
                        new Vector3(ax + nx, ay, az + nz),
                        new Vector3(bx + nx, by, bz + nz),
                        new Vector3(bx - nx, by, bz - nz),
                        new Vector3(ax - nx, ay, az - nz),
                        along, along + len, r.w, Color.white);

                    if (kerbed)
                    {
                        Kerb(kerbBuf, pavementBuf, ax, ay, az, bx, by, bz, ux, uz, half, along, len, 1f);
                        Kerb(kerbBuf, pavementBuf, ax, ay, az, bx, by, bz, ux, uz, half, along, len, -1f);
                    }
                    along += len;
                }
            }
        }

        /// <summary>
        /// One side of the street: the vertical face of the kerb, and the
        /// footway behind it.
        ///
        /// The FACE is the part that matters. A pavement drawn flat at road
        /// level is invisible; it is the shadow line along the upstand that
        /// tells you where the carriageway stops and you are allowed to stand.
        /// Both follow the road's own elevations, so a kerb climbing Steep Hill
        /// climbs with it instead of sinking into it.
        /// </summary>
        static void Kerb(BuildingMeshBuilder.Buffers kerb, BuildingMeshBuilder.Buffers pavement,
                         float ax, float ay, float az, float bx, float by, float bz,
                         float ux, float uz, float half, float along, float len, float side)
        {
            float ix = ux * half * side, iz = uz * half * side;
            float ox = ux * (half + PavementWidth) * side, oz = uz * (half + PavementWidth) * side;

            var a0 = new Vector3(ax + ix, ay, az + iz);
            var b0 = new Vector3(bx + ix, by, bz + iz);
            var b1 = new Vector3(bx + ix, by + KerbHeight, bz + iz);
            var a1 = new Vector3(ax + ix, ay + KerbHeight, az + iz);

            // Wound so the face looks at the road it is holding back, which is
            // the opposite way round on the two sides of the street.
            if (side > 0f) AddQuad(kerb, a0, b0, b1, a1, along, along + len, KerbHeight, Color.white);
            else AddQuad(kerb, a1, b1, b0, a0, along, along + len, KerbHeight, Color.white);

            var p0 = new Vector3(ax + ix, ay + KerbHeight, az + iz);
            var p1 = new Vector3(bx + ix, by + KerbHeight, bz + iz);
            var p2 = new Vector3(bx + ox, by + KerbHeight, bz + oz);
            var p3 = new Vector3(ax + ox, ay + KerbHeight, az + oz);

            if (side > 0f) AddQuad(pavement, p0, p1, p2, p3, along, along + len, PavementWidth, Color.white);
            else AddQuad(pavement, p3, p2, p1, p0, along, along + len, PavementWidth, Color.white);
        }

        /// Paved areas and land cover. Both arrive already tessellated onto the
        /// terrain, as flat [x,y,z,...] with triangle indices.
        public static void Filled(float[] v, int[] tri, BuildingMeshBuilder.Buffers buf, Color tint)
        {
            if (v == null || tri == null || v.Length < 9) return;
            int b = buf.vertices.Count;
            for (int i = 0; i < v.Length; i += 3)
            {
                buf.vertices.Add(new Vector3(v[i], v[i + 1], v[i + 2]));
                buf.normals.Add(Vector3.up);
                buf.uvs.Add(new Vector2(v[i] / 6f, v[i + 2] / 6f));
                buf.colors.Add(tint);
            }
            // Anticlockwise in plan faces down once lifted, same as the roofs.
            for (int i = 0; i < tri.Length; i += 3)
            {
                buf.triangles.Add(b + tri[i]);
                buf.triangles.Add(b + tri[i + 2]);
                buf.triangles.Add(b + tri[i + 1]);
            }
        }

        /// <summary>
        /// Boundary walls and hedges. Lincoln's uphill lanes and the Castle
        /// precinct are defined by them, and the city wall is a monument.
        /// Both faces plus a cap, so a wall is solid from either side rather
        /// than a plane you can see through.
        /// </summary>
        public static void Walls(WallData[] walls, BuildingMeshBuilder.Buffers stone,
                                 BuildingMeshBuilder.Buffers hedge)
        {
            if (walls == null) return;
            foreach (var w in walls)
            {
                if (w.p == null || w.p.Length < 4) continue;
                bool isHedge = w.k == "hedge";
                var buf = isHedge ? hedge : stone;
                float height = w.k == "city" ? 4.2f : isHedge ? 1.6f : 1.9f;
                float halfW = w.k == "city" ? 0.9f : isHedge ? 0.55f : 0.32f;

                int count = w.p.Length / 2;
                for (int i = 0; i < count - 1; i++)
                {
                    float ax = w.p[i * 2], az = w.p[i * 2 + 1];
                    float bx = w.p[i * 2 + 2], bz = w.p[i * 2 + 3];
                    float ay = w.e != null && w.e.Length > i ? w.e[i] : 0f;
                    float by = w.e != null && w.e.Length > i + 1 ? w.e[i + 1] : ay;

                    float ex = bx - ax, ez = bz - az;
                    float len = Mathf.Sqrt(ex * ex + ez * ez);
                    if (len < 0.05f) continue;
                    float nx = ez / len * halfW, nz = -ex / len * halfW;

                    for (int side = -1; side <= 1; side += 2)
                    {
                        float ox = nx * side, oz = nz * side;
                        var p0 = new Vector3(ax + ox, ay, az + oz);
                        var p1 = new Vector3(bx + ox, by, bz + oz);
                        var p2 = new Vector3(bx + ox, by + height, bz + oz);
                        var p3 = new Vector3(ax + ox, ay + height, az + oz);
                        if (side > 0) AddQuad(buf, p0, p1, p2, p3, 0f, len, height, Color.white);
                        else AddQuad(buf, p3, p2, p1, p0, 0f, len, height, Color.white);
                    }
                    // Cap.
                    AddQuad(buf,
                        new Vector3(ax + nx, ay + height, az + nz),
                        new Vector3(bx + nx, by + height, bz + nz),
                        new Vector3(bx - nx, by + height, bz - nz),
                        new Vector3(ax - nx, ay + height, az - nz),
                        0f, len, halfW * 2f, Color.white);
                }
            }
        }

        /// <summary>
        /// Trees, as a trunk and a canopy, merged rather than instanced.
        /// There are only a couple of hundred in the whole city, so merging is
        /// simpler and costs one draw call rather than one per tree.
        /// </summary>
        public static void Trees(float[] points, BuildingMeshBuilder.Buffers trunks,
                                 BuildingMeshBuilder.Buffers canopies)
        {
            if (points == null) return;
            for (int i = 0; i + 2 < points.Length; i += 3)
            {
                float x = points[i], y = points[i + 1], z = points[i + 2];
                // Deterministic variation, so a row of street trees is not a
                // row of identical clones.
                float seed = Mathf.Abs(Mathf.Sin(x * 12.9898f + z * 78.233f) * 43758.5453f) % 1f;
                float scale = 0.78f + seed * 0.55f;

                Prism(trunks, new Vector3(x, y, z), 0.22f * scale, 3.4f * scale);
                Prism(canopies, new Vector3(x, y + 3.0f * scale, z), 2.4f * scale, 3.6f * scale);
            }
        }

        /// Street furniture: benches, bollards, post boxes, bins, lamps, stops.
        public static void Furniture(FurnitureData[] items, BuildingMeshBuilder.Buffers buf)
        {
            if (items == null) return;
            foreach (var f in items)
            {
                var at = new Vector3(f.x, f.y, f.z);
                switch (f.k)
                {
                    case "bench": Prism(buf, at, 0.8f, 0.45f); break;
                    case "bollard": Prism(buf, at, 0.12f, 0.95f); break;
                    case "postbox": Prism(buf, at, 0.30f, 1.35f); break;
                    case "bin": Prism(buf, at, 0.24f, 0.85f); break;
                    case "lamp": Prism(buf, at, 0.09f, 5.2f); break;
                    case "stop": Prism(buf, at, 0.08f, 2.5f); break;
                }
            }
        }

        /// A square prism standing on the ground. Enough for furniture and for
        /// tree parts at the distance any of it is ever seen from.
        static void Prism(BuildingMeshBuilder.Buffers b, Vector3 at, float half, float height)
        {
            var c = new[]
            {
                new Vector2(-half, -half), new Vector2(half, -half),
                new Vector2(half, half), new Vector2(-half, half),
            };
            for (int i = 0; i < 4; i++)
            {
                var a = c[i];
                var d = c[(i + 1) % 4];
                AddQuad(b,
                    new Vector3(at.x + a.x, at.y, at.z + a.y),
                    new Vector3(at.x + d.x, at.y, at.z + d.y),
                    new Vector3(at.x + d.x, at.y + height, at.z + d.y),
                    new Vector3(at.x + a.x, at.y + height, at.z + a.y),
                    0f, half * 2f, height, Color.white);
            }
            AddQuad(b,
                new Vector3(at.x + c[0].x, at.y + height, at.z + c[0].y),
                new Vector3(at.x + c[1].x, at.y + height, at.z + c[1].y),
                new Vector3(at.x + c[2].x, at.y + height, at.z + c[2].y),
                new Vector3(at.x + c[3].x, at.y + height, at.z + c[3].y),
                0f, half * 2f, half * 2f, Color.white);
        }

        static BuildingMeshBuilder.Buffers Pick(
            Dictionary<string, BuildingMeshBuilder.Buffers> map, string key, string fallback)
        {
            if (key != null && map.TryGetValue(key, out var hit)) return hit;
            return map[fallback];
        }

        static void AddQuad(BuildingMeshBuilder.Buffers b, Vector3 p0, Vector3 p1, Vector3 p2, Vector3 p3,
                            float u0, float u1, float vSpan, Color tint)
        {
            int i = b.vertices.Count;
            var nrm = Vector3.Cross(p1 - p0, p2 - p0);
            nrm = nrm.sqrMagnitude < 1e-9f ? Vector3.up : nrm.normalized;

            b.vertices.Add(p0); b.vertices.Add(p1); b.vertices.Add(p2); b.vertices.Add(p3);
            for (int k = 0; k < 4; k++) { b.normals.Add(nrm); b.colors.Add(tint); }
            b.uvs.Add(new Vector2(u0 / 6f, 0f));
            b.uvs.Add(new Vector2(u1 / 6f, 0f));
            b.uvs.Add(new Vector2(u1 / 6f, vSpan / 6f));
            b.uvs.Add(new Vector2(u0 / 6f, vSpan / 6f));
            b.triangles.Add(i); b.triangles.Add(i + 1); b.triangles.Add(i + 2);
            b.triangles.Add(i); b.triangles.Add(i + 2); b.triangles.Add(i + 3);
        }
    }
}
