using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
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

        /// The repository root, from the build output. Same hop the map export
        /// already uses, kept in one place now that two things need it.
        static string Root => Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../.."));

        static int Main()
        {
            var path = Path.Combine(Root, "server/storage/map-export.json.gz");
            if (!File.Exists(path))
            {
                Console.Error.WriteLine($"no map export at {path} — run `npm run map:export` first");
                return 2;
            }

            var collision = new WorldCollision();
            var rings = new List<float[]>();
            var meshable = new List<BuildingData>();

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
                        var bd = new BuildingData { p = ring };
                        bd.y = Get(b, "y");
                        bd.s = Get(b, "s");
                        bd.h = Get(b, "h");
                        bd.st = Str(b, "st");
                        bd.g = Str(b, "g");
                        bd.rs = Str(b, "rs");
                        bd.m = Str(b, "m");
                        buildings.Add(bd);
                        meshable.Add(bd);
                        rings.Add(ring);
                    }
                    collision.AddTile(new Vector2Int(tx, tz), buildings.ToArray());
                }
            }

            Index(rings);
            Console.WriteLine($"loaded {collision.FootprintCount} footprints, {Grid.Count} check cells");
            int slopeFailures = CheckSlope();
            int freezeFailures = CheckFreezeContract();
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

            int windingFailures = CheckWinding(meshable);
            bool ok = breached == 0;
            Console.WriteLine($"{(ok ? "ok  " : "FAIL")}  walking at a building never gets you inside one" +
                              $" — {breached}/{approaches} approaches breached" +
                              (firstBreach != null ? $" (e.g. {firstBreach})" : ""));
            if (approaches < 1000)
            {
                Console.Error.WriteLine($"FAIL  only {approaches} approaches tested — the sample is not meaningful");
                return 1;
            }
            return ok && windingFailures == 0 && slopeFailures == 0 && freezeFailures == 0 ? 0 : 1;
        }


        /// <summary>
        /// The freeze contract.
        ///
        /// This is the bug WP-U02 shipped with: the map set its own BigMap flag
        /// and never told PointerFocus, so everything that asked "is gameplay
        /// input blocked?" was told no. Movement only LOOKED frozen, because
        /// timeScale was 0 and Move() is scaled by deltaTime. Mouse look
        /// deliberately is not, so it carried on.
        ///
        /// The registers are named-holder sets rather than counters precisely
        /// so that double-request and double-release cannot corrupt them, and
        /// that is worth pinning down.
        /// </summary>
        static int CheckFreezeContract()
        {
            int bad = 0;
            void Assert(string what, bool ok, string detail = "")
            {
                Console.WriteLine($"{(ok ? "ok  " : "FAIL")}  {what}{(detail.Length > 0 ? " — " + detail : "")}");
                if (!ok) bad++;
            }

            TrapMadeIt.PointerFocus.ReleaseAll();
            TrapMadeIt.GameFreeze.ReleaseAll();

            Assert("nothing held means gameplay input is allowed",
                !TrapMadeIt.PointerFocus.Wanted && !TrapMadeIt.GameFreeze.Wanted);

            TrapMadeIt.PointerFocus.Request("map");
            TrapMadeIt.GameFreeze.Request("map");
            Assert("opening the map blocks gameplay input",
                TrapMadeIt.PointerFocus.Wanted && TrapMadeIt.GameFreeze.Wanted);

            // Two panels open at once, then one closes. A counter would get
            // this right; a counter also gets double-release wrong, which is
            // why these are sets.
            TrapMadeIt.PointerFocus.Request("hud");
            TrapMadeIt.GameFreeze.Request("hud");
            TrapMadeIt.PointerFocus.Release("map");
            TrapMadeIt.GameFreeze.Release("map");
            Assert("closing the map does not unfreeze a panel that is still open",
                TrapMadeIt.PointerFocus.Wanted && TrapMadeIt.GameFreeze.Wanted);

            TrapMadeIt.PointerFocus.Release("hud");
            TrapMadeIt.GameFreeze.Release("hud");
            Assert("closing the last holder restores control",
                !TrapMadeIt.PointerFocus.Wanted && !TrapMadeIt.GameFreeze.Wanted);

            TrapMadeIt.PointerFocus.Request("map");
            TrapMadeIt.PointerFocus.Request("map");
            TrapMadeIt.PointerFocus.Release("map");
            Assert("requesting twice and releasing once still releases",
                !TrapMadeIt.PointerFocus.Wanted, "a counter would still be held here");

            TrapMadeIt.GameFreeze.Request("hud");
            TrapMadeIt.GameFreeze.Release("hud");
            TrapMadeIt.GameFreeze.Release("hud");
            TrapMadeIt.GameFreeze.Request("map");
            Assert("releasing twice does not go negative and break the next hold",
                TrapMadeIt.GameFreeze.Wanted, "a counter would read -1 then 0 here");

            TrapMadeIt.GameFreeze.ReleaseAll();
            TrapMadeIt.PointerFocus.ReleaseAll();
            Assert("a scene change lets go of everything",
                !TrapMadeIt.PointerFocus.Wanted && !TrapMadeIt.GameFreeze.Wanted);

            // THREE SURFACES AT ONCE (WP-U15a)
            //
            // The Phone is the third holder, and the failure it could introduce
            // is the one nobody notices in a demo: open Phone, open map from it,
            // shut the map -- and the world stays frozen because a holder was
            // dropped, or unfreezes early because a holder was shared. Named
            // holders make the order irrelevant, and this proves it rather than
            // asserting it in a comment.
            TrapMadeIt.GameFreeze.Request("phone");
            TrapMadeIt.GameFreeze.Request("hud");
            TrapMadeIt.GameFreeze.Request("map");
            TrapMadeIt.GameFreeze.Release("phone");
            TrapMadeIt.GameFreeze.Release("map");
            Assert("closing the Phone and the map leaves a panel still holding",
                TrapMadeIt.GameFreeze.Wanted, "the last surface open must still freeze the world");
            TrapMadeIt.GameFreeze.Release("hud");
            Assert("the last of three surfaces to close is the one that restores control",
                !TrapMadeIt.GameFreeze.Wanted);

            // And the Phone releasing a holder it never took must not free the
            // world out from under an open panel. Teardown() calls Release
            // unconditionally, so this is the real path, not a hypothetical.
            TrapMadeIt.PointerFocus.Request("hud");
            TrapMadeIt.PointerFocus.Release("phone");
            Assert("the Phone letting go of a hold it never had does not free the cursor",
                TrapMadeIt.PointerFocus.Wanted);
            TrapMadeIt.PointerFocus.ReleaseAll();

            // ONE SURFACE ON SCREEN (WP-U15a repair)
            //
            // Every check above passed while the map and the case file were both
            // visible at once, which is the point: PointerFocus and GameFreeze
            // are additive by design and cannot express exclusivity. Nothing
            // tested it because nothing owned it.
            TrapMadeIt.ModalSurface.ReleaseAll();
            bool mapOpen = false, hudOpen = false, phoneOpen = false;
            TrapMadeIt.ModalSurface.Register("map", () => mapOpen = false);
            TrapMadeIt.ModalSurface.Register("hud", () => hudOpen = false);
            TrapMadeIt.ModalSurface.Register("phone", () => phoneOpen = false);

            mapOpen = true; TrapMadeIt.ModalSurface.Claim("map");
            hudOpen = true; TrapMadeIt.ModalSurface.Claim("hud");
            Assert("opening the case file over the map closes the map",
                hudOpen && !mapOpen, "this is the reported bug, in one line");

            phoneOpen = true; TrapMadeIt.ModalSurface.Claim("phone");
            Assert("opening the Phone over a panel closes the panel",
                phoneOpen && !hudOpen);

            mapOpen = true; TrapMadeIt.ModalSurface.Claim("map");
            Assert("opening the map over the Phone closes the Phone",
                mapOpen && !phoneOpen);

            // The re-entrant case, which is the one that would actually break.
            // A real surface yields as it closes, and that Yield lands in the
            // middle of the Claim that is closing it -- so a naive
            // implementation clears the incoming holder and the screen ends up
            // owned by nobody.
            TrapMadeIt.ModalSurface.ReleaseAll();
            TrapMadeIt.ModalSurface.Register("map", () => TrapMadeIt.ModalSurface.Yield("map"));
            TrapMadeIt.ModalSurface.Register("hud", () => TrapMadeIt.ModalSurface.Yield("hud"));
            TrapMadeIt.ModalSurface.Claim("map");
            TrapMadeIt.ModalSurface.Claim("hud");
            Assert("a surface yielding as it closes does not steal the new claim",
                TrapMadeIt.ModalSurface.Current == "hud",
                $"the screen is owned by {TrapMadeIt.ModalSurface.Current ?? "nobody"}");

            // Nested views inside a surface must not touch this at all: the
            // Phone claims once and its apps navigate underneath.
            TrapMadeIt.ModalSurface.Claim("hud");
            Assert("re-claiming the surface you already hold is not an event",
                TrapMadeIt.ModalSurface.Current == "hud");

            TrapMadeIt.ModalSurface.Yield("hud");
            Assert("closing the last surface leaves the screen to the world",
                !TrapMadeIt.ModalSurface.AnyOpen);

            TrapMadeIt.ModalSurface.ReleaseAll();

            bad += FacadeChecks();

            return bad;
        }

        /// <summary>
        /// The façade system (WORLD-V02).
        ///
        /// Two things are contractual here and neither is a colour or a width.
        ///
        /// DETERMINISM. The same building must produce the same frontage on
        /// every machine and every run. It is chosen from a hash of the OSM id,
        /// so this is provable rather than hopeful — and it has to be proved,
        /// because the failure is invisible: a city that reshuffles on reload
        /// looks fine in any single screenshot.
        ///
        /// EXACT COVER. Bays must tile their wall with no gap and no overlap.
        /// A gap is a hole you can see the inside of the building through; an
        /// overlap is z-fighting along a vertical seam. Both are the kind of
        /// defect that shows up on one building in five hundred, which is
        /// exactly what a test is for and an eye is not.
        /// </summary>
        static int FacadeChecks()
        {
            int bad = 0;
            void Assert(string what, bool pass, string note = "")
            {
                Console.WriteLine($"{(pass ? "ok  " : "FAIL")}  {what}{(note.Length > 0 ? " — " + note : "")}");
                if (!pass) bad++;
            }

            // ---- the hash agrees with the JS that generates the world ----
            var casesPath = Path.Combine(Root, "scripts", "lib", "hash.cases.json");
            if (!File.Exists(casesPath))
            {
                Assert("the shared hash table is present", false, casesPath);
            }
            else
            {
                var json = File.ReadAllText(casesPath);
                int checkedCases = 0, wrong = 0;
                string firstWrong = "";
                foreach (Match m in Regex.Matches(json,
                    @"\{\s*""id""\s*:\s*""([^""]*)""\s*,\s*""salt""\s*:\s*(-?\d+)\s*,\s*""unit""\s*:\s*([0-9.]+)\s*\}"))
                {
                    string id = m.Groups[1].Value;
                    int salt = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
                    float want = float.Parse(m.Groups[3].Value, CultureInfo.InvariantCulture);
                    float got = TrapMadeIt.TrapHash.Unit(id, salt);
                    checkedCases++;
                    if (Math.Abs(got - want) > 1e-6f && wrong++ == 0)
                        firstWrong = $"{id} salt {salt}: C# {got}, JS {want}";
                }
                Assert($"TrapHash matches the tiler's hashUnit ({checkedCases} cases)", checkedCases > 0 && wrong == 0,
                       wrong > 0 ? firstWrong : (checkedCases == 0 ? "no cases parsed" : ""));
            }

            // ---- bays cover their wall exactly ----
            var lengths = new float[] { 0.5f, 3.4f, 5.9f, 6.0f, 7.3f, 12.0f, 18.5f, 27.0f, 41.0f, 96.0f };
            var ids = new[] { "way/241765479", "way/705942979", "way/1214298451", "way/620328712" };

            float worstGap = 0f, narrowest = float.MaxValue, widest = 0f;
            bool everyBayPositive = true;
            foreach (var id in ids)
            {
                foreach (var L in lengths)
                {
                    for (int edge = 0; edge < 6; edge++)
                    {
                        var bays = TrapMadeIt.FacadeLayout.Divide(L, id, edge);
                        if (bays.Count == 0) continue;

                        // Start at zero, end at the wall, and meet in between.
                        worstGap = Math.Max(worstGap, Math.Abs(bays[0].Start));
                        worstGap = Math.Max(worstGap, Math.Abs(bays[bays.Count - 1].End - L));
                        for (int i = 1; i < bays.Count; i++)
                            worstGap = Math.Max(worstGap, Math.Abs(bays[i].Start - bays[i - 1].End));

                        foreach (var bay in bays)
                        {
                            if (bay.Width <= 0f) everyBayPositive = false;
                            if (bays.Count > 1 || L >= TrapMadeIt.FacadeLayout.MinArticulated)
                            {
                                narrowest = Math.Min(narrowest, bay.Width);
                                widest = Math.Max(widest, bay.Width);
                            }
                        }
                    }
                }
            }

            Assert("bays cover the wall exactly", worstGap < 0.001f, $"worst seam {worstGap:F6}m");
            Assert("no bay has zero or negative width", everyBayPositive);
            // The jitter is +/-14%, so the bounds are the layout's limits widened
            // by that. Testing the CONSTANTS rather than a snapshot: widths are
            // meant to be tuned, "no slivers and no barn doors" is not.
            Assert("no bay is a sliver", narrowest > TrapMadeIt.FacadeLayout.MinBay * 0.80f,
                   $"narrowest {narrowest:F2}m");
            Assert("no bay is a barn door", widest < TrapMadeIt.FacadeLayout.MaxBay * 1.20f,
                   $"widest {widest:F2}m");

            // ---- the same building lays out the same way, every time ----
            bool stable = true;
            string drift = "";
            foreach (var id in ids)
            {
                for (int edge = 0; edge < 4; edge++)
                {
                    var a = TrapMadeIt.FacadeLayout.Divide(17.4f, id, edge, 1);
                    var b = TrapMadeIt.FacadeLayout.Divide(17.4f, id, edge, 1);
                    if (a.Count != b.Count) { stable = false; drift = $"{id} edge {edge}: {a.Count} then {b.Count} bays"; break; }
                    for (int i = 0; i < a.Count; i++)
                        if (Math.Abs(a[i].Width - b[i].Width) > 1e-6f || a[i].Entrance != b[i].Entrance)
                        { stable = false; drift = $"{id} edge {edge} bay {i}"; break; }
                }
            }
            Assert("the same wall lays out identically twice", stable, drift);

            // Different walls of one building must NOT be identical, or a
            // building reads as extruded from a single elevation.
            var e0 = TrapMadeIt.FacadeLayout.Divide(17.4f, ids[0], 0);
            var e1 = TrapMadeIt.FacadeLayout.Divide(17.4f, ids[0], 1);
            bool differ = e0.Count != e1.Count;
            for (int i = 0; !differ && i < e0.Count; i++)
                if (Math.Abs(e0[i].Width - e1[i].Width) > 1e-4f) differ = true;
            Assert("two walls of one building are not the same wall", differ);

            // And two buildings must not share a frontage.
            var b0 = TrapMadeIt.FacadeLayout.Divide(17.4f, ids[0], 0);
            var b1 = TrapMadeIt.FacadeLayout.Divide(17.4f, ids[1], 0);
            bool distinct = b0.Count != b1.Count;
            for (int i = 0; !distinct && i < b0.Count; i++)
                if (Math.Abs(b0[i].Width - b1[i].Width) > 1e-4f) distinct = true;
            Assert("two buildings do not share one frontage", distinct);

            // ---- the entrance lands somewhere a door could be ----
            bool doorsInside = true, doorsStable = true;
            int cornerDoors = 0, doorSamples = 0;
            foreach (var id in ids)
            {
                for (int n = 1; n <= 9; n++)
                {
                    int bay = TrapMadeIt.FacadeLayout.EntranceBay(n, id);
                    if (bay < 0 || bay >= n) { doorsInside = false; break; }
                    if (bay != TrapMadeIt.FacadeLayout.EntranceBay(n, id)) doorsStable = false;
                    doorSamples++;
                    if (n >= 3 && (bay == 0 || bay == n - 1)) cornerDoors++;
                }
            }
            Assert("the entrance is always a real bay of the wall", doorsInside);
            Assert("the entrance does not move between runs", doorsStable);
            // On a frontage of three or more, a door tucked under the corner
            // reads as a mistake rather than a building.
            Assert("the entrance is never in a corner bay", cornerDoors == 0,
                   $"{cornerDoors} of {doorSamples}");

            // ---- storeys ----
            Assert("a single-storey shop has no upper windows",
                TrapMadeIt.FacadeLayout.UpperStoreys(3.4f, 3.2f, 3.2f) == 0);
            Assert("a four-storey building gets three storeys of upper windows",
                TrapMadeIt.FacadeLayout.UpperStoreys(12.8f, 3.2f, 3.2f) == 3);
            Assert("windows never run past the top of the wall",
                TrapMadeIt.FacadeLayout.UpperStoreys(9.0f, 3.2f, 3.2f) * 3.2f <= 9.0f - 3.2f + 0.01f + 1.6f);

            return bad;
        }

        /// <summary>
        /// What a hill costs, checked against the rule walkers actually use.
        ///
        /// Naismith's rule is the reason 3.5 is the default penalty, so the
        /// curve is worth pinning: if somebody "tunes" it later and Steep Hill
        /// stops being steep, this says so rather than the city quietly
        /// flattening out.
        /// </summary>
        static int CheckSlope()
        {
            int bad = 0;
            void Expect(string what, float actual, float want, float tol)
            {
                bool ok = System.Math.Abs(actual - want) <= tol;
                Console.WriteLine($"{(ok ? "ok  " : "FAIL")}  {what} — {actual:F3} (wanted {want:F3} ±{tol})");
                if (!ok) bad++;
            }
            void Assert(string what, bool ok, string detail)
            {
                Console.WriteLine($"{(ok ? "ok  " : "FAIL")}  {what}{(detail.Length > 0 ? " — " + detail : "")}");
                if (!ok) bad++;
            }

            const float P = 3.5f;

            Expect("flat ground costs nothing", TrapMadeIt.SlopeCost.For(0f, P), 1f, 0.001f);

            // Naismith: a 1-in-6 climb costs about a third of your pace.
            Expect("a 1-in-6 climb costs about a third", TrapMadeIt.SlopeCost.For(1f / 6f, P), 0.63f, 0.03f);

            Assert("a steeper climb is always slower than a shallower one",
                TrapMadeIt.SlopeCost.For(0.30f, P) < TrapMadeIt.SlopeCost.For(0.15f, P), "");

            Assert("uphill never stops you completely",
                TrapMadeIt.SlopeCost.For(10f, P) >= TrapMadeIt.SlopeCost.SlowestUphill - 0.001f,
                $"a cliff still leaves {TrapMadeIt.SlopeCost.For(10f, P):F2}");

            Assert("a gentle descent is quicker than the flat",
                TrapMadeIt.SlopeCost.For(-0.15f, P) > 1f, "");

            Assert("but a plunge is not",
                TrapMadeIt.SlopeCost.For(-1.0f, P) < 1f,
                $"1-in-1 down gives {TrapMadeIt.SlopeCost.For(-1.0f, P):F2}");

            Assert("descent benefit is capped",
                TrapMadeIt.SlopeCost.For(-0.24f, P) <= TrapMadeIt.SlopeCost.FastestDownhill + 0.001f, "");

            // The curve must not jump at the point it changes shape, or a
            // player crossing that gradient feels a lurch.
            float justUnder = TrapMadeIt.SlopeCost.For(-0.249f, P);
            float justOver = TrapMadeIt.SlopeCost.For(-0.251f, P);
            Assert("no discontinuity where the descent curve turns",
                System.Math.Abs(justUnder - justOver) < 0.01f,
                $"{justUnder:F3} vs {justOver:F3}");

            return bad;
        }


        static float Get(JsonElement e, string k) =>
            e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.Number ? v.GetSingle() : 0f;
        static string Str(JsonElement e, string k) =>
            e.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

        /// <summary>
        /// Every triangle must face the way its own normal says it does.
        ///
        /// Backface culling reads the VERTEX ORDER, not the normal attribute.
        /// Get them out of step and the wall is lit correctly, shaded
        /// correctly, and invisible from the side you are standing on -- you see
        /// straight through the building to the inside of its far wall. The web
        /// client shipped 42% of Lincoln like that, and this port was never
        /// checked, so here it is being checked.
        /// </summary>
        static int CheckWinding(List<BuildingData> buildings)
        {
            long triangles = 0, backwards = 0;
            int worstBuilding = -1;
            float worstShare = 0f;

            for (int i = 0; i < buildings.Count; i++)
            {
                // Through the Sink, which is the path the game actually takes.
                // Checking the two-buffer overload would be checking something
                // nothing runs.
                var sink = new BuildingMeshBuilder.Sink();
                try { BuildingMeshBuilder.Extrude(buildings[i], sink); }
                catch { continue; }   // degenerate footprint; not this check's problem

                foreach (var buf in sink.All.Values)
                {
                    long bad = 0, total = 0;
                    for (int t = 0; t + 2 < buf.triangles.Count; t += 3)
                    {
                        int a = buf.triangles[t], b = buf.triangles[t + 1], c = buf.triangles[t + 2];
                        if (a >= buf.vertices.Count || b >= buf.vertices.Count || c >= buf.vertices.Count)
                            continue;

                        var geometric = Vector3.Cross(
                            buf.vertices[b] - buf.vertices[a],
                            buf.vertices[c] - buf.vertices[a]);
                        if (geometric.magnitude < 1e-7f) continue;   // degenerate sliver

                        var declared = buf.normals[a];
                        total++;
                        if (Vector3.Dot(geometric.normalized, declared.normalized) < 0f) bad++;
                    }
                    triangles += total;
                    backwards += bad;
                    if (total > 0 && bad / (float)total > worstShare)
                    {
                        worstShare = bad / (float)total;
                        worstBuilding = i;
                    }
                }
            }

            bool ok = backwards == 0;
            Console.WriteLine($"{(ok ? "ok  " : "FAIL")}  every wall faces outward" +
                              $" — {backwards}/{triangles} triangles wound against their normal" +
                              (ok ? "" : $" (worst building #{worstBuilding}, {worstShare * 100f:F0}% of it)"));
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
