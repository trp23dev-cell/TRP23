#!/usr/bin/env node
// ============================================================================
// REPO HYGIENE — refuse to let credentials or player data back into the tree.
//
// This repository is public, and it has carried an Apple .p8 signing key and a
// SQLite database of player accounts. Both are the kind of mistake that is
// invisible until it is expensive, so it is checked rather than remembered.
//
//   npm run check:repo
// ============================================================================

import { execSync } from "node:child_process";

const BANNED = [
  [/\.p8$/i, "Apple private key — cannot be re-downloaded, grants API/push access"],
  [/\.(p12|pfx)$/i, "PKCS#12 keystore, usually contains a private key"],
  [/\.(keystore|jks)$/i, "Android signing keystore"],
  [/\.mobileprovision$/i, "provisioning profile"],
  [/\.pem$/i, "PEM key or certificate"],
  [/(^|\/)[^/]*\.key$/i, "private key"],
  [/\.(db|sqlite|sqlite3)$/i, "database — runtime state, and this one holds player accounts"],
  [/(^|\/)\.env$/, "environment file"],
];

const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
const found = [];
for (const file of tracked) {
  for (const [pattern, why] of BANNED) {
    if (pattern.test(file)) found.push({ file, why });
  }
}

if (found.length) {
  process.stderr.write("tracked files that must not be in a public repository:\n");
  for (const f of found) process.stderr.write(`  ${f.file}\n      ${f.why}\n`);
  process.stderr.write("\nuntrack with:  git rm --cached <file>   (the file stays on disk)\n");
  process.exit(1);
}

// The map is the one thing in server/storage that SHOULD ship.
const hasMap = tracked.includes("server/storage/map-export.json.gz");
process.stdout.write(
  `repo clean: ${tracked.length} tracked files, no credentials or databases\n` +
  (hasMap ? "map export is present, so a deploy comes up with a map\n"
          : "WARNING: no map export tracked — a deploy will have no map\n")
);
process.exit(hasMap ? 0 : 1);
