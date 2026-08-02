using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace TrapMadeIt.World
{
    /// <summary>
    /// Streams the city in around the player, a tile at a time.
    ///
    /// Terrain and buildings, merged per tile: one ground mesh, one for walls
    /// and one for roofs. A thousand separate renderers would cost more than
    /// everything else in the scene put together, which is the lesson the web
    /// client already paid for.
    /// </summary>
    [RequireComponent(typeof(MapClient))]
    public class WorldStreamer : MonoBehaviour
    {
        [Tooltip("Tiles out from the player kept loaded. 2 = a 5x5 block, 1250m across.")]
        public int loadRadius = 2;

        [Tooltip("Follows this. Leave empty to use the main camera.")]
        public Transform follow;

        public Material groundMaterial;
        public Material buildingMaterial;
        public Material roofMaterial;

        MapClient client;
        readonly Dictionary<Vector2Int, GameObject> live = new Dictionary<Vector2Int, GameObject>();
        readonly Dictionary<Vector2Int, TerrainPatch> patches = new Dictionary<Vector2Int, TerrainPatch>();
        readonly HashSet<Vector2Int> inFlight = new HashSet<Vector2Int>();
        Vector2Int? lastTile;
        bool ready;

        void Awake()
        {
            client = GetComponent<MapClient>();

            // Take the shader from the ground material rather than looking it
            // up by name.
            //
            // The ground renders correctly, so whatever shader IT holds is
            // definitely valid and definitely loaded. Shader.Find depends on
            // the shader being reachable by name at runtime, which is an
            // assumption — and the magenta says an assumption in here is wrong.
            // Borrowing a known-good one removes the guess.
            Shader known = groundMaterial != null ? groundMaterial.shader : null;
            if (known == null) known = Shader.Find("Universal Render Pipeline/Lit");
            if (known == null) known = Shader.Find("Universal Render Pipeline/Simple Lit");
            if (known == null) known = Shader.Find("Standard");

            Debug.Log($"[world] ground material: {(groundMaterial != null ? groundMaterial.name : "NONE")}, " +
                      $"shader in use: {(known != null ? known.name : "NONE FOUND — this is the magenta)")}");

            if (groundMaterial == null) groundMaterial = Make(known, new Color(0.32f, 0.35f, 0.27f), 0.05f, "TrapGround");
            if (buildingMaterial == null) buildingMaterial = Make(known, new Color(0.55f, 0.50f, 0.44f), 0.08f, "TrapWall");
            if (roofMaterial == null) roofMaterial = Make(known, new Color(0.20f, 0.21f, 0.23f), 0.10f, "TrapRoof");

            Debug.Log($"[world] walls: {(buildingMaterial != null ? buildingMaterial.name : "NONE")}, " +
                      $"roofs: {(roofMaterial != null ? roofMaterial.name : "NONE")}");
        }

        static Material Make(Shader shader, Color colour, float smoothness, string name)
        {
            if (shader == null)
            {
                Debug.LogError($"[world] no shader available for {name} — it will render magenta.");
                return null;
            }
            var mat = new Material(shader) { name = name };
            // URP uses _BaseColor; Material.color writes _Color, which URP/Lit
            // does not have and silently ignores.
            if (mat.HasProperty("_BaseColor")) mat.SetColor("_BaseColor", colour);
            else mat.color = colour;
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", smoothness);
            return mat;
        }

        IEnumerator Start()
        {
            if (follow == null && Camera.main != null) follow = Camera.main.transform;

            yield return client.LoadManifest((ok, err) =>
            {
                if (!ok) { Debug.LogError($"[world] {err}"); return; }
                ready = true;
                var m = client.Manifest;
                Debug.Log($"[world] {m.tiles.Length} tiles, {m.buildingCount} buildings, " +
                          $"ground {m.terrainRange[0]}m to {m.terrainRange[1]}m. {m.attribution}");
            });

            if (!ready) yield break;

            // Stand the player where the web client does: on the street, facing
            // the hill. That heading was chosen by sampling the steepest climb,
            // so it points at the Cathedral.
            if (follow != null && client.Manifest.spawn != null && client.Manifest.spawn.Length == 2)
            {
                var s = client.Manifest.spawn;
                follow.position = new Vector3(s[0], client.Manifest.terrainRange[1] + 50f, s[1]);
                follow.rotation = Quaternion.Euler(0f, client.Manifest.spawnYaw * Mathf.Rad2Deg, 0f);
            }

            Refresh(true);
        }

        void Update()
        {
            if (!ready || follow == null) return;
            Refresh(false);

            // Keep the player on the ground once the tile under them exists.
            if (TryGroundHeight(follow.position.x, follow.position.z, out float y))
            {
                var p = follow.position;
                // Eye height, matching the web client.
                float target = y + 1.7f;
                if (p.y > target) p.y = Mathf.Max(target, p.y - Time.deltaTime * 30f);
                else p.y = target;
                follow.position = p;
            }
        }

        void Refresh(bool force)
        {
            var here = TrapGeo.TileOf(follow.position.x, follow.position.z);
            if (!force && lastTile.HasValue && lastTile.Value == here) return;
            lastTile = here;

            for (int dz = -loadRadius; dz <= loadRadius; dz++)
            {
                for (int dx = -loadRadius; dx <= loadRadius; dx++)
                {
                    var t = new Vector2Int(here.x + dx, here.y + dz);
                    if (live.ContainsKey(t) || inFlight.Contains(t)) continue;
                    if (!client.Has(t)) continue;      // edge of the world
                    inFlight.Add(t);
                    StartCoroutine(Load(t));
                }
            }

            // Unload one ring beyond the load radius, so walking back and forth
            // across a boundary does not thrash build and teardown.
            var drop = new List<Vector2Int>();
            foreach (var kv in live)
            {
                if (Mathf.Abs(kv.Key.x - here.x) > loadRadius + 1 ||
                    Mathf.Abs(kv.Key.y - here.y) > loadRadius + 1) drop.Add(kv.Key);
            }
            foreach (var t in drop)
            {
                Destroy(live[t]);
                live.Remove(t);
                patches.Remove(t);
            }
        }

        IEnumerator Load(Vector2Int t)
        {
            yield return client.LoadTile(t, payload =>
            {
                inFlight.Remove(t);
                if (payload?.t == null) return;

                var go = new GameObject($"tile_{t.x}_{t.y}");
                go.transform.SetParent(transform, false);

                var ground = TerrainMeshBuilder.Build(payload.t, t);
                if (ground != null) AddMesh(go, "ground", ground, groundMaterial);

                // Buildings, merged into two meshes for the whole tile rather
                // than one object each. Nine hundred separate renderers would
                // cost more than everything else in the scene put together.
                if (payload.b != null && payload.b.Length > 0)
                {
                    var walls = new BuildingMeshBuilder.Buffers();
                    var roofs = new BuildingMeshBuilder.Buffers();
                    foreach (var b in payload.b)
                    {
                        // Landmarks ride in the manifest and are built once,
                        // permanently. Drawing them here as well double-draws.
                        if (b.lm == 1) continue;
                        BuildingMeshBuilder.Extrude(b, walls, roofs);
                    }
                    AddMesh(go, "walls", walls.ToMesh($"walls_{t.x}_{t.y}"), buildingMaterial);
                    AddMesh(go, "roofs", roofs.ToMesh($"roofs_{t.x}_{t.y}"), roofMaterial);
                }

                live[t] = go;
                patches[t] = payload.t;
            });
        }

        static bool warnedNullMaterial;

        static void AddMesh(GameObject parent, string name, Mesh mesh, Material mat)
        {
            if (mesh == null) return;
            var go = new GameObject(name);
            go.transform.SetParent(parent.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            var mr = go.AddComponent<MeshRenderer>();
            if (mat != null)
            {
                mr.sharedMaterial = mat;
            }
            else if (!warnedNullMaterial)
            {
                // Once, not eighty-five times. A renderer with no material is
                // what magenta actually IS, and nothing was ever saying so.
                warnedNullMaterial = true;
                Debug.LogError($"[world] '{name}' has no material — that is the magenta.");
            }
        }

        /// Ground height under a world position, or false if that tile is not in.
        public bool TryGroundHeight(float x, float z, out float y)
        {
            y = 0f;
            var t = TrapGeo.TileOf(x, z);
            return patches.TryGetValue(t, out var patch)
                && TerrainMeshBuilder.SampleHeight(patch, t, x, z, out y);
        }
    }
}
