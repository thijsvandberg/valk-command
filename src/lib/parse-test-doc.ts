/**
 * Parser for the VRW `generate-test-doc` skill's structured output (BRDG-426).
 *
 * The skill emits a single `<test-doc>` block with a JSON body: a classification
 * plus the stakeholder-facing markdown block. Mirrors parse-deprecation-analysis:
 * robust-not-strict, never throws, returns null when the block is absent or
 * unparseable so the caller can degrade gracefully (show the raw output).
 */

export const TEST_DOC_CLASSIFICATIONS = [
  "ok",
  "needs_input",
  "not_stakeholder_relevant",
] as const;

export type TestDocClassification = (typeof TEST_DOC_CLASSIFICATIONS)[number];

export interface ParsedTestDoc {
  classification: TestDocClassification;
  markdown: string;
}

function isClassification(value: unknown): value is TestDocClassification {
  return (
    typeof value === "string" &&
    (TEST_DOC_CLASSIFICATIONS as readonly string[]).includes(value)
  );
}

/** Coerce untrusted wire input to a classification; anything unknown reads as "ok". */
export function coerceClassification(value: unknown): TestDocClassification {
  return isClassification(value) ? value : "ok";
}

/**
 * Extract and parse the `<test-doc>` block from agent output. Returns null when
 * the block is absent, its JSON is unparseable, or the markdown is empty. An
 * unknown classification degrades to "ok" rather than dropping the doc.
 */
export function parseTestDoc(output: string): ParsedTestDoc | null {
  if (typeof output !== "string") return null;
  const match = output.match(/<test-doc>([\s\S]*?)<\/test-doc>/);
  if (!match) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  const root = parsed as Record<string, unknown>;
  const markdown = typeof root.markdown === "string" ? root.markdown.trim() : "";
  if (!markdown) return null;

  return {
    classification: isClassification(root.classification) ? root.classification : "ok",
    markdown,
  };
}
