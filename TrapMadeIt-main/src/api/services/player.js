import { apiRequest } from "../client";

export const playerApi = {
  getProfile: (playerId) => apiRequest(`/player/${encodeURIComponent(playerId)}`),
  saveProfile: (playerId, profile) =>
    apiRequest(`/player/${encodeURIComponent(playerId)}`, {
      method: "PUT",
      body: JSON.stringify({ profile }),
    }),
  trackEvent: (event) =>
    apiRequest("/events", {
      method: "POST",
      body: JSON.stringify(event),
    }),
  listEvents: ({ playerId, limit = 100 } = {}) => {
    const params = new URLSearchParams();
    if (playerId) params.set("playerId", playerId);
    if (limit) params.set("limit", String(limit));
    const query = params.toString();
    return apiRequest(`/events${query ? `?${query}` : ""}`);
  },
  claimReward: (payload) =>
    apiRequest("/rewards/claim", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
