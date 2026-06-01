import { Gauge, Goal } from "lucide-react";
import { MetricBadge } from "@/components/shared/MetricBadge";

export function SummaryCard({ label, value, sub, metric }: { label: string; value: number; sub?: string; metric?: "sp" | "bv" }) {
  const Icon = metric === "sp" ? Gauge : metric === "bv" ? Goal : null;
  return (
    <div className="rounded-lg px-3.5 py-3" style={{ backgroundColor: "var(--color-overlay-subtle)" }}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-muted font-medium mb-1.5">
        {Icon && <Icon size={12} strokeWidth={2} aria-hidden />}
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-heading font-semibold text-text-primary tabular-nums leading-none">{value}</span>
        {sub && <span className="text-[10px] text-text-muted">{sub}</span>}
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-3">{children}</div>
  );
}

export function FilterRow({ children, onClick, accentColor }: { children: React.ReactNode; onClick?: () => void; accentColor?: string }) {
  if (!onClick) return <div className="w-full -mx-2 px-2 py-1.5" style={{ borderLeft: "2px solid transparent" }}>{children}</div>;
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

export function RowMetrics({ count, sp, bv }: { count: number; sp: number; bv: number }) {
  return (
    <div className="flex items-baseline gap-2.5 text-[11px] tabular-nums shrink-0 ml-3">
      <span className="font-semibold text-text-primary min-w-[14px] text-right">{count}</span>
      {sp > 0 && <MetricChip value={sp} unit="SP" />}
      {bv > 0 && <MetricChip value={bv} unit="BV" />}
    </div>
  );
}

export function MetricChip({ value, unit }: { value: number; unit: string }) {
  return <MetricBadge metric={unit.toLowerCase() === "sp" ? "sp" : "bv"} value={value} tinted size="xs" />;
}

export function BarTrack({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-overlay-default)" }}>
      {children}
    </div>
  );
}

export function Bar({ pct, color, opacity }: { pct: number; color: string; opacity: number }) {
  return (
    <div
      className="h-full rounded-full"
      style={{ width: `${pct}%`, backgroundColor: color, opacity, transition: "width 400ms ease-out" }}
    />
  );
}
