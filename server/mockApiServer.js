import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { gzipSync, gunzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { defaultContent } from "../src/data/defaultContent.js";
import { defaultWorld } from "../src/data/defaultWorld.js";
import { createSqliteStore, STARTING_COINS } from "./storage/sqliteStore.js";
import { generateTotpSecret, verifyTotp, otpauthUrl } from "./totp.js";
import { createRateLimiter, clientAddress } from "./rateLimit.js";
import { sendMail, mailReady, mailTransport } from "./mailer.js";

// ---------------------------------------------------------------------------
// ACCOUNT RECOVERY
//
// Reset links live for 30 minutes. Long enough to walk to a computer, short
// enough that an old message in an inbox is not a standing key to the account.
const RESET_TTL_MS = 30 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;

/** Tokens and recovery codes are stored hashed, so reading the database does
 *  not hand anybody the accounts. SHA-256 is right here and scrypt is not:
 *  these are 128+ bits of server-generated randomness, not user-chosen
 *  passwords, so there is nothing to brute-force and no reason to be slow. */
function hashSecret(secret) {
  return createHash("sha256").update(String(secret)).digest("hex");
}

/** Unambiguous alphabet — no O/0, no I/1/l. These get written on paper and read
 *  back by someone who has just lost their phone and is not enjoying it. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateRecoveryCode() {
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (i === 4) out += "-";
  }
  return out;
}

/** Normalise for comparison, so "abcde-fghij" matches "ABCDE-FGHIJ". */
function normaliseRecoveryCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// The trap card. Mirrored in src/data/trapCard.js and, for Unity, in
// TrapCardState.cs — all three held to src/data/trapCard.cases.json.
const TRAP_STATEMENT_MAX = 180;
const TRAP_ANSWERS = ["holds", "freed"];

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9\s().-]{6,19}$/;

function validateSignup({ username, email, phone, password }) {
  const errors = [];
  if (!USERNAME_RE.test(username || "")) errors.push("username must be 3-20 letters, numbers or underscores");
  if (!EMAIL_RE.test(email || "")) errors.push("a valid email is required");
  if (!password || String(password).length < 8) errors.push("password must be at least 8 characters");
  if (phone && !PHONE_RE.test(phone)) errors.push("phone number is not valid");
  return errors;
}

function sanitizeAccount(acct) {
  if (!acct) return null;
  return {
    playerId: acct.playerId,
    username: acct.username || null,
    email: acct.email || null,
    phone: acct.phone || null,
    twofaEnabled: !!acct.twofaEnabled,
    isGuest: !acct.email,
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Two different directories, and the distinction matters on a hosted deploy:
//
//   shippedDir  ships with the code. Read-only in practice, and holds the
//               built map. Replaced wholesale on every deploy.
//   dataDir     writable state — the database. On Railway this must point at a
//               mounted volume (DATA_DIR=/data), or every deploy starts with
//               an empty database and every account is lost.
//
// They default to the same place so local development is unchanged.
const shippedDir = path.join(__dirname, "storage");
const storageDir = process.env.DATA_DIR || shippedDir;
const dbFile = path.join(storageDir, "trapmadeit.db");
const contentFile = "content";
const refundsFile = "refunds";
const fulfillmentsFile = "fulfillments";
const releasesFile = "releases";
const moderationFile = "moderation";
const storiesFile = "stories";
const opportunitiesFile = "opportunities";
const chapterEventsFile = "chapterEvents";
const auditFile = "audit";
const PORT = Number(process.env.PORT || process.env.MOCK_API_PORT || 8787);
const distDir = path.join(__dirname, "..", "dist");
const STATIC_MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

// Serve the built front-end (dist/) so the game and the API run on one origin
// in production. Returns true if a file was served. Guards against traversal.
// Compressed static assets, kept in memory. There are a handful of files and
// they never change between deploys, so compressing each once and holding it is
// simpler and faster than a disk cache.
const staticCache = new Map();

// Text compresses enormously; images and fonts are already compressed and get
// bigger if you try.
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".map", ".svg"]);

/**
 * Serve the built front end.
 *
 * Compression is not a nicety here. Uncompressed, the first load is 1.29 MB —
 * three-core alone is 578 KB against 154 KB gzipped. The map tile route had
 * been compressed for weeks while every player was still downloading the whole
 * engine raw, because the two were written at different times and nobody
 * measured the second one.
 *
 * Caching matters as much. Vite puts a content hash in every asset filename, so
 * those can be cached for a year and a returning player downloads none of them.
 * index.html must NOT be, or it keeps pointing at the previous deploy's hashes.
 */
async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  const filePath = path.normalize(path.join(distDir, rel));
  if (filePath !== distDir && !filePath.startsWith(distDir + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return true;
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    const accept = String(req.headers["accept-encoding"] || "");
    // Brotli beats gzip by a further 15% or so and every browser that can run
    // this has had it for years.
    const encoding = !COMPRESSIBLE.has(ext) ? null
      : accept.includes("br") ? "br"
      : accept.includes("gzip") ? "gzip"
      : null;

    const cacheKey = `${filePath}:${encoding || "raw"}`;
    let entry = staticCache.get(cacheKey);
    if (!entry) {
      const raw = await fs.readFile(filePath);
      let body = raw;
      if (encoding === "br") {
        body = brotliCompressSync(raw, {
          params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 10 },
        });
      } else if (encoding === "gzip") {
        body = gzipSync(raw, { level: 8 });
      }
      entry = { body, etag: `W/"${raw.length}-${createHash("sha1").update(raw).digest("hex").slice(0, 16)}"` };
      staticCache.set(cacheKey, entry);
    }

    if (req.headers["if-none-match"] === entry.etag) {
      res.writeHead(304, { ETag: entry.etag });
      res.end();
      return true;
    }

    // Hashed asset filenames are immutable by construction; index.html is not.
    const immutable = rel.startsWith("/assets/");
    const headers = {
      "Content-Type": STATIC_MIME[ext] || "application/octet-stream",
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      ETag: entry.etag,
    };
    if (encoding) {
      headers["Content-Encoding"] = encoding;
      headers.Vary = "Accept-Encoding";
    }
    res.writeHead(200, headers);
    res.end(entry.body);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the shipped map into whatever database this server came up against.
 *
 * The map is built offline and travels with the code as map-export.json.gz,
 * not inside the database — that file also holds player accounts, and is not
 * something to rewrite on every map rebuild. On boot the export wins if it is
 * newer than whatever the database has, so a fresh deploy comes up with the
 * map that was actually tested and no network fetch at start-up.
 */
async function importShippedMap() {
  // Always from the shipped copy, never the data volume: the map is code, not
  // state, and a deploy must be able to update it.
  const file = path.join(shippedDir, "map-export.json.gz");
  let raw;
  try {
    raw = await fs.readFile(file);
  } catch {
    return; // no export shipped; whatever is in the database stands
  }
  try {
    const { meta, tiles } = JSON.parse(gunzipSync(raw).toString("utf8"));
    const current = store.getMapManifest();
    if (current && current.builtAt >= meta.builtAt) return;
    store.replaceMapTiles(tiles, meta, meta.builtAt);
    console.log(`[map] imported ${tiles.length} tiles from the shipped export`);
  } catch (err) {
    console.error("[map] could not import the shipped map:", err.message);
  }
}

/**
 * Cross-origin policy.
 *
 * The web game is served from this same origin, so it never uses CORS at all —
 * a same-origin request does not even carry an Origin header. The only genuine
 * cross-origin caller is the packaged mobile build, which runs on
 * capacitor://localhost rather than on the site's domain.
 *
 * So the allowlist is small and specific, and `*` is gone. Being permissive was
 * not a session-riding risk here (Bearer tokens, no cookies) but it let any
 * page on the internet call this API from a visitor's browser, which is not
 * something to leave open for no reason.
 *
 * ALLOWED_ORIGINS adds to it, comma separated, for when the game is served from
 * a domain other than the API's.
 *
 * UNITY: a native player is not a browser and ignores CORS entirely, so a
 * desktop or mobile Unity build needs nothing here. A Unity WEBGL build does —
 * it runs in a browser and is subject to exactly these rules, so whatever
 * origin it is hosted on has to go in ALLOWED_ORIGINS.
 */
const CAPACITOR_ORIGINS = [
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
];

const EXTRA_ORIGINS = String(process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""))
  .filter(Boolean);

const rejectedOrigins = new Set();

function allowedOrigin(origin, host) {
  if (!origin) return null;
  const clean = origin.replace(/\/$/, "");
  // The site's own origin. A same-origin request does not need CORS at all, so
  // this changes nothing functionally — but without it the server logs a
  // refusal for its OWN domain, which reads like a fault when it is not.
  if (host && clean.replace(/^https?:\/\//, "") === host) return clean;
  if (CAPACITOR_ORIGINS.includes(clean)) return clean;
  if (EXTRA_ORIGINS.includes(clean)) return clean;
  // Any localhost port, for `vite --host` and for a phone on the same wifi
  // pointed at a dev machine. A development affordance, so it is off in
  // production — where nobody is legitimately calling us from 192.168.x.x and
  // leaving it on is a standing allowance nobody chose.
  if (process.env.NODE_ENV !== "production"
    && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(clean)) {
    return clean;
  }
  // Say so once. A silently dropped CORS header is the kind of thing that looks
  // like a server outage from the client side.
  if (!rejectedOrigins.has(clean)) {
    rejectedOrigins.add(clean);
    console.warn(`[cors] refused origin ${clean} — add it to ALLOWED_ORIGINS if that is wrong`);
  }
  return null;
}

/** CORS headers for a request, or an empty object when none are needed. */
function corsHeaders(req) {
  const origin = allowedOrigin(req.headers.origin, req.headers.host);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

// Rebound to a persistent one once the database is open (see boot). Until
// then it is memory-only, which is correct: there is nothing to serve yet.
let rateLimiter = createRateLimiter();

/**
 * Apply a rate limit, answering the request with 429 if it is over.
 * @returns true when the caller should stop.
 */
function rateLimited(req, res, bucket) {
  const address = clientAddress(req);
  const verdict = rateLimiter.checkAddress(bucket, address);
  if (verdict.ok) return false;
  res.writeHead(429, {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(req),
    "Retry-After": String(verdict.retryAfter),
  });
  res.end(JSON.stringify({
    ok: false,
    error: "too many attempts, slow down",
    retryAfter: verdict.retryAfter,
  }));
  return true;
}

let store;
const LEGACY_DEFAULT_ADMIN_EMAIL = "admin@trapmadeit.local";

function createDefaultPlayerProfile(playerId) {
  const ts = new Date().toISOString();
  return {
    playerId,
    trustStatus: "standard",
    wallet: { coins: STARTING_COINS },
    progress: {
      currentLevel: 0,
      levelsCleared: 0,
      walked: 0,
      inspected: false,
      viewed: [],
      missionProgress: [],
    },
    inventory: { ownedDropIds: [] },
    entitlements: {
      codes: [],
      badges: [],
      earlyAccessFlags: [],
    },
    createdAt: ts,
    updatedAt: ts,
  };
}

function nowIso() {
  return new Date().toISOString();
}

// Verify an admin password against a stored hash. Supports the new salted
// scrypt format and the legacy unsalted SHA-256 (so existing accounts keep
// working); callers re-hash legacy accounts to scrypt on successful login.
function verifyAdminPassword(password, stored) {
  if (!stored) return false;
  if (stored.startsWith("scrypt$")) return verifyPlayerPassword(password, stored);
  const legacy = createHash("sha256").update(String(password)).digest("hex");
  const a = Buffer.from(stored);
  const b = Buffer.from(legacy);
  return a.length === b.length && timingSafeEqual(a, b);
}

const PLAYER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days for guest players

// Salted scrypt hashing for PLAYER credentials (stronger than the legacy admin
// SHA-256). Stored as "scrypt$<saltHex>$<hashHex>".
function hashPlayerPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function verifyPlayerPassword(password, stored) {
  if (!stored || !stored.startsWith("scrypt$")) return false;
  const [, saltHex, hashHex] = stored.split("$");
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(String(password), salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Resolve a player Bearer token to { token, playerId }, or null. Expired
// sessions are cleaned up on access.
function playerAuthContext(req) {
  const token = parseBearerToken(req);
  if (!token) return null;
  const session = store.getPlayerSession(token);
  if (!session) return null;
  if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
    store.deletePlayerSession(token);
    return null;
  }
  return { token, playerId: session.playerId };
}

// Determine which player an economy request is allowed to act as.
// - Admin/ops may act on any player (support tooling): honour requestedId.
// - A logged-in player may ONLY act as themselves — requestedId is ignored.
// - Otherwise the request is unauthenticated (null).
function resolveActingPlayer(ctx, pctx, requestedId) {
  if (requiresRole(ctx, ["admin", "ops"])) return requestedId || pctx?.playerId || null;
  if (pctx) return pctx.playerId;
  return null;
}

function issuePlayerSession(playerId) {
  const token = `pt_${randomUUID().replace(/-/g, "")}${randomBytes(8).toString("hex")}`;
  const expiresAt = new Date(Date.now() + PLAYER_SESSION_TTL_MS).toISOString();
  store.createPlayerSession(token, playerId, expiresAt);
  return { token, expiresAt };
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

// Server-authoritative view of a player's economy, assembled from the
// relational tables (wallet + ownership) merged with the KV progress blob.
function buildPlayerProfile(playerId) {
  const base = store.getPlayerState(playerId) || createDefaultPlayerProfile(playerId);
  const account = store.getPlayerAccount(playerId);
  return {
    ...base,
    playerId,
    account: sanitizeAccount(account),
    wallet: { coins: store.getWalletBalance(playerId) },
    bank: { coins: store.getBankBalance(playerId) },
    inventory: { ownedDropIds: store.getOwnedDropIds(playerId) },
  };
}

function parseBearerToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

function authContext(req) {
  const token = parseBearerToken(req);
  if (!token) return null;
  const session = store.getAdminSession(token);
  if (!session) return null;
  if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
    store.deleteAdminSession(token);
    return null;
  }
  const user = store.findAdminUserById(session.userId);
  if (!user) return null;
  return { token, session, user };
}

function requiresRole(ctx, allowed) {
  return !!(ctx && allowed.includes(ctx.user.role));
}

async function logAudit(action, ctx, details = {}) {
  const audit = await readJson(auditFile, []);
  audit.push({
    id: `aud_${randomUUID().slice(0, 8)}`,
    action,
    actor: ctx?.user?.email || "system",
    role: ctx?.user?.role || "system",
    details,
    at: nowIso(),
  });
  await writeJson(auditFile, audit);
}

async function ensureStorage() {
  await fs.mkdir(storageDir, { recursive: true });
  if (process.env.NODE_ENV === "production" && !process.env.DATA_DIR) {
    console.warn(
      "[storage] DATA_DIR is not set, so the database is being written inside the\n" +
      "[storage] deployment. Every redeploy will wipe player accounts. Mount a\n" +
      "[storage] volume and set DATA_DIR to its path."
    );
  }
  store = createSqliteStore({ dbPath: dbFile });

  // Now that the database is open, failed sign-ins go to disk. Held in memory
  // they were forgotten on every redeploy, which handed an attacker a fresh
  // ten attempts each time the service restarted.
  rateLimiter = createRateLimiter(store);

  await importShippedMap();
  store.ensureKey(contentFile, defaultContent);

  // Content migration. `ensureKey` only seeds when the row is missing, so a database
  // carried over from an earlier build keeps serving its old chapter copy forever -
  // and the client trusts the server over its own defaults. Replacing anything older
  // than the shipped version is what makes copy changes actually reach players.
  const storedContent = await readJson(contentFile, defaultContent);
  if ((storedContent?.version || 0) < (defaultContent.version || 0)) {
    await writeJson(contentFile, defaultContent);
    console.log(
      `[content] migrated stored content v${storedContent?.version || 0} -> v${defaultContent.version}`
    );
  }

  for (const file of [refundsFile, fulfillmentsFile, releasesFile, moderationFile, storiesFile, opportunitiesFile, chapterEventsFile]) {
    store.ensureKey(file, []);
  }
  store.ensureKey(auditFile, []);

  // Seed the relational economy + world tables (non-destructive).
  const seededContent = await readJson(contentFile, defaultContent);
  store.seedInventory(seededContent.drops || defaultContent.drops || []);
  store.seedLocations(defaultWorld.locations || []);

  // Safety valve for hosted deployments that may re-use an older local DB snapshot.
  if (process.env.NODE_ENV === "production") {
    store.removeAdminByEmail(LEGACY_DEFAULT_ADMIN_EMAIL);
  }
}

async function readJson(file, fallback) {
  return store.getJson(file, fallback);
}

async function writeJson(file, value) {
  store.setJson(file, value);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) reject(new Error("Payload too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    // Computed once per request in handleRequest and parked on the response,
    // so the eighty-odd sendJson call sites do not all need `req`.
    ...(res.corsHeaders || {}),
    "Access-Control-Allow-Methods": "GET,PUT,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Bootstrap-Token",
  });
  res.end(JSON.stringify(payload));
}

// Map tiles are immutable between builds and are hit constantly as the player
// walks, so they get gzip + a build-stamped ETag.
//
// MUST be no-cache, not max-age. fetch() honours the HTTP cache, so under
// `max-age=86400` the browser served day-old tiles without ever contacting the
// server — every `npm run map:build` landed in the database and never reached
// the game. no-cache still caches; it just requires revalidation, which the
// ETag answers with a 304 and no body. Same bandwidth, no staleness.
const tileGzipCache = new Map();

function sendMapPayload(req, res, json, builtAt, key = "") {
  // `key` identifies WHICH tile this is. Without it the cache was keyed on
  // build time and payload length alone, so any two tiles that happened to
  // serialise to the same number of bytes would serve each other's geometry.
  const etag = `W/"map-${builtAt}-${key}-${json.length}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag, ...corsHeaders(req) });
    res.end();
    return;
  }

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    ...corsHeaders(req),
    "Cache-Control": "no-cache",
    ETag: etag,
  };

  if ((req.headers["accept-encoding"] || "").includes("gzip")) {
    let body = tileGzipCache.get(etag);
    if (!body) {
      body = gzipSync(json);
      // Bounded so a wider world cannot grow this without limit.
      if (tileGzipCache.size > 256) tileGzipCache.clear();
      tileGzipCache.set(etag, body);
    }
    headers["Content-Encoding"] = "gzip";
    res.writeHead(200, headers);
    res.end(body);
    return;
  }

  res.writeHead(200, headers);
  res.end(json);
}

function parseMapTile(pathname) {
  const m = pathname.match(/^\/api\/map\/tile\/(-?\d+)\/(-?\d+)$/);
  return m ? { tileX: Number(m[1]), tileZ: Number(m[2]) } : null;
}

/** Where a reset link should point.
 *
 *  PUBLIC_BASE_URL when set, because behind a proxy the Host header is the only
 *  other clue and it can be spoofed — and a reset link is the one email where
 *  sending somebody to an attacker's domain is worst. Falls back to the request
 *  host for local development, where there is no proxy and no risk. */
function resetBaseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = req.headers.host || "localhost";
  const proto = /^localhost|^127\.0\.0\.1|^\[::1\]/.test(host) ? "http" : "https";
  return `${proto}://${host}`;
}

function parsePlayerId(pathname) {
  const match = pathname.match(/^\/api\/player\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function handleRequest(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...corsHeaders(req),
      "Access-Control-Allow-Methods": "GET,PUT,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Bootstrap-Token",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  res.corsHeaders = corsHeaders(req);

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;
  const ctx = await authContext(req);
  const pctx = playerAuthContext(req);

  if (req.method === "GET" && pathname === "/api/health") {
    // Readiness, not just liveness. A deploy can answer 200 while being
    // misconfigured in ways nobody notices until it costs something: the
    // database on ephemeral disk (every redeploy wipes accounts), or the proxy
    // untrusted (every player shares one rate-limit bucket). Both are silent.
    //
    // Booleans only, no paths or secrets. This is the same posture a readiness
    // probe exposes, and being able to check it from outside is worth more than
    // the little it tells anyone.
    const manifest = store.getMapManifest();
    sendJson(res, 200, {
      ok: true,
      service: "mock-api",
      schemaVersion: store.getSchemaVersion(),
      deploy: {
        // false means the database lives inside the deployment and every
        // redeploy destroys it.
        persistentStorage: !!process.env.DATA_DIR,
        // false behind a proxy means the rate limiter sees one address for
        // everyone.
        trustProxy: process.env.TRUST_PROXY === "1",
        production: process.env.NODE_ENV === "production",
        mapTiles: manifest?.tiles?.length || 0,
        staffAccounts: store.countAdminUsers(),
        // Whether a first-admin bootstrap is currently possible. Says nothing
        // about the token itself, and it is useless without it, but it turns
        // "403 and I cannot tell why" into an answerable question.
        bootstrapReady: !!process.env.ADMIN_BOOTSTRAP_TOKEN && store.countAdminUsers() === 0,
        // Whether the coins-from-nothing route is open. The client hides its
        // top-up affordance when it is not, rather than offering a button that
        // 404s and a price we cannot currently honour.
        devTopup: process.env.ALLOW_DEV_TOPUP === "1",
        // false means password resets are generated and then thrown away. A
        // player would ask for a link, be told one was sent, and never get it.
        mail: mailReady(),
        mailTransport: mailTransport(),
      },
    });
    return;
  }

  // ---------------- MAP (OpenStreetMap-derived, ODbL) ----------------
  // Built by `npm run map:build`. The client streams tiles from here and never
  // contacts OSM itself.
  if (req.method === "GET" && pathname === "/api/map/manifest") {
    const manifest = store.getMapManifest();
    if (!manifest) {
      sendJson(res, 503, { error: "map_not_built", hint: "run: npm run map:build" });
      return;
    }
    sendMapPayload(req, res, JSON.stringify(manifest), manifest.builtAt, "manifest");
    return;
  }

  const tileRef = req.method === "GET" ? parseMapTile(pathname) : null;
  if (tileRef) {
    const tile = store.getMapTile(tileRef.tileX, tileRef.tileZ);
    // An empty tile is a normal answer, not an error: the world is not a
    // rectangle, and the streamer asks for a 3x3 block regardless of what
    // exists. Returning 200 with nothing in it keeps its cache logic simple.
    if (!tile) {
      sendJson(res, 200, { b: [], r: [], empty: true });
      return;
    }
    sendMapPayload(req, res, tile.payload, tile.builtAt, `${tileRef.tileX}_${tileRef.tileZ}`);
    return;
  }

  // ---------------- AUTH ----------------
  if (req.method === "POST" && pathname === "/api/auth/register") {
    if (rateLimited(req, res, "register")) return;
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const role = ["admin", "ops", "product", "viewer"].includes(body.role) ? body.role : "viewer";

      // STAFF accounts, not player accounts. This route used to be wide open:
      // anyone on the internet could POST role:"admin" and take over the CMS,
      // the content and every player record. Players sign up at
      // /api/players/register, which is a different thing entirely.
      //
      // Creating staff now requires either an existing admin, or — for the very
      // first account on a fresh deployment, when there is no admin to
      // authorise it — a bootstrap token supplied out of band.
      const isFirstAdmin = store.countAdminUsers() === 0;
      const bootstrap = process.env.ADMIN_BOOTSTRAP_TOKEN;
      const offered = req.headers["x-bootstrap-token"];
      const bootstrapOk = isFirstAdmin
        && !!bootstrap
        && typeof offered === "string"
        && offered.length === bootstrap.length
        && timingSafeEqual(Buffer.from(offered), Buffer.from(bootstrap));

      if (!requiresRole(ctx, ["admin"]) && !bootstrapOk) {
        await logAudit("auth.register.denied", ctx, { email, role, isFirstAdmin });
        sendJson(res, 403, {
          ok: false,
          error: isFirstAdmin
            ? "first staff account requires the ADMIN_BOOTSTRAP_TOKEN header"
            : "only an admin can create staff accounts",
        });
        return;
      }

      if (!email || !password) {
        sendJson(res, 400, { ok: false, error: "email and password are required" });
        return;
      }
      if (password.length < 12) {
        sendJson(res, 400, { ok: false, error: "staff passwords must be at least 12 characters" });
        return;
      }
      if (store.findAdminUserByEmail(email)) {
        sendJson(res, 409, { ok: false, error: "email already exists" });
        return;
      }
      const user = {
        id: `u_${randomUUID().slice(0, 8)}`,
        email,
        passwordHash: hashPlayerPassword(password),
        role,
        createdAt: nowIso(),
      };
      store.createAdminUser(user);
      await logAudit("auth.register", null, { email, role });
      sendJson(res, 201, { ok: true, user: sanitizeUser(user) });
      return;
    } catch {
      sendJson(res, 400, { ok: false, error: "invalid payload" });
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    if (rateLimited(req, res, "login")) return;
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const lock = rateLimiter.accountLocked(`staff:${email}`);
      if (!lock.ok) {
        await logAudit("auth.login.locked", null, { email });
        sendJson(res, 429, {
          ok: false, error: "too many failed attempts for this account", retryAfter: lock.retryAfter,
        });
        return;
      }
      const user = store.findAdminUserByEmail(email);
      if (!user || !verifyAdminPassword(password, user.passwordHash)) {
        rateLimiter.failAccount(`staff:${email}`);
        sendJson(res, 401, { ok: false, error: "invalid credentials" });
        return;
      }
      rateLimiter.succeeded(`staff:${email}`);
      // Transparently upgrade legacy SHA-256 accounts to scrypt on login.
      if (!user.passwordHash.startsWith("scrypt$")) {
        store.updateAdminPasswordHash(user.id, hashPlayerPassword(password));
      }
      const token = `t_${randomUUID().replace(/-/g, "")}`;
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
      store.createAdminSession(token, user.id, expiresAt);
      await logAudit("auth.login", { user }, { userId: user.id });
      sendJson(res, 200, { ok: true, token, user: sanitizeUser(user) });
      return;
    } catch {
      sendJson(res, 400, { ok: false, error: "invalid payload" });
      return;
    }
  }

  if (req.method === "GET" && pathname === "/api/auth/me") {
    if (!ctx) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    sendJson(res, 200, { ok: true, user: sanitizeUser(ctx.user) });
    return;
  }

  // ---------------- PLAYER AUTH ----------------
  // Start (or refresh) a player session. This is how the game authenticates.
  // - Valid player token present  -> refresh, keep the same playerId.
  // - Proposed playerId that is unclaimed -> adopt it (preserves guest progress).
  // - Otherwise -> mint a brand-new server-owned playerId.
  if (req.method === "POST" && pathname === "/api/players/session") {
    const body = JSON.parse((await readBody(req)) || "{}");
    let playerId;
    if (pctx) {
      playerId = pctx.playerId;
    } else {
      const proposed = String(body.playerId || "").trim();
      if (proposed && !store.playerAccountExists(proposed)) {
        playerId = proposed; // adopt an unclaimed id (first-claim-wins)
      } else {
        playerId = `p_${randomUUID().slice(0, 8)}${randomBytes(4).toString("hex")}`;
      }
    }
    store.ensurePlayerAccount(playerId);
    store.ensureWallet(playerId);
    store.markPlayerSeen(playerId);
    const { token, expiresAt } = issuePlayerSession(playerId);
    sendJson(res, 200, { ok: true, playerId, token, expiresAt });
    return;
  }

  // Full sign-up: username + email + phone + password. Links to the current
  // guest player (preserving progress) or creates a fresh account. Optionally
  // begins TOTP 2FA enrollment (returns a secret to confirm via /2fa/enable).
  if (req.method === "POST" && pathname === "/api/players/register") {
    if (rateLimited(req, res, "register")) return;
    const body = JSON.parse((await readBody(req)) || "{}");
    const username = String(body.username || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const password = String(body.password || "");

    const errors = validateSignup({ username, email, phone, password });
    if (errors.length) {
      sendJson(res, 400, { ok: false, error: errors[0], errors });
      return;
    }
    if (store.findPlayerByEmail(email)) {
      sendJson(res, 409, { ok: false, error: "an account with this email already exists" });
      return;
    }
    if (store.findPlayerByUsername(username)) {
      sendJson(res, 409, { ok: false, error: "that username is taken" });
      return;
    }

    // Link to the authenticated guest player, or create a fresh one.
    let playerId = pctx?.playerId;
    if (!playerId) {
      playerId = `p_${randomUUID().slice(0, 8)}${randomBytes(4).toString("hex")}`;
    }
    store.ensurePlayerAccount(playerId);
    store.ensureWallet(playerId);
    store.registerPlayerAccount(playerId, { username, email, phone: phone || null, passwordHash: hashPlayerPassword(password) });

    // Optional 2FA enrollment: stash a secret (disabled until confirmed).
    let twofa = null;
    if (body.enable2fa) {
      const secret = generateTotpSecret();
      store.setPlayer2faSecret(playerId, secret);
      twofa = { secret, otpauthUrl: otpauthUrl({ secret, label: username }), pending: true };
    }

    const { token, expiresAt } = issuePlayerSession(playerId);
    await logAudit("players.register", null, { playerId, username });
    sendJson(res, 201, {
      ok: true,
      playerId,
      token,
      expiresAt,
      account: sanitizeAccount(store.getPlayerAccount(playerId)),
      twofa,
    });
    return;
  }

  // Log in with username OR email + password. If 2FA is enabled a valid TOTP
  // `code` is required; when missing we reply 401 with twofaRequired so the
  // client can prompt for it.
  if (req.method === "POST" && pathname === "/api/players/login") {
    if (rateLimited(req, res, "login")) return;
    const body = JSON.parse((await readBody(req)) || "{}");
    const identifier = String(body.identifier || body.email || body.username || "").trim().toLowerCase();
    const password = String(body.password || "");

    // Per-account lockout as well as per-address. A distributed attempt on one
    // known email never trips a per-IP limit, because no single address is
    // trying often enough.
    const lock = rateLimiter.accountLocked(identifier);
    if (!lock.ok) {
      await logAudit("players.login.locked", null, { identifier });
      sendJson(res, 429, {
        ok: false,
        error: "too many failed attempts for this account",
        retryAfter: lock.retryAfter,
      });
      return;
    }

    const account = store.findPlayerByIdentifier(identifier);
    if (!account || !account.passwordHash || !verifyPlayerPassword(password, account.passwordHash)) {
      rateLimiter.failAccount(identifier);
      sendJson(res, 401, { ok: false, error: "invalid credentials" });
      return;
    }
    if (account.twofaEnabled) {
      const code = String(body.code || "").trim();
      const recoveryCode = String(body.recoveryCode || "").trim();
      if (!code && !recoveryCode) {
        sendJson(res, 401, { ok: false, error: "two-factor code required", twofaRequired: true });
        return;
      }

      // A recovery code stands in for the authenticator when the phone is gone.
      // Single-use, so the same slip of paper cannot be used twice — and the
      // password is still required, so a found code alone is not enough.
      let passed = false;
      if (recoveryCode) {
        passed = store.useRecoveryCode({
          playerId: account.playerId,
          codeHash: hashSecret(normaliseRecoveryCode(recoveryCode)),
        });
        if (passed) {
          await logAudit("players.login.recoveryCode", null, {
            playerId: account.playerId,
            remaining: store.countRecoveryCodes(account.playerId),
          });
        }
      } else {
        passed = verifyTotp(account.twofaSecret, code);
      }

      if (!passed) {
        // Knowing the password but not the second factor is still an attempt,
        // and a wrong recovery code counts the same as a wrong TOTP.
        rateLimiter.failAccount(identifier);
        sendJson(res, 401, {
          ok: false,
          error: recoveryCode ? "that recovery code is not valid or has been used" : "invalid two-factor code",
          twofaRequired: true,
        });
        return;
      }
    }
    // Signed in properly, so forget the failures.
    rateLimiter.succeeded(identifier);
    store.markPlayerSeen(account.playerId);
    const { token, expiresAt } = issuePlayerSession(account.playerId);
    await logAudit("players.login", null, { playerId: account.playerId });
    sendJson(res, 200, { ok: true, playerId: account.playerId, token, expiresAt, account: sanitizeAccount(account) });
    return;
  }

  // ---------------- ACCOUNT RECOVERY ----------------
  //
  // Until now there was none. Forget your password and you lost your account,
  // your progress and your wallet, permanently.
  //
  // Every route here answers the SAME WAY whether or not the account exists.
  // A recovery form that says "no such email" is a way to find out who has an
  // account, and for a game about people's private circumstances that is worth
  // more care than usual.

  // Ask for a reset link.
  if (req.method === "POST" && pathname === "/api/players/forgot-password") {
    if (rateLimited(req, res, "login")) return;
    const body = JSON.parse((await readBody(req)) || "{}");
    const identifier = String(body.identifier || body.email || body.username || "").trim().toLowerCase();

    // Answered before we know anything, and identically in every case.
    const answer = () => sendJson(res, 200, {
      ok: true,
      message: "If that account exists, a reset link is on its way.",
    });

    const account = identifier ? store.findPlayerByIdentifier(identifier) : null;
    if (!account?.email) { answer(); return; }

    const token = randomBytes(32).toString("hex");
    store.createAuthToken({
      tokenHash: hashSecret(token),
      playerId: account.playerId,
      kind: "password-reset",
      expiresAt: Date.now() + RESET_TTL_MS,
    });

    const link = `${resetBaseUrl(req)}/reset-password?token=${token}`;
    const mail = await sendMail({
      to: account.email,
      subject: "Reset your TRAP MADE IT password",
      text: `Somebody asked to reset the password for ${account.username || account.email}.\n\n`
        + `${link}\n\nThis link works once and expires in 30 minutes.\n\n`
        + `If it wasn't you, ignore this — nothing has changed, and your password still works.`,
    });
    if (!mail.ok) {
      // The player is told the same thing either way; we are not.
      console.error(`[recovery] reset email failed for ${account.playerId}: ${mail.error}`);
    }
    await logAudit("players.forgotPassword", null, { playerId: account.playerId, delivered: mail.ok });
    answer();
    return;
  }

  // Complete the reset.
  if (req.method === "POST" && pathname === "/api/players/reset-password") {
    if (rateLimited(req, res, "login")) return;
    const body = JSON.parse((await readBody(req)) || "{}");
    const token = String(body.token || "").trim();
    const password = String(body.password || "");

    if (password.length < 8) {
      sendJson(res, 400, { ok: false, error: "password must be at least 8 characters" });
      return;
    }
    const playerId = token ? store.consumeAuthToken({ tokenHash: hashSecret(token), kind: "password-reset" }) : null;
    if (!playerId) {
      sendJson(res, 400, { ok: false, error: "that link has expired or has already been used" });
      return;
    }

    // Sets the password AND signs every device out. If the reset happened
    // because somebody else was in the account, leaving their session alive
    // would make the whole exercise pointless.
    store.setPlayerPassword({ playerId, passwordHash: hashPlayerPassword(password) });
    rateLimiter.succeeded(String(store.getPlayerAccount(playerId)?.email || "").toLowerCase());

    // A reset does NOT clear two-factor, and that is the entire point of two
    // factors. Somebody who has taken over an inbox has one of them; making the
    // reset skip the second would turn 2FA into decoration.
    const account = store.getPlayerAccount(playerId);
    await logAudit("players.resetPassword", null, { playerId });
    sendJson(res, 200, {
      ok: true,
      message: "Password changed. Sign in with your new password.",
      twofaStillRequired: !!account?.twofaEnabled,
    });
    return;
  }

  // Remind me of my username.
  if (req.method === "POST" && pathname === "/api/players/forgot-username") {
    if (rateLimited(req, res, "login")) return;
    const body = JSON.parse((await readBody(req)) || "{}");
    const email = String(body.email || "").trim().toLowerCase();
    const answer = () => sendJson(res, 200, {
      ok: true,
      message: "If that email has an account, we've sent the username to it.",
    });

    const account = email ? store.findPlayerByEmail(email) : null;
    if (!account?.username) { answer(); return; }

    const mail = await sendMail({
      to: account.email,
      subject: "Your TRAP MADE IT username",
      text: `Your username is: ${account.username}\n\n`
        + `If you also need your password, use "forgot password" on the sign-in screen.`,
    });
    if (!mail.ok) console.error(`[recovery] username email failed for ${account.playerId}: ${mail.error}`);
    answer();
    return;
  }

  // Generate (or replace) two-factor recovery codes.
  //
  // Without these, 2FA is the likeliest way to lose an account: the phone goes
  // in a puddle and the security feature becomes the lock-out. Shown once,
  // stored hashed, single-use.
  if (req.method === "POST" && pathname === "/api/players/2fa/recovery-codes") {
    if (!pctx) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    const account = store.getPlayerAccount(pctx.playerId);
    if (!account?.twofaEnabled) {
      sendJson(res, 400, { ok: false, error: "enable two-factor first" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    // Proving current control before issuing new codes, so a borrowed unlocked
    // phone cannot quietly mint a permanent way back in.
    if (!verifyTotp(account.twofaSecret, String(body.code || "").trim())) {
      sendJson(res, 400, { ok: false, error: "enter a current code from your authenticator app" });
      return;
    }

    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    store.replaceRecoveryCodes({
      playerId: pctx.playerId,
      codeHashes: codes.map((c) => hashSecret(normaliseRecoveryCode(c))),
    });
    await logAudit("players.2fa.recoveryCodes", null, { playerId: pctx.playerId });
    sendJson(res, 200, {
      ok: true,
      codes,
      message: "Save these somewhere safe. Each works once, and this is the only time they are shown.",
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/players/2fa/recovery-codes") {
    if (!pctx) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    // How many are left, never the codes themselves — they exist only in the
    // response that created them.
    sendJson(res, 200, { ok: true, remaining: store.countRecoveryCodes(pctx.playerId) });
    return;
  }

  // Begin 2FA enrollment for the logged-in player: returns a fresh secret to
  // add to an authenticator app, then confirm with /2fa/enable.
  if (req.method === "POST" && pathname === "/api/players/2fa/setup") {
    if (!pctx) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    const account = store.getPlayerAccount(pctx.playerId);
    if (!account?.email) {
      sendJson(res, 400, { ok: false, error: "create an account before enabling 2FA" });
      return;
    }
    const secret = generateTotpSecret();
    store.setPlayer2faSecret(pctx.playerId, secret);
    sendJson(res, 200, { ok: true, secret, otpauthUrl: otpauthUrl({ secret, label: account.username || account.email }) });
    return;
  }

  // Confirm + activate 2FA by proving a current code from the stashed secret.
  if (req.method === "POST" && pathname === "/api/players/2fa/enable") {
    if (!pctx) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    const account = store.getPlayerAccount(pctx.playerId);
    if (!account?.twofaSecret) {
      sendJson(res, 400, { ok: false, error: "start 2FA setup first" });
      return;
    }
    if (!verifyTotp(account.twofaSecret, String(body.code || "").trim())) {
      sendJson(res, 400, { ok: false, error: "invalid code — check your authenticator app" });
      return;
    }
    store.setPlayer2faEnabled(pctx.playerId, true);
    await logAudit("players.2fa.enable", null, { playerId: pctx.playerId });
    sendJson(res, 200, { ok: true, account: sanitizeAccount(store.getPlayerAccount(pctx.playerId)) });
    return;
  }

  // Disable 2FA (requires a current code to prove ownership).
  if (req.method === "POST" && pathname === "/api/players/2fa/disable") {
    if (!pctx) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    const account = store.getPlayerAccount(pctx.playerId);
    if (!account?.twofaEnabled) {
      sendJson(res, 400, { ok: false, error: "2FA is not enabled" });
      return;
    }
    if (!verifyTotp(account.twofaSecret, String(body.code || "").trim())) {
      sendJson(res, 400, { ok: false, error: "invalid code" });
      return;
    }
    store.setPlayer2faEnabled(pctx.playerId, false);
    await logAudit("players.2fa.disable", null, { playerId: pctx.playerId });
    sendJson(res, 200, { ok: true, account: sanitizeAccount(store.getPlayerAccount(pctx.playerId)) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/players/me") {
    if (!pctx) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    sendJson(res, 200, { ok: true, ...sanitizeAccount(store.getPlayerAccount(pctx.playerId)) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/players/logout") {
    if (pctx) store.deletePlayerSession(pctx.token);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && pathname === "/api/content") {
    const content = await readJson(contentFile, defaultContent);
    sendJson(res, 200, { ok: true, content });
    return;
  }

  if (req.method === "PUT" && pathname === "/api/content") {
    if (!requiresRole(ctx, ["admin", "product"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      const content = body?.content || body;
      if (!content || !Array.isArray(content.chapters) || !Array.isArray(content.drops)) {
        sendJson(res, 400, { ok: false, error: "Invalid content payload." });
        return;
      }
      await writeJson(contentFile, content);
      store.seedInventory(content.drops || []); // add inventory rows for any new drops
      await logAudit("cms.content.update", ctx, { chapters: content.chapters.length, drops: content.drops.length });
      sendJson(res, 200, { ok: true });
      return;
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload." });
      return;
    }
  }

  const requestedPlayerId = parsePlayerId(pathname);
  if (requestedPlayerId && req.method === "GET") {
    const playerId = resolveActingPlayer(ctx, pctx, requestedPlayerId);
    if (!playerId) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    store.ensureWallet(playerId); // seed starting coins on first touch
    sendJson(res, 200, { ok: true, profile: buildPlayerProfile(playerId) });
    return;
  }

  if (requestedPlayerId && req.method === "PUT") {
    const playerId = resolveActingPlayer(ctx, pctx, requestedPlayerId);
    if (!playerId) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      const incoming = body?.profile || body;
      const existing = store.getPlayerState(playerId) || createDefaultPlayerProfile(playerId);
      // Wallet, bank and inventory are server-authoritative — they live in the
      // relational tables and are NEVER accepted from the client. Only narrative
      // progress and cosmetic entitlements are client-writable.
      const merged = {
        ...existing,
        trustStatus: existing.trustStatus, // guard against self-promotion
        progress: incoming.progress ?? existing.progress,
        entitlements: {
          codes: Array.isArray(incoming.entitlements?.codes) ? incoming.entitlements.codes : existing.entitlements?.codes || [],
          badges: existing.entitlements?.badges || [],
          earlyAccessFlags: existing.entitlements?.earlyAccessFlags || [],
        },
        playerId,
        updatedAt: new Date().toISOString(),
      };
      store.setPlayerState(playerId, merged);
      sendJson(res, 200, { ok: true, profile: buildPlayerProfile(playerId) });
      return;
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload." });
      return;
    }
  }

  // ---------------- CASE FILE ----------------
  // PUT /api/player/:id/case-file — the card the player writes in Chapter 01.
  //
  // A NARROW route on purpose. PUT /api/player/:id replaces `progress`
  // wholesale, so a client sending only the two trap fields would silently
  // destroy currentLevel, missionProgress, walked and viewed — the player's
  // entire save. Unity needs to write these two fields without holding the
  // whole profile, so it gets a route that can only touch them.
  //
  // The statement is PRIVATE: shown back only to its author, never on the
  // leaderboard, never in community, never to staff.
  const caseFileMatch = pathname.match(/^\/api\/player\/([^/]+)\/case-file$/);
  if (caseFileMatch && req.method === "PUT") {
    const playerId = resolveActingPlayer(ctx, pctx, decodeURIComponent(caseFileMatch[1]));
    if (!playerId) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const state = store.getPlayerState(playerId) || createDefaultPlayerProfile(playerId);
      const progress = { ...(state.progress || {}) };

      // Normalised HERE, not just in the client. The 180-character cap was only
      // ever enforced by a maxlength attribute, which is a suggestion.
      if (body.trapStatement !== undefined) {
        progress.trapStatement = String(body.trapStatement || "").trim().slice(0, TRAP_STATEMENT_MAX);
      }
      if (body.trapAnswer !== undefined) {
        progress.trapAnswer = TRAP_ANSWERS.includes(body.trapAnswer) ? body.trapAnswer : null;
      }

      state.progress = progress;
      state.updatedAt = new Date().toISOString();
      store.setPlayerState(playerId, state);
      sendJson(res, 200, {
        ok: true,
        trapStatement: progress.trapStatement || "",
        trapAnswer: progress.trapAnswer || null,
      });
      return;
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload." });
      return;
    }
  }

  if (pathname === "/api/events" && req.method === "POST") {
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      const event = {
        playerId: body.playerId || "unknown",
        type: body.type || "unknown",
        payload: body.payload || {},
        at: body.at || new Date().toISOString(),
      };
      store.appendEvent(event);
      sendJson(res, 200, { ok: true });
      return;
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid event payload." });
      return;
    }
  }

  if (pathname === "/api/events" && req.method === "GET") {
    const playerFilter = url.searchParams.get("playerId");
    const limit = Number(url.searchParams.get("limit") || 100);
    const rows = store.queryEvents({ playerId: playerFilter, limit });
    sendJson(res, 200, { ok: true, events: rows });
    return;
  }

  // ---------------- CMS ----------------
  if (pathname === "/api/cms/chapters" && req.method === "GET") {
    const content = await readJson(contentFile, defaultContent);
    sendJson(res, 200, { ok: true, chapters: content.chapters || [] });
    return;
  }

  if (pathname === "/api/cms/drops" && req.method === "GET") {
    const content = await readJson(contentFile, defaultContent);
    sendJson(res, 200, { ok: true, drops: content.drops || [] });
    return;
  }

  if (pathname.startsWith("/api/cms/chapters/") && req.method === "PUT") {
    if (!requiresRole(ctx, ["admin", "product"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    const chapterId = decodeURIComponent(pathname.split("/").pop() || "");
    const content = await readJson(contentFile, defaultContent);
    const idx = (content.chapters || []).findIndex((c) => c.id === chapterId);
    if (idx < 0) {
      sendJson(res, 404, { ok: false, error: "chapter not found" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    content.chapters[idx] = { ...content.chapters[idx], ...(body.chapter || body) };
    await writeJson(contentFile, content);
    await logAudit("cms.chapter.update", ctx, { chapterId });
    sendJson(res, 200, { ok: true, chapter: content.chapters[idx] });
    return;
  }

  if (pathname.startsWith("/api/cms/drops/") && req.method === "PUT") {
    if (!requiresRole(ctx, ["admin", "product"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    const dropId = decodeURIComponent(pathname.split("/").pop() || "");
    const content = await readJson(contentFile, defaultContent);
    const idx = (content.drops || []).findIndex((d) => d.id === dropId);
    if (idx < 0) {
      sendJson(res, 404, { ok: false, error: "drop not found" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    content.drops[idx] = { ...content.drops[idx], ...(body.drop || body) };
    await writeJson(contentFile, content);
    await logAudit("cms.drop.update", ctx, { dropId });
    sendJson(res, 200, { ok: true, drop: content.drops[idx] });
    return;
  }

  if (pathname === "/api/cms/publish" && req.method === "POST") {
    if (!requiresRole(ctx, ["admin", "product"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    const releases = await readJson(releasesFile, []);
    const body = JSON.parse((await readBody(req)) || "{}");
    const next = {
      id: `rel_${randomUUID().slice(0, 8)}`,
      notes: body.notes || "Published from CMS",
      by: ctx.user.email,
      at: nowIso(),
    };
    releases.push(next);
    await writeJson(releasesFile, releases);
    await logAudit("cms.publish", ctx, { releaseId: next.id });
    sendJson(res, 201, { ok: true, release: next });
    return;
  }

  // ---------------- COMMERCE ----------------
  if (pathname === "/api/commerce/products" && req.method === "GET") {
    const content = await readJson(contentFile, defaultContent);
    const inventory = store.getInventoryMap();
    const products = (content.drops || []).map((drop) => ({
      ...drop,
      inventory: inventory[drop.id] || { stock: 0, reserved: 0 },
    }));
    sendJson(res, 200, { ok: true, products });
    return;
  }

  if (pathname.startsWith("/api/commerce/products/") && req.method === "PUT") {
    if (!requiresRole(ctx, ["admin", "product", "ops"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    const dropId = decodeURIComponent(pathname.split("/").pop() || "");
    const payload = JSON.parse((await readBody(req)) || "{}");
    const row = store.setInventory(dropId, {
      sku: payload.sku,
      stock: payload.stock,
      reserved: payload.reserved,
    });
    await logAudit("commerce.inventory.update", ctx, { dropId, stock: row.stock, reserved: row.reserved });
    sendJson(res, 200, { ok: true, productInventory: row });
    return;
  }

  if (pathname === "/api/commerce/discounts" && req.method === "GET") {
    sendJson(res, 200, { ok: true, discounts: store.listDiscounts() });
    return;
  }

  if (pathname === "/api/commerce/discounts" && req.method === "POST") {
    if (!requiresRole(ctx, ["admin", "product", "ops"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    const code = String(body.code || "").trim().toUpperCase();
    const value = Number(body.value || 0);
    if (!code || value <= 0) {
      sendJson(res, 400, { ok: false, error: "invalid discount payload" });
      return;
    }
    if (store.findDiscountByCode(code)) {
      sendJson(res, 409, { ok: false, error: "discount code already exists" });
      return;
    }
    const discount = store.createDiscount({
      id: `disc_${randomUUID().slice(0, 8)}`,
      code,
      type: body.type === "fixed" ? "fixed" : "percent",
      value,
      active: body.active === false ? 0 : 1,
      startsAt: body.startsAt || null,
      endsAt: body.endsAt || null,
      maxUses: Number.isFinite(body.maxUses) ? Number(body.maxUses) : null,
      createdAt: nowIso(),
    });
    await logAudit("commerce.discount.create", ctx, { discountId: discount.id, code: discount.code });
    sendJson(res, 201, { ok: true, discount });
    return;
  }

  if (pathname === "/api/commerce/checkout" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const playerIdInput = resolveActingPlayer(ctx, pctx, String(body.playerId || "").trim());
    const items = Array.isArray(body.items) ? body.items : [];
    if (!playerIdInput) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    if (items.length === 0) {
      sendJson(res, 400, { ok: false, error: "items are required" });
      return;
    }
    const content = await readJson(contentFile, defaultContent);
    const dropsById = new Map((content.drops || []).map((d) => [d.id, d]));
    const priceLookup = (dropId) => {
      const drop = dropsById.get(dropId);
      return drop ? { name: drop.name, unitPrice: Number(drop.priceCoins || 0) } : null;
    };

    // Optional store location — validated so purchases can be tied to a place.
    let locationId = null;
    if (body.locationId) {
      const loc = store.getLocation(String(body.locationId));
      if (!loc) {
        sendJson(res, 404, { ok: false, error: "unknown location" });
        return;
      }
      locationId = loc.id;
      for (const item of items) {
        if (!loc.dropIds.includes(item.dropId)) {
          sendJson(res, 409, { ok: false, error: `${loc.name} does not sell ${item.dropId}` });
          return;
        }
      }
    }

    // Resolve + validate a discount code before entering the transaction.
    let discount = null;
    if (body.discountCode) {
      const code = String(body.discountCode).trim().toUpperCase();
      const found = store.findDiscountByCode(code);
      if (found && found.active) {
        const now = new Date();
        const starts = found.startsAt ? new Date(found.startsAt) : null;
        const ends = found.endsAt ? new Date(found.endsAt) : null;
        const withinWindow = (!starts || starts <= now) && (!ends || now <= ends);
        const underUsage = found.maxUses == null || found.used < found.maxUses;
        if (withinWindow && underUsage) discount = found;
      }
    }

    const orderId = `ord_${randomUUID().slice(0, 8)}`;
    let result;
    try {
      result = store.createOrder({ id: orderId, playerId: playerIdInput, items, discount, priceLookup, locationId });
    } catch (error) {
      if (error.code === "UNKNOWN_DROP") {
        sendJson(res, 400, { ok: false, error: error.message });
      } else if (error.code === "OUT_OF_STOCK") {
        sendJson(res, 409, { ok: false, error: error.message });
      } else if (error.code === "INSUFFICIENT_FUNDS") {
        sendJson(res, 402, { ok: false, error: "not enough coins", walletCoins: error.balance });
      } else {
        sendJson(res, 400, { ok: false, error: error.message || "checkout failed" });
      }
      return;
    }

    // Order succeeded — record discount usage now that funds cleared (atomic).
    if (discount) store.consumeDiscount(discount.id);

    await logAudit("commerce.checkout", ctx, { orderId, playerId: playerIdInput, total: result.order.total });
    store.appendEvent({ playerId: playerIdInput, type: "checkout", payload: { orderId, total: result.order.total }, at: nowIso() });
    sendJson(res, 201, {
      ok: true,
      order: result.order,
      walletCoins: result.walletBalance,
      ownedDropIds: store.getOwnedDropIds(playerIdInput),
    });
    return;
  }

  if (pathname === "/api/commerce/orders" && req.method === "GET") {
    // This answered 200 to anybody, with every order in the system and the
    // player id on each one — a customer list, unauthenticated. Staff see
    // everything (and may filter); a player sees their own orders and nobody
    // else's, whatever they put in the query string.
    const requested = url.searchParams.get("playerId");
    if (requiresRole(ctx, ["admin", "ops", "product"])) {
      sendJson(res, 200, { ok: true, orders: store.getOrders(requested || null) });
      return;
    }
    if (!pctx) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    sendJson(res, 200, { ok: true, orders: store.getOrders(pctx.playerId) });
    return;
  }

  if (pathname === "/api/commerce/refunds" && req.method === "POST") {
    if (!requiresRole(ctx, ["admin", "ops"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    const order = store.getOrder(body.orderId);
    if (!order) {
      sendJson(res, 404, { ok: false, error: "order not found" });
      return;
    }
    let outcome;
    try {
      outcome = store.refundOrder({
        orderId: order.id,
        amount: body.amount != null ? Number(body.amount) : undefined,
        reason: body.reason || "manual refund",
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || "refund failed" });
      return;
    }
    const refunds = await readJson(refundsFile, []);
    const refund = {
      id: `ref_${randomUUID().slice(0, 8)}`,
      orderId: order.id,
      playerId: order.playerId,
      amount: outcome.amount,
      reason: body.reason || "manual refund",
      status: "approved",
      walletCoins: outcome.walletBalance,
      createdAt: nowIso(),
    };
    refunds.push(refund);
    await writeJson(refundsFile, refunds);
    await logAudit("commerce.refund.create", ctx, { refundId: refund.id, orderId: refund.orderId, amount: refund.amount });
    sendJson(res, 201, { ok: true, refund });
    return;
  }

  if (pathname === "/api/commerce/fulfillments" && req.method === "POST") {
    if (!requiresRole(ctx, ["admin", "ops"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    const order = store.getOrder(body.orderId);
    if (!order) {
      sendJson(res, 404, { ok: false, error: "order not found" });
      return;
    }
    const fulfillments = await readJson(fulfillmentsFile, []);
    const fulfillment = {
      id: `ful_${randomUUID().slice(0, 8)}`,
      orderId: order.id,
      playerId: order.playerId,
      carrier: body.carrier || "placeholder-carrier",
      tracking: body.tracking || `trk_${randomUUID().slice(0, 12)}`,
      status: body.status || "shipped",
      createdAt: nowIso(),
    };
    fulfillments.push(fulfillment);
    await writeJson(fulfillmentsFile, fulfillments);
    await logAudit("commerce.fulfillment.create", ctx, { fulfillmentId: fulfillment.id, orderId: fulfillment.orderId });
    sendJson(res, 201, { ok: true, fulfillment });
    return;
  }

  // ---------------- REWARDS / ANTI-ABUSE ----------------
  if (pathname === "/api/rewards/claim" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const playerIdInput = resolveActingPlayer(ctx, pctx, String(body.playerId || "").trim());
    if (!playerIdInput) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    if (!body.levelId || !body.missionId) {
      sendJson(res, 400, { ok: false, error: "levelId and missionId are required" });
      return;
    }
    const claimKey = `${playerIdInput}:${body.levelId}:${body.missionId}`;
    // Anti-abuse: cap daily claims per player (dedupe is enforced atomically below).
    const dayStart = `${nowIso().slice(0, 10)}T00:00:00.000Z`;
    if (store.countRewardClaimsSince(playerIdInput, dayStart) >= 200) {
      sendJson(res, 429, { ok: false, error: "daily reward claim limit exceeded" });
      return;
    }

    // The reward is whatever the CATALOGUE says it is. It used to be whatever
    // the request body said it was, which meant a mission worth 150 coins paid
    // 999,999,999 to anyone who asked — the dedupe key stopped a second claim
    // and never looked at the amount. The client may only name WHICH mission it
    // cleared; the server decides what that is worth.
    const content = await readJson(contentFile, defaultContent);
    const chapter = (content.chapters || []).find((c) => c.id === body.levelId);
    const mission = (chapter?.missions || []).find((m) => m.id === body.missionId);
    if (!mission) {
      sendJson(res, 404, { ok: false, error: "unknown mission" });
      return;
    }
    const rewardCoins = Math.max(0, Number(mission.rewardCoins || 0));

    // Same rule for the chapter deal code. A claimed code is an entitlement
    // worth real money off a real garment, so it comes from the chapter, not
    // from the caller. Only the `stash` mission carries one.
    const discountCode = mission.id === "stash" ? (chapter.stash?.code || null) : null;

    // Atomic: dedupe on claimKey and credit the ledger in one transaction.
    const outcome = store.claimReward({
      claimKey,
      playerId: playerIdInput,
      levelId: body.levelId,
      missionId: body.missionId,
      rewardCoins,
      discountCode,
    });
    if (!outcome.claimed) {
      sendJson(res, 409, { ok: false, error: "reward already claimed for this mission", walletCoins: outcome.walletBalance });
      return;
    }

    // Record the earned discount code on the player's entitlements.
    if (discountCode) {
      const state = store.getPlayerState(playerIdInput) || createDefaultPlayerProfile(playerIdInput);
      const codes = new Set(state.entitlements?.codes || []);
      codes.add(String(discountCode));
      state.entitlements = { ...(state.entitlements || {}), codes: [...codes] };
      store.setPlayerState(playerIdInput, state);
    }

    await logAudit("rewards.claim", ctx, { claimKey, playerId: playerIdInput, missionId: body.missionId, rewardCoins });
    // Answer with what was actually granted, not what was asked for. The client
    // credits its own HUD optimistically from the same catalogue, so these
    // normally agree — and when they do not, the server's number is the one
    // that is true and the client can correct itself.
    sendJson(res, 201, { ok: true, walletCoins: outcome.walletBalance, rewardCoins, discountCode });
    return;
  }

  if (pathname === "/api/ops/audit" && req.method === "GET") {
    if (!requiresRole(ctx, ["admin", "ops"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    const limit = Number(url.searchParams.get("limit") || 200);
    const rows = await readJson(auditFile, []);
    sendJson(res, 200, { ok: true, audit: rows.slice(-Math.max(1, limit)) });
    return;
  }

  // ---------------- OPS / ANALYTICS / MODERATION ----------------
  if (pathname === "/api/ops/analytics" && req.method === "GET") {
    if (!requiresRole(ctx, ["admin", "ops"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    const events = await readEvents();
    const orders = store.getOrders();
    const players = store.listStatePlayerIds().map((id) => store.getPlayerState(id) || {});
    const uniqueVisitors = new Set(events.map((e) => e.playerId)).size;
    const purchasers = new Set(orders.map((o) => o.playerId)).size;
    const conversionRate = uniqueVisitors > 0 ? Number(((purchasers / uniqueVisitors) * 100).toFixed(2)) : 0;
    const revenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const retentionProxy = players.filter((p) => Number(p.progress?.levelsCleared || 0) >= 1).length;
    sendJson(res, 200, {
      ok: true,
      metrics: {
        uniqueVisitors,
        purchasers,
        conversionRate,
        revenueCoins: revenue,
        retainedPlayers: retentionProxy,
      },
    });
    return;
  }

  if (pathname === "/api/ops/moderation" && req.method === "GET") {
    if (!requiresRole(ctx, ["admin", "ops"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    sendJson(res, 200, { ok: true, tickets: await readJson(moderationFile, []) });
    return;
  }

  if (pathname === "/api/ops/moderation" && req.method === "POST") {
    if (!requiresRole(ctx, ["admin", "ops", "product"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    const tickets = await readJson(moderationFile, []);
    const ticket = {
      id: `mod_${randomUUID().slice(0, 8)}`,
      type: body.type || "community_story",
      targetId: body.targetId || null,
      reason: body.reason || "manual review",
      status: "open",
      createdBy: ctx.user.email,
      createdAt: nowIso(),
    };
    tickets.push(ticket);
    await writeJson(moderationFile, tickets);
    await logAudit("ops.moderation.create", ctx, { ticketId: ticket.id, type: ticket.type });
    sendJson(res, 201, { ok: true, ticket });
    return;
  }

  if (pathname.startsWith("/api/ops/moderation/") && req.method === "PUT") {
    if (!requiresRole(ctx, ["admin", "ops"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    const ticketId = decodeURIComponent(pathname.split("/").pop() || "");
    const body = JSON.parse((await readBody(req)) || "{}");
    const tickets = await readJson(moderationFile, []);
    const idx = tickets.findIndex((t) => t.id === ticketId);
    if (idx < 0) {
      sendJson(res, 404, { ok: false, error: "ticket not found" });
      return;
    }
    tickets[idx] = {
      ...tickets[idx],
      status: body.status || tickets[idx].status,
      resolution: body.resolution || tickets[idx].resolution || null,
      updatedAt: nowIso(),
    };
    await writeJson(moderationFile, tickets);
    await logAudit("ops.moderation.update", ctx, { ticketId, status: tickets[idx].status });
    sendJson(res, 200, { ok: true, ticket: tickets[idx] });
    return;
  }

  // ---------------- COMMUNITY ----------------
  if (pathname === "/api/community/stories" && req.method === "GET") {
    sendJson(res, 200, { ok: true, stories: await readJson(storiesFile, []) });
    return;
  }

  if (pathname === "/api/community/stories" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const stories = await readJson(storiesFile, []);
    const story = {
      id: `sty_${randomUUID().slice(0, 8)}`,
      playerId: body.playerId || "anonymous",
      title: body.title || "Untitled story",
      body: body.body || "",
      tags: Array.isArray(body.tags) ? body.tags : [],
      status: "pending",
      createdAt: nowIso(),
    };
    stories.push(story);
    await writeJson(storiesFile, stories);
    sendJson(res, 201, { ok: true, story });
    return;
  }

  if (pathname === "/api/community/opportunities" && req.method === "GET") {
    sendJson(res, 200, { ok: true, opportunities: await readJson(opportunitiesFile, []) });
    return;
  }

  if (pathname === "/api/community/opportunities" && req.method === "POST") {
    if (!requiresRole(ctx, ["admin", "ops", "product"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    const opportunities = await readJson(opportunitiesFile, []);
    const item = {
      id: `opp_${randomUUID().slice(0, 8)}`,
      kind: body.kind || "resource",
      title: body.title || "Untitled",
      description: body.description || "",
      link: body.link || null,
      active: body.active !== false,
      createdAt: nowIso(),
    };
    opportunities.push(item);
    await writeJson(opportunitiesFile, opportunities);
    await logAudit("community.opportunity.create", ctx, { opportunityId: item.id });
    sendJson(res, 201, { ok: true, opportunity: item });
    return;
  }

  if (pathname === "/api/community/chapter-events" && req.method === "GET") {
    sendJson(res, 200, { ok: true, events: await readJson(chapterEventsFile, []) });
    return;
  }

  if (pathname === "/api/community/chapter-events" && req.method === "POST") {
    if (!requiresRole(ctx, ["admin", "ops", "product"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    const events = await readJson(chapterEventsFile, []);
    const event = {
      id: `cev_${randomUUID().slice(0, 8)}`,
      chapterId: body.chapterId || null,
      title: body.title || "Untitled event",
      startsAt: body.startsAt || null,
      endsAt: body.endsAt || null,
      active: body.active !== false,
      createdAt: nowIso(),
    };
    events.push(event);
    await writeJson(chapterEventsFile, events);
    await logAudit("community.chapterEvent.create", ctx, { chapterEventId: event.id, chapterId: event.chapterId });
    sendJson(res, 201, { ok: true, event });
    return;
  }

  if (pathname === "/api/community/leaderboard" && req.method === "GET") {
    const ids = new Set([...store.listPlayerIds(), ...store.listStatePlayerIds()]);
    const leaderboard = [...ids]
      .map((id) => {
        const p = store.getPlayerState(id) || {};
        const account = store.getPlayerAccount(id);
        return {
          playerId: id,
          username: account?.username || null,
          levelsCleared: Number(p.progress?.levelsCleared || 0),
          coins: store.getWalletBalance(id),
          trustStatus: p.trustStatus || "standard",
        };
      })
      .sort((a, b) => (b.levelsCleared - a.levelsCleared) || (b.coins - a.coins))
      .slice(0, 100);
    sendJson(res, 200, { ok: true, leaderboard });
    return;
  }

  // ---------------- WALLET ----------------
  // GET /api/wallet/:playerId — authoritative balances + recent ledger.
  const walletMatch = pathname.match(/^\/api\/wallet\/([^/]+)$/);
  if (walletMatch && req.method === "GET") {
    const pid = resolveActingPlayer(ctx, pctx, decodeURIComponent(walletMatch[1]));
    if (!pid) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    store.ensureWallet(pid);
    sendJson(res, 200, {
      ok: true,
      wallet: { coins: store.getWalletBalance(pid) },
      bank: { coins: store.getBankBalance(pid) },
      ledger: store.getLedger(pid, Number(url.searchParams.get("limit") || 50)),
    });
    return;
  }

  // POST /api/wallet/topup — credit coins from nothing.
  //
  // There is no payment processor behind this and there never was: it is the
  // old client's "top-up" button, and on a public deploy it was an unlimited
  // faucet — a million coins a call, as many calls as you like. It is now OFF
  // unless someone deliberately turns it on, because the safe default for a
  // route that creates money is that it does not exist.
  //
  // Set ALLOW_DEV_TOPUP=1 for local work. When real payments land, this route
  // is deleted rather than gated — a purchase will credit coins as a side
  // effect of a settled payment, which is a different route with a receipt.
  if (pathname === "/api/wallet/topup" && req.method === "POST") {
    if (process.env.ALLOW_DEV_TOPUP !== "1") {
      sendJson(res, 404, { ok: false, error: "Not found" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    const pid = resolveActingPlayer(ctx, pctx, String(body.playerId || "").trim());
    const amount = Math.max(1, Math.min(1_000_000, Number(body.amount || 0)));
    if (!pid) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    const out = store.postTransaction({ playerId: pid, account: "cash", delta: amount, reason: "wallet.topup", refType: "topup" });
    store.appendEvent({ playerId: pid, type: "coins_topup", payload: { amount }, at: nowIso() });
    sendJson(res, 200, { ok: true, walletCoins: out.balance });
    return;
  }

  // ---------------- WORLD / LOCATIONS ----------------
  if (pathname === "/api/world/locations" && req.method === "GET") {
    sendJson(res, 200, { ok: true, locations: store.getLocations() });
    return;
  }

  const locationMatch = pathname.match(/^\/api\/world\/locations\/([^/]+)$/);
  if (locationMatch && req.method === "GET") {
    const loc = store.getLocation(decodeURIComponent(locationMatch[1]));
    if (!loc) {
      sendJson(res, 404, { ok: false, error: "location not found" });
      return;
    }
    // For shops, hydrate the products (with live stock) they sell.
    let products = [];
    if (loc.dropIds.length) {
      const content = await readJson(contentFile, defaultContent);
      const dropsById = new Map((content.drops || []).map((d) => [d.id, d]));
      const inventory = store.getInventoryMap();
      products = loc.dropIds
        .map((id) => dropsById.get(id))
        .filter(Boolean)
        .map((drop) => ({ ...drop, inventory: inventory[drop.id] || { stock: 0, reserved: 0 } }));
    }
    sendJson(res, 200, { ok: true, location: { ...loc, products } });
    return;
  }

  // ---------------- BANK ----------------
  const bankMatch = pathname.match(/^\/api\/bank\/([^/]+)$/);
  if (bankMatch && req.method === "GET") {
    const pid = resolveActingPlayer(ctx, pctx, decodeURIComponent(bankMatch[1]));
    if (!pid) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    store.ensureWallet(pid);
    sendJson(res, 200, {
      ok: true,
      account: {
        playerId: pid,
        cash: store.getWalletBalance(pid),
        bank: store.getBankBalance(pid),
      },
    });
    return;
  }

  if ((pathname === "/api/bank/deposit" || pathname === "/api/bank/withdraw") && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const pid = resolveActingPlayer(ctx, pctx, String(body.playerId || "").trim());
    const amount = Number(body.amount || 0);
    if (!pid) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      sendJson(res, 400, { ok: false, error: "a positive amount is required" });
      return;
    }
    const isDeposit = pathname.endsWith("deposit");
    try {
      const out = store.transferInternal({
        playerId: pid,
        from: isDeposit ? "cash" : "bank",
        to: isDeposit ? "bank" : "cash",
        amount,
        reason: isDeposit ? "bank.deposit" : "bank.withdraw",
      });
      store.appendEvent({ playerId: pid, type: isDeposit ? "bank_deposit" : "bank_withdraw", payload: { amount }, at: nowIso() });
      sendJson(res, 200, { ok: true, cash: out.cash, bank: out.bank });
    } catch (error) {
      if (error.code === "INSUFFICIENT_FUNDS") {
        sendJson(res, 402, { ok: false, error: `insufficient ${error.account} balance`, balance: error.balance });
      } else {
        sendJson(res, 400, { ok: false, error: error.message || "bank operation failed" });
      }
    }
    return;
  }

  // POST /api/bank/transfer — send cash from one player to another.
  if (pathname === "/api/bank/transfer" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    // The sender is always the authenticated player — never taken from the body.
    const fromPlayerId = resolveActingPlayer(ctx, pctx, String(body.fromPlayerId || body.playerId || "").trim());
    const toPlayerId = String(body.toPlayerId || "").trim();
    const amount = Number(body.amount || 0);
    if (!fromPlayerId) {
      sendJson(res, 401, { ok: false, error: "player authentication required" });
      return;
    }
    if (!toPlayerId || fromPlayerId === toPlayerId || !Number.isFinite(amount) || amount <= 0) {
      sendJson(res, 400, { ok: false, error: "a different toPlayerId and a positive amount are required" });
      return;
    }
    store.ensureWallet(toPlayerId);
    const transferId = `xfr_${randomUUID().slice(0, 8)}`;
    try {
      const out = store.transferBetweenPlayers({ fromPlayerId, toPlayerId, amount, reason: "bank.transfer", refId: transferId });
      store.appendEvent({ playerId: fromPlayerId, type: "transfer_sent", payload: { toPlayerId, amount, transferId }, at: nowIso() });
      sendJson(res, 200, { ok: true, transferId, fromBalance: out.fromBalance, toBalance: out.toBalance });
    } catch (error) {
      if (error.code === "INSUFFICIENT_FUNDS") {
        sendJson(res, 402, { ok: false, error: "insufficient balance", balance: error.balance });
      } else {
        sendJson(res, 400, { ok: false, error: error.message || "transfer failed" });
      }
    }
    return;
  }

  // Anything that isn't an API call: serve the built front-end (dist/).
  if (req.method === "GET" && !pathname.startsWith("/api/")) {
    if (await serveStatic(req, res, pathname)) return;
    // Unknown route -> fall back to the game shell so deep links still load.
    // This was called with two arguments against a three-argument function, so
    // `pathname` arrived undefined, the read missed, and every deep link 404ed
    // while looking like it was handled.
    if (await serveStatic(req, res, "/index.html")) return;
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
}

async function readEvents() {
  return store.queryEvents({ limit: 5000 });
}

await ensureStorage();

createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    sendJson(res, 500, { ok: false, error: error.message || "Server error" });
  });
}).listen(PORT, () => {
  console.log(`[mock-api] listening on http://localhost:${PORT}`);
});
