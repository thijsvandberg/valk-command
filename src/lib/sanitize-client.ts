import DOMPurify from "isomorphic-dompurify";
import { SANITIZE_HTML_OPTIONS } from "./sanitize-html-config";

/**
 * Client-safe HTML sanitizer using the same config as the server.
 * Defense-in-depth: catches any content that slips past server sanitization.
 */
export function sanitizeHtmlClient(dirty: string): string {
  return DOMPurify.sanitize(dirty, SANITIZE_HTML_OPTIONS);
}

/**
 * Sanitize Prism.js highlighted code output.
 * Prism only generates <span class="token ..."> wrappers.
 */
export function sanitizePrismOutput(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ["span"],
    ALLOWED_ATTR: ["class"],
    ALLOW_DATA_ATTR: false,
  });
}
