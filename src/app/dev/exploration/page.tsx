"use client";

/**
 * Hub for throwaway design-exploration pages. Each entry below is a self-contained
 * prototype reachable at /dev/exploration/<slug>; none are linked from the app nav.
 * Add a new exploration by dropping a page under /dev/exploration/<slug> and
 * registering it in EXPLORATIONS so it shows up here.
 */

import Link from "next/link";
import { ArrowUpRight, LayoutGrid, Rows3, FlaskConical, Shapes, MousePointerClick, Type, PanelTop, PanelTopDashed, AppWindow, ListChecks, Gem, Gauge, Hash, SendHorizontal, BarChart3, History as HistoryIcon, Sparkles, RefreshCw, Target, PanelsTopLeft, SlidersHorizontal } from "lucide-react";

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
    slug: "board-chrome",
    title: "Header, sprint & filter bars",
    blurb:
      "Treats the three stacked board bars (header, views/sprint, filter) as one console instead of three separate flat strips, each mock sitting over a real slice of the board (group header + ticket rows) for context. Header is hamburger-less - the bridge_ wordmark is the sole menu trigger. Five directions over a faithful 'today' mock: A unified slab (one surface, faded seams, ghost chips), B floating clusters (recessed base, floating cards, segmented sprint switcher), C editorial rail (brand rail, airy rows, small-caps tabs), D two-row console (views + filter merged into one toolbar, filters folded into a trigger), E brand spine (one teal spine runs from chrome into the board's group header). Chosen: D (two-row console), built out in the two-row-console exploration and spec'd as BRDG-344.",
    status: "Chosen",
    ticket: "BRDG-344",
    icon: <PanelsTopLeft className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "two-row-console",
    title: "Two-row console + filter dropdown",
    blurb:
      "Chosen board-chrome direction, built out: two rows, with search + sort + filter folded into one unified-controls cluster on the right (no separate filter bar). Filter opens a two-pane dropdown (category rail + options) that keeps today's per-category search and styled option badges; the display / field-visibility settings (row fields, not table columns) sit behind a 'Display' button in the dropdown header. Sort opens a real field + direction menu, search expands inline. All interactive. Spec'd as BRDG-344.",
    status: "Shipped",
    ticket: "BRDG-344",
    icon: <SlidersHorizontal className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "drop-zones",
    title: "Drop zones & bar alignment",
    blurb:
      "Brings the sprint board bar and the refinement session bar into one shared regular-state anatomy (floating h-7 pills, gap, brand-400 active underline), then layers a single drop-target treatment for drag-and-drop. Shows the divergent bars today vs. the unified proposal, with five drop treatments (soft tint, brand ring + lift, solid fill, underline cue, spotlight) selectable live and a 'Simulate drag' toggle to preview the drop-over state on the real bars.",
    status: "Exploration",
    icon: <Target className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "sprint-icon",
    title: "Sprint icon — one glyph for a sprint",
    blurb:
      "Picks a single icon to represent 'a sprint', reused on the sprint pills in the views bar and on the 'Sprint overview' item in the Backlogs dropdown footer. Candidates grouped by meaning — iteration/cycle, time-box, goal, energy, neutral marker — each clickable to preview live on the pills and in the dropdown.",
    status: "Exploration",
    icon: <RefreshCw className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "session-ending",
    title: "Refinement session — the happy ending",
    blurb:
      "Two layers of happy ending for a refinement session. Endings for the Complete press (A toast, B button check-pop, C in-modal 'Session complete' summary, D ticket cascade with count-up totals, E full takeover with particle burst and streak chip) plus ambient/festive treatments on the wrap-up page itself, around the untouched modal (F breathing halo, G + 'Queue cleared' headline, H aurora with drifting motes, I confetti rain, J corner cannons). Chosen: J — aurora, halo, headline and one-shot corner bursts; written up as BRDG-341. Every stage is live and replayable.",
    status: "Chosen",
    ticket: "BRDG-341",
    icon: <Sparkles className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "recently-viewed",
    title: "Recently viewed — pills kept, layout explored",
    blurb:
      "Polish pass on the BRDG-330 MRU list in the nav panel. Constraint: every row keeps the REAL ticket pill (it carries the copy-URL / share interaction for free), so the exploration is purely about row anatomy: A inline (shipped, title truncates), B title-first with the pill on a meta line, C pill-first with the title on its own line, D epic-table list row. Toggles for group-by-day, panel width (360/420/480) and list state. Shipped: 480px flip + D list rows (loose pill segments via TicketStatusPill variant=list, so the key keeps its copy dropdown), day groups, relative age, current-ticket pulse, Clear footer.",
    status: "Shipped",
    ticket: "BRDG-330",
    icon: <HistoryIcon className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "epic-progress",
    title: "Epic progress summary",
    blurb:
      "Reworks the epic roll-up that floated as a detached card above Child Issues. Two shifts reframe it: the most-used list is grouped by sprint (the roll-up must sit above those GroupStatBar cards), and child issues now have their own tab so the separate 'Child Issues 22 of 26' header is a redundant repeat. Four directions, each a full tab over a real grouped-sprint mock, folding the header's count + actions into the roll-up: A consolidated tab header (sentence-labelled bar), B slim one-line toolbar, C quiet strip, D re-earned header. Show/hide via the menu; groups keep their own collapse.",
    status: "Exploration",
    icon: <BarChart3 className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "story-writer-footer",
    title: "Story Writer footer — save / push / wrap up",
    blurb:
      "Rethinks the save / push / clear footer, which used one primary button that silently changed identity (Push & Close -> Push to Jira -> Close) and set Ready to refine in two inconsistent ways. Shipped: Option E — autosave (no Save button, quiet Saving/Saved indicator) plus a single Wrap up button that always pushes & closes the editor, with three choices: Ready to refine (session kept), Ready to refine + clear session (both open the Add-to-refinement dialog), or Close as-is. Plain push lives in the ... menu only and never touches readiness. Includes a cross-tab autosave safeguard (409 + Reload/Overwrite banner). Options A-D and the icon galleries kept for reference.",
    status: "Shipped",
    ticket: "BRDG-339",
    icon: <SendHorizontal className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "estimate-entry",
    title: "Setting SP & the guestimate",
    blurb:
      "Three flows for entering an estimate from a board row, each built to stop an unscored row from revealing two near-identical '#' badges on hover. A · One entry point; B · Pencil to ink (one chip that graduates from a dashed guess to a committed solid SP, with manual entry, a quiet commit and a revertible 'back to guesstimate'); C · Twin track. Shipped: flow B is live on the real board as the unified EstimatePicker (BRDG-323); the guess is now kept after commit so the revert works.",
    status: "Shipped",
    ticket: "BRDG-323",
    icon: <Hash className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "capacity-meter",
    title: "Sprint capacity meter",
    blurb:
      "Calmer treatment for the sprint capacity bar, which used to turn amber at a perfectly-full sprint. Shipped: a neutral pill (grey text, teal fill bar, no icon) where the ONLY over-capacity signal is the bar turning red - text and pill stay neutral. Page also compares the rejected louder over-capacity treatments and icon options.",
    status: "Shipped",
    icon: <Gauge className={ICON} strokeWidth={1.5} />,
  },
  {
    slug: "refinement-badge",
    title: "Row meta markers — Refinement, SP & BV",
    blurb:
      "The small right-edge row markers as a cohesive family. Shipped: Refinement = teal Boxes (no count), SP = slate Hash, BV = violet TrendingUp, penciled SP = dashed inset draft, all theme-aware. Also re-hues the status badges (TO DO zinc, IN PROGRESS sky, TEST amber, DONE emerald, DEPRECATED/DELETED muted + struck) to clear the teal/slate/violet collisions. Kept as reference.",
    status: "Shipped",
    ticket: "BRDG-321 · BRDG-322",
    icon: <Gem className={ICON} strokeWidth={1.5} />,
  },
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
      "Ten new beeldmerk directions for Bridge, each from a different angle (architecture, command deck, network, typography, data), some with paired wordmarks. Declined: Bridge stays wordmark-only — no beeldmerk.",
    status: "Declined",
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
            const badgeClass =
              ex.status === "Shipped"
                ? "bg-[var(--color-status-done-subtle)] text-[var(--color-status-done)]"
                : ex.status === "Declined"
                  ? "bg-[var(--color-status-error-subtle)] text-[var(--color-status-error)]"
                  : "bg-overlay-default text-text-tertiary";
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
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${badgeClass}`}
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
