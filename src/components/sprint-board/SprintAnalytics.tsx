"use client";

import { useState, useMemo, memo } from "react";
import type { Ticket, JiraStatus } from "@/types/ticket";
import { JIRA_STATUS_COLORS } from "@/types/ticket";
import { ChevronRight, BarChart2, X } from "lucide-react";
import { BurnupChart } from "./BurnupChart";

const STATUS_COLORS: Record<JiraStatus, string> = Object.fromEntries(
  Object.entries(JIRA_STATUS_COLORS).map(([k, v]) => [k, v.text])
) as Record<JiraStatus, string>;

const STATUS_LABELS: Record<JiraStatus, string> = {
  "TO DO": "To Do",
  "IN PROGRESS": "In Progress",
  TEST: "Test",
  DONE: "Done",
  DEPRECATED: "Deprecated",
};

// Display order for status bars: done first, then working backwards
const STATUS_ORDER: JiraStatus[] = ["DONE", "TEST", "IN PROGRESS", "TO DO"];

interface SprintAnalyticsProps {
  tickets: Ticket[];
  onClose?: () => void;
  sprintId?: string | null;
}

export const SprintAnalytics = memo(function SprintAnalytics({ tickets, onClose, sprintId }: SprintAnalyticsProps) {
  const [expanded, setExpanded] = useState(true);
  const [assigneesExpanded, setAssigneesExpanded] = useState(false);

  const totalPoints = useMemo(
    () => tickets.reduce((sum, t) => sum + (t.storyPoints || 0), 0),
    [tickets],
  );

  // Story points distribution by status
  const pointsByStatus = useMemo(() => {
    const map: Record<JiraStatus, number> = {
      "TO DO": 0,
      "IN PROGRESS": 0,
      TEST: 0,
      DONE: 0,
      DEPRECATED: 0,
    };
    tickets.forEach((t) => {
      map[t.jiraStatus] += t.storyPoints || 0;
    });
    return map;
  }, [tickets]);

  // Points by assignee
  const pointsByAssignee = useMemo(() => {
    const map: Record<string, { name: string; points: number; color: string }> = {};
    tickets.forEach((t) => {
      if (t.assignee && t.storyPoints) {
        const key = t.assignee.name;
        if (!map[key]) {
          map[key] = { name: key, points: 0, color: t.assignee.color };
        }
        map[key].points += t.storyPoints;
      }
    });
    return Object.values(map).sort((a, b) => b.points - a.points);
  }, [tickets]);

  const maxAssigneePoints = pointsByAssignee.length > 0
    ? Math.max(...pointsByAssignee.map((a) => a.points))
    : 0;

  // BV aggregates (exclude BV=0/null and DEPRECATED tickets)
  const bvScoredTickets = useMemo(
    () => tickets.filter((t) => t.businessValue != null && t.businessValue >= 1 && t.jiraStatus !== "DEPRECATED"),
    [tickets],
  );
  const bvTotal = useMemo(() => bvScoredTickets.reduce((sum, t) => sum + (t.businessValue ?? 0), 0), [bvScoredTickets]);
  const bvAvg = bvScoredTickets.length > 0 ? (bvTotal / bvScoredTickets.length).toFixed(1) : null;

  // BV distribution by status
  const bvByStatus = useMemo(() => {
    const map: Record<JiraStatus, number> = {
      "TO DO": 0,
      "IN PROGRESS": 0,
      TEST: 0,
      DONE: 0,
      DEPRECATED: 0,
    };
    bvScoredTickets.forEach((t) => {
      map[t.jiraStatus] += t.businessValue ?? 0;
    });
    return map;
  }, [bvScoredTickets]);

  // BV by assignee
  const bvByAssignee = useMemo(() => {
    const map: Record<string, { name: string; value: number; color: string }> = {};
    bvScoredTickets.forEach((t) => {
      if (t.assignee) {
        const key = t.assignee.name;
        if (!map[key]) {
          map[key] = { name: key, value: 0, color: t.assignee.color };
        }
        map[key].value += t.businessValue ?? 0;
      }
    });
    return Object.values(map).sort((a, b) => b.value - a.value);
  }, [bvScoredTickets]);

  const maxAssigneeBv = bvByAssignee.length > 0
    ? Math.max(...bvByAssignee.map((a) => a.value))
    : 0;

  // Totals excluding DEPRECATED for status bars
  const totalPointsForBar = useMemo(
    () => STATUS_ORDER.reduce((sum, s) => sum + pointsByStatus[s], 0),
    [pointsByStatus],
  );
  const totalBvForBar = useMemo(
    () => STATUS_ORDER.reduce((sum, s) => sum + bvByStatus[s], 0),
    [bvByStatus],
  );

  if (totalPoints === 0 && bvTotal === 0) return null;

  return (
    <div className="border-b border-border-default">
      <div className="relative flex h-[44px] shrink-0 items-center">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex h-full w-full items-center gap-2 px-5 pr-10 text-xs text-text-tertiary cursor-pointer hover:text-text-secondary hover:bg-overlay-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-subtle"
      >
        <ChevronRight
          className={`h-3 w-3 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          strokeWidth={1.5}
        />
        <BarChart2 className="h-3.5 w-3.5" strokeWidth={1.5} />
        Analytics
        <span className="text-text-muted">
          {totalPoints > 0 && <>{totalPoints} pts total</>}
          {totalPoints > 0 && bvTotal > 0 && " | "}
          {bvTotal > 0 && <>BV: {bvTotal}{bvAvg ? ` avg ${bvAvg}` : ""}</>}
        </span>
      </button>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-overlay-strong"
          title="Close analytics"
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      )}
      </div>

      {expanded && (
        <div className="px-5 pb-3 pt-1">
          {/* Story points by status */}
          {totalPoints > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-caption uppercase tracking-wider text-text-muted">Story Points by status</div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-overlay-subtle">
                {STATUS_ORDER.map((status) => {
                  const pts = pointsByStatus[status];
                  if (pts === 0 || totalPointsForBar === 0) return null;
                  const pct = (pts / totalPointsForBar) * 100;
                  return (
                    <div
                      key={status}
                      className="h-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: STATUS_COLORS[status],
                        opacity: 0.7,
                      }}
                      title={`${STATUS_LABELS[status]}: ${pts} pts (${Math.round(pct)}%)`}
                    />
                  );
                })}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {STATUS_ORDER.map((status) => {
                  const pts = pointsByStatus[status];
                  if (pts === 0) return null;
                  return (
                    <span key={status} className="flex items-center gap-1 text-caption text-text-tertiary">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[status] }}
                      />
                      {STATUS_LABELS[status]} {pts}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Business Value by status */}
          {bvTotal > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-caption uppercase tracking-wider text-text-muted">Business Value by status</div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-overlay-subtle">
                {STATUS_ORDER.map((status) => {
                  const bv = bvByStatus[status];
                  if (bv === 0 || totalBvForBar === 0) return null;
                  const pct = (bv / totalBvForBar) * 100;
                  return (
                    <div
                      key={status}
                      className="h-full"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: STATUS_COLORS[status],
                        opacity: 0.7,
                      }}
                      title={`${STATUS_LABELS[status]}: ${bv} BV (${Math.round(pct)}%)`}
                    />
                  );
                })}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {STATUS_ORDER.map((status) => {
                  const bv = bvByStatus[status];
                  if (bv === 0) return null;
                  return (
                    <span key={status} className="flex items-center gap-1 text-caption text-text-tertiary">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: STATUS_COLORS[status] }}
                      />
                      {STATUS_LABELS[status]} {bv}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Collapsible assignee sections */}
          {(pointsByAssignee.length > 0 || bvByAssignee.length > 0) && (
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setAssigneesExpanded(!assigneesExpanded)}
                className="mb-1.5 flex items-center gap-1 text-caption uppercase tracking-wider text-text-muted cursor-pointer hover:text-text-tertiary"
              >
                <ChevronRight
                  className={`h-2.5 w-2.5 transition-transform duration-150 ${assigneesExpanded ? "rotate-90" : ""}`}
                  strokeWidth={1.5}
                />
                By assignee
              </button>

              {assigneesExpanded && (
                <div className="space-y-3">
                  {/* Story Points by assignee */}
                  {pointsByAssignee.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-caption uppercase tracking-wider text-text-muted">Story Points by assignee</div>
                      <div className="space-y-1">
                        {pointsByAssignee.map((a) => (
                          <div key={a.name} className="flex items-center gap-2">
                            <span className="w-20 truncate text-label text-text-tertiary">{a.name.split(" ")[0]}</span>
                            <div className="flex-1">
                              <div
                                className="h-2 rounded-full"
                                style={{
                                  width: `${(a.points / maxAssigneePoints) * 100}%`,
                                  backgroundColor: a.color,
                                  opacity: 0.5,
                                  minWidth: 4,
                                }}
                              />
                            </div>
                            <span className="w-6 text-right text-caption tabular-nums text-text-tertiary">{a.points}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Business Value by assignee */}
                  {bvByAssignee.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-caption uppercase tracking-wider text-text-muted">Business Value by assignee</div>
                      <div className="space-y-1">
                        {bvByAssignee.map((a) => (
                          <div key={a.name} className="flex items-center gap-2">
                            <span className="w-20 truncate text-label text-text-tertiary">{a.name.split(" ")[0]}</span>
                            <div className="flex-1">
                              <div
                                className="h-2 rounded-full"
                                style={{
                                  width: `${(a.value / maxAssigneeBv) * 100}%`,
                                  backgroundColor: a.color,
                                  opacity: 0.5,
                                  minWidth: 4,
                                }}
                              />
                            </div>
                            <span className="w-6 text-right text-caption tabular-nums text-text-tertiary">{a.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Burnup chart */}
          {sprintId && sprintId !== "__all__" && (totalPoints > 0 || bvTotal > 0) && (
            <BurnupChart
              sprintId={sprintId}
              totalSp={totalPoints}
              totalBv={bvTotal}
            />
          )}
        </div>
      )}
    </div>
  );
});
