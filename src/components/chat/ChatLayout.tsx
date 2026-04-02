"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { useWorkspaceTask } from "@/hooks/useWorkspaceTask";
import { parseSkillInvocation, parseReviewOutput, mapAgentReviewToResult } from "@/lib/agent-client";
import ConversationList from "./ConversationList";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import TaskProgress from "./TaskProgress";
import WorkspaceStatus from "./WorkspaceStatus";
import Link from "next/link";
import { MessageCircle, X, PenLine } from "lucide-react";

export default function ChatLayout() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {
    conversations,
    loading: convLoading,
    error: convError,
    createConversation,
    deleteConversation,
  } = useConversations();

  const {
    messages,
    loading: msgLoading,
    error: msgError,
    sendMessage,
    refresh: refreshMessages,
  } = useMessages(activeId);

  const workspaceTask = useWorkspaceTask();
  const activeConv = conversations.find((c) => c.id === activeId) ?? null;

  const handleCreate = useCallback(async () => {
    const conversation = await createConversation();
    if (conversation) {
      setActiveId(conversation.id);
      setSidebarOpen(false);
    }
  }, [createConversation]);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      const success = await deleteConversation(id);
      if (success && activeId === id) {
        setActiveId(null);
      }
    },
    [deleteConversation, activeId]
  );

  const handleSend = useCallback(
    async (content: string): Promise<boolean> => {
      if (!activeId) return false;

      // Save user message locally first
      const saved = await sendMessage(content);
      if (!saved) return false;

      // Check if this is a skill invocation
      const invocation = parseSkillInvocation(content);
      if (invocation) {
        lastInvocationRef.current = invocation;
        workspaceTask.reset();
        await workspaceTask.submitAndStream(
          invocation.skill,
          invocation.args ? { args: invocation.args } : {},
          activeId
        );

        // When the task completes, save the result as an assistant message
        // This is handled by an effect watching workspaceTask.output
      }

      return true;
    },
    [activeId, sendMessage, workspaceTask]
  );

  // Track the last skill invocation so we can persist review results from chat
  const lastInvocationRef = useRef<{ skill: string; args: string } | null>(null);

  // Save completed task output as assistant message (once)
  // Also persist review results when /review-story completes
  const savedTaskRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      workspaceTask.status !== "completed" ||
      !workspaceTask.output ||
      !workspaceTask.taskId ||
      !activeId ||
      savedTaskRef.current === workspaceTask.taskId
    ) return;

    savedTaskRef.current = workspaceTask.taskId;

    const displayContent = workspaceTask.output;

    fetch(`/api/conversations/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "assistant",
        content: displayContent,
        workspaceTaskId: workspaceTask.taskId,
      }),
    }).then(() => refreshMessages());

    // Persist review results from /review-story commands
    const invocation = lastInvocationRef.current;
    if ((invocation?.skill === "review-story" || invocation?.skill === "review-story-json") && invocation.args) {
      const ticketKey = invocation.args.trim();
      const agentData = parseReviewOutput(workspaceTask.output);
      if (agentData) {
        const result = mapAgentReviewToResult(agentData);
        fetch(`/api/tickets/${encodeURIComponent(ticketKey)}/reviews`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "chat",
            overallScore: result.overallScore,
            dimensions: result.dimensions,
            summary: result.summary,
            suggestions: result.suggestions,
          }),
        }).catch(() => {});
      }
    }
  }, [workspaceTask.status, workspaceTask.output, workspaceTask.taskId, activeId, refreshMessages]);

  return (
    <div className="noise-overlay relative flex h-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-20%] left-[15%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,var(--color-brand-900)_0%,transparent_70%)] opacity-30" />
        <div className="absolute bottom-[-10%] right-[10%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,var(--color-brand-950)_0%,transparent_70%)] opacity-50" />
      </div>

      {/* Mobile sidebar toggle */}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="fixed top-4 right-4 z-30 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-surface-elevated)] border border-white/[0.06] lg:hidden cursor-pointer hover:bg-[var(--color-surface-floating)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95"
        aria-label="Open conversations"
      >
        <MessageCircle className="h-5 w-5 text-white/70" strokeWidth={1.5} />
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Conversation sidebar */}
      <aside
        data-testid="chat-sidebar"
        className={`fixed top-0 right-0 z-40 h-full w-72 border-l border-white/[0.06] bg-[var(--color-surface-elevated)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] lg:relative lg:z-auto lg:order-first lg:border-l-0 lg:border-r lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Mobile close button */}
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="absolute top-4 right-4 z-10 flex h-7 w-7 items-center justify-center rounded-md lg:hidden cursor-pointer hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-95"
          aria-label="Close conversations"
        >
          <X className="h-4 w-4 text-white/50" strokeWidth={1.5} />
        </button>

        <ConversationList
          conversations={conversations}
          activeId={activeId}
          loading={convLoading}
          error={convError}
          onSelect={handleSelect}
          onCreate={handleCreate}
          onDelete={handleDelete}
        />
      </aside>

      {/* Main chat area */}
      <div className="relative z-10 flex flex-1 flex-col min-w-0">
        <WorkspaceStatus />
        {/* Story Writer link when conversation is linked to a ticket */}
        {activeConv?.relatedTicket && (
          <div className="border-b border-white/[0.06] px-6 py-2">
            <Link
              href={`/tickets/${activeConv.relatedTicket}/write`}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06] px-3 py-1.5 text-xs font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/[0.10] active:scale-[0.98] transition-all duration-150"
            >
              <PenLine size={13} strokeWidth={1.5} />
              Open Story Writer for {activeConv.relatedTicket}
            </Link>
          </div>
        )}
        {activeId ? (
          <>
            <MessageList messages={messages} loading={msgLoading} error={msgError} />
            {workspaceTask.status !== "idle" && workspaceTask.status !== "completed" && (
              <TaskProgress
                skill={workspaceTask.skill}
                status={workspaceTask.status}
                progressText={workspaceTask.progressText}
                toolCalls={workspaceTask.toolCalls}
                error={workspaceTask.error}
              />
            )}
            <MessageInput
              onSend={handleSend}
              disabled={workspaceTask.status === "submitting" || workspaceTask.status === "streaming"}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center">
            <p className="font-[var(--font-body)] text-sm text-white/30">
              Select a conversation or start a new one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
