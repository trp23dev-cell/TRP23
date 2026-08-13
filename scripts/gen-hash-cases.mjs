// Regenerate scripts/lib/hash.cases.json from the JS implementation.
//
// The table is the contract between hashUnit (JS, the tiler) and TrapHash.Unit
// (C#, the client). They must agree, because a building's bay layout and its
// tint are chosen by the same function on two sides of a wire — and the trap
// card already showed what happens when two implementations of one rule drift
// apart without anything watching.
//
// Regenerating is a DECISION, not a fix. If check:world fails, the question is
// which side is wrong, and re-running this to make the failure go away answers
// it by assumption.
import { hashUnit } from "./lib/classify.mjs";
import { writeFileSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const d = JSON.parse(gunzipSync(readFileSync("server/storage/map-export.json.gz")).toString());
const SLICE = new Set(["-1,-1", "0,-1", "-1,0", "0,0", "-1,1", "0,1"]);

// Real OSM ids from the High Street, so the table exercises the strings the
// game actually hashes rather than invented ones.
const ids = [];
for (const t of d.tiles) {
  if (!SLICE.has(`${t.tileX},${t.tileZ}`)) continue;
  for (const b of t.payload.b || []) if (ids.length < 14) ids.push(b.i);
}

const cases = [];
for (const id of ids) for (const salt of [0, 77, 900, 1300]) cases.push({ id, salt, unit: hashUnit(id, salt) });
// Salt extremes: the salt is XORed into the FNV offset, so a big one is where
// a sign or width mistake would show up.
for (const salt of [0, 1, 77, 2100, 65535]) cases.push({ id: "way/1", salt, unit: hashUnit("way/1", salt) });
cases.push({ id: "", salt: 0, unit: 0 });

writeFileSync("scripts/lib/hash.cases.json", JSON.stringify({
  _comment: "Generated from hashUnit in scripts/lib/classify.mjs. Verified against TrapHash.Unit by check:world. Regenerate with scripts/gen-hash-cases.mjs — but read the note in that file first.",
  cases,
}, null, 1) + "\n");

process.stdout.write(`wrote ${cases.length} hash cases\n`);
