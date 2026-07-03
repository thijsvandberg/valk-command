"use client";

import { useState, useRef } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import type { POStatus } from "@/types/ticket";
import { PO_STATUS_OPTIONS } from "@/types/ticket";
import { PO_STATUS_COLORS } from "@/components/sprint-board/FilterBar";
import { Minus, Sparkles, Pencil, CircleDot, Check, Pause, Clock } from "lucide-react";
import { ReviewPopover } from "@/components/sprint-board/ReviewPopover";
import { Tooltip } from "@/components/shared/Tooltip";
import { getScoreColor } from "@/lib/status-colors";

type EditState = "local_edits" | "conflict";

export const EDIT_STATE_CONFIG: Record<EditState, { dotClass: string; accent: string; label: string; description: string }> = {
  local_edits: {
    dotClass: "bg-[var(--color-icon-task)]/70",
    accent: "var(--color-icon-task)",
    label: "Local changes",
    description: "This ticket has local edits that are pending sync to Jira.",
  },
  conflict: {
    dotClass: "bg-[var(--color-status-warning)]/70",
    accent: "var(--color-status-warning)",
    label: "Conflict",
    description: "Jira was updated after your local edit. Review and resolve before saving.",
  },
};

export function EditStateDot({ state }: { state: EditState }) {
  const cfg = EDIT_STATE_CONFIG[state];
  return (
    <Tooltip
      delay={300}
      content={
        <span className="flex flex-col gap-1" style={{ maxWidth: 210 }}>
          <span className="text-body font-semibold text-text-primary">{cfg.label}</span>
          <span className="text-body-sm leading-relaxed text-text-tertiary">{cfg.description}</span>
        </span>
      }
    >
      {/* Negative margin keeps the dot's visual footprint while padding enlarges the hover/hit area */}
      <span className="-m-2 inline-flex cursor-default items-center justify-center p-2">
        <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dotClass}`} />
      </span>
    </Tooltip>
  );
}

export function getJiraUrl(ticketKey: string): string {
  const base =
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_JIRA_BASE_URL) ||
    "https://new-story.atlassian.net";
  return `${base.replace(/\/$/, "")}/browse/${ticketKey}`;
}

export function QualityBadge({
  score,
  ticketKey,
  isPopoverOpen,
  onTogglePopover,
}: {
  score: number | null;
  ticketKey?: string;
  isPopoverOpen?: boolean;
  onTogglePopover?: () => void;
}) {
  const color: string | undefined = score !== null ? getScoreColor(score) : undefined;

  const content = score === null ? (
    <span className="inline-block h-[3px] w-[3px] rounded-full bg-[var(--color-text-muted)]/40 leading-none" />
  ) : (
    <span
      className="inline-flex items-center gap-1.5 tabular-nums leading-none"
      style={{ color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {score}
    </span>
  );

  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!ticketKey || !onTogglePopover) {
    return <span title={score !== null ? `Quality: ${score}/100` : undefined}>{content}</span>;
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePopover();
        }}
        className="cursor-pointer rounded px-1 py-0.5 leading-none hover:bg-hover-interactive focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-strong"
        title={score !== null ? `Quality: ${score}/100` : "No review"}
      >
        {content}
      </button>
      {isPopoverOpen && (
        <ReviewPopover
          ticketKey={ticketKey}
          score={score}
          onClose={onTogglePopover}
          anchorRef={buttonRef}
        />
      )}
    </>
  );
}

export function POStatusIcon({ status, size = 14 }: { status: POStatus; size?: number }) {
  const props = { style: { width: size, height: size }, strokeWidth: 1.5 };
  if (!status) return <Minus {...props} />;
  switch (status) {
    case "New": return <Sparkles {...props} />;
    case "Draft": return <Pencil {...props} />;
    case "Awaiting Feedback": return <Clock {...props} />;
    case "Ready for Refinement": return <CircleDot {...props} />;
    case "Ready": return <Check {...props} />;
    case "On Hold": return <Pause {...props} />;
  }
}

export function POStatusCell({
  value,
  onChange,
  showLabel = false,
}: {
  value: POStatus;
  onChange: (v: POStatus) => void;
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOutsideClick(ref, () => setOpen(false), { enabled: open });

  const colors = value ? PO_STATUS_COLORS[value] : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 rounded-md cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-70 ${
          showLabel ? "h-7 px-2.5 py-0.5 hover:opacity-80" : "h-6 w-6 justify-center hover:opacity-80"
        }`}
        style={{
          color: colors?.text || "var(--color-text-muted)",
          backgroundColor: colors?.bg || "var(--color-overlay-subtle)",
        }}
        title={value || "No status"}
      >
        <POStatusIcon status={value} />
        {showLabel && (
          <span className="text-body-sm font-medium" style={{ color: colors?.text || "var(--color-text-tertiary)" }}>
            {value || "No status"}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 z-dropdown mt-1 w-52 rounded-lg border border-border-strong bg-surface-floating py-1 shadow-lg">
          {PO_STATUS_OPTIONS.map((opt) => {
            const optColors = opt.value ? PO_STATUS_COLORS[opt.value] : null;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm cursor-pointer hover:bg-hover-list-item active:bg-overlay-default ${
                  opt.value === value ? "text-text-primary" : "text-text-secondary"
                } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
              >
                <span style={{ color: optColors?.text || "var(--color-text-muted)" }}>
                  <POStatusIcon status={opt.value} size={13} />
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
