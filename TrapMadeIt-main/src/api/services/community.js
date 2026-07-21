import { apiRequest } from "../client";

export const communityApi = {
  listStories: () => apiRequest("/community/stories"),
  createStory: (payload) =>
    apiRequest("/community/stories", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listOpportunities: () => apiRequest("/community/opportunities"),
  createOpportunity: (payload) =>
    apiRequest("/community/opportunities", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listChapterEvents: () => apiRequest("/community/chapter-events"),
  createChapterEvent: (payload) =>
    apiRequest("/community/chapter-events", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getLeaderboard: () => apiRequest("/community/leaderboard"),
};
