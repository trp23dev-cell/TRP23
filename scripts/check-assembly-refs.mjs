// ============================================================================
// CHECK: ASSEMBLY REFERENCES — every package type we use is actually referenced.
//
// WHY THIS EXISTS
//
// WORLD-V01 shipped TrapPostProcess.cs using Volume, VolumeProfile and
// Tonemapping. check:csharp passed. Real Unity 6.3 refused to compile it and
// dropped the project into Safe Mode, because TRP23.World.asmdef referenced
// neither render-pipeline assembly.
//
// check:csharp could not have caught it, and no amount of care would have made
// it. It compiles Core + World + hand-written stubs into ONE csproj. Its job is
// to prove the assembly BOUNDARY -- that UI cannot see World -- and it does
// that well. But a stub is available to every file in the csproj regardless of
// which Unity assembly really provides the type, so "does this type exist"
// always answered yes. The gap was not a missing stub. It was that stubs model
// the C# language and say nothing about Unity's assembly graph.
//
// So this checks the graph, and it does it from EVIDENCE rather than memory:
// it indexes the real .asmdef files and the real type declarations in
// Library/PackageCache, then asks whether each of our assemblies references the
// assembly that actually declares each package type it uses.
//
// That matters more than it sounds. The failing case was ambiguous by
// namespace: `using UnityEngine.Rendering;` is mostly built-in engine code --
// AmbientMode, GraphicsSettings, IndexFormat -- but Volume and VolumeProfile
// live in com.unity.render-pipelines.core. A namespace-level rule would have
// waved it through. Only a type-level index gets it right, and only a type-level
// index built from what is on disk stays right when the packages move.
// ============================================================================

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UNITY = path.join(ROOT, "Unity/TRP23");
const ASSETS = path.join(UNITY, "Assets");
const CACHES = [path.join(UNITY, "Library/PackageCache"), path.join(UNITY, "Packages")];

let bad = 0;
const ok = (name, pass, note = "") => {
  process.stdout.write(`  ${pass ? "ok " : "FAIL"}  ${name}${note ? ` — ${note}` : ""}\n`);
  if (!pass) bad += 1;
};

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * Strip comments and string literals.
 *
 * Without this, a file that merely DISCUSSES Volume in its header comment gets
 * reported as using it — and this codebase comments heavily on purpose, so a
 * check that punishes explaining yourself would not survive a week.
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

const DECL = /\b(?:public|internal)\s+(?:(?:sealed|abstract|static|partial|readonly|unsafe)\s+)*(?:class|struct|interface|enum)\s+([A-Z]\w*)/g;
const NS = /\bnamespace\s+([\w.]+)/g;

/**
 * Fully-qualified public types in a file: "UnityEngine.Rendering.Volume".
 *
 * QUALIFIED, not bare. A first pass matched bare identifiers and produced 27
 * failures, every one of them a coincidence — Move, Start, Add, Row, Range,
 * Base, Transform all exist as some nested type in some package. A check that
 * cries wolf gets switched off, which would have left the real gap open.
 *
 * Namespace-qualified is also simply the correct rule: C# resolves a bare name
 * through the file's usings, so that is what has to be modelled.
 */
function declarations(body) {
  const out = [];
  const marks = [...body.matchAll(NS)].map((m) => ({ at: m.index, ns: m[1] }));
  for (const m of body.matchAll(DECL)) {
    let ns = "";
    for (const mark of marks) { if (mark.at < m.index) ns = mark.ns; else break; }
    out.push({ ns, name: m[1] });
  }
  return out;
}

// ------------------------------------------------- index the real packages

/** assembly name → Set of type names it declares */
const declaredBy = new Map();
/** type name → Set of assembly names */
const owners = new Map();

let packageAsmdefs = 0;

for (const cache of CACHES) {
  if (!existsSync(cache)) continue;
  for (const file of walk(cache)) {
    if (!file.endsWith(".asmdef")) continue;
    let asm;
    try { asm = JSON.parse(readFileSync(file, "utf8")).name; } catch { continue; }
    if (!asm) continue;
    packageAsmdefs += 1;

    // An asmdef owns its folder down to the next asmdef. Editor-only and test
    // assemblies are indexed too — being told you used an editor type in
    // runtime code is a real thing worth hearing.
    const dir = path.dirname(file);
    const nested = new Set(
      walk(dir).filter((f) => f.endsWith(".asmdef") && f !== file).map((f) => path.dirname(f))
    );

    const types = declaredBy.get(asm) || new Set();
    for (const src of walk(dir)) {
      if (!src.endsWith(".cs")) continue;
      if ([...nested].some((n) => src.startsWith(n + path.sep))) continue;
      for (const d of declarations(code(readFileSync(src, "utf8")))) {
        if (!d.ns) continue;                       // global namespace: not ours to resolve
        const fq = `${d.ns}.${d.name}`;
        types.add(fq);
        const set = owners.get(fq) || new Set();
        set.add(asm);
        owners.set(fq, set);
      }
    }
    declaredBy.set(asm, types);
  }
}

// Library/ is gitignored, so a fresh clone and any CI runner has no package
// cache. The deep check is only possible where the Unity project actually
// lives -- which is also where the code gets written, and where Unity would
// fail anyway.
//
// So it degrades in two steps rather than one: the LOCK below runs everywhere
// and catches a reference being removed; the deep scan runs where there is
// something real to scan. What it must never do is pass silently with nothing
// checked, because a green line reads as evidence.
const deep = packageAsmdefs > 0;
process.stdout.write(deep
  ? `  ok    package cache indexed — ${packageAsmdefs} assemblies\n`
  : "  ..    no package cache here, so only the reference lock runs (open the Unity project to run the full scan)\n");

// -------------------------------------------- what our own assemblies declare

const ourAsmdefs = walk(ASSETS).filter((f) => f.endsWith(".asmdef"));
const ourTypes = new Set();
for (const file of ourAsmdefs) {
  const dir = path.dirname(file);
  for (const src of walk(dir)) {
    if (!src.endsWith(".cs")) continue;
    for (const d of declarations(code(readFileSync(src, "utf8")))) ourTypes.add(d.name);
  }
}

// ----------------------------------------------------------------- the check

for (const file of deep ? ourAsmdefs : []) {
  const asmdef = JSON.parse(readFileSync(file, "utf8"));
  const refs = new Set(asmdef.references || []);
  const dir = path.dirname(file);

  const nested = new Set(
    ourAsmdefs.filter((f) => f !== file && path.dirname(f).startsWith(dir + path.sep)).map((f) => path.dirname(f))
  );

  /** required assembly → the type and file that need it */
  const missing = new Map();

  for (const src of walk(dir)) {
    if (!src.endsWith(".cs")) continue;
    if ([...nested].some((n) => src.startsWith(n + path.sep))) continue;

    const body = code(readFileSync(src, "utf8"));

    // The namespaces this file can resolve a bare name through. Aliases and
    // static usings are skipped -- they cannot introduce a bare type name.
    const usings = [...body.matchAll(/\busing\s+(?!static\b)([\w.]+)\s*;/g)].map((m) => m[1]);
    const words = new Set(body.match(/\b[A-Z]\w*/g) || []);

    const candidates = new Set();
    for (const ns of usings) {
      for (const word of words) {
        if (ourTypes.has(word)) continue;    // declared by us, so nothing is implied
        candidates.add(`${ns}.${word}`);
      }
    }
    // Written out in full at the call site, e.g. UnityEngine.Rendering.Volume.
    for (const m of body.matchAll(/\b([A-Z]\w*(?:\.[A-Z]\w*)+)\b/g)) candidates.add(m[1]);

    for (const fq of candidates) {
      const from = owners.get(fq);
      if (!from) continue;
      // Satisfied if ANY assembly declaring it is referenced: a name can
      // legitimately exist in two, and demanding one specific owner would fail
      // on code that is perfectly correct.
      if ([...from].some((a) => refs.has(a))) continue;

      const key = [...from].sort().join(" or ");
      if (!missing.has(key)) missing.set(key, []);
      missing.get(key).push(`${fq.split(".").pop()} (${path.relative(ASSETS, src)})`);
    }
  }

  const name = asmdef.name;
  if (missing.size === 0) {
    ok(`${name} references every package assembly it uses`, true);
  } else {
    for (const [asm, uses] of missing) {
      ok(`${name} references ${asm}`, false,
         `needs it for ${uses.slice(0, 3).join(", ")}${uses.length > 3 ? ` and ${uses.length - 3} more` : ""}`);
    }
  }
}

// ------------------------------------------------------ the boundary, restated
//
// check:csharp proves UI cannot see World by refusing to compile it. This
// restates it as data, because the two can now disagree: adding a reference
// here is a one-line edit that no compiler in this repo would catch.

const byName = Object.fromEntries(
  ourAsmdefs.map((f) => { const d = JSON.parse(readFileSync(f, "utf8")); return [d.name, d]; })
);

// THE LOCK. Portable, and the half that survives a fresh clone.
//
// Every reference here was established by evidence -- the deep scan above, run
// against the real packages -- and is recorded so that removing one fails on
// any machine. TrapPostProcess needs Volume and VolumeProfile from
// render-pipelines.core, and Tonemapping from render-pipelines.universal;
// without both, Unity 6.3 refuses the whole assembly and drops the project into
// Safe Mode, which is how this was found.
const REQUIRED = {
  "TRP23.World": [
    "TRP23.Core",
    "Unity.InputSystem",
    "Unity.RenderPipelines.Core.Runtime",
    "Unity.RenderPipelines.Universal.Runtime",
  ],
  "TRP23.UI": ["TRP23.Core"],
};

for (const [asm, needed] of Object.entries(REQUIRED)) {
  const have = new Set(byName[asm]?.references || []);
  const gone = needed.filter((r) => !have.has(r));
  ok(`${asm} keeps the references it was proved to need`, gone.length === 0, gone.join(", "));
}

ok("TRP23.Core references nothing", (byName["TRP23.Core"]?.references || []).length === 0);
ok("TRP23.Core has no engine references", byName["TRP23.Core"]?.noEngineReferences === true);
ok("TRP23.UI cannot see TRP23.World", !(byName["TRP23.UI"]?.references || []).includes("TRP23.World"));
ok("TRP23.World cannot see TRP23.UI", !(byName["TRP23.World"]?.references || []).includes("TRP23.UI"));

// Render-pipeline access belongs to the world, not to the interface. The Phone
// and the HUD have no business reaching into post-processing, and the cheapest
// time to say so is before someone tries.
for (const rp of ["Unity.RenderPipelines.Core.Runtime", "Unity.RenderPipelines.Universal.Runtime"]) {
  ok(`TRP23.UI does not reference ${rp}`, !(byName["TRP23.UI"]?.references || []).includes(rp));
}

process.stdout.write(bad === 0
  ? "\nevery assembly references what it uses\n"
  : `\n${bad} assembly reference problem(s)\n`);
process.exit(bad === 0 ? 0 : 1);
