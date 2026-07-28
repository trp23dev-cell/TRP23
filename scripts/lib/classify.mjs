// ============================================================================
// CLASSIFY — decide what each individual building should look like.
//
// Measured tag coverage across the 2004 buildings in the Lincoln city-centre
// bbox, which is what this is designed around:
//
//   building=*            100%    house 471, retail 70, church 7, ...
//   name                   24%
//   amenity / shop         17%    what the ground floor actually is
//   building:levels         9%    real storey counts
//   height                  6%    real heights, in metres
//   listed_status           4%    Grade I 25, II* 8, II 53
//   start_date              4%    C13 through C19
//   historic                2%    city_gate, citywalls, building
//   building:material     0.5%    stone
//   building:colour       0.4%
//
// So explicit material is a dead end, but period, listing and use are not.
// Everything below leans on those first and only falls back to inference where
// there is genuinely nothing to go on.
//
// The single biggest realism win here is the ground floor: 650 of these are
// houses, flats and residential, and giving all of them glazed shopfronts —
// which is what a uniform treatment does — makes the whole city read as one
// endless parade of shops.
// ============================================================================

const STOREY = 3.2;

// Uphill Lincoln — Bailgate, Castle Hill, Minster Yard — is limestone, the same
// stone the Cathedral is built from. Downhill is overwhelmingly Victorian
// brick. This is a real geographic split, not a stylistic guess.
const LIMESTONE_ELEVATION = 45;

/** Roman numeral century in start_date, e.g. "C18" or "1850". */
function centuryOf(startDate) {
  if (!startDate) return null;
  const roman = /^C(\d{1,2})/.exec(startDate);
  if (roman) return Number(roman[1]);
  const year = /(\d{4})/.exec(startDate);
  if (year) return Math.floor(Number(year[1]) / 100) + 1;
  return null;
}

/** Deterministic 0..1 from the OSM id, so a building never changes on reload. */
function hashUnit(id, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const MODERN_TYPES = new Set([
  "industrial", "warehouse", "retail", "supermarket", "commercial",
  "office", "hospital", "university", "college", "school", "hangar",
]);
const RESIDENTIAL_TYPES = new Set([
  "house", "residential", "apartments", "terrace", "detached",
  "semidetached_house", "bungalow", "dormitory",
]);
const OUTBUILDING_TYPES = new Set(["garage", "garages", "shed", "roof", "carport", "hut"]);

/**
 * What the ground floor is. This is what you walk past, so it matters most.
 *
 *  shopfront   glazing, fascia, stall riser — a place that trades
 *  residential brick with a front door and a window
 *  blank       industrial and outbuildings: no openings worth modelling
 */
function groundFloorOf(tags, type) {
  if (tags.shop || tags.amenity || tags.tourism || tags.office) return "shopfront";
  if (type === "retail" || type === "commercial" || type === "supermarket") return "shopfront";
  if (RESIDENTIAL_TYPES.has(type)) return "residential";
  if (OUTBUILDING_TYPES.has(type) || type === "industrial" || type === "warehouse") return "blank";
  // building=yes is the great unknown: on a high street it is a shop, off it a
  // house. Use whether anything else on the record suggests trade.
  if (tags.name && type === "yes") return "shopfront";
  return "residential";
}

/**
 * Buildings that are not "a building with storeys" at all.
 *
 * A city gate is a hole in a wall you walk through, and a cathedral is a nave
 * with towers. Extruding their footprint into a box with rows of windows is not
 * a slightly-wrong version of them, it is a different object entirely — which
 * is exactly what Stonebow and the Cathedral looked like.
 */
function massingOf(tags, name) {
  if (/^Lincoln Cathedral$/i.test(name)) return "cathedral";
  // A castle is a curtain wall around a bailey, not a solid block. Lincoln's
  // is tagged historic=castle with the whole precinct as one polygon, so
  // extruded it becomes a featureless slab the size of a district.
  if (tags.historic === "castle" || tags.castle_type) return "castle";
  // OSM tags Lincoln's medieval gates explicitly, and there are nine of them:
  // Stone Bow, Newport Arch, Pottergate, Exchequergate, West Gate, South Gate,
  // Priory Gate and two unnamed stretches of the city wall.
  if (tags.historic === "city_gate" || tags.barrier === "arch") return "gateway";
  return null;
}

function styleOf(tags, type, century, elevation) {
  const material = (tags["building:material"] || "").toLowerCase();
  if (/stone|limestone|sandstone|granite/.test(material)) return "limestone";
  if (/brick/.test(material)) return "brick";
  if (/concrete|metal|glass|panel/.test(material)) return "modern";
  if (/plaster|render|stucco/.test(material)) return "render";

  // Ecclesiastical and monumental fabric gets its own treatment: tall openings
  // running the full height, not floor after floor of domestic windows.
  if (type === "cathedral" || type === "church" || type === "chapel") return "monument";
  if (tags.historic === "city_gate" || tags.barrier === "arch") return "monument";
  if (tags.amenity === "place_of_worship") return "monument";

  // Listed and historic fabric in Lincoln is stone almost without exception.
  const listed = tags.listed_status || "";
  if (listed.includes("Grade I") || listed.includes("II*")) return "limestone";
  if (tags.historic || type === "church" || type === "cathedral" || type === "chapel") return "limestone";

  // Period. Anything before the eighteenth century here is stone; the
  // nineteenth is the brick city.
  if (century !== null) {
    if (century <= 17) return "limestone";
    if (century === 18) return "limestone";
    if (century === 19) return "brick";
    if (century >= 20) return "modern";
  }

  if (listed) return "limestone"; // Grade II, no date given
  if (MODERN_TYPES.has(type) && type !== "retail") return "modern";
  if (elevation >= LIMESTONE_ELEVATION) return "limestone";

  // Downhill and undated: brick, with a minority of painted render, which is
  // what the High Street actually looks like.
  return null; // caller mixes brick/render deterministically
}

function roofShapeOf(tags, type, footprintArea) {
  const tagged = (tags["roof:shape"] || "").toLowerCase();
  if (tagged) {
    if (/gable|round|saltbox/.test(tagged)) return "gabled";
    if (/hip|pyramid|mansard|half-hip/.test(tagged)) return "gabled";
    if (/flat|skillion|shed/.test(tagged)) return "flat";
    if (/dome|onion|spherical/.test(tagged)) return "flat";
  }
  // Big sheds and post-war boxes are flat; everything domestic is pitched, and
  // Lincoln has almost no flat domestic roofs at all.
  if (footprintArea > 1200) return "flat";
  if (MODERN_TYPES.has(type) && type !== "retail") return "flat";
  if (OUTBUILDING_TYPES.has(type)) return "flat";
  return "gabled";
}

/** Real heights where they are given, informed guesses where they are not. */
function heightOf(tags, type, id, century) {
  const explicit = Number.parseFloat(tags.height);
  if (Number.isFinite(explicit) && explicit > 1) return explicit;

  const levels = Number.parseFloat(tags["building:levels"]);
  if (Number.isFinite(levels) && levels > 0) {
    // Roof space on top of the habitable storeys, unless it is flat-roofed.
    const roofLevels = Number.parseFloat(tags["roof:levels"]);
    const extra = Number.isFinite(roofLevels) ? roofLevels * 2.2 : 1.2;
    return levels * STOREY + extra;
  }

  const jitter = 0.9 + hashUnit(id, 77) * 0.22;
  const byType = {
    cathedral: 24, church: 12, chapel: 9, hospital: 14, university: 12,
    apartments: 13, hotel: 13, office: 12, commercial: 10, retail: 7,
    industrial: 9, warehouse: 9, supermarket: 7,
    house: 7, residential: 8, terrace: 7.5, detached: 7,
    garage: 2.6, garages: 2.6, shed: 2.4, roof: 2.4, carport: 2.4, hut: 2.4,
    pylon: 12,
  };
  let base = byType[type];
  if (base === undefined) {
    // building=yes in a historic core: two or three storeys, taller if old.
    base = century !== null && century <= 18 ? 9 : 8;
  }
  return base * jitter;
}

/** Colour tint, multiplied over the facade texture. */
function tintOf(tags, style, id) {
  const explicit = tags["building:colour"] || tags.colour;
  if (explicit && /^#[0-9a-f]{6}$/i.test(explicit)) {
    return [
      parseInt(explicit.slice(1, 3), 16) / 255,
      parseInt(explicit.slice(3, 5), 16) / 255,
      parseInt(explicit.slice(5, 7), 16) / 255,
    ];
  }

  // Otherwise vary within the style's own range, so a terrace reads as separate
  // properties without any of them leaving the palette.
  const v = hashUnit(id, 11);
  const w = hashUnit(id, 29);
  if (style === "limestone") {
    // Honey through to weathered grey.
    return [0.88 + v * 0.24, 0.86 + v * 0.20, 0.78 + w * 0.18];
  }
  if (style === "brick") {
    // Red through to the darker Lincolnshire browns.
    return [0.86 + v * 0.34, 0.72 + v * 0.16, 0.66 + w * 0.14];
  }
  if (style === "render") {
    return [0.84 + v * 0.32, 0.84 + w * 0.30, 0.80 + v * 0.26];
  }
  if (style === "monument") {
    // Lincoln limestone, weathered. Narrow range: these are one material.
    return [0.94 + v * 0.12, 0.92 + v * 0.10, 0.84 + w * 0.10];
  }
  return [0.86 + v * 0.20, 0.87 + v * 0.20, 0.90 + w * 0.18];
}

/**
 * Named buildings whose real dimensions are a matter of public record and whose
 * silhouette people actually recognise. The generic rules cannot know that
 * Lincoln Cathedral's central tower is 83m — for three centuries, with its
 * spire, it was the tallest building in the world.
 */
const LANDMARKS = [
  [/^Lincoln Cathedral$/i, { height: 83, style: "limestone", roof: "flat", tint: [1.02, 1.0, 0.92] }],
  [/^Lincoln Castle$/i, { height: 18, style: "limestone", roof: "flat" }],
  [/Westgate Water Tower/i, { height: 40, style: "limestone", roof: "flat" }],
  [/^Stone ?Bow$/i, { height: 13, style: "monument", roof: "flat" }],
  [/^Newport Arch$/i, { height: 8, style: "monument", roof: "flat" }],
  [/Guildhall$/i, { height: 16, style: "limestone", roof: "gabled" }],
  [/St Mary'?s Guildhall/i, { height: 11, style: "limestone", roof: "gabled" }],
  [/^Lincoln Prison|^HM Prison Lincoln/i, { height: 14, style: "limestone", roof: "gabled" }],
];

/**
 * @returns {{style, ground, roof, height, tint, landmark}}
 */
export function classifyBuilding(id, tags, elevation, footprintArea) {
  const type = (tags.building || "yes").toLowerCase();
  const century = centuryOf(tags.start_date);
  const name = tags.name || "";
  const massing = massingOf(tags, name);

  let style = styleOf(tags, type, century, elevation);
  if (style === null) {
    // Deterministic brick/render mix downhill.
    style = hashUnit(id, 53) < 0.22 ? "render" : "brick";
  }

  let height = heightOf(tags, type, id, century);
  let roof = roofShapeOf(tags, type, footprintArea);
  let landmark = false;

  for (const [pattern, spec] of LANDMARKS) {
    if (!pattern.test(name)) continue;
    landmark = true;
    if (spec.height) height = spec.height;
    if (spec.style) style = spec.style;
    if (spec.roof) roof = spec.roof;
    break;
  }

  if (massing === "gateway") {
    // A gate is one storey of wall over an archway, not a tower block.
    style = "monument";
    roof = "flat";
    if (!Number.isFinite(Number.parseFloat(tags.height))) height = Math.max(7, Math.min(height, 12));
  }
  if (massing === "cathedral") {
    style = "monument";
    roof = "gabled";
  }
  if (massing === "castle") {
    style = "monument";
    roof = "flat";
    height = 12;
  }

  const tint = tintOf(tags, style, id);
  const landmarkSpec = landmark && LANDMARKS.find(([p]) => p.test(name))?.[1];
  return {
    style,
    ground: massing ? "blank" : groundFloorOf(tags, type),
    roof,
    height,
    massing,
    tint: landmarkSpec?.tint || tint,
    landmark,
  };
}
