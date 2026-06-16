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

  it("preserves bullet list inside expand block", () => {
    const html =
      '<details data-expand-title="My expand" class="expand-block"><summary>My expand</summary><div><ul><li><p>Item one</p></li><li><p>Item two</p></li></ul></div></details>';
    const md = htmlToCalloutMarkdown(html);
    expect(md).toContain(":::expand My expand");
    expect(md).toContain("- Item one");
    expect(md).toContain("- Item two");
    expect(md).toContain(":::");
  });

  it("preserves ordered list inside expand block", () => {
    const html =
      '<details data-expand-title="Steps" class="expand-block"><summary>Steps</summary><div><ol><li><p>First</p></li><li><p>Second</p></li></ol></div></details>';
    const md = htmlToCalloutMarkdown(html);
    expect(md).toContain(":::expand Steps");
    expect(md).toContain("1. First");
    expect(md).toContain("2. Second");
  });

  it("preserves heading inside expand block", () => {
    const html =
      '<details data-expand-title="T" class="expand-block"><summary>T</summary><div><h2>Section</h2><p>Body text</p></div></details>';
    const md = htmlToCalloutMarkdown(html);
    expect(md).toContain("## Section");
    expect(md).toContain("Body text");
  });

  it("preserves inline marks inside expand block", () => {
    const html =
      '<details data-expand-title="T" class="expand-block"><summary>T</summary><div><p><strong>bold</strong> and <em>italic</em> and <s>strike</s></p></div></details>';
    const md = htmlToCalloutMarkdown(html);
    expect(md).toContain("**bold**");
    expect(md).toContain("*italic*");
    expect(md).toContain("~~strike~~");
  });

  it("strips underline tags wrapping a link instead of leaking them into the label", () => {
    const html =
      '<details data-expand-title="T" class="expand-block"><summary>T</summary><div><p>See <u><a href="https://github.com/org/pg_partman">pg_partman</a></u></p></div></details>';
    const md = htmlToCalloutMarkdown(html);
    expect(md).toContain("[pg_partman](https://github.com/org/pg_partman)");
    expect(md).not.toContain("<u>");
    expect(md).not.toContain("</u>");
  });

  it("preserves bullet list inside callout block", () => {
    const html =
      '<div data-callout-type="info" class="callout-block"><ul><li><p>Item A</p></li><li><p>Item B</p></li></ul></div>';
    const md = htmlToCalloutMarkdown(html);
    expect(md).toContain(":::info");
    expect(md).toContain("- Item A");
    expect(md).toContain("- Item B");
  });

  it("preserves nested list inside expand block", () => {
    const html =
      '<details data-expand-title="T" class="expand-block"><summary>T</summary><div><ul><li><p>Parent</p><ul><li><p>Child</p></li></ul></li></ul></div></details>';
    const md = htmlToCalloutMarkdown(html);
    expect(md).toContain("- Parent");
    expect(md).toContain("  - Child");
  });
});

describe("calloutMarkdownToHtml (rich inner content)", () => {
  it("converts list inside expand to HTML list elements", () => {
    const md = ":::expand My Section\n- Item one\n- Item two\n:::";
    const html = calloutMarkdownToHtml(md);
    expect(html).toContain('data-expand-title="My Section"');
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>");
    expect(html).toContain("Item one");
    expect(html).toContain("Item two");
  });

  it("unescapes a backslash-escaped image marker inside expand (BRDG-352)", () => {
    // The loader must unescape `\!` to a literal `!` so it is the inverse of the
    // tiptap-markdown serializer (which re-escapes literal `\`). Leaving `\!` literal
    // doubled the backslash on every round-trip.
    const md = ":::expand T\n\\![image-20260404-222028.png](/api/attachments/att-235476)\n:::";
    const html = calloutMarkdownToHtml(md);
    expect(html).toContain('!<a href="/api/attachments/att-235476">');
    expect(html).not.toContain("\\!");
  });

  it("keeps an escaped asterisk literal (no emphasis) inside expand (BRDG-352)", () => {
    const md = ":::expand T\nuse \\*literal\\* asterisks\n:::";
    const html = calloutMarkdownToHtml(md);
    expect(html).toContain("use *literal* asterisks");
    expect(html).not.toContain("<em>");
    expect(html).not.toContain("\\*");
  });

  it("converts heading inside expand to HTML heading", () => {
    const md = ":::expand T\n## My Heading\n\nSome text.\n:::";
    const html = calloutMarkdownToHtml(md);
    expect(html).toContain("<h2>");
    expect(html).toContain("My Heading");
    expect(html).toContain("Some text.");
  });

  it("converts code block inside expand to HTML pre/code", () => {
    const md = ":::expand T\n```js\nconsole.log('hi');\n```\n:::";
    const html = calloutMarkdownToHtml(md);
    expect(html).toContain("<pre");
    expect(html).toContain("<code");
    expect(html).toContain("console.log");
  });

  it("converts ordered list inside callout to HTML ol", () => {
    const md = ":::info\n1. Step one\n2. Step two\n:::";
    const html = calloutMarkdownToHtml(md);
    expect(html).toContain("<ol>");
    expect(html).toContain("Step one");
    expect(html).toContain("Step two");
  });

  it("round-trips rich expand content: markdown → html → markdown", () => {
    const original = ":::expand Details\n- Item one\n- Item two\n\n## Heading\n\nParagraph text.\n:::";
    const html = calloutMarkdownToHtml(original);
    const roundTripped = htmlToCalloutMarkdown(html);
    expect(roundTripped).toContain(":::expand Details");
    expect(roundTripped).toContain("- Item one");
    expect(roundTripped).toContain("- Item two");
    expect(roundTripped).toContain("## Heading");
    expect(roundTripped).toContain("Paragraph text.");
  });

  it("loads callout (note) inside expand without losing content", () => {
    const md = ":::expand My expand\n:::note\nNote content here\n:::\n:::";
    const html = calloutMarkdownToHtml(md);
    expect(html).toContain('data-expand-title="My expand"');
    expect(html).toContain('data-callout-type="note"');
    expect(html).toContain("Note content here");
    // Verify structural nesting: callout div must appear inside the details element
    const detailsStart = html.indexOf("<details");
    const detailsEnd = html.indexOf("</details>");
    const calloutPos = html.indexOf('data-callout-type="note"');
    expect(calloutPos).toBeGreaterThan(detailsStart);
    expect(calloutPos).toBeLessThan(detailsEnd);
  });

  it("loads multiple callouts inside expand, all nested correctly", () => {
    const md = [
      ":::expand Title",
      ":::note",
      "Note type",
      ":::",
      "",
      ":::info",
      "Info type",
      ":::",
      "",
      ":::warning",
      "Warning type",
      ":::",
      "",
      ":::success",
      "Success type",
      ":::",
      "",
      ":::error",
      "Error type",
      ":::",
      ":::",
    ].join("\n");

    const html = calloutMarkdownToHtml(md);
    const detailsStart = html.indexOf("<details");
    const detailsEnd = html.indexOf("</details>");

    for (const type of ["note", "info", "warning", "success", "error"]) {
      const pos = html.indexOf(`data-callout-type="${type}"`);
      expect(pos).toBeGreaterThan(detailsStart);
      expect(pos).toBeLessThan(detailsEnd);
    }
  });

  it("round-trips callout inside expand: markdown → html → markdown", () => {
    const original = ":::expand Details\n:::note\nNote content\n:::\n:::";
    const html = calloutMarkdownToHtml(original);
    const roundTripped = htmlToCalloutMarkdown(html);
    expect(roundTripped).toContain(":::expand Details");
    expect(roundTripped).toContain(":::note");
    expect(roundTripped).toContain("Note content");
    // Verify :::note is nested inside :::expand (appears before expand closes)
    const expandStart = roundTripped.indexOf(":::expand Details");
    const notePos = roundTripped.indexOf(":::note");
    // The expand closer (:::) must appear AFTER the note block
    const noteClose = roundTripped.indexOf(":::", notePos + 3);
    const expandClose = roundTripped.indexOf(":::", noteClose + 3);
    expect(notePos).toBeGreaterThan(expandStart);
    expect(expandClose).toBeGreaterThan(noteClose);
  });

  it("round-trips multiple callouts inside expand, all remain nested", () => {
    const original = [
      ":::expand Title",
      ":::note",
      "Note type",
      ":::",
      "",
      ":::info",
      "Info type",
      ":::",
      "",
      ":::warning",
      "Warning type",
      ":::",
      ":::",
    ].join("\n");

    const html = calloutMarkdownToHtml(original);
    const roundTripped = htmlToCalloutMarkdown(html);

    expect(roundTripped).toContain(":::expand Title");
    expect(roundTripped).toContain(":::note");
    expect(roundTripped).toContain(":::info");
    expect(roundTripped).toContain(":::warning");

    // All callout openers must appear before the expand closer
    const expandStart = roundTripped.indexOf(":::expand Title");
    // Find the last closing ::: (expand closer)
    const lastClose = roundTripped.lastIndexOf(":::");
    for (const marker of [":::note", ":::info", ":::warning"]) {
      const pos = roundTripped.indexOf(marker);
      expect(pos).toBeGreaterThan(expandStart);
      expect(pos).toBeLessThan(lastClose);
    }
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

// BRDG-280: a multi-line paragraph (soft break) is wrapped in <p>...<br>...</p>. Before the
// fix, the raw markdown was placed inside the HTML block where markdown-it never re-parses it,
// so `**bold**` / `` `code` `` survived as literal text and got backslash-escaped on serialize.
// Each line must now be inline-converted so the marks reach TipTap as real marks.
describe("calloutMarkdownToHtml (multi-line paragraph inline marks) - BRDG-280", () => {
  it("converts bold inside a multi-line paragraph instead of leaving it literal", () => {
    const html = calloutMarkdownToHtml("**Background info**:\nsecond line");
    expect(html).toContain("<strong>Background info</strong>:");
    expect(html).toContain("<br>");
    expect(html).not.toContain("**Background info**");
  });

  it("converts inline code inside a multi-line paragraph", () => {
    const html = calloutMarkdownToHtml("Use `VPUPG` here\nand `VPUPG-100` there");
    expect(html).toContain("<code>VPUPG</code>");
    expect(html).toContain("<code>VPUPG-100</code>");
    expect(html).not.toContain("`VPUPG`");
  });

  it("leaves a single-line paragraph raw (parsed by markdown-it at top level)", () => {
    // Single lines must NOT be double-converted here.
    const html = calloutMarkdownToHtml("**Background info**:");
    expect(html).not.toContain("<p>");
    expect(html).toBe("**Background info**:");
  });
});

// BRDG-280: the CSSOM normalizes inline `color:#hex` to `rgb(...)` on load, so getHTML reads
// it back as rgb. Serialize must convert 3-component rgb() back to hex to keep {color:#hex}
// macros byte-stable; rgba(), named colors, and existing hex are untouched.
describe("htmlToCalloutMarkdown (color rgb -> hex) - BRDG-280", () => {
  it("converts rgb() back to lowercase 6-digit hex", () => {
    const md = htmlToCalloutMarkdown('<span style="color: rgb(151, 160, 175)">text</span>');
    expect(md).toBe("{color:#97a0af}text{color}");
  });

  it("leaves an existing hex color untouched", () => {
    const md = htmlToCalloutMarkdown('<span style="color: #97a0af">text</span>');
    expect(md).toBe("{color:#97a0af}text{color}");
  });

  it("leaves rgba() untouched (not a 3-component rgb)", () => {
    const md = htmlToCalloutMarkdown('<span style="color: rgba(151, 160, 175, 0.5)">text</span>');
    expect(md).toBe("{color:rgba(151, 160, 175, 0.5)}text{color}");
  });

  it("leaves a named color untouched", () => {
    const md = htmlToCalloutMarkdown('<span style="color: red">text</span>');
    expect(md).toBe("{color:red}text{color}");
  });
});
