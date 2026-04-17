"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { useWorkspaceTask } from "@/hooks/useWorkspaceTask";
import { useNotification } from "@/hooks/useNotification";
import { usePageTitle } from "@/hooks/usePageTitle";
import { parseSkillInvocation, parseReviewOutput, mapAgentReviewToResult } from "@/lib/agent-client";
import { extractInvestigationTitle } from "@/lib/investigation-parser";
import type { ConversationType } from "@/types/chat";
import ConversationList from "./ConversationList";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import InvestigationInput from "./InvestigationInput";
import type { InvestigationConfig } from "./InvestigationInput";
import TaskProgress from "./TaskProgress";
import WorkspaceStatus from "./WorkspaceStatus";
import Link from "next/link";
import { prefetchConversation, cancelAllPrefetches } from "@/lib/prefetch";
import { apiFetch } from "@/lib/api-client";
import { MessageCircle, X, PenLine, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ViewHeader, ViewHeaderTitle, ViewHeaderDivider } from "@/components/shared/ViewHeader";

const RUNNING_TASK_POLL_INTERVAL_MS = 10_000;

interface ChatLayoutProps {
  conversationId?: string;
}

export default function ChatLayout({ conversationId }: ChatLayoutProps) {
  const activeId = conversationId ?? null;
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const {
    conversations,
    loading: convLoading,
    error: convError,
    createConversation,
    deleteConversation,
    refresh: refreshConversations,
  } = useConversations();

  const {
    messages,
    loading: msgLoading,
    error: msgError,
    sendMessage,
    refresh: refreshMessages,
  } = useMessages(activeId);

  // Pass activeId so the hook can reconnect to any running task when the user
  // navigates to this conversation (handles navigation-away scenarios)
  const workspaceTask = useWorkspaceTask(activeId ?? undefined);
  const { notify } = useNotification();
  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const isInvestigation = activeConv?.type === "investigation";
  const pageTitle = usePageTitle(activeConv ? `Chat - ${activeConv.title}` : "Chat");

  // Investigation-specific config (Tech/Explain toggle, Jira key)
  const investigationConfigRef = useRef<InvestigationConfig>({ explainMode: false });
  const handleInvestigationConfigChange = useCallback((config: InvestigationConfig) => {
    investigationConfigRef.current = config;
  }, []);

  // Prefetch most recent conversation when chat list loads
  useEffect(() => {
    if (conversations.length > 0 && !activeId) {
      prefetchConversation(conversations[0].id);
    }
    return () => cancelAllPrefetches();
  }, [conversations, activeId]);

  const handleCreate = useCallback(async (type: ConversationType = "chat") => {
    const title = type === "investigation" ? "New investigation" : "New conversation";
    const conversation = await createConversation(title, type);
    if (conversation) {
      router.push(`/chat/${conversation.id}`);
      setSidebarOpen(false);
    }
  }, [createConversation, router]);

  const handleSelect = useCallback((id: string) => {
    router.push(`/chat/${id}`);
    setSidebarOpen(false);
  }, [router]);

  const handleDelete = useCallback(
    async (id: string) => {
      const success = await deleteConversation(id);
      if (success && activeId === id) {
        router.push("/chat");
      }
    },
    [deleteConversation, activeId, router]
  );

  const handleSend = useCallback(
    async (content: string): Promise<boolean> => {
      if (!activeId) return false;

      // Save user message locally first
      const saved = await sendMessage(content);
      if (!saved) return false;

      // For investigation conversations, auto-wrap as /investigate skill invocation
      if (isInvestigation && !content.trim().startsWith("/")) {
        const config = investigationConfigRef.current;
        const parts: string[] = [];
        if (config.explainMode) parts.push("explain");
        parts.push(content.trim());
        const args = parts.join(" ");

        lastInvocationRef.current = { skill: "investigate", args };
        workspaceTask.reset();
        await workspaceTask.submitAndStream("investigate", { args }, activeId);

        // Auto-detect Jira key from message text and set relatedTicket
        const jiraMatch = content.match(/[A-Z]{2,10}-\d+/);
        if (jiraMatch && activeConv && !activeConv.relatedTicket) {
          apiFetch(`/api/conversations/${activeId}`, {
            method: "PATCH",
            body: { relatedTicket: jiraMatch[0] },
          }).catch((err) => console.warn("[chat] set relatedTicket failed", err));
        }

        return true;
      }

      // Check if this is a skill invocation (regular chat or explicit /command in investigation)
      const invocation = parseSkillInvocation(content);
      if (invocation) {
        lastInvocationRef.current = invocation;
        workspaceTask.reset();
        await workspaceTask.submitAndStream(
          invocation.skill,
          invocation.args ? { args: invocation.args } : {},
          activeId
        );
      }

      return true;
    },
    [activeId, sendMessage, workspaceTask, isInvestigation, activeConv]
  );

  // Track the last skill invocation so we can persist review results from chat
  const lastInvocationRef = useRef<{ skill: string; args: string } | null>(null);

  // Poll for running tasks across all conversations so we can show indicators in the sidebar
  const [runningTaskConversationIds, setRunningTaskConversationIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const rows = await apiFetch<Array<{ conversationId: string | null }>>("/api/workspace-tasks?status=running");
        if (cancelled) return;
        const ids = new Set(rows.map((r) => r.conversationId).filter(Boolean) as string[]);
        setRunningTaskConversationIds(ids);
      } catch {
        // Silently ignore poll errors
      }
    }

    poll();
    const interval = setInterval(poll, RUNNING_TASK_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // When a task completes (either from live stream or from reconnection after navigation),
  // refresh messages so the server-saved assistant message becomes visible.
  // Also send a browser notification and persist review results when /review-story completes.
  const notifiedTaskRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      workspaceTask.status !== "completed" ||
      !workspaceTask.taskId ||
      notifiedTaskRef.current === workspaceTask.taskId
    ) return;

    notifiedTaskRef.current = workspaceTask.taskId;

    // Refresh messages to pick up the assistant message saved by captureTaskStream
    refreshMessages();

    if (workspaceTask.output) {
      const firstLine = workspaceTask.output.split("\n").find((l) => l.trim())?.slice(0, 120) ?? "";
      notify("Chat response ready", {
        body: firstLine,
        tag: "chat-response",
      });
    }

    // Auto-generate investigation title from the result (client best-effort only,
    // server-side handler does not know conversation type)
    if (workspaceTask.output && isInvestigation && activeConv?.title === "New investigation") {
      const title = extractInvestigationTitle(workspaceTask.output);
      if (title) {
        apiFetch(`/api/conversations/${activeId}`, {
          method: "PATCH",
          body: { title },
        })
          .then(() => refreshConversations())
          .catch((err) => console.warn("[chat] set investigation title failed", err));
      }
    }

    // Persist review results from /review-story commands
    const invocation = lastInvocationRef.current;
    if (
      workspaceTask.output &&
      (invocation?.skill === "review-story" || invocation?.skill === "review-story-json") &&
      invocation.args
    ) {
      const ticketKey = invocation.args.trim();
      const agentData = parseReviewOutput(workspaceTask.output);
      if (agentData) {
        const result = mapAgentReviewToResult(agentData);
        apiFetch(`/api/tickets/${encodeURIComponent(ticketKey)}/reviews`, {
          method: "POST",
          body: {
            source: "chat",
            overallScore: result.overallScore,
            dimensions: result.dimensions,
            summary: result.summary,
            suggestions: result.suggestions,
          },
        }).catch((err) => console.warn("[chat] persist review failed", err));
      }
    }
  }, [workspaceTask.status, workspaceTask.taskId, workspaceTask.output, activeId, refreshMessages, notify, isInvestigation, activeConv?.title, refreshConversations]);

  const headerIcon = isInvestigation
    ? <Search size={15} strokeWidth={1.5} className="text-white/30" />
    : <MessageCircle size={15} strokeWidth={1.5} className="text-white/30" />;

  const headerTitle = activeConv
    ? activeConv.title
    : "Chat";

  return (
    <>
      {pageTitle}
      <div className="noise-overlay relative flex flex-col h-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-20%] left-[15%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,var(--color-brand-900)_0%,transparent_70%)] opacity-30" />
        <div className="absolute bottom-[-10%] right-[10%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,var(--color-brand-950)_0%,transparent_70%)] opacity-50" />
      </div>

      <ViewHeader
        icon={headerIcon}
        className="z-10"
      >
        <ViewHeaderTitle>{headerTitle}</ViewHeaderTitle>
        {activeConv && (
          <>
            <ViewHeaderDivider />
            <span className="text-sm text-white/35">
              {messages.length} messages
            </span>
          </>
        )}
        {(workspaceTask.status === "streaming" || workspaceTask.status === "submitting") && (
          <>
            <ViewHeaderDivider />
            <span className="flex items-center gap-1.5 text-xs text-white/40">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)] animate-pulse inline-block" />
              Task running...
            </span>
          </>
        )}
      </ViewHeader>

      {/* Mobile sidebar toggle */}
      <Button
        variant="ghost"
        size="lg"
        iconOnly
        icon={<MessageCircle className="h-5 w-5" strokeWidth={1.5} />}
        onClick={() => setSidebarOpen(true)}
        className="fixed top-4 right-4 z-30 lg:hidden"
        aria-label="Open conversations"
      />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="relative z-10 flex flex-1 overflow-hidden min-h-0">
        {/* Conversation sidebar */}
        <aside
          data-testid="chat-sidebar"
          className={`fixed top-0 right-0 z-40 h-full w-72 border-l border-border-default bg-[var(--color-surface-elevated)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] lg:relative lg:z-auto lg:order-first lg:border-l-0 lg:border-r lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Mobile close button */}
          <Button
            variant="ghost"
            iconOnly
            icon={<X className="h-4 w-4" strokeWidth={1.5} />}
            onClick={() => setSidebarOpen(false)}
            className="absolute top-4 right-4 z-10 lg:hidden"
            aria-label="Close conversations"
          />

          <ConversationList
            conversations={conversations}
            activeId={activeId}
            loading={convLoading}
            error={convError}
            runningTaskConversationIds={runningTaskConversationIds}
            onSelect={handleSelect}
            onCreate={handleCreate}
            onDelete={handleDelete}
          />
        </aside>

        {/* Main chat area */}
        <div className="flex flex-1 flex-col min-w-0">
        <WorkspaceStatus />
        {/* Story Writer link when conversation is linked to a ticket */}
        {activeConv?.relatedTicket && (
          <div className="border-b border-border-default px-6 py-2">
            <Link
              href={`/tickets/${activeConv.relatedTicket}/write`}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06] px-3 py-1.5 text-xs font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/[0.10] active:scale-[0.98] transition-colors duration-150"
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
            {isInvestigation ? (
              <InvestigationInput
                onSend={handleSend}
                onConfigChange={handleInvestigationConfigChange}
                disabled={workspaceTask.status === "submitting" || workspaceTask.status === "streaming"}
              />
            ) : (
              <MessageInput
                onSend={handleSend}
                disabled={workspaceTask.status === "submitting" || workspaceTask.status === "streaming"}
              />
            )}
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
    </div>
    </>
  );
}
