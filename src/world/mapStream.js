// ============================================================================
// MAP STREAM — real Lincoln geometry, one tile at a time.
//
// The world is too big to build in one go and too big to hold in memory, so it
// arrives as 250m tiles from our own server (never from OSM directly) and is
// built and torn down as the player walks.
//
// Two things here carry the mobile frame rate, and both matter more than they
// look:
//   1. every building in a tile is merged into ONE geometry before it reaches
//      the scene — 500 separate meshes will not hold 60fps on a handset, a
//      handful of merged ones will;
//   2. geometry and materials are explicitly disposed on unload, because three
//      does not garbage-collect GPU buffers for you.
//
// Data © OpenStreetMap contributors, ODbL.
// ============================================================================

import { TILE_SIZE, tileKey } from "./geo.js";

// In the browser this is the usual same-origin (or VITE_API_ORIGIN) base. The
// globalThis fallback is the seam scripts/verify-map.mjs uses to point the real
// client code at a running server from plain Node, where import.meta.env does
// not exist and fetch() will not take a relative URL.
const API_BASE = `${import.meta.env?.VITE_API_ORIGIN || globalThis.__TRAP_API_ORIGIN || ""}/api`;

// How many tiles out from the player stay resident. 1 = the 3x3 block around
// the player, which at 250m tiles means geometry is always built at least 250m
// before it can be walked into.
const LOAD_RADIUS = 1;
// Unload one ring further out than we load, so walking back and forth across a
// boundary does not thrash build/teardown.
const KEEP_RADIUS = 2;

/**
 * Fetch the map manifest: tile index, origin, spawn and the story anchors.
 *
 * Kept separate from the stream factory so the game can await it once at boot
 * and then build the world synchronously, which is what lets loadWorld() stay
 * a plain function.
 */
export async function fetchMapManifest() {
  const res = await fetch(`${API_BASE}/map/manifest`);
  if (!res.ok) {
    const detail = res.status === 503 ? " — run: npm run map:build" : "";
    throw new Error(`map manifest unavailable (${res.status})${detail}`);
  }
  return res.json();
}

/**
 * Collision records for one tile payload: an AABB for the broadphase and the
 * ring itself for the push-out. Deliberately free of three and of any DOM, so
 * the physics can be exercised headlessly.
 */
export function tileBuildings(payload) {
  const out = [];
  for (const b of payload.b || []) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < b.p.length; i += 2) {
      if (b.p[i] < minX) minX = b.p[i];
      if (b.p[i] > maxX) maxX = b.p[i];
      if (b.p[i + 1] < minZ) minZ = b.p[i + 1];
      if (b.p[i + 1] > maxZ) maxZ = b.p[i + 1];
    }
    out.push({ id: b.i, ring: b.p, height: b.h, name: b.n || null, minX, maxX, minZ, maxZ });
  }
  return out;
}

/**
 * @param {object} opts
 * @param {object} opts.THREE
 * @param {object} opts.group   THREE.Group everything is added to
 * @param {object} opts.manifest  from fetchMapManifest()
 * @param {Function} opts.canvasTex  game's canvas-texture helper
 * @param {Function} [opts.setTextureQuality]
 * @param {Function} [opts.onTilesChanged]  called when the resident set changes
 */
export function createMapStream({ THREE, group, manifest, canvasTex, setTextureQuality, onTilesChanged }) {
  const available = new Set((manifest?.tiles || []).map(([x, z]) => tileKey(x, z)));
  const tune = (t) => { if (setTextureQuality) setTextureQuality(t); return t; };

  const resident = new Map();   // key -> { mesh, roadMesh, buildings }
  const inflight = new Map();   // key -> Promise
  const payloadCache = new Map(); // key -> payload, so a revisit is instant

  // Shared across every tile: one material and one texture for the whole city
  // rather than per-building copies.
  const wallTex = tune(canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = "#0b0a0c";
    g.fillRect(0, 0, w, h);
    for (let y = 12; y < h - 8; y += 22) {
      for (let x = 10; x < w - 8; x += 20) {
        const lit = Math.random() < 0.32;
        g.fillStyle = lit ? `rgba(201,160,106,${0.25 + Math.random() * 0.4})` : "rgba(28,26,24,0.6)";
        g.fillRect(x, y, 10, 12);
      }
    }
  }));
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: 0x15141a, roughness: 0.9 });
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x35322c, roughness: 0.95 });

  async function fetchTile(tx, tz) {
    const key = tileKey(tx, tz);
    if (payloadCache.has(key)) return payloadCache.get(key);
    const res = await fetch(`${API_BASE}/map/tile/${tx}/${tz}`);
    if (!res.ok) throw new Error(`tile ${key}: ${res.status}`);
    const payload = await res.json();
    payloadCache.set(key, payload);
    return payload;
  }

  /**
   * Extrude one footprint ring into walls.
   *
   * Only the side walls and a flat roof are generated — no floor, since it is
   * never visible and doubles the triangle count of the entire city.
   */
  function extrude(flat, height, positions, normals, uvs, indices) {
    const n = flat.length / 2;
    if (n < 3) return;

    for (let i = 0; i < n; i += 1) {
      const ax = flat[i * 2];
      const az = flat[i * 2 + 1];
      const j = (i + 1) % n;
      const bx = flat[j * 2];
      const bz = flat[j * 2 + 1];

      const ex = bx - ax;
      const ez = bz - az;
      const len = Math.hypot(ex, ez);
      if (len < 0.01) continue;
      const nx = ez / len;
      const nz = -ex / len;

      const base = positions.length / 3;
      positions.push(ax, 0, az, bx, 0, bz, bx, height, bz, ax, height, az);
      for (let k = 0; k < 4; k += 1) normals.push(nx, 0, nz);
      // Tile the window texture by real metres so a wide building gets more
      // windows rather than stretched ones.
      const u = len / 6;
      const v = height / 6;
      uvs.push(0, 0, u, 0, u, v, 0, v);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    // Roof: fan from the first vertex. Footprints are near-convex enough at this
    // scale that a fan is indistinguishable from a proper triangulation when
    // seen from street level.
    const roofBase = positions.length / 3;
    for (let i = 0; i < n; i += 1) {
      positions.push(flat[i * 2], height, flat[i * 2 + 1]);
      normals.push(0, 1, 0);
      uvs.push(0, 0);
    }
    for (let i = 1; i < n - 1; i += 1) {
      indices.push(roofBase, roofBase + i, roofBase + i + 1);
    }
  }

  function buildTile(key, payload) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (const b of payload.b || []) extrude(b.p, b.h, positions, normals, uvs, indices);
    const buildings = tileBuildings(payload);

    let mesh = null;
    if (positions.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeBoundingSphere();
      mesh = new THREE.Mesh(geo, wallMat);
      mesh.castShadow = false;   // a whole city casting shadows is not affordable
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // Roads as flat ribbons laid just above the ground plane.
    const rp = [];
    const ri = [];
    for (const r of payload.r || []) {
      const half = r.w / 2;
      const count = r.p.length / 2;
      for (let i = 0; i < count - 1; i += 1) {
        const ax = r.p[i * 2];
        const az = r.p[i * 2 + 1];
        const bx = r.p[i * 2 + 2];
        const bz = r.p[i * 2 + 3];
        const ex = bx - ax;
        const ez = bz - az;
        const len = Math.hypot(ex, ez);
        if (len < 0.01) continue;
        const nx = (ez / len) * half;
        const nz = (-ex / len) * half;
        const base = rp.length / 3;
        rp.push(ax + nx, 0, az + nz, bx + nx, 0, bz + nz, bx - nx, 0, bz - nz, ax - nx, 0, az - nz);
        ri.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }

    let roadMesh = null;
    if (rp.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3));
      geo.setIndex(ri);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      roadMesh = new THREE.Mesh(geo, roadMat);
      roadMesh.position.y = 0.02; // above the ground plane, below the kerbs
      roadMesh.receiveShadow = true;
      group.add(roadMesh);
    }

    resident.set(key, { mesh, roadMesh, buildings, roads: payload.r || [] });
  }

  function unloadTile(key) {
    const t = resident.get(key);
    if (!t) return;
    if (t.mesh) {
      group.remove(t.mesh);
      t.mesh.geometry.dispose();
    }
    if (t.roadMesh) {
      group.remove(t.roadMesh);
      t.roadMesh.geometry.dispose();
    }
    resident.delete(key);
  }

  /**
   * Bring the resident tile set in line with where the player is standing.
   * Cheap enough to call every frame: it early-outs unless the player has
   * actually crossed into a new tile.
   */
  let lastTile = null; // null until the first update, so the first call always builds
  let currentTx = 0;
  let currentTz = 0;
  function update(x, z, { force = false } = {}) {
    const tx = Math.floor(x / TILE_SIZE);
    const tz = Math.floor(z / TILE_SIZE);
    const here = tileKey(tx, tz);
    if (!force && here === lastTile) return false;
    lastTile = here;
    currentTx = tx;
    currentTz = tz;

    for (let dz = -LOAD_RADIUS; dz <= LOAD_RADIUS; dz += 1) {
      for (let dx = -LOAD_RADIUS; dx <= LOAD_RADIUS; dx += 1) {
        const key = tileKey(tx + dx, tz + dz);
        if (resident.has(key) || inflight.has(key)) continue;
        if (available.size && !available.has(key)) continue; // edge of the world
        const wantX = tx + dx;
        const wantZ = tz + dz;
        const p = fetchTile(wantX, wantZ)
          .then((payload) => {
            inflight.delete(key);
            // The player may have walked out of range while this was in the
            // air. Building it anyway would leak a tile nothing will unload.
            if (Math.abs(wantX - currentTx) > KEEP_RADIUS || Math.abs(wantZ - currentTz) > KEEP_RADIUS) return;
            buildTile(key, payload);
            if (onTilesChanged) onTilesChanged();
          })
          .catch((err) => {
            inflight.delete(key);
            console.warn("[map]", err.message);
          });
        inflight.set(key, p);
      }
    }

    for (const key of [...resident.keys()]) {
      const [kx, kz] = key.split(",").map(Number);
      if (Math.abs(kx - tx) > KEEP_RADIUS || Math.abs(kz - tz) > KEEP_RADIUS) unloadTile(key);
    }

    if (onTilesChanged) onTilesChanged();
    return true;
  }

  /** Every building currently resident, for collision and the minimap. */
  function activeBuildings() {
    const out = [];
    for (const t of resident.values()) out.push(...t.buildings);
    return out;
  }

  function activeRoads() {
    const out = [];
    for (const t of resident.values()) out.push(...t.roads);
    return out;
  }

  function dispose() {
    for (const key of [...resident.keys()]) unloadTile(key);
    wallMat.dispose();
    roadMat.dispose();
    wallTex.dispose();
    payloadCache.clear();
  }

  return {
    update,
    activeBuildings,
    activeRoads,
    dispose,
    get residentCount() { return resident.size; },
  };
}
