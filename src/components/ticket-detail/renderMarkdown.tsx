import type { ReactNode } from "react";
import { Check } from "lucide-react";

const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|ogg)$/i;
function isVideoAttachment(altOrSrc: string): boolean {
  return VIDEO_EXTENSIONS.test(altOrSrc);
}
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-php";
import "prismjs/components/prism-python";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-css";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-json";
import "prismjs/components/prism-java";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-scss";

import { resolveEmoji } from "@/lib/emoji-shortcodes";

// Maps common fence language identifiers to Prism grammar keys
const PRISM_LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  html: "markup",
  xml: "markup",
  cs: "csharp",
  yml: "yaml",
};

function safeEscapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Returns Prism-highlighted HTML for a single line, or escaped plain text as fallback.
function highlightCodeLine(code: string, lang: string): string {
  if (!lang || !code) return safeEscapeHtml(code);
  const prismLang = PRISM_LANG_ALIASES[lang.toLowerCase()] ?? lang.toLowerCase();
  const grammar = Prism.languages[prismLang];
  if (!grammar) return safeEscapeHtml(code);
  try {
    return Prism.highlight(code, grammar, prismLang);
  } catch {
    return safeEscapeHtml(code);
  }
}


function inlineFormat(text: string): ReactNode {
  const parts: ReactNode[] = [];
  // Match: colored text, images, links, strikethrough, bold+italic, bold, italic, inline code, emoji shortnames
  // Group index map:
  //  1,2   = {color:X}text{color}
  //  3,4   = image ![alt](src)
  //  5,6   = link [text](url)
  //  7     = strikethrough ~~text~~
  //  8,9   = bold+italic ***text***
  //  10,11 = bold **text**
  //  12,13 = italic *text*
  //  14,15 = inline code `text`
  //  16    = emoji :name:
  const regex =
    /\{color:(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|[a-zA-Z]+)\}(.*?)\{color\}|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|~~(.+?)~~|(\*\*\*(.+?)\*\*\*)|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|:([a-zA-Z0-9_+\-]+):/g;
  let lastIndex = 0;
  let match;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      // Colored text: {color:#hex}text{color}
      parts.push(
        <span key={i++} style={{ color: match[1] }}>
          {inlineFormat(match[2])}
        </span>
      );
    } else if (match[4] !== undefined) {
      // Image: ![alt](src)
      const src = match[4];
      const alt = match[3];
      if (src.startsWith("/api/attachments/")) {
        if (isVideoAttachment(alt)) {
          parts.push(
            <video
              key={i++}
              src={src}
              controls
              className="my-1 max-w-full rounded-lg border border-border-default"
              style={{ maxHeight: "480px" }}
            />,
          );
        } else {
          parts.push(
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i++}
              src={src}
              alt={alt}
              className="my-1 max-w-full rounded-lg border border-border-default"
              style={{ maxHeight: "480px", objectFit: "contain" }}
            />,
          );
        }
      } else {
        // Non-resolvable attachment (e.g. Jira media storage ID)
        parts.push(
          <span key={i++} className="my-1 inline-flex items-center gap-1 rounded bg-overlay-default px-2 py-0.5 text-[0.8em] text-text-tertiary">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 opacity-50">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
            </svg>
            {alt && alt !== "attachment" ? alt : "attachment"}
          </span>
        );
      }
    } else if (match[6] !== undefined) {
      // Link: [text](url)
      parts.push(
        <a
          key={i++}
          href={match[6]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--color-brand-400)] underline decoration-[var(--color-brand-400)]/30 underline-offset-2 hover:decoration-[var(--color-brand-400)]/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          style={{ transition: "text-decoration-color 0.15s ease" }}
        >
          {match[5]}
        </a>
      );
    } else if (match[7] !== undefined) {
      // Strikethrough: ~~text~~
      parts.push(<s key={i++}>{inlineFormat(match[7])}</s>);
    } else if (match[9] !== undefined) {
      // Bold + italic: ***text***
      parts.push(<strong key={i++}><em>{inlineFormat(match[9])}</em></strong>);
    } else if (match[11] !== undefined) {
      // Bold: **text**
      parts.push(<strong key={i++}>{inlineFormat(match[11])}</strong>);
    } else if (match[13] !== undefined) {
      // Italic: *text*
      parts.push(<em key={i++}>{inlineFormat(match[13])}</em>);
    } else if (match[15] !== undefined) {
      // Inline code
      parts.push(<code key={i++}>{match[15]}</code>);
    } else if (match[16] !== undefined) {
      // Emoji shortname :name:
      parts.push(<span key={i++}>{resolveEmoji(match[16])}</span>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length === 1 ? parts[0] : parts;
}

interface ListNode {
  content: ReactNode;
  children: ListNode[];
  ordered: boolean;
}

function renderListTree(nodes: ListNode[], keyPrefix: string, isRoot = true): ReactNode {
  if (nodes.length === 0) return null;
  const isOrdered = nodes[0].ordered;
  const Tag = isOrdered ? "ol" : "ul";
  const listClass = isOrdered
    ? `${isRoot ? "ml-5" : "ml-4 mt-0.5"} list-decimal space-y-0.5`
    : `${isRoot ? "ml-5" : "ml-4 mt-0.5"} list-disc space-y-0.5`;

  return (
    <Tag key={keyPrefix} className={listClass}>
      {nodes.map((node, idx) => (
        <li key={`${keyPrefix}-${idx}`}>
          {node.content}
          {node.children.length > 0 && renderListTree(node.children, `${keyPrefix}-${idx}-sub`, false)}
        </li>
      ))}
    </Tag>
  );
}

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

const CALLOUT_STYLES: Record<string, { border: string; bg: string; dot: string; label: string }> = {
  info:    { border: "border-blue-500/40",   bg: "bg-blue-500/[0.07]",    dot: "bg-blue-400",    label: "Info" },
  warning: { border: "border-amber-500/40",  bg: "bg-amber-500/[0.07]",   dot: "bg-amber-400",   label: "Warning" },
  error:   { border: "border-red-500/40",    bg: "bg-red-500/[0.07]",     dot: "bg-red-400",     label: "Error" },
  note:    { border: "border-purple-500/40", bg: "bg-purple-500/[0.07]",  dot: "bg-purple-400",  label: "Note" },
  success: { border: "border-green-500/40",  bg: "bg-green-500/[0.07]",   dot: "bg-green-400",   label: "Success" },
};

// Renders a table from markdown pipe rows
function renderTable(tableLines: string[], key: string): ReactNode {
  const parseRow = (line: string): string[] =>
    line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

  if (tableLines.length < 2) return null;

  const headers = parseRow(tableLines[0]);
  // tableLines[1] is the separator row (--- | --- | ---)
  const dataRows = tableLines.slice(2).map(parseRow);

  return (
    <div key={key} className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((h, hi) => (
              <th
                key={hi}
                className="border border-border-strong bg-overlay-subtle px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-text-secondary"
              >
                {inlineFormat(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, ri) => (
            <tr key={ri} className="border-b border-border-default transition-colors hover:bg-overlay-subtle">
              {row.map((cell, ci) => (
                <td key={ci} className="border border-border-default px-3 py-2 text-text-secondary">
                  {inlineFormat(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Renders a code block with optional language label and line numbers
function renderCodeBlock(lines: string[], lang: string, key: string): ReactNode {
  return (
    <div key={key} className="my-3 overflow-hidden rounded-xl" style={{ background: "rgba(0,0,0,0.28)", border: "1px solid var(--color-overlay-default)" }}>
      {/* Header bar */}
      <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: "var(--color-overlay-default)", background: "var(--color-overlay-subtle)" }}>
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-overlay-strong)" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-overlay-strong)" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-overlay-strong)" }} />
        </div>
        {lang && (
          <span className="ml-1 font-mono text-caption font-medium uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>{lang}</span>
        )}
      </div>
      {/* Code table */}
      <div className="overflow-x-auto py-2">
        <table className="border-collapse" style={{ tableLayout: "fixed", width: "100%" }}>
          <colgroup>
            {/* Fixed width for up to 3-digit line numbers */}
            <col style={{ width: "3rem" }} />
            <col />
          </colgroup>
          <tbody>
            {lines.map((codeLine, li) => (
              <tr key={li} className="group">
                <td
                  className="select-none border-r py-0 pr-3 pl-0 text-right font-mono text-label leading-[1.6rem]"
                  style={{ color: "var(--color-text-muted)", borderColor: "var(--color-overlay-default)", whiteSpace: "nowrap" }}
                >
                  {li + 1}
                </td>
                <td
                  className="rm-code-content py-0 pl-4 pr-6 font-mono text-[0.8125rem] leading-[1.6rem]"
                  style={{ color: "var(--color-text-secondary)", whiteSpace: "pre" }}
                  dangerouslySetInnerHTML={{ __html: highlightCodeLine(codeLine, lang) || "\u00a0" }}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function renderMarkdown(text: string): ReactNode[] {
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let codeBlockLines: string[] | null = null;
  let codeBlockLang = "";
  let calloutType: string | null = null;
  let calloutLines: string[] | null = null;
  let expandTitle: string | null = null;
  let expandLines: string[] | null = null;
  let expandDepth = 0;
  let calloutDepth = 0;
  let idx = 0;

  function parseListBlock(startIdx: number): { nodes: ListNode[]; nextIdx: number } {
    const nodes: ListNode[] = [];
    const baseIndent = getIndentLevel(lines[startIdx]);
    let i = startIdx;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip blank lines within a list (peek ahead to see if list continues)
      if (trimmed === "") {
        let next = i + 1;
        while (next < lines.length && lines[next].trim() === "") next++;
        if (next < lines.length) {
          const nextTrimmed = lines[next].trim();
          const nextIsList = (/^- /.test(nextTrimmed) && !/^- \[\][ ]/.test(nextTrimmed) && !/^- \[[ x]\] /.test(nextTrimmed)) || /^\d+\.\s/.test(nextTrimmed);
          if (nextIsList) {
            i = next;
            continue;
          }
        }
        break;
      }

      const indent = getIndentLevel(line);
      const isUnordered = /^- /.test(trimmed) && !/^- \[\][ ]/.test(trimmed) && !/^- \[[ x]\] /.test(trimmed);
      const isOrdered = /^\d+\.\s/.test(trimmed);

      if (!isUnordered && !isOrdered) break;

      if (indent < baseIndent) break;

      if (indent > baseIndent) {
        if (nodes.length > 0) {
          const { nodes: childNodes, nextIdx } = parseListBlock(i);
          nodes[nodes.length - 1].children.push(...childNodes);
          i = nextIdx;
          continue;
        }
      }

      if (indent === baseIndent) {
        const content = isOrdered
          ? trimmed.replace(/^\d+\.\s*/, "")
          : trimmed.slice(2);
        nodes.push({ content: inlineFormat(content), children: [], ordered: isOrdered });
      }

      i++;
    }

    // Safety guard: always advance at least one line to prevent the caller
    // from looping forever if this block matched nothing.
    if (i === startIdx) i++;
    return { nodes, nextIdx: i };
  }

  while (idx < lines.length) {
    const line = lines[idx];

    // Expand blocks: :::expand Title ... :::
    const expandOpen = line.match(/^:::expand\s*(.*)$/);
    if (expandOpen && expandTitle === null && calloutType === null) {
      expandTitle = expandOpen[1].trim();
      expandLines = [];
      expandDepth = 0;
      idx++;
      continue;
    }
    if (expandTitle !== null) {
      if (line.trim() === ":::") {
        if (expandDepth > 0) {
          // Closing a nested fence inside the expand, not the expand itself
          expandDepth--;
          expandLines!.push(line);
        } else {
          const inner = renderMarkdown((expandLines ?? []).join("\n"));
          const title = expandTitle;
          elements.push(
            <details
              key={`expand-${elements.length}`}
              className="expand-block my-2 overflow-hidden rounded-lg border border-border-strong bg-overlay-subtle"
            >
              <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-list-item hover:text-text-primary">
                <span className="flex items-center gap-2">
                  <svg
                    className="expand-arrow h-3.5 w-3.5 shrink-0 text-text-tertiary"
                    style={{ transition: "transform 0.15s ease" }}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  {title || "Details"}
                </span>
              </summary>
              <div className="border-t border-border-default px-4 py-3">{inner}</div>
            </details>
          );
          expandTitle = null;
          expandLines = null;
        }
      } else {
        // Track nested ::: fence openers inside the expand
        if (/^:::(info|warning|error|note|success|expand)\b/.test(line.trim())) {
          expandDepth++;
        }
        expandLines!.push(line);
      }
      idx++;
      continue;
    }

    // Callout blocks: :::type ... :::
    const calloutOpen = line.match(/^:::(info|warning|error|note|success)\s*$/);
    if (calloutOpen && calloutType === null) {
      calloutType = calloutOpen[1];
      calloutLines = [];
      calloutDepth = 0;
      idx++;
      continue;
    }
    if (calloutType !== null) {
      if (line.trim() === ":::") {
        if (calloutDepth > 0) {
          calloutDepth--;
          calloutLines!.push(line);
        } else {
          const style = CALLOUT_STYLES[calloutType] ?? CALLOUT_STYLES.info;
          const inner = renderMarkdown((calloutLines ?? []).join("\n"));
          elements.push(
            <div
              key={`callout-${elements.length}`}
              className={`my-2 rounded-lg border-l-2 px-4 py-2.5 ${style.border} ${style.bg}`}
            >
              <div className="mb-1 flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                <span className="text-label font-semibold uppercase tracking-wider text-text-tertiary">{style.label}</span>
              </div>
              <div>{inner}</div>
            </div>
          );
          calloutType = null;
          calloutLines = null;
        }
      } else {
        if (/^:::(info|warning|error|note|success|expand)\b/.test(line.trim())) {
          calloutDepth++;
        }
        calloutLines!.push(line);
      }
      idx++;
      continue;
    }

    // Code blocks
    if (line.startsWith("```")) {
      if (codeBlockLines !== null) {
        elements.push(renderCodeBlock(codeBlockLines, codeBlockLang, `code-${elements.length}`));
        codeBlockLines = null;
        codeBlockLang = "";
      } else {
        codeBlockLines = [];
        codeBlockLang = line.slice(3).trim();
      }
      idx++;
      continue;
    }

    if (codeBlockLines !== null) {
      codeBlockLines.push(line);
      idx++;
      continue;
    }

    // Legacy: raw <details data-expand-title="..."> HTML stored before round-trip was fixed.
    // Collect lines until closing </details> and render as an expand block.
    if (line.trim().startsWith("<details") && line.includes("data-expand-title")) {
      const htmlLines: string[] = [line];
      if (!line.includes("</details>")) {
        idx++;
        while (idx < lines.length) {
          htmlLines.push(lines[idx]);
          if (lines[idx].includes("</details>")) {
            idx++;
            break;
          }
          idx++;
        }
      } else {
        idx++;
      }
      const raw = htmlLines.join("\n");
      const titleMatch = raw.match(/data-expand-title="([^"]*)"/);
      const title = titleMatch ? titleMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'") : "Details";
      // Strip outer tags and inner summary/div wrappers to get plain text content
      const stripped = raw
        .replace(/<details[^>]*>/i, "")
        .replace(/<\/details>/i, "")
        .replace(/<summary[^>]*>[\s\S]*?<\/summary>/i, "")
        .replace(/<\/?div[^>]*>/gi, "")
        .replace(/<p>/gi, "")
        .replace(/<\/p>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .trim();
      const inner = renderMarkdown(stripped);
      elements.push(
        <details
          key={`expand-${elements.length}`}
          className="expand-block my-2 overflow-hidden rounded-lg border border-border-strong bg-overlay-subtle"
        >
          <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-list-item hover:text-text-primary">
            <span className="flex items-center gap-2">
              <svg
                className="expand-arrow h-3.5 w-3.5 shrink-0 text-text-tertiary"
                style={{ transition: "transform 0.15s ease" }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
              {title || "Details"}
            </span>
          </summary>
          <div className="border-t border-border-default px-4 py-3">{inner}</div>
        </details>
      );
      continue;
    }

    // Horizontal rule
    if (line.trim() === "---") {
      elements.push(<hr key={`hr-${idx}`} />);
      idx++;
      continue;
    }

    // Headings (check longer prefixes first)
    if (line.startsWith("#### ")) {
      elements.push(<h4 key={`h4-${idx}`}>{inlineFormat(line.slice(5))}</h4>);
      idx++;
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(<h3 key={`h3-${idx}`}>{inlineFormat(line.slice(4))}</h3>);
      idx++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<h2 key={`h2-${idx}`}>{inlineFormat(line.slice(3))}</h2>);
      idx++;
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(<h1 key={`h1-${idx}`}>{inlineFormat(line.slice(2))}</h1>);
      idx++;
      continue;
    }

    // Task lists — support both "- [] " (Jira format) and "- [ ] " (standard markdown)
    if (line.trimStart().startsWith("- [] ") || line.trimStart().startsWith("- [ ] ")) {
      const trimStart = line.trimStart();
      const content = trimStart.startsWith("- [] ") ? trimStart.slice(5) : trimStart.slice(6);
      elements.push(
        <div key={`cb-${idx}`} className="my-1 flex items-start gap-2">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border-strong bg-overlay-subtle" />
          <span>{inlineFormat(content)}</span>
        </div>
      );
      idx++;
      continue;
    }
    if (line.trimStart().startsWith("- [x] ")) {
      const content = line.trimStart().slice(6);
      elements.push(
        <div key={`cb-${idx}`} className="my-1 flex items-start gap-2">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]">
            <Check size={10} strokeWidth={1.5} />
          </span>
          <span className="line-through opacity-60">{inlineFormat(content)}</span>
        </div>
      );
      idx++;
      continue;
    }

    // Unordered / ordered lists (with nesting)
    // Use line.trim() (not trimStart) to match what parseListBlock uses internally,
    // preventing a nextIdx === idx infinite loop on lines like "- " (empty list item from ADF).
    const trimmed = line.trim();
    const isListStart = (/^- /.test(trimmed) && !/^- \[\][ ]/.test(trimmed) && !/^- \[[ x]\] /.test(trimmed)) || /^\d+\.\s/.test(trimmed);
    if (isListStart) {
      const { nodes, nextIdx } = parseListBlock(idx);
      if (nodes.length > 0) {
        elements.push(
          <div key={`list-${idx}`} className="my-1">
            {renderListTree(nodes, `lt-${idx}`)}
          </div>
        );
      }
      idx = nextIdx;
      continue;
    }

    // Blockquote: collect consecutive > lines
    if (line.startsWith("> ") || line === ">") {
      const quoteLines: string[] = [];
      while (idx < lines.length && (lines[idx].startsWith("> ") || lines[idx] === ">")) {
        quoteLines.push(lines[idx] === ">" ? "" : lines[idx].slice(2));
        idx++;
      }
      // Group by blank lines into paragraphs
      const paragraphs = quoteLines.join("\n").split(/\n\n+/).filter((p) => p.trim() !== "");
      elements.push(
        <blockquote
          key={`bq-${elements.length}`}
        >
          {paragraphs.map((para, pi) => {
            const paraLines = para.split("\n");
            return (
              <p key={pi}>
                {paraLines.map((l, li) => (
                  <span key={li}>
                    {li > 0 && <br />}
                    {inlineFormat(l)}
                  </span>
                ))}
              </p>
            );
          })}
        </blockquote>
      );
      continue;
    }

    // Table: collect consecutive | lines
    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (idx < lines.length && lines[idx].trim().startsWith("|")) {
        tableLines.push(lines[idx]);
        idx++;
      }
      const tableNode = renderTable(tableLines, `table-${elements.length}`);
      if (tableNode) elements.push(tableNode);
      continue;
    }

    // Standalone image line: render as block figure
    const standaloneImg = line.trim().match(/^!\[([^\]]*)\]\((\/api\/attachments\/[^)]+)\)$/);
    if (standaloneImg) {
      const mediaAlt = standaloneImg[1];
      const mediaSrc = standaloneImg[2];
      elements.push(
        <figure key={`img-${idx}`} className="my-4">
          {isVideoAttachment(mediaAlt) ? (
            <video
              src={mediaSrc}
              controls
              className="max-w-full rounded-lg border border-border-default"
              style={{ maxHeight: "600px" }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaSrc}
              alt={mediaAlt}
              className="max-w-full rounded-lg border border-border-default"
              style={{ maxHeight: "600px", objectFit: "contain" }}
            />
          )}
          {mediaAlt && (
            <figcaption className="mt-1.5 text-label text-text-muted">{mediaAlt}</figcaption>
          )}
        </figure>,
      );
      idx++;
      continue;
    }

    // Empty lines are structural separators from the ADF->markdown conversion.
    // Block elements (headings, paragraphs) already have CSS margins, so we skip
    // empty lines rather than adding spacer divs that would cause double-spacing.
    if (line.trim() === "") {
      idx++;
      continue;
    }

    // Paragraph: collect consecutive non-block lines as a single paragraph with <br> for soft enters.
    // This matches ADF's hardBreak behavior (single newlines within a paragraph).
    const paraLines: string[] = [line];
    idx++;
    while (
      idx < lines.length &&
      lines[idx].trim() !== "" &&
      !lines[idx].startsWith("> ") &&
      lines[idx] !== ">" &&
      !lines[idx].trim().startsWith("|") &&
      !lines[idx].startsWith("```") &&
      !/^#{1,6} /.test(lines[idx]) &&
      !/^:::(info|warning|error|note|success|expand)/.test(lines[idx]) &&
      !/^---+$/.test(lines[idx].trim()) &&
      !/^[-*] /.test(lines[idx].trimStart()) &&
      !/^\d+\. /.test(lines[idx].trimStart()) &&
      !lines[idx].trimStart().startsWith("- [")
    ) {
      paraLines.push(lines[idx]);
      idx++;
    }

    if (paraLines.length === 1) {
      elements.push(<p key={`p-${idx}`}>{inlineFormat(paraLines[0])}</p>);
    } else {
      // Multiple consecutive lines → single paragraph with soft breaks
      elements.push(
        <p key={`p-${idx}`}>
          {paraLines.map((l, li) => (
            <span key={li}>
              {li > 0 && <br />}
              {inlineFormat(l)}
            </span>
          ))}
        </p>
      );
    }
  }

  return elements;
}
