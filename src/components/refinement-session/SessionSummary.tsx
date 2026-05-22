"use client";

import { useMemo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useRefinementSession } from "@/contexts/RefinementSessionContext";
import { CheckCircle2, Copy, Check, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function SessionSummary() {
  const router = useRouter();
  const { queue, completionData, sessionStartedAt } = useRefinementSession();
  const [copied, setCopied] = useState(false);

  // Capture end timestamp once via lazy state initializer (pure)
  const [endTime] = useState(() => Date.now());

  const stats = useMemo(() => {
    const completed = queue.filter((key) => completionData[key]);
    const estimated = queue.filter((key) => completionData[key]?.pointsSet);
    const totalSubtasks = queue.reduce(
      (sum, key) => sum + (completionData[key]?.subtasksAdded ?? 0),
      0,
    );
    const statusChanged = queue.filter((key) => completionData[key]?.statusChanged);

    const durationMs = sessionStartedAt ? endTime - sessionStartedAt : 0;
    const durationMin = Math.round(durationMs / 60000);

    return {
      total: queue.length,
      completed: completed.length,
      estimated: estimated.length,
      skipped: queue.length - completed.length,
      totalSubtasks,
      statusChanged: statusChanged.length,
      durationMin,
    };
  }, [queue, completionData, sessionStartedAt, endTime]);

  const markdownSummary = useMemo(() => {
    const lines = [
      "# Refinement Session Summary",
      "",
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Tickets refined | ${stats.completed} of ${stats.total} |`,
      `| Estimated | ${stats.estimated} |`,
      `| Subtasks created | ${stats.totalSubtasks} |`,
      `| Status updated | ${stats.statusChanged} |`,
      `| Duration | ${stats.durationMin} min |`,
      "",
      "## Tickets",
      "",
      "| Key | Status |",
      "|-----|--------|",
      ...queue.map((key) => {
        const data = completionData[key];
        const status = data ? "Refined" : "Skipped";
        return `| ${key} | ${status} |`;
      }),
    ];
    return lines.join("\n");
  }, [queue, completionData, stats]);

  const handleExport = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdownSummary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }, [markdownSummary]);

  const handleBack = useCallback(() => {
    router.push("/refinement");
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl border border-border-default bg-[var(--color-surface-elevated)] p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-brand-600)]/10">
            <CheckCircle2 size={20} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
          </div>
          <div>
            <h2 className="font-[var(--font-display)] text-heading font-bold tracking-tight text-text-primary">
              Session Complete
            </h2>
            <p className="text-xs text-text-muted">{stats.durationMin} minutes</p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Tickets refined" value={`${stats.completed}/${stats.total}`} />
          <StatCard label="Estimated" value={String(stats.estimated)} />
          <StatCard label="Subtasks created" value={String(stats.totalSubtasks)} />
          <StatCard label="Status updated" value={String(stats.statusChanged)} />
        </div>

        {stats.skipped > 0 && (
          <p className="mt-4 text-xs text-text-muted">
            {stats.skipped} ticket{stats.skipped !== 1 ? "s" : ""} skipped or not completed
          </p>
        )}

        {/* Actions */}
        <div className="mt-6 flex items-center gap-3">
          <Button variant="secondary" size="lg" icon={<ArrowLeft size={14} strokeWidth={2} />} onClick={handleBack}>
            Back to Refinement
          </Button>
          <Button
            variant="ghost"
            size="lg"
            icon={copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
            onClick={handleExport}
          >
            {copied ? "Copied" : "Export as Markdown"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-overlay-subtle px-4 py-3">
      <div className="text-caption font-medium uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-1 font-[var(--font-display)] text-heading font-bold tabular-nums text-text-primary">
        {value}
      </div>
    </div>
  );
}
