/**
 * Shared DOMPurify configuration for HTML sanitization.
 * Used by both server-side (sanitize.ts) and client-side (sanitize-client.ts) sanitizers.
 */
import DOMPurify from "isomorphic-dompurify";

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

let hooksRegistered = false;

/**
 * Register sanitizer hooks once per process. DOMPurify hooks are global, so we
 * guard against duplicate registration.
 *
 * - Reverse-tabnabbing: any link that opens a new browsing context must not be
 *   able to reach `window.opener`, so we force `rel="noopener noreferrer"`.
 * - DOMPurify permits `data:` image URIs by default; we strip the `src` of such
 *   images so a crafted `data:` payload cannot be embedded.
 */
export function ensureSanitizeHooks(): void {
  if (hooksRegistered) return;
  hooksRegistered = true;

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const el = node as Element;
    if (typeof el.tagName !== "string") return;
    const tag = el.tagName.toUpperCase();

    if (tag === "A" && el.hasAttribute("target")) {
      el.setAttribute("rel", "noopener noreferrer");
    }

    if (tag === "IMG") {
      const src = el.getAttribute("src") ?? "";
      if (/^\s*data:/i.test(src)) {
        el.removeAttribute("src");
      }
    }
  });
}
