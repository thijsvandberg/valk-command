"use client";

import {
  SendHorizontal,
  Search,
  MoreHorizontal,
  NotebookPen,
  Trash2,
  Code2,
  Save,
  Plus,
  RefreshCw,
  BarChart2,
  ChevronDown,
  X,
  ArrowLeft,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  TEMPORARY PAGE: Button Audit Report                                */
/*  Created 2026-04-09 to map all button variants in the app.         */
/*  Safe to delete after the refactor.                                 */
/* ------------------------------------------------------------------ */

/* ---------- helpers ---------- */
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-12">
    <h2 className="font-[var(--font-display)] text-lg font-semibold text-white/90 tracking-[-0.02em] mb-5 border-b border-white/[0.06] pb-3">
      {title}
    </h2>
    {children}
  </section>
);

const VariantRow = ({
  label,
  description,
  files,
  issues,
  children,
}: {
  label: string;
  description: string;
  files: string[];
  issues?: string[];
  children: React.ReactNode;
}) => (
  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5 mb-4">
    <div className="flex items-start justify-between gap-6 mb-4">
      <div>
        <h3 className="text-sm font-semibold text-white/80 mb-1">{label}</h3>
        <p className="text-xs text-white/40 leading-relaxed max-w-xl">{description}</p>
      </div>
      {issues && issues.length > 0 && (
        <div className="shrink-0 flex flex-col gap-1">
          {issues.map((issue, i) => (
            <span key={i} className="text-[11px] text-amber-400/70 bg-amber-400/[0.08] rounded px-2 py-0.5 whitespace-nowrap">
              {issue}
            </span>
          ))}
        </div>
      )}
    </div>
    <div className="flex flex-wrap items-center gap-3 mb-3 p-4 rounded-lg bg-black/30 border border-white/[0.04]">
      {children}
    </div>
    <div className="flex flex-wrap gap-1.5">
      {files.map((f) => (
        <code key={f} className="text-[10px] text-white/25 bg-white/[0.03] rounded px-1.5 py-0.5">
          {f}
        </code>
      ))}
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Current color tokens (for reference in the report)                 */
/* ------------------------------------------------------------------ */
const ColorSwatch = ({ name, value }: { name: string; value: string }) => (
  <div className="flex items-center gap-2">
    <div className="h-6 w-6 rounded-md border border-white/10" style={{ backgroundColor: value }} />
    <div>
      <div className="text-[11px] text-white/60 font-mono">{name}</div>
      <div className="text-[10px] text-white/30 font-mono">{value}</div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Proposed Button component preview                                  */
/* ------------------------------------------------------------------ */
function ProposedButton({
  variant = "primary",
  size = "md",
  children,
  icon,
  iconOnly,
  disabled,
}: {
  variant?: "primary" | "secondary" | "soft" | "ghost" | "destructive" | "dashed";
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
  icon?: React.ReactNode;
  iconOnly?: boolean;
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center font-medium cursor-pointer transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed";

  const variants: Record<string, string> = {
    primary:
      "bg-[var(--color-brand-600)] text-white hover:bg-[var(--color-brand-500)] focus-visible:outline-[var(--color-brand-400)] shadow-[0_2px_8px_rgba(46,145,73,0.25)]",
    secondary:
      "bg-[#3d5af8]/15 text-[#93adff] border border-[#3d5af8]/25 hover:bg-[#3d5af8]/25 focus-visible:outline-[#6486fc]",
    soft:
      "bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] border border-[var(--color-brand-500)]/25 hover:bg-[var(--color-brand-500)]/20 focus-visible:outline-[var(--color-brand-400)]",
    ghost:
      "bg-white/[0.02] text-white/50 border border-white/[0.06] hover:bg-white/[0.06] hover:text-white/70 focus-visible:outline-[var(--color-brand-400)]",
    destructive:
      "text-red-400/80 hover:bg-red-500/10 hover:text-red-400 focus-visible:outline-red-400",
    dashed:
      "border border-dashed border-white/[0.12] text-white/40 hover:text-white/65 hover:border-white/[0.22] focus-visible:outline-[var(--color-brand-400)]",
  };

  const sizes: Record<string, string> = iconOnly
    ? { sm: "h-6 w-6 rounded-md", md: "h-7 w-7 rounded-md", lg: "h-9 w-9 rounded-lg" }
    : {
        sm: "h-6 gap-1 px-2 text-[11px] rounded-md",
        md: "h-7 gap-1.5 px-2.5 text-xs rounded-lg",
        lg: "h-9 gap-2 px-4 text-sm rounded-lg",
      };

  return (
    <button disabled={disabled} className={`${base} ${variants[variant]} ${sizes[size]}`}>
      {icon}
      {!iconOnly && children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function ButtonAuditPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 h-11 shrink-0 border-b border-white/[0.06] bg-[var(--color-surface-elevated)]">
        <a
          href="/sprint-board"
          className="text-white/30 hover:text-white/60 transition-colors duration-150"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
        </a>
        <span className="text-xs font-medium text-white/50 uppercase tracking-[0.08em]">
          Button Audit Report
        </span>
        <span className="text-[10px] text-white/20 ml-1">2026-04-09</span>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-4xl mx-auto">
          {/* ===== EXECUTIVE SUMMARY ===== */}
          <div className="mb-10">
            <h1 className="font-[var(--font-display)] text-xl font-bold text-white/90 tracking-[-0.03em] mb-3">
              Button Variant Audit
            </h1>
            <p className="text-sm text-white/50 leading-relaxed max-w-2xl">
              Scan van alle button-elementen in de applicatie. Er zijn <strong className="text-white/70">160+ inline buttons</strong> verspreid over 30+ bestanden, zonder gedeeld Button component. Hieronder staan alle gevonden varianten met live voorbeelden, gevolgd door een voorstel voor structurering.
            </p>
          </div>

          {/* ===== STATS ===== */}
          <div className="grid grid-cols-4 gap-3 mb-10">
            {[
              { label: "Button elements", value: "160+" },
              { label: "Unique style patterns", value: "11" },
              { label: "Files with buttons", value: "34" },
              { label: "Shared components", value: "0" },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 text-center">
                <div className="text-lg font-bold text-white/80 font-[var(--font-display)]">{s.value}</div>
                <div className="text-[11px] text-white/35 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* ===== PART 1: CURRENT STATE ===== */}
          <Section title="1. Huidige varianten (as-is)">

            <VariantRow
              label="Primary CTA"
              description="Solid brand-filled button. Used only for the chat send button. The strongest visual weight."
              files={["MessageInput.tsx"]}
              issues={["Only 1 usage"]}
            >
              <button className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-brand-600)] text-white shadow-[0_2px_8px_rgba(46,145,73,0.25)] cursor-pointer hover:bg-[var(--color-brand-500)] active:scale-95 transition-transform duration-150">
                <SendHorizontal className="h-4 w-4" strokeWidth={2} />
              </button>
              <span className="text-[11px] text-white/30">rounded-xl, h-10 w-10, shadow</span>
            </VariantRow>

            <VariantRow
              label="Brand Soft (meest gebruikte variant)"
              description="Light brand background with brand text. Used extensively for feature launches, save buttons, active filters, toggles. This is the de-facto 'primary action' button despite not being a solid fill."
              files={[
                "SprintBoard.tsx",
                "settings/page.tsx",
                "FilterBar.tsx",
                "StoryWriterLauncherModal.tsx",
              ]}
              issues={["Mixed sizing", "Mixed border-radius", "Inconsistent opacity values"]}
            >
              <button className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--color-brand-500)]/25 bg-[var(--color-brand-500)]/10 px-2.5 text-xs font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/20 transition-colors duration-150 shadow-[0_2px_8px_rgba(46,145,73,0.12)]">
                <NotebookPen className="h-3 w-3" strokeWidth={1.5} />Story writer
              </button>
              <button className="flex h-7 items-center gap-2 rounded-md border border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 px-3 text-xs font-medium text-[var(--color-brand-400)] cursor-pointer hover:bg-[var(--color-brand-500)]/20 transition-colors duration-150">
                <Save size={13} strokeWidth={1.5} />Save changes
              </button>
              <button className="flex items-center gap-1.5 rounded-lg border border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] px-2.5 py-1.5 text-xs cursor-pointer hover:bg-[var(--color-brand-500)]/20 transition-colors duration-150">
                <Code2 size={11} strokeWidth={1.5} />Codebase
              </button>
              <div className="w-full mt-2">
                <span className="text-[11px] text-amber-400/60">
                  Issue: rounded-md vs rounded-lg, border opacity /25 vs /30, h-7 vs py-1.5
                </span>
              </div>
            </VariantRow>

            <VariantRow
              label="Ghost / Surface"
              description="Subtle background with faint border. Used for icon buttons and secondary actions that need a visible 'target area'."
              files={[
                "SprintBoard.tsx",
                "SprintSlots.tsx",
                "SyncIndicator.tsx",
                "ConversationList.tsx",
              ]}
              issues={["Size varies: h-7/w-7 vs size-7 vs h-8", "Text opacity: /40 vs /50"]}
            >
              <button className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.02] text-white/40 cursor-pointer hover:bg-white/[0.04] hover:text-white/60 transition-colors duration-150" title="Search">
                <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
              <button className="flex size-7 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.02] text-white/50 cursor-pointer hover:bg-white/[0.04] hover:text-white/70 transition-colors duration-150" title="More">
                <MoreHorizontal size={14} strokeWidth={1.5} />
              </button>
              <button className="flex h-7 items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] text-white/50 px-2.5 text-xs cursor-pointer hover:bg-white/[0.04] hover:text-white/70 transition-colors duration-150">
                <RefreshCw size={12} strokeWidth={1.5} />Refresh
              </button>
            </VariantRow>

            <VariantRow
              label="Ghost Text-only (no bg, no border)"
              description="Bare text buttons with only hover color change. Used for clear actions, 'less important' secondary actions."
              files={[
                "BulkActionBar.tsx",
                "FilterBar.tsx",
                "SplitPaneHeader.tsx",
                "StoryDiff.tsx",
              ]}
              issues={["Opacity varies wildly: /30, /35, /40, /50, /60", "Some have hover bg, some don't", "Inconsistent: should these be ghost or truly invisible?"]}
            >
              <button className="text-xs text-white/30 cursor-pointer hover:text-white/50 transition-colors duration-150">
                Clear
              </button>
              <button className="rounded-md px-2.5 py-1 text-xs font-medium text-white/60 cursor-pointer hover:bg-white/[0.04] hover:text-white transition-colors duration-150">
                Set PO Status
              </button>
              <button className="rounded-md px-2.5 py-1 text-xs font-medium text-white/60 cursor-pointer hover:bg-white/[0.04] hover:text-white transition-colors duration-150">
                Refresh from Jira
              </button>
              <button className="rounded p-1 text-white/30 cursor-pointer hover:text-white/55 hover:bg-white/[0.05] transition-colors duration-150">
                <ChevronDown size={14} strokeWidth={1.5} />
              </button>
            </VariantRow>

            <VariantRow
              label="Destructive"
              description="Red-tinted buttons for delete/remove actions."
              files={["settings/page.tsx", "StoryDiff.tsx", "SidePanel.tsx", "TicketContent.tsx"]}
              issues={["Inconsistent red shades: red-400/70 vs red-400", "Some have hover:bg, some don't"]}
            >
              <button className="rounded-lg p-1.5 text-white/25 cursor-pointer hover:text-red-400 hover:bg-red-500/10 transition-colors duration-150">
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
              <button className="text-xs text-red-400/70 cursor-pointer hover:text-red-400 hover:bg-red-400/10 rounded-md px-2.5 py-1 transition-colors duration-150">
                Remove
              </button>
            </VariantRow>

            <VariantRow
              label="Filter Dropdown Trigger (dual state)"
              description="A button with two visual states: inactive = ghost surface, active = brand-soft. Used by all filter dropdowns in the sprint board."
              files={["FilterBar.tsx"]}
              issues={["Inline style transitions instead of Tailwind", "Complex dual-state logic repeated per filter"]}
            >
              <button className="flex items-center gap-1.5 rounded-lg border border-white/[0.07] bg-white/[0.03] text-white/50 px-3 py-1.5 text-[13px] font-medium cursor-pointer hover:bg-white/[0.06] transition-colors duration-150">
                Status
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-40" strokeWidth={1.5} />
              </button>
              <button className="flex items-center gap-1.5 rounded-lg border border-[var(--color-brand-500)]/35 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-300)] px-3 py-1.5 text-[13px] font-medium cursor-pointer transition-colors duration-150">
                Status
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold bg-[var(--color-brand-500)] text-white">
                  2
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-40 rotate-180" strokeWidth={1.5} />
              </button>
            </VariantRow>

            <VariantRow
              label="Tab / Underline Toggle"
              description="Underlined tab buttons with brand-accent bottom border. Used for switching between content panels."
              files={[
                "settings/page.tsx",
                "SprintSlots.tsx",
                "StoryWriterEditor.tsx",
                "TabButton.tsx",
              ]}
              issues={["TabButton.tsx exists but isn't reused everywhere", "Some use after: pseudo, some use border-b-2"]}
            >
              <div className="flex items-center border-b border-white/[0.06]">
                <button className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px border-[var(--color-brand-400)] text-white/90 cursor-pointer transition-colors duration-150">
                  Active
                </button>
                <button className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px border-transparent text-white/40 cursor-pointer hover:text-white/65 hover:border-white/20 transition-colors duration-150">
                  Inactive
                </button>
              </div>
            </VariantRow>

            <VariantRow
              label="Dropdown Menu Item"
              description="Full-width items inside dropdown menus. Some have active states with brand coloring."
              files={[
                "SprintBoard.tsx",
                "BulkActionBar.tsx",
                "TicketTableCells.tsx",
                "Toolbar.tsx",
              ]}
              issues={["py-1.5 vs py-2 vs py-2.5", "text-xs vs text-[13px]", "Gap sizes vary"]}
            >
              <div className="w-56 rounded-xl border border-white/[0.10] bg-[var(--color-surface-floating)] py-1.5">
                <button className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--color-brand-400)] bg-[var(--color-brand-500)]/[0.08] cursor-pointer transition-colors duration-150">
                  <BarChart2 size={13} strokeWidth={1.5} className="shrink-0" />
                  <span>Analytics (active)</span>
                </button>
                <button className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-white/65 cursor-pointer hover:bg-white/[0.06] hover:text-white/85 transition-colors duration-150">
                  <RefreshCw size={13} strokeWidth={1.5} className="shrink-0" />
                  <span>Compare</span>
                </button>
              </div>
            </VariantRow>

            <VariantRow
              label="Dashed 'Add' Button"
              description="Dashed border button for adding new items. Signals 'empty slot' / 'add more'."
              files={["settings/page.tsx"]}
              issues={["Only used once, but a useful pattern"]}
            >
              <button className="flex items-center gap-2 rounded-lg border border-dashed border-white/[0.12] px-3 py-2 text-sm text-white/40 cursor-pointer hover:text-white/65 hover:border-white/[0.22] transition-colors duration-150">
                <Plus size={14} strokeWidth={1.5} />
                Add prompt
              </button>
            </VariantRow>

            <VariantRow
              label="Sort Header Button"
              description="Bare column headers that act as sort toggles. No button styling, just cursor and hover text color."
              files={["TicketTable.tsx"]}
              issues={["Not really a variant, more like unstyled interactive text"]}
            >
              <button className="flex items-center cursor-pointer text-white/50 hover:text-white/60 text-xs font-medium transition-colors duration-150">
                Key
                <ChevronDown className="h-3 w-3 ml-1 opacity-50" strokeWidth={1.5} />
              </button>
              <button className="flex items-center cursor-pointer text-white/50 hover:text-white/60 text-xs font-medium transition-colors duration-150">
                Title
              </button>
            </VariantRow>

          </Section>

          {/* ===== PART 2: ISSUES ===== */}
          <Section title="2. Geidentificeerde problemen">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  title: "Geen gedeeld Button component",
                  desc: "Alle 160+ buttons zijn inline met Tailwind. Wijzigingen in stijl vereisen vinden-en-vervangen door de hele codebase.",
                },
                {
                  title: "Inconsistente sizing",
                  desc: "Hoogte varieert: h-6, h-7, h-8, h-9, h-10. Padding varieert: px-2 t/m px-4, py-0.5 t/m py-3. Geen standaard sizing tokens.",
                },
                {
                  title: "Inconsistente border-radius",
                  desc: "rounded, rounded-md, rounded-lg, rounded-xl door elkaar heen, zelfs binnen dezelfde view.",
                },
                {
                  title: "Wisselende opacities",
                  desc: "text-white/30, /35, /40, /50, /60 worden willekeurig gebruikt. Geen consistent systeem voor visuele hierarchie.",
                },
                {
                  title: "Transition durations variabel",
                  desc: "80ms, 100ms, 120ms, 150ms worden door elkaar gebruikt. Sommige gebruiken inline style, andere Tailwind utility.",
                },
                {
                  title: "Active/pressed feedback verschilt",
                  desc: "active:scale-95, active:scale-[0.97], active:scale-[0.98], of helemaal geen press feedback.",
                },
                {
                  title: "Brand-soft doet dienst als primary",
                  desc: "De meest gebruikte button (brand-soft) is eigenlijk een secondary style. De echte primary (solid fill) wordt bijna nergens gebruikt.",
                },
                {
                  title: "Geen secondary color beschikbaar",
                  desc: "Alles is brand-green of neutral white-alpha. Er is geen secundaire kleur voor 'informational' of 'alternative' acties.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4"
                >
                  <h3 className="text-xs font-semibold text-white/70 mb-1">{item.title}</h3>
                  <p className="text-[11px] text-white/35 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* ===== PART 3: COLOR PROPOSAL ===== */}
          <Section title="3. Kleurvoorstel: Secondary color">
            <p className="text-sm text-white/45 leading-relaxed mb-6 max-w-2xl">
              Voorstel: een <strong className="text-[#93adff]">blue-slate secondary</strong> als aanvulling op de brand green. Blue voor informatieve/neutrale acties (navigatie, filters, info-actions), green voor positieve/primaire acties (save, create, send).
            </p>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div>
                <h4 className="text-xs font-medium text-white/50 mb-3 uppercase tracking-[0.06em]">
                  Brand (primary) - huidige green
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <ColorSwatch name="brand-300" value="#7ac48a" />
                  <ColorSwatch name="brand-400" value="#4aaa60" />
                  <ColorSwatch name="brand-500" value="#2e9149" />
                  <ColorSwatch name="brand-600" value="#22753a" />
                  <ColorSwatch name="brand-700" value="#1d5d30" />
                  <ColorSwatch name="brand-800" value="#1a4a29" />
                </div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-white/50 mb-3 uppercase tracking-[0.06em]">
                  Secondary (nieuw) - blue-slate
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <ColorSwatch name="secondary-300" value="#93adff" />
                  <ColorSwatch name="secondary-400" value="#6486fc" />
                  <ColorSwatch name="secondary-500" value="#3d5af8" />
                  <ColorSwatch name="secondary-600" value="#2738ed" />
                  <ColorSwatch name="secondary-700" value="#1f28d9" />
                  <ColorSwatch name="secondary-800" value="#2024b0" />
                </div>
              </div>
            </div>

            <p className="text-xs text-white/30 leading-relaxed max-w-2xl mb-4">
              De blue-slate is koel-toned zodat hij goed complementeert met de warme green, maar niet te heftig is in het donkere UI. De secondary-400 (#6486fc) en secondary-300 (#93adff) zijn de meest-gebruikte tints voor text en soft-fill varianten.
            </p>
          </Section>

          {/* ===== PART 4: PROPOSED SYSTEM ===== */}
          <Section title="4. Voorstel: Button Design System">
            <p className="text-sm text-white/45 leading-relaxed mb-6 max-w-2xl">
              Een gedeeld <code className="text-white/60 bg-white/[0.05] px-1.5 py-0.5 rounded text-[13px]">{"<Button>"}</code> component met 6 varianten en 3 sizes. Alle huidige inline buttons kunnen hiernaar gemigreerd worden.
            </p>

            {/* Variant showcase */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 mb-6">
              <h4 className="text-xs font-medium text-white/50 mb-4 uppercase tracking-[0.06em]">
                Varianten
              </h4>
              <div className="space-y-4">

                {/* Primary */}
                <div className="flex items-center gap-6">
                  <div className="w-28 shrink-0">
                    <div className="text-xs font-semibold text-white/70">primary</div>
                    <div className="text-[10px] text-white/30">Hoofdactie (save, send, create)</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProposedButton variant="primary" size="lg" icon={<Save size={14} strokeWidth={1.5} />}>Save</ProposedButton>
                    <ProposedButton variant="primary" size="md" icon={<Save size={13} strokeWidth={1.5} />}>Save</ProposedButton>
                    <ProposedButton variant="primary" size="sm" icon={<Save size={11} strokeWidth={1.5} />}>Save</ProposedButton>
                    <ProposedButton variant="primary" size="md" icon={<SendHorizontal size={14} strokeWidth={2} />} iconOnly />
                    <ProposedButton variant="primary" size="md" disabled>Disabled</ProposedButton>
                  </div>
                </div>

                {/* Secondary */}
                <div className="flex items-center gap-6">
                  <div className="w-28 shrink-0">
                    <div className="text-xs font-semibold text-[#93adff]">secondary</div>
                    <div className="text-[10px] text-white/30">Info/navigatie acties</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProposedButton variant="secondary" size="lg" icon={<BarChart2 size={14} strokeWidth={1.5} />}>Analytics</ProposedButton>
                    <ProposedButton variant="secondary" size="md" icon={<Search size={13} strokeWidth={1.5} />}>Search</ProposedButton>
                    <ProposedButton variant="secondary" size="sm">Filter</ProposedButton>
                    <ProposedButton variant="secondary" size="md" icon={<Search size={14} strokeWidth={1.5} />} iconOnly />
                    <ProposedButton variant="secondary" size="md" disabled>Disabled</ProposedButton>
                  </div>
                </div>

                {/* Soft */}
                <div className="flex items-center gap-6">
                  <div className="w-28 shrink-0">
                    <div className="text-xs font-semibold text-[var(--color-brand-400)]">soft</div>
                    <div className="text-[10px] text-white/30">Feature launchers, toggles</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProposedButton variant="soft" size="lg" icon={<NotebookPen size={14} strokeWidth={1.5} />}>Story writer</ProposedButton>
                    <ProposedButton variant="soft" size="md" icon={<Code2 size={13} strokeWidth={1.5} />}>Codebase</ProposedButton>
                    <ProposedButton variant="soft" size="sm">Toggle</ProposedButton>
                    <ProposedButton variant="soft" size="md" icon={<RefreshCw size={13} strokeWidth={1.5} />} iconOnly />
                    <ProposedButton variant="soft" size="md" disabled>Disabled</ProposedButton>
                  </div>
                </div>

                {/* Ghost */}
                <div className="flex items-center gap-6">
                  <div className="w-28 shrink-0">
                    <div className="text-xs font-semibold text-white/60">ghost</div>
                    <div className="text-[10px] text-white/30">Subtiele acties, icon buttons</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProposedButton variant="ghost" size="lg" icon={<RefreshCw size={14} strokeWidth={1.5} />}>Refresh</ProposedButton>
                    <ProposedButton variant="ghost" size="md">More options</ProposedButton>
                    <ProposedButton variant="ghost" size="sm">Clear</ProposedButton>
                    <ProposedButton variant="ghost" size="md" icon={<MoreHorizontal size={14} strokeWidth={1.5} />} iconOnly />
                    <ProposedButton variant="ghost" size="md" icon={<Search size={14} strokeWidth={1.5} />} iconOnly />
                    <ProposedButton variant="ghost" size="md" disabled>Disabled</ProposedButton>
                  </div>
                </div>

                {/* Destructive */}
                <div className="flex items-center gap-6">
                  <div className="w-28 shrink-0">
                    <div className="text-xs font-semibold text-red-400">destructive</div>
                    <div className="text-[10px] text-white/30">Verwijderen, annuleren</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProposedButton variant="destructive" size="lg" icon={<Trash2 size={14} strokeWidth={1.5} />}>Delete</ProposedButton>
                    <ProposedButton variant="destructive" size="md" icon={<X size={13} strokeWidth={1.5} />}>Remove</ProposedButton>
                    <ProposedButton variant="destructive" size="sm">Cancel</ProposedButton>
                    <ProposedButton variant="destructive" size="md" icon={<Trash2 size={14} strokeWidth={1.5} />} iconOnly />
                  </div>
                </div>

                {/* Dashed */}
                <div className="flex items-center gap-6">
                  <div className="w-28 shrink-0">
                    <div className="text-xs font-semibold text-white/50">dashed</div>
                    <div className="text-[10px] text-white/30">Toevoegen, empty state</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProposedButton variant="dashed" size="lg" icon={<Plus size={14} strokeWidth={1.5} />}>Add item</ProposedButton>
                    <ProposedButton variant="dashed" size="md" icon={<Plus size={13} strokeWidth={1.5} />}>Add</ProposedButton>
                    <ProposedButton variant="dashed" size="sm" icon={<Plus size={11} strokeWidth={1.5} />}>Add</ProposedButton>
                  </div>
                </div>
              </div>
            </div>

            {/* Size system */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 mb-6">
              <h4 className="text-xs font-medium text-white/50 mb-4 uppercase tracking-[0.06em]">
                Sizing
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-white/40 border-b border-white/[0.06]">
                      <th className="pb-2 pr-6 font-medium">Size</th>
                      <th className="pb-2 pr-6 font-medium">Height</th>
                      <th className="pb-2 pr-6 font-medium">Padding</th>
                      <th className="pb-2 pr-6 font-medium">Font</th>
                      <th className="pb-2 pr-6 font-medium">Radius</th>
                      <th className="pb-2 font-medium">Icon-only</th>
                    </tr>
                  </thead>
                  <tbody className="text-white/60">
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-2.5 pr-6 font-semibold text-white/70">sm</td>
                      <td className="py-2.5 pr-6 font-mono text-[11px]">h-6 (24px)</td>
                      <td className="py-2.5 pr-6 font-mono text-[11px]">px-2 gap-1</td>
                      <td className="py-2.5 pr-6 font-mono text-[11px]">11px</td>
                      <td className="py-2.5 pr-6 font-mono text-[11px]">rounded-md</td>
                      <td className="py-2.5 font-mono text-[11px]">h-6 w-6</td>
                    </tr>
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-2.5 pr-6 font-semibold text-white/70">md</td>
                      <td className="py-2.5 pr-6 font-mono text-[11px]">h-7 (28px)</td>
                      <td className="py-2.5 pr-6 font-mono text-[11px]">px-2.5 gap-1.5</td>
                      <td className="py-2.5 pr-6 font-mono text-[11px]">12px (text-xs)</td>
                      <td className="py-2.5 pr-6 font-mono text-[11px]">rounded-lg</td>
                      <td className="py-2.5 font-mono text-[11px]">h-7 w-7</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-6 font-semibold text-white/70">lg</td>
                      <td className="py-2.5 pr-6 font-mono text-[11px]">h-9 (36px)</td>
                      <td className="py-2.5 pr-6 font-mono text-[11px]">px-4 gap-2</td>
                      <td className="py-2.5 pr-6 font-mono text-[11px]">14px (text-sm)</td>
                      <td className="py-2.5 pr-6 font-mono text-[11px]">rounded-lg</td>
                      <td className="py-2.5 font-mono text-[11px]">h-9 w-9</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Standardized tokens */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-6 mb-6">
              <h4 className="text-xs font-medium text-white/50 mb-4 uppercase tracking-[0.06em]">
                Gestandaardiseerde tokens
              </h4>
              <div className="grid grid-cols-2 gap-4 text-[11px]">
                <div>
                  <div className="text-white/50 font-medium mb-2">Transitions</div>
                  <div className="text-white/30 space-y-1">
                    <div><code className="text-white/50">duration-150</code> voor alle buttons (uniform)</div>
                    <div><code className="text-white/50">active:scale-[0.97]</code> voor press feedback (uniform)</div>
                  </div>
                </div>
                <div>
                  <div className="text-white/50 font-medium mb-2">Focus ring</div>
                  <div className="text-white/30 space-y-1">
                    <div><code className="text-white/50">focus-visible:outline-2 outline-offset-2</code></div>
                    <div>Color: variant-matched (brand voor primary/soft, blue voor secondary, red voor destructive)</div>
                  </div>
                </div>
                <div>
                  <div className="text-white/50 font-medium mb-2">Ghost text opacity</div>
                  <div className="text-white/30 space-y-1">
                    <div>Default: <code className="text-white/50">text-white/50</code></div>
                    <div>Hover: <code className="text-white/50">text-white/70</code></div>
                    <div>Geen /30, /35, /40, /60 meer</div>
                  </div>
                </div>
                <div>
                  <div className="text-white/50 font-medium mb-2">Disabled</div>
                  <div className="text-white/30 space-y-1">
                    <div><code className="text-white/50">disabled:opacity-40 disabled:cursor-not-allowed</code></div>
                    <div>Uniform voor alle varianten</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Migration mapping */}
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-6">
              <h4 className="text-xs font-medium text-white/50 mb-4 uppercase tracking-[0.06em]">
                Migratieschema: oud naar nieuw
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-white/40 border-b border-white/[0.06]">
                      <th className="pb-2 pr-6 font-medium">Huidige pattern</th>
                      <th className="pb-2 pr-6 font-medium">Wordt</th>
                      <th className="pb-2 font-medium">Voorbeeld</th>
                    </tr>
                  </thead>
                  <tbody className="text-white/55">
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-2.5 pr-6">Solid brand-600 fill</td>
                      <td className="py-2.5 pr-6 font-mono text-[var(--color-brand-400)]">{"<Button variant=\"primary\">"}</td>
                      <td className="py-2.5">Send, Confirm, Save</td>
                    </tr>
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-2.5 pr-6">Brand-500/10 bg + brand text</td>
                      <td className="py-2.5 pr-6 font-mono text-[var(--color-brand-400)]">{"<Button variant=\"soft\">"}</td>
                      <td className="py-2.5">Story writer, Codebase toggle</td>
                    </tr>
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-2.5 pr-6">white/[0.02] bg + white/[0.06] border</td>
                      <td className="py-2.5 pr-6 font-mono text-white/60">{"<Button variant=\"ghost\">"}</td>
                      <td className="py-2.5">Search icon, More menu, Refresh</td>
                    </tr>
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-2.5 pr-6">Bare text hover-only</td>
                      <td className="py-2.5 pr-6 font-mono text-white/60">{"<Button variant=\"ghost\">"}</td>
                      <td className="py-2.5">Clear, secondary toolbar actions</td>
                    </tr>
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-2.5 pr-6">Red-tinted delete/remove</td>
                      <td className="py-2.5 pr-6 font-mono text-red-400">{"<Button variant=\"destructive\">"}</td>
                      <td className="py-2.5">Trash, Remove, Cancel</td>
                    </tr>
                    <tr className="border-b border-white/[0.04]">
                      <td className="py-2.5 pr-6">Dashed border add</td>
                      <td className="py-2.5 pr-6 font-mono text-white/60">{"<Button variant=\"dashed\">"}</td>
                      <td className="py-2.5">Add prompt, Add item</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-6">N/A (nieuw)</td>
                      <td className="py-2.5 pr-6 font-mono text-[#93adff]">{"<Button variant=\"secondary\">"}</td>
                      <td className="py-2.5">Analytics, Search, Filter acties</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </Section>

          {/* ===== PART 5: IMPLEMENTATION NOTES ===== */}
          <Section title="5. Implementatieplan">
            <div className="space-y-3 text-sm text-white/45 leading-relaxed max-w-2xl">
              <div className="flex gap-3">
                <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-white/50">1</span>
                <span>Secondary color tokens toevoegen aan <code className="text-white/55 text-xs bg-white/[0.04] px-1 rounded">globals.css</code></span>
              </div>
              <div className="flex gap-3">
                <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-white/50">2</span>
                <span><code className="text-white/55 text-xs bg-white/[0.04] px-1 rounded">src/components/ui/Button.tsx</code> aanmaken met variant + size props</span>
              </div>
              <div className="flex gap-3">
                <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-white/50">3</span>
                <span>Per view migreren: eerst SprintBoard + FilterBar (grootste wildgroei), dan rest</span>
              </div>
              <div className="flex gap-3">
                <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-white/50">4</span>
                <span>Tab buttons, filter toggles, en menu items zijn aparte componenten (niet in Button, maar wel gestandaardiseerd)</span>
              </div>
              <div className="flex gap-3">
                <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-white/50">5</span>
                <span>Lint rule of review checklist: nieuwe inline buttons = code smell</span>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
