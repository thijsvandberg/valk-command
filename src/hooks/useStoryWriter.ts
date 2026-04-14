"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { StoryWriterSessionRow, StoryWriterDraftRow, RelatedStoryCandidateRow } from "@/db/schema";
import type { Message } from "@/types/chat";
import type { StoryWriterStatus } from "@/types/story-writer";
import { useTaskMonitoring, type WorkspaceUsage } from "./useTaskMonitoring";
import { useStoryWriterDrafts } from "./useStoryWriterDrafts";
import { friendlyAgentError } from "@/lib/agent-errors";

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
      const res = await fetch(apiBase);
      if (res.ok) {
        const data = await res.json();
        if (!unmountedRef.current) {
          setSession(data.session);
          setMessages(data.messages);
          setAllDrafts(data.aiDrafts ?? []);
          setRelatedCandidates(data.relatedCandidates ?? []);
        }
      }
    } catch { /* ignore */ }
  }, [apiBase, setSession]);

  const startMonitoringRef = useRef<((taskId: string, progressMessage?: string) => void) | null>(null);

  const monitoring = useTaskMonitoring({
    apiBase,
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
        const res = await fetch(apiBase);
        if (!res.ok) throw new Error("Failed to load session");
        const data = await res.json();

        if (cancelled) return;

        if (data.session) {
          setSession(data.session);
          setMessages(data.messages);
          setAllDrafts(data.aiDrafts ?? []);
          setRelatedCandidates(data.relatedCandidates ?? []);

          const loadedMsgs: Message[] = data.messages ?? [];
          const lastUserMsg = [...loadedMsgs].reverse().find((m: Message) => m.role === "user");
          const hasFollowingAssistant = lastUserMsg
            ? loadedMsgs.some((m: Message) => m.role === "assistant" && m.timestamp > lastUserMsg.timestamp)
            : true;
          if (lastUserMsg?.workspaceTaskId && !hasFollowingAssistant && !cancelled) {
            // Check if the task already completed while we were away
            try {
              const taskRes = await fetch(`/api/workspace-tasks/${lastUserMsg.workspaceTaskId}`);
              if (cancelled) return;
              if (taskRes.ok) {
                const task = await taskRes.json();
                if (task.status === "completed" && task.output) {
                  // Apply the completed result directly
                  setStatus("streaming");
                  setStreamProgress("Applying result...");
                  const applyRes = await fetch(`${apiBase}/apply-draft`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ output: task.output, taskId: lastUserMsg.workspaceTaskId, assistantContent: task.output }),
                  });
                  if (cancelled) return;
                  if (!applyRes.ok) {
                    setStreamError("Could not apply completed result. Use retry to try again.");
                    setStatus("ready");
                    setStreamProgress("");
                    return;
                  }
                  const refreshRes = await fetch(apiBase);
                  if (refreshRes.ok) {
                    const refreshed = await refreshRes.json();
                    if (!cancelled) {
                      setSession(refreshed.session);
                      setMessages(refreshed.messages);
                      setAllDrafts(refreshed.aiDrafts ?? []);
                      setRelatedCandidates(refreshed.relatedCandidates ?? []);
                    }
                  }
                  if (!cancelled) {
                    setStatus("ready");
                    setStreamProgress("");
                  }
                  return;
                } else if (task.status === "failed") {
                  setStreamError(task.error ?? "Task failed on workspace");
                  setStatus("ready");
                  return;
                }
                // Still running: fall through to startMonitoring below
              } else if (taskRes.status === 404) {
                setStatus("ready");
                return;
              }
            } catch { /* fall through to monitoring */ }
            if (cancelled) return;
            startMonitoringRef.current?.(lastUserMsg.workspaceTaskId, "Resuming...");
          } else {
            setStatus("ready");
          }
        } else {
          const createRes = await fetch(apiBase, { method: "POST" });
          if (cancelled) return;

          if (createRes.status === 409 || createRes.status === 500) {
            const retryRes = await fetch(apiBase);
            if (!retryRes.ok) throw new Error("Failed to load session");
            const retryData = await retryRes.json();
            if (cancelled) return;
            if (retryData.session) {
              setSession(retryData.session);
              setMessages(retryData.messages ?? []);
              setAllDrafts(retryData.aiDrafts ?? []);
              setRelatedCandidates(retryData.relatedCandidates ?? []);
            } else {
              throw new Error("Failed to create session");
            }
          } else if (!createRes.ok) {
            throw new Error("Failed to create session");
          } else {
            const created = await createRes.json();
            if (cancelled) return;
            setSession(created.session);
            setMessages([]);
            setAllDrafts([]);
          }
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("idle");
      }
    }

    init();
    return () => { cancelled = true; };
  }, [apiBase, setSession]);

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
      const res = await fetch(`${apiBase}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          codebaseResearch: codebaseResearchRef.current,
          model: modelRef.current,
          ...(skill ? { skill } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (res.status === 409 && body?.code === "DUPLICATE") {
          // Remove optimistic message, show dedup warning
          setMessages((prev) => prev.filter((m) => m.id !== tempMsg.id));
          setStreamError("Duplicate message blocked");
          setStatus("ready");
          return false;
        }
        // Mark message as failed in local state
        setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? { ...m, status: "failed" as const } : m));
        setStreamError(friendlyAgentError(body, "Failed to send message"));
        setStatus("ready");
        return false;
      }

      const { messageId, taskId } = await res.json();
      // Replace temp message with server-confirmed message
      setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? { ...m, id: messageId, status: "sent" as const, workspaceTaskId: taskId } : m));
      monitoring.startMonitoring(taskId);
      return true;
    } catch {
      setMessages((prev) => prev.map((m) => m.id === tempMsg.id ? { ...m, status: "failed" as const } : m));
      setStreamError("Failed to send message");
      setStatus("ready");
      return false;
    }
  }, [session, apiBase, monitoring]);

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
      const res = await fetch(`${apiBase}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: failedMsg.content,
          retryMessageId: messageId,
          codebaseResearch: codebaseResearchRef.current,
          model: modelRef.current,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, status: "failed" as const } : m));
        setStreamError(friendlyAgentError(body, "Failed to send message"));
        setStatus("ready");
        return false;
      }

      const { taskId } = await res.json();
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, status: "sent" as const, workspaceTaskId: taskId } : m));
      monitoring.startMonitoring(taskId);
      return true;
    } catch {
      setMessages((prev) => prev.map((m) => m.id === messageId ? { ...m, status: "failed" as const } : m));
      setStreamError("Failed to send message");
      setStatus("ready");
      return false;
    }
  }, [session, messages, apiBase, monitoring]);

  const clearFailedMessages = useCallback(async () => {
    try {
      await fetch(`${apiBase}/messages?failed=true`, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => m.status !== "failed" && m.status !== "pending"));
    } catch { /* ignore */ }
  }, [apiBase]);

  const activateSplit = useCallback(async (targetKey?: string, sprintId?: string): Promise<{ targetTicketKey: string }> => {
    const res = await fetch(`${apiBase}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(targetKey ? { targetKey } : {}), ...(sprintId ? { sprintId } : {}) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Failed to activate split mode");
    }
    const data = await res.json();
    if (data.session && !unmountedRef.current) {
      setSession(data.session);
    }
    void refreshSession();
    return { targetTicketKey: data.targetTicketKey };
  }, [apiBase, refreshSession, setSession]);

  const deactivateSplit = useCallback(async () => {
    try {
      await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearSplit: true }),
      });
      await refreshSession();
    } catch { /* ignore */ }
  }, [apiBase, refreshSession]);

  const linkCandidate = useCallback(async (candidateId: string, isLinked: boolean) => {
    try {
      const res = await fetch(`${apiBase}/apply-related`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, isLinked }),
      });
      if (res.ok) {
        const { candidate } = await res.json();
        if (!unmountedRef.current && candidate) {
          setRelatedCandidates((prev) =>
            prev.map((c) => (c.id === candidateId ? candidate : c)),
          );
        }
      }
    } catch { /* ignore */ }
  }, [apiBase]);

  const deleteSession = useCallback(async (deleteConversation = false) => {
    const url = deleteConversation ? `${apiBase}?deleteConversation=true` : apiBase;
    await fetch(url, { method: "DELETE" });
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
