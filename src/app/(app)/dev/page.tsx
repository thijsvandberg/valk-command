"use client";

import {
  PenLine, MessageCircleQuestion, Target, Pause,
  Pencil, Clock, CheckCircle2, CircleSlash,
  FileEdit, MessageSquare, Rocket, Lock,
  PenTool, Bell, Sparkles, Ban,
  FilePen, Hourglass, ShieldCheck, OctagonX,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Current config (mirrored from types/ticket.ts)
// ---------------------------------------------------------------------------

type ReadinessKey = "drafting" | "waiting_for_feedback" | "ready_to_refine" | "on_hold";

interface ReadinessDef {
  label: string;
  color: string;
  bg: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

const CURRENT: Record<ReadinessKey, ReadinessDef> = {
  drafting:             { label: "Drafting",             color: "#4a9edd", bg: "rgba(74,158,221,0.12)",   Icon: PenLine },
  waiting_for_feedback: { label: "Waiting for Feedback", color: "#d97706", bg: "rgba(217,119,6,0.12)",   Icon: MessageCircleQuestion },
  ready_to_refine:      { label: "Ready to Refine",      color: "#8b5cf6", bg: "rgba(139,92,246,0.12)",  Icon: Target },
  on_hold:              { label: "On Hold",              color: "#8b9ab1", bg: "rgba(139,154,177,0.08)", Icon: Pause },
};

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

const PROPOSAL_A: Record<ReadinessKey, ReadinessDef> = {
  drafting:             { label: "Drafting",             color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  Icon: Pencil },
  waiting_for_feedback: { label: "Waiting for Feedback", color: "#38bdf8", bg: "rgba(56,189,248,0.12)", Icon: Clock },
  ready_to_refine:      { label: "Ready to Refine",      color: "#4ade80", bg: "rgba(74,222,128,0.12)", Icon: CheckCircle2 },
  on_hold:              { label: "On Hold",              color: "#f87171", bg: "rgba(248,113,113,0.10)", Icon: CircleSlash },
};

const PROPOSAL_B: Record<ReadinessKey, ReadinessDef> = {
  drafting:             { label: "Drafting",             color: "#818cf8", bg: "rgba(129,140,248,0.12)", Icon: FileEdit },
  waiting_for_feedback: { label: "Waiting for Feedback", color: "#fb923c", bg: "rgba(251,146,60,0.12)", Icon: MessageSquare },
  ready_to_refine:      { label: "Ready to Refine",      color: "#34d399", bg: "rgba(52,211,153,0.12)", Icon: Rocket },
  on_hold:              { label: "On Hold",              color: "#94a3b8", bg: "rgba(148,163,184,0.08)", Icon: Lock },
};

const PROPOSAL_C: Record<ReadinessKey, ReadinessDef> = {
  drafting:             { label: "Drafting",             color: "#c084fc", bg: "rgba(192,132,252,0.12)", Icon: PenTool },
  waiting_for_feedback: { label: "Waiting for Feedback", color: "#fbbf24", bg: "rgba(251,191,36,0.12)", Icon: Bell },
  ready_to_refine:      { label: "Ready to Refine",      color: "#2dd4bf", bg: "rgba(45,212,191,0.12)", Icon: Sparkles },
  on_hold:              { label: "On Hold",              color: "#fb7185", bg: "rgba(251,113,133,0.10)", Icon: Ban },
};

const PROPOSAL_D: Record<ReadinessKey, ReadinessDef> = {
  drafting:             { label: "Drafting",             color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  Icon: FilePen },
  waiting_for_feedback: { label: "Waiting for Feedback", color: "#e8a45a", bg: "rgba(232,164,90,0.12)", Icon: Hourglass },
  ready_to_refine:      { label: "Ready to Refine",      color: "#86efac", bg: "rgba(134,239,172,0.12)", Icon: ShieldCheck },
  on_hold:              { label: "On Hold",              color: "#9ca3af", bg: "rgba(156,163,175,0.08)", Icon: OctagonX },
};

const PROPOSALS = [
  { name: "Current", config: CURRENT },
  { name: "A", config: PROPOSAL_A },
  { name: "B", config: PROPOSAL_B },
  { name: "C", config: PROPOSAL_C },
  { name: "D", config: PROPOSAL_D },
];

const KEYS: ReadinessKey[] = ["drafting", "waiting_for_feedback", "ready_to_refine", "on_hold"];

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ReadinessBadge({ def, size = 14 }: { def: ReadinessDef; size?: number }) {
  return (
    <div
      className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium"
      style={{ backgroundColor: def.bg, color: def.color }}
    >
      <def.Icon size={size} strokeWidth={1.75} />
      <span>{def.label}</span>
    </div>
  );
}

function PillPreview({ config }: { config: Record<ReadinessKey, ReadinessDef> }) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-md bg-white/[0.06] ring-1 ring-inset ring-white/[0.06]">
      <span className="px-2 py-[3px] font-mono text-label font-medium text-white/50">VPL-123</span>
      {KEYS.map((k) => {
        const Icon = config[k].Icon;
        return (
          <div key={k} className="flex">
            <span className="w-px self-stretch bg-white/[0.07] shrink-0" />
            <button
              type="button"
              className="px-2 py-[3px] flex items-center justify-center hover:bg-white/[0.05] cursor-pointer"
              style={{ color: config[k].color }}
              title={config[k].label}
            >
              <Icon size={12} strokeWidth={1.75} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DevReadinessPage() {
  return (
    <div className="min-h-full bg-[var(--color-surface-base)] px-10 py-12">
      <div className="mx-auto max-w-3xl space-y-14">

        <div>
          <p className="text-xs font-mono text-white/30 mb-1">DEV / TEMP</p>
          <h1 className="text-2xl font-bold text-white/90 tracking-tight">Readiness — icon &amp; color proposals</h1>
          <p className="mt-1 text-sm text-white/40">Four statuses: Drafting · Waiting for Feedback · Ready to Refine · On Hold</p>
        </div>

        {PROPOSALS.map(({ name, config }) => (
          <section key={name} className="space-y-5">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-white/70 uppercase tracking-widest">
                {name === "Current" ? "Current" : `Proposal ${name}`}
              </h2>
              <span className="flex-1 h-px bg-white/[0.06]" />
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              {KEYS.map((k) => (
                <ReadinessBadge key={k} def={config[k]} />
              ))}
            </div>

            {/* Pill preview */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/30 w-16 shrink-0">In pill</span>
              <PillPreview config={config} />
            </div>

            {/* Icon + color swatches */}
            <div className="grid grid-cols-4 gap-3">
              {KEYS.map((k) => {
                const def = config[k];
                const Icon = def.Icon;
                return (
                  <div key={k} className="flex flex-col items-center gap-2 rounded-lg p-4" style={{ backgroundColor: def.bg }}>
                    <span style={{ color: def.color }}><Icon size={22} strokeWidth={1.5} /></span>
                    <span className="text-[10px] font-medium text-center leading-tight" style={{ color: def.color }}>
                      {def.label}
                    </span>
                    <span className="text-[9px] font-mono text-white/20">{def.color}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

      </div>
    </div>
  );
}
