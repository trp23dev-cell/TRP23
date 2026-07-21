function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateContentShape(content) {
  const issues = [];

  if (!isObject(content)) {
    return ["Root content must be an object."];
  }

  if (!Array.isArray(content.chapters) || content.chapters.length === 0) {
    issues.push("chapters must be a non-empty array.");
  }

  if (!Array.isArray(content.drops) || content.drops.length === 0) {
    issues.push("drops must be a non-empty array.");
  }

  const dropIds = new Set((content.drops || []).map((d) => d.id));

  for (const chapter of content.chapters || []) {
    if (!chapter.id) issues.push("chapter.id is required.");
    if (!chapter.number) issues.push(`chapter ${chapter.id || "unknown"} missing number.`);
    if (!chapter.name) issues.push(`chapter ${chapter.id || "unknown"} missing name.`);
    if (!Array.isArray(chapter.missions)) {
      issues.push(`chapter ${chapter.id || "unknown"} missions must be an array.`);
    }
    if (chapter.unlockWindow && typeof chapter.unlockWindow !== "object") {
      issues.push(`chapter ${chapter.id || "unknown"} unlockWindow must be an object when present.`);
    }
    if (chapter.moralFocus && typeof chapter.moralFocus !== "string") {
      issues.push(`chapter ${chapter.id || "unknown"} moralFocus must be a string when present.`);
    }
    if (chapter.dropId && !dropIds.has(chapter.dropId)) {
      issues.push(`chapter ${chapter.id || "unknown"} references missing dropId ${chapter.dropId}.`);
    }
    for (const mission of chapter.missions || []) {
      if (!mission.id) issues.push(`chapter ${chapter.id || "unknown"} has mission without id.`);
      if (!mission.type) issues.push(`chapter ${chapter.id || "unknown"} mission ${mission.id || "unknown"} missing type.`);
      if (typeof mission.rewardCoins !== "number") {
        issues.push(`chapter ${chapter.id || "unknown"} mission ${mission.id || "unknown"} rewardCoins must be a number.`);
      }
      if (mission.limit !== undefined && typeof mission.limit !== "number") {
        issues.push(`chapter ${chapter.id || "unknown"} mission ${mission.id || "unknown"} limit must be numeric when present.`);
      }
    }
  }

  for (const drop of content.drops || []) {
    if (!drop.id) issues.push("drop.id is required.");
    if (!drop.name) issues.push(`drop ${drop.id || "unknown"} missing name.`);
    if (typeof drop.priceCoins !== "number") {
      issues.push(`drop ${drop.id || "unknown"} priceCoins must be a number.`);
    }
    if (drop.unlockWindow && typeof drop.unlockWindow !== "object") {
      issues.push(`drop ${drop.id || "unknown"} unlockWindow must be an object when present.`);
    }
    if (drop.media && typeof drop.media !== "object") {
      issues.push(`drop ${drop.id || "unknown"} media must be an object when present.`);
    }
  }

  return issues;
}
