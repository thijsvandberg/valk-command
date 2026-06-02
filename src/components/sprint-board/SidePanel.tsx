"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Ticket, POStatus, TicketReadiness, Assignee } from "@/types/ticket";
import { getBvColor } from "@/types/ticket";
import Link from "next/link";
import { Avatar } from "@/components/shared/Avatar";
import { QualityBadge } from "./TicketTableCells";
import { ReadinessCell } from "@/components/shared/ReadinessCell";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { AssigneePicker } from "@/components/shared/AssigneePicker";
import { SprintPicker } from "@/components/shared/SprintPicker";
import { EpicPicker } from "@/components/shared/EpicPicker";
import type { EpicOption } from "@/components/shared/EpicPicker";
import { LabelPicker } from "@/components/shared/LabelPicker";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { useTicketDetail, useTicketVersions, useJiraSprints, useDevInfo } from "@/hooks/useSprintBoard";
import { prefetchTicketPage } from "@/lib/prefetch";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";
import { tickets as ticketsApi, jira } from "@/lib/api-client";
import { Tooltip } from "@/components/shared/Tooltip";
import { DevPanel } from "@/components/ticket-detail/DevPanel";
import { ConfluencePagesSection } from "@/components/ticket-detail/ConfluencePagesSection";
import { EditableDescription } from "@/components/ticket-detail/EditableDescription";
import {
  ArrowUpRight,
  X,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  History,
  CheckSquare,
  MessageSquare,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

// -- Layout helpers --

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[40px] items-center justify-between gap-3">
      <span className="shrink-0 text-body-sm text-text-tertiary">{label}</span>
      <div className="min-w-0 text-right text-body-lg text-text-secondary">{children}</div>
    </div>
  );
}

// A compact, recognizable card for the two headline PO metrics (SP / BV).
function ScoreCard({ label, accent, accentColor, children }: { label: string; accent?: boolean; accentColor?: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-col gap-0.5 rounded-lg border px-3 py-2"
      style={{
        borderColor: accent && accentColor ? `color-mix(in srgb, ${accentColor} 35%, transparent)` : "var(--color-border-subtle)",
        backgroundColor: accent && accentColor
          ? `color-mix(in srgb, ${accentColor} 8%, var(--color-surface-elevated))`
          : "var(--color-overlay-subtle)",
        transition: "background-color 0.15s ease, border-color 0.15s ease",
      }}
    >
      <span className="text-caption uppercase tracking-[0.06em] text-text-muted">{label}</span>
      <div className="text-body-lg font-medium text-text-secondary">{children}</div>
    </div>
  );
}

// Derive avatar initials/color for optimistic assignee updates.
function deriveAssignee(name: string): Assignee {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length === 1 ? parts[0].slice(0, 2).toUpperCase() : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = ((hash % 360) + 360) % 360;
  return { name, initials, color: `hsl(${hue}, 55%, 50%)` };
}

// -- Completeness labels --

const COMPLETENESS_LABELS: Record<string, string> = {
  Description: "Desc",
  AC: "AC",
  Points: "Pts",
  BV: "BV",
  Review: "Rev",
};

// -- Side panel --

const PANEL_STORAGE_KEY = "sprintBoardPanelWidth";
const DEFAULT_PANEL_WIDTH = 400;
const MIN_PANEL_WIDTH = 320;

export function SidePanel({
  ticket,
  poStatus,
  readiness,
  onPoStatusChange,
  onReadinessChange,
  onNotesChange,
  onClose,
  onShowToast,
  onMutate,
  adjacentKeys,
}: {
  ticket: Ticket;
  poStatus: POStatus;
  readiness?: TicketReadiness | null;
  onPoStatusChange: (v: POStatus) => void;
  onReadinessChange?: (v: TicketReadiness | null) => void;
  onNotesChange: (notes: string) => void;
  onClose: () => void;
  onShowToast: (message: string) => void;
  onMutate?: () => void;
  adjacentKeys?: { prev: string | null; next: string | null };
}) {
  const router = useRouter();

  // Ticket detail data (reporter, parent, labels, timestamps, description)
  const { data: detail } = useTicketDetail(ticket.key);
  const description = (detail?.description as string | undefined) ?? "";

  // Sprint lookup
  const { sprints } = useJiraSprints();

  // Dev info for footer
  const { data: devInfo, isLoading: devInfoLoading } = useDevInfo(ticket.key);

  // -- Editable field state (optimistic; persisted via api-client + board refresh) --
  const [businessValue, setBusinessValue] = useState<number | null>(ticket.businessValue);
  const [storyPoints, setStoryPoints] = useState<number | null>(ticket.storyPoints);
  const [assignee, setAssignee] = useState<Assignee | null>(ticket.assignee);
  const [epicName, setEpicName] = useState<string | null>(ticket.epic);
  const [epicKey, setEpicKey] = useState<string | null>(ticket.epicKey);
  const [currentSprintId, setCurrentSprintId] = useState<string | null>(ticket.sprintId ?? null);
  // Labels arrive async via detail; an override lets edits win until the panel
  // remounts (keyed on ticket) without a state-sync effect.
  const [labelsOverride, setLabelsOverride] = useState<string[] | null>(null);
  const labels = useMemo(() => labelsOverride ?? detail?.labels ?? [], [labelsOverride, detail?.labels]);

  const handleBusinessValueChange = useCallback(async (v: number | null) => {
    const prev = businessValue;
    setBusinessValue(v);
    try {
      await ticketsApi.updateMetadata(ticket.key, { businessValue: v });
      onMutate?.();
    } catch (err) {
      console.error("Operation failed:", err);
      setBusinessValue(prev);
    }
  }, [ticket.key, businessValue, onMutate]);

  const handleStoryPointsChange = useCallback(async (v: number | null) => {
    const prev = storyPoints;
    setStoryPoints(v);
    try {
      await ticketsApi.updateStoryPoints(ticket.key, v);
      onMutate?.();
    } catch (err) {
      console.error("Operation failed:", err);
      setStoryPoints(prev);
    }
  }, [ticket.key, storyPoints, onMutate]);

  const handleAssigneeChange = useCallback(async (user: { accountId: string; displayName: string } | null) => {
    const prev = assignee;
    setAssignee(user ? deriveAssignee(user.displayName) : null);
    try {
      await jira.assign({ issueKey: ticket.key, accountId: user?.accountId ?? null, name: user?.displayName ?? null });
      onMutate?.();
    } catch (err) {
      console.error("Operation failed:", err);
      setAssignee(prev);
    }
  }, [ticket.key, assignee, onMutate]);

  const handleSprintChange = useCallback(async (sprintId: string | null) => {
    if (!sprintId) return;
    const prev = currentSprintId;
    setCurrentSprintId(sprintId);
    try {
      await jira.moveSprint({ issueKeys: [ticket.key], targetSprintId: sprintId });
      onMutate?.();
    } catch (err) {
      console.error("Operation failed:", err);
      setCurrentSprintId(prev);
    }
  }, [ticket.key, currentSprintId, onMutate]);

  const handleEpicChange = useCallback(async (epic: EpicOption | null) => {
    const prevName = epicName;
    const prevKey = epicKey;
    setEpicName(epic?.name ?? null);
    setEpicKey(epic?.key ?? null);
    try {
      await ticketsApi.updateEpic(ticket.key, epic?.key ?? null);
      onMutate?.();
    } catch (err) {
      console.error("Operation failed:", err);
      setEpicName(prevName);
      setEpicKey(prevKey);
    }
  }, [ticket.key, epicName, epicKey, onMutate]);

  const handleLabelsChange = useCallback(async (newLabels: string[]) => {
    const prev = labels;
    setLabelsOverride(newLabels);
    try {
      await ticketsApi.updateLabels(ticket.key, newLabels);
      onMutate?.();
    } catch (err) {
      console.error("Operation failed:", err);
      setLabelsOverride(prev);
    }
  }, [ticket.key, labels, onMutate]);

  // Completeness checks for readiness progress bar (reflect live local state)
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

  // "More details" toggle for PO section
  const [showMore, setShowMore] = useState(false);

  // Prefetch adjacent ticket details when this panel opens
  useEffect(() => {
    if (adjacentKeys?.prev) prefetchTicketPage(adjacentKeys.prev);
    if (adjacentKeys?.next) prefetchTicketPage(adjacentKeys.next);
  }, [adjacentKeys]);

  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_PANEL_WIDTH;
    const saved = localStorage.getItem(PANEL_STORAGE_KEY);
    if (!saved) return DEFAULT_PANEL_WIDTH;
    const parsed = parseInt(saved, 10);
    return !isNaN(parsed) ? Math.max(MIN_PANEL_WIDTH, parsed) : DEFAULT_PANEL_WIDTH;
  });
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(e: MouseEvent) {
      const newWidth = Math.max(MIN_PANEL_WIDTH, window.innerWidth - e.clientX);
      setPanelWidth(newWidth);
      localStorage.setItem(PANEL_STORAGE_KEY, String(newWidth));
    }

    function handleMouseUp() {
      setIsDragging(false);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const effectiveWidth = `${panelWidth}px`;

  // Lazy-load ticket versions via SWR (only fetches when panel is open)
  const { data: apiVersions } = useTicketVersions(ticket.key);

  const ticketVersions = useMemo(() => {
    if (Array.isArray(apiVersions) && apiVersions.length > 0) {
      return apiVersions.map((v, idx) => ({
        versionNumber: idx + 1,
        date: v.date || "",
        contentHash: v.contentHash || "",
        content: v.content || "",
        updatedBy: v.updatedBy ?? null,
        updatedByAvatar: v.updatedByAvatar ?? null,
      }));
    }
    return [];
  }, [apiVersions]);

  const hasVersions = ticketVersions.length > 1;

  const bvColor = businessValue !== null ? getBvColor(businessValue) : null;

  const canEditEpic = ticket.type !== "epic" && ticket.type !== "subtask";

  return (
    <div
      ref={panelRef}
      className="relative z-10 flex h-full shrink-0 flex-col border-l border-border-default bg-[var(--color-surface-elevated)]"
      style={{ width: effectiveWidth, minWidth: MIN_PANEL_WIDTH }}
    >
      {/* Resize drag handle */}
      <div
          onMouseDown={handleMouseDown}
          className="absolute top-0 left-0 z-20 h-full w-1 cursor-col-resize hover:bg-[var(--color-brand-500)]/30 active:bg-[var(--color-brand-500)]/50"
          style={isDragging ? { backgroundColor: "var(--color-drag-active)" } : {}}
      />

      {/* Header -- h-[44px] keeps its bottom border on the same line as the board toolbar */}
      <div className="flex h-[44px] shrink-0 items-center justify-between border-b border-border-default px-4">
        <div className="flex items-center gap-2">
          <TicketStatusPill
            ticketKey={ticket.key}
            jiraStatus={ticket.jiraStatus}
            issueType={ticket.type}
            title={ticket.title}
            appearance="elevated"
            onHeader
          />
          {ticket.editState === "draft" && (
            <span className="rounded px-1.5 py-0.5 text-caption" style={{ backgroundColor: "var(--color-status-info-subtle)", color: "var(--color-icon-task)", opacity: 0.5 }} title="Unsaved draft">
              draft
            </span>
          )}
          {ticket.editState === "local_edits" && (
            <span className="rounded px-1.5 py-0.5 text-caption" style={{ backgroundColor: "var(--color-status-info-subtle)", color: "var(--color-icon-task)", opacity: 0.7 }} title="Has local changes not yet pushed to Jira">
              local changes
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => router.push(`/tickets/${ticket.key}`)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted cursor-pointer hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] transition-colors duration-150"
            title="Open full view"
          >
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
          <Button
            variant="ghost"
            size="md"
            iconOnly
            icon={<X className="h-3.5 w-3.5" strokeWidth={1.5} />}
            onClick={onClose}
          />
        </div>
      </div>

      {/* Scrollable content -- single scroll for the whole panel */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        <div className="flex-1 px-5 py-5">

          {/* Title */}
          <h2 className="font-[var(--font-display)] text-heading font-semibold leading-snug text-text-primary">
            {ticket.title}
          </h2>

          {/* Conflict indicator */}
          {ticket.editState === "conflict" && (
            <Link
              href={`/tickets/${ticket.key}`}
              className="mt-3 flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.99]"
              style={{ borderWidth: 1, borderStyle: "solid", borderColor: "color-mix(in srgb, var(--color-status-warning) 20%, transparent)", backgroundColor: "color-mix(in srgb, var(--color-status-warning) 6%, transparent)", transition: "background-color 0.15s ease, transform 0.1s ease" }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--color-status-warning) 10%, transparent)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--color-status-warning) 6%, transparent)"; }}
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-[var(--color-status-warning)]" strokeWidth={1.5} />
              <div>
                <span className="text-body-sm font-medium text-[var(--color-status-warning)]">Conflict</span>
                <span className="ml-1.5 text-body-sm text-text-tertiary">Open full view to review diff</span>
              </div>
              <ChevronRight className="ml-auto h-2.5 w-2.5 text-text-muted" strokeWidth={1.5} />
            </Link>
          )}

          {/* Score cards: SP + BV */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <ScoreCard label="Story Points" accent={hasPoints} accentColor="var(--color-brand-500)">
              <StoryPointPicker value={storyPoints} onChange={handleStoryPointsChange} align="left" showMetricIcon richTooltip />
            </ScoreCard>
            <ScoreCard label="Business Value" accent={hasBV} accentColor={bvColor?.text ?? "var(--color-brand-500)"}>
              <BusinessValuePicker value={businessValue} onChange={handleBusinessValueChange} align="left" showMetricIcon richTooltip />
            </ScoreCard>
          </div>

          {/* Description -- editable, flows in the single panel scroll */}
          <div className="mt-5">
            <h3 className="text-body-sm font-medium uppercase tracking-[0.06em] text-text-secondary">Description</h3>
            <EditableDescription
              ticketKey={ticket.key}
              initialDescription={description}
              onLocalEdit={() => onMutate?.()}
            />
          </div>

          {/* Meta grid -- editable, below the description */}
          <div className="my-5 h-px bg-overlay-default" />
          <div className="space-y-0.5">
            <DetailRow label="Assignee">
              <AssigneePicker value={assignee} onChange={handleAssigneeChange} align="right" />
            </DetailRow>
            {detail?.reporter && (
              <DetailRow label="Reporter">
                <div className="flex items-center justify-end gap-2">
                  <span className="truncate">{detail.reporter.name}</span>
                  <Avatar assignee={detail.reporter} size={20} />
                </div>
              </DetailRow>
            )}
            {ticket.type !== "epic" && (
              <DetailRow label="Sprint">
                <SprintPicker value={currentSprintId} sprints={sprints ?? []} onChange={handleSprintChange} align="right" />
              </DetailRow>
            )}
            {canEditEpic && (
              <DetailRow label="Epic">
                <EpicPicker
                  value={epicKey ? { key: epicKey, name: epicName ?? epicKey } : null}
                  onChange={handleEpicChange}
                  align="right"
                  ticketKey={ticket.key}
                />
              </DetailRow>
            )}
            {detail?.parent && (
              <DetailRow label="Parent">
                <Link
                  href={`/tickets/${detail.parent.key}`}
                  className="group/parent inline-flex items-center gap-1.5 text-[var(--color-brand-600)] hover:text-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] cursor-pointer"
                  style={{ transition: "color 0.15s ease" }}
                  title={detail.parent.title}
                >
                  <span className="min-w-0 truncate max-w-[180px]">{detail.parent.key} {detail.parent.title}</span>
                  <ArrowUpRight size={12} strokeWidth={2} className="shrink-0 opacity-0 group-hover/parent:opacity-100" style={{ transition: "opacity 0.15s ease" }} />
                </Link>
              </DetailRow>
            )}
            <DetailRow label="Labels">
              <LabelPicker value={labels} onChange={handleLabelsChange} align="right" />
            </DetailRow>
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

          {/* PO Metadata section */}
          <div className="my-5 h-px bg-overlay-default" />
          <h3 className="flex items-center gap-2 text-body-sm font-medium uppercase tracking-[0.06em] text-text-secondary">
            PO Metadata
            {ticket.notes.trim() && (
              <span
                className="h-2 w-2 rounded-full bg-[var(--color-brand-500)]"
                title="Has PO notes"
              />
            )}
          </h3>

          <div className="mt-3 space-y-3">
            {/* Readiness completeness bar */}
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

            {/* Readiness dropdown */}
            {onReadinessChange && (
              <DetailRow label="Readiness">
                <ReadinessCell value={readiness ?? null} onChange={onReadinessChange} align="right" />
              </DetailRow>
            )}

            {/* Quality Score (interactive) */}
            <Link
              href={`/tickets/${ticket.key}#review`}
              className="block w-full rounded-lg border border-border-subtle px-3 py-2 cursor-pointer hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
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
                    <QualityBadge score={ticket.qualityScore} />
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
            </Link>

            {/* More details toggle */}
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
              <span className="text-body-sm font-medium text-text-tertiary">{showMore ? "Less" : "Notes & actions"}</span>
              <ChevronDown
                size={12}
                strokeWidth={1.5}
                className={`shrink-0 text-text-muted ${showMore ? "" : "-rotate-90"}`}
                style={{ transition: "transform 0.2s ease" }}
              />
            </button>

            {showMore && (
              <div className="space-y-3">
                {/* Notes */}
                <div>
                  <label className="mb-1.5 block text-body-sm text-text-tertiary">Notes</label>
                  <textarea
                    defaultValue={ticket.notes}
                    placeholder="Add PO notes..."
                    rows={3}
                    onBlur={(e) => onNotesChange(e.target.value)}
                    className="w-full rounded-md border border-border-default bg-overlay-subtle px-3 py-2 text-body-lg text-text-primary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none resize-none"
                  />
                </div>

                {/* View changes link */}
                {hasVersions && (
                  <Link
                    href={`/tickets/${ticket.key}`}
                    className="flex items-center gap-2 text-body-sm text-[var(--color-brand-400)] cursor-pointer hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
                    style={{ transition: "color 0.15s ease, transform 0.1s ease" }}
                  >
                    <History className="h-3.5 w-3.5" strokeWidth={1.5} />
                    View changes ({ticketVersions.length} versions)
                  </Link>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  <Button
                    variant="ghost"
                    size="lg"
                    icon={<CheckSquare className="h-4 w-4 shrink-0 text-text-tertiary" strokeWidth={1.5} />}
                    onClick={() => {
                      onShowToast(`Review story queued for ${ticket.key}`);
                    }}
                    className="justify-start px-3 text-body-lg text-text-secondary hover:text-text-primary"
                  >
                    Review Story
                  </Button>
                  <a
                    href={`/chat?ticket=${ticket.key}`}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-body-lg text-text-secondary cursor-pointer hover:bg-hover-list-item hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
                    style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-text-tertiary" strokeWidth={1.5} />
                    Chat about this ticket
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer sections: Confluence + Development */}
        <div className="border-t border-border-default bg-[var(--color-surface-elevated)] px-5 pt-3 pb-4 space-y-3">
          <ConfluencePagesSection ticketKey={ticket.key} variant="compact" />
          <div className="h-px bg-border-subtle" />
          <DevPanel data={devInfo} isLoading={devInfoLoading} />
        </div>
      </div>
    </div>
  );
}
