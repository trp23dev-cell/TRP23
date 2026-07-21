const API_BASE = `${import.meta.env.VITE_API_ORIGIN || ""}/api`;
const PLAYER_KEY = "trapmadeit.playerId.v1";
const PLAYER_PROFILE_PREFIX = "trapmadeit.playerProfile.";

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
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API request failed: ${res.status}`);
  return res.json();
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
