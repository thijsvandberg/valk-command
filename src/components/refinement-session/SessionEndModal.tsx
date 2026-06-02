"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useRefinementSession } from "@/contexts/RefinementSessionContext";
import { useTickets } from "@/hooks/useSprintBoard";
import { refinementSessions as refinementSessionsApi } from "@/lib/api-client";
import type { RefinementSessionTicketNoteResponse } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { tickets, apiFetch } from "@/lib/api-client";
import type { JiraStatus, TicketReadiness, IssueType } from "@/types/ticket";
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  MessageSquarePlus,
  X,
} from "lucide-react";

const NOTE_SAVE_DELAY = 600;

export function SessionEndModal() {
  const router = useRouter();
  const {
    queue,
    queueMeta,
    savedSessionId,
    closeEndModal,
    saveSession,
    finishSession,
  } = useRefinementSession();

  const { data: allTickets } = useTickets("__all__");

  // General comment state
  const [generalComment, setGeneralComment] = useState("");
  const [commentLoaded, setCommentLoaded] = useState(false);

  // Per-ticket notes
  const [ticketNotes, setTicketNotes] = useState<Record<string, string>>({});
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const noteTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Load session data and existing notes
  useEffect(() => {
    if (!savedSessionId || commentLoaded) return;
    let cancelled = false;

    async function load() {
      try {
        const [session, notes] = await Promise.all([
          refinementSessionsApi.get(savedSessionId!),
          refinementSessionsApi.ticketNotes(savedSessionId!),
        ]);
        if (cancelled) return;
        setGeneralComment(session.generalComment ?? "");
        const noteMap: Record<string, string> = {};
        const expanded = new Set<string>();
        for (const n of notes as RefinementSessionTicketNoteResponse[]) {
          noteMap[n.ticketKey] = n.content;
          expanded.add(n.ticketKey);
        }
        setTicketNotes(noteMap);
        setExpandedNotes(expanded);
        setCommentLoaded(true);
      } catch {
        if (!cancelled) setCommentLoaded(true);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [savedSessionId, commentLoaded]);

  // Debounce-save a ticket note (also persists to the ticket's PO Note field)
  const saveTicketNote = useCallback((ticketKey: string, content: string) => {
    if (!savedSessionId) return;
    if (noteTimerRef.current[ticketKey]) clearTimeout(noteTimerRef.current[ticketKey]);
    noteTimerRef.current[ticketKey] = setTimeout(() => {
      refinementSessionsApi.upsertTicketNote(savedSessionId, { ticketKey, content }).catch(() => {});
      tickets.updateMetadata(ticketKey, { poNotes: content }).catch(() => {});
    }, NOTE_SAVE_DELAY);
  }, [savedSessionId]);

  const handleNoteChange = useCallback((ticketKey: string, value: string) => {
    setTicketNotes((prev) => ({ ...prev, [ticketKey]: value }));
    saveTicketNote(ticketKey, value);
  }, [saveTicketNote]);

  // Mirror of the latest note content so the flush below can read it from a
  // closure without re-creating the callback on every keystroke.
  const ticketNotesRef = useRef(ticketNotes);
  useEffect(() => { ticketNotesRef.current = ticketNotes; }, [ticketNotes]);

  // Seed existing ticket PO notes that have no session-scoped note yet (e.g.
  // notes added via the in-session Notes panel, which only writes poNotes) so
  // they are visible and editable here. Runs once after both sources load.
  const seededPoNotesRef = useRef(false);
  useEffect(() => {
    if (seededPoNotesRef.current || !commentLoaded || !allTickets) return;
    seededPoNotesRef.current = true;
    const additions: Record<string, string> = {};
    for (const key of queue) {
      if (ticketNotesRef.current[key]) continue;
      const existing = allTickets.find((t) => t.key === key)?.notes;
      if (existing && existing.trim()) additions[key] = existing;
    }
    const seededKeys = Object.keys(additions);
    if (seededKeys.length === 0) return;
    setTicketNotes((prev) => ({ ...prev, ...additions }));
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      seededKeys.forEach((k) => next.add(k));
      return next;
    });
  }, [commentLoaded, allTickets, queue]);

  // Notes auto-save on a debounce; saving/completing the session can navigate
  // away before that timer fires. Flush any pending note saves first so a note
  // typed right before Save/Complete is never lost.
  const flushPendingNotes = useCallback(async () => {
    if (!savedSessionId) return;
    const timers = noteTimerRef.current;
    const pendingKeys = Object.keys(timers);
    if (pendingKeys.length === 0) return;
    const saves: Promise<unknown>[] = [];
    for (const key of pendingKeys) {
      clearTimeout(timers[key]);
      delete timers[key];
      const content = ticketNotesRef.current[key] ?? "";
      saves.push(refinementSessionsApi.upsertTicketNote(savedSessionId, { ticketKey: key, content }).catch(() => {}));
      saves.push(tickets.updateMetadata(key, { poNotes: content }).catch(() => {}));
    }
    await Promise.all(saves);
  }, [savedSessionId]);

  const toggleNoteExpand = useCallback((ticketKey: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(ticketKey)) {
        next.delete(ticketKey);
      } else {
        next.add(ticketKey);
      }
      return next;
    });
  }, []);

  // Persist general comment on blur
  const handleCommentBlur = useCallback(() => {
    if (!savedSessionId) return;
    refinementSessionsApi
      .update(savedSessionId, { generalComment: generalComment || null })
      .catch(() => {});
  }, [savedSessionId, generalComment]);

  // Smart primary button logic
  const allEstimated = useMemo(() => {
    if (!allTickets || allTickets.length === 0) return false;
    return queue.every((key) => {
      const ticket = allTickets.find((t) => t.key === key);
      if (!ticket) return true;
      if (ticket.type === "spike") return true;
      return ticket.storyPoints != null && ticket.storyPoints > 0;
    });
  }, [queue, allTickets]);

  // Resolve ticket info for each queue item
  const ticketRows = useMemo(() => {
    return queue.map((key) => {
      const meta = queueMeta.find((m) => m.key === key);
      const ticket = allTickets?.find((t) => t.key === key);
      return {
        key,
        title: meta?.title ?? ticket?.title ?? key,
        type: (ticket?.type ?? "task") as string,
        jiraStatus: (ticket?.jiraStatus ?? "TO DO") as JiraStatus,
        readiness: (ticket?.readiness ?? null) as TicketReadiness | null,
        storyPoints: ticket?.storyPoints ?? null,
        isSpike: ticket?.type === "spike",
      };
    });
  }, [queue, queueMeta, allTickets]);

  const handleSave = useCallback(async () => {
    await flushPendingNotes();
    saveSession(generalComment || null);
    router.push(savedSessionId ? `/refinement/${savedSessionId}` : "/refinement");
  }, [flushPendingNotes, saveSession, generalComment, router, savedSessionId]);

  const handleFinish = useCallback(async () => {
    await flushPendingNotes();

    // Spikes are never estimated, so they miss the "points added -> ready for
    // development" transition. On completion, promote spikes that were prepped
    // (Ready to Refine) straight to Ready for Development (readiness = null).
    const spikesToPromote = ticketRows.filter(
      (t) => t.isSpike && t.readiness === "ready_to_refine",
    );
    await Promise.all(
      spikesToPromote.map((t) =>
        tickets.updateMetadata(t.key, { readiness: null }).catch(() => {}),
      ),
    );

    finishSession(generalComment || null);
    // Completed sessions leave the overview; navigate without a guid so we
    // don't land back on the just-finished refinement.
    router.push("/refinement");
  }, [flushPendingNotes, ticketRows, finishSession, generalComment, router]);

  const handleGoBack = useCallback(() => {
    closeEndModal();
  }, [closeEndModal]);

  // Handlers for inline status changes via the pill
  const handleJiraStatusChange = useCallback(async (key: string, status: JiraStatus) => {
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}/status`, { method: "PUT", body: { status } });
    } catch { /* optimistic UI not needed here, allTickets will revalidate */ }
  }, []);

  const handleReadinessChange = useCallback(async (key: string, readiness: TicketReadiness | null) => {
    try {
      await tickets.updateMetadata(key, { readiness });
    } catch { /* silent */ }
  }, []);

  const handleIssueTypeChange = useCallback(async (key: string, type: IssueType) => {
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}`, { method: "PATCH", body: { type } });
    } catch { /* silent */ }
  }, []);

  const unestimatedCount = ticketRows.filter(
    (t) => !t.isSpike && (t.storyPoints == null || t.storyPoints === 0),
  ).length;

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto py-12 px-4">
      <div
        className="w-full max-w-2xl rounded-2xl border border-border-default bg-[var(--color-surface-elevated)] shadow-[0_8px_40px_rgba(0,0,0,0.25),0_2px_12px_color-mix(in_srgb,var(--color-brand-500)_8%,transparent)]"
        style={{ animation: "fadeInUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-brand-600)]/10">
              <CheckCircle2 size={18} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
            </div>
            <div>
              <h2 className="font-[var(--font-display)] text-heading font-bold tracking-tight text-text-primary">
                Wrap Up Session
              </h2>
              <p className="text-body-sm text-text-muted">
                {queue.length} ticket{queue.length !== 1 ? "s" : ""} refined
                {unestimatedCount > 0 && (
                  <span className="ml-1.5 text-amber-400/80">
                    ({unestimatedCount} unestimated)
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleGoBack}
            className="flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-text-muted hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
            title="Go back to session"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Ticket list */}
        <div className="px-6 py-4">
          <p className="mb-3 text-caption font-medium uppercase tracking-wider text-text-muted">
            Tickets
          </p>
          <div className="space-y-1">
            {ticketRows.map((row) => {
              const noteExpanded = expandedNotes.has(row.key);
              const noteContent = ticketNotes[row.key] ?? "";

              return (
                <div key={row.key}>
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-overlay-subtle" style={{ transition: "background-color 0.12s ease" }}>
                    <TicketStatusPill
                      ticketKey={row.key}
                      jiraStatus={row.jiraStatus}
                      readiness={row.readiness}
                      issueType={row.type}
                      title={row.title}
                      variant="list"
                      onJiraStatusChange={(s) => handleJiraStatusChange(row.key, s)}
                      onReadinessChange={(r) => handleReadinessChange(row.key, r)}
                      onIssueTypeChange={(t) => handleIssueTypeChange(row.key, t)}
                    />
                    <span className="min-w-0 flex-1 truncate text-body-lg text-text-secondary">
                      {row.title}
                    </span>
                    {row.storyPoints != null && row.storyPoints > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-overlay-subtle px-1.5 font-mono text-[10px] font-semibold tabular-nums text-text-muted">
                        {row.storyPoints}
                      </span>
                    )}
                    {!row.isSpike && (row.storyPoints == null || row.storyPoints === 0) && (
                      <span className="flex h-5 items-center rounded-md bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-400/80">
                        No estimate
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleNoteExpand(row.key)}
                      className={`flex cursor-pointer items-center justify-center rounded-md p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                        noteExpanded || noteContent
                          ? "text-[var(--color-brand-400)]"
                          : "text-text-muted hover:text-text-secondary"
                      }`}
                      style={{ transition: "color 0.15s ease" }}
                      title="Add PO message"
                    >
                      <MessageSquarePlus size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                  {noteExpanded && (
                    <div className="ml-10 mr-3 mb-1">
                      <textarea
                        value={noteContent}
                        onChange={(e) => handleNoteChange(row.key, e.target.value)}
                        placeholder="PO message for this ticket..."
                        rows={2}
                        className="w-full resize-none rounded-lg border border-border-strong bg-overlay-subtle px-3 py-2 text-body-sm text-text-secondary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none"
                        style={{ transition: "border-color 0.15s ease" }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* General comment */}
        <div className="border-t border-border-subtle px-6 py-4">
          <p className="mb-2 text-caption font-medium uppercase tracking-wider text-text-muted">
            General Comment
          </p>
          <textarea
            value={generalComment}
            onChange={(e) => setGeneralComment(e.target.value)}
            onBlur={handleCommentBlur}
            placeholder="Session notes, decisions, follow-ups..."
            rows={3}
            className="w-full resize-none rounded-lg border border-border-strong bg-overlay-subtle px-3 py-2.5 text-body-lg text-text-secondary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none"
            style={{ transition: "border-color 0.15s ease" }}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-border-subtle px-6 py-4">
          <Button
            variant="ghost"
            size="lg"
            icon={<ArrowLeft size={14} strokeWidth={2} />}
            onClick={handleGoBack}
            className="mr-auto"
          >
            Back to Session
          </Button>
          <Button
            variant="secondary"
            size="lg"
            icon={<Save size={14} strokeWidth={2} />}
            onClick={handleSave}
          >
            Save
          </Button>
          <Button
            variant="primary"
            size="lg"
            icon={<CheckCircle2 size={14} strokeWidth={2} />}
            onClick={handleFinish}
          >
            Complete
          </Button>
        </div>
      </div>
    </div>
  );
}
