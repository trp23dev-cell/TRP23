import Database from "better-sqlite3";

// Central economy constants. Keep in sync with src/data/economy.js on the client.
export const STARTING_COINS = 1600;

// Ordered schema migrations. Each entry brings the DB from version i to i+1.
// NEVER edit or reorder an already-shipped migration — only append new ones.
// `PRAGMA user_version` tracks how many have been applied. Migration 1 is the
// baseline and is written idempotently so pre-migration DBs adopt it cleanly.
const MIGRATIONS = [
  // v1 — baseline economy + world + player-account schema.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv (
        k TEXT PRIMARY KEY,
        v TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playerId TEXT,
        type TEXT,
        payload TEXT,
        at TEXT
      );

      CREATE TABLE IF NOT EXISTS wallets (
        playerId TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bank_accounts (
        playerId TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playerId TEXT NOT NULL,
        account TEXT NOT NULL DEFAULT 'cash',
        delta INTEGER NOT NULL,
        balanceAfter INTEGER NOT NULL,
        reason TEXT NOT NULL,
        refType TEXT,
        refId TEXT,
        at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_player ON ledger(playerId, id);

      CREATE TABLE IF NOT EXISTS inventory (
        dropId TEXT PRIMARY KEY,
        sku TEXT,
        stock INTEGER NOT NULL DEFAULT 0,
        reserved INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        playerId TEXT NOT NULL,
        subtotal INTEGER NOT NULL,
        discountAmount INTEGER NOT NULL DEFAULT 0,
        discountCode TEXT,
        total INTEGER NOT NULL,
        status TEXT NOT NULL,
        locationId TEXT,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_orders_player ON orders(playerId, id);

      CREATE TABLE IF NOT EXISTS order_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderId TEXT NOT NULL,
        dropId TEXT NOT NULL,
        name TEXT,
        qty INTEGER NOT NULL,
        unitPrice INTEGER NOT NULL,
        lineTotal INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lines_order ON order_lines(orderId);

      CREATE TABLE IF NOT EXISTS ownership (
        playerId TEXT NOT NULL,
        dropId TEXT NOT NULL,
        acquiredAt TEXT NOT NULL,
        orderId TEXT,
        PRIMARY KEY (playerId, dropId)
      );

      CREATE TABLE IF NOT EXISTS locations (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        data TEXT NOT NULL,
        sortOrder INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS shop_drops (
        locationId TEXT NOT NULL,
        dropId TEXT NOT NULL,
        PRIMARY KEY (locationId, dropId)
      );

      CREATE TABLE IF NOT EXISTS player_accounts (
        playerId TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        passwordHash TEXT,
        createdAt TEXT NOT NULL,
        lastSeenAt TEXT
      );

      CREATE TABLE IF NOT EXISTS player_sessions (
        token TEXT PRIMARY KEY,
        playerId TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        expiresAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_psession_player ON player_sessions(playerId);
    `);
  },

  // v2 — promote admin users + sessions out of JSON KV blobs into real tables
  // (removes the read-modify-write race on every login) and migrate existing data.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        role TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        token TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        expiresAt TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_user ON admin_sessions(userId);
    `);

    const usersRow = db.prepare("SELECT v FROM kv WHERE k = 'users'").get();
    if (usersRow) {
      let users = [];
      try { users = JSON.parse(usersRow.v) || []; } catch { users = []; }
      const insert = db.prepare("INSERT OR IGNORE INTO admin_users(id, email, passwordHash, role, createdAt) VALUES(?, ?, ?, ?, ?)");
      for (const u of users) {
        if (!u || !u.id || !u.email) continue;
        insert.run(u.id, u.email, u.passwordHash || "", u.role || "viewer", u.createdAt || new Date().toISOString());
      }
    }

    const sessionsRow = db.prepare("SELECT v FROM kv WHERE k = 'sessions'").get();
    if (sessionsRow) {
      let sessions = {};
      try { sessions = JSON.parse(sessionsRow.v) || {}; } catch { sessions = {}; }
      const insert = db.prepare("INSERT OR IGNORE INTO admin_sessions(token, userId, createdAt, expiresAt) VALUES(?, ?, ?, ?)");
      for (const [token, s] of Object.entries(sessions)) {
        if (!s || !s.userId) continue;
        insert.run(token, s.userId, s.createdAt || new Date().toISOString(), s.expiresAt || null);
      }
    }

    // Retire the migrated blobs so they can't drift out of sync with the tables.
    db.prepare("DELETE FROM kv WHERE k IN ('users','sessions')").run();
  },
];

// Apply any migrations the DB has not yet seen, each in its own transaction.
export function runMigrations(db) {
  const current = db.pragma("user_version", { simple: true });
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    const migrate = MIGRATIONS[version];
    const apply = db.transaction(() => {
      migrate(db);
      db.pragma(`user_version = ${version + 1}`);
    });
    apply();
  }
  return db.pragma("user_version", { simple: true });
}

export function createSqliteStore({ dbPath }) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  runMigrations(db);
  const schemaVersion = db.pragma("user_version", { simple: true });

  const getStmt = db.prepare("SELECT v FROM kv WHERE k = ?");
  const upsertStmt = db.prepare("INSERT INTO kv(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v");
  const insertEventStmt = db.prepare("INSERT INTO events(playerId, type, payload, at) VALUES(?, ?, ?, ?)");

  function nowIso() {
    return new Date().toISOString();
  }

  function ensureKey(key, fallback) {
    const existing = getStmt.get(key);
    if (existing) return;
    upsertStmt.run(key, JSON.stringify(fallback));
  }

  function getJson(key, fallback) {
    try {
      const row = getStmt.get(key);
      if (!row) return fallback;
      return JSON.parse(row.v);
    } catch {
      return fallback;
    }
  }

  function setJson(key, value) {
    upsertStmt.run(key, JSON.stringify(value));
  }

  function appendEvent(event) {
    insertEventStmt.run(
      event.playerId || "unknown",
      event.type || "unknown",
      JSON.stringify(event.payload || {}),
      event.at || nowIso(),
    );
  }

  function queryEvents({ playerId = null, limit = 100 } = {}) {
    const safeLimit = Math.max(1, Number(limit || 100));
    let rows;
    if (playerId) {
      rows = db
        .prepare("SELECT playerId, type, payload, at FROM events WHERE playerId = ? ORDER BY id DESC LIMIT ?")
        .all(playerId, safeLimit);
    } else {
      rows = db
        .prepare("SELECT playerId, type, payload, at FROM events ORDER BY id DESC LIMIT ?")
        .all(safeLimit);
    }

    return rows
      .reverse()
      .map((r) => ({
        playerId: r.playerId,
        type: r.type,
        payload: (() => {
          try {
            return JSON.parse(r.payload || "{}");
          } catch {
            return {};
          }
        })(),
        at: r.at,
      }));
  }

  // ---------------- ECONOMY: WALLET + BANK + LEDGER ----------------

  const selectWallet = db.prepare("SELECT balance FROM wallets WHERE playerId = ?");
  const insertWallet = db.prepare("INSERT INTO wallets(playerId, balance, updatedAt) VALUES(?, ?, ?)");
  const updateWallet = db.prepare("UPDATE wallets SET balance = ?, updatedAt = ? WHERE playerId = ?");
  const selectBank = db.prepare("SELECT balance FROM bank_accounts WHERE playerId = ?");
  const insertBank = db.prepare("INSERT INTO bank_accounts(playerId, balance, updatedAt) VALUES(?, ?, ?)");
  const updateBank = db.prepare("UPDATE bank_accounts SET balance = ?, updatedAt = ? WHERE playerId = ?");
  const insertLedger = db.prepare(
    "INSERT INTO ledger(playerId, account, delta, balanceAfter, reason, refType, refId, at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
  );

  // Ensures a wallet row exists, seeding new players with the starting balance.
  function ensureWallet(playerId, startingBalance = STARTING_COINS) {
    const row = selectWallet.get(playerId);
    if (row) return row.balance;
    const at = nowIso();
    insertWallet.run(playerId, startingBalance, at);
    if (startingBalance !== 0) {
      insertLedger.run(playerId, "cash", startingBalance, startingBalance, "wallet.seed", "system", null, at);
    }
    return startingBalance;
  }

  function ensureBank(playerId) {
    const row = selectBank.get(playerId);
    if (row) return row.balance;
    insertBank.run(playerId, 0, nowIso());
    return 0;
  }

  function getWalletBalance(playerId) {
    return ensureWallet(playerId);
  }

  function getBankBalance(playerId) {
    ensureWallet(playerId);
    return ensureBank(playerId);
  }

  // Low-level balance mutation for one account. MUST be called inside a db transaction.
  // Throws { code: 'INSUFFICIENT_FUNDS' } if the move would drive the balance negative.
  function applyBalance(playerId, account, delta, reason, refType, refId, at) {
    const current = account === "bank" ? ensureBank(playerId) : ensureWallet(playerId);
    const next = current + delta;
    if (next < 0) {
      const err = new Error(`insufficient ${account} balance`);
      err.code = "INSUFFICIENT_FUNDS";
      err.account = account;
      err.balance = current;
      err.attempted = delta;
      throw err;
    }
    if (account === "bank") updateBank.run(next, at, playerId);
    else updateWallet.run(next, at, playerId);
    insertLedger.run(playerId, account, delta, next, reason, refType || null, refId || null, at);
    return next;
  }

  // Public: post a single credit/debit to a player's cash or bank, atomically.
  const postTransaction = db.transaction(({ playerId, account = "cash", delta, reason, refType, refId }) => {
    const at = nowIso();
    const balance = applyBalance(playerId, account, delta, reason, refType, refId, at);
    return { playerId, account, balance, delta, at };
  });

  // Move funds between a player's own cash and bank accounts (deposit/withdraw).
  const transferInternal = db.transaction(({ playerId, from, to, amount, reason }) => {
    const at = nowIso();
    if (!Number.isFinite(amount) || amount <= 0) {
      const err = new Error("amount must be positive");
      err.code = "BAD_AMOUNT";
      throw err;
    }
    applyBalance(playerId, from, -amount, reason, "transfer", null, at);
    const toBalance = applyBalance(playerId, to, amount, reason, "transfer", null, at);
    return {
      cash: from === "cash" ? getWalletBalanceUnsafe(playerId) : toBalanceIf(to, "cash", toBalance, playerId),
      bank: from === "bank" ? getBankBalanceUnsafe(playerId) : toBalanceIf(to, "bank", toBalance, playerId),
      at,
    };
  });

  function getWalletBalanceUnsafe(playerId) {
    return selectWallet.get(playerId)?.balance ?? 0;
  }
  function getBankBalanceUnsafe(playerId) {
    return selectBank.get(playerId)?.balance ?? 0;
  }
  function toBalanceIf(to, account, toBalance, playerId) {
    if (to === account) return toBalance;
    return account === "cash" ? getWalletBalanceUnsafe(playerId) : getBankBalanceUnsafe(playerId);
  }

  // Transfer cash between two different players (e.g. player-to-player payment).
  const transferBetweenPlayers = db.transaction(({ fromPlayerId, toPlayerId, amount, reason, refId }) => {
    const at = nowIso();
    if (!Number.isFinite(amount) || amount <= 0) {
      const err = new Error("amount must be positive");
      err.code = "BAD_AMOUNT";
      throw err;
    }
    const fromBalance = applyBalance(fromPlayerId, "cash", -amount, reason || "transfer.out", "transfer", refId, at);
    const toBalance = applyBalance(toPlayerId, "cash", amount, reason || "transfer.in", "transfer", refId, at);
    return { fromBalance, toBalance, at };
  });

  function getLedger(playerId, limit = 100) {
    const safeLimit = Math.max(1, Number(limit || 100));
    return db
      .prepare("SELECT account, delta, balanceAfter, reason, refType, refId, at FROM ledger WHERE playerId = ? ORDER BY id DESC LIMIT ?")
      .all(playerId, safeLimit);
  }

  // ---------------- ECONOMY: INVENTORY ----------------

  const selectInventoryRow = db.prepare("SELECT dropId, sku, stock, reserved, updatedAt FROM inventory WHERE dropId = ?");
  const upsertInventory = db.prepare(`
    INSERT INTO inventory(dropId, sku, stock, reserved, updatedAt)
    VALUES(@dropId, @sku, @stock, @reserved, @updatedAt)
    ON CONFLICT(dropId) DO UPDATE SET sku = excluded.sku, stock = excluded.stock, reserved = excluded.reserved, updatedAt = excluded.updatedAt
  `);

  // Seed inventory rows for any drops that do not yet have one (non-destructive).
  function seedInventory(drops = [], defaultStock = 50) {
    const at = nowIso();
    const insertIfMissing = db.prepare(
      "INSERT OR IGNORE INTO inventory(dropId, sku, stock, reserved, updatedAt) VALUES(?, ?, ?, ?, ?)",
    );
    const tx = db.transaction((list) => {
      for (const drop of list) {
        if (!drop || !drop.id) continue;
        insertIfMissing.run(drop.id, drop.sku || null, defaultStock, 0, at);
      }
    });
    tx(drops);
  }

  function getInventoryMap() {
    const rows = db.prepare("SELECT dropId, sku, stock, reserved, updatedAt FROM inventory").all();
    const map = {};
    for (const r of rows) map[r.dropId] = r;
    return map;
  }

  function getInventoryFor(dropId) {
    return selectInventoryRow.get(dropId) || null;
  }

  function setInventory(dropId, { sku = null, stock = 0, reserved = 0 } = {}) {
    const prev = selectInventoryRow.get(dropId);
    const row = {
      dropId,
      sku: sku ?? prev?.sku ?? null,
      stock: Number.isFinite(stock) ? stock : prev?.stock ?? 0,
      reserved: Number.isFinite(reserved) ? reserved : prev?.reserved ?? 0,
      updatedAt: nowIso(),
    };
    upsertInventory.run(row);
    return row;
  }

  // ---------------- ECONOMY: ORDERS + OWNERSHIP ----------------

  const insertOrder = db.prepare(`
    INSERT INTO orders(id, playerId, subtotal, discountAmount, discountCode, total, status, locationId, createdAt)
    VALUES(@id, @playerId, @subtotal, @discountAmount, @discountCode, @total, @status, @locationId, @createdAt)
  `);
  const insertOrderLine = db.prepare(`
    INSERT INTO order_lines(orderId, dropId, name, qty, unitPrice, lineTotal)
    VALUES(?, ?, ?, ?, ?, ?)
  `);
  const grantOwnership = db.prepare(
    "INSERT OR IGNORE INTO ownership(playerId, dropId, acquiredAt, orderId) VALUES(?, ?, ?, ?)",
  );
  const decrementStock = db.prepare("UPDATE inventory SET stock = stock - ?, updatedAt = ? WHERE dropId = ?");
  const updateOrderStatus = db.prepare("UPDATE orders SET status = ? WHERE id = ?");

  function getOwnedDropIds(playerId) {
    return db
      .prepare("SELECT dropId FROM ownership WHERE playerId = ? ORDER BY acquiredAt")
      .all(playerId)
      .map((r) => r.dropId);
  }

  function getOrder(orderId) {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) return null;
    order.lines = db.prepare("SELECT dropId, name, qty, unitPrice, lineTotal FROM order_lines WHERE orderId = ?").all(orderId);
    return order;
  }

  function getOrders(playerId = null) {
    const rows = playerId
      ? db.prepare("SELECT * FROM orders WHERE playerId = ? ORDER BY id").all(playerId)
      : db.prepare("SELECT * FROM orders ORDER BY id").all();
    for (const order of rows) {
      order.lines = db.prepare("SELECT dropId, name, qty, unitPrice, lineTotal FROM order_lines WHERE orderId = ?").all(order.id);
    }
    return rows;
  }

  // The core purchase: validate stock + funds, spend cash, decrement stock,
  // record order + lines, grant ownership — all atomically in one transaction.
  // `priceLookup(dropId)` returns { name, unitPrice } or null for unknown drops.
  const createOrder = db.transaction(({ id, playerId, items, discount, priceLookup, locationId }) => {
    const at = nowIso();
    let subtotal = 0;
    const lines = [];

    for (const item of items) {
      const qty = Math.max(1, Number(item.qty || 1));
      const info = priceLookup(item.dropId);
      if (!info) {
        const err = new Error(`unknown drop ${item.dropId}`);
        err.code = "UNKNOWN_DROP";
        throw err;
      }
      const inv = selectInventoryRow.get(item.dropId) || { stock: 0 };
      if (inv.stock < qty) {
        const err = new Error(`insufficient stock for ${info.name}`);
        err.code = "OUT_OF_STOCK";
        err.dropId = item.dropId;
        throw err;
      }
      const lineTotal = Number(info.unitPrice || 0) * qty;
      subtotal += lineTotal;
      lines.push({ dropId: item.dropId, name: info.name, qty, unitPrice: info.unitPrice, lineTotal });
    }

    let discountAmount = 0;
    let discountCode = null;
    if (discount) {
      discountCode = discount.code;
      discountAmount = discount.type === "fixed"
        ? Math.min(subtotal, discount.value)
        : Math.round((subtotal * discount.value) / 100);
    }
    const total = Math.max(0, subtotal - discountAmount);

    // Spend cash first — throws INSUFFICIENT_FUNDS and rolls back the whole tx if short.
    const walletBalance = applyBalance(playerId, "cash", -total, "commerce.checkout", "order", id, at);

    insertOrder.run({
      id, playerId, subtotal, discountAmount, discountCode, total,
      status: "paid", locationId: locationId || null, createdAt: at,
    });
    for (const line of lines) {
      insertOrderLine.run(id, line.dropId, line.name, line.qty, line.unitPrice, line.lineTotal);
      decrementStock.run(line.qty, at, line.dropId);
      grantOwnership.run(playerId, line.dropId, at, id);
    }

    return {
      order: { id, playerId, lines, subtotal, discountAmount, discountCode, total, status: "paid", locationId: locationId || null, createdAt: at },
      walletBalance,
    };
  });

  // Refund an order: credit cash back and mark it refunded, atomically.
  const refundOrder = db.transaction(({ orderId, amount, reason }) => {
    const at = nowIso();
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    if (!order) {
      const err = new Error("order not found");
      err.code = "ORDER_NOT_FOUND";
      throw err;
    }
    const refundAmount = Number.isFinite(amount) ? amount : order.total;
    const walletBalance = applyBalance(order.playerId, "cash", refundAmount, reason || "commerce.refund", "order", orderId, at);
    updateOrderStatus.run("refunded", orderId);
    return { playerId: order.playerId, amount: refundAmount, walletBalance, at };
  });

  // ---------------- WORLD: LOCATIONS + SHOPS ----------------

  const upsertLocation = db.prepare(`
    INSERT INTO locations(id, kind, data, sortOrder)
    VALUES(@id, @kind, @data, @sortOrder)
    ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, data = excluded.data, sortOrder = excluded.sortOrder
  `);
  const insertShopDrop = db.prepare("INSERT OR IGNORE INTO shop_drops(locationId, dropId) VALUES(?, ?)");

  // Seed world locations only if none exist yet (non-destructive first-run seed).
  function seedLocations(locations = []) {
    const count = db.prepare("SELECT COUNT(*) AS n FROM locations").get().n;
    if (count > 0) return;
    const tx = db.transaction((list) => {
      list.forEach((loc, i) => {
        const { drops = [], ...rest } = loc;
        upsertLocation.run({
          id: loc.id,
          kind: loc.kind || "shop",
          data: JSON.stringify(rest),
          sortOrder: typeof loc.sortOrder === "number" ? loc.sortOrder : i,
        });
        for (const dropId of drops) insertShopDrop.run(loc.id, dropId);
      });
    });
    tx(locations);
  }

  function getLocations() {
    const rows = db.prepare("SELECT id, kind, data, sortOrder FROM locations ORDER BY sortOrder, id").all();
    return rows.map((r) => hydrateLocation(r));
  }

  function getLocation(id) {
    const r = db.prepare("SELECT id, kind, data, sortOrder FROM locations WHERE id = ?").get(id);
    return r ? hydrateLocation(r) : null;
  }

  // ---------------- PLAYER ACCOUNTS + SESSIONS ----------------

  const insertPlayerAccount = db.prepare(
    "INSERT OR IGNORE INTO player_accounts(playerId, createdAt, lastSeenAt) VALUES(?, ?, ?)",
  );
  const selectPlayerAccount = db.prepare("SELECT playerId, email, passwordHash, createdAt, lastSeenAt FROM player_accounts WHERE playerId = ?");
  const selectPlayerByEmail = db.prepare("SELECT playerId, email, passwordHash, createdAt, lastSeenAt FROM player_accounts WHERE email = ?");
  const setCredentials = db.prepare("UPDATE player_accounts SET email = ?, passwordHash = ? WHERE playerId = ?");
  const touchPlayer = db.prepare("UPDATE player_accounts SET lastSeenAt = ? WHERE playerId = ?");
  const insertPlayerSession = db.prepare("INSERT INTO player_sessions(token, playerId, createdAt, expiresAt) VALUES(?, ?, ?, ?)");
  const selectPlayerSession = db.prepare("SELECT token, playerId, createdAt, expiresAt FROM player_sessions WHERE token = ?");
  const deletePlayerSessionStmt = db.prepare("DELETE FROM player_sessions WHERE token = ?");

  function ensurePlayerAccount(playerId) {
    const at = nowIso();
    insertPlayerAccount.run(playerId, at, at);
    return selectPlayerAccount.get(playerId);
  }

  function playerAccountExists(playerId) {
    return !!selectPlayerAccount.get(playerId);
  }

  function getPlayerAccount(playerId) {
    return selectPlayerAccount.get(playerId) || null;
  }

  function findPlayerByEmail(email) {
    return selectPlayerByEmail.get(email) || null;
  }

  function setPlayerCredentials(playerId, email, passwordHash) {
    setCredentials.run(email, passwordHash, playerId);
    return selectPlayerAccount.get(playerId);
  }

  function markPlayerSeen(playerId) {
    touchPlayer.run(nowIso(), playerId);
  }

  function createPlayerSession(token, playerId, expiresAt) {
    insertPlayerSession.run(token, playerId, nowIso(), expiresAt || null);
    return { token, playerId, expiresAt: expiresAt || null };
  }

  function getPlayerSession(token) {
    return selectPlayerSession.get(token) || null;
  }

  function deletePlayerSession(token) {
    deletePlayerSessionStmt.run(token);
  }

  function listPlayerIds() {
    return db.prepare("SELECT playerId FROM player_accounts ORDER BY createdAt").all().map((r) => r.playerId);
  }

  // ---------------- ADMIN USERS + SESSIONS ----------------

  const insertAdminUser = db.prepare("INSERT INTO admin_users(id, email, passwordHash, role, createdAt) VALUES(@id, @email, @passwordHash, @role, @createdAt)");
  const selectAdminByEmail = db.prepare("SELECT id, email, passwordHash, role, createdAt FROM admin_users WHERE email = ?");
  const selectAdminById = db.prepare("SELECT id, email, passwordHash, role, createdAt FROM admin_users WHERE id = ?");
  const updateAdminHash = db.prepare("UPDATE admin_users SET passwordHash = ? WHERE id = ?");
  const deleteAdminByEmail = db.prepare("DELETE FROM admin_users WHERE email = ?");
  const insertAdminSession = db.prepare("INSERT INTO admin_sessions(token, userId, createdAt, expiresAt) VALUES(?, ?, ?, ?)");
  const selectAdminSession = db.prepare("SELECT token, userId, createdAt, expiresAt FROM admin_sessions WHERE token = ?");
  const deleteAdminSessionStmt = db.prepare("DELETE FROM admin_sessions WHERE token = ?");
  const deleteAdminSessionsForUser = db.prepare("DELETE FROM admin_sessions WHERE userId = ?");

  function createAdminUser(user) {
    insertAdminUser.run(user);
    return user;
  }
  function findAdminUserByEmail(email) {
    return selectAdminByEmail.get(email) || null;
  }
  function findAdminUserById(id) {
    return selectAdminById.get(id) || null;
  }
  function updateAdminPasswordHash(id, passwordHash) {
    updateAdminHash.run(passwordHash, id);
  }
  function createAdminSession(token, userId, expiresAt) {
    insertAdminSession.run(token, userId, nowIso(), expiresAt || null);
    return { token, userId, expiresAt: expiresAt || null };
  }
  function getAdminSession(token) {
    return selectAdminSession.get(token) || null;
  }
  function deleteAdminSession(token) {
    deleteAdminSessionStmt.run(token);
  }
  // Remove a user by email and drop their sessions (used by the prod safety valve).
  const removeAdminByEmail = db.transaction((email) => {
    const user = selectAdminByEmail.get(email);
    if (!user) return false;
    deleteAdminSessionsForUser.run(user.id);
    deleteAdminByEmail.run(email);
    return true;
  });

  function hydrateLocation(r) {
    let data = {};
    try {
      data = JSON.parse(r.data || "{}");
    } catch {
      data = {};
    }
    const dropIds = db.prepare("SELECT dropId FROM shop_drops WHERE locationId = ?").all(r.id).map((x) => x.dropId);
    return { id: r.id, kind: r.kind, sortOrder: r.sortOrder, dropIds, ...data };
  }

  return {
    schemaVersion,
    getSchemaVersion: () => db.pragma("user_version", { simple: true }),
    // KV + events
    ensureKey,
    getJson,
    setJson,
    appendEvent,
    queryEvents,
    // wallet / bank / ledger
    ensureWallet,
    ensureBank,
    getWalletBalance,
    getBankBalance,
    postTransaction,
    transferInternal,
    transferBetweenPlayers,
    getLedger,
    // inventory
    seedInventory,
    getInventoryMap,
    getInventoryFor,
    setInventory,
    // orders / ownership
    createOrder,
    refundOrder,
    getOrder,
    getOrders,
    getOwnedDropIds,
    // world
    seedLocations,
    getLocations,
    getLocation,
    // player accounts + sessions
    ensurePlayerAccount,
    playerAccountExists,
    getPlayerAccount,
    findPlayerByEmail,
    setPlayerCredentials,
    markPlayerSeen,
    createPlayerSession,
    getPlayerSession,
    deletePlayerSession,
    listPlayerIds,
    // admin users + sessions
    createAdminUser,
    findAdminUserByEmail,
    findAdminUserById,
    updateAdminPasswordHash,
    createAdminSession,
    getAdminSession,
    deleteAdminSession,
    removeAdminByEmail,
  };
}
