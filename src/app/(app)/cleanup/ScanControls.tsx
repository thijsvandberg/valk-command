"use client";

/**
 * Scan controls for /cleanup (BRDG-298).
 *
 * A single "Scans" popover that is the one place the PO governs all background
 * scanning for the Backlog Deprecation Review. It lists the three scheduler tasks
 * (staleness, deep scan, auto background deep scan), each with an on/off toggle
 * reflecting the EFFECTIVE enabled state and a "Run now" button that triggers the
 * task immediately even while disabled.
 *
 * WHY all OFF by default: nothing should scan continuously unless the PO opts in;
 * they trigger manually now. After a "Run now" the relevant data (queue, rows) is
 * refreshed via the caller's onRan callback.
 *
 * Auto reconciliation: the auto-enqueue task is gated by BOTH the scheduler
 * task-enabled flag AND the BRDG-290 auto-scan-settings `enabled` flag. To avoid
 * two competing switches we expose ONE auto on/off here and keep both flags in
 * lock-step when toggled (see toggleAuto). The scheduler task is the displayed
 * source of truth for the effective state; the daily-count input remains backed
 * by auto-scan-settings.
 */

import { useCallback, useState } from "react";
import useSWR from "swr";
import { Telescope, Play, Loader2, Radar, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/shared/Tooltip";
import { Popover } from "@/components/shared/Popover";
import { ToggleSwitch } from "@/components/shared/ToggleSwitch";
import {
  scheduler,
  autoScanSettings,
  type SchedulerTaskStatus,
  type AutoScanSettings,
} from "@/lib/api-client";
import { DEPRECATION_SCAN_TASKS } from "@/lib/cleanup-types";

// Per-task copy. WHY centralised: the popover, tooltips, and the run-confirmation
// all read from one place so the labels never drift from the scheduler registry.
const TASK_META: Record<string, { icon: typeof Radar; help: string }> = {
  [DEPRECATION_SCAN_TASKS.staleness]: {
    icon: Radar,
    help: "Runs the cheap local staleness pass: scores a rotating batch of backlog tickets on age and metadata heuristics. No AI, no Jira writes.",
  },
  [DEPRECATION_SCAN_TASKS.deepScan]: {
    icon: Telescope,
    help: "Processes the deep-scan queue: runs every topic scorer on queued tickets and recomputes their combined score.",
  },
  [DEPRECATION_SCAN_TASKS.autoEnqueue]: {
    icon: Clock,
    help: "Auto-queues a daily batch of the most-likely-stale tickets into the deep-scan queue, up to the configured count per day.",
  },
};

interface ScanControlsProps {
  // Called after any toggle or "Run now" so the caller can refresh the queue/rows.
  onRan: () => void;
}

export function ScanControls({ onRan }: ScanControlsProps) {
  const [open, setOpen] = useState(false);

  const { data: tasksData, mutate: mutateTasks } = useSWR<{ tasks: SchedulerTaskStatus[] }>(
    "/api/scheduler/tasks",
  );
  const { data: autoSettings, mutate: mutateAuto } = useSWR<AutoScanSettings>(
    "/api/cleanup/auto-scan-settings",
  );

  const [busy, setBusy] = useState<string | null>(null);

  const tasks = tasksData?.tasks ?? [];
  const byName = (name: string) => tasks.find((t) => t.name === name);
  const staleness = byName(DEPRECATION_SCAN_TASKS.staleness);
  const deepScan = byName(DEPRECATION_SCAN_TASKS.deepScan);
  const autoTask = byName(DEPRECATION_SCAN_TASKS.autoEnqueue);

  // Any deprecation scan on? Drives the trigger pill's "active" affordance.
  const anyEnabled = [staleness, deepScan, autoTask].some((t) => t?.enabled);

  const toggleTask = useCallback(
    async (name: string, enabled: boolean) => {
      setBusy(name);
      try {
        await scheduler.setTaskEnabled(name, enabled);
        await mutateTasks();
        onRan();
      } finally {
        setBusy(null);
      }
    },
    [mutateTasks, onRan],
  );

  // The single auto on/off. Keep the scheduler task flag and the auto-scan-settings
  // flag consistent so the two systems never disagree about whether auto runs.
  const toggleAuto = useCallback(
    async (enabled: boolean) => {
      setBusy(DEPRECATION_SCAN_TASKS.autoEnqueue);
      try {
        await Promise.all([
          scheduler.setTaskEnabled(DEPRECATION_SCAN_TASKS.autoEnqueue, enabled),
          autoScanSettings.update({ enabled }),
        ]);
        await Promise.all([mutateTasks(), mutateAuto()]);
        onRan();
      } finally {
        setBusy(null);
      }
    },
    [mutateTasks, mutateAuto, onRan],
  );

  const commitAutoCount = useCallback(
    async (raw: string) => {
      const n = parseInt(raw, 10);
      if (!autoSettings || Number.isNaN(n) || n < 1 || n > 200 || n === autoSettings.dailyCount) return;
      const updated = await autoScanSettings.update({ dailyCount: n });
      await mutateAuto(updated, { revalidate: false });
    },
    [autoSettings, mutateAuto],
  );

  const runNow = useCallback(
    async (name: string) => {
      setBusy(name);
      try {
        await scheduler.run(name);
        onRan();
      } finally {
        setBusy(null);
      }
    },
    [onRan],
  );

  return (
    <div className="relative inline-flex">
      <Tooltip content="Scans are off by default. Open to turn the staleness / deep / auto scans on or run one now.">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={[
            "flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-label font-medium transition-colors duration-150 active:scale-[0.98]",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]",
            anyEnabled
              ? "border-[var(--color-brand-500)]/50 text-[var(--color-brand-400)]"
              : "border-border-default text-text-secondary hover:border-border-strong hover:text-text-primary",
          ].join(" ")}
          style={anyEnabled ? { backgroundColor: "var(--color-brand-subtle)" } : undefined}
        >
          <Radar size={13} strokeWidth={1.75} />
          Scans
          {anyEnabled && (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: "var(--color-brand-400)" }}
              aria-hidden
            />
          )}
        </button>
      </Tooltip>

      <Popover open={open} onClose={() => setOpen(false)} align="left" className="w-[360px]">
        <div role="dialog" aria-label="Scan controls" className="flex flex-col">
          <div className="border-b border-border-subtle px-4 py-3">
            <h3 className="text-body-sm font-semibold text-text-primary">Scans</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-text-tertiary">
              Off by default. Turn one on to run it on a schedule, or use Run now for a one-off pass.
            </p>
          </div>

          <div className="flex flex-col">
            {staleness && (
              <TaskRow
                task={staleness}
                busy={busy === staleness.name}
                onToggle={(v) => void toggleTask(staleness.name, v)}
                onRun={() => void runNow(staleness.name)}
              />
            )}
            {deepScan && (
              <TaskRow
                task={deepScan}
                busy={busy === deepScan.name}
                onToggle={(v) => void toggleTask(deepScan.name, v)}
                onRun={() => void runNow(deepScan.name)}
              />
            )}
            {autoTask && (
              <TaskRow
                task={autoTask}
                busy={busy === autoTask.name}
                onToggle={(v) => void toggleAuto(v)}
                onRun={() => void runNow(autoTask.name)}
                trailing={
                  autoTask.enabled && autoSettings ? (
                    <label className="mt-2 flex items-center gap-1.5 text-[11px] text-text-tertiary">
                      <span>Up to</span>
                      <input
                        type="number"
                        min={1}
                        max={200}
                        defaultValue={autoSettings.dailyCount}
                        key={autoSettings.dailyCount}
                        onBlur={(e) => void commitAutoCount(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitAutoCount((e.target as HTMLInputElement).value);
                        }}
                        aria-label="Auto scan daily count"
                        className={[
                          "h-6 w-12 rounded-md border border-border-default bg-[var(--color-surface-elevated)]",
                          "px-1.5 text-center text-label tabular-nums text-text-secondary",
                          "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]",
                          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                        ].join(" ")}
                      />
                      <span>tickets / day</span>
                    </label>
                  ) : undefined
                }
              />
            )}
          </div>
        </div>
      </Popover>
    </div>
  );
}

function TaskRow({
  task,
  busy,
  onToggle,
  onRun,
  trailing,
}: {
  task: SchedulerTaskStatus;
  busy: boolean;
  onToggle: (enabled: boolean) => void;
  onRun: () => void;
  trailing?: React.ReactNode;
}) {
  const meta = TASK_META[task.name];
  const Icon = meta?.icon ?? Radar;
  return (
    <div className="border-b border-border-subtle px-4 py-3 last:border-b-0">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-overlay-subtle text-text-tertiary">
          <Icon size={13} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-body-sm font-medium text-text-primary">{task.label}</span>
            {busy && <Loader2 size={11} className="animate-spin text-text-muted" />}
          </div>
          {meta?.help && (
            <p className="mt-0.5 text-[11px] leading-relaxed text-text-tertiary">{meta.help}</p>
          )}
          {trailing}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Tooltip content={task.enabled ? "Running on a schedule. Turn off." : "Off. Turn on to run on a schedule."}>
            <span className="inline-flex">
              <ToggleSwitch
                checked={task.enabled}
                disabled={busy}
                onChange={onToggle}
                ariaLabel={`${task.enabled ? "Disable" : "Enable"} ${task.label}`}
              />
            </span>
          </Tooltip>
          <Tooltip content="Run this scan once now, even while it is off">
            <Button variant="ghost" size="sm" disabled={busy} onClick={onRun} className="h-6 px-1.5">
              <Play size={11} strokeWidth={2} className="shrink-0" />
              Run now
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
