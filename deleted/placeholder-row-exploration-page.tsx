import {
  Bookmark,
  Pencil,
  SquarePen,
  X,
  Hash,
  TrendingUp,
  ArrowUpRight,
  Ticket,
  TicketCheck,
  CircleArrowUp,
  SquareArrowOutUpRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// TEMPORARY preview page (BRDG-304 design exploration).
// Compares "Convert to ticket" icon candidates on the polished placeholder row,
// with Edit/Delete mirroring the subtask-row treatment. Delete this route once a
// direction is chosen.

const CONVERT_VARIANTS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "A", label: "Arrow up-right", icon: ArrowUpRight },
  { id: "B", label: "Ticket", icon: Ticket },
  { id: "C", label: "Ticket-check", icon: TicketCheck },
  { id: "D", label: "Circle arrow up", icon: CircleArrowUp },
  { id: "E", label: "Square arrow out", icon: SquareArrowOutUpRight },
];

// Mirrors the SubtasksSection Edit/Delete buttons exactly.
function ActionButton({ icon: Icon, label, tone = "default" }: { icon: LucideIcon; label: string; tone?: "default" | "danger" }) {
  return (
    <button
      type="button"
      className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-text-muted transition-colors duration-150 ${
        tone === "danger"
          ? "hover:bg-red-500/10 hover:text-red-500 active:bg-red-500/15"
          : "hover:bg-overlay-subtle hover:text-text-secondary active:bg-overlay-subtle/80"
      }`}
    >
      <Icon size={tone === "danger" ? 14 : 13} strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}

const TONE = { fg: "var(--meta-sp-fg)", bg: "color-mix(in srgb, #64748b 18%, transparent)", solid: "#64748b" };

function PlaceholderRowPreview({ convertIcon, variantId, variantLabel }: { convertIcon: LucideIcon; variantId: string; variantLabel: string }) {
  return (
    <div
      className="group/phrow relative flex items-center gap-2.5 px-4 py-2.5"
      style={{ backgroundColor: `color-mix(in srgb, ${TONE.solid} 5%, transparent)` }}
    >
      {/* variant marker first so the comparison label is always in view */}
      <span
        className="w-[150px] shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold tracking-wide"
        style={{ color: "var(--color-brand-300)", background: "color-mix(in srgb, var(--color-brand-500) 12%, transparent)" }}
      >
        {variantId} · {variantLabel}
      </span>

      <span
        className="flex h-6 shrink-0 items-center gap-1.5 rounded-md border border-dashed px-2 text-[11px] font-medium leading-none"
        style={{ color: TONE.fg, backgroundColor: TONE.bg, borderColor: `color-mix(in srgb, ${TONE.fg} 38%, transparent)` }}
      >
        <Pencil size={11} strokeWidth={2} />
        Placeholder
      </span>
      <span className="text-body-lg text-text-secondary">Hide prices flow</span>

      {/* estimate (guess-only) + BV chips */}
      <span
        className="flex items-center gap-1 rounded-md border border-dashed px-1.5 text-[11px] font-semibold tabular-nums"
        style={{ color: TONE.fg, borderColor: `color-mix(in srgb, ${TONE.fg} 45%, transparent)`, height: 22 }}
      >
        <Hash size={11} strokeWidth={2} /> 8
      </span>
      <span
        className="flex items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold tabular-nums"
        style={{ color: "var(--meta-bv-fg)", background: "color-mix(in srgb, #8b5cf6 18%, transparent)", height: 22 }}
      >
        <TrendingUp size={11} strokeWidth={2} /> 3
      </span>

      {/* actions packed right after the chips so the differing convert icon is always visible */}
      <span className="ml-1 flex items-center gap-0.5">
        <ActionButton icon={convertIcon} label="Convert to ticket" />
        <ActionButton icon={SquarePen} label="Edit" />
        <ActionButton icon={X} label="Delete" tone="danger" />
      </span>
    </div>
  );
}

export default function PlaceholderRowExploration() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-10 py-10 text-text-primary">
      <h1 className="text-heading-sm font-semibold text-text-secondary">Placeholder row — convert-icon candidates (BRDG-304)</h1>
      <p className="mt-1 text-body-sm text-text-muted">
        Polished placeholder row with spelled-out actions. Edit + Delete mirror the subtask rows.
        Hover any row to see the real reveal; they are shown always-on for side-by-side comparison.
      </p>

      <div className="mt-6 max-w-[940px] overflow-hidden rounded-xl border border-border-default bg-[var(--color-surface-elevated)] shadow-[var(--shadow-sm)]">
        {/* group header */}
        <div className="flex items-center gap-2.5 border-b border-border-subtle bg-[var(--color-surface-chrome)]/40 px-4 py-3">
          <span className="text-body-lg font-semibold">BT: 142</span>
          <span className="rounded-md bg-overlay-subtle px-2 py-0.5 text-[11px] text-text-muted">1 item</span>
          <span className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted bg-overlay-subtle">
            Future · 17 Jul – 30 Jul
          </span>
        </div>

        {/* reference real ticket */}
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-2.5">
          <Bookmark size={16} className="text-[#3fae7a]" strokeWidth={2} />
          <span className="font-mono text-body-sm text-text-secondary">VPL-46342</span>
          <span className="rounded-full bg-overlay-subtle px-2 py-0.5 text-[11px] text-text-muted">TO DO</span>
          <span className="text-body-lg">Hide prices flow</span>
        </div>

        {CONVERT_VARIANTS.map((v, i) => (
          <div key={v.id} className={i > 0 ? "border-t border-[var(--color-border-subtle)]/60" : ""}>
            <PlaceholderRowPreview convertIcon={v.icon} variantId={v.id} variantLabel={v.label} />
          </div>
        ))}
      </div>

      <p className="mt-6 max-w-[940px] text-body-sm text-text-muted">
        <b className="text-text-secondary">Edit</b> opens the inline title/notes editor;{" "}
        <b className="text-text-secondary">Delete</b> turns red on hover — both identical to the subtask rows.
        Creating a placeholder will move into the regular create composer (a “Placeholder” type option), so this
        row no longer needs its own “Add placeholder” affordance.
      </p>
    </div>
  );
}
