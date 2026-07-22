import { apiRequest } from "../client";

export const worldApi = {
  listLocations: () => apiRequest("/world/locations"),
  getLocation: (locationId) => apiRequest(`/world/locations/${encodeURIComponent(locationId)}`),
};
