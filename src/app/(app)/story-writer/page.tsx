"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen, Plus, FileText, ArrowRight } from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/shared/Card";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineAlert } from "@/components/shared/InlineAlert";

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
}

function formatTimeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function CreateForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (title: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    await onSubmit(title.trim());
    setSubmitting(false);
  }

  const fieldClass =
    "w-full rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-[var(--color-brand-500)] focus:bg-white/[0.07]";

  return (
    <Card className="p-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">
          New story
        </h3>
        <div>
          <label className="block text-xs font-medium text-white/50 mb-1">
            Title
          </label>
          <input
            type="text"
            required
            autoFocus
            placeholder="As a user, I want to..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={submitting || !title.trim()}
          >
            {submitting ? "Creating..." : "Create and open"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function StoryWriterLandingPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

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

  async function handleCreate(title: string) {
    setError(null);
    try {
      const res = await fetch("/api/story-writer/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to create story");
        return;
      }
      const { key } = await res.json();
      router.push(`/tickets/${key}/write`);
    } catch {
      setError("Failed to create story");
    }
  }

  async function handleDiscard(sessionId: string) {
    await fetch(`/api/story-writer/active-sessions?sessionId=${sessionId}`, {
      method: "DELETE",
    });
    fetchSessions();
  }

  return (
    <div className="flex flex-col h-full">
      <ViewHeader
        icon={<NotebookPen size={15} strokeWidth={1.5} className="text-white/30" />}
      >
        <ViewHeaderTitle>Story Writer</ViewHeaderTitle>
      </ViewHeader>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl">
          {error && <InlineAlert variant="error" className="mb-4">{error}</InlineAlert>}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/40">
                {loading
                  ? "Loading..."
                  : `${sessions.length} active session${sessions.length === 1 ? "" : "s"}`}
              </span>
              {!showForm && (
                <Button
                  variant="primary"
                  size="lg"
                  icon={<Plus size={14} strokeWidth={2} />}
                  onClick={() => setShowForm(true)}
                >
                  New story
                </Button>
              )}
            </div>

            {showForm && (
              <CreateForm
                onSubmit={handleCreate}
                onCancel={() => setShowForm(false)}
              />
            )}

            {!loading && sessions.length === 0 && !showForm && (
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

            <div className="space-y-2">
              {sessions.map((session) => (
                <Card
                  key={session.sessionId}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.05]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
                    <FileText
                      size={14}
                      strokeWidth={1.5}
                      className="text-white/30"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-[var(--color-brand-400)]">
                        {session.ticketKey}
                      </code>
                      <span className="font-[var(--font-display)] text-sm font-semibold text-white truncate">
                        {session.title}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-white/35">
                      {session.epic && <span>{session.epic}</span>}
                      {session.sprintName && <span>{session.sprintName}</span>}
                      {session.updatedAt && (
                        <span>{formatTimeAgo(session.updatedAt)}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDiscard(session.sessionId)}
                    >
                      Discard
                    </Button>
                    <Button
                      variant="soft"
                      size="sm"
                      icon={<ArrowRight size={12} strokeWidth={2} />}
                      onClick={() =>
                        router.push(`/tickets/${session.ticketKey}/write`)
                      }
                    >
                      Resume
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
