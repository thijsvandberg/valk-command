// Converts Atlassian Document Format (ADF) JSON to Markdown.
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

export function adfToMarkdown(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as AdfNode;

  if (n.type === "doc") {
    return convertChildren(n).trim();
  }

  return convertNode(n);
}

function convertChildren(node: AdfNode): string {
  if (!node.content) return "";
  return node.content.map(convertNode).join("");
}

function convertNode(node: AdfNode): string {
  switch (node.type) {
    case "paragraph":
      return convertChildren(node) + "\n\n";

    case "heading": {
      const level = (node.attrs?.level as number) || 1;
      const prefix = "#".repeat(Math.min(level, 6));
      return `${prefix} ${convertChildren(node).trim()}\n\n`;
    }

    case "bulletList":
      return convertList(node, "bullet") + "\n";

    case "orderedList":
      return convertList(node, "ordered") + "\n";

    case "taskList":
      return convertTaskList(node) + "\n";

    case "listItem":
    case "taskItem":
      return convertChildren(node);

    case "codeBlock": {
      const lang = (node.attrs?.language as string) || "";
      const code = convertChildren(node).replace(/\n+$/g, "");
      return `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }

    case "panel": {
      // Jira panel types map directly to our callout fence syntax
      const panelType = (node.attrs?.panelType as string) || "info";
      const validTypes = ["info", "warning", "error", "note", "success"];
      const type = validTypes.includes(panelType) ? panelType : "info";
      const inner = convertChildren(node).trim();
      return `:::${type}\n${inner}\n:::\n\n`;
    }

    case "expand": {
      // Jira expand/collapsible section
      const title = (node.attrs?.title as string) || "";
      const inner = convertChildren(node).trim();
      return `:::expand ${title}\n${inner}\n:::\n\n`;
    }

    case "nestedExpand": {
      const title = (node.attrs?.title as string) || "";
      const inner = convertChildren(node).trim();
      return `:::expand ${title}\n${inner}\n:::\n\n`;
    }

    case "blockquote": {
      const inner = convertChildren(node).trim();
      const quoted = inner
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      return quoted + "\n\n";
    }

    case "rule":
      return "---\n\n";

    case "table":
      return convertTable(node) + "\n\n";

    case "tableRow":
      return convertChildren(node);

    case "tableHeader":
    case "tableCell":
      return convertChildren(node);

    case "mediaSingle":
    case "mediaGroup":
      return convertChildren(node);

    case "media": {
      const alt = (node.attrs?.alt as string) || "";
      const fileId = (node.attrs?.id as string) || "";
      // Use alt if available, otherwise fallback hint with fileId prefix
      const displayName = alt || (fileId ? `media-${fileId.slice(0, 8)}` : "attachment");
      return `![${displayName}](attachment)\n\n`;
    }

    case "hardBreak":
      return "\n";

    case "mention": {
      const mentionText = (node.attrs?.text as string) || "";
      return mentionText;
    }

    case "date": {
      // Inline date node. Markdown has no date primitive, so we round-trip the
      // raw epoch-millis timestamp inside a {date:...} token (mirrors the
      // {color:...} convention) that markdownToAdf restores to a date node.
      const ts = node.attrs?.timestamp;
      const tsStr = ts === undefined || ts === null ? "" : String(ts);
      return tsStr ? `{date:${tsStr}}` : "";
    }

    case "status": {
      // Status lozenge. The label lives in attrs.text; preserve it (with its
      // colour) inside a {status:colour|text} token so it survives a round-trip
      // and is never re-detected as a heading/list block on the way back.
      const statusText = (node.attrs?.text as string) || "";
      if (!statusText) return "";
      const color = (node.attrs?.color as string) || "neutral";
      return `{status:${color}|${statusText}}`;
    }

    case "layoutSection":
      // Multi-column layout. Markdown cannot represent columns; preserve the
      // text content (structure is intentionally flattened, BRDG-267).
      return convertChildren(node) + "\n\n";

    case "layoutColumn":
      return convertChildren(node);

    case "decisionList":
      // Markdown has no decision primitive; preserve each decision's text.
      return convertChildren(node) + "\n";

    case "decisionItem":
      return convertChildren(node).trim() + "\n";

    case "emoji": {
      const shortName = (node.attrs?.shortName as string) || "";
      return shortName;
    }

    case "text":
      return applyMarks(node.text || "", node.marks);

    case "inlineCard": {
      const url = (node.attrs?.url as string) || "";
      return url ? `[${url}](${url})` : "";
    }

    default:
      // Graceful degradation: extract text from unknown nodes
      if (node.text) return node.text;
      if (node.content) return convertChildren(node);
      return "";
  }
}

// Splits trailing punctuation and whitespace out of bold/italic content so that
// markdown-it correctly identifies the closing delimiter. markdown-it fails to
// close `**` when it is immediately preceded by punctuation (e.g. **Discuss:**
// does not render as bold because `:**` is treated as an ambiguous closer).
function splitTrailing(text: string): { inner: string; punct: string; space: string } {
  const space = text.match(/(\s+)$/)?.[1] ?? "";
  const withoutSpace = space ? text.slice(0, -space.length) : text;
  // Move trailing punctuation outside only when there is a word character before it,
  // so that purely-punctuation content (e.g. bold(":")) is left unchanged.
  const punctMatch = withoutSpace.match(/^([\s\S]*\w)([^\w\s]+)$/);
  if (punctMatch) {
    return { inner: punctMatch[1], punct: punctMatch[2], space };
  }
  return { inner: withoutSpace, punct: "", space };
}

function applyMarks(text: string, marks?: AdfMark[]): string {
  if (!marks || marks.length === 0) return text;

  let result = text;
  for (const mark of marks) {
    switch (mark.type) {
      case "strong": {
        // Trailing whitespace must be outside ** (CommonMark rule).
        // Also move trailing punctuation outside: markdown-it fails to close `**`
        // when preceded by punctuation and followed by whitespace (e.g. **Discuss:**).
        const { inner, punct, space } = splitTrailing(result);
        result = `**${inner}**${punct}${space}`;
        break;
      }
      case "em": {
        const { inner, punct, space } = splitTrailing(result);
        result = `*${inner}*${punct}${space}`;
        break;
      }
      case "code":
        result = `\`${result}\``;
        break;
      case "strike":
        result = `~~${result}~~`;
        break;
      case "link": {
        const href = (mark.attrs?.href as string) || "";
        result = `[${result}](${href})`;
        break;
      }
      case "textColor": {
        // Preserve color using custom {color:#hex}text{color} syntax
        const color = (mark.attrs?.color as string) || "";
        if (color) {
          result = `{color:${color}}${result}{color}`;
        }
        break;
      }
      case "underline":
      case "subsup":
        // Decision (BRDG-267): markdown has no underline / super-subscript, so
        // the mark is dropped but the text content is always preserved. The
        // round-trip bar is "no text loss", not full mark fidelity.
        break;
    }
  }
  return result;
}

function convertList(node: AdfNode, style: "bullet" | "ordered"): string {
  if (!node.content) return "";
  return node.content
    .map((item, i) => {
      const prefix = style === "bullet" ? "- " : `${i + 1}. `;
      const inner = convertChildren(item).trim();
      // Skip empty list items (no content) to avoid producing "- " lines
      // that trigger an infinite loop in the markdown renderer.
      if (!inner) return null;
      const lines = inner.split("\n");
      const indented = lines
        .map((line, li) => (li === 0 ? `${prefix}${line}` : `  ${line}`))
        .join("\n");
      return indented;
    })
    .filter((s): s is string => s !== null)
    .join("\n");
}

function convertTaskList(node: AdfNode): string {
  if (!node.content) return "";
  return node.content
    .map((item) => {
      const state = (item.attrs?.state as string) || "TODO";
      // Standard GFM task syntax (`- [ ] `) so the round-trip back through
      // markdownToAdf re-detects it as a task item (BRDG-268).
      const prefix = state === "DONE" ? "- [x] " : "- [ ] ";
      const inner = convertChildren(item).trim();
      if (!inner) return null;
      return `${prefix}${inner}`;
    })
    .filter((s): s is string => s !== null)
    .join("\n");
}

function convertTable(node: AdfNode): string {
  if (!node.content) return "";

  const rows: string[][] = [];

  for (const row of node.content) {
    if (row.type !== "tableRow" || !row.content) continue;
    const cells: string[] = [];
    for (const cell of row.content) {
      cells.push(convertChildren(cell).trim().replace(/\n/g, " "));
    }
    rows.push(cells);
  }

  if (rows.length === 0) return "";

  const colCount = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((r) => {
    while (r.length < colCount) r.push("");
    return r;
  });

  // GitHub-flavored markdown tables require a header row; ADF tables without an
  // explicit tableHeader cell have no distinct header, so row 0 is promoted to
  // the header regardless (the prior header/headerless branches were identical).
  const lines: string[] = [];
  lines.push("| " + normalized[0].join(" | ") + " |");
  lines.push("| " + normalized[0].map(() => "---").join(" | ") + " |");
  for (let i = 1; i < normalized.length; i++) {
    lines.push("| " + normalized[i].join(" | ") + " |");
  }

  return lines.join("\n");
}
