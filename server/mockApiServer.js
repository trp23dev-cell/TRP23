import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { defaultContent } from "../src/data/defaultContent.js";
import { defaultWorld } from "../src/data/defaultWorld.js";
import { createSqliteStore, STARTING_COINS } from "./storage/sqliteStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storageDir = path.join(__dirname, "storage");
const dbFile = path.join(storageDir, "trapmadeit.db");
const contentFile = "content";
const playersFile = "players";
const discountsFile = "discounts";
const refundsFile = "refunds";
const fulfillmentsFile = "fulfillments";
const releasesFile = "releases";
const rewardClaimsFile = "rewardClaims";
const moderationFile = "moderation";
const storiesFile = "stories";
const opportunitiesFile = "opportunities";
const chapterEventsFile = "chapterEvents";
const auditFile = "audit";
const PORT = Number(process.env.MOCK_API_PORT || 8787);
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
  const players = store.getJson(playersFile, {});
  const base = players[playerId] || createDefaultPlayerProfile(playerId);
  return {
    ...base,
    playerId,
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
  store = createSqliteStore({ dbPath: dbFile });
  store.ensureKey(contentFile, defaultContent);
  store.ensureKey(playersFile, {});
  for (const file of [discountsFile, refundsFile, fulfillmentsFile, releasesFile, rewardClaimsFile, moderationFile, storiesFile, opportunitiesFile, chapterEventsFile]) {
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
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,PUT,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(payload));
}

function parsePlayerId(pathname) {
  const match = pathname.match(/^\/api\/player\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function handleRequest(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,PUT,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;
  const ctx = await authContext(req);
  const pctx = playerAuthContext(req);

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "mock-api", schemaVersion: store.getSchemaVersion() });
    return;
  }

  // ---------------- AUTH ----------------
  if (req.method === "POST" && pathname === "/api/auth/register") {
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const role = ["admin", "ops", "product", "viewer"].includes(body.role) ? body.role : "viewer";
      if (!email || !password) {
        sendJson(res, 400, { ok: false, error: "email and password are required" });
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
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = store.findAdminUserByEmail(email);
      if (!user || !verifyAdminPassword(password, user.passwordHash)) {
        sendJson(res, 401, { ok: false, error: "invalid credentials" });
        return;
      }
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

  // Upgrade a guest (or create a new account) with email + password.
  if (req.method === "POST" && pathname === "/api/players/register") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!email || password.length < 6) {
      sendJson(res, 400, { ok: false, error: "email and a password of at least 6 characters are required" });
      return;
    }
    if (store.findPlayerByEmail(email)) {
      sendJson(res, 409, { ok: false, error: "email already registered" });
      return;
    }
    // Link to the currently authenticated guest player, or create a fresh one.
    let playerId = pctx?.playerId;
    if (!playerId) {
      playerId = `p_${randomUUID().slice(0, 8)}${randomBytes(4).toString("hex")}`;
      store.ensurePlayerAccount(playerId);
      store.ensureWallet(playerId);
    } else {
      store.ensurePlayerAccount(playerId);
    }
    store.setPlayerCredentials(playerId, email, hashPlayerPassword(password));
    const { token, expiresAt } = issuePlayerSession(playerId);
    sendJson(res, 201, { ok: true, playerId, token, expiresAt });
    return;
  }

  // Log in to an existing credentialed player account.
  if (req.method === "POST" && pathname === "/api/players/login") {
    const body = JSON.parse((await readBody(req)) || "{}");
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const account = store.findPlayerByEmail(email);
    if (!account || !verifyPlayerPassword(password, account.passwordHash)) {
      sendJson(res, 401, { ok: false, error: "invalid credentials" });
      return;
    }
    store.markPlayerSeen(account.playerId);
    const { token, expiresAt } = issuePlayerSession(account.playerId);
    sendJson(res, 200, { ok: true, playerId: account.playerId, token, expiresAt });
    return;
  }

  if (req.method === "GET" && pathname === "/api/players/me") {
    if (!pctx) {
      sendJson(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    const account = store.getPlayerAccount(pctx.playerId);
    sendJson(res, 200, {
      ok: true,
      playerId: pctx.playerId,
      email: account?.email || null,
      isGuest: !account?.email,
    });
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
      const players = await readJson(playersFile, {});
      const existing = players[playerId] || createDefaultPlayerProfile(playerId);
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
      players[playerId] = merged;
      await writeJson(playersFile, players);
      sendJson(res, 200, { ok: true, profile: buildPlayerProfile(playerId) });
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
    sendJson(res, 200, { ok: true, discounts: await readJson(discountsFile, []) });
    return;
  }

  if (pathname === "/api/commerce/discounts" && req.method === "POST") {
    if (!requiresRole(ctx, ["admin", "product", "ops"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    const discount = {
      id: `disc_${randomUUID().slice(0, 8)}`,
      code: String(body.code || "").trim().toUpperCase(),
      type: body.type === "fixed" ? "fixed" : "percent",
      value: Number(body.value || 0),
      active: body.active !== false,
      startsAt: body.startsAt || null,
      endsAt: body.endsAt || null,
      maxUses: Number.isFinite(body.maxUses) ? Number(body.maxUses) : null,
      used: 0,
      createdAt: nowIso(),
    };
    if (!discount.code || discount.value <= 0) {
      sendJson(res, 400, { ok: false, error: "invalid discount payload" });
      return;
    }
    const discounts = await readJson(discountsFile, []);
    discounts.push(discount);
    await writeJson(discountsFile, discounts);
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
    const discounts = await readJson(discountsFile, []);
    if (body.discountCode) {
      const code = String(body.discountCode).trim().toUpperCase();
      const found = discounts.find((d) => d.code === code && d.active !== false);
      if (found) {
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

    // Order succeeded — record discount usage now that funds cleared.
    if (discount) {
      discount.used = Number(discount.used || 0) + 1;
      await writeJson(discountsFile, discounts);
    }

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
    const playerFilter = url.searchParams.get("playerId");
    sendJson(res, 200, { ok: true, orders: store.getOrders(playerFilter || null) });
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
    const claims = await readJson(rewardClaimsFile, []);
    const claimKey = `${playerIdInput}:${body.levelId}:${body.missionId}`;
    if (claims.some((c) => c.claimKey === claimKey)) {
      sendJson(res, 409, { ok: false, error: "reward already claimed for this mission" });
      return;
    }

    const todayCount = claims.filter((c) => c.playerId === playerIdInput && c.at.startsWith(nowIso().slice(0, 10))).length;
    if (todayCount > 100) {
      sendJson(res, 429, { ok: false, error: "daily reward claim limit exceeded" });
      return;
    }

    const players = await readJson(playersFile, {});
    const player = players[playerIdInput] || createDefaultPlayerProfile(playerIdInput);
    const rewardCoins = Math.max(0, Number(body.rewardCoins || 0));
    // Credit the reward through the ledger so the wallet stays authoritative.
    let walletBalance = store.getWalletBalance(playerIdInput);
    if (rewardCoins > 0) {
      walletBalance = store.postTransaction({
        playerId: playerIdInput,
        account: "cash",
        delta: rewardCoins,
        reason: "rewards.claim",
        refType: "mission",
        refId: `${body.levelId}:${body.missionId}`,
      }).balance;
    }
    if (body.discountCode) {
      const codes = new Set(player.entitlements?.codes || []);
      codes.add(String(body.discountCode));
      player.entitlements = { ...(player.entitlements || {}), codes: [...codes] };
      players[playerIdInput] = player;
      await writeJson(playersFile, players);
    }

    const claim = {
      id: `clm_${randomUUID().slice(0, 8)}`,
      claimKey,
      playerId: playerIdInput,
      levelId: body.levelId,
      missionId: body.missionId,
      rewardCoins,
      discountCode: body.discountCode || null,
      at: nowIso(),
    };
    claims.push(claim);
    await writeJson(rewardClaimsFile, claims);
    await logAudit("rewards.claim", ctx, { claimId: claim.id, playerId: playerIdInput, missionId: claim.missionId });
    sendJson(res, 201, { ok: true, claim, walletCoins: walletBalance });
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
    const players = Object.values(await readJson(playersFile, {}));
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
    const progressBlob = await readJson(playersFile, {});
    const ids = store.listPlayerIds();
    // Include any legacy players that only exist in the KV progress blob.
    for (const id of Object.keys(progressBlob)) if (!ids.includes(id)) ids.push(id);
    const leaderboard = ids
      .map((id) => {
        const p = progressBlob[id] || {};
        return {
          playerId: id,
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

  // POST /api/wallet/topup — credit coins. Dev/testing affordance (the old
  // client "top-up" button). Gate/replace with real payments before launch.
  if (pathname === "/api/wallet/topup" && req.method === "POST") {
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
