/**
 * Extracts story draft content from workspace responses.
 * The write-story-draft skill wraps proposed descriptions in <story-draft> tags.
 * In split mode, the target story uses <story-draft slot="target">.
 */
export function extractStoryDraft(output: string): string | null {
  // Match only unslotted <story-draft> (original story)
  const match = output.match(/<story-draft(?:\s*slot="original")?\s*>([\s\S]*?)<\/story-draft>/);
  return match ? match[1].trim() : null;
}

export interface ExtractedDrafts {
  originalDraft: string | null;
  targetDraft: string | null;
}

/**
 * Extracts both original and target story drafts from workspace output.
 * Used in split mode where the AI outputs content for both stories simultaneously.
 */
export function extractStoryDrafts(output: string): ExtractedDrafts {
  // Target draft uses explicit slot="target"
  const targetMatch = output.match(/<story-draft\s+slot="target"\s*>([\s\S]*?)<\/story-draft>/);
  const targetDraft = targetMatch ? targetMatch[1].trim() : null;

  // Original draft: unslotted or slot="original", but not slot="target"
  const originalMatch = output.match(/<story-draft(?:\s*slot="original")?\s*>([\s\S]*?)<\/story-draft>/);
  const originalDraft = originalMatch ? originalMatch[1].trim() : null;

  return { originalDraft, targetDraft };
}
