/**
 * URL-scheme allowlist for link hrefs that originate from externally-controlled
 * content (Jira-synced descriptions/comments rendered as markdown, ADF link marks).
 *
 * React does not sanitize `href`, so a `[click](javascript:...)` link would run
 * script when clicked. We allow only navigable, non-script schemes plus relative
 * URLs, and reject everything else (notably `javascript:`, `data:`, `vbscript:`).
 */

const ALLOWED_SCHEMES = new Set(["http", "https", "mailto"]);

// Browsers ignore control characters (tab/newline/NUL etc.) when parsing a URL
// scheme, so an attacker can hide "java\tscript:". Strip them before judging.
function stripControlChars(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) continue;
    out += ch;
  }
  return out;
}

/**
 * Returns the href if it is safe to use, or `null` if it must be neutralized.
 * Relative URLs and protocol-relative URLs (which inherit the page's http/https
 * scheme) are allowed; only explicit dangerous schemes are rejected.
 */
export function safeHref(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const lower = stripControlChars(trimmed).toLowerCase();

  // Protocol-relative ("//host/path") inherits the page's http/https scheme.
  if (lower.startsWith("//")) return trimmed;

  // A scheme is a leading "<letter><letter|digit|+|-|.>*:" with no preceding
  // path/query/fragment separator. A relative path like "page/a:b" has its ":"
  // after a "/", so it won't match here and is treated as relative.
  const schemeMatch = lower.match(/^([a-z][a-z0-9+.-]*):/);
  if (!schemeMatch) {
    // No scheme: relative URL, fragment, or query. Safe.
    return trimmed;
  }

  return ALLOWED_SCHEMES.has(schemeMatch[1]) ? trimmed : null;
}
