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
  const { base = 0, sill = null, style = "brick", ground = "shopfront", roof = "gabled", massing = null } = opts;
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
  // Monuments map one texture over the entire elevation. Repeating per storey
  // is what turned an 83m cathedral into twenty-six floors of office windows.
  const vSpan = style === "monument" ? height : STOREY;

  // Some things are not a footprint with storeys on top, and never will be.
  // A city gate is a hole in a wall you walk through; a cathedral is a nave
  // with towers. Extruding their outline is not a slightly-wrong version of
  // them, it is a different object.
  if (massing === "gateway") {
    gateway(flat, order, street, height, tint, buffers.wall.monument);
    return;
  }
  if (massing === "cathedral") {
    cathedral(flat, order, street, height, tint, buffers);
    return;
  }
  if (massing === "castle") {
    curtainWall(flat, order, street, height, tint, buffers.wall.monument);
    return;
  }

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
    if (style === "monument") {
      // One unbroken elevation, no shopfront band cutting across it.
      quad(wallBuf, ax, az, bx, bz, street, top, nx, nz, len, tint, 0.62, 1.0, street, vSpan);
    } else {
      quad(groundBuf, ax, az, bx, bz, street, groundTop, nx, nz, len, tint, 0.45, 1.0, street, vSpan);
      if (top > groundTop) {
        quad(wallBuf, ax, az, bx, bz, groundTop, top, nx, nz, len, tint, 0.72, 1.0, street, vSpan);
      }
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

/**
 * A city gate: two piers with an archway between them.
 *
 * Lincoln has nine of these and OSM tags every one — historic=city_gate, or
 * barrier=arch on Newport Arch. Extruded as plain footprints they became solid
 * blocks sitting across the road, which is why the Stone Bow had no arch in it.
 *
 * Built from the oriented box rather than the ring: the passage runs through
 * the SHORT axis (through the wall) and the opening sits in the middle of the
 * long one. The arch head is stepped rather than curved — at these sizes a few
 * chamfer steps read as a vault and cost four quads.
 */
function gateway(flat, order, street, height, tint, buf) {
  const obb = orientedBox(flat, order);
  if (!obb) return;
  const { cx, cz, ux, uz, w, d } = obb;
  const alongLong = w >= d;
  const halfLong = (alongLong ? w : d) / 2;
  const halfShort = (alongLong ? d : w) / 2;
  const lx = alongLong ? ux : -uz;
  const lz = alongLong ? uz : ux;
  const sx = -lz;
  const sz = lx;

  // Piers take the ends; the opening is what is left in the middle.
  const openHalf = Math.min(halfLong * 0.42, 4.2);
  const archTop = street + Math.min(height * 0.62, 5.0);
  const P = (l, s, y) => [cx + lx * l + sx * s, y, cz + lz * l + sz * s];

  const box = (l0, l1, y0, y1) => {
    const corners = [
      [P(l0, -halfShort, y0), P(l1, -halfShort, y0), P(l1, -halfShort, y1), P(l0, -halfShort, y1)],
      [P(l1, halfShort, y0), P(l0, halfShort, y0), P(l0, halfShort, y1), P(l1, halfShort, y1)],
      [P(l1, -halfShort, y0), P(l1, halfShort, y0), P(l1, halfShort, y1), P(l1, -halfShort, y1)],
      [P(l0, halfShort, y0), P(l0, -halfShort, y0), P(l0, -halfShort, y1), P(l0, halfShort, y1)],
    ];
    for (const [p0, p1, p2, p3] of corners) {
      addQuad(buf, p0, p1, p2, p3, Math.abs(l1 - l0) || halfShort * 2, y1 - y0, tint, true);
    }
  };

  // Two piers, full height.
  box(-halfLong, -openHalf, street, street + height);
  box(openHalf, halfLong, street, street + height);
  // The span over the opening.
  box(-openHalf, openHalf, archTop, street + height);
  // Stepped chamfers into the arch head, so the opening is not a bare rectangle.
  const steps = 3;
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 1) / (steps + 1);
    const inset = openHalf * (1 - t * 0.55);
    const y0 = archTop - (archTop - street) * 0.06 * (i + 1);
    box(-inset, inset, y0, archTop - (archTop - street) * 0.06 * i);
  }
  // Roof over the whole thing.
  const roofTop = street + height;
  addQuad(buf,
    P(-halfLong, -halfShort, roofTop), P(halfLong, -halfShort, roofTop),
    P(halfLong, halfShort, roofTop), P(-halfLong, halfShort, roofTop),
    halfLong * 2, halfShort * 2, tint, true);
}

/**
 * Lincoln Cathedral: a nave with a central tower and two west towers.
 *
 * Its outline is one big polygon, so extruding it to its real 83m produced a
 * cliff of windows. The silhouette people actually recognise is the tower
 * group, and that has to be built rather than inferred.
 */
function cathedral(flat, order, street, height, tint, buffers) {
  const obb = orientedBox(flat, order);
  if (!obb) {
    flatRoof(buffers.roof, flat, order, street + height, tint);
    return;
  }
  const buf = buffers.wall.monument;
  const { cx, cz, ux, uz, w, d } = obb;
  const alongLong = w >= d;
  const halfLong = (alongLong ? w : d) / 2;
  const halfShort = (alongLong ? d : w) / 2;
  const lx = alongLong ? ux : -uz;
  const lz = alongLong ? uz : ux;
  const sx = -lz;
  const sz = lx;
  const P = (l, s, y) => [cx + lx * l + sx * s, y, cz + lz * l + sz * s];

  // The nave itself is a fraction of the full height; `height` is the central
  // tower, which is what the 83m refers to.
  const naveTop = street + Math.min(height * 0.29, 26);

  const box = (l0, l1, s0, s1, y0, y1, target) => {
    const faces = [
      [P(l0, s0, y0), P(l1, s0, y0), P(l1, s0, y1), P(l0, s0, y1)],
      [P(l1, s1, y0), P(l0, s1, y0), P(l0, s1, y1), P(l1, s1, y1)],
      [P(l1, s0, y0), P(l1, s1, y0), P(l1, s1, y1), P(l1, s0, y1)],
      [P(l0, s1, y0), P(l0, s0, y0), P(l0, s0, y1), P(l0, s1, y1)],
    ];
    for (const [p0, p1, p2, p3] of faces) addQuad(target, p0, p1, p2, p3, 12, y1 - y0, tint, true);
    addQuad(target, P(l0, s0, y1), P(l1, s0, y1), P(l1, s1, y1), P(l0, s1, y1), 12, 12, tint, true);
  };

  // Nave and transepts: the body of the church, at its real footprint.
  for (let k = 0; k < order.length; k += 1) {
    const i = order[k];
    const j = order[(k + 1) % order.length];
    const ax = flat[i * 2], az = flat[i * 2 + 1];
    const bx = flat[j * 2], bz = flat[j * 2 + 1];
    const ex = bx - ax, ez = bz - az;
    const len = Math.hypot(ex, ez);
    if (len < 0.01) continue;
    quad(buf, ax, az, bx, bz, street, naveTop, ez / len, -ex / len, len, tint, 0.62, 1.0, street, naveTop - street);
  }
  flatRoof(buffers.roof, flat, order, naveTop, tint);

  // Central tower — the one that carried a spire and was, for three centuries,
  // the tallest structure in the world.
  const tw = Math.min(halfShort * 0.72, 9);
  box(-tw, tw, -tw, tw, naveTop - 1, street + height, buf);

  // The two west towers, at the lower-x end so the west front faces west.
  const westSign = lx < 0 ? 1 : -1;
  const wt = Math.min(halfShort * 0.46, 6.5);
  const wl = halfLong - wt - 1;
  const wtTop = street + height * 0.74;
  for (const s of [-1, 1]) {
    const sc = s * Math.min(halfShort - wt - 0.5, wt * 2.1);
    box(westSign * wl - wt, westSign * wl + wt, sc - wt, sc + wt, naveTop - 1, wtTop, buf);
  }
}

/**
 * A castle: curtain wall around the perimeter, with towers at the corners.
 *
 * OSM gives Lincoln Castle as one polygon covering the whole precinct. Extruded
 * it is a featureless block the size of a district, sitting where the bailey
 * should be. What is actually there is a wall you walk around, so that is what
 * gets built — the inside stays open ground.
 */
function curtainWall(flat, order, street, height, tint, buf) {
  const n = order.length;
  const thickness = 1.6;
  const centre = { x: 0, z: 0 };
  for (const i of order) { centre.x += flat[i * 2]; centre.z += flat[i * 2 + 1]; }
  centre.x /= n;
  centre.z /= n;

  for (let k = 0; k < n; k += 1) {
    const i = order[k];
    const j = order[(k + 1) % n];
    const ax = flat[i * 2], az = flat[i * 2 + 1];
    const bx = flat[j * 2], bz = flat[j * 2 + 1];
    const ex = bx - ax, ez = bz - az;
    const len = Math.hypot(ex, ez);
    if (len < 0.5) continue;
    // Inward offset, so the wall sits on the boundary rather than outside it.
    const nx = (ez / len) * thickness;
    const nz = (-ex / len) * thickness;
    const top = street + height;

    for (const s of [0, 1]) {
      const ox = nx * s, oz = nz * s;
      const base = buf.positions.length / 3;
      buf.positions.push(
        ax - ox, street, az - oz, bx - ox, street, bz - oz,
        bx - ox, top, bz - oz, ax - ox, top, az - oz
      );
      const sign = s ? -1 : 1;
      for (let q = 0; q < 4; q += 1) buf.normals.push((nx / thickness) * sign, 0, (nz / thickness) * sign);
      buf.uvs.push(0, 0, len / 8, 0, len / 8, height / 8, 0, height / 8);
      for (let q = 0; q < 4; q += 1) buf.colors.push(tint[0], tint[1], tint[2]);
      if (s) buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      else buf.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }

    // Wall-walk along the top.
    const cap = buf.positions.length / 3;
    buf.positions.push(ax, top, az, bx, top, bz, bx - nx, top, bz - nz, ax - nx, top, az - nz);
    for (let q = 0; q < 4; q += 1) { buf.normals.push(0, 1, 0); buf.colors.push(tint[0], tint[1], tint[2]); }
    buf.uvs.push(0, 0, len / 8, 0, len / 8, 0.3, 0, 0.3);
    buf.indices.push(cap, cap + 1, cap + 2, cap, cap + 2, cap + 3);

    // A tower every so often along the wall, as a real curtain has.
    if (k % 3 === 0 && len > 8) {
      towerAt(buf, ax, az, street, height * 1.5, 3.2, tint);
    }
  }
}

/** A square tower, for castle walls. */
function towerAt(buf, cx, cz, street, height, half, tint) {
  const top = street + height;
  const c = [[-half, -half], [half, -half], [half, half], [-half, half]];
  for (let i = 0; i < 4; i += 1) {
    const [x0, z0] = c[i];
    const [x1, z1] = c[(i + 1) % 4];
    const base = buf.positions.length / 3;
    buf.positions.push(
      cx + x0, street, cz + z0, cx + x1, street, cz + z1,
      cx + x1, top, cz + z1, cx + x0, top, cz + z0
    );
    const nx = (z1 - z0) / (2 * half);
    const nz = -(x1 - x0) / (2 * half);
    for (let q = 0; q < 4; q += 1) { buf.normals.push(nx, 0, nz); buf.colors.push(tint[0], tint[1], tint[2]); }
    buf.uvs.push(0, 0, half * 2 / 8, 0, half * 2 / 8, height / 8, 0, height / 8);
    buf.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const cap = buf.positions.length / 3;
  for (const [x, z] of c) {
    buf.positions.push(cx + x, top, cz + z);
    buf.normals.push(0, 1, 0);
    buf.uvs.push(0, 0);
    buf.colors.push(tint[0], tint[1], tint[2]);
  }
  buf.indices.push(cap, cap + 1, cap + 2, cap, cap + 2, cap + 3);
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

function addQuad(b, p0, p1, p2, p3, uSpan, vSpan, tint, anyOrientation = false) {
  const base = b.positions.length / 3;
  let nrm = faceNormal(p0, p1, p2);
  // Roof faces always point up, so a downward normal there means the winding
  // came out the other way. Walls built by the massing helpers legitimately
  // face any direction, so they keep whatever their winding gives.
  if (!anyOrientation && nrm[1] < 0) { nrm = nrm.map((v) => -v); }
  for (const p of [p0, p1, p2, p3]) {
    b.positions.push(p[0], p[1], p[2]);
    b.normals.push(nrm[0], nrm[1], nrm[2]);
    b.colors.push(tint[0], tint[1], tint[2]);
  }
  b.uvs.push(0, 0, uSpan / 8, 0, uSpan / 8, vSpan / 8, 0, vSpan / 8);
  // Wind so the front face is the one the normal points at.
  if (anyOrientation || faceNormal(p0, p1, p2)[1] >= 0) {
    b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  } else {
    b.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
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
function quad(b, ax, az, bx, bz, y0, y1, nx, nz, len, tint, bottomShade, topShade, base = 0, vSpan = STOREY) {
  const vertexBase = b.positions.length / 3;
  b.positions.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az);
  for (let i = 0; i < 4; i += 1) b.normals.push(nx, 0, nz);

  // Tile by real metres so a wide building gets more windows, not stretched
  // ones, and so every building on a street lines up floor for floor.
  // Texture v runs from the building's own base, not from sea level, or a shop
  // 60m up the hill starts its brickwork nineteen storeys into the pattern.
  const u = len / 6;
  const v0 = (y0 - base) / vSpan;
  const v1 = (y1 - base) / vSpan;
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

export const STYLES = ["brick", "limestone", "render", "modern", "monument"];

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
