"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";

interface BurnupChartProps {
  sprintStartDate: string;
  sprintEndDate: string;
  sprintState: "active" | "future" | "closed";
  scopeValue: number;
  doneValue: number;
  label: string;
  doneColor: string;
  scopeColor: string;
  fillColor: string;
}

const CHART_HEIGHT = 160;
const PADDING = { top: 20, right: 12, bottom: 28, left: 36 };

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export function BurnupChart({
  sprintStartDate,
  sprintEndDate,
  sprintState,
  scopeValue,
  doneValue,
  label,
  doneColor,
  scopeColor,
  fillColor,
}: BurnupChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverX, setHoverX] = useState<number | null>(null);

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

  const start = useMemo(() => new Date(sprintStartDate), [sprintStartDate]);
  const end = useMemo(() => new Date(sprintEndDate), [sprintEndDate]);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const timelineEnd = useMemo(() => {
    if (sprintState === "active") {
      return today < end ? today : end;
    }
    return end;
  }, [sprintState, today, end]);

  const totalDays = daysBetween(start, end);
  const elapsedDays = daysBetween(start, timelineEnd);

  const yMax = useMemo(() => Math.max(scopeValue, doneValue, 1) * 1.15, [scopeValue, doneValue]);

  const yGridlines = useMemo(() => {
    const step = Math.ceil(yMax / 4);
    if (step === 0) return [];
    const lines: number[] = [];
    for (let v = step; v < yMax; v += step) {
      lines.push(v);
    }
    return lines;
  }, [yMax]);

  const toX = useCallback(
    (day: number) => {
      const plotW = width - PADDING.left - PADDING.right;
      if (totalDays <= 0) return PADDING.left;
      return PADDING.left + (day / totalDays) * plotW;
    },
    [totalDays, width],
  );

  const toY = useCallback(
    (val: number) => {
      const plotH = CHART_HEIGHT - PADDING.top - PADDING.bottom;
      return PADDING.top + plotH * (1 - val / yMax);
    },
    [yMax],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setHoverX(e.clientX - rect.left);
    },
    [],
  );

  const handleMouseLeave = useCallback(() => setHoverX(null), []);

  const tooltipData = useMemo(() => {
    if (hoverX === null || width === 0) return null;
    const plotW = width - PADDING.left - PADDING.right;
    const relX = hoverX - PADDING.left;
    if (relX < 0 || relX > plotW || totalDays <= 0) return null;

    const dayFraction = relX / plotW;
    const day = Math.round(dayFraction * totalDays);
    const date = new Date(start.getTime() + day * 24 * 60 * 60 * 1000);

    const doneFraction = elapsedDays > 0 ? Math.min(day / elapsedDays, 1) : 0;
    const doneAtDay = Math.round(doneFraction * doneValue);

    return {
      date: formatShortDate(date),
      scope: scopeValue,
      done: doneAtDay,
      x: hoverX,
    };
  }, [hoverX, width, totalDays, start, elapsedDays, doneValue, scopeValue]);

  if (width === 0) {
    return <div ref={containerRef} className="relative" style={{ minHeight: CHART_HEIGHT + 40 }} />;
  }

  const xStart = toX(0);
  const xElapsed = toX(elapsedDays);
  const xEnd = toX(totalDays);
  const yBottom = CHART_HEIGHT - PADDING.bottom;
  const yScope = toY(scopeValue);
  const yDone = toY(doneValue);
  const yZero = toY(0);

  return (
    <div ref={containerRef} className="relative">
      <div className="mb-1 text-caption uppercase tracking-wider text-white/25">{label} burnup</div>
      <svg
        width={width}
        height={CHART_HEIGHT}
        className="overflow-visible"
        role="img"
        aria-label={`${label} burnup chart: scope ${scopeValue}, done ${doneValue}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Y-axis gridlines */}
        {yGridlines.map((v) => (
          <g key={v}>
            <line
              x1={PADDING.left}
              y1={toY(v)}
              x2={width - PADDING.right}
              y2={toY(v)}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
            />
            <text
              x={PADDING.left - 6}
              y={toY(v) + 3}
              textAnchor="end"
              className="text-[9px]"
              fill="rgba(255,255,255,0.2)"
            >
              {v}
            </text>
          </g>
        ))}

        {/* X-axis baseline */}
        <line
          x1={PADDING.left}
          y1={yBottom}
          x2={width - PADDING.right}
          y2={yBottom}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={1}
        />

        {/* Scope line (dashed, full sprint width) */}
        <line
          x1={xStart}
          y1={yScope}
          x2={xEnd}
          y2={yScope}
          stroke={scopeColor}
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />

        {/* Done area fill */}
        <polygon
          points={`${xStart},${yZero} ${xElapsed},${yDone} ${xElapsed},${yZero}`}
          fill={fillColor}
        />

        {/* Done line */}
        <line
          x1={xStart}
          y1={yZero}
          x2={xElapsed}
          y2={yDone}
          stroke={doneColor}
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* Done endpoint dot */}
        <circle cx={xElapsed} cy={yDone} r={3} fill={doneColor} />

        {/* Today marker for active sprints */}
        {sprintState === "active" && today < end && (
          <line
            x1={xElapsed}
            y1={PADDING.top}
            x2={xElapsed}
            y2={yBottom}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}

        {/* X-axis labels */}
        <text x={xStart} y={yBottom + 16} textAnchor="start" className="text-[9px]" fill="rgba(255,255,255,0.2)">
          {formatShortDate(start)}
        </text>
        <text x={xEnd} y={yBottom + 16} textAnchor="end" className="text-[9px]" fill="rgba(255,255,255,0.2)">
          {formatShortDate(end)}
        </text>
        {sprintState === "active" && today < end && elapsedDays > 2 && totalDays - elapsedDays > 2 && (
          <text x={xElapsed} y={yBottom + 16} textAnchor="middle" className="text-[9px]" fill="rgba(255,255,255,0.3)">
            Today
          </text>
        )}

        {/* Scope value label */}
        <text x={xEnd + 2} y={yScope + 3} textAnchor="start" className="text-[9px]" fill={scopeColor}>
          {scopeValue}
        </text>

        {/* Done value label */}
        <text x={xElapsed + 6} y={yDone + 3} textAnchor="start" className="text-[9px]" fill={doneColor}>
          {doneValue}
        </text>

        {/* Hover crosshair */}
        {tooltipData && (
          <line
            x1={tooltipData.x}
            y1={PADDING.top}
            x2={tooltipData.x}
            y2={yBottom}
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
        )}
      </svg>

      {/* Tooltip overlay */}
      {tooltipData && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-border-strong bg-[var(--color-surface-floating)] px-2 py-1.5 text-caption shadow-[0_4px_16px_rgba(0,0,0,0.4)]"
          style={{
            left: Math.min(tooltipData.x + 8, width - 120),
            top: PADDING.top,
          }}
        >
          <div className="text-white/50">{tooltipData.date}</div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: scopeColor }} />
            <span className="text-white/40">Scope: {tooltipData.scope}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: doneColor }} />
            <span className="text-white/40">Done: {tooltipData.done}</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-1.5 flex gap-4">
        <span className="flex items-center gap-1.5 text-caption text-white/30">
          <span className="inline-block h-px w-3 border-t border-dashed" style={{ borderColor: scopeColor }} />
          Scope
        </span>
        <span className="flex items-center gap-1.5 text-caption text-white/30">
          <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: doneColor }} />
          Done
        </span>
      </div>
    </div>
  );
}
