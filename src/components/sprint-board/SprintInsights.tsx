"use client";

import { useState } from "react";
import type { Ticket } from "@/types/ticket";
import { Clock, ChevronDown } from "lucide-react";
import { Card } from "@/components/shared/Card";

// ---------------------------------------------------------------------------
// Insight computation from existing ticket data
// ---------------------------------------------------------------------------

interface InsightData {
  staleStories: number;
  unreviewedTickets: number;
  blockedItems: number;
  avgQualityScore: number | null;
  totalTickets: number;
}

function computeInsights(tickets: Ticket[]): InsightData {
  const staleStories = tickets.filter((t) => t.editState === "conflict").length;
  const unreviewedTickets = tickets.filter((t) => t.qualityScore === null).length;
  const blockedItems = tickets.filter((t) => t.flagged).length;

  const scoredTickets = tickets.filter((t) => t.qualityScore !== null);
  const avgQualityScore =
    scoredTickets.length > 0
      ? Math.round(
          scoredTickets.reduce((sum, t) => sum + (t.qualityScore ?? 0), 0) /
            scoredTickets.length,
        )
      : null;

  return {
    staleStories,
    unreviewedTickets,
    blockedItems,
    avgQualityScore,
    totalTickets: tickets.length,
  };
}

function getInsightColor(value: number, threshold: { warn: number; danger: number }): string {
  if (value >= threshold.danger) return "#e5534b";
  if (value >= threshold.warn) return "#ea8744";
  return "#4aaa60";
}

function getScoreColor(score: number): string {
  if (score < 30) return "#e5534b";
  if (score < 70) return "#ea8744";
  return "#4aaa60";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SprintInsights({ tickets }: { tickets: Ticket[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const insights = computeInsights(tickets);

  return (
    <div className="rounded-lg border border-white/[0.06] bg-[var(--color-surface-elevated)]">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/[0.02] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)]"
        style={{ transition: "background-color 0.15s ease" }}
      >
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-white/30" strokeWidth={1.5} />
          <span className="text-xs font-semibold text-white/60">Sprint Insights</span>
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-white/[0.06] px-1 text-caption tabular-nums text-white/30">
            {insights.totalTickets}
          </span>
        </div>
        <ChevronDown
          className={`h-3 w-3 text-white/25 ${collapsed ? "rotate-180" : ""}`}
          strokeWidth={1.5}
          style={{ transition: "transform 0.2s ease" }}
        />
      </button>

      {!collapsed && (
        <div className="border-t border-white/[0.04] px-4 py-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Stale stories */}
            <Card variant="subtle" className="px-3 py-2.5">
              <div className="text-caption font-medium uppercase tracking-wider text-white/25">
                Stale Stories
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  className="text-lg font-semibold tabular-nums"
                  style={{ color: getInsightColor(insights.staleStories, { warn: 2, danger: 5 }) }}
                >
                  {insights.staleStories}
                </span>
                <span className="text-caption text-white/20">outdated scores</span>
              </div>
            </Card>

            {/* Unreviewed */}
            <Card variant="subtle" className="px-3 py-2.5">
              <div className="text-caption font-medium uppercase tracking-wider text-white/25">
                Unreviewed
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  className="text-lg font-semibold tabular-nums"
                  style={{ color: getInsightColor(insights.unreviewedTickets, { warn: 3, danger: 6 }) }}
                >
                  {insights.unreviewedTickets}
                </span>
                <span className="text-caption text-white/20">no score</span>
              </div>
            </Card>

            {/* Blocked */}
            <Card variant="subtle" className="px-3 py-2.5">
              <div className="text-caption font-medium uppercase tracking-wider text-white/25">
                Blocked
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  className="text-lg font-semibold tabular-nums"
                  style={{ color: getInsightColor(insights.blockedItems, { warn: 1, danger: 3 }) }}
                >
                  {insights.blockedItems}
                </span>
                <span className="text-caption text-white/20">flagged</span>
              </div>
            </Card>

            {/* Average quality */}
            <Card variant="subtle" className="px-3 py-2.5">
              <div className="text-caption font-medium uppercase tracking-wider text-white/25">
                Avg Quality
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                {insights.avgQualityScore !== null ? (
                  <>
                    <span
                      className="text-lg font-semibold tabular-nums"
                      style={{ color: getScoreColor(insights.avgQualityScore) }}
                    >
                      {insights.avgQualityScore}
                    </span>
                    <span className="text-caption text-white/20">/100</span>
                  </>
                ) : (
                  <span className="text-sm text-white/15">--</span>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
