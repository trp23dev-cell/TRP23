import { apiRequest } from "../client";

export const opsApi = {
  getAnalytics: () => apiRequest("/ops/analytics"),
  listModeration: () => apiRequest("/ops/moderation"),
  createModerationTicket: (payload) =>
    apiRequest("/ops/moderation", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateModerationTicket: (ticketId, payload) =>
    apiRequest(`/ops/moderation/${encodeURIComponent(ticketId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  getAuditLog: (limit = 200) => apiRequest(`/ops/audit?limit=${encodeURIComponent(String(limit))}`),
};
