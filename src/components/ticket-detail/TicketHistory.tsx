"use client";

import { useState, useEffect, useCallback } from "react";
import type { Ticket, StoryVersion } from "@/types/ticket";
import { StoryDiff } from "@/components/story-diff/StoryDiff";
import type { DiffMode } from "@/components/story-diff/StoryDiff";
import { exportDiffAsMarkdown } from "@/components/story-diff/export-diff";
import { ChevronRight, ChevronLeft, Download } from "lucide-react";
import { SectionHeader } from "./SectionHeader";

function formatVersionDate(iso: string): string {
  const raw = iso.endsWith("Z") ? iso : `${iso}Z`;
  const d = new Date(raw);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatVersionDateShort(iso: string): string {
  const raw = iso.endsWith("Z") ? iso : `${iso}Z`;
  const d = new Date(raw);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface TicketHistoryProps {
  ticket: Ticket;
  /** When set, auto-open the conflict diff (local draft vs latest Jira) */
  showConflictDiff?: boolean;
  /** Called when user resolves the conflict */
  onConflictResolved?: () => void;
}

export function TicketHistory({ ticket, showConflictDiff, onConflictResolved }: TicketHistoryProps) {
  const [ticketVersions, setTicketVersions] = useState<StoryVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [diffMode, setDiffMode] = useState<DiffMode>("unified");

  // Single source of truth for comparison
  const [compareOld, setCompareOld] = useState<number | null>(null);
  const [compareNew, setCompareNew] = useState<number | null>(null);
  const [showingDiff, setShowingDiff] = useState(false);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(`/api/tickets/${ticket.key}/versions`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/tickets/${ticket.key}/local-edits`).then((r) => r.ok ? r.json() : []),
    ])
      .then(([versionData, editData]) => {
        if (cancelled) return;
        const versions: StoryVersion[] = [];

        if (Array.isArray(versionData)) {
          const count = versionData.length;
          versionData.forEach((v: Record<string, unknown>, idx: number) => {
            versions.push({
              versionNumber: idx + 1,
              date: (v.createdAt as string) || new Date().toISOString(),
              contentHash: (v.contentHash as string) || "",
              content: (v.description as string) || "",
              updatedBy: (v.updatedBy as string) ?? null,
              updatedByAvatar: (v.updatedByAvatar as string) ?? null,
              label: idx === count - 1 ? "current" : undefined,
            });
          });
        }

        if (Array.isArray(editData) && editData.length > 0) {
          const descEdit = editData.find((e: { field: string }) => e.field === "description");
          if (descEdit) {
            versions.push({
              versionNumber: versions.length + 1,
              date: descEdit.modifiedAt || new Date().toISOString(),
              contentHash: "local-draft",
              content: descEdit.localValue || "",
              updatedBy: "You",
              updatedByAvatar: null,
              label: "draft",
            });
          }
        }

        setTicketVersions(versions);
      })
      .catch((err) => {
        console.error("Failed to load versions:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [ticket.key]);

  const sorted = [...ticketVersions].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  );

  // Initialize defaults once versions load
  useEffect(() => {
    if (ticketVersions.length < 2) return;
    if (compareOld !== null || compareNew !== null) return;
    const s = [...ticketVersions].sort((a, b) => b.versionNumber - a.versionNumber);
    setCompareOld(s[1].versionNumber);
    setCompareNew(s[0].versionNumber);
  }, [ticketVersions, compareOld, compareNew]);

  // Auto-open conflict diff: compare local draft vs latest Jira version
  useEffect(() => {
    if (!showConflictDiff || sorted.length < 2) return;
    const draft = sorted.find((v) => v.label === "draft");
    const jiraCurrent = sorted.find((v) => v.label === "current");
    if (draft && jiraCurrent) {
      setCompareOld(jiraCurrent.versionNumber);
      setCompareNew(draft.versionNumber);
      setShowingDiff(true);
    }
  }, [showConflictDiff, sorted.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExportDiff = useCallback(
    (oldText: string, newText: string, oldLabel: string, newLabel: string) => {
      exportDiffAsMarkdown({ ticketKey: ticket.key, oldText, newText, oldLabel, newLabel });
    },
    [ticket.key],
  );

  const compareOldVersion = sorted.find((v) => v.versionNumber === compareOld) ?? null;
  const compareNewVersion = sorted.find((v) => v.versionNumber === compareNew) ?? null;
  const hasDraft = sorted.some((v) => v.label === "draft");
  const jiraCurrent = sorted.find((v) => v.label === "current");
  const isConflictView =
    showConflictDiff &&
    compareOldVersion?.label === "current" &&
    compareNewVersion?.label === "draft";

  // Dropdown change: immediately show diff
  const handleOldChange = (val: number) => {
    setCompareOld(val);
    setShowingDiff(true);
  };
  const handleNewChange = (val: number) => {
    setCompareNew(val);
    setShowingDiff(true);
  };

  // Version list click: set comparison and show diff
  const handleVersionClick = (versionNumber: number) => {
    const idx = sorted.findIndex((v) => v.versionNumber === versionNumber);
    const prev = sorted[idx + 1];
    setCompareNew(versionNumber);
    setCompareOld(prev?.versionNumber ?? versionNumber);
    setShowingDiff(true);
  };

  const handleKeepLocal = useCallback(async () => {
    setResolving(true);
    try {
      await fetch(`/api/tickets/${ticket.key}/local-edits`, { method: "PATCH" });
      onConflictResolved?.();
    } catch (err) {
      console.error("Failed to rebase local edits:", err);
    } finally {
      setResolving(false);
    }
  }, [ticket.key, onConflictResolved]);

  const handleDiscardLocal = useCallback(async () => {
    setResolving(true);
    try {
      await fetch(`/api/tickets/${ticket.key}/local-edits`, { method: "DELETE" });
      onConflictResolved?.();
    } catch (err) {
      console.error("Failed to discard local edits:", err);
    } finally {
      setResolving(false);
    }
  }, [ticket.key, onConflictResolved]);

  const selectStyle = "rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/70 cursor-pointer focus:border-[var(--color-brand-500)]/40 focus:outline-none";

  if (loading) {
    return (
      <div className="mt-8">
        <SectionHeader title="History" />
        <div className="mt-3 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-white/[0.06] px-4 py-3">
              <div className="h-7 w-7 animate-pulse rounded-full bg-white/[0.06]" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-white/[0.06]" />
                <div className="h-2.5 w-20 animate-pulse rounded bg-white/[0.04]" />
              </div>
              <div className="h-3 w-8 animate-pulse rounded bg-white/[0.06]" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="mt-8">
        <SectionHeader title="History" count={0} />
        <p className="mt-3 text-sm text-white/30">No version history yet</p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {/* Header: title + mode toggle */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">History</h3>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/[0.06] px-1.5 text-[10px] font-medium tabular-nums text-white/40">
            {sorted.length}
          </span>
        </div>
        <div className="flex items-center overflow-hidden rounded-md border border-white/[0.08]">
          <button
            type="button"
            onClick={() => setDiffMode("unified")}
            title="Unified diff view"
            className={`px-2 py-1 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)] ${
              diffMode === "unified"
                ? "bg-white/[0.08] text-white/70"
                : "text-white/30 hover:bg-white/[0.03] hover:text-white/50"
            }`}
            style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
          >
            Unified
          </button>
          <button
            type="button"
            onClick={() => setDiffMode("side-by-side")}
            title="Side-by-side diff view"
            className={`border-l border-white/[0.08] px-2 py-1 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)] ${
              diffMode === "side-by-side"
                ? "bg-white/[0.08] text-white/70"
                : "text-white/30 hover:bg-white/[0.03] hover:text-white/50"
            }`}
            style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
          >
            Split
          </button>
        </div>
      </div>

      {/* Compare dropdowns: always visible when >1 version */}
      {sorted.length > 1 && (
        <div className="mt-3 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <span className="text-xs text-white/40">Compare</span>
          <select
            value={compareOld ?? ""}
            onChange={(e) => handleOldChange(Number(e.target.value))}
            className={selectStyle}
          >
            {sorted.map((v) => (
              <option key={v.versionNumber} value={v.versionNumber}>
                v{v.versionNumber} - {formatVersionDateShort(v.date)}
              </option>
            ))}
          </select>
          <span className="text-xs text-white/20">with</span>
          <select
            value={compareNew ?? ""}
            onChange={(e) => handleNewChange(Number(e.target.value))}
            className={selectStyle}
          >
            {sorted.map((v) => (
              <option key={v.versionNumber} value={v.versionNumber}>
                v{v.versionNumber} - {formatVersionDateShort(v.date)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Diff view */}
      {showingDiff && compareOldVersion && compareNewVersion && compareOld !== compareNew ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowingDiff(false)}
            className="mb-3 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-white/50 cursor-pointer hover:bg-white/[0.04] hover:text-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95"
            style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
          >
            <ChevronLeft size={14} strokeWidth={1.5} className="text-white/40" />
            Back to version list
          </button>

          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs text-white/40">
              <span className="font-medium text-white/60">
                {isConflictView
                  ? "Latest from Jira \u2192 Your local edits"
                  : `Version ${compareOldVersion.versionNumber} \u2192 Version ${compareNewVersion.versionNumber}`}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                handleExportDiff(
                  compareOldVersion.content,
                  compareNewVersion.content,
                  `v${compareOldVersion.versionNumber}`,
                  `v${compareNewVersion.versionNumber}`,
                )
              }
              className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] font-medium text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
              style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
              title="Export diff as markdown"
            >
              <Download size={12} strokeWidth={1.2} />
              Export diff
            </button>
          </div>

          <StoryDiff
            oldText={compareOldVersion.content}
            newText={compareNewVersion.content}
            oldLabel={isConflictView ? "Latest from Jira" : `v${compareOldVersion.versionNumber}`}
            newLabel={isConflictView ? "Your local edits" : `v${compareNewVersion.versionNumber}`}
            mode={diffMode}
          />

          {/* Conflict resolution buttons */}
          {isConflictView && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <span className="text-xs text-white/40">Resolve conflict:</span>
              <button
                type="button"
                disabled={resolving}
                onClick={handleKeepLocal}
                className="rounded-md bg-[var(--color-brand-600)] px-3 py-1.5 text-xs font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
              >
                {resolving ? "Resolving..." : "Keep local edits"}
              </button>
              <button
                type="button"
                disabled={resolving}
                onClick={handleDiscardLocal}
                className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/60 cursor-pointer hover:bg-white/[0.06] hover:text-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
              >
                Discard local edits
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Version list */
        <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06]">
          {sorted.map((version, idx) => {
            const isFirst = idx === sorted.length - 1;
            return (
              <div
                key={version.versionNumber}
                onClick={() => handleVersionClick(version.versionNumber)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left cursor-pointer hover:bg-white/[0.03] active:bg-white/[0.04] ${
                  idx < sorted.length - 1 ? "border-b border-white/[0.04]" : ""
                }`}
                style={{ transition: "background-color 0.15s ease" }}
              >
                {version.updatedByAvatar ? (
                  <img
                    src={version.updatedByAvatar}
                    alt={version.updatedBy ?? ""}
                    className="h-7 w-7 shrink-0 rounded-full"
                  />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-[10px] font-semibold tabular-nums text-white/40">
                    v{version.versionNumber}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white/60">
                      {version.label === "draft"
                        ? "Local draft"
                        : isFirst
                        ? "Initial version"
                        : `Version ${version.versionNumber}`}
                    </span>
                    {version.label === "current" && (
                      <span className="rounded bg-[var(--color-brand-500)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-brand-400)]">
                        Jira
                      </span>
                    )}
                    {version.label === "draft" && (
                      <span className="rounded bg-[#4a90d9]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#4a90d9]">
                        Draft
                      </span>
                    )}
                    {version.updatedBy && (
                      <span className="text-xs text-white/30">{version.updatedBy}</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-white/25">
                    {formatVersionDate(version.date)}
                  </div>
                </div>
                <ChevronRight size={10} strokeWidth={1} className="shrink-0 text-white/15" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
