import { Card } from "./Card";

interface SkeletonLineProps {
  width?: string;
  height?: string;
  className?: string;
}

export function SkeletonLine({
  width = "w-full",
  height = "h-3",
  className,
}: SkeletonLineProps) {
  return (
    <div
      className={`animate-pulse rounded bg-overlay-default ${height} ${width}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    />
  );
}

interface SkeletonCardProps {
  lines?: number;
  className?: string;
}

export function SkeletonCard({ lines = 3, className }: SkeletonCardProps) {
  return (
    <Card className={`space-y-3 px-4 py-3${className ? ` ${className}` : ""}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine
          key={i}
          width={i === 0 ? "w-2/3" : i === lines - 1 ? "w-1/2" : "w-full"}
        />
      ))}
    </Card>
  );
}

interface SkeletonTableProps {
  rows?: number;
  className?: string;
}

export function SkeletonTable({ rows = 5, className }: SkeletonTableProps) {
  return (
    <div
      className={`rounded-xl border border-border-strong overflow-hidden${className ? ` ${className}` : ""}`}
      aria-hidden="true"
    >
      <div className="px-4 py-2.5 bg-overlay-subtle border-b border-border-default">
        <SkeletonLine width="w-48" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3 border-b border-border-subtle last:border-b-0"
        >
          <SkeletonLine width={`${Math.round(60 + ((i * 13) % 35))}%`} />
        </div>
      ))}
    </div>
  );
}
