// ============================================================================
// TERRAIN SOURCE — real Lincoln ground, from UK open LIDAR.
//
// Lincoln is built on a limestone escarpment: the High Street sits at about 6m
// and the Cathedral at about 65m, with Steep Hill climbing most of that in a
// few hundred metres. Flat, none of it reads as Lincoln, so the ground has to
// come from real survey data.
//
// Source: Environment Agency LIDAR Composite DTM, 1m resolution, via their WCS.
// Open Government Licence v3 — free to use commercially with attribution.
//
// A DTM is bare earth: buildings and trees are already stripped out, which is
// exactly what we want to stand a city on.
// ============================================================================

import { readFloatTiff } from "./geotiff.mjs";
import { toNationalGrid } from "./osgb.mjs";

const WCS = "https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs";
const COVERAGE = "13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m";

// The SURFACE model: the same survey, but the first laser return rather than
// the bare earth, so it includes whatever is standing on the ground.
//
// Subtract one from the other and you have the measured height of every
// building in Lincoln, from the air, to the metre. Only 6% of the city's OSM
// entries carry a height tag and 9% a storey count; this covers all of it, and
// it is a measurement rather than an assumption about what a shop looks like.
// Same licence as the DTM (Open Government Licence v3).
const SURFACE_WCS = "https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-first-return-dsm-1m/wcs";
const SURFACE_COVERAGE = "df4e3ec3-315e-48aa-aaaf-b5ae74d7b2bb__Lidar_Composite_Elevation_FZ_DSM_1m";

const USER_AGENT = "TRP23-map-tiler/1.0 (+https://github.com/trp23dev-cell)";

// LIDAR marks gaps with a large negative sentinel rather than NaN.
const NO_DATA = -100;

/**
 * Fetch the bare-earth model covering a lat/lon bbox.
 *
 * The whole city centre is one request — about 12MB and eight seconds for
 * 1km x 1.6km — because stitching many small windows costs more in round trips
 * than the bytes save.
 */
export async function fetchTerrain(bbox, opts = {}) {
  return fetchCoverage(WCS, COVERAGE, bbox, opts);
}

/**
 * Fetch the surface model over the same bbox. Pair it with fetchTerrain and the
 * difference is building height.
 */
export async function fetchSurface(bbox, opts = {}) {
  return fetchCoverage(SURFACE_WCS, SURFACE_COVERAGE, bbox, opts);
}

async function fetchCoverage(wcs, coverage, bbox, { fetchImpl = fetch } = {}) {
  // The grid is not aligned to lat/lon, so all four corners are projected and
  // the window taken from their extremes. Using two corners leaves a wedge of
  // the map with no ground under it.
  const corners = [
    toNationalGrid(bbox.s, bbox.w), toNationalGrid(bbox.s, bbox.e),
    toNationalGrid(bbox.n, bbox.w), toNationalGrid(bbox.n, bbox.e),
  ];
  const pad = 40; // slack so edge tiles can still interpolate
  const e0 = Math.floor(Math.min(...corners.map((c) => c.e))) - pad;
  const e1 = Math.ceil(Math.max(...corners.map((c) => c.e))) + pad;
  const n0 = Math.floor(Math.min(...corners.map((c) => c.n))) - pad;
  const n1 = Math.ceil(Math.max(...corners.map((c) => c.n))) + pad;

  const url = `${wcs}?service=WCS&version=2.0.1&request=GetCoverage` +
    `&coverageId=${coverage}&format=image/tiff` +
    `&subset=E(${e0},${e1})&subset=N(${n0},${n1})`;

  const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } });
  if (!res.ok) throw new Error(`LIDAR WCS returned ${res.status} ${res.statusText}`);
  const raster = readFloatTiff(Buffer.from(await res.arrayBuffer()));

  return createSampler(raster, e0, n0, e1, n1);
}

export function createSampler(raster, e0, n0, e1, n1) {
  const { width, height, data } = raster;
  // The raster covers [e0,e1] x [n0,n1] with row 0 at the NORTH edge, so
  // northing runs backwards through the rows.
  const scaleE = width / (e1 - e0);
  const scaleN = height / (n1 - n0);

  let min = Infinity;
  let max = -Infinity;
  for (const v of data) {
    if (v <= NO_DATA || !Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  function atGrid(e, n) {
    // Bilinear, so a 1m raster still gives smooth ground underfoot.
    const fx = (e - e0) * scaleE - 0.5;
    const fy = (n1 - n) * scaleN - 0.5;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;

    const px = (x, y) => {
      const cx = Math.max(0, Math.min(width - 1, x));
      const cy = Math.max(0, Math.min(height - 1, y));
      const v = data[cy * width + cx];
      // A hole in the survey falls back to the lowest real ground rather than
      // punching a bottomless pit through the map.
      return v <= NO_DATA || !Number.isFinite(v) ? min : v;
    };

    const a = px(x0, y0), b = px(x0 + 1, y0);
    const c = px(x0, y0 + 1), d = px(x0 + 1, y0 + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  return {
    min,
    max,
    width,
    height,
    /** Elevation in metres at a WGS84 lat/lon. */
    at(lat, lon) {
      const g = toNationalGrid(lat, lon);
      return atGrid(g.e, g.n);
    },
    atGrid,
  };
}

export const TERRAIN_ATTRIBUTION =
  "Contains public sector information licensed under the Open Government Licence v3.0 " +
  "— Environment Agency LIDAR Composite DTM";
