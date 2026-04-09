"use client";

/* ------------------------------------------------------------------ */
/*  DEV PAGE: ViewHeader Bar Audit + B1 Full-Width Topbar Proposal     */
/* ------------------------------------------------------------------ */

import {
  CalendarRange,
  MessageCircle,
  Settings2,
  NotebookPen,
  Columns2,
  Search,
  MoreHorizontal,
  CloudUpload,
  CloudDownload,
  ExternalLink,
  Save,
  Zap,
  IterationCw,
  KanbanSquare,
  FlaskConical,
  SlidersHorizontal,
  Clock,
  Users,
  Settings,
  LayoutGrid,
  Star,
  Loader2,
  Network,
  Scissors,
  Trash2,
} from "lucide-react";
import { ViewHeader, ViewHeaderTitle, ViewHeaderDivider } from "@/components/shared/ViewHeader";
import { BridgeMark } from "@/components/shared/BridgeMark";

/* ------------------------------------------------------------------ */
/*  Ticket data from VPL-43734                                         */
/* ------------------------------------------------------------------ */

const TICKET = {
  key: "VPL-43734",
  title: "Implement stripped down upsell confirmation emails for OTA reservations",
  type: "story" as const,
  status: "DONE",
  sprint: "BT: 134",
  epicKey: "VPL-7752",
  points: 2,
  assignee: "Frank van den Nouland",
};

/* ------------------------------------------------------------------ */
/*  Button stubs                                                        */
/* ------------------------------------------------------------------ */

function GhostBtn({ icon, label, active }: { icon: React.ReactNode; label?: string; active?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs font-medium cursor-pointer transition-colors duration-150 ${
        active
          ? "border-white/[0.12] bg-white/[0.08] text-white/70"
          : "border-white/[0.07] bg-transparent text-white/50 hover:bg-white/[0.06] hover:text-white/70"
      }`}
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

function SoftBtn({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-brand-500)]/25 bg-[var(--color-brand-500)]/10 px-2.5 text-xs font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/20 shadow-[0_2px_8px_rgba(26,111,194,0.12)]"
    >
      {icon}
      {label}
    </button>
  );
}

function PrimaryBtn({ icon, label, disabled }: { icon: React.ReactNode; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-[var(--color-brand-500)] px-3 text-xs font-semibold text-white cursor-pointer hover:bg-[var(--color-brand-400)] shadow-[0_2px_8px_rgba(26,111,194,0.30)] disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );
}

function SecondaryBtn({ icon }: { icon: React.ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.10] bg-white/[0.04] text-white/50 cursor-pointer hover:bg-white/[0.08]"
    >
      {icon}
    </button>
  );
}

function StatusPill({ label, bg, text }: { label: string; bg: string; text: string }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}

function JiraStatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    "DONE":        { bg: "rgba(34,197,94,0.15)",  text: "#4ade80" },
    "IN PROGRESS": { bg: "rgba(56,152,210,0.15)", text: "#58b4e6" },
    "TO DO":       { bg: "rgba(100,116,139,0.15)",text: "#94a3b8" },
    "TEST":        { bg: "rgba(120,90,220,0.15)", text: "#9b7ee8" },
  };
  const c = map[status] ?? map["TO DO"];
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium shrink-0"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Nav items (sidebar + topbar shared)                                */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { label: "Dashboard",    icon: <LayoutGrid size={14} strokeWidth={1.5} />,      active: false },
  { label: "Chat",         icon: <MessageCircle size={14} strokeWidth={1.5} />,   active: false },
  { label: "Sprint Board", icon: <KanbanSquare size={14} strokeWidth={1.5} />,    active: true  },
  { label: "Test Center",  icon: <FlaskConical size={14} strokeWidth={1.5} />,    active: false },
  { label: "Refinement",   icon: <SlidersHorizontal size={14} strokeWidth={1.5} />, active: false },
  { label: "Jobs",         icon: <Clock size={14} strokeWidth={1.5} />,           active: false },
];

/* ------------------------------------------------------------------ */
/*  Logo mark                                                           */
/* ------------------------------------------------------------------ */

function LogoMark() {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-600)] text-white shadow-[0_2px_10px_rgba(26,111,194,0.35),inset_0_1px_0_rgba(255,255,255,0.15)]">
      <BridgeMark size={22} />
    </div>
  );
}

function LogoFull({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-2.5"}`}>
      <LogoMark />
      <span className="font-[var(--font-display)] text-[16px] font-extrabold tracking-[-0.04em] text-white/90">
        Bridge
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  B1 shell — shared chrome for all full-width topbar variants        */
/* ------------------------------------------------------------------ */

function B1Shell({
  treatment,
  center,
  actions,
}: {
  treatment: "box" | "plain-icon" | "label" | "none";
  center: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="relative flex h-[52px] items-center border-b border-white/[0.06] bg-[var(--color-surface-elevated)]/60 px-4 gap-0">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_left_center,rgba(26,111,194,0.06)_0%,transparent_60%)]" />

      {/* Logo */}
      <div className="relative flex shrink-0 items-center gap-2.5">
        <LogoFull />
      </div>

      {/* Divider between logo and view context */}
      <div className="relative mx-4 h-6 w-px shrink-0 bg-gradient-to-b from-transparent via-white/[0.10] to-transparent" />

      {/* View context zone */}
      <div className="relative flex min-w-0 flex-1 items-center gap-3">
        {center}
      </div>

      {/* Actions */}
      <div className="relative flex shrink-0 items-center gap-2 ml-4">
        {actions}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Treatment renderers for the icon-problem section                   */
/* ------------------------------------------------------------------ */

// Treatment A: box icon (current, the problem)
function TreatmentBox() {
  return (
    <B1Shell
      treatment="box"
      center={
        <>
          {/* Second icon box — this is the problem */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-500)]/20 ring-1 ring-[var(--color-brand-500)]/25 shadow-[0_2px_12px_rgba(26,111,194,0.20),inset_0_1px_0_rgba(255,255,255,0.08)]">
            <CalendarRange size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
          </div>
          <ViewHeaderTitle>BT: 134</ViewHeaderTitle>
          <ViewHeaderDivider />
          <span className="text-sm text-white/30 shrink-0">31 Mar - 9 Apr</span>
        </>
      }
      actions={<GhostBtn icon={<MoreHorizontal size={14} strokeWidth={1.5} />} />}
    />
  );
}

// Treatment B: plain icon, no box
function TreatmentPlainIcon() {
  return (
    <B1Shell
      treatment="plain-icon"
      center={
        <>
          <CalendarRange size={15} strokeWidth={1.5} className="shrink-0 text-white/30" />
          <ViewHeaderTitle>BT: 134</ViewHeaderTitle>
          <ViewHeaderDivider />
          <span className="text-sm text-white/30 shrink-0">31 Mar - 9 Apr</span>
        </>
      }
      actions={<GhostBtn icon={<MoreHorizontal size={14} strokeWidth={1.5} />} />}
    />
  );
}

// Treatment C: small uppercase view label
function TreatmentLabel() {
  return (
    <B1Shell
      treatment="label"
      center={
        <>
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-white/25">
            Sprint Board
          </span>
          <div className="h-3.5 w-px shrink-0 bg-white/[0.10]" />
          <ViewHeaderTitle>BT: 134</ViewHeaderTitle>
          <ViewHeaderDivider />
          <span className="text-sm text-white/30 shrink-0">31 Mar - 9 Apr</span>
        </>
      }
      actions={<GhostBtn icon={<MoreHorizontal size={14} strokeWidth={1.5} />} />}
    />
  );
}

// Treatment D: no icon at all — logo owns the icon language
function TreatmentNone() {
  return (
    <B1Shell
      treatment="none"
      center={
        <>
          <ViewHeaderTitle>BT: 134</ViewHeaderTitle>
          <ViewHeaderDivider />
          <span className="text-sm text-white/30 shrink-0">31 Mar - 9 Apr</span>
        </>
      }
      actions={<GhostBtn icon={<MoreHorizontal size={14} strokeWidth={1.5} />} />}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  B1 full variants (using chosen treatment = plain icon)             */
/* ------------------------------------------------------------------ */

// Sprint Board
function B1SprintBoard() {
  return (
    <B1Shell
      treatment="plain-icon"
      center={
        <>
          <CalendarRange size={15} strokeWidth={1.5} className="shrink-0 text-white/30" />
          <ViewHeaderTitle>BT: 134</ViewHeaderTitle>
          <ViewHeaderDivider />
          <span className="text-sm text-white/30 shrink-0">31 Mar - 9 Apr</span>
          <span className="text-xs tabular-nums text-white/30 shrink-0">
            <span className="text-white/20">Items</span> 40
          </span>
          <span className="text-xs tabular-nums text-white/30 shrink-0">
            <span className="text-white/20">Pts</span> 27
          </span>
          <ViewHeaderDivider />
          <div className="flex items-center gap-1.5">
            <StatusPill label="TO DO: 7"       bg="rgba(100,116,139,0.15)" text="#94a3b8" />
            <StatusPill label="IN PROGRESS: 2" bg="rgba(56,152,210,0.15)"  text="#58b4e6" />
            <StatusPill label="TEST: 5"        bg="rgba(120,90,220,0.15)"  text="#9b7ee8" />
            <StatusPill label="DONE: 20"       bg="rgba(34,197,94,0.15)"   text="#4ade80" />
          </div>
        </>
      }
      actions={
        <>
          <SoftBtn icon={<NotebookPen className="h-3 w-3" strokeWidth={1.5} />} label="Story writer" />
          <SecondaryBtn icon={<Search className="h-3.5 w-3.5" strokeWidth={1.5} />} />
          <GhostBtn icon={<MoreHorizontal size={14} strokeWidth={1.5} />} />
        </>
      }
    />
  );
}

// Ticket Detail — VPL-43734
function B1TicketDetail() {
  return (
    <B1Shell
      treatment="plain-icon"
      center={
        <>
          {/* Story icon inline */}
          <Zap size={14} strokeWidth={1.5} className="shrink-0 text-white/25" />
          {/* Key */}
          <span className="shrink-0 font-mono text-sm font-medium text-white/40">{TICKET.key}</span>
          <ViewHeaderDivider />
          {/* Title */}
          <span className="min-w-0 flex-1 truncate font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-white/90">
            {TICKET.title}
          </span>
          {/* Breadcrumb */}
          <nav className="hidden lg:flex shrink-0 items-center gap-2 text-[11px]">
            <span className="flex items-center gap-1" style={{ color: "#d4904a", opacity: 0.55 }}>
              <IterationCw size={12} strokeWidth={1.5} />{TICKET.sprint}
            </span>
            <span className="text-white/[0.10]">/</span>
            <span className="flex items-center gap-1" style={{ color: "#9b6cd4", opacity: 0.55 }}>
              <Zap size={12} strokeWidth={1.5} />{TICKET.epicKey}
            </span>
          </nav>
          <JiraStatusPill status={TICKET.status} />
        </>
      }
      actions={
        <div className="flex shrink-0 items-center gap-1.5">
          <SecondaryBtn icon={<CloudDownload size={15} strokeWidth={1.5} />} />
          <SecondaryBtn icon={<ExternalLink size={15} strokeWidth={1.5} />} />
          <SoftBtn icon={<NotebookPen size={13} strokeWidth={1.5} />} label="Story writer" />
        </div>
      }
    />
  );
}

// Story Writer — VPL-43734
function B1StoryWriter() {
  return (
    <B1Shell
      treatment="plain-icon"
      center={
        <>
          <NotebookPen size={14} strokeWidth={1.5} className="shrink-0 text-white/25" />
          <ViewHeaderTitle>Story writer</ViewHeaderTitle>
          <ViewHeaderDivider />
          <span className="shrink-0 font-mono text-[15px] font-semibold text-white/90">{TICKET.key}</span>
          <ViewHeaderDivider />
          <span className="min-w-0 truncate text-[15px] font-semibold text-white/90">
            {TICKET.title}
          </span>
        </>
      }
      actions={
        <>
          <div className="flex h-7 items-center gap-1 rounded-md border border-white/[0.04] bg-white/[0.04] px-2 text-[11px] text-white/40">
            <Star size={11} strokeWidth={1.5} /> 92
          </div>
          <GhostBtn icon={<Save size={13} strokeWidth={1.5} />} label="Save draft" />
          <PrimaryBtn icon={<CloudUpload size={13} strokeWidth={1.5} />} label="Push to Jira" />
          <GhostBtn icon={<MoreHorizontal size={14} strokeWidth={1.5} />} />
        </>
      }
    />
  );
}

// Chat
function B1Chat() {
  return (
    <B1Shell
      treatment="plain-icon"
      center={
        <>
          <MessageCircle size={14} strokeWidth={1.5} className="shrink-0 text-white/25" />
          <ViewHeaderTitle>Chat</ViewHeaderTitle>
          <ViewHeaderDivider />
          <span className="text-sm text-white/30 shrink-0">24 messages</span>
        </>
      }
      actions={<></>}
    />
  );
}

// Settings
function B1Settings() {
  return (
    <B1Shell
      treatment="plain-icon"
      center={
        <>
          <Settings size={14} strokeWidth={1.5} className="shrink-0 text-white/25" />
          <ViewHeaderTitle>Settings</ViewHeaderTitle>
        </>
      }
      actions={<></>}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Audit row                                                           */
/* ------------------------------------------------------------------ */

function AuditRow({
  id, label, file, issues, note, children,
}: {
  id: string; label: string; file: string; issues?: string[]; note?: string; children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="font-mono text-[11px] font-semibold text-white/60">{id}</span>
        <span className="text-sm font-semibold text-white/80">{label}</span>
        <span className="font-mono text-[10px] text-white/25">{file}</span>
        {issues?.map((i) => (
          <span key={i} className="rounded bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-400/70">{i}</span>
        ))}
        {note && (
          <span className="ml-auto text-[10px] text-emerald-400/60">{note}</span>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-white/[0.08]">{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-[var(--font-display)] text-lg font-semibold tracking-[-0.02em] text-white/90 border-b border-white/[0.06] pb-3 mb-8">
      {children}
    </h2>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function HeadersAuditPage() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-8 py-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-[-0.03em] text-white mb-1">
          ViewHeader Bar Audit
        </h1>
        <p className="text-sm text-white/40 mb-10">
          Current state, icon-problem fix options, and B1 full-width topbar proposals per view.
        </p>

        {/* ---------------------------------------------------------- */}
        {/* 1. Current state                                            */}
        {/* ---------------------------------------------------------- */}
        <section className="mb-14">
          <SectionTitle>1 — Current State</SectionTitle>

          <AuditRow id="H1" label="Settings" file="settings/layout.tsx">
            <ViewHeader icon={<Settings2 size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />}>
              <ViewHeaderTitle>Settings</ViewHeaderTitle>
            </ViewHeader>
          </AuditRow>

          <AuditRow id="H2" label="Chat" file="chat/ChatLayout.tsx">
            <ViewHeader icon={<MessageCircle size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />}>
              <ViewHeaderTitle>Chat</ViewHeaderTitle>
              <ViewHeaderDivider />
              <span className="text-sm text-white/35">24 messages</span>
            </ViewHeader>
          </AuditRow>

          <AuditRow id="H3" label="Sprint Board" file="sprint-board/SprintBoard.tsx" issues={["h-4 inline divider"]}>
            <ViewHeader
              icon={<CalendarRange size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />}
              actions={<>
                <SoftBtn icon={<NotebookPen className="h-3 w-3" strokeWidth={1.5} />} label="Story writer" />
                <SecondaryBtn icon={<Search className="h-3.5 w-3.5" strokeWidth={1.5} />} />
                <GhostBtn icon={<MoreHorizontal size={14} strokeWidth={1.5} />} />
              </>}
            >
              <ViewHeaderTitle>BT: 134</ViewHeaderTitle>
              <ViewHeaderDivider />
              <span className="text-sm text-white/30 shrink-0">31 Mar - 9 Apr</span>
              <span className="text-xs tabular-nums text-white/30 shrink-0"><span className="text-white/20">Items</span> 40</span>
              <div className="h-4 w-px shrink-0 bg-white/[0.08]" />
              <div className="flex items-center gap-1.5">
                <StatusPill label="TO DO: 7"       bg="rgba(100,116,139,0.15)" text="#94a3b8" />
                <StatusPill label="IN PROGRESS: 2" bg="rgba(56,152,210,0.15)"  text="#58b4e6" />
                <StatusPill label="TEST: 5"        bg="rgba(120,90,220,0.15)"  text="#9b7ee8" />
                <StatusPill label="DONE: 20"       bg="rgba(34,197,94,0.15)"   text="#4ade80" />
              </div>
            </ViewHeader>
          </AuditRow>

          <AuditRow id="H4" label="Ticket Detail (VPL-43734)" file="tickets/[key]/page.tsx" issues={["ml-4 on actions", "no ViewHeaderTitle"]}>
            <ViewHeader
              icon={<Zap size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />}
              actions={
                <div className="ml-4 flex items-center gap-1.5">
                  <SecondaryBtn icon={<CloudDownload size={15} strokeWidth={1.5} />} />
                  <SecondaryBtn icon={<ExternalLink size={15} strokeWidth={1.5} />} />
                  <SoftBtn icon={<NotebookPen size={13} strokeWidth={1.5} />} label="Story writer" />
                </div>
              }
            >
              <span className="shrink-0 font-mono text-sm font-medium text-white/40">{TICKET.key}</span>
              <ViewHeaderDivider />
              <span className="min-w-0 flex-1 truncate font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-white/90">
                {TICKET.title}
              </span>
              <nav className="hidden lg:flex shrink-0 items-center gap-2 text-[11px]">
                <span className="flex items-center gap-1" style={{ color: "#d4904a", opacity: 0.55 }}>
                  <IterationCw size={12} strokeWidth={1.5} />{TICKET.sprint}
                </span>
                <span className="text-white/[0.10]">/</span>
                <span className="flex items-center gap-1" style={{ color: "#9b6cd4", opacity: 0.55 }}>
                  <Zap size={12} strokeWidth={1.5} />{TICKET.epicKey}
                </span>
              </nav>
              <JiraStatusPill status={TICKET.status} />
            </ViewHeader>
          </AuditRow>

          <AuditRow id="H5" label="Story Writer (VPL-43734)" file="story-writer/StoryWriterLayout.tsx" issues={["inline fontSize", "dash char separator"]}>
            <ViewHeader
              icon={<NotebookPen size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />}
              actions={<>
                <div className="flex h-7 items-center gap-1 rounded-md border border-white/[0.04] bg-white/[0.04] px-2 text-[11px] text-white/40">92</div>
                <GhostBtn icon={<Save size={13} strokeWidth={1.5} />} label="Save draft" />
                <PrimaryBtn icon={<CloudUpload size={13} strokeWidth={1.5} />} label="Push to Jira" />
                <GhostBtn icon={<MoreHorizontal size={14} strokeWidth={1.5} />} />
              </>}
            >
              <ViewHeaderTitle>Story writer</ViewHeaderTitle>
              <ViewHeaderDivider />
              <div className="flex items-center gap-2 min-w-0 leading-none" style={{ fontSize: "15px" }}>
                <Zap size={14} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
                <span className="font-mono font-semibold text-white/90 shrink-0">{TICKET.key}</span>
                <span className="text-white/30 shrink-0">–</span>
                <span className="min-w-0 truncate font-semibold text-white/90">{TICKET.title}</span>
              </div>
            </ViewHeader>
          </AuditRow>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* 2. The two-icons problem                                    */}
        {/* ---------------------------------------------------------- */}
        <section className="mb-14">
          <SectionTitle>2 — The Two-Icons Problem (B1 context)</SectionTitle>
          <p className="text-sm text-white/40 mb-8 -mt-4">
            When the logo sits in the header, a second icon box to the right competes with it.
            Four treatments — pick one to apply consistently.
          </p>

          <AuditRow id="X1" label="Box icon — current B1 (the problem)" file="" issues={["two similar boxes"]}>
            <TreatmentBox />
          </AuditRow>

          <AuditRow id="X2" label="Plain inline icon — no box, just the icon" file="" note="recommended">
            <TreatmentPlainIcon />
          </AuditRow>

          <AuditRow id="X3" label="Uppercase view label — text instead of icon" file="">
            <TreatmentLabel />
          </AuditRow>

          <AuditRow id="X4" label="No view icon — logo owns the icon language entirely" file="">
            <TreatmentNone />
          </AuditRow>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* 3. B1 full-width per view (plain-icon treatment)            */}
        {/* ---------------------------------------------------------- */}
        <section className="mb-14">
          <SectionTitle>3 — Proposal B1: All Views (plain-icon treatment)</SectionTitle>
          <p className="text-sm text-white/40 mb-8 -mt-4">
            Sidebar navigation stays vertical. Only the logo moves into the header bar when the sidebar is collapsed.
            View icon rendered as plain inline icon (X2 treatment).
          </p>

          <AuditRow id="B1-1" label="Sprint Board" file="">
            <B1SprintBoard />
          </AuditRow>

          <AuditRow id="B1-2" label="Chat" file="">
            <B1Chat />
          </AuditRow>

          <AuditRow id="B1-3" label="Settings" file="">
            <B1Settings />
          </AuditRow>

          <AuditRow id="B1-4" label="Ticket Detail — VPL-43734" file="">
            <B1TicketDetail />
          </AuditRow>

          <AuditRow id="B1-5" label="Story Writer — VPL-43734" file="">
            <B1StoryWriter />
          </AuditRow>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* 4. Implementation notes                                     */}
        {/* ---------------------------------------------------------- */}
        <section>
          <SectionTitle>4 — Implementation Notes</SectionTitle>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05]">
            {[
              {
                area: "Sidebar",
                note: "When expanded: show logo + wordmark as today. When collapsed: logo mark only (no change). The B1 header picks up the logo only when sidebar collapses, OR you always show it for a consistent full-width bar.",
              },
              {
                area: "ViewHeader component",
                note: "Add an optional `compact` prop that suppresses the icon box — the view icon is then rendered by the caller as a plain inline icon. Keeps backwards compat for the sidebar layout.",
              },
              {
                area: "Sidebar collapsed state",
                note: "Today the sidebar header aligns vertically with ViewHeader (both py-3.5, both 52px tall). This alignment must be preserved in the B1 layout.",
              },
              {
                area: "Story Writer separator",
                note: "Replace dash char (–) with ViewHeaderDivider. Remove inline fontSize style, use text-[15px] class.",
              },
              {
                area: "Ticket Detail",
                note: "Remove ml-4 from actions wrapper. Consider wrapping the ticket key in ViewHeaderTitle (style already matches).",
              },
            ].map(({ area, note }) => (
              <div key={area} className="grid grid-cols-[160px_1fr] gap-4 px-5 py-3.5 items-baseline">
                <span className="text-xs font-semibold text-white/60">{area}</span>
                <p className="text-xs text-white/50">{note}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
