"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import fastDiff from "fast-diff";
import { ChevronDown, Check, X, Pencil, RotateCcw } from "lucide-react";

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

export type { HunkState };

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

type HunkDecision = "pending" | "accept" | "reject" | "custom";

interface HunkState {
  decision: HunkDecision;
  customText?: string;
}

interface InteractiveCallbacks {
  states: Record<number, HunkState>;
  editingHunk: number | null;
  onAccept: (i: number) => void;
  onReject: (i: number) => void;
  onEdit: (i: number) => void;
  onSaveEdit: (i: number, text: string) => void;
  onCancelEdit: () => void;
  onReset: (i: number) => void;
  onAcceptAll: () => void;
}

// -----------------------------------------------------------------------
// Colors
// -----------------------------------------------------------------------

const C = {
  addedLineBg: "rgba(46, 160, 80, 0.12)",
  addedWordBg: "rgba(46, 160, 80, 0.35)",
  addedGutter: "#3fb950",
  deletedLineBg: "rgba(229, 83, 75, 0.10)",
  deletedWordBg: "rgba(229, 83, 75, 0.30)",
  deletedGutter: "#e5534b",
  gutterBg: "rgba(255, 255, 255, 0.02)",
  border: "rgba(255, 255, 255, 0.06)",
  modifiedBadge: "#d2a8ff",
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
    <div className="flex items-center gap-3 text-xs">
      {stats.added > 0 && (
        <span className="flex items-center gap-1" style={{ color: C.addedGutter }}>
          <span className="font-mono font-semibold">+{stats.added}</span>
          <span className="text-white/40">added</span>
        </span>
      )}
      {stats.removed > 0 && (
        <span className="flex items-center gap-1" style={{ color: C.deletedGutter }}>
          <span className="font-mono font-semibold">&minus;{stats.removed}</span>
          <span className="text-white/40">removed</span>
        </span>
      )}
      {stats.modified > 0 && (
        <span className="flex items-center gap-1" style={{ color: C.modifiedBadge }}>
          <span className="font-mono font-semibold">~{stats.modified}</span>
          <span className="text-white/40">modified</span>
        </span>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Collapsed context expander
// -----------------------------------------------------------------------

function CollapsedBar({ count, onExpand }: { count: number; onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex w-full items-center justify-center gap-1.5 border-y px-4 py-1.5 text-[11px] text-white/25 cursor-pointer hover:bg-white/[0.02] hover:text-white/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-brand-400)]"
      style={{
        borderColor: C.border,
        backgroundColor: "rgba(255, 255, 255, 0.01)",
        transition: "background-color 0.15s ease, color 0.15s ease",
      }}
    >
      <ChevronDown size={12} strokeWidth={1.5} />
      Show {count} unchanged line{count !== 1 ? "s" : ""}
    </button>
  );
}

// -----------------------------------------------------------------------
// Interactive: hunk action bar
// -----------------------------------------------------------------------

const decisionStyles: Record<HunkDecision, { label: string; color: string; bg: string; borderColor: string }> = {
  pending: { label: "", color: "", bg: "rgba(255, 255, 255, 0.015)", borderColor: C.border },
  accept: { label: "Accepted", color: C.addedGutter, bg: "rgba(46, 160, 80, 0.10)", borderColor: "rgba(46, 160, 80, 0.20)" },
  reject: { label: "Rejected", color: C.deletedGutter, bg: "rgba(229, 83, 75, 0.08)", borderColor: "rgba(229, 83, 75, 0.18)" },
  custom: { label: "Custom edit", color: C.modifiedBadge, bg: "rgba(210, 168, 255, 0.08)", borderColor: "rgba(210, 168, 255, 0.18)" },
};

function HunkActionBar({
  hunkIndex,
  decision,
  cbs,
}: {
  hunkIndex: number;
  decision: HunkDecision;
  cbs: InteractiveCallbacks;
}) {
  const st = decisionStyles[decision];
  const decided = decision !== "pending";
  const btnBase =
    "flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97] disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div
      className="flex items-center border-y"
      style={{ borderColor: st.borderColor, backgroundColor: st.bg }}
    >
      {/* Gutter spacer to align with diff content */}
      <div className="w-[100px] shrink-0" style={{ backgroundColor: C.gutterBg }} />

      <div className="flex flex-1 items-center gap-1 px-2 py-1.5">
        {decided ? (
          <>
            <span
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold"
              style={{ color: st.color }}
            >
              {decision === "accept" && <Check size={12} strokeWidth={2.5} />}
              {decision === "reject" && <X size={12} strokeWidth={2.5} />}
              {decision === "custom" && <Pencil size={11} strokeWidth={2} />}
              {st.label}
            </span>
            <button
              type="button"
              onClick={() => cbs.onReset(hunkIndex)}
              className={`${btnBase} ml-auto text-white/30 hover:bg-white/[0.06] hover:text-white/50`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              title="Clear decision"
            >
              <X size={11} strokeWidth={1.5} />
              Clear
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => cbs.onAccept(hunkIndex)}
              className={`${btnBase} text-white/50 hover:bg-[rgba(46,160,80,0.12)] hover:text-[${C.addedGutter}]`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              title="Accept new version"
            >
              <Check size={12} strokeWidth={2} />
              Accept
            </button>
            <button
              type="button"
              onClick={() => cbs.onReject(hunkIndex)}
              className={`${btnBase} text-white/50 hover:bg-[rgba(229,83,75,0.10)] hover:text-[${C.deletedGutter}]`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              title="Keep old version"
            >
              <X size={12} strokeWidth={2} />
              Reject
            </button>
            <button
              type="button"
              onClick={() => cbs.onEdit(hunkIndex)}
              className={`${btnBase} text-white/50 hover:bg-white/[0.06] hover:text-white/70`}
              style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
              title="Edit this section"
            >
              <Pencil size={11} strokeWidth={1.5} />
              Edit
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------
// Interactive: hunk inline editor
// -----------------------------------------------------------------------

function HunkEditor({
  initialText,
  onSave,
  onCancel,
}: {
  initialText: string;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, []);

  return (
    <div className="border-y px-3 py-3" style={{ borderColor: C.border, backgroundColor: "rgba(210, 168, 255, 0.03)" }}>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        className="w-full resize-none rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-2 font-mono text-sm leading-6 text-white/70 placeholder:text-white/20 focus:border-[var(--color-brand-500)]/40 focus:outline-none"
        rows={3}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSave(text)}
          className="rounded-md bg-[var(--color-brand-600)] px-3 py-1 text-xs font-medium text-white cursor-pointer hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
          style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
        >
          Save edit
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1 text-xs font-medium text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          style={{ transition: "background-color 0.15s ease, color 0.15s ease" }}
        >
          Cancel
        </button>
      </div>
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
    <div className="flex text-[13px] leading-6" style={{ backgroundColor: bg }}>
      <div
        className="flex w-5 shrink-0 select-none items-center justify-center font-mono text-[11px] font-bold"
        style={{ color: markerColor, backgroundColor: C.gutterBg }}
        data-marker={line.type !== "equal" ? line.type : undefined}
      >
        {marker}
      </div>
      {showLineNumbers && (
        <>
          <div
            className="w-10 shrink-0 select-none pr-2 text-right font-mono text-[11px] text-white/15"
            style={{ backgroundColor: C.gutterBg }}
          >
            {line.oldLineNum ?? ""}
          </div>
          <div
            className="w-10 shrink-0 select-none pr-2 text-right font-mono text-[11px] text-white/15"
            style={{ backgroundColor: C.gutterBg }}
          >
            {line.newLineNum ?? ""}
          </div>
        </>
      )}
      <div
        className={`min-w-0 flex-1 whitespace-pre-wrap break-words px-3 py-px font-[var(--font-body)] text-sm ${
          line.type === "delete" ? "text-white/60" : "text-white/70"
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
      <div className="flex h-full text-[13px] leading-6" style={{ backgroundColor: "rgba(255, 255, 255, 0.01)" }}>
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
    <div className="flex text-[13px] leading-6" style={{ backgroundColor: bg }}>
      <div className="flex w-5 shrink-0 select-none items-center justify-center font-mono text-[11px] font-bold" style={{ color: markerColor, backgroundColor: C.gutterBg }}>
        {marker}
      </div>
      {showLineNumbers && (
        <div className="w-10 shrink-0 select-none pr-2 text-right font-mono text-[11px] text-white/15" style={{ backgroundColor: C.gutterBg }}>
          {num ?? ""}
        </div>
      )}
      <div className={`min-w-0 flex-1 whitespace-pre-wrap break-words px-3 py-px font-[var(--font-body)] text-sm ${line.type === "delete" ? "text-white/60" : "text-white/70"}`}>
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
        <div className="px-4 py-2 text-xs font-medium text-white/40" style={{ borderRight: `1px solid ${C.border}` }}>{oldLabel ?? "Old"}</div>
        <div className="px-4 py-2 text-xs font-medium text-white/40">{newLabel ?? "New"}</div>
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

export function StoryDiff({
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
}: StoryDiffProps) {
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
      <div data-testid="story-diff-empty" className="rounded-lg border border-white/[0.06] bg-[var(--color-surface-elevated)] p-5">
        <p className="font-[var(--font-body)] text-sm text-white/40">No content in either version.</p>
      </div>
    );
  }

  if (oldText === newText) {
    return (
      <div data-testid="story-diff-identical" className="rounded-lg border border-white/[0.06] bg-[var(--color-surface-elevated)] p-5">
        <p className="font-[var(--font-body)] text-sm text-white/40">No changes between versions.</p>
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
          <button
            type="button"
            onClick={onAcceptAll}
            className="flex items-center gap-1 rounded-md bg-[var(--color-brand-600)]/15 px-2.5 py-1 text-[11px] font-medium text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/20 cursor-pointer hover:bg-[var(--color-brand-600)]/25 active:scale-95 transition-transform duration-150"
          >
            <Check size={11} strokeWidth={2} />
            Accept {pendingHunkCount} remaining
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowLineNumbers((v) => !v)}
          title={showLineNumbers ? "Hide line numbers" : "Show line numbers"}
          className={`ml-auto flex items-center gap-1 rounded px-2 py-1 text-[11px] font-mono cursor-pointer transition-colors duration-150 ${
            showLineNumbers
              ? "text-white/50 bg-white/[0.06]"
              : "text-white/25 hover:text-white/45 hover:bg-white/[0.04]"
          }`}
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
}
