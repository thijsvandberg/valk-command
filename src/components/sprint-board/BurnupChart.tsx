"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import { burnup } from "@/lib/api-client";
import type { BurnupResponse, BurnupDataPoint } from "@/app/api/burnup/route";

const swrFetcher = (url: string) => fetch(url).then((r) => r.json());

interface BurnupChartProps {
  sprintId: string;
  totalSp: number;
  totalBv: number;
}

const CHART_HEIGHT = 200;
const PADDING = { top: 16, right: 16, bottom: 32, left: 40 };

const COLORS = {
  spDone: "#3bbfbe",
  bvDone: "#4ade80",
  scope: "#e05a5a",
  guideline: "var(--color-overlay-strong)",
  today: "var(--color-text-muted)",
  grid: "var(--color-overlay-subtle)",
  gridLabel: "var(--color-text-muted)",
};

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/** Build SVG path for a step-line from an array of {x, y} points. */
function stepLinePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` H${pts[i].x} V${pts[i].y}`;
  }
  return d;
}

/** Build SVG path for the filled area under a step-line. */
function stepLineAreaPath(pts: { x: number; y: number }[], yBaseline: number): string {
  if (pts.length === 0) return "";
  let d = `M${pts[0].x},${yBaseline}`;
  d += ` V${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` H${pts[i].x} V${pts[i].y}`;
  }
  d += ` H${pts[pts.length - 1].x} V${yBaseline} Z`;
  return d;
}

export function BurnupChart({
  sprintId,
  totalSp,
  totalBv,
}: BurnupChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const seedAttempted = useRef(false);

  const { data, mutate, isValidating } = useSWR<BurnupResponse>(
    sprintId ? burnup.url(sprintId) : null,
    swrFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 },
  );

  // Auto-seed when no data exists
  useEffect(() => {
    if (!data || data.seeded || seedAttempted.current) return;
    seedAttempted.current = true;
    burnup.seed(sprintId).finally(() => mutate());
  }, [data, sprintId, mutate]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const sprintStartDate = data?.sprintStart;
  const sprintEndDate = data?.sprintEnd;

  const start = useMemo(() => sprintStartDate ? new Date(sprintStartDate) : new Date(), [sprintStartDate]);
  const end = useMemo(() => sprintEndDate ? new Date(sprintEndDate) : new Date(), [sprintEndDate]);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Build working-day timeline (excludes weekends)
  const workingDays = useMemo(() => {
    const days: Date[] = [];
    const totalCalDays = daysBetween(start, end);
    for (let d = 0; d <= totalCalDays; d++) {
      const date = new Date(start.getTime() + d * 24 * 60 * 60 * 1000);
      if (!isWeekend(date)) days.push(date);
    }
    return days;
  }, [start, end]);

  const totalWorkingDays = workingDays.length - 1;

  // Map any date to its x position based on working-day index
  const toX = useCallback(
    (date: Date) => {
      const plotW = width - PADDING.left - PADDING.right;
      if (totalWorkingDays <= 0) return PADDING.left;
      // Find the working day index for this date (snap weekends to next Monday)
      const dateMs = date.getTime();
      let idx = 0;
      for (let i = 0; i < workingDays.length; i++) {
        if (workingDays[i].getTime() <= dateMs) idx = i;
        else break;
      }
      return PADDING.left + (idx / totalWorkingDays) * plotW;
    },
    [totalWorkingDays, width, workingDays],
  );

  const toXDay = useCallback(
    (dayStr: string) => toX(new Date(dayStr)),
    [toX],
  );

  // Y-axis: percentage 0-100
  const toY = useCallback(
    (pct: number) => {
      const plotH = CHART_HEIGHT - PADDING.top - PADDING.bottom;
      return PADDING.top + plotH * (1 - pct / 100);
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setHoverX(e.clientX - rect.left);
    },
    [],
  );

  const handleMouseLeave = useCallback(() => setHoverX(null), []);

  // Compute chart data points from API response
  const points = data?.points ?? [];
  const hasSp = totalSp > 0;
  const hasBv = totalBv > 0;

  // Use max scope as the 100% reference so scope line sits near top
  // and done lines are relative to the same scale
  const maxScope = useMemo(() => Math.max(...points.map((p) => p.scopeSp), totalSp, 1), [points, totalSp]);
  const maxBvScope = useMemo(() => Math.max(...points.map((p) => p.scopeBv), totalBv, 1), [points, totalBv]);

  const spPoints = useMemo(() => {
    if (!hasSp) return [];
    return points.map((p) => ({ x: toXDay(p.date), y: toY((p.spDone / maxScope) * 100) }));
  }, [points, hasSp, toXDay, toY, maxScope]);

  const bvPoints = useMemo(() => {
    if (!hasBv) return [];
    return points.map((p) => ({ x: toXDay(p.date), y: toY((p.bvDone / maxBvScope) * 100) }));
  }, [points, hasBv, toXDay, toY, maxBvScope]);

  const scopePoints = useMemo(() => {
    if (points.length === 0) return [];
    return points.map((p) => ({
      x: toXDay(p.date),
      y: toY((p.scopeSp / maxScope) * 100),
    }));
  }, [points, maxScope, toXDay, toY]);

  // Tooltip
  const tooltipData = useMemo(() => {
    if (hoverX === null || width === 0 || points.length === 0) return null;
    const plotW = width - PADDING.left - PADDING.right;
    const relX = hoverX - PADDING.left;
    if (relX < 0 || relX > plotW || totalWorkingDays <= 0) return null;

    // Map x position to working day
    const dayIdx = Math.round((relX / plotW) * totalWorkingDays);
    const clampedIdx = Math.max(0, Math.min(dayIdx, workingDays.length - 1));
    const date = workingDays[clampedIdx];
    const dateStr = date.toISOString().slice(0, 10);

    // Find the closest data point at or before this date
    let closest: BurnupDataPoint | null = null;
    for (const p of points) {
      if (p.date <= dateStr) closest = p;
      else break;
    }

    if (!closest) closest = points[0];

    return {
      date: formatShortDate(date),
      spDone: closest.spDone,
      spPct: closest.spPct,
      bvDone: closest.bvDone,
      bvPct: closest.bvPct,
      scopeSp: closest.scopeSp,
      scopeBv: closest.scopeBv,
      x: hoverX,
    };
  }, [hoverX, width, points, totalWorkingDays, workingDays]);

  const xStart = PADDING.left;
  const xEnd = width - PADDING.right;
  const yBottom = CHART_HEIGHT - PADDING.bottom;
  const yTop = PADDING.top;
  const y0 = toY(0);
  const y100 = toY(100);
  const todayX = toX(today);
  const showToday = today >= start && today <= end;

  // Percentage gridlines
  const gridPcts = [25, 50, 75, 100];

  // X-axis labels: working days only
  const xLabels = useMemo(() => {
    return workingDays.map((date) => ({ date, x: toX(date) }));
  }, [workingDays, toX]);

  if (width === 0) {
    return (
      <div ref={containerRef} className="relative" style={{ minHeight: CHART_HEIGHT + 48 }}>
        <div className="flex h-full items-center justify-center text-caption text-text-muted">
          Loading burnup...
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="mb-1.5 text-caption uppercase tracking-wider text-text-muted">Sprint burnup</div>

      {/* Loading indicator */}
      {(!data || (data && !data.seeded)) && (
        <div className="absolute right-5 top-0 flex items-center gap-1.5 text-caption text-text-muted">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-text-muted" />
          Loading history...
        </div>
      )}

      <svg
        width={width}
        height={CHART_HEIGHT}
        role="img"
        aria-label="Sprint burnup chart"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Clip path to keep chart lines within the plot area */}
        <defs>
          <clipPath id={`burnup-clip-${sprintId}`}>
            <rect x={xStart} y={yTop} width={xEnd - xStart} height={yBottom - yTop} />
          </clipPath>
        </defs>

        {/* Y-axis gridlines (percentage) */}
        {gridPcts.map((pct) => (
          <g key={pct}>
            <line
              x1={xStart}
              y1={toY(pct)}
              x2={xEnd}
              y2={toY(pct)}
              stroke={COLORS.grid}
              strokeWidth={1}
            />
            <text
              x={xStart - 4}
              y={toY(pct) + 3}
              textAnchor="end"
              className="text-[8px]"
              fill={COLORS.gridLabel}
            >
              {pct}%
            </text>
          </g>
        ))}

        {/* X-axis baseline */}
        <line x1={xStart} y1={yBottom} x2={xEnd} y2={yBottom} stroke="var(--color-overlay-default)" strokeWidth={1} />

        {/* X-axis date labels (working days only) */}
        {xLabels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={yBottom + 16}
            textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}
            className="text-[9px]"
            fill={COLORS.gridLabel}
          >
            {formatShortDate(l.date)}
          </text>
        ))}

        {/* All chart lines clipped to plot area */}
        <g clipPath={`url(#burnup-clip-${sprintId})`}>

        {/* Guideline: diagonal from (start, 0%) to (end, 100%) */}
        <line
          x1={xStart}
          y1={y0}
          x2={xEnd}
          y2={y100}
          stroke={COLORS.guideline}
          strokeWidth={1}
          strokeDasharray="4 4"
        />

        {/* Scope step-line */}
        {scopePoints.length > 0 && (
          <path
            d={stepLinePath(scopePoints) + ` H${showToday ? todayX : xEnd}`}
            fill="none"
            stroke={COLORS.scope}
            strokeWidth={1.5}
            strokeLinejoin="miter"
          />
        )}
        {scopePoints.length === 0 && (
          <line x1={xStart} y1={y100} x2={showToday ? todayX : xEnd} y2={y100} stroke={COLORS.scope} strokeWidth={1.5} />
        )}
        {/* Scope projection after today (dotted) */}
        {showToday && todayX < xEnd && (
          <line
            x1={todayX}
            y1={scopePoints.length > 0 ? scopePoints[scopePoints.length - 1].y : y100}
            x2={xEnd}
            y2={scopePoints.length > 0 ? scopePoints[scopePoints.length - 1].y : y100}
            stroke={COLORS.scope}
            strokeWidth={1.5}
            strokeDasharray="3 4"
            opacity={0.5}
          />
        )}

        {/* SP completed step-line area fill */}
        {hasSp && spPoints.length > 0 && (
          <path d={stepLineAreaPath(spPoints, y0)} fill="rgba(88, 180, 230, 0.06)" />
        )}

        {/* SP completed step-line */}
        {hasSp && spPoints.length > 0 && (
          <path
            d={stepLinePath(spPoints)}
            fill="none"
            stroke={COLORS.spDone}
            strokeWidth={2}
            strokeLinejoin="miter"
          />
        )}

        {/* BV completed step-line */}
        {hasBv && bvPoints.length > 0 && (
          <path
            d={stepLinePath(bvPoints)}
            fill="none"
            stroke={COLORS.bvDone}
            strokeWidth={1.5}
            strokeLinejoin="miter"
            strokeDasharray="6 2"
          />
        )}

        {/* Today marker */}
        {showToday && (
          <>
            <line
              x1={todayX}
              y1={yTop}
              x2={todayX}
              y2={yBottom}
              stroke={COLORS.today}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={todayX}
              y={yTop - 4}
              textAnchor="middle"
              className="text-[9px]"
              fill="var(--color-text-tertiary)"
            >
              Today
            </text>
          </>
        )}

        </g>

        {/* Hover crosshair */}
        {tooltipData && (
          <line
            x1={tooltipData.x}
            y1={yTop}
            x2={tooltipData.x}
            y2={yBottom}
            stroke="var(--color-text-muted)"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        )}
      </svg>

      {/* Tooltip */}
      {tooltipData && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border-strong bg-[var(--color-surface-floating)] px-2.5 py-2 text-caption shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
          style={{
            left: Math.min(Math.max(tooltipData.x + 10, 0), width - 180),
            top: PADDING.top,
          }}
        >
          <div className="mb-1 text-text-secondary">{tooltipData.date}</div>
          {hasSp && (
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COLORS.spDone }} />
              <span className="text-text-tertiary">Story Points: {tooltipData.spDone}/{tooltipData.scopeSp} ({tooltipData.spPct}%)</span>
            </div>
          )}
          {hasBv && (
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COLORS.bvDone }} />
              <span className="text-text-tertiary">Business Value: {tooltipData.bvDone}/{tooltipData.scopeBv} ({tooltipData.bvPct}%)</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: COLORS.scope }} />
            <span className="text-text-tertiary">Scope: {tooltipData.scopeSp} SP</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {hasSp && (
          <span className="flex items-center gap-1.5 text-caption text-text-tertiary">
            <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: COLORS.spDone }} />
            Story Points
          </span>
        )}
        {hasBv && (
          <span className="flex items-center gap-1.5 text-caption text-text-tertiary">
            <span className="inline-block h-px w-3 border-t border-dashed" style={{ borderColor: COLORS.bvDone }} />
            Business Value
          </span>
        )}
        <span className="flex items-center gap-1.5 text-caption text-text-tertiary">
          <span className="inline-block h-px w-3 border-t border-dashed" style={{ borderColor: COLORS.guideline }} />
          Guideline
        </span>
        <span className="flex items-center gap-1.5 text-caption text-text-tertiary">
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: COLORS.scope }} />
          Scope
        </span>
      </div>
    </div>
  );
}
