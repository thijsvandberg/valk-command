"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { Ticket, TicketReadiness, TicketDetail } from "@/types/ticket";
import { READINESS_CONFIG } from "@/types/ticket";
import { ChevronRight, AlertTriangle, Play } from "lucide-react";
import { JIRA_STATUS_COLORS } from "@/components/shared/StatusBadge";
import { tickets, jira } from "@/lib/api-client";
import { Avatar } from "@/components/shared/Avatar";
import { QualityBadge } from "@/components/sprint-board/TicketTable";
import { ReadinessCell, ReadinessIcon } from "@/components/shared/ReadinessCell";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { SprintPicker } from "@/components/shared/SprintPicker";
import { Tooltip } from "@/components/shared/Tooltip";
import { useTicketReviews, useJiraSprints, useDevInfo } from "@/hooks/useSprintBoard";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Tag } from "@/components/shared/Tag";
import { DevPanel } from "@/components/ticket-detail/DevPanel";
import { ConfluencePagesSection } from "@/components/ticket-detail/ConfluencePagesSection";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="shrink-0 text-xs text-text-tertiary">{label}</span>
      <div className="min-w-0 text-right text-sm text-text-secondary">{children}</div>
    </div>
  );
}

const DEFAULT_SIDEBAR_WIDTH = 320;
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
  collapsed,
  onCollapsedChange,
  onNavigateToReview,
  onNavigateToDev,
}: {
  ticket: Ticket;
  detail: TicketDetail | undefined;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onNavigateToReview?: () => void;
  onNavigateToDev?: () => void;
}) {
  const [readiness, setReadiness] = useState<TicketReadiness | null>(ticket.readiness);
  const [businessValue, setBusinessValue] = useState<number | null>(ticket.businessValue);
  const [storyPoints, setStoryPoints] = useState<number | null>(ticket.storyPoints);
  const [poNotes, setPoNotes] = useState(ticket.notes);
  const [currentSprintId, setCurrentSprintId] = useState<string | null>(ticket.sprintId ?? null);

  // Resize state
  const [sidebarWidth, setSidebarWidth] = useLocalStorage(SIDEBAR_WIDTH_KEY, DEFAULT_SIDEBAR_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const { data: sprints } = useJiraSprints();

  const { data: reviewData } = useTicketReviews(ticket.key);
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

  const handleReadinessChange = useCallback(async (v: TicketReadiness | null) => {
    setReadiness(v);
    try {
      await tickets.updateMetadata(ticket.key, { readiness: v });
    } catch (err) {
      console.error("Operation failed:", err);
    }
  }, [ticket.key]);

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
      className="relative shrink-0"
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
        style={isDragging ? { backgroundColor: "rgba(46, 145, 73, 0.5)" } : {}}
      />

      {/* Left edge line */}
      <div className="absolute top-0 left-0 h-full w-px bg-border-default" />

      {/* Collapse button on left edge */}
      <button
        type="button"
        onClick={() => onCollapsedChange(true)}
        className="absolute left-0 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full border border-border-default bg-[var(--color-surface-elevated)] text-text-muted cursor-pointer opacity-0 hover:opacity-100 hover:text-text-secondary hover:border-[var(--color-brand-500)]/40 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease" }}
        aria-label="Collapse sidebar"
        title="Collapse sidebar  [  "
      >
        <ChevronRight className="h-3 w-3" strokeWidth={2} />
      </button>

      {/* Sidebar content */}
      <div
        className="h-full overflow-y-auto bg-[var(--color-surface-elevated)] py-4 pr-5 pl-5"
        style={{
          opacity: isDragging ? 0.7 : 1,
          transition: isDragging ? "none" : "opacity 150ms ease",
        }}
      >

        {/* Completeness indicator */}
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-label font-semibold uppercase tracking-wider text-text-muted">Readiness</h3>
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

        {/* Divider */}
        <div className="my-4 h-px bg-border-subtle" />

        {/* Details section */}
        <div>
          <h3 className="text-label font-semibold uppercase tracking-wider text-text-muted">Details</h3>
          <div className="mt-2 divide-y divide-border-subtle">
            <DetailRow label="Status">
              {(() => {
                const sc = JIRA_STATUS_COLORS[ticket.jiraStatus] ?? JIRA_STATUS_COLORS["TO DO"];
                return (
                  <span
                    className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: sc.bg, color: sc.text }}
                  >
                    {ticket.jiraStatus}
                  </span>
                );
              })()}
            </DetailRow>
            <DetailRow label="Readiness">
              <div className="flex items-center justify-end gap-2">
                {readiness && (
                  <span
                    className="text-xs"
                    style={{ color: readinessCfg?.color ?? "var(--color-text-muted)" }}
                  >
                    {readinessCfg?.label}
                  </span>
                )}
                <ReadinessCell value={readiness} onChange={handleReadinessChange} align="right" />
              </div>
            </DetailRow>
            <DetailRow label="Points">
              <StoryPointPicker
                value={storyPoints}
                onChange={handleStoryPointsChange}
              />
            </DetailRow>
            {ticket.type !== "epic" && (
              <DetailRow label="Sprint">
                {sprints ? (
                  <SprintPicker
                    value={currentSprintId}
                    sprints={sprints}
                    onChange={handleSprintChange}
                    align="right"
                  />
                ) : (
                  <span className="text-text-muted">-</span>
                )}
              </DetailRow>
            )}
            <DetailRow label="Business Value">
              <BusinessValuePicker value={businessValue} onChange={handleBusinessValueChange} align="right" />
            </DetailRow>
            {/* Quality score */}
            <div className="py-2.5">
              <button
                type="button"
                onClick={onNavigateToReview}
                className="w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                title="View review details"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="shrink-0 text-xs text-text-tertiary">Quality</span>
                  <div className="flex items-center gap-1.5">
                    {ticket.qualityScore !== null ? (
                      <>
                        <QualityBadge score={ticket.qualityScore} />
                        {isReviewOutdated && (
                          <AlertTriangle size={11} strokeWidth={1.5} className="text-[#ea8744]/70" />
                        )}
                      </>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 rounded-md bg-overlay-subtle px-2 py-0.5 text-xs text-text-muted hover:bg-overlay-default hover:text-text-secondary"
                        style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                      >
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
                        backgroundColor: ticket.qualityScore < 60 ? "#e5534b" : ticket.qualityScore < 75 ? "#ea8744" : ticket.qualityScore < 90 ? "#eab308" : "#4aaa60",
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                )}
              </button>
            </div>
            <DetailRow label="Assignee">
              <div className="flex items-center justify-end gap-2">
                <span className="truncate">{ticket.assignee?.name ?? "Unassigned"}</span>
                <Avatar assignee={ticket.assignee} size={20} />
              </div>
            </DetailRow>
            {detail?.reporter && (
              <DetailRow label="Reporter">
                <div className="flex items-center justify-end gap-2">
                  <span className="truncate">{detail.reporter.name}</span>
                  <Avatar assignee={detail.reporter} size={20} />
                </div>
              </DetailRow>
            )}
            {detail?.labels && detail.labels.length > 0 && (
              <DetailRow label="Labels">
                <div className="flex flex-wrap justify-end gap-1">
                  {detail.labels.map((l) => (
                    <Tag key={l}>{l}</Tag>
                  ))}
                </div>
              </DetailRow>
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
          </div>
        </div>

        {/* Divider */}
        <div className="my-4 h-px bg-border-subtle" />

        {/* PO Note */}
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-label font-semibold uppercase tracking-wider text-text-muted">PO Note</h3>
            {poNotes.trim() && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-500)]"
                title="Has PO note"
              />
            )}
          </div>
          <textarea
            defaultValue={poNotes}
            placeholder="Quick annotation..."
            rows={2}
            onBlur={(e) => handleNotesChange(e.target.value)}
            className="mt-2 w-full resize-none rounded-lg border border-border-strong bg-overlay-subtle px-3 py-2 text-sm text-text-secondary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none"
            style={{ transition: "border-color 0.15s ease" }}
          />
        </div>

        {/* Divider */}
        <div className="my-4 h-px bg-border-subtle" />

        {/* Confluence pages */}
        <ConfluencePagesSection ticketKey={ticket.key} />

        {/* Divider */}
        <div className="my-4 h-px bg-border-subtle" />

        {/* Development panel */}
        <DevPanel data={devInfo} isLoading={devInfoLoading} onExpand={onNavigateToDev} />
      </div>
    </div>
  );
}
