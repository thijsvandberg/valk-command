import type { CalloutType } from "./callout-extension";

const CALLOUT_TYPES: CalloutType[] = ["info", "warning", "error", "note", "success"];
const CALLOUT_REGEX = /^:::(info|warning|error|note|success)\s*$/;
const EXPAND_REGEX = /^:::expand\b(.*)$/;

// Matches hex, named, rgb(), and rgba() color values
const COLOR_VALUE = "#[0-9a-fA-F]{3,8}|[a-zA-Z]+|rgb\\([^)]+\\)|rgba\\([^)]+\\)";

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
  let calloutDepth = 0;
  let insideExpand = false;
  let expandTitle = "";
  let expandContent: string[] = [];
  let expandDepth = 0;

  for (const line of lines) {
    // Expand fence
    const expandMatch = line.match(EXPAND_REGEX);
    if (expandMatch && !insideCallout && !insideExpand) {
      insideExpand = true;
      expandTitle = expandMatch[1].trim();
      expandContent = [];
      expandDepth = 0;
      continue;
    }

    if (insideExpand) {
      if (line.trim() === ":::") {
        if (expandDepth > 0) {
          // Closing a nested fence block, not the expand itself
          expandDepth--;
          expandContent.push(line);
        } else {
          const inner = expandContent.join("\n").trim();
          const innerHtml = markdownToBlockHtml(inner);
          result.push(
            `<details data-expand-title="${escapeAttr(expandTitle)}" class="expand-block"><summary>${escapeHtml(expandTitle) || "Details"}</summary><div>${innerHtml}</div></details>`
          );
          insideExpand = false;
        }
      } else {
        // Track nested ::: fence openers inside the expand content
        if (/^:::(info|warning|error|note|success|expand)\b/.test(line.trim())) {
          expandDepth++;
        }
        expandContent.push(line);
      }
      continue;
    }

    // Callout fence
    const openMatch = line.match(CALLOUT_REGEX);
    if (openMatch && !insideCallout) {
      insideCallout = true;
      calloutType = openMatch[1] as CalloutType;
      calloutContent = [];
      calloutDepth = 0;
      continue;
    }

    if (insideCallout) {
      if (line.trim() === ":::") {
        if (calloutDepth > 0) {
          calloutDepth--;
          calloutContent.push(line);
        } else {
          const inner = calloutContent.join("\n").trim();
          const innerHtml = markdownToBlockHtml(inner);
          result.push(
            `<div data-callout-type="${calloutType}" class="callout-block">${innerHtml}</div>`
          );
          insideCallout = false;
        }
      } else {
        if (/^:::(info|warning|error|note|success|expand)\b/.test(line.trim())) {
          calloutDepth++;
        }
        calloutContent.push(line);
      }
      continue;
    }

    result.push(line);
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

  // Second pass: wrap consecutive non-blank, non-block paragraph lines in <p><br> so
  // that TipTap preserves soft-enter (hardBreak) nodes when parsing as HTML.
  const htmlResult: string[] = [];
  let paraBuffer: string[] = [];

  const isBlockOrHtml = (line: string): boolean => {
    if (line.trim() === "") return true;
    if (line.startsWith("<")) return true; // callout/expand HTML blocks
    const t = line.trim();
    return (
      /^#{1,6}\s/.test(t) ||
      /^---+$/.test(t) ||
      /^```/.test(t) ||
      /^> /.test(t) || t === ">" ||
      /^[-*]\s/.test(t) ||
      /^\d+\.\s/.test(t) ||
      /^\|/.test(t)
    );
  };

  const flushPara = () => {
    if (paraBuffer.length === 0) return;
    if (paraBuffer.length === 1) {
      // A single line reaches TipTap at the top level where markdown-it parses
      // its inline marks; passing it raw is correct (converting here would double-process).
      htmlResult.push(paraBuffer[0]);
    } else {
      // A multi-line paragraph is wrapped in <p>...<br>...</p>, which TipTap parses as
      // HTML — markdown-it does NOT re-parse inline markdown inside an HTML block. Without
      // converting each line here, `**bold**` / `` `code` `` would become literal text and
      // get backslash-escaped on the next serialize. Convert per line so the marks survive.
      htmlResult.push(`<p>${paraBuffer.map(mdInlineToHtml).join("<br>")}</p>`);
    }
    paraBuffer = [];
  };

  let insideCodeFence = false;

  for (const line of result) {
    // Track code fence boundaries so content lines are never wrapped in <p> tags.
    if (line.trimStart().startsWith("```")) {
      insideCodeFence = !insideCodeFence;
      flushPara();
      htmlResult.push(line);
      continue;
    }
    if (insideCodeFence) {
      // Pass code block content through unchanged.
      flushPara();
      htmlResult.push(line);
      continue;
    }
    if (isBlockOrHtml(line)) {
      flushPara();
      htmlResult.push(line);
    } else {
      paraBuffer.push(line);
    }
  }
  flushPara();

  // Convert {color:X}text{color} syntax to HTML spans for TipTap.
  // Inner markdown is also converted to HTML so TipTap's HTML parser applies
  // both the color mark and any bold/italic marks correctly.
  return htmlResult.join("\n").replace(
    new RegExp(`\\{color:(${COLOR_VALUE})\\}(.*?)\\{color\\}`, "g"),
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

// The browser/jsdom CSSOM normalizes an inline `color: #97a0af` to `rgb(151, 160, 175)`
// when the editor sets HTML, and getHTML() reads it back normalized. Jira's `{color:#hex}`
// macro expects hex, so map 3-component rgb() back to a lowercase 6-digit hex to keep the
// macro byte-stable across the round-trip. rgba(), named colors, and existing hex are left as-is.
function normalizeColorValue(color: string): string {
  const m = color.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/);
  if (!m) return color;
  const hex = m
    .slice(1, 4)
    .map((n) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
}

export function htmlToCalloutMarkdown(html: string): string {
  // Convert color spans back to {color:} syntax, also converting inner HTML marks to markdown.
  // Normalize the color value: strip trailing semicolons/whitespace left by inline style serializers.
  let result = html.replace(
    /<span style="color:\s*([^"]+)">([\s\S]*?)<\/span>/g,
    (_, color: string, inner: string) =>
      `{color:${normalizeColorValue(color.trim().replace(/;+$/, ""))}}${inlineHtmlToMarkdown(inner)}{color}`
  );

  // Replace expand details back to :::expand fences.
  // Handles both the current structure (with <summary> + <div>) and the legacy
  // structure (no <summary>, content directly as block children).
  result = result.replace(
    /<details data-expand-title="([^"]*)"[^>]*>([\s\S]*?)<\/details>/g,
    (_match, title: string, inner: string) => {
      // Strip <summary> tag if present (it just duplicates the title)
      const withoutSummary = inner.replace(/<summary[^>]*>[\s\S]*?<\/summary>\s*/i, "");
      // Unwrap a wrapping <div> if present
      const contentMatch = withoutSummary.match(/^<div[^>]*>([\s\S]*)<\/div>$/);
      const content = contentMatch ? contentMatch[1] : withoutSummary;
      const text = htmlBlocksToMarkdown(content);
      return `:::expand ${unescapeAttr(title)}\n${text}\n:::`;
    }
  );

  // Replace callout divs back to :::type fences
  result = result.replace(
    /<div data-callout-type="(info|warning|error|note|success)"[^>]*>([\s\S]*?)<\/div>/g,
    (_match, type: string, content: string) => {
      const text = htmlBlocksToMarkdown(content);
      return `:::${type}\n${text}\n:::`;
    }
  );

  return result;
}

export function isCalloutType(value: string): value is CalloutType {
  return CALLOUT_TYPES.includes(value as CalloutType);
}

// Converts inline HTML marks back to markdown syntax.
function inlineHtmlToMarkdown(html: string): string {
  return html
    .replace(/<strong><em>(.*?)<\/em><\/strong>/g, "***$1***")
    .replace(/<em><strong>(.*?)<\/strong><\/em>/g, "***$1***")
    .replace(/<strong>(.*?)<\/strong>/g, "**$1**")
    .replace(/<em>(.*?)<\/em>/g, "*$1*")
    .replace(/<del>(.*?)<\/del>/g, "~~$1~~")
    .replace(/<s>(.*?)<\/s>/g, "~~$1~~")
    .replace(/<code>(.*?)<\/code>/g, "`$1`")
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, "[$2]($1)")
    .replace(/<br\s*\/?>/g, "\n")
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

function htmlEntityDecode(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

// ---- Block HTML → Markdown ----

/**
 * Extracts a balanced HTML element (with nested tags of the same name) starting at `pos`.
 * Returns null if no valid opening tag is found at `pos`.
 */
function extractBalancedTag(
  html: string,
  pos: number,
  expectedTag?: string,
): { tag: string; attrs: string; content: string; end: number } | null {
  const openRe = /^<([a-zA-Z][a-zA-Z0-9]*)((?:\s[^>]*)?)>/;
  const m = openRe.exec(html.slice(pos));
  if (!m) return null;

  const tag = m[1].toLowerCase();
  if (expectedTag && tag !== expectedTag.toLowerCase()) return null;

  const attrs = m[2] || "";
  const contentStart = pos + m[0].length;

  const VOID_TAGS = new Set(["br", "hr", "img", "input", "meta", "link"]);
  if (VOID_TAGS.has(tag) || m[0].endsWith("/>")) {
    return { tag, attrs, content: "", end: contentStart };
  }

  let depth = 1;
  let i = contentStart;
  const closeRe = new RegExp(`^</(${tag})>`, "i");
  const openSameRe = new RegExp(`^<(${tag})(\\s[^>]*)?>`, "i");

  while (i < html.length && depth > 0) {
    if (html[i] !== "<") { i++; continue; }
    const slice = html.slice(i);
    const close = closeRe.exec(slice);
    if (close) {
      depth--;
      if (depth === 0) {
        return {
          tag,
          attrs,
          content: html.slice(contentStart, i),
          end: i + close[0].length,
        };
      }
      i += close[0].length;
      continue;
    }
    const openSame = openSameRe.exec(slice);
    if (openSame && !openSame[0].endsWith("/>") && !VOID_TAGS.has(tag)) {
      depth++;
      i += openSame[0].length;
      continue;
    }
    i++;
  }
  return null;
}

/**
 * Converts the rich HTML inside an expand or callout block back to markdown.
 * Handles TipTap's HTML output: p, h1-h6, ul, ol, pre, blockquote,
 * hr, callout/expand divs, and inline marks.
 */
function htmlBlocksToMarkdown(html: string): string {
  const blocks: string[] = [];
  let pos = 0;

  while (pos < html.length) {
    if (/\s/.test(html[pos])) { pos++; continue; }

    const hrM = /^<hr\s*\/?>/.exec(html.slice(pos));
    if (hrM) { blocks.push("---"); pos += hrM[0].length; continue; }

    const brM = /^<br\s*\/?>/.exec(html.slice(pos));
    if (brM) { pos += brM[0].length; continue; }

    const el = extractBalancedTag(html, pos);
    if (!el) { pos++; continue; }

    const { tag, attrs, content } = el;
    pos = el.end;

    if (tag === "p") {
      const text = inlineHtmlToMarkdown(content);
      if (text.trim()) blocks.push(text);
      continue;
    }

    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1], 10);
      blocks.push(`${"#".repeat(level)} ${inlineHtmlToMarkdown(content)}`);
      continue;
    }

    if (tag === "pre") {
      const codeEl = extractBalancedTag(content, 0, "code");
      if (codeEl) {
        const langM = codeEl.attrs.match(/class="[^"]*language-(\w+)/);
        const lang = langM ? langM[1] : "";
        const code = htmlEntityDecode(codeEl.content);
        blocks.push(`\`\`\`${lang}\n${code}\n\`\`\``);
      }
      continue;
    }

    if (tag === "ul") {
      blocks.push(listHtmlToMarkdown(content, "bullet", 0));
      continue;
    }

    if (tag === "ol") {
      blocks.push(listHtmlToMarkdown(content, "ordered", 0));
      continue;
    }

    if (tag === "blockquote") {
      const innerMd = htmlBlocksToMarkdown(content);
      blocks.push(innerMd.split("\n").map((l) => `> ${l}`).join("\n"));
      continue;
    }

    if (tag === "div") {
      const calloutM = attrs.match(/data-callout-type="(info|warning|error|note|success)"/);
      if (calloutM) {
        const innerMd = htmlBlocksToMarkdown(content);
        blocks.push(`:::${calloutM[1]}\n${innerMd}\n:::`);
        continue;
      }
    }

    // Fallback: recurse into unknown element's content
    const innerMd = htmlBlocksToMarkdown(content);
    if (innerMd.trim()) blocks.push(innerMd);
  }

  return blocks.filter(Boolean).join("\n\n");
}

function listHtmlToMarkdown(html: string, type: "bullet" | "ordered", depth: number): string {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);
  let pos = 0;
  let counter = 1;

  while (pos < html.length) {
    if (/\s/.test(html[pos])) { pos++; continue; }

    const li = extractBalancedTag(html, pos, "li");
    if (!li) { pos++; continue; }
    pos = li.end;

    const prefix = type === "bullet" ? "- " : `${counter}. `;
    counter++;

    // Parse li content: <p> for text, <ul>/<ol> for nested lists
    let firstPara = "";
    const extra: string[] = [];
    let lPos = 0;
    const liContent = li.content;

    while (lPos < liContent.length) {
      if (/\s/.test(liContent[lPos])) { lPos++; continue; }

      const pEl = extractBalancedTag(liContent, lPos, "p");
      if (pEl) {
        const text = inlineHtmlToMarkdown(pEl.content);
        if (!firstPara) {
          firstPara = text;
        } else if (text.trim()) {
          extra.push(`${indent}  ${text}`);
        }
        lPos = pEl.end;
        continue;
      }

      const ulEl = extractBalancedTag(liContent, lPos, "ul");
      if (ulEl) {
        extra.push(listHtmlToMarkdown(ulEl.content, "bullet", depth + 1));
        lPos = ulEl.end;
        continue;
      }

      const olEl = extractBalancedTag(liContent, lPos, "ol");
      if (olEl) {
        extra.push(listHtmlToMarkdown(olEl.content, "ordered", depth + 1));
        lPos = olEl.end;
        continue;
      }

      // Plain text not wrapped in <p> (rare but possible)
      const nextTag = liContent.indexOf("<", lPos);
      if (nextTag === -1 || nextTag > lPos) {
        const text = liContent.slice(lPos, nextTag === -1 ? liContent.length : nextTag).trim();
        if (text && !firstPara) firstPara = text;
        lPos = nextTag === -1 ? liContent.length : nextTag;
      } else {
        lPos++;
      }
    }

    lines.push(`${indent}${prefix}${firstPara}`);
    lines.push(...extra.filter(Boolean));
  }

  return lines.join("\n");
}

// ---- Markdown → Block HTML ----

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

/**
 * Converts markdown block content to HTML for embedding inside TipTap's
 * HTML parser. Used when loading expand/callout inner content into the editor.
 */
function markdownToBlockHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fence blocks (callout / expand)
    const fenceM = line.match(/^:::(info|warning|error|note|success|expand)\b(.*)$/);
    if (fenceM) {
      const type = fenceM[1];
      const arg = fenceM[2].trim();
      const inner: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ":::") {
        inner.push(lines[i]);
        i++;
      }
      i++; // skip closing :::
      const innerHtml = markdownToBlockHtml(inner.join("\n"));
      if (type === "expand") {
        parts.push(
          `<details data-expand-title="${escapeAttr(arg)}" class="expand-block"><summary>${escapeHtml(arg) || "Details"}</summary><div>${innerHtml}</div></details>`
        );
      } else {
        parts.push(`<div data-callout-type="${type}" class="callout-block">${innerHtml}</div>`);
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
      const langClass = lang ? ` class="language-${lang}"` : "";
      parts.push(
        `<pre class="editor-code-block"><code${langClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`
      );
      continue;
    }

    // Heading
    const hM = line.match(/^(#{1,6})\s+(.+)$/);
    if (hM) {
      const level = hM[1].length;
      parts.push(`<h${level}>${mdInlineToHtml(hM[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      parts.push("<hr>");
      i++;
      continue;
    }

    // Unordered list
    if (/^[-*]\s/.test(line)) {
      const r = markdownListToHtml(lines, i, 0, "bullet");
      parts.push(r.html);
      i = r.nextIdx;
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const r = markdownListToHtml(lines, i, 0, "ordered");
      parts.push(r.html);
      i = r.nextIdx;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ") || line === ">") {
      const qLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith("> ") || lines[i] === ">")) {
        qLines.push(lines[i] === ">" ? "" : lines[i].slice(2));
        i++;
      }
      parts.push(`<blockquote>${markdownToBlockHtml(qLines.join("\n"))}</blockquote>`);
      continue;
    }

    // Empty line
    if (line.trim() === "") { i++; continue; }

    // Paragraph: collect consecutive non-block, non-blank lines
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !isBlockLine(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    const pContent = paraLines
      .map((l, li) => (li > 0 ? `<br>${mdInlineToHtml(l)}` : mdInlineToHtml(l)))
      .join("");
    parts.push(`<p>${pContent}</p>`);
  }

  return parts.join("");
}

function markdownListToHtml(
  lines: string[],
  startIdx: number,
  baseIndent: number,
  type: "bullet" | "ordered",
): { html: string; nextIdx: number } {
  const items: string[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "") { i++; continue; }

    const lineIndent = line.length - line.trimStart().length;
    const isBullet = type === "bullet" && lineIndent === baseIndent && /^[-*]\s/.test(trimmed);
    const isOrdered = type === "ordered" && lineIndent === baseIndent && /^\d+\.\s/.test(trimmed);
    if (!isBullet && !isOrdered) break;

    const text = type === "bullet"
      ? trimmed.replace(/^[-*]\s/, "")
      : trimmed.replace(/^\d+\.\s/, "");

    i++;
    const itemParts: string[] = [`<p>${mdInlineToHtml(text)}</p>`];

    while (i < lines.length) {
      const next = lines[i];
      const nextTrimmed = next.trim();
      if (nextTrimmed === "") { i++; continue; }
      const nextIndent = next.length - next.trimStart().length;
      if (nextIndent < baseIndent + 2) break;
      if (
        nextIndent === baseIndent + 2 &&
        (/^[-*]\s/.test(nextTrimmed) || /^\d+\.\s/.test(nextTrimmed))
      ) {
        const nestedType = /^[-*]\s/.test(nextTrimmed) ? "bullet" : "ordered";
        const nested = markdownListToHtml(lines, i, baseIndent + 2, nestedType);
        itemParts.push(nested.html);
        i = nested.nextIdx;
      } else {
        itemParts.push(`<p>${mdInlineToHtml(nextTrimmed)}</p>`);
        i++;
      }
    }

    items.push(`<li>${itemParts.join("")}</li>`);
  }

  const tag = type === "bullet" ? "ul" : "ol";
  return { html: `<${tag}>${items.join("")}</${tag}>`, nextIdx: i };
}

// Converts inline markdown to HTML for use inside block HTML elements.
// Color syntax is left as-is since calloutMarkdownToHtml's second pass handles it.
function mdInlineToHtml(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
}
