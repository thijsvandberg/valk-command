"use client";

import { useState } from "react";

interface CodeBlockProps {
  /** Raw fence language ("js", "ts", "") used for the uppercased header label. */
  lang: string;
  /** Pre-sanitized Prism HTML, one entry per source line. Highlighting stays in
   *  the pure render layer so toggling collapse never re-runs Prism. */
  highlightedLines: string[];
  /** Equal to highlightedLines.length; passed explicitly so the summary is stable. */
  lineCount: number;
  /** Seed for the in-memory collapsed state (long blocks start collapsed). */
  defaultCollapsed: boolean;
}

// Long blocks dominate the viewport and bury the surrounding prose, so the
// header is interactive and lets the reader fold the code away per block.
export function CodeBlock({ lang, highlightedLines, lineCount, defaultCollapsed }: CodeBlockProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const label = lang ? lang.toUpperCase() : "Code";
  const summary = `${label} · ${lineCount} ${lineCount === 1 ? "line" : "lines"}`;

  return (
    <div
      className="rm-code-block my-3 overflow-hidden rounded-xl"
      style={{ background: "var(--color-code-surface)", border: "1px solid var(--color-code-border)" }}
    >
      {/* Header bar doubles as the collapse toggle (large hit target). */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand code" : "Collapse code"}
        className="rm-code-block-header flex w-full cursor-pointer items-center gap-2 border-b px-3 py-2 text-left hover:bg-hover-list-item active:bg-overlay-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ background: "var(--color-code-header-bg)", borderColor: "var(--color-code-border)", transition: "background 0.15s ease" }}
      >
        <svg
          className="h-3 w-3 shrink-0"
          style={{ color: "var(--color-text-muted)", transform: collapsed ? "rotate(0deg)" : "rotate(90deg)", transition: "transform 0.15s ease" }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        {!collapsed && (
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-overlay-strong)" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-overlay-strong)" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-overlay-strong)" }} />
          </div>
        )}
        {collapsed ? (
          <span className="font-mono text-caption font-medium tracking-wide" style={{ color: "var(--color-code-label)" }}>
            {summary}
          </span>
        ) : (
          lang && (
            <span className="ml-1 font-mono text-caption font-medium uppercase tracking-widest" style={{ color: "var(--color-code-label)" }}>
              {lang}
            </span>
          )
        )}
      </button>
      {/* Code grid: identical to the previous always-on rendering. */}
      {!collapsed && (
        <div className="overflow-x-auto py-2">
          <div className="grid" style={{ gridTemplateColumns: "3rem 1fr" }}>
            {highlightedLines.map((html, li) => (
              <div key={li} className="contents group">
                <div
                  className="select-none border-r py-0 pr-3 pl-0 text-right font-mono text-label leading-[1.6rem]"
                  style={{ color: "var(--color-code-line-number)", borderColor: "var(--color-code-border)", whiteSpace: "nowrap" }}
                >
                  {li + 1}
                </div>
                <div
                  className="rm-code-content py-0 pl-4 pr-6 font-mono text-[0.8125rem] leading-[1.6rem]"
                  style={{ color: "var(--color-code-fg)", whiteSpace: "pre" }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
