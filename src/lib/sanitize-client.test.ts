import { describe, it, expect } from "vitest";
import { sanitizeHtmlClient, sanitizePrismOutput } from "./sanitize-client";

describe("sanitizeHtmlClient", () => {
  it("allows safe tags", () => {
    const input = "<p>Hello <strong>world</strong></p>";
    expect(sanitizeHtmlClient(input)).toBe(input);
  });

  it("strips script tags", () => {
    const input = '<p>Safe</p><script>alert("xss")</script>';
    expect(sanitizeHtmlClient(input)).toBe("<p>Safe</p>");
  });

  it("strips event handlers", () => {
    const input = '<img src="x" onerror="alert(1)">';
    expect(sanitizeHtmlClient(input)).toBe('<img src="x">');
  });

  it("strips javascript: hrefs", () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    expect(sanitizeHtmlClient(input)).not.toContain("javascript:");
  });

  it("allows links with safe hrefs", () => {
    const input = '<a href="https://example.com">link</a>';
    expect(sanitizeHtmlClient(input)).toContain('href="https://example.com"');
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeHtmlClient("")).toBe("");
  });
});

describe("sanitizePrismOutput", () => {
  it("allows span with class attribute", () => {
    const input = '<span class="token keyword">const</span>';
    expect(sanitizePrismOutput(input)).toBe(input);
  });

  it("strips non-span tags", () => {
    const input = '<div><span class="token">x</span></div>';
    expect(sanitizePrismOutput(input)).toBe('<span class="token">x</span>');
  });

  it("strips script tags", () => {
    const input = '<script>alert(1)</script><span class="t">ok</span>';
    expect(sanitizePrismOutput(input)).toBe('<span class="t">ok</span>');
  });

  it("strips non-class attributes", () => {
    const input = '<span class="token" style="color:red" id="x">val</span>';
    expect(sanitizePrismOutput(input)).toBe('<span class="token">val</span>');
  });
});
