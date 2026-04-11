"use client";

import { useState, useRef, useEffect } from "react";
import type { POStatus } from "@/types/ticket";
import { PO_STATUS_OPTIONS } from "@/types/ticket";
import { PO_STATUS_COLORS } from "@/components/sprint-board/FilterBar";
import { Minus, Sparkles, Pencil, CircleDot, Check, Pause, Clock } from "lucide-react";
import { ReviewPopover } from "@/components/sprint-board/ReviewPopover";

type EditState = "draft" | "local_edits" | "conflict";

export const EDIT_STATE_CONFIG: Record<EditState, { dotClass: string; accent: string; label: string; description: string }> = {
  draft: {
    dotClass: "bg-[#4a90d9]/40",
    accent: "#4a90d9",
    label: "Unsaved draft",
    description: "A draft is in progress but has not been saved to Jira yet.",
  },
  local_edits: {
    dotClass: "bg-[#4a90d9]/70",
    accent: "#4a90d9",
    label: "Local changes",
    description: "This ticket has local edits that are pending sync to Jira.",
  },
  conflict: {
    dotClass: "bg-[#ea8744]/70",
    accent: "#ea8744",
    label: "Conflict",
    description: "Jira was updated after your local edit. Review and resolve before saving.",
  },
};

export function EditStateDot({ state }: { state: EditState }) {
  const cfg = EDIT_STATE_CONFIG[state];
  return (
    <span className="group/dot relative inline-flex cursor-default">
      <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dotClass}`} />
      <span
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-3 w-48 -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover/dot:opacity-100"
        role="tooltip"
      >
        {/* Arrow */}
        <span
          className="absolute -bottom-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45"
          style={{
            backgroundColor: "rgb(22,22,34)",
            borderRight: "1px solid rgba(255,255,255,0.07)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        />
        {/* Panel */}
        <span
          className="font-sans relative flex flex-col overflow-hidden rounded-lg"
          style={{
            backgroundColor: "rgb(22,22,34)",
            border: "1px solid rgba(255,255,255,0.07)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.3)",
          }}
        >
          {/* Accent top bar */}
          <span className="h-[2px] w-full shrink-0" style={{ backgroundColor: cfg.accent, opacity: 0.6 }} />
          <span className="flex flex-col gap-1 px-3 py-2.5">
            <span className="text-[11px] font-semibold tracking-wide text-white/90">{cfg.label}</span>
            <span className="text-[10.5px] leading-relaxed text-white/40">{cfg.description}</span>
          </span>
        </span>
      </span>
    </span>
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
  let color: string | undefined;
  if (score !== null) {
    if (score < 60) color = "#e5534b";
    else if (score < 75) color = "#ea8744";
    else if (score < 90) color = "#eab308";
    else color = "#4aaa60";
  }

  const content = score === null ? (
    <span className="text-white/15 leading-none">--</span>
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
        className="cursor-pointer rounded px-1 py-0.5 leading-none hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.08]"
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
  if (!status) return <Minus {...props} opacity={0.25} />;
  switch (status) {
    case "Nieuw": return <Sparkles {...props} />;
    case "Uitwerken": return <Pencil {...props} />;
    case "Wachten op feedback": return <Clock {...props} />;
    case "Klaar voor refinement": return <CircleDot {...props} />;
    case "Ready": return <Check {...props} />;
    case "Geparkeerd": return <Pause {...props} />;
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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const colors = value ? PO_STATUS_COLORS[value] : null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 rounded cursor-pointer hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.08] ${
          showLabel ? "h-7 px-2.5 py-0.5" : "h-6 w-6 justify-center"
        }`}
        style={{ color: colors?.text || "rgba(255,255,255,0.2)" }}
        title={value || "No status"}
      >
        <POStatusIcon status={value} />
        {showLabel && (
          <span className="text-xs font-medium" style={{ color: colors?.text || "rgba(255,255,255,0.35)" }}>
            {value || "No status"}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 w-52 rounded-lg border border-white/[0.08] bg-[var(--color-surface-floating)] py-1 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
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
                className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer hover:bg-white/[0.04] active:bg-white/[0.06] ${
                  opt.value === value ? "text-white" : "text-white/60"
                }`}
              >
                <span style={{ color: optColors?.text || "rgba(255,255,255,0.25)" }}>
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
