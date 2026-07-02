"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { useTaskStream } from "@/hooks/useTaskStream";
import { friendlyStreamError } from "@/lib/agent-errors";
import { parseTestDoc, type TestDocClassification } from "@/lib/parse-test-doc";
import { tickets as ticketsApi, workspaceTasks, ApiError } from "@/lib/api-client";
import { ClipboardCheck, Loader2, RefreshCw, X } from "lucide-react";

// Generations run ahead of the PO's review so the queue never waits (bulk
// prefetch). Capped: each generation is a full agent task on the workspace,
// and the "workspace" rate-limit tier allows 10 requests/min — three rolling
// starts stay well under both.
const MAX_CONCURRENT_GENERATIONS = 3;

interface EntryState {
  /** queued → generating (task streaming) → ready | error */
  status: "queued" | "generating" | "ready" | "error";
  taskId: string | null;
  doc: string;
  classification: TestDocClassification;
  unstructured: boolean;
  error: string | null;
}

function initialEntry(): EntryState {
  return { status: "queued", taskId: null, doc: "", classification: "ok", unstructured: false, error: null };
}

/** Invisible per-task SSE subscriber; unmounts (closing the stream) once its entry resolves. */
function TaskStreamWatcher({
  taskId,
  onProgress,
  onResult,
  onError,
}: {
  taskId: string;
  onProgress: (message: string) => void;
  onResult: (output: string) => void;
  onError: (message: string) => void;
}) {
  useTaskStream(taskId, {
    timeout: 0,
    onProgress,
    onToolCall: (tool) => onProgress(`Using ${tool.replace("mcp__", "")}...`),
    onResult: (resultData) => onResult((resultData.output as string) ?? ""),
    onError: (message) => onError(friendlyStreamError(message)),
    onNetworkError: () => onError("Connection to workspace lost"),
  });
  return null;
}

interface TestDocReviewModalProps {
  /** Queue of ticket keys to generate + validate; a single key is the non-bulk case. */
  keys: string[];
  onClose: () => void;
}

/**
 * Split-view validation for generated stakeholder test docs (BRDG-426).
 * Left: the editable generated markdown. Right: the story rendered in the
 * regular ticket format, so the PO validates with the story actually visible.
 *
 * Bulk mode prefetches: all generations start immediately (rolling, capped),
 * the first result shows as soon as it lands, and the rest generate while the
 * PO reviews — advancing to an already-finished doc is instant.
 */
export function TestDocReviewModal({ keys, onClose }: TestDocReviewModalProps) {
  const [index, setIndex] = useState(0);
  const [entries, setEntries] = useState<Record<string, EntryState>>(() =>
    Object.fromEntries(keys.map((k) => [k, initialEntry()])),
  );
  const [progressByKey, setProgressByKey] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const { mutate } = useSWRConfig();

  const currentKey = keys[index] ?? null;
  const isBulk = keys.length > 1;
  const isLast = index >= keys.length - 1;
  const entry = currentKey ? entries[currentKey] : null;

  const { data: detail } = useTicketDetail(currentKey);

  const patchEntry = useCallback((key: string, patch: Partial<EntryState>) => {
    setEntries((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  // POST the generation for one key. Failures land the entry in a terminal
  // error state (spinner off, Regenerate enabled), never an endless spinner.
  const startGeneration = useCallback((key: string) => {
    ticketsApi
      .generateTestDoc(key)
      .then((data) => {
        if (!data.taskId) {
          patchEntry(key, { status: "error", error: "No task ID returned from workspace" });
          return;
        }
        patchEntry(key, { status: "generating", taskId: data.taskId });
      })
      .catch((err) => {
        patchEntry(key, {
          status: "error",
          error: err instanceof ApiError ? err.message : "Failed to start generation",
        });
      });
  }, [patchEntry]);

  // Scheduler: keep up to MAX_CONCURRENT_GENERATIONS running ahead of the
  // review. startedRef guards double-starts (the effect re-runs on every
  // entries change); no synchronous setState here — starts resolve async.
  const startedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const inFlight = keys.filter((k) => {
      const e = entries[k];
      return startedRef.current.has(k) && e && (e.status === "queued" || e.status === "generating");
    }).length;
    let slots = MAX_CONCURRENT_GENERATIONS - inFlight;
    if (slots <= 0) return;
    for (const key of keys) {
      if (slots <= 0) break;
      if (startedRef.current.has(key) || entries[key]?.status !== "queued") continue;
      startedRef.current.add(key);
      startGeneration(key);
      slots -= 1;
    }
  }, [keys, entries, startGeneration]);

  const handleTaskResult = useCallback(
    (key: string, output: string) => {
      const parsed = parseTestDoc(output);
      if (parsed) {
        patchEntry(key, {
          status: "ready",
          doc: parsed.markdown,
          classification: parsed.classification,
          unstructured: false,
        });
      } else {
        // Degrade gracefully: let the PO salvage the raw output by hand.
        patchEntry(key, { status: "ready", doc: output.trim(), classification: "ok", unstructured: true });
      }
    },
    [patchEntry],
  );

  const handleTaskError = useCallback(
    (key: string, message: string) => {
      patchEntry(key, { status: "error", error: message });
    },
    [patchEntry],
  );

  // Closing mid-queue cancels the generations still in flight so the
  // workspace stops burning tokens on docs nobody will review.
  const handleClose = useCallback(() => {
    for (const key of keys) {
      const e = entries[key];
      if (e && e.status === "generating" && e.taskId) {
        workspaceTasks.cancel(e.taskId).catch(() => {});
      }
    }
    onClose();
  }, [entries, keys, onClose]);

  const advance = useCallback(() => {
    if (isLast) {
      handleClose();
      return;
    }
    setConflictMessage(null);
    setIndex((i) => i + 1);
  }, [isLast, handleClose]);

  const handleSave = useCallback(async () => {
    if (!currentKey || !entry || !entry.doc.trim()) return;
    setSaving(true);
    patchEntry(currentKey, { error: null });
    try {
      const result = await ticketsApi.saveTestDoc(currentKey, {
        markdown: entry.doc.trim(),
        classification: entry.classification,
      });
      // Refresh an open detail panel; the server cache is already invalidated.
      void mutate(`/api/tickets/${encodeURIComponent(currentKey)}`);
      setSaving(false);
      if (result.conflict) {
        // Bridge copy is saved; the description merge stays as a local edit for
        // the regular conflict-resolve flow. Tell the PO instead of advancing.
        setConflictMessage(result.message ?? "Jira was updated since your edit.");
        return;
      }
      advance();
    } catch (err) {
      setSaving(false);
      patchEntry(currentKey, {
        error: err instanceof ApiError ? err.message : "Failed to save test documentation",
      });
    }
  }, [advance, currentKey, entry, mutate, patchEntry]);

  // Regenerate bypasses the concurrency cap: the PO is actively waiting on
  // this one, unlike the background prefetch.
  const handleRegenerate = useCallback(() => {
    if (!currentKey) return;
    setConflictMessage(null);
    patchEntry(currentKey, initialEntry());
    startedRef.current.add(currentKey);
    startGeneration(currentKey);
  }, [currentKey, patchEntry, startGeneration]);

  const handleDocChange = useCallback(
    (value: string) => {
      if (!currentKey || !entry) return;
      // A needs_input result blocks Save until the PO writes real content —
      // once they do, it IS validated documentation.
      patchEntry(currentKey, {
        doc: value,
        classification: entry.classification === "needs_input" ? "ok" : entry.classification,
      });
    },
    [currentKey, entry, patchEntry],
  );

  if (!currentKey || !entry) return null;

  const generating = entry.status === "queued" || entry.status === "generating";
  // Prefetched docs waiting beyond the current one — tells the PO that
  // advancing will be instant.
  const readyAhead = keys.slice(index + 1).filter((k) => entries[k]?.status === "ready").length;
  const saveDisabled =
    generating || saving || !entry.doc.trim() || entry.classification === "needs_input";

  return (
    <Modal open onClose={handleClose} aria-label={`Test documentation for ${currentKey}`}>
      {/* Background prefetch streams; each unmounts when its entry resolves. */}
      {keys.map((key) => {
        const e = entries[key];
        if (!e || e.status !== "generating" || !e.taskId) return null;
        return (
          <TaskStreamWatcher
            key={e.taskId}
            taskId={e.taskId}
            onProgress={(message) => setProgressByKey((prev) => ({ ...prev, [key]: message }))}
            onResult={(output) => handleTaskResult(key, output)}
            onError={(message) => handleTaskError(key, message)}
          />
        );
      })}
      <div className="flex h-[min(760px,88vh)] w-[min(1180px,94vw)] flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-elevated shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-500)]/12 ring-1 ring-[var(--color-brand-500)]/20 shadow-[0_2px_8px_color-mix(in_srgb,var(--color-brand-600)_15%,transparent)]">
              <ClipboardCheck size={16} strokeWidth={1.75} className="text-[var(--color-brand-400)]" />
            </div>
            <div className="min-w-0">
              <p className="text-body font-semibold leading-tight text-text-primary">
                Test documentation
              </p>
              <p className="mt-0.5 truncate text-body-sm text-text-tertiary">
                for <span className="font-mono text-text-secondary">{currentKey}</span>
                {detail?.title ? <span className="text-text-secondary"> &middot; {detail.title}</span> : null}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {isBulk && (
              <span
                data-testid="test-doc-queue-position"
                className="rounded-md bg-overlay-subtle px-2 py-0.5 font-mono text-body-sm text-text-tertiary"
              >
                {index + 1} / {keys.length}
                {readyAhead > 0 && (
                  <span className="text-text-muted"> &middot; {readyAhead} ready</span>
                )}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={<X size={14} strokeWidth={1.5} />}
              onClick={handleClose}
              className="text-text-muted"
              aria-label="Close"
            />
          </div>
        </div>

        {/* Body: doc left, story right */}
        <div className="grid min-h-0 flex-1 grid-cols-2">
          <div className="flex min-h-0 flex-col gap-3 border-r border-border-subtle p-4">
            {entry.unstructured && !generating && (
              <InlineAlert variant="warning">
                The workspace returned unstructured output — review it carefully before saving.
              </InlineAlert>
            )}
            {entry.classification === "needs_input" && !generating && (
              <InlineAlert variant="warning">
                The story lacks enough context for meaningful test documentation (empty or
                template-only description). Complete the story first, or write the checks
                yourself below to enable saving.
              </InlineAlert>
            )}
            {entry.classification === "not_stakeholder_relevant" && !generating && (
              <InlineAlert variant="info">
                Classified as not stakeholder-testable (internal change, spike or chore).
                Saving stores the one-line mention so the sprint delivery stays complete.
              </InlineAlert>
            )}
            {entry.error && <InlineAlert variant="error">{entry.error}</InlineAlert>}
            {conflictMessage && (
              <InlineAlert variant="warning">
                Saved in Bridge, but the Jira push hit a conflict: {conflictMessage} Resolve it
                from the ticket&apos;s description editor.
              </InlineAlert>
            )}
            {generating ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-tertiary">
                <Loader2 size={20} strokeWidth={1.75} className="animate-spin text-[var(--color-brand-400)]" />
                <p className="max-w-[320px] truncate text-body-sm" data-testid="test-doc-progress">
                  {progressByKey[currentKey] ?? "Starting..."}
                </p>
              </div>
            ) : (
              <textarea
                value={entry.doc}
                onChange={(e) => handleDocChange(e.target.value)}
                spellCheck={false}
                placeholder="Generated test documentation (markdown)..."
                data-testid="test-doc-editor"
                className="min-h-0 flex-1 resize-none rounded-xl border border-border-default bg-surface-base p-3 font-mono text-body-sm leading-relaxed text-text-primary outline-none placeholder:text-text-muted focus:border-[var(--color-brand-500)]/45 [transition:border-color_.15s_ease]"
              />
            )}
          </div>

          <div className="flex min-h-0 flex-col p-4">
            <div className="mb-3 flex shrink-0 items-center gap-2">
              {detail && <IssueTypeIcon type={detail.type} size={14} strokeWidth={2} />}
              <span className="font-mono text-body-sm text-text-tertiary">{currentKey}</span>
              {detail && (
                <StatusBadge
                  status={detail.jiraStatus}
                  className="rounded-[5px] px-1.5 text-caption tracking-wide"
                />
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border-subtle bg-surface-base p-4" data-testid="test-doc-story-pane">
              {detail ? (
                <>
                  <h3 className="mb-3 text-body-lg font-semibold text-text-primary">{detail.title}</h3>
                  <div className="description-content">
                    {detail.description?.trim()
                      ? renderMarkdown(detail.description, { linkifyRefs: true })
                      : <p className="text-body-lg text-text-muted">No description.</p>}
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-text-muted">
                  <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3.5">
          <Button variant="ghost" size="md" onClick={handleClose}>
            Cancel
          </Button>
          {isBulk && (
            <Button variant="ghost" size="md" onClick={advance} disabled={saving}>
              Skip
            </Button>
          )}
          <Button
            variant="secondary"
            size="md"
            onClick={handleRegenerate}
            disabled={generating || saving}
            icon={<RefreshCw size={12} strokeWidth={2} />}
          >
            Regenerate
          </Button>
          {conflictMessage ? (
            <Button variant="primary" size="md" onClick={advance}>
              {isLast ? "Done" : "Next"}
            </Button>
          ) : (
            <Button variant="primary" size="md" onClick={handleSave} disabled={saveDisabled}>
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
