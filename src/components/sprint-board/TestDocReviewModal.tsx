"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { TicketRefPill } from "@/components/shared/TicketRefPill";
import { TestDocStoryPane } from "@/components/sprint-board/TestDocStoryPane";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { useTaskStream } from "@/hooks/useTaskStream";
import { friendlyStreamError } from "@/lib/agent-errors";
import { parseTestDoc, coerceClassification, type TestDocClassification } from "@/lib/parse-test-doc";
import { tickets as ticketsApi, workspaceTasks, ApiError } from "@/lib/api-client";
import { ClipboardCheck, Loader2, RefreshCw, X } from "lucide-react";

// Generations run ahead of the PO's review so the queue never waits (bulk
// prefetch). Capped: each generation is a full agent task on the workspace,
// and the "workspace" rate-limit tier allows 10 requests/min — three rolling
// starts stay well under both.
const MAX_CONCURRENT_GENERATIONS = 3;

const SPLIT_STORAGE_KEY = "bridge:test-doc-split";
const SPLIT_MIN = 30;
const SPLIT_MAX = 70;

/** One reviewable doc variant; regeneration adds versions instead of replacing (PO compares, then accepts one). */
interface DocVersion {
  label: string;
  doc: string;
  classification: TestDocClassification;
  unstructured: boolean;
}

interface EntryState {
  /** checking (cache lookup) → queued → generating (task streaming) → ready | error */
  status: "checking" | "queued" | "generating" | "ready" | "error";
  taskId: string | null;
  /** The ACTIVE working copy (editable); versions[activeVersion] holds its last snapshot. */
  doc: string;
  classification: TestDocClassification;
  unstructured: boolean;
  error: string | null;
  /** Where the shown doc came from: a fresh generation, the draft cache, or an accepted save. */
  source: "fresh" | "draft" | "saved" | null;
  /** ISO timestamp of the cached draft / accepted save, for the provenance banner. */
  cachedAt: string | null;
  versions: DocVersion[];
  activeVersion: number;
}

function makeEntry(status: EntryState["status"]): EntryState {
  return {
    status,
    taskId: null,
    doc: "",
    classification: "ok",
    unstructured: false,
    error: null,
    source: null,
    cachedAt: null,
    versions: [],
    activeVersion: 0,
  };
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
    Object.fromEntries(keys.map((k) => [k, makeEntry("checking")])),
  );
  const [progressByKey, setProgressByKey] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  // Side-by-side read-only view of all versions (only offered when there are >1).
  const [compare, setCompare] = useState(false);
  // The doc shows RENDERED by default (it is validated by reading, not by
  // editing); the textarea is one Edit click away. Auto-opens for results
  // that require hand-work (unstructured output, needs_input).
  const [editing, setEditing] = useState(false);
  // Adjustable pane split (PO preference varies per story length); persisted.
  const splitRef = useRef<HTMLDivElement>(null);
  const [splitPct, setSplitPct] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(SPLIT_STORAGE_KEY));
      return v >= SPLIT_MIN && v <= SPLIT_MAX ? v : 50;
    } catch {
      return 50;
    }
  });
  const handleSplitDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const container = splitRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => {
      const pct = Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, ((ev.clientX - rect.left) / rect.width) * 100));
      setSplitPct(pct);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setSplitPct((v) => {
        try { localStorage.setItem(SPLIT_STORAGE_KEY, String(Math.round(v))); } catch { /* in-memory only */ }
        return v;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);
  const { mutate } = useSWRConfig();

  const currentKey = keys[index] ?? null;
  // Event callbacks (SSE results for background prefetches) must know which
  // item is on screen without re-binding on every advance.
  const currentKeyRef = useRef<string | null>(currentKey);
  // Updated via effect (never during render, per the React Compiler rules);
  // effects run before any SSE event for the new index can arrive.
  useEffect(() => {
    currentKeyRef.current = currentKey;
  }, [currentKey]);
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

  // Cache lookup, once per key on mount: a previously generated draft (or an
  // accepted save) shows immediately instead of costing a regeneration; only
  // keys without any cached doc are queued for generation.
  const checkedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const key of keys) {
      if (checkedRef.current.has(key)) continue;
      checkedRef.current.add(key);
      ticketsApi
        .getTestDoc(key)
        .then((data) => {
          const cached = data.draft ?? data.saved;
          if (cached) {
            // Both a saved doc AND a newer draft become versions the PO can
            // switch between/compare; the draft (latest) starts active.
            const versions: DocVersion[] = [];
            if (data.saved) {
              versions.push({
                label: "Saved",
                doc: data.saved.markdown,
                classification: coerceClassification(data.saved.classification),
                unstructured: false,
              });
            }
            if (data.draft) {
              versions.push({
                label: "Draft",
                doc: data.draft.markdown,
                classification: coerceClassification(data.draft.classification),
                unstructured: false,
              });
            }
            patchEntry(key, {
              status: "ready",
              doc: cached.markdown,
              classification: coerceClassification(cached.classification),
              source: data.draft ? "draft" : "saved",
              cachedAt: data.draft ? data.draft.generatedAt : data.saved?.updatedAt ?? null,
              versions,
              activeVersion: versions.length - 1,
            });
          } else {
            patchEntry(key, { status: "queued" });
          }
        })
        .catch(() => {
          // Cache miss on error: fall through to a fresh generation.
          patchEntry(key, { status: "queued" });
        });
    }
  }, [keys, patchEntry]);

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
      // Degrade gracefully on unstructured output: let the PO salvage it by hand.
      const doc = parsed ? parsed.markdown : output.trim();
      const classification = parsed ? parsed.classification : "ok";
      // A regeneration ADDS a version next to the existing ones (the PO
      // compares and accepts one); it never overwrites the older doc.
      setEntries((prev) => {
        const e = prev[key];
        if (!e) return prev;
        const versions = [...e.versions];
        if (versions[e.activeVersion]) {
          // Preserve any edits the PO made to the previously active version.
          versions[e.activeVersion] = {
            ...versions[e.activeVersion],
            doc: e.doc,
            classification: e.classification,
          };
        }
        const newCount = versions.filter((v) => v.label.startsWith("New")).length;
        versions.push({
          label: newCount === 0 ? "New" : `New ${newCount + 1}`,
          doc,
          classification,
          unstructured: !parsed,
        });
        return {
          ...prev,
          [key]: {
            ...e,
            status: "ready",
            doc,
            classification,
            unstructured: !parsed,
            source: "fresh",
            cachedAt: null,
            versions,
            activeVersion: versions.length - 1,
          },
        };
      });
      // Results that need hand-work open straight into the editor — but only
      // for the item on screen; a background prefetch result must not flip
      // the editor mode of whatever the PO is reviewing right now.
      if (key === currentKeyRef.current) {
        setEditing(!parsed || classification === "needs_input");
      }
      // Cache the raw generation immediately (fire-and-forget): closing the
      // modal or revisiting later must never cost a regeneration. Refresh the
      // board lists after: the row's test-doc marker derives from this state.
      if (doc) {
        ticketsApi
          .saveTestDocDraft(key, { markdown: doc, classification })
          .then(() => mutate((k) => typeof k === "string" && k.startsWith("/api/tickets?")))
          .catch(() => {});
      }
    },
    [mutate],
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
    setCompare(false);
    // Arriving at an already-ready entry that needs hand-work opens the editor
    // directly, mirroring what a live result arrival does.
    const next = entries[keys[index + 1] ?? ""];
    setEditing(next ? next.unstructured || next.classification === "needs_input" : false);
    setIndex((i) => i + 1);
  }, [isLast, handleClose, entries, keys, index]);

  const handleSave = useCallback(async () => {
    if (!currentKey || !entry || !entry.doc.trim()) return;
    setSaving(true);
    patchEntry(currentKey, { error: null });
    try {
      const result = await ticketsApi.saveTestDoc(currentKey, {
        markdown: entry.doc.trim(),
        classification: entry.classification,
      });
      // Refresh an open detail panel and the board lists (the row's test-doc
      // marker flips to accepted); the server cache is already invalidated.
      void mutate(`/api/tickets/${encodeURIComponent(currentKey)}`);
      void mutate((k) => typeof k === "string" && k.startsWith("/api/tickets?"));
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

  // PO judgement call: this ticket needs no test documentation at all.
  // Bridge-only marker (no doc, no Jira write); the sprint bundle lists it
  // separately and the missing overview skips it. Available while still
  // generating — the title alone often suffices — so cancel any in-flight
  // task for this key before advancing.
  const handleNotNeeded = useCallback(async () => {
    if (!currentKey || !entry) return;
    setSaving(true);
    try {
      if (entry.status === "generating" && entry.taskId) {
        workspaceTasks.cancel(entry.taskId).catch(() => {});
      }
      await ticketsApi.markTestDocNotNeeded(currentKey);
      void mutate(`/api/tickets/${encodeURIComponent(currentKey)}`);
      void mutate((k) => typeof k === "string" && k.startsWith("/api/tickets?"));
      setSaving(false);
      advance();
    } catch (err) {
      setSaving(false);
      patchEntry(currentKey, {
        error: err instanceof ApiError ? err.message : "Failed to mark as not needed",
      });
    }
  }, [advance, currentKey, entry, mutate, patchEntry]);

  // Regenerate bypasses the concurrency cap: the PO is actively waiting on
  // this one, unlike the background prefetch. Existing versions are KEPT —
  // the new result lands next to them for comparison, never over them.
  const handleRegenerate = useCallback(() => {
    if (!currentKey) return;
    setConflictMessage(null);
    setCompare(false);
    setEditing(false);
    patchEntry(currentKey, { status: "queued", taskId: null, error: null });
    startedRef.current.add(currentKey);
    startGeneration(currentKey);
  }, [currentKey, patchEntry, startGeneration]);

  // Switch the working copy to another version, preserving edits made to the
  // one being left.
  const handleSwitchVersion = useCallback(
    (index: number) => {
      if (!currentKey) return;
      setEntries((prev) => {
        const e = prev[currentKey];
        if (!e || index === e.activeVersion || !e.versions[index]) return prev;
        const versions = [...e.versions];
        versions[e.activeVersion] = {
          ...versions[e.activeVersion],
          doc: e.doc,
          classification: e.classification,
        };
        const target = versions[index];
        return {
          ...prev,
          [currentKey]: {
            ...e,
            versions,
            activeVersion: index,
            doc: target.doc,
            classification: target.classification,
            unstructured: target.unstructured,
          },
        };
      });
    },
    [currentKey],
  );

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

  const generating =
    entry.status === "checking" || entry.status === "queued" || entry.status === "generating";
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
      {/* data-autofocus: the modal focuses the card itself on open — the first
          focusable element is the header's ticket pill, which would otherwise
          pop its hover card immediately. */}
      <div
        data-autofocus
        tabIndex={-1}
        className="flex h-[min(760px,88vh)] w-[min(1180px,94vw)] flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-elevated shadow-2xl outline-none"
      >
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
              {/* The key lives ONCE, here in the header, as the regular ticket
                  pill (status + hover card + open in new tab). */}
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <TicketRefPill ticketKey={currentKey} />
                <span className="truncate text-body-sm text-text-tertiary">{detail?.title ?? ""}</span>
              </div>
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

        {/* Body: doc left, story right; the divider drags to resize (persisted). */}
        <div ref={splitRef} className="flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-col gap-3 p-4" style={{ width: `${splitPct}%` }}>
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
            {entry.source === "draft" && !generating && (
              <InlineAlert variant="info">
                Showing the doc generated earlier{entry.cachedAt ? ` (${new Date(entry.cachedAt).toLocaleString()})` : ""} — not
                saved yet. Review and save it, or Regenerate for a fresh version.
              </InlineAlert>
            )}
            {entry.source === "saved" && !generating && (
              <InlineAlert variant="info">
                Showing the saved test documentation{entry.cachedAt ? ` (${new Date(entry.cachedAt).toLocaleString()})` : ""}.
                Saving pushes it to Jira again; Regenerate builds a fresh version.
              </InlineAlert>
            )}
            {entry.error && <InlineAlert variant="error">{entry.error}</InlineAlert>}
            {conflictMessage && (
              <InlineAlert variant="warning">
                Saved in Bridge, but the Jira push hit a conflict: {conflictMessage} Resolve it
                from the ticket&apos;s description editor.
              </InlineAlert>
            )}
            {/* Toolbar: version chips (regenerations pile up next to the older
                doc; the PO switches, compares, then accepts ONE — Save discards
                the rest) plus the rendered/edit toggle. */}
            {!generating && (
              <div className="flex shrink-0 items-center gap-1.5" data-testid="test-doc-toolbar">
                {entry.versions.length > 1 && (
                  <span className="flex items-center gap-1.5" data-testid="test-doc-versions">
                    {entry.versions.map((v, i) => (
                      <button
                        key={`${i}-${v.label}`}
                        type="button"
                        onClick={() => handleSwitchVersion(i)}
                        className={`cursor-pointer rounded-md px-2 py-0.5 text-caption font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] ${
                          i === entry.activeVersion
                            ? "bg-[var(--color-brand-500)]/15 text-[var(--color-brand-400)] ring-1 ring-[var(--color-brand-500)]/30"
                            : "bg-overlay-subtle text-text-tertiary hover:bg-overlay-default hover:text-text-secondary"
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1.5">
                  {entry.versions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => { setCompare((c) => !c); setEditing(false); }}
                      className="cursor-pointer rounded-md px-2 py-0.5 text-caption font-medium text-text-tertiary hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                    >
                      {compare ? "Close compare" : "Compare"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setEditing((e) => !e); setCompare(false); }}
                    className="cursor-pointer rounded-md px-2 py-0.5 text-caption font-medium text-text-tertiary hover:bg-overlay-default hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                  >
                    {editing ? "Preview" : "Edit"}
                  </button>
                </span>
              </div>
            )}
            {generating ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-tertiary">
                <Loader2 size={20} strokeWidth={1.75} className="animate-spin text-[var(--color-brand-400)]" />
                <p className="max-w-[320px] truncate text-body-sm" data-testid="test-doc-progress">
                  {progressByKey[currentKey] ?? "Starting..."}
                </p>
              </div>
            ) : compare && entry.versions.length > 1 ? (
              <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto" data-testid="test-doc-compare">
                {entry.versions.map((v, i) => (
                  <div
                    key={`${i}-${v.label}`}
                    className={`flex min-w-[260px] flex-1 flex-col overflow-hidden rounded-xl border ${
                      i === entry.activeVersion ? "border-[var(--color-brand-500)]/45" : "border-border-subtle"
                    } bg-surface-base`}
                  >
                    <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-3 py-1.5">
                      <span className="text-caption font-medium text-text-tertiary">{v.label}</span>
                      {i !== entry.activeVersion && (
                        <button
                          type="button"
                          onClick={() => handleSwitchVersion(i)}
                          className="cursor-pointer text-caption font-medium text-[var(--color-brand-400)] hover:text-[var(--color-brand-300)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                        >
                          Use this one
                        </button>
                      )}
                    </div>
                    <div className="description-content min-h-0 flex-1 overflow-y-auto p-3 text-body-sm">
                      {renderMarkdown(i === entry.activeVersion ? entry.doc : v.doc)}
                    </div>
                  </div>
                ))}
              </div>
            ) : editing ? (
              <textarea
                value={entry.doc}
                onChange={(e) => handleDocChange(e.target.value)}
                spellCheck={false}
                placeholder="Generated test documentation (markdown)..."
                data-testid="test-doc-editor"
                className="min-h-0 flex-1 resize-none rounded-xl border border-border-default bg-surface-base p-3 font-mono text-body-sm leading-relaxed text-text-primary outline-none placeholder:text-text-muted focus:border-[var(--color-brand-500)]/45 [transition:border-color_.15s_ease]"
              />
            ) : (
              // Rendered markdown is the default reading mode; clicking it (or
              // the Edit toggle) switches to the raw editor.
              <div
                data-testid="test-doc-preview"
                onClick={() => setEditing(true)}
                title="Click to edit"
                className="description-content min-h-0 flex-1 cursor-pointer overflow-y-auto rounded-xl border border-border-subtle bg-surface-base p-3 text-body-sm"
              >
                {entry.doc.trim()
                  ? renderMarkdown(entry.doc)
                  : <p className="text-body-sm text-text-muted">Empty — click to write the checks yourself.</p>}
              </div>
            )}
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={handleSplitDrag}
            className="w-1 shrink-0 cursor-col-resize bg-border-subtle transition-colors duration-150 hover:bg-[var(--color-brand-500)]/40"
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col p-4">
            <TestDocStoryPane detail={detail} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3.5">
          <Button variant="ghost" size="md" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            size="md"
            onClick={handleNotNeeded}
            disabled={saving}
            title="Mark this ticket as needing no test documentation — it moves to a separate list in the sprint bundle and is never flagged as missing again"
          >
            No test doc needed
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
