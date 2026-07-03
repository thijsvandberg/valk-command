"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { TEAMS, type Team } from "@/lib/sprint-utils";
import { Checkbox } from "@/components/shared/Checkbox";
import { useSetEpicTeams } from "@/hooks/useEpics";
import { usePickerState } from "@/components/shared/BasePicker";

// Distinct categorical hues per team, deliberately steering clear of the
// done/in-progress/todo status colors used in the progress bars.
export const TEAM_COLORS: Record<Team, string> = {
  BO: "#38bdf8", // sky
  BM: "#c084fc", // purple
  BT: "#2dd4bf", // teal
  GXP: "#fb7185", // rose
  HT: "#fbbf24", // amber
};

function chipStyle(team: Team) {
  const c = TEAM_COLORS[team];
  return {
    color: c,
    backgroundColor: `color-mix(in srgb, ${c} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${c} 35%, transparent)`,
  };
}

export function EpicTeamPicker({ epicKey, teams }: { epicKey: string; teams: Team[] }) {
  const setTeams = useSetEpicTeams();
  // Portal mode so the menu escapes the epic row's `overflow-hidden` clip.
  const { open, triggerRef, popoverRef, handleOpen, handleClose, getPopoverStyle } =
    usePickerState({ portal: true, align: "right", popoverHeight: 240 });

  // Optimistic override so chips update instantly; cleared once the write
  // (and its SWR revalidation) settles and the prop reflects the new value.
  const [pending, setPending] = useState<Team[] | null>(null);

  const current = pending ?? teams;
  const currentSet = new Set(current);

  async function commit(next: Team[]) {
    setPending(next);
    try {
      await setTeams(epicKey, next);
    } finally {
      setPending(null);
    }
  }

  function toggleTeam(team: Team) {
    const next = currentSet.has(team)
      ? current.filter((t) => t !== team)
      : TEAMS.filter((t) => currentSet.has(t) || t === team);
    void commit(next);
  }

  function clearAll() {
    void commit([]);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          open ? handleClose() : handleOpen();
        }}
        aria-haspopup="menu"
        aria-label={current.length > 0 ? `Teams: ${current.join(", ")}. Edit.` : "Assign teams"}
        title={current.length > 0 ? "Edit teams" : "Assign teams"}
        className="group/teams flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 cursor-pointer transition-colors duration-150 hover:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
      >
        {current.length > 0 ? (
          current.map((team) => (
            <span
              key={team}
              className="rounded border px-1.5 py-0.5 text-caption font-semibold tabular-nums tracking-wide"
              style={chipStyle(team)}
            >
              {team}
            </span>
          ))
        ) : (
          <span className="flex items-center gap-1 text-label font-medium text-text-muted transition-colors duration-150 group-hover/teams:text-text-tertiary">
            <Plus size={11} strokeWidth={2} />
            Team
          </span>
        )}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            className="fixed z-popover min-w-[160px] overflow-hidden rounded-lg border border-border-strong py-1"
            style={getPopoverStyle()}
          >
            <div className="px-3 pb-1 pt-1 text-caption font-semibold uppercase tracking-wider text-text-muted">
              Teams
            </div>
            {TEAMS.map((team) => {
              const checked = currentSet.has(team);
              return (
                <button
                  key={team}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  onClick={() => toggleTeam(team)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-body-sm cursor-pointer transition-colors duration-150 ${
                    checked
                      ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10"
                      : "text-text-secondary hover:bg-hover-list-item"
                  } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
                >
                  <Checkbox checked={checked} />
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: TEAM_COLORS[team] }}
                  />
                  {team}
                </button>
              );
            })}
            {current.length > 0 && (
              <>
                <div className="mx-3 my-1 border-t border-border-default" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={clearAll}
                  className="w-full px-3 py-1.5 text-left text-body-sm text-text-tertiary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item hover:text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                >
                  Clear teams
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
