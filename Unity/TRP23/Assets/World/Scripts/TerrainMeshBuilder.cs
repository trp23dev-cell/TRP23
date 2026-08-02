using UnityEngine;

namespace TrapMadeIt.World
{
    /// <summary>
    /// One tile's ground, as a mesh.
    ///
    /// The heights are real: Environment Agency LIDAR at 1m, resampled to 5m.
    /// Lincoln runs from 1.5m at the Brayford to 78m at the Cathedral, and that
    /// climb is the city — so this is the first thing to get right, and the
    /// thing everything else stands on.
    /// </summary>
    public static class TerrainMeshBuilder
    {
        public static Mesh Build(TerrainPatch patch, Vector2Int tile)
        {
            if (patch == null || patch.v == null || patch.n < 2) return null;

            int n = patch.n;
            float step = patch.step;
            float originX = tile.x * TrapGeo.TileSize;
            float originZ = tile.y * TrapGeo.TileSize;

            var vertices = new Vector3[n * n];
            var uvs = new Vector2[n * n];

            for (int j = 0; j < n; j++)
            {
                for (int i = 0; i < n; i++)
                {
                    int k = j * n + i;
                    float x = originX + i * step;
                    float z = originZ + j * step;
                    // Stored as decimetres above the tile's floor.
                    float y = patch.y + patch.v[k] * 0.1f;
                    vertices[k] = new Vector3(x, y, z);
                    // UVs in real metres, so the ground texture does not stretch
                    // on a slope and lines up with the neighbouring tile.
                    uvs[k] = new Vector2(x / 8f, z / 8f);
                }
            }

            var triangles = new int[(n - 1) * (n - 1) * 6];
            int t = 0;
            for (int j = 0; j < n - 1; j++)
            {
                for (int i = 0; i < n - 1; i++)
                {
                    int a = j * n + i;
                    int b = a + 1;
                    int c = a + n;
                    int d = c + 1;
                    // Wound so the faces point UP. Get this backwards and the
                    // ground is invisible from above while being solid from
                    // below, which reads as the terrain having failed to load.
                    triangles[t++] = a; triangles[t++] = c; triangles[t++] = b;
                    triangles[t++] = b; triangles[t++] = c; triangles[t++] = d;
                }
            }

            var mesh = new Mesh
            {
                name = $"terrain_{tile.x}_{tile.y}",
                // 51x51 fits in 16 bits, but a finer step would not, and the
                // failure is silent corruption rather than an error.
                indexFormat = vertices.Length > 65000
                    ? UnityEngine.Rendering.IndexFormat.UInt32
                    : UnityEngine.Rendering.IndexFormat.UInt16,
            };
            mesh.vertices = vertices;
            mesh.uv = uvs;
            mesh.triangles = triangles;
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            return mesh;
        }

        /// <summary>
        /// Height at a world position, by bilinear interpolation — what the
        /// player walks on. Returns false outside the patch.
        /// </summary>
        public static bool SampleHeight(TerrainPatch patch, Vector2Int tile, float x, float z, out float height)
        {
            height = 0f;
            if (patch == null || patch.v == null || patch.n < 2) return false;

            float localX = x - tile.x * TrapGeo.TileSize;
            float localZ = z - tile.y * TrapGeo.TileSize;
            float fx = localX / patch.step;
            float fz = localZ / patch.step;

            int i0 = Mathf.Clamp(Mathf.FloorToInt(fx), 0, patch.n - 2);
            int j0 = Mathf.Clamp(Mathf.FloorToInt(fz), 0, patch.n - 2);
            float sx = Mathf.Clamp01(fx - i0);
            float sz = Mathf.Clamp01(fz - j0);

            int n = patch.n;
            float a = patch.v[j0 * n + i0];
            float b = patch.v[j0 * n + i0 + 1];
            float c = patch.v[(j0 + 1) * n + i0];
            float d = patch.v[(j0 + 1) * n + i0 + 1];

            float dm = (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
            height = patch.y + dm * 0.1f;
            return true;
        }
    }
}
