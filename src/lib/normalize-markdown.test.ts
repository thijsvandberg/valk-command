import { describe, it, expect } from "vitest";
import { normalizeMarkdownForCompare, markdownEqualIgnoringSpacing } from "./normalize-markdown";

describe("normalizeMarkdownForCompare", () => {
  it("treats a tight list and a loose list as equal", () => {
    const tight = "- a\n- b\n- c";
    const loose = "- a\n\n- b\n\n- c";
    expect(markdownEqualIgnoringSpacing(tight, loose)).toBe(true);
  });

  it("equalizes the list-to-heading gap (adfToMarkdown tight vs TipTap loose)", () => {
    const fromAdf = "- a\n- b\n### Heading\n\n- c";
    const fromEditor = "- a\n- b\n\n### Heading\n\n- c";
    expect(markdownEqualIgnoringSpacing(fromAdf, fromEditor)).toBe(true);
  });

  it("equalizes a paragraph-to-list gap", () => {
    const a = "Intro paragraph\n- item";
    const b = "Intro paragraph\n\n- item";
    expect(markdownEqualIgnoringSpacing(a, b)).toBe(true);
  });

  it("keeps a genuine content change visible", () => {
    const before = "- a\n- b";
    const after = "- a\n- b\n- c";
    expect(markdownEqualIgnoringSpacing(before, after)).toBe(false);
  });

  it("preserves intentional paragraph separation between two paragraphs", () => {
    const oneParagraph = "Line one\nLine two";
    const twoParagraphs = "Line one\n\nLine two";
    // Not adjacent to a list, so the blank line is meaningful and retained.
    expect(markdownEqualIgnoringSpacing(oneParagraph, twoParagraphs)).toBe(false);
  });

  it("collapses runs of multiple blank lines between paragraphs", () => {
    const a = "Para one\n\nPara two";
    const b = "Para one\n\n\n\nPara two";
    expect(markdownEqualIgnoringSpacing(a, b)).toBe(true);
  });

  it("ignores trailing whitespace and CRLF differences", () => {
    const a = "Para one  \r\n\r\nPara two";
    const b = "Para one\n\nPara two";
    expect(markdownEqualIgnoringSpacing(a, b)).toBe(true);
  });

  it("ignores leading and trailing blank lines", () => {
    expect(markdownEqualIgnoringSpacing("\n\nbody\n\n", "body")).toBe(true);
  });

  it("does not touch blank lines inside fenced code blocks", () => {
    const withGap = "```\nconst a = 1;\n\nconst b = 2;\n```";
    const normalized = normalizeMarkdownForCompare(withGap);
    expect(normalized).toBe("```\nconst a = 1;\n\nconst b = 2;\n```");
  });

  it("handles ordered lists", () => {
    const tight = "1. first\n2. second";
    const loose = "1. first\n\n2. second";
    expect(markdownEqualIgnoringSpacing(tight, loose)).toBe(true);
  });

  it("returns empty string for empty input", () => {
    expect(normalizeMarkdownForCompare("")).toBe("");
  });

  it("equalizes nested/loose list items with continuation lines", () => {
    const fromAdf = "- Spike moet ook inzicht geven in:\n  - Welke data\n  - Wat een termijn";
    const fromEditor = "- Spike moet ook inzicht geven in:\n\n  - Welke data\n  - Wat een termijn";
    expect(markdownEqualIgnoringSpacing(fromAdf, fromEditor)).toBe(true);
  });

  // Regression: a synced-back description differing only by an accidental empty
  // bullet kept re-triggering a phantom "Unsaved changes" draft after pushing.
  it("ignores an empty bullet that one serializer keeps and the other drops", () => {
    const withEmpty = "- real item\n- \n\n---";
    const without = "- real item\n\n---";
    expect(markdownEqualIgnoringSpacing(withEmpty, without)).toBe(true);
  });

  it("ignores an empty ordered marker", () => {
    expect(markdownEqualIgnoringSpacing("1. first\n2. \n3. third", "1. first\n3. third")).toBe(true);
  });

  it("does not treat a horizontal rule as an empty list item", () => {
    expect(normalizeMarkdownForCompare("a\n\n---\n\nb")).toContain("---");
  });

  // Regression: adfToMarkdown emits a blank line hugging the closing panel
  // fence that the source markdown lacks; treat it as cosmetic.
  it("ignores a blank line inside a panel fence", () => {
    const fromEditor = ":::info\n**Timebox**: 2h\n\n:::\n\n### Summary";
    const source = ":::info\n**Timebox**: 2h\n:::\n\n### Summary";
    expect(markdownEqualIgnoringSpacing(fromEditor, source)).toBe(true);
  });
});
