// Converts Markdown to Atlassian Document Format (ADF) JSON.
// Handles the subset of markdown features used in story descriptions.
// ADF spec: https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/

interface AdfNode {
  type: string;
  content?: AdfNode[];
  text?: string;
  marks?: AdfMark[];
  attrs?: Record<string, unknown>;
}

interface AdfMark {
  type: string;
  attrs?: Record<string, unknown>;
}

// Lines that start a block-level element (should not be grouped into paragraphs)
function isBlockLine(line: string): boolean {
  const t = line.trim();
  return (
    /^#{1,6}\s/.test(t) ||
    /^---+$/.test(t) ||
    /^```/.test(t) ||
    /^> /.test(t) || t === ">" ||
    /^[-*]\s/.test(t) ||
    /^\d+\.\s/.test(t) ||
    /^\|/.test(t) ||
    /^:::/.test(t)
  );
}

export function markdownToAdf(markdown: string): AdfNode {
  const lines = markdown.split("\n");
  const content: AdfNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Callout / expand fence blocks: :::type or :::expand Title
    const fenceMatch = line.match(/^:::(info|warning|error|note|success|expand)\b(.*)$/);
    if (fenceMatch) {
      const fenceType = fenceMatch[1];
      const fenceArg = fenceMatch[2].trim();
      const innerLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ":::") {
        innerLines.push(lines[i]);
        i++;
      }
      i++; // skip closing :::

      if (fenceType === "expand") {
        const innerAdf = markdownToAdf(innerLines.join("\n"));
        content.push({
          type: "expand",
          attrs: { title: fenceArg },
          content: innerAdf.content && innerAdf.content.length > 0
            ? innerAdf.content
            : [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
        });
      } else {
        const innerAdf = markdownToAdf(innerLines.join("\n"));
        content.push({
          type: "panel",
          attrs: { panelType: fenceType },
          content: innerAdf.content && innerAdf.content.length > 0
            ? innerAdf.content
            : [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
        });
      }
      continue;
    }

    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      content.push({
        type: "codeBlock",
        attrs: lang ? { language: lang } : {},
        content: [{ type: "text", text: codeLines.join("\n") }],
      });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      content.push({
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: parseInline(headingMatch[2]),
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      content.push({ type: "rule" });
      i++;
      continue;
    }

    // Table: collect consecutive pipe lines
    if (/^\|/.test(line.trim())) {
      const tableLines: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i].trim())) {
        tableLines.push(lines[i]);
        i++;
      }
      const tableNode = parseTable(tableLines);
      if (tableNode) content.push(tableNode);
      continue;
    }

    // Bullet list
    if (/^[-*]\s/.test(line)) {
      const items: AdfNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push({
          type: "listItem",
          content: [{
            type: "paragraph",
            content: parseInline(lines[i].replace(/^[-*]\s/, "")),
          }],
        });
        i++;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: AdfNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push({
          type: "listItem",
          content: [{
            type: "paragraph",
            content: parseInline(lines[i].replace(/^\d+\.\s/, "")),
          }],
        });
        i++;
      }
      content.push({ type: "orderedList", content: items });
      continue;
    }

    // Blockquote: collect consecutive > lines
    if (line.startsWith("> ") || line === ">") {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith("> ") || lines[i] === ">")) {
        quoteLines.push(lines[i] === ">" ? "" : lines[i].slice(2));
        i++;
      }
      // Group into paragraphs by blank lines within the quote
      const paragraphs = quoteLines.join("\n").split(/\n\n+/).filter(Boolean);
      const innerContent: AdfNode[] = paragraphs.map((para) => {
        const paraLines = para.split("\n");
        const nodes: AdfNode[] = [];
        paraLines.forEach((l, li) => {
          if (li > 0) nodes.push({ type: "hardBreak" });
          nodes.push(...parseInline(l));
        });
        return { type: "paragraph", content: nodes };
      });
      content.push({
        type: "blockquote",
        content: innerContent.length > 0
          ? innerContent
          : [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
      });
      continue;
    }

    // Empty line (skip)
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: collect consecutive non-block, non-blank lines.
    // Single newlines become hardBreak nodes within the same paragraph.
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !isBlockLine(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }

    const paraContent: AdfNode[] = [];
    paraLines.forEach((l, li) => {
      if (li > 0) paraContent.push({ type: "hardBreak" });
      paraContent.push(...parseInline(l));
    });
    content.push({ type: "paragraph", content: paraContent });
  }

  return { type: "doc", version: 1, content } as AdfNode & { version: number };
}

function parseTable(tableLines: string[]): AdfNode | null {
  if (tableLines.length < 2) return null;

  // Parse rows by splitting on |
  const parseRow = (line: string): string[] =>
    line
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());

  const headerRow = parseRow(tableLines[0]);
  const separatorRow = parseRow(tableLines[1]);

  // Separator row must be all dashes
  const isSeparator = separatorRow.every((c) => /^-+$/.test(c));
  if (!isSeparator) return null;

  const rows: AdfNode[] = [];

  // Header row
  rows.push({
    type: "tableRow",
    content: headerRow.map((cell) => ({
      type: "tableHeader",
      attrs: { colwidth: null },
      content: [{ type: "paragraph", content: parseInline(cell) }],
    })),
  });

  // Data rows
  for (let j = 2; j < tableLines.length; j++) {
    const cells = parseRow(tableLines[j]);
    rows.push({
      type: "tableRow",
      content: cells.map((cell) => ({
        type: "tableCell",
        attrs: { colwidth: null },
        content: [{ type: "paragraph", content: parseInline(cell) }],
      })),
    });
  }

  return { type: "table", content: rows };
}

function parseInline(text: string): AdfNode[] {
  const nodes: AdfNode[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Colored text {color:#hex}text{color} — parse inner content and add color mark to each node
    const colorMatch = remaining.match(/^\{color:(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\}(.*?)\{color\}/);
    if (colorMatch) {
      const color = colorMatch[1];
      const innerNodes = parseInline(colorMatch[2]);
      for (const node of innerNodes) {
        if (node.type === "text") {
          node.marks = [...(node.marks ?? []), { type: "textColor", attrs: { color } }];
        }
      }
      nodes.push(...innerNodes);
      remaining = remaining.slice(colorMatch[0].length);
      continue;
    }

    // Bold+italic ***text***  (must come before bold and italic)
    const boldItalicMatch = remaining.match(/^\*\*\*(.+?)\*\*\*/);
    if (boldItalicMatch) {
      nodes.push({ type: "text", text: boldItalicMatch[1], marks: [{ type: "strong" }, { type: "em" }] });
      remaining = remaining.slice(boldItalicMatch[0].length);
      continue;
    }

    // Bold **text**
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      nodes.push({ type: "text", text: boldMatch[1], marks: [{ type: "strong" }] });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Strikethrough ~~text~~
    const strikeMatch = remaining.match(/^~~(.+?)~~/);
    if (strikeMatch) {
      // Parse inner content and add strike mark
      const innerNodes = parseInline(strikeMatch[1]);
      for (const node of innerNodes) {
        if (node.type === "text") {
          node.marks = [...(node.marks ?? []), { type: "strike" }];
        }
      }
      nodes.push(...innerNodes);
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // Italic *text*
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) {
      nodes.push({ type: "text", text: italicMatch[1], marks: [{ type: "em" }] });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Inline code `text`
    const codeMatch = remaining.match(/^`(.+?)`/);
    if (codeMatch) {
      nodes.push({ type: "text", text: codeMatch[1], marks: [{ type: "code" }] });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Emoji shortname :name:
    const emojiMatch = remaining.match(/^:([a-zA-Z0-9_+\-]+):/);
    if (emojiMatch) {
      nodes.push({
        type: "emoji",
        attrs: { shortName: `:${emojiMatch[1]}:`, text: `:${emojiMatch[1]}:` },
      });
      remaining = remaining.slice(emojiMatch[0].length);
      continue;
    }

    // Link [text](url)
    const linkMatch = remaining.match(/^\[(.+?)\]\((.+?)\)/);
    if (linkMatch) {
      nodes.push({
        type: "text",
        text: linkMatch[1],
        marks: [{ type: "link", attrs: { href: linkMatch[2] } }],
      });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Plain text up to next special char
    const plainMatch = remaining.match(/^[^*`~[\]{:]+/);
    if (plainMatch) {
      nodes.push({ type: "text", text: plainMatch[0] });
      remaining = remaining.slice(plainMatch[0].length);
      continue;
    }

    // Single special char that didn't match a pattern
    nodes.push({ type: "text", text: remaining[0] });
    remaining = remaining.slice(1);
  }

  return nodes;
}
