"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { StoryWriterSessionRow, StoryWriterDraftRow } from "@/db/schema";
import type { Message } from "@/types/chat";
import type { StoryWriterStatus } from "@/types/story-writer";

export interface WorkspaceUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

interface UseStoryWriterReturn {
  session: StoryWriterSessionRow | null;
  messages: Message[];
  aiDrafts: StoryWriterDraftRow[];
  targetAiDrafts: StoryWriterDraftRow[];
  status: StoryWriterStatus;
  streamProgress: string;
  streamError: string | null;
  usage: WorkspaceUsage | null;
  codebaseResearch: boolean;
  setCodbaseResearch: (v: boolean) => void;
  model: string;
  setModel: (m: string) => void;
  sendMessage: (content: string) => Promise<boolean>;
  updateLocalDraft: (content: string) => void;
  updateTargetLocalDraft: (content: string) => void;
  acceptDraft: (draftId: string) => Promise<void>;
  dismissDraft: (draftId: string) => Promise<void>;
  activateSplit: (targetKey?: string, sprintId?: string) => Promise<{ targetTicketKey: string }>;
  deactivateSplit: () => Promise<void>;
  saveDraft: () => Promise<void>;
  pushToJira: () => Promise<{ success: boolean; conflict?: boolean; contentChanged?: boolean }>;
  deleteSession: (deleteConversation?: boolean) => Promise<void>;
  refreshSession: () => Promise<void>;
}

export function useStoryWriter(ticketKey: string): UseStoryWriterReturn {
  const [session, setSession] = useState<StoryWriterSessionRow | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [allDrafts, setAllDrafts] = useState<StoryWriterDraftRow[]>([]);
  const [status, setStatus] = useState<StoryWriterStatus>("loading");
  const [streamProgress, setStreamProgress] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [codebaseResearch, setCodbaseResearch] = useState(false);
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [usage, setUsage] = useState<WorkspaceUsage | null>(null);

  const codebaseResearchRef = useRef(codebaseResearch);
  codebaseResearchRef.current = codebaseResearch;
  const modelRef = useRef(model);
  modelRef.current = model;

  const eventSourceRef = useRef<EventSource | null>(null);
  const unmountedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apiBase = `/api/tickets/${encodeURIComponent(ticketKey)}/story-writer`;

  // Derived draft lists split by slot
  const aiDrafts = allDrafts.filter((d) => d.storySlot === "original");
  const targetAiDrafts = allDrafts.filter((d) => d.storySlot === "target");

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      eventSourceRef.current?.close();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (targetSaveTimerRef.current) clearTimeout(targetSaveTimerRef.current);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

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
          setStatus("ready");
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
  }, [apiBase]);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch(apiBase);
      if (res.ok) {
        const data = await res.json();
        if (!unmountedRef.current) {
          setSession(data.session);
          setMessages(data.messages);
          setAllDrafts(data.aiDrafts ?? []);
        }
      }
    } catch { /* ignore */ }
  }, [apiBase]);

  const sendMessage = useCallback(async (content: string): Promise<boolean> => {
    if (!session) return false;

    setStatus("sending");
    setStreamError(null);
    setStreamProgress("");

    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    const tempMsg: Message = {
      id: `temp-${Date.now()}`,
      conversationId: session.conversationId,
      role: "user",
      content,
      timestamp: new Date().toISOString(),
      workspaceTaskId: null,
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
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStreamError(body.error ?? "Failed to send message");
        setStatus("ready");
        return false;
      }

      const { taskId, streamUrl } = await res.json();

      setStatus("streaming");
      setStreamProgress("Starting...");

      const resultHandled = { current: false };

      const applyResult = async (output: string) => {
        if (resultHandled.current || unmountedRef.current) return;
        resultHandled.current = true;

        eventSourceRef.current?.close();
        eventSourceRef.current = null;
        if (pollTimerRef.current) {
          clearTimeout(pollTimerRef.current);
          pollTimerRef.current = null;
        }

        let applied = false;
        for (let attempt = 0; attempt < 2 && !applied; attempt++) {
          try {
            const applyRes = await fetch(`${apiBase}/apply-draft`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                output,
                taskId,
                assistantContent: output,
              }),
            });
            applied = applyRes.ok;
          } catch { /* retry */ }
        }

        if (!applied && !unmountedRef.current) {
          setStreamError("Draft received but could not be saved");
        }

        await refreshSession();
        if (!unmountedRef.current) {
          setStatus("ready");
          setStreamProgress("");
        }
      };

      const POLL_DELAY_MS = 5_000;
      const POLL_INTERVAL_MS = 3_000;
      const MAX_POLL_MS = 90_000;
      const pollStart = Date.now();

      const pollTask = async () => {
        if (resultHandled.current || unmountedRef.current) return;
        if (Date.now() - pollStart > MAX_POLL_MS) {
          if (!resultHandled.current && !unmountedRef.current) {
            setStreamError("Request timed out");
            setStatus("ready");
            setStreamProgress("");
          }
          return;
        }

        try {
          const pollRes = await fetch(`/api/workspace-tasks/${taskId}`);
          if (!pollRes.ok) {
            pollTimerRef.current = setTimeout(pollTask, POLL_INTERVAL_MS);
            return;
          }
          const task = await pollRes.json();
          if (task.status === "completed" && task.output) {
            const inputTokens = task.inputTokens ?? task.usage?.inputTokens;
            const outputTokens = task.outputTokens ?? task.usage?.outputTokens;
            const cost = task.cost ?? task.usage?.cost;
            if (inputTokens !== undefined && outputTokens !== undefined && !unmountedRef.current) {
              setUsage({ inputTokens, outputTokens, cost: cost ?? 0 });
            }
            await applyResult(task.output);
          } else if (task.status === "failed") {
            if (!resultHandled.current && !unmountedRef.current) {
              resultHandled.current = true;
              setStreamError(task.error ?? "Task failed on workspace");
              setStatus("ready");
              setStreamProgress("");
            }
          } else {
            pollTimerRef.current = setTimeout(pollTask, POLL_INTERVAL_MS);
          }
        } catch {
          pollTimerRef.current = setTimeout(pollTask, POLL_INTERVAL_MS);
        }
      };

      pollTimerRef.current = setTimeout(pollTask, POLL_DELAY_MS);

      eventSourceRef.current?.close();
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.addEventListener("progress", (e) => {
        const data = JSON.parse(e.data) as { message: string };
        if (!unmountedRef.current) setStreamProgress(data.message);
      });

      es.addEventListener("tool_call", (e) => {
        const data = JSON.parse(e.data) as { tool: string };
        const name = data.tool.replace(/^mcp__jira__/, "").replace(/^mcp__/, "").replace(/_/g, " ");
        if (!unmountedRef.current) setStreamProgress(`Using ${name}...`);
      });

      es.addEventListener("result", async (e) => {
        const data = JSON.parse(e.data) as {
          output: string;
          inputTokens?: number;
          outputTokens?: number;
          cost?: number;
          usage?: { inputTokens?: number; outputTokens?: number; cost?: number };
        };
        const inputTokens = data.inputTokens ?? data.usage?.inputTokens;
        const outputTokens = data.outputTokens ?? data.usage?.outputTokens;
        const cost = data.cost ?? data.usage?.cost;
        if (inputTokens !== undefined && outputTokens !== undefined && !unmountedRef.current) {
          setUsage({ inputTokens, outputTokens, cost: cost ?? 0 });
        }
        await applyResult(data.output);
      });

      es.addEventListener("error", (e) => {
        es.close();
        eventSourceRef.current = null;
        if (e instanceof MessageEvent) {
          try {
            const data = JSON.parse(e.data) as { message: string };
            if (!resultHandled.current && !unmountedRef.current) {
              setStreamError(data.message);
            }
          } catch { /* not structured, polling will handle it */ }
        } else if (!resultHandled.current) {
          // SSE connection dropped - trigger poll immediately instead of waiting
          if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
          pollTimerRef.current = setTimeout(pollTask, 1_000);
        }
      });

      es.addEventListener("done", () => {
        es.close();
        eventSourceRef.current = null;
      });

      return true;
    } catch {
      setStreamError("Failed to send message");
      setStatus("ready");
      return false;
    }
  }, [session, apiBase, refreshSession]);

  const updateLocalDraft = useCallback((content: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (!content && prev.localDraft) return prev;
      if (content === prev.localDraft) return prev;
      return { ...prev, localDraft: content };
    });

    if (!content) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        // Save to session (for story writer state)
        await fetch(apiBase, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ localDraft: content }),
        });
        // Also auto-save as draft to ticketLocalEdit (unified draft system)
        await fetch(`/api/tickets/${encodeURIComponent(ticketKey)}/local-edits`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ field: "description", localValue: content, isDraft: true }),
        });
      } catch { /* ignore */ }
    }, 500);
  }, [apiBase, ticketKey]);

  const updateTargetLocalDraft = useCallback((content: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      if (content === prev.targetLocalDraft) return prev;
      return { ...prev, targetLocalDraft: content };
    });

    if (targetSaveTimerRef.current) clearTimeout(targetSaveTimerRef.current);
    targetSaveTimerRef.current = setTimeout(async () => {
      try {
        await fetch(apiBase, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetLocalDraft: content }),
        });
      } catch { /* ignore */ }
    }, 500);
  }, [apiBase]);

  const acceptDraft = useCallback(async (draftId: string) => {
    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptDraftId: draftId }),
      });
      if (res.ok) {
        const { session: updated } = await res.json();
        if (!unmountedRef.current) setSession(updated);
        // Sync accepted AI draft to ticketLocalEdit as a draft
        if (updated?.localDraft) {
          await fetch(`/api/tickets/${encodeURIComponent(ticketKey)}/local-edits`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ field: "description", localValue: updated.localDraft, isDraft: true }),
          });
        }
      }
    } catch { /* ignore */ }
  }, [apiBase, ticketKey]);

  const dismissDraft = useCallback(async (draftId: string) => {
    try {
      await fetch(`${apiBase}/apply-draft?draftId=${draftId}`, { method: "DELETE" });
      if (!unmountedRef.current) {
        setAllDrafts((prev) => prev.filter((d) => d.id !== draftId));
      }
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
    await refreshSession();
    return { targetTicketKey: data.targetTicketKey };
  }, [apiBase, refreshSession]);

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

  const saveDraft = useCallback(async () => {
    if (!session?.localDraft) return;
    // Save as a non-draft local edit (isDraft=false is the default when omitted)
    await fetch(`/api/tickets/${encodeURIComponent(ticketKey)}/local-edits`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field: "description", localValue: session.localDraft }),
    });
  }, [session, ticketKey]);

  const pushToJira = useCallback(async () => {
    if (!session?.localDraft) return { success: false };

    await saveDraft();

    const pushRes = await fetch(`/api/tickets/${encodeURIComponent(ticketKey)}/push-to-jira`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await pushRes.json();

    if (data.success) {
      await refreshSession();
    }

    return data;
  }, [session, ticketKey, saveDraft, refreshSession]);

  const deleteSession = useCallback(async (deleteConversation = false) => {
    const url = deleteConversation ? `${apiBase}?deleteConversation=true` : apiBase;
    await fetch(url, { method: "DELETE" });
    if (!unmountedRef.current) {
      setSession(null);
      setMessages([]);
      setAllDrafts([]);
      setStatus("idle");
    }
  }, [apiBase]);

  return {
    session,
    messages,
    aiDrafts,
    targetAiDrafts,
    status,
    streamProgress,
    streamError,
    usage,
    codebaseResearch,
    setCodbaseResearch,
    model,
    setModel,
    sendMessage,
    updateLocalDraft,
    updateTargetLocalDraft,
    acceptDraft,
    dismissDraft,
    activateSplit,
    deactivateSplit,
    saveDraft,
    pushToJira,
    deleteSession,
    refreshSession,
  };
}
