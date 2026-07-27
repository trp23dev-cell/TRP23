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
export function extrudeBuilding(flat, height, tint, buffers, opts = {}) {
  const n = flat.length / 2;
  if (n < 3) return;
  const { base = 0, sill = null, style = "brick", ground = "shopfront", roof = "gabled" } = opts;
  const wallBuf = buffers.wall[style] || buffers.wall.brick;
  // Only places that actually trade get a glazed shopfront. Two thirds of the
  // city centre is houses and flats, and giving those a shopfront makes the
  // whole place read as one endless parade of shops.
  const groundBuf = ground === "shopfront" ? buffers.shopfront
    : ground === "blank" ? wallBuf
    : buffers.residential;

  const order = normalisedOrder(flat);

  // THREE levels matter on a hill, not two:
  //   base — the LOWEST ground under the footprint, less a skirt. Nothing may
  //          start above this or the downhill side hangs in the air.
  //   sill — the HIGHEST ground under the footprint. Street level. The
  //          shopfront starts here, because anything below it is underground
  //          somewhere along the wall.
  //   top  — sill + height, so storeys are counted from the street.
  //
  // Between base and sill goes a plinth. That is not a fudge to hide a gap: it
  // is what buildings on a slope actually do, and Lincoln is full of them.
  // Founding the shopfront at `base` instead buries the glazing on every
  // sloping site, which on Steep Hill is most of them.
  const street = sill === null ? base : sill;
  const top = street + height;
  const groundTop = street + Math.min(STOREY, height);

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

    // Plinth: the stonework between the lowest ground and street level.
    if (street > base + 0.02) {
      quad(buffers.plinth, ax, az, bx, bz, base, street, nx, nz, len, tint, 0.35, 0.6, base);
    }
    quad(groundBuf, ax, az, bx, bz, street, groundTop, nx, nz, len, tint, 0.45, 1.0, street);
    if (top > groundTop) {
      quad(wallBuf, ax, az, bx, bz, groundTop, top, nx, nz, len, tint, 0.72, 1.0, street);
    }
  }

  // ---- roof ----
  // Lincoln has almost no flat roofs. A pitched ridge changes the skyline more
  // than any texture does, so anything close enough to rectangular gets one and
  // the awkward shapes fall back to flat.
  const obb = orientedBox(flat, order);
  const fill = obb ? Math.abs(ringSignedArea(flat)) / (obb.w * obb.d) : 0;
  if (roof === "gabled" && obb && fill > 0.78 && Math.min(obb.w, obb.d) > 3.5) {
    pitchedRoof(buffers.roof, obb, top, tint);
  } else {
    flatRoof(buffers.roof, flat, order, top, tint);
  }
}

function flatRoof(b, flat, order, top, tint) {
  const n = order.length;
  const tris = triangulate(flat, order);
  const vertexBase = b.positions.length / 3;
  for (let k = 0; k < n; k += 1) {
    const i = order[k];
    b.positions.push(flat[i * 2], top, flat[i * 2 + 1]);
    b.normals.push(0, 1, 0);
    b.uvs.push(flat[i * 2] / 8, flat[i * 2 + 1] / 8);
    b.colors.push(tint[0], tint[1], tint[2]);
  }
  // Same story as the walls: a triangle wound anticlockwise in plan view faces
  // downward once it is lifted onto the roof, so the order is reversed here.
  for (let i = 0; i < tris.length; i += 3) {
    b.indices.push(vertexBase + tris[i], vertexBase + tris[i + 2], vertexBase + tris[i + 1]);
  }
}

/**
 * Smallest-area rectangle enclosing the footprint, by rotating calipers over
 * every edge direction. Gives the roof a ridge that runs the way the building
 * actually runs, rather than along whichever axis happens to be north.
 */
function orientedBox(flat, order) {
  const n = order.length;
  if (n < 3) return null;
  let best = null;

  for (let k = 0; k < n; k += 1) {
    const i = order[k];
    const j = order[(k + 1) % n];
    const ex = flat[j * 2] - flat[i * 2];
    const ez = flat[j * 2 + 1] - flat[i * 2 + 1];
    const len = Math.hypot(ex, ez);
    if (len < 0.5) continue;
    const ux = ex / len;
    const uz = ez / len;

    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (let m = 0; m < n; m += 1) {
      const p = order[m];
      const u = flat[p * 2] * ux + flat[p * 2 + 1] * uz;
      const v = -flat[p * 2] * uz + flat[p * 2 + 1] * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const area = (maxU - minU) * (maxV - minV);
    if (!best || area < best.area) {
      best = { area, ux, uz, minU, maxU, minV, maxV };
    }
  }
  if (!best) return null;

  const { ux, uz, minU, maxU, minV, maxV } = best;
  const cu = (minU + maxU) / 2;
  const cv = (minV + maxV) / 2;
  return {
    // Centre back in world space.
    cx: cu * ux - cv * uz,
    cz: cu * uz + cv * ux,
    ux, uz,
    w: maxU - minU,
    d: maxV - minV,
  };
}

/** A gabled roof: ridge along the long axis, two slopes, two gable ends. */
function pitchedRoof(b, obb, top, tint) {
  const { cx, cz, ux, uz, w, d } = obb;
  // Ridge runs along whichever side is longer.
  const alongLong = w >= d;
  const halfLong = (alongLong ? w : d) / 2;
  const halfShort = (alongLong ? d : w) / 2;
  // ~38 degrees, the usual British pitch, capped so a wide building does not
  // grow an absurd spire.
  const rise = Math.min(halfShort * 0.78, 5.2);
  const ridgeY = top + rise;

  // Long axis unit vector, and the short axis perpendicular to it.
  const lx = alongLong ? ux : -uz;
  const lz = alongLong ? uz : ux;
  const sx = -lz;
  const sz = lx;

  const P = (l, s, y) => [cx + lx * l + sx * s, y, cz + lz * l + sz * s];
  const eaveA = [P(-halfLong, -halfShort, top), P(halfLong, -halfShort, top)];
  const eaveB = [P(-halfLong, halfShort, top), P(halfLong, halfShort, top)];
  const ridge = [P(-halfLong, 0, ridgeY), P(halfLong, 0, ridgeY)];

  const slope = Math.hypot(halfShort, rise);
  addQuad(b, eaveA[0], eaveA[1], ridge[1], ridge[0], halfLong * 2, slope, tint);
  addQuad(b, ridge[0], ridge[1], eaveB[1], eaveB[0], halfLong * 2, slope, tint);
  // Gable ends, so you do not see daylight through the roof from the side.
  addTri(b, eaveA[0], ridge[0], eaveB[0], tint);
  addTri(b, eaveB[1], ridge[1], eaveA[1], tint);
}

function faceNormal(p, q, r) {
  const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
  const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function addQuad(b, p0, p1, p2, p3, uSpan, vSpan, tint) {
  const base = b.positions.length / 3;
  let nrm = faceNormal(p0, p1, p2);
  // Roof faces always point up; flip if the winding came out the other way.
  if (nrm[1] < 0) { nrm = nrm.map((v) => -v); }
  for (const p of [p0, p1, p2, p3]) {
    b.positions.push(p[0], p[1], p[2]);
    b.normals.push(nrm[0], nrm[1], nrm[2]);
    b.colors.push(tint[0], tint[1], tint[2]);
  }
  b.uvs.push(0, 0, uSpan / 8, 0, uSpan / 8, vSpan / 8, 0, vSpan / 8);
  const wound = faceNormal(p0, p1, p2)[1] >= 0;
  if (wound) b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  else b.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

function addTri(b, p0, p1, p2, tint) {
  const base = b.positions.length / 3;
  const nrm = faceNormal(p0, p1, p2);
  for (const p of [p0, p1, p2]) {
    b.positions.push(p[0], p[1], p[2]);
    b.normals.push(nrm[0], nrm[1], nrm[2]);
    b.colors.push(tint[0], tint[1], tint[2]);
    b.uvs.push(p[0] / 8, p[2] / 8);
  }
  b.indices.push(base, base + 1, base + 2);
}

/** One wall quad, with AO shading from `bottomShade` up to `topShade`. */
function quad(b, ax, az, bx, bz, y0, y1, nx, nz, len, tint, bottomShade, topShade, base = 0) {
  const vertexBase = b.positions.length / 3;
  b.positions.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
  for (let i = 0; i < 4; i += 1) b.normals.push(nx, 0, nz);

  // Tile by real metres so a wide building gets more windows, not stretched
  // ones, and so every building on a street lines up floor for floor.
  // Texture v runs from the building's own base, not from sea level, or a shop
  // 60m up the hill starts its brickwork nineteen storeys into the pattern.
  const u = len / 6;
  const v0 = (y0 - base) / STOREY;
  const v1 = (y1 - base) / STOREY;
  b.uvs.push(0, v0, u, v0, u, v1, 0, v1);

  // tint is the building's own colour; the two shades bake a cheap ambient
  // occlusion into it so walls darken toward the ground.
  const [tr, tg, tb] = tint;
  const lo = [tr * bottomShade, tg * bottomShade, tb * bottomShade];
  const hi = [tr * topShade, tg * topShade, tb * topShade];
  b.colors.push(...lo, ...lo, ...hi, ...hi);

  // Wound so the front face is the one the normal points at. Getting this the
  // other way round does not look subtly wrong — backface culling deletes every
  // wall in the city and you see straight through the block into the insides of
  // buildings behind it. The normal attribute alone will not save you; culling
  // reads the winding.
  b.indices.push(
    vertexBase, vertexBase + 2, vertexBase + 1,
    vertexBase, vertexBase + 3, vertexBase + 2
  );
}

export const STYLES = ["brick", "limestone", "render", "modern"];

/**
 * Upper walls are split by architectural style so each can carry its own
 * material — limestone ashlar and Victorian brick are different surfaces, not
 * the same surface in a different colour. Everything else stays shared, so a
 * tile is still a handful of draw calls rather than one per building.
 */
export function emptyBuffers() {
  const mk = () => ({ positions: [], normals: [], uvs: [], colors: [], indices: [] });
  const wall = {};
  for (const s of STYLES) wall[s] = mk();
  return { plinth: mk(), shopfront: mk(), residential: mk(), wall, roof: mk() };
}
