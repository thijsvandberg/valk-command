"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { Modal } from "@/components/shared/Modal";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { useTicketDetail } from "@/hooks/useSprintBoard";
import { useTaskStream } from "@/hooks/useTaskStream";
import { friendlyStreamError } from "@/lib/agent-errors";
import { parseTestDoc, type TestDocClassification } from "@/lib/parse-test-doc";
import { tickets as ticketsApi, ApiError } from "@/lib/api-client";
import { ClipboardCheck, Loader2, RefreshCw, X } from "lucide-react";

type Phase = "generating" | "review" | "saving";

interface TestDocReviewModalProps {
  /** Queue of ticket keys to generate + validate; a single key is the non-bulk case. */
  keys: string[];
  onClose: () => void;
}

/**
 * Split-view validation for generated stakeholder test docs (BRDG-426).
 * Left: the editable generated markdown. Right: the story rendered in the
 * regular ticket format, so the PO validates with the story actually visible.
 * Bulk mode runs the same flow as a sequential queue (Save/Skip advance).
 */
export function TestDocReviewModal({ keys, onClose }: TestDocReviewModalProps) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("generating");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [progress, setProgress] = useState("Starting...");
  const [docText, setDocText] = useState("");
  const [classification, setClassification] = useState<TestDocClassification>("ok");
  const [unstructured, setUnstructured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);
  const { mutate } = useSWRConfig();

  const currentKey = keys[index] ?? null;
  const isBulk = keys.length > 1;
  const isLast = index >= keys.length - 1;

  const { data: detail } = useTicketDetail(currentKey);

  // No synchronous setState here: this runs from an effect, and the queue-reset
  // state (phase/progress/taskId) is handled by resetForNext in event handlers.
  // A failed POST must land in a terminal review state (spinner off, Regenerate
  // enabled), not spin forever next to the error banner.
  const startGeneration = useCallback((key: string) => {
    ticketsApi
      .generateTestDoc(key)
      .then((data) => {
        if (!data.taskId) {
          setError("No task ID returned from workspace");
          setPhase("review");
          return;
        }
        setTaskId(data.taskId);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to start generation");
        setPhase("review");
      });
  }, []);

  // Kick off generation once per queue entry; Save/Skip reset the phase in
  // their handlers, this effect only fires the request (no sync setState).
  const startedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentKey || startedForRef.current === currentKey) return;
    startedForRef.current = currentKey;
    startGeneration(currentKey);
  }, [currentKey, startGeneration]);

  useTaskStream(taskId, {
    timeout: 0,
    onProgress: (message) => setProgress(message),
    onToolCall: (tool) => setProgress(`Using ${tool.replace("mcp__", "")}...`),
    onResult: (resultData) => {
      const output = (resultData.output as string) ?? "";
      const parsed = parseTestDoc(output);
      if (parsed) {
        setDocText(parsed.markdown);
        setClassification(parsed.classification);
        setUnstructured(false);
      } else {
        // Degrade gracefully: let the PO salvage the raw output by hand.
        setDocText(output.trim());
        setClassification("ok");
        setUnstructured(true);
      }
      setPhase("review");
    },
    onError: (message) => {
      setError(friendlyStreamError(message));
      setPhase("review");
    },
    onNetworkError: () => {
      setError("Connection to workspace lost");
      setPhase("review");
    },
  });

  const resetForNext = useCallback(() => {
    setPhase("generating");
    setTaskId(null);
    setProgress("Starting...");
    setDocText("");
    setClassification("ok");
    setUnstructured(false);
    setError(null);
    setConflictMessage(null);
  }, []);

  const advance = useCallback(() => {
    if (isLast) {
      onClose();
      return;
    }
    resetForNext();
    setIndex((i) => i + 1);
  }, [isLast, onClose, resetForNext]);

  const handleSave = useCallback(async () => {
    if (!currentKey || !docText.trim()) return;
    setPhase("saving");
    setError(null);
    try {
      const result = await ticketsApi.saveTestDoc(currentKey, {
        markdown: docText.trim(),
        classification,
      });
      // Refresh an open detail panel; the server cache is already invalidated.
      void mutate(`/api/tickets/${encodeURIComponent(currentKey)}`);
      if (result.conflict) {
        // Bridge copy is saved; the description merge stays as a local edit for
        // the regular conflict-resolve flow. Tell the PO instead of advancing.
        setConflictMessage(result.message ?? "Jira was updated since your edit.");
        setPhase("review");
        return;
      }
      advance();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save test documentation");
      setPhase("review");
    }
  }, [advance, classification, currentKey, docText, mutate]);

  const handleRegenerate = useCallback(() => {
    if (!currentKey) return;
    resetForNext();
    startGeneration(currentKey);
  }, [currentKey, resetForNext, startGeneration]);

  const handleDocChange = useCallback(
    (value: string) => {
      setDocText(value);
      // A needs_input result blocks Save until the PO writes real content —
      // once they do, it IS validated documentation.
      if (classification === "needs_input") setClassification("ok");
    },
    [classification],
  );

  if (!currentKey) return null;

  const generating = phase === "generating";
  const saveDisabled =
    generating || phase === "saving" || !docText.trim() || classification === "needs_input";

  return (
    <Modal open onClose={onClose} aria-label={`Test documentation for ${currentKey}`}>
      <div className="flex h-[min(760px,88vh)] w-[min(1180px,94vw)] flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-elevated shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-500)]/12 ring-1 ring-[var(--color-brand-500)]/20 shadow-[0_2px_8px_color-mix(in_srgb,var(--color-brand-600)_15%,transparent)]">
              <ClipboardCheck size={16} strokeWidth={1.75} className="text-[var(--color-brand-400)]" />
            </div>
            <div className="min-w-0">
              <p className="text-body font-semibold leading-tight text-text-primary">
                Test documentation
              </p>
              <p className="mt-0.5 truncate text-body-sm text-text-tertiary">
                for <span className="font-mono text-text-secondary">{currentKey}</span>
                {detail?.title ? <span className="text-text-secondary"> &middot; {detail.title}</span> : null}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {isBulk && (
              <span
                data-testid="test-doc-queue-position"
                className="rounded-md bg-overlay-subtle px-2 py-0.5 font-mono text-body-sm text-text-tertiary"
              >
                {index + 1} / {keys.length}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={<X size={14} strokeWidth={1.5} />}
              onClick={onClose}
              className="text-text-muted"
              aria-label="Close"
            />
          </div>
        </div>

        {/* Body: doc left, story right */}
        <div className="grid min-h-0 flex-1 grid-cols-2">
          <div className="flex min-h-0 flex-col gap-3 border-r border-border-subtle p-4">
            {unstructured && !generating && (
              <InlineAlert variant="warning">
                The workspace returned unstructured output — review it carefully before saving.
              </InlineAlert>
            )}
            {classification === "needs_input" && !generating && (
              <InlineAlert variant="warning">
                The story lacks enough context for meaningful test documentation (empty or
                template-only description). Complete the story first, or write the checks
                yourself below to enable saving.
              </InlineAlert>
            )}
            {classification === "not_stakeholder_relevant" && !generating && (
              <InlineAlert variant="info">
                Classified as not stakeholder-testable (internal change, spike or chore).
                Saving stores the one-line mention so the sprint delivery stays complete.
              </InlineAlert>
            )}
            {error && <InlineAlert variant="error">{error}</InlineAlert>}
            {conflictMessage && (
              <InlineAlert variant="warning">
                Saved in Bridge, but the Jira push hit a conflict: {conflictMessage} Resolve it
                from the ticket&apos;s description editor.
              </InlineAlert>
            )}
            {generating ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-tertiary">
                <Loader2 size={20} strokeWidth={1.75} className="animate-spin text-[var(--color-brand-400)]" />
                <p className="max-w-[320px] truncate text-body-sm" data-testid="test-doc-progress">
                  {progress}
                </p>
              </div>
            ) : (
              <textarea
                value={docText}
                onChange={(e) => handleDocChange(e.target.value)}
                spellCheck={false}
                placeholder="Generated test documentation (markdown)..."
                data-testid="test-doc-editor"
                className="min-h-0 flex-1 resize-none rounded-xl border border-border-default bg-surface-base p-3 font-mono text-body-sm leading-relaxed text-text-primary outline-none placeholder:text-text-muted focus:border-[var(--color-brand-500)]/45 [transition:border-color_.15s_ease]"
              />
            )}
          </div>

          <div className="flex min-h-0 flex-col p-4">
            <div className="mb-3 flex shrink-0 items-center gap-2">
              {detail && <IssueTypeIcon type={detail.type} size={14} strokeWidth={2} />}
              <span className="font-mono text-body-sm text-text-tertiary">{currentKey}</span>
              {detail && (
                <StatusBadge
                  status={detail.jiraStatus}
                  className="rounded-[5px] px-1.5 text-caption tracking-wide"
                />
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border-subtle bg-surface-base p-4" data-testid="test-doc-story-pane">
              {detail ? (
                <>
                  <h3 className="mb-3 text-body-lg font-semibold text-text-primary">{detail.title}</h3>
                  <div className="description-content">
                    {detail.description?.trim()
                      ? renderMarkdown(detail.description, { linkifyRefs: true })
                      : <p className="text-body-lg text-text-muted">No description.</p>}
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-text-muted">
                  <Loader2 size={16} strokeWidth={1.75} className="animate-spin" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle px-5 py-3.5">
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          {isBulk && (
            <Button variant="ghost" size="md" onClick={advance} disabled={phase === "saving"}>
              Skip
            </Button>
          )}
          <Button
            variant="secondary"
            size="md"
            onClick={handleRegenerate}
            disabled={generating || phase === "saving"}
            icon={<RefreshCw size={12} strokeWidth={2} />}
          >
            Regenerate
          </Button>
          {conflictMessage ? (
            <Button variant="primary" size="md" onClick={advance}>
              {isLast ? "Done" : "Next"}
            </Button>
          ) : (
            <Button variant="primary" size="md" onClick={handleSave} disabled={saveDisabled}>
              {phase === "saving" ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
