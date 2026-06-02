"use client";

import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { createPortal } from "react-dom";
import { ExternalLink, FilePen, MessageCircleQuestion, CheckCircle2, Ban, Minus, Copy, ClipboardList, PenLine, Flag, IterationCw, Zap, User, UserRound, ListChecks, Eye } from "lucide-react";
import type { JiraStatus, TicketReadiness, IssueType, Assignee, Sprint } from "@/types/ticket";
import {
  JIRA_STATUS_COLORS,
  JIRA_STATUS_ABBREVIATIONS,
  READINESS_CONFIG,
  READINESS_OPTIONS,
  getEpicColor,
} from "@/types/ticket";
import { ISSUE_TYPE_COLORS } from "@/components/shared/IssueTypeIcon";
import { getJiraUrl } from "@/lib/jira-url";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { formatTicketShare } from "@/lib/ticket-share";
import { Tooltip } from "@/components/shared/Tooltip";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { MetricBadge } from "@/components/shared/MetricBadge";
import { AssigneePicker, type AssignableUser } from "@/components/shared/AssigneePicker";
import { SprintPicker } from "@/components/shared/SprintPicker";
import { EpicPicker, type EpicOption } from "@/components/shared/EpicPicker";
import { Avatar } from "@/components/shared/Avatar";

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
  const refs = skipRef ? [ref, skipRef] : [ref];
  useOutsideClick(refs, onClose);

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
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
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

  const refs = skipRef ? [ref, skipRef] : [ref];
  useOutsideClick(refs, onClose);

  // Hide the navigation items that point at the page we are already on.
  const pathname = usePathname();
  const ticketPath = `/tickets/${ticketKey}`;
  const writePath = `${ticketPath}/write`;
  const onTicketView = pathname === ticketPath;
  const onStoryWriter = pathname === writePath;

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

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
    "flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm cursor-pointer hover:bg-hover-list-item active:bg-overlay-default text-text-secondary";
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
      {!onStoryWriter && (
        <button
          type="button"
          onClick={() => { window.open(writePath, "_blank"); onClose(); }}
          className={itemClass}
        >
          <PenLine size={12} strokeWidth={1.5} className={iconClass} />
          Open Story Writer
        </button>
      )}
      {!onTicketView && (
        <a href={ticketPath} onClick={onClose} className={itemClass}>
          <Eye size={12} strokeWidth={1.5} className={iconClass} />
          View ticket
        </a>
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
  skipRef?: { current: HTMLElement | null };
}

const JIRA_STATUS_ORDER: JiraStatus[] = ["TO DO", "IN PROGRESS", "TEST", "DONE", "DEPRECATED"];

function JiraStatusDropdown({ currentValue, onChange, onClose, skipRef }: JiraDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  const refs = skipRef ? [ref, skipRef] : [ref];
  useOutsideClick(refs, onClose);

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
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-body-sm cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
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
  const refs = skipRef ? [ref, skipRef] : [ref];
  useOutsideClick(refs, onClose);

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
            className="flex w-full items-center gap-2.5 px-3 py-[7px] text-body-sm cursor-pointer hover:bg-hover-list-item active:bg-overlay-default"
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

    // Delay attaching the scroll-close listener to avoid closing from
    // layout-induced micro-scrolls when the dropdown first renders
    const close = () => onClose();
    const timer = setTimeout(() => {
      window.addEventListener("scroll", close, { capture: true, passive: true });
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", close, { capture: true });
    };
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
// TicketHoverCard — read-only details card shown on pill hover
// ---------------------------------------------------------------------------

export interface TicketPillHoverData {
  title: string;
  storyPoints: number | null;
  businessValue: number | null;
  sprintId: string | null;
  sprintName: string | null;
  epicKey: string | null;
  epic: string | null;
  assignee: Assignee | null;
  /** Creator/reporter (read-only — Jira reporters are immutable). */
  reporter: Assignee | null;
  openSubtaskCount: number;
  totalSubtaskCount: number;
  flagged: boolean;
}


// One metadata row: leading icon + label on the left, value (or editor) on the right.
function InfoRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[26px] items-center justify-between gap-3">
      <span className="flex shrink-0 items-center gap-2 text-label font-medium uppercase tracking-wide text-text-muted">
        <span className="flex w-3.5 justify-center text-text-muted/70">{icon}</span>
        {label}
      </span>
      <span className="flex min-w-0 items-center justify-end gap-1.5 text-right text-body-sm text-text-secondary">{children}</span>
    </div>
  );
}

// Read-only person value: avatar + name (or muted placeholder).
function PersonValue({ person }: { person: Assignee | null }) {
  if (!person) return <span className="text-text-muted">Unassigned</span>;
  return (
    <>
      <span className="truncate">{person.name}</span>
      <Avatar assignee={person} size={18} />
    </>
  );
}

interface TicketHoverCardProps {
  ticketKey: string;
  triggerRef: { current: HTMLElement | null };
  data: TicketPillHoverData;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** When provided, Story Points become editable via an inline picker. */
  onStoryPointsChange?: (value: number | null) => void;
  /** When provided, Business Value becomes editable via an inline picker. */
  onBusinessValueChange?: (value: number | null) => void;
  /** When provided (with `sprints`), Sprint becomes editable. */
  onSprintChange?: (sprintId: string | null) => void;
  sprints?: Sprint[];
  /** When provided, Epic becomes editable. */
  onEpicChange?: (epic: EpicOption | null) => void;
  /** When provided, Assignee becomes editable. */
  onAssigneeChange?: (user: AssignableUser | null) => void;
  /** Notifies the parent when an inline picker opens/closes (to keep the card open). */
  onPickerOpenChange: (open: boolean) => void;
}

function TicketHoverCard({
  ticketKey,
  triggerRef,
  data,
  onMouseEnter,
  onMouseLeave,
  onStoryPointsChange,
  onBusinessValueChange,
  onSprintChange,
  sprints,
  onEpicChange,
  onAssigneeChange,
  onPickerOpenChange,
}: TicketHoverCardProps) {
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const [shown, setShown] = useState(false);

  useLayoutEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 260;
    setPos({ left: rect.left, top: openUp ? rect.top - 6 : rect.bottom + 6, openUp });
  }, [triggerRef]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!pos || typeof document === "undefined") return null;

  const epicColors = data.epic ? getEpicColor(data.epic) : null;

  return createPortal(
    <div
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-[9999] w-72 rounded-lg border border-border-default bg-[var(--color-surface-floating)] p-3 text-left normal-case tracking-normal shadow-[var(--shadow-popover)] transition-[opacity,transform] duration-150 ease-out"
      style={{
        left: pos.left,
        ...(pos.openUp ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : `translateY(${pos.openUp ? "4px" : "-4px"})`,
      }}
    >
      <div className="text-body-sm font-medium leading-snug text-text-primary">{data.title}</div>

      <div className="mt-2 flex items-center gap-3 border-t border-border-subtle pt-2">
        {onStoryPointsChange ? (
          <StoryPointPicker value={data.storyPoints} onChange={onStoryPointsChange} size="lg" align="left" showMetricIcon richTooltip onOpenChange={onPickerOpenChange} />
        ) : (
          <MetricBadge metric="sp" value={data.storyPoints} tinted tooltip />
        )}
        {onBusinessValueChange ? (
          <BusinessValuePicker value={data.businessValue} onChange={onBusinessValueChange} size="lg" align="left" showMetricIcon richTooltip onOpenChange={onPickerOpenChange} />
        ) : (
          <MetricBadge metric="bv" value={data.businessValue} tinted tooltip />
        )}
      </div>

      <div className="mt-2 flex flex-col gap-0.5">
        <InfoRow icon={<IterationCw size={12} strokeWidth={1.75} />} label="Sprint">
          {onSprintChange && sprints ? (
            <SprintPicker value={data.sprintId} sprints={sprints} onChange={onSprintChange} align="right" onOpenChange={onPickerOpenChange} />
          ) : (
            data.sprintName ?? <span className="text-text-muted">No sprint</span>
          )}
        </InfoRow>

        <InfoRow icon={<Zap size={12} strokeWidth={1.75} />} label="Epic">
          {onEpicChange ? (
            <EpicPicker
              value={data.epicKey && data.epic ? { key: data.epicKey, name: data.epic } : null}
              onChange={onEpicChange}
              ticketKey={ticketKey}
              align="right"
              onOpenChange={onPickerOpenChange}
            />
          ) : data.epic && epicColors ? (
            <span
              className="rounded-[3px] border-l-2 px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide"
              style={{ backgroundColor: epicColors.bg, color: epicColors.text, borderLeftColor: epicColors.text }}
            >
              {data.epic}
            </span>
          ) : (
            <span className="text-text-muted">No epic</span>
          )}
        </InfoRow>

        <InfoRow icon={<User size={12} strokeWidth={1.75} />} label="Assignee">
          {onAssigneeChange ? (
            <AssigneePicker value={data.assignee} onChange={onAssigneeChange} align="right" onOpenChange={onPickerOpenChange} />
          ) : (
            <PersonValue person={data.assignee} />
          )}
        </InfoRow>

        <InfoRow icon={<UserRound size={12} strokeWidth={1.75} />} label="Creator">
          <PersonValue person={data.reporter} />
        </InfoRow>

        <InfoRow icon={<ListChecks size={12} strokeWidth={1.75} />} label="Subtasks">
          {data.totalSubtaskCount > 0 ? (
            <Tooltip content={`${data.openSubtaskCount} open of ${data.totalSubtaskCount} subtask${data.totalSubtaskCount === 1 ? "" : "s"}`}>
              <span className="tabular-nums">{data.openSubtaskCount}/{data.totalSubtaskCount}</span>
            </Tooltip>
          ) : (
            <span className="text-text-muted">None</span>
          )}
        </InfoRow>
      </div>

      {data.flagged && (
        <div className="mt-2 flex items-center gap-1.5 border-t border-border-subtle pt-2">
          <Flag size={11} strokeWidth={0} fill="currentColor" style={{ color: "var(--color-status-error)" }} />
          <span className="text-label font-medium" style={{ color: "var(--color-status-error)" }}>Flagged</span>
        </div>
      )}
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
  /** Hide the ticket key segment (default: true) */
  showKey?: boolean;
  /** Hide the jira status segment (default: true) */
  showStatus?: boolean;
  /** Show the readiness segment (default: true). Set false for read-only reference pills. */
  showReadiness?: boolean;
  /** When true, the pill sits on header chrome and uses a translucent, theme-aware
   *  surface (white 75% in light, a faint lift in dark) instead of the solid one. */
  onHeader?: boolean;
  /** Details shown in the hover card. When omitted, no hover card is rendered. */
  hoverData?: TicketPillHoverData;
  /** Enable the hover card (default: true). Combined with hoverData being present. */
  showHoverCard?: boolean;
  /** When provided, Story Points become editable inside the hover card. */
  onStoryPointsChange?: (value: number | null) => void;
  /** When provided, Business Value becomes editable inside the hover card. */
  onBusinessValueChange?: (value: number | null) => void;
  /** When provided (with `sprints`), Sprint becomes editable inside the hover card. */
  onSprintChange?: (sprintId: string | null) => void;
  /** Available sprints, required for the Sprint editor in the hover card. */
  sprints?: Sprint[];
  /** When provided, Epic becomes editable inside the hover card. */
  onEpicChange?: (epic: EpicOption | null) => void;
  /** When provided, Assignee becomes editable inside the hover card. */
  onAssigneeChange?: (user: AssignableUser | null) => void;
  /** Fade the leading issue-type icon while the enclosing `group/row` is hovered, so a row-level
   *  checkbox can take its place (list variant only). */
  dimTypeOnRowHover?: boolean;
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
  showKey = true,
  showStatus = true,
  showReadiness = true,
  onHeader = false,
  hoverData,
  showHoverCard = true,
  onStoryPointsChange,
  onBusinessValueChange,
  onSprintChange,
  sprints,
  onEpicChange,
  onAssigneeChange,
  dimTypeOnRowHover,
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

  // Hover card: opens after a short delay on hover and stays open while the
  // pointer is over the pill OR the card (with a grace period when travelling
  // between them), or while an inline picker inside the card is open.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hoverCardVisible, setHoverCardVisible] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardPickerOpenRef = useRef(false);

  const hoverCardEnabled = showHoverCard && hoverData != null;
  const anyDropdownOpen = issueTypeDropdownOpen || keyDropdownOpen || jiraDropdownOpen || readinessDropdownOpen;

  const clearOpenTimer = () => {
    if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null; }
  };
  const clearCloseTimer = () => {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
  };

  // Grace period before closing, so the pointer can travel from pill to card.
  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      if (!cardPickerOpenRef.current) setHoverCardVisible(false);
    }, 250);
  };

  const handleHoverEnter = () => {
    if (!hoverCardEnabled || anyDropdownOpen) return;
    clearCloseTimer();
    if (hoverCardVisible) return;
    clearOpenTimer();
    openTimerRef.current = setTimeout(() => setHoverCardVisible(true), 400);
  };

  const handleHoverLeave = () => {
    clearOpenTimer();
    scheduleClose();
  };

  const handleCardPickerOpenChange = (open: boolean) => {
    cardPickerOpenRef.current = open;
    if (open) clearCloseTimer();
    else scheduleClose();
  };

  useEffect(() => () => { clearOpenTimer(); clearCloseTimer(); }, []);

  const hoverProps = hoverCardEnabled
    ? { onMouseEnter: handleHoverEnter, onMouseLeave: handleHoverLeave, onFocus: handleHoverEnter, onBlur: handleHoverLeave }
    : {};

  // Hidden while any click dropdown is open so the two never overlap.
  const hoverCardEl = hoverCardVisible && !anyDropdownOpen && hoverData
    ? <TicketHoverCard
        ticketKey={ticketKey}
        triggerRef={wrapperRef}
        data={hoverData}
        onMouseEnter={clearCloseTimer}
        onMouseLeave={scheduleClose}
        onStoryPointsChange={onStoryPointsChange}
        onBusinessValueChange={onBusinessValueChange}
        onSprintChange={onSprintChange}
        sprints={sprints}
        onEpicChange={onEpicChange}
        onAssigneeChange={onAssigneeChange}
        onPickerOpenChange={handleCardPickerOpenChange}
      />
    : null;

  const jiraUrl = getJiraUrl(ticketKey);

  // Two renderings: "list" is the dense, container-less row style; everything
  // else is the elevated chip (a soft card wrapping the same floating segments).
  const elevated = variant !== "list";
  const jiraColors = JIRA_STATUS_COLORS[jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];
  const readinessCfg = readiness ? READINESS_CONFIG[readiness] : null;

  const iconSize = size === "sm" ? 10 : size === "lg" ? 14 : 12;
  // The issue-type glyph reads too small next to the key in the compact elevated
  // pill, so nudge it up there (other contexts keep the standard size).
  const typeIconSize = elevated && size === "sm" ? 13 : iconSize;
  const textSize = size === "sm" ? "text-[10px]" : size === "lg" ? "text-body-sm" : "text-label";

  // ---------------------------------------------------------------------------
  // List variant — no outer container, segments float inline with gaps
  // ---------------------------------------------------------------------------
  // Shared labels: used both as the visual tooltip and the button's accessible
  // name, since these icon-only segments have no visible text.
  const issueTypeTip = onIssueTypeChange ? "Change issue type" : (TYPE_LABELS[issueType as IssueType] ?? issueType ?? "");
  const statusTip = onJiraStatusChange ? "Change status" : jiraStatus;
  const readinessTip = readiness ? READINESS_CONFIG[readiness].label : "Ready for Development";
  return (
    <div
      ref={wrapperRef}
      {...hoverProps}
      className={
        elevated
          ? `inline-flex shrink-0 items-center gap-1.5 rounded-md align-middle ring-1 ring-inset ring-border-subtle ${
              onHeader ? "" : "bg-surface-elevated"
            } ${
              size === "lg"
                ? "px-2.5 py-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.16)]"
                : "px-1.5 py-[3px] shadow-[0_1px_2px_rgba(0,0,0,0.14)]"
            }`
          : "flex shrink-0 items-center gap-1.5"
      }
      // On the header chrome the elevated pill uses a translucent, theme-aware
      // surface (white 75% in light, a faint white lift in dark) so it reads as
      // a soft chip on the header glass without glaring in dark mode.
      style={elevated && onHeader ? { backgroundColor: "var(--color-pill-header-surface)" } : undefined}
    >
      {hoverCardEl}

      {/* Issue type */}
      {issueType && (
        <div className={`relative flex shrink-0 ${dimTypeOnRowHover ? "transition-opacity duration-150 group-hover/row:opacity-0" : ""}`}>
          <Tooltip content={issueTypeTip}>
            <button
              ref={issueTypeBtnRef}
              type="button"
              aria-label={issueTypeTip}
              onClick={onIssueTypeChange ? () => setIssueTypeDropdownOpen((o) => !o) : undefined}
              disabled={!onIssueTypeChange}
              className={`flex items-center justify-center rounded p-1 transition-colors duration-150 ${
                onIssueTypeChange ? "cursor-pointer hover:bg-overlay-default" : "cursor-default"
              }`}
            >
              <IssueTypeIcon type={issueType} size={typeIconSize} />
            </button>
          </Tooltip>
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
      {showKey && (
        <div className={`relative flex shrink-0 ${!elevated && issueType ? "-ml-1" : ""}`}>
          <a
            ref={keyLinkRef}
            href={`/tickets/${ticketKey}`}
            onClick={(e) => {
              if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                setKeyDropdownOpen((o) => !o);
              }
            }}
            className={`font-mono ${textSize} font-medium transition-colors duration-150 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${elevated ? "text-text-primary" : "text-text-secondary"}`}
            style={{ minWidth: elevated ? undefined : "9ch" }}
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
      )}

      {/* Jira status badge */}
      {!showStatus ? null : removedFromJira ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold bg-red-500/10 text-red-400/70">
          <span className="shrink-0 h-1.5 w-1.5 rounded-full opacity-70 bg-red-400/70" />
          DELETED
        </span>
      ) : (
        <div className="relative flex shrink-0">
          <Tooltip content={statusTip}>
            <button
              ref={jiraStatusBtnRef}
              type="button"
              aria-label={statusTip}
              onClick={onJiraStatusChange ? () => setJiraDropdownOpen((o) => !o) : undefined}
              disabled={!onJiraStatusChange}
              className={`flex items-center gap-1 px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide transition-colors duration-150 ${
                elevated ? "rounded-full" : "rounded"
              } ${onJiraStatusChange ? "cursor-pointer hover:brightness-110" : "cursor-default"}`}
              style={{ backgroundColor: jiraColors.bg, color: jiraColors.text, opacity: elevated ? 1 : 0.85 }}
            >
              <span className="shrink-0 h-1.5 w-1.5 rounded-full opacity-70" style={{ backgroundColor: jiraColors.text }} />
              {JIRA_STATUS_ABBREVIATIONS[jiraStatus] ?? jiraStatus}
            </button>
          </Tooltip>
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
        <div className={`relative flex shrink-0 ${elevated ? "" : "-ml-1"}`}>
          <Tooltip content={readinessTip}>
            <button
              ref={readinessBtnRef}
              type="button"
              aria-label={readinessTip}
              onClick={onReadinessChange ? () => setReadinessDropdownOpen((o) => !o) : undefined}
              disabled={!onReadinessChange}
              className={`flex items-center justify-center rounded transition-colors duration-150 ${
                onReadinessChange ? "cursor-pointer hover:bg-overlay-default" : "cursor-default"
              }`}
              style={{ color: readinessCfg?.color ?? "var(--color-text-muted)", width: iconSize + 8, height: iconSize + 8 }}
            >
              {readiness ? (
                <ReadinessIcon value={readiness} size={iconSize} />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-overlay-strong" />
              )}
            </button>
          </Tooltip>
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
