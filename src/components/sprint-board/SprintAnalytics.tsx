"use client";

import { useState, useMemo } from "react";
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

interface SprintAnalyticsProps {
  tickets: Ticket[];
  onClose?: () => void;
  sprintId?: string | null;
}

export function SprintAnalytics({ tickets, onClose, sprintId }: SprintAnalyticsProps) {
  const [expanded, setExpanded] = useState(true);

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

  if (totalPoints === 0 && bvTotal === 0) return null;

  return (
    <div className="border-b border-border-default">
      <div className="relative">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-5 py-2 pr-10 text-xs text-white/40 cursor-pointer hover:text-white/60 hover:bg-white/[0.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.03]"
      >
        <ChevronRight
          className={`h-3 w-3 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          strokeWidth={1.5}
        />
        <BarChart2 className="h-3.5 w-3.5" strokeWidth={1.5} />
        Analytics
        <span className="text-white/20">
          {totalPoints > 0 && <>{totalPoints} pts total</>}
          {totalPoints > 0 && bvTotal > 0 && " | "}
          {bvTotal > 0 && <>BV: {bvTotal}{bvAvg ? ` avg ${bvAvg}` : ""}</>}
        </span>
      </button>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/25 cursor-pointer hover:text-white/50 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:bg-white/[0.08]"
          title="Close analytics"
        >
          <X size={13} strokeWidth={1.5} />
        </button>
      )}
      </div>

      {expanded && (
        <div className="px-5 pb-3 pt-1">
          {/* Story points distribution bar */}
          {totalPoints > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-caption uppercase tracking-wider text-white/25">Points by status</div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.04]">
                {(Object.keys(STATUS_COLORS) as JiraStatus[]).map((status) => {
                  const pts = pointsByStatus[status];
                  if (pts === 0) return null;
                  const pct = (pts / totalPoints) * 100;
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
                {(Object.keys(STATUS_COLORS) as JiraStatus[]).map((status) => {
                  const pts = pointsByStatus[status];
                  if (pts === 0) return null;
                  return (
                    <span key={status} className="flex items-center gap-1 text-caption text-white/40">
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

          {/* BV distribution by status */}
          {bvTotal > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-caption uppercase tracking-wider text-white/25">BV by status</div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.04]">
                {(Object.keys(STATUS_COLORS) as JiraStatus[]).map((status) => {
                  const bv = bvByStatus[status];
                  if (bv === 0) return null;
                  const pct = (bv / bvTotal) * 100;
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
                {(Object.keys(STATUS_COLORS) as JiraStatus[]).map((status) => {
                  const bv = bvByStatus[status];
                  if (bv === 0) return null;
                  return (
                    <span key={status} className="flex items-center gap-1 text-caption text-white/40">
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

          {/* Points by assignee */}
          {pointsByAssignee.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-caption uppercase tracking-wider text-white/25">Points by assignee</div>
              <div className="space-y-1">
                {pointsByAssignee.map((a) => (
                  <div key={a.name} className="flex items-center gap-2">
                    <span className="w-20 truncate text-label text-white/40">{a.name.split(" ")[0]}</span>
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
                    <span className="w-6 text-right text-caption tabular-nums text-white/30">{a.points}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* BV by assignee */}
          {bvByAssignee.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-caption uppercase tracking-wider text-white/25">BV by assignee</div>
              <div className="space-y-1">
                {bvByAssignee.map((a) => (
                  <div key={a.name} className="flex items-center gap-2">
                    <span className="w-20 truncate text-label text-white/40">{a.name.split(" ")[0]}</span>
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
                    <span className="w-6 text-right text-caption tabular-nums text-white/30">{a.value}</span>
                  </div>
                ))}
              </div>
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
}
