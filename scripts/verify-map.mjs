#!/usr/bin/env node
// ============================================================================
// VERIFY MAP — exercise the shipped map against the shipped collision code.
//
// Runs headlessly against a running API server, so it checks the real data the
// game will get rather than a fixture. Imports the actual physics from
// freeRoamWorld.js: if this passes and the game still walls the player into a
// building, the bug is in rendering, not in geometry.
//
//   npm run map:verify              (expects the API on :8787)
//   MAP_API=http://localhost:8799 npm run map:verify
// ============================================================================

// Must be set before the client modules are imported: they read it when their
// API base is first evaluated.
globalThis.__TRAP_API_ORIGIN = process.env.MAP_API || "http://localhost:8787";

const { tileBuildings } = await import("../src/world/mapStream.js");
const {
  createCollisionIndex,
  resolveWorldCollisions,
  nearestPlace,
  prepareMap,
  PLAYER_RADIUS,
  ENTER_DISTANCE,
} = await import("../src/world/freeRoamWorld.js");

const API = globalThis.__TRAP_API_ORIGIN + "/api";

let failures = 0;
function check(name, ok, detail = "") {
  process.stdout.write(`${ok ? "  ok  " : "FAIL  "}${name}${detail ? ` — ${detail}` : ""}\n`);
  if (!ok) failures += 1;
}

function insideAny(x, z, buildings) {
  for (const b of buildings) {
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    let inside = false;
    const n = b.ring.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = b.ring[i * 2];
      const zi = b.ring[i * 2 + 1];
      const xj = b.ring[j * 2];
      const zj = b.ring[j * 2 + 1];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    if (inside) return b;
  }
  return null;
}

const main = async () => {
  // Same entry point the game uses at boot: it also widens WORLD_BOUND to the
  // real map extent, without which the resolver clamps the player to the old
  // 150m box and the checks below are meaningless.
  const manifest = await prepareMap();
  process.stdout.write(
    `manifest: ${manifest.tiles.length} tiles, ${manifest.buildingCount} buildings, ` +
    `origin ${manifest.origin.lat},${manifest.origin.lon}\n\n`
  );

  // Pull every tile once so the checks below see the whole city, not a 3x3
  // window. Payloads are kept: re-fetching all 43 for each section exhausts the
  // connection pool.
  const buildings = [];
  const payloads = [];
  for (const [tx, tz] of manifest.tiles) {
    const payload = await (await fetch(`${API}/map/tile/${tx}/${tz}`)).json();
    payloads.push({ tx, tz, payload });
    buildings.push(...tileBuildings(payload));
  }
  const index = createCollisionIndex();
  index.rebuild(buildings, []);
  check("all tiles fetched and indexed", buildings.length === manifest.buildingCount,
    `${buildings.length} of ${manifest.buildingCount}`);

  // --- anchors ---
  process.stdout.write("\nstory locations:\n");
  const wanted = ["JD", "TRAP CENTRAL BANK", "KIMANI THE BARBER"];
  for (const name of wanted) {
    const a = manifest.anchors.find((x) => x.name === name);
    check(`${name} present`, !!a);
    if (!a) continue;

    const stuck = insideAny(a.x, a.z, buildings);
    check(`${name}: standing spot is outdoors`, !stuck, stuck ? `inside ${stuck.id}` : "");

    const exitStuck = insideAny(a.exit.x, a.exit.z, buildings);
    check(`${name}: exit spot is outdoors`, !exitStuck, exitStuck ? `inside ${exitStuck.id}` : "");

    // The exit must be far enough out that stepping through does not instantly
    // re-offer the door you just came out of.
    const exitDist = Math.hypot(a.exit.x - a.door.x, a.exit.z - a.door.z);
    check(`${name}: exit clears the enter radius`, exitDist > ENTER_DISTANCE,
      `${exitDist.toFixed(1)}m vs ${ENTER_DISTANCE}m`);

    // Standing spot must actually trigger the prompt.
    const standDist = Math.hypot(a.x - a.door.x, a.z - a.door.z);
    check(`${name}: standing spot is inside the enter radius`, standDist < ENTER_DISTANCE,
      `${standDist.toFixed(1)}m`);
  }

  // --- the three are distinguishable: nearestPlace must pick the right door ---
  process.stdout.write("\nnearest-place resolution:\n");
  const places = manifest.anchors.map((a) => ({ ...a, locked: false }));
  for (const a of manifest.anchors) {
    const near = nearestPlace({ x: a.x, z: a.z }, places);
    check(`standing at ${a.name} resolves to itself`, near.place.name === a.name,
      `got ${near.place.name}`);
  }

  // --- collision ---
  process.stdout.write("\ncollision:\n");
  // The case the game actually produces: walk at a building from outside, one
  // movement step at a time, and confirm the player never ends up inside it.
  // Teleporting into the middle of a footprint is not a state play can reach —
  // spawn and every door exit are checked to be outdoors above.
  let breached = 0;
  let approaches = 0;
  const STEP = 0.35; // a sprint step, larger than a walk
  for (const b of buildings.filter((_, i) => i % 7 === 0)) {
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    for (let dir = 0; dir < 8; dir += 1) {
      const ang = (dir / 8) * Math.PI * 2;
      const start = { x: cx + Math.cos(ang) * 60, z: cz + Math.sin(ang) * 60 };
      if (insideAny(start.x, start.z, buildings)) continue;
      approaches += 1;
      const p = { ...start };
      for (let s = 0; s < 180; s += 1) {
        p.x -= Math.cos(ang) * STEP;
        p.z -= Math.sin(ang) * STEP;
        resolveWorldCollisions(p, index);
        if (insideAny(p.x, p.z, buildings)) { breached += 1; break; }
      }
    }
  }
  check("walking at a building never gets you inside one", breached === 0,
    `${breached}/${approaches} approaches breached`);

  // And a bad state must degrade gracefully rather than fling the player across
  // the city — the correction is bounded per call.
  let worst = 0;
  for (const b of buildings.filter((_, i) => i % 17 === 0)) {
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    if (!insideAny(cx, cz, buildings)) continue;
    const p = { x: cx, z: cz };
    resolveWorldCollisions(p, index);
    worst = Math.max(worst, Math.hypot(p.x - cx, p.z - cz));
  }
  check("recovery from inside a building is bounded", worst <= 6.01, `worst jump ${worst.toFixed(1)}m`);

  // Kimani's building sits on Corporation Street at an angle to the axes — the
  // case a bounding-box resolver gets wrong by walling off open road.
  const kimani = manifest.anchors.find((a) => a.name === "KIMANI THE BARBER");
  const kb = buildings.find((b) => b.id === kimani.buildingId);
  check("Kimani's footprint is not axis-aligned", !!kb && isDiagonal(kb),
    kb ? `${kb.ring.length / 2} vertices` : "not found");

  // Walking the street outside a diagonal building must not be blocked.
  let blocked = 0;
  let steps = 0;
  for (let t = 0; t <= 40; t += 1) {
    const x = kimani.exit.x + (t - 20) * 0.5;
    const z = kimani.exit.z;
    if (insideAny(x, z, buildings)) continue;
    steps += 1;
    const p = { x, z };
    resolveWorldCollisions(p, index);
    if (Math.hypot(p.x - x, p.z - z) > 0.01) blocked += 1;
  }
  check("open street outside Kimani's is walkable", blocked === 0,
    `${blocked}/${steps} points shoved`);

  // --- spawn ---
  process.stdout.write("\nspawn:\n");
  const [sx, sz] = manifest.spawn;
  const spawnStuck = insideAny(sx, sz, buildings);
  check("spawn is outdoors", !spawnStuck, spawnStuck ? `inside ${spawnStuck.id}` : "");
  const sp = { x: sx, z: sz };
  resolveWorldCollisions(sp, index);
  check("spawn survives collision resolve", Math.hypot(sp.x - sx, sp.z - sz) < PLAYER_RADIUS,
    `moved ${Math.hypot(sp.x - sx, sp.z - sz).toFixed(2)}m`);
  const bank = manifest.anchors.find((a) => a.kind === "bank");
  const toBank = Math.hypot(sx - bank.door.x, sz - bank.door.z);
  // Close enough to read the sign, far enough to see the building it is on.
  check("spawn stands back from the bank", toBank > 6 && toBank < 30, `${toBank.toFixed(0)}m from the door`);

  // --- terrain ---
  // Lincoln is a hill. If this is flat, or the ground and the buildings
  // disagree about where the surface is, nothing else matters.
  process.stdout.write("\nterrain:\n");
  const { createTerrainIndex } = await import("../src/world/terrain.js");
  const terrain = createTerrainIndex();
  let tilesWithGround = 0;
  for (const { tx, tz, payload } of payloads) {
    if (payload.t) { terrain.add(tx, tz, payload.t); tilesWithGround += 1; }
  }
  check("every tile carries ground", tilesWithGround === manifest.tiles.length,
    `${tilesWithGround}/${manifest.tiles.length}`);

  const [lo, hi] = manifest.terrainRange || [0, 0];
  check("the city is actually on a hill", hi - lo > 40, `${lo}m to ${hi}m = ${(hi - lo).toFixed(0)}m`);

  // Known ground truth, straight off the Environment Agency's own service.
  const landmarks = [
    ["JD, High Street", 53.2279, -0.5407, 6.3],
    ["NatWest, Mint Street", 53.2294, -0.54079, 9.7],
    ["Cathedral quarter", 53.23440, -0.53640, 65.3],
  ];
  const { project } = await import("../src/world/geo.js");
  let worstLandmark = 0;
  for (const [name, lat, lon, truth] of landmarks) {
    const p = project(lat, lon);
    const got = terrain.heightAt(p.x, p.z);
    const err = got === null ? Infinity : Math.abs(got - truth);
    worstLandmark = Math.max(worstLandmark, err);
    check(`${name} sits at the right height`, err < 2.5,
      got === null ? "no tile loaded" : `${got.toFixed(1)}m vs ${truth}m surveyed`);
  }

  // The climb is the whole point.
  const jd = project(53.2279, -0.5407);
  const cath = project(53.23440, -0.53640);
  const climb = terrain.heightAt(cath.x, cath.z) - terrain.heightAt(jd.x, jd.z);
  check("Steep Hill climbs from the High Street to the Cathedral", climb > 45,
    `${climb.toFixed(0)}m of climb`);

  // Seams: neighbouring tiles must agree exactly on their shared edge, or the
  // player walks off a step every 250m.
  let worstSeam = 0;
  for (const [tx, tz] of manifest.tiles) {
    if (!terrain.has(tx + 1, tz)) continue;
    const edgeX = (tx + 1) * 250;
    for (let s = 0; s <= 250; s += 25) {
      const z = tz * 250 + s;
      const a = terrain.heightAt(edgeX - 0.001, z);
      const b = terrain.heightAt(edgeX + 0.001, z);
      if (a !== null && b !== null) worstSeam = Math.max(worstSeam, Math.abs(a - b));
    }
  }
  check("tiles line up at their seams", worstSeam < 0.25, `worst step ${worstSeam.toFixed(3)}m`);

  // Buildings must stand ON the ground, not float above it or sink out of sight.
  let floating = 0;
  let checkedFooting = 0;
  for (const b of buildings) {
    if (b.base === undefined || b.base === null) continue;
    checkedFooting += 1;
    let maxGround = -Infinity;
    for (let i = 0; i < b.ring.length; i += 2) {
      const g = terrain.heightAt(b.ring[i], b.ring[i + 1]);
      if (g !== null) maxGround = Math.max(maxGround, g);
    }
    // The base is the lowest ground under the footprint minus a skirt, so it
    // must always be below the highest ground the walls pass through.
    if (maxGround > -Infinity && b.base > maxGround) floating += 1;
  }
  check("no building floats above its ground", floating === 0,
    `${floating}/${checkedFooting} founded above the surface`);

  // --- geometry correctness: walls and roofs ---
  // Both of these were shipped broken once. Mixed OSM ring winding built two
  // fifths of the city inside out (see-through walls under backface culling),
  // and a triangle-fan roof spills outside the walls on the 58% of footprints
  // that are concave.
  process.stdout.write("\nwalls and roofs:\n");
  const { normalisedOrder, triangulate, ringSignedArea, extrudeBuilding, emptyBuffers, STOREY } =
    await import("../src/world/buildingMesh.js");

  let wrongWinding = 0;
  let roofErr = 0;
  let worstRoof = 0;
  let missingWalls = 0;
  for (const b of buildings) {
    const order = normalisedOrder(b.ring);

    // Every ring must come out anticlockwise, whatever OSM did.
    let a2 = 0;
    for (let i = 0, j = order.length - 1; i < order.length; j = i++) {
      a2 += b.ring[order[j] * 2] * b.ring[order[i] * 2 + 1] - b.ring[order[i] * 2] * b.ring[order[j] * 2 + 1];
    }
    if (a2 / 2 <= 0) wrongWinding += 1;

    // The roof must cover exactly the footprint: no gaps, no overspill.
    const tris = triangulate(b.ring, order);
    let area = 0;
    for (let i = 0; i < tris.length; i += 3) {
      const p = order[tris[i]], q = order[tris[i + 1]], r = order[tris[i + 2]];
      area += Math.abs(
        (b.ring[q * 2] - b.ring[p * 2]) * (b.ring[r * 2 + 1] - b.ring[p * 2 + 1]) -
        (b.ring[r * 2] - b.ring[p * 2]) * (b.ring[q * 2 + 1] - b.ring[p * 2 + 1])
      ) / 2;
    }
    const truth = Math.abs(ringSignedArea(b.ring));
    const err = Math.abs(area - truth) / Math.max(truth, 1);
    worstRoof = Math.max(worstRoof, err);
    if (err > 0.01) roofErr += 1;

    // Every wall of every building must actually be emitted.
    const buf = emptyBuffers();
    extrudeBuilding(b.ring, b.height, 1, buf);
    const quads = (buf.ground.positions.length + buf.wall.positions.length) / 12;
    const expected = countUsableEdges(b.ring) * (b.height > STOREY ? 2 : 1);
    if (quads !== expected) missingWalls += 1;
  }
  check("every footprint is wound anticlockwise", wrongWinding === 0, `${wrongWinding} inside out`);
  check("roofs cover their footprint exactly", roofErr === 0,
    `worst ${(worstRoof * 100).toFixed(2)}% area error`);
  check("every wall is emitted", missingWalls === 0, `${missingWalls} buildings short of walls`);

  // Outward normals: a point nudged along a wall normal must land outside.
  let inwardNormals = 0;
  let normalsTested = 0;
  for (const b of buildings.filter((_, i) => i % 5 === 0)) {
    const buf = emptyBuffers();
    extrudeBuilding(b.ring, b.height, 1, buf);
    const P = buf.ground.positions;
    const N = buf.ground.normals;
    for (let q = 0; q < P.length; q += 12) {
      const mx = (P[q] + P[q + 3]) / 2;
      const mz = (P[q + 2] + P[q + 5]) / 2;
      normalsTested += 1;
      // Probe just off the wall. A longer step crosses narrow alcoves in
      // concave footprints and lands back inside the same building, which reads
      // as an inward normal when the normal is perfectly correct.
      if (insideAny(mx + N[q] * 0.05, mz + N[q + 2] * 0.05, [b])) inwardNormals += 1;
    }
  }
  check("wall normals point outward", inwardNormals === 0,
    `${inwardNormals}/${normalsTested} faced inward`);

  // The check above passes on geometry that is completely invisible. Backface
  // culling uses the TRIANGLE WINDING, not the normal attribute, and shipping
  // these disagreeing deleted every wall in the city while every assertion
  // still went green. So: derive the geometric normal from the vertex order and
  // require it to agree with the normal we declared.
  let flipped = 0;
  let facesTested = 0;
  for (const b of buildings.filter((_, i) => i % 5 === 0)) {
    const buf = emptyBuffers();
    extrudeBuilding(b.ring, b.height, 1, buf);
    for (const part of [buf.ground, buf.wall, buf.roof]) {
      const { positions: P, normals: N, indices: I } = part;
      for (let t = 0; t < I.length; t += 3) {
        const [i0, i1, i2] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3];
        const ux = P[i1] - P[i0], uy = P[i1 + 1] - P[i0 + 1], uz = P[i1 + 2] - P[i0 + 2];
        const vx = P[i2] - P[i0], vy = P[i2 + 1] - P[i0 + 1], vz = P[i2 + 2] - P[i0 + 2];
        // Geometric normal from the winding, right-hand rule.
        const gx = uy * vz - uz * vy;
        const gy = uz * vx - ux * vz;
        const gz = ux * vy - uy * vx;
        if (Math.hypot(gx, gy, gz) < 1e-9) continue;
        facesTested += 1;
        if (gx * N[i0] + gy * N[i0 + 1] + gz * N[i0 + 2] < 0) flipped += 1;
      }
    }
  }
  check("triangle winding agrees with the normals", flipped === 0,
    `${flipped}/${facesTested} faces wound inside out`);

  // --- world build ---
  // Runs the real buildFreeRoamWorld against a stub of the three API it uses.
  // This will not tell us it looks right, but it does exercise the extrusion
  // index maths and the door/sign placement, which is where a silent geometry
  // bug would otherwise sit until someone loaded the page.
  process.stdout.write("\nworld build:\n");
  const { buildFreeRoamWorld } = await import("../src/world/freeRoamWorld.js");
  const THREE = stubThree();
  const group = new THREE.Group();
  // canvasTex actually runs the draw callback against a stub 2D context, so
  // every texture in cityTextures.js is executed rather than just constructed.
  let texturesDrawn = 0;
  const canvasTex = (w, h, draw) => {
    draw(stubCtx(), w, h);
    texturesDrawn += 1;
    return { wrapS: 0, wrapT: 0, repeat: { set() {} }, dispose() {} };
  };

  const built = buildFreeRoamWorld({
    THREE,
    group,
    chapters: [{ name: "JD", sub: "the first one" }],
    cleared: 0,
    canvasTex,
  });
  check("city textures all render without throwing", texturesDrawn >= 7, `${texturesDrawn} drawn`);

  check("world exposes the three story places", built.places.length === 3,
    built.places.map((p) => `${p.name}[${p.kind}]`).join(", "));
  check("JD is the chapter door", built.places.some((p) => p.kind === "chapter" && p.index === 0));
  check("bank is the bank door", built.places.some((p) => p.kind === "bank"));
  check("Kimani's is a placeholder door", built.places.some((p) => p.kind === "placeholder"));
  check("every place has an exit", built.places.every((p) => p.exit && Number.isFinite(p.exit.yaw)));
  check("spawn and yaw are finite", Number.isFinite(built.spawn[0]) && Number.isFinite(built.yaw));

  // Let the streamed tiles land, then confirm real geometry was produced.
  await new Promise((r) => setTimeout(r, 800));
  const meshes = group.children.filter((c) => c.__isMesh);
  const verts = meshes.reduce((n, m) => n + (m.geometry?.__count || 0), 0);
  check("tiles produced merged geometry", verts > 10000, `${verts} vertices in ${meshes.length} meshes`);
  // What matters is meshes per TILE, not in total: a tile emits a fixed handful
  // (shopfronts, upper walls, roofs, terrain, roads) no matter how many
  // buildings it holds. Counting against a fixed total just fails as the city
  // grows.
  const perTile = meshes.length / Math.max(1, built.stream.residentCount);
  check("geometry is merged, not per-building", perTile <= 6,
    `${perTile.toFixed(1)} meshes/tile for ${built.colliders.buildings.length} buildings`);

  const bad = meshes.find((m) => m.geometry && m.geometry.__maxIndex >= m.geometry.__count);
  check("no out-of-range triangle indices", !bad,
    bad ? `index ${bad.geometry.__maxIndex} >= ${bad.geometry.__count} verts` : "");

  built.stream.dispose();
  check("dispose releases every tile", built.stream.residentCount === 0);

  process.stdout.write(`\n${failures ? `${failures} FAILED` : "all checks passed"}\n`);
  process.exit(failures ? 1 : 0);
};

/** Enough of CanvasRenderingContext2D to run the texture painters headlessly. */
function stubCtx() {
  const noop = () => {};
  return new Proxy({
    createLinearGradient: () => ({ addColorStop: noop }),
    canvas: { width: 256, height: 256 },
  }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      // Any other method is a no-op; any other property reads/writes freely.
      return typeof prop === "string" && /^[a-z]/.test(prop) ? noop : undefined;
    },
    set() { return true; },
  });
}

/** The narrow slice of the three API the world builder actually touches. */
function stubThree() {
  class Obj {
    constructor() { this.children = []; this.position = xyz(); this.rotation = xyz(); this.scale = xyz(); }
    add(c) { this.children.push(c); }
    remove(c) { this.children = this.children.filter((x) => x !== c); }
    traverse(fn) { fn(this); for (const c of this.children) c.traverse?.(fn); }
  }
  const xyz = () => ({ x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; } });

  class BufferGeometry {
    constructor() { this.__count = 0; this.__maxIndex = -1; }
    setAttribute(name, attr) { if (name === "position") this.__count = attr.__count; }
    setIndex(idx) { this.__maxIndex = idx.length ? Math.max(...idx) : -1; }
    computeVertexNormals() {}
    computeBoundingSphere() {}
    dispose() {}
  }
  class Mesh extends Obj {
    constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; this.__isMesh = true; }
  }
  const Mat = class { constructor(o) { Object.assign(this, o); } dispose() {} };

  return {
    Group: Obj,
    Mesh,
    BufferGeometry,
    Float32BufferAttribute: class { constructor(arr, size) { this.__count = arr.length / size; } },
    BufferAttribute: class { constructor(arr, size) { this.__count = arr.length / size; } },
    PlaneGeometry: BufferGeometry,
    BoxGeometry: BufferGeometry,
    SphereGeometry: BufferGeometry,
    CylinderGeometry: BufferGeometry,
    MeshStandardMaterial: Mat,
    MeshBasicMaterial: Mat,
    HemisphereLight: Obj,
    DirectionalLight: Obj,
    AmbientLight: Obj,
    PointLight: Obj,
    RingGeometry: BufferGeometry,
    RepeatWrapping: 1000,
    DoubleSide: 2,
    BackSide: 1,
    Color: class {
      constructor(hex) { this.hex = hex >>> 0 || 0; }
      multiplyScalar() { return this; }
      lerp() { return this; }
      getHexString() { return this.hex.toString(16).padStart(6, "0"); }
    },
  };
}

/** Edges long enough for extrudeBuilding to bother with (it skips slivers). */
function countUsableEdges(ring) {
  const n = ring.length / 2;
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    if (Math.hypot(ring[j * 2] - ring[i * 2], ring[j * 2 + 1] - ring[i * 2 + 1]) >= 0.01) count += 1;
  }
  return count;
}

function isDiagonal(b) {
  // True if any wall runs at a meaningful angle to both axes.
  const n = b.ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const dx = Math.abs(b.ring[i * 2] - b.ring[j * 2]);
    const dz = Math.abs(b.ring[i * 2 + 1] - b.ring[j * 2 + 1]);
    if (Math.hypot(dx, dz) > 4 && dx > 1.5 && dz > 1.5) return true;
  }
  return false;
}

main().catch((err) => {
  process.stderr.write(`verify failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
