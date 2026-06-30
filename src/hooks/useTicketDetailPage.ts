"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Ticket, TicketDetail, TicketReadiness, IssueType, JiraStatus, EpicChild } from "@/types/ticket";
import { useTicketDetail, useJiraSprints, useTicketReviews, useActiveWriterSessions } from "@/hooks/useSprintBoard";
import { useFollowedTickets, useFollowTicket } from "@/hooks/usePipelines";
import { apiFetch, jira, tickets, ApiError } from "@/lib/api-client";
import { mapPushErrorMessage } from "@/lib/push-error-message";
import { patchTicketCaches, revalidateTicketCaches } from "@/lib/ticket-cache";
import { useTicketEditStateSync } from "@/hooks/useTicketEditStateSync";
import { useLocalEditSaver } from "@/lib/local-edit-saver";
import { getJiraUrl } from "@/components/sprint-board/TicketTableCells";
import { useToast } from "@/hooks/useToast";
import { useTicketEvents } from "@/hooks/useTicketEvents";
import { useChangeHighlight } from "@/hooks/useChangeHighlight";
import { getClientId } from "@/lib/client-id";
import type { TicketEvent } from "@/lib/ticket-events";

export function useTicketDetailPage(key: string) {
  const { toast, toastLoading, showToast, dismissToast } = useToast();
  const syncEditState = useTicketEditStateSync();
  const { data: apiData, isLoading: ticketLoading, mutate: mutateTicket } = useTicketDetail(key);
  const handleMutate = useCallback(() => { mutateTicket(); }, [mutateTicket]);

  const ticket: Ticket | undefined = useMemo(() => apiData ? {
    key: apiData.key,
    title: apiData.title,
    type: apiData.type,
    epic: apiData.epic ?? null,
    epicKey: apiData.epicKey ?? null,
    jiraStatus: apiData.jiraStatus,
    storyPoints: apiData.storyPoints ?? null,
    assignee: apiData.assignee ?? null,
    flagged: apiData.flagged ?? false,
    readiness: apiData.readiness ?? null,
    poStatus: apiData.poStatus ?? null,
    qualityScore: apiData.qualityScore ?? null,
    editState: apiData.editState ?? "clean",
    notes: apiData.notes ?? "",
    sprintId: apiData.sprintId,
    businessValue: apiData.businessValue ?? null,
    removedFromJiraAt: apiData.removedFromJiraAt ?? null,
  } : undefined, [apiData]);

  const detail: TicketDetail | undefined = useMemo(() => apiData ? {
    description: apiData.description ?? "",
    reporter: apiData.reporter ?? null,
    parent: apiData.parent ?? null,
    labels: apiData.labels ?? [],
    components: apiData.components ?? [],
    priority: apiData.priority ?? "Medium",
    createdAt: apiData.createdAt ?? "",
    updatedAt: apiData.updatedAt ?? "",
    attachments: apiData.attachments ?? [],
    subtasks: apiData.subtasks ?? [],
    linkedIssues: apiData.linkedIssues ?? [],
    jiraComments: apiData.jiraComments ?? [],
    epicChildren: apiData.epicChildren ?? [],
  } : undefined, [apiData]);

  const localEdits: Record<string, { value: string; isDraft: boolean; modifiedAt?: string }> | undefined =
    (apiData as Record<string, unknown> | undefined)?.localEdits as Record<string, { value: string; isDraft: boolean; modifiedAt?: string }> | undefined;

  // Auto-fetch from Jira when ticket is not in local DB
  const [jiraCheckState, setJiraCheckState] = useState<"idle" | "checking" | "not-found">("idle");
  const jiraCheckStarted = useRef(false);
  useEffect(() => {
    if (ticketLoading || apiData || jiraCheckStarted.current) return;
    jiraCheckStarted.current = true;
    setJiraCheckState("checking");
    let cancelled = false;
    async function tryFetchFromJira() {
      const abortCtrl = new AbortController();
      const timer = setTimeout(() => abortCtrl.abort(), 10_000);
      try {
        const data = await jira.syncTickets({ ticketKeys: [key] }, abortCtrl.signal) as { count?: number };
        clearTimeout(timer);
        if (cancelled) return;
        if ((data.count ?? 0) > 0) {
          await mutateTicket();
          return;
        }
        setJiraCheckState("not-found");
      } catch {
        clearTimeout(timer);
        if (!cancelled) setJiraCheckState("not-found");
      }
    }
    tryFetchFromJira();
    return () => { cancelled = true; };
  }, [ticketLoading, apiData, key, mutateTicket]);

  const { data: followedTickets } = useFollowedTickets();
  const { follow, unfollow } = useFollowTicket();
  const isFollowed = followedTickets?.includes(key) ?? false;

  const [hasLocalTitleEdit, setHasLocalTitleEdit] = useState(false);
  const [hasLocalDescEdit, setHasLocalDescEdit] = useState(false);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [isDescEditing, setIsDescEditing] = useState(false);
  const [showConflictDiff, setShowConflictDiff] = useState(false);
  const [metadataOnlyConflict, setMetadataOnlyConflict] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const linkCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTypeChange = useCallback(async (newType: IssueType) => {
    await apiFetch(`/api/tickets/${encodeURIComponent(key)}`, {
      method: "PATCH",
      body: { type: newType },
    });
    mutateTicket();
  }, [key, mutateTicket]);

  const handleCopyLink = useCallback(async () => {
    if (!ticket) return;
    const url = getJiraUrl(key);
    const text = `${ticket.title} - ${url}`;
    try {
      await navigator.clipboard.writeText(text);
      setLinkCopied(true);
      if (linkCopyTimer.current) clearTimeout(linkCopyTimer.current);
      linkCopyTimer.current = setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      console.warn("Clipboard write failed");
    }
  }, [ticket, key]);

  const { data: reviewData } = useTicketReviews(key);
  const reviewCount = (apiData as Record<string, unknown> | undefined)?.reviewCount as number ?? reviewData?.reviews?.length ?? 0;
  const versionCount = (apiData as Record<string, unknown> | undefined)?.versionCount as number ?? 0;

  const { data: activeSessions, mutate: mutateActiveSessions } = useActiveWriterSessions();
  const hasActiveSession = activeSessions?.some((s) => s.ticketKey === key) ?? false;

  const [isDeletingSession, setIsDeletingSession] = useState(false);

  const handleDeleteSession = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDeletingSession(true);
    try {
      await mutateActiveSessions(
        (current) => current?.filter((s) => s.ticketKey !== key) ?? [],
        { revalidate: false },
      );
      await apiFetch(`/api/tickets/${key}/story-writer?deleteConversation=true`, { method: "DELETE" });
      await mutateActiveSessions();
    } catch (err) {
      console.error("Failed to delete session:", err);
      await mutateActiveSessions();
    } finally {
      setIsDeletingSession(false);
    }
  }, [key, mutateActiveSessions]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [isPushing, setIsPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [draftDiscardKey, setDraftDiscardKey] = useState(0);

  // One concurrency saver shared by the title and description editors so a
  // 409 in either pauses both and the banner reflects the page (BRDG-340).
  const editSaver = useLocalEditSaver();

  const [flagOverride, setFlagOverride] = useState<boolean | null>(null);
  const isFlagged = flagOverride ?? ticket?.flagged ?? false;

  // The latest title draft value, mirrored from the editor. Push reads this so the
  // post-push cache patch shows the just-typed title without a refetch, mirroring
  // how the description value is handed in (the SWR cache does not track drafts).
  const latestTitleEditRef = useRef<string | null>(null);
  const handleTitleLocalEdit = useCallback((has: boolean, value?: string | null) => {
    setHasLocalTitleEdit(has);
    latestTitleEditRef.current = has ? (value ?? null) : null;
  }, []);
  const handleDescLocalEdit = useCallback((has: boolean) => setHasLocalDescEdit(has), []);

  const handleReadinessChange = useCallback(async (v: TicketReadiness | null) => {
    // Patch every cache that renders readiness (detail + board lists) so the board
    // pill also reflects the change when the user returns to it (BRDG-334).
    patchTicketCaches(key, { readiness: v });
    try {
      await apiFetch(`/api/tickets/${key}/metadata`, { method: "PUT", body: { readiness: v } });
    } catch {
      revalidateTicketCaches();
    }
  }, [key]);

  const handleJiraStatusChange = useCallback(async (status: JiraStatus) => {
    mutateTicket((prev) => prev ? { ...prev, jiraStatus: status } : prev, { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${key}/status`, { method: "PUT", body: { status } });
    } catch {
      mutateTicket();
    }
  }, [key, mutateTicket]);

  // Optimistically patch a subtask's status in the parent detail SWR cache so the row
  // updates instantly. The subtask status write hits the child's endpoint, which does
  // not touch this parent detail cache; a bare revalidation would return the still-cached
  // (stale) subtask status. SubtasksSection owns the PUT and rolls this back on failure.
  const handleSubtaskJiraStatusChange = useCallback((childKey: string, status: JiraStatus) => {
    mutateTicket(
      (prev) => prev ? {
        ...prev,
        subtasks: prev.subtasks.map((s) => s.key === childKey ? { ...s, jiraStatus: status } : s),
      } : prev,
      { revalidate: false },
    );
  }, [mutateTicket]);

  // Same optimistic pattern for the epic children table: child rows render from the
  // epicChildren array embedded in this (epic) ticket's detail cache, while child
  // writes hit the child's own endpoints. EpicChildrenSection owns the writes and
  // revalidates on failure.
  const handleEpicChildPatch = useCallback((childKey: string, patch: Partial<EpicChild>) => {
    mutateTicket(
      (prev) => prev ? {
        ...prev,
        epicChildren: (prev.epicChildren ?? []).map((c) => c.key === childKey ? { ...c, ...patch } : c),
      } : prev,
      { revalidate: false },
    );
  }, [mutateTicket]);

  const showConflictWarning = ticket?.editState === "conflict";

  const handleRemoteChanged = useCallback((contentChanged: boolean) => {
    setShowConflictDiff(true);
    setMetadataOnlyConflict(!contentChanged);
    mutateTicket();
  }, [mutateTicket]);

  // BRDG-338: keep the open ticket live. Any local DB write to this ticket
  // (another tab, a Jira sync, an agent push) revalidates the detail payload
  // within ~1-2s; the changed kinds drive a brief highlight unless this tab
  // caused the write itself.
  const { activeKinds: liveChangeKinds, trigger: triggerLiveHighlight } = useChangeHighlight();

  const handleLiveTicketEvent = useCallback((event: TicketEvent) => {
    // A write this tab made itself (push, autosave, metadata change) echoes back
    // as a live event tagged with our own client id. We have already applied the
    // optimistic post-write patch, so revalidating here would refetch a possibly
    // stale payload (server cache invalidation lags in dev) and clobber it — the
    // "title reverts to the old value until refresh" bug. Own writes are
    // self-managed; only react to writes from other origins (tabs, agents, sync).
    if (event.origin && event.origin === getClientId()) return;

    const editingContent = isTitleEditing || isDescEditing || hasLocalTitleEdit || hasLocalDescEdit;
    if (event.kinds.includes("content") && editingContent) {
      // An in-progress edit must never be silently overwritten: surface the
      // existing BRDG-243 conflict warning and let the PO decide.
      handleRemoteChanged(true);
    } else {
      mutateTicket();
    }
    triggerLiveHighlight(event.kinds);
  }, [isTitleEditing, isDescEditing, hasLocalTitleEdit, hasLocalDescEdit, handleRemoteChanged, mutateTicket, triggerLiveHighlight]);

  useTicketEvents(key, handleLiveTicketEvent);

  const handleDiscardDraft = useCallback(async () => {
    setIsDiscarding(true);
    setDiscardError(null);
    try {
      await apiFetch(`/api/tickets/${key}/local-edits`, { method: "DELETE" });
      setHasLocalTitleEdit(false);
      setHasLocalDescEdit(false);
      latestTitleEditRef.current = null;
      setPushError(null);
      setOverrideConfirmed(false);
      setShowConflictDiff(false);
      setMetadataOnlyConflict(false);
      await mutateTicket(
        (prev) => prev ? { ...prev, editState: "clean", localEdits: {} } : prev,
        { revalidate: true },
      );
      setDraftDiscardKey((k) => k + 1);
      syncEditState(key, "clean");
    } catch (err) {
      console.error("Failed to discard draft:", err);
      setDiscardError("Failed to accept Jira version. Please try again.");
    } finally {
      setIsDiscarding(false);
    }
  }, [key, mutateTicket, syncEditState]);

  const handlePushToJira = useCallback(async (pushed?: { description?: string }) => {
    setIsPushing(true);
    setPushError(null);
    try {
      const data = await tickets.pushToJira(key) as { conflict?: boolean; contentChanged?: boolean; success?: boolean; error?: string };
      if (data.conflict) {
        handleRemoteChanged(data.contentChanged ?? true);
      } else if (data.success) {
        setHasLocalTitleEdit(false);
        setHasLocalDescEdit(false);
        setOverrideConfirmed(false);
        // Patch the post-push state client-side and do NOT revalidate right
        // away: server cache invalidation is unreliable in dev, so the refetch
        // can return the pre-push payload and clobber this patch — which is
        // exactly the "old version until refresh" bug (BRDG-340). The editor
        // hands its just-pushed content via `pushed` because the SWR cache
        // does not track autosaved drafts.
        const pushedTitle = latestTitleEditRef.current ?? localEdits?.title?.value;
        latestTitleEditRef.current = null;
        const pushedDescription = pushed?.description ?? localEdits?.description?.value;
        await mutateTicket(
          (prev) => prev ? {
            ...prev,
            editState: "clean",
            localEdits: {},
            ...(pushedTitle ? { title: pushedTitle } : {}),
            ...(pushedDescription ? { description: pushedDescription } : {}),
          } : prev,
          { revalidate: false },
        );
        setDraftDiscardKey((k) => k + 1);
        syncEditState(key, "clean");
        showToast("Pushed to Jira");
      } else {
        setPushError(data.error ?? "Push failed");
      }
    } catch (err) {
      // The push route returns a non-2xx with { error, code, detail }, where
      // `detail` carries the parsed Jira reason (e.g. CONTENT_LIMIT_EXCEEDED).
      // apiFetch throws an ApiError that retains that body, so surface the real
      // reason in the editor toolbar banner. The bottom-right failure toast is
      // owned by the global ActivityToast (driven by the logged activity entry),
      // so we deliberately do NOT showToast here - that would double-toast.
      const body = err instanceof ApiError ? err.body : null;
      const message = mapPushErrorMessage(body?.detail ?? body?.error);
      setPushError(message);
    } finally {
      setIsPushing(false);
    }
  }, [key, handleRemoteChanged, mutateTicket, showToast, syncEditState, localEdits]);

  // Drop a stale push failure once the PO edits the description again (BRDG-349):
  // a confirmed content-limit rejection outranks our estimate, so the editor needs
  // an explicit way to clear it when the content changes.
  const clearPushError = useCallback(() => setPushError(null), []);

  // "Reload draft" on the cross-tab conflict banner: adopt the other tab's
  // version. Fresh tokens reseed from the revalidated payload when the key
  // bump remounts both editors.
  const handleDraftConflictReload = useCallback(async () => {
    editSaver.clearTokens();
    await mutateTicket();
    setDraftDiscardKey((k) => k + 1);
  }, [editSaver, mutateTicket]);

  const handleRefreshFromJira = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await jira.syncTickets({ ticketKeys: [key] });
      await mutateTicket();
    } catch (err) {
      console.error("Failed to refresh from Jira:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [key, mutateTicket]);

  const [flagReasonInput, setFlagReasonInput] = useState("");

  const handleFlag = useCallback(async () => {
    const reason = flagReasonInput.trim();
    setFlagOverride(true);
    setFlagReasonInput("");
    try {
      await tickets.toggleFlag(key, true, reason || undefined);
      await mutateTicket();
      setFlagOverride(null);
    } catch (err) {
      console.error("Operation failed:", err);
      setFlagOverride(null);
    }
  }, [key, flagReasonInput, mutateTicket]);

  const handleUnflag = useCallback(async () => {
    setFlagOverride(false);
    try {
      await tickets.toggleFlag(key, false);
      await mutateTicket();
      setFlagOverride(null);
    } catch (err) {
      console.error("Operation failed:", err);
      setFlagOverride(null);
    }
  }, [key, mutateTicket]);

  const { sprints: rawSprints } = useJiraSprints();
  const ticketSprintId = ticket?.sprintId ?? null;
  const ticketSprintLabel = rawSprints?.find((s) => String(s.id) === ticketSprintId)?.name ?? ticketSprintId;

  const handleConflictResolved = useCallback(async () => {
    setShowConflictDiff(false);
    setMetadataOnlyConflict(false);
    setHasLocalTitleEdit(false);
    setHasLocalDescEdit(false);
    latestTitleEditRef.current = null;
    setDiscardError(null);
    await mutateTicket(
      (prev) => prev ? { ...prev, editState: "clean", localEdits: {} } : prev,
      { revalidate: true },
    );
    setDraftDiscardKey((k) => k + 1);
  }, [mutateTicket]);

  // Restoring a version writes a new local edit server-side, then surfaces it as
  // the working copy. Like the push handler (BRDG-340), patch the cache
  // client-side and do NOT revalidate immediately: a dev-mode refetch can return
  // the pre-restore payload and clobber the patch, which is the "old version
  // until refresh" bug. Setting localEdits.description (not clearing it) is what
  // makes the remounted editor show the restored content right away.
  const handleRestored = useCallback(async (content: string) => {
    setShowConflictDiff(false);
    setMetadataOnlyConflict(false);
    setHasLocalDescEdit(true);
    await mutateTicket(
      (prev) => {
        if (!prev) return prev;
        const prevEdits = (prev as unknown as Record<string, unknown>).localEdits as
          | Record<string, { value: string; isDraft: boolean; modifiedAt?: string }>
          | undefined;
        return {
          ...prev,
          editState: "local_edits",
          localEdits: { ...(prevEdits ?? {}), description: { value: content, isDraft: false } },
        };
      },
      { revalidate: false },
    );
    setDraftDiscardKey((k) => k + 1);
    syncEditState(key, "local_edits");
  }, [key, mutateTicket, syncEditState]);

  return {
    ticket,
    detail,
    localEdits,
    apiData,
    ticketLoading,
    jiraCheckState,
    mutateTicket: handleMutate,

    // Follow
    isFollowed,
    follow,
    unfollow,

    // Editing state
    hasLocalTitleEdit,
    hasLocalDescEdit,
    isTitleEditing,
    isDescEditing,
    setIsTitleEditing,
    setIsDescEditing,
    handleTitleLocalEdit,
    handleDescLocalEdit,

    // Conflict
    showConflictWarning,
    showConflictDiff,
    setShowConflictDiff,
    metadataOnlyConflict,

    // Push/discard
    isDiscarding,
    discardError,
    isPushing,
    pushError,
    clearPushError,
    overrideConfirmed,
    setOverrideConfirmed,
    draftDiscardKey,
    handleDiscardDraft,
    handlePushToJira,
    editSaver,
    handleDraftConflictReload,

    // Transient feedback
    toast,
    toastLoading,
    dismissToast,

    // Copy
    linkCopied,
    handleCopyLink,

    // Review / versions
    reviewData,
    reviewCount,
    versionCount,

    // Writer sessions
    hasActiveSession,
    isDeletingSession,
    handleDeleteSession,

    // Refresh
    isRefreshing,
    handleRefreshFromJira,

    // Flag
    isFlagged,
    flagReasonInput,
    setFlagReasonInput,
    handleFlag,
    handleUnflag,

    // Status/type/readiness
    handleTypeChange,
    handleReadinessChange,
    handleJiraStatusChange,
    handleSubtaskJiraStatusChange,
    handleEpicChildPatch,
    handleRemoteChanged,

    // Sprint
    ticketSprintId,
    ticketSprintLabel,

    // Live updates (BRDG-338)
    liveChangeKinds,

    // Conflict resolution
    handleConflictResolved,

    // Version restore (BRDG-440)
    handleRestored,
  };
}
