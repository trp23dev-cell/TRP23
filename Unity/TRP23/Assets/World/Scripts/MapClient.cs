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

        public bool Has(Vector2Int t) => available.Count == 0 || available.Contains(t);
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

                done?.Invoke(true, null);
            }
        }

        /// <summary>
        /// The tile index is [[x,z],[x,z],...] — a jagged array, which
        /// JsonUtility cannot represent at all. Rather than reshape the wire
        /// format for one client's serialiser, it is pulled out directly.
        /// </summary>
        static Vector2Int[] ParseTileIndex(string json)
        {
            var block = Regex.Match(json, "\"tiles\"\\s*:\\s*\\[(.*?)\\]\\s*,\\s*\"", RegexOptions.Singleline);
            var body = block.Success ? block.Groups[1].Value : null;
            if (string.IsNullOrEmpty(body)) return Array.Empty<Vector2Int>();

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
