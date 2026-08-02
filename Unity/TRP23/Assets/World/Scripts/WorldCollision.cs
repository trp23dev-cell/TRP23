using System.Collections.Generic;
using UnityEngine;

namespace TrapMadeIt.World
{
    /// <summary>
    /// Keeps the player out of the buildings.
    ///
    /// This is a port of resolveWorldCollisions in the web client, deliberately
    /// kept algorithmically identical so a wall that blocks you in the browser
    /// blocks you here. Two things it does NOT do, both on purpose:
    ///
    ///   NO MESH COLLIDERS. Seven thousand footprints as colliders is a physics
    ///   world Unity has to rebuild every time a tile streams in. The footprints
    ///   are already in the tile data as flat rings, and testing a point against
    ///   the handful near the player is far cheaper than maintaining that.
    ///
    ///   STOP AT THE WALL, don't escape from inside it. Pushing a player out of
    ///   a footprint finds the NEAREST wall, and on a concave building -- an
    ///   L-shaped corner shop, a terrace with a back extension -- the nearest
    ///   wall can be across a re-entrant corner, so "outward" from it lands them
    ///   deeper in. The web client failed this on 3 of 5974 approaches until the
    ///   step itself was tested as a segment against the walls. Same fix here,
    ///   and it rules out tunnelling through a thin wall at speed as well.
    /// </summary>
    public class WorldCollision
    {
        /// How close you may stand to a wall. Matches the web client.
        public const float Radius = 0.45f;

        /// A correction larger than this means the player was somewhere they
        /// should never have been. Still resolved, but not by flinging them
        /// across the city.
        const float MaxCorrection = 6f;

        readonly Dictionary<Vector2Int, List<float[]>> byTile =
            new Dictionary<Vector2Int, List<float[]>>();

        public int FootprintCount { get; private set; }

        /// <summary>Take the footprints from a tile as it streams in.</summary>
        public void AddTile(Vector2Int tile, BuildingData[] buildings)
        {
            if (buildings == null) return;
            var rings = new List<float[]>(buildings.Length);
            foreach (var b in buildings)
            {
                // A ring needs three corners to enclose anything.
                if (b?.p != null && b.p.Length >= 6) rings.Add(b.p);
            }
            FootprintCount += rings.Count - (byTile.TryGetValue(tile, out var old) ? old.Count : 0);
            byTile[tile] = rings;
        }

        public void RemoveTile(Vector2Int tile)
        {
            if (byTile.TryGetValue(tile, out var rings)) FootprintCount -= rings.Count;
            byTile.Remove(tile);
        }

        public void Clear()
        {
            byTile.Clear();
            FootprintCount = 0;
        }

        /// <summary>
        /// Move the player from <paramref name="from"/> towards
        /// <paramref name="to"/>, stopping at the first wall in the way.
        /// Returns where they actually end up, in the XZ plane; Y is left alone
        /// for the streamer's ground pinning to settle.
        /// </summary>
        public Vector3 Resolve(Vector3 from, Vector3 to)
        {
            // Stop at the wall rather than trying to escape from inside it.
            float? earliest = null;
            foreach (var ring in Near(to.x, to.z))
            {
                float? t = SegmentCrossesRing(from.x, from.z, to.x, to.z, ring);
                if (t.HasValue && (!earliest.HasValue || t.Value < earliest.Value)) earliest = t;
            }
            if (earliest.HasValue)
            {
                // Just short of the crossing, so the push-out below settles the
                // player against the wall rather than exactly on it.
                float back = Mathf.Max(0f, earliest.Value - 0.02f);
                to.x = from.x + (to.x - from.x) * back;
                to.z = from.z + (to.z - from.z) * back;
            }

            float startX = to.x, startZ = to.z;

            // Deepest-first, one per pass. Resolving overlaps in arbitrary order
            // lets a terrace hand the player back and forth -- out of one shop
            // straight into its neighbour -- and walk them a long way down the
            // street in a single frame.
            for (int pass = 0; pass < 4; pass++)
            {
                float[] worst = null;
                float worstDepth = 0f;

                foreach (var ring in Near(to.x, to.z))
                {
                    if (!PointInRing(to.x, to.z, ring)) continue;
                    float d = DistanceToEdge(to.x, to.z, ring);
                    if (worst == null || d > worstDepth) { worst = ring; worstDepth = d; }
                }
                if (worst == null) break;

                if (!PushOut(ref to, worst)) break;
            }

            float dx = to.x - startX, dz = to.z - startZ;
            if (dx * dx + dz * dz > MaxCorrection * MaxCorrection)
            {
                float len = Mathf.Sqrt(dx * dx + dz * dz);
                to.x = startX + dx / len * MaxCorrection;
                to.z = startZ + dz / len * MaxCorrection;
            }
            return to;
        }

        /// <summary>
        /// Footprints in the player's tile and the eight around it. A building
        /// is binned by its centroid, so one straddling a boundary is only in
        /// one of them -- hence the ring rather than just the tile underfoot.
        /// </summary>
        IEnumerable<float[]> Near(float x, float z)
        {
            var here = TrapGeo.TileOf(x, z);
            for (int dz = -1; dz <= 1; dz++)
            {
                for (int dx = -1; dx <= 1; dx++)
                {
                    if (!byTile.TryGetValue(new Vector2Int(here.x + dx, here.y + dz), out var rings))
                        continue;
                    foreach (var r in rings) yield return r;
                }
            }
        }

        /// <summary>
        /// Where along a-&gt;b it first crosses a wall of this ring (0..1), or
        /// null. Standard segment-segment intersection, per edge.
        /// </summary>
        static float? SegmentCrossesRing(float ax, float az, float bx, float bz, float[] ring)
        {
            int n = ring.Length / 2;
            float dx = bx - ax, dz = bz - az;
            float? earliest = null;

            for (int i = 0, j = n - 1; i < n; j = i++)
            {
                float cx = ring[j * 2], cz = ring[j * 2 + 1];
                float ex = ring[i * 2] - cx, ez = ring[i * 2 + 1] - cz;

                float denom = dx * ez - dz * ex;
                if (Mathf.Abs(denom) < 1e-9f) continue;    // parallel

                float t = ((cx - ax) * ez - (cz - az) * ex) / denom;   // along a->b
                float u = ((cx - ax) * dz - (cz - az) * dx) / denom;   // along the wall
                if (t < 0f || t > 1f || u < 0f || u > 1f) continue;
                if (!earliest.HasValue || t < earliest.Value) earliest = t;
            }
            return earliest;
        }

        static bool PointInRing(float x, float z, float[] ring)
        {
            int n = ring.Length / 2;
            bool inside = false;
            for (int i = 0, j = n - 1; i < n; j = i++)
            {
                float xi = ring[i * 2], zi = ring[i * 2 + 1];
                float xj = ring[j * 2], zj = ring[j * 2 + 1];
                if ((zi > z) != (zj > z) &&
                    x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
            }
            return inside;
        }

        /// Distance from a point to the nearest edge of the ring.
        static float DistanceToEdge(float x, float z, float[] ring)
        {
            float best = float.MaxValue;
            int n = ring.Length / 2;
            for (int i = 0, j = n - 1; i < n; j = i++)
            {
                float d = PointToSegment(x, z,
                    ring[j * 2], ring[j * 2 + 1], ring[i * 2], ring[i * 2 + 1], out _, out _);
                if (d < best) best = d;
            }
            return best;
        }

        /// Push the point to just outside the nearest edge. False if the ring is
        /// degenerate and there is nothing sensible to push against.
        static bool PushOut(ref Vector3 p, float[] ring)
        {
            float best = float.MaxValue, bx = 0f, bz = 0f;
            int n = ring.Length / 2;
            for (int i = 0, j = n - 1; i < n; j = i++)
            {
                float d = PointToSegment(p.x, p.z,
                    ring[j * 2], ring[j * 2 + 1], ring[i * 2], ring[i * 2 + 1],
                    out float cx, out float cz);
                if (d < best) { best = d; bx = cx; bz = cz; }
            }
            if (best == float.MaxValue) return false;

            float ox = p.x - bx, oz = p.z - bz;
            float len = Mathf.Sqrt(ox * ox + oz * oz);
            if (len < 1e-5f)
            {
                // Standing exactly on the edge: any direction will do, and
                // dividing by this length would be a NaN straight into the
                // transform, which ends the frame and every frame after it.
                ox = 1f; oz = 0f; len = 1f;
            }
            p.x = bx + ox / len * Radius;
            p.z = bz + oz / len * Radius;
            return true;
        }

        static float PointToSegment(float px, float pz, float ax, float az, float bx, float bz,
                                    out float cx, out float cz)
        {
            float ex = bx - ax, ez = bz - az;
            float lenSq = ex * ex + ez * ez;
            float t = lenSq < 1e-9f ? 0f : Mathf.Clamp01(((px - ax) * ex + (pz - az) * ez) / lenSq);
            cx = ax + ex * t;
            cz = az + ez * t;
            float dx = px - cx, dz = pz - cz;
            return Mathf.Sqrt(dx * dx + dz * dz);
        }
    }
}
