"use client";

import { FileX2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { Tooltip } from "@/components/shared/Tooltip";
import { CaptionButton } from "@/components/sprint-board/CaptionButton";
import { renderMarkdown } from "@/components/ticket-detail/renderMarkdown";
import { relativeDate, formatAbsoluteDate } from "@/lib/date-utils";
import type { EntryState } from "@/components/sprint-board/useTestDocReview";

interface TestDocReviewPaneProps {
  entry: EntryState;
  /** Width of this (left) pane as a percentage; the story pane fills the rest. */
  splitPct: number;
  generating: boolean;
  docIsStale: boolean;
  conflictMessage: string | null;
  compare: boolean;
  editing: boolean;
  /** progressByKey for the on-screen key. */
  progress: string | undefined;
  onSwitchVersion: (index: number) => void;
  onToggleCompare: () => void;
  onToggleEdit: () => void;
  onGenerate: () => void;
  onDocChange: (value: string) => void;
  onPreviewClick: () => void;
}

/**
 * The left half of the test-doc review modal (BRDG-426): the stack of context
 * alerts, the version/compare/edit toolbar, and the doc body itself — idle,
 * generating, compare, editor and rendered-preview states. Pure presentation;
 * all state lives in {@link useTestDocReview}.
 */
export function TestDocReviewPane({
  entry,
  splitPct,
  generating,
  docIsStale,
  conflictMessage,
  compare,
  editing,
  progress,
  onSwitchVersion,
  onToggleCompare,
  onToggleEdit,
  onGenerate,
  onDocChange,
  onPreviewClick,
}: TestDocReviewPaneProps) {
  return (
    <div className="flex min-h-0 flex-col gap-3 px-6 py-5" style={{ width: `${splitPct}%` }}>
      {entry.unstructured && !generating && (
        <InlineAlert variant="warning">
          The workspace returned unstructured output — review it carefully before saving.
        </InlineAlert>
      )}
      {entry.classification === "needs_input" && !generating && (
        <InlineAlert variant="warning">
          The story lacks enough context for meaningful test documentation (empty or
          template-only description). Complete the story first, or write the checks
          yourself below to enable saving.
        </InlineAlert>
      )}
      {/* The unsaved state is a quiet chip in the toolbar row (not a loud banner —
          PO feedback). The one thing that DOES warrant an alert is a story that
          changed after the doc was generated: that draft may no longer cover it. */}
      {!generating && docIsStale && (
        <InlineAlert variant="warning">
          The story changed{" "}
          {entry.storyUpdatedAt && (
            <Tooltip content={formatAbsoluteDate(entry.storyUpdatedAt)}>
              <span className="underline decoration-dotted underline-offset-2">
                {relativeDate(entry.storyUpdatedAt)}
              </span>
            </Tooltip>
          )}{" "}
          — after this {entry.source === "saved" ? "doc was saved" : "draft was generated"}.
          It may no longer cover the story; review or regenerate before saving.
        </InlineAlert>
      )}
      {entry.error && <InlineAlert variant="error">{entry.error}</InlineAlert>}
      {conflictMessage && (
        <InlineAlert variant="warning">
          Saved in Bridge, but the Jira push hit a conflict: {conflictMessage} Resolve it
          from the ticket&apos;s description editor.
        </InlineAlert>
      )}
      {/* Toolbar: version chips (regenerations pile up next to the older doc;
          the PO switches, compares, then accepts ONE — Save discards the rest)
          plus the rendered/edit toggle. */}
      {entry.status === "ready" && (
        <div
          className="flex shrink-0 items-center gap-1.5 border-b border-border-subtle pb-2.5"
          data-testid="test-doc-toolbar"
        >
          {entry.source === "saved" && entry.cachedAt && (
            // The timestamp lives in the tooltip (absolute + relative); the
            // toolbar only carries the quiet state chip.
            <Tooltip content={`Saved ${formatAbsoluteDate(entry.cachedAt)} · ${relativeDate(entry.cachedAt)}`}>
              <span
                data-testid="test-doc-saved-at"
                className="inline-flex items-center gap-1.5 rounded-md bg-overlay-subtle px-2 py-0.5 text-caption font-medium text-text-tertiary"
              >
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-status-success)]" />
                Saved
              </span>
            </Tooltip>
          )}
          {(entry.source === "draft" || entry.source === "fresh") && (
            // Unsaved draft: the quiet counterpart to the Saved chip. Amber-tinted
            // so it reads as "attention" without shouting; the generated timestamp
            // (absolute) lives in the tooltip, the relative age on the chip.
            <Tooltip
              content={
                entry.cachedAt
                  ? `Generated ${formatAbsoluteDate(entry.cachedAt)} · ${relativeDate(entry.cachedAt)}`
                  : "Not saved yet"
              }
            >
              <span
                data-testid="test-doc-not-saved"
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-status-warning-subtle)] px-2 py-0.5 text-caption font-medium text-[var(--color-status-warning)]"
              >
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-status-warning)]" />
                Not saved yet{entry.cachedAt ? ` · ${relativeDate(entry.cachedAt)}` : ""}
              </span>
            </Tooltip>
          )}
          {entry.versions.length > 1 && (
            <span className="flex items-center gap-1.5" data-testid="test-doc-versions">
              {entry.versions.map((v, i) => (
                <CaptionButton
                  key={`${i}-${v.label}`}
                  variant="chip"
                  active={i === entry.activeVersion}
                  onClick={() => onSwitchVersion(i)}
                >
                  {v.label}
                </CaptionButton>
              ))}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            {entry.versions.length > 1 && (
              <CaptionButton onClick={onToggleCompare}>
                {compare ? "Close compare" : "Compare"}
              </CaptionButton>
            )}
            {/* Segmented mode switch: the ACTIVE chip shows the current mode
                (a single flipping label reads as the destination, not the state). */}
            <span role="group" aria-label="View mode" className="flex items-center gap-0.5 rounded-lg bg-overlay-subtle p-0.5">
              <CaptionButton variant="chip" active={!editing} onClick={() => { if (editing) onToggleEdit(); }}>
                Preview
              </CaptionButton>
              <CaptionButton variant="chip" active={editing} onClick={() => { if (!editing) onToggleEdit(); }}>
                Edit
              </CaptionButton>
            </span>
          </span>
        </div>
      )}
      {entry.status === "not_needed" ? (
        // Explicit PO marker (BRDG-467): distinct from the empty state so a
        // marked ticket is never mistaken for one that simply has no doc yet.
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 text-text-tertiary"
          data-testid="test-doc-not-needed"
        >
          <FileX2 size={20} strokeWidth={1.75} className="text-text-muted" />
          <p className="text-body-sm">
            Marked as not needing test documentation
            {entry.notNeededAt ? ` ${new Date(entry.notNeededAt).toLocaleString()}` : ""}.
          </p>
          <p className="max-w-[340px] text-center text-body-sm text-text-muted">
            This ticket is skipped in the sprint doc and the missing overview.
            Remove the marker below, or generate a doc anyway.
          </p>
          <Button variant="secondary" size="md" onClick={onGenerate}>
            Generate test doc anyway
          </Button>
        </div>
      ) : entry.status === "idle" ? (
        <div
          className="flex flex-1 flex-col items-center justify-center gap-3 text-text-tertiary"
          data-testid="test-doc-idle"
        >
          <p className="text-body-sm">No test documentation yet.</p>
          <Button variant="primary" size="md" onClick={onGenerate}>
            Generate test doc
          </Button>
        </div>
      ) : generating ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-tertiary">
          <Loader2 size={20} strokeWidth={1.75} className="animate-spin text-[var(--color-brand-400)]" />
          <p className="max-w-[320px] truncate text-body-sm" data-testid="test-doc-progress">
            {progress ?? "Starting..."}
          </p>
        </div>
      ) : compare && entry.versions.length > 1 ? (
        <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto" data-testid="test-doc-compare">
          {entry.versions.map((v, i) => (
            <div
              key={`${i}-${v.label}`}
              className={`flex min-w-[260px] flex-1 flex-col overflow-hidden rounded-xl border ${
                i === entry.activeVersion ? "border-[var(--color-brand-500)]/45" : "border-border-subtle"
              } bg-surface-base`}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-3 py-1.5">
                <span className="text-caption font-medium text-text-tertiary">{v.label}</span>
                {i !== entry.activeVersion && (
                  <button
                    type="button"
                    onClick={() => onSwitchVersion(i)}
                    className="cursor-pointer text-caption font-medium text-[var(--color-brand-400)] transition-colors duration-150 hover:text-[var(--color-brand-300)] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand-400)]"
                  >
                    Use this one
                  </button>
                )}
              </div>
              <div className="description-content min-h-0 flex-1 overflow-y-auto p-3 text-body-sm">
                {renderMarkdown(i === entry.activeVersion ? entry.doc : v.doc)}
              </div>
            </div>
          ))}
        </div>
      ) : editing ? (
        <textarea
          value={entry.doc}
          onChange={(e) => onDocChange(e.target.value)}
          spellCheck={false}
          placeholder="Generated test documentation (markdown)..."
          data-testid="test-doc-editor"
          className="min-h-0 flex-1 resize-none rounded-lg border border-border-subtle bg-surface-base p-4 font-mono text-body-sm leading-relaxed text-text-primary outline-none placeholder:text-text-muted focus:border-[var(--color-brand-500)]/45 [transition:border-color_.15s_ease]"
        />
      ) : (
        // Rendered markdown is the default reading mode; clicking it (or the
        // Edit toggle) switches to the raw editor. No box: this pane IS the
        // document page — a bounded reading column on the elevated surface.
        <div
          data-testid="test-doc-preview"
          onClick={onPreviewClick}
          title="Click to edit"
          className="min-h-0 flex-1 cursor-pointer overflow-y-auto"
        >
          <div className="description-content max-w-[680px] pb-4 pt-1">
            {entry.doc.trim()
              ? renderMarkdown(entry.doc)
              : <p className="text-body-sm text-text-muted">Empty — click to write the checks yourself.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
