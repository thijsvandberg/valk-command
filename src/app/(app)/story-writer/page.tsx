"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen, Plus, ArrowRight, AlertTriangle } from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/shared/Card";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { StoryWriterLauncherModal } from "@/components/shared/StoryWriterLauncherModal";
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
  updatedAt: string | null;
  jiraUpdatedAt: string | null;
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
  return (
    <Card className="group relative flex flex-col justify-between p-4 h-[120px] transition-colors hover:bg-white/[0.04]">
      {/* Top row: ticket key + Jira changed badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <code className="shrink-0 text-[11px] font-mono font-medium text-[var(--color-brand-400)]">
            {session.ticketKey}
          </code>
          {session.issueType && (
            <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/35">
              {session.issueType}
            </span>
          )}
        </div>
        {jiraChanged && (
          <span className="shrink-0 flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400/80">
            <AlertTriangle size={10} strokeWidth={2} />
            Jira changed
          </span>
        )}
      </div>

      {/* Title */}
      <p className="font-[var(--font-display)] text-[13px] font-semibold leading-snug text-white/85 line-clamp-2">
        {session.title}
      </p>

      {/* Bottom row: metadata + actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] text-white/30 min-w-0 truncate">
          {sprintLabel && (
            <span className="truncate">{sprintLabel}</span>
          )}
          {sprintLabel && session.epic && (
            <span className="text-white/15">|</span>
          )}
          {session.epic && (
            <span className="truncate">{session.epic}</span>
          )}
          {(sprintLabel || session.epic) && session.updatedAt && (
            <span className="text-white/15">|</span>
          )}
          {session.updatedAt && (
            <span className="shrink-0">{formatTimeAgo(session.updatedAt)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="destructive"
            size="sm"
            onClick={onDiscard}
          >
            Discard
          </Button>
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
    </Card>
  );
}

export default function StoryWriterLandingPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLauncher, setShowLauncher] = useState(false);
  const [confirmDiscardId, setConfirmDiscardId] = useState<string | null>(null);

  const { data: sprints } = useJiraSprints();

  const sprintNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    sprints?.forEach((s) => { map[s.id] = s.name; });
    return map;
  }, [sprints]);

  const fetchSessions = useCallback(() => {
    fetch("/api/story-writer/active-sessions")
      .then((r) => r.json())
      .then((data: ActiveSession[]) => {
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
    await fetch(`/api/story-writer/active-sessions?sessionId=${sessionId}`, {
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
        icon={<NotebookPen size={15} strokeWidth={1.5} className="text-white/30" />}
      >
        <ViewHeaderTitle>Story Writer</ViewHeaderTitle>
      </ViewHeader>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-3xl">
          {error && <InlineAlert variant="error" className="mb-4">{error}</InlineAlert>}

          <div className="flex items-center justify-between mb-5">
            <span className="text-sm text-white/40">
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
                    className="text-white/30"
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
      {confirmDiscardId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDiscardId(null); }}
        >
          <div className="w-full max-w-sm rounded-xl bg-[var(--color-surface-elevated)] p-6 shadow-2xl border border-white/[0.08]">
            <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/90">
              Discard session?
            </h3>
            <p className="mt-2 text-xs leading-[1.7] text-white/50">
              This will permanently discard the session. You will not be able to resume it later.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="ghost" size="md" onClick={() => setConfirmDiscardId(null)} className="border-0">
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="md"
                onClick={() => { handleDiscard(confirmDiscardId); setConfirmDiscardId(null); }}
                className="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20"
              >
                Discard
              </Button>
            </div>
          </div>
        </div>
      )}

      <StoryWriterLauncherModal
        open={showLauncher}
        onClose={() => { setShowLauncher(false); fetchSessions(); }}
      />
    </div>
  );
}
