import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { defaultContent } from "../src/data/defaultContent.js";
import { createSqliteStore } from "./storage/sqliteStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storageDir = path.join(__dirname, "storage");
const dbFile = path.join(storageDir, "trapmadeit.db");
const contentFile = "content";
const playersFile = "players";
const usersFile = "users";
const sessionsFile = "sessions";
const inventoryFile = "inventory";
const ordersFile = "orders";
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
    wallet: { coins: 1600 },
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

function hashPassword(password) {
  return createHash("sha256").update(password).digest("hex");
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function buildDefaultInventory(content) {
  const inv = {};
  for (const drop of content.drops || []) {
    inv[drop.id] = {
      dropId: drop.id,
      sku: drop.sku || null,
      stock: 50,
      reserved: 0,
      updatedAt: nowIso(),
    };
  }
  return inv;
}

function parseBearerToken(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

async function authContext(req) {
  const token = parseBearerToken(req);
  if (!token) return null;
  const sessions = await readJson(sessionsFile, {});
  const users = await readJson(usersFile, []);
  const session = sessions[token];
  if (!session) return null;
  if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
    delete sessions[token];
    await writeJson(sessionsFile, sessions);
    return null;
  }
  const user = users.find((u) => u.id === session.userId);
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
  store.ensureKey(usersFile, []);
  store.ensureKey(sessionsFile, {});
  store.ensureKey(inventoryFile, buildDefaultInventory(defaultContent));
  for (const file of [ordersFile, discountsFile, refundsFile, fulfillmentsFile, releasesFile, rewardClaimsFile, moderationFile, storiesFile, opportunitiesFile, chapterEventsFile]) {
    store.ensureKey(file, []);
  }
  store.ensureKey(auditFile, []);

  // Safety valve for hosted deployments that may re-use an older local DB snapshot.
  if (process.env.NODE_ENV === "production") {
    const users = await readJson(usersFile, []);
    const filteredUsers = users.filter((u) => u.email !== LEGACY_DEFAULT_ADMIN_EMAIL);
    if (filteredUsers.length !== users.length) {
      await writeJson(usersFile, filteredUsers);
      const removedIds = new Set(users.filter((u) => u.email === LEGACY_DEFAULT_ADMIN_EMAIL).map((u) => u.id));
      const sessions = await readJson(sessionsFile, {});
      for (const [token, session] of Object.entries(sessions)) {
        if (removedIds.has(session.userId)) delete sessions[token];
      }
      await writeJson(sessionsFile, sessions);
    }
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

  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "mock-api" });
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
      const users = await readJson(usersFile, []);
      if (users.some((u) => u.email === email)) {
        sendJson(res, 409, { ok: false, error: "email already exists" });
        return;
      }
      const user = {
        id: `u_${randomUUID().slice(0, 8)}`,
        email,
        passwordHash: hashPassword(password),
        role,
        createdAt: nowIso(),
      };
      users.push(user);
      await writeJson(usersFile, users);
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
      const users = await readJson(usersFile, []);
      const user = users.find((u) => u.email === email && u.passwordHash === hashPassword(password));
      if (!user) {
        sendJson(res, 401, { ok: false, error: "invalid credentials" });
        return;
      }
      const token = `t_${randomUUID().replace(/-/g, "")}`;
      const sessions = await readJson(sessionsFile, {});
      sessions[token] = {
        userId: user.id,
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
      };
      await writeJson(sessionsFile, sessions);
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
      await writeJson(inventoryFile, { ...(await readJson(inventoryFile, {})), ...buildDefaultInventory(content) });
      await logAudit("cms.content.update", ctx, { chapters: content.chapters.length, drops: content.drops.length });
      sendJson(res, 200, { ok: true });
      return;
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid JSON payload." });
      return;
    }
  }

  const playerId = parsePlayerId(pathname);
  if (playerId && req.method === "GET") {
    const players = await readJson(playersFile, {});
    if (!players[playerId]) {
      players[playerId] = createDefaultPlayerProfile(playerId);
      await writeJson(playersFile, players);
    }
    sendJson(res, 200, { ok: true, profile: players[playerId] });
    return;
  }

  if (playerId && req.method === "PUT") {
    try {
      const body = JSON.parse(await readBody(req) || "{}");
      const incoming = body?.profile || body;
      const players = await readJson(playersFile, {});
      const existing = players[playerId] || createDefaultPlayerProfile(playerId);
      const merged = {
        ...existing,
        ...incoming,
        playerId,
        updatedAt: new Date().toISOString(),
      };
      players[playerId] = merged;
      await writeJson(playersFile, players);
      sendJson(res, 200, { ok: true, profile: merged });
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
    const inventory = await readJson(inventoryFile, {});
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
    const inventory = await readJson(inventoryFile, {});
    const prev = inventory[dropId] || { dropId, stock: 0, reserved: 0 };
    inventory[dropId] = {
      ...prev,
      stock: typeof payload.stock === "number" ? payload.stock : prev.stock,
      reserved: typeof payload.reserved === "number" ? payload.reserved : prev.reserved,
      updatedAt: nowIso(),
    };
    await writeJson(inventoryFile, inventory);
    await logAudit("commerce.inventory.update", ctx, { dropId, stock: inventory[dropId].stock, reserved: inventory[dropId].reserved });
    sendJson(res, 200, { ok: true, productInventory: inventory[dropId] });
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
    const playerIdInput = String(body.playerId || "").trim();
    const items = Array.isArray(body.items) ? body.items : [];
    if (!playerIdInput || items.length === 0) {
      sendJson(res, 400, { ok: false, error: "playerId and items are required" });
      return;
    }
    const content = await readJson(contentFile, defaultContent);
    const inventory = await readJson(inventoryFile, {});
    const discounts = await readJson(discountsFile, []);
    const orders = await readJson(ordersFile, []);
    const players = await readJson(playersFile, {});
    const player = players[playerIdInput] || createDefaultPlayerProfile(playerIdInput);

    let subtotal = 0;
    const lines = [];
    for (const item of items) {
      const drop = (content.drops || []).find((d) => d.id === item.dropId);
      const qty = Math.max(1, Number(item.qty || 1));
      if (!drop) {
        sendJson(res, 400, { ok: false, error: `unknown drop ${item.dropId}` });
        return;
      }
      const inv = inventory[drop.id] || { stock: 0, reserved: 0 };
      if (inv.stock < qty) {
        sendJson(res, 409, { ok: false, error: `insufficient stock for ${drop.name}` });
        return;
      }
      const lineTotal = Number(drop.priceCoins || 0) * qty;
      subtotal += lineTotal;
      lines.push({ dropId: drop.id, name: drop.name, qty, unitPrice: drop.priceCoins, lineTotal });
    }

    let discountAmount = 0;
    let appliedDiscountCode = null;
    if (body.discountCode) {
      const code = String(body.discountCode).trim().toUpperCase();
      const discount = discounts.find((d) => d.code === code && d.active !== false);
      if (discount) {
        const now = new Date();
        const starts = discount.startsAt ? new Date(discount.startsAt) : null;
        const ends = discount.endsAt ? new Date(discount.endsAt) : null;
        const withinWindow = (!starts || starts <= now) && (!ends || now <= ends);
        const underUsage = discount.maxUses == null || discount.used < discount.maxUses;
        if (withinWindow && underUsage) {
          appliedDiscountCode = code;
          discountAmount = discount.type === "fixed"
            ? Math.min(subtotal, discount.value)
            : Math.round((subtotal * discount.value) / 100);
          discount.used += 1;
          await writeJson(discountsFile, discounts);
        }
      }
    }

    const total = Math.max(0, subtotal - discountAmount);
    const order = {
      id: `ord_${randomUUID().slice(0, 8)}`,
      playerId: playerIdInput,
      lines,
      subtotal,
      discountAmount,
      discountCode: appliedDiscountCode,
      total,
      status: "paid",
      createdAt: nowIso(),
    };
    orders.push(order);
    await writeJson(ordersFile, orders);
    await logAudit("commerce.checkout", ctx, { orderId: order.id, playerId: playerIdInput, total });

    for (const line of lines) {
      inventory[line.dropId].stock -= line.qty;
      inventory[line.dropId].updatedAt = nowIso();
    }
    await writeJson(inventoryFile, inventory);

    player.inventory.ownedDropIds = Array.from(new Set([...(player.inventory.ownedDropIds || []), ...lines.map((l) => l.dropId)]));
    players[playerIdInput] = player;
    await writeJson(playersFile, players);

    store.appendEvent({ playerId: playerIdInput, type: "checkout", payload: { orderId: order.id, total }, at: nowIso() });
    sendJson(res, 201, { ok: true, order });
    return;
  }

  if (pathname === "/api/commerce/orders" && req.method === "GET") {
    const orders = await readJson(ordersFile, []);
    const playerFilter = url.searchParams.get("playerId");
    const filtered = playerFilter ? orders.filter((o) => o.playerId === playerFilter) : orders;
    sendJson(res, 200, { ok: true, orders: filtered });
    return;
  }

  if (pathname === "/api/commerce/refunds" && req.method === "POST") {
    if (!requiresRole(ctx, ["admin", "ops"])) {
      sendJson(res, 403, { ok: false, error: "forbidden" });
      return;
    }
    const body = JSON.parse((await readBody(req)) || "{}");
    const orders = await readJson(ordersFile, []);
    const order = orders.find((o) => o.id === body.orderId);
    if (!order) {
      sendJson(res, 404, { ok: false, error: "order not found" });
      return;
    }
    const refunds = await readJson(refundsFile, []);
    const refund = {
      id: `ref_${randomUUID().slice(0, 8)}`,
      orderId: order.id,
      playerId: order.playerId,
      amount: Number(body.amount || order.total),
      reason: body.reason || "manual refund",
      status: "approved",
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
    const orders = await readJson(ordersFile, []);
    const order = orders.find((o) => o.id === body.orderId);
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
    const playerIdInput = String(body.playerId || "").trim();
    if (!playerIdInput || !body.levelId || !body.missionId) {
      sendJson(res, 400, { ok: false, error: "playerId, levelId and missionId are required" });
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
    const rewardCoins = Number(body.rewardCoins || 0);
    if (rewardCoins > 0) player.wallet.coins = Number(player.wallet.coins || 0) + rewardCoins;
    if (body.discountCode) {
      const codes = new Set(player.entitlements?.codes || []);
      codes.add(String(body.discountCode));
      player.entitlements.codes = [...codes];
    }
    players[playerIdInput] = player;
    await writeJson(playersFile, players);

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
    sendJson(res, 201, { ok: true, claim, walletCoins: player.wallet.coins });
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
    const orders = await readJson(ordersFile, []);
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
    const players = Object.values(await readJson(playersFile, {}));
    const leaderboard = players
      .map((p) => ({
        playerId: p.playerId,
        levelsCleared: Number(p.progress?.levelsCleared || 0),
        coins: Number(p.wallet?.coins || 0),
        trustStatus: p.trustStatus || "standard",
      }))
      .sort((a, b) => (b.levelsCleared - a.levelsCleared) || (b.coins - a.coins))
      .slice(0, 100);
    sendJson(res, 200, { ok: true, leaderboard });
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
