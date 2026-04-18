"use client";

import { useState, useRef, useEffect } from "react";
import { ExternalLink, FilePen, MessageCircleQuestion, CheckCircle2, Ban, Minus, Copy, ClipboardList } from "lucide-react";
import type { JiraStatus, TicketReadiness, IssueType } from "@/types/ticket";
import {
  JIRA_STATUS_COLORS,
  JIRA_STATUS_ABBREVIATIONS,
  READINESS_CONFIG,
  READINESS_OPTIONS,
} from "@/types/ticket";
import { ISSUE_TYPE_COLORS } from "@/components/shared/IssueTypeIcon";
import { getJiraUrl } from "@/lib/jira-url";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { formatTicketShare } from "@/lib/ticket-share";

// ---------------------------------------------------------------------------
// Readiness icon helper
// ---------------------------------------------------------------------------

function ReadinessIcon({ value, size = 12 }: { value: TicketReadiness; size?: number }) {
  const props = { style: { width: size, height: size }, strokeWidth: 1.75 };
  switch (value) {
    case "drafting":             return <FilePen {...props} />;
    case "waiting_for_feedback": return <MessageCircleQuestion {...props} />;
    case "ready_to_refine":      return <CheckCircle2 {...props} />;
    case "on_hold":              return <Ban {...props} />;
  }
}

// ---------------------------------------------------------------------------
// IssueTypeDropdown
// ---------------------------------------------------------------------------

const SELECTABLE_TYPES: IssueType[] = ["story", "bug", "task", "spike"];
const TYPE_LABELS: Record<IssueType, string> = {
  story: "Story", bug: "Bug", task: "Task", subtask: "Subtask", spike: "Spike", epic: "Epic",
};

interface IssueTypeDropdownProps {
  currentValue: string;
  onChange: (type: IssueType) => void;
  onClose: () => void;
}

function IssueTypeDropdown({ currentValue, onChange, onClose }: IssueTypeDropdownProps) {
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
      className="absolute top-full left-0 z-50 mt-1 min-w-[130px] rounded-lg border border-white/[0.07] py-1"
      style={{
        backgroundColor: "var(--color-surface-floating)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3)",
      }}
    >
      {SELECTABLE_TYPES.map((type) => {
        const isActive = type === currentValue;
        const color = ISSUE_TYPE_COLORS[type];
        return (
          <button
            key={type}
            type="button"
            onClick={() => { onChange(type); onClose(); }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer hover:bg-hover-list-item active:bg-white/[0.06]"
          >
            <IssueTypeIcon type={type} size={12} />
            <span className={isActive ? "font-medium" : ""} style={{ color: isActive ? color : "rgba(255,255,255,0.5)" }}>
              {TYPE_LABELS[type]}
            </span>
            {isActive && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KeyDropdown — copy/open actions for the ticket key segment
// ---------------------------------------------------------------------------

interface KeyDropdownProps {
  jiraUrl: string;
  ticketKey: string;
  title?: string;
  onClose: () => void;
}

function KeyDropdown({ jiraUrl, ticketKey, title, onClose }: KeyDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<"url" | "titled" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onClose]);

  async function copyToClipboard(text: string, type: "url" | "titled") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onClose(), 1200);
    } catch {
      // Clipboard write requires secure context or user gesture
    }
  }

  const itemClass =
    "flex w-full items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer hover:bg-hover-list-item active:bg-white/[0.06] text-white/60";
  const iconClass = "shrink-0 text-white/30";

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 z-50 mt-1 min-w-[188px] rounded-lg border border-white/[0.07] py-1"
      style={{
        backgroundColor: "var(--color-surface-floating)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.3)",
      }}
    >
      <a
        href={jiraUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClose}
        className={itemClass}
      >
        <ExternalLink size={12} strokeWidth={1.5} className={iconClass} />
        Open in Jira
      </a>
      <button
        type="button"
        onClick={() => copyToClipboard(jiraUrl, "url")}
        className={itemClass}
      >
        <Copy size={12} strokeWidth={1.5} className={iconClass} />
        {copied === "url" ? "Copied!" : "Copy Jira URL"}
      </button>
      {title && (
        <button
          type="button"
          onClick={() => copyToClipboard(formatTicketShare(title, ticketKey), "titled")}
          className={itemClass}
        >
          <ClipboardList size={12} strokeWidth={1.5} className={iconClass} />
          {copied === "titled" ? "Copied!" : "Copy with title"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// JiraStatusDropdown
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

// ---------------------------------------------------------------------------
// ReadinessDropdown
// ---------------------------------------------------------------------------

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
      className="absolute top-full left-0 z-50 mt-1 min-w-[210px] rounded-lg border border-white/[0.07] py-1"
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
  issueType?: string;
  onIssueTypeChange?: (type: IssueType) => void;
  title?: string;
  size?: "sm" | "md";
}

export function TicketStatusPill({
  ticketKey,
  jiraStatus,
  readiness,
  onJiraStatusChange,
  onReadinessChange,
  issueType,
  onIssueTypeChange,
  title,
  size = "md",
}: TicketStatusPillProps) {
  const [issueTypeDropdownOpen, setIssueTypeDropdownOpen] = useState(false);
  const [keyDropdownOpen, setKeyDropdownOpen] = useState(false);
  const [jiraDropdownOpen, setJiraDropdownOpen] = useState(false);
  const [readinessDropdownOpen, setReadinessDropdownOpen] = useState(false);
  const jiraUrl = getJiraUrl(ticketKey);

  const jiraColors = JIRA_STATUS_COLORS[jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];
  const readinessCfg = readiness ? READINESS_CONFIG[readiness] : null;

  const iconSize = size === "sm" ? 10 : 12;
  const px = size === "sm" ? "px-1.5 py-[3px]" : "px-2 py-[3px]";
  // Issue type is icon-only; shave 1px off the right to compensate for the divider + rounded-l-md visual effect
  const issueTypePx = size === "sm" ? "pl-1.5 pr-1 py-[3px]" : "pl-2 pr-1.5 py-[3px]";
  const textSize = size === "sm" ? "text-[10px]" : "text-label";

  return (
    <div className="flex shrink-0 items-center gap-1">
      <div className="flex shrink-0 items-stretch overflow-visible rounded-md bg-white/[0.06] ring-1 ring-inset ring-white/[0.06]">

        {/* Issue type segment */}
        {issueType && (
          <>
            <div className="relative flex">
              <button
                type="button"
                onClick={onIssueTypeChange ? () => setIssueTypeDropdownOpen((o) => !o) : undefined}
                title={onIssueTypeChange ? "Change issue type" : issueType}
                disabled={!onIssueTypeChange}
                className={`${issueTypePx} flex items-center justify-center rounded-l-md transition-colors duration-150 ${
                  onIssueTypeChange
                    ? "cursor-pointer hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    : "cursor-default"
                }`}
              >
                <IssueTypeIcon type={issueType} size={iconSize} />
              </button>
              {issueTypeDropdownOpen && onIssueTypeChange && (
                <IssueTypeDropdown
                  currentValue={issueType}
                  onChange={onIssueTypeChange}
                  onClose={() => setIssueTypeDropdownOpen(false)}
                />
              )}
            </div>
            <span className="w-px self-stretch bg-white/[0.07] shrink-0" />
          </>
        )}

        {/* Key segment — regular click opens dropdown, cmd+click navigates to ticket */}
        <div className="relative flex">
          <a
            href={`/tickets/${ticketKey}`}
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                setKeyDropdownOpen((o) => !o);
              }
            }}
            className={`${px} font-mono ${textSize} font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] flex items-center gap-1 text-white/50 hover:bg-white/[0.05] hover:text-white/75 ${!issueType ? "rounded-l-md" : ""}`}
          >
            {ticketKey}
          </a>
          {keyDropdownOpen && (
            <KeyDropdown
              jiraUrl={jiraUrl}
              ticketKey={ticketKey}
              title={title}
              onClose={() => setKeyDropdownOpen(false)}
            />
          )}
        </div>

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
            {JIRA_STATUS_ABBREVIATIONS[jiraStatus] ?? jiraStatus}
          </button>
          {jiraDropdownOpen && onJiraStatusChange && (
            <JiraStatusDropdown
              currentValue={jiraStatus}
              onChange={onJiraStatusChange}
              onClose={() => setJiraDropdownOpen(false)}
            />
          )}
        </div>

        {/* Readiness segment */}
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
    </div>
  );
}
