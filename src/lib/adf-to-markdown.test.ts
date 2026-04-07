import { describe, it, expect } from "vitest";
import { adfToMarkdown } from "./adf-to-markdown";

describe("adfToMarkdown", () => {
  it("returns empty string for null/undefined", () => {
    expect(adfToMarkdown(null)).toBe("");
    expect(adfToMarkdown(undefined)).toBe("");
    expect(adfToMarkdown("")).toBe("");
  });

  it("converts a simple paragraph", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("Hello world");
  });

  it("converts headings at different levels", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Title" }],
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Subtitle" }],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("# Title\n\n### Subtitle");
  });

  it("converts bullet lists", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Item A" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Item B" }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("- Item A\n- Item B");
  });

  it("converts ordered lists", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "First" }],
                },
              ],
            },
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Second" }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("1. First\n2. Second");
  });

  it("converts code blocks with language", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "typescript" },
          content: [{ type: "text", text: "const x = 1;" }],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("```typescript\nconst x = 1;\n```");
  });

  it("converts blockquotes", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Quoted text" }],
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("> Quoted text");
  });

  it("applies inline marks: strong, em, code, strike, link", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "bold", marks: [{ type: "strong" }] },
            { type: "text", text: " and " },
            { type: "text", text: "italic", marks: [{ type: "em" }] },
            { type: "text", text: " and " },
            { type: "text", text: "code", marks: [{ type: "code" }] },
            { type: "text", text: " and " },
            { type: "text", text: "strike", marks: [{ type: "strike" }] },
            { type: "text", text: " and " },
            {
              type: "text",
              text: "link",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe(
      "**bold** and *italic* and `code` and ~~strike~~ and [link](https://example.com)"
    );
  });

  it("handles nested marks (bold + italic)", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "both",
              marks: [{ type: "strong" }, { type: "em" }],
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("***both***");
  });

  it("converts tables with headers", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Name" }],
                    },
                  ],
                },
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Value" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "A" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "1" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = adfToMarkdown(adf);
    expect(result).toContain("| Name | Value |");
    expect(result).toContain("| --- | --- |");
    expect(result).toContain("| A | 1 |");
  });

  it("handles horizontal rule", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Before" }],
        },
        { type: "rule" },
        {
          type: "paragraph",
          content: [{ type: "text", text: "After" }],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toContain("---");
  });

  it("handles mentions and emoji", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "mention", attrs: { text: "@john" } },
            { type: "text", text: " says " },
            { type: "emoji", attrs: { shortName: ":thumbsup:" } },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("@john says :thumbsup:");
  });

  it("gracefully degrades unknown node types", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "unknownType",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Fallback text" }],
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toContain("Fallback text");
  });

  it("handles hardBreak", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Line 1" },
            { type: "hardBreak" },
            { type: "text", text: "Line 2" },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe("Line 1\nLine 2");
  });

  it("handles empty doc", () => {
    const adf = { type: "doc", content: [] };
    expect(adfToMarkdown(adf)).toBe("");
  });

  it("converts panel nodes to callout fence syntax", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "panel",
          attrs: { panelType: "note" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "New info" }],
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe(":::note\nNew info\n:::");
  });

  it("moves trailing space outside bold/em delimiters", () => {
    // Jira ADF often has "text: " as a bold run followed by plain text.
    // CommonMark forbids trailing spaces inside ** so the space must move out.
    const adf = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Discuss: ", marks: [{ type: "strong" }] },
                    { type: "text", text: "Valk Verrast" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = adfToMarkdown(adf);
    // Trailing punctuation is moved outside ** so markdown-it correctly closes the bold delimiter.
    expect(result).toContain("**Discuss**: Valk Verrast");
    expect(result).not.toContain("**Discuss: **");
  });

  it("maps unknown panel types to info", () => {
    const adf = {
      type: "doc",
      content: [
        {
          type: "panel",
          attrs: { panelType: "custom" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Content" }],
            },
          ],
        },
      ],
    };
    expect(adfToMarkdown(adf)).toBe(":::info\nContent\n:::");
  });
});
