// ============================================================================
// THE TRAP CARD — which of its five states are we in?
//
// Split out from the renderer on purpose. The drawing is DOM work and can only
// really be judged by looking at it; WHICH card to draw is a decision with
// exactly five outcomes, and that part can be tested without a browser. See
// scripts/check-trap-card.mjs.
//
// The card is the one thing on the case file the player writes themselves
// (Chapter 01) and is handed back to them (Chapter 06). It is never scored.
// ============================================================================

/** Longest statement we store. Long enough to be honest, short enough to fit. */
export const TRAP_MAX = 180;

/**
 * @returns one of:
 *   'hidden'  nothing to show — not written, and not where you write it
 *   'write'   Chapter 01, blank card with an input
 *   'edit'    Chapter 01, written, still changeable
 *   'locked'  Chapters 02-05, on the board, not changeable
 *   'ask'     Final chapter, the question
 *   'answered' Final chapter, already answered
 */
export function trapCardState({ level, lastLevel, statement, answer }) {
  const written = !!(statement && String(statement).trim());
  const onFirst = level === 0;
  const onLast = level === lastLevel;

  if (onFirst) return written ? "edit" : "write";
  if (!written) return "hidden";
  // Normalise before deciding. A truthy check here meant any junk value that
  // ever reached a saved profile — a legacy string, a typo — counted as an
  // answer, and the player was never asked the question at all. The C# copy
  // did this correctly and the shared table caught the disagreement.
  if (onLast) return normaliseTrapAnswer(answer) ? "answered" : "ask";
  return "locked";
}

/** Trim and cap a statement on its way to being stored. */
export function normaliseTrapStatement(text) {
  return String(text || "").trim().slice(0, TRAP_MAX);
}

/** Only these two answers exist. Anything else is "not answered yet". */
export function normaliseTrapAnswer(answer) {
  return answer === "holds" || answer === "freed" ? answer : null;
}
