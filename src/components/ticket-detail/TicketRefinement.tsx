"use client";

import { useState, useCallback } from "react";
import { Check } from "lucide-react";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { tickets } from "@/lib/api-client";

interface TeamEstimate {
  member: string;
  points: number | null;
}

const REFINEMENT_CHECKLIST = [
  { key: "description", label: "Description complete" },
  { key: "acceptance", label: "Acceptance criteria defined" },
  { key: "designs", label: "Designs attached (if applicable)" },
  { key: "dependencies", label: "Dependencies identified" },
  { key: "estimated", label: "Estimated" },
] as const;

export function TicketRefinement({ ticketKey }: { ticketKey: string }) {
  const [estimates, setEstimates] = useState<TeamEstimate[]>([
    { member: "Developer A", points: null },
    { member: "Developer B", points: null },
    { member: "Developer C", points: null },
  ]);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    description: false,
    acceptance: false,
    designs: false,
    dependencies: false,
    estimated: false,
  });

  const filledEstimates = estimates.filter((e) => e.points !== null);
  const avgEstimate =
    filledEstimates.length > 0
      ? Math.round(
          (filledEstimates.reduce((s, e) => s + (e.points ?? 0), 0) / filledEstimates.length) * 10,
        ) / 10
      : null;

  const allChecked = Object.values(checklist).every(Boolean);

  const handleChecklistChange = useCallback(
    (key: string, checked: boolean) => {
      setChecklist((prev) => {
        const next = { ...prev, [key]: checked };
        const allDone = Object.values(next).every(Boolean);
        if (allDone) {
          tickets.updateMetadata(ticketKey, { readiness: "ready_to_refine" })
            .catch((err) => console.error("Failed to update readiness:", err));
        }
        return next;
      });
    },
    [ticketKey],
  );

  const handleEstimateChange = useCallback((idx: number, value: string) => {
    setEstimates((prev) =>
      prev.map((e, i) => (i === idx ? { ...e, points: value ? Number(value) : null } : e)),
    );
  }, []);

  return (
    <div className="mt-6 space-y-8">
      <div>
        <SectionHeader title="Team Estimation" />
        <div className="mt-3 space-y-2">
          {estimates.map((est, idx) => (
            <div key={est.member} className="flex items-center gap-3 rounded-lg border border-border-default px-4 py-2.5">
              <span className="min-w-0 flex-1 text-body-lg text-text-secondary">{est.member}</span>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={est.points ?? ""}
                onChange={(e) => handleEstimateChange(idx, e.target.value)}
                placeholder="SP"
                className="w-16 rounded-md border border-border-default bg-overlay-subtle px-2 py-1 text-right text-body-lg tabular-nums text-text-secondary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none"
              />
            </div>
          ))}
        </div>
        {avgEstimate !== null && (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-border-default bg-overlay-subtle px-4 py-3">
            <span className="text-body-lg font-medium text-text-secondary">Average Estimate</span>
            <span className="text-heading font-semibold tabular-nums text-text-primary">
              {avgEstimate} <span className="text-body-sm font-normal text-text-tertiary">SP</span>
            </span>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between border-b border-border-default pb-2">
          <h3 className="font-[var(--font-display)] text-body-lg font-semibold text-text-primary">Ready to Refine</h3>
          {allChecked && (
            <span className="rounded-full bg-[rgba(46,145,73,0.12)] px-2.5 py-0.5 text-caption font-medium text-[var(--color-status-success)]">
              All complete
            </span>
          )}
        </div>
        <div className="mt-3 space-y-2">
          {REFINEMENT_CHECKLIST.map((item) => (
            <label
              key={item.key}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border-default px-4 py-2.5 hover:bg-overlay-subtle"
              style={{ transition: "background-color 0.15s ease" }}
            >
              <input
                type="checkbox"
                checked={checklist[item.key] ?? false}
                onChange={(e) => handleChecklistChange(item.key, e.target.checked)}
                className="sr-only"
              />
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  checklist[item.key]
                    ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10"
                    : "border-border-strong bg-overlay-subtle"
                }`}
                style={{ transition: "background-color 0.15s ease, border-color 0.15s ease" }}
              >
                {checklist[item.key] && (
                  <Check size={10} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
                )}
              </span>
              <span className={`text-body-lg ${checklist[item.key] ? "text-text-tertiary line-through" : "text-text-secondary"}`}>
                {item.label}
              </span>
            </label>
          ))}
        </div>
        {allChecked && (
          <p className="mt-3 text-body-sm text-[var(--color-status-success)]/70">
            Readiness automatically set to &quot;Ready to Refine&quot;
          </p>
        )}
      </div>
    </div>
  );
}
