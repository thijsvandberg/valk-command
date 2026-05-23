"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePageTitle } from "@/hooks/usePageTitle";
import { useRefinementSession } from "@/contexts/RefinementSessionContext";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { SessionTicketView } from "@/components/refinement-session/SessionTicketView";
import { SessionSummary } from "@/components/refinement-session/SessionSummary";
import { SubtasksSection } from "@/components/ticket-detail/SubtasksSection";
import { tickets } from "@/lib/api-client";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  StickyNote,
  ListChecks,
  List,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function RefinementSessionPage() {
  const pageTitle = usePageTitle("Refinement Session");
  const router = useRouter();
  const {
    queue,
    queueMeta,
    currentIndex,
    sessionActive,
    notesCollapsed,
    subtasksPaneOpen,
    completionData,
    nextTicket,
    prevTicket,
    goToTicket,
    markComplete,
    toggleNotes,
    toggleSubtasksPane,
    endSession,
  } = useRefinementSession();

  // Fullscreen: hide sidebar + header
  useEffect(() => {
    document.body.classList.add("refinement-session-active");
    return () => document.body.classList.remove("refinement-session-active");
  }, []);

  // Redirect if no session
  useEffect(() => {
    if (queue.length === 0) {
      router.replace("/refinement");
    }
  }, [queue.length, router]);

  const currentKey = queue[currentIndex] ?? null;
  const isLastTicket = currentIndex >= queue.length - 1;
  const isSessionDone = currentIndex >= queue.length;

  const { data: ticketData, mutate } = useTicketDetail(currentKey);

  // PO Notes: reset when ticket key changes
  const [poNotes, setPoNotes] = useState("");
  const [syncedKey, setSyncedKey] = useState<string | null>(null);

  // Navigation dropdown
  const [navDropdownOpen, setNavDropdownOpen] = useState(false);
  const navDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ticketData || syncedKey === ticketData.key) return;
    setSyncedKey(ticketData.key);
    setPoNotes(ticketData.notes ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally sync only on key change
  }, [ticketData?.key, ticketData?.notes]);

  const handleNotesBlur = useCallback(async () => {
    if (!currentKey) return;
    try {
      await tickets.updateMetadata(currentKey, { poNotes: poNotes });
    } catch (err) {
      console.error("Failed to save PO notes:", err);
    }
  }, [currentKey, poNotes]);

  const handleDoneAndNext = useCallback(async () => {
    if (!currentKey) return;

    // Track completion
    markComplete(currentKey, {
      pointsSet: ticketData?.storyPoints != null,
    });

    // Auto-set readiness to "Ready for Dev" when story points are set
    if (ticketData?.storyPoints != null) {
      try {
        await tickets.updateMetadata(currentKey, { readiness: null });
        markComplete(currentKey, { statusChanged: true });
      } catch (err) {
        console.error("Failed to update readiness:", err);
      }
    }

    if (isLastTicket) {
      endSession();
    } else {
      nextTicket();
    }
  }, [currentKey, ticketData, isLastTicket, markComplete, endSession, nextTicket]);

  const handleExitSession = useCallback(() => {
    endSession();
    router.push("/refinement");
  }, [endSession, router]);

  // Close nav dropdown on click outside
  useEffect(() => {
    if (!navDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (navDropdownRef.current && !navDropdownRef.current.contains(e.target as Node)) {
        setNavDropdownOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setNavDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [navDropdownOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.getAttribute("contenteditable");

      // Cmd+Enter: done and next
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isSessionDone) {
        e.preventDefault();
        handleDoneAndNext();
        return;
      }

      if (isInput) return;

      // P: toggle notes
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        toggleNotes();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleDoneAndNext, toggleNotes, isSessionDone]);

  if (queue.length === 0) return null;

  // Session ended: show summary
  if (!sessionActive || isSessionDone) {
    return (
      <>
        {pageTitle}
        <div className="flex h-full flex-col bg-[var(--color-surface-base)]">
          <SessionSummary />
        </div>
      </>
    );
  }

  // Determine which right panel to show
  const rightPanelMode = subtasksPaneOpen ? "subtasks" : (!notesCollapsed ? "notes" : null);

  return (
    <>
      {pageTitle}
      <div className="flex h-full flex-col bg-[var(--color-surface-base)]">
        {/* Top bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-5 py-3">
          {/* Left: exit */}
          <button
            type="button"
            onClick={handleExitSession}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-muted hover:bg-overlay-subtle hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
            style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
          >
            <X size={14} strokeWidth={1.5} />
            Exit Session
          </button>

          {/* Center: progress + navigation dropdown */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium tabular-nums text-text-secondary">
              Ticket {currentIndex + 1} of {queue.length}
            </span>
            <div className="flex items-center gap-1.5">
              {queue.map((key, idx) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => goToTicket(idx)}
                  className="group relative cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
                  aria-label={`Go to ticket ${idx + 1}: ${key}`}
                >
                  <div
                    className={`h-1.5 rounded-full ${
                      idx === currentIndex
                        ? "w-8 bg-[var(--color-brand-500)]"
                        : idx < currentIndex
                          ? "w-4 bg-[var(--color-brand-500)]/40"
                          : "w-4 bg-overlay-strong"
                    }`}
                    style={{ transition: "width 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s ease" }}
                  />
                </button>
              ))}
            </div>
            {/* Navigation dropdown trigger */}
            <div className="relative" ref={navDropdownRef}>
              <button
                type="button"
                onClick={() => setNavDropdownOpen((v) => !v)}
                className={`flex cursor-pointer items-center justify-center rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                  navDropdownOpen
                    ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
                    : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
                }`}
                style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
                title="Jump to ticket"
              >
                <List size={14} strokeWidth={1.5} />
              </button>
              {navDropdownOpen && (
                <div
                  className="absolute top-full left-1/2 z-50 mt-2 w-[340px] -translate-x-1/2 rounded-xl border border-border-default bg-[var(--color-surface-floating)] py-1 shadow-[var(--shadow-popover)]"
                  style={{ animation: "fadeInUp 0.1s ease" }}
                >
                  <div className="px-3 py-2 text-label font-semibold uppercase tracking-wider text-text-muted">
                    Queue
                  </div>
                  <div className="max-h-[320px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                    {queue.map((key, idx) => {
                      const meta = queueMeta.find((m) => m.key === key);
                      const isCompleted = !!completionData[key];
                      const isCurrent = idx === currentIndex;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => { goToTicket(idx); setNavDropdownOpen(false); }}
                          className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left hover:bg-hover-list-item active:bg-overlay-default ${
                            isCurrent ? "bg-overlay-subtle" : ""
                          }`}
                          style={{ transition: "background-color 0.1s ease" }}
                        >
                          <span className="shrink-0 font-mono text-xs text-[var(--color-brand-400)]">{key}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-text-secondary">
                            {meta?.title ?? key}
                          </span>
                          {isCompleted && (
                            <Check size={13} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />
                          )}
                          {isCurrent && !isCompleted && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-brand-500)]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: panel toggles */}
          <div className="flex items-center gap-2">
            {/* Subtasks pane toggle */}
            <button
              type="button"
              onClick={toggleSubtasksPane}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                subtasksPaneOpen
                  ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
                  : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
              }`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              title="Toggle subtasks pane"
            >
              <ListChecks size={13} strokeWidth={1.5} />
              Subtasks
            </button>

            {/* Notes toggle */}
            <button
              type="button"
              onClick={toggleNotes}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                !notesCollapsed
                  ? "bg-[var(--color-brand-500)]/[0.08] text-[var(--color-brand-400)]"
                  : "text-text-muted hover:bg-overlay-subtle hover:text-text-secondary"
              }`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              title="Toggle PO Notes (P)"
            >
              <StickyNote size={13} strokeWidth={1.5} />
              Notes
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex min-h-0 flex-1">
          {/* Content area */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-8 py-8">
              {ticketData ? (
                <SessionTicketView
                  key={ticketData.key}
                  ticket={ticketData}
                  detail={ticketData}
                  onMutate={() => mutate()}
                  subtasksPaneMode={subtasksPaneOpen}
                />
              ) : (
                <div className="flex items-center justify-center py-24">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-[var(--color-brand-400)]" />
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Subtasks pane */}
          {rightPanelMode === "subtasks" && ticketData && (
            <div
              className="w-80 shrink-0 overflow-y-auto border-l border-border-subtle bg-[var(--color-surface-elevated)] p-5"
              style={{ animation: "fadeInUp 0.15s ease" }}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-label font-semibold uppercase tracking-wider text-text-muted">Subtasks</h3>
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-overlay-default px-1.5 text-caption font-medium tabular-nums text-text-tertiary">
                  {ticketData.subtasks?.length ?? 0}
                </span>
              </div>
              <div className="mt-3">
                <SubtasksSection
                  subtasks={ticketData.subtasks ?? []}
                  ticketKey={ticketData.key}
                  onMutate={() => mutate()}
                />
              </div>
            </div>
          )}

          {/* Right panel: PO Notes */}
          {rightPanelMode === "notes" && (
            <div
              className="w-72 shrink-0 border-l border-border-subtle bg-[var(--color-surface-elevated)] p-5"
              style={{ animation: "fadeInUp 0.15s ease" }}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-label font-semibold uppercase tracking-wider text-text-muted">PO Notes</h3>
                {poNotes.trim() && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-500)]" title="Has notes" />
                )}
              </div>
              <textarea
                value={poNotes}
                onChange={(e) => setPoNotes(e.target.value)}
                onBlur={handleNotesBlur}
                placeholder="Quick annotation..."
                rows={6}
                className="mt-3 w-full resize-none rounded-lg border border-border-strong bg-overlay-subtle px-3 py-2 text-sm text-text-secondary placeholder:text-text-muted focus:border-[var(--color-brand-500)]/40 focus:outline-none"
                style={{ transition: "border-color 0.15s ease" }}
              />
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="flex shrink-0 items-center justify-between border-t border-border-subtle px-5 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="md"
              icon={<ChevronLeft size={14} strokeWidth={2} />}
              onClick={() => prevTicket()}
              disabled={currentIndex === 0}
            >
              Previous
            </Button>
          </div>

          <div className="flex items-center gap-3">
            {isLastTicket ? (
              <Button
                variant="primary"
                size="lg"
                icon={<CheckCircle2 size={14} strokeWidth={2} />}
                onClick={handleDoneAndNext}
              >
                End Session
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                icon={<ChevronRight size={14} strokeWidth={2} />}
                onClick={handleDoneAndNext}
              >
                Done, next ticket
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
