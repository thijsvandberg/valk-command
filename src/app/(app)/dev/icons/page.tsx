"use client";

import {
  SlidersHorizontal,
  Layers,
  ListChecks,
  MessageSquareMore,
  ClipboardCheck,
  Filter,
  Gauge,
  Gem,
  Target,
  Workflow,
  RefreshCcw,
  Microscope,
  Sparkles,
  FlaskConical,
  SearchCheck,
  ListFilter,
  ScanSearch,
  LayoutList,
  NotebookPen,
} from "lucide-react";
import type { ReactNode } from "react";

const candidates: { name: string; icon: ReactNode; note: string }[] = [
  { name: "SlidersHorizontal", icon: <SlidersHorizontal />, note: "Current icon" },
  { name: "Layers", icon: <Layers />, note: "Stacked layers, depth" },
  { name: "ListChecks", icon: <ListChecks />, note: "Checklist / review" },
  { name: "ClipboardCheck", icon: <ClipboardCheck />, note: "Reviewed and approved" },
  { name: "Filter", icon: <Filter />, note: "Filtering / refining" },
  { name: "Gauge", icon: <Gauge />, note: "Measuring / scoring" },
  { name: "Gem", icon: <Gem />, note: "Polish / refine" },
  { name: "Target", icon: <Target />, note: "Precision / focus" },
  { name: "Workflow", icon: <Workflow />, note: "Process flow" },
  { name: "RefreshCcw", icon: <RefreshCcw />, note: "Iterative process" },
  { name: "Microscope", icon: <Microscope />, note: "Deep inspection" },
  { name: "Sparkles", icon: <Sparkles />, note: "Polish / enhance" },
  { name: "FlaskConical", icon: <FlaskConical />, note: "Experiment / distill" },
  { name: "SearchCheck", icon: <SearchCheck />, note: "Review and verify" },
  { name: "ListFilter", icon: <ListFilter />, note: "Filter list items" },
  { name: "ScanSearch", icon: <ScanSearch />, note: "Scanning / inspecting" },
  { name: "LayoutList", icon: <LayoutList />, note: "Structured list" },
  { name: "MessageSquareMore", icon: <MessageSquareMore />, note: "Discussion / feedback" },
  { name: "NotebookPen", icon: <NotebookPen />, note: "Notes / writing" },
];

function SidebarPreview({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-body-lg text-text-secondary bg-[var(--color-surface-elevated)]">
      <span className="h-5 w-5 shrink-0 [&>svg]:h-5 [&>svg]:w-5" style={{ strokeWidth: 1.5 }}>
        {icon}
      </span>
      <span>{label}</span>
    </div>
  );
}

export default function DevIconsPage() {
  return (
    <div className="mx-auto max-w-3xl p-8 space-y-8">
      <div>
        <h1 className="text-heading-lg text-text-primary mb-1">Refinement Icon Candidates</h1>
        <p className="text-body-sm text-text-tertiary">Pick one. Shown at sidebar size (20px, strokeWidth 1.5).</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {candidates.map((c) => (
          <div
            key={c.name}
            className="group flex flex-col items-center gap-3 rounded-xl border border-border-default bg-[var(--color-surface-elevated)] p-5 hover:border-[var(--color-brand-400)]/40 hover:bg-[var(--color-brand-500)]/[0.04]"
            style={{ transition: "border-color 0.15s ease, background-color 0.15s ease" }}
          >
            <span className="[&>svg]:h-6 [&>svg]:w-6 text-text-primary [&>svg]:stroke-[1.5]">
              {c.icon}
            </span>
            <span className="text-body-sm font-medium text-text-primary">{c.name}</span>
            <span className="text-caption text-text-tertiary text-center">{c.note}</span>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-heading-md text-text-primary mb-3">Sidebar preview</h2>
        <div className="inline-flex w-56 flex-col gap-1 rounded-xl border border-border-default bg-[var(--color-surface-base)] p-2">
          {candidates.slice(0, 8).map((c) => (
            <SidebarPreview key={c.name} icon={<span className="[&>svg]:stroke-[1.5]">{c.icon}</span>} label="Refinement" />
          ))}
        </div>
      </div>
    </div>
  );
}
