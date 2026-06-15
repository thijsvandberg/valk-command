import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { buildEditorExtensions, markdownToEditorHtml, getEditorMarkdown } from "./RichEditor";
import { markdownEqualIgnoringSpacing } from "@/lib/normalize-markdown";

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

  it("preserves a link whose text equals its url across save + reload", () => {
    // tiptap-markdown serializes such links as angle-bracket autolinks (<url>).
    // On reload the HTML-enabled parser used to mistake them for a tag and drop
    // the link. The stored form below is exactly what a prior save produced.
    const stored = [
      "Zou dus opgelost moeten zijn in: rooms - <https://newstory.atlassian.net/browse/VPL-38475>",
      "maar dat is niet het geval.",
      "",
      "Daarom hadden we deze issues: mapping - <https://newstory.atlassian.net/browse/VPL-46239>",
    ].join("\n");
    const out = roundTrip(stored);
    expect(out).toContain("VPL-38475");
    expect(out).toContain("VPL-46239");
  });

  it("leaves angle-bracket autolinks inside fenced code untouched", () => {
    const input = "```\n<https://example.com>\n```";
    const out = roundTrip(input);
    expect(out).toContain("<https://example.com>");
    expect(out).not.toContain("[https://example.com]");
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

  it("does not duplicate the expand title into its body (BRDG-280 follow-up)", () => {
    // The <summary> used to be parsed as a content block, copying the title into
    // the body and growing an extra title line on every load->serialize cycle.
    const input = ":::expand Expand\nbody text\n:::";
    const once = roundTrip(input);
    // Title appears exactly once (on the fence line), never copied into the body.
    expect(once.match(/Expand/g)?.length).toBe(1);
    // No content is lost or added; the only diff is cosmetic fence spacing that
    // normalizeMarkdownForCompare folds, so the app shows no phantom edit.
    expect(markdownEqualIgnoringSpacing(input, once)).toBe(true);
    // Idempotent: never grows on subsequent cycles.
    expect(roundTrip(once)).toBe(once);
  });

  it("keeps a multi-line expand body stable and content-equal across passes", () => {
    const input = ":::expand More details\nfirst line\nsecond line\n:::";
    const once = roundTrip(input);
    expect(once.match(/More details/g)?.length).toBe(1);
    expect(once).toContain("first line");
    expect(once).toContain("second line");
    expect(markdownEqualIgnoringSpacing(input, once)).toBe(true);
    expect(roundTrip(once)).toBe(once);
  });

  it("preserves literal backslashes in prose", () => {
    expect(roundTrip("a \\\\ b")).toBe("a \\\\ b");
    expect(roundTrip("some \\\\ backslashes \\\\ here")).toBe("some \\\\ backslashes \\\\ here");
  });
});
