using UnityEngine;

namespace TrapMadeIt.World
{
    /// <summary>
    /// Lat/lon to game metres, and the tile grid.
    ///
    /// This MUST agree exactly with src/world/geo.js in the web client. Both
    /// read the same tiles from the same server, so a difference of any size
    /// puts Unity's buildings somewhere the web client's are not — and that
    /// failure looks like corrupt map data rather than a wrong constant, which
    /// is a long way to chase.
    ///
    /// Generated reference: exports/unity-world.json (npm run export:unity).
    /// </summary>
    public static class TrapGeo
    {
        // NatWest on Mint Street. The origin of the economy, and of the map.
        public const double OriginLat = 53.22940;
        public const double OriginLon = -0.54079;

        public const double MetresPerDegreeLat = 111320.0;

        /// Tile edge in metres. Tiles are keyed by floor(x / size).
        public const float TileSize = 250f;

        /// One storey, and the height of the shopfront band at street level.
        public const float Storey = 3.2f;

        /// <summary>
        /// Project a coordinate into world metres.
        ///
        /// NORTH IS NEGATIVE Z. That is not a typo and not a Unity convention —
        /// it is the convention the entire map is built on, including every
        /// door's facing angle. Flipping it mirrors the city.
        /// </summary>
        public static Vector2 Project(double lat, double lon)
        {
            double x = (lon - OriginLon) * MetresPerDegreeLat * System.Math.Cos(OriginLat * Mathf.Deg2Rad);
            double z = -(lat - OriginLat) * MetresPerDegreeLat;
            return new Vector2((float)x, (float)z);
        }

        /// Which tile a world position falls in.
        public static Vector2Int TileOf(float x, float z)
        {
            return new Vector2Int(
                Mathf.FloorToInt(x / TileSize),
                Mathf.FloorToInt(z / TileSize)
            );
        }
    }
}
