// ============================================================================
// BUILDING MESH — footprints into walls and roofs.
//
// Split out of mapStream.js because this is where the geometry has to be
// actually correct, and it is worth being able to test it on its own.
//
// Two things here are load-bearing, and both were bugs first:
//
//   WINDING. OSM does not agree on which way round a footprint goes — of
//   Lincoln's 517 buildings, 217 are clockwise and 300 anticlockwise. Emitting
//   triangles in ring order therefore builds two fifths of the city inside out,
//   and with backface culling on you can see straight through them. Every ring
//   is normalised before anything is emitted.
//
//   ROOFS. 58% of the footprints are concave — L-shaped corner shops, terraces
//   with back extensions. A triangle fan from vertex zero spills roof outside
//   the walls on every one of them, so roofs are ear-clipped properly.
// ============================================================================

// One storey. Also the height of the shopfront band at street level.
export const STOREY = 3.2;

/** Signed area of a flat [x,z,x,z,...] ring. Negative is clockwise here. */
export function ringSignedArea(flat) {
  let a = 0;
  const n = flat.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    a += flat[j * 2] * flat[i * 2 + 1] - flat[i * 2] * flat[j * 2 + 1];
  }
  return a / 2;
}

/**
 * Return the ring as a vertex-index order guaranteed anticlockwise, so callers
 * can emit consistent outward faces without caring how OSM drew it.
 */
export function normalisedOrder(flat) {
  const n = flat.length / 2;
  const order = [];
  for (let i = 0; i < n; i += 1) order.push(i);
  if (ringSignedArea(flat) < 0) order.reverse();
  return order;
}

/**
 * Ear-clipping triangulation of a simple polygon. Returns triples of indices
 * into the (already normalised) order array.
 *
 * Not the fastest algorithm going, but footprints average ten vertices and this
 * runs once per building at tile-build time.
 */
export function triangulate(flat, order) {
  const n = order.length;
  if (n < 3) return [];
  const px = (k) => flat[order[k] * 2];
  const pz = (k) => flat[order[k] * 2 + 1];

  const cross = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);

  const inTriangle = (ax, az, bx, bz, cx, cz, x, z) => {
    const d1 = cross(ax, az, bx, bz, x, z);
    const d2 = cross(bx, bz, cx, cz, x, z);
    const d3 = cross(cx, cz, ax, az, x, z);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(neg && pos);
  };

  const live = [];
  for (let i = 0; i < n; i += 1) live.push(i);
  const out = [];
  let guard = 0;

  while (live.length > 3 && guard < n * n + 16) {
    guard += 1;
    let clipped = false;

    for (let k = 0; k < live.length; k += 1) {
      const i0 = live[(k - 1 + live.length) % live.length];
      const i1 = live[k];
      const i2 = live[(k + 1) % live.length];
      const ax = px(i0), az = pz(i0);
      const bx = px(i1), bz = pz(i1);
      const cx = px(i2), cz = pz(i2);

      // Convex corner? (ring is anticlockwise, so an ear turns left)
      if (cross(ax, az, bx, bz, cx, cz) <= 0) continue;

      // No other vertex inside the candidate ear.
      let contains = false;
      for (const m of live) {
        if (m === i0 || m === i1 || m === i2) continue;
        if (inTriangle(ax, az, bx, bz, cx, cz, px(m), pz(m))) { contains = true; break; }
      }
      if (contains) continue;

      out.push(i0, i1, i2);
      live.splice(k, 1);
      clipped = true;
      break;
    }

    // Degenerate or self-intersecting footprint (OSM has a few). Fall back to a
    // fan rather than looping forever — a slightly wrong roof on one building
    // beats hanging the tile build.
    if (!clipped) break;
  }

  if (live.length >= 3) {
    for (let i = 1; i < live.length - 1; i += 1) out.push(live[0], live[i], live[i + 1]);
  }
  return out;
}

/**
 * Extrude one footprint into a mesh buffer set.
 *
 * Walls are emitted in two bands: a shopfront band at street level and the
 * floors above it, each into its own buffer so they can carry different
 * materials. That is what makes the ground floor read as somewhere that trades
 * rather than as a repeating window texture running into the pavement.
 *
 * Vertex colours carry a cheap ambient occlusion — walls darken toward the
 * ground — plus a per-building tint so a terrace does not read as one slab.
 */
export function extrudeBuilding(flat, height, tint, buffers) {
  const n = flat.length / 2;
  if (n < 3) return;

  const order = normalisedOrder(flat);
  const groundTop = Math.min(STOREY, height);

  for (let k = 0; k < n; k += 1) {
    const i = order[k];
    const j = order[(k + 1) % n];
    const ax = flat[i * 2];
    const az = flat[i * 2 + 1];
    const bx = flat[j * 2];
    const bz = flat[j * 2 + 1];

    const ex = bx - ax;
    const ez = bz - az;
    const len = Math.hypot(ex, ez);
    if (len < 0.01) continue;

    // With an anticlockwise ring, the outward normal is the edge turned right.
    const nx = ez / len;
    const nz = -ex / len;

    quad(buffers.ground, ax, az, bx, bz, 0, groundTop, nx, nz, len, tint, 0.45, 1.0);
    if (height > groundTop) {
      quad(buffers.wall, ax, az, bx, bz, groundTop, height, nx, nz, len, tint, 0.72, 1.0);
    }
  }

  // ---- roof ----
  const tris = triangulate(flat, order);
  const b = buffers.roof;
  const base = b.positions.length / 3;
  for (let k = 0; k < n; k += 1) {
    const i = order[k];
    b.positions.push(flat[i * 2], height, flat[i * 2 + 1]);
    b.normals.push(0, 1, 0);
    b.uvs.push(flat[i * 2] / 8, flat[i * 2 + 1] / 8);
    b.colors.push(tint, tint, tint);
  }
  // Same story as the walls: a triangle wound anticlockwise in plan view faces
  // downward once it is lifted onto the roof, so the order is reversed here.
  for (let i = 0; i < tris.length; i += 3) {
    b.indices.push(base + tris[i], base + tris[i + 2], base + tris[i + 1]);
  }
}

/** One wall quad, with AO shading from `bottomShade` up to `topShade`. */
function quad(b, ax, az, bx, bz, y0, y1, nx, nz, len, tint, bottomShade, topShade) {
  const base = b.positions.length / 3;
  b.positions.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
  for (let i = 0; i < 4; i += 1) b.normals.push(nx, 0, nz);

  // Tile by real metres so a wide building gets more windows, not stretched
  // ones, and so every building on a street lines up floor for floor.
  const u = len / 6;
  const v0 = y0 / STOREY;
  const v1 = y1 / STOREY;
  b.uvs.push(0, v0, u, v0, u, v1, 0, v1);

  const lo = tint * bottomShade;
  const hi = tint * topShade;
  b.colors.push(lo, lo, lo, lo, lo, lo, hi, hi, hi, hi, hi, hi);

  // Wound so the front face is the one the normal points at. Getting this the
  // other way round does not look subtly wrong — backface culling deletes every
  // wall in the city and you see straight through the block into the insides of
  // buildings behind it. The normal attribute alone will not save you; culling
  // reads the winding.
  b.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

export function emptyBuffers() {
  const mk = () => ({ positions: [], normals: [], uvs: [], colors: [], indices: [] });
  return { ground: mk(), wall: mk(), roof: mk() };
}
