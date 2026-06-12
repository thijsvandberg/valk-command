import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { useRouter } from "next/navigation";
import { mutate as globalMutate } from "swr";
import { useStoryWriter } from "@/hooks/useStoryWriter";
import { useTicketEvents } from "@/hooks/useTicketEvents";
import { useNotification } from "@/hooks/useNotification";
import { PAGE_TITLE_SUFFIX } from "@/hooks/usePageTitle";
import { ApiError, apiFetch, jira, tickets } from "@/lib/api-client";
import type { EpicOption } from "@/components/shared/EpicPicker";
import type { WriterContextValue } from "./panes/WriterContext";
import type { TicketReadiness, IssueType, JiraStatus, Ticket } from "@/types/ticket";

interface UseStoryWriterActionsArgs {
  ticketKey: string;
  writer: ReturnType<typeof useStoryWriter>;
  ticketData: Record<string, unknown> | undefined;
  mutateTicket: (optimistic?: unknown, opts?: { revalidate: boolean }) => void;
  draftTitle?: string;
  draftType?: string;
  isDraft: boolean;
  isStillDraft: boolean;
  effectiveKey: string;
}

export function useStoryWriterActions({
  ticketKey,
  writer,
  ticketData,
  mutateTicket,
  draftTitle,
  draftType,
  isDraft,
  isStillDraft,
  effectiveKey,
}: UseStoryWriterActionsArgs) {
  const router = useRouter();
  const { notify } = useNotification();

  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const editVersionRef = useRef(0);
  const initialDirtyChecked = useRef(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showWrapUpMenu, setShowWrapUpMenu] = useState(false);
  const [showAddToRefinement, setShowAddToRefinement] = useState(false);
  // Set when a wrap-up flow opened the Add-to-refinement dialog: closing the
  // dialog (Skip or Add) finishes the wrap-up by navigating away.
  const [wrapUpNavPending, setWrapUpNavPending] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const wrapUpMenuRef = useRef<HTMLDivElement>(null);

  // Local readiness state for optimistic updates
  const ticketReadiness = (ticketData?.readiness ?? null) as TicketReadiness | null;
  const [localReadiness, setLocalReadiness] = useState<TicketReadiness | null>(ticketReadiness);
  useEffect(() => {
    setLocalReadiness(ticketReadiness);
  }, [ticketReadiness]);

  // Sync browser tab title
  const resolvedTitle = writer.session?.localTitle ?? (ticketData?.title as string | undefined) ?? draftTitle;
  const pageTitle = resolvedTitle && resolvedTitle !== "Untitled draft"
    ? `${effectiveKey} - ${resolvedTitle} - Story Writer${PAGE_TITLE_SUFFIX}`
    : `${effectiveKey} - Story Writer${PAGE_TITLE_SUFFIX}`;
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  // Split mode state
  const [splitModeVisible, setSplitModeVisible] = useState(false);
  const [showSplitPicker, setShowSplitPicker] = useState(false);
  const [targetTicketTitle, setTargetTicketTitle] = useState<string | null>(null);

  useOutsideClick(moreMenuRef, () => setShowMoreMenu(false), { enabled: showMoreMenu });
  useOutsideClick(wrapUpMenuRef, () => setShowWrapUpMenu(false), { enabled: showWrapUpMenu });

  const targetTicketKey = writer.session?.targetTicketKey ?? null;

  const prevTargetKey = useRef<string | null>(null);
  useEffect(() => {
    if (targetTicketKey && prevTargetKey.current !== targetTicketKey) {
      setSplitModeVisible(true);
    }
    prevTargetKey.current = targetTicketKey;
  }, [targetTicketKey]);

  useEffect(() => {
    if (!targetTicketKey) {
      setTargetTicketTitle(null);
      return;
    }
    let cancelled = false;
    tickets.get(targetTicketKey)
      .then((data) => {
        if (!cancelled && data?.title) setTargetTicketTitle(data.title);
      })
      .catch((err) => console.warn("[story-writer] fetch target ticket failed", err));
    return () => { cancelled = true; };
  }, [targetTicketKey]);

  const prevWriterStatus = useRef(writer.status);
  useEffect(() => {
    if (prevWriterStatus.current === "streaming" && writer.status === "ready") {
      notify("Story Writer response ready", {
        body: ticketKey,
        tag: "story-writer-response",
        onClick: () => { window.focus(); },
      });
    }
    prevWriterStatus.current = writer.status;
  }, [writer.status, notify, ticketKey]);

  useEffect(() => {
    if (!initialDirtyChecked.current && writer.session && ticketData) {
      initialDirtyChecked.current = true;
      const descDirty = (writer.session.localDraft ?? "") !== ((ticketData.description as string) ?? "");
      const titleDirty = !!(writer.session.localTitle && writer.session.localTitle !== ticketData.title);
      setIsDraftDirty(descDirty || titleDirty);
    }
  }, [writer.session, ticketData]);

  const handleTypeChange = useCallback(async (newType: IssueType) => {
    await apiFetch(`/api/tickets/${encodeURIComponent(ticketKey)}`, {
      method: "PATCH",
      body: { type: newType },
    });
    mutateTicket();
  }, [ticketKey, mutateTicket]);

  const handleReadinessChange = useCallback(async (v: TicketReadiness | null) => {
    setLocalReadiness(v);
    await tickets.updateMetadata(ticketKey, { readiness: v });
    mutateTicket();
  }, [ticketKey, mutateTicket]);

  const handleEpicChange = useCallback(async (epic: EpicOption | null) => {
    await tickets.updateEpic(ticketKey, epic?.key ?? null);
    mutateTicket();
  }, [ticketKey, mutateTicket]);

  const handleAssigneeChange = useCallback(async (user: { accountId: string | null; displayName: string; avatarUrl: string | null } | null) => {
    try {
      await jira.assign({ issueKey: ticketKey, accountId: user?.accountId ?? null, name: user?.displayName ?? null });
      mutateTicket();
    } catch (err) {
      console.error("Assignee change failed:", err);
      mutateTicket();
    }
  }, [ticketKey, mutateTicket]);

  const handleSprintChange = useCallback(async (sprintId: string | null) => {
    try {
      await jira.moveSprint({ issueKeys: [ticketKey], targetSprintId: sprintId });
      mutateTicket();
    } catch (err) {
      console.error("Sprint change failed:", err);
      mutateTicket();
    }
  }, [ticketKey, mutateTicket]);

  const handleStoryPointsChange = useCallback(async (v: number | null) => {
    try {
      await tickets.updateStoryPoints(ticketKey, v);
      mutateTicket();
    } catch (err) {
      console.error("Story points change failed:", err);
      mutateTicket();
    }
  }, [ticketKey, mutateTicket]);

  const handleBusinessValueChange = useCallback(async (v: number | null) => {
    try {
      await tickets.updateMetadata(ticketKey, { businessValue: v });
      mutateTicket();
    } catch (err) {
      console.error("Business value change failed:", err);
      mutateTicket();
    }
  }, [ticketKey, mutateTicket]);

  const handleLabelsChange = useCallback(async (labels: string[]) => {
    try {
      await tickets.updateLabels(ticketKey, labels);
      mutateTicket();
    } catch (err) {
      console.error("Labels change failed:", err);
      mutateTicket();
    }
  }, [ticketKey, mutateTicket]);

  const handleFlagChange = useCallback(async (flagged: boolean) => {
    try {
      await tickets.toggleFlag(ticketKey, flagged);
      mutateTicket();
    } catch (err) {
      console.error("Flag change failed:", err);
      mutateTicket();
    }
  }, [ticketKey, mutateTicket]);

  // Plain publish: pushes to Jira and keeps working. Never touches readiness,
  // never closes the editor (BRDG-339).
  const handlePush = useCallback(async () => {
    setPushing(true);
    setPushError(null);
    const versionAtPush = editVersionRef.current;
    try {
      const result = await writer.pushToJira();
      if (result.success) {
        if (editVersionRef.current === versionAtPush) setIsDraftDirty(false);
      } else if (result.conflict) {
        setPushError(result.contentChanged
          ? "Jira was updated externally. Review the diff on the ticket detail page."
          : "Metadata changed in Jira. Try pushing again.");
      }
    } catch (err) {
      const detail = err instanceof ApiError ? (err.body as { detail?: string })?.detail : undefined;
      setPushError(detail ?? "Push failed");
    } finally {
      setPushing(false);
    }
  }, [writer]);

  const handleDelete = useCallback(async (deleteConversation: boolean) => {
    await writer.deleteSession(deleteConversation);
    await globalMutate("/api/story-writer/active-sessions");
    setShowDeleteConfirm(false);
    window.history.back();
  }, [writer]);

  const handleDraftChange = useCallback((content: string) => {
    editVersionRef.current += 1;
    setIsDraftDirty(true);
    writer.updateLocalDraft(content);
  }, [writer]);

  const handleTitleChange = useCallback((title: string) => {
    editVersionRef.current += 1;
    setIsDraftDirty(true);
    writer.updateLocalTitle(title);
  }, [writer]);

  const handleTargetDraftChange = useCallback((content: string) => {
    editVersionRef.current += 1;
    setIsDraftDirty(true);
    writer.updateTargetLocalDraft(content);
  }, [writer]);

  const handleTargetTitleChange = useCallback((title: string) => {
    editVersionRef.current += 1;
    setIsDraftDirty(true);
    writer.updateTargetLocalTitle(title);
  }, [writer]);

  /**
   * Wrap up: always pushes pending changes and ends with closing the editor.
   * A push conflict aborts the close so nothing is lost. Variants only differ
   * in what happens to readiness and the chat session (BRDG-339).
   */
  const performWrapUp = useCallback(async (opts: { readiness: boolean; clearSession: boolean }) => {
    setShowWrapUpMenu(false);
    setPushing(true);
    setPushError(null);
    try {
      const result = await writer.pushToJira();
      // success:false without conflict means there was nothing to push — the
      // wrap-up continues. Only a real conflict aborts the close.
      if (!result.success && result.conflict) {
        setPushError(result.contentChanged
          ? "Jira was updated externally. Review the diff on the ticket detail page."
          : "Metadata changed in Jira. Try pushing again.");
        return;
      }
      setIsDraftDirty(false);
      if (opts.readiness) {
        await handleReadinessChange("ready_to_refine");
      }
      if (opts.clearSession) {
        await writer.deleteSession(true);
        await globalMutate("/api/story-writer/active-sessions");
      }
      if (opts.readiness) {
        // Offer adding the ticket to a refinement before leaving; the dialog's
        // close (Skip or Add) performs the deferred navigation.
        setWrapUpNavPending(true);
        setShowAddToRefinement(true);
      } else {
        router.push(`/tickets/${encodeURIComponent(ticketKey)}`);
      }
    } catch (err) {
      const detail = err instanceof ApiError ? (err.body as { detail?: string })?.detail : undefined;
      setPushError(detail ?? "Push failed");
    } finally {
      setPushing(false);
    }
  }, [writer, handleReadinessChange, router, ticketKey]);

  const handleWrapUpReady = useCallback(
    () => performWrapUp({ readiness: true, clearSession: false }),
    [performWrapUp],
  );
  const handleWrapUpReadyClear = useCallback(
    () => performWrapUp({ readiness: true, clearSession: true }),
    [performWrapUp],
  );
  const handleWrapUpClose = useCallback(
    () => performWrapUp({ readiness: false, clearSession: false }),
    [performWrapUp],
  );

  const handleAddToRefinementClose = useCallback(() => {
    setShowAddToRefinement(false);
    if (wrapUpNavPending) {
      setWrapUpNavPending(false);
      router.push(`/tickets/${encodeURIComponent(ticketKey)}`);
    }
  }, [wrapUpNavPending, router, ticketKey]);

  const handleJiraStatusChange = useCallback(async (status: JiraStatus) => {
    mutateTicket((prev: Record<string, unknown> | undefined) => prev ? { ...prev, jiraStatus: status } : prev, { revalidate: false });
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(ticketKey)}/status`, { method: "PUT", body: { status } });
    } catch {
      mutateTicket();
    }
  }, [ticketKey, mutateTicket]);

  const handlePullFromJira = useCallback(async () => {
    setPulling(true);
    try {
      const pulls: Promise<void>[] = [
        tickets.pullFromJira(ticketKey)
          .then((data: unknown) => {
            const d = data as Record<string, unknown> | null;
            if (!d) return;
            if (typeof d.description === "string") handleDraftChange(d.description);
            if (typeof d.title === "string" && d.title) handleTitleChange(d.title as string);
          }),
      ];
      if (targetTicketKey) {
        pulls.push(
          tickets.pullFromJira(targetTicketKey)
            .then((data: unknown) => {
              const d = data as Record<string, unknown> | null;
              if (!d) return;
              if (typeof d.description === "string") handleTargetDraftChange(d.description);
              if (typeof d.title === "string" && d.title) handleTargetTitleChange(d.title as string);
            }),
        );
      }
      await Promise.all(pulls);
    } catch {
      // silently ignore; user can retry
    } finally {
      setPulling(false);
    }
  }, [ticketKey, targetTicketKey, handleDraftChange, handleTitleChange, handleTargetDraftChange, handleTargetTitleChange]);

  // "Take Jira version": replace the editor content with the current Jira
  // version and rebase the draft baseline so the outdated warning clears.
  const handleTakeJiraVersion = useCallback(async (slot: "original" | "target" = "original") => {
    try {
      if (slot === "target") {
        if (!targetTicketKey) return;
        const data = await tickets.pullFromJira(targetTicketKey) as Record<string, unknown> | null;
        if (data) {
          if (typeof data.description === "string") handleTargetDraftChange(data.description);
          if (typeof data.title === "string" && data.title) handleTargetTitleChange(data.title);
        }
        // Rebase the target's local-edit baseline onto the latest Jira version.
        await apiFetch(`/api/tickets/${encodeURIComponent(targetTicketKey)}/local-edits`, {
          method: "PATCH",
          body: {},
        }).catch(() => { /* no story version yet; nothing to rebase */ });
      } else {
        const data = await tickets.pullFromJira(ticketKey) as Record<string, unknown> | null;
        if (data) {
          if (typeof data.description === "string") handleDraftChange(data.description);
          if (typeof data.title === "string" && data.title) handleTitleChange(data.title);
        }
        await writer.saveDraft();
        await apiFetch(`/api/tickets/${encodeURIComponent(ticketKey)}/story-writer`, {
          method: "PATCH",
          body: { rebaseBaseline: true },
        });
      }
      await writer.refreshSession();
    } catch (err) {
      console.warn("[story-writer] take Jira version failed", err);
    }
  }, [ticketKey, targetTicketKey, writer, handleDraftChange, handleTitleChange, handleTargetDraftChange, handleTargetTitleChange]);

  // React to the ticket's content changing elsewhere (another tab, Jira webhook,
  // agent sync) while this editor is open. Interpretation A: only an untouched
  // draft follows Jira; once the PO has their own work in the draft we never
  // overwrite it, we just re-evaluate the staleness banner.
  const handleExternalContentChange = useCallback(() => {
    // Mid-stream or mid-push this tab is the source of truth; the stream/push
    // completion path already refreshes, so reacting here would clobber it.
    if (writer.status === "streaming" || pushing) return;
    if (isDraftDirty) {
      void writer.refreshSession();
      mutateTicket();
    } else {
      void handleTakeJiraVersion("original");
    }
  }, [writer, pushing, isDraftDirty, mutateTicket, handleTakeJiraVersion]);

  useTicketEvents(effectiveKey, handleExternalContentChange);

  const handleSplitButtonClick = useCallback(() => {
    if (!targetTicketKey) {
      setShowSplitPicker(true);
    } else if (splitModeVisible) {
      setSplitModeVisible(false);
    } else {
      setSplitModeVisible(true);
    }
  }, [targetTicketKey, splitModeVisible]);

  const handleSplitConfirm = useCallback(async (existingKey?: string, sprintId?: string, title?: string, issueType?: string) => {
    await writer.activateSplit(existingKey, sprintId, title, issueType);
    setShowSplitPicker(false);
    setSplitModeVisible(true);
  }, [writer]);

  const stableOnMutateTicket = useCallback(() => { mutateTicket(); }, [mutateTicket]);

  // Narrow deps to the individual stable callbacks so these handlers don't
  // re-create on every unrelated change to the `writer` object.
  const { createLink: writerCreateLink, acceptDraft: writerAcceptDraft } = writer;

  const stableOnCreateLink = useCallback(async (targetKey: string, relation: string) => {
    await writerCreateLink(targetKey, relation);
    mutateTicket();
  }, [writerCreateLink, mutateTicket]);

  const stableOnApplyEpic = useCallback(async (epicKey: string) => {
    await tickets.updateEpic(ticketKey, epicKey);
    mutateTicket();
  }, [ticketKey, mutateTicket]);

  const stableOnAcceptDraft = useCallback(async (draftId: string) => {
    await writerAcceptDraft(draftId);
    editVersionRef.current += 1;
    setIsDraftDirty(true);
  }, [writerAcceptDraft]);

  const linkedIssueKeys = useMemo(
    () => new Set(
      (ticketData as (typeof ticketData & { linkedIssues?: { key: string }[] }) | undefined)
        ?.linkedIssues?.map((i) => i.key) ?? [],
    ),
    [ticketData],
  );

  const ticketSprintId = (ticketData?.sprintId as string | undefined) ?? null;
  const baseDescription = (ticketData?.description as string | undefined) ?? "";
  const initialEditorOpen = ticketData === undefined
    ? true
    : !!(writer.session?.localDraft?.trim() || (ticketData.description as string | undefined)?.trim());

  // Build Ticket-shaped object from raw ticketData
  const ticketAsTicket = ticketData ? ({
    key: ticketKey,
    title: (ticketData.title as string) ?? "",
    type: (ticketData.type as IssueType) ?? "story",
    description: (ticketData.description as string) ?? "",
    epic: (ticketData.epic as string) ?? null,
    epicKey: (ticketData.epicKey as string) ?? null,
    jiraStatus: (ticketData.jiraStatus as JiraStatus) ?? "TO DO",
    storyPoints: (ticketData.storyPoints as number) ?? null,
    assignee: (ticketData.assignee as Ticket["assignee"]) ?? null,
    flagged: (ticketData.flagged as boolean) ?? false,
    readiness: (ticketData.readiness ?? null) as TicketReadiness | null,
    poStatus: (ticketData.poStatus ?? null) as Ticket["poStatus"],
    qualityScore: (ticketData.qualityScore as number) ?? null,
    editState: ((ticketData.editState as string) ?? "clean") as Ticket["editState"],
    notes: "",
    sprintId: (ticketData.sprintId as string) ?? undefined,
    businessValue: (ticketData.businessValue as number) ?? null,
  } as Ticket) : null;

  const splitButtonLabel = !targetTicketKey
    ? "Split story"
    : splitModeVisible
    ? "Close split"
    : "Open split";

  // Build the full WriterContextValue
  const writerContextValue: WriterContextValue = {
    ticketKey,
    ticketData: ticketAsTicket,
    ticketDetail: ticketData ? (ticketData as unknown as WriterContextValue["ticketDetail"]) : null,
    mutateTicket: stableOnMutateTicket,
    session: writer.session,
    messages: writer.messages,
    aiDrafts: writer.aiDrafts,
    targetAiDrafts: writer.targetAiDrafts,
    relatedCandidates: writer.relatedCandidates,
    status: writer.status,
    streamProgress: writer.streamProgress,
    streamError: writer.streamError,
    usage: writer.usage,
    lastResponseDurationMs: writer.lastResponseDurationMs,
    codebaseResearch: writer.codebaseResearch,
    model: writer.model,
    baseDescription,
    targetTicketKey,
    targetTicketTitle,
    splitModeVisible,
    needsTitle: !draftTitle && !(ticketData?.title) && (!writer.session?.localTitle || writer.session.localTitle === "Untitled draft"),
    outdated: writer.outdated,
    targetOutdated: writer.targetOutdated,
    onTakeJiraVersion: handleTakeJiraVersion,
    onDraftChange: handleDraftChange,
    onTitleChange: handleTitleChange,
    onTargetDraftChange: handleTargetDraftChange,
    onTargetTitleChange: handleTargetTitleChange,
    onSend: writer.sendMessage,
    onRetry: writer.retryMessage,
    onClearFailed: writer.clearFailedMessages,
    onCancel: writer.cancelCurrentTask,
    onCreateLink: stableOnCreateLink,
    linkedIssueKeys,
    onApplyEpic: stableOnApplyEpic,
    currentEpicKey: (ticketData?.epicKey as string) ?? null,
    onLinkCandidate: writer.linkCandidate,
    onAcceptDraft: stableOnAcceptDraft,
    onDismissDraft: writer.dismissDraft,
    onTypeChange: handleTypeChange,
    onCodebaseResearchChange: writer.setCodbaseResearch,
    onModelChange: writer.setModel,
    onAssigneeChange: handleAssigneeChange,
    onSprintChange: handleSprintChange,
    onStoryPointsChange: handleStoryPointsChange,
    onBusinessValueChange: handleBusinessValueChange,
    onLabelsChange: handleLabelsChange,
    onFlagChange: handleFlagChange,
  };

  return {
    // WriterContextValue (for WriterProvider)
    writerContextValue,
    // Ticket data helpers
    ticketAsTicket,
    ticketSprintId,
    baseDescription,
    initialEditorOpen,
    localReadiness,
    // UI state
    pushing,
    pulling,
    pushError,
    isDraftDirty,
    showDeleteConfirm,
    setShowDeleteConfirm,
    showMoreMenu,
    setShowMoreMenu,
    showWrapUpMenu,
    setShowWrapUpMenu,
    wrapUpMenuRef,
    showAddToRefinement,
    setShowAddToRefinement,
    showSplitPicker,
    setShowSplitPicker,
    moreMenuRef,
    splitModeVisible,
    targetTicketKey,
    targetTicketTitle,
    splitButtonLabel,
    // Handlers
    handlePush,
    handleWrapUpReady,
    handleWrapUpReadyClear,
    handleWrapUpClose,
    handleAddToRefinementClose,
    handleDelete,
    handlePullFromJira,
    handleSplitButtonClick,
    handleSplitConfirm,
    handleReadinessChange,
    handleEpicChange,
    handleFlagChange,
    handleJiraStatusChange,
    handleSprintChange,
    handleTypeChange,
  };
}
