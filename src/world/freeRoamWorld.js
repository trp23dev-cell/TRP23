// ============================================================================
// THE BLOCK — the free-roam hub the chapters sit on.
//
// The block is the real city centre of Lincoln, UK, built from OpenStreetMap
// data (ODbL). JD on the High Street is the first chapter, NatWest on Mint
// Street is the bank, and Kimani's on Corporation Street is a door that does
// not open yet. They are pinned to their real buildings — see
// lincolnAnchors.json for why they are pinned by OSM id and never by name.
//
// Geometry arrives from our own server as 250m tiles and is built and torn down
// around the player (mapStream.js). Nothing here knows about lat/lon; by the
// time the data lands, it is metres.
//
// The sky and the door lights brighten as chapters are cleared. That is the
// moral arc carried by the art (Bible Vol 3): the block you are trying to get
// out of visibly becomes somewhere legitimate as you do the work.
// ============================================================================

import { createMapStream, fetchMapManifest } from "./mapStream.js";
import { MAP_ATTRIBUTION } from "./geo.js";

export const PLAYER_RADIUS = 0.6;
export const ENTER_DISTANCE = 4.6;

// Fallback bound, replaced by the real map extent once the manifest is in.
export let WORLD_BOUND = 150;

const GOLD = 0xc9a06a;

// Collision grid cell. Buildings are registered into every cell their bounding
// box touches, and only the cells around the player are ever tested — a linear
// scan over a whole city every frame is not affordable.
const CELL = 25;

// How the block looks at each stage of the journey. Index = chapters cleared.
// It starts at a street-lit dusk and ends in daylight.
//
// Deliberately NOT starting at night: the chapter interiors carry the darkness
// (chapter one is the darkest room in the game), but the block is where the
// player navigates, so it has to stay readable at zero progress. The arc is a
// lift from dusk to day, not from black to day.
const MOODS = [
  { bg: 0x2a2f3d, fog: [0x2a2f3d, 0.012], hemi: 1.3,  sun: 1.2,  amb: 0.42, exposure: 1.25, lamp: 1.6 },
  { bg: 0x333949, fog: [0x333949, 0.011], hemi: 1.5,  sun: 1.5,  amb: 0.46, exposure: 1.30, lamp: 1.4 },
  { bg: 0x3d4455, fog: [0x3d4455, 0.010], hemi: 1.75, sun: 1.8,  amb: 0.50, exposure: 1.35, lamp: 1.15 },
  { bg: 0x474f62, fog: [0x474f62, 0.009], hemi: 2.0,  sun: 2.1,  amb: 0.54, exposure: 1.40, lamp: 0.9 },
  { bg: 0x525b70, fog: [0x525b70, 0.008], hemi: 2.2,  sun: 2.35, amb: 0.57, exposure: 1.45, lamp: 0.6 },
  { bg: 0x5d677e, fog: [0x5d677e, 0.007], hemi: 2.4,  sun: 2.55, amb: 0.60, exposure: 1.50, lamp: 0.35 },
  { bg: 0x6a758d, fog: [0x6a758d, 0.006], hemi: 2.6,  sun: 2.8,  amb: 0.62, exposure: 1.55, lamp: 0.2 },
];

export function worldMood(cleared) {
  return MOODS[Math.max(0, Math.min(MOODS.length - 1, cleared | 0))];
}

// ---------------------------------------------------------------- manifest

let manifest = null;

/**
 * Fetch the map description once, at boot.
 *
 * Awaiting this before the first loadWorld() is what lets buildFreeRoamWorld
 * stay synchronous: by the time the world is built, the anchors and the tile
 * index are already in hand and only the geometry is still in flight.
 */
export async function prepareMap() {
  if (manifest) return manifest;
  manifest = await fetchMapManifest();
  if (Array.isArray(manifest.tiles) && manifest.tiles.length) {
    // Bound the player to the tiles that actually exist, plus a tile of slack
    // so they can reach the far kerb rather than stopping on the boundary.
    const size = manifest.tileSize;
    let max = 0;
    for (const [tx, tz] of manifest.tiles) {
      max = Math.max(max, Math.abs(tx) * size, Math.abs(tz) * size);
    }
    WORLD_BOUND = max + size * 2;
  }
  return manifest;
}

export function mapReady() {
  return !!manifest;
}

// ---------------------------------------------------------------- collision

/**
 * Uniform spatial hash over the buildings currently streamed in. Rebuilt when
 * the resident tile set changes, which is rare — once per 250m walked — rather
 * than per frame.
 */
export function createCollisionIndex() {
  return {
    cells: new Map(),
    buildings: [],
    roads: [],
    rebuild(buildings, roads) {
      this.buildings = buildings;
      this.roads = roads;
      this.cells.clear();
      for (const b of buildings) {
        const x0 = Math.floor(b.minX / CELL);
        const x1 = Math.floor(b.maxX / CELL);
        const z0 = Math.floor(b.minZ / CELL);
        const z1 = Math.floor(b.maxZ / CELL);
        for (let cx = x0; cx <= x1; cx += 1) {
          for (let cz = z0; cz <= z1; cz += 1) {
            const key = `${cx},${cz}`;
            let list = this.cells.get(key);
            if (!list) this.cells.set(key, (list = []));
            list.push(b);
          }
        }
      }
    },
    near(x, z) {
      const cx = Math.floor(x / CELL);
      const cz = Math.floor(z / CELL);
      const out = [];
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const list = this.cells.get(`${cx + dx},${cz + dz}`);
          if (list) out.push(...list);
        }
      }
      return out;
    },
  };
}

function pointInRing(px, pz, ring) {
  let inside = false;
  const n = ring.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i * 2];
    const zi = ring[i * 2 + 1];
    const xj = ring[j * 2];
    const zj = ring[j * 2 + 1];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The correction that would push a circle out of one footprint, or null if it
 * is already clear. Returns the move rather than applying it so the caller can
 * resolve the deepest overlap first.
 *
 * Real footprints are not axis-aligned — Corporation Street and Silver Street
 * both sit at an angle — so a bounding-box push would leave the player scraping
 * invisible walls out in the road. This resolves against the actual wall.
 */
function ringCorrection(p, ring, radius) {
  const n = ring.length / 2;
  let bestD2 = Infinity;
  let bx = 0;
  let bz = 0;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = ring[j * 2];
    const az = ring[j * 2 + 1];
    const cx = ring[i * 2];
    const cz = ring[i * 2 + 1];
    const ex = cx - ax;
    const ez = cz - az;
    const len2 = ex * ex + ez * ez;
    let t = len2 > 0 ? ((p.x - ax) * ex + (p.z - az) * ez) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + ex * t;
    const qz = az + ez * t;
    const d2 = (p.x - qx) ** 2 + (p.z - qz) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      bx = qx;
      bz = qz;
    }
  }

  const inside = pointInRing(p.x, p.z, ring);
  const d = Math.sqrt(bestD2);
  if (!inside && d >= radius) return null;

  let dx = p.x - bx;
  let dz = p.z - bz;
  if (d > 1e-6) {
    dx /= d;
    dz /= d;
  } else {
    dx = 1;
    dz = 0;
  }
  // Standing inside the footprint means the nearest wall point is behind us.
  if (inside) {
    dx = -dx;
    dz = -dz;
  }
  const x = bx + dx * radius;
  const z = bz + dz * radius;
  return { x, z, depth: Math.hypot(x - p.x, z - p.z) };
}

// A correction bigger than this means the player was already somewhere they
// should not be. Still resolved, but not by flinging them across the city.
const MAX_CORRECTION = 6;

/**
 * Push the player out of any building they have walked into.
 *
 * Overlaps are resolved deepest-first, one per pass. Resolving them in
 * arbitrary order lets a terrace hand the player back and forth — out of one
 * shop straight into its neighbour — and walk them a long way down the street
 * in a single frame.
 */
export function resolveWorldCollisions(position, index) {
  const p = position;
  p.x = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, p.x));
  p.z = Math.max(-WORLD_BOUND, Math.min(WORLD_BOUND, p.z));
  if (!index || !index.near) return;

  const startX = p.x;
  const startZ = p.z;

  for (let pass = 0; pass < 4; pass += 1) {
    let deepest = null;
    for (const b of index.near(p.x, p.z)) {
      if (
        p.x < b.minX - PLAYER_RADIUS || p.x > b.maxX + PLAYER_RADIUS ||
        p.z < b.minZ - PLAYER_RADIUS || p.z > b.maxZ + PLAYER_RADIUS
      ) continue;
      const fix = ringCorrection(p, b.ring, PLAYER_RADIUS);
      if (fix && (!deepest || fix.depth > deepest.depth)) deepest = fix;
    }
    if (!deepest) break;
    p.x = deepest.x;
    p.z = deepest.z;
  }

  // Bound the whole correction, so a bad state degrades into "stuck against a
  // wall" rather than "teleported two streets over".
  const dx = p.x - startX;
  const dz = p.z - startZ;
  const moved = Math.hypot(dx, dz);
  if (moved > MAX_CORRECTION) {
    p.x = startX + (dx / moved) * MAX_CORRECTION;
    p.z = startZ + (dz / moved) * MAX_CORRECTION;
  }
}

// ---------------------------------------------------------------- world build

/**
 * Builds the block into `group`. prepareMap() must have resolved first.
 *
 * @param {object} opts
 * @param {object} opts.THREE           three namespace (the game owns the import)
 * @param {object} opts.group           THREE.Group to add everything to
 * @param {Array}  opts.chapters        LEVELS array - supplies names, so renames flow through
 * @param {number} opts.cleared         chapters cleared; drives unlocks and the sky
 * @param {Function} opts.canvasTex     game's canvas-texture helper (w,h,draw)=>Texture
 * @param {Function} [opts.setTextureQuality]
 * @param {Function} [opts.shadows]
 * @returns {{spawn:number[],yaw:number,mood:object,colliders:object,places:Array,stream:object}}
 */
export function buildFreeRoamWorld({ THREE, group, chapters, cleared = 0, canvasTex, setTextureQuality, shadows }) {
  const tune = (t) => { if (setTextureQuality) setTextureQuality(t); return t; };
  const mood = worldMood(cleared);
  const places = [];
  const index = createCollisionIndex();

  // ---- ground ----
  const groundTex = tune(canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#22201d"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = `rgba(${50 + Math.random() * 30},${46 + Math.random() * 26},40,${Math.random() * .35})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }));
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(120, 120);
  const groundSpan = WORLD_BOUND * 2.4;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSpan, groundSpan),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: .95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ---- sky ----
  // A gradient dome rather than a flat background colour. Flat backgrounds read
  // as a wall at the end of the street; a horizon that warms toward the ground
  // gives the city somewhere to stand and sells the distance.
  const skyTex = tune(canvasTex(4, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    const top = new THREE.Color(mood.bg).multiplyScalar(0.72);
    const horizon = new THREE.Color(mood.bg).lerp(new THREE.Color(0xd8a878), 0.34);
    grad.addColorStop(0, `#${top.getHexString()}`);
    grad.addColorStop(0.62, `#${new THREE.Color(mood.bg).getHexString()}`);
    grad.addColorStop(1, `#${horizon.getHexString()}`);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }));
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(WORLD_BOUND * 1.9, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  sky.renderOrder = -1;
  group.add(sky);

  // ---- lights ----
  group.add(new THREE.HemisphereLight(0xd6dbf0, 0x555044, mood.hemi));
  const sun = new THREE.DirectionalLight(0xfff0dc, mood.sun);
  sun.position.set(-40, 60, -20);
  group.add(sun);
  group.add(new THREE.AmbientLight(0xffffff, mood.amb));

  // ---- streamed city geometry ----
  const stream = createMapStream({
    THREE,
    group,
    manifest,
    canvasTex,
    setTextureQuality,
    // Windows and shopfronts burn brightest at the start of the journey and
    // fade as the sky comes up, the same arc the door lights carry. Kept low:
    // this feeds a bloom pass, and anything above ~0.7 turns every shopfront
    // into a solid white band with no glazing bars or doorway left in it.
    nightLift: 0.12 + mood.lamp * 0.30,
    onTilesChanged: () => index.rebuild(stream.activeBuildings(), stream.activeRoads()),
  });

  // ---- signage ----
  function signTex(name, locked) {
    return tune(canvasTex(512, 128, (g, w, h) => {
      g.fillStyle = "#0a0908"; g.fillRect(0, 0, w, h);
      g.strokeStyle = locked ? "rgba(150,140,125,.35)" : "rgba(201,160,106,.5)";
      g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = locked ? "#6d675d" : "#c9a06a";
      const size = name.length > 15 ? 38 : name.length > 11 ? 46 : 52;
      g.font = `bold ${size}px Georgia, serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(name, w / 2, h / 2 + 4);
    }));
  }

  // ---- the places you can walk into ----
  // Doors, signs and lights are hung on the real buildings by the tiler, which
  // picked the wall facing the street. Unlike the tiles, these are always
  // present: a story location must never be missing because a tile is in
  // flight.
  for (const anchor of manifest?.anchors || []) {
    const isChapter = anchor.kind === "chapter";
    const index_ = isChapter ? anchor.key : -1;
    const chapter = isChapter ? chapters[index_] : null;
    if (isChapter && !chapter) continue;

    const locked = isChapter && index_ > cleared;
    const name = isChapter ? chapter.name : anchor.name;
    const door = anchor.door;

    const b = new THREE.Group();
    const doorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 3.4),
      new THREE.MeshStandardMaterial({
        color: 0x120f0b,
        emissive: locked ? 0x3a352c : GOLD,
        emissiveIntensity: locked ? .12 : .35,
        roughness: .6,
        side: THREE.DoubleSide,
      })
    );
    doorMesh.position.set(0, 1.7, 0);
    b.add(doorMesh);

    // The sign goes on the fascia board above the glazing — where a real shop
    // sign is — not floating at first-floor height. Width is capped: the bank's
    // frontage is 16m wide, and a sign that size fills the screen when you
    // spawn in front of it.
    const signW = Math.min(Math.max(door.width - 1.2, 2.6), 5.5);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(signW, signW * 0.2),
      new THREE.MeshBasicMaterial({ map: signTex(name, locked), transparent: true, side: THREE.DoubleSide })
    );
    sign.position.set(0, 2.85, 0.06);
    b.add(sign);

    // mood.lamp carries the dusk-to-daylight arc: the doors blaze at the start
    // of the journey and fade back as the sky comes up to meet them.
    const dl = new THREE.PointLight(
      locked ? 0x6b6355 : GOLD,
      (anchor.kind === "bank" ? 2 : 1.2) * (locked ? .3 : 1) * (0.5 + mood.lamp),
      14,
      1.6
    );
    dl.position.set(0, 3, 1.5);
    b.add(dl);

    b.position.set(door.x, 0, door.z);
    // The door group is rotated to sit flat on its wall, facing the street.
    b.rotation.y = Math.atan2(door.nx, door.nz);
    if (shadows) shadows(b);
    group.add(b);

    places.push({
      kind: anchor.kind,
      index: index_,
      name,
      locked,
      sub: isChapter ? chapter.sub : anchor.sub,
      // stand just outside the door
      x: anchor.x,
      z: anchor.z,
      // Where the player is put when they walk back OUT of this place. Sits far
      // enough past the door that the "enter" prompt does not immediately fire
      // again, and faces away from the building so the door is behind them.
      exit: anchor.exit,
    });
  }

  const spawn = manifest?.spawn || [0, 14];
  const yaw = manifest?.spawnYaw ?? 0;

  // Kick off the first tiles so the street is there when the fade lifts.
  stream.update(spawn[0], spawn[1], { force: true });
  index.rebuild(stream.activeBuildings(), stream.activeRoads());

  return { spawn, yaw, mood, colliders: index, places, stream };
}

/**
 * A marker you can see from across the block.
 *
 * A waypoint is only useful if you can find it without looking at the map, so
 * it is a tall beam rather than a pin on the ground: on a street of two-storey
 * shopfronts a 40m column stays visible from most of the city centre.
 */
export function createWaypointBeacon({ THREE, group }) {
  const beacon = new THREE.Group();

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 40, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xf4ecdd,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  beam.position.y = 20;
  beacon.add(beam);

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 40, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff6e6, transparent: true, opacity: 0.55, depthWrite: false })
  );
  core.position.y = 20;
  beacon.add(core);

  // A ring on the pavement, so the beam has a foot you can actually walk to.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xf4ecdd, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  beacon.add(ring);

  beacon.visible = false;
  group.add(beacon);

  return {
    set(wp) {
      if (!wp) { beacon.visible = false; return; }
      beacon.position.set(wp.x, 0, wp.z);
      beacon.visible = true;
    },
    /** Slow pulse, so it reads as a marker rather than as part of the city. */
    tick(t) {
      if (!beacon.visible) return;
      const p = 0.5 + Math.sin(t * 2.2) * 0.5;
      beam.material.opacity = 0.10 + p * 0.12;
      ring.material.opacity = 0.34 + p * 0.28;
      ring.scale.setScalar(1 + p * 0.10);
    },
    dispose() {
      group.remove(beacon);
      beacon.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    },
  };
}

/** Nearest place to the player, for the compass and the [E] prompt. */
export function nearestPlace(position, places) {
  let best = null, bd = Infinity;
  for (const pl of places) {
    const dist = Math.hypot(position.x - pl.x, position.z - pl.z);
    if (dist < bd) { bd = dist; best = pl; }
  }
  return best ? { place: best, dist: bd } : null;
}

/** Player-centred, north-up street map. */
export function drawMinimap(ctx, canvas, camera, index, places, near, THREE, dirVec, waypoint) {
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2, ppm = 1.15;
  const px = camera.position.x, pz = camera.position.z;
  ctx.clearRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(201,160,106,.10)";
  for (const r of [30, 60]) { ctx.beginPath(); ctx.arc(cx, cy, r * ppm, 0, Math.PI * 2); ctx.stroke(); }

  // Roads under buildings: on a real street grid the roads are what you
  // actually navigate by, so they read as the base layer.
  ctx.strokeStyle = "rgba(201,160,106,.22)";
  ctx.lineWidth = 1.5;
  for (const r of index?.roads || []) {
    ctx.beginPath();
    for (let i = 0; i < r.p.length; i += 2) {
      const sx = cx + (r.p[i] - px) * ppm, sy = cy + (r.p[i + 1] - pz) * ppm;
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(201,160,106,.16)";
  for (const b of index?.buildings || []) {
    // Skip anything well off the dial rather than pathing it.
    if (Math.abs(b.minX - px) > 90 && Math.abs(b.maxX - px) > 90) continue;
    if (Math.abs(b.minZ - pz) > 90 && Math.abs(b.maxZ - pz) > 90) continue;
    ctx.beginPath();
    for (let i = 0; i < b.ring.length; i += 2) {
      const sx = cx + (b.ring[i] - px) * ppm, sy = cy + (b.ring[i + 1] - pz) * ppm;
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fill();
  }

  for (const pl of places) {
    const sx = cx + (pl.x - px) * ppm, sy = cy + (pl.z - pz) * ppm;
    const isNear = near && near.place === pl;
    ctx.fillStyle = pl.locked ? "#6d675d" : pl.kind === "bank" ? "#e8c98a" : "#c9a06a";
    ctx.beginPath(); ctx.arc(sx, sy, isNear ? 4 : 2.6, 0, Math.PI * 2); ctx.fill();
    if (isNear) {
      ctx.strokeStyle = "rgba(201,160,106,.7)";
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Waypoint. If it is off the edge of the dial, it becomes an arrow pinned to
  // the rim pointing the way — a marker you cannot see is no use.
  if (waypoint) {
    const wx = (waypoint.x - px) * ppm;
    const wz = (waypoint.z - pz) * ppm;
    const rim = Math.min(W, H) / 2 - 9;
    const dist = Math.hypot(wx, wz);
    ctx.fillStyle = "#f4ecdd";
    if (dist <= rim) {
      const sx = cx + wx, sy = cy + wz;
      ctx.beginPath(); ctx.arc(sx, sy, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(244,236,221,.8)";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(sx, sy, 7.5, 0, Math.PI * 2); ctx.stroke();
    } else {
      const a = Math.atan2(wz, wx);
      ctx.save();
      ctx.translate(cx + Math.cos(a) * rim, cy + Math.sin(a) * rim);
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  camera.getWorldDirection(dirVec);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.atan2(dirVec.z, dirVec.x) + Math.PI / 2);
  ctx.fillStyle = "#f4ecdd";
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
  ctx.restore();

  // ODbL requires attribution wherever the data is shown.
  ctx.fillStyle = "rgba(244,236,221,.35)";
  ctx.font = "7px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(MAP_ATTRIBUTION, W - 3, H - 3);
}
