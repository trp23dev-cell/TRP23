import { defaultContent } from "./defaultContent";
import { validateContentShape } from "./contracts";

const STORAGE_KEY = "trapmadeit.content.v1";
const API_BASE = `${import.meta.env.VITE_API_ORIGIN || ""}/api`;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getDefaultContent() {
  return clone(defaultContent);
}

export function getContent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultContent();
    const parsed = JSON.parse(raw);
    const issues = validateContentShape(parsed);
    if (issues.length > 0) {
      console.warn("Invalid stored content. Falling back to defaults.", issues);
      return getDefaultContent();
    }
    return parsed;
  } catch (error) {
    console.warn("Failed to parse content. Falling back to defaults.", error);
    return getDefaultContent();
  }
}

export function saveContent(content) {
  const issues = validateContentShape(content);
  if (issues.length > 0) {
    return { ok: false, issues };
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
  return { ok: true, issues: [] };
}

async function fetchApi(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API request failed: ${res.status}`);
  return res.json();
}

export async function getContentRemoteFirst() {
  try {
    const data = await fetchApi("/content");
    const remoteContent = data?.content;
    const issues = validateContentShape(remoteContent);
    if (issues.length === 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteContent));
      return remoteContent;
    }
    console.warn("Remote content invalid, using local fallback.", issues);
    return getContent();
  } catch (_error) {
    return getContent();
  }
}

export async function saveContentWithSync(content) {
  const local = saveContent(content);
  if (!local.ok) return { ok: false, issues: local.issues, remoteSynced: false };

  try {
    await fetchApi("/content", {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
    return { ok: true, issues: [], remoteSynced: true };
  } catch (_error) {
    return { ok: true, issues: [], remoteSynced: false };
  }
}

export function resetContent() {
  const defaults = getDefaultContent();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  return defaults;
}

export async function resetContentWithSync() {
  const defaults = resetContent();
  await saveContentWithSync(defaults);
  return defaults;
}

export function exportContent(content) {
  return JSON.stringify(content, null, 2);
}

export function importContent(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    return { ok: false, issues: ["Invalid JSON format."] };
  }

  const result = saveContent(parsed);
  if (!result.ok) return result;

  return { ok: true, issues: [], content: parsed };
}

export async function importContentWithSync(jsonText) {
  const imported = importContent(jsonText);
  if (!imported.ok) return imported;
  const syncResult = await saveContentWithSync(imported.content);
  return {
    ok: syncResult.ok,
    issues: syncResult.issues,
    content: imported.content,
    remoteSynced: syncResult.remoteSynced,
  };
}
