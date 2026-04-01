import type { ReactNode } from "react";
import { Check } from "lucide-react";

function inlineFormat(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={i++} className="font-semibold text-white/80">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={i++} className="italic text-white/70">{match[3]}</em>);
    } else if (match[4]) {
      parts.push(<code key={i++} className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--color-brand-300)]">{match[4]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length === 1 ? parts[0] : parts;
}

export function renderMarkdown(text: string): ReactNode[] {
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let orderedItems: ReactNode[] = [];
  let codeBlock: string[] | null = null;

  function flushList() {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${elements.length}`} className="my-2 ml-5 list-disc space-y-1 text-white/60">{listItems}</ul>);
      listItems = [];
    }
    if (orderedItems.length > 0) {
      elements.push(<ol key={`ol-${elements.length}`} className="my-2 ml-5 list-decimal space-y-1 text-white/60">{orderedItems}</ol>);
      orderedItems = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      flushList();
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
      continue;
    }

    if (codeBlock !== null) {
      codeBlock.push(line);
      continue;
    }

    if (line.startsWith("## ")) {
      flushList();
      elements.push(<h3 key={`h3-${i}`} className="mt-6 mb-2 font-[var(--font-display)] text-base font-semibold text-white/90">{line.slice(3)}</h3>);
    } else if (line.startsWith("### ")) {
      flushList();
      elements.push(<h4 key={`h4-${i}`} className="mt-4 mb-1.5 text-sm font-semibold text-white/80">{line.slice(4)}</h4>);
    } else if (line.startsWith("- [ ] ")) {
      flushList();
      elements.push(
        <div key={`cb-${i}`} className="my-1 flex items-start gap-2 text-sm text-white/60">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-white/[0.12] bg-white/[0.03]" />
          <span>{inlineFormat(line.slice(6))}</span>
        </div>
      );
    } else if (line.startsWith("- [x] ")) {
      flushList();
      elements.push(
        <div key={`cb-${i}`} className="my-1 flex items-start gap-2 text-sm text-white/60">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]">
            <Check size={10} strokeWidth={1.5} />
          </span>
          <span className="line-through opacity-60">{inlineFormat(line.slice(6))}</span>
        </div>
      );
    } else if (/^- /.test(line)) {
      listItems.push(<li key={`li-${i}`} className="text-sm">{inlineFormat(line.slice(2))}</li>);
    } else if (/^\d+\. /.test(line)) {
      const content = line.replace(/^\d+\.\s*/, "");
      orderedItems.push(<li key={`oli-${i}`} className="text-sm">{inlineFormat(content)}</li>);
    } else if (line.trim() === "") {
      flushList();
      elements.push(<div key={`br-${i}`} className="h-2" />);
    } else {
      flushList();
      elements.push(<p key={`p-${i}`} className="text-sm leading-[1.7] text-white/60">{inlineFormat(line)}</p>);
    }
  }

  flushList();
  return elements;
}
