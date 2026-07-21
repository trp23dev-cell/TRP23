import { apiRequest } from "../client";

export const commerceApi = {
  getProducts: () => apiRequest("/commerce/products"),
  updateInventory: (dropId, payload) =>
    apiRequest(`/commerce/products/${encodeURIComponent(dropId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  getDiscounts: () => apiRequest("/commerce/discounts"),
  createDiscount: (payload) =>
    apiRequest("/commerce/discounts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  checkout: (payload) =>
    apiRequest("/commerce/checkout", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getOrders: (playerId) =>
    apiRequest(playerId ? `/commerce/orders?playerId=${encodeURIComponent(playerId)}` : "/commerce/orders"),
  createRefund: (payload) =>
    apiRequest("/commerce/refunds", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createFulfillment: (payload) =>
    apiRequest("/commerce/fulfillments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
