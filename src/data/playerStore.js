const API_BASE = `${import.meta.env.VITE_API_ORIGIN || ""}/api`;
const PLAYER_KEY = "trapmadeit.playerId.v1";
const PLAYER_TOKEN_KEY = "trapmadeit.playerToken.v1";
const PLAYER_PROFILE_PREFIX = "trapmadeit.playerProfile.";

let playerToken = typeof localStorage !== "undefined" ? localStorage.getItem(PLAYER_TOKEN_KEY) : null;

export function getPlayerToken() {
  return playerToken;
}

function setPlayerToken(token) {
  playerToken = token || null;
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(PLAYER_TOKEN_KEY, token);
  else localStorage.removeItem(PLAYER_TOKEN_KEY);
}

// Bootstrap (or reuse) a player session. The server owns the playerId and
// returns a bearer token used to authenticate every economy call. Existing
// anonymous ids are proposed so guest progress carries over on first migration.
export async function ensurePlayerSession() {
  const storedToken = playerToken || (typeof localStorage !== "undefined" ? localStorage.getItem(PLAYER_TOKEN_KEY) : null);
  const storedId = typeof localStorage !== "undefined" ? localStorage.getItem(PLAYER_KEY) : null;
  if (storedToken && storedId) {
    playerToken = storedToken;
    return { playerId: storedId, token: storedToken };
  }
  try {
    const res = await fetch(`${API_BASE}/players/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: storedId || undefined }),
    });
    const data = await res.json();
    if (!res.ok || !data?.playerId || !data?.token) throw new Error("session failed");
    localStorage.setItem(PLAYER_KEY, data.playerId);
    setPlayerToken(data.token);
    return { playerId: data.playerId, token: data.token };
  } catch {
    // Offline fallback: keep playing with a local-only id (no server economy).
    return { playerId: getOrCreatePlayerId(), token: null };
  }
}

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getOrCreatePlayerId() {
  let id = localStorage.getItem(PLAYER_KEY);
  if (id) return id;
  id = `p_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
  localStorage.setItem(PLAYER_KEY, id);
  return id;
}

export function createDefaultPlayerProfile(playerId) {
  const ts = nowIso();
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

function profileKey(playerId) {
  return `${PLAYER_PROFILE_PREFIX}${playerId}`;
}

function readLocalProfile(playerId) {
  try {
    const raw = localStorage.getItem(profileKey(playerId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function writeLocalProfile(profile) {
  localStorage.setItem(profileKey(profile.playerId), JSON.stringify(profile));
}

async function fetchApi(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (playerToken) headers.Authorization = `Bearer ${playerToken}`;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `API request failed: ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function loadPlayerProfile(playerId) {
  const fallback = readLocalProfile(playerId) || createDefaultPlayerProfile(playerId);

  try {
    const data = await fetchApi(`/player/${encodeURIComponent(playerId)}`);
    const profile = data?.profile ? data.profile : fallback;
    writeLocalProfile(profile);
    return profile;
  } catch (_error) {
    return fallback;
  }
}

export async function savePlayerProfile(profile) {
  const next = clone(profile);
  next.updatedAt = nowIso();
  writeLocalProfile(next);

  try {
    await fetchApi(`/player/${encodeURIComponent(next.playerId)}`, {
      method: "PUT",
      body: JSON.stringify({ profile: next }),
    });
    return { ok: true, remoteSynced: true };
  } catch (_error) {
    return { ok: true, remoteSynced: false };
  }
}

// ---------------- SERVER-AUTHORITATIVE ECONOMY ----------------
// These call the backend, which owns the wallet, inventory and ledger. Each
// returns the authoritative balance so the client can reconcile local state.

// Purchase a drop through real checkout (validates stock + funds server-side).
export async function purchaseDrop(playerId, { dropId, locationId, discountCode } = {}) {
  const body = { playerId, items: [{ dropId, qty: 1 }] };
  if (locationId) body.locationId = locationId;
  if (discountCode) body.discountCode = discountCode;
  try {
    const data = await fetchApi("/commerce/checkout", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { ok: true, walletCoins: data.walletCoins, ownedDropIds: data.ownedDropIds, order: data.order };
  } catch (error) {
    return {
      ok: false,
      status: error.status || 0,
      error: error.message,
      walletCoins: error.data?.walletCoins,
    };
  }
}

// Claim a mission/stash reward. The server dedupes by player+level+mission,
// so repeated calls are safe and only credit once.
export async function claimMissionReward(playerId, { levelId, missionId, rewardCoins = 0, discountCode = null } = {}) {
  try {
    const data = await fetchApi("/rewards/claim", {
      method: "POST",
      body: JSON.stringify({ playerId, levelId, missionId, rewardCoins, discountCode }),
    });
    return { ok: true, walletCoins: data.walletCoins };
  } catch (error) {
    // 409 = already claimed; treat as a no-op success (balance unchanged).
    return { ok: false, status: error.status || 0, alreadyClaimed: error.status === 409, error: error.message };
  }
}

function currentPlayerId() {
  return (typeof localStorage !== "undefined" && localStorage.getItem(PLAYER_KEY)) || "me";
}

// ---------------- WORLD ----------------
export async function getWorldLocations() {
  try {
    const data = await fetchApi("/world/locations");
    return { ok: true, locations: data.locations || [] };
  } catch (error) {
    return { ok: false, error: error.message, locations: [] };
  }
}

export async function getLocationDetail(locationId) {
  try {
    const data = await fetchApi(`/world/locations/${encodeURIComponent(locationId)}`);
    return { ok: true, location: data.location };
  } catch (error) {
    return { ok: false, status: error.status || 0, error: error.message };
  }
}

// ---------------- BANK ----------------
export async function getBankAccount() {
  try {
    const data = await fetchApi(`/bank/${encodeURIComponent(currentPlayerId())}`);
    return { ok: true, cash: data.account.cash, bank: data.account.bank };
  } catch (error) {
    return { ok: false, status: error.status || 0, error: error.message };
  }
}

export async function bankDeposit(amount) {
  return bankMove("/bank/deposit", { amount });
}

export async function bankWithdraw(amount) {
  return bankMove("/bank/withdraw", { amount });
}

async function bankMove(path, body) {
  try {
    const data = await fetchApi(path, { method: "POST", body: JSON.stringify(body) });
    return { ok: true, cash: data.cash, bank: data.bank };
  } catch (error) {
    return { ok: false, status: error.status || 0, error: error.message };
  }
}

export async function bankTransfer(toPlayerId, amount) {
  try {
    const data = await fetchApi("/bank/transfer", {
      method: "POST",
      body: JSON.stringify({ toPlayerId, amount }),
    });
    return { ok: true, fromBalance: data.fromBalance, toBalance: data.toBalance, transferId: data.transferId };
  } catch (error) {
    return { ok: false, status: error.status || 0, error: error.message };
  }
}

// Dev/testing top-up. Replace with real payments before launch.
export async function topUpWallet(playerId, amount = 1000) {
  try {
    const data = await fetchApi("/wallet/topup", {
      method: "POST",
      body: JSON.stringify({ playerId, amount }),
    });
    return { ok: true, walletCoins: data.walletCoins };
  } catch (error) {
    return { ok: false, status: error.status || 0, error: error.message };
  }
}

export async function trackPlayerEvent(playerId, type, payload = {}) {
  const event = {
    playerId,
    type,
    payload,
    at: nowIso(),
  };

  try {
    await fetchApi("/events", {
      method: "POST",
      body: JSON.stringify(event),
    });
    return { ok: true, event };
  } catch (_error) {
    return { ok: false, event };
  }
}
