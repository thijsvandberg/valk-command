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

    case "listItem":
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
      const alt = (node.attrs?.alt as string) || "attachment";
      return `![${alt}](attachment)\n\n`;
    }

    case "hardBreak":
      return "\n";

    case "mention": {
      const mentionText = (node.attrs?.text as string) || "";
      return mentionText;
    }

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

function applyMarks(text: string, marks?: AdfMark[]): string {
  if (!marks || marks.length === 0) return text;

  let result = text;
  for (const mark of marks) {
    switch (mark.type) {
      case "strong": {
        // CommonMark forbids trailing spaces inside ** delimiters
        const trail = result.match(/(\s+)$/)?.[1] ?? "";
        const inner = trail ? result.slice(0, -trail.length) : result;
        result = `**${inner}**${trail}`;
        break;
      }
      case "em": {
        const trail = result.match(/(\s+)$/)?.[1] ?? "";
        const inner = trail ? result.slice(0, -trail.length) : result;
        result = `*${inner}*${trail}`;
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
      case "underline":
        // Markdown has no underline; keep as-is
        break;
      case "subsup":
        break;
      case "textColor":
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
      const lines = inner.split("\n");
      const indented = lines
        .map((line, li) => (li === 0 ? `${prefix}${line}` : `  ${line}`))
        .join("\n");
      return indented;
    })
    .join("\n");
}

function convertTable(node: AdfNode): string {
  if (!node.content) return "";

  const rows: string[][] = [];
  let hasHeader = false;

  for (const row of node.content) {
    if (row.type !== "tableRow" || !row.content) continue;
    const cells: string[] = [];
    for (const cell of row.content) {
      if (cell.type === "tableHeader") hasHeader = true;
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

  const lines: string[] = [];
  lines.push("| " + normalized[0].join(" | ") + " |");

  if (hasHeader) {
    lines.push("| " + normalized[0].map(() => "---").join(" | ") + " |");
    for (let i = 1; i < normalized.length; i++) {
      lines.push("| " + normalized[i].join(" | ") + " |");
    }
  } else {
    lines.push("| " + normalized[0].map(() => "---").join(" | ") + " |");
    for (let i = 1; i < normalized.length; i++) {
      lines.push("| " + normalized[i].join(" | ") + " |");
    }
  }

  return lines.join("\n");
}
