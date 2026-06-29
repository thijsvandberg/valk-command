"use client";

/**
 * Throwaway exploration: pick a subtask glyph that doesn't read as a task.
 *
 * Today the issue-type icon map (IssueTypeIcon.tsx) gives task a CheckSquare and
 * subtask a SquareMinus, and BOTH use the same colour (--color-icon-task, a blue).
 * Same shape family (a square with a symbol) + identical colour means the two
 * types blur together in lists like the ticket-detail Subtasks panel.
 *
 * This page renders the current collision next to candidate subtask glyphs, each
 * chosen to break out of the square and read as "a child of a parent". Click a
 * candidate (and a colour) to drive the live Subtasks-panel preview, which also
 * shows a real Task row so task-vs-subtask contrast can be judged directly.
 *
 * Reachable at /dev/exploration/subtask-icon; not linked from app nav.
 */

import { useState } from "react";
import Link from "next/link";
import {
  type LucideIcon,
  ArrowLeft,
  CheckSquare,
  SquareMinus,
  // candidates
  CornerDownRight,
  ListTree,
  GitBranch,
  Workflow,
  IndentIncrease,
  // jira-like (linked / stacked squares)
  SquareSquare,
  Copy,
  BringToFront,
  Group,
  SquareStack,
  Layers,
  PictureInPicture2,
  Blocks,
  Combine,
  SquareArrowDownRight,
  // extras
  Network,
  Spline,
  Waypoints,
  GitFork,
  Split,
  SquareDot,
} from "lucide-react";

/* ----------------------------------------------------------- candidates -- */

type Candidate = { key: string; label: string; icon: LucideIcon; note: string; recommended?: boolean };
type Group = { title: string; rationale: string; items: Candidate[] };

const GROUPS: Group[] = [
  {
    title: "Recommended",
    rationale:
      "Each breaks out of the square-with-a-symbol shape that makes a subtask read as a task, and instead says 'this belongs under something'.",
    items: [
      {
        key: "corner-down-right",
        label: "CornerDownRight",
        icon: CornerDownRight,
        note: "The universal 'indented / belongs under' mark. Strongest meaning, dead legible at 13px, zero resemblance to the task square.",
        recommended: true,
      },
      {
        key: "list-tree",
        label: "ListTree",
        icon: ListTree,
        note: "Reads as 'item in a hierarchy' — works especially well when subtasks stack vertically like the panel.",
      },
      {
        key: "git-branch",
        label: "GitBranch",
        icon: GitBranch,
        note: "Sub-work branching off a parent; familiar and clearly not a checkbox. Slightly dev-flavoured.",
      },
      {
        key: "workflow",
        label: "Workflow",
        icon: Workflow,
        note: "Two linked rounded squares — closest to Jira's own subtask glyph. Still square-ish, so least differentiated of the five.",
      },
      {
        key: "indent-increase",
        label: "IndentIncrease",
        icon: IndentIncrease,
        note: "Minimal 'nested under parent'; clean and light.",
      },
    ],
  },
  {
    title: "Jira-like — linked / stacked squares",
    rationale:
      "Closest to Jira's own subtask glyph (two linked rounded squares). Note the tension: these stay in the square family, so they lean back toward the task checkbox — a distinct colour matters most here. (Boxes is intentionally absent: it's already the Refinement row marker.)",
    items: [
      { key: "copy", label: "Copy", icon: Copy, note: "Two overlapping rounded squares — the classic linked-pair look. Closest match, but may read as 'duplicate'." },
      { key: "square-square", label: "SquareSquare", icon: SquareSquare, note: "A square nested in a square — parent containing child. Very Jira." },
      { key: "bring-to-front", label: "BringToFront", icon: BringToFront, note: "Two overlapping squares, the child brought forward." },
      { key: "group", label: "Group", icon: Group, note: "Two squares grouped under a parent." },
      { key: "square-stack", label: "SquareStack", icon: SquareStack, note: "Offset stack — a parent with items behind it." },
      { key: "layers", label: "Layers", icon: Layers, note: "Stacked layers sitting under a parent." },
      { key: "picture-in-picture-2", label: "PictureInPicture2", icon: PictureInPicture2, note: "A child square tucked inside the parent corner." },
      { key: "blocks", label: "Blocks", icon: Blocks, note: "A sub-block added onto a structure." },
      { key: "combine", label: "Combine", icon: Combine, note: "Squares combining into a whole." },
      { key: "square-arrow-down-right", label: "SquareArrowDownRight", icon: SquareArrowDownRight, note: "Square + the down-right 'child' direction — a hybrid of square and arrow." },
    ],
  },
  {
    title: "Other candidates",
    rationale:
      "Further options if none of the above land — same goal: a child/sub relationship that doesn't echo the task checkbox.",
    items: [
      { key: "git-fork", label: "GitFork", icon: GitFork, note: "Splits off a parent line." },
      { key: "network", label: "Network", icon: Network, note: "A node hanging off a parent node." },
      { key: "spline", label: "Spline", icon: Spline, note: "A curve from one point to another — a link." },
      { key: "waypoints", label: "Waypoints", icon: Waypoints, note: "Connected steps in a sequence." },
      { key: "split", label: "Split", icon: Split, note: "Branches into parts." },
      { key: "square-dot", label: "SquareDot", icon: SquareDot, note: "A quieter square variant; subtle differentiation only." },
    ],
  },
];

const ALL: Candidate[] = GROUPS.flatMap((g) => g.items);

/* -------------------------------------------------------------- colours -- */

type ColorOpt = { key: string; label: string; value: string; note: string };

const COLORS: ColorOpt[] = [
  { key: "task", label: "Task blue (current)", value: "var(--color-icon-task)", note: "Same as task — the collision colour. Shape carries all the difference." },
  { key: "muted", label: "Muted", value: "var(--color-icon-default)", note: "Quiets a subtask down as subordinate to its parent. Recommended pairing." },
  { key: "brand", label: "Brand teal", value: "var(--color-brand-400)", note: "Distinct accent; clear separation from task blue." },
  { key: "violet", label: "Violet", value: "var(--color-icon-epic)", note: "Distinct, but collides with the epic colour." },
];

/* -------------------------------------------------------------- preview -- */

// A faithful-enough slice of the ticket-detail Subtasks panel: a header, a
// Task (parent) row using the REAL task icon, then subtask rows using the
// candidate. Lets task-vs-subtask contrast be judged at the same time.
const SUBTASKS = [
  { key: "VPL-44997", summary: "Remove the deprecated booking adapter" },
  { key: "VPL-44998", summary: "Verify the migration on staging" },
  { key: "VPL-44999", summary: "Remove the feature flag once verified" },
];

function PanelRow({
  icon: Icon,
  color,
  strokeWidth = 1.5,
  ticketKey,
  summary,
}: {
  icon: LucideIcon;
  color: string;
  strokeWidth?: number;
  ticketKey: string;
  summary: string;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border-subtle px-3 py-2.5 last:border-b-0">
      <Icon className="h-4 w-4 shrink-0" strokeWidth={strokeWidth} style={{ color }} />
      <span className="font-medium text-[var(--color-icon-task)] underline decoration-transparent underline-offset-2">
        {ticketKey}
      </span>
      <span className="truncate text-text-secondary">{summary}</span>
    </div>
  );
}

function SubtasksPanel({
  title,
  subtaskIcon,
  subtaskColor,
  subtaskStroke = 1.5,
  badge,
}: {
  title: string;
  subtaskIcon: LucideIcon;
  subtaskColor: string;
  subtaskStroke?: number;
  badge?: string;
}) {
  return (
    <div className="rounded-2xl bg-[var(--color-surface-floating)] p-5 ring-1 ring-border-default">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-text-primary">{title}</h3>
        {badge && (
          <span className="rounded-md bg-overlay-default px-2 py-0.5 font-mono text-[11px] text-text-secondary">{badge}</span>
        )}
      </div>
      <div className="overflow-hidden rounded-lg text-body-sm ring-1 ring-border-default">
        {/* Parent task row — always the real task icon, for contrast */}
        <div className="flex items-center gap-2.5 border-b border-border-default bg-overlay-subtle px-3 py-2.5">
          <CheckSquare className="h-4 w-4 shrink-0" strokeWidth={1.5} style={{ color: "var(--color-icon-task)" }} />
          <span className="font-medium text-[var(--color-icon-task)] underline decoration-transparent underline-offset-2">
            VPL-44990
          </span>
          <span className="truncate text-text-secondary">Parent task — retire the legacy adapter</span>
          <span className="ml-auto rounded bg-overlay-default px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted">
            Task
          </span>
        </div>
        {SUBTASKS.map((s) => (
          <PanelRow
            key={s.key}
            icon={subtaskIcon}
            color={subtaskColor}
            strokeWidth={subtaskStroke}
            ticketKey={s.key}
            summary={s.summary}
          />
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- page -- */

export default function SubtaskIconExplorationPage() {
  const [selectedKey, setSelectedKey] = useState("corner-down-right");
  const [colorKey, setColorKey] = useState("muted");

  const selected = ALL.find((c) => c.key === selectedKey) ?? ALL[0];
  const color = COLORS.find((c) => c.key === colorKey) ?? COLORS[0];

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-[920px]">
        <Link
          href="/dev/exploration"
          className="mb-6 inline-flex items-center gap-1.5 text-body-sm text-text-tertiary transition-colors hover:text-text-secondary"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          All explorations
        </Link>

        <header className="mb-8">
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
            A subtask icon that isn&rsquo;t a task
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            Today task uses <code className="font-mono text-[13px] text-text-primary">CheckSquare</code> and subtask uses{" "}
            <code className="font-mono text-[13px] text-text-primary">SquareMinus</code> — both a square with a symbol,
            and both painted the same blue (<code className="font-mono text-[13px] text-text-primary">--color-icon-task</code>).
            So they blur together. Pick a glyph that reads as &ldquo;a child of a parent&rdquo;, and optionally give it
            its own colour. The change is centralised in{" "}
            <code className="font-mono text-[13px] text-text-primary">IssueTypeIcon.tsx</code>, so it updates everywhere
            subtasks render.
          </p>
        </header>

        {/* before / after, side by side, sticky */}
        <div className="sticky top-4 z-10 mb-10 grid gap-4 lg:grid-cols-2">
          <SubtasksPanel
            title="Today"
            subtaskIcon={SquareMinus}
            subtaskColor="var(--color-icon-task)"
            badge="SquareMinus · task blue"
          />
          <SubtasksPanel
            title="Proposed"
            subtaskIcon={selected.icon}
            subtaskColor={color.value}
            badge={`${selected.label} · ${color.label}`}
          />
        </div>

        {/* colour picker */}
        <div className="mb-8">
          <p className="mb-2 text-[11px] uppercase tracking-[0.1em] text-text-muted">Subtask colour</p>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => {
              const isSel = c.key === colorKey;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setColorKey(c.key)}
                  title={c.note}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-body-sm ring-1 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                    isSel
                      ? "bg-[var(--color-brand-500)]/[0.1] text-text-primary ring-[var(--color-brand-400)]"
                      : "bg-[var(--color-surface-floating)] text-text-secondary ring-border-default hover:ring-border-strong"
                  }`}
                >
                  <span className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: c.value }} />
                  {c.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 max-w-2xl text-[12px] leading-[1.5] text-text-muted">{color.note}</p>
        </div>

        {/* candidate grid */}
        <div className="space-y-10">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">{group.title}</h2>
              <p className="mb-4 mt-1 max-w-2xl text-body-sm leading-[1.6] text-text-tertiary">{group.rationale}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((c) => {
                  const isSelected = c.key === selectedKey;
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setSelectedKey(c.key)}
                      className={`group relative flex flex-col gap-3 rounded-xl p-4 text-left ring-1 transition-[transform,box-shadow,background-color] duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] ${
                        isSelected
                          ? "bg-[var(--color-surface-floating)] ring-[var(--color-brand-400)] shadow-[0_18px_44px_-22px_rgba(0,0,0,0.6)]"
                          : "bg-[var(--color-surface-floating)] ring-border-default hover:-translate-y-0.5 hover:ring-border-strong"
                      }`}
                    >
                      {c.recommended && (
                        <span className="absolute right-3 top-3 rounded-full bg-[var(--color-brand-500)]/[0.14] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-brand-300)]">
                          Pick
                        </span>
                      )}
                      <div className="flex items-center justify-between">
                        <span
                          className={`grid h-10 w-10 place-items-center rounded-lg ${
                            isSelected ? "bg-[var(--color-brand-500)]/[0.12]" : "bg-overlay-default"
                          }`}
                        >
                          <Icon className="h-5 w-5" strokeWidth={1.5} style={{ color: color.value }} />
                        </span>
                        <code className="mr-12 font-mono text-[11px] text-text-muted">{c.label}</code>
                      </div>
                      {/* inline subtask-row sample so each card is comparable at a glance */}
                      <span className="flex items-center gap-2 text-body-sm">
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} style={{ color: color.value }} />
                        <span className="font-medium text-[var(--color-icon-task)]">VPL-44998</span>
                        <span className="text-text-tertiary">Verify the migration</span>
                      </span>
                      <p className="text-[12px] leading-[1.5] text-text-muted">{c.note}</p>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
