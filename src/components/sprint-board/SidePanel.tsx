"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { Ticket, POStatus, TicketReadiness } from "@/types/ticket";
import { getEpicColor, getBvColor, JIRA_STATUS_COLORS } from "@/types/ticket";
import Link from "next/link";
import { Avatar } from "@/components/shared/Avatar";
import { QualityBadge } from "./TicketTableCells";
import { ReadinessCell } from "@/components/shared/ReadinessCell";
import { TicketKeyPill } from "@/components/shared/TicketKeyPill";
import { useTicketDetail, useTicketVersions, useJiraSprints, useDevInfo } from "@/hooks/useSprintBoard";
import { prefetchTicketPage } from "@/lib/prefetch";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";
import { Tooltip } from "@/components/shared/Tooltip";
import { Tag } from "@/components/shared/Tag";
import { DevPanel } from "@/components/ticket-detail/DevPanel";
import { ConfluencePagesSection } from "@/components/ticket-detail/ConfluencePagesSection";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
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
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="shrink-0 text-body-sm text-text-tertiary">{label}</span>
      <div className="min-w-0 text-right text-body-lg text-text-secondary">{children}</div>
    </div>
  );
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
  adjacentKeys?: { prev: string | null; next: string | null };
}) {
  const jiraStatusColor = JIRA_STATUS_COLORS[ticket.jiraStatus] || JIRA_STATUS_COLORS["TO DO"];
  const epicColor = ticket.epic ? getEpicColor(ticket.epic) ?? null : null;
  // Ticket detail data (reporter, parent, labels, timestamps, description)
  const { data: detail } = useTicketDetail(ticket.key);
  const description = detail?.description as string | undefined;

  // Sprint name lookup
  const { sprints } = useJiraSprints();
  const sprintName = useMemo(() => {
    if (!ticket.sprintId) return null;
    return sprints?.find((s) => String(s.id) === ticket.sprintId)?.name ?? null;
  }, [ticket.sprintId, sprints]);

  // Dev info for footer
  const { data: devInfo, isLoading: devInfoLoading } = useDevInfo(ticket.key);

  // Completeness checks for readiness progress bar
  const hasDescription = (description ?? "").trim().length > 20;
  const hasAcceptanceCriteria = /acceptance\s*criteria/i.test(description ?? "");
  const hasPoints = ticket.storyPoints !== null;
  const hasBV = ticket.businessValue !== null;
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
        date: v.date || new Date().toISOString(),
        contentHash: v.contentHash || "",
        content: v.content || "",
        updatedBy: v.updatedBy ?? null,
        updatedByAvatar: v.updatedByAvatar ?? null,
      }));
    }
    return [];
  }, [apiVersions]);

  const hasVersions = ticketVersions.length > 1;

  // BV color
  const bvColor = ticket.businessValue !== null ? getBvColor(ticket.businessValue) : null;

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
          style={isDragging ? { backgroundColor: "rgba(46, 145, 73, 0.5)" } : {}}
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <div className="flex items-center gap-2">
          <TicketKeyPill
            ticketKey={ticket.key}
            statusLabel={ticket.jiraStatus}
            statusBg={jiraStatusColor.bg}
            statusColor={jiraStatusColor.text}
            href={`/tickets/${ticket.key}`}
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
          <a
            href={`/tickets/${ticket.key}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-muted cursor-pointer hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] transition-colors duration-150"
            title="Open in new tab"
          >
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </a>
          <Button
            variant="ghost"
            size="md"
            iconOnly
            icon={<X className="h-3.5 w-3.5" strokeWidth={1.5} />}
            onClick={onClose}
          />
        </div>
      </div>

      {/* Scrollable content */}
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

          {/* Badges: Epic + SP + BV */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {epicColor && (
              <span
                className="inline-flex items-center rounded-md px-2 py-0.5 text-body-sm font-medium"
                style={{ backgroundColor: epicColor.bg, color: epicColor.text }}
              >
                {ticket.epic}
              </span>
            )}
            {ticket.storyPoints !== null && (
              <span className="inline-flex items-center rounded-md bg-overlay-default px-2 py-0.5 text-body-sm font-medium text-text-secondary">
                {ticket.storyPoints} pts
              </span>
            )}
            {bvColor && (
              <span
                className="inline-flex items-center rounded-md px-2 py-0.5 text-body-sm font-medium"
                style={{ backgroundColor: bvColor.bg, color: bvColor.text }}
              >
                BV {ticket.businessValue}
              </span>
            )}
          </div>

          {/* Metadata grid */}
          <div className="mt-4 space-y-0.5">
            <DetailRow label="Assignee">
              <div className="flex items-center justify-end gap-2">
                <span className="truncate">{ticket.assignee?.name || "Unassigned"}</span>
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
            {ticket.type !== "epic" && sprintName && (
              <DetailRow label="Sprint">
                <span className="truncate">{sprintName}</span>
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
            {detail?.labels && detail.labels.length > 0 && (
              <DetailRow label="Labels">
                <div className="flex flex-wrap justify-end gap-1">
                  {detail.labels.map((l) => (
                    <Tag key={l}>{l}</Tag>
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

          {/* Description */}
          <div className="my-5 h-px bg-overlay-default" />
          <div>
            <h3 className="text-body-sm font-medium uppercase tracking-[0.06em] text-text-secondary">Description</h3>
            {description ? (
              <div className="description-content mt-2 max-h-64 overflow-y-auto text-body-lg">
                {renderMarkdown(description)}
              </div>
            ) : (
              <p className="mt-2 text-body-sm text-text-muted">No description</p>
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
          <ConfluencePagesSection ticketKey={ticket.key} />
          <div className="h-px bg-border-subtle" />
          <DevPanel data={devInfo} isLoading={devInfoLoading} />
        </div>
      </div>
    </div>
  );
}
