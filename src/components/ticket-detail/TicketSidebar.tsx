"use client";

import { useState, useCallback } from "react";
import type { Ticket, TicketReadiness, TicketDetail } from "@/types/ticket";
import { ChevronRight, AlertTriangle } from "lucide-react";
import { JIRA_STATUS_COLORS } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";
import { tickets } from "@/lib/api-client";
import { Avatar } from "@/components/shared/Avatar";
import { QualityBadge } from "@/components/sprint-board/TicketTable";
import { ReadinessCell } from "@/components/shared/ReadinessCell";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { useTicketReviews, useJiraSprints, useDevInfo } from "@/hooks/useSprintBoard";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Tag } from "@/components/shared/Tag";
import { DevPanel } from "@/components/ticket-detail/DevPanel";
import { ConfluencePagesSection } from "@/components/ticket-detail/ConfluencePagesSection";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between py-2">
      <span className="shrink-0 text-xs text-text-tertiary">{label}</span>
      <div className="min-w-0 text-right text-sm text-text-secondary">{children}</div>
    </div>
  );
}

const SIDEBAR_WIDTH = 320;

export function TicketSidebar({
  ticket,
  detail,
  onNavigateToReview,
  onNavigateToDev,
}: {
  ticket: Ticket;
  detail: TicketDetail | undefined;
  onNavigateToReview?: () => void;
  onNavigateToDev?: () => void;
}) {
  const [readiness, setReadiness] = useState<TicketReadiness | null>(ticket.readiness);
  const [businessValue, setBusinessValue] = useState<number | null>(ticket.businessValue);
  const [storyPoints, setStoryPoints] = useState<number | null>(ticket.storyPoints);
  const [poNotes, setPoNotes] = useState(ticket.notes);
  const [collapsed, setCollapsed] = useLocalStorage("ticket-sidebar-collapsed", false);

  const { data: sprints } = useJiraSprints();
  const sprintName = sprints?.find((s) => String(s.id) === ticket.sprintId)?.name ?? null;

  const { data: reviewData } = useTicketReviews(ticket.key);
  const { data: devInfo, isLoading: devInfoLoading } = useDevInfo(ticket.key);
  const latestReview = reviewData?.reviews?.[0] ?? null;
  const currentVersionHash = reviewData?.currentVersionHash ?? null;
  const isReviewOutdated = latestReview && currentVersionHash
    ? latestReview.storyVersionHash !== currentVersionHash
    : false;

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

  return (
    <div
      className="relative shrink-0 transition-[width] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
      style={{ width: collapsed ? 0 : SIDEBAR_WIDTH, height: "100%" }}
    >
      {/* Toggle button — floats over content when collapsed */}
      <Button
        variant="ghost"
        size="md"
        iconOnly
        onClick={() => setCollapsed((v) => !v)}
        className={`absolute top-1/2 -translate-y-1/2 z-20 !rounded-full bg-[var(--color-surface-elevated)] !border-border-strong !text-text-tertiary hover:!text-text-secondary hover:!border-[var(--color-brand-500)]/50 ${
          collapsed ? "-left-5" : "left-0 -translate-x-1/2"
        }`}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        icon={
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
            strokeWidth={1.5}
          />
        }
      />

      {/* Left edge line */}
      <div className={`absolute top-0 left-0 h-full w-px bg-overlay-default transition-opacity duration-200 ${collapsed ? "opacity-0" : "opacity-100"}`} />

      {/* Sidebar content */}
      {!collapsed && (
        <div className="h-full space-y-6 overflow-y-auto bg-[var(--color-surface-elevated)] py-5 pr-5 pl-6">
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
                  className={`flex-1 truncate text-center text-caption ${check.done ? "text-text-tertiary" : "text-text-muted"}`}
                >
                  {check.label}
                </span>
              ))}
            </div>
          </div>

          {/* Jira details */}
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
              <DetailRow label="Points">
                <StoryPointPicker
                  value={storyPoints}
                  onChange={handleStoryPointsChange}
                  align="left"
                />
              </DetailRow>
              {sprintName && (
                <DetailRow label="Sprint">
                  <span className="truncate">{sprintName}</span>
                </DetailRow>
              )}
              {/* Quality score with visual bar */}
              <div className="py-2">
                <button
                  type="button"
                  onClick={onNavigateToReview}
                  className="w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  title="View review details"
                >
                  <div className="flex items-center justify-between">
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
                          className="text-xs text-text-muted hover:text-[var(--color-brand-400)]"
                          style={{ transition: "color 0.15s ease" }}
                        >
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
                    {new Date(detail.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </DetailRow>
                  <DetailRow label="Updated">
                    {new Date(detail.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </DetailRow>
                </>
              )}
            </div>
          </div>

          {/* PO Metadata */}
          <div className="rounded-lg border border-[var(--color-brand-500)]/10 bg-[var(--color-brand-500)]/[0.03] p-4">
            <h3 className="flex items-center gap-2 text-label font-semibold uppercase tracking-wider text-text-muted">
              PO Metadata
              {poNotes.trim() && (
                <span
                  className="h-2 w-2 rounded-full bg-[var(--color-brand-500)]"
                  title="Has PO notes"
                />
              )}
            </h3>
            <div className="mt-3 space-y-4">
              {/* Readiness */}
              <div>
                <label className="mb-1.5 block text-xs text-text-tertiary">Readiness</label>
                <ReadinessCell value={readiness} onChange={handleReadinessChange} align="left" />
              </div>

              {/* Business Value */}
              <div>
                <label className="mb-1.5 block text-xs text-text-tertiary">Business Value</label>
                <BusinessValuePicker value={businessValue} onChange={handleBusinessValueChange} align="left" />
              </div>

              {/* PO Notes */}
              <div>
                <label className="mb-1.5 block text-xs text-text-tertiary">Notes</label>
                <textarea
                  defaultValue={poNotes}
                  placeholder="Add PO notes..."
                  rows={3}
                  onBlur={(e) => handleNotesChange(e.target.value)}
                  className="w-full resize-none rounded-lg border border-border-strong bg-overlay-subtle px-3 py-2 text-sm text-text-secondary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none"
                  style={{ transition: "border-color 0.15s ease" }}
                />
              </div>
            </div>
          </div>

          {/* Confluence pages */}
          <ConfluencePagesSection ticketKey={ticket.key} />

          {/* Development panel */}
          <DevPanel data={devInfo} isLoading={devInfoLoading} onExpand={onNavigateToDev} />
        </div>
      )}
    </div>
  );
}
