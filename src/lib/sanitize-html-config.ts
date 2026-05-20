/**
 * Shared DOMPurify configuration for HTML sanitization.
 * Used by both server-side (sanitize.ts) and client-side (sanitize-client.ts) sanitizers.
 */
export const SANITIZE_HTML_OPTIONS = {
  ALLOWED_TAGS: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "ul", "ol", "li",
    "strong", "b", "em", "i", "u", "s", "del",
    "a", "code", "pre", "blockquote",
    "table", "thead", "tbody", "tr", "th", "td",
    "img", "span", "div", "sup", "sub",
  ],
  ALLOWED_ATTR: [
    "href", "src", "alt", "title", "class",
    "target", "rel", "colspan", "rowspan",
  ],
  ALLOW_DATA_ATTR: false as const,
};
