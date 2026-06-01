"use client";

// Temporary dev showcase for BRDG-240: making Story Points (SP) and Business
// Value (BV) instantly recognizable in the sprint-board table. Renders every
// candidate treatment in isolation and inside a realistic table so the PO can
// compare them live and pick a direction. Not linked from navigation,
// excluded from routes.test.tsx, safe to delete once a direction is chosen.

import { usePageTitle } from "@/hooks/usePageTitle";
import { Gauge, Star, Layers, Zap, Sparkles, Target } from "lucide-react";
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

// Neutral treatment for the N/A value (0), matching the real pickers' grey.
const NEUTRAL = { text: "#7d828b", bg: "color-mix(in srgb, #7d828b 10%, transparent)" };

// Distinct fixed color families for the "color identity" direction: SP stays a
// green family, BV becomes a unified amber/gold family across its whole range
// (today BV's low values are blue-grey, which is what makes the two columns
// look alike). Defined here only for the mockup.
function spIdentityColor(v: number): { text: string; bg: string } {
  if (v <= 0) return NEUTRAL;
  const text = v <= 1 ? "#6fa384" : v <= 2 ? "#5d9871" : v <= 3 ? "#4d8d5d" : v <= 5 ? "#3d8050" : "#2e7444";
  return { text, bg: `color-mix(in srgb, ${text} 12%, transparent)` };
}
function bvIdentityColor(v: number): { text: string; bg: string } {
  if (v <= 0) return NEUTRAL;
  const map: Record<number, string> = {
    1: "#c2a878", 2: "#c8a55f", 3: "#cea043", 4: "#d59a2f", 5: "#de9420", 6: "#e79015", 7: "#eab308",
  };
  const text = map[v] ?? "#d59a2f";
  return { text, bg: `color-mix(in srgb, ${text} 12%, transparent)` };
}

// ---------------------------------------------------------------------------
// Candidate cell renderers (kind tells SP vs BV)
// ---------------------------------------------------------------------------

type Kind = "sp" | "bv";
const colorFor = (kind: Kind, v: number) => (kind === "sp" ? getSpColor(v) : getBvColor(v));

// The unset (null) placeholder used by the real subtle pickers.
function EmptyDot() {
  return <span className="inline-block h-1.5 w-1.5 rounded-full bg-overlay-strong align-middle" />;
}

// A — Label-prefix pill: explicit "SP"/"BV" text + colored number.
function LabelPillCell({ kind, value }: { kind: Kind; value: number }) {
  const c = colorFor(kind, value);
  return (
    <span
      className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-body-sm font-medium tabular-nums"
      style={{ color: c.text, backgroundColor: c.bg }}
    >
      <span className="text-[9px] font-semibold uppercase tracking-wider opacity-55">{kind}</span>
      {value}
    </span>
  );
}

// B — Icon + color: a small leading icon identifies the metric.
function IconCell({
  kind,
  value,
  spIcon: SpIcon = Gauge,
  bvIcon: BvIcon = Star,
  withBg = false,
}: {
  kind: Kind;
  value: number | null;
  spIcon?: typeof Gauge;
  bvIcon?: typeof Gauge;
  withBg?: boolean;
}) {
  if (value === null) return <EmptyDot />;
  const c = colorFor(kind, value);
  const Icon = kind === "sp" ? SpIcon : BvIcon;
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

// C — Combined badge: SP and BV in one container; order + color carries meaning.
function CombinedCell({ sp, bv, withMicroLabels = false }: { sp: number; bv: number; withMicroLabels?: boolean }) {
  const spC = getSpColor(sp);
  const bvC = getBvColor(bv);
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-border-default bg-[var(--color-surface-elevated)] px-2 text-body-sm font-medium tabular-nums">
      <span className="inline-flex items-center gap-0.5" style={{ color: spC.text }}>
        {withMicroLabels && <span className="text-[9px] font-semibold uppercase opacity-55">S</span>}
        {sp}
      </span>
      <span className="text-text-muted">·</span>
      <span className="inline-flex items-center gap-0.5" style={{ color: bvC.text }}>
        {withMicroLabels && <span className="text-[9px] font-semibold uppercase opacity-55">B</span>}
        {bv}
      </span>
    </span>
  );
}

// D — Color identity only: distinct fixed color families, no label or icon.
function ColorIdentityCell({ kind, value }: { kind: Kind; value: number | null }) {
  if (value === null) return <EmptyDot />;
  const c = kind === "sp" ? spIdentityColor(value) : bvIdentityColor(value);
  return (
    <span
      className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-md px-1 text-body-sm font-medium tabular-nums"
      style={{ color: c.text, backgroundColor: c.bg }}
    >
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

// A compact, sprint-board-style table on synthetic rows. The SP and BV cells
// are rendered by the supplied functions; pass a single `combined` renderer to
// merge them into one column (direction C).
function DemoTable({
  spbvHeader = ["SP", "BV"],
  renderSp,
  renderBv,
  renderCombined,
}: {
  spbvHeader?: [string, string] | [string];
  renderSp?: (v: number) => React.ReactNode;
  renderBv?: (v: number) => React.ReactNode;
  renderCombined?: (sp: number, bv: number) => React.ReactNode;
}) {
  const combined = !!renderCombined;
  return (
    <div className="overflow-hidden rounded-xl border border-border-default bg-[var(--color-surface-elevated)]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border-default text-left">
            <th className="px-4 py-2.5 text-label font-medium uppercase tracking-wide text-text-muted">Key</th>
            <th className="px-4 py-2.5 text-label font-medium uppercase tracking-wide text-text-muted">Summary</th>
            {combined ? (
              <th className="px-4 py-2.5 text-center text-label font-medium uppercase tracking-wide text-text-muted">{spbvHeader[0]}</th>
            ) : (
              <>
                <th className="px-4 py-2.5 text-center text-label font-medium uppercase tracking-wide text-text-muted">{spbvHeader[0]}</th>
                <th className="px-4 py-2.5 text-center text-label font-medium uppercase tracking-wide text-text-muted">{spbvHeader[1]}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.key} className="border-b border-border-subtle last:border-0 hover:bg-[var(--color-surface-elevated-hover)]">
              <td className="px-4 py-2.5 align-middle font-mono text-body-sm text-text-tertiary whitespace-nowrap">{r.key}</td>
              <td className="px-4 py-2.5 align-middle text-body-sm text-text-secondary">{r.title}</td>
              {combined ? (
                <td className="px-4 py-2.5 text-center align-middle">{renderCombined!(r.sp, r.bv)}</td>
              ) : (
                <>
                  <td className="px-4 py-2.5 text-center align-middle">{renderSp!(r.sp)}</td>
                  <td className="px-4 py-2.5 text-center align-middle">{renderBv!(r.bv)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// A faithful sprint-board-style table on the real BT: 138 rows: type icon, key,
// status, title, then SP / BV rendered by the supplied functions.
function BoardTable({ renderSp, renderBv }: { renderSp: (v: number | null) => React.ReactNode; renderBv: (v: number | null) => React.ReactNode }) {
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
              <td className="px-3 py-2 text-center align-middle">{renderSp(r.sp)}</td>
              <td className="px-3 py-2 text-center align-middle">{renderBv(r.bv)}</td>
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

  return (
    <>
      {pageTitle}
      <ViewHeader icon={<Sparkles size={16} strokeWidth={1.5} />}>
        <ViewHeaderTitle>Dev · SP / BV Styles</ViewHeaderTitle>
      </ViewHeader>

      <div className="mx-auto max-w-5xl px-8 py-8">
        <p className="mb-10 max-w-2xl text-body-sm text-text-tertiary leading-relaxed">
          Candidate treatments for <strong className="text-text-secondary">BRDG-240</strong> — making Story Points
          (SP) and Business Value (BV) instantly recognizable in the sprint-board table, so you can tell which metric a
          number is without reading the column header. Each direction is shown as a value strip and inside a realistic
          table. Nothing here is wired into the real board yet; pick a direction and I&apos;ll productionize it.
        </p>

        {/* Real data: B vs D --------------------------------------------- */}
        <Section
          title="B vs D — real data (sprint BT: 138)"
          description="The two front-runners side by side on the actual BT: 138 backlog (stories and bugs, current SP / BV values, 0 shown as the N/A dash). Same rows, same order as the real board, so you can judge recognizability in context."
        >
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-2 text-body-sm font-medium text-text-secondary">
                <Gauge size={14} strokeWidth={2} /> B — Icon + color
              </div>
              <BoardTable
                renderSp={(v) => <IconCell kind="sp" value={v} />}
                renderBv={(v) => <IconCell kind="bv" value={v} />}
              />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 text-body-sm font-medium text-text-secondary">
                <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full" style={{ backgroundColor: spIdentityColor(3).text }} />
                D — Color identity
              </div>
              <BoardTable
                renderSp={(v) => <ColorIdentityCell kind="sp" value={v} />}
                renderBv={(v) => <ColorIdentityCell kind="bv" value={v} />}
              />
            </div>
          </div>
        </Section>

        {/* Baseline ------------------------------------------------------- */}
        <Section
          title="Today (baseline)"
          description="The current table cells: bare colored numbers via the real StoryPointPicker / BusinessValuePicker in subtle mode. Color varies by value, but nothing says which column is SP and which is BV."
        >
          <DemoTable
            renderSp={(v) => <StoryPointPicker value={v} onChange={() => {}} subtle />}
            renderBv={(v) => <BusinessValuePicker value={v} onChange={() => {}} subtle />}
          />
        </Section>

        {/* A — Label pill ------------------------------------------------- */}
        <Section
          title="A — Label-prefix pill"
          description="Each cell is a compact pill with an SP / BV text label plus the number, keeping the per-value color. Most explicit, reuses the existing lg-picker pattern. Slightly wider cells."
        >
          <Specimen label="SP values">
            {SP_PRESETS.map((v) => (
              <LabelPillCell key={v} kind="sp" value={v} />
            ))}
          </Specimen>
          <div className="mt-3">
            <Specimen label="BV values">
              {BV_PRESETS.map((v) => (
                <LabelPillCell key={v} kind="bv" value={v} />
              ))}
            </Specimen>
          </div>
          <div className="mt-4">
            <DemoTable
              renderSp={(v) => <LabelPillCell kind="sp" value={v} />}
              renderBv={(v) => <LabelPillCell kind="bv" value={v} />}
            />
          </div>
        </Section>

        {/* B — Icon + color ----------------------------------------------- */}
        <Section
          title="B — Icon + color"
          description="A small leading icon identifies the metric (here: gauge = SP effort, star = BV value), plus the existing color. Compact and low-noise; the icon meaning has to be learned. Alternative icon pairs shown below."
        >
          <Specimen label="SP values (gauge)">
            {SP_PRESETS.map((v) => (
              <IconCell key={v} kind="sp" value={v} />
            ))}
          </Specimen>
          <div className="mt-3">
            <Specimen label="BV values (star)">
              {BV_PRESETS.map((v) => (
                <IconCell key={v} kind="bv" value={v} />
              ))}
            </Specimen>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Specimen label="alt: layers / target">
              <IconCell kind="sp" value={5} spIcon={Layers} />
              <IconCell kind="bv" value={5} bvIcon={Target} />
            </Specimen>
            <Specimen label="alt: zap / sparkles">
              <IconCell kind="sp" value={5} spIcon={Zap} />
              <IconCell kind="bv" value={5} bvIcon={Sparkles} />
            </Specimen>
            <Specimen label="with tinted background">
              <IconCell kind="sp" value={5} withBg />
              <IconCell kind="bv" value={5} withBg />
            </Specimen>
          </div>
          <div className="mt-4">
            <DemoTable
              renderSp={(v) => <IconCell kind="sp" value={v} />}
              renderBv={(v) => <IconCell kind="bv" value={v} />}
            />
          </div>
        </Section>

        {/* C — Combined badge --------------------------------------------- */}
        <Section
          title="C — Combined badge (one column)"
          description="SP and BV merged into a single badge: SP left (green), BV right (gold/amber). Order plus color carries the meaning. Saves a column, but is the least explicit. Shown with and without micro letters."
        >
          <Specimen label="combined (color + order)">
            {ROWS.map((r) => (
              <CombinedCell key={r.key} sp={r.sp} bv={r.bv} />
            ))}
          </Specimen>
          <div className="mt-3">
            <Specimen label="combined with S / B micro-labels">
              {ROWS.map((r) => (
                <CombinedCell key={r.key} sp={r.sp} bv={r.bv} withMicroLabels />
              ))}
            </Specimen>
          </div>
          <div className="mt-4">
            <DemoTable spbvHeader={["SP · BV"]} renderCombined={(sp, bv) => <CombinedCell sp={sp} bv={bv} />} />
          </div>
        </Section>

        {/* D — Color identity --------------------------------------------- */}
        <Section
          title="D — Color identity only"
          description="No label or icon: two clearly distinct fixed color families — SP a green family, BV a unified amber/gold family across its whole range (today BV's low values are blue-grey, which is what makes the columns look alike). Smallest change, leans entirely on color."
        >
          <Specimen label="SP family (green)">
            {SP_PRESETS.map((v) => (
              <ColorIdentityCell key={v} kind="sp" value={v} />
            ))}
          </Specimen>
          <div className="mt-3">
            <Specimen label="BV family (amber/gold)">
              {BV_PRESETS.map((v) => (
                <ColorIdentityCell key={v} kind="bv" value={v} />
              ))}
            </Specimen>
          </div>
          <div className="mt-4">
            <DemoTable
              renderSp={(v) => <ColorIdentityCell kind="sp" value={v} />}
              renderBv={(v) => <ColorIdentityCell kind="bv" value={v} />}
            />
          </div>
        </Section>
      </div>
    </>
  );
}
