/**
 * Test-documentation expand block helpers (BRDG-426).
 *
 * The validated stakeholder test doc is stored in the Jira description as a
 * single `:::expand Test documentation` panel (the fence shape adf-to-markdown
 * emits and markdown-to-adf parses, so it round-trips as a real Jira expand
 * macro). These helpers guarantee the block exists at most once: saving strips
 * any previous block before appending the new one at the end.
 */

export const TEST_DOC_EXPAND_TITLE = "Test documentation";

// Matches the whole panel: the fence open line, everything up to the FIRST
// closing ":::" line. Generated docs contain no ::: fences themselves (the
// skill emits plain bold + bullets), so non-greedy is safe.
const TEST_DOC_BLOCK_RE = new RegExp(
  `\\n*:::expand ${TEST_DOC_EXPAND_TITLE}\\n[\\s\\S]*?\\n:::[ \\t]*(\\n|$)`,
  "g",
);

/** Remove any existing Test documentation expand block(s) from a description. */
export function stripTestDocBlock(description: string): string {
  return description.replace(TEST_DOC_BLOCK_RE, "\n").trimEnd();
}

/**
 * Append the doc as the single Test documentation expand block at the end of
 * the description, replacing any previous block.
 */
export function appendTestDocBlock(description: string, doc: string): string {
  const base = stripTestDocBlock(description ?? "");
  const block = `:::expand ${TEST_DOC_EXPAND_TITLE}\n${doc.trim()}\n:::`;
  return base ? `${base}\n\n${block}\n` : `${block}\n`;
}

/** The board-row / detail test-doc marker state. */
export type TestDocState = "accepted" | "draft" | "not_needed" | null;

/**
 * Derive the marker state from a ticket_metadata row. Single source of truth
 * for the list route and the detail builder, which must stay in lockstep: an
 * accepted doc wins, then an unreviewed draft, then the explicit not-needed
 * marker, else none.
 */
export function deriveTestDocState(
  meta:
    | { testDoc?: string | null; testDocDraft?: string | null; testDocClassification?: string | null }
    | null
    | undefined,
): TestDocState {
  if (meta?.testDoc) return "accepted";
  if (meta?.testDocDraft) return "draft";
  if (meta?.testDocClassification === "not_stakeholder_relevant") return "not_needed";
  return null;
}
