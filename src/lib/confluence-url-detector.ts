/**
 * Detects Confluence page URLs in arbitrary text.
 *
 * Handles two URL patterns:
 *   - Long form: {base}/wiki/spaces/{space}/pages/{pageId}[/...]
 *   - Short form: {base}/wiki/x/{shortId}   (Confluence short links)
 */

export interface DetectedConfluenceUrl {
  pageId: string;
  url: string;
}

export function detectConfluenceUrls(text: string, baseUrl: string): DetectedConfluenceUrl[] {
  if (!text || !baseUrl) return [];

  const escaped = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Long form: /wiki/spaces/KEY/pages/{numericId}(/...)
  const longForm = new RegExp(
    `${escaped}/wiki/spaces/[^/\\s]+/pages/(\\d+)(?:[/\\s"']|$)`,
    "gi",
  );

  // Short form: /wiki/x/{alphanumeric}
  const shortForm = new RegExp(
    `${escaped}/wiki/x/([A-Za-z0-9_-]+)(?:[\\s"']|$)`,
    "gi",
  );

  const seen = new Set<string>();
  const results: DetectedConfluenceUrl[] = [];

  for (const match of text.matchAll(longForm)) {
    const pageId = match[1];
    const url = match[0].trim();
    if (!seen.has(pageId)) {
      seen.add(pageId);
      results.push({ pageId, url });
    }
  }

  for (const match of text.matchAll(shortForm)) {
    const pageId = match[1];
    const url = match[0].trim();
    if (!seen.has(pageId)) {
      seen.add(pageId);
      results.push({ pageId, url });
    }
  }

  return results;
}
