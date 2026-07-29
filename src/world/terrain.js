// ============================================================================
// TERRAIN — the ground under the block.
//
// Lincoln is built on an escarpment. The High Street sits at about 6m and the
// Cathedral at about 65m, and Steep Hill climbs most of that in a few hundred
// metres. The heightmaps come from Environment Agency LIDAR (1m, bare earth)
// via the tiler, resampled to a 5m grid per tile.
//
// Two jobs: give the renderer a ground mesh, and answer "how high is the floor
// here" for anything that has to stand on it — the player, the beacon, the
// doors. Height lookups happen every frame, so they are a couple of array reads
// and a bilinear blend, with no allocation.
//
// Contains public sector information licensed under the Open Government
// Licence v3.0.
// ============================================================================

import { TILE_SIZE, tileKey } from "./geo.js";

/**
 * Height lookups across all loaded tiles.
 *
 * Tiles share their edge samples by construction — a tile spans 0..250m
 * inclusive at both ends — so neighbouring heightmaps agree exactly and the
 * ground has no seams to reconcile.
 */
export function createTerrainIndex() {
  const tiles = new Map(); // key -> { y, step, n, v }

  return {
    add(tx, tz, t) { if (t) tiles.set(tileKey(tx, tz), t); },
    remove(tx, tz) { tiles.delete(tileKey(tx, tz)); },
    get size() { return tiles.size; },
    has(tx, tz) { return tiles.has(tileKey(tx, tz)); },

    /**
     * Ground height at a world position, bilinearly interpolated.
     *
     * Returns null where no tile is loaded, so callers can tell "the ground is
     * at zero" apart from "the ground is not known yet" — treating an unloaded
     * tile as sea level drops the player through the map.
     */
    heightAt(x, z) {
      const tx = Math.floor(x / TILE_SIZE);
      const tz = Math.floor(z / TILE_SIZE);
      const t = tiles.get(tileKey(tx, tz));
      if (!t) return null;

      const localX = x - tx * TILE_SIZE;
      const localZ = z - tz * TILE_SIZE;
      const fx = localX / t.step;
      const fz = localZ / t.step;

      const i0 = Math.max(0, Math.min(t.n - 2, Math.floor(fx)));
      const j0 = Math.max(0, Math.min(t.n - 2, Math.floor(fz)));
      const sx = Math.max(0, Math.min(1, fx - i0));
      const sz = Math.max(0, Math.min(1, fz - j0));

      const v = t.v;
      const n = t.n;
      const a = v[j0 * n + i0];
      const b = v[j0 * n + i0 + 1];
      const c = v[(j0 + 1) * n + i0];
      const d = v[(j0 + 1) * n + i0 + 1];

      // Stored as decimetres above the tile's floor.
      const dm = (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
      return t.y + dm * 0.1;
    },
  };
}

/**
 * Build the visible ground for one tile.
 *
 * A grid mesh with per-vertex normals, so the hill catches the light and reads
 * as a slope rather than as a flat plane in a funny colour.
 */
export function buildTerrainMesh({ THREE, tile, tileX, tileZ, material }) {
  const { y, step, n, v } = tile;
  const originX = tileX * TILE_SIZE;
  const originZ = tileZ * TILE_SIZE;

  const positions = new Float32Array(n * n * 3);
  const uvs = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const k = j * n + i;
      positions[k * 3] = originX + i * step;
      positions[k * 3 + 1] = y + v[k] * 0.1;
      positions[k * 3 + 2] = originZ + j * step;
      // UVs in real metres, so the ground texture does not stretch on slopes
      // and tiles line up with their neighbours.
      uvs[k * 2] = (originX + i * step) / 8;
      uvs[k * 2 + 1] = (originZ + j * step) / 8;
    }
  }

  const indices = [];
  for (let j = 0; j < n - 1; j += 1) {
    for (let i = 0; i < n - 1; i += 1) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      // Wound so the faces point up, same rule as everything else in the world.
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}
