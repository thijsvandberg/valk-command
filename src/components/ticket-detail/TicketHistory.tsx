"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Ticket, StoryVersion } from "@/types/ticket";
import { StoryDiff } from "@/components/story-diff/StoryDiff";
import { ChevronRight, Save, Info, CloudUpload } from "lucide-react";
import { SectionHeader } from "./SectionHeader";
import { VersionPicker, type VersionOption } from "@/components/shared/VersionPicker";

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

function storyVersionToOption(v: StoryVersion): VersionOption {
  const tag: VersionOption["tag"] =
    v.label === "draft" ? "draft" :
    v.label === "ai-draft" ? "ai-draft" :
    v.label === "current" ? "current" : "jira";

  const title =
    v.label === "draft" ? "Local draft" :
    v.label === "ai-draft" ? `AI Draft` :
    `Version ${v.versionNumber}`;

  return {
    id: String(v.versionNumber),
    label: `v${v.versionNumber}`,
    versionNum: v.versionNumber,
    title,
    author: v.updatedBy,
    avatarUrl: v.updatedByAvatar,
    isoDate: v.date,
    tag,
  };
}

export interface TicketHistoryProps {
  ticket: Ticket;
  /** When set, auto-open the conflict diff (local draft vs latest Jira) */
  showConflictDiff?: boolean;
  /** When true, the remote change was metadata-only (no content diff). Shows push button in diff view. */
  metadataOnlyConflict?: boolean;
  /** Called when user resolves the conflict. Action is "keep" or "discard". */
  onConflictResolved?: (action: "keep" | "discard") => void;
  /** When changed, resets the diff view back to the version list */
  resetKey?: number;
  /** Called once versions finish loading, with the total count */
  onVersionsLoaded?: (count: number) => void;
}

export function TicketHistory({ ticket, showConflictDiff, metadataOnlyConflict, onConflictResolved, resetKey, onVersionsLoaded }: TicketHistoryProps) {
  const [ticketVersions, setTicketVersions] = useState<StoryVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const onVersionsLoadedRef = useRef(onVersionsLoaded);
  onVersionsLoadedRef.current = onVersionsLoaded;

  const [compareOld, setCompareOld] = useState<number | null>(null);
  const [compareNew, setCompareNew] = useState<number | null>(null);
  const [showingDiff, setShowingDiff] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [savingMerge, setSavingMerge] = useState(false);
  const [diffStats, setDiffStats] = useState<{ added: number; removed: number; modified: number; changeHunkCount: number; decidedCount: number } | null>(null);

  useEffect(() => {
    if (resetKey !== undefined) {
      setShowingDiff(false);
      setMergeResult(null);
      setDiffStats(null);
    }
  }, [resetKey]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(`/api/tickets/${ticket.key}/versions?metaOnly=true`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/tickets/${ticket.key}/local-edits`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/tickets/${ticket.key}/story-writer?draftsOnly=true`).then((r) => r.ok ? r.json() : { aiDrafts: [] }),
    ])
      .then(([versionData, editData, writerData]) => {
        if (cancelled) return;
        const versions: StoryVersion[] = [];

        if (Array.isArray(versionData)) {
          const count = versionData.length;
          versionData.forEach((v: Record<string, unknown>, idx: number) => {
            versions.push({
              id: (v.id as string) || undefined,
              versionNumber: 0,
              date: (v.createdAt as string) || new Date().toISOString(),
              contentHash: (v.contentHash as string) || "",
              // content is empty until the user opens the diff (lazy-loaded per version)
              content: "",
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

        // Add AI drafts from story writer session
        const aiDrafts = writerData?.aiDrafts;
        if (Array.isArray(aiDrafts)) {
          for (const draft of aiDrafts) {
            versions.push({
              versionNumber: 0,
              date: draft.createdAt || new Date().toISOString(),
              contentHash: `ai-draft-${draft.id}`,
              content: draft.content || "",
              updatedBy: `AI Draft ${(draft.draftIndex ?? 0) + 1}`,
              updatedByAvatar: null,
              label: "ai-draft",
            });
          }
        }

        // Sort by date ascending, then assign sequential version numbers
        versions.sort((a, b) => parseVersionDate(a.date) - parseVersionDate(b.date));
        versions.forEach((v, idx) => { v.versionNumber = idx + 1; });

        setTicketVersions(versions);
        onVersionsLoadedRef.current?.(versions.length);
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

  // Lazy-load full content for Jira versions when the diff view is opened
  useEffect(() => {
    if (!showingDiff || compareOld === null || compareNew === null) return;

    const needed = ticketVersions.filter(
      (v) => v.id && !v.content && (v.versionNumber === compareOld || v.versionNumber === compareNew),
    );
    if (needed.length === 0) return;

    let cancelled = false;
    setLoadingContent(true);

    Promise.all(
      needed.map((v) =>
        fetch(`/api/tickets/${ticket.key}/versions/${v.id}`).then((r) => r.ok ? r.json() : null),
      ),
    ).then((results) => {
      if (cancelled) return;
      const byId = new Map(results.filter(Boolean).map((r: Record<string, unknown>) => [r.id, r]));
      setTicketVersions((prev) =>
        prev.map((v) => {
          const loaded = v.id ? byId.get(v.id) : undefined;
          return loaded ? { ...v, content: (loaded.description as string) || "" } : v;
        }),
      );
    }).finally(() => {
      if (!cancelled) setLoadingContent(false);
    });

    return () => { cancelled = true; };
  }, [showingDiff, compareOld, compareNew, ticket.key]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const oldOptions = useMemo(
    () => sorted.filter((v) => v.versionNumber !== compareNew).map(storyVersionToOption),
    [sorted, compareNew],
  );
  const newOptions = useMemo(
    () => sorted.filter((v) => v.versionNumber !== compareOld).map(storyVersionToOption),
    [sorted, compareOld],
  );

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
    <div className="flex items-center gap-2">
      <VersionPicker
        options={oldOptions}
        selectedId={compareOld !== null ? String(compareOld) : ""}
        onSelect={(id) => handleOldChange(Number(id))}
      />
      <span className="shrink-0 text-xs text-white/25">vs</span>
      <VersionPicker
        options={newOptions}
        selectedId={compareNew !== null ? String(compareNew) : ""}
        onSelect={(id) => handleNewChange(Number(id))}
      />
    </div>
  );

  return (
    <div className="mt-8">
      {showingDiff && compareOldVersion && compareNewVersion && compareOld !== compareNew ? (
        <>
          {/* Compare bar */}
          <div className="mb-3 flex items-center justify-between">
            {compareBar}
            {diffStats && (
              <div className="flex items-center gap-3 text-xs">
                {diffStats.changeHunkCount > 0 && (
                  <span className="text-white/30">
                    {diffStats.decidedCount}/{diffStats.changeHunkCount} reviewed
                  </span>
                )}
                {diffStats.added > 0 && (
                  <span className="flex items-center gap-1" style={{ color: "#3fb950" }}>
                    <span className="font-mono font-semibold">+{diffStats.added}</span>
                    <span className="text-white/40">added</span>
                  </span>
                )}
                {diffStats.removed > 0 && (
                  <span className="flex items-center gap-1" style={{ color: "#e5534b" }}>
                    <span className="font-mono font-semibold">&minus;{diffStats.removed}</span>
                    <span className="text-white/40">removed</span>
                  </span>
                )}
                {diffStats.modified > 0 && (
                  <span className="flex items-center gap-1" style={{ color: "#d2a8ff" }}>
                    <span className="font-mono font-semibold">~{diffStats.modified}</span>
                    <span className="text-white/40">modified</span>
                  </span>
                )}
              </div>
            )}
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
                <CloudUpload size={13} strokeWidth={1.5} />
                {resolving ? "Pushing..." : "Push to Jira"}
              </button>
            </div>
          )}

          {loadingContent ? (
            <div className="mt-3 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-white/[0.04]" style={{ width: `${70 + i * 8}%` }} />
              ))}
            </div>
          ) : (
            <StoryDiff
              oldText={compareOldVersion.content}
              newText={compareNewVersion.content}
              mode="unified"
              interactive
              onResultChange={setMergeResult}
              onStatsComputed={setDiffStats}
            />
          )}

          {/* Sticky combined action footer */}
          {(() => {
            const draftInvolved =
              compareOldVersion?.label === "draft" || compareNewVersion?.label === "draft";
            const currentJiraInvolved =
              compareOldVersion?.label === "current" || compareNewVersion?.label === "current";
            const showConflictActions = draftInvolved && currentJiraInvolved;
            const showRevertActions = !draftInvolved && !!compareOldVersion && !!compareNewVersion;

            if (!mergeResult && !showConflictActions && !showRevertActions) return null;

            return (
              <div
                className="sticky bottom-0 mt-4 flex items-center gap-4 border-t border-white/[0.06] bg-[var(--color-surface-base)]/95 px-0 py-4 backdrop-blur-sm"
                style={{ boxShadow: "0 -8px 24px rgba(0,0,0,0.20)" }}
              >
                {showConflictActions && (
                  <>
                    <button
                      type="button"
                      disabled={resolving}
                      onClick={handleDiscardLocal}
                      className="rounded-md border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-white/60 cursor-pointer hover:bg-white/[0.06] hover:text-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
                    >
                      {resolving ? "Accepting..." : "Accept Jira version"}
                    </button>
                    <button
                      type="button"
                      disabled={resolving}
                      onClick={metadataOnlyConflict ? handleForcePush : handleKeepAndPush}
                      className="rounded-md border border-red-500/20 bg-red-500/[0.08] px-4 py-2 text-xs font-medium text-red-400 cursor-pointer hover:bg-red-500/[0.15] hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
                    >
                      {resolving ? "Pushing..." : "Overwrite Jira with your draft"}
                    </button>
                  </>
                )}
                {showRevertActions && (
                  <span className="text-xs text-white/40">Revert:</span>
                )}

                {mergeResult !== null && !showConflictActions && (
                  <span className="text-xs text-white/50">Apply merge selections as local edit</span>
                )}

                <div className="flex-1" />

                {mergeResult !== null && (
                  <button
                    type="button"
                    disabled={savingMerge}
                    onClick={handleSaveMerge}
                    className="flex items-center gap-1.5 rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-xs font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
                  >
                    <Save size={13} strokeWidth={1.5} />
                    {savingMerge ? "Applying..." : "Apply merge"}
                  </button>
                )}
                {showRevertActions && compareOldVersion && (
                  <button
                    type="button"
                    disabled={resolving}
                    onClick={() => handleRevertTo(compareOldVersion)}
                    className="rounded-md border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-white/60 cursor-pointer hover:bg-white/[0.06] hover:text-white/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ transition: "background-color 0.15s ease, color 0.15s ease, transform 0.1s ease" }}
                  >
                    {resolving ? "Reverting..." : `Revert to v${compareOldVersion.versionNumber}`}
                  </button>
                )}
              </div>
            );
          })()}
        </>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center border-b border-white/[0.06] pb-2">
            <div className="flex items-center gap-2">
              <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">History</h3>
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/[0.06] px-1.5 text-[10px] font-medium tabular-nums text-white/40">
                {sorted.length}
              </span>
            </div>
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
                          : version.label === "ai-draft"
                          ? version.updatedBy ?? "AI Draft"
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
                      {version.label === "ai-draft" && (
                        <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                          AI
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
