"use client";

import { useAccountSetting } from "@/hooks/useAccountSetting";
import type { Team } from "@/lib/sprint-utils";

const DEFAULT_TEAM_URL = "/api/settings/default-team";

// No team is selected by default; consumers fall back to plain ordering until
// the PO picks one.
const DEFAULT_TEAM: Team | null = null;

/**
 * Per-account "default team" preference: the PO's own team (BT/BM/BO/GXP/HT),
 * or null when none is set. This is the single source of truth for "which team
 * is mine" and is consumed by the New stories inbox (BRDG-356) to sort the PO's
 * own team to the top. Stored on the BRDG-343 user-scoped foundation so it
 * follows the Clerk account across browsers, ports, and devices.
 */
export function useDefaultTeam() {
  const { value, setValue, isLoading } = useAccountSetting<Team | null>(
    DEFAULT_TEAM_URL,
    DEFAULT_TEAM,
  );
  return { defaultTeam: value, setDefaultTeam: setValue, isLoading };
}
