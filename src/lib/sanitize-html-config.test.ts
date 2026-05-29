import { describe, it, expect } from "vitest";
import { SANITIZE_HTML_OPTIONS } from "./sanitize-html-config";

describe("SANITIZE_HTML_OPTIONS", () => {
  it("ALLOWED_TAGS includes common HTML elements", () => {
    const expected = [
      "h1", "h2", "h3", "p", "br", "hr",
      "ul", "ol", "li",
      "strong", "b", "em", "i", "u", "s",
      "a", "code", "pre", "blockquote",
      "table", "thead", "tbody", "tr", "th", "td",
      "img", "span", "div",
    ];
    for (const tag of expected) {
      expect(SANITIZE_HTML_OPTIONS.ALLOWED_TAGS).toContain(tag);
    }
  });

  it("ALLOWED_ATTR includes expected attributes", () => {
    const expected = ["href", "src", "alt", "title", "class", "target", "rel"];
    for (const attr of expected) {
      expect(SANITIZE_HTML_OPTIONS.ALLOWED_ATTR).toContain(attr);
    }
  });

  it("ALLOW_DATA_ATTR is false", () => {
    expect(SANITIZE_HTML_OPTIONS.ALLOW_DATA_ATTR).toBe(false);
  });

  it("does not allow script or iframe tags", () => {
    expect(SANITIZE_HTML_OPTIONS.ALLOWED_TAGS).not.toContain("script");
    expect(SANITIZE_HTML_OPTIONS.ALLOWED_TAGS).not.toContain("iframe");
  });

  it("does not allow onclick or onerror attributes", () => {
    expect(SANITIZE_HTML_OPTIONS.ALLOWED_ATTR).not.toContain("onclick");
    expect(SANITIZE_HTML_OPTIONS.ALLOWED_ATTR).not.toContain("onerror");
  });
});
