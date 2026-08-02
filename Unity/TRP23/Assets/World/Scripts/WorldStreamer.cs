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

        // Everything else gets a flat colour for now. Textures come later; the
        // point of this pass is that the city has roads, grass and water at all
        // rather than buildings floating on bare ground.
        /// The shader that reads per-building colour. Named here so the setup
        /// script and the runtime agree on one string.
        public const string VertexColourShader = "TRAP/Vertex Colour";

        readonly Dictionary<string, Material> palette = new Dictionary<string, Material>();

        static readonly Dictionary<string, Color> Palette = new Dictionary<string, Color>
        {
            { "asphalt",  new Color(0.18f, 0.17f, 0.16f) },
            { "paving",   new Color(0.42f, 0.41f, 0.38f) },
            { "cobble",   new Color(0.26f, 0.24f, 0.22f) },
            { "concrete", new Color(0.34f, 0.34f, 0.33f) },
            { "gravel",   new Color(0.30f, 0.27f, 0.22f) },
            { "grass",    new Color(0.24f, 0.34f, 0.16f) },
            { "wood",     new Color(0.16f, 0.24f, 0.11f) },
            // Water is the one smooth thing in the city, so it is the one thing
            // that catches the sky — which is what actually reads as water.
            { "water",    new Color(0.09f, 0.14f, 0.18f) },
            { "wall",     new Color(0.40f, 0.38f, 0.33f) },
            { "hedge",    new Color(0.14f, 0.21f, 0.10f) },
            { "bark",     new Color(0.20f, 0.16f, 0.11f) },
            { "foliage",  new Color(0.18f, 0.28f, 0.13f) },
            { "furniture",new Color(0.14f, 0.14f, 0.15f) },
        };

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
            // up by name. This is the fix for three rounds of magenta.
            //
            // Shader.Find("Universal Render Pipeline/Lit") returns NULL at
            // runtime here. URP shaders are not reachable by name unless
            // something already references them, and `new Material(null)` is
            // exactly what magenta is. The ground material renders correctly,
            // so the shader IT holds is known-good and known-loaded — borrowing
            // that is reliable where a name lookup is not.
            //
            // Anything else needing a shader at runtime should do the same.
            Shader known = groundMaterial != null ? groundMaterial.shader : null;
            if (known == null) known = Shader.Find("Universal Render Pipeline/Lit");
            if (known == null) known = Shader.Find("Universal Render Pipeline/Simple Lit");
            if (known == null) known = Shader.Find("Standard");

            Debug.Log($"[world] ground material: {(groundMaterial != null ? groundMaterial.name : "NONE")}, " +
                      $"shader in use: {(known != null ? known.name : "NONE FOUND — this is the magenta)")}");

            // TRAP/Vertex Colour multiplies the material colour by the mesh's
            // own, so a tinted wall material would darken every building by its
            // own tint. White lets each building's real colour through; under
            // the plain URP fallback the old flat tints are still right.
            bool vertexTinted = known != null && known.name == VertexColourShader;
            var wallTint = vertexTinted ? Color.white : new Color(0.55f, 0.50f, 0.44f);
            var roofTint = vertexTinted ? Color.white : new Color(0.20f, 0.21f, 0.23f);

            if (groundMaterial == null) groundMaterial = Make(known, new Color(0.32f, 0.35f, 0.27f), 0.05f, "TrapGround");
            if (buildingMaterial == null) buildingMaterial = Make(known, wallTint, 0.08f, "TrapWall");
            if (roofMaterial == null) roofMaterial = Make(known, roofTint, 0.10f, "TrapRoof");

            foreach (var kv in Palette)
            {
                // Water is smooth so it reflects; everything else is matte.
                float smooth = kv.Key == "water" ? 0.85f : 0.05f;
                palette[kv.Key] = Make(known, kv.Value, smooth, "Trap_" + kv.Key);
            }

            Debug.Log($"[world] walls: {(buildingMaterial != null ? buildingMaterial.name : "NONE")}, " +
                      $"roofs: {(roofMaterial != null ? roofMaterial.name : "NONE")}, " +
                      $"{palette.Count} surface materials");
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

            // Only pin to the ground when walking. Doing it while flying drags
            // the camera back down the moment you gain height, which makes it
            // impossible to look at the city from above.
            var flyer = follow.GetComponent<FlyCamera>();
            if (flyer != null && flyer.Flying) return;

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

                BuildSurfaces(go, payload, t);

                live[t] = go;
                patches[t] = payload.t;
            });
        }

        /// <summary>
        /// Roads, paved areas, land cover, walls, trees and furniture.
        ///
        /// Split by material and merged per tile, so a tile costs a handful of
        /// draw calls rather than one per object. Land cover sits just under
        /// the paving, so a path across a park wins where they overlap.
        /// </summary>
        void BuildSurfaces(GameObject parent, TilePayload payload, Vector2Int t)
        {
            var bySurface = new Dictionary<string, BuildingMeshBuilder.Buffers>();
            foreach (var k in SurfaceMeshBuilder.Surfaces)
                bySurface[k] = new BuildingMeshBuilder.Buffers();

            SurfaceMeshBuilder.Roads(payload.r, bySurface);

            // Paved areas: the High Street and every other pedestrianised
            // street, filled rather than traced.
            if (payload.a != null)
            {
                foreach (var a in payload.a)
                {
                    var buf = bySurface.ContainsKey(a.s ?? "paving") ? bySurface[a.s ?? "paving"] : bySurface["paving"];
                    SurfaceMeshBuilder.Filled(a.v, a.i, buf, Color.white);
                }
            }

            foreach (var kv in bySurface)
                AddMesh(parent, kv.Key, kv.Value.ToMesh($"{kv.Key}_{t.x}_{t.y}"), Mat(kv.Key), 0.06f);

            // Land cover: grass, woodland and the Brayford.
            var byCover = new Dictionary<string, BuildingMeshBuilder.Buffers>();
            foreach (var k in SurfaceMeshBuilder.Covers)
                byCover[k] = new BuildingMeshBuilder.Buffers();
            if (payload.c != null)
            {
                foreach (var c in payload.c)
                {
                    var key = byCover.ContainsKey(c.k ?? "grass") ? c.k : "grass";
                    SurfaceMeshBuilder.Filled(c.v, c.i, byCover[key], Color.white);
                }
            }
            foreach (var kv in byCover)
            {
                // Water at ground level; grass a shade under the paving.
                float lift = kv.Key == "water" ? 0f : 0.03f;
                AddMesh(parent, kv.Key, kv.Value.ToMesh($"{kv.Key}_{t.x}_{t.y}"), Mat(kv.Key), lift);
            }

            var stone = new BuildingMeshBuilder.Buffers();
            var hedge = new BuildingMeshBuilder.Buffers();
            SurfaceMeshBuilder.Walls(payload.l, stone, hedge);
            AddMesh(parent, "walls_boundary", stone.ToMesh($"bwall_{t.x}_{t.y}"), Mat("wall"));
            AddMesh(parent, "hedges", hedge.ToMesh($"hedge_{t.x}_{t.y}"), Mat("hedge"));

            var trunks = new BuildingMeshBuilder.Buffers();
            var canopies = new BuildingMeshBuilder.Buffers();
            SurfaceMeshBuilder.Trees(payload.w, trunks, canopies);
            AddMesh(parent, "trunks", trunks.ToMesh($"trunk_{t.x}_{t.y}"), Mat("bark"));
            AddMesh(parent, "canopies", canopies.ToMesh($"canopy_{t.x}_{t.y}"), Mat("foliage"));

            var furniture = new BuildingMeshBuilder.Buffers();
            SurfaceMeshBuilder.Furniture(payload.f, furniture);
            AddMesh(parent, "furniture", furniture.ToMesh($"furn_{t.x}_{t.y}"), Mat("furniture"));
        }

        Material Mat(string key) => palette.TryGetValue(key, out var m) ? m : buildingMaterial;

        static bool warnedNullMaterial;

        static void AddMesh(GameObject parent, string name, Mesh mesh, Material mat, float lift = 0f)
        {
            if (mesh == null) return;
            var go = new GameObject(name);
            go.transform.SetParent(parent.transform, false);
            // Lifted a hair off the terrain so the two do not z-fight.
            if (lift != 0f) go.transform.position = new Vector3(0f, lift, 0f);
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
