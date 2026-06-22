// @vitest-environment node
import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeText, sanitizeFilename, isAllowedMimeType } from "./sanitize";

describe("sanitizeHtml", () => {
  it("allows safe markdown HTML tags", () => {
    const input = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeHtml(input)).toBe(input);
  });

  it("strips script tags", () => {
    const input = '<p>Safe</p><script>alert("xss")</script>';
    expect(sanitizeHtml(input)).toBe("<p>Safe</p>");
  });

  it("strips event handlers", () => {
    const input = '<img src="x" onerror="alert(1)">';
    expect(sanitizeHtml(input)).toBe('<img src="x">');
  });

  it("strips dangerous attributes", () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    expect(sanitizeHtml(input)).not.toContain("javascript:");
  });

  it("allows links with safe hrefs", () => {
    const input = '<a href="https://example.com">link</a>';
    expect(sanitizeHtml(input)).toContain('href="https://example.com"');
  });

  it("allows table tags", () => {
    const result = sanitizeHtml("<table><tr><td>cell</td></tr></table>");
    expect(result).toContain("<table>");
    expect(result).toContain("<td>cell</td>");
  });

  it("forces rel=noopener noreferrer on target links (reverse tabnabbing)", () => {
    const result = sanitizeHtml('<a href="https://example.com" target="_blank">link</a>');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('target="_blank"');
  });

  it("overrides an attacker-supplied rel on a target link", () => {
    const result = sanitizeHtml('<a href="https://example.com" target="_blank" rel="opener">link</a>');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).not.toContain('rel="opener"');
  });

  it("strips data: image URIs", () => {
    const result = sanitizeHtml('<img src="data:image/png;base64,iVBORw0KGgo=">');
    expect(result).not.toContain("data:");
  });

  it("keeps legitimate image sources", () => {
    const result = sanitizeHtml('<img src="https://example.com/a.png">');
    expect(result).toContain('src="https://example.com/a.png"');
  });
});

describe("sanitizeText", () => {
  it("strips all HTML tags", () => {
    const input = "<p>Hello <b>world</b></p>";
    expect(sanitizeText(input)).toBe("Hello world");
  });

  it("strips script tags completely", () => {
    const input = '<script>alert("xss")</script>safe text';
    expect(sanitizeText(input)).toBe("safe text");
  });
});

describe("sanitizeFilename", () => {
  it("removes path separators", () => {
    const result = sanitizeFilename("../../../etc/passwd");
    expect(result).not.toContain("/");
    expect(result).not.toContain("..");
    expect(result).toContain("passwd");
  });

  it("removes null bytes", () => {
    expect(sanitizeFilename("file\0.txt")).toBe("file_.txt");
  });

  it("limits length to 255 characters", () => {
    const long = "a".repeat(300);
    expect(sanitizeFilename(long).length).toBe(255);
  });

  it("collapses double dots", () => {
    expect(sanitizeFilename("file..txt")).toBe("file.txt");
  });
});

describe("isAllowedMimeType", () => {
  it("allows common image types", () => {
    expect(isAllowedMimeType("image/jpeg")).toBe(true);
    expect(isAllowedMimeType("image/png")).toBe(true);
  });

  it("allows PDF", () => {
    expect(isAllowedMimeType("application/pdf")).toBe(true);
  });

  it("rejects executable types", () => {
    expect(isAllowedMimeType("application/x-executable")).toBe(false);
    expect(isAllowedMimeType("application/x-sharedlib")).toBe(false);
  });

  it("rejects HTML type", () => {
    expect(isAllowedMimeType("text/html")).toBe(false);
  });
});
