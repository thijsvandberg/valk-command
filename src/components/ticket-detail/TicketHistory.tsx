"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Ticket, StoryVersion } from "@/types/ticket";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { apiFetch, tickets } from "@/lib/api-client";
import { parseVersionDate, parseRawVersionData, storyVersionToOption } from "./version-utils";
import { VersionList } from "./VersionList";
import type { DiffStats } from "./DiffViewer";
import dynamic from "next/dynamic";
const DiffViewer = dynamic(() => import("./DiffViewer").then((m) => ({ default: m.DiffViewer })), { ssr: false });
import { VersionPreview } from "./VersionPreview";

export interface TicketHistoryProps {
  ticket: Ticket;
  /** When set, auto-open the conflict diff (local draft vs latest Jira) */
  showConflictDiff?: boolean;
  /** When set, auto-open the draft diff (local edits vs latest Jira) without conflict framing */
  autoOpenDraftDiff?: boolean;
  /** When true, the remote change was metadata-only (no content diff). Shows push button in diff view. */
  metadataOnlyConflict?: boolean;
  /** Called when user resolves the conflict. Action is "keep" or "discard". */
  onConflictResolved?: (action: "keep" | "discard") => void;
  /** When changed, resets the diff view back to the version list */
  resetKey?: number;
  /** Called once versions finish loading, with the total count */
  onVersionsLoaded?: (count: number) => void;
  /** When true, render for a constrained side pane (no top margin, own padding) instead of the ticket detail tab */
  embedded?: boolean;
  /** Id of the portal the diff footer renders into. Override so a panel instance
   * does not target the full page's footer when both render at once. */
  diffFooterPortalId?: string;
}

export function TicketHistory({ ticket, showConflictDiff, autoOpenDraftDiff, metadataOnlyConflict, onConflictResolved, resetKey, onVersionsLoaded, embedded, diffFooterPortalId }: TicketHistoryProps) {
  const [ticketVersions, setTicketVersions] = useState<StoryVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const onVersionsLoadedRef = useRef(onVersionsLoaded);
  onVersionsLoadedRef.current = onVersionsLoaded;
  // Ref prevents ticketVersions from being a dep of the lazy-load effect (which would cause fetch loops).
  const ticketVersionsRef = useRef(ticketVersions);
  ticketVersionsRef.current = ticketVersions;

  const [compareOld, setCompareOld] = useState<number | null>(null);
  const [compareNew, setCompareNew] = useState<number | null>(null);
  const [showingDiff, setShowingDiff] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [savingMerge, setSavingMerge] = useState(false);
  const [diffStats, setDiffStats] = useState<DiffStats | null>(null);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; total: number } | null>(null);

  useEffect(() => {
    if (resetKey !== undefined) {
      setShowingDiff(false);
      setPreviewVersion(null);
      setMergeResult(null);
      setDiffStats(null);
    }
  }, [resetKey]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      apiFetch<Record<string, unknown>[]>(`/api/tickets/${encodeURIComponent(ticket.key)}/versions?metaOnly=true`).catch(() => []),
      tickets.getLocalEdits(ticket.key).catch(() => []),
      apiFetch<{ aiDrafts: unknown[] }>(`/api/tickets/${encodeURIComponent(ticket.key)}/story-writer?draftsOnly=true`).catch(() => ({ aiDrafts: [] })),
    ])
      .then(([versionData, editData, writerData]) => {
        if (cancelled) return;
        const versions: StoryVersion[] = Array.isArray(versionData)
          ? parseRawVersionData(versionData as Record<string, unknown>[])
          : [];

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
          for (const raw of aiDrafts) {
            const draft = raw as { id?: string; createdAt?: string; content?: string; draftIndex?: number };
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

  // Lazy-load Jira version content when the diff or preview opens; uses ref to avoid fetch loop.
  useEffect(() => {
    const neededVersionNumbers: number[] = [];

    if (showingDiff && compareOld !== null && compareNew !== null) {
      neededVersionNumbers.push(compareOld, compareNew);
    } else if (previewVersion !== null) {
      neededVersionNumbers.push(previewVersion);
    } else {
      return;
    }

    const needed = ticketVersionsRef.current.filter(
      (v) => v.id && !v.content && neededVersionNumbers.includes(v.versionNumber),
    );
    if (needed.length === 0) return;

    let cancelled = false;
    setLoadingContent(true);

    Promise.all(
      needed.map((v) =>
        apiFetch<Record<string, unknown>>(`/api/tickets/${encodeURIComponent(ticket.key)}/versions/${encodeURIComponent(v.id!)}`).catch(() => null),
      ),
    ).then((results) => {
      if (cancelled) return;
      const byId = new Map(results.filter(Boolean).map((r) => [r!.id, r!]));
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
  }, [showingDiff, compareOld, compareNew, previewVersion, ticket.key]);

  // Initialize defaults once versions load
  useEffect(() => {
    if (ticketVersions.length < 2) return;
    if (compareOld !== null || compareNew !== null) return;
    const s = [...ticketVersions].sort((a, b) => b.versionNumber - a.versionNumber);
    setCompareOld(s[1].versionNumber);
    setCompareNew(s[0].versionNumber);
  }, [ticketVersions, compareOld, compareNew]);

  // Auto-open draft/conflict diff; uses ticketVersions (stable state) not the derived sorted array.
  useEffect(() => {
    if ((!showConflictDiff && !autoOpenDraftDiff) || ticketVersions.length < 2) return;
    const d = ticketVersions.find((v) => v.label === "draft");
    const jc = ticketVersions.find((v) => v.label === "current");
    if (d && jc) {
      setCompareOld(jc.versionNumber);
      setCompareNew(d.versionNumber);
      setShowingDiff(true);
    }
  }, [showConflictDiff, autoOpenDraftDiff, ticketVersions]);

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
    setPreviewVersion(null);
    setShowingDiff(true);
  };

  const handlePreviewClick = (versionNumber: number) => {
    setShowingDiff(false);
    setPreviewVersion(versionNumber);
  };

  const handlePreviewOpenDiff = (versionNumber: number) => {
    const idx = sorted.findIndex((v) => v.versionNumber === versionNumber);
    const prev = sorted[idx + 1];
    setCompareNew(versionNumber);
    setCompareOld(prev?.versionNumber ?? versionNumber);
    setPreviewVersion(null);
    setShowingDiff(true);
  };

  const handleKeepAndPush = useCallback(async () => {
    setResolving(true);
    try {
      await apiFetch<unknown>(`/api/tickets/${encodeURIComponent(ticket.key)}/local-edits`, { method: "PATCH" });
      const data = await tickets.pushToJira(ticket.key) as Record<string, unknown>;
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
      const data = await tickets.pushToJira(ticket.key, { force: true }) as Record<string, unknown>;
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
      await apiFetch<void>(`/api/tickets/${encodeURIComponent(ticket.key)}/local-edits`, { method: "DELETE" });
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
      await tickets.saveLocalEdit(ticket.key, { field: "description", localValue: mergeResult });
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
      await tickets.saveLocalEdit(ticket.key, { field: "description", localValue: version.content });
      onConflictResolved?.("keep");
    } catch (err) {
      console.error("Failed to create revert edit:", err);
    } finally {
      setResolving(false);
    }
  }, [ticket.key, onConflictResolved]);

  const handleImportHistory = useCallback(async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const data = await tickets.importVersion(ticket.key, {}) as unknown as { imported: number; skipped: number; total: number };
      setImportResult(data);
      if (data.imported > 0) {
        // Refresh the version list
        const versionData = await apiFetch<Record<string, unknown>[]>(`/api/tickets/${encodeURIComponent(ticket.key)}/versions?metaOnly=true`);
        if (Array.isArray(versionData)) {
          const versions = parseRawVersionData(versionData);
          setTicketVersions(versions);
          onVersionsLoadedRef.current?.(versions.length);
        }
      }
    } catch (err) {
      console.error("Failed to import Jira history:", err);
    } finally {
      setImporting(false);
    }
  }, [ticket.key]);

  const oldOptions = useMemo(
    () => sorted.filter((v) => v.versionNumber !== compareNew).map(storyVersionToOption),
    [sorted, compareNew],
  );
  const newOptions = useMemo(
    () => sorted.filter((v) => v.versionNumber !== compareOld).map(storyVersionToOption),
    [sorted, compareOld],
  );
  const allVersionOptions = useMemo(
    () => sorted.map(storyVersionToOption),
    [sorted],
  );

  // Non-embedded usage (the History tab) already gets top padding from its
  // container, so no extra top margin is needed here.
  const wrapperClass = embedded ? "p-4" : "";

  if (loading) {
    return (
      <div className={wrapperClass}>
        <SectionHeader title="History" />
        <div className="mt-3 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-border-default px-4 py-3">
              <div className="h-7 w-7 animate-pulse rounded-full bg-overlay-default" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-overlay-default" />
                <div className="h-2.5 w-20 animate-pulse rounded bg-overlay-subtle" />
              </div>
              <div className="h-3 w-8 animate-pulse rounded bg-overlay-default" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className={wrapperClass}>
        <SectionHeader title="History" count={0} />
        <p className="mt-3 text-body-lg text-text-tertiary">No version history yet</p>
      </div>
    );
  }

  const previewVersionData = previewVersion !== null
    ? sorted.find((v) => v.versionNumber === previewVersion) ?? null
    : null;

  return (
    <div className={wrapperClass}>
      {previewVersion !== null && previewVersionData ? (
        <VersionPreview
          version={previewVersionData}
          versionOptions={allVersionOptions}
          loadingContent={loadingContent}
          onVersionChange={(num) => setPreviewVersion(num)}
          onBack={() => setPreviewVersion(null)}
          onOpenDiff={handlePreviewOpenDiff}
        />
      ) : showingDiff && compareOldVersion && compareNewVersion && compareOld !== compareNew ? (
        <DiffViewer
          portalId={diffFooterPortalId}
          compareOldVersion={compareOldVersion}
          compareNewVersion={compareNewVersion}
          compareOld={compareOld}
          compareNew={compareNew}
          oldOptions={oldOptions}
          newOptions={newOptions}
          loadingContent={loadingContent}
          isConflictView={!!isConflictView}
          metadataOnlyConflict={metadataOnlyConflict}
          resolving={resolving}
          savingMerge={savingMerge}
          mergeResult={mergeResult}
          diffStats={diffStats}
          onOldChange={handleOldChange}
          onNewChange={handleNewChange}
          onResultChange={setMergeResult}
          onStatsComputed={setDiffStats}
          onKeepAndPush={handleKeepAndPush}
          onForcePush={handleForcePush}
          onDiscardLocal={handleDiscardLocal}
          onSaveMerge={handleSaveMerge}
          onRevertTo={handleRevertTo}
          onPreview={handlePreviewClick}
        />
      ) : (
        <VersionList
          sorted={sorted}
          isDraftOutdated={isDraftOutdated}
          oldOptions={oldOptions}
          newOptions={newOptions}
          compareOld={compareOld}
          compareNew={compareNew}
          importing={importing}
          importResult={importResult}
          onVersionClick={handleVersionClick}
          onPreviewClick={handlePreviewClick}
          onOldChange={handleOldChange}
          onNewChange={handleNewChange}
          onImportHistory={handleImportHistory}
        />
      )}
    </div>
  );
}
