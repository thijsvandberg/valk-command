"use client";

import diff from "fast-diff";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export type DiffMode = "unified" | "side-by-side";

export interface StoryDiffProps {
  oldText: string;
  newText: string;
  oldLabel?: string;
  newLabel?: string;
  mode?: DiffMode;
}

type DiffSegment = {
  type: "equal" | "insert" | "delete";
  text: string;
};

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function computeDiff(oldText: string, newText: string): DiffSegment[] {
  const rawDiff = diff(oldText, newText);
  return rawDiff.map(([op, text]) => ({
    type: op === 0 ? "equal" : op === 1 ? "insert" : "delete",
    text,
  }));
}

/**
 * Splits raw text into structural blocks (headings, list items, paragraphs)
 * while preserving blank-line boundaries. Returns blocks with their original
 * line break characters so we can reconstruct the document after diffing.
 */
function splitIntoBlocks(text: string): string[] {
  return text.split(/\n\n+/);
}

/**
 * Aligns old and new blocks for block-level diffing. Uses a simple approach:
 * diff the block arrays as joined-by-sentinel strings, then extract aligned pairs.
 * Falls back to full-text diff when block count is identical (most common case).
 */
function diffBlocks(
  oldBlocks: string[],
  newBlocks: string[],
): { old: string | null; new: string | null }[] {
  const maxLen = Math.max(oldBlocks.length, newBlocks.length);
  const pairs: { old: string | null; new: string | null }[] = [];

  for (let i = 0; i < maxLen; i++) {
    pairs.push({
      old: i < oldBlocks.length ? oldBlocks[i] : null,
      new: i < newBlocks.length ? newBlocks[i] : null,
    });
  }

  return pairs;
}

// -----------------------------------------------------------------------
// Rendering helpers
// -----------------------------------------------------------------------

function isHeading(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("##") || trimmed.startsWith("**");
}

function isListItem(line: string): boolean {
  return /^\s*(\d+\.|[-*])\s/.test(line);
}

function renderSegment(segment: DiffSegment, key: number) {
  if (segment.type === "equal") {
    return <span key={key}>{segment.text}</span>;
  }

  if (segment.type === "insert") {
    return (
      <span
        key={key}
        className="rounded-sm"
        style={{ backgroundColor: "rgba(46, 145, 73, 0.15)" }}
      >
        {segment.text}
      </span>
    );
  }

  // delete
  return (
    <span
      key={key}
      className="rounded-sm line-through"
      style={{ backgroundColor: "rgba(229, 83, 75, 0.15)" }}
    >
      {segment.text}
    </span>
  );
}

function BlockRenderer({
  segments,
  firstLine,
}: {
  segments: DiffSegment[];
  firstLine: string;
}) {
  if (isHeading(firstLine)) {
    return (
      <h3 className="mt-5 mb-2 font-[var(--font-display)] text-sm font-semibold tracking-[-0.01em] text-white/90">
        {segments.map((seg, i) => renderSegment(seg, i))}
      </h3>
    );
  }

  // Render list items line by line within the block
  if (isListItem(firstLine)) {
    return (
      <div className="space-y-0.5">
        {segments.map((seg, i) => renderSegment(seg, i))}
      </div>
    );
  }

  return (
    <p className="leading-[1.7] text-white/80">
      {segments.map((seg, i) => renderSegment(seg, i))}
    </p>
  );
}

// -----------------------------------------------------------------------
// Side-by-side renderer
// -----------------------------------------------------------------------

function SideBySideDiff({
  oldText,
  newText,
  oldLabel,
  newLabel,
}: {
  oldText: string;
  newText: string;
  oldLabel?: string;
  newLabel?: string;
}) {
  const oldBlocks = splitIntoBlocks(oldText);
  const newBlocks = splitIntoBlocks(newText);
  const pairs = diffBlocks(oldBlocks, newBlocks);

  return (
    <div data-testid="story-diff" className="space-y-1">
      <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-white/[0.06] bg-[var(--color-surface-elevated)] font-[var(--font-body)] text-sm">
        {/* Column headers */}
        <div className="sticky top-0 z-10 grid grid-cols-2 border-b border-white/[0.06] bg-[var(--color-surface-elevated)]">
          <div className="border-r border-white/[0.06] px-4 py-2 text-xs font-medium text-white/40">
            {oldLabel ?? "Old"}
          </div>
          <div className="px-4 py-2 text-xs font-medium text-white/40">
            {newLabel ?? "New"}
          </div>
        </div>

        {pairs.map((pair, blockIdx) => (
          <div
            key={blockIdx}
            className="grid grid-cols-2 border-b border-white/[0.04] last:border-b-0"
          >
            {/* Left column (old) */}
            <div className="border-r border-white/[0.06] px-4 py-3 leading-[1.7] text-white/70">
              {pair.old !== null ? (
                pair.new !== null ? (
                  computeDiff(pair.old, pair.new)
                    .filter((seg) => seg.type !== "insert")
                    .map((seg, i) => renderSegment(seg, i))
                ) : (
                  <span
                    className="rounded-sm line-through"
                    style={{ backgroundColor: "rgba(229, 83, 75, 0.15)" }}
                  >
                    {pair.old}
                  </span>
                )
              ) : (
                <span className="text-white/10">&mdash;</span>
              )}
            </div>

            {/* Right column (new) */}
            <div className="px-4 py-3 leading-[1.7] text-white/70">
              {pair.new !== null ? (
                pair.old !== null ? (
                  computeDiff(pair.old, pair.new)
                    .filter((seg) => seg.type !== "delete")
                    .map((seg, i) => renderSegment(seg, i))
                ) : (
                  <span
                    className="rounded-sm"
                    style={{ backgroundColor: "rgba(46, 145, 73, 0.15)" }}
                  >
                    {pair.new}
                  </span>
                )
              ) : (
                <span className="text-white/10">&mdash;</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------

export function StoryDiff({ oldText, newText, oldLabel, newLabel, mode = "unified" }: StoryDiffProps) {
  // Handle empty descriptions
  if (oldText === "" && newText === "") {
    return (
      <div
        data-testid="story-diff-empty"
        className="rounded-lg border border-white/[0.06] bg-[var(--color-surface-elevated)] p-5"
      >
        <p className="font-[var(--font-body)] text-sm text-white/40">
          No content in either version.
        </p>
      </div>
    );
  }

  if (oldText === newText) {
    return (
      <div
        data-testid="story-diff-identical"
        className="rounded-lg border border-white/[0.06] bg-[var(--color-surface-elevated)] p-5"
      >
        <p className="font-[var(--font-body)] text-sm text-white/40">
          No changes between versions.
        </p>
      </div>
    );
  }

  // When old is empty, show all new text as added
  if (oldText === "") {
    return (
      <div data-testid="story-diff" className="space-y-1">
        {(oldLabel || newLabel) && (
          <div className="mb-4 flex items-center gap-3 text-xs text-white/40">
            {oldLabel && <span>{oldLabel}</span>}
            {oldLabel && newLabel && <span className="text-white/20">&rarr;</span>}
            {newLabel && <span>{newLabel}</span>}
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-white/[0.06] bg-[var(--color-surface-elevated)] p-5 font-[var(--font-body)] text-sm">
          <p className="mb-2 text-xs text-white/30">All content is new</p>
          <div className="rounded-sm leading-[1.7] text-white/80" style={{ backgroundColor: "rgba(46, 145, 73, 0.15)" }}>
            {newText}
          </div>
        </div>
      </div>
    );
  }

  // When new is empty, show all old text as removed
  if (newText === "") {
    return (
      <div data-testid="story-diff" className="space-y-1">
        {(oldLabel || newLabel) && (
          <div className="mb-4 flex items-center gap-3 text-xs text-white/40">
            {oldLabel && <span>{oldLabel}</span>}
            {oldLabel && newLabel && <span className="text-white/20">&rarr;</span>}
            {newLabel && <span>{newLabel}</span>}
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-white/[0.06] bg-[var(--color-surface-elevated)] p-5 font-[var(--font-body)] text-sm">
          <p className="mb-2 text-xs text-white/30">All content was removed</p>
          <div className="rounded-sm leading-[1.7] text-white/80 line-through" style={{ backgroundColor: "rgba(229, 83, 75, 0.15)" }}>
            {oldText}
          </div>
        </div>
      </div>
    );
  }

  // Side-by-side mode delegates to a separate renderer
  if (mode === "side-by-side") {
    return (
      <SideBySideDiff
        oldText={oldText}
        newText={newText}
        oldLabel={oldLabel}
        newLabel={newLabel}
      />
    );
  }

  const oldBlocks = splitIntoBlocks(oldText);
  const newBlocks = splitIntoBlocks(newText);
  const pairs = diffBlocks(oldBlocks, newBlocks);

  return (
    <div data-testid="story-diff" className="space-y-1">
      {(oldLabel || newLabel) && (
        <div className="mb-4 flex items-center gap-3 text-xs text-white/40">
          {oldLabel && <span>{oldLabel}</span>}
          {oldLabel && newLabel && <span className="text-white/20">&rarr;</span>}
          {newLabel && <span>{newLabel}</span>}
        </div>
      )}

      <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-white/[0.06] bg-[var(--color-surface-elevated)] p-5 font-[var(--font-body)] text-sm">
        {pairs.map((pair, blockIdx) => {
          // New block that didn't exist before
          if (pair.old === null && pair.new !== null) {
            const segments: DiffSegment[] = [{ type: "insert", text: pair.new }];
            return (
              <BlockRenderer
                key={blockIdx}
                segments={segments}
                firstLine={pair.new.split("\n")[0]}
              />
            );
          }

          // Deleted block
          if (pair.old !== null && pair.new === null) {
            const segments: DiffSegment[] = [{ type: "delete", text: pair.old }];
            return (
              <BlockRenderer
                key={blockIdx}
                segments={segments}
                firstLine={pair.old.split("\n")[0]}
              />
            );
          }

          // Both exist: compute word-level diff
          if (pair.old !== null && pair.new !== null) {
            const segments = computeDiff(pair.old, pair.new);
            const firstLine = (pair.new || pair.old || "").split("\n")[0];
            return (
              <BlockRenderer
                key={blockIdx}
                segments={segments}
                firstLine={firstLine}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
