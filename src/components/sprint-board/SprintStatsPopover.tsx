"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import type { Ticket, JiraStatus } from "@/types/ticket";
import { getEpicColor } from "@/types/ticket";
import { STATUS_PILL_COLORS } from "@/components/sprint-board/SprintStatPill";
import { IssueTypeIcon, ISSUE_TYPE_COLORS } from "@/components/shared/IssueTypeIcon";
import { AlertTriangle, X, Calendar } from "lucide-react";

const STATUS_ORDER: JiraStatus[] = ["DONE", "TEST", "IN PROGRESS", "TO DO"];
const STATUS_LABELS: Record<string, string> = {
  "TO DO": "To Do",
  "IN PROGRESS": "In Progress",
  TEST: "Test",
  DONE: "Done",
};

interface SprintStatsPopoverProps {
  allTickets: Ticket[];
  sprintName?: string;
  workingDaysRemaining?: number | null;
  totalWorkingDays?: number | null;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  onFilterStatus?: (status: string) => void;
  onFilterType?: (type: string) => void;
  onFilterEpic?: (epic: string) => void;
}

export function SprintStatsPopover({
  allTickets,
  sprintName,
  workingDaysRemaining,
  totalWorkingDays,
  onClose,
  anchorRef,
  onFilterStatus,
  onFilterType,
  onFilterEpic,
}: SprintStatsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  const stats = useMemo(() => {
    let totalSp = 0;
    let totalBv = 0;
    let bvScoredCount = 0;
    let noPointsCount = 0;
    const statusMap: Record<string, { count: number; sp: number; bv: number }> = {};
    const typeMap: Record<string, { count: number; sp: number; bv: number }> = {};
    const epicMap: Record<string, { name: string; count: number; sp: number; bv: number }> = {};

    for (const t of allTickets) {
      const sp = t.storyPoints ?? 0;
      totalSp += sp;

      if (t.businessValue != null && t.businessValue >= 1 && t.jiraStatus !== "DEPRECATED") {
        totalBv += t.businessValue;
        bvScoredCount++;
      }

      if (t.storyPoints == null && t.jiraStatus !== "DEPRECATED" && t.type !== "spike") {
        noPointsCount++;
      }

      const s = statusMap[t.jiraStatus] ?? (statusMap[t.jiraStatus] = { count: 0, sp: 0, bv: 0 });
      s.count++;
      s.sp += sp;
      s.bv += t.businessValue ?? 0;

      if (t.jiraStatus !== "DEPRECATED") {
        const typeName = t.type ?? "unknown";
        const te = typeMap[typeName] ?? (typeMap[typeName] = { count: 0, sp: 0, bv: 0 });
        te.count++;
        te.sp += sp;
        te.bv += t.businessValue ?? 0;
      }

      if (t.jiraStatus !== "DEPRECATED") {
        const epicName = t.epic ?? "No Epic";
        const ee = epicMap[epicName] ?? (epicMap[epicName] = { name: epicName, count: 0, sp: 0, bv: 0 });
        ee.count++;
        ee.sp += sp;
        ee.bv += t.businessValue ?? 0;
      }
    }

    const spScoredCount = allTickets.filter((t) => t.storyPoints != null && t.storyPoints > 0).length;
    const spAvg = spScoredCount > 0 ? (totalSp / spScoredCount).toFixed(1) : null;
    const bvAvg = bvScoredCount > 0 ? (totalBv / bvScoredCount).toFixed(1) : null;

    const typeEntries = Object.entries(typeMap).sort((a, b) => b[1].sp - a[1].sp);
    const epicEntries = Object.entries(epicMap).sort((a, b) => b[1].sp - a[1].sp);
    const hasRealEpics = allTickets.some((t) => t.epic != null && t.jiraStatus !== "DEPRECATED");

    return { totalSp, totalBv, bvScoredCount, bvAvg, spAvg, noPointsCount, statusMap, typeEntries, epicEntries, hasRealEpics };
  }, [allTickets]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleFilterClick = useCallback((type: "status" | "type" | "epic", value: string) => {
    if (type === "status") onFilterStatus?.(value);
    else if (type === "type") onFilterType?.(value);
    else if (type === "epic") onFilterEpic?.(value);
    onClose();
  }, [onFilterStatus, onFilterType, onFilterEpic, onClose]);

  // Bar proportions
  const maxStatusSp = Math.max(...STATUS_ORDER.map((s) => stats.statusMap[s]?.sp ?? 0), 1);
  const maxTypeSp = Math.max(...stats.typeEntries.map(([, d]) => d.sp), 1);
  const maxEpicSp = Math.max(...stats.epicEntries.map(([, d]) => d.sp), 1);

  // Sprint time
  const daysElapsed = totalWorkingDays != null && workingDaysRemaining != null ? totalWorkingDays - workingDaysRemaining : null;
  const timePct = totalWorkingDays != null && totalWorkingDays > 0 && daysElapsed != null ? Math.round((daysElapsed / totalWorkingDays) * 100) : null;
  const isLastDays = workingDaysRemaining != null && workingDaysRemaining <= 2;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{
          backgroundColor: "rgba(0,0,0,0.25)",
          opacity: mounted ? 1 : 0,
          transition: "opacity 180ms ease-out",
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={popoverRef}
        className="fixed z-50 overflow-y-auto rounded-xl border border-border-strong bg-[var(--color-surface-floating)]"
        style={{
          top: "50%",
          left: "50%",
          transform: mounted ? "translate(-50%, -50%) scale(1)" : "translate(-50%, -50%) scale(0.97)",
          width: "min(760px, calc(100vw - 48px))",
          maxHeight: "min(85vh, 680px)",
          boxShadow: "0 16px 64px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.2)",
          opacity: mounted ? 1 : 0,
          transition: "opacity 180ms ease-out, transform 180ms ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-text-primary tracking-tight">
              {sprintName ?? "Sprint Statistics"}
            </h3>
            {workingDaysRemaining != null && totalWorkingDays != null && totalWorkingDays > 0 && (
              <div className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ${isLastDays ? "text-amber-400/90" : "text-text-muted"}`} style={{ backgroundColor: isLastDays ? "rgba(234,179,8,0.08)" : "var(--color-overlay-subtle)" }}>
                <Calendar size={11} strokeWidth={1.5} />
                <span className="tabular-nums">
                  {workingDaysRemaining === 0 ? "Last day" : `${workingDaysRemaining} day${workingDaysRemaining !== 1 ? "s" : ""} left`}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default active:bg-overlay-strong transition-colors duration-100"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Sprint time progress bar */}
        {timePct != null && totalWorkingDays != null && daysElapsed != null && (
          <div className="px-6 pt-2 pb-1">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-overlay-default)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(timePct, 100)}%`,
                    backgroundColor: isLastDays ? "rgba(234,179,8,0.6)" : "var(--color-text-muted)",
                    opacity: 0.5,
                    transition: "width 400ms ease-out",
                  }}
                />
              </div>
              <span className={`text-[10px] tabular-nums shrink-0 ${isLastDays ? "text-amber-400/60" : "text-text-muted"}`}>
                day {daysElapsed}/{totalWorkingDays}
              </span>
            </div>
          </div>
        )}

        {/* Summary cards */}
        <div className="px-6 pt-3 pb-5">
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard label="Items" value={allTickets.length} />
            <SummaryCard label="Story Points" value={stats.totalSp} sub={stats.spAvg ? `avg ${stats.spAvg}` : undefined} />
            <SummaryCard label="Business Value" value={stats.totalBv} sub={stats.bvAvg ? `avg ${stats.bvAvg}` : undefined} />
          </div>
          {stats.noPointsCount > 0 && (
            <div className="flex items-center gap-1.5 mt-3 text-[11px]">
              <AlertTriangle size={11} strokeWidth={2} className="text-amber-400/70 shrink-0" />
              <span className="text-amber-400/70">{stats.noPointsCount} ticket{stats.noPointsCount > 1 ? "s" : ""} without estimate</span>
            </div>
          )}
        </div>

        {/* Two-column: Status + Type */}
        <div className="grid grid-cols-2 gap-0 border-t border-border-subtle">
          {/* Status breakdown */}
          <div className="px-6 py-4 border-r border-border-subtle">
            <SectionLabel>By Status</SectionLabel>
            <div className="space-y-3">
              {STATUS_ORDER.map((status) => {
                const ss = stats.statusMap[status];
                if (!ss || ss.count === 0) return null;
                const colors = STATUS_PILL_COLORS[status];
                const barColor = colors?.dot ?? colors?.text ?? "#94a3b8";
                const pct = (ss.sp / maxStatusSp) * 100;
                return (
                  <FilterRow
                    key={status}
                    accentColor={barColor}
                    onClick={onFilterStatus ? () => handleFilterClick("status", status) : undefined}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: barColor }} />
                        <span className="text-[11px] font-medium text-text-secondary">{STATUS_LABELS[status] ?? status}</span>
                      </div>
                      <RowMetrics count={ss.count} sp={ss.sp} bv={ss.bv} />
                    </div>
                    <BarTrack>
                      <Bar pct={pct} color={barColor} opacity={0.5} />
                    </BarTrack>
                  </FilterRow>
                );
              })}
            </div>
          </div>

          {/* Type breakdown */}
          <div className="px-6 py-4">
            <SectionLabel>By Type</SectionLabel>
            {stats.typeEntries.length > 0 ? (
              <div className="space-y-3">
                {stats.typeEntries.map(([typeName, data]) => {
                  const barColor = ISSUE_TYPE_COLORS[typeName as keyof typeof ISSUE_TYPE_COLORS] ?? "#94a3b8";
                  const pct = maxTypeSp > 0 ? (data.sp / maxTypeSp) * 100 : 0;
                  return (
                    <FilterRow
                      key={typeName}
                      accentColor={barColor}
                      onClick={onFilterType ? () => handleFilterClick("type", typeName) : undefined}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <IssueTypeIcon type={typeName} size={13} />
                          <span className="text-[11px] font-medium text-text-secondary capitalize">{typeName}</span>
                        </div>
                        <RowMetrics count={data.count} sp={data.sp} bv={data.bv} />
                      </div>
                      <BarTrack>
                        <Bar pct={pct} color={barColor} opacity={0.45} />
                      </BarTrack>
                    </FilterRow>
                  );
                })}
              </div>
            ) : (
              <span className="text-[11px] text-text-muted">No data</span>
            )}
          </div>
        </div>

        {/* Epic breakdown (full width) */}
        {stats.hasRealEpics && stats.epicEntries.length > 0 && (
          <div className="px-6 py-4 border-t border-border-subtle">
            <SectionLabel>By Epic</SectionLabel>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {stats.epicEntries.map(([epicName, data]) => {
                const isNoEpic = epicName === "No Epic";
                const epicColor = isNoEpic ? { text: "#6b7280", bg: "rgba(107,114,128,0.12)" } : getEpicColor(epicName);
                const pct = maxEpicSp > 0 ? (data.sp / maxEpicSp) * 100 : 0;
                return (
                  <FilterRow
                    key={epicName}
                    accentColor={epicColor.text}
                    onClick={!isNoEpic && onFilterEpic ? () => handleFilterClick("epic", epicName) : undefined}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: epicColor.text }} />
                        <span className="text-[11px] font-medium text-text-secondary truncate">{epicName}</span>
                      </div>
                      <RowMetrics count={data.count} sp={data.sp} bv={data.bv} />
                    </div>
                    <BarTrack>
                      <Bar pct={pct} color={epicColor.text} opacity={0.4} />
                    </BarTrack>
                  </FilterRow>
                );
              })}
            </div>
          </div>
        )}

        <div className="h-2" />
      </div>
    </>
  );
}

// -- Sub-components --

function SummaryCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg px-3.5 py-3" style={{ backgroundColor: "var(--color-overlay-subtle)" }}>
      <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1.5">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold text-text-primary tabular-nums leading-none">{value}</span>
        {sub && <span className="text-[10px] text-text-muted">{sub}</span>}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-3">{children}</div>
  );
}

function FilterRow({ children, onClick, accentColor }: { children: React.ReactNode; onClick?: () => void; accentColor?: string }) {
  if (!onClick) return <div>{children}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-md -mx-2 px-2 py-1.5 cursor-pointer transition-colors duration-100 hover:bg-[var(--color-overlay-subtle)]"
      style={{ borderLeft: "2px solid transparent" }}
      onMouseEnter={(e) => { if (accentColor) e.currentTarget.style.borderLeftColor = accentColor; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderLeftColor = "transparent"; }}
    >
      {children}
    </button>
  );
}

function RowMetrics({ count, sp, bv }: { count: number; sp: number; bv: number }) {
  return (
    <div className="flex items-baseline gap-2.5 text-[11px] tabular-nums shrink-0 ml-3">
      <span className="font-semibold text-text-primary min-w-[14px] text-right">{count}</span>
      {sp > 0 && <MetricChip value={sp} unit="SP" />}
      {bv > 0 && <MetricChip value={bv} unit="BV" />}
    </div>
  );
}

function MetricChip({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="flex items-center gap-0.5">
      <span className="text-text-tertiary">{value}</span>
      <span className="text-[9px] uppercase text-text-muted tracking-wide">{unit}</span>
    </span>
  );
}

function BarTrack({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-overlay-default)" }}>
      {children}
    </div>
  );
}

function Bar({ pct, color, opacity }: { pct: number; color: string; opacity: number }) {
  return (
    <div
      className="h-full rounded-full"
      style={{ width: `${pct}%`, backgroundColor: color, opacity, transition: "width 400ms ease-out" }}
    />
  );
}
