"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { StoryWriterSessionRow, StoryWriterDraftRow, RelatedStoryCandidateRow } from "@/db/schema";
import type { Message } from "@/types/chat";
import type { StoryWriterStatus } from "@/types/story-writer";
import { useTaskMonitoring, type WorkspaceUsage } from "./useTaskMonitoring";
import { useStoryWriterDrafts } from "./useStoryWriterDrafts";
import { friendlyAgentError } from "@/lib/agent-errors";
import { storyWriter as storyWriterApi, workspaceTasks as workspaceTasksApi, apiFetch, ApiError } from "@/lib/api-client";

export type { WorkspaceUsage } from "./useTaskMonitoring";

export function useStoryWriter(ticketKey: string) {
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

  const apiBase = `/api/tickets/${encodeURIComponent(ticketKey)}/story-writer`;

  const aiDrafts = allDrafts.filter((d) => d.storySlot === "original");
  const targetAiDrafts = allDrafts.filter((d) => d.storySlot === "target");

  const refreshSession = useCallback(async () => {
    try {
      const data = await storyWriterApi.getSession(ticketKey);
      if (!unmountedRef.current) {
        setSession((data as Record<string, unknown>).session as StoryWriterSessionRow | null);
        setMessages((data as Record<string, unknown>).messages as Message[]);
        setAllDrafts(((data as Record<string, unknown>).aiDrafts as StoryWriterDraftRow[] | undefined) ?? []);
        setRelatedCandidates(((data as Record<string, unknown>).relatedCandidates as RelatedStoryCandidateRow[] | undefined) ?? []);
      }
    } catch { /* ignore */ }
  }, [ticketKey, setSession]);

  const startMonitoringRef = useRef<((taskId: string, progressMessage?: string) => void) | null>(null);

  const monitoring = useTaskMonitoring({
    apiBase,
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

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      drafts.clearTimers();
    };
  }, [drafts]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setStatus("loading");
      try {
        const data = await storyWriterApi.getSession(ticketKey) as Record<string, unknown>;

        if (cancelled) return;

        if (data.session) {
          setSession(data.session as StoryWriterSessionRow);
          setMessages(data.messages as Message[]);
          setAllDrafts((data.aiDrafts as StoryWriterDraftRow[] | undefined) ?? []);
          setRelatedCandidates((data.relatedCandidates as RelatedStoryCandidateRow[] | undefined) ?? []);

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
                  const refreshed = await storyWriterApi.getSession(ticketKey) as Record<string, unknown>;
                  if (!cancelled) {
                    setSession(refreshed.session as StoryWriterSessionRow);
                    setMessages(refreshed.messages as Message[]);
                    setAllDrafts((refreshed.aiDrafts as StoryWriterDraftRow[] | undefined) ?? []);
                    setRelatedCandidates((refreshed.relatedCandidates as RelatedStoryCandidateRow[] | undefined) ?? []);
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
        } else {
          try {
            const created = await storyWriterApi.createSession(ticketKey) as Record<string, unknown>;
            if (cancelled) return;
            setSession(created.session as StoryWriterSessionRow);
            setMessages([]);
            setAllDrafts([]);
          } catch (err) {
            if (cancelled) return;
            if (err instanceof ApiError && (err.status === 409 || err.status === 500)) {
              const retryData = await storyWriterApi.getSession(ticketKey) as Record<string, unknown>;
              if (cancelled) return;
              if (retryData.session) {
                setSession(retryData.session as StoryWriterSessionRow);
                setMessages((retryData.messages as Message[] | undefined) ?? []);
                setAllDrafts((retryData.aiDrafts as StoryWriterDraftRow[] | undefined) ?? []);
                setRelatedCandidates((retryData.relatedCandidates as RelatedStoryCandidateRow[] | undefined) ?? []);
              } else {
                throw new Error("Failed to create session");
              }
            } else {
              throw new Error("Failed to create session");
            }
          }
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("idle");
      }
    }

    init();
    return () => { cancelled = true; };
  }, [ticketKey, apiBase, setSession]);

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
      const result = await storyWriterApi.sendMessage(ticketKey, {
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
  }, [session, ticketKey, monitoring]);

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
      const result = await storyWriterApi.sendMessage(ticketKey, {
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
  }, [session, messages, ticketKey, monitoring]);

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

  const saveDraft = useCallback(() => drafts.saveDraft(session), [drafts, session]);
  const pushToJira = useCallback(() => drafts.pushToJira(session), [drafts, session]);

  return {
    session,
    messages,
    aiDrafts,
    targetAiDrafts,
    relatedCandidates,
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
    linkCandidate,
  };
}
