"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Users } from "lucide-react";
import { CopyActions } from "../CopyActions";

interface StakeholderSummaryCardProps {
  content: string;
}

export function StakeholderSummaryCard({ content }: StakeholderSummaryCardProps) {
  // Reconstruct the markdown section for copying
  const copyContent = `## Summary (non-technical)\n\n${content}`;

  return (
    <div className="mt-4 rounded-xl border border-amber-500/[0.12] bg-amber-950/[0.15] px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <Users size={14} strokeWidth={1.5} className="text-amber-400/50" />
        <span className="font-[var(--font-display)] text-body-sm font-semibold tracking-[-0.01em] text-amber-400/60 uppercase">
          Summary for Stakeholders
        </span>
      </div>
      <div className="text-body-lg leading-[1.8] text-text-secondary font-[var(--font-body)]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
            strong: ({ children }) => (
              <strong className="font-semibold text-text-primary">{children}</strong>
            ),
            em: ({ children }) => <em className="italic text-text-secondary">{children}</em>,
            ul: ({ children }) => (
              <ul className="mb-3 space-y-1 pl-4 last:mb-0">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="mb-3 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>
            ),
            li: ({ children }) => (
              <li className="relative pl-2 before:absolute before:left-[-0.75rem] before:text-amber-400/30 before:content-['\2013']">
                {children}
              </li>
            ),
            // No code formatting in the stakeholder card
            code: ({ children }) => (
              <span className="font-[var(--font-body)] text-text-primary">{children}</span>
            ),
            pre: ({ children }) => (
              <div className="mb-3 last:mb-0">{children}</div>
            ),
            h1: ({ children }) => (
              <p className="mb-2 font-semibold text-text-primary">{children}</p>
            ),
            h2: ({ children }) => (
              <p className="mb-2 font-semibold text-text-primary">{children}</p>
            ),
            h3: ({ children }) => (
              <p className="mb-2 font-semibold text-text-primary">{children}</p>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
      <CopyActions content={copyContent} className="mt-3 pt-2 border-t border-amber-500/[0.08]" />
    </div>
  );
}
