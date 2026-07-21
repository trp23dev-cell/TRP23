import { apiRequest } from "../client";

export const cmsApi = {
  getContent: () => apiRequest("/content"),
  saveContent: (content) =>
    apiRequest("/content", {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  getChapters: () => apiRequest("/cms/chapters"),
  getDrops: () => apiRequest("/cms/drops"),
  updateChapter: (chapterId, chapter) =>
    apiRequest(`/cms/chapters/${encodeURIComponent(chapterId)}`, {
      method: "PUT",
      body: JSON.stringify({ chapter }),
    }),
  updateDrop: (dropId, drop) =>
    apiRequest(`/cms/drops/${encodeURIComponent(dropId)}`, {
      method: "PUT",
      body: JSON.stringify({ drop }),
    }),
  publish: (notes) =>
    apiRequest("/cms/publish", {
      method: "POST",
      body: JSON.stringify({ notes }),
    }),
};
