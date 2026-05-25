"use client";

import { useMemo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useRefinementSession } from "@/contexts/RefinementSessionContext";
import { CheckCircle2, Copy, Check, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function SessionSummary() {
  const router = useRouter();
  const { queue, sessionStartedAt, savedSessionId } = useRefinementSession();
  const [copied, setCopied] = useState(false);

  // Capture end timestamp once via lazy state initializer (pure)
  const [endTime] = useState(() => Date.now());

  const durationMin = useMemo(() => {
    const durationMs = sessionStartedAt ? endTime - sessionStartedAt : 0;
    return Math.round(durationMs / 60000);
  }, [sessionStartedAt, endTime]);

  const markdownSummary = useMemo(() => {
    const lines = [
      "# Refinement Session Summary",
      "",
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Tickets | ${queue.length} |`,
      `| Duration | ${durationMin} min |`,
      "",
      "## Tickets",
      "",
      "| Key |",
      "|-----|",
      ...queue.map((key) => `| ${key} |`),
    ];
    return lines.join("\n");
  }, [queue, durationMin]);

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
    router.push(savedSessionId ? `/refinement/${savedSessionId}` : "/refinement");
  }, [router, savedSessionId]);

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
            <p className="text-xs text-text-muted">{durationMin} minutes</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Tickets in session" value={String(queue.length)} />
          <StatCard label="Duration" value={`${durationMin} min`} />
        </div>

        {/* Ticket list */}
        {queue.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-caption font-medium uppercase tracking-wider text-text-muted">Tickets</p>
            <div className="flex flex-wrap gap-1.5">
              {queue.map((key) => (
                <span key={key} className="rounded-md bg-overlay-subtle px-2 py-1 font-mono text-xs text-text-secondary">
                  {key}
                </span>
              ))}
            </div>
          </div>
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
