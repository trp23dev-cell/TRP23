// ============================================================================
// OSGB — WGS84 lat/lon to British National Grid (EPSG:27700) and back.
//
// The UK's open elevation data is published on the National Grid, not in
// lat/lon, so anything that wants LIDAR has to go through here first.
//
// Two steps, and both are needed: a Helmert transform from the WGS84 datum to
// OSGB36, then a Transverse Mercator projection onto the grid. Skipping the
// datum shift is the classic mistake — it lands you about 120m out, which on
// Steep Hill is the difference between the top and the bottom.
//
// Helmert is good to roughly 3m. Ordnance Survey's OSTN15 does centimetres, but
// it is a 25MB correction grid, and 3m of horizontal error on terrain that
// changes by a metre every seven puts us well inside half a metre of height.
// ============================================================================

const deg = Math.PI / 180;

// Airy 1830 — the ellipsoid the National Grid is defined on.
const AIRY = { a: 6377563.396, b: 6356256.909 };
// WGS84.
const WGS84 = { a: 6378137.0, b: 6356752.3142 };

// WGS84 -> OSGB36 Helmert parameters.
const HELMERT = {
  tx: -446.448, ty: 125.157, tz: -542.060,      // metres
  rx: -0.1502, ry: -0.2470, rz: -0.8421,        // arc-seconds
  s: 20.4894,                                   // ppm
};

// National Grid true origin and scale.
const GRID = { F0: 0.9996012717, lat0: 49 * deg, lon0: -2 * deg, E0: 400000, N0: -100000 };

function toCartesian(lat, lon, h, ellipsoid) {
  const { a, b } = ellipsoid;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const eSq = (a * a - b * b) / (a * a);
  const nu = a / Math.sqrt(1 - eSq * sinLat * sinLat);
  return {
    x: (nu + h) * cosLat * Math.cos(lon),
    y: (nu + h) * cosLat * Math.sin(lon),
    z: ((1 - eSq) * nu + h) * sinLat,
  };
}

function toGeodetic({ x, y, z }, ellipsoid) {
  const { a, b } = ellipsoid;
  const eSq = (a * a - b * b) / (a * a);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - eSq));
  let nu;
  // Converges in a handful of rounds at these latitudes.
  for (let i = 0; i < 8; i += 1) {
    const sinLat = Math.sin(lat);
    nu = a / Math.sqrt(1 - eSq * sinLat * sinLat);
    lat = Math.atan2(z + eSq * nu * sinLat, p);
  }
  return { lat, lon: Math.atan2(y, x), h: p / Math.cos(lat) - nu };
}

function helmert(p, { tx, ty, tz, rx, ry, rz, s }) {
  const as = Math.PI / 180 / 3600;
  const [Rx, Ry, Rz] = [rx * as, ry * as, rz * as];
  const S = 1 + s / 1e6;
  return {
    x: tx + p.x * S - p.y * Rz + p.z * Ry,
    y: ty + p.x * Rz + p.y * S - p.z * Rx,
    z: tz - p.x * Ry + p.y * Rx + p.z * S,
  };
}

/** WGS84 lat/lon (degrees) -> National Grid easting/northing (metres). */
export function toNationalGrid(latDeg, lonDeg) {
  const shifted = toGeodetic(
    helmert(toCartesian(latDeg * deg, lonDeg * deg, 0, WGS84), HELMERT),
    AIRY
  );
  const { lat, lon } = shifted;
  const { a, b } = AIRY;
  const { F0, lat0, lon0, E0, N0 } = GRID;

  const eSq = (a * a - b * b) / (a * a);
  const n = (a - b) / (a + b);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const tanLat = Math.tan(lat);

  const nu = (a * F0) / Math.sqrt(1 - eSq * sinLat * sinLat);
  const rho = (a * F0 * (1 - eSq)) / (1 - eSq * sinLat * sinLat) ** 1.5;
  const eta2 = nu / rho - 1;

  const dLat = lat - lat0;
  const sLat = lat + lat0;
  const M =
    b * F0 * (
      (1 + n + 1.25 * n * n + 1.25 * n * n * n) * dLat -
      (3 * n + 3 * n * n + 2.625 * n * n * n) * Math.sin(dLat) * Math.cos(sLat) +
      (1.875 * n * n + 1.875 * n * n * n) * Math.sin(2 * dLat) * Math.cos(2 * sLat) -
      (35 / 24) * n * n * n * Math.sin(3 * dLat) * Math.cos(3 * sLat)
    );

  const I = M + N0;
  const II = (nu / 2) * sinLat * cosLat;
  const III = (nu / 24) * sinLat * cosLat ** 3 * (5 - tanLat ** 2 + 9 * eta2);
  const IIIA = (nu / 720) * sinLat * cosLat ** 5 * (61 - 58 * tanLat ** 2 + tanLat ** 4);
  const IV = nu * cosLat;
  const V = (nu / 6) * cosLat ** 3 * (nu / rho - tanLat ** 2);
  const VI = (nu / 120) * cosLat ** 5 * (5 - 18 * tanLat ** 2 + tanLat ** 4 + 14 * eta2 - 58 * tanLat ** 2 * eta2);

  const dLon = lon - lon0;
  return {
    e: E0 + IV * dLon + V * dLon ** 3 + VI * dLon ** 5,
    n: I + II * dLon ** 2 + III * dLon ** 4 + IIIA * dLon ** 6,
  };
}
