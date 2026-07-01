"use client";

import { useState, useCallback, useRef, useEffect } from "react";
// useSWRConfig, not the top-level "swr" mutate: the app's custom cache provider
// makes the global mutate a silent no-op for provider-backed keys (BRDG-458).
import { useSWRConfig } from "swr";
import type { Sprint, Ticket } from "@/types/ticket";
import { Modal } from "@/components/shared/Modal";
import { DateTimePicker, formatDateTimeLabel } from "@/components/shared/DateTimePicker";
import { Button } from "@/components/ui/Button";
import { jira, workspaceTasks } from "@/lib/api-client";
import { sprintEndFromStart, sprintStartDateTime, toInputDateTime, toIsoDateTime } from "@/lib/sprint-dates";
import { useTaskStream } from "@/hooks/useTaskStream";
import { Calendar, Target, Sparkles, Loader2, X, Check, CornerDownRight, Play } from "lucide-react";

interface SprintEditModalProps {
  sprint: Sprint;
  tickets: Ticket[];
  onClose: () => void;
  showToast: (msg: string) => void;
  autoSuggest?: boolean;
}

// Persist suggestion task so it survives navigation
interface StoredGoalTask {
  taskId: string;
  suggestion: string | null;
  timestamp: number;
}

const STORAGE_PREFIX = "sprint-goal-task-";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks

function getStoredTask(sprintId: string): StoredGoalTask | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + sprintId);
    if (!raw) return null;
    const parsed: StoredGoalTask = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_PREFIX + sprintId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function setStoredTask(sprintId: string, task: StoredGoalTask) {
  try {
    localStorage.setItem(STORAGE_PREFIX + sprintId, JSON.stringify(task));
  } catch { /* quota exceeded */ }
}

function clearStoredTask(sprintId: string) {
  try { localStorage.removeItem(STORAGE_PREFIX + sprintId); } catch { /* ok */ }
}

export function SprintEditModal({ sprint, tickets, onClose, showToast, autoSuggest }: SprintEditModalProps) {
  const { mutate } = useSWRConfig();
  const [name, setName] = useState(sprint.name);
  const [startDate, setStartDate] = useState(toInputDateTime(sprint.startDate));
  const [endDate, setEndDate] = useState(toInputDateTime(sprint.endDate));
  const [goal, setGoal] = useState(sprint.goal ?? "");
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestionDate, setSuggestionDate] = useState<number | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const restoredRef = useRef(false);

  const { close: closeStream } = useTaskStream(activeTaskId, {
    timeout: 0,
    onResult: (data) => {
      const text = (data.output ?? data.text ?? "") as string;
      if (text) {
        const now = Date.now();
        setSuggestion(text);
        setSuggestionDate(now);
        if (activeTaskId) setStoredTask(sprint.id, { taskId: activeTaskId, suggestion: text, timestamp: now });
      }
    },
    onProgress: (message) => {
      // The progress event may contain text in its message field, but
      // the original SprintEditModal only forwarded data.text via its
      // progress listener. The hook receives the parsed message string
      // which does not include raw text payloads, so no action needed here.
      void message;
    },
    onDone: () => {
      setSuggesting(false);
    },
    onError: () => {
      setSuggesting(false);
    },
    onNetworkError: () => {
      setSuggesting(false);
    },
  });

  // On mount: restore a previous suggestion or reconnect to a running task
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const stored = getStoredTask(sprint.id);
    if (!stored) return;

    if (stored.suggestion) {
      setSuggestion(stored.suggestion);
      setSuggestionDate(stored.timestamp);
      return;
    }

    setSuggesting(true);
    workspaceTasks.get(stored.taskId)
      .then((data) => {
        const task = data as { status?: string; output?: string };
        if (task.status === "completed" && task.output) {
          setSuggestion(task.output);
          setSuggestionDate(stored.timestamp);
          setSuggesting(false);
          setStoredTask(sprint.id, { ...stored, suggestion: task.output });
        } else if (task.status === "running") {
          setActiveTaskId(stored.taskId);
        } else {
          setSuggesting(false);
          clearStoredTask(sprint.id);
        }
      })
      .catch(() => {
        setSuggesting(false);
        clearStoredTask(sprint.id);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // Auto-trigger suggest when opened from the popover shortcut
  const autoSuggestFired = useRef(false);
  useEffect(() => {
    if (autoSuggest && !autoSuggestFired.current && !suggesting && !suggestion) {
      autoSuggestFired.current = true;
      const t = setTimeout(() => handleSuggestGoalRef.current?.(), 0);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSuggest]);

  // The set of sprint fields the form has changed relative to the loaded sprint.
  // Shared by Save and Start so starting also persists any pending edits.
  const collectChangedFields = useCallback((): Record<string, string> => {
    const fields: Record<string, string> = {};
    const origStart = toInputDateTime(sprint.startDate);
    const origEnd = toInputDateTime(sprint.endDate);
    const origGoal = sprint.goal ?? "";
    const trimmedName = name.trim();

    if (trimmedName && trimmedName !== sprint.name) fields.name = trimmedName;
    if (startDate !== origStart) fields.startDate = toIsoDateTime(startDate);
    if (endDate !== origEnd) fields.endDate = toIsoDateTime(endDate);
    if (goal !== origGoal) fields.goal = goal;
    return fields;
  }, [sprint, name, startDate, endDate, goal]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const fields = collectChangedFields();

      if (Object.keys(fields).length === 0) {
        onClose();
        return;
      }

      await jira.updateSprint(sprint.id, fields);
      showToast("Sprint updated");
      onClose();
      // The PUT route's cache.invalidate does not reach the GET route's cache
      // instance under next dev, so a revalidating refetch returns stale data
      // and the saved dates appear to vanish. Patch the SWR cache directly.
      void mutate(
        "/api/jira/sprints",
        (current: { sprints: Array<{ id: number }>; backlogCount: number } | undefined) => {
          if (!current?.sprints) return current;
          return {
            ...current,
            sprints: current.sprints.map((s) =>
              String(s.id) === String(sprint.id) ? { ...s, ...fields } : s,
            ),
          };
        },
        { revalidate: false },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update sprint";
      showToast(msg);
    } finally {
      setSaving(false);
    }
  }, [collectChangedFields, sprint.id, onClose, showToast, mutate]);

  // Starting is only offered for a future sprint, and only once Jira's
  // preconditions are met: an end date that carries a time and lies in the
  // future (time stops being optional here, see BRDG-246).
  const canStartSprint = sprint.state === "future";
  const endHasTime = endDate.includes("T");
  const endIsFuture = (() => {
    if (!endDate) return false;
    const end = new Date(toIsoDateTime(endDate));
    return !Number.isNaN(end.getTime()) && end.getTime() > Date.now();
  })();
  const startReady = canStartSprint && endHasTime && endIsFuture;
  const startBlockReason = !endDate
    ? "Set an end date to start"
    : !endHasTime
      ? "Add an end time to start"
      : !endIsFuture
        ? "End date must be in the future"
        : null;

  const handleStart = useCallback(async () => {
    if (!startReady) return;
    setStarting(true);
    try {
      // Persist any pending edits (name/goal/dates) before activating, so what
      // the PO sees in the form is what the started sprint carries.
      const fields = collectChangedFields();
      if (Object.keys(fields).length > 0) {
        await jira.updateSprint(sprint.id, fields);
      }

      const applied = await jira.startSprint(sprint.id, {
        // Anchor the start to the planned day at noon, or "now" if we are starting
        // before that (see sprintStartDateTime). Jira keeps a past noon as-is.
        startDate: sprintStartDateTime(startDate),
        endDate: toIsoDateTime(endDate),
      });

      showToast(`Sprint "${name.trim() || sprint.name}" started`);
      onClose();
      // Mirror handleSave: the start route's cache.invalidate does not reach the
      // GET route's cache under next dev, so patch the SWR cache directly to flip
      // the sprint to "active" with the accepted dates.
      void mutate(
        "/api/jira/sprints",
        (current: { sprints: Array<{ id: number }> } | undefined) => {
          if (!current?.sprints) return current;
          return {
            ...current,
            sprints: current.sprints.map((s) =>
              String(s.id) === String(sprint.id)
                ? { ...s, state: "active", startDate: applied.startDate, endDate: applied.endDate }
                : s,
            ),
          };
        },
        { revalidate: false },
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to start sprint");
    } finally {
      setStarting(false);
    }
  }, [startReady, collectChangedFields, sprint.id, sprint.name, name, startDate, endDate, onClose, showToast, mutate]);

  const handleSuggestGoal = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSuggesting(true);
    setSuggestion(null);
    setActiveTaskId(null);

    try {
      const ticketData = tickets
        .filter((t) => t.jiraStatus !== "DEPRECATED")
        .map((t) => ({
          key: t.key,
          summary: t.title,
          epic: t.epic ?? undefined,
          type: t.type,
          storyPoints: t.storyPoints ?? undefined,
        }));

      const { id: taskId } = await workspaceTasks.create({
        skillName: "suggest-sprint-goal",
        args: {
          sprintId: sprint.id,
          sprintName: sprint.name,
          tickets: JSON.stringify(ticketData),
        },
      }, controller.signal);

      setStoredTask(sprint.id, { taskId, suggestion: null, timestamp: Date.now() });
      setActiveTaskId(taskId);

      controller.signal.addEventListener("abort", () => {
        closeStream();
        setSuggesting(false);
      });
    } catch (err) {
      setSuggesting(false);
      const msg = err instanceof Error && err.message.includes("unreachable")
        ? "Workspace is not reachable"
        : "Could not generate suggestion. Is the workspace running?";
      showToast(msg);
    }
  }, [sprint.id, sprint.name, tickets, showToast, closeStream]);

  const handleSuggestGoalRef = useRef(handleSuggestGoal);
  handleSuggestGoalRef.current = handleSuggestGoal;

  const handleAcceptSuggestion = useCallback(() => {
    if (suggestion) {
      setGoal(suggestion);
      setSuggestion(null);
      clearStoredTask(sprint.id);
      textareaRef.current?.focus();
    }
  }, [suggestion, sprint.id]);

  const handleDismissSuggestion = useCallback(() => {
    setSuggestion(null);
    clearStoredTask(sprint.id);
    abortRef.current?.abort();
    setSuggesting(false);
  }, [sprint.id]);

  const suggestedEnd = sprintEndFromStart(startDate);

  return (
    <Modal open onClose={onClose} aria-label="Edit sprint details">
      <div className="w-full max-w-md rounded-xl border border-border-strong bg-surface-floating shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3.5">
          <h2 className="font-[var(--font-display)] text-body-lg font-semibold text-text-primary">
            Edit Sprint
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Sprint name */}
          <label className="block space-y-1.5">
            <span className="text-body-sm font-medium text-text-secondary">Sprint name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sprint name"
              className="w-full rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-body-sm text-text-primary
                placeholder:text-text-muted
                focus:border-[var(--color-brand-500)]/50 focus:outline-none transition-colors duration-100"
            />
          </label>

          {/* Date fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-body-sm font-medium text-text-secondary">
                <Calendar size={11} strokeWidth={1.5} className="text-text-muted" />
                Start date
              </span>
              <DateTimePicker
                value={startDate}
                onChange={setStartDate}
                ariaLabel="Start date"
                placeholder="Pick a date"
                closeOnSelect
              />
            </div>
            <div className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-body-sm font-medium text-text-secondary">
                <Calendar size={11} strokeWidth={1.5} className="text-text-muted" />
                End date
              </span>
              <DateTimePicker
                value={endDate}
                onChange={setEndDate}
                ariaLabel="End date"
                placeholder="Pick a date"
              />
            </div>
          </div>

          {/* Conventional sprint-end suggestion (first Thursday after +1 week, 17:00) */}
          {startDate && suggestedEnd !== endDate && (
            <div className="-mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setEndDate(suggestedEnd)}
                title="Set end date to the conventional sprint end"
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-label font-medium cursor-pointer
                  text-[var(--color-brand-400)]
                  hover:bg-[var(--color-brand-500)]/10
                  active:bg-[var(--color-brand-500)]/15
                  transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
              >
                <CornerDownRight size={11} strokeWidth={1.5} />
                End on {formatDateTimeLabel(suggestedEnd)}
              </button>
            </div>
          )}

          {/* Goal field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-body-sm font-medium text-text-secondary">
                <Target size={11} strokeWidth={1.5} className="text-text-muted" />
                Sprint goal
              </span>
              <button
                type="button"
                onClick={handleSuggestGoal}
                disabled={suggesting || tickets.length === 0}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-label font-medium cursor-pointer
                  text-[var(--color-brand-400)]
                  hover:bg-[var(--color-brand-500)]/10
                  active:bg-[var(--color-brand-500)]/15
                  disabled:opacity-40 disabled:cursor-not-allowed
                  transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                title={tickets.length === 0 ? "No tickets to analyze" : "Generate goal suggestion from sprint tickets"}
              >
                {suggesting ? (
                  <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
                ) : (
                  <Sparkles size={11} strokeWidth={1.5} />
                )}
                <span>{suggesting ? "Generating..." : "Suggest with AI"}</span>
              </button>
            </div>
            <textarea
              ref={textareaRef}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Describe the sprint's primary objective..."
              rows={3}
              className="w-full rounded-lg border border-border-default bg-surface-elevated px-3 py-2 text-body-sm leading-relaxed text-text-primary
                placeholder:text-text-muted resize-none
                focus:border-[var(--color-brand-500)]/50 focus:outline-none transition-colors duration-100"
            />
          </div>

          {/* AI suggestion inline */}
          {(suggestion || suggesting) && (
            <div className="rounded-lg border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06] p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-label font-medium text-[var(--color-brand-400)]">
                <Sparkles size={10} strokeWidth={1.5} />
                <span>AI suggestion</span>
                {suggestionDate && (
                  <span className="ml-auto text-caption font-normal text-text-muted">
                    {new Date(suggestionDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
              {suggesting && !suggestion && (
                <div className="flex items-center gap-2 text-body-sm text-text-muted">
                  <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                  <span>Analyzing sprint tickets...</span>
                </div>
              )}
              {suggestion && (
                <>
                  <p className="text-body-sm leading-relaxed text-text-secondary">{suggestion}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleAcceptSuggestion}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-label font-medium cursor-pointer
                        text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10
                        hover:bg-[var(--color-brand-500)]/20
                        active:bg-[var(--color-brand-500)]/25
                        transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    >
                      <Check size={10} strokeWidth={2} />
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={handleDismissSuggestion}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-label font-medium cursor-pointer
                        text-text-muted
                        hover:text-text-secondary hover:bg-overlay-default
                        transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                    >
                      <X size={10} strokeWidth={2} />
                      Dismiss
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border-default px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {canStartSprint && (
              <Button
                variant="primary"
                size="md"
                onClick={handleStart}
                disabled={!startReady || starting || saving}
                title={startBlockReason ?? "Start this sprint now"}
                icon={starting ? <Loader2 size={13} strokeWidth={1.75} className="animate-spin" /> : <Play size={13} strokeWidth={1.75} />}
              >
                {starting ? "Starting..." : "Start sprint"}
              </Button>
            )}
            {canStartSprint && startBlockReason && !starting && (
              <span className="truncate text-label text-text-muted">{startBlockReason}</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="md" onClick={onClose} disabled={saving || starting}>
              Cancel
            </Button>
            <Button variant={canStartSprint ? "secondary" : "primary"} size="md" onClick={handleSave} disabled={saving || starting}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
