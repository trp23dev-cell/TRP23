import "./admin.css";
import {
  exportContent,
  getContent,
  getContentRemoteFirst,
  importContent,
  importContentWithSync,
  resetContent,
  resetContentWithSync,
  saveContentWithSync,
} from "./data/contentStore";
import { validateContentShape } from "./data/contracts";

let state = getContent();

const chaptersEl = document.getElementById("chapters");
const dropsEl = document.getElementById("drops");
const statusTextEl = document.getElementById("statusText");
const jsonIOEl = document.getElementById("jsonIO");

function chapterEditor(chapter, index) {
  const wrap = document.createElement("div");
  wrap.className = "grid";
  wrap.innerHTML = `
    <div><label>Level Number</label><input data-k="number" value="${chapter.number}" /></div>
    <div><label>Name</label><input data-k="name" value="${chapter.name}" /></div>
    <div><label>Subtitle</label><input data-k="subtitle" value="${chapter.subtitle}" /></div>
    <div><label>Drop ID</label><input data-k="dropId" value="${chapter.dropId || ""}" /></div>
    <div><label>Code</label><input data-k="stash.code" value="${chapter.stash?.code || ""}" /></div>
    <div><label>Active</label><input data-k="isActive" value="${chapter.isActive}" /></div>
    <div><label>Unlock Start (ISO)</label><input data-k="unlockWindow.startAt" value="${chapter.unlockWindow?.startAt || ""}" /></div>
    <div><label>Unlock End (ISO)</label><input data-k="unlockWindow.endAt" value="${chapter.unlockWindow?.endAt || ""}" /></div>
    <div><label>Moral Focus</label><input data-k="moralFocus" value="${chapter.moralFocus || ""}" /></div>
  `;

  wrap.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", (event) => {
      const key = event.target.dataset.k;
      if (key === "stash.code") {
        state.chapters[index].stash.code = event.target.value;
      } else if (key === "unlockWindow.startAt") {
        state.chapters[index].unlockWindow.startAt = event.target.value || null;
      } else if (key === "unlockWindow.endAt") {
        state.chapters[index].unlockWindow.endAt = event.target.value || null;
      } else if (key === "isActive") {
        state.chapters[index].isActive = event.target.value === "true";
      } else {
        state.chapters[index][key] = event.target.value;
      }
      updateStatus();
    });
  });

  const missions = document.createElement("div");
  missions.className = "mission-line";
  missions.textContent = `Missions: ${chapter.missions
    .map((m) => `${m.title} [${m.type}]`)
    .join(" | ")}`;

  const shell = document.createElement("div");
  shell.className = "card";
  shell.appendChild(missions);
  shell.appendChild(wrap);
  return shell;
}

function dropEditor(drop, index) {
  const wrap = document.createElement("div");
  wrap.className = "grid small";
  wrap.innerHTML = `
    <div><label>Name</label><input data-k="name" value="${drop.name}" /></div>
    <div><label>SKU</label><input data-k="sku" value="${drop.sku || ""}" /></div>
    <div><label>Color</label><input data-k="color" value="${drop.color || ""}" /></div>
    <div><label>Price (Coins)</label><input data-k="priceCoins" value="${drop.priceCoins}" /></div>
    <div><label>Active</label><input data-k="active" value="${drop.active}" /></div>
    <div><label>Rarity</label><input data-k="rarity" value="${drop.rarity || ""}" /></div>
    <div><label>Unlock Start (ISO)</label><input data-k="unlockWindow.startAt" value="${drop.unlockWindow?.startAt || ""}" /></div>
    <div><label>Unlock End (ISO)</label><input data-k="unlockWindow.endAt" value="${drop.unlockWindow?.endAt || ""}" /></div>
  `;

  wrap.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", (event) => {
      const key = event.target.dataset.k;
      if (key === "priceCoins") {
        state.drops[index][key] = Number(event.target.value);
      } else if (key === "active") {
        state.drops[index].active = event.target.value === "true";
      } else if (key === "unlockWindow.startAt") {
        state.drops[index].unlockWindow.startAt = event.target.value || null;
      } else if (key === "unlockWindow.endAt") {
        state.drops[index].unlockWindow.endAt = event.target.value || null;
      } else {
        state.drops[index][key] = event.target.value;
      }
      updateStatus();
    });
  });

  const shell = document.createElement("div");
  shell.className = "card";
  shell.appendChild(wrap);
  return shell;
}

function render() {
  chaptersEl.innerHTML = "";
  dropsEl.innerHTML = "";

  state.chapters.forEach((chapter, idx) => {
    chaptersEl.appendChild(chapterEditor(chapter, idx));
  });

  state.drops.forEach((drop, idx) => {
    dropsEl.appendChild(dropEditor(drop, idx));
  });

  updateStatus();
}

function updateStatus(message = "") {
  const issues = validateContentShape(state);
  if (issues.length === 0) {
    statusTextEl.className = "status-ok";
    statusTextEl.textContent = message || "Content is valid.";
    return;
  }

  statusTextEl.className = "status-bad";
  statusTextEl.textContent = `Validation issues: ${issues.join(" ")}`;
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  const result = await saveContentWithSync(state);
  if (result.ok) {
    updateStatus(result.remoteSynced ? "Saved and synced to API." : "Saved locally. API not reachable.");
  } else {
    updateStatus(`Save blocked: ${result.issues.join(" ")}`);
  }
});

document.getElementById("resetBtn").addEventListener("click", async () => {
  state = await resetContentWithSync();
  render();
  updateStatus("Reset to defaults.");
});

document.getElementById("exportBtn").addEventListener("click", () => {
  jsonIOEl.value = exportContent(state);
  updateStatus("Export generated.");
});

document.getElementById("importBtn").addEventListener("click", async () => {
  const result = await importContentWithSync(jsonIOEl.value);
  if (!result.ok) {
    updateStatus(`Import failed: ${result.issues.join(" ")}`);
    return;
  }
  state = result.content;
  render();
  updateStatus(result.remoteSynced ? "Import successful and synced." : "Import successful (local only).");
});

async function init() {
  render();
  try {
    state = await getContentRemoteFirst();
    render();
    updateStatus("Loaded latest content from API.");
  } catch (_error) {
    state = getContent();
    render();
    updateStatus("Loaded local fallback content.");
  }
}

init();
