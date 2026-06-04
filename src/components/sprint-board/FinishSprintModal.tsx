"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { mutate } from "swr";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";
import { jira, tickets as ticketsApi } from "@/lib/api-client";
import type { Sprint, Ticket, JiraStatus } from "@/types/ticket";
import {
  Flag, X, AlertTriangle, CircleAlert, CircleCheckBig,
  CheckCheck, Loader2, PartyPopper,
} from "lucide-react";
import { TicketStatusPill } from "@/components/shared/TicketStatusPill";
import { buildTicketHoverData } from "@/hooks/useTicketHoverData";

interface SubtaskItem {
  key: string;
  title: string;
  status: string;
}

interface FinishSprintModalProps {
  sprint: Sprint;
  tickets: Ticket[];
  /** True when the sprint's end date has not yet passed (closing early). */
  earlyClose: boolean;
  onClose: () => void;
  /** Closes every open subtask of a DONE story (optimistically zeroes the board count). */
  onCloseAllSubtasks: (key: string) => Promise<void>;
  /** Revalidates the board ticket list (used to reconcile counts after closes). */
  onRefreshTickets: () => void;
  showToast: (message: React.ReactNode, durationMs?: number, opts?: { loading?: boolean }) => void;
  /** Called after the sprint is closed so the parent can refresh board state. */
  onFinished: () => void;
}

const DONE_STATUSES = new Set(["DONE", "DEPRECATED", "Done", "Closed"]);

function isDone(status: string): boolean {
  return DONE_STATUSES.has(status);
}

export function FinishSprintModal({
  sprint,
  tickets,
  earlyClose,
  onClose,
  onCloseAllSubtasks,
  onRefreshTickets,
  showToast,
  onFinished,
}: FinishSprintModalProps) {
  // Blocker A: parent stories that are not yet DONE. Resolved on the board, not here.
  const incompleteStories = useMemo(
    () => tickets.filter((t) => t.jiraStatus !== "DONE" && t.jiraStatus !== "DEPRECATED"),
    [tickets],
  );

  // Blocker B: DONE stories that still carry open subtasks. The set of stories to
  // inspect is captured once so the list stays stable as subtasks get closed.
  const [blockerBKeys] = useState<string[]>(() =>
    tickets
      .filter((t) => (t.jiraStatus === "DONE" || t.jiraStatus === "DEPRECATED") && (t.openSubtaskCount ?? 0) > 0)
      .map((t) => t.key),
  );
  const blockerBStories = useMemo(
    () => blockerBKeys.map((k) => tickets.find((t) => t.key === k)).filter((t): t is Ticket => Boolean(t)),
    [blockerBKeys, tickets],
  );

  // Per-story fetched subtasks + load/error state.
  const [subtasksByStory, setSubtasksByStory] = useState<Record<string, SubtaskItem[]>>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, boolean>>({});
  const [closedSubKeys, setClosedSubKeys] = useState<Set<string>>(new Set());
  const [busyStories, setBusyStories] = useState<Set<string>>(new Set());
  const [busySubtasks, setBusySubtasks] = useState<Set<string>>(new Set());

  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const loadStory = useCallback((key: string) => {
    setLoadErrors((e) => { const n = { ...e }; delete n[key]; return n; });
    ticketsApi
      .getSubtasks(key)
      .then((data) => setSubtasksByStory((m) => ({ ...m, [key]: data })))
      .catch(() => setLoadErrors((e) => ({ ...e, [key]: true })));
  }, []);

  useEffect(() => {
    blockerBKeys.forEach((key) => loadStory(key));
  }, [blockerBKeys, loadStory]);

  const openSubtasksFor = useCallback(
    (key: string): SubtaskItem[] => {
      const all = subtasksByStory[key];
      if (!all) return [];
      return all.filter((s) => !isDone(s.status) && !closedSubKeys.has(s.key));
    },
    [subtasksByStory, closedSubKeys],
  );

  // A Blocker-B story is resolved once its subtasks are loaded and none remain open.
  const storyResolved = useCallback(
    (key: string): boolean => Boolean(subtasksByStory[key]) && openSubtasksFor(key).length === 0,
    [subtasksByStory, openSubtasksFor],
  );

  const totalOpenSubtasks = useMemo(
    () => blockerBKeys.reduce((sum, k) => sum + openSubtasksFor(k).length, 0),
    [blockerBKeys, openSubtasksFor],
  );

  const allLoaded = blockerBKeys.every((k) => Boolean(subtasksByStory[k]));
  const hasLoadError = Object.keys(loadErrors).length > 0;
  const subtasksCleared = blockerBKeys.every((k) => storyResolved(k));

  const blocked = incompleteStories.length > 0 || !subtasksCleared || !allLoaded || hasLoadError;

  const closeOneSubtask = useCallback(async (storyKey: string, subtaskKey: string) => {
    setBusySubtasks((s) => new Set(s).add(subtaskKey));
    try {
      await ticketsApi.closeSubtask(storyKey, subtaskKey);
      setClosedSubKeys((s) => new Set(s).add(subtaskKey));
      onRefreshTickets();
    } catch {
      showToast(`Failed to close ${subtaskKey}`);
    } finally {
      setBusySubtasks((s) => { const n = new Set(s); n.delete(subtaskKey); return n; });
    }
  }, [onRefreshTickets, showToast]);

  const closeAllForStory = useCallback(async (storyKey: string) => {
    setBusyStories((s) => new Set(s).add(storyKey));
    const open = openSubtasksFor(storyKey);
    try {
      await onCloseAllSubtasks(storyKey);
      setClosedSubKeys((s) => { const n = new Set(s); open.forEach((sub) => n.add(sub.key)); return n; });
    } catch {
      showToast(`Failed to close subtasks for ${storyKey}`);
    } finally {
      setBusyStories((s) => { const n = new Set(s); n.delete(storyKey); return n; });
    }
  }, [openSubtasksFor, onCloseAllSubtasks, showToast]);

  const closeAllSubtasks = useCallback(async () => {
    const pending = blockerBKeys.filter((k) => openSubtasksFor(k).length > 0);
    await Promise.all(pending.map((k) => closeAllForStory(k)));
  }, [blockerBKeys, openSubtasksFor, closeAllForStory]);

  const handleFinish = useCallback(async () => {
    if (blocked) return;
    setFinishing(true);
    setFinishError(null);
    try {
      await jira.closeSprint(sprint.id);
      await mutate("/api/jira/sprints");
      showToast(`Sprint "${sprint.name}" finished`);
      onFinished();
      onClose();
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : "Failed to finish sprint");
    } finally {
      setFinishing(false);
    }
  }, [blocked, sprint.id, sprint.name, showToast, onFinished, onClose]);

  const blockReason = (() => {
    const parts: string[] = [];
    if (incompleteStories.length > 0) {
      parts.push(`${incompleteStories.length} ${incompleteStories.length === 1 ? "story" : "stories"} not done`);
    }
    if (allLoaded && !hasLoadError && totalOpenSubtasks > 0) {
      parts.push(`${totalOpenSubtasks} ${totalOpenSubtasks === 1 ? "subtask" : "subtasks"} open`);
    }
    if (hasLoadError) parts.push("could not load subtasks");
    return parts.join(" · ");
  })();

  // An active error supersedes the ready state so success and failure are never shown together.
  const ready = !blocked && !finishing && !finishError;

  const completedCount = tickets.length - incompleteStories.length;
  const readySummary = [
    completedCount > 0 ? `${completedCount} ${completedCount === 1 ? "story" : "stories"} complete` : null,
    sprint.dateRange || null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Modal open onClose={onClose} aria-label="Finish sprint">
      <div className="flex max-h-[82vh] w-full max-w-2xl flex-col rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-xl)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-500)]/12 text-[var(--color-brand-400)]">
              <Flag size={14} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <h2 className="font-[var(--font-display)] text-body-lg font-semibold leading-tight text-text-primary">
                Finish sprint
              </h2>
              <p className="truncate text-[11px] text-text-muted">{sprint.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default transition-colors duration-100"
            aria-label="Close dialog"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {earlyClose && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2.5">
              <AlertTriangle size={14} strokeWidth={1.75} className="mt-px shrink-0 text-[var(--color-status-caution)]" />
              <p className="text-body-sm leading-relaxed text-text-secondary">
                This sprint&rsquo;s end date has not passed yet. Finishing now closes it early.
              </p>
            </div>
          )}

          {/* Blocker A: incomplete stories */}
          {incompleteStories.length > 0 && (
            <section className="overflow-hidden rounded-lg border border-red-500/20">
              <div className="flex min-h-10 items-center gap-2 border-b border-red-500/15 bg-red-500/[0.06] px-3 py-2">
                <CircleAlert size={13} strokeWidth={1.75} className="shrink-0 text-[var(--color-status-error)]" />
                <span className="text-body-sm font-medium text-text-primary">
                  {incompleteStories.length} {incompleteStories.length === 1 ? "story is" : "stories are"} not done
                </span>
              </div>
              <p className="px-3 pt-2 text-[11px] leading-relaxed text-text-muted">
                Complete or move these on the board before finishing. They cannot be closed from here.
              </p>
              <ul className="max-h-44 overflow-y-auto px-1.5 py-1.5">
                {incompleteStories.map((t) => (
                  <li key={t.key} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-100 hover:bg-overlay-subtle">
                    <TicketStatusPill
                      ticketKey={t.key}
                      jiraStatus={t.jiraStatus}
                      issueType={t.type}
                      title={t.title}
                      variant="list"
                      showKey
                      showStatus
                      hoverData={buildTicketHoverData(t)}
                    />
                    <span className="min-w-0 flex-1 truncate text-body-sm text-text-primary">{t.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Blocker B: done stories with open subtasks */}
          {blockerBStories.length > 0 && (
            <section className="overflow-hidden rounded-lg border border-amber-500/20">
              <div className="flex min-h-10 items-center justify-between gap-2 border-b border-amber-500/15 bg-amber-500/[0.06] px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={13} strokeWidth={1.75} className="shrink-0 text-[var(--color-status-caution)]" />
                  <span className="text-body-sm font-medium text-text-primary">
                    {totalOpenSubtasks > 0
                      ? `${totalOpenSubtasks} open ${totalOpenSubtasks === 1 ? "subtask" : "subtasks"}`
                      : "Subtasks cleared"}
                  </span>
                </div>
                {totalOpenSubtasks > 0 && (
                  <button
                    type="button"
                    onClick={closeAllSubtasks}
                    disabled={busyStories.size > 0}
                    aria-label="Close all open subtasks"
                    className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-1 text-[11px] font-medium text-text-secondary cursor-pointer hover:bg-amber-500/25 hover:text-text-primary active:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                  >
                    <CheckCheck size={11} strokeWidth={1.75} />
                    Close all
                  </button>
                )}
              </div>
              <ul className="max-h-56 space-y-1 overflow-y-auto p-2">
                {blockerBStories.map((story) => {
                  const open = openSubtasksFor(story.key);
                  const resolved = storyResolved(story.key);
                  const errored = loadErrors[story.key];
                  const loading = !subtasksByStory[story.key] && !errored;
                  const storyBusy = busyStories.has(story.key);
                  return (
                    <li key={story.key} className="rounded-md border border-border-subtle bg-[var(--color-surface-elevated)]/40">
                      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <TicketStatusPill
                            ticketKey={story.key}
                            jiraStatus={story.jiraStatus}
                            issueType={story.type}
                            title={story.title}
                            variant="list"
                            showKey
                            showStatus
                            hoverData={buildTicketHoverData(story)}
                          />
                          <span className="min-w-0 flex-1 truncate text-body-sm text-text-primary">{story.title}</span>
                        </div>
                        {resolved ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--color-status-success)]">
                            <CircleCheckBig size={12} strokeWidth={1.75} /> Done
                          </span>
                        ) : open.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => closeAllForStory(story.key)}
                            disabled={storyBusy}
                            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-text-secondary cursor-pointer hover:bg-amber-500/15 hover:text-text-primary active:bg-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
                          >
                            {storyBusy
                              ? <Loader2 size={11} strokeWidth={1.75} className="animate-spin" />
                              : <CheckCheck size={11} strokeWidth={1.75} />}
                            Close all
                          </button>
                        ) : null}
                      </div>

                      {loading && (
                        <div className="flex items-center gap-1.5 px-2.5 pb-2 text-[11px] text-text-muted">
                          <Loader2 size={11} strokeWidth={1.75} className="animate-spin" /> Loading subtasks&hellip;
                        </div>
                      )}
                      {errored && (
                        <div className="flex items-center justify-between gap-2 px-2.5 pb-2 text-[11px] text-[var(--color-status-error)]">
                          <span>Failed to load subtasks</span>
                          <button
                            type="button"
                            onClick={() => loadStory(story.key)}
                            className="rounded px-1.5 py-0.5 font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/10 transition-colors duration-100"
                          >
                            Retry
                          </button>
                        </div>
                      )}
                      {open.length > 0 && (
                        <ul className="mb-1.5 ml-5 space-y-0.5 border-l-2 border-border-strong pl-2">
                          {open.map((sub) => {
                            const subBusy = busySubtasks.has(sub.key);
                            return (
                              <li key={sub.key} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors duration-100 hover:bg-overlay-subtle">
                                <TicketStatusPill
                                  ticketKey={sub.key}
                                  jiraStatus={sub.status.toUpperCase() as JiraStatus}
                                  issueType="subtask"
                                  title={sub.title}
                                  variant="list"
                                  showKey
                                  showStatus
                                />
                                <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary">{sub.title}</span>
                                <button
                                  type="button"
                                  onClick={() => closeOneSubtask(story.key, sub.key)}
                                  disabled={subBusy || storyBusy}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-text-secondary cursor-pointer hover:bg-overlay-default hover:text-text-primary active:bg-overlay-strong disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-100"
                                >
                                  {subBusy
                                    ? <Loader2 size={10} strokeWidth={1.75} className="animate-spin" />
                                    : <CheckCheck size={10} strokeWidth={1.75} />}
                                  Close
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Ready state */}
          {ready && (
            <div className="flex items-center gap-3 rounded-lg border border-green-500/25 bg-green-500/[0.06] px-3.5 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/12 text-[var(--color-status-success)]">
                <PartyPopper size={16} strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-text-primary">Everything is done. Ready to finish.</p>
                {readySummary && (
                  <p className="mt-0.5 truncate text-[11px] text-text-muted">{readySummary}</p>
                )}
              </div>
            </div>
          )}

          {/* Finish error */}
          {finishError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5">
              <AlertTriangle size={13} strokeWidth={1.5} className="mt-px shrink-0 text-[var(--color-status-error)]" />
              <p className="text-body-sm leading-relaxed text-text-primary">{finishError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border-default px-5 py-3">
          <span className="min-w-0 truncate text-[11px] text-text-muted">
            {blocked && !finishing ? blockReason : ""}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="md" onClick={onClose} disabled={finishing}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={handleFinish}
              disabled={blocked || finishing}
              icon={finishing ? <Loader2 size={13} strokeWidth={1.75} className="animate-spin" /> : <Flag size={13} strokeWidth={1.75} />}
            >
              {finishing ? "Finishing..." : "Finish sprint"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
