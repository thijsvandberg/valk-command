"use client";

import { useState, useMemo, useCallback, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import fastDiff from "fast-diff";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { HunkActionBar, type HunkDecision, type HunkState, type InteractiveCallbacks } from "./HunkActionBar";
import { HunkEditor } from "./HunkEditor";
import { CollapsedBar } from "./CollapsedBar";

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
  interactive?: boolean;
  onResultChange?: (text: string) => void;
  /** Reports computed diff stats to the parent whenever they change */
  onStatsComputed?: (stats: { added: number; removed: number; modified: number; changeHunkCount: number; decidedCount: number }) => void;
  /** Controlled hunk decisions (lifted state). When provided, component uses this instead of internal state. */
  hunkStates?: Record<number, HunkState>;
  onHunkStatesChange?: (states: Record<number, HunkState>) => void;
  /**
   * When true, undecided hunks default to keeping the OLD text instead of accepting the new.
   * Used for live-patching mode: start from the current draft and only apply explicitly accepted hunks.
   * onResultChange fires only after the first explicit user decision (not on mount).
   */
  pendingIsOld?: boolean;
}

export type { HunkState, HunkDecision, InteractiveCallbacks } from "./HunkActionBar";

export interface StoryDiffHandle {
  acceptAll: () => void;
}

type LineType = "equal" | "insert" | "delete";

interface DiffLine {
  type: LineType;
  text: string;
  oldLineNum?: number;
  newLineNum?: number;
  wordSegments?: WordSegment[];
}

interface WordSegment {
  type: "equal" | "insert" | "delete";
  text: string;
}

interface DiffHunk {
  kind: "change" | "collapsed";
  lines: DiffLine[];
  collapsedCount: number;
}

interface DiffStats {
  added: number;
  removed: number;
  modified: number;
}

// -----------------------------------------------------------------------
// Colors (rendering-only subset; interactive colors live in HunkActionBar)
// -----------------------------------------------------------------------

const C = {
  addedLineBg: "var(--color-diff-added-line)",
  addedWordBg: "var(--color-diff-added-word)",
  addedGutter: "var(--color-diff-added-gutter)",
  deletedLineBg: "var(--color-diff-deleted-line)",
  deletedWordBg: "var(--color-diff-deleted-word)",
  deletedGutter: "var(--color-diff-deleted-gutter)",
  gutterBg: "var(--color-overlay-subtle)",
  border: "var(--color-border-strong)",
  modifiedBadge: "var(--color-diff-modified-badge)",
} as const;

// -----------------------------------------------------------------------
// Algorithm: LCS-based line diff
// -----------------------------------------------------------------------

function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const m = oldLines.length;
  const n = newLines.length;

  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) dp[i] = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const ops: Array<{ type: LineType; oldIdx?: number; newIdx?: number }> = [];
  let i = m,
    j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      ops.push({ type: "equal", oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.push({ type: "insert", newIdx: j - 1 });
      j--;
    } else {
      ops.push({ type: "delete", oldIdx: i - 1 });
      i--;
    }
  }
  ops.reverse();

  let oldNum = 0;
  let newNum = 0;
  return ops.map((op) => {
    if (op.type === "equal") {
      oldNum++;
      newNum++;
      return { type: "equal" as const, text: oldLines[op.oldIdx!], oldLineNum: oldNum, newLineNum: newNum };
    }
    if (op.type === "delete") {
      oldNum++;
      return { type: "delete" as const, text: oldLines[op.oldIdx!], oldLineNum: oldNum };
    }
    newNum++;
    return { type: "insert" as const, text: newLines[op.newIdx!], newLineNum: newNum };
  });
}

// -----------------------------------------------------------------------
// Algorithm: word-level highlights
// -----------------------------------------------------------------------

function computeWordHighlights(oldLine: string, newLine: string) {
  const raw = fastDiff(oldLine, newLine);
  const oldSegs: WordSegment[] = [];
  const newSegs: WordSegment[] = [];
  for (const [op, text] of raw) {
    if (op === 0) {
      oldSegs.push({ type: "equal", text });
      newSegs.push({ type: "equal", text });
    } else if (op === -1) {
      oldSegs.push({ type: "delete", text });
    } else {
      newSegs.push({ type: "insert", text });
    }
  }
  return { oldSegs, newSegs };
}

function addWordHighlights(lines: DiffLine[]): DiffLine[] {
  const result = lines.map((l) => ({ ...l }));
  let idx = 0;
  while (idx < result.length) {
    const delStart = idx;
    while (idx < result.length && result[idx].type === "delete") idx++;
    const delEnd = idx;
    const insStart = idx;
    while (idx < result.length && result[idx].type === "insert") idx++;
    const insEnd = idx;
    const dc = delEnd - delStart;
    const ic = insEnd - insStart;
    if (dc > 0 && ic > 0) {
      const pairs = Math.min(dc, ic);
      for (let p = 0; p < pairs; p++) {
        const { oldSegs, newSegs } = computeWordHighlights(
          result[delStart + p].text,
          result[insStart + p].text,
        );
        result[delStart + p].wordSegments = oldSegs;
        result[insStart + p].wordSegments = newSegs;
      }
    }
    if (dc === 0 && ic === 0) idx++;
  }
  return result;
}

// -----------------------------------------------------------------------
// Algorithm: group into hunks
// -----------------------------------------------------------------------

const CTX = 3;

function groupIntoHunks(lines: DiffLine[]): DiffHunk[] {
  // Find contiguous groups of changed lines
  const changeGroups: [number, number][] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].type !== "equal") {
      const start = i;
      while (i < lines.length && lines[i].type !== "equal") i++;
      changeGroups.push([start, i - 1]);
    } else {
      i++;
    }
  }

  if (changeGroups.length === 0) {
    return lines.length > 0
      ? [{ kind: "collapsed", lines: [], collapsedCount: lines.length }]
      : [];
  }

  // Each change group becomes its own hunk (never merged) with up to CTX context
  const hunks: DiffHunk[] = [];
  let cursor = 0;

  for (let g = 0; g < changeGroups.length; g++) {
    const [gs, ge] = changeGroups[g];

    const ctxBefore = Math.min(CTX, gs - cursor);
    const hunkStart = gs - ctxBefore;

    const nextChangeStart = g + 1 < changeGroups.length ? changeGroups[g + 1][0] : lines.length;
    const ctxAfter = Math.min(CTX, nextChangeStart - (ge + 1));
    const hunkEnd = ge + ctxAfter;

    if (hunkStart > cursor) {
      const collapsed = lines.slice(cursor, hunkStart);
      hunks.push({ kind: "collapsed", lines: collapsed, collapsedCount: collapsed.length });
    }

    hunks.push({ kind: "change", lines: lines.slice(hunkStart, hunkEnd + 1), collapsedCount: 0 });
    cursor = hunkEnd + 1;
  }

  if (cursor < lines.length) {
    const collapsed = lines.slice(cursor);
    hunks.push({ kind: "collapsed", lines: collapsed, collapsedCount: collapsed.length });
  }

  return hunks;
}

// -----------------------------------------------------------------------
// Stats
// -----------------------------------------------------------------------

function computeStats(lines: DiffLine[]): DiffStats {
  let added = 0, removed = 0, modified = 0;
  let idx = 0;
  while (idx < lines.length) {
    if (lines[idx].type === "equal") { idx++; continue; }
    let d = 0, ins = 0;
    while (idx < lines.length && lines[idx].type === "delete") { d++; idx++; }
    while (idx < lines.length && lines[idx].type === "insert") { ins++; idx++; }
    const paired = Math.min(d, ins);
    modified += paired;
    removed += d - paired;
    added += ins - paired;
  }
  return { added, removed, modified };
}

// -----------------------------------------------------------------------
// Interactive: result computation
// -----------------------------------------------------------------------

function getHunkNewText(hunk: DiffHunk): string {
  return hunk.lines
    .filter((l) => l.type === "equal" || l.type === "insert")
    .map((l) => l.text)
    .join("\n");
}

function getHunkOldText(hunk: DiffHunk): string {
  return hunk.lines
    .filter((l) => l.type === "equal" || l.type === "delete")
    .map((l) => l.text)
    .join("\n");
}

function computeResultText(
  hunks: DiffHunk[],
  states: Record<number, HunkState>,
  pendingIsOld = false,
): string {
  const parts: string[] = [];
  hunks.forEach((hunk, i) => {
    if (hunk.kind === "collapsed") {
      parts.push(hunk.lines.map((l) => l.text).join("\n"));
      return;
    }
    const st = states[i];
    const d = st?.decision ?? (pendingIsOld ? "reject" : "accept");
    if (d === "reject") {
      parts.push(getHunkOldText(hunk));
    } else if (d === "custom" && st?.customText !== undefined) {
      parts.push(st.customText);
    } else {
      parts.push(getHunkNewText(hunk));
    }
  });
  return parts.join("\n");
}

// -----------------------------------------------------------------------
// Rendering helpers
// -----------------------------------------------------------------------

function WordSegments({ segments, lineType }: { segments: WordSegment[]; lineType: "delete" | "insert" }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "equal") return <span key={i}>{seg.text}</span>;
        const bg = seg.type === "delete" ? C.deletedWordBg : C.addedWordBg;
        return (
          <span key={i} className="rounded-sm" style={{ backgroundColor: bg }}>
            {seg.text}
          </span>
        );
      })}
    </>
  );
}

function LineContent({ line }: { line: DiffLine }) {
  if (line.wordSegments) {
    return <WordSegments segments={line.wordSegments} lineType={line.type as "delete" | "insert"} />;
  }
  return <>{line.text || "\u00A0"}</>;
}

// -----------------------------------------------------------------------
// Summary bar
// -----------------------------------------------------------------------

function DiffSummary({ stats }: { stats: DiffStats }) {
  if (stats.added === 0 && stats.removed === 0 && stats.modified === 0) return null;
  return (
    <div className="flex items-center gap-3 text-body-sm">
      {stats.added > 0 && (
        <span className="flex items-center gap-1" style={{ color: C.addedGutter }}>
          <span className="font-mono font-semibold">+{stats.added}</span>
          <span className="text-text-tertiary">added</span>
        </span>
      )}
      {stats.removed > 0 && (
        <span className="flex items-center gap-1" style={{ color: C.deletedGutter }}>
          <span className="font-mono font-semibold">&minus;{stats.removed}</span>
          <span className="text-text-tertiary">removed</span>
        </span>
      )}
      {stats.modified > 0 && (
        <span className="flex items-center gap-1" style={{ color: C.modifiedBadge }}>
          <span className="font-mono font-semibold">~{stats.modified}</span>
          <span className="text-text-tertiary">modified</span>
        </span>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Unified diff
// -----------------------------------------------------------------------

function UnifiedLine({ line, showLineNumbers }: { line: DiffLine; showLineNumbers: boolean }) {
  const bg =
    line.type === "insert"
      ? C.addedLineBg
      : line.type === "delete"
        ? C.deletedLineBg
        : "transparent";
  const marker =
    line.type === "insert" ? "+" : line.type === "delete" ? "\u2212" : "";
  const markerColor =
    line.type === "insert"
      ? C.addedGutter
      : line.type === "delete"
        ? C.deletedGutter
        : "transparent";

  return (
    <div className="flex text-body leading-6" style={{ backgroundColor: bg }}>
      <div
        className="flex w-5 shrink-0 select-none items-center justify-center font-mono text-label font-bold"
        style={{ color: markerColor, backgroundColor: C.gutterBg }}
        data-marker={line.type !== "equal" ? line.type : undefined}
      >
        {marker}
      </div>
      {showLineNumbers && (
        <>
          <div
            className="w-10 shrink-0 select-none pr-2 text-right font-mono text-label text-text-muted"
            style={{ backgroundColor: C.gutterBg }}
          >
            {line.oldLineNum ?? ""}
          </div>
          <div
            className="w-10 shrink-0 select-none pr-2 text-right font-mono text-label text-text-muted"
            style={{ backgroundColor: C.gutterBg }}
          >
            {line.newLineNum ?? ""}
          </div>
        </>
      )}
      <div
        className={`min-w-0 flex-1 whitespace-pre-wrap break-words px-3 py-px font-[var(--font-body)] text-body-lg ${
          line.type === "delete" ? "text-text-secondary" : "text-text-secondary"
        }`}
      >
        <LineContent line={line} />
      </div>
    </div>
  );
}

function UnifiedDiff({ hunks, interactive, showLineNumbers }: { hunks: DiffHunk[]; interactive?: InteractiveCallbacks; showLineNumbers: boolean }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = useCallback((i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: C.border }}>
      {hunks.map((h, hi) => {
        if (h.kind === "collapsed" && !expanded.has(hi)) {
          return <CollapsedBar key={hi} count={h.collapsedCount} onExpand={() => toggle(hi)} />;
        }

        const decision = interactive?.states[hi]?.decision ?? "pending";
        const isEditing = interactive?.editingHunk === hi;

        return (
          <div key={hi}>
            {h.lines.map((line, li) => (
              <UnifiedLine key={`${hi}-${li}`} line={line} showLineNumbers={showLineNumbers} />
            ))}
            {interactive && h.kind === "change" && !isEditing && (
              <HunkActionBar hunkIndex={hi} decision={decision} cbs={interactive} />
            )}
            {interactive && isEditing && (
              <HunkEditor
                initialText={getHunkNewText(h)}
                onSave={(text) => interactive.onSaveEdit(hi, text)}
                onCancel={() => interactive.onCancelEdit()}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------
// Split diff
// -----------------------------------------------------------------------

interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

function buildSplitRows(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let idx = 0;
  while (idx < lines.length) {
    if (lines[idx].type === "equal") {
      rows.push({ left: lines[idx], right: lines[idx] });
      idx++;
      continue;
    }
    const dels: DiffLine[] = [];
    const ins: DiffLine[] = [];
    while (idx < lines.length && lines[idx].type === "delete") { dels.push(lines[idx]); idx++; }
    while (idx < lines.length && lines[idx].type === "insert") { ins.push(lines[idx]); idx++; }
    const max = Math.max(dels.length, ins.length);
    for (let j = 0; j < max; j++) {
      rows.push({
        left: j < dels.length ? dels[j] : null,
        right: j < ins.length ? ins[j] : null,
      });
    }
  }
  return rows;
}

function SplitCell({ line, side, showLineNumbers }: { line: DiffLine | null; side: "left" | "right"; showLineNumbers: boolean }) {
  if (!line) {
    return (
      <div className="flex h-full text-body leading-6" style={{ backgroundColor: "var(--color-overlay-subtle)" }}>
        <div className="w-5 shrink-0" style={{ backgroundColor: C.gutterBg }} />
        {showLineNumbers && <div className="w-10 shrink-0" style={{ backgroundColor: C.gutterBg }} />}
        <div className="min-w-0 flex-1 px-3 py-px">&nbsp;</div>
      </div>
    );
  }
  const bg = line.type === "insert" ? C.addedLineBg : line.type === "delete" ? C.deletedLineBg : "transparent";
  const marker = line.type === "insert" ? "+" : line.type === "delete" ? "\u2212" : "";
  const markerColor = line.type === "insert" ? C.addedGutter : line.type === "delete" ? C.deletedGutter : "transparent";
  const num = side === "left" ? line.oldLineNum : line.newLineNum;

  return (
    <div className="flex text-body leading-6" style={{ backgroundColor: bg }}>
      <div className="flex w-5 shrink-0 select-none items-center justify-center font-mono text-label font-bold" style={{ color: markerColor, backgroundColor: C.gutterBg }}>
        {marker}
      </div>
      {showLineNumbers && (
        <div className="w-10 shrink-0 select-none pr-2 text-right font-mono text-label text-text-muted" style={{ backgroundColor: C.gutterBg }}>
          {num ?? ""}
        </div>
      )}
      <div className={`min-w-0 flex-1 whitespace-pre-wrap break-words px-3 py-px font-[var(--font-body)] text-body-lg ${line.type === "delete" ? "text-text-secondary" : "text-text-secondary"}`}>
        <LineContent line={line} />
      </div>
    </div>
  );
}

function SplitDiff({
  hunks,
  oldLabel,
  newLabel,
  interactive,
  showLineNumbers,
}: {
  hunks: DiffHunk[];
  oldLabel?: string;
  newLabel?: string;
  interactive?: InteractiveCallbacks;
  showLineNumbers: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = useCallback((i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: C.border }}>
      <div className="sticky top-0 z-10 grid grid-cols-2 bg-[var(--color-surface-elevated)]" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="px-4 py-2 text-body-sm font-medium text-text-tertiary" style={{ borderRight: `1px solid ${C.border}` }}>{oldLabel ?? "Old"}</div>
        <div className="px-4 py-2 text-body-sm font-medium text-text-tertiary">{newLabel ?? "New"}</div>
      </div>

      {hunks.map((h, hi) => {
        if (h.kind === "collapsed" && !expanded.has(hi)) {
          return <CollapsedBar key={hi} count={h.collapsedCount} onExpand={() => toggle(hi)} />;
        }
        const rows = buildSplitRows(h.lines);
        const decision = interactive?.states[hi]?.decision ?? "pending";
        const isEditing = interactive?.editingHunk === hi;

        return (
          <div key={hi}>
            {rows.map((row, ri) => (
              <div key={`${hi}-${ri}`} className="grid grid-cols-2">
                <div style={{ borderRight: `1px solid ${C.border}` }}><SplitCell line={row.left} side="left" showLineNumbers={showLineNumbers} /></div>
                <div><SplitCell line={row.right} side="right" showLineNumbers={showLineNumbers} /></div>
              </div>
            ))}
            {interactive && h.kind === "change" && !isEditing && (
              <HunkActionBar hunkIndex={hi} decision={decision} cbs={interactive} />
            )}
            {interactive && isEditing && (
              <HunkEditor
                initialText={getHunkNewText(h)}
                onSave={(text) => interactive.onSaveEdit(hi, text)}
                onCancel={() => interactive.onCancelEdit()}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------

export const StoryDiff = forwardRef<StoryDiffHandle, StoryDiffProps>(function StoryDiff({
  oldText,
  newText,
  oldLabel,
  newLabel,
  mode = "unified",
  interactive = false,
  onResultChange,
  onStatsComputed,
  hunkStates: controlledHunkStates,
  onHunkStatesChange,
  pendingIsOld = false,
}, ref) {
  const { hunks, stats } = useMemo(() => {
    if (oldText === newText || (oldText === "" && newText === "")) {
      return { hunks: [] as DiffHunk[], stats: { added: 0, removed: 0, modified: 0 } };
    }
    const raw = computeLineDiff(oldText, newText);
    const withHL = addWordHighlights(raw);
    return {
      hunks: groupIntoHunks(withHL),
      stats: computeStats(withHL),
    };
  }, [oldText, newText]);

  // Interactive state: use controlled props when available, fallback to internal
  const [internalHunkStates, setInternalHunkStates] = useState<Record<number, HunkState>>({});
  const [editingHunk, setEditingHunk] = useState<number | null>(null);
  const [showLineNumbers, setShowLineNumbers] = useState(false);

  // In pendingIsOld mode, only fire onResultChange after the first explicit user decision
  // to avoid overwriting the draft on mount with the base text.
  const hasDecided = useRef(false);

  const hunkStates = controlledHunkStates ?? internalHunkStates;
  const setHunkStates = useCallback((updater: Record<number, HunkState> | ((prev: Record<number, HunkState>) => Record<number, HunkState>)) => {
    const next = typeof updater === "function" ? updater(controlledHunkStates ?? internalHunkStates) : updater;
    if (onHunkStatesChange) {
      onHunkStatesChange(next);
    } else {
      setInternalHunkStates(next);
    }
  }, [controlledHunkStates, internalHunkStates, onHunkStatesChange]);

  const onAccept = useCallback((i: number) => {
    hasDecided.current = true;
    setHunkStates((prev) => ({ ...prev, [i]: { decision: "accept" } }));
    setEditingHunk(null);
  }, [setHunkStates]);
  const onReject = useCallback((i: number) => {
    hasDecided.current = true;
    setHunkStates((prev) => ({ ...prev, [i]: { decision: "reject" } }));
    setEditingHunk(null);
  }, [setHunkStates]);
  const onEdit = useCallback((i: number) => {
    setEditingHunk(i);
  }, []);
  const onSaveEdit = useCallback((i: number, text: string) => {
    hasDecided.current = true;
    setHunkStates((prev) => ({ ...prev, [i]: { decision: "custom", customText: text } }));
    setEditingHunk(null);
  }, [setHunkStates]);
  const onCancelEdit = useCallback(() => {
    setEditingHunk(null);
  }, []);
  const onReset = useCallback((i: number) => {
    hasDecided.current = true;
    setHunkStates((prev) => {
      const next = { ...prev };
      delete next[i];
      return next;
    });
  }, [setHunkStates]);

  const onAcceptAll = useCallback(() => {
    hasDecided.current = true;
    const next = { ...hunkStates };
    hunks.forEach((hunk, i) => {
      if (hunk.kind === "change" && !next[i]) {
        next[i] = { decision: "accept" };
      }
    });
    setHunkStates(next);
  }, [hunks, hunkStates, setHunkStates]);

  useImperativeHandle(ref, () => ({ acceptAll: onAcceptAll }), [onAcceptAll]);

  const interactiveCallbacks: InteractiveCallbacks | undefined = interactive
    ? { states: hunkStates, editingHunk, onAccept, onReject, onEdit, onSaveEdit, onCancelEdit, onReset, onAcceptAll }
    : undefined;

  // Compute result and notify parent
  const resultText = useMemo(
    () => (interactive ? computeResultText(hunks, hunkStates, pendingIsOld) : ""),
    [interactive, hunks, hunkStates, pendingIsOld],
  );

  const changeHunkCount = useMemo(
    () => hunks.filter((h) => h.kind === "change").length,
    [hunks],
  );
  const decidedCount = Object.keys(hunkStates).length;

  useEffect(() => {
    // In pendingIsOld mode: only fire after the first explicit decision to avoid
    // overwriting localDraft on mount (when all hunks are pending = old text).
    if (interactive && onResultChange && (!pendingIsOld || hasDecided.current)) {
      onResultChange(resultText);
    }
  }, [interactive, onResultChange, resultText, pendingIsOld]);

  useEffect(() => {
    onStatsComputed?.({ ...stats, changeHunkCount, decidedCount });
  }, [stats, changeHunkCount, decidedCount, onStatsComputed]);

  if (oldText === "" && newText === "") {
    return (
      <div data-testid="story-diff-empty" className="rounded-lg border border-border-default bg-[var(--color-surface-elevated)] p-5">
        <p className="font-[var(--font-body)] text-body-lg text-text-tertiary">No content in either version.</p>
      </div>
    );
  }

  if (oldText === newText) {
    return (
      <div data-testid="story-diff-identical" className="rounded-lg border border-border-default bg-[var(--color-surface-elevated)] p-5">
        <p className="font-[var(--font-body)] text-body-lg text-text-tertiary">No changes between versions.</p>
      </div>
    );
  }

  const pendingHunkCount = hunks.filter(
    (h, i) => h.kind === "change" && !hunkStates[i],
  ).length;

  return (
    <div data-testid="story-diff" className="flex flex-col gap-2">
      {/* Toolbar: stats + accept-all + line numbers toggle */}
      <div className="flex items-center gap-3">
        <DiffSummary stats={stats} />
        {interactive && pendingIsOld && pendingHunkCount > 0 && (
          <Button
            variant="soft"
            size="sm"
            icon={<Check size={11} strokeWidth={2} />}
            onClick={onAcceptAll}
          >
            Accept {pendingHunkCount} remaining
          </Button>
        )}
        <button
          type="button"
          onClick={() => setShowLineNumbers((v) => !v)}
          title={showLineNumbers ? "Hide line numbers" : "Show line numbers"}
          className={`ml-auto flex items-center gap-1 rounded px-2 py-1 text-label font-mono cursor-pointer border transition-colors duration-150 ${
            showLineNumbers
              ? "text-text-secondary bg-overlay-strong border-border-strong"
              : "text-text-tertiary border-border-strong hover:text-text-secondary hover:border-border-strong hover:bg-hover-list-item"
          } focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`}
        >
          #
        </button>
      </div>

      {mode === "unified" ? (
        <UnifiedDiff hunks={hunks} interactive={interactiveCallbacks} showLineNumbers={showLineNumbers} />
      ) : (
        <SplitDiff hunks={hunks} oldLabel={oldLabel} newLabel={newLabel} interactive={interactiveCallbacks} showLineNumbers={showLineNumbers} />
      )}
    </div>
  );
});
