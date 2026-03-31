import { describe, it, expect } from "vitest";
import {
  calloutMarkdownToHtml,
  htmlToCalloutMarkdown,
  isCalloutType,
} from "./callout-markdown";

describe("calloutMarkdownToHtml", () => {
  it("converts a simple info callout to HTML", () => {
    const md = ":::info\nThis is info.\n:::";
    const html = calloutMarkdownToHtml(md);
    expect(html).toContain('data-callout-type="info"');
    expect(html).toContain("This is info.");
  });

  it("converts all 5 callout types", () => {
    const types = ["info", "warning", "error", "note", "success"] as const;
    for (const type of types) {
      const md = `:::${type}\nContent for ${type}.\n:::`;
      const html = calloutMarkdownToHtml(md);
      expect(html).toContain(`data-callout-type="${type}"`);
      expect(html).toContain(`Content for ${type}.`);
    }
  });

  it("handles multi-line callout content", () => {
    const md = ":::warning\nLine one.\nLine two.\n:::";
    const html = calloutMarkdownToHtml(md);
    expect(html).toContain('data-callout-type="warning"');
    expect(html).toContain("Line one.");
    expect(html).toContain("Line two.");
  });

  it("preserves non-callout content", () => {
    const md = "# Hello\n\nSome text.\n\n:::info\nCallout.\n:::\n\nMore text.";
    const html = calloutMarkdownToHtml(md);
    expect(html).toContain("# Hello");
    expect(html).toContain("Some text.");
    expect(html).toContain('data-callout-type="info"');
    expect(html).toContain("More text.");
  });

  it("handles unclosed callout as raw text", () => {
    const md = ":::info\nThis is unclosed";
    const html = calloutMarkdownToHtml(md);
    expect(html).toContain(":::info");
    expect(html).toContain("This is unclosed");
    expect(html).not.toContain("data-callout-type");
  });

  it("handles empty content", () => {
    const html = calloutMarkdownToHtml("");
    expect(html).toBe("");
  });

  it("handles multiple callouts in sequence", () => {
    const md = ":::info\nFirst.\n:::\n\n:::warning\nSecond.\n:::";
    const html = calloutMarkdownToHtml(md);
    expect(html).toContain('data-callout-type="info"');
    expect(html).toContain('data-callout-type="warning"');
    expect(html).toContain("First.");
    expect(html).toContain("Second.");
  });
});

describe("htmlToCalloutMarkdown", () => {
  it("converts callout HTML back to :::type syntax", () => {
    const html =
      '<div data-callout-type="info" class="callout-block"><p>Some info.</p></div>';
    const md = htmlToCalloutMarkdown(html);
    expect(md).toContain(":::info");
    expect(md).toContain("Some info.");
    expect(md).toContain(":::");
  });

  it("handles multiple paragraphs in callout", () => {
    const html =
      '<div data-callout-type="error" class="callout-block"><p>Line A</p><p>Line B</p></div>';
    const md = htmlToCalloutMarkdown(html);
    expect(md).toContain(":::error");
    expect(md).toContain("Line A");
    expect(md).toContain("Line B");
  });

  it("preserves non-callout HTML", () => {
    const html = "<p>Regular paragraph.</p>";
    const md = htmlToCalloutMarkdown(html);
    expect(md).toBe("<p>Regular paragraph.</p>");
  });
});

describe("isCalloutType", () => {
  it("returns true for valid callout types", () => {
    expect(isCalloutType("info")).toBe(true);
    expect(isCalloutType("warning")).toBe(true);
    expect(isCalloutType("error")).toBe(true);
    expect(isCalloutType("note")).toBe(true);
    expect(isCalloutType("success")).toBe(true);
  });

  it("returns false for invalid types", () => {
    expect(isCalloutType("danger")).toBe(false);
    expect(isCalloutType("")).toBe(false);
    expect(isCalloutType("INFO")).toBe(false);
  });
});
