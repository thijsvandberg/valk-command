"use client";

import { useState } from "react";
import type { VelocityPoint } from "@/hooks/useVelocityData";

interface VelocitySparklineProps {
  data: VelocityPoint[];
  isLoading: boolean;
}

const WIDTH = 180;
const HEIGHT = 36;
const PAD = 6; // padding so dots at extremes aren't clipped

export function VelocitySparkline({ data, isLoading }: VelocitySparklineProps) {
  const [tooltip, setTooltip] = useState<{ index: number; x: number; y: number } | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-px w-[180px] animate-pulse rounded bg-white/10" />
      </div>
    );
  }

  // Require at least 2 data points to be meaningful
  if (data.length < 2) return null;

  const maxPts = Math.max(...data.map((d) => d.completedPoints), 1);
  const minPts = Math.min(...data.map((d) => d.completedPoints));

  function toSvgX(i: number): number {
    return PAD + (i / (data.length - 1)) * (WIDTH - PAD * 2);
  }

  function toSvgY(pts: number): number {
    // Avoid division by zero when all values are equal
    if (maxPts === minPts) return PAD + (HEIGHT - PAD * 2) / 2;
    return PAD + (HEIGHT - PAD * 2) - ((pts - minPts) / (maxPts - minPts)) * (HEIGHT - PAD * 2);
  }

  const points = data.map((d, i) => ({ x: toSvgX(i), y: toSvgY(d.completedPoints), d }));
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  const activePoint = tooltip !== null ? points[tooltip.index] : null;

  return (
    <div className="relative flex items-center gap-3">
      <span className="text-caption font-semibold uppercase tracking-[0.12em] text-white/20">
        Velocity
      </span>

      <div className="relative" style={{ width: WIDTH, height: HEIGHT }}>
        <svg
          width={WIDTH}
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          style={{ overflow: "visible" }}
        >
          {/* Trend line */}
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="var(--color-brand-400)"
            strokeWidth="1.5"
            strokeOpacity="0.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Data point circles */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={3}
              fill="var(--color-brand-400)"
              fillOpacity={tooltip?.index === i ? 0.9 : 0.45}
              className="cursor-pointer transition-opacity duration-100"
              onMouseEnter={() => setTooltip({ index: i, x: p.x, y: p.y })}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}
        </svg>

        {/* Tooltip */}
        {tooltip !== null && activePoint && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded bg-[#1a1a2e]/95 border border-white/10 px-2 py-1 shadow-lg"
            style={{
              left: activePoint.x,
              top: activePoint.y - HEIGHT - 4,
            }}
          >
            <p className="text-caption font-medium text-white/70">{activePoint.d.sprintName}</p>
            <p className="text-caption tabular-nums text-[var(--color-brand-400)]/80">
              {activePoint.d.completedPoints} pts done
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
