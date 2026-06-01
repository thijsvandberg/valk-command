"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConversations } from "@/hooks/useConversations";
import { useConversationFilters } from "@/hooks/useConversationFilters";
import { useMessages } from "@/hooks/useMessages";
import { useWorkspaceTask } from "@/hooks/useWorkspaceTask";
import { useNotification } from "@/hooks/useNotification";
import { usePageTitle } from "@/hooks/usePageTitle";
import { parseSkillInvocation, parseReviewOutput, mapAgentReviewToResult } from "@/lib/agent-client";
import { extractInvestigationTitle } from "@/lib/investigation-parser";
import type { ConversationType, SprintGoalMetadata } from "@/types/chat";
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
import { MessageCircle, X, PenLine, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import { useSidebarState } from "@/hooks/useSidebarState";
import { deriveCategory, CATEGORY_CONFIG } from "@/lib/conversation-category";
import { Button } from "@/components/ui/Button";
import { ViewHeader, ViewHeaderTitle, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { EditableConversationTitle } from "./EditableConversationTitle";
import { useMultiselect } from "@/hooks/useMultiselect";
import BulkActionBar from "./BulkActionBar";

const RUNNING_TASK_POLL_INTERVAL_MS = 10_000;

interface ChatLayoutProps {
  conversationId?: string;
}

export default function ChatLayout({ conversationId }: ChatLayoutProps) {
  const activeId = conversationId ?? null;
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [codebaseResearch, setCodebaseResearch] = useState(false);
  const sidebar = useSidebarState();
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // When activeId arrives from the router, the pending ID is no longer needed.
  // Derive the effective pending value without a cascading effect.
  const resolvedPendingId = activeId ? null : pendingConversationId;
  const {
    conversations,
    loading: convLoading,
    error: convError,
    createConversation,
    deleteConversation,
    markAsRead,
    markAsUnread,
    bulkAction,
    refresh: refreshConversations,
  } = useConversations();

  const {
    activeFilters,
    toggleFilter,
    clearFilters,
    categoryCounts,
    filteredConversations,
  } = useConversationFilters(conversations);

  // Pass activeId so the hook can reconnect to any running task when the user
  // navigates to this conversation (handles navigation-away scenarios)
  const workspaceTask = useWorkspaceTask(activeId ?? undefined);

  const {
    messages,
    loading: msgLoading,
    error: msgError,
    sendMessage,
    refresh: refreshMessages,
  } = useMessages(activeId, {
    hasRunningTask: workspaceTask.status === "streaming" || workspaceTask.status === "submitting",
  });
  const { notify } = useNotification();
  const activeConv = conversations.find((c) => c.id === activeId) ?? null;
  const isInvestigation = activeConv?.type === "investigation";
  const isSprintGoal = activeConv?.title?.startsWith("Sprint Goal:") ?? false;
  const pageTitle = usePageTitle(activeConv ? `Chat - ${activeConv.title}` : "Chat");

  // Toast for inline feedback (sprint goal actions etc.)
  const { toast, toastLoading, showToast, dismissToast } = useToast();

  // Investigation-specific config (Tech/Explain toggle, Jira key)
  const investigationConfigRef = useRef<InvestigationConfig>({ explainMode: false });
  const handleInvestigationConfigChange = useCallback((config: InvestigationConfig) => {
    investigationConfigRef.current = config;
  }, []);

  // Mark conversation as read when navigating directly (URL change)
  useEffect(() => {
    if (activeId) {
      markAsRead(activeId);
    }
  }, [activeId, markAsRead]);

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
      setPendingConversationId(conversation.id);
      router.push(`/chat/${conversation.id}`);
      setSidebarOpen(false);
    }
  }, [createConversation, router]);

  const handleSelect = useCallback((id: string) => {
    router.push(`/chat/${id}`);
    setSidebarOpen(false);
    markAsRead(id);
  }, [router, markAsRead]);

  const handleDelete = useCallback(
    async (id: string) => {
      const success = await deleteConversation(id);
      if (success && activeId === id) {
        router.push("/chat");
      }
    },
    [deleteConversation, activeId, router]
  );

  const handleTogglePin = useCallback(
    async (id: string, pinned: boolean) => {
      try {
        await apiFetch(`/api/conversations/${id}`, {
          method: "PATCH",
          body: { pinned },
        });
        refreshConversations();
      } catch (err) {
        if (err instanceof Error && err.message.includes("Maximum 10")) {
          showToast("Maximum 10 pinned conversations reached");
        }
      }
    },
    [refreshConversations, showToast]
  );

  const handleToggleRead = useCallback(
    (id: string, isUnread: boolean) => {
      if (isUnread) {
        markAsRead(id);
      } else {
        markAsUnread(id);
      }
    },
    [markAsRead, markAsUnread]
  );

  // Multiselect
  const multiselect = useMultiselect();

  const handleActivateMultiselect = useCallback(() => {
    if (multiselect.active) {
      multiselect.deactivate();
    } else {
      multiselect.activate();
    }
  }, [multiselect]);

  const handleBulkDelete = useCallback(() => {
    const ids = [...multiselect.selectedIds];
    bulkAction(ids, "delete");
    multiselect.deactivate();
    if (activeId && ids.includes(activeId)) {
      router.push("/chat");
    }
  }, [multiselect, bulkAction, activeId, router]);

  const handleBulkMarkRead = useCallback(() => {
    bulkAction([...multiselect.selectedIds], "markRead");
    multiselect.deactivate();
  }, [multiselect, bulkAction]);

  const handleBulkMarkUnread = useCallback(() => {
    bulkAction([...multiselect.selectedIds], "markUnread");
    multiselect.deactivate();
  }, [multiselect, bulkAction]);

  const handleBulkSelectAll = useCallback(() => {
    multiselect.selectAll(filteredConversations.map((c) => c.id));
  }, [multiselect, filteredConversations]);

  // Resize drag handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startWidth: sidebar.width };

    function onMouseMove(ev: MouseEvent) {
      if (!resizeRef.current) return;
      const delta = ev.clientX - resizeRef.current.startX;
      sidebar.setWidth(resizeRef.current.startWidth + delta);
    }
    function onMouseUp() {
      resizeRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [sidebar]);

  const handleSend = useCallback(
    async (content: string): Promise<boolean> => {
      if (!activeId) return false;

      // Save user message locally first
      const saved = await sendMessage(content);
      if (!saved) return false;

      // For sprint-goal conversations, send follow-up with feedback context
      if (isSprintGoal && !content.trim().startsWith("/")) {
        let meta: SprintGoalMetadata | null = null;
        try {
          if (activeConv?.metadata) meta = JSON.parse(activeConv.metadata) as SprintGoalMetadata;
        } catch { /* ignore */ }

        if (meta) {
          // Find the last assistant response to include as context
          const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
          const args: Record<string, string> = {
            sprintId: meta.sprintId,
            sprintName: meta.sprintName,
            ticketKeys: JSON.stringify(meta.ticketKeys),
            feedback: content.trim(),
          };
          if (lastAssistantMsg) {
            args.previousSuggestion = lastAssistantMsg.content;
          }
          lastInvocationRef.current = { skill: "suggest-sprint-goal", args: content.trim() };
          workspaceTask.reset();
          await workspaceTask.submitAndStream("suggest-sprint-goal", args, activeId);
          return true;
        }
      }

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
        return true;
      }

      // Plain text in a regular chat conversation: forward to workspace.
      // The codebase-research flag is encoded as an args prefix for the agent;
      // the user-facing message (saved separately) stays clean.
      const hasAssistantMessage = messages.some((m) => m.role === "assistant");
      if (hasAssistantMessage) {
        // Follow-up: resume existing workspace session. The server applies the
        // codebase prefix so the persisted message is not polluted.
        try {
          workspaceTask.reset();
          const res = await apiFetch<{ id: string }>(`/api/conversations/${activeId}/chat-messages`, {
            method: "POST",
            body: { content: content.trim(), model, codebaseResearch },
          });
          lastInvocationRef.current = { skill: "chat", args: content.trim() };
          workspaceTask.streamExistingTask(res.id, "chat");
        } catch (err) {
          workspaceTask.reset();
          console.warn("[chat] follow-up failed", err);
        }
      } else {
        // First message: start new chat skill task
        lastInvocationRef.current = { skill: "chat", args: content.trim() };
        workspaceTask.reset();
        const argsText = codebaseResearch
          ? `[codebase-research: on]\n\n${content.trim()}`
          : content.trim();
        await workspaceTask.submitAndStream("chat", { args: argsText }, activeId, { model });
      }

      // Update generic conversation title
      if (activeConv?.title === "New conversation") {
        const short = content.trim().length > 50 ? content.trim().slice(0, 47) + "..." : content.trim();
        apiFetch(`/api/conversations/${activeId}`, {
          method: "PATCH",
          body: { title: `Chat: ${short}` },
        }).then(() => refreshConversations()).catch((err) => console.warn("[chat] set title failed", err));
      }

      return true;
    },
    [activeId, sendMessage, workspaceTask, isInvestigation, isSprintGoal, activeConv, messages, refreshConversations, model, codebaseResearch]
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

    // Re-mark as read since server set readAt=null when saving the assistant message
    if (activeId) markAsRead(activeId);

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
  }, [workspaceTask.status, workspaceTask.taskId, workspaceTask.output, activeId, refreshMessages, notify, isInvestigation, activeConv?.title, refreshConversations, markAsRead]);

  // Use pending ID to avoid flash when route hasn't settled yet
  const effectiveActiveId = activeId ?? resolvedPendingId;
  const effectiveConv = activeConv ?? (resolvedPendingId ? conversations.find((c) => c.id === resolvedPendingId) ?? null : null);

  const activeCategory = (effectiveConv ? deriveCategory(effectiveConv) : "chat") as ReturnType<typeof deriveCategory>;
  const activeCategoryConfig = CATEGORY_CONFIG[activeCategory];
  const HeaderIcon = activeCategoryConfig.icon;
  const headerIcon = <HeaderIcon size={15} strokeWidth={1.5} style={{ color: activeCategoryConfig.color }} />;

  return (
    <>
      {pageTitle}
      <div className="relative flex flex-col h-full overflow-hidden">

      <ViewHeader
        icon={headerIcon}
        className="z-10"
      >
        {effectiveConv ? (
          <EditableConversationTitle
            conversationId={effectiveConv.id}
            title={effectiveConv.title}
            onTitleSaved={refreshConversations}
          />
        ) : (
          <ViewHeaderTitle>Chat</ViewHeaderTitle>
        )}
        {effectiveConv && (
          <>
            <ViewHeaderDivider />
            <span className="text-body-lg text-text-tertiary">
              {messages.length} messages
            </span>
          </>
        )}
        {(workspaceTask.status === "streaming" || workspaceTask.status === "submitting") && (
          <>
            <ViewHeaderDivider />
            <span className="flex items-center gap-1.5 text-body-sm text-text-tertiary">
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
          className={`fixed top-0 right-0 z-40 h-full border-l border-border-default bg-[var(--color-surface-elevated)] transition-[transform,width] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] lg:relative lg:z-auto lg:order-first lg:border-l-0 lg:border-r lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ width: sidebarOpen ? 288 : sidebar.effectiveWidth }}
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
            conversations={filteredConversations}
            activeId={effectiveActiveId}
            loading={convLoading}
            error={convError}
            collapsed={sidebar.collapsed}
            onToggleCollapsed={sidebar.toggleCollapsed}
            runningTaskConversationIds={runningTaskConversationIds}
            categoryCounts={categoryCounts}
            activeFilters={activeFilters}
            onToggleFilter={toggleFilter}
            onClearFilters={clearFilters}
            hasActiveFilters={activeFilters.size > 0}
            filtersVisible={filtersVisible}
            onToggleFiltersVisible={() => setFiltersVisible((v) => !v)}
            onSelect={handleSelect}
            onCreate={handleCreate}
            onDelete={handleDelete}
            onTogglePin={handleTogglePin}
            onToggleRead={handleToggleRead}
            multiselectActive={multiselect.active}
            selectedIds={multiselect.selectedIds}
            onToggleSelect={multiselect.toggle}
            onActivateMultiselect={handleActivateMultiselect}
            onBulkMarkRead={handleBulkMarkRead}
            onBulkMarkUnread={handleBulkMarkUnread}
            onBulkDelete={handleBulkDelete}
            onBulkSelectAll={handleBulkSelectAll}
            onBulkDeselectAll={multiselect.deselectAll}
            onExitMultiselect={multiselect.deactivate}
          />

          {/* Resize handle (desktop only) */}
          <div
            className="hidden lg:block absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[var(--color-brand-400)]/20 active:bg-[var(--color-brand-400)]/30 transition-colors duration-150"
            onMouseDown={handleResizeStart}
            onDoubleClick={sidebar.resetWidth}
            aria-label="Resize sidebar"
            role="separator"
          />
        </aside>

        {/* Main chat area */}
        <div className="flex flex-1 flex-col min-w-0">
        <WorkspaceStatus />
        {/* Story Writer link when conversation is linked to a ticket */}
        {effectiveConv?.relatedTicket && (
          <div className="border-b border-border-default px-6 py-2">
            <Link
              href={`/tickets/${effectiveConv.relatedTicket}/write`}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06] px-3 py-1.5 text-body-sm font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/[0.10] active:scale-[0.98] transition-colors duration-150"
            >
              <PenLine size={13} strokeWidth={1.5} />
              Open Story Writer for {effectiveConv.relatedTicket}
            </Link>
          </div>
        )}
        {effectiveActiveId ? (
          <>
            <MessageList messages={messages} loading={msgLoading} error={msgError} conversation={activeConv} showToast={showToast} />
            {workspaceTask.status !== "idle" && workspaceTask.status !== "completed" && (
              <TaskProgress
                skill={workspaceTask.skill}
                status={workspaceTask.status}
                progressText={workspaceTask.progressText}
                toolCalls={workspaceTask.toolCalls}
                error={workspaceTask.error}
                onCancel={(workspaceTask.status === "submitting" || workspaceTask.status === "streaming") ? () => workspaceTask.cancelTask() : undefined}
              />
            )}
            {isInvestigation ? (
              <InvestigationInput
                onSend={handleSend}
                onConfigChange={handleInvestigationConfigChange}
                disabled={workspaceTask.status === "submitting" || workspaceTask.status === "streaming"}
                onCancel={(workspaceTask.status === "submitting" || workspaceTask.status === "streaming") ? () => workspaceTask.cancelTask() : undefined}
              />
            ) : (
              <MessageInput
                onSend={handleSend}
                disabled={workspaceTask.status === "submitting" || workspaceTask.status === "streaming"}
                onCancel={(workspaceTask.status === "submitting" || workspaceTask.status === "streaming") ? () => workspaceTask.cancelTask() : undefined}
                model={model}
                onModelChange={setModel}
                codebaseResearch={codebaseResearch}
                onCodebaseResearchChange={setCodebaseResearch}
              />
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center">
            <p className="font-[var(--font-body)] text-body-lg text-text-tertiary">
              Select a conversation or start a new one.
            </p>
          </div>
        )}
        </div>
      </div>

      {/* Toast */}
      <Toast toast={toast} loading={toastLoading} onDismiss={dismissToast} />
    </div>
    </>
  );
}
