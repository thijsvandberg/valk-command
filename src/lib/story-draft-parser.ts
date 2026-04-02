/**
 * Extracts story draft content from workspace responses.
 * The write-story-draft skill wraps proposed descriptions in <story-draft> tags.
 */
export function extractStoryDraft(output: string): string | null {
  const match = output.match(/<story-draft>([\s\S]*?)<\/story-draft>/);
  return match ? match[1].trim() : null;
}
