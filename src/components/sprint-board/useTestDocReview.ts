"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { parseTestDoc, coerceClassification, type TestDocClassification } from "@/lib/parse-test-doc";
import { getCachedTestDoc, primeTestDocCache, invalidateTestDocCache, revalidateTestDocViews } from "@/lib/test-doc-prefetch";
import { tickets as ticketsApi, workspaceTasks, ApiError } from "@/lib/api-client";
import { registerPendingEdit, confirmPendingEdit, clearPendingEdit } from "@/components/sprint-board/pendingTicketEdits";
import { patchTicketDetailCache } from "@/lib/ticket-cache";

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
  /**
   * checking (cache lookup) → idle (no cache, awaiting explicit Generate)
   * | not_needed (explicit marker, never auto-generates) | queued →
   * generating (task streaming) → ready | error
   */
  status: "checking" | "idle" | "not_needed" | "queued" | "generating" | "ready" | "error";
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
  /** When the explicit "no test doc needed" marker was set (BRDG-467). */
  notNeededAt: string | null;
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
    notNeededAt: null,
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
  regenerateOnOpen = false,
  onClose,
}: {
  keys: string[];
  autoGenerate: boolean;
  /**
   * Open with a regeneration already queued (BRDG-468): the cached doc still
   * seeds the versions, then a fresh generation lands next to it, exactly like
   * pressing the footer's Regenerate. Single-key only; a not-needed marker
   * still wins (never auto-generates, BRDG-467).
   */
  regenerateOnOpen?: boolean;
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
  // View revalidation (board lists + sprint bundle) lives in test-doc-prefetch
  // so the detail-view quick actions (BRDG-468) share the exact same sweep.

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

  // Keys that already have an ACCEPTED doc. A background draft save must not
  // flip the board marker to "draft" for those: server-side, an accepted doc
  // outranks a draft (deriveTestDocState), so the marker stays "accepted".
  const hasSavedRef = useRef<Set<string>>(new Set());

  // Cache lookup, once per key on mount: a previously generated draft (or an
  // accepted save) shows immediately instead of costing a regeneration; only
  // keys without any cached doc are queued for generation.
  const checkedRef = useRef<Set<string>>(new Set());
  // Single-key only: a bulk queue must never mass-regenerate cached docs.
  const regenOnOpen = regenerateOnOpen && keys.length === 1;
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
          if (data.saved) hasSavedRef.current.add(key);
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
              // regenOnOpen queues a fresh generation with the cached doc
              // seeded as versions: the scheduler starts it and the result
              // lands as a "New" version, exactly like the footer Regenerate.
              status: regenOnOpen ? "queued" : "ready",
              doc: cached.markdown,
              classification: coerceClassification(cached.classification),
              source: data.draft ? "draft" : "saved",
              cachedAt: data.draft ? data.draft.generatedAt : data.saved?.updatedAt ?? null,
              storyUpdatedAt: data.storyUpdatedAt ?? null,
              versions,
              activeVersion: versions.length - 1,
            });
          } else if (data.notNeeded) {
            // Explicit "no doc needed" marker (BRDG-467): show it instead of
            // the empty state, and never auto-generate — the scheduler only
            // starts "queued" entries. A cached doc/draft above outranks the
            // marker, matching deriveTestDocState priority.
            patchEntry(key, {
              status: "not_needed",
              notNeededAt: data.notNeededAt ?? null,
              storyUpdatedAt: data.storyUpdatedAt ?? null,
            });
          } else {
            // A regenerate intent on a cache miss degrades to a plain generate.
            patchEntry(key, { status: autoGenerate || regenOnOpen ? "queued" : "idle" });
          }
        })
        .catch(() => {
          // Cache lookup failure reads as a miss.
          patchEntry(key, { status: autoGenerate || regenOnOpen ? "queued" : "idle" });
        });
    }
  }, [keys, patchEntry, autoGenerate, regenOnOpen]);

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
      // The marker flips through the pending-edits overlay because the list
      // revalidation can be served a stale snapshot (see optimistic-updates
      // doc); skipped when an accepted doc exists, since that outranks a draft.
      if (doc) {
        invalidateTestDocCache(key);
        const becomesDraft = !hasSavedRef.current.has(key);
        if (becomesDraft) registerPendingEdit(key, "testDocState", "draft", Date.now());
        ticketsApi
          .saveTestDocDraft(key, { markdown: doc, classification })
          .then(() => {
            if (becomesDraft) {
              confirmPendingEdit(key, "testDocState");
              patchTicketDetailCache(key, { testDocState: "draft" });
            }
            revalidateTestDocViews();
          })
          .catch(() => {
            if (becomesDraft) clearPendingEdit(key, "testDocState");
          });
      }
    },
    [],
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
    // Overlay so the board marker flips to accepted immediately: the list
    // revalidation below can be served a stale snapshot (see the
    // optimistic-updates doc) and would otherwise keep the old marker.
    registerPendingEdit(currentKey, "testDocState", "accepted", Date.now());
    try {
      const result = await ticketsApi.saveTestDoc(currentKey, {
        markdown: entry.doc.trim(),
        classification: entry.classification,
      });
      hasSavedRef.current.add(currentKey);
      confirmPendingEdit(currentKey, "testDocState");
      patchTicketDetailCache(currentKey, { testDocState: "accepted" });
      invalidateTestDocCache(currentKey);
      // Refresh the detail panel, the board rows (the marker flips to accepted)
      // AND any sprint bundle it was opened from; the server cache is already
      // invalidated.
      revalidateTestDocViews();
      setSaving(false);
      if (result.conflict) {
        // Bridge copy is saved; the description merge stays as a local edit for
        // the regular conflict-resolve flow. Tell the PO instead of advancing.
        setConflictMessage(result.message ?? "Jira was updated since your edit.");
        return;
      }
      advance();
    } catch (err) {
      clearPendingEdit(currentKey, "testDocState");
      setSaving(false);
      patchEntry(currentKey, {
        error: err instanceof ApiError ? err.message : "Failed to save test documentation",
      });
    }
  }, [advance, currentKey, entry, patchEntry]);

  // PO judgement call: this ticket needs no test documentation at all.
  // Bridge-only marker (no doc, no Jira write); the sprint bundle lists it
  // separately and the missing overview skips it. Available while still
  // generating — the title alone often suffices — so cancel any in-flight
  // task for this key before advancing.
  const handleNotNeeded = useCallback(async () => {
    if (!currentKey || !entry) return;
    setSaving(true);
    // Same overlay as handleSave: the marker must flip to not_needed even when
    // the list revalidation returns a stale snapshot.
    registerPendingEdit(currentKey, "testDocState", "not_needed", Date.now());
    try {
      if (entry.status === "generating" && entry.taskId) {
        workspaceTasks.cancel(entry.taskId).catch(() => {});
      }
      await ticketsApi.markTestDocNotNeeded(currentKey);
      // The not-needed write clears the accepted doc and the draft server-side.
      hasSavedRef.current.delete(currentKey);
      confirmPendingEdit(currentKey, "testDocState");
      patchTicketDetailCache(currentKey, { testDocState: "not_needed" });
      invalidateTestDocCache(currentKey);
      revalidateTestDocViews();
      setSaving(false);
      advance();
    } catch (err) {
      clearPendingEdit(currentKey, "testDocState");
      setSaving(false);
      patchEntry(currentKey, {
        error: err instanceof ApiError ? err.message : "Failed to mark as not needed",
      });
    }
  }, [advance, currentKey, entry, patchEntry]);

  // Inverse of handleNotNeeded (BRDG-467): remove the marker and land in the
  // neutral idle state. Deliberately no advance and no queue — the PO decides
  // explicitly whether to generate next.
  const handleRemoveNotNeeded = useCallback(async () => {
    if (!currentKey || !entry) return;
    setSaving(true);
    patchEntry(currentKey, { error: null });
    // Same overlay as handleNotNeeded: the board marker must reset to neutral
    // even when the list revalidation returns a stale snapshot.
    registerPendingEdit(currentKey, "testDocState", null, Date.now());
    try {
      await ticketsApi.unmarkTestDocNotNeeded(currentKey);
      confirmPendingEdit(currentKey, "testDocState");
      patchTicketDetailCache(currentKey, { testDocState: null });
      invalidateTestDocCache(currentKey);
      revalidateTestDocViews();
      setSaving(false);
      patchEntry(currentKey, { status: "idle", notNeededAt: null });
    } catch (err) {
      clearPendingEdit(currentKey, "testDocState");
      setSaving(false);
      patchEntry(currentKey, {
        error: err instanceof ApiError ? err.message : "Failed to remove the marker",
      });
    }
  }, [currentKey, entry, patchEntry]);

  // Full removal (PO request 2026-07-05): unlike the not-needed marker the
  // ticket counts as MISSING again afterwards, and unlike editing the doc to
  // empty (Save stays disabled) the intent is explicit. Clears the Bridge copy
  // + draft and strips the Jira description block server-side; lands in idle
  // with the version history gone. The modal gates this behind a confirm.
  const handleDelete = useCallback(async () => {
    if (!currentKey || !entry) return;
    setSaving(true);
    setCompare(false);
    setEditing(false);
    patchEntry(currentKey, { error: null });
    // Same overlay as the other writes: the board marker must reset to neutral
    // even when the list revalidation returns a stale snapshot.
    registerPendingEdit(currentKey, "testDocState", null, Date.now());
    try {
      const result = await ticketsApi.deleteTestDoc(currentKey);
      hasSavedRef.current.delete(currentKey);
      confirmPendingEdit(currentKey, "testDocState");
      patchTicketDetailCache(currentKey, { testDocState: null });
      invalidateTestDocCache(currentKey);
      revalidateTestDocViews();
      setSaving(false);
      patchEntry(currentKey, {
        status: "idle",
        doc: "",
        classification: "ok",
        unstructured: false,
        source: null,
        cachedAt: null,
        notNeededAt: null,
        versions: [],
        activeVersion: 0,
        // The Bridge copy is gone either way; a Jira conflict only means the
        // stripped description stayed behind as a local edit to resolve.
        error: result.conflict
          ? `Deleted in Bridge, but the Jira push hit a conflict: ${result.message ?? "resolve it from the ticket's description editor."}`
          : null,
      });
    } catch (err) {
      clearPendingEdit(currentKey, "testDocState");
      setSaving(false);
      patchEntry(currentKey, {
        error: err instanceof ApiError ? err.message : "Failed to delete the test doc",
      });
    }
  }, [currentKey, entry, patchEntry]);

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
    handleRemoveNotNeeded,
    handleDelete,
    handleRegenerate,
    handleSwitchVersion,
    handleDocChange,
  };
}
