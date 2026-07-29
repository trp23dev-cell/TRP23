#!/usr/bin/env node
// ============================================================================
// EXPORT MAP — write the built map to a file the server can import on boot.
//
// The map lives in SQLite, and that database also holds player accounts, so it
// is not something to be committing on every map rebuild. This writes just the
// map — tiles and manifest, gzipped — as a standalone artefact that ships with
// the code and is imported into whatever database the server comes up against.
//
// That makes a deploy deterministic: the map that was tested is the map that
// runs, without a network fetch at boot and without carrying player data
// through git.
//
//   npm run map:export     after npm run map:build
// ============================================================================

import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSqliteStore } from "../server/storage/sqliteStore.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "server/storage/map-export.json.gz");

const store = createSqliteStore({
  dbPath: process.env.DB_PATH || path.join(ROOT, "server/storage/trapmadeit.db"),
});

const manifest = store.getMapManifest();
if (!manifest) {
  process.stderr.write("no map in the database — run: npm run map:build\n");
  process.exit(1);
}

const tiles = manifest.tiles.map(([tileX, tileZ]) => {
  const tile = store.getMapTile(tileX, tileZ);
  return { tileX, tileZ, payload: JSON.parse(tile.payload) };
});

// `tiles` is rebuilt from the rows on import, so it is not carried twice.
const { tiles: _index, ...meta } = manifest;
const body = gzipSync(JSON.stringify({ meta, tiles }));
writeFileSync(OUT, body);

process.stdout.write(
  `exported ${tiles.length} tiles to ${path.relative(ROOT, OUT)} ` +
  `(${(body.length / 1024 / 1024).toFixed(1)} MB gzipped)\n`
);
