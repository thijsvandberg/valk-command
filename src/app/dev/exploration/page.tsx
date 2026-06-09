"use client";

/**
 * Hub for throwaway design-exploration pages. Each entry below is a self-contained
 * prototype reachable at /dev/exploration/<slug>; none are linked from the app nav.
 * Add a new exploration by dropping a page under /dev/exploration/<slug> and
 * registering it in EXPLORATIONS so it shows up here.
 */

import Link from "next/link";
import { ArrowUpRight, LayoutGrid, Rows3, FlaskConical, Shapes, MousePointerClick, Type, PanelTop, PanelTopDashed, AppWindow, ListChecks } from "lucide-react";

type Exploration = {
  slug: string;
  title: string;
  blurb: string;
  status: string;
  ticket?: string;
  icon: React.ReactNode;
};

const ICON = "h-5 w-5";

const EXPLORATIONS: Exploration[] = [
  {
    slug: "child-issues-menu",
    title: "Child Issues controls menu",
    blurb:
      "Collapses the four loose header controls (view, planning, filter, columns, create) into one menu. Two rounds: layout (Tabs / Compact / Two-pane) then C's View pane (radio rows / trailing tick / cards). Shipped: two-pane with radio-row View pane and the shared subtle-tint checkbox/radio.",
    status: "Shipped",
    icon: <ListChecks className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "favicon",
    title: "Favicon directions",
    blurb:
      "Favicons built from the bridge_ wordmark instead of the rejected aperture mark. The b _ lockup shipped as env-aware dynamic icons: dark tile for prod (3101), light tile for dev (3100), both with the teal underscore.",
    status: "Shipped",
    icon: <AppWindow className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "header",
    title: "Top bar - wordmark & menu",
    blurb:
      "Six directions for the fixed top bar. No beeldmerk: the brand carries through the bridge_ wordmark (teal underscore promoted to a live caret) plus mono type. Each pulls the nav menu out of the floating launcher into the header. Variant F (Caret Command Bar) chosen and written up as BRDG-320; page kept for reference.",
    status: "Exploration",
    ticket: "BRDG-320",
    icon: <PanelTopDashed className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "board-tabs",
    title: "Sprint Board views bar",
    blurb:
      "Reworks the flat tabs strip (All / Backlog / BT: 139 / Overall refinement + tools) by separating scopes, sprints and saved-filter bookmarks. Hybrid (D) chosen and shipped: All pill + Backlogs dropdown + sprint pills + saved-filter and ⋯ menus.",
    status: "Shipped",
    ticket: "BRDG-319",
    icon: <PanelTop className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "wordmark",
    title: "Text-only logo",
    blurb:
      "Drops the icon entirely — Bridge as a wordmark in pronounced display fonts (editorial serif, condensed poster, console mono, geometric), shown in the real header lockup.",
    status: "Exploration",
    icon: <Type className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "logo",
    title: "Logomark explorations",
    blurb:
      "Ten new beeldmerk directions for Bridge, each from a different angle (architecture, command deck, network, typography, data), some with paired wordmarks.",
    status: "Exploration",
    icon: <Shapes className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "launcher",
    title: "Launcher button",
    blurb:
      "Eight restyle options for the collapsed launcher button (brand fill, tonal, circle, pill, ghost and more). Chosen and shipped: the brand-gradient fill, plus the launcher is now draggable corner-to-corner like the focus-exit button.",
    status: "Shipped",
    ticket: "BRDG-317",
    icon: <MousePointerClick className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "sidebar",
    title: "Sidebar concepts",
    blurb:
      "Five navigation concepts over a faux board. The Bento launcher (variant A4 · Editorial) was chosen and shipped as the real sidebar.",
    status: "Shipped",
    ticket: "BRDG-317",
    icon: <LayoutGrid className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "preview-board-transition",
    title: "Board header → table transition",
    blurb:
      "Compares ways to calm the seam between the sprint-board header and the ticket table (toolbar border, top gap, elevated surface).",
    status: "Exploration",
    ticket: "BRDG-239",
    icon: <Rows3 className={ICON} strokeWidth={1.5} />,
  },
];

export default function ExplorationHubPage() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-[920px]">
        <header className="mb-8">
          <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
            <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.75} />
            /dev/exploration
          </p>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
            Design explorations
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            Throwaway prototype pages used to judge a direction in context before building it for real.
            None are linked from the app navigation; reach each one from here.
          </p>
        </header>

        <ul className="grid gap-3 sm:grid-cols-2">
          {EXPLORATIONS.map((ex) => {
            const shipped = ex.status === "Shipped";
            return (
              <li key={ex.slug}>
                <Link
                  href={`/dev/exploration/${ex.slug}`}
                  className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl bg-[var(--color-surface-floating)] p-5 ring-1 ring-border-default transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6),0_0_0_1px_var(--color-border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] cursor-pointer"
                >
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  <div className="flex items-center justify-between">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-overlay-default text-[var(--color-brand-300)]">
                      {ex.icon}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                        shipped
                          ? "bg-[var(--color-status-done-subtle)] text-[var(--color-status-done)]"
                          : "bg-overlay-default text-text-tertiary"
                      }`}
                    >
                      {ex.status}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
                        {ex.title}
                      </h2>
                      <ArrowUpRight
                        className="h-4 w-4 text-text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-text-secondary"
                        strokeWidth={1.5}
                      />
                    </div>
                    <p className="mt-1.5 text-body-sm leading-[1.6] text-text-tertiary">{ex.blurb}</p>
                  </div>
                  {ex.ticket && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                      {ex.ticket}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
