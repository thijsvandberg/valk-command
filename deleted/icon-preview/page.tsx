"use client";

import {
  Bug,
  BookmarkCheck,
  FileText,
  SquareMinus,
  CheckSquare,
  CircleDot,
  Bookmark,
  ListMinus,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Minus,
  MoveUp,
  MoveDown,
  ArrowBigUp,
  ArrowBigDown,
  ChevronUp,
  ChevronDown,
  Info,
  MessageSquareWarning,
  StickyNote,
  TextQuote,
  Quote,
  Megaphone,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Current custom SVGs (reproduced inline for comparison)
// ---------------------------------------------------------------------------

function CurrentIssueTypeIcon({ type }: { type: string }) {
  const style = { width: 16, height: 16 };
  switch (type) {
    case "task":
      return (
        <svg viewBox="0 0 16 16" className="text-[#4a90d9]" style={style}>
          <rect x="1" y="1" width="14" height="14" rx="2" fill="currentColor" opacity="0.2" />
          <path d="M4.5 8.5l2 2 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "bug":
      return (
        <svg viewBox="0 0 16 16" className="text-[#e5534b]" style={style}>
          <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.2" />
          <circle cx="8" cy="8" r="3" fill="currentColor" />
        </svg>
      );
    case "story":
      return (
        <svg viewBox="0 0 16 16" className="text-[#4aaa60]" style={style}>
          <path d="M3 2h7l4 4v8a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" fill="currentColor" opacity="0.2" />
          <path d="M10 2v4h4" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
      );
    case "subtask":
      return (
        <svg viewBox="0 0 16 16" className="text-[#4a90d9]" style={style}>
          <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.2" fill="none" opacity="0.4" />
          <path d="M5 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

const PRIORITY_COLORS: Record<string, string> = {
  Highest: "#e5534b",
  High: "#ea8744",
  Medium: "#eab308",
  Low: "#4a90d9",
  Lowest: "#94a3b8",
};

function CurrentPriorityIcon({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] ?? "#94a3b8";
  const isUp = priority === "Highest" || priority === "High";
  const isDown = priority === "Low" || priority === "Lowest";
  const double = priority === "Highest" || priority === "Lowest";

  return (
    <svg viewBox="0 0 16 16" style={{ width: 14, height: 14 }}>
      {isUp && (
        <>
          <path d="M8 10V4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M5 6l3-3 3 3" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {double && <path d="M5 9l3-3 3 3" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />}
        </>
      )}
      {isDown && (
        <>
          <path d="M8 6v6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M5 10l3 3 3-3" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {double && <path d="M5 7l3 3 3-3" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />}
        </>
      )}
      {!isUp && !isDown && (
        <path d="M4 8h8" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  );
}

function CurrentCalloutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="2" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <line x1="1" y1="2" x2="1" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="7" cy="6" r="0.8" fill="currentColor" />
      <line x1="7" y1="7.5" x2="7" y2="10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Mock ticket rows to show icons in context
// ---------------------------------------------------------------------------

const MOCK_TICKETS = [
  { key: "VPL-101", title: "Implement authentication flow", type: "story", priority: "High", status: "IN PROGRESS", points: 5 },
  { key: "VPL-102", title: "Login page crashes on empty email", type: "bug", priority: "Highest", status: "TO DO", points: 3 },
  { key: "VPL-103", title: "Add unit tests for auth service", type: "task", priority: "Medium", status: "IN REVIEW", points: 2 },
  { key: "VPL-104", title: "Extract validation helper", type: "subtask", priority: "Low", status: "DONE", points: 1 },
  { key: "VPL-105", title: "Update API documentation", type: "task", priority: "Lowest", status: "TO DO", points: 1 },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  "TO DO": { bg: "rgba(148,163,184,0.12)", text: "#94a3b8" },
  "IN PROGRESS": { bg: "rgba(96,165,250,0.12)", text: "#60a5fa" },
  "IN REVIEW": { bg: "rgba(234,179,8,0.12)", text: "#eab308" },
  "DONE": { bg: "rgba(46,145,73,0.12)", text: "#4aaa60" },
};

// ---------------------------------------------------------------------------
// Comparison component
// ---------------------------------------------------------------------------

function IconCell({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03]">
        {children}
      </div>
      {label && <span className="text-[10px] text-white/30">{label}</span>}
    </div>
  );
}

function SuggestionRow({
  name,
  current,
  candidates,
  verdict,
}: {
  name: string;
  current: React.ReactNode;
  candidates: { icon: React.ReactNode; label: string }[];
  verdict: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[var(--color-surface-elevated)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">{name}</h3>
        <span className="rounded-full bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-medium text-white/30">
          {verdict}
        </span>
      </div>
      <div className="flex items-start gap-6">
        <div>
          <span className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-white/20">Current</span>
          <IconCell>{current}</IconCell>
        </div>
        <div className="h-16 w-px bg-white/[0.06]" />
        <div>
          <span className="mb-2 block text-[10px] font-medium uppercase tracking-wider text-white/20">Lucide candidates</span>
          <div className="flex gap-3">
            {candidates.map((c) => (
              <IconCell key={c.label} label={c.label}>{c.icon}</IconCell>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export default function IconPreviewPage() {
  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <h1 className="font-[var(--font-display)] text-2xl font-bold tracking-[-0.03em] text-white">
        Icon Migration Preview
      </h1>
      <p className="mt-2 max-w-lg font-[var(--font-body)] text-sm leading-[1.7] text-white/40">
        Remaining 6 custom SVGs with lucide-react candidates for comparison.
      </p>

      {/* ----------------------------------------------------------------- */}
      {/* Section 1: Icons in context (mock ticket table)                    */}
      {/* ----------------------------------------------------------------- */}
      <div className="mt-10">
        <h2 className="font-[var(--font-display)] text-base font-semibold text-white/70">Icons in context</h2>
        <p className="mt-1 text-xs text-white/30">How the current custom icons look inside a ticket table row.</p>

        <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.06]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] font-medium uppercase tracking-wider text-white/25">
                <th className="px-3 py-2.5 text-left">Type</th>
                <th className="px-3 py-2.5 text-left">Key</th>
                <th className="px-3 py-2.5 text-left">Title</th>
                <th className="px-3 py-2.5 text-left">Priority</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-right">SP</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_TICKETS.map((t) => {
                const sc = STATUS_COLORS[t.status] ?? STATUS_COLORS["TO DO"];
                return (
                  <tr key={t.key} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5">
                      <CurrentIssueTypeIcon type={t.type} />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-[var(--color-brand-400)]">{t.key}</td>
                    <td className="px-3 py-2.5 text-sm text-white/60">{t.title}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <CurrentPriorityIcon priority={t.priority} />
                        <span className="text-xs" style={{ color: PRIORITY_COLORS[t.priority] }}>{t.priority}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="rounded px-2 py-0.5 text-[10px] font-medium"
                        style={{ backgroundColor: sc.bg, color: sc.text }}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs tabular-nums text-white/40">{t.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Callout context */}
        <div className="mt-6">
          <p className="text-xs text-white/30 mb-3">Callout icon in toolbar context:</p>
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-[var(--color-surface-elevated)] px-1.5 py-1">
            <span className="rounded px-2 py-1.5 text-xs font-bold text-white/50">B</span>
            <span className="rounded px-2 py-1.5 text-xs italic text-white/50">I</span>
            <div className="mx-1 h-4 w-px bg-white/[0.08]" />
            <span className="rounded px-2 py-1.5 text-xs text-white/50">H2</span>
            <div className="mx-1 h-4 w-px bg-white/[0.08]" />
            <div className="flex items-center gap-1 rounded px-2 py-1.5 text-white/50">
              <CurrentCalloutIcon />
              <ChevronDown size={8} strokeWidth={1.5} />
            </div>
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Section 2: Side-by-side comparison with lucide candidates          */}
      {/* ----------------------------------------------------------------- */}
      <div className="mt-12 space-y-4">
        <h2 className="font-[var(--font-display)] text-base font-semibold text-white/70">Lucide candidates</h2>
        <p className="text-xs text-white/30">Current custom SVG vs potential lucide-react replacements.</p>

        {/* Issue Type: Task */}
        <SuggestionRow
          name="Task"
          current={<CurrentIssueTypeIcon type="task" />}
          candidates={[
            { icon: <CheckSquare size={16} className="text-[#4a90d9]" strokeWidth={1.5} />, label: "CheckSquare" },
            { icon: <BookmarkCheck size={16} className="text-[#4a90d9]" strokeWidth={1.5} />, label: "BookmarkCheck" },
          ]}
          verdict="CheckSquare is a close match"
        />

        {/* Issue Type: Bug */}
        <SuggestionRow
          name="Bug"
          current={<CurrentIssueTypeIcon type="bug" />}
          candidates={[
            { icon: <Bug size={16} className="text-[#e5534b]" strokeWidth={1.5} />, label: "Bug" },
            { icon: <CircleDot size={16} className="text-[#e5534b]" strokeWidth={1.5} />, label: "CircleDot" },
          ]}
          verdict="Bug is the obvious choice"
        />

        {/* Issue Type: Story */}
        <SuggestionRow
          name="Story"
          current={<CurrentIssueTypeIcon type="story" />}
          candidates={[
            { icon: <Bookmark size={16} className="text-[#4aaa60]" strokeWidth={1.5} />, label: "Bookmark" },
            { icon: <FileText size={16} className="text-[#4aaa60]" strokeWidth={1.5} />, label: "FileText" },
            { icon: <StickyNote size={16} className="text-[#4aaa60]" strokeWidth={1.5} />, label: "StickyNote" },
          ]}
          verdict="Bookmark matches Jira's visual language best"
        />

        {/* Issue Type: Subtask */}
        <SuggestionRow
          name="Subtask"
          current={<CurrentIssueTypeIcon type="subtask" />}
          candidates={[
            { icon: <SquareMinus size={16} className="text-[#4a90d9]" strokeWidth={1.5} />, label: "SquareMinus" },
            { icon: <ListMinus size={16} className="text-[#4a90d9]" strokeWidth={1.5} />, label: "ListMinus" },
            { icon: <Minus size={16} className="text-[#4a90d9]" strokeWidth={1.5} />, label: "Minus" },
          ]}
          verdict="SquareMinus is closest to the nested-square look"
        />

        {/* Priority: Highest */}
        <SuggestionRow
          name="Priority: Highest"
          current={<CurrentPriorityIcon priority="Highest" />}
          candidates={[
            { icon: <ChevronsUp size={14} className="text-[#e5534b]" strokeWidth={2} />, label: "ChevronsUp" },
            { icon: <ArrowBigUp size={14} className="text-[#e5534b]" strokeWidth={1.5} />, label: "ArrowBigUp" },
          ]}
          verdict="ChevronsUp for double-arrow feel"
        />

        {/* Priority: High */}
        <SuggestionRow
          name="Priority: High"
          current={<CurrentPriorityIcon priority="High" />}
          candidates={[
            { icon: <ChevronUp size={14} className="text-[#ea8744]" strokeWidth={2} />, label: "ChevronUp" },
            { icon: <ArrowUp size={14} className="text-[#ea8744]" strokeWidth={2} />, label: "ArrowUp" },
            { icon: <MoveUp size={14} className="text-[#ea8744]" strokeWidth={1.5} />, label: "MoveUp" },
          ]}
          verdict="ChevronUp or ArrowUp both work"
        />

        {/* Priority: Medium */}
        <SuggestionRow
          name="Priority: Medium"
          current={<CurrentPriorityIcon priority="Medium" />}
          candidates={[
            { icon: <Minus size={14} className="text-[#eab308]" strokeWidth={2} />, label: "Minus" },
          ]}
          verdict="Minus is a perfect 1:1 match"
        />

        {/* Priority: Low */}
        <SuggestionRow
          name="Priority: Low"
          current={<CurrentPriorityIcon priority="Low" />}
          candidates={[
            { icon: <ChevronDown size={14} className="text-[#4a90d9]" strokeWidth={2} />, label: "ChevronDown" },
            { icon: <ArrowDown size={14} className="text-[#4a90d9]" strokeWidth={2} />, label: "ArrowDown" },
            { icon: <MoveDown size={14} className="text-[#4a90d9]" strokeWidth={1.5} />, label: "MoveDown" },
          ]}
          verdict="ChevronDown or ArrowDown both work"
        />

        {/* Priority: Lowest */}
        <SuggestionRow
          name="Priority: Lowest"
          current={<CurrentPriorityIcon priority="Lowest" />}
          candidates={[
            { icon: <ChevronsDown size={14} className="text-[#94a3b8]" strokeWidth={2} />, label: "ChevronsDown" },
            { icon: <ArrowBigDown size={14} className="text-[#94a3b8]" strokeWidth={1.5} />, label: "ArrowBigDown" },
          ]}
          verdict="ChevronsDown for double-arrow feel"
        />

        {/* Callout */}
        <SuggestionRow
          name="Callout"
          current={<span className="text-white/60"><CurrentCalloutIcon /></span>}
          candidates={[
            { icon: <Info size={14} className="text-white/60" strokeWidth={1.5} />, label: "Info" },
            { icon: <MessageSquareWarning size={14} className="text-white/60" strokeWidth={1.5} />, label: "MsgSqWarn" },
            { icon: <TextQuote size={14} className="text-white/60" strokeWidth={1.5} />, label: "TextQuote" },
            { icon: <Quote size={14} className="text-white/60" strokeWidth={1.5} />, label: "Quote" },
            { icon: <Megaphone size={14} className="text-white/60" strokeWidth={1.5} />, label: "Megaphone" },
          ]}
          verdict="TextQuote or Info are reasonable, but none capture the left-border callout"
        />
      </div>
    </div>
  );
}
