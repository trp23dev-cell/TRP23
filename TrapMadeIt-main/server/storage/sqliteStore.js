import Database from "better-sqlite3";

export function createSqliteStore({ dbPath }) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");

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
  `);

  const getStmt = db.prepare("SELECT v FROM kv WHERE k = ?");
  const upsertStmt = db.prepare("INSERT INTO kv(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v");
  const insertEventStmt = db.prepare("INSERT INTO events(playerId, type, payload, at) VALUES(?, ?, ?, ?)");

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
      event.at || new Date().toISOString(),
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

  return {
    ensureKey,
    getJson,
    setJson,
    appendEvent,
    queryEvents,
  };
}
