"use client";

import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, FilePen, MessageCircleQuestion, CheckCircle2, Ban, Minus, Copy, ClipboardList, PenLine } from "lucide-react";
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
  skipRef?: { current: HTMLElement | null };
}

function IssueTypeDropdown({ currentValue, onChange, onClose, skipRef }: IssueTypeDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (skipRef?.current?.contains(e.target as Node)) return;
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
      className="absolute top-full left-0 z-50 mt-1 min-w-[130px] rounded-lg border border-border-default bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
    >
      {SELECTABLE_TYPES.map((type) => {
        const isActive = type === currentValue;
        const color = ISSUE_TYPE_COLORS[type];
        return (
          <button
            key={type}
            type="button"
            onClick={() => { onChange(type); onClose(); }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
          >
            <IssueTypeIcon type={type} size={12} />
            <span className={isActive ? "font-medium" : ""} style={{ color: isActive ? color : "var(--color-text-secondary)" }}>
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
  skipRef?: { current: HTMLElement | null };
}

function KeyDropdown({ jiraUrl, ticketKey, title, onClose, skipRef }: KeyDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<"url" | "titled" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (skipRef?.current?.contains(e.target as Node)) return;
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
    "flex w-full items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer hover:bg-hover-list-item active:bg-overlay-default text-text-secondary";
  const iconClass = "shrink-0 text-text-tertiary";

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 z-50 mt-1 min-w-[188px] rounded-lg border border-border-default bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
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
      <button
        type="button"
        onClick={() => { window.open(`/tickets/${ticketKey}/write`, "_blank"); onClose(); }}
        className={itemClass}
      >
        <PenLine size={12} strokeWidth={1.5} className={iconClass} />
        Open Story Writer
      </button>
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
  skipRef?: { current: HTMLElement | null };
}

const JIRA_STATUS_ORDER: JiraStatus[] = ["TO DO", "IN PROGRESS", "TEST", "DONE", "DEPRECATED"];

function JiraStatusDropdown({ currentValue, onChange, onClose, skipRef }: JiraDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (skipRef?.current?.contains(e.target as Node)) return;
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
      className="absolute top-full left-0 z-50 mt-1 min-w-[172px] rounded-lg border border-border-default bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
    >
      {JIRA_STATUS_ORDER.map((status) => {
        const colors = JIRA_STATUS_COLORS[status];
        const isActive = status === currentValue;
        return (
          <button
            key={status}
            type="button"
            onClick={() => { onChange(status); onClose(); }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
          >
            <span
              className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide"
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >
              {JIRA_STATUS_ABBREVIATIONS[status]}
            </span>
            <span className={isActive ? "text-text-primary" : "text-text-secondary"}>{status}</span>
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
  skipRef?: { current: HTMLElement | null };
}

function ReadinessDropdown({ currentValue, onChange, onClose, skipRef }: ReadinessDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (skipRef?.current?.contains(e.target as Node)) return;
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
      className="absolute top-full left-0 z-50 mt-1 min-w-[210px] rounded-lg border border-border-default bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
    >
      {READINESS_OPTIONS.map((opt) => {
        const isActive = opt.value === currentValue;
        const cfg = opt.value ? READINESS_CONFIG[opt.value] : null;
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => { onChange(opt.value); onClose(); }}
            className="flex w-full items-center gap-2.5 px-3 py-[7px] text-xs cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
          >
            <span
              className="shrink-0 w-4 flex items-center justify-center"
              style={{ color: cfg?.color ?? "var(--color-text-muted)" }}
            >
              {opt.value ? <ReadinessIcon value={opt.value} size={13} /> : <Minus style={{ width: 11, height: 11 }} strokeWidth={1.5} />}
            </span>
            <span className={isActive ? "text-text-primary font-medium" : "text-text-secondary"}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DropdownPortal — renders a dropdown at a fixed position relative to a trigger,
// escaping any overflow:hidden/auto ancestor (e.g. table scroll containers).
// Closes automatically on any scroll event so the position never goes stale.
// ---------------------------------------------------------------------------

function DropdownPortal({
  triggerRef,
  onClose,
  children,
}: {
  triggerRef: { current: HTMLElement | null };
  onClose: () => void;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 200;
    setPos({
      top: openUp ? rect.top : rect.bottom + 4,
      left: rect.left,
      openUp,
    });

    const close = () => onClose();
    window.addEventListener("scroll", close, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", close, { capture: true });
  }, [triggerRef, onClose]);

  if (!pos || typeof document === "undefined") return null;

  // The children (dropdown components) use `absolute top-full mt-1` for
  // non-portal (inline) usage. The [&>*] selector resets that positioning
  // so the portal container fully controls placement.
  return createPortal(
    <div
      ref={contentRef}
      style={{
        position: "fixed",
        left: pos.left,
        zIndex: 9999,
        ...(pos.openUp
          ? { bottom: window.innerHeight - pos.top + 4 }
          : { top: pos.top }),
      }}
      className="[&>*]:!static [&>*]:!mt-0"
    >
      {children}
    </div>,
    document.body,
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
  size?: "sm" | "md" | "lg";
  // "list" strips the outer container and renders segments inline — for use in dense table rows.
  variant?: "list";
  removedFromJira?: boolean;
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
  variant,
  removedFromJira,
}: TicketStatusPillProps) {
  const [issueTypeDropdownOpen, setIssueTypeDropdownOpen] = useState(false);
  const [keyDropdownOpen, setKeyDropdownOpen] = useState(false);
  const [jiraDropdownOpen, setJiraDropdownOpen] = useState(false);
  const [readinessDropdownOpen, setReadinessDropdownOpen] = useState(false);

  // Refs for portal positioning (used in list variant to escape overflow:hidden table containers)
  const issueTypeBtnRef = useRef<HTMLButtonElement>(null);
  const keyLinkRef = useRef<HTMLAnchorElement>(null);
  const jiraStatusBtnRef = useRef<HTMLButtonElement>(null);
  const readinessBtnRef = useRef<HTMLButtonElement>(null);

  const jiraUrl = getJiraUrl(ticketKey);

  const isList = variant === "list";
  const jiraColors = JIRA_STATUS_COLORS[jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];
  const readinessCfg = readiness ? READINESS_CONFIG[readiness] : null;

  const iconSize = size === "sm" ? 10 : size === "lg" ? 14 : 12;
  const px = size === "sm" ? "px-1.5 py-[3px]" : size === "lg" ? "px-2.5 py-1" : "px-2 py-[3px]";
  const issueTypePx = size === "sm" ? "pl-1.5 pr-1 py-[3px]" : size === "lg" ? "pl-2.5 pr-2 py-1" : "pl-2 pr-1.5 py-[3px]";
  const textSize = size === "sm" ? "text-[10px]" : size === "lg" ? "text-xs" : "text-label";

  const showReadiness = readinessCfg || onReadinessChange;

  // ---------------------------------------------------------------------------
  // List variant — no outer container, segments float inline with gaps
  // ---------------------------------------------------------------------------
  if (isList) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">

        {/* Issue type */}
        {issueType && (
          <div className="relative flex shrink-0">
            <button
              ref={issueTypeBtnRef}
              type="button"
              onClick={onIssueTypeChange ? () => setIssueTypeDropdownOpen((o) => !o) : undefined}
              title={onIssueTypeChange ? "Change issue type" : issueType}
              disabled={!onIssueTypeChange}
              className={`flex items-center justify-center rounded p-1 transition-colors duration-150 ${
                onIssueTypeChange ? "cursor-pointer hover:bg-overlay-default" : "cursor-default"
              }`}
            >
              <IssueTypeIcon type={issueType} size={iconSize} />
            </button>
            {issueTypeDropdownOpen && onIssueTypeChange && (
              <DropdownPortal triggerRef={issueTypeBtnRef} onClose={() => setIssueTypeDropdownOpen(false)}>
                <IssueTypeDropdown
                  currentValue={issueType}
                  onChange={onIssueTypeChange}
                  onClose={() => setIssueTypeDropdownOpen(false)}
                  skipRef={issueTypeBtnRef}
                />
              </DropdownPortal>
            )}
          </div>
        )}

        {/* Key */}
        <div className="relative flex shrink-0">
          <a
            ref={keyLinkRef}
            href={`/tickets/${ticketKey}`}
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                setKeyDropdownOpen((o) => !o);
              }
            }}
            className={`font-mono ${textSize} font-medium text-text-secondary transition-colors duration-150 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
            style={{ minWidth: "9ch" }}
          >
            {ticketKey}
          </a>
          {keyDropdownOpen && (
            <DropdownPortal triggerRef={keyLinkRef} onClose={() => setKeyDropdownOpen(false)}>
              <KeyDropdown
                jiraUrl={jiraUrl}
                ticketKey={ticketKey}
                title={title}
                onClose={() => setKeyDropdownOpen(false)}
                skipRef={keyLinkRef}
              />
            </DropdownPortal>
          )}
        </div>

        {/* Jira status badge */}
        {removedFromJira ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold bg-red-500/10 text-red-400/70">
            <span className="shrink-0 h-1.5 w-1.5 rounded-full opacity-70 bg-red-400/70" />
            DELETED
          </span>
        ) : (
          <div className="relative flex shrink-0">
            <button
              ref={jiraStatusBtnRef}
              type="button"
              onClick={onJiraStatusChange ? () => setJiraDropdownOpen((o) => !o) : undefined}
              title={onJiraStatusChange ? "Change status" : jiraStatus}
              disabled={!onJiraStatusChange}
              className={`flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide transition-colors duration-150 ${
                onJiraStatusChange ? "cursor-pointer hover:brightness-110" : "cursor-default"
              }`}
              style={{ backgroundColor: jiraColors.bg, color: jiraColors.text, opacity: 0.85 }}
            >
              <span className="shrink-0 h-1.5 w-1.5 rounded-full opacity-70" style={{ backgroundColor: jiraColors.text }} />
              {JIRA_STATUS_ABBREVIATIONS[jiraStatus] ?? jiraStatus}
            </button>
            {jiraDropdownOpen && onJiraStatusChange && (
              <DropdownPortal triggerRef={jiraStatusBtnRef} onClose={() => setJiraDropdownOpen(false)}>
                <JiraStatusDropdown
                  currentValue={jiraStatus}
                  onChange={onJiraStatusChange}
                  onClose={() => setJiraDropdownOpen(false)}
                  skipRef={jiraStatusBtnRef}
                />
              </DropdownPortal>
            )}
          </div>
        )}

        {/* Readiness */}
        {showReadiness && (
          <div className="relative flex shrink-0">
            <button
              ref={readinessBtnRef}
              type="button"
              onClick={onReadinessChange ? () => setReadinessDropdownOpen((o) => !o) : undefined}
              title={readiness ? READINESS_CONFIG[readiness].label : "Ready for Development"}
              disabled={!onReadinessChange}
              className={`flex items-center justify-center rounded transition-colors duration-150 ${
                onReadinessChange ? "cursor-pointer hover:bg-overlay-default" : "cursor-default"
              }`}
              style={{ color: readinessCfg?.color ?? "var(--color-text-muted)", width: iconSize + 4, height: iconSize + 4 }}
            >
              {readiness ? (
                <ReadinessIcon value={readiness} size={iconSize} />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-overlay-strong" />
              )}
            </button>
            {readinessDropdownOpen && onReadinessChange && (
              <DropdownPortal triggerRef={readinessBtnRef} onClose={() => setReadinessDropdownOpen(false)}>
                <ReadinessDropdown
                  currentValue={readiness ?? null}
                  onChange={onReadinessChange}
                  onClose={() => setReadinessDropdownOpen(false)}
                  skipRef={readinessBtnRef}
                />
              </DropdownPortal>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Default variant — unified pill container with segments and dividers
  // ---------------------------------------------------------------------------
  return (
    <div className="flex shrink-0 items-center gap-1">
      <div className="flex shrink-0 items-stretch overflow-visible rounded-md bg-overlay-default ring-1 ring-inset ring-border-default">

        {/* Issue type segment */}
        {issueType && (
          <>
            <div className="relative flex">
              <button
                ref={issueTypeBtnRef}
                type="button"
                onClick={onIssueTypeChange ? () => setIssueTypeDropdownOpen((o) => !o) : undefined}
                title={onIssueTypeChange ? "Change issue type" : issueType}
                disabled={!onIssueTypeChange}
                className={`${issueTypePx} flex items-center justify-center rounded-l-md transition-colors duration-150 ${
                  onIssueTypeChange
                    ? "cursor-pointer hover:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    : "cursor-default"
                }`}
              >
                <IssueTypeIcon type={issueType} size={iconSize} />
              </button>
              {issueTypeDropdownOpen && onIssueTypeChange && (
                <DropdownPortal triggerRef={issueTypeBtnRef} onClose={() => setIssueTypeDropdownOpen(false)}>
                  <IssueTypeDropdown
                    currentValue={issueType}
                    onChange={onIssueTypeChange}
                    onClose={() => setIssueTypeDropdownOpen(false)}
                    skipRef={issueTypeBtnRef}
                  />
                </DropdownPortal>
              )}
            </div>
            <span className="w-px self-stretch bg-overlay-default shrink-0" />
          </>
        )}

        {/* Key segment — regular click opens dropdown, cmd+click navigates to ticket */}
        <div className="relative flex">
          <a
            ref={keyLinkRef}
            href={`/tickets/${ticketKey}`}
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                setKeyDropdownOpen((o) => !o);
              }
            }}
            className={`${px} font-mono ${textSize} font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] flex items-center gap-1 text-text-secondary hover:bg-overlay-default hover:text-text-secondary ${!issueType ? "rounded-l-md" : ""}`}
            style={{ minWidth: "9ch" }}
          >
            {ticketKey}
          </a>
          {keyDropdownOpen && (
            <DropdownPortal triggerRef={keyLinkRef} onClose={() => setKeyDropdownOpen(false)}>
              <KeyDropdown
                jiraUrl={jiraUrl}
                ticketKey={ticketKey}
                title={title}
                onClose={() => setKeyDropdownOpen(false)}
                skipRef={keyLinkRef}
              />
            </DropdownPortal>
          )}
        </div>

        {/* Divider */}
        <span className="w-px self-stretch bg-overlay-default shrink-0" />

        {/* Jira status segment */}
        {removedFromJira ? (
          <span
            className={`${px} ${textSize} font-medium flex items-center gap-1.5 rounded-r-md`}
            style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "rgba(248,113,113,0.7)" }}
          >
            <span className="shrink-0 h-1.5 w-1.5 rounded-full opacity-70" style={{ backgroundColor: "rgba(248,113,113,0.7)" }} />
            DELETED
          </span>
        ) : (
          <div className="relative flex">
            <button
              ref={jiraStatusBtnRef}
              type="button"
              onClick={onJiraStatusChange ? () => setJiraDropdownOpen((o) => !o) : undefined}
              title={onJiraStatusChange ? "Change status" : jiraStatus}
              disabled={!onJiraStatusChange}
              className={`${px} ${textSize} font-medium transition-colors duration-150 flex items-center gap-1.5 ${
                onJiraStatusChange
                  ? "cursor-pointer hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  : "cursor-default"
              } ${showReadiness ? "" : "rounded-r-md"}`}
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
              <DropdownPortal triggerRef={jiraStatusBtnRef} onClose={() => setJiraDropdownOpen(false)}>
                <JiraStatusDropdown
                  currentValue={jiraStatus}
                  onChange={onJiraStatusChange}
                  onClose={() => setJiraDropdownOpen(false)}
                  skipRef={jiraStatusBtnRef}
                />
              </DropdownPortal>
            )}
          </div>
        )}

        {/* Readiness segment */}
        {showReadiness && (
          <>
            <span className="w-px self-stretch bg-overlay-default shrink-0" />
            <div className="relative flex">
              <button
                ref={readinessBtnRef}
                type="button"
                onClick={onReadinessChange ? () => setReadinessDropdownOpen((o) => !o) : undefined}
                title={readiness ? READINESS_CONFIG[readiness].label : "Ready for Development"}
                disabled={!onReadinessChange}
                className={`${px} flex items-center justify-center rounded-r-md transition-colors duration-150 ${
                  onReadinessChange
                    ? "cursor-pointer hover:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    : "cursor-default"
                }`}
                style={{ color: readinessCfg?.color ?? "var(--color-text-muted)" }}
              >
                {readiness ? (
                  <ReadinessIcon value={readiness} size={iconSize} />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-overlay-strong" />
                )}
              </button>
              {readinessDropdownOpen && onReadinessChange && (
                <DropdownPortal triggerRef={readinessBtnRef} onClose={() => setReadinessDropdownOpen(false)}>
                  <ReadinessDropdown
                    currentValue={readiness ?? null}
                    onChange={onReadinessChange}
                    onClose={() => setReadinessDropdownOpen(false)}
                    skipRef={readinessBtnRef}
                  />
                </DropdownPortal>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
