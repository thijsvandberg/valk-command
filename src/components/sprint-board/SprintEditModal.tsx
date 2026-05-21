"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { mutate } from "swr";
import type { Sprint, Ticket } from "@/types/ticket";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";
import { jira, workspaceTasks } from "@/lib/api-client";
import { Calendar, Target, Sparkles, Loader2, X, Check } from "lucide-react";

interface SprintEditModalProps {
  sprint: Sprint;
  tickets: Ticket[];
  onClose: () => void;
  showToast: (msg: string) => void;
}

function toInputDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function toIsoDate(input: string): string {
  if (!input) return "";
  return new Date(input + "T00:00:00Z").toISOString();
}

export function SprintEditModal({ sprint, tickets, onClose, showToast }: SprintEditModalProps) {
  const [startDate, setStartDate] = useState(toInputDate(sprint.startDate));
  const [endDate, setEndDate] = useState(toInputDate(sprint.endDate));
  const [goal, setGoal] = useState(sprint.goal ?? "");
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const fields: Record<string, string> = {};
      const origStart = toInputDate(sprint.startDate);
      const origEnd = toInputDate(sprint.endDate);
      const origGoal = sprint.goal ?? "";

      if (startDate !== origStart) fields.startDate = toIsoDate(startDate);
      if (endDate !== origEnd) fields.endDate = toIsoDate(endDate);
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
          sprintName: sprint.name,
          tickets: ticketData,
        },
      }, controller.signal);

      const streamUrl = workspaceTasks.streamUrl(taskId);
      const eventSource = new EventSource(streamUrl);
      let result = "";

      eventSource.addEventListener("result", (e) => {
        try {
          const data = JSON.parse(e.data);
          result = data.output ?? data.text ?? "";
          setSuggestion(result);
        } catch { /* ignore */ }
      });

      eventSource.addEventListener("progress", (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.text) {
            result = data.text;
            setSuggestion(result);
          }
        } catch { /* ignore */ }
      });

      eventSource.addEventListener("done", () => {
        eventSource.close();
        setSuggesting(false);
      });

      eventSource.addEventListener("error", () => {
        eventSource.close();
        setSuggesting(false);
        if (!result) {
          setSuggestion(null);
          showToast("Failed to generate goal suggestion");
        }
      });

      controller.signal.addEventListener("abort", () => {
        eventSource.close();
        setSuggesting(false);
      });
    } catch (err) {
      setSuggesting(false);
      const msg = err instanceof Error && err.message.includes("unreachable")
        ? "Workspace is not reachable"
        : "Could not generate suggestion. Is the workspace running?";
      showToast(msg);
    }
  }, [sprint.name, tickets, showToast]);

  const handleAcceptSuggestion = useCallback(() => {
    if (suggestion) {
      setGoal(suggestion);
      setSuggestion(null);
      textareaRef.current?.focus();
    }
  }, [suggestion]);

  const handleDismissSuggestion = useCallback(() => {
    setSuggestion(null);
    abortRef.current?.abort();
    setSuggesting(false);
  }, []);

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
              <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                <Calendar size={11} strokeWidth={1.5} className="text-text-muted" />
                Start date
              </span>
              <input
                type="date"
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
              <span className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                <Calendar size={11} strokeWidth={1.5} className="text-text-muted" />
                End date
              </span>
              <input
                type="date"
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
