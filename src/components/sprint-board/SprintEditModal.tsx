"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { mutate } from "swr";
import type { Sprint, Ticket } from "@/types/ticket";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";
import { jira, workspaceTasks } from "@/lib/api-client";
import { useTaskStream } from "@/hooks/useTaskStream";
import { Calendar, Target, Sparkles, Loader2, X, Check } from "lucide-react";

interface SprintEditModalProps {
  sprint: Sprint;
  tickets: Ticket[];
  onClose: () => void;
  showToast: (msg: string) => void;
  autoSuggest?: boolean;
}

function toInputDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function toIsoDateTime(input: string): string {
  if (!input) return "";
  return new Date(input).toISOString();
}

function fmtWeekday(input: string): string {
  if (!input) return "";
  const d = new Date(input);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
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
  const [startDate, setStartDate] = useState(toInputDateTime(sprint.startDate));
  const [endDate, setEndDate] = useState(toInputDateTime(sprint.endDate));
  const [goal, setGoal] = useState(sprint.goal ?? "");
  const [saving, setSaving] = useState(false);
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

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const fields: Record<string, string> = {};
      const origStart = toInputDateTime(sprint.startDate);
      const origEnd = toInputDateTime(sprint.endDate);
      const origGoal = sprint.goal ?? "";

      if (startDate !== origStart) fields.startDate = toIsoDateTime(startDate);
      if (endDate !== origEnd) fields.endDate = toIsoDateTime(endDate);
      if (goal !== origGoal) fields.goal = goal;

      if (Object.keys(fields).length === 0) {
        onClose();
        return;
      }

      await jira.updateSprint(sprint.id, fields);
      await mutate("/api/jira/sprints");
      showToast("Sprint updated");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update sprint";
      showToast(msg);
    } finally {
      setSaving(false);
    }
  }, [sprint, startDate, endDate, goal, onClose, showToast]);

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

  return (
    <Modal open onClose={onClose} aria-label="Edit sprint details">
      <div className="w-full max-w-md rounded-xl border border-border-strong bg-[var(--color-surface-floating)] shadow-[var(--shadow-xl)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-default px-5 py-3.5">
          <h2 className="font-[var(--font-display)] text-sm font-semibold text-text-primary">
            Edit Sprint
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-muted cursor-pointer hover:text-text-secondary hover:bg-overlay-default transition-colors duration-100"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Sprint name (read-only) */}
          <div className="text-xs text-text-muted">
            {sprint.name}
          </div>

          {/* Date fields */}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                  <Calendar size={11} strokeWidth={1.5} className="text-text-muted" />
                  Start date
                </span>
                {startDate && (
                  <span className="text-[10px] text-text-muted">{fmtWeekday(startDate)}</span>
                )}
              </div>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 py-2 text-xs text-text-primary
                  placeholder:text-text-muted
                  focus:border-[var(--color-brand-500)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]/30
                  transition-colors duration-100
                  [color-scheme:dark]"
              />
            </label>
            <label className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                  <Calendar size={11} strokeWidth={1.5} className="text-text-muted" />
                  End date
                </span>
                {endDate && (
                  <span className="text-[10px] text-text-muted">{fmtWeekday(endDate)}</span>
                )}
              </div>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 py-2 text-xs text-text-primary
                  placeholder:text-text-muted
                  focus:border-[var(--color-brand-500)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]/30
                  transition-colors duration-100
                  [color-scheme:dark]"
              />
            </label>
          </div>

          {/* Goal field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                <Target size={11} strokeWidth={1.5} className="text-text-muted" />
                Sprint goal
              </span>
              <button
                type="button"
                onClick={handleSuggestGoal}
                disabled={suggesting || tickets.length === 0}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer
                  text-[var(--color-brand-400)]
                  hover:bg-[var(--color-brand-500)]/10
                  active:bg-[var(--color-brand-500)]/15
                  disabled:opacity-40 disabled:cursor-not-allowed
                  transition-colors duration-100"
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
              className="w-full rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 py-2 text-xs leading-relaxed text-text-primary
                placeholder:text-text-muted resize-none
                focus:border-[var(--color-brand-500)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--color-brand-500)]/30
                transition-colors duration-100"
            />
          </div>

          {/* AI suggestion inline */}
          {(suggestion || suggesting) && (
            <div className="rounded-lg border border-[var(--color-brand-500)]/20 bg-[var(--color-brand-500)]/[0.06] p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-brand-400)]">
                <Sparkles size={10} strokeWidth={1.5} />
                <span>AI suggestion</span>
                {suggestionDate && (
                  <span className="ml-auto text-[10px] font-normal text-text-muted">
                    {new Date(suggestionDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
              {suggesting && !suggestion && (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                  <span>Analyzing sprint tickets...</span>
                </div>
              )}
              {suggestion && (
                <>
                  <p className="text-xs leading-relaxed text-text-secondary">{suggestion}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleAcceptSuggestion}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer
                        text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/10
                        hover:bg-[var(--color-brand-500)]/20
                        active:bg-[var(--color-brand-500)]/25
                        transition-colors duration-100"
                    >
                      <Check size={10} strokeWidth={2} />
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={handleDismissSuggestion}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer
                        text-text-muted
                        hover:text-text-secondary hover:bg-overlay-default
                        transition-colors duration-100"
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
        <div className="flex items-center justify-end gap-2 border-t border-border-default px-5 py-3">
          <Button variant="ghost" size="md" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
