import { apiRequest } from "../client";

export const bankApi = {
  getAccount: (playerId) => apiRequest(`/bank/${encodeURIComponent(playerId)}`),
  deposit: (playerId, amount) =>
    apiRequest("/bank/deposit", {
      method: "POST",
      body: JSON.stringify({ playerId, amount }),
    }),
  withdraw: (playerId, amount) =>
    apiRequest("/bank/withdraw", {
      method: "POST",
      body: JSON.stringify({ playerId, amount }),
    }),
  transfer: (fromPlayerId, toPlayerId, amount) =>
    apiRequest("/bank/transfer", {
      method: "POST",
      body: JSON.stringify({ fromPlayerId, toPlayerId, amount }),
    }),
};
