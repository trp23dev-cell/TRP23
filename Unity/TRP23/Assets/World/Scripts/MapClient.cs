using System;
using System.Collections;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.Networking;

namespace TrapMadeIt.World
{
    /// <summary>
    /// Fetches the map from the server. Never contacts OpenStreetMap directly —
    /// the server owns that, and both clients read the same pre-built tiles.
    /// </summary>
    public class MapClient : MonoBehaviour
    {
        [Tooltip("No trailing slash. http://localhost:8787 when running the server locally.")]
        public string apiBase = "https://trp23-production.up.railway.app";

        public MapManifest Manifest { get; private set; }

        readonly Dictionary<Vector2Int, TilePayload> cache = new Dictionary<Vector2Int, TilePayload>();
        readonly HashSet<Vector2Int> available = new HashSet<Vector2Int>();

        /// Whether the server actually has this tile. An empty index means the
        /// manifest failed to parse, and permitting everything in that case is
        /// what let a broken parser look like a working world.
        public bool Has(Vector2Int t) => available.Contains(t);
        public bool TryCached(Vector2Int t, out TilePayload p) => cache.TryGetValue(t, out p);

        public IEnumerator LoadManifest(Action<bool, string> done)
        {
            using (var req = UnityWebRequest.Get($"{apiBase.TrimEnd('/')}/api/map/manifest"))
            {
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success)
                {
                    done?.Invoke(false, $"could not reach the map: {req.error}");
                    yield break;
                }

                var json = req.downloadHandler.text;
                Manifest = JsonUtility.FromJson<MapManifest>(json);
                if (Manifest == null)
                {
                    done?.Invoke(false, "the manifest could not be read");
                    yield break;
                }

                Manifest.tiles = ParseTileIndex(json);
                available.Clear();
                foreach (var t in Manifest.tiles) available.Add(t);

                if (available.Count == 0)
                {
                    done?.Invoke(false, "the manifest carried no tile index — nothing would load");
                    yield break;
                }

                done?.Invoke(true, null);
            }
        }

        /// <summary>
        /// The tile index is [[x,z],[x,z],...] — a jagged array, which
        /// JsonUtility cannot represent at all, so it is pulled out directly.
        ///
        /// Bracket-matched rather than pattern-matched. A non-greedy regex
        /// stops at the first ']', which is the end of the first PAIR, not the
        /// end of the array — so it silently returned nothing and the streamer
        /// fell back to "load anything", which happened to work and hid it.
        /// </summary>
        static Vector2Int[] ParseTileIndex(string json)
        {
            int key = json.IndexOf("\"tiles\"", StringComparison.Ordinal);
            if (key < 0) return Array.Empty<Vector2Int>();
            int open = json.IndexOf('[', key);
            if (open < 0) return Array.Empty<Vector2Int>();

            int depth = 0;
            int close = -1;
            for (int i = open; i < json.Length; i++)
            {
                if (json[i] == '[') depth++;
                else if (json[i] == ']')
                {
                    depth--;
                    if (depth == 0) { close = i; break; }
                }
            }
            if (close < 0) return Array.Empty<Vector2Int>();

            var body = json.Substring(open + 1, close - open - 1);
            var pairs = Regex.Matches(body, @"\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]");
            var list = new List<Vector2Int>(pairs.Count);
            foreach (Match m in pairs)
            {
                list.Add(new Vector2Int(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value)));
            }
            return list.ToArray();
        }

        public IEnumerator LoadTile(Vector2Int t, Action<TilePayload> done)
        {
            if (cache.TryGetValue(t, out var hit)) { done?.Invoke(hit); yield break; }

            var url = $"{apiBase.TrimEnd('/')}/api/map/tile/{t.x}/{t.y}";
            using (var req = UnityWebRequest.Get(url))
            {
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning($"[map] tile {t.x},{t.y} failed: {req.error}");
                    done?.Invoke(null);
                    yield break;
                }

                var payload = JsonUtility.FromJson<TilePayload>(req.downloadHandler.text);
                if (payload != null) cache[t] = payload;
                done?.Invoke(payload);
            }
        }
    }
}
