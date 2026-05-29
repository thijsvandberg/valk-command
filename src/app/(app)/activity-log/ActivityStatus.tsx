"use client";

import { RefreshCw, CheckCircle2, AlertTriangle, Ban } from "lucide-react";
import type { ActivityLogEntry } from "@/types/ticket";

type Status = ActivityLogEntry["status"];

const STATUS_CONFIG: Record<
  Status,
  { label: string; icon: typeof CheckCircle2; iconColor: string; textColor: string; spin?: boolean }
> = {
  success: {
    label: "Success",
    icon: CheckCircle2,
    iconColor: "text-[var(--color-brand-400)]",
    textColor: "text-[var(--color-brand-400)]/70",
  },
  failed: {
    label: "Failed",
    icon: AlertTriangle,
    iconColor: "text-amber-400",
    textColor: "text-amber-400/70",
  },
  cancelled: {
    label: "Cancelled",
    icon: Ban,
    iconColor: "text-text-tertiary",
    textColor: "text-text-tertiary",
  },
  running: {
    label: "Running",
    icon: RefreshCw,
    iconColor: "text-text-tertiary",
    textColor: "text-text-tertiary",
    spin: true,
  },
};

export function ActivityStatus({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.running;
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon
        className={`h-3.5 w-3.5 ${cfg.iconColor} ${cfg.spin ? "animate-spin" : ""}`}
        strokeWidth={2}
      />
      <span className={`text-body-sm font-[var(--font-body)] ${cfg.textColor}`}>{cfg.label}</span>
    </span>
  );
}
