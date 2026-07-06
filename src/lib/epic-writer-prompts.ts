/**
 * Canonical chat prompts for the Epic Writer's card AI-actions. One source of
 * truth so the "send now" path (useStoryWriter.deepenCard / generateBreakdown)
 * and the "stage in chat" path (BRDG-490 #8, which prefills the compose box so
 * the PO can tweak the prompt first) always use identical wording.
 */

/** Prompt that works a single breakdown card out into a full story. */
export function deepenCardPrompt(index: number, title: string): string {
  const label = title.trim() ? ` ("${title.trim()}")` : "";
  return `Deepen story ${index + 1}${label} into a full description and acceptance criteria.`;
}

/** Prompt that asks for the first breakdown from the empty board. */
export const GENERATE_BREAKDOWN_PROMPT =
  "Break this epic down into child stories. Propose a first set of story titles, each with a few bullets, as an epic breakdown.";
