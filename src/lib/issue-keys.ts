/**
 * Scan a block of free text for every Jira issue key it mentions.
 *
 * This is the multi-occurrence form of JIRA_KEY_RE (the single-key validator in
 * jql.ts): the global, case-insensitive pattern matches bare keys ("VPL-47038")
 * and keys embedded in Jira browse URLs (".../browse/VPL-47038") alike, because
 * the key is a substring of the URL. Results are uppercased, de-duplicated, and
 * returned in first-seen order so the caller can preserve mention order.
 */
const ISSUE_KEY_GLOBAL_RE = /[A-Z][A-Z0-9]+-\d+/gi;

export function extractIssueKeys(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const match of text.matchAll(ISSUE_KEY_GLOBAL_RE)) {
    const key = match[0].toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}
