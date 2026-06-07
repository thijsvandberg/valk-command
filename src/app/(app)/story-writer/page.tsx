"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen, Plus, ArrowRight, AlertTriangle, Scissors, Clock, Trash2 } from "lucide-react";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import type { JiraStatus, TicketReadiness } from "@/types/ticket";
import { EpicBadge } from "@/components/shared/IssueMetaBadges";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/shared/Card";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineAlert } from "@/components/shared/InlineAlert";
import dynamic from "next/dynamic";
const StoryWriterLauncherModal = dynamic(
  () => import("@/components/shared/StoryWriterLauncherModal").then((m) => ({ default: m.StoryWriterLauncherModal })),
  { ssr: false },
);
import { apiFetch } from "@/lib/api-client";
import { useJiraSprints } from "@/hooks/useSprintBoard";

interface ActiveSession {
  sessionId: string;
  ticketKey: string;
  title: string;
  sprintName: string | null;
  epic: string | null;
  epicKey: string | null;
  issueType: string | null;
  status: string;
  readiness: string | null;
  updatedAt: string | null;
  jiraUpdatedAt: string | null;
  targetTicketKey: string | null;
  targetTitle: string | null;
  removedFromJira: boolean;
}

function formatTimeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function hasJiraChanges(session: ActiveSession): boolean {
  if (!session.jiraUpdatedAt || !session.updatedAt) return false;
  return new Date(session.jiraUpdatedAt).getTime() > new Date(session.updatedAt).getTime();
}

function SessionCard({
  session,
  sprintLabel,
  jiraChanged,
  onResume,
  onDiscard,
}: {
  session: ActiveSession;
  sprintLabel: string | null;
  jiraChanged: boolean;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const isSplit = !!session.targetTicketKey;
  return (
    <div className="group flex flex-col gap-3 rounded-xl border border-border-default bg-surface-elevated p-4 shadow-[var(--shadow-sm)] transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--shadow-md)]">
      {/* Top row: ticket key(s) + badges */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <TicketStatusPill
            ticketKey={session.ticketKey}
            jiraStatus={(session.status as JiraStatus) ?? "TO DO"}
            readiness={(session.readiness as TicketReadiness) ?? undefined}
            issueType={session.issueType ?? undefined}
            title={session.title}
            size="sm"
            removedFromJira={session.removedFromJira}
          />
          {isSplit && (
            <>
              <Scissors size={9} strokeWidth={2} className="shrink-0 text-violet-400/60" />
              <span className="shrink-0 flex items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-caption font-medium text-violet-400/80">
                Split
              </span>
            </>
          )}
        </div>
        {jiraChanged && (
          <span className="shrink-0 flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-caption font-medium text-amber-400/90">
            <AlertTriangle size={10} strokeWidth={2} />
            Jira changed
          </span>
        )}
      </div>

      {/* Title(s) */}
      {isSplit ? (
        <div className="space-y-1">
          <p className="text-body-sm font-semibold leading-snug text-text-primary truncate">
            {session.title}
          </p>
          <p className="text-body-sm leading-snug text-text-tertiary truncate">
            {session.targetTitle ?? session.targetTicketKey}
          </p>
        </div>
      ) : (
        <p className="font-[var(--font-display)] text-body-lg font-semibold leading-snug tracking-[-0.01em] text-text-primary line-clamp-2">
          {session.title}
        </p>
      )}

      {/* Bottom row: metadata + actions */}
      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <div className="flex min-w-0 items-center gap-2 text-label text-text-tertiary">
          {sprintLabel && (
            <span className="shrink-0 truncate">{sprintLabel}</span>
          )}
          {session.epic && <EpicBadge epic={session.epic} />}
          {session.updatedAt && (
            <span className="flex shrink-0 items-center gap-1">
              <Clock size={10} strokeWidth={1.75} className="text-text-muted" />
              {formatTimeAgo(session.updatedAt)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            aria-label="Discard session"
            onClick={onDiscard}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-muted transition-[color,background-color] duration-150 hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
          >
            <Trash2 size={13} strokeWidth={1.75} />
          </button>
          <Button
            variant="soft"
            size="sm"
            icon={<ArrowRight size={11} strokeWidth={2} />}
            onClick={onResume}
          >
            Resume
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function StoryWriterLandingPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLauncher, setShowLauncher] = useState(false);
  const [confirmDiscardId, setConfirmDiscardId] = useState<string | null>(null);

  const { sprints } = useJiraSprints();

  const sprintNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    sprints?.forEach((s) => { map[s.id] = s.name; });
    return map;
  }, [sprints]);

  const fetchSessions = useCallback(() => {
    apiFetch<ActiveSession[]>("/api/story-writer/active-sessions")
      .then((data) => {
        setSessions(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load sessions");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  async function handleDiscard(sessionId: string) {
    await apiFetch(`/api/story-writer/active-sessions?sessionId=${sessionId}`, {
      method: "DELETE",
    });
    fetchSessions();
  }

  function resolveSprintName(sprintId: string | null): string | null {
    if (!sprintId) return null;
    return sprintNameMap[sprintId] ?? null;
  }

  return (
    <div className="flex flex-col h-full">
      <ViewHeader
        icon={<NotebookPen size={15} strokeWidth={1.5} className="text-text-tertiary" />}
      >
        <ViewHeaderTitle>Story Writer</ViewHeaderTitle>
      </ViewHeader>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-5xl">
          {error && <InlineAlert variant="error" className="mb-4">{error}</InlineAlert>}

          <div className="flex items-center justify-between mb-5">
            <span className="text-body-lg text-text-tertiary">
              {loading
                ? "Loading..."
                : `${sessions.length} active session${sessions.length === 1 ? "" : "s"}`}
            </span>
            <Button
              variant="primary"
              size="lg"
              icon={<Plus size={14} strokeWidth={2} />}
              onClick={() => setShowLauncher(true)}
            >
              New story
            </Button>
          </div>

          {!loading && sessions.length === 0 && (
            <Card variant="dashed" className="px-6 py-12">
              <EmptyState
                icon={
                  <NotebookPen
                    size={20}
                    strokeWidth={1.5}
                    className="text-text-tertiary"
                  />
                }
                title="No active sessions"
                description="Start a new story to begin writing."
              />
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sessions.map((session) => (
              <SessionCard
                key={session.sessionId}
                session={session}
                sprintLabel={resolveSprintName(session.sprintName)}
                jiraChanged={hasJiraChanges(session)}
                onResume={() => router.push(`/tickets/${session.ticketKey}/write`)}
                onDiscard={() => setConfirmDiscardId(session.sessionId)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Discard confirmation dialog */}
      <ConfirmDialog
        open={!!confirmDiscardId}
        onClose={() => setConfirmDiscardId(null)}
        title="Discard session?"
        description="This will permanently discard the session. You will not be able to resume it later."
        confirmLabel="Discard"
        confirmClassName="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20"
        onConfirm={() => {
          if (confirmDiscardId) handleDiscard(confirmDiscardId);
        }}
      />

      <StoryWriterLauncherModal
        open={showLauncher}
        onClose={() => { setShowLauncher(false); fetchSessions(); }}
      />
    </div>
  );
}
