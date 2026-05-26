const EDIT_INTENT_KEYWORDS = [
  // EN
  "improve", "add", "change", "rewrite", "update", "remove", "delete",
  "move", "split", "merge", "shorten", "expand", "rephrase", "revise",
  "refine", "fix", "include", "reorder", "restructure", "rework",
  "elaborate", "rename", "replace", "edit", "draft", "reformat",
  "acceptance criteria", "story draft",
  // NL
  "verbeter", "voeg toe", "verander", "herschrijf", "verwijder",
  "pas aan", "verkort", "verplaats", "samenvoegen", "uitbreiden",
  "herformuleer", "hernoem", "vervang", "bewerk",
];

const EDIT_INTENT_PATTERN = new RegExp(
  `\\b(${EDIT_INTENT_KEYWORDS.join("|")})\\b`,
  "i",
);

const QUESTION_STARTS = [
  "wat ", "what ", "how ", "when ", "where ", "which ", "who ", "why ",
  "hoe ", "wanneer ", "waar ", "welk", "wie ", "waarom ",
  "is ", "are ", "can ", "could ", "does ", "do ", "has ",
  "hoeveel", "how many", "how much",
];

/**
 * Lightweight heuristic: does the user message intend to edit the story draft?
 * Returns true when uncertain (safe default: include full draft context).
 */
export function hasEditIntent(
  content: string,
  options?: { splitMode?: boolean },
): boolean {
  if (options?.splitMode) return true;
  if (EDIT_INTENT_PATTERN.test(content)) return true;
  if (content.length < 120) {
    const lower = content.toLowerCase().trimStart();
    if (
      QUESTION_STARTS.some((q) => lower.startsWith(q)) ||
      lower.endsWith("?")
    ) {
      return false;
    }
  }
  return true;
}
