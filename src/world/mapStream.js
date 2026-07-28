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
import { extrudeBuilding, emptyBuffers, STYLES, triangulate, normalisedOrder } from "./buildingMesh.js";
import { createTerrainIndex, buildTerrainMesh } from "./terrain.js";
import {
  facadeAlbedo, facadeEmissive, shopfrontAlbedo, shopfrontEmissive, roofAlbedo, roadAlbedo,
  pavementAlbedo, plinthAlbedo, residentialAlbedo, residentialEmissive,
  monumentAlbedo, monumentEmissive, cobbleAlbedo, concreteAlbedo, gravelAlbedo,
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

// How many tiles out from the player stay resident, overridable per quality
// tier. 2 = the 5x5 block around the player, 1250m across, so there is real
// city out to ~500m in every direction rather than a 250m island. Costs about
// twelve draw calls per tile, which is why a low-end handset gets 1.
const DEFAULT_LOAD_RADIUS = 2;
// Unload one ring further out than we load, so walking back and forth across a
// boundary does not thrash build/teardown.


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
    out.push({
      id: b.i, ring: b.p, height: b.h, base: b.y ?? null, name: b.n || null,
      // A city gate is an archway over a road. Colliding its footprint puts an
      // invisible wall across the street you are supposed to walk down.
      passable: b.m === "gateway",
      minX, maxX, minZ, maxZ,
    });
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
  loadRadius = DEFAULT_LOAD_RADIUS,
}) {
  const LOAD_RADIUS = Math.max(1, loadRadius | 0);
  // Unload one ring beyond the load radius, so walking back and forth across a
  // boundary does not thrash build and teardown.
  const KEEP_RADIUS = LOAD_RADIUS + 1;
  const available = new Set((manifest?.tiles || []).map(([x, z]) => tileKey(x, z)));
  const tune = (t) => { if (setTextureQuality) setTextureQuality(t); return t; };

  const resident = new Map();   // key -> { meshes, buildings, roads, tileX, tileZ }
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
    shop: repeating(shopfrontAlbedo(canvasTex)),
    shopLit: repeating(shopfrontEmissive(canvasTex)),
    roof: repeating(roofAlbedo(canvasTex)),
    road: repeating(roadAlbedo(canvasTex)),
    pavement: repeating(pavementAlbedo(canvasTex)),
    plinth: repeating(plinthAlbedo(canvasTex)),
    cobble: repeating(cobbleAlbedo(canvasTex)),
    concrete: repeating(concreteAlbedo(canvasTex)),
    gravel: repeating(gravelAlbedo(canvasTex)),
    home: repeating(residentialAlbedo(canvasTex)),
    homeLit: repeating(residentialEmissive(canvasTex)),
  };
  for (const s of STYLES) {
    // Monuments get their own sheet, mapped over the whole elevation rather
    // than repeated per storey.
    textures[`facade_${s}`] = s === "monument"
      ? repeating(monumentAlbedo(canvasTex))
      : repeating(facadeAlbedo(canvasTex, s));
    textures[`facadeLit_${s}`] = s === "monument"
      ? repeating(monumentEmissive(canvasTex))
      : repeating(facadeEmissive(canvasTex, s));
  }
  textures.roof.repeat.set(1, 1);
  textures.road.repeat.set(0.35, 0.35);
  for (const k of ["cobble", "concrete", "gravel"]) textures[k].repeat.set(1, 1);

  // emissiveIntensity is driven by the mood, so windows and shopfronts burn at
  // dusk and fade back as the sky comes up to meet them.
  const materials = {
    ground: new THREE.MeshStandardMaterial({
      map: textures.shop,
      emissiveMap: textures.shopLit,
      emissive: 0xffd2a1, // warm bulb light, never white
      emissiveIntensity: nightLift,
      roughness: 0.85,
      vertexColors: true,
    }),
    residential: new THREE.MeshStandardMaterial({
      map: textures.home,
      emissiveMap: textures.homeLit,
      emissive: 0xffd2a1,
      emissiveIntensity: nightLift,
      roughness: 0.92,
      vertexColors: true,
    }),
    roof: new THREE.MeshStandardMaterial({
      map: textures.roof,
      roughness: 0.95,
      vertexColors: true,
    }),
    // One material per real surface. OSM tags this on 75% of Lincoln's ways.
    asphalt: new THREE.MeshStandardMaterial({ map: textures.road, roughness: 0.96 }),
    paving: new THREE.MeshStandardMaterial({ map: textures.pavement, roughness: 0.93 }),
    cobble: new THREE.MeshStandardMaterial({ map: textures.cobble, roughness: 0.95 }),
    concrete: new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.94 }),
    gravel: new THREE.MeshStandardMaterial({ map: textures.gravel, roughness: 0.99 }),
    // The stonework between the lowest ground and street level on sloping
    // sites. Always stone, whatever the building above it is made of — that is
    // how it is done, and it ties a mixed terrace together on a hill.
    plinth: new THREE.MeshStandardMaterial({
      map: textures.plinth, roughness: 0.95, vertexColors: true,
    }),
    // `ground` above is the shopfront band at street level; this is the actual
    // earth under the city.
    terrain: new THREE.MeshStandardMaterial({ map: textures.pavement, roughness: 0.97 }),
  };
  // One material per architectural style for the upper walls.
  const wallMaterials = {};
  for (const s of STYLES) {
    wallMaterials[s] = new THREE.MeshStandardMaterial({
      map: textures[`facade_${s}`],
      emissiveMap: textures[`facadeLit_${s}`],
      emissive: 0xffd2a1, // warm bulb light, never white
      emissiveIntensity: nightLift,
      roughness: s === "limestone" ? 0.95 : 0.92,
      vertexColors: true,
    });
  }

  const terrain = createTerrainIndex();

  // A tile that fails to arrive is not a cosmetic problem: it leaves a hole in
  // the ground with no heightmap, so retry a few times before giving up.
  async function fetchTile(tx, tz, attempt = 0) {
    const key = tileKey(tx, tz);
    if (payloadCache.has(key)) return payloadCache.get(key);
    try {
      const res = await fetch(`${API_BASE}/map/tile/${tx}/${tz}`);
      if (!res.ok) throw new Error(`tile ${key}: ${res.status}`);
      const payload = await res.json();
      payloadCache.set(key, payload);
      return payload;
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 150 * 2 ** attempt));
      return fetchTile(tx, tz, attempt + 1);
    }
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

  function buildTile(key, payload, tileX, tileZ) {
    // Ground first: everything else stands on it.
    let terrainMesh = null;
    if (payload.t) {
      terrain.add(tileX, tileZ, payload.t);
      terrainMesh = buildTerrainMesh({
        THREE, tile: payload.t, tileX, tileZ, material: materials.terrain,
      });
      group.add(terrainMesh);
    }

    const buffers = emptyBuffers();
    for (const b of payload.b || []) {
      if (b.lm) continue; // built once from the manifest, not per tile
      // The building's own colour, from OSM where it is tagged and from its
      // material and period where it is not.
      const tint = b.c
        ? [b.c[0] / 255, b.c[1] / 255, b.c[2] / 255]
        : [0.9, 0.86, 0.8];
      // `y` is the lowest ground under the footprint less a skirt, `s` is street
      // level (the highest ground under it). Extruding from zero instead leaves
      // buildings on the hill buried or hanging in mid-air.
      extrudeBuilding(b.p, b.h, tint, buffers, {
        base: b.y || 0,
        sill: b.s ?? null,
        style: b.st || "brick",
        ground: b.g || "shopfront",
        roof: b.rs || "gabled",
        massing: b.m || null,
      });
    }
    const buildings = tileBuildings(payload);

    const meshes = [
      meshFrom(buffers.plinth, materials.plinth),
      meshFrom(buffers.shopfront, materials.ground),
      meshFrom(buffers.residential, materials.residential),
      meshFrom(buffers.roof, materials.roof),
      ...STYLES.map((s) => meshFrom(buffers.wall[s], wallMaterials[s])),
    ].filter(Boolean);

    // Ground surfaces, split by what they are actually made of. OSM tags
    // surface on three quarters of Lincoln's ways: the High Street and Bailgate
    // are paving stones, the carriageways asphalt, and there is real cobble.
    const SURFACES = ["asphalt", "paving", "cobble", "concrete", "gravel"];
    const surf = {};
    for (const k of SURFACES) surf[k] = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
    const bufFor = (k) => surf[k] || surf.asphalt;

    // Ribbons: ordinary streets, from their centre line and width.
    for (const r of payload.r || []) {
      const buf = bufFor(r.s);
      const half = r.w / 2;
      const count = r.p.length / 2;
      let along = 0;
      for (let i = 0; i < count - 1; i += 1) {
        const ax = r.p[i * 2];
        const az = r.p[i * 2 + 1];
        const bx = r.p[i * 2 + 2];
        const bz = r.p[i * 2 + 3];
        // Elevations come per vertex from the tiler, so the carriageway follows
        // the hill instead of cutting a level shelf through it.
        const ay = r.e ? r.e[i] : 0;
        const by = r.e ? r.e[i + 1] : 0;
        const ex = bx - ax;
        const ez = bz - az;
        const len = Math.hypot(ex, ez);
        if (len < 0.01) continue;
        const nx = (ez / len) * half;
        const nz = (-ex / len) * half;
        const base = buf.positions.length / 3;
        buf.positions.push(
          ax + nx, ay, az + nz, bx + nx, by, bz + nz,
          bx - nx, by, bz - nz, ax - nx, ay, az - nz
        );
        for (let k = 0; k < 4; k += 1) buf.normals.push(0, 1, 0);
        // UVs run along the road so the surface does not swim as it turns.
        buf.uvs.push(along / 6, 0, (along + len) / 6, 0, (along + len) / 6, r.w / 6, along / 6, r.w / 6);
        along += len;
        buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }

    // Areas: squares, precincts and pedestrianised streets. These are polygons
    // in OSM, not centre lines — the High Street is one — so they are filled
    // rather than traced. Drawing them as ribbons turned the main shopping
    // street into a footpath tracing its own kerb.
    for (const a of payload.a || []) {
      const buf = bufFor(a.s);
      const order = normalisedOrder(a.p);
      const tris = triangulate(a.p, order);
      const base = buf.positions.length / 3;
      for (let k = 0; k < order.length; k += 1) {
        const i = order[k];
        const y = a.e ? a.e[i] : 0;
        buf.positions.push(a.p[i * 2], y, a.p[i * 2 + 1]);
        buf.normals.push(0, 1, 0);
        buf.uvs.push(a.p[i * 2] / 6, a.p[i * 2 + 1] / 6);
      }
      // Anticlockwise in plan faces downward once lifted, same as the roofs.
      for (let i = 0; i < tris.length; i += 3) {
        buf.indices.push(base + tris[i], base + tris[i + 2], base + tris[i + 1]);
      }
    }

    // Just above the terrain, so the two do not z-fight.
    const roadMeshes = SURFACES
      .map((k) => meshFrom(surf[k], materials[k], 0.06))
      .filter(Boolean);
    for (const m of roadMeshes) meshes.push(m);
    if (terrainMesh) meshes.push(terrainMesh);

    resident.set(key, { meshes, buildings, roads: payload.r || [], tileX, tileZ });
  }

  function unloadTile(key) {
    const t = resident.get(key);
    if (!t) return;
    for (const m of t.meshes) {
      group.remove(m);
      m.geometry.dispose();
    }
    // The heightmap goes with the tile, or the index grows without bound as the
    // player walks and starts answering for ground that is no longer there.
    terrain.remove(t.tileX, t.tileZ);
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
            buildTile(key, payload, wantX, wantZ);
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

  /**
   * Build the always-visible landmarks once. Never unloaded, so the Cathedral
   * is on its hill from anywhere in the city rather than popping in at 600m.
   */
  function buildLandmarks(landmarks) {
    if (!landmarks?.length) return [];
    const buffers = emptyBuffers();
    for (const b of landmarks) {
      const tint = b.c ? [b.c[0] / 255, b.c[1] / 255, b.c[2] / 255] : [0.9, 0.86, 0.8];
      extrudeBuilding(b.p, b.h, tint, buffers, {
        base: b.y || 0, sill: b.s ?? null, style: b.st || "brick",
        ground: b.g || "shopfront", roof: b.rs || "gabled", massing: b.m || null,
      });
    }
    return [
      meshFrom(buffers.plinth, materials.plinth),
      meshFrom(buffers.shopfront, materials.ground),
      meshFrom(buffers.residential, materials.residential),
      meshFrom(buffers.roof, materials.roof),
      ...STYLES.map((s) => meshFrom(buffers.wall[s], wallMaterials[s])),
    ].filter(Boolean);
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
    for (const m of Object.values(wallMaterials)) m.dispose();
    for (const t of Object.values(textures)) t.dispose();
    payloadCache.clear();
  }

  return {
    update,
    buildLandmarks,
    activeBuildings,
    activeRoads,
    loadWholeCity,
    /** Ground height at a world position, or null if that tile is not loaded. */
    heightAt: (x, z) => terrain.heightAt(x, z),
    dispose,
    get residentCount() { return resident.size; },
  };
}
