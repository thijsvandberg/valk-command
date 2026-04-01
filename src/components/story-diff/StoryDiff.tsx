"use client";

import { useState, useMemo, useCallback } from "react";
import fastDiff from "fast-diff";
import { ChevronDown } from "lucide-react";

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
// Colors: stronger contrast than the old 0.15-opacity values
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
// Algorithm: word-level highlights within paired changed lines
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
// Algorithm: group into hunks with collapsed context
// -----------------------------------------------------------------------

const CTX = 3;

function groupIntoHunks(lines: DiffLine[]): DiffHunk[] {
  const ci: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== "equal") ci.push(i);
  }

  if (ci.length === 0) {
    return lines.length > 0
      ? [{ kind: "collapsed", lines: [], collapsedCount: lines.length }]
      : [];
  }

  const ranges: [number, number][] = [];
  for (const c of ci) {
    const s = Math.max(0, c - CTX);
    const e = Math.min(lines.length - 1, c + CTX);
    if (ranges.length > 0 && s <= ranges[ranges.length - 1][1] + 1) {
      ranges[ranges.length - 1][1] = Math.max(ranges[ranges.length - 1][1], e);
    } else {
      ranges.push([s, e]);
    }
  }

  const hunks: DiffHunk[] = [];
  let last = -1;
  for (const [s, e] of ranges) {
    if (s > last + 1) {
      hunks.push({ kind: "collapsed", lines: lines.slice(last + 1, s), collapsedCount: s - (last + 1) });
    }
    hunks.push({ kind: "change", lines: lines.slice(s, e + 1), collapsedCount: 0 });
    last = e;
  }
  if (last < lines.length - 1) {
    hunks.push({ kind: "collapsed", lines: lines.slice(last + 1), collapsedCount: lines.length - 1 - last });
  }
  return hunks;
}

// -----------------------------------------------------------------------
// Stats
// -----------------------------------------------------------------------

function computeStats(lines: DiffLine[]): DiffStats {
  let added = 0,
    removed = 0,
    modified = 0;
  let idx = 0;
  while (idx < lines.length) {
    if (lines[idx].type === "equal") {
      idx++;
      continue;
    }
    let d = 0,
      ins = 0;
    while (idx < lines.length && lines[idx].type === "delete") {
      d++;
      idx++;
    }
    while (idx < lines.length && lines[idx].type === "insert") {
      ins++;
      idx++;
    }
    const paired = Math.min(d, ins);
    modified += paired;
    removed += d - paired;
    added += ins - paired;
  }
  return { added, removed, modified };
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
// Unified diff
// -----------------------------------------------------------------------

function UnifiedLine({ line }: { line: DiffLine }) {
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

function UnifiedDiff({ hunks }: { hunks: DiffHunk[] }) {
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
    <div
      className="overflow-hidden rounded-lg border"
      style={{ borderColor: C.border }}
    >
      {hunks.map((h, hi) => {
        if (h.kind === "collapsed" && !expanded.has(hi)) {
          return <CollapsedBar key={hi} count={h.collapsedCount} onExpand={() => toggle(hi)} />;
        }
        return (
          <div key={hi}>
            {h.lines.map((line, li) => (
              <UnifiedLine key={`${hi}-${li}`} line={line} />
            ))}
            {hi < hunks.length - 1 && h.kind === "change" && hunks[hi + 1]?.kind === "change" && (
              <div className="h-px" style={{ backgroundColor: C.border }} />
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
    while (idx < lines.length && lines[idx].type === "delete") {
      dels.push(lines[idx]);
      idx++;
    }
    while (idx < lines.length && lines[idx].type === "insert") {
      ins.push(lines[idx]);
      idx++;
    }
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

function SplitCell({ line, side }: { line: DiffLine | null; side: "left" | "right" }) {
  if (!line) {
    return (
      <div className="flex h-full text-[13px] leading-6" style={{ backgroundColor: "rgba(255, 255, 255, 0.01)" }}>
        <div className="w-5 shrink-0" style={{ backgroundColor: C.gutterBg }} />
        <div className="w-10 shrink-0" style={{ backgroundColor: C.gutterBg }} />
        <div className="min-w-0 flex-1 px-3 py-px">&nbsp;</div>
      </div>
    );
  }

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
  const num = side === "left" ? line.oldLineNum : line.newLineNum;

  return (
    <div className="flex text-[13px] leading-6" style={{ backgroundColor: bg }}>
      <div
        className="flex w-5 shrink-0 select-none items-center justify-center font-mono text-[11px] font-bold"
        style={{ color: markerColor, backgroundColor: C.gutterBg }}
      >
        {marker}
      </div>
      <div
        className="w-10 shrink-0 select-none pr-2 text-right font-mono text-[11px] text-white/15"
        style={{ backgroundColor: C.gutterBg }}
      >
        {num ?? ""}
      </div>
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

function SplitDiff({
  hunks,
  oldLabel,
  newLabel,
}: {
  hunks: DiffHunk[];
  oldLabel?: string;
  newLabel?: string;
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
      {/* Column headers */}
      <div
        className="sticky top-0 z-10 grid grid-cols-2 bg-[var(--color-surface-elevated)]"
        style={{ borderBottom: `1px solid ${C.border}` }}
      >
        <div className="px-4 py-2 text-xs font-medium text-white/40" style={{ borderRight: `1px solid ${C.border}` }}>
          {oldLabel ?? "Old"}
        </div>
        <div className="px-4 py-2 text-xs font-medium text-white/40">{newLabel ?? "New"}</div>
      </div>

      {hunks.map((h, hi) => {
        if (h.kind === "collapsed" && !expanded.has(hi)) {
          return <CollapsedBar key={hi} count={h.collapsedCount} onExpand={() => toggle(hi)} />;
        }
        const rows = buildSplitRows(h.lines);
        return (
          <div key={hi}>
            {rows.map((row, ri) => (
              <div key={`${hi}-${ri}`} className="grid grid-cols-2">
                <div style={{ borderRight: `1px solid ${C.border}` }}>
                  <SplitCell line={row.left} side="left" />
                </div>
                <div>
                  <SplitCell line={row.right} side="right" />
                </div>
              </div>
            ))}
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

  return (
    <div data-testid="story-diff" className="space-y-3">
      {/* Labels + summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-white/40">
          {oldLabel && <span>{oldLabel}</span>}
          {oldLabel && newLabel && <span className="text-white/20">&rarr;</span>}
          {newLabel && <span>{newLabel}</span>}
        </div>
        <DiffSummary stats={stats} />
      </div>

      {/* Diff */}
      <div className="max-h-[70vh] overflow-y-auto">
        {mode === "unified" ? (
          <UnifiedDiff hunks={hunks} />
        ) : (
          <SplitDiff hunks={hunks} oldLabel={oldLabel} newLabel={newLabel} />
        )}
      </div>
    </div>
  );
}
