"use client";

import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { createPortal } from "react-dom";
import { ExternalLink, FilePen, MessageCircleQuestion, CheckCircle2, Ban, Minus, Copy, ClipboardList, PenLine, Flag, IterationCw, Zap, User, UserRound, ListChecks, Eye, GitBranch, Rocket, Star, Gem, MessageSquare, Gauge, Sparkles, RefreshCw } from "lucide-react";
import type { JiraStatus, TicketReadiness, IssueType, Assignee, Sprint } from "@/types/ticket";
import type { PipelineHealthEntry, LastDeployedInfo } from "@/hooks/usePipelines";
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
import { Tooltip } from "@/components/shared/Tooltip";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { MetricBadge } from "@/components/shared/MetricBadge";
import { AssigneePicker, type AssignableUser } from "@/components/shared/AssigneePicker";
import { SprintPicker } from "@/components/shared/SprintPicker";
import { EpicPicker, type EpicOption } from "@/components/shared/EpicPicker";
import { EpicBadge } from "@/components/shared/IssueMetaBadges";
import { Avatar } from "@/components/shared/Avatar";
import { useHoverCardEdits } from "@/hooks/useHoverCardEdits";

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

// Quality Score color ramp, mirroring QualityBadge so the card reads consistently (BRDG-239).
function qualityColor(score: number): string {
  if (score < 60) return "var(--color-status-error)";
  if (score < 75) return "var(--color-status-warning)";
  if (score < 90) return "var(--color-status-caution)";
  return "var(--color-status-success)";
}

// Local edit-state display config. Kept here (not imported from sprint-board cells) so the shared
// pill stays decoupled from the board module (BRDG-239).
const EDIT_STATE_CONFIG: Record<"draft" | "local_edits" | "conflict", { dotClass: string; accent: string; label: string }> = {
  draft: { dotClass: "bg-[var(--color-icon-task)]/40", accent: "var(--color-icon-task)", label: "Unsaved draft" },
  local_edits: { dotClass: "bg-[var(--color-icon-task)]/70", accent: "var(--color-icon-task)", label: "Local changes" },
  conflict: { dotClass: "bg-[var(--color-status-warning)]/70", accent: "var(--color-status-warning)", label: "Conflict" },
};

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
            <IssueTypeIcon type={type} size={15} strokeWidth={2.0} />
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
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number; openUp: boolean } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 200;
    // Anchor by the trigger's left edge normally (dropdown grows rightward), but
    // when the trigger sits in the right half of the viewport, anchor by its
    // right edge so the dropdown grows leftward and stays on screen (e.g. the
    // right-aligned status pill in the ticket sidebar).
    const anchorRight = rect.left > window.innerWidth / 2;
    setPos({
      top: openUp ? rect.top : rect.bottom + 4,
      openUp,
      ...(anchorRight ? { right: window.innerWidth - rect.right } : { left: rect.left }),
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
        ...(pos.left != null ? { left: pos.left } : { right: pos.right }),
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
  /** Pipeline health summary (re-homed from the inline pipeline column, BRDG-251). */
  pipelineHealth?: PipelineHealthEntry | null;
  /** Last deployment info (re-homed from the inline pipeline column, BRDG-251). */
  lastDeploy?: LastDeployedInfo | null;
  /** PO readiness state. The card always shows this even when the inline pill segment is hidden (BRDG-239). */
  readiness?: TicketReadiness | null;
  /** Quality Score (0-100), re-homed alongside the row tags so the card is the full signal set (BRDG-239). */
  qualityScore?: number | null;
  /** Free-text PO notes (BRDG-239). */
  notes?: string | null;
  /** Whether the PO follows this ticket. The follow star now lives only in the card (BRDG-239). */
  followed?: boolean;
  /** Local edit state (draft/local_edits/conflict), surfaced in the card (BRDG-239). */
  editState?: "draft" | "local_edits" | "conflict" | null;
  /** Names of active refinement sessions containing this ticket (BRDG-239). */
  refinementNames?: string[];
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
  /** When provided, the follow star in the card becomes an interactive toggle. */
  onToggleFollow?: () => void;
  /** When provided, the Quality row offers a "Run Review" action for unscored tickets. */
  onRunReview?: () => void | Promise<void>;
  /** Notifies the parent when an inline picker opens/closes (to keep the card open). */
  onPickerOpenChange: (open: boolean) => void;
  /** Editing is on by default (BRDG-276). Any field without an explicit handler above
   *  falls back to a self-contained default editor; set false for a read-only card. */
  editable?: boolean;
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
  onToggleFollow,
  onRunReview,
  onPickerOpenChange,
  editable = true,
}: TicketHoverCardProps) {
  // Default, self-contained editors. Used for any field the parent did not wire
  // explicitly, so the card is editable everywhere by default (BRDG-276). The
  // hook only runs here, and the card mounts one-at-a-time on hover, so its SWR
  // subscriptions cost nothing per row.
  const edits = useHoverCardEdits(ticketKey);
  const fallback = <T,>(explicit: T | undefined, def: T): T | undefined =>
    explicit ?? (editable ? def : undefined);

  const spChange = fallback(onStoryPointsChange, edits.onStoryPointsChange);
  const bvChange = fallback(onBusinessValueChange, edits.onBusinessValueChange);
  const sprintChange = fallback(onSprintChange, edits.onSprintChange);
  const sprintsForPicker = sprints ?? (editable ? edits.sprints : undefined);
  const epicChange = fallback(onEpicChange, edits.onEpicChange);
  const assigneeChange = fallback(onAssigneeChange, edits.onAssigneeChange);
  const toggleFollow = fallback(onToggleFollow, edits.onToggleFollow);
  const runReview = fallback(onRunReview, edits.onRunReview);
  // Explicit `followed` wins; otherwise the default follow state drives the star.
  const followed = data.followed !== undefined ? data.followed : (editable ? edits.isFollowed : undefined);

  const [reviewing, setReviewing] = useState(false);
  const reviewMountedRef = useRef(true);
  useEffect(() => () => { reviewMountedRef.current = false; }, []);
  const handleRunReview = async () => {
    if (!runReview || reviewing) return;
    setReviewing(true);
    try {
      await runReview();
    } finally {
      if (reviewMountedRef.current) setReviewing(false);
    }
  };
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const [shown, setShown] = useState(false);

  useLayoutEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 260;
    // Anchor to the trigger's left edge, but clamp so the fixed-width card never
    // spills past either viewport edge (it would otherwise run off-screen for
    // pills in the right half of the page).
    const CARD_WIDTH = 400;
    const MARGIN = 8;
    const maxLeft = window.innerWidth - CARD_WIDTH - MARGIN;
    const left = Math.max(MARGIN, Math.min(rect.left, maxLeft));
    setPos({ left, top: openUp ? rect.top - 6 : rect.bottom + 6, openUp });
  }, [triggerRef]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="tooltip"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-[9999] w-[400px] rounded-lg border border-border-default bg-[var(--color-surface-floating)] p-3 text-left normal-case tracking-normal shadow-[var(--shadow-popover)] transition-[opacity,transform] duration-150 ease-out"
      style={{
        left: pos.left,
        ...(pos.openUp ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : `translateY(${pos.openUp ? "4px" : "-4px"})`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-body-lg font-medium leading-snug text-text-primary">{data.title}</div>
        {followed !== undefined && (
          <Tooltip content={followed ? "Following. Click to unfollow." : "Follow for PR, pipeline, and deployment notifications."}>
            <button
              type="button"
              aria-label={followed ? "Unfollow ticket" : "Follow ticket"}
              aria-pressed={followed}
              onClick={toggleFollow}
              disabled={!toggleFollow}
              className={`-mr-0.5 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors duration-150 ${
                toggleFollow ? "cursor-pointer hover:bg-overlay-default" : "cursor-default"
              }`}
            >
              <Star
                size={14}
                strokeWidth={1.5}
                className={followed ? "text-amber-400 fill-amber-400" : "text-text-muted"}
              />
            </button>
          </Tooltip>
        )}
      </div>

      <div className="mt-2 flex items-center gap-3 border-t border-border-subtle pt-2">
        {spChange ? (
          <StoryPointPicker value={data.storyPoints} onChange={spChange} size="lg" align="left" showMetricIcon richTooltip onOpenChange={onPickerOpenChange} />
        ) : (
          <MetricBadge metric="sp" value={data.storyPoints} tinted tooltip />
        )}
        {bvChange ? (
          <BusinessValuePicker value={data.businessValue} onChange={bvChange} size="lg" align="left" showMetricIcon richTooltip onOpenChange={onPickerOpenChange} />
        ) : (
          <MetricBadge metric="bv" value={data.businessValue} tinted tooltip />
        )}

        {/* Pipeline health + last deploy as compact badges (BRDG-251), matching
            the SP/BV pill geometry so the row reads as one set of signals. */}
        {data.pipelineHealth && data.pipelineHealth.status !== "gray" && (
          <Tooltip
            content={`Pipeline: ${data.pipelineHealth.recentFails} failure${data.pipelineHealth.recentFails === 1 ? "" : "s"} in last ${data.pipelineHealth.recentTotal} runs`}
          >
            <span
              aria-label="Pipeline health"
              className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-body-sm font-medium tabular-nums ${
                data.pipelineHealth.status === "green"
                  ? "bg-emerald-500/10 text-emerald-500"
                  : data.pipelineHealth.status === "red"
                  ? "bg-red-500/10 text-red-500"
                  : "bg-amber-500/10 text-amber-500"
              }`}
            >
              <GitBranch size={13} strokeWidth={2} aria-hidden />
              {data.pipelineHealth.recentFails > 0
                ? `${data.pipelineHealth.recentFails}/${data.pipelineHealth.recentTotal}`
                : data.pipelineHealth.recentTotal}
            </span>
          </Tooltip>
        )}

        {data.lastDeploy && (
          <Tooltip
            content={`Deploy: ${data.lastDeploy.environment ?? "unknown"} — ${data.lastDeploy.state}${data.lastDeploy.completedAt ? ` (${new Date(data.lastDeploy.completedAt).toLocaleString("en-GB")})` : ""}`}
          >
            <span
              aria-label="Last deploy"
              className={`inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-body-sm font-medium uppercase tracking-wide ${
                data.lastDeploy.state === "SUCCESSFUL"
                  ? "bg-emerald-500/10 text-emerald-500"
                  : data.lastDeploy.state === "FAILED"
                  ? "bg-red-500/10 text-red-500"
                  : "bg-overlay-subtle text-text-secondary"
              }`}
            >
              <Rocket size={13} strokeWidth={2} aria-hidden />
              {data.lastDeploy.environment ?? "unknown"}
            </span>
          </Tooltip>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-0.5">
        <InfoRow icon={<IterationCw size={12} strokeWidth={1.75} />} label="Sprint">
          {sprintChange && sprintsForPicker ? (
            <SprintPicker value={data.sprintId} sprints={sprintsForPicker} onChange={sprintChange} align="right" textClass="text-body-sm" onOpenChange={onPickerOpenChange} />
          ) : (
            data.sprintName ?? <span className="text-text-muted">No sprint</span>
          )}
        </InfoRow>

        <InfoRow icon={<Zap size={12} strokeWidth={1.75} />} label="Epic">
          {epicChange ? (
            <EpicPicker
              value={data.epicKey && data.epic ? { key: data.epicKey, name: data.epic } : null}
              onChange={epicChange}
              ticketKey={ticketKey}
              align="right"
              textClass="text-body-sm"
              onOpenChange={onPickerOpenChange}
            />
          ) : data.epic ? (
            <EpicBadge epic={data.epic} />
          ) : (
            <span className="text-text-muted">No epic</span>
          )}
        </InfoRow>

        <InfoRow icon={<User size={12} strokeWidth={1.75} />} label="Assignee">
          {assigneeChange ? (
            <AssigneePicker value={data.assignee} onChange={assigneeChange} align="right" textClass="text-body-sm" onOpenChange={onPickerOpenChange} />
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

        {/* Readiness, Quality and Notes are re-homed here so the card is always the full signal set,
            even when their inline row tags are hidden (BRDG-239). */}
        <InfoRow icon={<CheckCircle2 size={12} strokeWidth={1.75} />} label="Readiness">
          {data.readiness ? (
            <span className="flex items-center gap-1.5" style={{ color: READINESS_CONFIG[data.readiness].color }}>
              <ReadinessIcon value={data.readiness} size={12} />
              {READINESS_CONFIG[data.readiness].label}
            </span>
          ) : (
            <span className="text-text-muted">Ready for development</span>
          )}
        </InfoRow>

        <InfoRow icon={<Gauge size={12} strokeWidth={1.75} />} label="Quality">
          {data.qualityScore != null ? (
            <span className="flex items-center gap-1.5 tabular-nums" style={{ color: qualityColor(data.qualityScore) }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: qualityColor(data.qualityScore) }} />
              {data.qualityScore}/100
            </span>
          ) : runReview ? (
            <button
              type="button"
              onClick={handleRunReview}
              disabled={reviewing}
              className="flex items-center gap-1.5 rounded-md border border-border-default px-2 py-1 text-label font-medium text-text-secondary transition-colors duration-150 hover:bg-overlay-default hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reviewing ? (
                <>
                  <RefreshCw size={11} strokeWidth={1.5} className="animate-spin" />
                  Reviewing…
                </>
              ) : (
                <>
                  <Sparkles size={11} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
                  Run Review
                </>
              )}
            </button>
          ) : (
            <span className="text-text-muted">Not scored</span>
          )}
        </InfoRow>

        {data.notes != null && data.notes.trim() !== "" && (
          <InfoRow icon={<MessageSquare size={12} strokeWidth={1.75} />} label="Notes">
            <span className="truncate" title={data.notes}>{data.notes}</span>
          </InfoRow>
        )}
      </div>

      {(data.flagged || data.editState || (data.refinementNames && data.refinementNames.length > 0)) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border-subtle pt-2">
          {data.flagged && (
            <span className="flex items-center gap-1.5">
              <Flag size={11} strokeWidth={0} fill="currentColor" style={{ color: "var(--color-status-error)" }} />
              <span className="text-label font-medium" style={{ color: "var(--color-status-error)" }}>Flagged</span>
            </span>
          )}
          {data.editState && (
            <span className="flex items-center gap-1.5" style={{ color: EDIT_STATE_CONFIG[data.editState].accent }}>
              <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${EDIT_STATE_CONFIG[data.editState].dotClass}`} />
              <span className="text-label font-medium">{EDIT_STATE_CONFIG[data.editState].label}</span>
            </span>
          )}
          {data.refinementNames && data.refinementNames.length > 0 && (
            <Tooltip content={`In refinement: ${data.refinementNames.join(", ")}`}>
              <span className="flex items-center gap-1.5 text-[var(--color-brand-300)]">
                <Gem size={11} strokeWidth={1.5} />
                <span className="text-label font-medium">In refinement</span>
              </span>
            </Tooltip>
          )}
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
  /** When provided, the follow star in the hover card becomes an interactive toggle. */
  onToggleFollow?: () => void;
  /** When provided, the hover card's Quality row offers a "Run Review" action when unscored. */
  onRunReview?: () => void | Promise<void>;
  /** Hover card editing is on by default (BRDG-276). Set false for a read-only card.
   *  Always forced off for `removedFromJira` tickets. */
  hoverCardEditable?: boolean;
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
  onToggleFollow,
  onRunReview,
  hoverCardEditable = true,
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
        onToggleFollow={onToggleFollow}
        onRunReview={onRunReview}
        onPickerOpenChange={handleCardPickerOpenChange}
        editable={hoverCardEditable && !removedFromJira}
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
  // pill, so nudge it up there. In the dense list row it is the primary type cue,
  // so give it extra size. A bolder stroke keeps it prominent in both variants.
  const typeIconSize = elevated ? (size === "sm" ? 13 : iconSize) + 4 : iconSize + 3;
  const typeStrokeWidth = 2.0;
  const textSize = size === "sm" ? "text-[10px]" : size === "lg" ? "text-body-sm" : "text-label";

  // The Jira status badge stays compact at sm/md (dense table rows); at lg it
  // grows to match a sibling control like the Epic pill (px-2 py-0.5 text-label)
  // so they line up at the same height in the ticket sidebar.
  const statusBadgePad = size === "lg" ? "px-2 py-0.5 text-label" : "px-1.5 py-0.5 text-[10px]";
  const statusDotSize = size === "lg" ? "h-2 w-2" : "h-1.5 w-1.5";
  const statusRounded = elevated ? "rounded-full" : size === "lg" ? "rounded-md" : "rounded";

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
        <div className="relative flex shrink-0">
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
              <IssueTypeIcon type={issueType} size={typeIconSize} strokeWidth={typeStrokeWidth} />
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
          <button
            ref={jiraStatusBtnRef}
            type="button"
            aria-label={statusTip}
            onClick={onJiraStatusChange ? () => setJiraDropdownOpen((o) => !o) : undefined}
            disabled={!onJiraStatusChange}
            className={`flex items-center gap-1 ${statusBadgePad} font-mono font-medium tracking-wide transition-colors duration-150 ${statusRounded} ${onJiraStatusChange ? "cursor-pointer hover:brightness-110" : "cursor-default"}`}
            style={{ backgroundColor: jiraColors.bg, color: jiraColors.text, opacity: elevated ? 1 : 0.85 }}
          >
            <span className={`shrink-0 ${statusDotSize} rounded-full opacity-70`} style={{ backgroundColor: jiraColors.text }} />
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
        <div className={`relative flex shrink-0 ${elevated ? "" : "-ml-1"}`}>
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
