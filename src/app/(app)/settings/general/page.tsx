"use client";

import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import useSWR from "swr";
import { swrFetcher, settings, sprintSlots as sprintSlotsApi } from "@/lib/api-client";
import type { SprintSlot } from "@/components/command-palette/types";

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
      <h2 className="mb-5 text-xs font-medium uppercase tracking-[0.06em] text-text-secondary">
        Story Writer Defaults
      </h2>

      <div className="rounded-xl border border-border-default bg-overlay-subtle p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">Default sprint</p>
            <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">
              Pre-selected sprint when creating new stories via the command palette.
            </p>
          </div>

          <div className="relative shrink-0">
            <select
              value={currentSprintId}
              onChange={(e) => handleChange(e.target.value)}
              className="appearance-none rounded-md border border-border-strong bg-[var(--color-surface-floating)] py-1.5 pl-3 pr-8 text-sm text-text-primary transition-colors duration-150 cursor-pointer focus:border-[var(--color-brand-500)]/40 focus:outline-none hover:border-[var(--color-brand-500)]/30"
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
            <span className="text-xs text-text-muted">Saving...</span>
          </div>
        )}

        {!saving && defaultData && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-text-muted">
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
    </>
  );
}
