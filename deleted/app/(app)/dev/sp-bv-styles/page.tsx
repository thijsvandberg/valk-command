"use client";

// Temporary dev showcase for BRDG-240: making Story Points (SP) and Business
// Value (BV) instantly recognizable in the sprint-board table. Direction B
// (icon + color) is the chosen approach; BV uses the target icon. This page now
// helps finalize the SP icon (effort/complexity) and shows the subtle vs tinted
// treatment on the real BT: 138 backlog. Not linked from navigation, excluded
// from routes.test.tsx, safe to delete once the SP icon is chosen.

import { useState } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Gauge, CircleGauge, Target, SignalHigh, Dumbbell, Boxes, Mountain, Brain, Sparkles, type LucideIcon } from "lucide-react";
import { ViewHeader, ViewHeaderTitle } from "@/components/shared/ViewHeader";
import { StoryPointPicker } from "@/components/shared/StoryPointPicker";
import { BusinessValuePicker } from "@/components/shared/BusinessValuePicker";
import { IssueTypeIcon } from "@/components/shared/IssueTypeIcon";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { getSpColor, getBvColor } from "@/types/ticket";
import type { JiraStatus, IssueType } from "@/types/ticket";

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

type Row = { key: string; title: string; sp: number; bv: number };

const ROWS: Row[] = [
  { key: "VPL-45728", title: "Adopt outside-click cleanup", sp: 3, bv: 2 },
  { key: "VPL-45802", title: "Activity Log crash on wrapped response", sp: 5, bv: 5 },
  { key: "VPL-45803", title: "Archive completed stories", sp: 1, bv: 2 },
  { key: "VPL-45810", title: "Investigate sync watermark drift", sp: 8, bv: 4 },
  { key: "VPL-45811", title: "Confluence integration v2", sp: 2, bv: 7 },
];

// Real snapshot of sprint "BT: 138" (Jira sprint id 5995), stories and bugs
// only, in board order. SP / BV exactly as stored today (0 = N/A → "-").
type BoardRow = { key: string; type: IssueType; status: JiraStatus; sp: number | null; bv: number | null; title: string };

const BT138_ROWS: BoardRow[] = [
  { key: "VPL-45923", type: "story", status: "IN PROGRESS", sp: 0, bv: 0, title: "Set arrival and departure in calendar when entering bookingtool with a package" },
  { key: "VPL-44816", type: "story", status: "TO DO", sp: 5, bv: 2, title: "Create reproducable benchmark data set and tests for common scenarios" },
  { key: "VPL-45728", type: "story", status: "IN PROGRESS", sp: 2, bv: 2, title: "Get group details by group code" },
  { key: "VPL-45729", type: "story", status: "IN PROGRESS", sp: 1, bv: 2, title: "Create reusable group validation rules" },
  { key: "VPL-45730", type: "story", status: "IN PROGRESS", sp: 2, bv: 3, title: `Display "Group Code" card with group details below search widget` },
  { key: "VPL-45731", type: "story", status: "TO DO", sp: 2, bv: 3, title: "Scope room availability and pricing to group block in /rooms call" },
  { key: "VPL-42510", type: "story", status: "TO DO", sp: 5, bv: 3, title: "[Initial-sync] Implement initial restrictions sync" },
  { key: "VPL-42505", type: "story", status: "TO DO", sp: 2, bv: 2, title: "[incremental-sync] Handle RestrictionsChangedInProperty notifications" },
  { key: "VPL-42511", type: "story", status: "TO DO", sp: 1, bv: 1, title: "[Query] Create an ari-query microservice" },
  { key: "VPL-45794", type: "bug", status: "TEST", sp: 1, bv: 2, title: "Fix payment confirmation email receipt" },
  { key: "VPL-43487", type: "bug", status: "TEST", sp: 1, bv: 3, title: `Bugfix: Upsell sidebar shows "Hotelkamer" fallback instead of actual room name` },
  { key: "VPL-45720", type: "bug", status: "IN PROGRESS", sp: 1, bv: 3, title: "Validate promotion / ratePlan for deal" },
  { key: "VPL-45823", type: "bug", status: "TO DO", sp: 1, bv: 2, title: "Hide extra from previously booked extras in upsell app when not known in BO" },
  { key: "VPL-43779", type: "story", status: "TO DO", sp: 1, bv: 1, title: "Bypass Recaptcha for k6 tests for corporate flow" },
  { key: "VPL-43736", type: "story", status: "DONE", sp: 1, bv: 3, title: "Exclude reservations with pet PES codes (othpet/othpetan) from room upgrade" },
  { key: "VPL-45795", type: "story", status: "DONE", sp: 1, bv: 2, title: "Show descriptive error in case of overbooking" },
  { key: "VPL-45604", type: "bug", status: "DONE", sp: 1, bv: 1, title: "Prevent DLQ messages for reservations not created via VP" },
  { key: "VPL-41122", type: "story", status: "DONE", sp: 3, bv: 4, title: `Release "hold" loyal on manual cancellation` },
  { key: "VPL-45946", type: "bug", status: "DONE", sp: 1, bv: 4, title: "Split gift card payment partially not recorded in Daylight" },
];

const SP_PRESETS = [1, 2, 3, 5, 8];
const BV_PRESETS = [1, 2, 3, 4, 5, 6, 7];

// SP is about effort / complexity. Candidate leading icons to choose from.
const SP_ICON_CANDIDATES: { name: string; Icon: LucideIcon; note: string }[] = [
  { name: "Gauge", Icon: Gauge, note: "effort meter" },
  { name: "CircleGauge", Icon: CircleGauge, note: "effort dial (filled)" },
  { name: "SignalHigh", Icon: SignalHigh, note: "magnitude / level" },
  { name: "Dumbbell", Icon: Dumbbell, note: "weight / heaviness" },
  { name: "Mountain", Icon: Mountain, note: "difficulty / climb" },
  { name: "Brain", Icon: Brain, note: "cognitive complexity" },
  { name: "Boxes", Icon: Boxes, note: "amount of work" },
];

// BV is decided: the target icon (value / goal).
const BV_ICON: LucideIcon = Target;

// ---------------------------------------------------------------------------
// Cell renderer — direction B (icon + color)
// ---------------------------------------------------------------------------

type Kind = "sp" | "bv";

// The unset (null) placeholder used by the real subtle pickers.
function EmptyDot() {
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-overlay-strong align-middle" />;
}

function IconCell({
  kind,
  value,
  spIcon,
  withBg = false,
}: {
  kind: Kind;
  value: number | null;
  spIcon: LucideIcon;
  withBg?: boolean;
}) {
  if (value === null) return <EmptyDot />;
  const c = kind === "sp" ? getSpColor(value) : getBvColor(value);
  const Icon = kind === "sp" ? spIcon : BV_ICON;
  return (
    <span
      className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-body-sm font-medium tabular-nums"
      style={{ color: c.text, backgroundColor: withBg ? c.bg : "transparent" }}
    >
      <Icon size={12} strokeWidth={2} />
      {value === 0 ? "-" : value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="font-[var(--font-display)] text-heading-sm font-semibold tracking-tight text-text-primary">{title}</h2>
      {description ? (
        <p className="mt-1 mb-4 max-w-2xl text-body-sm text-text-tertiary leading-relaxed">{description}</p>
      ) : (
        <div className="mb-4" />
      )}
      {children}
    </section>
  );
}

function Specimen({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border-default bg-[var(--color-surface-elevated)] p-4">
      <span className="font-mono text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

// A faithful sprint-board-style table on the real BT: 138 rows: type icon, key,
// status, title, then SP / BV cells in direction B.
function BoardTable({ spIcon, tinted }: { spIcon: LucideIcon; tinted: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border-default bg-[var(--color-surface-elevated)]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border-default text-left">
            <th className="px-4 py-2.5 text-label font-medium uppercase tracking-wide text-text-muted">Key</th>
            <th className="px-4 py-2.5 text-label font-medium uppercase tracking-wide text-text-muted">Title</th>
            <th className="w-16 px-3 py-2.5 text-center text-label font-medium uppercase tracking-wide text-text-muted">SP</th>
            <th className="w-16 px-3 py-2.5 text-center text-label font-medium uppercase tracking-wide text-text-muted">BV</th>
          </tr>
        </thead>
        <tbody>
          {BT138_ROWS.map((r) => (
            <tr key={r.key} className="border-b border-border-subtle last:border-0 hover:bg-[var(--color-surface-elevated-hover)]">
              <td className="px-4 py-2 align-middle">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <IssueTypeIcon type={r.type} size={15} />
                  <span className="font-mono text-body-sm text-text-tertiary">{r.key}</span>
                  <StatusBadge status={r.status} />
                </div>
              </td>
              <td className="max-w-0 px-4 py-2 align-middle">
                <span className="block truncate text-body-sm text-text-secondary">{r.title}</span>
              </td>
              <td className="px-3 py-2 text-center align-middle"><IconCell kind="sp" value={r.sp} spIcon={spIcon} withBg={tinted} /></td>
              <td className="px-3 py-2 text-center align-middle"><IconCell kind="bv" value={r.bv} spIcon={spIcon} withBg={tinted} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SpBvStylesDevPage() {
  const pageTitle = usePageTitle("Dev · SP / BV Styles");
  const [spIconName, setSpIconName] = useState(SP_ICON_CANDIDATES[0].name);
  const [tinted, setTinted] = useState(false);

  const spIcon = (SP_ICON_CANDIDATES.find((c) => c.name === spIconName) ?? SP_ICON_CANDIDATES[0]).Icon;

  return (
    <>
      {pageTitle}
      <ViewHeader icon={<Sparkles size={16} strokeWidth={1.5} />}>
        <ViewHeaderTitle>Dev · SP / BV Styles</ViewHeaderTitle>
      </ViewHeader>

      <div className="mx-auto max-w-5xl px-8 py-8">
        <p className="mb-10 max-w-2xl text-body-sm text-text-tertiary leading-relaxed">
          <strong className="text-text-secondary">BRDG-240</strong> — chosen direction: <strong className="text-text-secondary">B (icon + color)</strong>.
          BV uses the <span className="inline-flex items-center gap-1 text-text-secondary"><Target size={12} strokeWidth={2} /> target</span> icon.
          The SP icon (effort / complexity) is still open — pick a candidate below to preview it live on the real BT: 138 backlog.
          The number stays color-coded by value; a tinted background is available for spots that should stand out.
        </p>

        {/* SP icon picker ------------------------------------------------- */}
        <Section
          title="Pick the SP icon (effort / complexity)"
          description="Click a candidate to apply it to the table below. Each is shown across the SP scale (1, 2, 3, 5, 8) so you can judge legibility at small values."
        >
          <div className="flex flex-col gap-2">
            {SP_ICON_CANDIDATES.map(({ name, Icon, note }) => {
              const selected = name === spIconName;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSpIconName(name)}
                  className="group flex items-center gap-4 rounded-lg border bg-[var(--color-surface-elevated)] px-4 py-3 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.99]"
                  style={{
                    borderColor: selected ? "var(--color-brand-400)" : "var(--color-border-default)",
                    boxShadow: selected ? "0 0 0 1px var(--color-brand-400)" : undefined,
                    transition: "border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease",
                  }}
                >
                  <span className="flex w-32 items-center gap-2 shrink-0">
                    <Icon size={15} strokeWidth={2} className={selected ? "text-[var(--color-brand-300)]" : "text-text-secondary"} />
                    <span className={`text-body-sm font-medium ${selected ? "text-text-primary" : "text-text-secondary"}`}>{name}</span>
                  </span>
                  <span className="w-40 shrink-0 text-body-sm text-text-muted">{note}</span>
                  <span className="flex items-center gap-3">
                    {SP_PRESETS.map((v) => (
                      <IconCell key={v} kind="sp" value={v} spIcon={Icon} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        {/* In context ----------------------------------------------------- */}
        <Section
          title="In context — sprint BT: 138"
          description="The real BT: 138 backlog (stories and bugs, current SP / BV, 0 shown as the N/A dash) with the selected SP icon and the target BV icon. Toggle the tinted treatment used for emphasis."
        >
          <div className="mb-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTinted((t) => !t)}
              className="inline-flex items-center gap-2 rounded-lg border border-border-default bg-[var(--color-surface-elevated)] px-3 py-1.5 text-body-sm font-medium text-text-secondary cursor-pointer hover:bg-[var(--color-surface-elevated-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98]"
              style={{ transition: "background-color 0.15s ease, transform 0.1s ease" }}
            >
              <span
                className="inline-block h-3.5 w-6 rounded-full p-0.5"
                style={{ backgroundColor: tinted ? "var(--color-brand-500)" : "var(--color-overlay-strong)", transition: "background-color 0.15s ease" }}
              >
                <span
                  className="block h-2.5 w-2.5 rounded-full bg-white"
                  style={{ transform: tinted ? "translateX(10px)" : "translateX(0)", transition: "transform 0.15s ease" }}
                />
              </span>
              Tinted background {tinted ? "on" : "off"}
            </button>
            <span className="text-body-sm text-text-muted">SP icon: <span className="text-text-secondary">{spIconName}</span></span>
          </div>
          <BoardTable spIcon={spIcon} tinted={tinted} />
        </Section>

        {/* BV icon -------------------------------------------------------- */}
        <Section title="BV icon — target (decided)" description="Business Value across its full scale with the target icon.">
          <Specimen label="BV values (target)">
            {BV_PRESETS.map((v) => (
              <IconCell key={v} kind="bv" value={v} spIcon={Gauge} />
            ))}
          </Specimen>
        </Section>

        {/* Baseline ------------------------------------------------------- */}
        <Section
          title="Today (baseline, for reference)"
          description="The current table cells: bare colored numbers via the real StoryPointPicker / BusinessValuePicker in subtle mode. Color varies by value, but nothing says which column is SP and which is BV."
        >
          <div className="overflow-hidden rounded-xl border border-border-default bg-[var(--color-surface-elevated)]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-default text-left">
                  <th className="px-4 py-2.5 text-label font-medium uppercase tracking-wide text-text-muted">Key</th>
                  <th className="px-4 py-2.5 text-label font-medium uppercase tracking-wide text-text-muted">Summary</th>
                  <th className="px-4 py-2.5 text-center text-label font-medium uppercase tracking-wide text-text-muted">SP</th>
                  <th className="px-4 py-2.5 text-center text-label font-medium uppercase tracking-wide text-text-muted">BV</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.key} className="border-b border-border-subtle last:border-0 hover:bg-[var(--color-surface-elevated-hover)]">
                    <td className="px-4 py-2.5 align-middle font-mono text-body-sm text-text-tertiary whitespace-nowrap">{r.key}</td>
                    <td className="px-4 py-2.5 align-middle text-body-sm text-text-secondary">{r.title}</td>
                    <td className="px-4 py-2.5 text-center align-middle"><StoryPointPicker value={r.sp} onChange={() => {}} subtle /></td>
                    <td className="px-4 py-2.5 text-center align-middle"><BusinessValuePicker value={r.bv} onChange={() => {}} subtle /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </>
  );
}
