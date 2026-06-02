"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Check } from "lucide-react";
import { TEAMS, type Team } from "@/lib/sprint-utils";
import { useSetEpicTeams } from "@/hooks/useEpics";

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
  const [open, setOpen] = useState(false);
  // Optimistic override so chips update instantly; cleared once the prop catches up.
  const [pending, setPending] = useState<Team[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const current = pending ?? teams;
  const currentSet = new Set(current);

  // Reconcile the optimistic value once revalidated data matches it.
  useEffect(() => {
    if (pending && pending.every((t) => teams.includes(t)) && pending.length === teams.length) {
      setPending(null);
    }
  }, [teams, pending]);

  async function toggleTeam(team: Team) {
    const next = currentSet.has(team)
      ? current.filter((t) => t !== team)
      : TEAMS.filter((t) => currentSet.has(t) || t === team);
    setPending(next);
    try {
      await setTeams(epicKey, next);
    } catch {
      setPending(null); // revert on failure; SWR keeps the server truth
    }
  }

  async function clearAll() {
    setPending([]);
    try {
      await setTeams(epicKey, []);
    } catch {
      setPending(null);
    }
  }

  return (
    <div ref={containerRef} className="relative flex shrink-0 items-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-label={current.length > 0 ? `Teams: ${current.join(", ")}. Edit.` : "Assign teams"}
        title={current.length > 0 ? "Edit teams" : "Assign teams"}
        className="group/teams flex items-center gap-1 rounded-md px-1.5 py-1 cursor-pointer transition-colors duration-150 hover:bg-overlay-default focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
      >
        {current.length > 0 ? (
          current.map((team) => (
            <span
              key={team}
              className="rounded border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums tracking-wide"
              style={chipStyle(team)}
            >
              {team}
            </span>
          ))
        ) : (
          <span className="flex items-center gap-1 text-[11px] font-medium text-text-muted transition-colors duration-150 group-hover/teams:text-text-tertiary">
            <Plus size={11} strokeWidth={2} />
            Team
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-border-strong bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-lg)]"
          >
            <div className="px-3 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
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
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTeam(team);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-body-sm cursor-pointer transition-colors duration-150 ${
                    checked
                      ? "text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10"
                      : "text-text-secondary hover:bg-hover-list-item"
                  }`}
                >
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-caption ${
                      checked
                        ? "border-[var(--color-brand-400)] bg-[var(--color-brand-500)]/20 text-[var(--color-brand-400)]"
                        : "border-border-strong"
                    }`}
                  >
                    {checked && <Check size={9} strokeWidth={3} />}
                  </span>
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
                  onClick={(e) => {
                    e.stopPropagation();
                    clearAll();
                  }}
                  className="w-full px-3 py-1.5 text-left text-body-sm text-text-tertiary cursor-pointer transition-colors duration-150 hover:bg-hover-list-item hover:text-text-secondary"
                >
                  Clear teams
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
