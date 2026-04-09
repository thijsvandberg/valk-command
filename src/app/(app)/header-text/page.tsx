"use client";

/* ------------------------------------------------------------------ */
/*  TEMPORARY PAGE: Typography Header Audit                            */
/*  Created 2026-04-09 to map all heading levels and propose a        */
/*  unified 4-tier system. Safe to delete after the refactor.         */
/* ------------------------------------------------------------------ */

type RowProps = {
  location: string;
  file: string;
  element: string;
  issue?: string;
  current: React.ReactNode;
  proposed: React.ReactNode;
};

const Row = ({ location, file, element, issue, current, proposed }: RowProps) => (
  <div className="grid grid-cols-[1fr_1fr] gap-px rounded-xl overflow-hidden border border-white/[0.07] mb-3">
    <div className="bg-white/[0.02] px-5 py-4 flex flex-col justify-between gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-white/50 mb-0.5">{location}</p>
          <p className="font-mono text-[10px] text-white/25 leading-relaxed">{file}</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] text-white/40">
            {element}
          </span>
          {issue && (
            <span className="rounded bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-400/70">
              {issue}
            </span>
          )}
        </div>
      </div>
      {current}
    </div>
    <div className="bg-white/[0.015] px-5 py-4 flex flex-col gap-3">
      <p className="text-xs font-medium text-white/50 mb-0.5">Proposed</p>
      {proposed}
    </div>
  </div>
);

const TierCard = ({
  tier,
  label,
  usage,
  classes,
  children,
}: {
  tier: string;
  label: string;
  usage: string;
  classes: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
    <div className="flex items-center gap-3 mb-4">
      <span className="rounded-full border border-white/[0.1] px-3 py-0.5 font-mono text-[10px] text-white/50">
        {tier}
      </span>
      <span className="text-xs font-semibold text-white/70">{label}</span>
      <span className="text-xs text-white/35">{usage}</span>
    </div>
    <div className="mb-4">{children}</div>
    <code className="block font-mono text-[10px] text-white/30 bg-white/[0.04] rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap">
      {classes}
    </code>
  </div>
);

export default function HeaderTextPage() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-8 py-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-[-0.03em] text-white mb-1">
          Typography Header Audit
        </h1>
        <p className="text-sm text-white/40 mb-10">
          All heading usages in the app, current vs proposed 4-tier system.
        </p>

        {/* Proposed system */}
        <section className="mb-14">
          <h2 className="font-[var(--font-display)] text-lg font-semibold tracking-[-0.02em] text-white/90 border-b border-white/[0.06] pb-3 mb-6">
            Proposed 4-Tier System
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <TierCard
              tier="T1"
              label="Page title"
              usage="Main h1 per view"
              classes={`font-[var(--font-display)]\ntext-3xl font-bold\ntracking-[-0.03em] text-white`}
            >
              <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-[-0.03em] text-white">
                Dashboard
              </h1>
            </TierCard>

            <TierCard
              tier="T2"
              label="Section heading"
              usage="Major sections within a page"
              classes={`font-[var(--font-display)]\ntext-lg font-semibold\ntracking-[-0.02em] text-white/90`}
            >
              <h2 className="font-[var(--font-display)] text-lg font-semibold tracking-[-0.02em] text-white/90">
                Active Sprint
              </h2>
            </TierCard>

            <TierCard
              tier="T3"
              label="Panel heading"
              usage="Card, panel, side panel headers"
              classes={`font-[var(--font-display)]\ntext-sm font-semibold\ntext-white/80`}
            >
              <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">
                New scheduled job
              </h3>
            </TierCard>

            <TierCard
              tier="T4"
              label="Label"
              usage="Uppercase category labels"
              classes={`text-xs font-medium\nuppercase tracking-[0.06em]\ntext-white/50`}
            >
              <h4 className="text-xs font-medium uppercase tracking-[0.06em] text-white/50">
                Story Writer Quick Prompts
              </h4>
            </TierCard>
          </div>
        </section>

        {/* Current state audit */}
        <section>
          <h2 className="font-[var(--font-display)] text-lg font-semibold tracking-[-0.02em] text-white/90 border-b border-white/[0.06] pb-3 mb-6">
            Current State vs Proposed
          </h2>

          <h4 className="text-xs font-medium uppercase tracking-[0.06em] text-white/40 mb-3">
            T1 - Page titles
          </h4>

          <Row
            location="Dashboard / Jobs / Refinement / Test Center / Stakeholder"
            file="src/app/(app)/page.tsx  +4 others"
            element="h1"
            current={
              <>
                <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-[-0.03em] text-white">
                  Dashboard
                </h1>
                <code className="font-mono text-[10px] text-white/30">
                  text-3xl font-bold tracking-[-0.03em] text-white
                </code>
              </>
            }
            proposed={
              <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-[-0.03em] text-white">
                Dashboard
              </h1>
            }
          />

          <Row
            location="Activity Log"
            file="src/app/(app)/activity-log/page.tsx"
            element="h1"
            issue="text-2xl, semibold not bold"
            current={
              <>
                <h1 className="font-[var(--font-display)] text-2xl font-semibold tracking-[-0.03em] text-white">
                  Activity Log
                </h1>
                <code className="font-mono text-[10px] text-white/30">
                  text-2xl font-semibold tracking-[-0.03em] text-white
                </code>
              </>
            }
            proposed={
              <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-[-0.03em] text-white">
                Activity Log
              </h1>
            }
          />

          <Row
            location="Diff Preview"
            file="src/app/(app)/sprint-board/diff-preview/page.tsx"
            element="h1"
            issue="text-base, no tracking"
            current={
              <>
                <h1 className="font-[var(--font-display)] text-base font-semibold text-white">
                  Diff Preview
                </h1>
                <code className="font-mono text-[10px] text-white/30">
                  text-base font-semibold text-white
                </code>
              </>
            }
            proposed={
              <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-[-0.03em] text-white">
                Diff Preview
              </h1>
            }
          />

          <Row
            location="Ticket title (editable)"
            file="src/components/ticket-detail/TicketContent.tsx"
            element="h1"
            issue="text-2xl, inline letterSpacing mixed with class"
            current={
              <>
                <h1
                  className="cursor-pointer text-2xl font-bold leading-tight text-white hover:text-white/90"
                  style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.04em" }}
                >
                  PROJ-123 Implement feature X
                </h1>
                <code className="font-mono text-[10px] text-white/30">
                  text-2xl font-bold leading-tight + inline letterSpacing: -0.04em
                </code>
              </>
            }
            proposed={
              <h1 className="font-[var(--font-display)] cursor-pointer text-3xl font-bold tracking-[-0.03em] text-white hover:text-white/90">
                PROJ-123 Implement feature X
              </h1>
            }
          />

          <Row
            location="Error pages"
            file="src/app/global-error.tsx  src/app/(app)/error.tsx"
            element="h2"
            issue="missing display font, no color, no tracking"
            current={
              <>
                <h2 className="text-lg font-semibold">Something went wrong</h2>
                <code className="font-mono text-[10px] text-white/30">
                  text-lg font-semibold (no display font, no color)
                </code>
              </>
            }
            proposed={
              <h2 className="font-[var(--font-display)] text-lg font-semibold tracking-[-0.02em] text-white/90">
                Something went wrong
              </h2>
            }
          />

          <h4 className="text-xs font-medium uppercase tracking-[0.06em] text-white/40 mb-3 mt-8">
            T3 - Panel headings
          </h4>

          <Row
            location="Section headers (Attachments, Subtasks etc.)"
            file="src/components/ticket-detail/SectionHeader.tsx"
            element="h3"
            current={
              <>
                <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">
                  Attachments
                </h3>
                <code className="font-mono text-[10px] text-white/30">
                  text-sm font-semibold text-white/80
                </code>
              </>
            }
            proposed={
              <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">
                Attachments
              </h3>
            }
          />

          <Row
            location="Jobs panel form header"
            file="src/components/jobs/JobsPanel.tsx"
            element="h3"
            issue="text-white instead of text-white/80"
            current={
              <>
                <h3 className="font-[var(--font-display)] text-sm font-semibold text-white">
                  New scheduled job
                </h3>
                <code className="font-mono text-[10px] text-white/30">
                  text-sm font-semibold text-white (missing /80)
                </code>
              </>
            }
            proposed={
              <h3 className="font-[var(--font-display)] text-sm font-semibold text-white/80">
                New scheduled job
              </h3>
            }
          />

          <Row
            location="ViewHeader title"
            file="src/components/shared/ViewHeader.tsx"
            element="span"
            current={
              <>
                <span className="font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-white/90">
                  Sprint Board
                </span>
                <code className="font-mono text-[10px] text-white/30">
                  text-[15px] font-semibold tracking-tight text-white/90
                </code>
              </>
            }
            proposed={
              <span className="font-[var(--font-display)] text-[15px] font-semibold tracking-tight text-white/90">
                Sprint Board
              </span>
            }
          />

          <h4 className="text-xs font-medium uppercase tracking-[0.06em] text-white/40 mb-3 mt-8">
            T4 - Label headings
          </h4>

          <Row
            location="Settings section labels"
            file="src/app/(app)/settings/prompts/page.tsx  scheduler/page.tsx"
            element="h2"
            current={
              <>
                <h2 className="text-sm font-medium text-white/50 uppercase tracking-[0.06em]">
                  Story Writer Quick Prompts
                </h2>
                <code className="font-mono text-[10px] text-white/30">
                  text-sm font-medium uppercase tracking-[0.06em] text-white/50
                </code>
              </>
            }
            proposed={
              <h2 className="text-xs font-medium uppercase tracking-[0.06em] text-white/50">
                Story Writer Quick Prompts
              </h2>
            }
          />

          <Row
            location="SidePanel description label"
            file="src/components/sprint-board/SidePanel.tsx"
            element="h3"
            issue="text-white/30 instead of /50, tracking-wider not fixed value"
            current={
              <>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/30">
                  Description
                </h3>
                <code className="font-mono text-[10px] text-white/30">
                  text-xs uppercase tracking-wider text-white/30
                </code>
              </>
            }
            proposed={
              <h3 className="text-xs font-medium uppercase tracking-[0.06em] text-white/50">
                Description
              </h3>
            }
          />
        </section>

        {/* Changes summary */}
        <section className="mt-14">
          <h2 className="font-[var(--font-display)] text-lg font-semibold tracking-[-0.02em] text-white/90 border-b border-white/[0.06] pb-3 mb-6">
            Changes Needed
          </h2>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05]">
            {[
              {
                file: "activity-log/page.tsx",
                fix: "h1: text-2xl font-semibold -> text-3xl font-bold",
              },
              {
                file: "sprint-board/diff-preview/page.tsx",
                fix: "h1: text-base -> text-3xl font-bold tracking-[-0.03em]",
              },
              {
                file: "ticket-detail/TicketContent.tsx",
                fix: "h1: move inline letterSpacing to class, text-2xl -> text-3xl",
              },
              {
                file: "global-error.tsx + error.tsx",
                fix: "Add font-[var(--font-display)] tracking-[-0.02em] text-white/90",
              },
              {
                file: "jobs/JobsPanel.tsx",
                fix: "h3: text-white -> text-white/80",
              },
              {
                file: "settings/prompts + scheduler",
                fix: "h2: text-sm -> text-xs (align to T4)",
              },
              {
                file: "sprint-board/SidePanel.tsx",
                fix: "Description label: tracking-wider -> tracking-[0.06em], text-white/30 -> text-white/50",
              },
            ].map(({ file, fix }) => (
              <div key={file} className="grid grid-cols-[280px_1fr] gap-4 px-5 py-3.5">
                <code className="font-mono text-[11px] text-white/50">{file}</code>
                <p className="text-xs text-white/60">{fix}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
