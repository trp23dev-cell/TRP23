const API_BASE = `${import.meta.env.VITE_API_ORIGIN || ""}/api`;
const TOKEN_KEY = "trapmadeit.auth.token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function withHeaders(headers = {}) {
  const token = getToken();
  const base = { "Content-Type": "application/json", ...headers };
  if (token) base.Authorization = `Bearer ${token}`;
  return base;
}

export function setAuthToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: withHeaders(options.headers),
    ...options,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = { ok: false, error: "Invalid API response" };
  }

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed with ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}
