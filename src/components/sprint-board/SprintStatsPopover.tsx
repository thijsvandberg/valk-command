"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import useSWR from "swr";
import type { Ticket, JiraStatus, Sprint } from "@/types/ticket";
import { getEpicColor } from "@/types/ticket";
import { STATUS_PILL_COLORS, SprintCompletionBar } from "@/components/sprint-board/SprintStatPill";
import { IssueTypeIcon, ISSUE_TYPE_COLORS } from "@/components/shared/IssueTypeIcon";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { swrFetcher } from "@/lib/api-client";
import { AlertTriangle, X, Calendar, ChevronDown, Users, Loader2 } from "lucide-react";
import { computeWorkingDays } from "./sprint-stats-utils";
import { SummaryCard, SectionLabel, FilterRow, RowMetrics, BarTrack, Bar } from "./sprint-stats-parts";

const STATUS_ORDER: JiraStatus[] = ["DONE", "TEST", "IN PROGRESS", "TO DO"];
const STATUS_LABELS: Record<string, string> = {
  "TO DO": "To Do",
  "IN PROGRESS": "In Progress",
  TEST: "Test",
  DONE: "Done",
};

interface SprintStatsPopoverProps {
  /** Tickets for the initially selected sprint (avoids refetch for active sprint) */
  allTickets: Ticket[];
  sprintId?: string;
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
  sprintId: initialSprintId,
  sprintName,
  workingDaysRemaining: initialDaysRemaining,
  totalWorkingDays: initialTotalDays,
  onClose,
  anchorRef,
  onFilterStatus,
  onFilterType,
  onFilterEpic,
}: SprintStatsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(initialSprintId ?? null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isInitialSprint = selectedSprintId === initialSprintId || selectedSprintId === null;

  // Fetch sprint list for the dropdown
  const { sprints } = useJiraSprints();
  const visibleSprints = useMemo(() => {
    if (!sprints) return [];
    return sprints
      .filter((s) => !s.hidden)
      .sort((a, b) => {
        const stateOrder = { active: 0, future: 1, closed: 2 };
        const diff = (stateOrder[a.state as keyof typeof stateOrder] ?? 3) - (stateOrder[b.state as keyof typeof stateOrder] ?? 3);
        if (diff !== 0) return diff;
        return (b.startDate ?? "").localeCompare(a.startDate ?? "");
      });
  }, [sprints]);

  const selectedSprint = useMemo(() => {
    if (!selectedSprintId || !sprints) return undefined;
    return sprints.find((s) => String(s.id) === selectedSprintId);
  }, [selectedSprintId, sprints]);

  // Fetch tickets for non-initial sprint
  const fetchKey = !isInitialSprint && selectedSprintId
    ? `/api/tickets?sprintId=${encodeURIComponent(selectedSprintId)}`
    : null;
  const { data: fetchedTickets, isLoading: ticketsLoading } = useSWR<Ticket[]>(fetchKey, swrFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 15000,
  });

  const tickets = useMemo(
    () => isInitialSprint ? allTickets : (fetchedTickets ?? []),
    [isInitialSprint, allTickets, fetchedTickets],
  );
  const isLoading = !isInitialSprint && ticketsLoading;

  // Compute working days for selected sprint
  const { workingDaysRemaining, totalWorkingDays } = useMemo(() => {
    if (isInitialSprint) return { workingDaysRemaining: initialDaysRemaining, totalWorkingDays: initialTotalDays };
    if (!selectedSprint) return { workingDaysRemaining: null, totalWorkingDays: null };
    const mapped: Sprint = {
      id: String(selectedSprint.id),
      name: selectedSprint.name,
      state: selectedSprint.state as Sprint["state"],
      dateRange: "",
      ticketCount: 0,
      startDate: selectedSprint.startDate,
      endDate: selectedSprint.endDate,
      goal: selectedSprint.goal ?? null,
    };
    const days = computeWorkingDays(mapped);
    return { workingDaysRemaining: days.remaining, totalWorkingDays: days.total };
  }, [isInitialSprint, initialDaysRemaining, initialTotalDays, selectedSprint]);

  const currentSprintName = isInitialSprint
    ? (sprintName ?? "Sprint Statistics")
    : (selectedSprint?.name ?? "Sprint Statistics");

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  useOutsideClick(dropdownRef, () => setDropdownOpen(false), { enabled: dropdownOpen, escapeClose: false });

  const stats = useMemo(() => {
    let totalSp = 0;
    let totalBv = 0;
    let bvScoredCount = 0;
    let noPointsCount = 0;
    const statusMap: Record<string, { count: number; sp: number; bv: number }> = {};
    const typeMap: Record<string, { count: number; sp: number; bv: number }> = {};
    const epicMap: Record<string, { name: string; count: number; sp: number; bv: number }> = {};

    for (const t of tickets) {
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

    const spScoredCount = tickets.filter((t) => t.storyPoints != null && t.storyPoints > 0).length;
    const spAvg = spScoredCount > 0 ? (totalSp / spScoredCount).toFixed(1) : null;
    const bvAvg = bvScoredCount > 0 ? (totalBv / bvScoredCount).toFixed(1) : null;

    const typeEntries = Object.entries(typeMap).sort((a, b) => b[1].sp - a[1].sp);
    const epicEntries = Object.entries(epicMap).sort((a, b) => b[1].sp - a[1].sp);
    const hasRealEpics = tickets.some((t) => t.epic != null && t.jiraStatus !== "DEPRECATED");

    return { totalSp, totalBv, bvScoredCount, bvAvg, spAvg, noPointsCount, statusMap, typeEntries, epicEntries, hasRealEpics };
  }, [tickets]);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (dropdownOpen) { setDropdownOpen(false); return; }
        onClose();
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, dropdownOpen]);

  const handleFilterClick = useCallback((type: "status" | "type" | "epic", value: string) => {
    if (!isInitialSprint) return;
    if (type === "status") onFilterStatus?.(value);
    else if (type === "type") onFilterType?.(value);
    else if (type === "epic") onFilterEpic?.(value);
    onClose();
  }, [isInitialSprint, onFilterStatus, onFilterType, onFilterEpic, onClose]);

  // Bar proportions
  const maxStatusSp = Math.max(...STATUS_ORDER.map((s) => stats.statusMap[s]?.sp ?? 0), 1);
  const maxTypeSp = Math.max(...stats.typeEntries.map(([, d]) => d.sp), 1);
  const maxEpicSp = Math.max(...stats.epicEntries.map(([, d]) => d.sp), 1);

  // Sprint time
  const daysElapsed = totalWorkingDays != null && workingDaysRemaining != null ? totalWorkingDays - workingDaysRemaining : null;
  const timePct = totalWorkingDays != null && totalWorkingDays > 0 && daysElapsed != null ? Math.round((daysElapsed / totalWorkingDays) * 100) : null;
  const isLastDays = workingDaysRemaining != null && workingDaysRemaining <= 2;

  // Stakeholder link
  const stakeholderHref = useMemo(() => {
    const sid = selectedSprintId ?? initialSprintId;
    if (!sid) return null;
    const sprint = sprints?.find((s) => String(s.id) === sid);
    const team = sprint?.name.match(/^([A-Z]+)[: ]/)?.[1] ?? "";
    return `/stakeholder?team=${team}&sprintId=${sid}`;
  }, [selectedSprintId, initialSprintId, sprints]);

  // Only show filter callbacks when viewing the initial sprint
  const canFilter = isInitialSprint;

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{
          backgroundColor: "color-mix(in srgb, black 25%, transparent)",
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
            {/* Sprint selector */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-1.5 text-body-lg font-semibold text-text-primary tracking-tight cursor-pointer rounded-md px-1.5 py-0.5 -mx-1.5 hover:bg-overlay-default active:bg-overlay-strong transition-colors duration-100"
              >
                <span className="truncate max-w-[280px]">{currentSprintName}</span>
                <ChevronDown size={12} strokeWidth={2} className={`shrink-0 text-text-muted transition-transform duration-150 ${dropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {dropdownOpen && (
                <div
                  className="absolute left-0 top-full mt-1 z-60 w-72 max-h-64 overflow-y-auto rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1"
                  style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.25)" }}
                >
                  {visibleSprints.map((s) => {
                    const isActive = String(s.id) === (selectedSprintId ?? initialSprintId);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedSprintId(String(s.id));
                          setDropdownOpen(false);
                        }}
                        className={`flex w-full items-center gap-2.5 px-3 py-2 text-body-sm cursor-pointer transition-colors duration-100 ${
                          isActive
                            ? "bg-overlay-default text-text-primary"
                            : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary"
                        }`}
                      >
                        {s.state === "active" && (
                          <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-secondary-400)] opacity-40" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-secondary-400)]" />
                          </span>
                        )}
                        <span className="truncate">{s.name}</span>
                        {s.state === "closed" && (
                          <span className="text-[10px] text-text-muted ml-auto shrink-0">closed</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {workingDaysRemaining != null && totalWorkingDays != null && totalWorkingDays > 0 && (
              <div className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ${isLastDays ? "text-amber-400/90" : "text-text-muted"}`} style={{ backgroundColor: isLastDays ? "color-mix(in srgb, var(--color-status-caution) 8%, transparent)" : "var(--color-overlay-subtle)" }}>
                <Calendar size={11} strokeWidth={1.5} />
                <span className="tabular-nums">
                  {workingDaysRemaining === 0 ? "Last day" : `${workingDaysRemaining} day${workingDaysRemaining !== 1 ? "s" : ""} left`}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {stakeholderHref && (
              <a
                href={stakeholderHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default active:bg-overlay-strong transition-colors duration-100"
              >
                <Users size={12} strokeWidth={1.5} />
                <span>Stakeholder View</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default active:bg-overlay-strong transition-colors duration-100"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Time vs. completion: one shared grid so both bars align and read as equal-length tracks */}
        {!isLoading && (
          <div className="px-6 pt-2.5 pb-1.5">
            <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-3">
              {/* Sprint time progress (top row) */}
              {timePct != null && totalWorkingDays != null && daysElapsed != null && (
                <>
                  <span aria-hidden="true" />
                  <div className="h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-overlay-default)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(timePct, 100)}%`,
                        backgroundColor: isLastDays ? "color-mix(in srgb, var(--color-status-caution) 60%, transparent)" : "var(--color-text-muted)",
                        opacity: 0.5,
                        transition: "width 400ms ease-out",
                      }}
                    />
                  </div>
                  <span className={`text-[10px] tabular-nums text-right ${isLastDays ? "text-amber-400/60" : "text-text-muted"}`}>
                    day {daysElapsed}/{totalWorkingDays}
                  </span>
                </>
              )}

              {/* Completion breakdown (bottom row) */}
              <SprintCompletionBar
                doneSp={stats.statusMap["DONE"]?.sp ?? 0}
                testSp={stats.statusMap["TEST"]?.sp ?? 0}
                inProgressSp={stats.statusMap["IN PROGRESS"]?.sp ?? 0}
                totalSp={stats.totalSp}
                doneBv={stats.statusMap["DONE"]?.bv ?? 0}
                testBv={stats.statusMap["TEST"]?.bv ?? 0}
                inProgressBv={stats.statusMap["IN PROGRESS"]?.bv ?? 0}
                totalBv={stats.totalBv}
                doneItems={stats.statusMap["DONE"]?.count ?? 0}
                testItems={stats.statusMap["TEST"]?.count ?? 0}
                inProgressItems={stats.statusMap["IN PROGRESS"]?.count ?? 0}
                totalItems={tickets.length}
                workingDaysRemaining={workingDaysRemaining ?? null}
                totalWorkingDays={totalWorkingDays ?? null}
                gridLayout
                hideStats
                hideTime
              />
            </div>
          </div>
        )}

        {/* Loading state for non-initial sprint */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-text-muted" />
          </div>
        )}

        {!isLoading && (
          <>
            {/* Summary cards */}
            <div className="px-6 pt-3 pb-5">
              <div className="grid grid-cols-3 gap-3">
                <SummaryCard label="Items" value={tickets.length} />
                <SummaryCard label="Story Points" value={stats.totalSp} sub={stats.spAvg ? `avg ${stats.spAvg}` : undefined} metric="sp" />
                <SummaryCard label="Business Value" value={stats.totalBv} sub={stats.bvAvg ? `avg ${stats.bvAvg}` : undefined} metric="bv" />
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
                    const barColor = colors?.dot ?? colors?.text ?? "var(--color-status-neutral)";
                    const pct = (ss.sp / maxStatusSp) * 100;
                    return (
                      <FilterRow
                        key={status}
                        accentColor={barColor}
                        onClick={canFilter && onFilterStatus ? () => handleFilterClick("status", status) : undefined}
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
                      const barColor = ISSUE_TYPE_COLORS[typeName as keyof typeof ISSUE_TYPE_COLORS] ?? "var(--color-status-neutral)";
                      const pct = maxTypeSp > 0 ? (data.sp / maxTypeSp) * 100 : 0;
                      return (
                        <FilterRow
                          key={typeName}
                          accentColor={barColor}
                          onClick={canFilter && onFilterType ? () => handleFilterClick("type", typeName) : undefined}
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
                    const epicColor = isNoEpic ? { text: "var(--color-status-neutral)", bg: "color-mix(in srgb, #6b7280 12%, transparent)" } : getEpicColor(epicName);
                    const pct = maxEpicSp > 0 ? (data.sp / maxEpicSp) * 100 : 0;
                    return (
                      <FilterRow
                        key={epicName}
                        accentColor={epicColor.text}
                        onClick={!isNoEpic && canFilter && onFilterEpic ? () => handleFilterClick("epic", epicName) : undefined}
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
          </>
        )}
      </div>
    </>,
    document.body
  );
}

