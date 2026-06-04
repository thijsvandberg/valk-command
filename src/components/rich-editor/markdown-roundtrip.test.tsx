import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { buildEditorExtensions, markdownToEditorHtml, getEditorMarkdown } from "./RichEditor";

// BRDG-280: end-to-end load -> serialize identity over a representative corpus, using a real
// TipTap editor built from the exact production extension set. Before the fixes, the multi-line
// bold/inline-code cases lost their marks (backslash-escaped) and color macros normalized to
// rgb(); these assertions reproduce and lock the fixes.
function roundTrip(markdown: string): string {
  const editor = new Editor({
    extensions: buildEditorExtensions(),
    content: markdownToEditorHtml(markdown),
  });
  try {
    return getEditorMarkdown(editor);
  } finally {
    editor.destroy();
  }
}

describe("markdown round-trip (load -> serialize identity) - BRDG-280", () => {
  it("preserves bold followed by a colon", () => {
    expect(roundTrip("**Background info**:")).toBe("**Background info**:");
  });

  it("preserves bold and inline code inside a multi-line paragraph", () => {
    const input = "**Background info**:\nUse `VPUPG` and `VPUPG-100` here";
    expect(roundTrip(input)).toBe(input);
  });

  it("preserves inline code on a single line", () => {
    expect(roundTrip("Use `VPUPG` now")).toBe("Use `VPUPG` now");
  });

  it("preserves a hex color macro (no rgb normalization)", () => {
    expect(roundTrip("{color:#97a0af}some text{color}")).toBe("{color:#97a0af}some text{color}");
  });

  it("preserves a markdown link", () => {
    const input = "See [Example](https://example.com) for details";
    expect(roundTrip(input)).toBe(input);
  });

  it("preserves square brackets in plain text", () => {
    expect(roundTrip("array[index] access")).toBe("array[index] access");
  });

  it("does not over-strip an intentional literal asterisk", () => {
    // A literal `*` between spaces is not emphasis; it must NOT be turned into a mark, and the
    // visible text must survive. (Whether it serializes as `*` or `\*` is acceptable escaping.)
    const out = roundTrip("2 * 3 = 6");
    expect(out).not.toContain("<");
    expect(out.replace(/\\/g, "")).toBe("2 * 3 = 6");
  });
});
