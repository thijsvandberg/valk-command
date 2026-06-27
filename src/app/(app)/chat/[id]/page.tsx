"use client";

import { use } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import ChatLayout from "@/components/chat/ChatLayout";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { MessageCircle } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { JIRA_STATUS_COLORS, READINESS_CONFIG } from "@/types/ticket";

function TicketContextSidebar({ ticketKey }: { ticketKey: string }) {
  const { data: ticketData } = useTicketDetail(ticketKey);

  if (!ticketData) return null;

  const jiraColor = JIRA_STATUS_COLORS[ticketData.jiraStatus as keyof typeof JIRA_STATUS_COLORS] ?? JIRA_STATUS_COLORS["TO DO"];
  const readinessCfg = ticketData.readiness ? READINESS_CONFIG[ticketData.readiness] : null;

  const description = ticketData.description ?? "";
  const descSnippet = description
    ? description.slice(0, 200) + (description.length > 200 ? "..." : "")
    : "No description available.";

  return (
    <div className="border-l border-border-default bg-[var(--color-surface-elevated)] p-4 w-72 shrink-0 overflow-y-auto">
      <div className="mb-3 text-label font-semibold uppercase tracking-wider text-text-muted">
        Ticket Context
      </div>

      <div className="space-y-3">
        <div>
          <span className="font-mono text-body-sm text-[var(--color-brand-400)]">{ticketData.key}</span>
          <h3 className="mt-1 font-[var(--font-display)] text-body-lg font-semibold leading-snug text-text-primary">
            {ticketData.title}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="rounded px-2 py-0.5 text-caption font-medium"
            style={{ backgroundColor: jiraColor.bg, color: jiraColor.text }}
          >
            {ticketData.jiraStatus}
          </span>
          {ticketData.readiness && readinessCfg && (
            <span className="flex items-center gap-1.5 text-caption text-text-tertiary">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: readinessCfg.color }} />
              {readinessCfg.label}
            </span>
          )}
        </div>

        <div className="rounded-lg border border-border-default bg-overlay-subtle p-3 text-body-sm leading-body text-text-tertiary">
          {descSnippet}
        </div>

        <div className="rounded-lg border border-dashed border-border-strong bg-overlay-subtle px-3 py-4 text-center">
          <MessageCircle className="mx-auto mb-2 h-5 w-5 text-text-muted" strokeWidth={1.5} />
          <p className="text-body-sm text-text-muted">Chat with agent about this ticket</p>
        </div>
      </div>
    </div>
  );
}

function ChatConversationPageInner({ conversationId }: { conversationId: string }) {
  const searchParams = useSearchParams();
  const ticketParam = searchParams.get("ticket");

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1">
        <ChatLayout conversationId={conversationId} />
      </div>
      {ticketParam && <TicketContextSidebar ticketKey={ticketParam} />}
    </div>
  );
}

export default function ChatConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const pageTitle = usePageTitle("Chat");
  return (
    <>
      {pageTitle}
      <ErrorBoundary>
        <Suspense
          fallback={
            <div className="h-full">
              <ChatLayout conversationId={id} />
            </div>
          }
        >
          <ChatConversationPageInner conversationId={id} />
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
