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
import { extrudeBuilding, emptyBuffers } from "./buildingMesh.js";
import {
  facadeAlbedo, facadeEmissive, shopfrontAlbedo, shopfrontEmissive, roofAlbedo, roadAlbedo,
} from "./cityTextures.js";

/** Stable 0..1 hash of an OSM id, for per-building variation that never flickers. */
function hashUnit(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

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
export function createMapStream({
  THREE, group, manifest, canvasTex, setTextureQuality, onTilesChanged, nightLift = 1,
}) {
  const available = new Set((manifest?.tiles || []).map(([x, z]) => tileKey(x, z)));
  const tune = (t) => { if (setTextureQuality) setTextureQuality(t); return t; };

  const resident = new Map();   // key -> { mesh, roadMesh, buildings }
  const inflight = new Map();   // key -> Promise
  const payloadCache = new Map(); // key -> payload, so a revisit is instant

  // Shared across every tile: one material set for the whole city rather than
  // per-building copies. Textures repeat, and the UVs are in real metres, so a
  // single 256px tile dresses the entire block.
  const repeating = (tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tune(tex);
  };

  const textures = {
    facade: repeating(facadeAlbedo(canvasTex)),
    facadeLit: repeating(facadeEmissive(canvasTex)),
    shop: repeating(shopfrontAlbedo(canvasTex)),
    shopLit: repeating(shopfrontEmissive(canvasTex)),
    roof: repeating(roofAlbedo(canvasTex)),
    road: repeating(roadAlbedo(canvasTex)),
  };
  textures.roof.repeat.set(1, 1);
  textures.road.repeat.set(0.35, 0.35);

  // emissiveIntensity is driven by the mood, so windows and shopfronts burn at
  // dusk and fade back as the sky comes up to meet them.
  const materials = {
    wall: new THREE.MeshStandardMaterial({
      map: textures.facade,
      emissiveMap: textures.facadeLit,
      emissive: 0xffd2a1, // warm bulb light, never white
      emissiveIntensity: nightLift,
      roughness: 0.92,
      vertexColors: true,
    }),
    ground: new THREE.MeshStandardMaterial({
      map: textures.shop,
      emissiveMap: textures.shopLit,
      emissive: 0xffd2a1, // warm bulb light, never white
      emissiveIntensity: nightLift,
      roughness: 0.85,
      vertexColors: true,
    }),
    roof: new THREE.MeshStandardMaterial({
      map: textures.roof,
      roughness: 0.95,
      vertexColors: true,
    }),
    road: new THREE.MeshStandardMaterial({ map: textures.road, roughness: 0.96 }),
  };

  async function fetchTile(tx, tz) {
    const key = tileKey(tx, tz);
    if (payloadCache.has(key)) return payloadCache.get(key);
    const res = await fetch(`${API_BASE}/map/tile/${tx}/${tz}`);
    if (!res.ok) throw new Error(`tile ${key}: ${res.status}`);
    const payload = await res.json();
    payloadCache.set(key, payload);
    return payload;
  }

  /** Turn one buffer set into a mesh, or null if nothing was written to it. */
  function meshFrom(buf, material, y = 0) {
    if (!buf.positions.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(buf.positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(buf.normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(buf.uvs, 2));
    if (buf.colors.length) geo.setAttribute("color", new THREE.Float32BufferAttribute(buf.colors, 3));
    geo.setIndex(buf.indices);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = y;
    // A whole city casting shadows is not affordable on a handset; the sun
    // shadow is spent on the player and the street furniture instead.
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function buildTile(key, payload) {
    const buffers = emptyBuffers();
    for (const b of payload.b || []) {
      // A stable per-building tint off the OSM id, so a terrace reads as
      // separate properties rather than one extruded slab.
      const tint = 0.82 + hashUnit(b.i) * 0.30;
      extrudeBuilding(b.p, b.h, tint, buffers);
    }
    const buildings = tileBuildings(payload);

    const meshes = [
      meshFrom(buffers.ground, materials.ground),
      meshFrom(buffers.wall, materials.wall),
      meshFrom(buffers.roof, materials.roof),
    ].filter(Boolean);

    // Roads as flat ribbons laid just above the ground plane. Ends are mitred
    // by simply overlapping quads at each vertex — at street width the joins
    // are under the pavement furniture and nobody sees the seam.
    const road = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
    for (const r of payload.r || []) {
      const half = r.w / 2;
      const count = r.p.length / 2;
      let along = 0;
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
        const base = road.positions.length / 3;
        road.positions.push(
          ax + nx, 0, az + nz, bx + nx, 0, bz + nz,
          bx - nx, 0, bz - nz, ax - nx, 0, az - nz
        );
        for (let k = 0; k < 4; k += 1) road.normals.push(0, 1, 0);
        // UVs run along the road so the tarmac does not swim as it turns.
        road.uvs.push(along, 0, along + len, 0, along + len, r.w, along, r.w);
        along += len;
        road.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }

    // Just above the ground plane, so the two do not z-fight.
    const roadMesh = meshFrom(road, materials.road, 0.02);

    resident.set(key, { meshes, roadMesh, buildings, roads: payload.r || [] });
  }

  function unloadTile(key) {
    const t = resident.get(key);
    if (!t) return;
    for (const m of t.meshes) {
      group.remove(m);
      m.geometry.dispose();
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

  /**
   * Every tile the server has, for the full-city map.
   *
   * Deliberately separate from the streaming path: this fetches payloads and
   * builds no geometry at all, so opening the map does not put the whole city
   * on the GPU. Payloads share the streamer's cache, so tiles already walked
   * through cost nothing and the rest stay cached for next time.
   */
  let allTilesPromise = null;
  function loadWholeCity() {
    if (!allTilesPromise) {
      allTilesPromise = Promise.all(
        (manifest?.tiles || []).map(([tx, tz]) =>
          fetchTile(tx, tz).catch(() => ({ b: [], r: [] }))
        )
      ).then((payloads) => {
        const b = [];
        const r = [];
        for (const p of payloads) {
          b.push(...tileBuildings(p));
          r.push(...(p.r || []));
        }
        return { buildings: b, roads: r };
      });
    }
    return allTilesPromise;
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
    for (const m of Object.values(materials)) m.dispose();
    for (const t of Object.values(textures)) t.dispose();
    payloadCache.clear();
  }

  return {
    update,
    activeBuildings,
    activeRoads,
    loadWholeCity,
    dispose,
    get residentCount() { return resident.size; },
  };
}
