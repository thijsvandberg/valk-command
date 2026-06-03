"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Ticket, TicketDetail, TicketReadiness, IssueType, JiraStatus } from "@/types/ticket";
import { useTicketDetail, useJiraSprints, useTicketReviews, useActiveWriterSessions } from "@/hooks/useSprintBoard";
import { useFollowedTickets, useFollowTicket } from "@/hooks/usePipelines";
import { apiFetch, jira, tickets } from "@/lib/api-client";
import { getJiraUrl } from "@/components/sprint-board/TicketTableCells";
import { useToast } from "@/hooks/useToast";

export function useTicketDetailPage(key: string) {
  const { toast, toastLoading, showToast, dismissToast } = useToast();
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

  const localEdits: Record<string, { value: string; isDraft: boolean }> | undefined =
    (apiData as Record<string, unknown> | undefined)?.localEdits as Record<string, { value: string; isDraft: boolean }> | undefined;

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

  const [flagOverride, setFlagOverride] = useState<boolean | null>(null);
  const isFlagged = flagOverride ?? ticket?.flagged ?? false;

  const handleTitleLocalEdit = useCallback((has: boolean) => setHasLocalTitleEdit(has), []);
  const handleDescLocalEdit = useCallback((has: boolean) => setHasLocalDescEdit(has), []);

  const handleReadinessChange = useCallback(async (v: TicketReadiness | null) => {
    mutateTicket((prev) => prev ? { ...prev, readiness: v } : prev, { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${key}/metadata`, { method: "PUT", body: { readiness: v } });
    } catch {
      mutateTicket();
    }
  }, [key, mutateTicket]);

  const handleJiraStatusChange = useCallback(async (status: JiraStatus) => {
    mutateTicket((prev) => prev ? { ...prev, jiraStatus: status } : prev, { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${key}/status`, { method: "PUT", body: { status } });
    } catch {
      mutateTicket();
    }
  }, [key, mutateTicket]);

  const showConflictWarning = ticket?.editState === "conflict";

  const handleRemoteChanged = useCallback((contentChanged: boolean) => {
    setShowConflictDiff(true);
    setMetadataOnlyConflict(!contentChanged);
    mutateTicket();
  }, [mutateTicket]);

  const handleDiscardDraft = useCallback(async () => {
    setIsDiscarding(true);
    setDiscardError(null);
    try {
      await apiFetch(`/api/tickets/${key}/local-edits`, { method: "DELETE" });
      setHasLocalTitleEdit(false);
      setHasLocalDescEdit(false);
      setPushError(null);
      setOverrideConfirmed(false);
      setShowConflictDiff(false);
      setMetadataOnlyConflict(false);
      await mutateTicket(
        (prev) => prev ? { ...prev, editState: "clean", localEdits: {} } : prev,
        { revalidate: true },
      );
      setDraftDiscardKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to discard draft:", err);
      setDiscardError("Failed to accept Jira version. Please try again.");
    } finally {
      setIsDiscarding(false);
    }
  }, [key, mutateTicket]);

  const handlePushToJira = useCallback(async () => {
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
        await mutateTicket();
        setDraftDiscardKey((k) => k + 1);
        showToast("Pushed to Jira");
      } else {
        setPushError(data.error ?? "Push failed");
      }
    } catch {
      setPushError("Failed to push to Jira");
    } finally {
      setIsPushing(false);
    }
  }, [key, handleRemoteChanged, mutateTicket, showToast]);

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
    setDiscardError(null);
    await mutateTicket(
      (prev) => prev ? { ...prev, editState: "clean", localEdits: {} } : prev,
      { revalidate: true },
    );
    setDraftDiscardKey((k) => k + 1);
  }, [mutateTicket]);

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
    overrideConfirmed,
    setOverrideConfirmed,
    draftDiscardKey,
    handleDiscardDraft,
    handlePushToJira,

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
    handleRemoteChanged,

    // Sprint
    ticketSprintId,
    ticketSprintLabel,

    // Conflict resolution
    handleConflictResolved,
  };
}
