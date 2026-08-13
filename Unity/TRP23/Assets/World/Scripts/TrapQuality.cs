using System.Collections.Generic;
using UnityEngine;

namespace TrapMadeIt.World
{
    /// <summary>
    /// Which parts of Lincoln get which level of detail.
    ///
    /// WHY A GATE RATHER THAN "BUILD IT EVERYWHERE"
    ///
    /// The façade system is a prototype. Rolling it across all 294 tiles before
    /// anyone has looked at it would mean discovering it is wrong at 294 times
    /// the cost, and would put a 4.9x triangle increase into the whole city on
    /// the strength of arithmetic alone.
    ///
    /// So it is scoped to the six tiles of the High Street slice — the same six
    /// the visual audit chose, containing the Bank, the barber, the flagship,
    /// Stone Bow and the Guildhall. That is the ENHANCED tier from the audit's
    /// quality model, arriving as code rather than as a plan.
    ///
    /// This is not a hack around the prototype. It is the tier system, and it
    /// stays after V02 — the High Street is meant to be richer than the ring
    /// road for ever, because detail is a budget and that is where the player
    /// is. What changes later is which tiles are in which tier, not whether
    /// tiers exist.
    ///
    /// TO SEE IT EVERYWHERE
    ///
    /// Set <see cref="FacadesEverywhere"/> true. Deliberately a single switch
    /// so the rollout is one decision that can be measured and undone, rather
    /// than a scattering of conditions nobody can find.
    /// </summary>
    public static class TrapQuality
    {
        /// <summary>
        /// Turn the façade system on for the whole city. Off by default: see
        /// the triangle budget in the WORLD-V02 report before changing it.
        /// </summary>
        public static bool FacadesEverywhere = false;

        /// <summary>
        /// The audited High Street slice. x -250..250, z -250..500 in world
        /// metres — Stonebow at the centre, High Street running south, the foot
        /// of Steep Hill off the north edge.
        /// </summary>
        static readonly HashSet<Vector2Int> Slice = new HashSet<Vector2Int>
        {
            new Vector2Int(-1, -1), new Vector2Int(0, -1),
            new Vector2Int(-1,  0), new Vector2Int(0,  0),
            new Vector2Int(-1,  1), new Vector2Int(0,  1),
        };

        /// <summary>Does this tile get bays, shopfronts and window rhythm?</summary>
        public static bool Facades(Vector2Int tile) => FacadesEverywhere || Slice.Contains(tile);

        /// <summary>For reporting and tests.</summary>
        public static IReadOnlyCollection<Vector2Int> SliceTiles => Slice;
    }
}
