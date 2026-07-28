#!/usr/bin/env node
// ============================================================================
// BUILD MAP TILES — turn OpenStreetMap data into free-roam geometry.
//
// Reads a bbox of OSM data, projects it into game metres, simplifies it, bins
// it into tiles and writes the result into the `map_tiles` table. The game
// client never contacts OSM: it only ever asks our own server for a tile.
//
//   npm run map:build                    # default Lincoln city centre bbox
//   npm run map:build -- --file x.osm    # from a local .osm XML dump
//   npm run map:build -- --bbox W,S,E,N  # any other area
//
// Data © OpenStreetMap contributors, ODbL. Attribution is a licence condition
// and is carried through to the client in the manifest.
//
// NOTE ON SCALE: the bbox path uses api.openstreetmap.org, which is OSM's
// *editing* API and is only appropriate for the low-volume, cached, one-off
// fills we do here. When this widens past a city centre, switch to a Geofabrik
// .osm.pbf extract and feed it in through --file. That is the sanctioned bulk
// path, and it is why the reader below is kept separate from everything else.
// ============================================================================

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSqliteStore } from "../server/storage/sqliteStore.js";
import { project, unproject, TILE_SIZE, ORIGIN, MAP_ATTRIBUTION } from "../src/world/geo.js";
import { fetchTerrain, TERRAIN_ATTRIBUTION } from "./lib/terrainSource.mjs";
import { classifyBuilding } from "./lib/classify.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Lincoln city centre. Runs from the Brayford and the lower High Street all the
// way up to the Castle and the Cathedral, because the climb is the city: the
// High Street sits at ~6m and the Cathedral at ~65m, and a bbox that stops
// short of Steep Hill throws away the thing that makes Lincoln Lincoln.
// Lincoln city centre plus the eastern approach out to HMP Lincoln on
// Greetwell Road, which the story needs. That is 2.2km across, well past what
// the OSM API will return in one request, so the fetch chunks itself.
const DEFAULT_BBOX = { w: -0.548, s: 53.224, e: -0.514, n: 53.239 };

// Spacing of the terrain grid handed to the client, in metres. The source is 1m
// LIDAR; 5m is smooth underfoot and keeps a tile's heightmap to ~2600 samples.
const TERRAIN_STEP = 5;

// OSM rejects requests without a real User-Agent (it answers 406), which is an
// easy hour to lose if you do not know it.
const USER_AGENT = "TRP23-map-tiler/1.0 (+https://github.com/trp23dev-cell)";

const SIMPLIFY_TOLERANCE_M = 0.5;
const METRES_PER_LEVEL = 3.2;

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const args = { file: null, bbox: DEFAULT_BBOX, dry: false, terrain: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--file") args.file = argv[++i];
    else if (a === "--dry") args.dry = true;
    else if (a === "--no-terrain") args.terrain = false;
    else if (a === "--bbox") {
      const [w, s, e, n] = String(argv[++i]).split(",").map(Number);
      if ([w, s, e, n].some((v) => !Number.isFinite(v))) {
        throw new Error("--bbox needs four numbers: West,South,East,North");
      }
      args.bbox = { w, s, e, n };
    }
  }
  return args;
}

// ---------------------------------------------------------------- OSM reading

async function fetchOne({ w, s, e, n }) {
  const url = `https://api.openstreetmap.org/api/0.6/map?bbox=${w},${s},${e},${n}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } });
  if (!res.ok) throw new Error(`OSM returned ${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

/**
 * Fetch a bbox, splitting it if the area is large.
 *
 * The OSM map API refuses any request that would return more than 50,000 nodes,
 * and the city centre alone is already 34,000. Anything wider — reaching out to
 * the prison, or any of the open-world expansion after it — has to come back in
 * pieces and be merged.
 */
async function fetchBbox(bbox, maxSpanDeg = 0.011) {
  const cols = Math.max(1, Math.ceil((bbox.e - bbox.w) / maxSpanDeg));
  const rows = Math.max(1, Math.ceil((bbox.n - bbox.s) / maxSpanDeg));
  if (cols === 1 && rows === 1) {
    process.stdout.write(`fetching OSM bbox ${bbox.w},${bbox.s},${bbox.e},${bbox.n}\n`);
    return [await fetchOne(bbox)];
  }

  process.stdout.write(`fetching OSM in ${cols}x${rows} chunks (bbox too large for one request)\n`);
  const chunks = [];
  const dw = (bbox.e - bbox.w) / cols;
  const dh = (bbox.n - bbox.s) / rows;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const sub = {
        w: bbox.w + i * dw,
        e: bbox.w + (i + 1) * dw,
        s: bbox.s + j * dh,
        n: bbox.s + (j + 1) * dh,
      };
      chunks.push(await fetchOne(sub));
      process.stdout.write(`  chunk ${chunks.length}/${cols * rows}\n`);
    }
  }
  return chunks;
}

const XML_ENTITIES = { quot: '"', apos: "'", lt: "<", gt: ">", amp: "&" };
function unescapeXml(s) {
  if (!s.includes("&")) return s;
  return s.replace(/&(quot|apos|lt|gt|amp|#\d+);/g, (m, g) =>
    g.startsWith("#") ? String.fromCharCode(Number(g.slice(1))) : XML_ENTITIES[g]
  );
}

function parseAttrs(raw) {
  const out = {};
  const re = /([\w:]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(raw))) out[m[1]] = unescapeXml(m[2]);
  return out;
}

/**
 * Minimal OSM XML reader. OSM XML is an extremely regular subset of XML — flat
 * elements with attributes and one level of children — so a scanner beats
 * pulling in a parser dependency for a build-time script.
 *
 * Returns { nodes: Map<id,{lat,lon,tags}>, ways: [{id,refs,tags}] }.
 */
function parseOsmXml(xml) {
  const nodes = new Map();
  const ways = [];
  let current = null; // the node/way currently accepting <tag>/<nd> children

  const re = /<(\/?)([\w:]+)([^>]*?)(\/?)>/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, closing, name, rawAttrs, selfClose] = m;

    if (closing) {
      if (name === "node" || name === "way") current = null;
      continue;
    }

    if (name === "node") {
      const a = parseAttrs(rawAttrs);
      const rec = { lat: Number(a.lat), lon: Number(a.lon), tags: null };
      nodes.set(a.id, rec);
      current = selfClose ? null : rec;
    } else if (name === "way") {
      const a = parseAttrs(rawAttrs);
      const rec = { id: a.id, refs: [], tags: null };
      ways.push(rec);
      current = selfClose ? null : rec;
    } else if (name === "nd" && current) {
      current.refs?.push(parseAttrs(rawAttrs).ref);
    } else if (name === "tag" && current) {
      const a = parseAttrs(rawAttrs);
      (current.tags ||= {})[a.k] = a.v;
    }
  }
  return { nodes, ways };
}

// ---------------------------------------------------------------- geometry

/** Douglas–Peucker. Bing-traced outlines carry vertex noise well below 0.5m. */
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const sqTol = tolerance * tolerance;

  function sqSegDist(p, a, b) {
    let x = a.x;
    let z = a.z;
    let dx = b.x - x;
    let dz = b.z - z;
    if (dx !== 0 || dz !== 0) {
      const t = ((p.x - x) * dx + (p.z - z) * dz) / (dx * dx + dz * dz);
      if (t > 1) {
        x = b.x;
        z = b.z;
      } else if (t > 0) {
        x += dx * t;
        z += dz * t;
      }
    }
    dx = p.x - x;
    dz = p.z - z;
    return dx * dx + dz * dz;
  }

  function step(first, last, keep) {
    let maxSq = sqTol;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const d = sqSegDist(points[i], points[first], points[last]);
      if (d > maxSq) {
        maxSq = d;
        index = i;
      }
    }
    if (index === -1) return;
    step(first, index, keep);
    keep.add(index);
    step(index, last, keep);
  }

  const keep = new Set([0, points.length - 1]);
  step(0, points.length - 1, keep);
  return [...keep].sort((a, b) => a - b).map((i) => points[i]);
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j].x + ring[i].x) * (ring[j].z - ring[i].z);
  }
  return a / 2;
}

function centroidOf(ring) {
  let x = 0;
  let z = 0;
  for (const p of ring) {
    x += p.x;
    z += p.z;
  }
  return { x: x / ring.length, z: z / ring.length };
}

function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const zi = ring[i].z;
    const xj = ring[j].x;
    const zj = ring[j].z;
    if (zi > p.z !== zj > p.z && p.x < ((xj - xi) * (p.z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------- heights

// Only ~3% of Lincoln's buildings carry height or level tags, so most of the
// skyline is inferred. A deterministic jitter off the OSM id keeps a terrace
// from reading as one extruded slab while staying stable between builds.
const DEFAULT_LEVELS = {
  cathedral: 14,
  church: 8,
  chapel: 5,
  civic: 4,
  hotel: 4,
  apartments: 4,
  commercial: 3,
  office: 3,
  retail: 2,
  house: 2,
  residential: 2,
  terrace: 2,
  garage: 1,
  roof: 1,
  shed: 1,
};

function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function heightFor(id, tags) {
  const explicit = Number.parseFloat(tags.height);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const levels = Number.parseFloat(tags["building:levels"]);
  if (Number.isFinite(levels) && levels > 0) return levels * METRES_PER_LEVEL;

  const base = DEFAULT_LEVELS[tags.building] ?? DEFAULT_LEVELS[tags["building:part"]] ?? 2;
  return base * METRES_PER_LEVEL * (0.88 + hashId(id) * 0.28);
}

// ---------------------------------------------------------------- roads

const ROAD_WIDTH = {
  primary: 10,
  secondary: 9,
  tertiary: 8,
  unclassified: 6,
  residential: 6,
  service: 4,
  pedestrian: 6,
  footway: 2.5,
  path: 2,
  steps: 2,
  cycleway: 2.5,
  primary_link: 8,
  corridor: 2,
};
const WALKABLE = new Set(Object.keys(ROAD_WIDTH));

// ---------------------------------------------------------------- doors

const STAND_OFFSET = 2.2; // where the player stands to get the [E] prompt
const EXIT_OFFSET = 7;    // where they are put on the way back out

/** Squared distance from a point to a line segment. */
function sqDistToSegment(px, pz, ax, az, bx, bz) {
  const ex = bx - ax;
  const ez = bz - az;
  const len2 = ex * ex + ez * ez;
  let t = len2 > 0 ? ((px - ax) * ex + (pz - az) * ez) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + ex * t;
  const qz = az + ez * t;
  return (px - qx) ** 2 + (pz - qz) ** 2;
}

/**
 * Put a door on the wall that faces the street.
 *
 * The old hand-built block aimed every door at the middle of the map, which
 * means nothing on a real street grid. Here every wall is scored on how close
 * its doorstep is to real road geometry, and any wall whose doorstep lands
 * inside another building is thrown out first.
 *
 * That rejection is the whole game on a terrace: 25 Corporation Street shares
 * both side walls with its neighbours, and without it Kimani's front door opens
 * into the shop next door.
 *
 * Distance is measured to road *segments*, not to road vertices. OSM digitises
 * a straight street as two endpoints hundreds of metres apart, so scoring
 * against vertices makes a building mid-street look nowhere near a road.
 */
function placeDoor(ring, roads, allRings) {
  const centre = centroidOf(ring);
  const clockwise = ringArea(ring) > 0;
  const candidates = [];

  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const len = Math.hypot(ex, ez);
    if (len < 2.5) continue; // too narrow to hang a door and a sign on

    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    // Outward normal: perpendicular to the edge, flipped to point away from the
    // centroid so the door always opens onto the street rather than inward.
    let nx = clockwise ? ez / len : -ez / len;
    let nz = clockwise ? -ex / len : ex / len;
    if ((mid.x - centre.x) * nx + (mid.z - centre.z) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }

    const stand = { x: mid.x + nx * STAND_OFFSET, z: mid.z + nz * STAND_OFFSET };
    const exit = { x: mid.x + nx * EXIT_OFFSET, z: mid.z + nz * EXIT_OFFSET };
    const blocked = allRings.some((r) => r !== ring && (pointInRing(stand, r) || pointInRing(exit, r)));
    if (blocked) continue;

    let nearest = Infinity;
    for (const r of roads) {
      for (let k = 0; k < r.points.length - 1; k += 1) {
        const d = sqDistToSegment(
          stand.x, stand.z,
          r.points[k].x, r.points[k].z,
          r.points[k + 1].x, r.points[k + 1].z
        );
        if (d < nearest) nearest = d;
      }
    }

    // Prefer a wide wall when two are similarly close to the street: a 3m alley
    // wall and a 12m shopfront on the same road should not tie.
    const score = Math.sqrt(nearest) - Math.min(len, 14) * 0.35;
    candidates.push({ score, mid, nx, nz, len });
  }

  if (!candidates.length) {
    return { x: centre.x, z: centre.z + 4, nx: 0, nz: 1, yaw: Math.PI, width: 4, orphan: true };
  }

  const best = candidates.reduce((a, b) => (b.score < a.score ? b : a));
  return {
    x: best.mid.x + best.nx * 0.05,
    z: best.mid.z + best.nz * 0.05,
    nx: best.nx,
    nz: best.nz,
    // Look direction for yaw θ is (-sin θ, -cos θ), so θ = atan2(-dx, -dz).
    // Facing along the outward normal puts the building behind the player.
    yaw: Math.atan2(-best.nx, -best.nz),
    width: best.len,
  };
}

// ---------------------------------------------------------------- main

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const chunks = args.file
    ? [await readFile(path.resolve(ROOT, args.file), "utf8")]
    : await fetchBbox(args.bbox);

  // Chunks overlap at their edges, so ways are de-duplicated by OSM id.
  const nodes = new Map();
  const ways = [];
  const seenWays = new Set();
  for (const chunk of chunks) {
    const part = parseOsmXml(chunk);
    for (const [id, node] of part.nodes) if (!nodes.has(id)) nodes.set(id, node);
    for (const w of part.ways) {
      if (seenWays.has(w.id)) continue;
      seenWays.add(w.id);
      ways.push(w);
    }
  }
  process.stdout.write(`parsed ${nodes.size} nodes, ${ways.length} ways\n`);

  // ---- the ground ----
  let terrain = null;
  if (args.terrain) {
    process.stdout.write("fetching LIDAR terrain...\n");
    terrain = await fetchTerrain(args.bbox);
    process.stdout.write(
      `terrain ${terrain.width}x${terrain.height} @1m, ` +
      `${terrain.min.toFixed(1)}m to ${terrain.max.toFixed(1)}m ` +
      `(${(terrain.max - terrain.min).toFixed(0)}m of hill)\n`
    );
  }

  // Elevation at a point in game metres. Terrain is published on the National
  // Grid, so this goes back out to lat/lon and across; it is only ever called
  // at build time, never per frame.
  const groundAt = (x, z) => {
    if (!terrain) return 0;
    const ll = unproject(x, z);
    return terrain.at(ll.lat, ll.lon);
  };

  // --- roads first: doors need them ---
  const roads = [];
  const roadPoints = [];
  for (const w of ways) {
    const kind = w.tags?.highway;
    if (!kind || !WALKABLE.has(kind)) continue;
    const pts = w.refs.map((r) => nodes.get(r)).filter(Boolean).map((n) => project(n.lat, n.lon));
    if (pts.length < 2) continue;
    const simple = simplify(pts, SIMPLIFY_TOLERANCE_M);
    // Roads drape over the ground rather than cutting through it, so Steep Hill
    // is something you actually walk up.
    const elevations = simple.map((p) => groundAt(p.x, p.z));
    roads.push({ points: simple, elevations, width: ROAD_WIDTH[kind] || 5, kind });
    roadPoints.push(...simple);
  }

  // --- buildings ---
  const buildings = [];
  for (const w of ways) {
    if (!w.tags?.building) continue;
    const pts = w.refs.map((r) => nodes.get(r)).filter(Boolean).map((n) => project(n.lat, n.lon));
    if (pts.length < 4) continue;
    // OSM closes areas by repeating the first node; the renderer closes rings
    // itself, so drop the duplicate.
    if (pts.length > 1) {
      const a = pts[0];
      const b = pts[pts.length - 1];
      if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6) pts.pop();
    }
    const ring = simplify(pts, SIMPLIFY_TOLERANCE_M);
    if (ring.length < 3) continue;

    // Found the building on the ground it actually stands on, which on a slope
    // needs two numbers, not one:
    //   base  — the LOWEST ground under the footprint, less a skirt. Nothing
    //           may start above it or the downhill corner hangs in the air.
    //   sill  — the HIGHEST ground under it. Street level, where the shopfront
    //           starts, because anything lower is underground somewhere.
    // The stonework between the two is a plinth, which is what buildings on a
    // hill actually have.
    let base = 0;
    let sill = 0;
    if (terrain) {
      let lowest = Infinity;
      let highest = -Infinity;
      for (const p of ring) {
        const g = groundAt(p.x, p.z);
        if (g < lowest) lowest = g;
        if (g > highest) highest = g;
      }
      // Big footprints can dip or rise in the middle, not just at the corners.
      const c = centroidOf(ring);
      const cg = groundAt(c.x, c.z);
      lowest = Math.min(lowest, cg);
      highest = Math.max(highest, cg);
      base = lowest - 0.6;
      sill = highest;
    }

    const area = Math.abs(ringArea(ring));
    const spec = classifyBuilding(`way/${w.id}`, w.tags, sill, area);

    buildings.push({
      id: `way/${w.id}`,
      ring,
      base,
      sill,
      height: spec.height,
      style: spec.style,
      ground: spec.ground,
      roofShape: spec.roof,
      massing: spec.massing,
      tint: spec.tint,
      landmark: spec.landmark,
      name: w.tags.name || null,
      tags: w.tags,
    });
  }
  process.stdout.write(`kept ${buildings.length} buildings, ${roads.length} road segments\n`);

  // --- anchors ---
  const anchorFile = JSON.parse(
    await readFile(path.join(ROOT, "src/world/lincolnAnchors.json"), "utf8")
  );
  const byId = new Map(buildings.map((b) => [b.id, b]));
  const allRings = buildings.map((b) => b.ring);
  const anchors = [];
  let warnings = 0;

  for (const a of anchorFile.anchors) {
    let building = byId.get(a.osm);
    if (!building) {
      // Fall back to whatever building encloses the recorded coordinate. This is
      // the safety net for an upstream delete or a re-drawn footprint.
      const p = project(a.lat, a.lon);
      building = buildings.find((b) => pointInRing(p, b.ring));
      warnings += 1;
      process.stdout.write(
        building
          ? `WARNING: ${a.name}: ${a.osm} not found, fell back to ${building.id} at ${a.lat},${a.lon}\n`
          : `WARNING: ${a.name}: ${a.osm} not found and no building encloses ${a.lat},${a.lon} — SKIPPED\n`
      );
      if (!building) continue;
    }
    const door = placeDoor(building.ring, roads, allRings);
    if (door.orphan) {
      process.stdout.write(`WARNING: ${a.name}: no wall opens onto clear ground — door placed blind\n`);
      warnings += 1;
    }
    anchors.push({
      key: a.key,
      kind: a.kind,
      name: a.name,
      sub: a.sub || null,
      buildingId: building.id,
      // Where the player stands to get the [E] prompt, and where they come back
      // out. The exit sits further along the same normal so stepping out does
      // not instantly re-offer the door you just came through.
      x: door.x + door.nx * STAND_OFFSET,
      z: door.z + door.nz * STAND_OFFSET,
      // The door sits on the pavement outside, not on the building's buried
      // base, or it ends up half underground on the downhill side.
      door: {
        x: door.x, z: door.z, y: round(groundAt(door.x, door.z)),
        yaw: door.yaw, width: door.width, nx: door.nx, nz: door.nz,
      },
      exit: { x: door.x + door.nx * EXIT_OFFSET, z: door.z + door.nz * EXIT_OFFSET, yaw: door.yaw },
    });
  }

  if (anchors.length !== anchorFile.anchors.length) {
    throw new Error(`only resolved ${anchors.length}/${anchorFile.anchors.length} anchors — refusing to publish a map missing story locations`);
  }

  // --- spawn: out in the street, facing the bank ---
  // Far enough back to see the building you are standing in front of. Spawning
  // on the doorstep puts the frontage and its sign across the whole screen and
  // tells the player nothing about where they are.
  const bank = anchors.find((a) => a.kind === "bank");
  let spawn = { x: 0, z: 14 };
  let spawnYaw = 0;
  if (bank) {
    const { nx, nz } = bank.door;
    // Back off as far as the street allows, preferring a proper standing-back
    // distance and settling for less rather than putting the player in a wall.
    for (const dist of [20, 17, 14, 11, 9, 7]) {
      const p = { x: bank.door.x + nx * dist, z: bank.door.z + nz * dist };
      if (!buildings.some((b) => pointInRing(p, b.ring))) { spawn = p; break; }
    }
    spawnYaw = bank.door.yaw + Math.PI; // turn around to look back at the door
  }

  // Things you should be able to see from across the city. They are streamed
  // out with everything else once you walk away, and a cathedral that vanishes
  // at 600m is worse than no cathedral, so these ride in the manifest and are
  // built once, permanently.
  const LANDMARK_HEIGHT = 22;
  function isLandmark(b) {
    return b.height >= LANDMARK_HEIGHT || b.massing === "cathedral";
  }

  // --- bin into tiles ---
  const tiles = new Map();
  function tileFor(x, z) {
    const tileX = Math.floor(x / TILE_SIZE);
    const tileZ = Math.floor(z / TILE_SIZE);
    const key = `${tileX},${tileZ}`;
    let t = tiles.get(key);
    if (!t) {
      t = { tileX, tileZ, payload: { b: [], r: [] } };
      tiles.set(key, t);
    }
    return t;
  }

  // A building straddling a boundary lives in the tile holding its centroid;
  // the streamer pads its load radius to cover the overhang rather than
  // splitting footprints and cracking seams down the middle of a wall.
  for (const b of buildings) {
    const c = centroidOf(b.ring);
    const flat = [];
    for (const p of b.ring) flat.push(round(p.x), round(p.z));
    tileFor(c.x, c.z).payload.b.push({
      i: b.id,
      p: flat,
      y: round(b.base),
      s: round(b.sill),
      h: round(b.height),
      st: b.style,
      g: b.ground,
      rs: b.roofShape,
      ...(b.massing ? { m: b.massing } : {}),
      ...(isLandmark(b) ? { lm: 1 } : {}),
      c: b.tint.map((v) => Math.round(v * 255)),
      ...(b.name ? { n: b.name } : {}),
    });
  }
  for (const r of roads) {
    const c = centroidOf(r.points);
    const flat = [];
    for (const p of r.points) flat.push(round(p.x), round(p.z));
    tileFor(c.x, c.z).payload.r.push({
      p: flat,
      e: r.elevations.map((v) => round(v)),
      w: r.width,
      k: r.kind,
    });
  }

  // ---- per-tile heightmaps ----
  // Every tile carries the ground beneath it. Samples land exactly on tile
  // boundaries and are shared with the neighbour, so there is no seam and no
  // need to reconcile two tiles' idea of where the ground is.
  if (terrain) {
    const n = TILE_SIZE / TERRAIN_STEP + 1; // 51 samples spanning 0..250m
    for (const t of tiles.values()) {
      const originX = t.tileX * TILE_SIZE;
      const originZ = t.tileZ * TILE_SIZE;
      const raw = new Array(n * n);
      let lo = Infinity;
      for (let j = 0; j < n; j += 1) {
        for (let i = 0; i < n; i += 1) {
          const h = groundAt(originX + i * TERRAIN_STEP, originZ + j * TERRAIN_STEP);
          raw[j * n + i] = h;
          if (h < lo) lo = h;
        }
      }
      // Stored as decimetres above the tile's own floor: integers compress far
      // better than floats, and 10cm is well below what anyone can feel.
      t.payload.t = {
        y: round(lo),
        step: TERRAIN_STEP,
        n,
        v: raw.map((h) => Math.round((h - lo) * 10)),
      };
    }
  }

  const list = [...tiles.values()];
  const bytes = list.reduce((n, t) => n + JSON.stringify(t.payload).length, 0);
  process.stdout.write(
    `binned into ${list.length} tiles of ${TILE_SIZE}m, ${(bytes / 1024).toFixed(0)} KB total\n`
  );

  if (args.dry) {
    process.stdout.write("--dry: not writing to the database\n");
    return;
  }

  // Same file the API server opens (server/mockApiServer.js), so a rebuild is
  // live to the running game without a redeploy.
  const store = createSqliteStore({
    dbPath: process.env.DB_PATH || path.join(ROOT, "server/storage/trapmadeit.db"),
  });
  store.replaceMapTiles(
    list,
    {
      tileSize: TILE_SIZE,
      origin: ORIGIN,
      bbox: args.bbox,
      attribution: MAP_ATTRIBUTION,
      landmarks: buildings.filter(isLandmark).map((b) => {
        const flat = [];
        for (const p of b.ring) flat.push(round(p.x), round(p.z));
        return {
          i: b.id, p: flat, y: round(b.base), s: round(b.sill), h: round(b.height),
          st: b.style, g: b.ground, rs: b.roofShape, c: b.tint.map((v) => Math.round(v * 255)),
          ...(b.massing ? { m: b.massing } : {}),
          ...(b.name ? { n: b.name } : {}),
        };
      }),
      terrainAttribution: terrain ? TERRAIN_ATTRIBUTION : null,
      terrainStep: terrain ? TERRAIN_STEP : 0,
      terrainRange: terrain ? [round(terrain.min), round(terrain.max)] : null,
      spawn: [round(spawn.x), round(spawn.z)],
      spawnYaw: round(spawnYaw, 4),
      anchors,
      buildingCount: buildings.length,
    },
    Date.now()
  );

  process.stdout.write(
    `wrote ${list.length} tiles. anchors: ${anchors.map((a) => a.name).join(", ")}\n` +
    (warnings ? `${warnings} anchor fallback warning(s) — check the pins above\n` : "all anchors resolved by OSM id\n")
  );
}

function round(v, dp = 2) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

main().catch((err) => {
  process.stderr.write(`map build failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
