"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import type { Ticket, JiraStatus } from "@/types/ticket";
import { getEpicColor } from "@/types/ticket";
import { STATUS_PILL_COLORS } from "@/components/sprint-board/SprintStatPill";
import { IssueTypeIcon, ISSUE_TYPE_COLORS } from "@/components/shared/IssueTypeIcon";
import { AlertTriangle, X } from "lucide-react";

const STATUS_ORDER: JiraStatus[] = ["DONE", "TEST", "IN PROGRESS", "TO DO"];
const STATUS_LABELS: Record<string, string> = {
  "TO DO": "To Do",
  "IN PROGRESS": "In Progress",
  TEST: "Test",
  DONE: "Done",
};

interface SprintStatsPopoverProps {
  allTickets: Ticket[];
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function SprintStatsPopover({ allTickets, onClose, anchorRef }: SprintStatsPopoverProps) {
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
    const nonDeprecatedCount = allTickets.filter((t) => t.jiraStatus !== "DEPRECATED").length;

    const typeEntries = Object.entries(typeMap).sort((a, b) => b[1].sp - a[1].sp);
    const epicEntries = Object.entries(epicMap).sort((a, b) => b[1].sp - a[1].sp);
    const hasRealEpics = allTickets.some((t) => t.epic != null && t.jiraStatus !== "DEPRECATED");

    return { totalSp, totalBv, bvScoredCount, bvAvg, spAvg, noPointsCount, nonDeprecatedCount, statusMap, typeEntries, epicEntries, hasRealEpics };
  }, [allTickets]);

  // Fixed positioning relative to anchor, clamped to viewport
  const maxWidth = 720;
  const gap = 8;
  const margin = 16;
  const [pos, setPos] = useState<{ top: number | undefined; bottom: number | undefined; left: number; width: number }>({
    top: 0, bottom: undefined, left: 0, width: maxWidth,
  });

  useEffect(() => {
    function updatePos() {
      if (!anchorRef.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;

      const effectiveWidth = Math.min(maxWidth, vw - margin * 2);
      const anchorCenter = rect.left + rect.width / 2;
      const idealLeft = anchorCenter - effectiveWidth / 2;
      const clampedLeft = Math.min(Math.max(margin, idealLeft), vw - effectiveWidth - margin);

      const spaceBelow = vh - rect.bottom - gap;
      const maxPopoverHeight = vh * 0.8;
      const showAbove = spaceBelow < Math.min(maxPopoverHeight, 400) && rect.top > spaceBelow;

      setPos({
        top: showAbove ? undefined : rect.bottom + gap,
        bottom: showAbove ? vh - rect.top + gap : undefined,
        left: clampedLeft,
        width: effectiveWidth,
      });
    }
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [anchorRef]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, anchorRef]);

  const maxStatusCount = Math.max(...STATUS_ORDER.map((s) => stats.statusMap[s]?.count ?? 0), 1);
  const maxTypeSp = Math.max(...stats.typeEntries.map(([, d]) => d.sp), 1);
  const maxEpicSp = Math.max(...stats.epicEntries.map(([, d]) => d.sp), 1);

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 overflow-y-auto rounded-xl border border-border-strong bg-[var(--color-surface-floating)]"
      style={{
        top: pos.top,
        bottom: pos.bottom,
        left: pos.left,
        width: pos.width,
        maxHeight: "80vh",
        boxShadow: "0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.12)",
        opacity: mounted ? 1 : 0,
        transform: mounted ? "scale(1) translateY(0)" : "scale(0.98) translateY(-4px)",
        transition: "opacity 180ms ease-out, transform 180ms ease-out",
        transformOrigin: "top center",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h3 className="text-[13px] font-semibold text-text-primary tracking-tight">Sprint Statistics</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default active:bg-overlay-strong transition-colors duration-100"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="px-5 pb-4">
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard label="Items" value={allTickets.length} />
          <SummaryCard label="Story Points" value={stats.totalSp} sub={stats.spAvg ? `avg ${stats.spAvg}` : undefined} />
          <SummaryCard label="Business Value" value={stats.totalBv} sub={stats.bvAvg ? `avg ${stats.bvAvg}` : undefined} />
        </div>
        {stats.noPointsCount > 0 && (
          <div className="flex items-center gap-1.5 mt-2.5 text-[11px]">
            <AlertTriangle size={11} strokeWidth={2} className="text-amber-400/70 shrink-0" />
            <span className="text-amber-400/70">{stats.noPointsCount} ticket{stats.noPointsCount > 1 ? "s" : ""} without estimate</span>
          </div>
        )}
      </div>

      {/* Two-column: Status + Type */}
      <div className="grid grid-cols-2 gap-0 border-t border-border-subtle">
        {/* Status breakdown */}
        <div className="px-5 py-3.5 border-r border-border-subtle">
          <SectionLabel>By Status</SectionLabel>
          <div className="space-y-2">
            {STATUS_ORDER.map((status) => {
              const ss = stats.statusMap[status];
              if (!ss || ss.count === 0) return null;
              const colors = STATUS_PILL_COLORS[status];
              const barColor = colors?.dot ?? colors?.text ?? "#94a3b8";
              const pct = (ss.count / maxStatusCount) * 100;
              return (
                <div key={status}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="h-[7px] w-[7px] rounded-full shrink-0" style={{ backgroundColor: barColor }} />
                      <span className="text-[11px] text-text-secondary">{STATUS_LABELS[status] ?? status}</span>
                    </div>
                    <div className="flex items-baseline gap-2 text-[11px] tabular-nums">
                      <span className="font-semibold text-text-primary">{ss.count}</span>
                      {ss.sp > 0 && <MetricChip value={ss.sp} unit="SP" />}
                      {ss.bv > 0 && <MetricChip value={ss.bv} unit="BV" />}
                    </div>
                  </div>
                  <div className="h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-overlay-default)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: barColor, opacity: 0.55, transition: "width 400ms ease-out" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Type breakdown */}
        <div className="px-5 py-3.5">
          <SectionLabel>By Type</SectionLabel>
          {stats.typeEntries.length > 0 ? (
            <div className="space-y-2">
              {stats.typeEntries.map(([typeName, data]) => {
                const barColor = ISSUE_TYPE_COLORS[typeName as keyof typeof ISSUE_TYPE_COLORS] ?? "#94a3b8";
                const pct = maxTypeSp > 0 ? (data.sp / maxTypeSp) * 100 : 0;
                return (
                  <div key={typeName}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <IssueTypeIcon type={typeName} size={12} />
                        <span className="text-[11px] text-text-secondary capitalize">{typeName}</span>
                      </div>
                      <div className="flex items-baseline gap-2 text-[11px] tabular-nums">
                        <span className="font-semibold text-text-primary">{data.count}</span>
                        {data.sp > 0 && <MetricChip value={data.sp} unit="SP" />}
                        {data.bv > 0 && <MetricChip value={data.bv} unit="BV" />}
                      </div>
                    </div>
                    <div className="h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-overlay-default)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: barColor, opacity: 0.5, transition: "width 400ms ease-out" }}
                      />
                    </div>
                  </div>
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
        <div className="px-5 py-3.5 border-t border-border-subtle">
          <SectionLabel>By Epic</SectionLabel>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {stats.epicEntries.map(([epicName, data]) => {
              const epicColor = epicName === "No Epic" ? { text: "#6b7280", bg: "rgba(107,114,128,0.12)" } : getEpicColor(epicName);
              const pct = maxEpicSp > 0 ? (data.sp / maxEpicSp) * 100 : 0;
              return (
                <div key={epicName}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="h-[7px] w-[7px] rounded-full shrink-0" style={{ backgroundColor: epicColor.text }} />
                      <span className="text-[11px] text-text-secondary truncate">{epicName}</span>
                    </div>
                    <div className="flex items-baseline gap-2 text-[11px] tabular-nums shrink-0 ml-2">
                      <span className="font-semibold text-text-primary">{data.count}</span>
                      {data.sp > 0 && <MetricChip value={data.sp} unit="SP" />}
                      {data.bv > 0 && <MetricChip value={data.bv} unit="BV" />}
                    </div>
                  </div>
                  <div className="h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-overlay-default)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: epicColor.text, opacity: 0.45, transition: "width 400ms ease-out" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bottom padding */}
      <div className="h-1" />
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ backgroundColor: "var(--color-overlay-subtle)" }}>
      <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[18px] font-semibold text-text-primary tabular-nums leading-none">{value}</span>
        {sub && <span className="text-[10px] text-text-muted">{sub}</span>}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-2.5">{children}</div>
  );
}

function MetricChip({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="flex items-center gap-0.5">
      <span className="text-text-tertiary">{value}</span>
      <span className="text-[10px] uppercase text-text-muted tracking-wide">{unit}</span>
    </span>
  );
}
