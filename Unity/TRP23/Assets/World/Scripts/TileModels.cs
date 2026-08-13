using System;
using UnityEngine;   // Vector2Int, for the tile index

namespace TrapMadeIt.World
{
    /// <summary>
    /// The wire format of a map tile.
    ///
    /// Field names are one and two letters because they are sent for every tile
    /// and there are eighty-five of them. They are NOT arbitrary: JsonUtility
    /// maps by name and says nothing at all when one does not line up — it just
    /// leaves the value empty — so these have to match the server exactly.
    /// The meanings are in exports/unity-world.json.
    /// </summary>
    [Serializable]
    public class TilePayload
    {
        public BuildingData[] b;   // buildings
        public RoadData[] r;       // road ribbons
        public AreaData[] a;       // paved areas (already tessellated)
        public CoverData[] c;      // grass, woodland, water
        public float[] w;          // trees, flat [x,y,z,...]
        public WallData[] l;       // boundary walls and hedges
        public FurnitureData[] f;  // benches, bollards, lamps
        public TerrainPatch t;     // the ground
        public bool empty;         // the server says there is nothing here
    }

    [Serializable]
    public class BuildingData
    {
        public string i;    // OSM id
        public float[] p;   // footprint ring, flat [x,z,...]
        public float y;     // lowest ground under it, less a skirt
        public float s;     // street level: the HIGHEST ground under it
        public float h;     // height above street level
        public string st;   // brick | limestone | render | modern | monument
        public string g;    // shopfront | residential | blank
        public string rs;   // gabled | hipped | flat
                            // "hipped" arrives only from a re-tile: the shipped
                            // export predates it, so PitchedRoof falls back to
                            // footprint aspect. See FACADE-SYSTEM / ROOF-SYSTEM.
        public int[] c;     // colour, 0-255
        public string m;    // massing: gateway | cathedral | castle
        public int lm;      // 1 = a landmark, drawn from the manifest instead
        public string n;    // name, when it has one
    }

    [Serializable]
    public class RoadData
    {
        public float[] p;   // centre line, flat [x,z,...]
        public float[] e;   // ground height per vertex
        public float w;     // width in metres
        public string k;    // highway kind
        public string s;    // surface
        public int br;      // 1 = a bridge deck, which does NOT follow the ground
    }

    [Serializable]
    public class AreaData
    {
        public float[] v;   // vertices, flat [x,y,z,...] — already on the ground
        public int[] i;     // triangle indices
        public string s;    // surface
    }

    [Serializable]
    public class CoverData
    {
        public float[] v;
        public int[] i;
        public string k;    // grass | wood | water
    }

    [Serializable]
    public class WallData
    {
        public float[] p;
        public float[] e;
        public string k;    // wall | city | hedge
    }

    [Serializable]
    public class FurnitureData
    {
        public float x, y, z;
        public string k;    // bench | bollard | postbox | bin | lamp | stop
    }

    /// <summary>
    /// The heightmap for one tile.
    ///
    /// Named Patch rather than Data because UnityEngine.TerrainData already
    /// exists, and any file importing both namespaces would not know which one
    /// was meant.
    ///
    /// Heights are stored as DECIMETRES above the tile's own floor, as integers,
    /// which is what keeps a tile to a sensible size. Real height is y + v * 0.1.
    /// </summary>
    [Serializable]
    public class TerrainPatch
    {
        public float y;     // the tile's floor, in metres
        public float step;  // spacing between samples, in metres
        public int n;       // samples per side (n * n total)
        public int[] v;     // decimetres above y, row major
    }

    // ---------------------------------------------------------------- manifest

    [Serializable]
    public class MapManifest
    {
        public int tileSize;
        public int buildingCount;
        public float[] spawn;        // [x, z]
        public float spawnYaw;
        public float[] terrainRange; // [lowest, highest] across the whole city
        public int terrainStep;
        public string attribution;
        public AnchorData[] anchors;
        public BuildingData[] landmarks; // always visible, never streamed out
        public long builtAt;

        // tiles is [[x,z],[x,z],...]. JsonUtility cannot read a jagged array, so
        // it is parsed separately — see MapClient.
        [NonSerialized] public Vector2Int[] tiles;
    }

    [Serializable]
    public class AnchorData
    {
        public string key;
        public string kind;   // chapter | bank | placeholder
        public string name;
        public string sub;
        public string buildingId;
        public float x, z;    // where the player stands to get the prompt
        public DoorData door;
        public ExitData exit;
    }

    [Serializable]
    public class DoorData
    {
        public float x, z, yaw, width, nx, nz;
    }

    [Serializable]
    public class ExitData
    {
        public float x, z, yaw;
    }
}
