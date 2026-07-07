"use client";

import { useEffect, useState } from "react";
import { jira as jiraApi, settings as settingsApi } from "@/lib/api-client";
import type { Sprint } from "@/types/ticket";

/**
 * Shared lazy loader for the placement option list: active/future sprints plus
 * the configured default sprint. Loads once when `enabled` first becomes true
 * (i.e. a placement menu opens), so the board stays cheap until the PO uses it.
 * Shared by SprintPlacementMenu and the breakdown Actions menu so the option
 * list is fetched the same way in both.
 */
export function useSprintOptions(enabled: boolean) {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [defaultSprintId, setDefaultSprintId] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || loaded) return;
    let cancelled = false;
    void (async () => {
      try {
        const [sprintList, def] = await Promise.all([
          jiraApi.getSprints(),
          settingsApi.getDefaultSprint().catch(() => ({ sprintId: "" })),
        ]);
        if (cancelled) return;
        setSprints(sprintList.filter((s) => s.state === "active" || s.state === "future"));
        setDefaultSprintId(def?.sprintId ?? "");
      } catch {
        /* options stay empty; backlog is always available */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, loaded]);

  return { sprints, defaultSprintId, loaded };
}
