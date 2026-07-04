"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { tickets as ticketsApi } from "@/lib/api-client";
import type { ReactNode } from "react";
import type { Sprint, Ticket } from "@/types/ticket";
import type { InlineTagId } from "@/components/sprint-board/filter-bar-types";
import {
  shouldAutoEnableTestDocTag,
  readTestDocTagSprints,
  persistTestDocTagSprints,
} from "@/components/sprint-board/sprint-board-utils";

/**
 * All sprint-board wiring for the stakeholder test-doc feature (BRDG-426) in
 * one place: the PER-SPRINT marker visibility (the delivery check belongs to
 * one sprint; the next one starts with markers off), its last-working-day
 * auto-reveal, the Display-menu toggle override, and the two modal states
 * (review queue + sprint bundle) with the deprecated-skipping queue opener.
 */
export function useTestDocBoard({
  isAllView,
  activeSprint,
  remainingWorkDays,
  visibleTags,
  toggleColumn,
  allTickets,
  showToast,
}: {
  isAllView: boolean;
  activeSprint: Sprint | null;
  remainingWorkDays: number | null;
  visibleTags: Set<InlineTagId>;
  toggleColumn: (id: InlineTagId, show: boolean) => void;
  allTickets: Ticket[];
  showToast: (message: ReactNode, durationMs?: number) => void;
}) {
  // Review queue (BRDG-426): non-null opens the split-view modal; a single key
  // is the row/status-line case, multiple the bulk queue. autoGenerate is false
  // for the "view" entry points (marker, status line): opening the modal must
  // not silently start an agent task.
  const [testDocQueue, setTestDocQueue] = useState<{ keys: string[]; autoGenerate: boolean; returnToSprintId?: string } | null>(null);
  // Confirm gate (BRDG-463): a bulk (re)generate that would sweep in tickets the
  // PO already marked "no test doc needed" pauses here first. `eligible` is the
  // full deprecation-filtered set; `notNeededKeys` its "not needed" subset. Only
  // reached for autoGenerate runs, so a confirmed queue is always autoGenerate.
  const [testDocConfirm, setTestDocConfirm] = useState<{ eligible: string[]; notNeededKeys: string[]; returnToSprintId?: string } | null>(null);
  // Sprint bundle modal (BRDG-461): the sprint whose delivery document is open.
  const [testDocsSprintId, setTestDocsSprintId] = useState<string | null>(null);
  const { mutate } = useSWRConfig();

  // Fire-and-forget generation from the status line: the task runs on the
  // workspace, the SERVER persists the draft on completion (generate route's
  // after() capture), and this poll only watches the cheap local cache read to
  // flip the button to "View test doc" and toast when it lands.
  const [backgroundGenerating, setBackgroundGenerating] = useState<Set<string>>(new Set());
  const unmountedRef = useRef(false);
  useEffect(() => () => { unmountedRef.current = true; }, []);
  const startBackgroundGeneration = useCallback(async (key: string) => {
    setBackgroundGenerating((prev) => new Set(prev).add(key));
    try {
      await ticketsApi.generateTestDoc(key);
      // ~6 min at 3s, matching the server-side capture window.
      for (let attempt = 0; attempt < 120 && !unmountedRef.current; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const data = await ticketsApi.getTestDoc(key).catch(() => null);
        if (data && (data.draft || data.saved)) {
          // AWAIT the revalidation: dropping the Generating state before the
          // rows carry the new testDocState flashes the stale Generate button.
          await mutate((k) => typeof k === "string" && k.startsWith("/api/tickets"));
          showToast(`Test doc ready for ${key} — review it via the status line`);
          break;
        }
      }
    } catch {
      showToast(`Test doc generation failed for ${key}`);
    } finally {
      if (!unmountedRef.current) {
        setBackgroundGenerating((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    }
  }, [mutate, showToast]);

  const [testDocSprints, setTestDocSprints] = useState<Set<string>>(() => readTestDocTagSprints());
  const setTestDocForSprint = useCallback((sprintId: string, on: boolean) => {
    setTestDocSprints((prev) => {
      const next = new Set(prev);
      if (on) next.add(sprintId); else next.delete(sprintId);
      persistTestDocTagSprints(next);
      return next;
    });
  }, []);

  // The single-sprint scope the marker toggle applies to; null on the All view
  // and saved views (no single sprint to scope to — markers stay off there).
  const testDocScopeSprintId = !isAllView && activeSprint ? activeSprint.id : null;

  const effectiveVisibleTags = useMemo(() => {
    const tags = new Set(visibleTags);
    tags.delete("testDoc");
    if (testDocScopeSprintId && testDocSprints.has(testDocScopeSprintId)) tags.add("testDoc");
    return tags;
  }, [visibleTags, testDocScopeSprintId, testDocSprints]);

  const handleColumnToggle = useCallback(
    (id: InlineTagId, show: boolean) => {
      if (id === "testDoc") {
        if (testDocScopeSprintId) setTestDocForSprint(testDocScopeSprintId, show);
        return;
      }
      toggleColumn(id, show);
    },
    [testDocScopeSprintId, setTestDocForSprint, toggleColumn],
  );

  // Reveal the marker automatically once the active sprint enters its last
  // working day — the moment the delivery check matters. Applied ONCE per
  // sprint (localStorage flag inside the helper), so switching it off sticks.
  useEffect(() => {
    if (!shouldAutoEnableTestDocTag(activeSprint?.id, remainingWorkDays)) return;
     
    setTestDocForSprint(activeSprint!.id, true);
  }, [activeSprint, remainingWorkDays, setTestDocForSprint]);

  // Deprecated work never needs delivery documentation: every entry point into
  // the generate/validate queue silently drops those keys.
  const openTestDocQueue = useCallback((keys: string[], opts?: { autoGenerate?: boolean; returnToSprintId?: string }) => {
    const eligible = keys.filter((k) => {
      const t = allTickets.find((x) => x.key === k);
      return !t || t.jiraStatus !== "DEPRECATED";
    });
    if (eligible.length === 0) {
      showToast("Deprecated tickets don't get test documentation");
      return;
    }
    const autoGenerate = opts?.autoGenerate ?? true;
    // View-only opens never (re)generate, so they never need the confirm gate.
    // A generate run that would touch a "not needed" ticket pauses for a choice
    // (BRDG-463) instead of silently undoing the PO's earlier decision.
    if (autoGenerate) {
      const notNeededKeys = eligible.filter((k) => allTickets.find((x) => x.key === k)?.testDocState === "not_needed");
      if (notNeededKeys.length > 0) {
        setTestDocConfirm({ eligible, notNeededKeys, returnToSprintId: opts?.returnToSprintId });
        return;
      }
    }
    setTestDocQueue({ keys: eligible, autoGenerate, returnToSprintId: opts?.returnToSprintId });
  }, [allTickets, showToast]);

  // Regenerate only the tickets that were NOT marked "not needed" (the default,
  // safe choice). If the selection was entirely "not needed" tickets there is
  // nothing left to do, so we toast rather than open an empty review modal.
  const confirmTestDocSkip = useCallback(() => {
    if (!testDocConfirm) return;
    const notNeeded = new Set(testDocConfirm.notNeededKeys);
    const rest = testDocConfirm.eligible.filter((k) => !notNeeded.has(k));
    setTestDocConfirm(null);
    if (rest.length === 0) {
      showToast("All selected tickets are marked \"no test doc needed\" — nothing to generate");
      return;
    }
    setTestDocQueue({ keys: rest, autoGenerate: true, returnToSprintId: testDocConfirm.returnToSprintId });
  }, [testDocConfirm, showToast]);

  // Regenerate the full set, "not needed" tickets included. The classification
  // is left untouched: it only changes if the PO later accepts a doc.
  const confirmTestDocInclude = useCallback(() => {
    if (!testDocConfirm) return;
    setTestDocQueue({ keys: testDocConfirm.eligible, autoGenerate: true, returnToSprintId: testDocConfirm.returnToSprintId });
    setTestDocConfirm(null);
  }, [testDocConfirm]);

  const cancelTestDocConfirm = useCallback(() => setTestDocConfirm(null), []);

  const handleSprintTestDocs = useCallback((sprintId: string) => {
    setTestDocsSprintId(sprintId);
  }, []);

  return {
    testDocQueue,
    setTestDocQueue,
    testDocConfirm,
    confirmTestDocSkip,
    confirmTestDocInclude,
    cancelTestDocConfirm,
    backgroundGenerating,
    startBackgroundGeneration,
    testDocsSprintId,
    setTestDocsSprintId,
    testDocScopeSprintId,
    effectiveVisibleTags,
    handleColumnToggle,
    openTestDocQueue,
    handleSprintTestDocs,
  };
}
