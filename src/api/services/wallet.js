import { apiRequest } from "../client";

export const walletApi = {
  getWallet: (playerId, limit = 50) =>
    apiRequest(`/wallet/${encodeURIComponent(playerId)}?limit=${encodeURIComponent(limit)}`),
  topUp: (playerId, amount) =>
    apiRequest("/wallet/topup", {
      method: "POST",
      body: JSON.stringify({ playerId, amount }),
    }),
};
