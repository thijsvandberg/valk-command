import DOMPurify from "isomorphic-dompurify";
import { SANITIZE_HTML_OPTIONS } from "./sanitize-html-config";

/**
 * Sanitize HTML/markdown content before database storage.
 * Allows safe markdown features (bold, italic, links, code, tables, lists)
 * while stripping dangerous tags and attributes.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, SANITIZE_HTML_OPTIONS);
}

/**
 * Sanitize plain text input: strip HTML tags entirely.
 */
export function sanitizeText(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Sanitize a filename for safe storage and serving.
 * Removes path separators and null bytes, limits length.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/\\:\0"<>|?*]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 255);
}

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/xml",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

/**
 * Validate a MIME type against the allowlist.
 */
export function isAllowedMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.has(mimeType);
}
