"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import type { Ticket, TicketReadiness, TicketDetail } from "@/types/ticket";
import { READINESS_CONFIG } from "@/types/ticket";
import Link from "next/link";
import { ChevronRight, ChevronDown, AlertTriangle, Play, Gem } from "lucide-react";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { JIRA_STATUS_COLORS } from "@/components/shared/StatusBadge";
import { tickets, jira } from "@/lib/api-client";
import { Avatar } from "@/components/shared/Avatar";
import { QualityBadge } from "@/components/sprint-board/TicketTable";
import { ReadinessCell } from "@/components/shared/ReadinessCell";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { SprintListModal } from "@/components/sprint-board/SprintListModal";
import { AssigneePicker } from "@/components/shared/AssigneePicker";
import { EpicPicker } from "@/components/shared/EpicPicker";
import type { EpicOption } from "@/components/shared/EpicPicker";
import { Tooltip } from "@/components/shared/Tooltip";
import { useJiraSprints, useSprintSlots, useDevInfo } from "@/hooks/useSprintBoard";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Tag } from "@/components/shared/Tag";
import { LabelPicker } from "@/components/shared/LabelPicker";
import { DevPanel } from "@/components/ticket-detail/DevPanel";
import { ConfluencePagesSection } from "@/components/ticket-detail/ConfluencePagesSection";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";
import { useTicketSessionMap } from "@/hooks/useTicketSessionMap";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[32px] items-center justify-between gap-3">
      <span className="shrink-0 text-body-sm text-text-tertiary">{label}</span>
      <div className="min-w-0 text-right text-body-sm text-text-secondary">{children}</div>
    </div>
  );
}

function CompactField({ label, children, accent }: { label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className="rounded-lg border border-border-subtle px-3 py-2"
      style={{
        backgroundColor: accent ? "color-mix(in srgb, var(--color-brand-500) 4%, var(--color-surface-elevated))" : "var(--color-overlay-subtle)",
        transition: "background-color 0.15s ease",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-text-muted">{label}</span>
        <div className="text-body-lg text-text-secondary">{children}</div>
      </div>
    </div>
  );
}

const DEFAULT_SIDEBAR_WIDTH = 420;
const MIN_SIDEBAR_WIDTH = 280;
const SIDEBAR_WIDTH_KEY = "ticket-sidebar-width";
export const SIDEBAR_COLLAPSED_KEY = "ticket-sidebar-collapsed";

const COMPLETENESS_LABELS: Record<string, string> = {
  Description: "Desc",
  AC: "AC",
  Points: "Pts",
  BV: "BV",
  Review: "Rev",
};

export function TicketSidebar({
  ticket,
  detail,
  reviewData,
  collapsed,
  onCollapsedChange,
  onNavigateToReview,
  onNavigateToDev,
  onReadinessChange,
}: {
  ticket: Ticket;
  detail: TicketDetail | undefined;
  reviewData?: { reviews: { storyVersionHash?: string | null; overallScore: number }[]; currentVersionHash: string | null } | undefined;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onNavigateToReview?: () => void;
  onNavigateToDev?: () => void;
  onReadinessChange?: (v: TicketReadiness | null) => void;
}) {
  const readiness = ticket.readiness;
  const [businessValue, setBusinessValue] = useState<number | null>(ticket.businessValue);
  const [storyPoints, setStoryPoints] = useState<number | null>(ticket.storyPoints);
  const [poNotes, setPoNotes] = useState(ticket.notes);
  const [assignee, setAssignee] = useState(ticket.assignee);
  const [epicName, setEpicName] = useState<string | null>(ticket.epic);
  const [epicKey, setEpicKey] = useState<string | null>(ticket.epicKey);
  const [currentSprintId, setCurrentSprintId] = useState<string | null>(ticket.sprintId ?? null);
  const [labels, setLabels] = useState<string[]>(() => {
    if (!detail?.labels) return [];
    return detail.labels;
  });
  const [showMore, setShowMore] = useState(ticket.qualityScore !== null);
  const [poNoteExpanded, setPoNoteExpanded] = useState(false);
  const poNoteRef = useRef<HTMLTextAreaElement>(null);

  // Resize state
  const [sidebarWidth, setSidebarWidth] = useLocalStorage(SIDEBAR_WIDTH_KEY, DEFAULT_SIDEBAR_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const { sprints } = useJiraSprints();
  const { data: sprintSlots } = useSprintSlots();
  const [sprintModalOpen, setSprintModalOpen] = useState(false);
  const sprintTriggerRef = useRef<HTMLButtonElement>(null);
  const [sprintModalPos, setSprintModalPos] = useState<{ top: number; right: number } | null>(null);

  const pinnedSprintIds = useMemo(() => {
    if (!sprintSlots) return new Set<string>();
    return new Set(sprintSlots.map((s) => s.sprintId));
  }, [sprintSlots]);

  const { ticketSessionMap } = useTicketSessionMap();
  const ticketSessions = ticketSessionMap.get(ticket.key);

  const { data: devInfo, isLoading: devInfoLoading } = useDevInfo(ticket.key);
  const latestReview = reviewData?.reviews?.[0] ?? null;
  const currentVersionHash = reviewData?.currentVersionHash ?? null;
  const isReviewOutdated = latestReview && currentVersionHash
    ? latestReview.storyVersionHash !== currentVersionHash
    : false;

  const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(typeof window !== "undefined" ? window.innerWidth * 0.5 : 800, sidebarWidth));

  // Resize drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleResizeDoubleClick = useCallback(() => {
    onCollapsedChange(!collapsed);
  }, [onCollapsedChange, collapsed]);

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(e: MouseEvent) {
      if (!sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const maxWidth = window.innerWidth * 0.5;
      const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxWidth, rect.right - e.clientX));
      setSidebarWidth(newWidth);
    }

    function handleMouseUp() {
      setIsDragging(false);
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, setSidebarWidth]);

  // Keyboard shortcut: [ to toggle sidebar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "[") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.getAttribute("contenteditable")) return;
      e.preventDefault();
      onCollapsedChange(!collapsed);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCollapsedChange, collapsed]);

  const handleReadinessChange = useCallback((v: TicketReadiness | null) => {
    onReadinessChange?.(v);
  }, [onReadinessChange]);

  const handleBusinessValueChange = useCallback(async (v: number | null) => {
    setBusinessValue(v);
    try {
      await tickets.updateMetadata(ticket.key, { businessValue: v });
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticket.key]);

  const handleStoryPointsChange = useCallback(async (v: number | null) => {
    const prev = storyPoints;
    setStoryPoints(v);
    try {
      await tickets.updateStoryPoints(ticket.key, v);
    } catch (err) {
      console.error("Operation failed:", err);
      setStoryPoints(prev);
    }
  }, [ticket.key, storyPoints]);

  const handleSprintChange = useCallback(async (sprintId: string | null) => {
    if (!sprintId) return;
    const prev = currentSprintId;
    setCurrentSprintId(sprintId);
    try {
      await jira.moveSprint({ issueKeys: [ticket.key], targetSprintId: sprintId });
    } catch (err) {
      console.error("Operation failed:", err);
      setCurrentSprintId(prev);
    }
  }, [ticket.key, currentSprintId]);

  const handleSprintModalSelect = useCallback((sprintId: string) => {
    handleSprintChange(sprintId);
  }, [handleSprintChange]);

  const handleOpenSprintModal = useCallback(() => {
    if (sprintTriggerRef.current) {
      const rect = sprintTriggerRef.current.getBoundingClientRect();
      setSprintModalPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setSprintModalOpen(true);
  }, []);

  const handleAssigneeChange = useCallback(async (user: { accountId: string; displayName: string; avatarUrl: string | null } | null) => {
    const prev = assignee;
    if (user) {
      const name = user.displayName;
      const parts = name.trim().split(/\s+/);
      const initials = parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      let hash = 0;
      for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
      const hue = ((hash % 360) + 360) % 360;
      setAssignee({ name, initials, color: `hsl(${hue}, 55%, 50%)` });
    } else {
      setAssignee(null);
    }
    try {
      await jira.assign({
        issueKey: ticket.key,
        accountId: user?.accountId ?? null,
        name: user?.displayName ?? null,
      });
    } catch (err) {
      console.error("Operation failed:", err);
      setAssignee(prev);
    }
  }, [ticket.key, assignee]);

  const handleEpicChange = useCallback(async (epic: EpicOption | null) => {
    const prevName = epicName;
    const prevKey = epicKey;
    setEpicName(epic?.name ?? null);
    setEpicKey(epic?.key ?? null);
    try {
      await tickets.updateEpic(ticket.key, epic?.key ?? null);
    } catch (err) {
      console.error("Operation failed:", err);
      setEpicName(prevName);
      setEpicKey(prevKey);
    }
  }, [ticket.key, epicName, epicKey]);

  const handleLabelsChange = useCallback(async (newLabels: string[]) => {
    const prev = labels;
    setLabels(newLabels);
    try {
      await tickets.updateLabels(ticket.key, newLabels);
    } catch (err) {
      console.error("Operation failed:", err);
      setLabels(prev);
    }
  }, [ticket.key, labels]);

  const handleNotesChange = useCallback(async (notes: string) => {
    setPoNotes(notes);
    try {
      await tickets.updateMetadata(ticket.key, { poNotes: notes });
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticket.key]);

  const description = detail?.description ?? "";
  const hasDescription = description.trim().length > 20;
  const hasAcceptanceCriteria = /acceptance\s*criteria/i.test(description);
  const hasPoints = storyPoints !== null;
  const hasBV = businessValue !== null;
  const hasReview = ticket.qualityScore !== null;
  const completenessChecks = [
    { label: "Description", done: hasDescription },
    { label: "AC", done: hasAcceptanceCriteria },
    { label: "Points", done: hasPoints },
    { label: "BV", done: hasBV },
    { label: "Review", done: hasReview },
  ];
  const completenessCount = completenessChecks.filter((c) => c.done).length;

  const readinessCfg = readiness ? READINESS_CONFIG[readiness] : null;

  // Fully hidden when collapsed
  if (collapsed) {
    return null;
  }

  return (
    <div
      ref={sidebarRef}
      className="group/sidebar relative shrink-0"
      style={{
        width: clampedWidth,
        height: "100%",
        transition: isDragging ? "none" : "width 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      {/* Resize drag handle */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleResizeDoubleClick}
        className="absolute top-0 left-0 z-20 h-full w-1 cursor-col-resize hover:bg-[var(--color-brand-500)]/30 active:bg-[var(--color-brand-500)]/50"
        style={isDragging ? { backgroundColor: "var(--color-drag-active)" } : {}}
      />

      {/* Left edge line */}
      <div className="absolute top-0 left-0 h-full w-px bg-border-default" />

      {/* Collapse button on left edge */}
      <button
        type="button"
        onClick={() => onCollapsedChange(true)}
        className="absolute left-0 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border border-border-default bg-[var(--color-surface-elevated)] text-text-muted cursor-pointer opacity-0 group-hover/sidebar:opacity-100 hover:text-text-secondary hover:border-[var(--color-brand-500)]/40 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease" }}
        aria-label="Collapse sidebar"
        title="Collapse sidebar  [  "
      >
        <ChevronRight className="h-3 w-3" strokeWidth={2} />
      </button>

      {/* Sidebar content */}
      <div
        className="flex h-full flex-col overflow-y-auto bg-[var(--color-surface-elevated)] py-4 pr-5 pl-5"
        style={{
          opacity: isDragging ? 0.7 : 1,
          transition: isDragging ? "none" : "opacity 150ms ease",
        }}
      >

        {/* Details */}
        <div className="space-y-3">

          {/* SP / BV (above status) */}
          <div className="grid grid-cols-2 gap-2">
            <CompactField label="Story Points" accent={hasPoints}>
              <StoryPointPicker
                value={storyPoints}
                onChange={handleStoryPointsChange}
                showMetricIcon
                richTooltip
              />
            </CompactField>
            <CompactField label="Business Value" accent={hasBV}>
              <BusinessValuePicker value={businessValue} onChange={handleBusinessValueChange} align="right" showMetricIcon richTooltip />
            </CompactField>
          </div>

          {/* Status & Flow */}
          <div>
            <DetailRow label="Status">
              {(() => {
                const sc = JIRA_STATUS_COLORS[ticket.jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];
                return (
                  <span
                    className="inline-flex items-center rounded-md px-2 py-0.5 text-body-sm font-medium"
                    style={{ backgroundColor: sc.bg, color: sc.text }}
                  >
                    {ticket.jiraStatus}
                  </span>
                );
              })()}
            </DetailRow>
            {ticket.type !== "epic" && ticket.type !== "subtask" && (
              <DetailRow label="Epic">
                <EpicPicker
                  value={epicKey ? { key: epicKey, name: epicName ?? epicKey } : null}
                  onChange={handleEpicChange}
                  align="right"
                  ticketKey={ticket.key}
                  textClass="text-body-sm"
                />
              </DetailRow>
            )}
            {detail?.parent && (
              <div className="flex flex-col gap-1.5 py-1.5">
                <span className="text-body-sm text-text-tertiary">Parent</span>
                <Link
                  href={`/tickets/${detail.parent.key}`}
                  className="group/parent rounded-lg border border-border-subtle bg-[var(--color-overlay-subtle)] px-3 py-2.5 flex flex-col gap-1.5 cursor-pointer hover:border-border-default hover:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  style={{ transition: "background-color 0.15s ease, border-color 0.15s ease" }}
                  title={detail.parent.title}
                >
                  <TicketStatusPill
                    ticketKey={detail.parent.key}
                    jiraStatus={detail.parent.status}
                    issueType={detail.parent.type}
                    title={detail.parent.title}
                    variant="list"
                    showKey
                    showStatus
                  />
                  <span className="min-w-0 truncate text-body-sm text-text-secondary group-hover/parent:text-text-primary" style={{ transition: "color 0.15s ease" }}>
                    {detail.parent.title}
                  </span>
                </Link>
              </div>
            )}
            {ticket.type !== "epic" && (
              <DetailRow label="Sprint">
                <div className="relative">
                  <button
                    ref={sprintTriggerRef}
                    type="button"
                    onClick={() => sprintModalOpen ? setSprintModalOpen(false) : handleOpenSprintModal()}
                    title={currentSprintId ? `Sprint: ${sprints?.find((s) => String(s.id) === currentSprintId)?.name ?? currentSprintId}` : "No sprint"}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 -mr-2 text-body-sm text-text-secondary cursor-pointer hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:opacity-60"
                    style={{ transition: "background-color 0.15s ease" }}
                  >
                    <span className="truncate">{sprints?.find((s) => String(s.id) === currentSprintId)?.name ?? "None"}</span>
                  </button>
                  {sprintModalOpen && sprintModalPos && (
                    <SprintListModal
                      onClose={() => setSprintModalOpen(false)}
                      onSelect={handleSprintModalSelect}
                      onPin={() => {}}
                      pinnedIds={pinnedSprintIds}
                      portalAnchor={sprintModalPos}
                    />
                  )}
                </div>
              </DetailRow>
            )}
            {ticketSessions && ticketSessions.length > 0 && (
              <DetailRow label="Refinement">
                <div className="flex flex-wrap justify-end gap-1.5">
                  {ticketSessions.map((s) => (
                    <Link
                      key={s.id}
                      href={`/refinement/${s.id}`}
                      className="group/ref inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/15 bg-[var(--color-brand-500)]/[0.06] px-2 py-0.5 text-body-sm font-medium text-[var(--color-brand-600)] hover:border-[var(--color-brand-500)]/30 hover:bg-[var(--color-brand-500)]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] cursor-pointer"
                      style={{ transition: "background-color 0.15s ease, border-color 0.15s ease" }}
                      title={`Open refinement session: ${s.name}`}
                    >
                      <Gem size={12} strokeWidth={1.5} className="shrink-0 text-[var(--color-brand-500)]/70" />
                      <span className="min-w-0 truncate max-w-[150px]">{s.name}</span>
                    </Link>
                  ))}
                </div>
              </DetailRow>
            )}
            <DetailRow label="Assignee">
              <AssigneePicker
                value={assignee}
                onChange={handleAssigneeChange}
                align="right"
                textClass="text-body-sm"
              />
            </DetailRow>
            {detail?.reporter && (
              <DetailRow label="Reporter">
                <div className="flex items-center justify-end gap-2">
                  <span className="truncate">{detail.reporter.name}</span>
                  <Avatar assignee={detail.reporter} size={20} />
                </div>
              </DetailRow>
            )}

            {/* Timestamps & Meta */}
            {detail && (
              <>
                <DetailRow label="Created">
                  <Tooltip content={formatAbsoluteDate(detail.createdAt)}>
                    <span>{relativeDate(detail.createdAt)}</span>
                  </Tooltip>
                </DetailRow>
                <DetailRow label="Updated">
                  <Tooltip content={formatAbsoluteDate(detail.updatedAt)}>
                    <span>{relativeDate(detail.updatedAt)}</span>
                  </Tooltip>
                </DetailRow>
              </>
            )}
            {detail?.components && detail.components.length > 0 && (
              <DetailRow label="Components">
                <div className="flex flex-wrap justify-end gap-1">
                  {detail.components.map((c) => (
                    <Tag key={c}>{c}</Tag>
                  ))}
                </div>
              </DetailRow>
            )}
          </div>

          {/* More section */}
          <div>
            <button
              type="button"
              onClick={() => setShowMore(!showMore)}
              aria-expanded={showMore}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 cursor-pointer border border-border-subtle hover:border-[var(--color-brand-500)]/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={{
                backgroundColor: "var(--color-overlay-subtle)",
                transition: "background-color 0.15s ease, border-color 0.15s ease",
              }}
            >
              <span className="text-body-sm font-medium text-text-tertiary">{showMore ? "Less" : "More details"}</span>
              <ChevronDown
                size={12}
                strokeWidth={1.5}
                className={`shrink-0 text-text-muted ${showMore ? "" : "-rotate-90"}`}
                style={{ transition: "transform 0.2s ease" }}
              />
            </button>
            {showMore && (
              <div className="mt-3 space-y-3">
                {/* Completeness indicator */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-body-sm text-text-tertiary">Readiness</span>
                    <span className="text-label tabular-nums text-text-tertiary">{completenessCount}/{completenessChecks.length}</span>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {completenessChecks.map((check) => (
                      <div
                        key={check.label}
                        className="group relative h-1.5 flex-1 overflow-hidden rounded-full"
                        title={`${check.label}: ${check.done ? "Complete" : "Missing"}`}
                      >
                        <div className="absolute inset-0 rounded-full bg-overlay-default" />
                        {check.done && (
                          <div
                            className="absolute inset-0 rounded-full bg-[var(--color-brand-500)]"
                            style={{ opacity: 0.7 }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-1.5 flex gap-1">
                    {completenessChecks.map((check) => (
                      <span
                        key={check.label}
                        className={`flex-1 text-center text-caption ${check.done ? "text-text-tertiary" : "text-text-muted"}`}
                        title={check.label}
                      >
                        {COMPLETENESS_LABELS[check.label] ?? check.label}
                      </span>
                    ))}
                  </div>
                </div>
                <DetailRow label="Readiness">
                  <div className="flex items-center justify-end gap-2">
                    <span
                      className="text-body-sm"
                      style={{ color: readinessCfg?.color ?? "var(--color-text-muted)" }}
                    >
                      {readinessCfg?.label ?? "Ready for Development"}
                    </span>
                    <ReadinessCell value={readiness} onChange={handleReadinessChange} align="right" />
                  </div>
                </DetailRow>
                <DetailRow label="Labels">
                  <LabelPicker
                    value={labels}
                    onChange={handleLabelsChange}
                    align="right"
                  />
                </DetailRow>
                <button
                  type="button"
                  onClick={onNavigateToReview}
                  className="w-full cursor-pointer text-left rounded-lg border border-border-subtle px-3 py-2 hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  style={{
                    backgroundColor: ticket.qualityScore !== null
                      ? "color-mix(in srgb, var(--color-brand-500) 4%, var(--color-surface-elevated))"
                      : "var(--color-overlay-subtle)",
                    transition: "background-color 0.15s ease",
                  }}
                  title="View review details"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-caption text-text-muted">Quality</span>
                    <div className="flex items-center gap-1.5">
                      {ticket.qualityScore !== null ? (
                        <>
                          <QualityBadge score={ticket.qualityScore} />
                          {isReviewOutdated && (
                            <AlertTriangle size={11} strokeWidth={1.5} className="text-[var(--color-status-warning)]/70" />
                          )}
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-body-sm text-text-muted">
                          <Play size={9} strokeWidth={2} className="shrink-0" />
                          Run review
                        </span>
                      )}
                    </div>
                  </div>
                  {ticket.qualityScore !== null && (
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-overlay-default">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${ticket.qualityScore}%`,
                          backgroundColor: ticket.qualityScore < 60 ? "var(--color-status-error)" : ticket.qualityScore < 75 ? "var(--color-status-warning)" : ticket.qualityScore < 90 ? "var(--color-status-caution)" : "var(--color-status-success)",
                          transition: "width 0.4s ease",
                        }}
                      />
                    </div>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Spacer to push footer sections down */}
        <div className="min-h-4 flex-1" />

        {/* Footer sections: pushed to bottom, scrolls with sidebar */}
        <div className="-mx-5 -mb-4 border-t border-border-default bg-[var(--color-surface-elevated)] px-5 pt-3 pb-4 space-y-3">
          {/* PO Note */}
          <div>
            <button
              type="button"
              onClick={() => {
                const next = !poNoteExpanded;
                setPoNoteExpanded(next);
                if (next) {
                  requestAnimationFrame(() => poNoteRef.current?.focus());
                }
              }}
              aria-expanded={poNoteExpanded}
              className="flex w-full items-center justify-between cursor-pointer bg-transparent border-0 p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            >
              <div className="flex items-center gap-1.5">
                <h3 className="text-label font-semibold uppercase tracking-wider text-text-muted">PO Note</h3>
                {poNotes.trim() && (
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-500)]"
                    title="Has PO note"
                  />
                )}
              </div>
              <ChevronDown
                size={12}
                strokeWidth={1.5}
                className={`shrink-0 text-text-muted ${poNoteExpanded ? "" : "-rotate-90"}`}
                style={{ transition: "transform 0.2s ease" }}
              />
            </button>
            {poNoteExpanded && (
              <textarea
                ref={poNoteRef}
                defaultValue={poNotes}
                placeholder="Quick annotation..."
                rows={2}
                onBlur={(e) => handleNotesChange(e.target.value)}
                className="mt-2 w-full resize-none rounded-lg border border-border-subtle bg-overlay-subtle px-3 py-2 text-body-lg text-text-secondary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none"
                style={{ transition: "border-color 0.15s ease" }}
              />
            )}
          </div>

          <div className="h-px bg-border-subtle" />

          {/* Confluence pages */}
          <ConfluencePagesSection ticketKey={ticket.key} variant="compact" />

          <div className="h-px bg-border-subtle" />

          {/* Development panel */}
          <DevPanel data={devInfo} isLoading={devInfoLoading} onExpand={onNavigateToDev} />
        </div>
      </div>
    </div>
  );
}
