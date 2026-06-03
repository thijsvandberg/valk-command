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
      let fenceDepth = 0;
      while (i < lines.length) {
        const innerLine = lines[i];
        if (innerLine.trim() === ":::") {
          if (fenceDepth === 0) break; // this is the closing ::: for the current fence
          fenceDepth--;
        } else if (/^:::(info|warning|error|note|success|expand)\b/.test(innerLine.trim())) {
          fenceDepth++;
        }
        innerLines.push(innerLine);
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

    // List (bullet or ordered) — handles nested indentation recursively
    if (/^[-*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const result = parseListBlock(lines, i, 0);
      content.push(result.node);
      i = result.nextIdx;
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
      attrs: { colspan: 1, rowspan: 1, colwidth: [] },
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
        attrs: { colspan: 1, rowspan: 1, colwidth: [] },
        content: [{ type: "paragraph", content: parseInline(cell) }],
      })),
    });
  }

  return {
    type: "table",
    attrs: { isNumberColumnEnabled: false, layout: "default" },
    content: rows,
  };
}

// Recursively parses a list block (bullet or ordered) with full nesting support.
// baseIndent is the column offset of the list markers at this level.
function parseListBlock(
  lines: string[],
  startIdx: number,
  baseIndent: number,
): { node: AdfNode; nextIdx: number } {
  const firstTrimmed = lines[startIdx].trimStart();
  const isBullet = /^[-*]\s/.test(firstTrimmed);
  const listType = isBullet ? "bulletList" : "orderedList";

  const items: AdfNode[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip blank lines between sibling items
    if (trimmed === "") {
      i++;
      continue;
    }

    const lineIndent = line.length - line.trimStart().length;
    // Match the marker followed by whitespace OR end-of-line. After trim() an
    // empty item ("- ") collapses to just the marker ("-"), so requiring a
    // trailing \s here would reject it. The outer parser detects the raw line
    // (with its trailing space) as a list, so a stricter test here would leave
    // i unadvanced and spin forever. Treat a bare marker as an empty item.
    const isOurItem =
      lineIndent === baseIndent &&
      (isBullet ? /^[-*](\s|$)/.test(trimmed) : /^\d+\.(\s|$)/.test(trimmed));

    if (!isOurItem) break;

    const itemText = isBullet
      ? trimmed.replace(/^[-*]\s*/, "")
      : trimmed.replace(/^\d+\.\s*/, "");

    i++;

    const itemContent: AdfNode[] = [];
    let textLines: string[] = [itemText];

    // Collect content belonging to this item: continuation text and nested lists
    while (i < lines.length) {
      const nextLine = lines[i];
      const nextTrimmed = nextLine.trim();

      if (nextTrimmed === "") {
        // Blank line: peek ahead to see if content continues at child indent
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === "") j++;
        if (j >= lines.length) {
          i = j;
          break;
        }
        const peekIndent = lines[j].length - lines[j].trimStart().length;
        if (peekIndent < baseIndent + 2) break;
        i++;
        continue;
      }

      const nextIndent = nextLine.length - nextLine.trimStart().length;

      if (nextIndent < baseIndent + 2) break;

      // Nested list at the direct child indent
      if (
        nextIndent === baseIndent + 2 &&
        (/^[-*]\s/.test(nextTrimmed) || /^\d+\.\s/.test(nextTrimmed))
      ) {
        // Flush accumulated text as a paragraph before the nested list
        if (textLines.length > 0) {
          const paraNodes: AdfNode[] = [];
          textLines.forEach((l, li) => {
            if (li > 0) paraNodes.push({ type: "hardBreak" });
            paraNodes.push(...parseInline(l));
          });
          itemContent.push({ type: "paragraph", content: paraNodes });
          textLines = [];
        }
        const nested = parseListBlock(lines, i, baseIndent + 2);
        itemContent.push(nested.node);
        i = nested.nextIdx;
      } else {
        // Continuation text for the current list item
        textLines.push(nextTrimmed);
        i++;
      }
    }

    // Flush any remaining text lines as a paragraph
    if (textLines.length > 0) {
      const paraNodes: AdfNode[] = [];
      textLines.forEach((l, li) => {
        if (li > 0) paraNodes.push({ type: "hardBreak" });
        paraNodes.push(...parseInline(l));
      });
      itemContent.push({ type: "paragraph", content: paraNodes });
    }

    items.push({ type: "listItem", content: itemContent });
  }

  return { node: { type: listType, content: items }, nextIdx: i };
}

// Jira ADF textColor only accepts hex (#RGB or #RRGGBB). Convert rgb/rgba to hex.
function toHexColor(color: string): string {
  if (color.startsWith("#")) return color;
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) {
    return "#" + [m[1], m[2], m[3]]
      .map((v) => parseInt(v, 10).toString(16).padStart(2, "0"))
      .join("");
  }
  // Named colors: fall back as-is (Jira may or may not accept them)
  return color;
}

// The ADF `code` mark is exclusive: Jira rejects (INVALID_INPUT) any text node
// that combines `code` with formatting marks like strong/em/strike/textColor.
// Apply a formatting mark only to text nodes that are not already code-marked,
// so e.g. **bold (`code`)** keeps the code segment as plain inline code.
function applyMark(nodes: AdfNode[], mark: AdfMark, prepend = false): void {
  for (const node of nodes) {
    if (node.type !== "text") continue;
    if (node.marks?.some((m) => m.type === "code")) continue;
    node.marks = prepend ? [mark, ...(node.marks ?? [])] : [...(node.marks ?? []), mark];
  }
}

function parseInline(text: string): AdfNode[] {
  const nodes: AdfNode[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Colored text {color:#hex}text{color} — parse inner content and add color mark to each node
    const colorMatch = remaining.match(/^\{color:(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-zA-Z]+)\}(.*?)\{color\}/);
    if (colorMatch) {
      // Jira ADF textColor requires hex; convert rgb/rgba if needed
      const color = toHexColor(colorMatch[1]);
      const innerNodes = parseInline(colorMatch[2]);
      applyMark(innerNodes, { type: "textColor", attrs: { color } });
      nodes.push(...innerNodes);
      remaining = remaining.slice(colorMatch[0].length);
      continue;
    }

    // Bold+italic ***text***  (must come before bold and italic)
    const boldItalicMatch = remaining.match(/^\*\*\*(.+?)\*\*\*/);
    if (boldItalicMatch) {
      const innerNodes = parseInline(boldItalicMatch[1]);
      applyMark(innerNodes, { type: "em" }, true);
      applyMark(innerNodes, { type: "strong" }, true);
      nodes.push(...innerNodes);
      remaining = remaining.slice(boldItalicMatch[0].length);
      continue;
    }

    // Bold **text**
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      const innerNodes = parseInline(boldMatch[1]);
      applyMark(innerNodes, { type: "strong" }, true);
      nodes.push(...innerNodes);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Strikethrough ~~text~~
    const strikeMatch = remaining.match(/^~~(.+?)~~/);
    if (strikeMatch) {
      // Parse inner content and add strike mark
      const innerNodes = parseInline(strikeMatch[1]);
      applyMark(innerNodes, { type: "strike" });
      nodes.push(...innerNodes);
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // Italic *text*
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) {
      const innerNodes = parseInline(italicMatch[1]);
      applyMark(innerNodes, { type: "em" }, true);
      nodes.push(...innerNodes);
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
