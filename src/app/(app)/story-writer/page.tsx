"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { NotebookPen, Plus } from "lucide-react";
import dynamic from "next/dynamic";
import type { Ticket } from "@/types/ticket";
import {
  sessionToSessionTicket,
  formatTimeAgo,
  hasJiraChanges,
  type ActiveSession,
  type SessionTicket,
} from "@/types/story-writer";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/shared/Card";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { Toast } from "@/components/ui/Toast";
import { BoardRow } from "@/components/sprint-board/BoardRow";
import type { InlineTagId } from "@/components/sprint-board/filter-bar-types";
import { useTicketActions } from "@/components/sprint-board/useTicketActions";
import { mapJiraSprints } from "@/components/sprint-board/sprint-board-utils";
import { useToast } from "@/hooks/useToast";
import { useJiraSprints } from "@/hooks/useSprintBoard";
import { apiFetch } from "@/lib/api-client";

const StoryWriterLauncherModal = dynamic(
  () => import("@/components/shared/StoryWriterLauncherModal").then((m) => ({ default: m.StoryWriterLauncherModal })),
  { ssr: false },
);

const SESSIONS_API = "/api/story-writer/active-sessions";

// This view owns a cache key distinct from the raw endpoint URL. The same endpoint is
// also consumed by the sidebar's useActiveWriterSessions, which caches the raw
// ActiveSession[] shape (no `key`). Sharing one SWR key let that raw shape leak into this
// view on a soft navigation and crash TicketStatusPill (`key` is undefined), while a hard
// refresh worked because the cache was cold and this view's own fetcher ran. A dedicated
// key keeps the two shapes from colliding. useTicketActions' activeListKey points at this
// same key, so the optimistic globalMutate writes in saveTicketMetadata/saveStoryPoints
// still land on the entry the table reads (BRDG-325).
const SESSIONS_KEY = "story-writer/board-sessions";

// Fetch active sessions and map them to SessionTickets (Ticket + session fields). The
// cache holds the mapped tickets so useTicketActions' optimistic spreads operate on the
// Ticket shape it expects; the session fields ride along and survive every spread.
const fetchSessions = () =>
  apiFetch<ActiveSession[]>(SESSIONS_API).then((data) => data.map(sessionToSessionTicket));

// Inline signals shown on a row here. Story Points and the epic chip stay (read-only,
// see the omitted edit handlers below); Business Value and the assignee are intentionally
// not shown on this view (BRDG-325).
const ROW_TAGS = new Set<InlineTagId>([
  "flag", "refinement", "quality", "notes", "poReadiness", "editState", "storyPoints", "epic",
]);

export default function StoryWriterLandingPage() {
  const router = useRouter();
  const [showLauncher, setShowLauncher] = useState(false);
  const [confirmDiscardSessionId, setConfirmDiscardSessionId] = useState<string | null>(null);
  const [editingTitleKey, setEditingTitleKey] = useState<string | null>(null);

  const { toast, toastLoading, showToast, dismissToast } = useToast();
  const { sprints: rawSprints } = useJiraSprints();
  const sprints = useMemo(() => mapJiraSprints(rawSprints), [rawSprints]);
  const sprintNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    sprints.forEach((s) => { map[s.id] = s.name; });
    return map;
  }, [sprints]);

  const { data: tickets, error, isLoading, mutate } = useSWR<Ticket[]>(SESSIONS_KEY, fetchSessions, {
    revalidateOnFocus: true,
  });

  const sessionTickets = (tickets ?? []) as SessionTicket[];

  const ta = useTicketActions({
    apiTickets: tickets,
    mutateTickets: mutate,
    activeListKey: SESSIONS_KEY,
    showToast,
  });

  // Seed the readiness/PO map from the loaded rows: BoardRow reads the readiness pill
  // segment from this map, not from ticket.readiness directly.
  const { syncFromApiTickets } = ta;
  useEffect(() => {
    if (tickets) syncFromApiTickets(tickets);
  }, [tickets, syncFromApiTickets]);

  const handleDiscard = useCallback(async (sessionId: string) => {
    await apiFetch(`${SESSIONS_API}?sessionId=${sessionId}`, { method: "DELETE" });
    mutate();
  }, [mutate]);

  const sessionCount = sessionTickets.length;

  return (
    <div className="flex flex-col h-full">
      <ViewHeader
        icon={<NotebookPen size={15} strokeWidth={1.5} className="text-text-tertiary" />}
      >
        <ViewHeaderTitle>Story Writer</ViewHeaderTitle>
      </ViewHeader>

      <div className="flex-1 overflow-y-auto px-8 pt-6 pb-20">
        <div className="mx-auto max-w-5xl">
          {error && <InlineAlert variant="error" className="mb-4">Failed to load sessions</InlineAlert>}

          <div className="mb-5 flex items-center justify-end">
            {isLoading && <span className="mr-auto text-body-lg text-text-tertiary">Loading...</span>}
            <Button
              variant="primary"
              size="lg"
              icon={<Plus size={14} strokeWidth={2} />}
              onClick={() => setShowLauncher(true)}
            >
              New story
            </Button>
          </div>

          {!isLoading && sessionCount === 0 && (
            <Card variant="dashed" className="px-6 py-12">
              <EmptyState
                icon={<NotebookPen size={20} strokeWidth={1.5} className="text-text-tertiary" />}
                title="No active sessions"
                description="Start a new story to begin writing."
              />
            </Card>
          )}

          {sessionCount > 0 && (
            // Plain overflow-hidden card (not the board's GROUP_CARD_CLASS, whose
            // overflow-clip-margin lets the heading background bleed past the rounded
            // corner): this list has no drag handle that needs to straddle the edge.
            <div className="overflow-hidden rounded-xl border border-border-subtle bg-[var(--color-surface-elevated)] shadow-[var(--shadow-sm)]">
              {/* Card heading (BRDG-325): "Continue session" with the count as a badge. */}
              <div className="flex items-center gap-2 border-b border-border-subtle bg-[var(--color-surface-chrome)]/30 px-4 py-2.5">
                <h2 className="font-[var(--font-display)] text-body-sm font-semibold tracking-[-0.01em] text-text-secondary">
                  Continue Story Writer session
                </h2>
                <span className="inline-flex items-center rounded-full bg-overlay-subtle px-2 py-0.5 text-[11px] font-medium text-text-tertiary">
                  {sessionCount} session{sessionCount === 1 ? "" : "s"}
                </span>
              </div>
              <table className="w-full table-fixed border-collapse text-body-lg">
                <tbody>
                  {sessionTickets.map((st, idx) => (
                    <BoardRow
                      key={st.sessionId}
                      ticket={st}
                      ticketIdx={idx}
                      isChecked={false}
                      isSelected={false}
                      someChecked={false}
                      isDragActive={false}
                      tags={ROW_TAGS}
                      hideCheckbox
                      selectedTicket={null}
                      onSelectTicket={() => {}}
                      onCheckboxClick={() => {}}
                      showSprint
                      sprintNameMap={sprintNameMap}
                      sprints={sprints}
                      readinessMap={ta.readinessMap}
                      onReadinessChange={ta.handleReadinessChange}
                      onJiraStatusChange={ta.handleJiraStatusChange}
                      onIssueTypeChange={ta.handleIssueTypeChange}
                      onTitleChange={ta.handleTitleChange}
                      onSprintChange={ta.handleSprintChange}
                      editingTitleKey={editingTitleKey}
                      onEditingTitleKeyChange={setEditingTitleKey}
                      onActivate={(key) => router.push(`/tickets/${key}/write`)}
                      onDiscard={() => setConfirmDiscardSessionId(st.sessionId)}
                      sessionTimeAgo={st.sessionUpdatedAt ? formatTimeAgo(st.sessionUpdatedAt) : undefined}
                      sessionJiraChanged={hasJiraChanges({ updatedAt: st.sessionUpdatedAt, jiraUpdatedAt: st.sessionJiraUpdatedAt })}
                      splitTarget={st.targetTicketKey ? (st.targetTitle ?? st.targetTicketKey) : undefined}
                      isLastInCard={idx === sessionCount - 1}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDiscardSessionId}
        onClose={() => setConfirmDiscardSessionId(null)}
        title="Discard session?"
        description="This will permanently discard the session. You will not be able to resume it later."
        confirmLabel="Discard"
        confirmClassName="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20"
        onConfirm={() => {
          if (confirmDiscardSessionId) handleDiscard(confirmDiscardSessionId);
        }}
      />

      <StoryWriterLauncherModal
        open={showLauncher}
        onClose={() => { setShowLauncher(false); mutate(); }}
      />

      <Toast toast={toast} loading={toastLoading} onDismiss={dismissToast} />
    </div>
  );
}
