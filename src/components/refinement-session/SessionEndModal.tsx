"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useRefinementSession } from "@/contexts/RefinementSessionContext";
import { useRefinementSessions } from "@/hooks/useRefinementSessions";
import { useTicketsByKeys } from "@/hooks/useSprintBoard";
import { refinementSessions as refinementSessionsApi } from "@/lib/api-client";
import type { RefinementSessionTicketNoteResponse } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { DateTimePicker, todayLocalDate } from "@/components/shared/DateTimePicker";
import { sessionLabel, compareSessions } from "./refinement-utils";
import { tickets, apiFetch } from "@/lib/api-client";
import { patchTicketCaches } from "@/lib/ticket-cache";
import { reportClientError } from "@/lib/client-error";
import { Toast } from "@/components/ui/Toast";
import { useToast } from "@/hooks/useToast";
import type { JiraStatus, TicketReadiness, IssueType } from "@/types/ticket";
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  MessageSquarePlus,
  Check,
  X,
} from "lucide-react";

const NOTE_SAVE_DELAY = 600;

// Read once on the refinement overview after navigation to surface the
// "Carried N tickets" confirmation; the modal that performs the carry-over
// unmounts on navigation, so a modal-local toast would never be seen.
export const CARRY_OVER_TOAST_KEY = "bridge:refinement-toast";

export function SessionEndModal() {
  const router = useRouter();
  const {
    queue,
    queueMeta,
    currentIndex,
    savedSessionId,
    sessionEstimates,
    sessionSubtaskCounts,
    closeEndModal,
    saveSession,
    finishSession,
  } = useRefinementSession();

  // Resolve only the session's own tickets (BRDG-412), not the whole backlog:
  // every lookup below is keyed by a queue member.
  const allTickets = useTicketsByKeys(queue);
  const { sessions, mutate: mutateSessions } = useRefinementSessions();
  const { toast, showToast, dismissToast } = useToast();

  // A failed note/PO-note write must not vanish silently (BRDG-401): these used
  // to be `.catch(() => {})`, so a dropped save meant the PO's note was lost with
  // no trace. The operation + ticket key (and session id) are folded into the
  // reported context so they land in the [client] log line; never the note text.
  // The toast tells the PO so they can retry instead of assuming it saved.
  const reportNoteSaveFailure = useCallback((operation: string, ticketKey: string, err: unknown) => {
    reportClientError(`refinement ${operation} ${ticketKey} session=${savedSessionId ?? "none"}`, err, { source: "refinement" });
    showToast(`Failed to save note for ${ticketKey}. Please try again.`);
  }, [savedSessionId, showToast]);

  // General comment state
  const [generalComment, setGeneralComment] = useState("");
  const [commentLoaded, setCommentLoaded] = useState(false);

  // Per-ticket notes
  const [ticketNotes, setTicketNotes] = useState<Record<string, string>>({});
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const noteTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Carry-over: which tickets to push into a follow-up session, and where.
  // The whole section stays hidden until there is something to carry: it opens
  // automatically when the session left tickets unhandled, or on demand via the
  // "Carry tickets" link when everything was refined.
  const [carryActive, setCarryActive] = useState(false);
  const [carriedKeys, setCarriedKeys] = useState<Set<string>>(new Set());
  const carrySeededRef = useRef(false);
  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [targetDate, setTargetDate] = useState("");
  const [targetExistingId, setTargetExistingId] = useState<string | null>(null);

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
      refinementSessionsApi.upsertTicketNote(savedSessionId, { ticketKey, content })
        .catch((err) => reportNoteSaveFailure("ticket-note-autosave", ticketKey, err));
      tickets.updateMetadata(ticketKey, { poNotes: content })
        .catch((err) => reportNoteSaveFailure("po-note-autosave", ticketKey, err));
    }, NOTE_SAVE_DELAY);
  }, [savedSessionId, reportNoteSaveFailure]);

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
    if (seededPoNotesRef.current || !commentLoaded || allTickets.length === 0) return;
    seededPoNotesRef.current = true;
    const additions: Record<string, string> = {};
    for (const key of queue) {
      if (ticketNotesRef.current[key]) continue;
      const existing = allTickets.find((t) => t.key === key)?.notes;
      if (existing && existing.trim()) additions[key] = existing;
    }
    const seededKeys = Object.keys(additions);
    if (seededKeys.length === 0) return;
    setTicketNotes((prev) => ({ ...prev, ...additions })); // eslint-disable-line react-hooks/set-state-in-effect -- one-time seed of existing PO notes once both sources have loaded
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
      saves.push(
        refinementSessionsApi.upsertTicketNote(savedSessionId, { ticketKey: key, content })
          .catch((err) => reportNoteSaveFailure("ticket-note-flush", key, err)),
      );
      saves.push(
        tickets.updateMetadata(key, { poNotes: content })
          .catch((err) => reportNoteSaveFailure("po-note-flush", key, err)),
      );
    }
    await Promise.all(saves);
  }, [savedSessionId, reportNoteSaveFailure]);

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
      .catch((err) => {
        // The general comment is PO-authored data; a dropped save must not vanish
        // silently (BRDG-401). Report the operation + session id, never the text.
        reportClientError(`refinement general-comment-save session=${savedSessionId}`, err, { source: "refinement" });
        showToast("Failed to save comment. Please try again.");
      });
  }, [savedSessionId, generalComment, showToast]);

  // Resolve ticket info for each queue item. Story points chosen during the
  // session take precedence over the shared ticket cache: the cache can still
  // hold the pre-session value (or get overwritten by a stale refetch) while
  // the save is in flight, and the wrap-up must show what was just picked.
  const ticketRows = useMemo(() => {
    return queue.map((key, index) => {
      const meta = queueMeta.find((m) => m.key === key);
      const ticket = allTickets?.find((t) => t.key === key);
      const isSpike = ticket?.type === "spike";
      const storyPoints = key in sessionEstimates ? sessionEstimates[key] : ticket?.storyPoints ?? null;
      const readiness = (ticket?.readiness ?? null) as TicketReadiness | null;
      const subtaskCount = key in sessionSubtaskCounts ? sessionSubtaskCounts[key] : ticket?.totalSubtaskCount ?? 0;

      // "Unhandled" = anything the session did not actually finish refining.
      // Spikes are exempt from the estimate/subtask checks (they are never
      // estimated and rarely broken into subtasks), so a reached, ready spike
      // is treated as handled.
      const neverReached = index > currentIndex;
      const noEstimate = !isSpike && (storyPoints == null || storyPoints === 0);
      const noSubtasks = !isSpike && subtaskCount === 0;
      const notReady = readiness === "ready_to_refine";

      return {
        key,
        index,
        title: meta?.title ?? ticket?.title ?? key,
        type: (ticket?.type ?? "task") as string,
        jiraStatus: (ticket?.jiraStatus ?? "TO DO") as JiraStatus,
        readiness,
        storyPoints,
        isSpike,
        subtaskCount,
        isUnhandled: neverReached || noEstimate || noSubtasks || notReady,
      };
    });
  }, [queue, queueMeta, allTickets, sessionEstimates, sessionSubtaskCounts, currentIndex]);

  // Seed the carry-over selection once, after the ticket cache has loaded so
  // the heuristic reads real estimates/subtask counts. Pre-checks every row the
  // session did not finish refining; the PO can override freely from there.
  useEffect(() => {
    if (carrySeededRef.current || allTickets.length === 0) return;
    carrySeededRef.current = true;
    const initial = new Set<string>();
    for (const row of ticketRows) {
      if (row.isUnhandled) initial.add(row.key);
    }
    if (initial.size > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time heuristic seed once the ticket cache has loaded
      setCarriedKeys(initial);
      setCarryActive(true);
    }
  }, [allTickets, ticketRows]);

  // Candidate follow-up sessions: every ready session except this one.
  const targetSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.id !== savedSessionId && s.status !== "completed")
        .slice()
        .sort(compareSessions),
    [sessions, savedSessionId],
  );

  // Effective existing-session target: the explicit pick when still valid,
  // otherwise the top of the list. Derived during render (no effect) so the
  // picker is never in an "existing but nothing chosen" limbo.
  const effectiveTargetId =
    targetExistingId && targetSessions.some((s) => s.id === targetExistingId)
      ? targetExistingId
      : targetSessions[0]?.id ?? null;

  const carriedInQueue = useMemo(
    () => queue.filter((k) => carriedKeys.has(k)),
    [queue, carriedKeys],
  );
  const carriedCount = carriedInQueue.length;

  const toggleCarried = useCallback((key: string) => {
    setCarriedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Push the selected tickets into the target session and strip them from this
  // session. No-op when nothing is selected, so Save/Complete behave exactly as
  // before. Source removal is persist-only: navigation unmounts the session
  // subtree, so mutating the in-memory queue would have no visible effect.
  const applyCarryOver = useCallback(async () => {
    if (!savedSessionId || carriedInQueue.length === 0) return;
    const carried = carriedInQueue;
    const remaining = queue.filter((k) => !carriedKeys.has(k));

    let targetName = "";
    const existingTarget =
      targetMode === "existing" && effectiveTargetId
        ? sessions.find((s) => s.id === effectiveTargetId)
        : undefined;

    if (existingTarget) {
      const newKeys = Array.from(new Set([...existingTarget.ticketKeys, ...carried]));
      await refinementSessionsApi.update(existingTarget.id, { ticketKeys: newKeys });
      targetName = sessionLabel(existingTarget);
    } else {
      const date = targetDate || todayLocalDate();
      const created = await refinementSessionsApi.create({
        name: `Refinement ${date}`,
        scheduledFor: targetDate || undefined,
        ticketKeys: carried,
      });
      targetName = sessionLabel(created);
    }

    await refinementSessionsApi.update(savedSessionId, { ticketKeys: remaining });
    await mutateSessions();

    try {
      sessionStorage.setItem(
        CARRY_OVER_TOAST_KEY,
        `Carried ${carried.length} ticket${carried.length !== 1 ? "s" : ""} to ${targetName}`,
      );
    } catch {
      // sessionStorage can be unavailable (private mode); the carry-over itself
      // already succeeded, so a missing confirmation toast is acceptable.
    }
  }, [
    savedSessionId,
    carriedInQueue,
    queue,
    carriedKeys,
    targetMode,
    effectiveTargetId,
    sessions,
    targetDate,
    mutateSessions,
  ]);

  const handleSave = useCallback(async () => {
    await flushPendingNotes();
    await applyCarryOver();
    saveSession(generalComment || null);
    router.push(savedSessionId ? `/refinement/${savedSessionId}` : "/refinement");
  }, [flushPendingNotes, applyCarryOver, saveSession, generalComment, router, savedSessionId]);

  const handleFinish = useCallback(async () => {
    await flushPendingNotes();
    await applyCarryOver();

    // Spikes are never estimated, so they miss the "points added -> ready for
    // development" transition. On completion, promote spikes that were prepped
    // (Ready to Refine) straight to Ready for Development (readiness = null).
    const spikesToPromote = ticketRows.filter(
      (t) => t.isSpike && t.readiness === "ready_to_refine",
    );
    await Promise.all(
      spikesToPromote.map((t) =>
        tickets.updateMetadata(t.key, { readiness: null }).catch((err) => {
          // A failed readiness promotion is a real data write too (BRDG-401):
          // surface it instead of swallowing, so the spike isn't silently left
          // at the wrong readiness. Key + session in the context, no values.
          reportClientError(`refinement spike-readiness-promote ${t.key} session=${savedSessionId ?? "none"}`, err, { source: "refinement" });
          showToast(`Failed to update readiness for ${t.key}. Please try again.`);
        }),
      ),
    );

    finishSession(generalComment || null);
    // Completed sessions leave the overview; navigate without a guid so we
    // don't land back on the just-finished refinement.
    router.push("/refinement");
  }, [flushPendingNotes, applyCarryOver, ticketRows, finishSession, generalComment, router, savedSessionId, showToast]);

  const handleGoBack = useCallback(() => {
    closeEndModal();
  }, [closeEndModal]);

  // Handlers for inline status changes via the pill. Rows read from the bounded
  // by-keys ticket cache (BRDG-412); each change patches the shared ticket caches
  // optimistically (patchTicketCaches now covers that cache) and rolls back on failure.
  const handleJiraStatusChange = useCallback(async (key: string, status: JiraStatus) => {
    const prev = allTickets?.find((t) => t.key === key);
    patchTicketCaches(key, { jiraStatus: status });
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}/status`, { method: "PUT", body: { status } });
    } catch {
      if (prev) patchTicketCaches(key, { jiraStatus: prev.jiraStatus });
    }
  }, [allTickets]);

  const handleReadinessChange = useCallback(async (key: string, readiness: TicketReadiness | null) => {
    const prev = allTickets?.find((t) => t.key === key);
    patchTicketCaches(key, { readiness });
    try {
      await tickets.updateMetadata(key, { readiness });
    } catch {
      if (prev) patchTicketCaches(key, { readiness: prev.readiness ?? null });
    }
  }, [allTickets]);

  const handleIssueTypeChange = useCallback(async (key: string, type: IssueType) => {
    const prev = allTickets?.find((t) => t.key === key);
    patchTicketCaches(key, { type });
    try {
      await apiFetch(`/api/tickets/${encodeURIComponent(key)}`, { method: "PATCH", body: { type } });
    } catch {
      if (prev) patchTicketCaches(key, { type: prev.type });
    }
  }, [allTickets]);

  const unestimatedCount = ticketRows.filter(
    (t) => !t.isSpike && (t.storyPoints == null || t.storyPoints === 0),
  ).length;

  return (
    <>
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
                    {carryActive && (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={carriedKeys.has(row.key)}
                        aria-label={`Carry ${row.key} to next refinement`}
                        onClick={() => toggleCarried(row.key)}
                        className={`flex h-[18px] w-[18px] flex-none cursor-pointer items-center justify-center rounded-[5px] border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-90 ${
                          carriedKeys.has(row.key)
                            ? "border-[var(--color-brand-500)] bg-[var(--color-brand-500)] text-white shadow-[0_1px_3px_color-mix(in_srgb,var(--color-brand-500)_45%,transparent)]"
                            : "border-border-strong text-transparent hover:border-[var(--color-brand-400)]"
                        }`}
                        style={{ transition: "background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease" }}
                        title="Carry to next refinement"
                      >
                        <Check size={12} strokeWidth={3} />
                      </button>
                    )}
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
                    {row.subtaskCount === 0 && (
                      <span className="flex h-5 items-center gap-1 rounded-md bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-400/80">
                        <IssueTypeIcon type="subtask" size={10} />
                        No subtasks
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

        {/* Carry over to a next refinement */}
        <div className="border-t border-border-subtle px-6 py-4">
          {!carryActive ? (
            <button
              type="button"
              onClick={() => setCarryActive(true)}
              className="cursor-pointer rounded-md text-body-sm font-medium text-text-muted hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              style={{ transition: "color 0.15s ease" }}
            >
              Carry tickets to a next refinement
            </button>
          ) : (
            <>
              <p className="mb-2 text-caption font-medium uppercase tracking-wider text-text-muted">
                Carry over
              </p>
              {carriedCount === 0 ? (
                <p className="text-body-sm text-text-muted">
                  Tick the tickets you did not finish to move them to a next refinement.
                </p>
              ) : (
                <>
                  <p className="text-body-sm text-text-secondary" data-testid="carry-summary">
                    <span className="font-semibold text-[var(--color-brand-400)]">{carriedCount}</span>{" "}
                    ticket{carriedCount !== 1 ? "s" : ""} will move to{" "}
                    {targetMode === "new" ? "a new session" : "the selected session"}.
                  </p>

                  <div className="mt-3 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setTargetMode("new")}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-body-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                    targetMode === "new"
                      ? "bg-[var(--color-brand-600)]/12 text-[var(--color-brand-400)] ring-1 ring-inset ring-[var(--color-brand-500)]/40"
                      : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
                  }`}
                  style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                >
                  New session
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode("existing")}
                  disabled={targetSessions.length === 0}
                  className={`rounded-lg px-3 py-1.5 text-body-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] disabled:cursor-not-allowed disabled:opacity-40 ${
                    targetMode === "existing"
                      ? "bg-[var(--color-brand-600)]/12 text-[var(--color-brand-400)] ring-1 ring-inset ring-[var(--color-brand-500)]/40"
                      : "cursor-pointer text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
                  }`}
                  style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                  title={targetSessions.length === 0 ? "No other open sessions yet" : undefined}
                >
                  Existing session
                </button>
              </div>

              {targetMode === "new" ? (
                <div className="mt-3">
                  <DateTimePicker
                    value={targetDate}
                    onChange={setTargetDate}
                    ariaLabel="Next refinement date"
                    placeholder="Pick a date (optional)"
                    closeOnSelect
                    hideTime
                    minDate={todayLocalDate()}
                  />
                  <p className="mt-1.5 text-[11px] text-text-muted">
                    Named <span className="font-medium text-text-tertiary">Refinement {targetDate || todayLocalDate()}</span>
                  </p>
                </div>
              ) : (
                <select
                  value={effectiveTargetId ?? ""}
                  onChange={(e) => setTargetExistingId(e.target.value)}
                  aria-label="Target refinement session"
                  className="mt-3 w-full cursor-pointer rounded-lg border border-border-strong bg-overlay-subtle px-3 py-2 text-body-sm text-text-secondary focus:border-[var(--color-brand-500)]/40 focus:outline-none"
                  style={{ transition: "border-color 0.15s ease" }}
                >
                  {targetSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {sessionLabel(s)}
                    </option>
                  ))}
                </select>
              )}
                </>
              )}
            </>
          )}
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
    <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
