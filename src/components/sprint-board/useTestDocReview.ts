"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { parseTestDoc, coerceClassification, type TestDocClassification } from "@/lib/parse-test-doc";
import { getCachedTestDoc, primeTestDocCache, invalidateTestDocCache } from "@/lib/test-doc-prefetch";
import { tickets as ticketsApi, workspaceTasks, ApiError } from "@/lib/api-client";

// Generations run ahead of the PO's review so the queue never waits (bulk
// prefetch). Capped: each generation is a full agent task on the workspace,
// and the "workspace" rate-limit tier allows 10 requests/min — three rolling
// starts stay well under both.
const MAX_CONCURRENT_GENERATIONS = 3;

const STALE_MARGIN_MS = 10 * 60 * 1000;

/** One reviewable doc variant; regeneration adds versions instead of replacing (PO compares, then accepts one). */
export interface DocVersion {
  label: string;
  doc: string;
  classification: TestDocClassification;
  unstructured: boolean;
}

export interface EntryState {
  /** checking (cache lookup) → idle (no cache, awaiting explicit Generate) | queued → generating (task streaming) → ready | error */
  status: "checking" | "idle" | "queued" | "generating" | "ready" | "error";
  taskId: string | null;
  /** The ACTIVE working copy (editable); versions[activeVersion] holds its last snapshot. */
  doc: string;
  classification: TestDocClassification;
  unstructured: boolean;
  error: string | null;
  /** Where the shown doc came from: a fresh generation, the draft cache, or an accepted save. */
  source: "fresh" | "draft" | "saved" | null;
  /** ISO timestamp of the cached draft / accepted save, for the provenance line. */
  cachedAt: string | null;
  /** Latest story CONTENT change; a doc older than this gets a staleness warning. */
  storyUpdatedAt: string | null;
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
    storyUpdatedAt: null,
    versions: [],
    activeVersion: 0,
  };
}

/**
 * The state machine behind the test-doc review modal (BRDG-426): per-key entry
 * states, the cache-lookup-on-open, the rolling generation scheduler, versioned
 * regeneration, and the save / not-needed / advance handlers. Extracted from
 * TestDocReviewModal so the component is just layout + wiring.
 */
export function useTestDocReview({
  keys,
  autoGenerate,
  onClose,
}: {
  keys: string[];
  autoGenerate: boolean;
  onClose: () => void;
}) {
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
  const entry = currentKey ? entries[currentKey] ?? null : null;

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
      // Hover-prefetched (or recently fetched) docs resolve without a round
      // trip, so opening the modal shows the doc immediately.
      const prefetched = getCachedTestDoc(key);
      (prefetched ? Promise.resolve(prefetched) : ticketsApi.getTestDoc(key))
        .then((data) => {
          if (!prefetched) primeTestDocCache(key, data);
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
              storyUpdatedAt: data.storyUpdatedAt ?? null,
              versions,
              activeVersion: versions.length - 1,
            });
          } else {
            patchEntry(key, { status: autoGenerate ? "queued" : "idle" });
          }
        })
        .catch(() => {
          // Cache lookup failure reads as a miss.
          patchEntry(key, { status: autoGenerate ? "queued" : "idle" });
        });
    }
  }, [keys, patchEntry, autoGenerate]);

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

  const handleProgress = useCallback((key: string, message: string) => {
    setProgressByKey((prev) => ({ ...prev, [key]: message }));
  }, []);

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
        invalidateTestDocCache(key);
        ticketsApi
          .saveTestDocDraft(key, { markdown: doc, classification })
          .then(() => mutate((k) => typeof k === "string" && k.startsWith("/api/tickets")))
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
      invalidateTestDocCache(currentKey);
      // Refresh an open detail panel and the board lists (the row's test-doc
      // marker flips to accepted); the server cache is already invalidated.
      void mutate(`/api/tickets/${encodeURIComponent(currentKey)}`);
      void mutate((k) => typeof k === "string" && k.startsWith("/api/tickets"));
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
      invalidateTestDocCache(currentKey);
      void mutate(`/api/tickets/${encodeURIComponent(currentKey)}`);
      void mutate((k) => typeof k === "string" && k.startsWith("/api/tickets"));
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
    (target: number) => {
      if (!currentKey) return;
      setEntries((prev) => {
        const e = prev[currentKey];
        if (!e || target === e.activeVersion || !e.versions[target]) return prev;
        const versions = [...e.versions];
        versions[e.activeVersion] = {
          ...versions[e.activeVersion],
          doc: e.doc,
          classification: e.classification,
        };
        const next = versions[target];
        return {
          ...prev,
          [currentKey]: {
            ...e,
            versions,
            activeVersion: target,
            doc: next.doc,
            classification: next.classification,
            unstructured: next.unstructured,
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

  const generating =
    !!entry && (entry.status === "checking" || entry.status === "queued" || entry.status === "generating");
  const docIsStale = Boolean(
    entry &&
      entry.cachedAt &&
      entry.storyUpdatedAt &&
      new Date(entry.storyUpdatedAt).getTime() - new Date(entry.cachedAt).getTime() > STALE_MARGIN_MS,
  );
  // Prefetched docs waiting beyond the current one — tells the PO that
  // advancing will be instant.
  const readyAhead = keys.slice(index + 1).filter((k) => entries[k]?.status === "ready").length;
  const saveDisabled =
    generating || saving || !entry?.doc.trim() || entry?.classification === "needs_input";

  return {
    // identity / position
    currentKey,
    entry,
    index,
    isBulk,
    isLast,
    detail,
    // per-key state for the background stream watchers
    entries,
    progressByKey,
    handleProgress,
    handleTaskResult,
    handleTaskError,
    // transient UI
    saving,
    conflictMessage,
    compare,
    setCompare,
    editing,
    setEditing,
    // derived flags
    generating,
    docIsStale,
    readyAhead,
    saveDisabled,
    // actions
    handleClose,
    advance,
    handleSave,
    handleNotNeeded,
    handleRegenerate,
    handleSwitchVersion,
    handleDocChange,
  };
}
