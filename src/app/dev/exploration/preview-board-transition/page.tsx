import { Bookmark, Gauge, Goal, ListFilter, Columns3, ArrowDownUp, RefreshCw } from "lucide-react";

// TEMPORARY preview page (BRDG-239 design exploration).
// Compares ways to calm the header -> table transition on the sprint board.
// Delete this route once a direction is chosen.

type Row = { key: string; status: string; statusTone: string; title: string; epic: string | null; epicTone: string; sp: number; bv: number; av: string; avTone: string };

const ROWS: Row[] = [
  { key: "VPL-44816", status: "TODO", statusTone: "#9aa0a6", title: "Create reproducable benchmark data set and tests for common scenarios", epic: "ARIE", epicTone: "#3f9b54", sp: 5, bv: 2, av: "DK", avTone: "#b23b54" },
  { key: "VPL-45730", status: "PROG", statusTone: "#5b8def", title: 'Display "Group Code" card with group details below search widget', epic: "Group Reservations", epicTone: "#a64ca6", sp: 2, bv: 3, av: "VV", avTone: "#4733c4" },
  { key: "VPL-45731", status: "PROG", statusTone: "#5b8def", title: "Scope room availability and pricing to group block in /rooms call", epic: "Group Reservations", epicTone: "#a64ca6", sp: 2, bv: 3, av: "RB", avTone: "#9a8420" },
  { key: "VPL-42510", status: "TODO", statusTone: "#9aa0a6", title: "[Initial-sync] Implement initial restrictions sync", epic: "ARIE", epicTone: "#3f9b54", sp: 5, bv: 3, av: "DK", avTone: "#b23b54" },
  { key: "VPL-42505", status: "TODO", statusTone: "#9aa0a6", title: "[incremental-sync] Handle RestrictionsChangedInProperty notifications", epic: "ARIE", epicTone: "#3f9b54", sp: 2, bv: 2, av: null as unknown as string, avTone: "" },
  { key: "VPL-42511", status: "TODO", statusTone: "#9aa0a6", title: "[Query] Create an ari-query microservice", epic: "ARIE", epicTone: "#3f9b54", sp: 1, bv: 1, av: null as unknown as string, avTone: "" },
];

type Variant = {
  id: string;
  title: string;
  desc: string;
  // seam treatment
  toolbarBorder: boolean;
  topGap: string; // tailwind padding-top on the list area
  panel: boolean; // wrap list in an elevated surface
  rowPy: string;
  divider: string; // per-row divider classes ("" = none)
};

const VARIANTS: Variant[] = [
  {
    id: "current", title: "Huidig (baseline)",
    desc: "Tab-balk met harde onderrand, direct gevolgd door rij 1. Geen gap, lijnen stapelen.",
    toolbarBorder: true, topGap: "pt-0", panel: false, rowPy: "py-2", divider: "border-b border-[var(--color-border-subtle)]",
  },
  {
    id: "A", title: "A — Lucht + naad verzachten",
    desc: "Gap van 12px tussen toolbar en rij 1; toolbar-onderrand weg zodat er niet twee lijnen stapelen.",
    toolbarBorder: false, topGap: "pt-3", panel: false, rowPy: "py-2", divider: "border-b border-[var(--color-border-subtle)]",
  },
  {
    id: "B", title: "B — Lijst op verhoogd vlak",
    desc: "Lijst in een eigen panel: bovenmarge, ronde bovenhoeken, subtiele rand + schaduw, lichtere tint dan de toolbar. Chrome vs. content.",
    toolbarBorder: false, topGap: "pt-0", panel: true, rowPy: "py-2", divider: "border-b border-[var(--color-border-subtle)]",
  },
  {
    id: "C", title: "C — Rustigere rijen",
    desc: "Ruimere rijhoogte en lichtere scheidingslijnen (leunt op witruimte i.p.v. lijntjes).",
    toolbarBorder: false, topGap: "pt-3", panel: false, rowPy: "py-3", divider: "",
  },
  {
    id: "BC", title: "B + C — Verhoogd vlak + rustige rijen",
    desc: "Panel-aanpak gecombineerd met ruimere, lijnloze rijen. Meest complete restyling.",
    toolbarBorder: false, topGap: "pt-0", panel: true, rowPy: "py-3", divider: "",
  },
];

function MetricInline({ icon, value, tone }: { icon: React.ReactNode; value: number; tone: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 tabular-nums" style={{ color: tone }}>
      {icon}
      {value}
    </span>
  );
}

function MockRow({ row, v, last }: { row: Row; v: Variant; last: boolean }) {
  return (
    <div className={`group flex items-center gap-2 pl-4 pr-[23px] ${v.rowPy} ${last ? "" : v.divider} border-l-[3px] border-l-transparent transition-colors duration-100 hover:bg-[var(--color-overlay-subtle)]`}>
      {/* pill: issue icon + key + status */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="flex items-center justify-center rounded p-1 text-[var(--color-icon-task)]">
          <Bookmark size={14} strokeWidth={1.75} />
        </span>
        <span className="font-mono text-body-sm font-medium text-text-secondary">{row.key}</span>
        <span
          className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide"
          style={{ backgroundColor: `color-mix(in srgb, ${row.statusTone} 16%, transparent)`, color: row.statusTone }}
        >
          <span className="h-1.5 w-1.5 rounded-full opacity-70" style={{ backgroundColor: row.statusTone }} />
          {row.status}
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-overlay-strong)]" />
      </div>
      {/* title */}
      <div className="min-w-0 flex-1 truncate text-body-lg text-text-primary">{row.title}</div>
      {/* epic */}
      {row.epic && (
        <span
          className="inline-flex min-w-0 shrink items-center truncate rounded-[3px] border-l-2 py-0.5 pl-1.5 pr-2 text-[10.5px] font-medium tracking-wide"
          style={{ backgroundColor: `color-mix(in srgb, ${row.epicTone} 14%, transparent)`, color: row.epicTone, borderLeftColor: row.epicTone }}
        >
          {row.epic}
        </span>
      )}
      {/* SP / BV */}
      <div className="flex shrink-0 items-center gap-2">
        <MetricInline icon={<Gauge size={13} strokeWidth={1.75} />} value={row.sp} tone="var(--color-text-tertiary)" />
        <MetricInline icon={<Goal size={13} strokeWidth={1.75} />} value={row.bv} tone="#b8860b" />
      </div>
      {/* assignee */}
      <div className="shrink-0">
        {row.av ? (
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-semibold text-white" style={{ backgroundColor: row.avTone }}>
            {row.av}
          </span>
        ) : (
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full border border-[var(--color-border-strong)] text-text-muted" />
        )}
      </div>
    </div>
  );
}

function MockToolbar({ v }: { v: Variant }) {
  const tabs = ["All", "To refine", "Backlog", "BT: 137", "BT: 138", "BT: 139", "BT: Backlog", "BT: TODO"];
  return (
    <div
      className={`flex h-[44px] shrink-0 items-center gap-2 px-4 ${v.toolbarBorder ? "border-b border-[var(--color-border-default)]" : ""}`}
      style={{ backgroundColor: "var(--color-surface-toolbar)" }}
    >
      {tabs.map((t, i) => (
        <span
          key={t}
          className={`flex h-7 items-center rounded-md px-2.5 text-body-sm font-medium ${i === 4 ? "text-[var(--color-brand-300)]" : "text-text-tertiary"}`}
        >
          {t}
        </span>
      ))}
      <div className="ml-auto flex items-center gap-1 text-text-tertiary">
        <Columns3 size={15} strokeWidth={1.5} />
        <ArrowDownUp size={15} strokeWidth={1.5} />
        <RefreshCw size={15} strokeWidth={1.5} />
        <ListFilter size={15} strokeWidth={1.5} />
      </div>
    </div>
  );
}

function VariantBlock({ v }: { v: Variant }) {
  const list = (
    <div className={`${v.topGap}`}>
      {ROWS.map((row, i) => (
        <MockRow key={row.key} row={row} v={v} last={i === ROWS.length - 1} />
      ))}
    </div>
  );

  return (
    <section className="mb-12">
      <div className="mb-3">
        <h2 className="text-body-lg font-semibold text-text-primary">{v.title}</h2>
        <p className="mt-0.5 max-w-3xl text-body-sm text-text-tertiary">{v.desc}</p>
      </div>
      {/* The frame mimics the app content column on the page background. */}
      <div className="overflow-hidden rounded-lg border border-[var(--color-border-default)]" style={{ backgroundColor: "var(--color-surface-base)" }}>
        <MockToolbar v={v} />
        {v.panel ? (
          <div className="px-3 pb-3">
            <div
              className="mt-3 overflow-hidden rounded-t-xl border border-b-0 border-[var(--color-border-subtle)]"
              style={{ backgroundColor: "var(--color-surface-elevated)", boxShadow: "0 -1px 0 rgba(0,0,0,0.02), 0 6px 18px -12px rgba(0,0,0,0.35)" }}
            >
              {list}
            </div>
          </div>
        ) : (
          list
        )}
      </div>
    </section>
  );
}

export default function BoardTransitionPreview() {
  return (
    <div className="min-h-screen px-8 py-10" style={{ backgroundColor: "var(--color-surface-app, var(--color-surface-base))" }}>
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-label font-medium uppercase tracking-wide text-text-muted">BRDG-239 · tijdelijke preview</p>
          <h1 className="mt-1 text-heading-lg font-semibold text-text-primary">Overgang header → tabel</h1>
          <p className="mt-2 max-w-3xl text-body text-text-secondary">
            Vergelijking van manieren om de overgang van de toolbar naar de ticketlijst rustiger te maken.
            Let op de naad tussen de tab-balk en de eerste rij, en de algehele dichtheid van de lijst.
            Deze pagina is tijdelijk en wordt verwijderd zodra we een richting kiezen.
          </p>
        </header>
        {VARIANTS.map((v) => (
          <VariantBlock key={v.id} v={v} />
        ))}
      </div>
    </div>
  );
}
