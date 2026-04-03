import type { CalloutType } from "./callout-extension";

const CALLOUT_TYPES: CalloutType[] = ["info", "warning", "error", "note", "success"];
const CALLOUT_REGEX = /^:::(info|warning|error|note|success)\s*$/;
const EXPAND_REGEX = /^:::expand\b(.*)$/;

/**
 * Parses markdown with :::type callout fences and :::expand fences into HTML
 * that TipTap can consume, and serializes TipTap nodes back to fence markdown.
 */

export function calloutMarkdownToHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const result: string[] = [];
  let insideCallout = false;
  let calloutType: CalloutType = "info";
  let calloutContent: string[] = [];
  let insideExpand = false;
  let expandTitle = "";
  let expandContent: string[] = [];

  for (const line of lines) {
    // Expand fence
    const expandMatch = line.match(EXPAND_REGEX);
    if (expandMatch && !insideCallout && !insideExpand) {
      insideExpand = true;
      expandTitle = expandMatch[1].trim();
      expandContent = [];
      continue;
    }

    if (insideExpand && line.trim() === ":::") {
      const inner = expandContent.join("\n").trim();
      const paragraphs = inner
        .split(/\n\n+/)
        .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("");
      result.push(
        `<details data-expand-title="${escapeAttr(expandTitle)}"><summary>${escapeHtml(expandTitle) || "Details"}</summary><div>${paragraphs}</div></details>`
      );
      insideExpand = false;
      continue;
    }

    if (insideExpand) {
      expandContent.push(line);
      continue;
    }

    // Callout fence
    const openMatch = line.match(CALLOUT_REGEX);
    if (openMatch && !insideCallout) {
      insideCallout = true;
      calloutType = openMatch[1] as CalloutType;
      calloutContent = [];
      continue;
    }

    if (insideCallout && line.trim() === ":::") {
      const inner = calloutContent.join("\n").trim();
      const paragraphs = inner
        .split(/\n\n+/)
        .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("");
      result.push(
        `<div data-callout-type="${calloutType}" class="callout-block">${paragraphs}</div>`
      );
      insideCallout = false;
      continue;
    }

    if (insideCallout) {
      calloutContent.push(line);
    } else {
      result.push(line);
    }
  }

  // Unclosed callout: flush remaining content as regular lines
  if (insideCallout) {
    result.push(`:::${calloutType}`);
    result.push(...calloutContent);
  }

  // Unclosed expand: flush remaining content as regular lines
  if (insideExpand) {
    result.push(`:::expand ${expandTitle}`);
    result.push(...expandContent);
  }

  // Convert {color:X}text{color} syntax to HTML spans for TipTap.
  // Inner markdown is also converted to HTML so TipTap's HTML parser applies
  // both the color mark and any bold/italic marks correctly.
  return result.join("\n").replace(
    /\{color:(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\}(.*?)\{color\}/g,
    (_, color: string, inner: string) =>
      `<span style="color: ${color}">${inlineMarkdownToHtml(inner)}</span>`
  );
}

// Converts inline markdown syntax to HTML so it can be combined with HTML span tags.
function inlineMarkdownToHtml(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

export function htmlToCalloutMarkdown(html: string): string {
  // Convert color spans back to {color:} syntax, also converting inner HTML marks to markdown.
  let result = html.replace(
    /<span style="color:\s*([^"]+)">([\s\S]*?)<\/span>/g,
    (_, color: string, inner: string) =>
      `{color:${color}}${inlineHtmlToMarkdown(inner)}{color}`
  );

  // Replace expand details back to :::expand fences
  result = result.replace(
    /<details data-expand-title="([^"]*)"[^>]*>[\s\S]*?<summary>[^<]*<\/summary>\s*<div>([\s\S]*?)<\/div>\s*<\/details>/g,
    (_match, title: string, content: string) => {
      const text = content
        .replace(/<p>/g, "")
        .replace(/<\/p>/g, "\n\n")
        .replace(/<br\s*\/?>/g, "\n")
        .trim();
      return `:::expand ${unescapeAttr(title)}\n${text}\n:::`;
    }
  );

  // Replace callout divs back to :::type fences
  result = result.replace(
    /<div data-callout-type="(info|warning|error|note|success)"[^>]*>([\s\S]*?)<\/div>/g,
    (_match, type: string, content: string) => {
      const text = content
        .replace(/<p>/g, "")
        .replace(/<\/p>/g, "\n\n")
        .replace(/<br\s*\/?>/g, "\n")
        .trim();
      return `:::${type}\n${text}\n:::`;
    }
  );

  return result;
}

export function isCalloutType(value: string): value is CalloutType {
  return CALLOUT_TYPES.includes(value as CalloutType);
}

// Converts inline HTML marks back to markdown syntax when extracting from color spans.
function inlineHtmlToMarkdown(html: string): string {
  return html
    .replace(/<strong><em>(.*?)<\/em><\/strong>/g, "***$1***")
    .replace(/<em><strong>(.*?)<\/strong><\/em>/g, "***$1***")
    .replace(/<strong>(.*?)<\/strong>/g, "**$1**")
    .replace(/<em>(.*?)<\/em>/g, "*$1*")
    .replace(/<del>(.*?)<\/del>/g, "~~$1~~")
    .replace(/<code>(.*?)<\/code>/g, "`$1`")
    .replace(/<[^>]+>/g, ""); // strip any remaining tags
}

function escapeAttr(str: string): string {
  return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function unescapeAttr(str: string): string {
  return str.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
