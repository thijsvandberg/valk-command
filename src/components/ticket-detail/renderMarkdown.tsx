import type { ReactNode } from "react";
import { Check } from "lucide-react";

function inlineFormat(text: string): ReactNode {
  const parts: ReactNode[] = [];
  // Match: images, links, bold, italic, inline code
  const regex = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/g;
  let lastIndex = 0;
  let match;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2] !== undefined) {
      // Image: ![alt](src)
      const src = match[2];
      const alt = match[1];
      if (src.startsWith("/api/attachments/")) {
        parts.push(
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i++}
            src={src}
            alt={alt}
            className="my-1 max-w-full rounded-lg border border-white/[0.06]"
            style={{ maxHeight: "480px", objectFit: "contain" }}
          />,
        );
      } else {
        parts.push(
          <span key={i++} className="my-1 inline-flex items-center gap-1.5 rounded bg-white/[0.04] px-2 py-1 text-[0.85em] text-white/30">
            <span className="text-white/20">img:</span> {alt || src.split("/").pop()}
          </span>
        );
      }
    } else if (match[4] !== undefined) {
      // Link: [text](url)
      parts.push(
        <a
          key={i++}
          href={match[4]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--color-brand-400)] underline decoration-[var(--color-brand-400)]/30 underline-offset-2 hover:decoration-[var(--color-brand-400)]/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          style={{ transition: "text-decoration-color 0.15s ease" }}
        >
          {match[3]}
        </a>
      );
    } else if (match[6]) {
      parts.push(<strong key={i++} className="font-semibold text-white/80">{match[6]}</strong>);
    } else if (match[8]) {
      parts.push(<em key={i++} className="italic text-white/70">{match[8]}</em>);
    } else if (match[10]) {
      parts.push(<code key={i++} className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--color-brand-300)]">{match[10]}</code>);
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
    ? `${isRoot ? "ml-5" : "ml-4 mt-0.5"} list-decimal space-y-0.5 text-white/60`
    : `${isRoot ? "ml-5" : "ml-4 mt-0.5"} list-disc space-y-0.5 text-white/60`;

  return (
    <Tag key={keyPrefix} className={listClass}>
      {nodes.map((node, idx) => (
        <li key={`${keyPrefix}-${idx}`} className="text-sm leading-[1.6]">
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
  info:    { border: "border-blue-500/40",   bg: "bg-blue-500/[0.07]",   dot: "bg-blue-400",   label: "Info" },
  warning: { border: "border-amber-500/40",  bg: "bg-amber-500/[0.07]",  dot: "bg-amber-400",  label: "Warning" },
  error:   { border: "border-red-500/40",    bg: "bg-red-500/[0.07]",    dot: "bg-red-400",    label: "Error" },
  note:    { border: "border-white/[0.12]",  bg: "bg-white/[0.04]",      dot: "bg-white/40",   label: "Note" },
  success: { border: "border-green-500/40",  bg: "bg-green-500/[0.07]",  dot: "bg-green-400",  label: "Success" },
};

export function renderMarkdown(text: string): ReactNode[] {
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let codeBlock: string[] | null = null;
  let calloutType: string | null = null;
  let calloutLines: string[] | null = null;
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
          const nextIsList = (/^- /.test(nextTrimmed) && !/^- \[[ x]\] /.test(nextTrimmed)) || /^\d+\.\s/.test(nextTrimmed);
          if (nextIsList) {
            i = next;
            continue;
          }
        }
        break;
      }

      const indent = getIndentLevel(line);
      const isUnordered = /^- /.test(trimmed) && !/^- \[[ x]\] /.test(trimmed);
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

    return { nodes, nextIdx: i };
  }

  while (idx < lines.length) {
    const line = lines[idx];

    // Callout blocks: :::type ... :::
    const calloutOpen = line.match(/^:::(info|warning|error|note|success)\s*$/);
    if (calloutOpen && calloutType === null) {
      calloutType = calloutOpen[1];
      calloutLines = [];
      idx++;
      continue;
    }
    if (calloutType !== null) {
      if (line.trim() === ":::") {
        const style = CALLOUT_STYLES[calloutType] ?? CALLOUT_STYLES.info;
        const inner = renderMarkdown((calloutLines ?? []).join("\n"));
        elements.push(
          <div
            key={`callout-${elements.length}`}
            className={`my-3 rounded-lg border-l-2 px-4 py-3 ${style.border} ${style.bg}`}
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${style.dot}`} />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{style.label}</span>
            </div>
            <div>{inner}</div>
          </div>
        );
        calloutType = null;
        calloutLines = null;
      } else {
        calloutLines!.push(line);
      }
      idx++;
      continue;
    }

    // Code blocks
    if (line.startsWith("```")) {
      if (codeBlock !== null) {
        elements.push(
          <pre key={`code-${elements.length}`} className="my-3 overflow-x-auto rounded-lg border border-white/[0.06] bg-white/[0.03] p-4 font-mono text-sm leading-relaxed text-white/60">
            {codeBlock.join("\n")}
          </pre>
        );
        codeBlock = null;
      } else {
        codeBlock = [];
      }
      idx++;
      continue;
    }

    if (codeBlock !== null) {
      codeBlock.push(line);
      idx++;
      continue;
    }

    // Headings (check longer prefixes first)
    if (line.startsWith("#### ")) {
      elements.push(<h5 key={`h5-${idx}`} className="mt-3 mb-1 text-sm font-semibold text-white/70">{inlineFormat(line.slice(5))}</h5>);
      idx++;
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(<h4 key={`h4-${idx}`} className="mt-4 mb-1.5 text-sm font-semibold text-white/80">{inlineFormat(line.slice(4))}</h4>);
      idx++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<h3 key={`h3-${idx}`} className="mt-6 mb-2 font-[var(--font-display)] text-base font-semibold text-white/90">{inlineFormat(line.slice(3))}</h3>);
      idx++;
      continue;
    }

    // Task lists
    if (line.trimStart().startsWith("- [ ] ")) {
      const content = line.trimStart().slice(6);
      elements.push(
        <div key={`cb-${idx}`} className="my-1 flex items-start gap-2 text-sm text-white/60">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-white/[0.12] bg-white/[0.03]" />
          <span>{inlineFormat(content)}</span>
        </div>
      );
      idx++;
      continue;
    }
    if (line.trimStart().startsWith("- [x] ")) {
      const content = line.trimStart().slice(6);
      elements.push(
        <div key={`cb-${idx}`} className="my-1 flex items-start gap-2 text-sm text-white/60">
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
    const trimmed = line.trimStart();
    const isListStart = (/^- /.test(trimmed) && !/^- \[[ x]\] /.test(trimmed)) || /^\d+\.\s/.test(trimmed);
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

    // Standalone image line: render as block figure
    const standaloneImg = line.trim().match(/^!\[([^\]]*)\]\((\/api\/attachments\/[^)]+)\)$/);
    if (standaloneImg) {
      elements.push(
        <figure key={`img-${idx}`} className="my-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={standaloneImg[2]}
            alt={standaloneImg[1]}
            className="max-w-full rounded-lg border border-white/[0.06]"
            style={{ maxHeight: "600px", objectFit: "contain" }}
          />
          {standaloneImg[1] && (
            <figcaption className="mt-1.5 text-[11px] text-white/25">{standaloneImg[1]}</figcaption>
          )}
        </figure>,
      );
      idx++;
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={`br-${idx}`} className="h-2" />);
      idx++;
      continue;
    }

    // Paragraph (fallback)
    elements.push(<p key={`p-${idx}`} className="text-sm leading-[1.7] text-white/60">{inlineFormat(line)}</p>);
    idx++;
  }

  return elements;
}
