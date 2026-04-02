"use client";

import { useState, useEffect, useCallback } from "react";
import type { Ticket, StoryVersion } from "@/types/ticket";
import { StoryDiff } from "@/components/story-diff/StoryDiff";
import type { DiffMode } from "@/components/story-diff/StoryDiff";
import { ChevronRight, ChevronLeft, GitMerge, Save, Info, Upload } from "lucide-react";
import { SectionHeader } from "./SectionHeader";

function parseVersionDate(iso: string): number {
  const raw = iso.endsWith("Z") ? iso : `${iso}Z`;
  return new Date(raw).getTime();
}

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

function versionSourceTag(v: StoryVersion): string {
  if (v.label === "draft") return "Draft";
  if (v.label === "current") return "Jira";
  return "Jira";
}

function versionLabel(v: StoryVersion): string {
  return `v${v.versionNumber} (${versionSourceTag(v)})`;
}

export interface TicketHistoryProps {
  ticket: Ticket;
  /** When set, auto-open the conflict diff (local draft vs latest Jira) */
  showConflictDiff?: boolean;
  /** When true, the remote change was metadata-only (no content diff). Shows push button in diff view. */
  metadataOnlyConflict?: boolean;
  /** Called when user resolves the conflict. Action is "keep" or "discard". */
  onConflictResolved?: (action: "keep" | "discard") => void;
}

export function TicketHistory({ ticket, showConflictDiff, metadataOnlyConflict, onConflictResolved }: TicketHistoryProps) {
  const [ticketVersions, setTicketVersions] = useState<StoryVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [diffMode, setDiffMode] = useState<DiffMode>("unified");

  const [compareOld, setCompareOld] = useState<number | null>(null);
  const [compareNew, setCompareNew] = useState<number | null>(null);
  const [showingDiff, setShowingDiff] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [savingMerge, setSavingMerge] = useState(false);

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
              versionNumber: 0,
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
              versionNumber: 0,
              date: descEdit.modifiedAt || new Date().toISOString(),
              contentHash: "local-draft",
              content: descEdit.localValue || "",
              updatedBy: "You",
              updatedByAvatar: null,
              label: "draft",
            });
          }
        }

        // Sort by date ascending, then assign sequential version numbers
        versions.sort((a, b) => parseVersionDate(a.date) - parseVersionDate(b.date));
        versions.forEach((v, idx) => { v.versionNumber = idx + 1; });

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

  const draft = sorted.find((v) => v.label === "draft");
  const jiraCurrent = sorted.find((v) => v.label === "current");
  const isDraftOutdated = !!(draft && jiraCurrent &&
    parseVersionDate(draft.date) < parseVersionDate(jiraCurrent.date));

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
    const d = sorted.find((v) => v.label === "draft");
    const jc = sorted.find((v) => v.label === "current");
    if (d && jc) {
      setCompareOld(jc.versionNumber);
      setCompareNew(d.versionNumber);
      setShowingDiff(true);
    }
  }, [showConflictDiff, sorted.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const compareOldVersion = sorted.find((v) => v.versionNumber === compareOld) ?? null;
  const compareNewVersion = sorted.find((v) => v.versionNumber === compareNew) ?? null;

  const isConflictView =
    showConflictDiff &&
    compareOldVersion?.label === "current" &&
    compareNewVersion?.label === "draft";

  const handleOldChange = (val: number) => {
    setCompareOld(val);
    setShowingDiff(true);
  };
  const handleNewChange = (val: number) => {
    setCompareNew(val);
    setShowingDiff(true);
  };

  const handleVersionClick = (versionNumber: number) => {
    const idx = sorted.findIndex((v) => v.versionNumber === versionNumber);
    const prev = sorted[idx + 1];
    setCompareNew(versionNumber);
    setCompareOld(prev?.versionNumber ?? versionNumber);
    setShowingDiff(true);
  };

  const handleKeepAndPush = useCallback(async () => {
    setResolving(true);
    try {
      await fetch(`/api/tickets/${ticket.key}/local-edits`, { method: "PATCH" });
      const res = await fetch(`/api/tickets/${ticket.key}/push-to-jira`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        onConflictResolved?.("keep");
      } else {
        console.error("Push failed after rebase:", data.error ?? data.message);
      }
    } catch (err) {
      console.error("Failed to keep and push local edits:", err);
    } finally {
      setResolving(false);
    }
  }, [ticket.key, onConflictResolved]);

  const handleForcePush = useCallback(async () => {
    setResolving(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.key}/push-to-jira`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();
      if (data.success) {
        onConflictResolved?.("keep");
      } else {
        console.error("Force push failed:", data.error ?? data.message);
      }
    } catch (err) {
      console.error("Failed to force push to Jira:", err);
    } finally {
      setResolving(false);
    }
  }, [ticket.key, onConflictResolved]);

  const handleDiscardLocal = useCallback(async () => {
    setResolving(true);
    try {
      await fetch(`/api/tickets/${ticket.key}/local-edits`, { method: "DELETE" });
      onConflictResolved?.("discard");
    } catch (err) {
      console.error("Failed to discard local edits:", err);
    } finally {
      setResolving(false);
    }
  }, [ticket.key, onConflictResolved]);

  const handleSaveMerge = useCallback(async () => {
    if (!mergeResult) return;
    setSavingMerge(true);
    try {
      await fetch(`/api/tickets/${ticket.key}/local-edits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "description", localValue: mergeResult }),
      });
      setInteractiveMode(false);
      onConflictResolved?.("keep");
    } catch (err) {
      console.error("Failed to save merge result:", err);
    } finally {
      setSavingMerge(false);
    }
  }, [ticket.key, mergeResult, onConflictResolved]);

  const handleRevertTo = useCallback(async (version: StoryVersion) => {
    setResolving(true);
    try {
      await fetch(`/api/tickets/${ticket.key}/local-edits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "description", localValue: version.content }),
      });
      onConflictResolved?.("keep");
    } catch (err) {
      console.error("Failed to create revert edit:", err);
    } finally {
      setResolving(false);
    }
  }, [ticket.key, onConflictResolved]);

  const selectStyle = "rounded-md border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/70 cursor-pointer focus:border-[var(--color-brand-500)]/40 focus:outline-none";

  // Diff labels: include timestamps in conflict view for clarity
  const diffOldLabel = compareOldVersion
    ? (isConflictView
      ? `Jira latest (${formatVersionDateShort(compareOldVersion.date)})`
      : versionLabel(compareOldVersion))
    : "";
  const diffNewLabel = compareNewVersion
    ? (isConflictView
      ? `Your draft (${formatVersionDateShort(compareNewVersion.date)})`
      : versionLabel(compareNewVersion))
    : "";

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

  const compareBar = (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <span className="text-xs text-white/40">Compare</span>
      <select
        value={compareOld ?? ""}
        onChange={(e) => handleOldChange(Number(e.target.value))}
        className={selectStyle}
      >
        {sorted
          .filter((v) => v.versionNumber !== compareNew)
          .map((v) => (
            <option key={v.versionNumber} value={v.versionNumber}>
              v{v.versionNumber} ({versionSourceTag(v)}) - {formatVersionDateShort(v.date)}
            </option>
          ))}
      </select>
      <span className="text-xs text-white/20">vs</span>
      <select
        value={compareNew ?? ""}
        onChange={(e) => handleNewChange(Number(e.target.value))}
        className={selectStyle}
      >
        {sorted
          .filter((v) => v.versionNumber !== compareOld)
          .map((v) => (
            <option key={v.versionNumber} value={v.versionNumber}>
              v{v.versionNumber} ({versionSourceTag(v)}) - {formatVersionDateShort(v.date)}
            </option>
          ))}
      </select>
    </div>
  );

  const modeToggle = (
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
  );

  return (
    <div className="mt-8">
      {showingDiff && compareOldVersion && compareNewVersion && compareOld !== compareNew ? (
        <>
          {/* Combined bar: back link + compare dropdowns + mode toggle */}
          <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.06] pb-3">
            <button
              type="button"
              onClick={() => setShowingDiff(false)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/50 cursor-pointer hover:bg-white/[0.04] hover:text-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95"
              style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
            >
              <ChevronLeft size={14} strokeWidth={1.5} className="text-white/40" />
              Versions
            </button>
            <div className="h-4 w-px bg-white/[0.08]" />
            {compareBar}
            {modeToggle}
          </div>

          {/* Toolbar: review & merge */}
          <div className="mt-3 mb-3 flex items-center justify-end">
            <button
              type="button"
              onClick={() => {
                setInteractiveMode((p) => !p);
                setMergeResult(null);
              }}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] ${
                interactiveMode
                  ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-600)]/20 text-[var(--color-brand-400)]"
                  : "border-white/[0.06] bg-white/[0.02] text-white/40 hover:bg-white/[0.04] hover:text-white/60"
              }`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
              title={interactiveMode ? "Exit review mode" : "Review changes per section"}
            >
              <GitMerge size={12} strokeWidth={1.5} />
              {interactiveMode ? "Exit review" : "Review & merge"}
            </button>
          </div>

          {/* Metadata-only change notification with force push */}
          {isConflictView && metadataOnlyConflict && (
            <div className="mb-3 flex items-center gap-3 rounded-lg border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-600)]/[0.06] px-4 py-3">
              <Info size={16} strokeWidth={1.5} className="shrink-0 text-[var(--color-brand-400)]" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-white/60">No content changes detected</p>
                <p className="mt-0.5 text-[11px] text-white/35">
                  Jira was updated (e.g. status transition, comment, or field change) but the description content is unchanged.
                </p>
              </div>
              <button
                type="button"
                disabled={resolving}
                onClick={handleForcePush}
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--color-brand-600)] px-3 py-1.5 text-xs font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
              >
                <Upload size={13} strokeWidth={1.5} />
                {resolving ? "Pushing..." : "Push to Jira"}
              </button>
            </div>
          )}

          <StoryDiff
            oldText={compareOldVersion.content}
            newText={compareNewVersion.content}
            oldLabel={diffOldLabel}
            newLabel={diffNewLabel}
            mode={diffMode}
            interactive={interactiveMode}
            onResultChange={setMergeResult}
          />

          {/* Save bar when in interactive mode */}
          {interactiveMode && mergeResult !== null && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-600)]/[0.06] px-4 py-3">
              <span className="text-xs text-white/50">Save the merged result as a local edit</span>
              <button
                type="button"
                disabled={savingMerge}
                onClick={handleSaveMerge}
                className="ml-auto flex items-center gap-1.5 rounded-md bg-[var(--color-brand-600)] px-3 py-1.5 text-xs font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
              >
                <Save size={13} strokeWidth={1.5} />
                {savingMerge ? "Saving..." : "Save as local edit"}
              </button>
            </div>
          )}

          {/* Action bar: context-dependent on what's being compared */}
          {(() => {
            const draftInvolved =
              compareOldVersion?.label === "draft" || compareNewVersion?.label === "draft";
            const currentJiraInvolved =
              compareOldVersion?.label === "current" || compareNewVersion?.label === "current";

            // Draft vs current Jira: accept remote or overwrite with local
            if (draftInvolved && currentJiraInvolved) {
              return (
                <div className="mt-4 flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={handleDiscardLocal}
                    className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/60 cursor-pointer hover:bg-white/[0.06] hover:text-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
                  >
                    {resolving ? "Accepting..." : "Accept Jira version"}
                  </button>
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={metadataOnlyConflict ? handleForcePush : handleKeepAndPush}
                    className="rounded-md border border-red-500/20 bg-red-500/[0.08] px-3 py-1.5 text-xs font-medium text-red-400 cursor-pointer hover:bg-red-500/[0.15] hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
                  >
                    {resolving ? "Pushing..." : "Overwrite Jira with your draft"}
                  </button>
                </div>
              );
            }

            // Two Jira versions (no draft involved): offer revert to the older one
            if (!draftInvolved && compareOldVersion && compareNewVersion) {
              return (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <span className="text-xs text-white/40">Revert:</span>
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={() => handleRevertTo(compareOldVersion)}
                    className="rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/60 cursor-pointer hover:bg-white/[0.06] hover:text-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
                  >
                    {resolving ? "Reverting..." : `Revert to ${versionLabel(compareOldVersion)}`}
                  </button>
                </div>
              );
            }

            // Draft vs older Jira version: just browsing, no actions
            return null;
          })()}
        </>
      ) : (
        <>
          {/* Header: title + mode toggle */}
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
            <div className="flex items-center gap-2">
              <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">History</h3>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/[0.06] px-1.5 text-[10px] font-medium tabular-nums text-white/40">
                {sorted.length}
              </span>
            </div>
            {modeToggle}
          </div>

          {/* Compare dropdowns */}
          {sorted.length > 1 && (
            <div className="mt-3 mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
              {compareBar}
            </div>
          )}

          {/* Version list */}
          <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06]">
            {sorted.map((version, idx) => {
              const isFirst = idx === sorted.length - 1;
              const isOutdated = version.label === "draft" && isDraftOutdated;
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
                      {isOutdated && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                          Outdated
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
        </>
      )}
    </div>
  );
}
