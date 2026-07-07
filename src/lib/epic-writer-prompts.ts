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

/**
 * Prompt that works every not-yet-full breakdown card out in one turn (BRDG-500
 * #5). The break-down-epic skill can detail multiple cards per turn, so "Deepen
 * all" is a single chat message rather than one turn per card. Cards that already
 * have a full body are left alone (bulk "Deepen" is not bulk "Improve").
 */
export const DEEPEN_ALL_PROMPT =
  "Deepen every story that is not yet fully worked out into a full description and acceptance criteria, in one pass. Leave the already-detailed stories as they are.";

/** Prompt that asks for the first breakdown from the empty board. */
export const GENERATE_BREAKDOWN_PROMPT =
  "Break this epic down into child stories. Propose a first set of story titles, each with a few bullets, as an epic breakdown.";
