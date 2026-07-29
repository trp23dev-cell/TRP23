// ============================================================================
// GEO — lat/lon to game metres.
//
// The block is built on the real geography of Lincoln, UK (OpenStreetMap data,
// ODbL). Everything downstream of this file works in plain metres, so the rest
// of the game never has to know it is standing on a real city.
// ============================================================================

// Origin is NatWest on Mint Street: the bank is the origin of the economy, and
// putting (0,0) in the middle of the playable core keeps coordinates small as
// the world widens outward.
export const ORIGIN = { lat: 53.22940, lon: -0.54079 };

const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180);

/** Tile edge in metres. Tiles are binned in projected space, not lat/lon. */
export const TILE_SIZE = 250;

/**
 * Local ENU projection. Accurate to well under a metre across a city, which is
 * far below the resolution anyone can perceive while walking around.
 *
 * z is negated so that north is -z. That is not cosmetic: the free-roam camera
 * convention is that yaw 0 looks down -z, so this keeps the spawn heading and
 * the north-up minimap correct without touching either.
 */
export function project(lat, lon) {
  return {
    x: (lon - ORIGIN.lon) * M_PER_DEG_LON,
    z: -(lat - ORIGIN.lat) * M_PER_DEG_LAT,
  };
}

/** Inverse of project(), for debugging and for anything that has to talk to a map. */
export function unproject(x, z) {
  return {
    lat: ORIGIN.lat - z / M_PER_DEG_LAT,
    lon: ORIGIN.lon + x / M_PER_DEG_LON,
  };
}

/** Which tile a projected point falls in. */
export function tileOf(x, z) {
  return { tx: Math.floor(x / TILE_SIZE), tz: Math.floor(z / TILE_SIZE) };
}

export function tileKey(tx, tz) {
  return `${tx},${tz}`;
}

/** Licence condition of the underlying data. Must be shown wherever the map is. */
export const MAP_ATTRIBUTION = "© OpenStreetMap contributors";
