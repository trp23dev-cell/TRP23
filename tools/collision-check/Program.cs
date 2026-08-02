using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Text.Json;
using UnityEngine;
using TrapMadeIt.World;

namespace TrapCollisionCheck
{
    /// <summary>
    /// Runs the Unity collision code against the real city, outside Unity.
    ///
    /// The C# resolver is a port of the JavaScript one, and a port that has
    /// never been executed is a guess. This walks the same 8 approaches at the
    /// same buildings as scripts/verify-map.mjs and asserts the same thing: you
    /// never end up inside. It compiles the ACTUAL WorldCollision.cs, not a
    /// copy, so it cannot drift away from what the game runs.
    /// </summary>
    static class Program
    {
        const float Step = 0.35f;   // a sprint step, larger than a walk

        static int Main()
        {
            var path = Path.Combine(AppContext.BaseDirectory,
                "../../../../../server/storage/map-export.json.gz");
            path = Path.GetFullPath(path);
            if (!File.Exists(path))
            {
                Console.Error.WriteLine($"no map export at {path} — run `npm run map:export` first");
                return 2;
            }

            var collision = new WorldCollision();
            var rings = new List<float[]>();

            using (var raw = File.OpenRead(path))
            using (var gz = new GZipStream(raw, CompressionMode.Decompress))
            using (var doc = JsonDocument.Parse(gz))
            {
                foreach (var tile in doc.RootElement.GetProperty("tiles").EnumerateArray())
                {
                    int tx = tile.GetProperty("tileX").GetInt32();
                    int tz = tile.GetProperty("tileZ").GetInt32();

                    var payload = tile.GetProperty("payload");
                    if (!payload.TryGetProperty("b", out var bs)) continue;

                    var buildings = new List<BuildingData>();
                    foreach (var b in bs.EnumerateArray())
                    {
                        if (!b.TryGetProperty("p", out var p)) continue;
                        var ring = new float[p.GetArrayLength()];
                        int k = 0;
                        foreach (var v in p.EnumerateArray()) ring[k++] = v.GetSingle();
                        if (ring.Length < 6) continue;
                        buildings.Add(new BuildingData { p = ring });
                        rings.Add(ring);
                    }
                    collision.AddTile(new Vector2Int(tx, tz), buildings.ToArray());
                }
            }

            Index(rings);
            Console.WriteLine($"loaded {collision.FootprintCount} footprints, {Grid.Count} check cells");
            if (collision.FootprintCount < 1000)
            {
                Console.Error.WriteLine("FAIL  too few footprints loaded — the export or the parse is wrong");
                return 1;
            }

            int approaches = 0, breached = 0;
            string firstBreach = null;

            // Every seventh building, same sample as the JS check.
            for (int bi = 0; bi < rings.Count; bi += 7)
            {
                Centroid(rings[bi], out float cx, out float cz);

                for (int dir = 0; dir < 8; dir++)
                {
                    double ang = dir / 8.0 * Math.PI * 2.0;
                    float sx = cx + (float)Math.Cos(ang) * 60f;
                    float sz = cz + (float)Math.Sin(ang) * 60f;

                    var start = new Vector3(sx, 0f, sz);
                    if (InsideAny(collision, rings, start.x, start.z)) continue;

                    // Settle first, so the walk starts from a position the game
                    // could actually leave the player in. A raw 60m offset can
                    // land centimetres from a wall, closer than the resolver
                    // would ever allow in play.
                    start = collision.Resolve(start, start);
                    if (InsideAny(collision, rings, start.x, start.z)) continue;
                    approaches++;

                    var p = start;
                    for (int s = 0; s < 180; s++)
                    {
                        var from = p;
                        var to = new Vector3(
                            p.x - (float)Math.Cos(ang) * Step, 0f,
                            p.z - (float)Math.Sin(ang) * Step);
                        p = collision.Resolve(from, to);

                        if (InsideAny(collision, rings, p.x, p.z))
                        {
                            breached++;
                            firstBreach ??= $"{p.x:F1},{p.z:F1}";
                            break;
                        }
                    }
                }
            }

            bool ok = breached == 0;
            Console.WriteLine($"{(ok ? "ok  " : "FAIL")}  walking at a building never gets you inside one" +
                              $" — {breached}/{approaches} approaches breached" +
                              (firstBreach != null ? $" (e.g. {firstBreach})" : ""));
            if (approaches < 1000)
            {
                Console.Error.WriteLine($"FAIL  only {approaches} approaches tested — the sample is not meaningful");
                return 1;
            }
            return ok ? 0 : 1;
        }

        static void Centroid(float[] ring, out float cx, out float cz)
        {
            float minX = float.MaxValue, maxX = float.MinValue;
            float minZ = float.MaxValue, maxZ = float.MinValue;
            for (int i = 0; i < ring.Length; i += 2)
            {
                if (ring[i] < minX) minX = ring[i];
                if (ring[i] > maxX) maxX = ring[i];
                if (ring[i + 1] < minZ) minZ = ring[i + 1];
                if (ring[i + 1] > maxZ) maxZ = ring[i + 1];
            }
            cx = (minX + maxX) / 2f;
            cz = (minZ + maxZ) / 2f;
        }

        /// <summary>
        /// An INDEPENDENT index, built here at a different cell size and with a
        /// different binning rule from the one WorldCollision uses. The check
        /// must not share the collision code's idea of which buildings are
        /// nearby, or a bug in that lookup would hide itself. Every ring is
        /// registered in every cell its bounding box touches, so unlike the
        /// game's centroid binning there is nothing for it to miss.
        /// </summary>
        const float Cell = 100f;
        static readonly Dictionary<long, List<float[]>> Grid = new Dictionary<long, List<float[]>>();

        static void Index(List<float[]> rings)
        {
            foreach (var ring in rings)
            {
                float minX = float.MaxValue, maxX = float.MinValue;
                float minZ = float.MaxValue, maxZ = float.MinValue;
                for (int i = 0; i < ring.Length; i += 2)
                {
                    if (ring[i] < minX) minX = ring[i];
                    if (ring[i] > maxX) maxX = ring[i];
                    if (ring[i + 1] < minZ) minZ = ring[i + 1];
                    if (ring[i + 1] > maxZ) maxZ = ring[i + 1];
                }
                for (int gz = (int)Math.Floor(minZ / Cell); gz <= (int)Math.Floor(maxZ / Cell); gz++)
                for (int gx = (int)Math.Floor(minX / Cell); gx <= (int)Math.Floor(maxX / Cell); gx++)
                {
                    long key = ((long)gx << 32) ^ (uint)gz;
                    if (!Grid.TryGetValue(key, out var list)) Grid[key] = list = new List<float[]>();
                    list.Add(ring);
                }
            }
        }

        static bool InsideAny(WorldCollision _, List<float[]> unused, float x, float z)
        {
            long key = ((long)Math.Floor(x / Cell) << 32) ^ (uint)(int)Math.Floor(z / Cell);
            if (!Grid.TryGetValue(key, out var rings)) return false;
            foreach (var ring in rings)
            {
                int n = ring.Length / 2;
                bool inside = false;
                for (int i = 0, j = n - 1; i < n; j = i++)
                {
                    float xi = ring[i * 2], zi = ring[i * 2 + 1];
                    float xj = ring[j * 2], zj = ring[j * 2 + 1];
                    if ((zi > z) != (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi)
                        inside = !inside;
                }
                if (inside) return true;
            }
            return false;
        }
    }
}
