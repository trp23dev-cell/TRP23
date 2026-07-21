import { apiRequest, setAuthToken } from "../client";

export async function register({ email, password, role = "viewer" }) {
  return apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, role }),
  });
}

export async function login({ email, password }) {
  const result = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setAuthToken(result.token);
  return result;
}

export async function me() {
  return apiRequest("/auth/me");
}

export function logout() {
  setAuthToken(null);
}
