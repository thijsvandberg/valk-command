"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import type { Ticket, JiraStatus } from "@/types/ticket";
import { getEpicColor } from "@/types/ticket";
import { STATUS_PILL_COLORS } from "@/components/sprint-board/SprintStatPill";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { AlertTriangle } from "lucide-react";

const STATUS_ORDER: JiraStatus[] = ["DONE", "TEST", "IN PROGRESS", "TO DO"];

interface SprintStatsPopoverProps {
  allTickets: Ticket[];
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function SprintStatsPopover({ allTickets, onClose, anchorRef }: SprintStatsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Aggregate stats from tickets
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

      // Status breakdown
      const s = statusMap[t.jiraStatus] ?? (statusMap[t.jiraStatus] = { count: 0, sp: 0, bv: 0 });
      s.count++;
      s.sp += sp;
      s.bv += t.businessValue ?? 0;

      // Type breakdown (exclude DEPRECATED)
      if (t.jiraStatus !== "DEPRECATED") {
        const typeName = t.type ?? "unknown";
        const te = typeMap[typeName] ?? (typeMap[typeName] = { count: 0, sp: 0, bv: 0 });
        te.count++;
        te.sp += sp;
        te.bv += t.businessValue ?? 0;
      }

      // Epic breakdown (exclude DEPRECATED)
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

  // Fixed positioning relative to anchor, clamped to viewport
  const maxWidth = 400;
  const gap = 8;
  const margin = 12;
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
      const maxPopoverHeight = vh * 0.7;
      const showAbove = spaceBelow < Math.min(maxPopoverHeight, 300) && rect.top > spaceBelow;

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

  // Click outside and Escape to close
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

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 overflow-y-auto rounded-lg border border-border-strong bg-[var(--color-surface-floating)]"
      style={{
        top: pos.top,
        bottom: pos.bottom,
        left: pos.left,
        width: pos.width,
        maxHeight: "70vh",
        boxShadow: "var(--shadow-popover)",
        opacity: mounted ? 1 : 0,
        transform: mounted ? "scale(1)" : "scale(0.97)",
        transition: "opacity 150ms ease-out, transform 150ms ease-out",
        transformOrigin: "top center",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-4 tabular-nums text-[12px]">
        {/* Summary section */}
        <div className="flex flex-col gap-1.5">
          <SummaryRow label="Items" value={allTickets.length} />
          <SummaryRow label="Story Points" value={stats.totalSp} avg={stats.spAvg} />
          {stats.bvScoredCount > 0 && (
            <SummaryRow label="Business Value" value={stats.totalBv} avg={stats.bvAvg} />
          )}
          {stats.noPointsCount > 0 && (
            <div className="flex items-center gap-1.5 pt-0.5 border-t border-border-subtle">
              <AlertTriangle size={10} strokeWidth={2} className="text-amber-400 shrink-0" />
              <span className="text-amber-400">{stats.noPointsCount} without estimate</span>
            </div>
          )}
        </div>

        {/* Status breakdown */}
        <div className="border-t border-border-subtle pt-2 mt-2">
          <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1.5">By Status</div>
          {STATUS_ORDER.map((status) => {
            const ss = stats.statusMap[status];
            if (!ss || ss.count === 0) return null;
            const colors = STATUS_PILL_COLORS[status];
            return (
              <div key={status} className="flex items-center justify-between gap-4 py-[3px]">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: colors?.dot ?? colors?.text ?? "#94a3b8" }} />
                  <span className="text-text-secondary">{status}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-text-primary">{ss.count}</span>
                  {ss.sp > 0 && <MetricChip value={ss.sp} unit="SP" />}
                  {ss.bv > 0 && <MetricChip value={ss.bv} unit="BV" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Type breakdown */}
        {stats.typeEntries.length > 0 && (
          <div className="border-t border-border-subtle pt-2 mt-2">
            <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1.5">By Type</div>
            {stats.typeEntries.map(([typeName, data]) => (
              <div key={typeName} className="flex items-center justify-between gap-4 py-[3px]">
                <div className="flex items-center gap-1.5">
                  <IssueTypeIcon type={typeName} size={12} />
                  <span className="text-text-secondary capitalize">{typeName}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-text-primary">{data.count}</span>
                  {data.sp > 0 && <MetricChip value={data.sp} unit="SP" />}
                  {data.bv > 0 && <MetricChip value={data.bv} unit="BV" />}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Epic breakdown */}
        {stats.hasRealEpics && stats.epicEntries.length > 0 && (
          <div className="border-t border-border-subtle pt-2 mt-2">
            <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1.5">By Epic</div>
            {stats.epicEntries.map(([epicName, data]) => {
              const epicColor = epicName === "No Epic" ? { text: "#6b7280" } : getEpicColor(epicName);
              return (
                <div key={epicName} className="flex items-center justify-between gap-4 py-[3px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: epicColor.text }} />
                    <span className="text-text-secondary truncate">{epicName}</span>
                  </div>
                  <div className="flex items-baseline gap-2 shrink-0">
                    <span className="font-semibold text-text-primary">{data.count}</span>
                    {data.sp > 0 && <MetricChip value={data.sp} unit="SP" />}
                    {data.bv > 0 && <MetricChip value={data.bv} unit="BV" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, avg }: { label: string; value: number; avg?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-text-tertiary">{label}</span>
      <span>
        <span className="font-semibold text-text-primary">{value}</span>
        {avg && <span className="text-text-muted ml-1">avg {avg}</span>}
      </span>
    </div>
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
