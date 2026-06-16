"use client";

import { useState } from "react";
import { ChevronDown, Check, AlertTriangle } from "lucide-react";
import useSWR from "swr";
import { swrFetcher, settings, sprintSlots as sprintSlotsApi } from "@/lib/api-client";
import type { SprintSlot } from "@/components/command-palette/types";
import { useBacklogDropTarget } from "@/hooks/useBacklogDropTarget";
import { useDefaultTeam } from "@/hooks/useDefaultTeam";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { isBacklogSprintName, TEAMS } from "@/lib/sprint-utils";

export default function GeneralSettingsPage() {
  const [saving, setSaving] = useState(false);

  const { data: defaultData, mutate } = useSWR<{ sprintId: string }>(
    settings.defaultSprintUrl(),
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const { data: slotsRaw } = useSWR<SprintSlot[]>(
    sprintSlotsApi.listUrl(),
    swrFetcher,
    { revalidateOnFocus: false },
  );

  const { backlogTargetName, setBacklogTargetName } = useBacklogDropTarget();
  const { defaultTeam, setDefaultTeam } = useDefaultTeam();
  const { sprints } = useJiraSprints();
  const backlogOptions = sprints.filter((s) => isBacklogSprintName(s.name));
  // The drop tile resolves the target by name; when the configured backlog is
  // not in the live list the tile hides itself, so surface that here too.
  const backlogTargetExists = backlogOptions.some((s) => s.name === backlogTargetName);

  const currentSprintId = defaultData?.sprintId ?? "";
  const slots = slotsRaw ?? [];

  const handleChange = async (sprintId: string) => {
    setSaving(true);
    await mutate(
      async () => {
        const result = await settings.saveDefaultSprint(sprintId);
        return result;
      },
      { optimisticData: { sprintId }, rollbackOnError: true },
    );
    setSaving(false);
  };

  return (
    <>
      <h2 className="mb-5 text-body-sm font-medium uppercase tracking-[0.06em] text-text-secondary">
        Story Writer Defaults
      </h2>

      <div className="rounded-xl border border-border-default bg-overlay-subtle p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-body-lg font-medium text-text-primary">Default sprint</p>
            <p className="mt-0.5 text-body-sm leading-relaxed text-text-tertiary">
              Pre-selected sprint when creating new stories via the command palette.
            </p>
          </div>

          <div className="relative shrink-0">
            <select
              value={currentSprintId}
              onChange={(e) => handleChange(e.target.value)}
              className="appearance-none rounded-md border border-border-strong bg-[var(--color-surface-floating)] py-1.5 pl-3 pr-8 text-body-lg text-text-primary transition-colors duration-150 cursor-pointer focus:border-[var(--color-brand-500)]/40 focus:outline-none hover:border-[var(--color-brand-500)]/30"
            >
              <option value="">Backlog (default)</option>
              {slots.map((s) => (
                <option key={s.sprintId} value={s.sprintId}>
                  {s.sprintName}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              strokeWidth={1.5}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
          </div>
        </div>

        {saving && (
          <div className="mt-3 flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-border-strong border-t-[var(--color-brand-400)] animate-spin" />
            <span className="text-body-sm text-text-muted">Saving...</span>
          </div>
        )}

        {!saving && defaultData && (
          <div className="mt-3 flex items-center gap-1.5 text-body-sm text-text-muted">
            <Check size={12} strokeWidth={2} className="text-emerald-400/70" />
            <span>
              {currentSprintId
                ? `Set to ${slots.find((s) => s.sprintId === currentSprintId)?.sprintName ?? "selected sprint"}`
                : "Using Backlog as default"}
            </span>
          </div>
        )}
      </div>

      <p className="mt-4 text-label leading-relaxed text-text-muted">
        This setting only affects new stories created from the command palette. The sprint list is sourced from your configured sprint slots.
      </p>

      <h2 className="mb-5 mt-10 text-body-sm font-medium uppercase tracking-[0.06em] text-text-secondary">
        Sprint Board
      </h2>

      <div className="rounded-xl border border-border-default bg-overlay-subtle p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-body-lg font-medium text-text-primary">Backlog drop target</p>
            <p className="mt-0.5 text-body-sm leading-relaxed text-text-tertiary">
              The team backlog the leading drop tile assigns tickets to when you drag them onto it.
            </p>
          </div>

          <div className="relative shrink-0">
            <select
              value={backlogTargetName}
              onChange={(e) => setBacklogTargetName(e.target.value)}
              className="appearance-none rounded-md border border-border-strong bg-[var(--color-surface-floating)] py-1.5 pl-3 pr-8 text-body-lg text-text-primary transition-colors duration-150 cursor-pointer focus:border-[var(--color-brand-500)]/40 focus:outline-none hover:border-[var(--color-brand-500)]/30"
            >
              {/* Keep the configured target selectable even when it is missing
                  from the live list, so the choice is not silently rewritten. */}
              {!backlogTargetExists && backlogTargetName && (
                <option value={backlogTargetName}>{backlogTargetName} (unavailable)</option>
              )}
              {backlogOptions.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              strokeWidth={1.5}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
          </div>
        </div>

        {backlogTargetExists ? (
          <div className="mt-3 flex items-center gap-1.5 text-body-sm text-text-muted">
            <Check size={12} strokeWidth={2} className="text-emerald-400/70" />
            <span>Set to {backlogTargetName}</span>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-1.5 text-body-sm text-amber-400/80">
            <AlertTriangle size={12} strokeWidth={2} />
            <span>{backlogTargetName} is not in the current sprint list; the drop tile is hidden until it returns.</span>
          </div>
        )}
      </div>

      <p className="mt-4 text-label leading-relaxed text-text-muted">
        The generic project backlog stays reachable through the Backlogs dropdown; this setting only governs the drag-overlay drop tile.
      </p>

      <h2 className="mb-5 mt-10 text-body-sm font-medium uppercase tracking-[0.06em] text-text-secondary">
        Teams
      </h2>

      <div className="rounded-xl border border-border-default bg-overlay-subtle p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-body-lg font-medium text-text-primary">Default team</p>
            <p className="mt-0.5 text-body-sm leading-relaxed text-text-tertiary">
              Your own team. Used to surface your team&apos;s work first, such as in the New stories inbox.
            </p>
          </div>

          <div className="relative shrink-0">
            <select
              value={defaultTeam ?? ""}
              onChange={(e) => setDefaultTeam(e.target.value === "" ? null : (e.target.value as (typeof TEAMS)[number]))}
              className="appearance-none rounded-md border border-border-strong bg-[var(--color-surface-floating)] py-1.5 pl-3 pr-8 text-body-lg text-text-primary transition-colors duration-150 cursor-pointer focus:border-[var(--color-brand-500)]/40 focus:outline-none hover:border-[var(--color-brand-500)]/30"
            >
              <option value="">None</option>
              {TEAMS.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              strokeWidth={1.5}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-body-sm text-text-muted">
          <Check size={12} strokeWidth={2} className="text-emerald-400/70" />
          <span>{defaultTeam ? `Set to ${defaultTeam}` : "No default team set"}</span>
        </div>
      </div>

      <p className="mt-4 text-label leading-relaxed text-text-muted">
        This is the source of truth for &ldquo;which team is mine&rdquo;. When set, views that group work by team put yours at the top; when unset, they fall back to plain ordering.
      </p>
    </>
  );
}
