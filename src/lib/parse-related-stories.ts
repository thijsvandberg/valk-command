export interface RelatedStoryItem {
  key: string;
  score: number;
  title: string;
  type?: string;
  status: string;
  url?: string;
  updated?: string;
  reason?: string;
}

/**
 * Extracts related story items from workspace output containing a
 * <related-stories> XML block with a JSON array inside.
 */
export function parseRelatedStories(output: string): RelatedStoryItem[] {
  const match = output.match(/<related-stories>([\s\S]*?)<\/related-stories>/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RelatedStoryItem =>
        typeof item === "object" &&
        item !== null &&
        typeof item.key === "string" &&
        typeof item.score === "number" &&
        typeof item.title === "string" &&
        typeof item.status === "string" &&
        // Epics are never valid related stories — they are containers, not peers.
        (item.type ?? "").toString().toLowerCase() !== "epic",
    );
  } catch {
    return [];
  }
}
