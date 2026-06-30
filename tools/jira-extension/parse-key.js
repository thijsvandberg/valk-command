// Pure Jira-key resolver shared by the content script and the unit test.
// Kept free of any DOM/extension API so it is testable in plain Node/jsdom.

function resolveJiraKey(loc) {
  if (!loc) return null;

  // Letter-led prefix so it never matches a bare "1-2" style fragment.
  const KEY_RE = /[A-Z][A-Z0-9]+-\d+/;

  // 1. selectedIssue query param (board/backlog/detail-panel views embed it here).
  const search = typeof loc.search === "string" ? loc.search : "";
  const selected = new URLSearchParams(search).get("selectedIssue");
  if (selected) {
    const m = selected.match(KEY_RE);
    if (m) return m[0];
  }

  const pathname = typeof loc.pathname === "string" ? loc.pathname : "";

  // 2. /browse/<KEY> canonical issue URL.
  const browse = pathname.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/);
  if (browse) return browse[1];

  // 3. Generic key anywhere in the path as a last resort.
  const generic = pathname.match(KEY_RE);
  if (generic) return generic[0];

  return null;
}

// WHY: this file loads both as a classic MV3 content script (window global, no ESM)
// and is imported by vitest (CommonJS). Guard each target so neither context throws.
if (typeof window !== "undefined") {
  window.resolveJiraKey = resolveJiraKey;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { resolveJiraKey };
}
