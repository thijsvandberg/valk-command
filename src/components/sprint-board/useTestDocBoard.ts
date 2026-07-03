"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  // is the row/status-line case, multiple the bulk queue.
  const [testDocKeys, setTestDocKeys] = useState<string[] | null>(null);
  // Sprint bundle modal (BRDG-461): the sprint whose delivery document is open.
  const [testDocsSprintId, setTestDocsSprintId] = useState<string | null>(null);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fires at most once per sprint (localStorage flag inside the helper), so it cannot cascade
    setTestDocForSprint(activeSprint!.id, true);
  }, [activeSprint, remainingWorkDays, setTestDocForSprint]);

  // Deprecated work never needs delivery documentation: every entry point into
  // the generate/validate queue silently drops those keys.
  const openTestDocQueue = useCallback((keys: string[]) => {
    const eligible = keys.filter((k) => {
      const t = allTickets.find((x) => x.key === k);
      return !t || t.jiraStatus !== "DEPRECATED";
    });
    if (eligible.length === 0) {
      showToast("Deprecated tickets don't get test documentation");
      return;
    }
    setTestDocKeys(eligible);
  }, [allTickets, showToast]);

  const handleSprintTestDocs = useCallback((sprintId: string) => {
    setTestDocsSprintId(sprintId);
  }, []);

  return {
    testDocKeys,
    setTestDocKeys,
    testDocsSprintId,
    setTestDocsSprintId,
    testDocScopeSprintId,
    effectiveVisibleTags,
    handleColumnToggle,
    openTestDocQueue,
    handleSprintTestDocs,
  };
}
