"use client";

import { useState, useRef, useEffect } from "react";
import { ExternalLink, PenLine, MessageCircleQuestion, Sparkles, Pause, Minus } from "lucide-react";
import type { JiraStatus, TicketReadiness } from "@/types/ticket";
import {
  JIRA_STATUS_COLORS,
  JIRA_STATUS_ABBREVIATIONS,
  READINESS_CONFIG,
  READINESS_OPTIONS,
} from "@/types/ticket";
import { getJiraUrl } from "@/lib/jira-url";

// ---------------------------------------------------------------------------
// Readiness icon helper
// ---------------------------------------------------------------------------

function ReadinessIcon({ value, size = 12 }: { value: TicketReadiness; size?: number }) {
  const props = { style: { width: size, height: size }, strokeWidth: 1.75 };
  switch (value) {
    case "drafting":             return <PenLine {...props} />;
    case "waiting_for_feedback": return <MessageCircleQuestion {...props} />;
    case "ready_to_refine":      return <Sparkles {...props} />;
    case "on_hold":              return <Pause {...props} />;
  }
}

// ---------------------------------------------------------------------------
// StatusDropdown — reusable popover for status changes
// ---------------------------------------------------------------------------

interface JiraDropdownProps {
  currentValue: JiraStatus;
  onChange: (value: JiraStatus) => void;
  onClose: () => void;
}

const JIRA_STATUS_ORDER: JiraStatus[] = ["TO DO", "IN PROGRESS", "TEST", "DONE", "DEPRECATED"];

function JiraStatusDropdown({ currentValue, onChange, onClose }: JiraDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 z-50 mt-1 min-w-[172px] rounded-lg border border-white/[0.07] py-1"
      style={{
        backgroundColor: "var(--color-surface-floating)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3)",
      }}
    >
      {JIRA_STATUS_ORDER.map((status) => {
        const colors = JIRA_STATUS_COLORS[status];
        const isActive = status === currentValue;
        return (
          <button
            key={status}
            type="button"
            onClick={() => { onChange(status); onClose(); }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer hover:bg-hover-list-item active:bg-white/[0.06]"
          >
            <span
              className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide"
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >
              {JIRA_STATUS_ABBREVIATIONS[status]}
            </span>
            <span className={isActive ? "text-white/90" : "text-white/50"}>{status}</span>
          </button>
        );
      })}
    </div>
  );
}

interface ReadinessDropdownProps {
  currentValue: TicketReadiness | null;
  onChange: (value: TicketReadiness | null) => void;
  onClose: () => void;
}

function ReadinessDropdown({ currentValue, onChange, onClose }: ReadinessDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 z-50 mt-1 min-w-[210px] rounded-lg border border-white/[0.07] py-1"
      style={{
        backgroundColor: "var(--color-surface-floating)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3)",
      }}
    >
      {READINESS_OPTIONS.map((opt) => {
        const isActive = opt.value === currentValue;
        const cfg = opt.value ? READINESS_CONFIG[opt.value] : null;
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => { onChange(opt.value); onClose(); }}
            className="flex w-full items-center gap-2.5 px-3 py-[7px] text-xs cursor-pointer hover:bg-hover-list-item active:bg-white/[0.06]"
          >
            <span
              className="shrink-0 w-4 flex items-center justify-center"
              style={{ color: cfg?.color ?? "rgba(255,255,255,0.2)" }}
            >
              {opt.value ? <ReadinessIcon value={opt.value} size={13} /> : <Minus style={{ width: 11, height: 11 }} strokeWidth={1.5} />}
            </span>
            <span className={isActive ? "text-white/85 font-medium" : "text-white/50"}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TicketStatusPill
// ---------------------------------------------------------------------------

export interface TicketStatusPillProps {
  ticketKey: string;
  jiraStatus: JiraStatus;
  readiness?: TicketReadiness | null;
  onJiraStatusChange?: (status: JiraStatus) => void;
  onReadinessChange?: (readiness: TicketReadiness | null) => void;
  size?: "sm" | "md";
  showExternalLink?: boolean;
}

export function TicketStatusPill({
  ticketKey,
  jiraStatus,
  readiness,
  onJiraStatusChange,
  onReadinessChange,
  size = "md",
  showExternalLink = true,
}: TicketStatusPillProps) {
  const [copied, setCopied] = useState(false);
  const [jiraDropdownOpen, setJiraDropdownOpen] = useState(false);
  const [readinessDropdownOpen, setReadinessDropdownOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jiraUrl = getJiraUrl(ticketKey);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(jiraUrl);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write requires secure context or user gesture
    }
  }

  const jiraColors = JIRA_STATUS_COLORS[jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];
  const readinessCfg = readiness ? READINESS_CONFIG[readiness] : null;

  const iconSize = size === "sm" ? 10 : 12;
  const px = size === "sm" ? "px-1.5 py-[3px]" : "px-2 py-[3px]";
  const textSize = size === "sm" ? "text-[10px]" : "text-label";

  return (
    <div className="group flex shrink-0 items-center gap-1">
      {/* Wrapper keeping all three segments visually grouped */}
      <div className="flex shrink-0 items-stretch overflow-visible rounded-md bg-white/[0.06] ring-1 ring-inset ring-white/[0.06]">

        {/* Key segment */}
        <button
          type="button"
          onClick={handleCopy}
          title="Copy Jira URL"
          className={`${px} font-mono ${textSize} font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] rounded-l-md flex items-center ${
            copied
              ? "bg-[var(--color-brand-500)]/20 text-[var(--color-brand-400)]"
              : "text-white/50 hover:bg-white/[0.05] hover:text-white/75"
          }`}
        >
          {ticketKey}
        </button>

        {/* Divider */}
        <span className="w-px self-stretch bg-white/[0.07] shrink-0" />

        {/* Jira status segment */}
        <div className="relative flex">
          <button
            type="button"
            onClick={onJiraStatusChange ? () => setJiraDropdownOpen((o) => !o) : undefined}
            title={onJiraStatusChange ? "Change status" : jiraStatus}
            disabled={!onJiraStatusChange}
            className={`${px} ${textSize} font-medium transition-colors duration-150 flex items-center gap-1.5 ${
              onJiraStatusChange
                ? "cursor-pointer hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                : "cursor-default"
            } ${(readinessCfg || onReadinessChange) ? "" : "rounded-r-md"}`}
            style={{ backgroundColor: jiraColors.bg, color: jiraColors.text }}
          >
            {onJiraStatusChange && (
              <span
                className="shrink-0 h-1.5 w-1.5 rounded-full opacity-60"
                style={{ backgroundColor: jiraColors.text }}
              />
            )}
            {jiraStatus}
          </button>
          {jiraDropdownOpen && onJiraStatusChange && (
            <JiraStatusDropdown
              currentValue={jiraStatus}
              onChange={onJiraStatusChange}
              onClose={() => setJiraDropdownOpen(false)}
            />
          )}
        </div>

        {/* Readiness segment — only shown when readiness is non-null or a callback is wired */}
        {(readinessCfg || onReadinessChange) && (
          <>
            <span className="w-px self-stretch bg-white/[0.07] shrink-0" />
            <div className="relative flex">
              <button
                type="button"
                onClick={onReadinessChange ? () => setReadinessDropdownOpen((o) => !o) : undefined}
                title={readiness ? READINESS_CONFIG[readiness].label : "Ready for Development"}
                disabled={!onReadinessChange}
                className={`${px} flex items-center justify-center rounded-r-md transition-colors duration-150 ${
                  onReadinessChange
                    ? "cursor-pointer hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    : "cursor-default"
                }`}
                style={{ color: readinessCfg?.color ?? "rgba(255,255,255,0.2)" }}
              >
                {readiness ? (
                  <ReadinessIcon value={readiness} size={iconSize} />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                )}
              </button>
              {readinessDropdownOpen && onReadinessChange && (
                <ReadinessDropdown
                  currentValue={readiness ?? null}
                  onChange={onReadinessChange}
                  onClose={() => setReadinessDropdownOpen(false)}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* External link — slides in from behind on hover */}
      {showExternalLink && (
        <span className="overflow-hidden w-0 group-hover:w-[26px] transition-[width] duration-150 ease-out flex items-center">
          <a
            href={jiraUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in Jira"
            className="flex shrink-0 items-center pl-1.5 text-white/25 hover:text-white/60 transition-colors duration-100 focus-visible:outline-none"
          >
            <ExternalLink size={15} strokeWidth={1.5} />
          </a>
        </span>
      )}
    </div>
  );
}
