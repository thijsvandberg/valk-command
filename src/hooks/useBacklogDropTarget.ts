"use client";

import { useAccountSetting } from "@/hooks/useAccountSetting";

const BACKLOG_DROP_TARGET_URL = "/api/settings/backlog-drop-target";

// Default matches the route default so the synchronous client value lines up
// with the server before the first GET resolves (BRDG-346).
const DEFAULT_BACKLOG_TARGET = "BT: Backlog";

/**
 * Per-account "default backlog" preference (BRDG-346): the team backlog sprint
 * NAME that the sprint board's leading drop tile assigns tickets to. Stored on
 * the BRDG-343 user-scoped foundation so it follows the Clerk account across
 * browsers, ports, and devices.
 */
export function useBacklogDropTarget() {
  const { value, setValue, isLoading } = useAccountSetting<string>(
    BACKLOG_DROP_TARGET_URL,
    DEFAULT_BACKLOG_TARGET,
  );
  return { backlogTargetName: value, setBacklogTargetName: setValue, isLoading };
}
