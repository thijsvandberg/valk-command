"use client";

import type { CSSProperties } from "react";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import {
  JIRA_STATUS_COLORS,
  JIRA_STATUS_ABBREVIATIONS,
  type JiraStatus,
  type IssueType,
} from "@/types/ticket";

// Dev-only gallery for choosing the inline / header ticket-reference pill style.
// Not linked from the app; visit /dev/pill-preview directly. Each variation is
// hand-rendered here (not wired to TicketStatusPill) so we can compare freely
// before committing one treatment back into the real components.

const KEY = "VPL-43134";
const STATUSES: JiraStatus[] = ["TO DO", "IN PROGRESS", "TEST", "DONE", "DEPRECATED"];

function tint(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

type PillProps = { status: JiraStatus; type?: IssueType; size?: "sm" | "lg" };

// ---------------------------------------------------------------------------
// Content variations (inline, body-text scale)
// ---------------------------------------------------------------------------

// V1 — Current: neutral chip + tinted status segment (the "gray + green block")
function V1Current({ status, type = "story" }: PillProps) {
  const c = JIRA_STATUS_COLORS[status];
  return (
    <span className="inline-flex items-stretch overflow-hidden rounded-md bg-overlay-default align-middle text-[11px] ring-1 ring-inset ring-border-default">
      <span className="flex items-center px-1.5"><IssueTypeIcon type={type} size={11} /></span>
      <span className="w-px self-stretch bg-overlay-strong/30" />
      <span className="px-1.5 py-[3px] font-mono font-medium text-text-secondary">{KEY}</span>
      <span className="w-px self-stretch bg-overlay-strong/30" />
      <span className="flex items-center gap-1 px-1.5 font-mono font-medium" style={{ background: c.bg, color: c.text }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.text, opacity: 0.7 }} />
        {JIRA_STATUS_ABBREVIATIONS[status]}
      </span>
    </span>
  );
}

// V2 — Minimal link: icon + brand key + status dot. No container.
function V2Minimal({ status, type = "story" }: PillProps) {
  const c = JIRA_STATUS_COLORS[status];
  return (
    <span className="inline-flex items-center gap-1 align-middle text-[13px]">
      <IssueTypeIcon type={type} size={13} />
      <span className="font-mono font-medium" style={{ color: "var(--color-brand-400)" }}>{KEY}</span>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.text }} />
    </span>
  );
}

// V3 — Status-tinted single-color pill (one cohesive hue). Fresh.
function V3Tinted({ status, type = "story" }: PillProps) {
  const c = JIRA_STATUS_COLORS[status];
  const style: CSSProperties = { background: tint(c.text, 12), color: c.text };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] align-middle text-[11px] font-medium" style={style}>
      <IssueTypeIcon type={type} size={11} />
      <span className="font-mono">{KEY}</span>
      <span className="opacity-40">·</span>
      <span className="text-[10px] uppercase tracking-wide">{JIRA_STATUS_ABBREVIATIONS[status]}</span>
    </span>
  );
}

// V4 — Ghost / outlined in the status hue. Crisp.
function V4Ghost({ status, type = "story" }: PillProps) {
  const c = JIRA_STATUS_COLORS[status];
  const style: CSSProperties = { color: c.text, boxShadow: `inset 0 0 0 1px ${tint(c.text, 35)}` };
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-[3px] align-middle text-[11px] font-medium" style={style}>
      <IssueTypeIcon type={type} size={11} />
      <span className="font-mono">{KEY}</span>
      <span className="text-[10px] uppercase tracking-wide opacity-80">{JIRA_STATUS_ABBREVIATIONS[status]}</span>
    </span>
  );
}

// V5 — Brand key with a status-colored underline accent + icon. Subtle.
function V5Accent({ status, type = "story" }: PillProps) {
  const c = JIRA_STATUS_COLORS[status];
  return (
    <span className="inline-flex items-center gap-1 align-middle text-[13px]">
      <IssueTypeIcon type={type} size={13} />
      <span
        className="font-mono font-medium"
        style={{ color: "var(--color-brand-400)", boxShadow: `inset 0 -2px 0 ${tint(c.text, 70)}` }}
      >
        {KEY}
      </span>
    </span>
  );
}

// V6 — Dot + brand key + uppercase status text. No container.
function V6DotText({ status }: PillProps) {
  const c = JIRA_STATUS_COLORS[status];
  return (
    <span className="inline-flex items-center gap-1 align-middle text-[12px]">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.text }} />
      <span className="font-mono font-medium" style={{ color: "var(--color-brand-400)" }}>{KEY}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: c.text }}>
        {JIRA_STATUS_ABBREVIATIONS[status]}
      </span>
    </span>
  );
}

const CONTENT_VARIATIONS: { id: string; label: string; note: string; render: (p: PillProps) => React.ReactNode }[] = [
  { id: "C1", label: "Current", note: "Neutral chip + tinted status segment (today's look)", render: (p) => <V1Current {...p} /> },
  { id: "C2", label: "Minimal link", note: "Icon + brand key + status dot, no container", render: (p) => <V2Minimal {...p} /> },
  { id: "C3", label: "Status-tinted pill", note: "One cohesive status hue, rounded-full", render: (p) => <V3Tinted {...p} /> },
  { id: "C4", label: "Ghost outline", note: "Transparent, thin status-coloured ring", render: (p) => <V4Ghost {...p} /> },
  { id: "C5", label: "Underline accent", note: "Brand key with status-coloured underline", render: (p) => <V5Accent {...p} /> },
  { id: "C6", label: "Dot + text", note: "Dot + key + uppercase status, no container", render: (p) => <V6DotText {...p} /> },
];

// ---------------------------------------------------------------------------
// Header variations (larger, prominent — the pill next to the page title)
// ---------------------------------------------------------------------------

// H1 — Current header pill: neutral segmented + ready check
function H1Current({ status, type = "story" }: PillProps) {
  const c = JIRA_STATUS_COLORS[status];
  return (
    <span className="inline-flex items-stretch overflow-hidden rounded-lg bg-overlay-default text-[13px] ring-1 ring-inset ring-border-default">
      <span className="flex items-center px-2.5"><IssueTypeIcon type={type} size={15} /></span>
      <span className="w-px self-stretch bg-overlay-strong/30" />
      <span className="px-2.5 py-1.5 font-mono font-medium text-text-secondary">{KEY}</span>
      <span className="w-px self-stretch bg-overlay-strong/30" />
      <span className="flex items-center gap-1.5 px-2.5 font-mono font-medium" style={{ background: c.bg, color: c.text }}>
        <span className="h-2 w-2 rounded-full" style={{ background: c.text, opacity: 0.7 }} />
        {JIRA_STATUS_ABBREVIATIONS[status]}
      </span>
    </span>
  );
}

// H2 — Status-tinted prominent: whole chip in the status hue
function H2Tinted({ status, type = "story" }: PillProps) {
  const c = JIRA_STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold"
      style={{ background: tint(c.text, 14), color: c.text, boxShadow: `inset 0 0 0 1px ${tint(c.text, 22)}` }}
    >
      <IssueTypeIcon type={type} size={15} />
      <span className="font-mono">{KEY}</span>
      <span className="h-3.5 w-px" style={{ background: tint(c.text, 35) }} />
      <span className="text-[11px] uppercase tracking-wider">{JIRA_STATUS_ABBREVIATIONS[status]}</span>
    </span>
  );
}

// H3 — Leading coloured type square + key + status pill
function H3TypeBlock({ status, type = "story" }: PillProps) {
  const c = JIRA_STATUS_COLORS[status];
  const typeColor = type === "bug" ? "var(--color-status-error)" : type === "task" ? "var(--color-icon-task)" : "var(--color-status-success)";
  return (
    <span className="inline-flex items-stretch overflow-hidden rounded-lg text-[13px] ring-1 ring-inset ring-border-default">
      <span className="flex items-center px-2.5" style={{ background: tint(typeColor, 14) }}>
        <IssueTypeIcon type={type} size={15} />
      </span>
      <span className="bg-surface-elevated px-2.5 py-1.5 font-mono font-medium text-text-primary">{KEY}</span>
      <span className="flex items-center gap-1.5 px-2.5 font-medium" style={{ background: tint(c.text, 16), color: c.text }}>
        <span className="h-2 w-2 rounded-full" style={{ background: c.text }} />
        <span className="text-[11px] uppercase tracking-wider">{JIRA_STATUS_ABBREVIATIONS[status]}</span>
      </span>
    </span>
  );
}

// H4 — Elevated card chip with soft shadow + status pill
function H4Elevated({ status, type = "story" }: PillProps) {
  const c = JIRA_STATUS_COLORS[status];
  return (
    <span className="inline-flex items-center gap-2 rounded-lg bg-surface-elevated px-3 py-1.5 text-[13px] shadow-[0_1px_3px_rgba(0,0,0,0.18)] ring-1 ring-inset ring-border-subtle">
      <IssueTypeIcon type={type} size={15} />
      <span className="font-mono font-medium text-text-primary">{KEY}</span>
      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider" style={{ background: tint(c.text, 16), color: c.text }}>
        {JIRA_STATUS_ABBREVIATIONS[status]}
      </span>
    </span>
  );
}

// H5 — Leading accent bar in the status hue
function H5AccentBar({ status, type = "story" }: PillProps) {
  const c = JIRA_STATUS_COLORS[status];
  return (
    <span className="inline-flex items-center gap-2 overflow-hidden rounded-lg bg-overlay-subtle py-1.5 pr-3 text-[13px] ring-1 ring-inset ring-border-subtle">
      <span className="h-6 w-1 self-stretch rounded-full" style={{ background: c.text }} />
      <IssueTypeIcon type={type} size={15} />
      <span className="font-mono font-medium text-text-primary">{KEY}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: c.text }}>
        {JIRA_STATUS_ABBREVIATIONS[status]}
      </span>
    </span>
  );
}

const HEADER_VARIATIONS: { id: string; label: string; note: string; render: (p: PillProps) => React.ReactNode }[] = [
  { id: "H1", label: "Current", note: "Neutral segmented + status block (today's look)", render: (p) => <H1Current {...p} /> },
  { id: "H2", label: "Status-tinted", note: "Whole chip in one status hue", render: (p) => <H2Tinted {...p} /> },
  { id: "H3", label: "Type block", note: "Coloured type square + key + status pill", render: (p) => <H3TypeBlock {...p} /> },
  { id: "H4", label: "Elevated card", note: "Floating surface + soft shadow + status pill", render: (p) => <H4Elevated {...p} /> },
  { id: "H5", label: "Accent bar", note: "Leading status-coloured bar", render: (p) => <H5AccentBar {...p} /> },
];

export default function PillPreviewPage() {
  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-heading-lg font-semibold tracking-tight text-text-primary">Ticket-reference pill — style gallery</h1>
      <p className="mt-2 max-w-2xl text-body-lg leading-relaxed text-text-secondary">
        Dev-only preview for choosing the inline (in-description) and header pill treatment. Each row shows one
        variation across all statuses. Reply with the IDs you like (e.g. &ldquo;C3 for content, H2 for header&rdquo;)
        and I&rsquo;ll wire it into the real components.
      </p>

      {/* CONTENT */}
      <section className="mt-10">
        <h2 className="text-label font-semibold uppercase tracking-widest text-text-muted">In content (inline, body text)</h2>

        <div className="mt-4 space-y-3">
          {CONTENT_VARIATIONS.map((v) => (
            <div key={v.id} className="rounded-xl border border-border-subtle bg-surface-elevated p-4">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-body-sm font-semibold text-[var(--color-brand-400)]">{v.id}</span>
                <span className="text-body-lg font-medium text-text-primary">{v.label}</span>
                <span className="text-body-sm text-text-muted">— {v.note}</span>
              </div>

              {/* In a realistic sentence */}
              <p className="mt-3 text-body-lg leading-[1.7] text-text-secondary">
                After {v.render({ status: "DONE", type: "story" })}, the frontend correctly shows package rates on
                initial load, but the backend validation tracked in {v.render({ status: "IN PROGRESS", type: "task" })} is
                still pending.
              </p>

              {/* Across all statuses */}
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-3">
                {STATUSES.map((s) => (
                  <span key={s}>{v.render({ status: s, type: "story" })}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HEADER */}
      <section className="mt-12">
        <h2 className="text-label font-semibold uppercase tracking-widest text-text-muted">In the header (next to the page title)</h2>

        <div className="mt-4 space-y-3">
          {HEADER_VARIATIONS.map((v) => (
            <div key={v.id} className="rounded-xl border border-border-subtle bg-surface-elevated p-4">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-body-sm font-semibold text-[var(--color-brand-400)]">{v.id}</span>
                <span className="text-body-lg font-medium text-text-primary">{v.label}</span>
                <span className="text-body-sm text-text-muted">— {v.note}</span>
              </div>

              {/* On a header-like bar */}
              <div className="mt-3 flex items-center gap-3 rounded-lg bg-surface-chrome px-4 py-3">
                {v.render({ status: "DONE", type: "story" })}
                <span className="truncate text-body-lg font-semibold text-text-primary">
                  Validate that selected rate belongs to the chosen package/deal
                </span>
              </div>

              {/* Across statuses */}
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-3">
                {STATUSES.map((s) => (
                  <span key={s}>{v.render({ status: s, type: "story" })}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
