"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { StoryWriterSessionRow, StoryWriterDraftRow, RelatedStoryCandidateRow, EpicChildDraftRow } from "@/db/schema";
import type { Message } from "@/types/chat";
import type { StoryWriterStatus } from "@/types/story-writer";
import { useTaskMonitoring, type WorkspaceUsage } from "./useTaskMonitoring";
import { useStoryWriterDrafts } from "./useStoryWriterDrafts";
import { friendlyAgentError } from "@/lib/agent-errors";
import { storyWriter as storyWriterApi, epicWriter as epicWriterApi, workspaceTasks as workspaceTasksApi, apiFetch, ApiError, tickets } from "@/lib/api-client";
import type { EpicWriterPhase } from "@/types/epic-writer";

export type { WorkspaceUsage } from "./useTaskMonitoring";

export interface UseStoryWriterOptions {
  mode?: "story" | "epic";
}

export function useStoryWriter(ticketKey: string, options?: UseStoryWriterOptions) {
  const mode = options?.mode ?? "story";
  const isEpicMode = mode === "epic";
  const [session, setSessionState] = useState<StoryWriterSessionRow | null>(null);
  const setSession = useCallback((v: StoryWriterSessionRow | null | ((prev: StoryWriterSessionRow | null) => StoryWriterSessionRow | null)) => {
    setSessionState((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      sessionRef.current = next;
      return next;
    });
  }, []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [allDrafts, setAllDrafts] = useState<StoryWriterDraftRow[]>([]);
  const [relatedCandidates, setRelatedCandidates] = useState<RelatedStoryCandidateRow[]>([]);
  const [cards, setCards] = useState<EpicChildDraftRow[]>([]);
  const [outdated, setOutdated] = useState(false);
  const [targetOutdated, setTargetOutdated] = useState(false);
  const [status, setStatus] = useState<StoryWriterStatus>("loading");
  const [streamProgress, setStreamProgress] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [codebaseResearch, setCodbaseResearch] = useState(false);
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [usage, setUsage] = useState<WorkspaceUsage | null>(null);
  const [lastResponseDurationMs, setLastResponseDurationMs] = useState<number | null>(null);

  const codebaseResearchRef = useRef(codebaseResearch);
  codebaseResearchRef.current = codebaseResearch;
  const modelRef = useRef(model);
  modelRef.current = model;
  const unmountedRef = useRef(false);
  const sessionRef = useRef<StoryWriterSessionRow | null>(null);

  // Session/phase/messages use the epic group in epic mode, but draft-apply,
  // save, and push-to-Jira reuse the ticket story-writer routes against the
  // epic key (the epic is the subject ticket). The active session is found by
  // key regardless of mode, so this is the epic-enrichment path (AC8).
  const apiBase = `/api/tickets/${encodeURIComponent(ticketKey)}/story-writer`;
  const sessionApi = isEpicMode ? epicWriterApi : storyWriterApi;
  // Epic breakdown output (<epic-questions>/<epic-breakdown>) is parsed by the
  // epic writer group; the epic's own <story-draft> body still flows via apiBase.
  const applyOutputBase = isEpicMode
    ? `/api/epics/${encodeURIComponent(ticketKey)}/writer`
    : undefined;

  const aiDrafts = allDrafts.filter((d) => d.storySlot === "original");
  const targetAiDrafts = allDrafts.filter((d) => d.storySlot === "target");

  const refreshSession = useCallback(async () => {
    try {
      const data = await sessionApi.getSession(ticketKey);
      if (!unmountedRef.current) {
        setSession((data as Record<string, unknown>).session as StoryWriterSessionRow | null);
        const serverMessages = (data as Record<string, unknown>).messages as Message[];
        // Preserve local cancelled flags that may not yet be persisted to the DB
        setMessages((prev) => {
          const localCancelledIds = new Set(prev.filter((m) => m.cancelled).map((m) => m.id));
          if (localCancelledIds.size === 0) return serverMessages;
          return serverMessages.map((m) =>
            localCancelledIds.has(m.id) ? { ...m, cancelled: true } : m,
          );
        });
        setAllDrafts(((data as Record<string, unknown>).aiDrafts as StoryWriterDraftRow[] | undefined) ?? []);
        setRelatedCandidates(((data as Record<string, unknown>).relatedCandidates as RelatedStoryCandidateRow[] | undefined) ?? []);
        setOutdated(((data as Record<string, unknown>).outdated as boolean | undefined) ?? false);
        setTargetOutdated(((data as Record<string, unknown>).targetOutdated as boolean | undefined) ?? false);
        setCards(((data as Record<string, unknown>).cards as EpicChildDraftRow[] | undefined) ?? []);
      }
    } catch { /* ignore */ }
  }, [ticketKey, setSession, sessionApi]);

  const startMonitoringRef = useRef<((taskId: string, progressMessage?: string) => void) | null>(null);

  const monitoring = useTaskMonitoring({
    apiBase,
    applyOutputBase,
    ticketKey,
    unmountedRef,
    onStatus: setStatus,
    onProgress: setStreamProgress,
    onError: setStreamError,
    onUsage: setUsage,
    onDuration: setLastResponseDurationMs,
    onRelatedCandidates: setRelatedCandidates,
    refreshSession,
  });

  useEffect(() => { startMonitoringRef.current = monitoring.startMonitoring; }, [monitoring.startMonitoring]);

  const drafts = useStoryWriterDrafts({
    apiBase,
    ticketKey,
    sessionRef,
    unmountedRef,
    setSession,
    setAllDrafts,
    refreshSession,
  });

  // Only run cleanup on actual unmount. The hook already self-cleans timers via
  // its own useEffect([], ...) cleanup. Using [drafts] here would fire cleanup
  // on every render (new object reference), killing debounce timers prematurely.
  const clearTimersRef = useRef(drafts.clearTimers);
  clearTimersRef.current = drafts.clearTimers;
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      clearTimersRef.current();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isDraftKey = ticketKey.startsWith("DRAFT-");

    // For draft keys, set status to ready immediately so the editor shell renders
    if (isDraftKey) {
      setStatus("ready");
    }

    async function init() {
      if (!isDraftKey) setStatus("loading");

      // For draft keys, the ticket may not exist yet (background create-draft in progress).
      // Retry the init loop until the ticket is available.
      const maxRetries = isDraftKey ? 20 : 0;
      for (let attempt = 0; ; attempt++) {
        try {
          const data = await sessionApi.getSession(ticketKey) as Record<string, unknown>;

          if (cancelled) return;

          if (data.session) {
            setSession(data.session as StoryWriterSessionRow);
            setMessages(data.messages as Message[]);
            setAllDrafts((data.aiDrafts as StoryWriterDraftRow[] | undefined) ?? []);
            setRelatedCandidates((data.relatedCandidates as RelatedStoryCandidateRow[] | undefined) ?? []);
            setOutdated((data.outdated as boolean | undefined) ?? false);
            setTargetOutdated((data.targetOutdated as boolean | undefined) ?? false);
            setCards((data.cards as EpicChildDraftRow[] | undefined) ?? []);

            const loadedMsgs: Message[] = (data.messages as Message[]) ?? [];
            const lastUserMsg = [...loadedMsgs].reverse().find((m: Message) => m.role === "user");
            const hasFollowingAssistant = lastUserMsg
              ? loadedMsgs.some((m: Message) => m.role === "assistant" && m.timestamp > lastUserMsg.timestamp)
              : true;
            if (lastUserMsg?.workspaceTaskId && !hasFollowingAssistant && !cancelled) {
              // Check if the task already completed while we were away
              try {
                const task = await workspaceTasksApi.get(lastUserMsg.workspaceTaskId) as Record<string, unknown>;
                if (cancelled) return;
                if ((task.status as string) === "completed" && task.output) {
                  // Apply the completed result directly
                  setStatus("streaming");
                  setStreamProgress("Applying result...");
                  try {
                    await storyWriterApi.applyDraft(ticketKey, { output: task.output, taskId: lastUserMsg.workspaceTaskId, assistantContent: task.output });
                  } catch {
                    if (cancelled) return;
                    setStreamError("Could not apply completed result. Use retry to try again.");
                    setStatus("ready");
                    setStreamProgress("");
                    return;
                  }
                  if (cancelled) return;
                  try {
                    const refreshed = await sessionApi.getSession(ticketKey) as Record<string, unknown>;
                    if (!cancelled) {
                      setSession(refreshed.session as StoryWriterSessionRow);
                      setMessages(refreshed.messages as Message[]);
                      setAllDrafts((refreshed.aiDrafts as StoryWriterDraftRow[] | undefined) ?? []);
                      setRelatedCandidates((refreshed.relatedCandidates as RelatedStoryCandidateRow[] | undefined) ?? []);
                      setOutdated((refreshed.outdated as boolean | undefined) ?? false);
                      setTargetOutdated((refreshed.targetOutdated as boolean | undefined) ?? false);
                      setCards((refreshed.cards as EpicChildDraftRow[] | undefined) ?? []);
                    }
                  } catch { /* ignore refresh failure */ }
                  if (!cancelled) {
                    setStatus("ready");
                    setStreamProgress("");
                  }
                  return;
                } else if ((task.status as string) === "failed") {
                  setStreamError((task.error as string) ?? "Task failed on workspace");
                  setStatus("ready");
                  return;
                }
                // Still running: fall through to startMonitoring below
              } catch (err) {
                if (err instanceof ApiError && err.status === 404) {
                  setStatus("ready");
                  return;
                }
                /* fall through to monitoring */
              }
              if (cancelled) return;
              startMonitoringRef.current?.(lastUserMsg.workspaceTaskId, "Resuming...");
            } else {
              setStatus("ready");
            }
            return;
          } else {
            try {
              const created = await sessionApi.createSession(ticketKey) as Record<string, unknown>;
              if (cancelled) return;
              setSession(created.session as StoryWriterSessionRow);
              setMessages([]);
              setAllDrafts([]);
            } catch (err) {
              if (cancelled) return;
              if (err instanceof ApiError && (err.status === 409 || err.status === 500)) {
                const retryData = await sessionApi.getSession(ticketKey) as Record<string, unknown>;
                if (cancelled) return;
                if (retryData.session) {
                  setSession(retryData.session as StoryWriterSessionRow);
                  setMessages((retryData.messages as Message[] | undefined) ?? []);
                  setAllDrafts((retryData.aiDrafts as StoryWriterDraftRow[] | undefined) ?? []);
                  setRelatedCandidates((retryData.relatedCandidates as RelatedStoryCandidateRow[] | undefined) ?? []);
                } else {
                  throw new Error("Failed to create session");
                }
              } else if (isDraftKey && err instanceof ApiError && err.status === 404 && attempt < maxRetries) {
                // Ticket not created yet, retry after delay
                await new Promise((r) => setTimeout(r, 100));
                continue;
              } else {
                throw new Error("Failed to create session");
              }
            }
            setStatus("ready");
            return;
          }
        } catch {
          if (!cancelled) setStatus("idle");
          return;
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [ticketKey, apiBase, setSession, sessionApi]);

  const sendMessage = useCallback(async (content: string, skill?: string): Promise<boolean> => {
    if (!session) return false;

    setStatus("sending");
    setStreamError(null);
    setStreamProgress("");
    setLastResponseDurationMs(null);
    monitoring.sendStartRef.current = Date.now();

    if (monitoring.pollTimerRef.current) {
      clearTimeout(monitoring.pollTimerRef.current);
      monitoring.pollTimerRef.current = null;
    }

    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      conversationId: session.conversationId,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      workspaceTaskId: null,
      status: "pending",
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const result = await sessionApi.sendMessage(ticketKey, {
        content,
        codebaseResearch: codebaseResearchRef.current,
        model: modelRef.current,
        ...(skill ? { skill } : {}),
      }) as { messageId: string; taskId: string };
      // Replace temp message with server-confirmed message
      setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? { ...m, id: result.messageId, status: "sent" as const, workspaceTaskId: result.taskId } : m));
      monitoring.startMonitoring(result.taskId);
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409 && err.code === "DUPLICATE") {
          // Remove optimistic message, show dedup warning
          setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
          setStreamError("Duplicate message blocked");
          setStatus("ready");
          return false;
        }
        // Mark message as failed in local state
        setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? { ...m, status: "failed" as const } : m));
        setStreamError(friendlyAgentError(err.body, "Failed to send message"));
        setStatus("ready");
        return false;
      }
      setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? { ...m, status: "failed" as const } : m));
      setStreamError("Failed to send message");
      setStatus("ready");
      return false;
    }
  }, [session, ticketKey, monitoring, sessionApi]);

  const retryMessage = useCallback(async (messageId: string): Promise<boolean> => {
    if (!session) return false;

    const failedMsg = messages.find((m) => m.id === messageId);
    if (!failedMsg) return false;

    setStatus("sending");
    setStreamError(null);
    setStreamProgress("");
    setLastResponseDurationMs(null);
    monitoring.sendStartRef.current = Date.now();

    // Mark as pending in local state
    setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, status: "pending" as const } : m));

    try {
      const result = await sessionApi.sendMessage(ticketKey, {
        content: failedMsg.content,
        retryMessageId: messageId,
        codebaseResearch: codebaseResearchRef.current,
        model: modelRef.current,
      }) as { taskId: string };

      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, status: "sent" as const, workspaceTaskId: result.taskId } : m));
      monitoring.startMonitoring(result.taskId);
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, status: "failed" as const } : m));
        setStreamError(friendlyAgentError(err.body, "Failed to send message"));
        setStatus("ready");
        return false;
      }
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, status: "failed" as const } : m));
      setStreamError("Failed to send message");
      setStatus("ready");
      return false;
    }
  }, [session, messages, ticketKey, monitoring, sessionApi]);

  const clearFailedMessages = useCallback(async () => {
    try {
      await apiFetch<void>(`${apiBase}/messages?failed=true`, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => m.status !== "failed" && m.status !== "pending"));
    } catch { /* ignore */ }
  }, [apiBase]);

  const activateSplit = useCallback(async (targetKey?: string, sprintId?: string, title?: string, issueType?: string): Promise<{ targetTicketKey: string }> => {
    const data = await storyWriterApi.activateSplit(ticketKey, {
      ...(targetKey ? { targetKey } : {}),
      ...(sprintId ? { sprintId } : {}),
      ...(title ? { title } : {}),
      ...(issueType ? { issueType } : {}),
    }) as { session?: StoryWriterSessionRow; targetTicketKey: string };
    if (data.session && !unmountedRef.current) {
      setSession(data.session);
    }
    void refreshSession();
    return { targetTicketKey: data.targetTicketKey };
  }, [ticketKey, refreshSession, setSession]);

  const deactivateSplit = useCallback(async () => {
    try {
      await storyWriterApi.patchSession(ticketKey, { clearSplit: true });
      await refreshSession();
    } catch { /* ignore */ }
  }, [ticketKey, refreshSession]);

  const createLink = useCallback(async (targetKey: string, relation: string) => {
    await tickets.createLink(ticketKey, { targetKey, relation });
  }, [ticketKey]);

  const linkCandidate = useCallback(async (candidateId: string, isLinked: boolean) => {
    try {
      const result = await storyWriterApi.toggleRelated(ticketKey, { candidateId, isLinked }) as { candidate?: RelatedStoryCandidateRow };
      if (!unmountedRef.current && result.candidate) {
        // Virtual candidates (from ticketLink) are removed when unlinked
        if (candidateId.startsWith("link-") && !isLinked) {
          setRelatedCandidates((prev) => prev.filter((c) => c.id !== candidateId));
        } else {
          setRelatedCandidates((prev) =>
            prev.map((c) => (c.id === candidateId ? result.candidate! : c)),
          );
        }
      }
    } catch { /* ignore */ }
  }, [ticketKey]);

  const deleteSession = useCallback(async (deleteConversation = false) => {
    const url = deleteConversation ? `${apiBase}?deleteConversation=true` : apiBase;
    await apiFetch<void>(url, { method: "DELETE" });
    if (!unmountedRef.current) {
      setSession(null);
      setMessages([]);
      setAllDrafts([]);
      setStatus("idle");
    }
  }, [apiBase, setSession]);

  const cancelCurrentTask = useCallback(async () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user" && m.workspaceTaskId);
    const taskId = lastUserMsg?.workspaceTaskId;

    // Close streams immediately for responsive UI
    if (taskId) {
      monitoring.cancelTask(taskId);
    }

    setStatus("ready");
    setStreamProgress("");
    setStreamError(null);

    if (lastUserMsg) {
      setMessages((prev) => prev.map((m) => {
        if (m.id === lastUserMsg.id) return { ...m, cancelled: true };
        if (m.workspaceTaskId === taskId && m.role === "assistant") return { ...m, cancelled: true };
        return m;
      }));
    }

    // Await the server-side cancel so the DB is updated before any subsequent refresh
    if (taskId) {
      try {
        await workspaceTasksApi.cancel(taskId);
      } catch { /* best-effort */ }
    }
  }, [messages, monitoring]);

  // Epic-mode phase bookmark. Persists the chosen phase, then mirrors it into
  // local session state so the rail reflects the move immediately.
  const setPhase = useCallback(async (phase: EpicWriterPhase) => {
    if (!isEpicMode) return;
    setSession((prev) => (prev ? { ...prev, phase } : prev));
    try {
      await epicWriterApi.setPhase(ticketKey, { phase });
    } catch {
      void refreshSession();
    }
  }, [isEpicMode, ticketKey, setSession, refreshSession]);

  const saveDraft = useCallback(() => drafts.saveDraft(session), [drafts, session]);
  const pushToJira = useCallback(() => drafts.pushToJira(session), [drafts, session]);

  return {
    session,
    messages,
    aiDrafts,
    targetAiDrafts,
    relatedCandidates,
    cards,
    outdated,
    targetOutdated,
    status,
    streamProgress,
    streamError,
    usage,
    lastResponseDurationMs,
    codebaseResearch,
    setCodbaseResearch,
    model,
    setModel,
    sendMessage,
    retryMessage,
    clearFailedMessages,
    cancelCurrentTask,
    updateLocalDraft: drafts.updateLocalDraft,
    updateLocalTitle: drafts.updateLocalTitle,
    updateTargetLocalDraft: drafts.updateTargetLocalDraft,
    updateTargetLocalTitle: drafts.updateTargetLocalTitle,
    acceptDraft: drafts.acceptDraft,
    dismissDraft: drafts.dismissDraft,
    activateSplit,
    deactivateSplit,
    saveDraft,
    pushToJira,
    deleteSession,
    refreshSession,
    createLink,
    linkCandidate,
    setPhase,
  };
}
