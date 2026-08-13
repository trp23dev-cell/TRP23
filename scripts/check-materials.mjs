// ============================================================================
// CHECK: MATERIALS — the colour contract holds.
//
// WORLD-V01 fixed a bug that nothing could have caught, because nothing was
// looking. The material colour was defined in TWO places — CityTextures.Base
// and BuildingMeshBuilder.WallColour — with the same constants, and the shader
// multiplied them together. Brick rendered at 0.006 linear against a road at
// 0.027: the wall was 4.6x darker than the tarmac in front of it, and every
// window row and brick course drawn into the texture sat below the threshold at
// which anyone could see it.
//
// So this checks the three things that would have caught it, and would catch it
// again:
//
//   1. ONE TABLE. Only TrapMaterials.cs may define what a material's colour is.
//   2. PLAUSIBLE ALBEDO. Every family lands in a believable linear range, and
//      brick is brighter than asphalt — the specific regression, stated as the
//      specific thing it is.
//   3. THE TINT MEANS MATCH THE DATA. The per-style means used to normalise the
//      vertex tint are measured from the shipped export, so if the tiler's
//      palette moves, this fails rather than the city quietly shifting colour.
//
// Deliberately NOT a test that each constant equals a literal. Those are
// tunable and a test that forbids tuning is a test that gets deleted. What is
// contractual is the SHAPE: one source, sane range, correct ordering, and
// agreement with the data.
// ============================================================================

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORLD = path.join(ROOT, "Unity/TRP23/Assets/World/Scripts");

let bad = 0;
const ok = (name, pass, note = "") => {
  process.stdout.write(`  ${pass ? "ok " : "FAIL"}  ${name}${note ? ` — ${note}` : ""}\n`);
  if (!pass) bad += 1;
};

/** sRGB to linear, the conversion the GPU does on every texture sample. */
const linear = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

const read = (f) => readFileSync(path.join(WORLD, f), "utf8");

// ---------------------------------------------------------------- 1. one table

const materials = read("TrapMaterials.cs");

// A style colour looks like: case "limestone": return new Color(...)
const STYLE_COLOUR = /case\s+"(brick|limestone|render|modern|monument)"\s*:\s*return\s+new\s+Color\(/g;

for (const file of ["BuildingMeshBuilder.cs", "CityTextures.cs", "WorldStreamer.cs", "SurfaceMeshBuilder.cs"]) {
  const src = read(file);
  const hits = [...src.matchAll(STYLE_COLOUR)].map((m) => m[1]);
  ok(
    `${file} does not decide what a material is made of`,
    hits.length === 0,
    hits.length ? `defines ${hits.join(", ")} — that belongs in TrapMaterials only` : ""
  );
}

ok("TrapMaterials is the one that does", [...materials.matchAll(STYLE_COLOUR)].length >= 5);

// The vertex colour must carry variation, not colour. WallColour returning
// anything but a Variation call is how this broke the first time.
const builder = read("BuildingMeshBuilder.cs");
ok(
  "the vertex colour is a variation, not a material colour",
  /static\s+Color\s+WallColour\(BuildingData\s+b\)\s*=>\s*TrapMaterials\.Variation\(/.test(builder),
  "WallColour must delegate to TrapMaterials.Variation"
);

// _BaseColor is not allowed to become a third source of colour. White, or a
// value handed in from the contract -- never a literal written at the call
// site, which is exactly how the second source appeared last time.
//
// Water is the one material with a _BaseColor that is not white: it has no
// texture on purpose, because what reads as water is the sky reflected in it
// rather than any colour of its own. That colour still comes from
// TrapMaterials.Surface, so the contract holds -- it arrives as a variable.
const streamer = read("WorldStreamer.cs");
const baseColours = [...streamer.matchAll(/SetColor\("_BaseColor",\s*([^)]+)\)/g)].map((m) => m[1].trim());
const literal = baseColours.filter((c) => c.includes("new Color("));
ok(
  "_BaseColor is never a colour written at the call site",
  baseColours.length > 0 && literal.length === 0,
  literal.join(", ")
);

// ------------------------------------------------------- 2. plausible albedo

function colours(section) {
  // Pull `case "x": return new Color(r, g, b);` out of one method.
  const start = materials.indexOf(section);
  if (start < 0) return {};
  const end = materials.indexOf("\n        }", start);
  const body = materials.slice(start, end);
  const out = {};
  for (const m of body.matchAll(/case\s+"([a-z]+)"\s*:\s*return\s+new\s+Color\(([\d.f]+),\s*([\d.f]+),\s*([\d.f]+)\)/g)) {
    out[m[1]] = [1, 2, 3].map((i) => Number.parseFloat(m[i + 1]));
  }
  return out;
}

const base = colours("public static Color Base(string style)");
const surface = colours("public static Color Surface(string kind)");

/** Luminance in LINEAR space — what actually reaches the framebuffer. */
const lum = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

// Real-world reflectances. Wide bounds on purpose: this is a sanity rail, not
// a colour grade. Nothing man-made is darker than charcoal or brighter than
// fresh snow, and everything here should sit well inside that.
const RANGE = {
  brick: [0.05, 0.35], limestone: [0.25, 0.75], render: [0.25, 0.80],
  modern: [0.10, 0.60], monument: [0.25, 0.75],
  asphalt: [0.03, 0.15], paving: [0.15, 0.55], cobble: [0.05, 0.35],
  concrete: [0.15, 0.55], grass: [0.03, 0.25], water: [0.005, 0.10],
};

for (const [name, [lo, hi]] of Object.entries(RANGE)) {
  const c = base[name] || surface[name];
  if (!c) { ok(`${name} has a colour`, false, "not found in TrapMaterials"); continue; }
  const L = lum(c);
  ok(`${name} reflects a believable amount of light`, L >= lo && L <= hi,
     `${L.toFixed(4)} linear, expected ${lo}–${hi}`);
}

// THE REGRESSION, NAMED. This is the bug, as a single assertion.
const brickL = lum(base.brick);
const asphaltL = lum(surface.asphalt);
ok("brick is brighter than the road it stands on", brickL > asphaltL,
   `brick ${brickL.toFixed(4)} vs asphalt ${asphaltL.toFixed(4)} linear`);

// And the walls have to separate from each other, or the classification the
// tiler does is invisible however bright it is.
const sep = (a, b) => Math.abs(lum(base[a]) - lum(base[b]));
ok("brick and limestone are told apart by value", sep("brick", "limestone") > 0.08,
   `${sep("brick", "limestone").toFixed(3)} apart`);
ok("limestone and modern are told apart by value", sep("limestone", "modern") > 0.05,
   `${sep("limestone", "modern").toFixed(3)} apart`);

// ----------------------------------------------- 3. tint means match the data

const gz = path.join(ROOT, "server/storage/map-export.json.gz");
let exportData = null;
try { exportData = JSON.parse(gunzipSync(readFileSync(gz)).toString()); } catch { /* absent */ }

if (!exportData) {
  ok("map export is present to measure tints against", false, `${gz} not found`);
} else {
  const acc = {};
  for (const t of exportData.tiles) {
    for (const b of t.payload.b || []) {
      if (!b.c) continue;
      const s = b.st || "brick";
      acc[s] = acc[s] || [0, 0, 0, 0];
      acc[s][0] += b.c[0]; acc[s][1] += b.c[1]; acc[s][2] += b.c[2]; acc[s][3] += 1;
    }
  }

  const declared = {};
  const meanBlock = materials.slice(materials.indexOf("public static Vector3 MeanTint"));
  for (const m of meanBlock.matchAll(/case\s+"([a-z]+)"\s*:\s*return\s+new\s+Vector3\(([\d.]+)f,\s*([\d.]+)f,\s*([\d.]+)f\)/g)) {
    declared[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }

  // 0.01 is about 2.5 levels out of 255 — tight enough to catch a real palette
  // change in the tiler, loose enough to survive a re-tile that adds buildings.
  const TOL = 0.01;
  for (const [style, a] of Object.entries(acc)) {
    const measured = [a[0] / a[3] / 255, a[1] / a[3] / 255, a[2] / a[3] / 255];
    const d = declared[style];
    if (!d) { ok(`${style} mean tint is declared`, false, "missing from TrapMaterials.MeanTint"); continue; }
    const drift = Math.max(...measured.map((v, i) => Math.abs(v - d[i])));
    ok(`${style} mean tint matches the shipped map (${a[3]} buildings)`, drift <= TOL,
       `off by ${drift.toFixed(4)}, measured ${measured.map((v) => v.toFixed(4)).join(", ")}`);
  }
}

// ------------------------------------------------------ 4. restrained baseline

const post = readFileSync(path.join(WORLD, "TrapPostProcess.cs"), "utf8");
ok("tonemapping is Neutral", /TonemappingMode\.Neutral/.test(post));
ok("the override state is set", /mode\.overrideState\s*=\s*true/.test(post),
   "a VolumeParameter without overrideState does nothing, silently");

// The baseline is meant to be one effect. Adding a second is a decision, and a
// decision should have to change a test.
const added = [...post.matchAll(/profile\.Add<(\w+)>/g)].map((m) => m[1]);
ok("the baseline is tonemapping and nothing else", added.length === 1 && added[0] === "Tonemapping",
   added.join(", "));

// Read from the Add<> calls, not the file text -- the file DISCUSSES bloom and
// grading in its comment, and a check that cannot tell code from prose is a
// check that punishes explaining yourself.
const GRADE = ["Bloom", "Vignette", "ChromaticAberration", "FilmGrain", "ColorAdjustments", "ColorCurves", "SplitToning"];
ok("the baseline is not graded", !added.some((a) => GRADE.includes(a)),
   "V01 must stay truthful — grading is a later, deliberate package");

process.stdout.write(bad === 0
  ? "\nall material checks passed\n"
  : `\n${bad} material check(s) failed\n`);
process.exit(bad === 0 ? 0 : 1);
