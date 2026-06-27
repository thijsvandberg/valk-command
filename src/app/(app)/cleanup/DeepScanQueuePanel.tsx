"use client";

/**
 * Deep-scan queue management (BRDG-298).
 *
 * Replaces the old "N queued M done" counter with a manageable list. A trigger
 * pill summarises the queue (counts + a running spinner); opening it reveals the
 * per-item list with status treatment (pending / running spinner / done / error),
 * source, and enqueued time.
 *
 * Per PENDING item: a Remove (x) action (DELETE { key }). Running items show no
 * remove control (the backend rejects removing a running row with 409; the batch
 * finishes on its own). A "Clear pending" action empties all pending (DELETE
 * { all: true }). The caller polls the queue every few seconds and passes the
 * data + mutate in, so this panel reuses that single poll rather than adding one.
 */

import { useCallback, useState } from "react";
import { Telescope, X, Loader2, Check, CircleAlert, Clock, ListX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/shared/Tooltip";
import { Popover } from "@/components/shared/Popover";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { relativeDate } from "@/lib/date-utils";

export interface QueueItem {
  id: string;
  jiraKey: string;
  status: "pending" | "running" | "done" | "error";
  source: string;
  enqueuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  title: string | null;
  ticketStatus: string | null;
}

export interface QueueData {
  pending: number;
  running: number;
  done: number;
  error: number;
  items: QueueItem[];
}

// Human label for the enqueue source. Falls through to the raw value so a new
// backend source still renders rather than disappearing.
const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  "worst-staleness": "Worst staleness",
  oldest: "Oldest",
  auto: "Auto",
};

const STATUS_TREATMENT: Record<
  QueueItem["status"],
  { label: string; color: string; bg: string }
> = {
  pending: { label: "Pending", color: "var(--color-text-tertiary)", bg: "var(--color-overlay-subtle)" },
  running: { label: "Running", color: "var(--color-brand-400)", bg: "var(--color-brand-subtle)" },
  done: { label: "Done", color: "var(--color-status-success)", bg: "var(--color-status-success-subtle)" },
  error: { label: "Error", color: "var(--color-status-error)", bg: "var(--color-status-error-subtle)" },
};

interface DeepScanQueuePanelProps {
  queue: QueueData | undefined;
  // Revalidate the queue after a remove/clear so counts and list stay live.
  onMutate: () => Promise<unknown> | void;
}

export function DeepScanQueuePanel({ queue, onMutate }: DeepScanQueuePanelProps) {
  const [open, setOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const hasActivity =
    queue != null && (queue.pending > 0 || queue.running > 0 || queue.done > 0 || queue.error > 0);

  const removeItem = useCallback(
    async (key: string) => {
      setBusyKey(key);
      try {
        await fetch("/api/cleanup/deep-scan", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key }),
        });
        await onMutate();
      } finally {
        setBusyKey(null);
      }
    },
    [onMutate],
  );

  const clearPending = useCallback(async () => {
    setClearing(true);
    try {
      await fetch("/api/cleanup/deep-scan", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      await onMutate();
    } finally {
      setClearing(false);
    }
  }, [onMutate]);

  if (!hasActivity) return null;

  const items = queue?.items ?? [];

  return (
    <div className="relative inline-flex">
      <Tooltip content="Open the deep-scan queue to see and manage queued tickets">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={[
            "flex h-7 cursor-pointer items-center gap-2 rounded-lg border border-border-default px-2.5 text-label tabular-nums font-medium text-text-tertiary transition-colors duration-150 active:scale-[0.97]",
            "hover:border-border-strong hover:text-text-secondary",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]",
          ].join(" ")}
        >
          <Telescope size={13} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
          <span title="Waiting in the deep-scan queue">{queue?.pending ?? 0} queued</span>
          {(queue?.running ?? 0) > 0 && (
            <span className="flex items-center gap-1 text-[var(--color-brand-400)]" title="Currently being deep-scanned">
              <Loader2 size={11} className="animate-spin" />
              {queue?.running}
            </span>
          )}
          <span title="Deep scans completed">{queue?.done ?? 0} done</span>
          {(queue?.error ?? 0) > 0 && (
            <span className="text-[var(--color-status-error)]" title="Deep scans that errored">
              {queue?.error} error
            </span>
          )}
        </button>
      </Tooltip>

      <Popover open={open} onClose={() => setOpen(false)} align="right" className="w-[420px]">
        <div role="dialog" aria-label="Deep-scan queue" className="flex max-h-[60vh] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
            <div>
              <h3 className="text-body-sm font-semibold text-text-primary">Deep-scan queue</h3>
              <p className="mt-0.5 text-label tabular-nums text-text-tertiary">
                {queue?.pending ?? 0} pending · {queue?.running ?? 0} running · {queue?.done ?? 0} done
                {(queue?.error ?? 0) > 0 ? ` · ${queue?.error} error` : ""}
              </p>
            </div>
            <Tooltip content="Remove every pending item. Running items finish on their own.">
              <Button
                variant="ghost"
                size="sm"
                disabled={clearing || (queue?.pending ?? 0) === 0}
                onClick={() => void clearPending()}
                className="shrink-0"
              >
                <ListX size={12} strokeWidth={1.75} className="shrink-0" />
                Clear pending
              </Button>
            </Tooltip>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-label text-text-tertiary">The queue is empty.</p>
            ) : (
              <ul>
                {items.map((item) => (
                  <QueueRow
                    key={item.id}
                    item={item}
                    busy={busyKey === item.jiraKey || busyKey === item.id}
                    onRemove={() => void removeItem(item.jiraKey)}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </Popover>
    </div>
  );
}

function QueueRow({
  item,
  busy,
  onRemove,
}: {
  item: QueueItem;
  busy: boolean;
  onRemove: () => void;
}) {
  const treatment = STATUS_TREATMENT[item.status];
  return (
    <li className="group/qrow flex items-center gap-2 border-b border-border-subtle px-4 py-2.5 last:border-b-0">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <TicketStatusPill
          ticketKey={item.jiraKey}
          jiraStatus={(item.ticketStatus ?? "TO DO") as never}
          title={item.title ?? undefined}
          variant="list"
          size="md"
          showKey
          showStatus={false}
        />
        <span className="min-w-0 flex-1 truncate text-body-sm text-text-secondary" title={item.title ?? undefined}>
          {item.title ?? item.jiraKey}
        </span>
      </span>

      <StatusChip status={item.status} treatment={treatment} error={item.error} />

      <span className="shrink-0 text-label text-text-muted" title={`Source: ${SOURCE_LABEL[item.source] ?? item.source}`}>
        {SOURCE_LABEL[item.source] ?? item.source}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-label tabular-nums text-text-muted" title={`Enqueued ${item.enqueuedAt}`}>
        <Clock size={10} strokeWidth={1.75} className="opacity-70" />
        {relativeDate(item.enqueuedAt)}
      </span>

      {/* Only PENDING items are removable; running rows are mid-scan and the
          backend rejects their removal (409), so no remove control is shown. */}
      {item.status === "pending" ? (
        <Tooltip content="Remove from the queue">
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            aria-label={`Remove ${item.jiraKey} from the queue`}
            className={[
              "flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors duration-150",
              "hover:bg-[var(--color-status-error-subtle)] hover:text-[var(--color-status-error)]",
              "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-status-error)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
            ].join(" ")}
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <X size={12} strokeWidth={2} />}
          </button>
        </Tooltip>
      ) : (
        <span className="h-5 w-5 shrink-0" aria-hidden />
      )}
    </li>
  );
}

function StatusChip({
  status,
  treatment,
  error,
}: {
  status: QueueItem["status"];
  treatment: { label: string; color: string; bg: string };
  error: string | null;
}) {
  const chip = (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1.5 text-label font-medium leading-none"
      style={{ color: treatment.color, backgroundColor: treatment.bg }}
    >
      {status === "running" && <Loader2 size={10} className="animate-spin" />}
      {status === "done" && <Check size={10} strokeWidth={2.5} />}
      {status === "error" && <CircleAlert size={10} strokeWidth={2} />}
      {treatment.label}
    </span>
  );
  // Surface the error message on hover so a failed scan is diagnosable inline.
  if (status === "error" && error) {
    return <Tooltip content={error}>{chip}</Tooltip>;
  }
  return chip;
}
