using System.Collections.Generic;

namespace TrapMadeIt
{
    /// <summary>
    /// How a wall divides into bays.
    ///
    /// WHAT A BAY IS, AND WHAT IT IS NOT
    ///
    /// A bay is one vertical slice of frontage: a shop width, a house width,
    /// the module a Georgian terrace repeats. It is the primitive the whole
    /// façade system hangs off — windows align to it, the shopfront breaks at
    /// it, the entrance sits in one of them.
    ///
    /// It is **visual subdivision, not cadastral truth.** OSM knows a building
    /// footprint; it does not know where one shop ends and the next begins, and
    /// nothing here can. A terrace tagged as one polygon really is one polygon
    /// in the data. What this does is give it the RHYTHM of separate
    /// properties, because a 40-metre High Street frontage with no vertical
    /// articulation reads as a warehouse whatever texture is on it. Do not let
    /// anything downstream treat a bay as a property, an address or an owner.
    ///
    /// WHY IT IS IN CORE, WITH NO ENGINE TYPES
    ///
    /// Because it is arithmetic and it has to be provable. Bay widths that must
    /// sum to the wall exactly, an entrance that must land inside the building,
    /// and a layout that must be identical on every machine and every run are
    /// all things a test can pin down — and only if the code can run outside
    /// Unity, which is what check:world does.
    /// </summary>
    public static class FacadeLayout
    {
        /// <summary>Narrower than this and it is a corner return, not a bay.</summary>
        public const float MinBay = 3.5f;

        /// <summary>Wider than this and the wall has stopped being articulated.</summary>
        public const float MaxBay = 6.0f;

        /// <summary>A wall shorter than this gets one bay and no further thought.</summary>
        public const float MinArticulated = 6.0f;

        /// <summary>How far bay widths may stray from even, either way.</summary>
        const float Jitter = 0.14f;

        public struct Bay
        {
            /// <summary>Distance along the wall where this bay starts, in metres.</summary>
            public float Start;
            public float Width;
            /// <summary>True if this is the bay carrying the building's entrance.</summary>
            public bool Entrance;

            public float End => Start + Width;
        }

        /// <summary>
        /// Divide one wall.
        ///
        /// The width is chosen first, then the count, then the count is pulled
        /// back into range — in that order, because it is the COUNT that has to
        /// be an integer and the width that has to be plausible. Doing it the
        /// other way leaves a last bay of 40cm at one end, which is exactly
        /// what a wall texture tiling by metres already did at every corner.
        /// </summary>
        /// <param name="length">Wall length in metres.</param>
        /// <param name="id">Stable building id — the OSM way, never an index.</param>
        /// <param name="edge">Which edge of the footprint, so two walls of one
        /// building do not get identical layouts.</param>
        /// <param name="entranceBay">Which bay holds the door, or -1 for none.</param>
        public static List<Bay> Divide(float length, string id, int edge, int entranceBay = -1)
        {
            var bays = new List<Bay>();
            if (length <= 0.01f) return bays;

            int count = CountFor(length, id, edge);

            // Uneven, but exactly summing to the wall.
            //
            // Each bay is nudged deterministically, then every width is scaled
            // by the same factor so the total is the wall length to the float.
            // Distributing the remainder into the last bay instead — the
            // obvious alternative — makes the last bay the odd one on every
            // building in the city, which reads as a mistake rather than as
            // variety.
            var raw = new float[count];
            float sum = 0f;
            for (int i = 0; i < count; i++)
            {
                float nudge = 1f + TrapHash.Signed(id, 1300 + edge * 32 + i) * Jitter;
                raw[i] = nudge;
                sum += nudge;
            }

            float at = 0f;
            for (int i = 0; i < count; i++)
            {
                float w = length * (raw[i] / sum);
                bays.Add(new Bay { Start = at, Width = w, Entrance = i == entranceBay });
                at += w;
            }

            return bays;
        }

        /// <summary>
        /// How many bays a wall of this length wants.
        ///
        /// Separate and public because the count is the invariant worth
        /// testing: bay widths can be tuned, but "no bay is ever wider than
        /// MaxBay, and a wall is never divided into slivers" is contractual.
        /// </summary>
        public static int CountFor(float length, string id, int edge)
        {
            if (length < MinArticulated) return 1;

            // Target width varies per wall so the whole city does not share one
            // module. Kept inside the plausible range at both ends.
            float target = 4.0f + TrapHash.Unit(id, 900 + edge) * 1.5f;   // 4.0 .. 5.5
            int count = (int)System.Math.Round(length / target);
            if (count < 1) count = 1;

            // Too wide: add bays until every one is inside MaxBay.
            while (length / count > MaxBay) count++;
            // Too narrow: remove bays until they stop being slivers. Guarded at
            // 1, because a 6.2m wall genuinely is one bay and must not loop.
            while (count > 1 && length / count < MinBay) count--;

            return count;
        }

        /// <summary>
        /// Which bay of which wall gets the front door.
        ///
        /// One per building, on its longest wall, because that is the frontage
        /// — and because a building with a door on every elevation reads as a
        /// public building, which almost none of these are. The bay is chosen
        /// away from the very ends where a door would sit under a corner.
        /// </summary>
        public static int EntranceBay(int bayCount, string id)
        {
            if (bayCount <= 0) return -1;
            if (bayCount <= 2) return (int)(TrapHash.Unit(id, 77) * bayCount) % bayCount;

            // Interior bays only: 1 .. count-2.
            int span = bayCount - 2;
            return 1 + (int)(TrapHash.Unit(id, 77) * span) % span;
        }

        /// <summary>
        /// How many storeys sit above the ground floor.
        ///
        /// Uses the height the tiler already resolved — an explicit `height`
        /// tag, then a LIDAR measurement, then storeys times 3.2. So this is
        /// not a second guess at the building's size, it is a division of the
        /// answer that already exists.
        /// </summary>
        public static int UpperStoreys(float totalHeight, float groundHeight, float storey)
        {
            float above = totalHeight - groundHeight;
            if (above <= 0.4f || storey <= 0.1f) return 0;
            int n = (int)System.Math.Round(above / storey);
            return n < 1 ? 1 : n;
        }
    }
}
