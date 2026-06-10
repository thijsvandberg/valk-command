"use client";

/**
 * Throwaway prototype: rethinking the Story Writer footer (save / push / clear).
 * Compares three button layouts against a shared, walkable editor state so the
 * PO can feel each flow before we build it. Not linked from app nav.
 *
 * Decided up front (see chat): "Ready to refine" is set ONLY on Finish, never
 * on a plain push. Push = publish-and-keep-working; Finish = the terminal move.
 */

import { useState } from "react";
import {
  Save,
  CloudUpload,
  SendHorizontal,
  Check,
  MoreHorizontal,
  Trash2,
  Scissors,
  ChevronDown,
  FlaskConical,
  CheckCircle2,
  CloudDownload,
  ArrowUpRight,
  RotateCcw,
  Pencil,
  Loader2,
  Flag,
  FlagTriangleRight,
  Goal,
  Milestone,
  Signpost,
  CheckCheck,
  BadgeCheck,
  SquareCheckBig,
  ClipboardCheck,
  Stamp,
  Forward,
  ArrowRightCircle,
  ChevronsRight,
  PackageCheck,
  Archive,
  Rocket,
  Trophy,
  PartyPopper,
  Lock,
  Sparkles,
  Eraser,
  Wind,
  type LucideIcon,
} from "lucide-react";

/**
 * The editor's lifecycle, reduced to the three things that actually drive the
 * footer. `finished` is the terminal state reached via Finish.
 */
type Scenario = "dirty" | "savedClean" | "pushedClean" | "finished";

const SCENARIO_LABEL: Record<Scenario, string> = {
  dirty: "Unsaved edits",
  savedClean: "Saved · not pushed",
  pushedClean: "Pushed · no new edits",
  finished: "Session finished",
};

const SCENARIO_BLURB: Record<Scenario, string> = {
  dirty: "You have local changes that are neither saved nor in Jira.",
  savedClean: "Draft is saved locally. Jira does not have these changes yet.",
  pushedClean: "Jira is up to date. Nothing new to push. Session is still open.",
  finished: "Draft pushed, session cleared, ticket marked Ready to refine.",
};

export default function StoryWriterFooterPage() {
  // One shared state drives all three layouts so they stay comparable.
  const [scenario, setScenario] = useState<Scenario>("dirty");

  // Option D: which icon represents "finish" on the toggle.
  const [finishIconKey, setFinishIconKey] = useState("archive");
  const FinishIcon = (ALL_FINISH_ICONS.find((i) => i.key === finishIconKey) ?? ALL_FINISH_ICONS[0]).Icon;

  // Option D: how the toggle reads when OFF ("won't archive right now").
  const [offTreatment, setOffTreatment] = useState<OffTreatment>("dashed");

  const isDirty = scenario === "dirty";
  const hasUnpushed = scenario === "dirty" || scenario === "savedClean";

  // Flow transitions, shared across the option cards.
  const doEdit = () => setScenario("dirty");
  const doSave = () => setScenario("savedClean");
  const doPush = () => setScenario("pushedClean"); // implies save if dirty
  const doFinish = () => setScenario("finished");
  const reset = () => setScenario("dirty");

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-[1040px]">
        <header className="mb-8">
          <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
            <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.75} />
            /dev/exploration/story-writer-footer
          </p>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
            Story Writer footer — save / push / finish
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            Three primitives, no hidden coupling: <strong className="text-text-primary">Save</strong> keeps your
            work local, <strong className="text-text-primary">Push</strong> publishes to Jira and stays open, and{" "}
            <strong className="text-text-primary">Finish</strong> is the terminal move — it pushes any pending
            changes, clears the session and marks the ticket{" "}
            <em className="text-[var(--color-brand-300)] not-italic">Ready to refine</em>. Walk a scenario below;
            all three layouts react to the same state.
          </p>
        </header>

        {/* State simulator */}
        <section className="mb-8 rounded-2xl bg-[var(--color-surface-floating)] p-5 ring-1 ring-border-default">
          <div className="mb-3 flex items-center justify-between gap-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">Editor state</p>
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-overlay-subtle px-2.5 py-1 text-label font-medium text-text-tertiary cursor-pointer transition-colors duration-150 hover:bg-hover-interactive hover:text-text-secondary"
            >
              <RotateCcw size={12} strokeWidth={1.5} />
              Reset
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SCENARIO_LABEL) as Scenario[]).map((s) => {
              const active = scenario === s;
              return (
                <button
                  key={s}
                  onClick={() => setScenario(s)}
                  className={`rounded-lg border px-3 py-1.5 text-body-sm font-medium cursor-pointer transition-colors duration-150 ${
                    active
                      ? "border-[var(--color-brand-500)]/40 bg-[var(--color-brand-500)]/15 text-[var(--color-brand-300)]"
                      : "border-border-default bg-overlay-subtle text-text-tertiary hover:bg-hover-interactive hover:text-text-secondary"
                  }`}
                >
                  {SCENARIO_LABEL[s]}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-body-sm leading-[1.6] text-text-tertiary">{SCENARIO_BLURB[scenario]}</p>
          <div className="mt-3 flex items-center gap-2 border-t border-border-subtle pt-3">
            <span className="text-label text-text-muted">Simulate:</span>
            <button
              onClick={doEdit}
              className="inline-flex items-center gap-1.5 rounded-md border border-border-default bg-overlay-subtle px-2.5 py-1 text-label font-medium text-text-tertiary cursor-pointer transition-colors duration-150 hover:bg-hover-interactive hover:text-text-secondary"
            >
              <Pencil size={12} strokeWidth={1.5} />
              Make an edit
            </button>
          </div>
        </section>

        <div className="grid gap-5">
          <OptionCard
            tag="Option A"
            title="Three-tier emphasis"
            blurb="Every action gets its own button with a fixed meaning. Emphasis maps to frequency: Finish is the loud green terminal action, Push is a quieter publish, Save is a ghost that only shows when there is something to save."
            recommended
          >
            <FooterBar finished={scenario === "finished"}>
              {isDirty && <SaveButton onClick={doSave} />}
              <PushButton onClick={doPush} disabled={!hasUnpushed} subtle />
              <FinishButton onClick={doFinish} />
              <OverflowButton scenario={scenario} layout="A" />
            </FooterBar>
          </OptionCard>

          <OptionCard
            tag="Option B"
            title="Split button"
            blurb="Compact: Save plus one split control. The main click publishes and keeps the session open; the caret reveals Push & finish for the one-shot path. Fewer buttons, but Finish is one click hidden behind the caret."
          >
            <FooterBar finished={scenario === "finished"}>
              {isDirty && <SaveButton onClick={doSave} />}
              <SplitPushButton onPush={doPush} onFinish={doFinish} disabled={!hasUnpushed} />
              <OverflowButton scenario={scenario} layout="B" />
            </FooterBar>
          </OptionCard>

          <OptionCard
            tag="Option C"
            title="Two buttons"
            blurb="Simplest bar: Save plus Finish. Push-without-finishing is treated as the edge case and lives in the ... menu. Best if you almost always finish in one go and rarely publish mid-flight."
          >
            <FooterBar finished={scenario === "finished"}>
              {isDirty && <SaveButton onClick={doSave} />}
              <FinishButton onClick={doFinish} />
              <OverflowButton scenario={scenario} layout="C" onPush={doPush} pushDisabled={!hasUnpushed} />
            </FooterBar>
          </OptionCard>
        </div>

        {/* ---- Minimal directions: autosave removes the Save button entirely ---- */}
        <div className="mt-12 mb-5">
          <h2 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-text-primary">
            Fewer buttons — autosave + a subtle finish
          </h2>
          <p className="mt-1.5 max-w-2xl text-body-sm leading-[1.6] text-text-tertiary">
            The biggest win is dropping <strong className="text-text-secondary">Save draft</strong> altogether: the
            draft autosaves as you type, shown by a quiet text indicator instead of a button. That leaves only the
            publish/finish decision in the bar. Here &quot;finishing the session&quot; is expressed as a subtle
            checkmark rather than a loud button.
          </p>
        </div>

        <div className="grid gap-5">
          <OptionCard
            tag="Option D"
            title="One button + a finish toggle"
            blurb="Autosave (no Save button). A single Push to Jira button with a small toggle on its left. Off = push and keep working. Toggle on = the same click also clears the session and marks Ready to refine. One visible action; the toggle is the quiet 'close session' control. Pick the icon that reads best below — it swaps live on the button."
            recommended
          >
            <FinishIconPicker value={finishIconKey} onChange={setFinishIconKey} />
            <OffTreatmentGallery value={offTreatment} onChange={setOffTreatment} Icon={FinishIcon} />
            <FooterBar finished={scenario === "finished"}>
              <AutosaveIndicator dirty={isDirty} />
              <PushFinishToggle
                onPush={doPush}
                onFinish={doFinish}
                disabled={!hasUnpushed}
                FinishIcon={FinishIcon}
                offTreatment={offTreatment}
              />
              <OverflowButton scenario={scenario} layout="C" onPush={doPush} pushDisabled={!hasUnpushed} />
            </FooterBar>
          </OptionCard>

          <OptionCard
            tag="Option E"
            title="Autosave + split button"
            blurb="Autosave plus a single split control. Main click = Push to Jira (stay open); caret = Push & finish. No Save button, no separate Finish button — just one control and the overflow."
          >
            <FooterBar finished={scenario === "finished"}>
              <AutosaveIndicator dirty={isDirty} />
              <SplitPushButton onPush={doPush} onFinish={doFinish} disabled={!hasUnpushed} />
              <OverflowButton scenario={scenario} layout="B" />
            </FooterBar>
          </OptionCard>

          <OptionCard
            tag="Option F"
            title="Single finish checkmark"
            blurb="The most minimal: autosave plus one subtle icon-only checkmark that finishes the session (push + clear + Ready to refine). Plain push-without-finishing is demoted to the ... menu. Almost no chrome — but the terminal action is also the quietest, so it leans on the tooltip and overflow for discoverability."
          >
            <FooterBar finished={scenario === "finished"}>
              <AutosaveIndicator dirty={isDirty} />
              <FinishCheck onClick={doFinish} />
              <OverflowButton scenario={scenario} layout="C" onPush={doPush} pushDisabled={!hasUnpushed} />
            </FooterBar>
          </OptionCard>
        </div>

        <p className="mt-8 text-body-sm leading-[1.6] text-text-tertiary">
          Note: in all options, <strong className="text-text-secondary">Push</strong> saves first if there are
          unsaved edits (push can&apos;t happen without a local save), and{" "}
          <strong className="text-text-secondary">Finish</strong> pushes any pending changes before clearing — so
          Jira always matches what you leave behind.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Layout scaffolding                                                  */
/* ------------------------------------------------------------------ */

function OptionCard({
  tag,
  title,
  blurb,
  recommended,
  children,
}: {
  tag: string;
  title: string;
  blurb: string;
  recommended?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-[var(--color-surface-floating)] ring-1 ring-border-default">
      <div className="border-b border-border-subtle px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">{tag}</span>
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">{title}</h2>
          {recommended && (
            <span className="rounded-full bg-[var(--color-status-done-subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-status-done)]">
              Recommended
            </span>
          )}
        </div>
        <p className="mt-1.5 max-w-3xl text-body-sm leading-[1.6] text-text-tertiary">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

/** Mimics the real ViewHeader action area: faux ticket title left, actions right. */
function FooterBar({ children, finished }: { children: React.ReactNode; finished?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-b-2xl bg-[var(--color-surface-base)] px-5 py-4">
      <div className="min-w-0">
        <p className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">BRDG-000</p>
        <p className="truncate text-body-sm font-medium text-text-secondary">Refine the booking confirmation flow</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{finished ? <FinishedBanner /> : children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

function SaveButton({ onClick }: { onClick: () => void }) {
  const [saved, setSaved] = useState(false);
  return (
    <button
      onClick={() => {
        setSaved(true);
        setTimeout(() => {
          setSaved(false);
          onClick();
        }, 700);
      }}
      disabled={saved}
      className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-body-sm font-medium cursor-pointer transition-colors duration-150 disabled:cursor-default ${
        saved
          ? "border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)]"
          : "border-border-default bg-overlay-subtle text-text-secondary hover:bg-hover-interactive"
      }`}
    >
      {saved ? <Check size={13} strokeWidth={2} /> : <Save size={13} strokeWidth={1.5} />}
      {saved ? "Saved" : "Save draft"}
    </button>
  );
}

function PushButton({ onClick, disabled, subtle }: { onClick: () => void; disabled?: boolean; subtle?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Nothing new to push" : undefined}
      className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-body-sm font-medium cursor-pointer transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
        subtle
          ? "border-[var(--color-brand-500)]/25 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] hover:bg-[var(--color-brand-500)]/20"
          : "border-border-default bg-overlay-subtle text-text-secondary hover:bg-hover-interactive"
      }`}
    >
      <CloudUpload size={14} strokeWidth={2.5} />
      Push to Jira
    </button>
  );
}

/** Text-only autosave status — replaces the Save button in the minimal options. */
function AutosaveIndicator({ dirty }: { dirty: boolean }) {
  return (
    <span className="flex items-center gap-1.5 pr-1 text-label font-medium text-text-muted">
      {dirty ? (
        <>
          <Loader2 size={12} strokeWidth={1.75} className="animate-spin text-text-muted" />
          Saving…
        </>
      ) : (
        <>
          <Check size={12} strokeWidth={2} className="text-[var(--color-brand-400)]" />
          Saved
        </>
      )}
    </span>
  );
}

/** Icon candidates for the Option D finish-toggle, grouped along the three angles. */
type FinishIconDef = { key: string; label: string; Icon: LucideIcon };

const FINISH_ICON_GROUPS: { theme: string; hint: string; icons: FinishIconDef[] }[] = [
  {
    theme: "Finish line",
    hint: "reach the end",
    icons: [
      { key: "flag", label: "Flag", Icon: Flag },
      { key: "flagTri", label: "Pennant", Icon: FlagTriangleRight },
      { key: "goal", label: "Goal", Icon: Goal },
      { key: "milestone", label: "Milestone", Icon: Milestone },
      { key: "signpost", label: "Signpost", Icon: Signpost },
    ],
  },
  {
    theme: "Done / approve",
    hint: "mark it complete",
    icons: [
      { key: "checkCheck", label: "Double check", Icon: CheckCheck },
      { key: "badgeCheck", label: "Badge", Icon: BadgeCheck },
      { key: "squareCheck", label: "Checkbox", Icon: SquareCheckBig },
      { key: "clipboardCheck", label: "Clipboard", Icon: ClipboardCheck },
      { key: "stamp", label: "Stamp", Icon: Stamp },
    ],
  },
  {
    theme: "Hand off / next",
    hint: "send it onward",
    icons: [
      { key: "send", label: "Send", Icon: SendHorizontal },
      { key: "forward", label: "Forward", Icon: Forward },
      { key: "arrowCircle", label: "Arrow", Icon: ArrowRightCircle },
      { key: "chevrons", label: "Advance", Icon: ChevronsRight },
      { key: "package", label: "Package", Icon: PackageCheck },
      { key: "archive", label: "Archive", Icon: Archive },
    ],
  },
  {
    theme: "Wrap up",
    hint: "ship / seal it",
    icons: [
      { key: "rocket", label: "Ship", Icon: Rocket },
      { key: "trophy", label: "Trophy", Icon: Trophy },
      { key: "party", label: "Celebrate", Icon: PartyPopper },
      { key: "lock", label: "Seal", Icon: Lock },
    ],
  },
  {
    theme: "Clean up",
    hint: "tidy the session away",
    icons: [
      { key: "sparkles", label: "Sparkles", Icon: Sparkles },
      { key: "eraser", label: "Eraser", Icon: Eraser },
      { key: "wind", label: "Sweep", Icon: Wind },
    ],
  },
];

const ALL_FINISH_ICONS: FinishIconDef[] = FINISH_ICON_GROUPS.flatMap((g) => g.icons);

function FinishIconPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border-subtle px-5 py-4">
      {FINISH_ICON_GROUPS.map((group) => (
        <div key={group.theme} className="flex items-center gap-2">
          <div className="mr-1 flex flex-col">
            <span className="text-label font-semibold text-text-secondary">{group.theme}</span>
            <span className="text-[10px] text-text-muted">{group.hint}</span>
          </div>
          {group.icons.map(({ key, label, Icon }) => {
            const active = value === key;
            return (
              <button
                key={key}
                onClick={() => onChange(key)}
                title={label}
                aria-pressed={active}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border cursor-pointer transition-colors duration-150 ${
                  active
                    ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/15 text-[var(--color-brand-300)]"
                    : "border-border-default bg-overlay-subtle text-text-tertiary hover:bg-hover-interactive hover:text-text-secondary"
                }`}
              >
                <Icon size={16} strokeWidth={1.75} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** How the toggle communicates "off / won't archive right now". */
type OffTreatment = "dashed" | "slash" | "outline";

const OFF_TREATMENTS: { key: OffTreatment; label: string; blurb: string }[] = [
  {
    key: "dashed",
    label: "Dashed",
    blurb: "A dashed, hollow segment — borrows the app's 'provisional / not committed' dashed-draft language. Solid fill once on.",
  },
  {
    key: "slash",
    label: "Slashed",
    blurb: "A diagonal slash through the icon — the universal 'off' cue (like mic-off). Unmistakable that nothing gets archived.",
  },
  {
    key: "outline",
    label: "Outline → fill",
    blurb: "Off sits flush and quiet as part of the button; on lifts into a bright filled chip. Calmest, leans on the '& archive' label to carry meaning.",
  },
];

/** The leading toggle segment, rendered for a given on/off state + off treatment. */
function ArchiveToggleSegment({
  on,
  treatment,
  Icon,
}: {
  on: boolean;
  treatment: OffTreatment;
  Icon: LucideIcon;
}) {
  if (on) {
    return (
      <span className="flex h-8 w-9 items-center justify-center border-r border-white/20 bg-[var(--color-brand-500)] text-white">
        <Icon size={15} strokeWidth={2.25} />
      </span>
    );
  }
  if (treatment === "dashed") {
    return (
      <span className="flex h-8 w-9 items-center justify-center border-r border-dashed border-white/40 bg-[var(--color-brand-700)] text-white/45">
        <Icon size={15} strokeWidth={1.75} />
      </span>
    );
  }
  if (treatment === "slash") {
    return (
      <span className="relative flex h-8 w-9 items-center justify-center border-r border-white/20 bg-[var(--color-brand-700)] text-white/40">
        <Icon size={15} strokeWidth={1.75} />
        <span className="pointer-events-none absolute h-[1.5px] w-[22px] rotate-45 rounded-full bg-white/60 shadow-[0_0_0_1px_var(--color-brand-700)]" />
      </span>
    );
  }
  // outline: flush, low-contrast, part of the button surface
  return (
    <span className="flex h-8 w-9 items-center justify-center border-r border-white/15 bg-[var(--color-brand-600)] text-white/35">
      <Icon size={15} strokeWidth={1.5} />
    </span>
  );
}

/** Non-interactive mini split-button for the off-state comparison gallery. */
function MiniToggle({ on, treatment, Icon }: { on: boolean; treatment: OffTreatment; Icon: LucideIcon }) {
  return (
    <div className="flex overflow-hidden rounded-lg shadow-[0_2px_8px_color-mix(in_srgb,var(--color-brand-500)_30%,transparent)]">
      <ArchiveToggleSegment on={on} treatment={treatment} Icon={Icon} />
      <span className="flex h-8 items-center gap-1.5 bg-[var(--color-brand-600)] px-3 text-body-sm font-semibold text-white">
        <CloudUpload size={14} strokeWidth={2.5} />
        Push to Jira
        {on && <span className="font-normal text-white/80">&amp; archive</span>}
      </span>
    </div>
  );
}

/** The off-state gallery doubles as the treatment selector for the live D button. */
function OffTreatmentGallery({
  value,
  onChange,
  Icon,
}: {
  value: OffTreatment;
  onChange: (t: OffTreatment) => void;
  Icon: LucideIcon;
}) {
  return (
    <div className="grid gap-3 border-b border-border-subtle px-5 py-4 sm:grid-cols-3">
      {OFF_TREATMENTS.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            aria-pressed={active}
            className={`flex flex-col gap-3 rounded-xl border p-3 text-left cursor-pointer transition-colors duration-150 ${
              active
                ? "border-[var(--color-brand-500)]/50 bg-[var(--color-brand-500)]/[0.08]"
                : "border-border-default bg-overlay-subtle hover:bg-hover-interactive"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-label font-semibold text-text-secondary">{t.label}</span>
              {active && <Check size={13} strokeWidth={2.5} className="text-[var(--color-brand-400)]" />}
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-[10px] uppercase tracking-wider text-text-muted">Off</span>
                <MiniToggle on={false} treatment={t.key} Icon={Icon} />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-[10px] uppercase tracking-wider text-text-muted">On</span>
                <MiniToggle on treatment={t.key} Icon={Icon} />
              </div>
            </div>
            <p className="text-[11px] leading-[1.5] text-text-tertiary">{t.blurb}</p>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Option D: one primary Push button with a leading finish toggle. When the
 * toggle is on, clicking the button also finishes the session (clear + ready).
 * Icon and off-state treatment are configurable so we can audition them live.
 */
function PushFinishToggle({
  onPush,
  onFinish,
  disabled,
  FinishIcon,
  offTreatment,
}: {
  onPush: () => void;
  onFinish: () => void;
  disabled?: boolean;
  FinishIcon: LucideIcon;
  offTreatment: OffTreatment;
}) {
  const [finishOn, setFinishOn] = useState(false);
  return (
    <div className="flex overflow-hidden rounded-lg shadow-[0_2px_8px_color-mix(in_srgb,var(--color-brand-500)_30%,transparent)]">
      <button
        onClick={() => setFinishOn((v) => !v)}
        aria-pressed={finishOn}
        title={finishOn ? "On: also clear session & archive (mark Ready to refine)" : "Off: just publish, keep working"}
        className="cursor-pointer transition-colors duration-150"
      >
        <ArchiveToggleSegment on={finishOn} treatment={offTreatment} Icon={FinishIcon} />
      </button>
      <button
        onClick={() => (finishOn ? onFinish() : onPush())}
        disabled={disabled}
        className="flex h-8 items-center gap-1.5 bg-[var(--color-brand-600)] px-3.5 text-body-sm font-semibold text-white cursor-pointer transition-colors duration-150 hover:bg-[var(--color-brand-500)] active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <CloudUpload size={14} strokeWidth={2.5} />
        Push to Jira
        {finishOn && <span className="font-normal text-white/80">&amp; archive</span>}
      </button>
    </div>
  );
}

/** Option F: a single, quiet icon-only checkmark that finishes the session. */
function FinishCheck({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Finish: push, clear session & mark Ready to refine"
      aria-label="Finish: push, clear session and mark Ready to refine"
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-brand-500)]/30 bg-[var(--color-brand-500)]/10 text-[var(--color-brand-400)] cursor-pointer transition-colors duration-150 hover:bg-[var(--color-brand-500)]/20 active:scale-[0.97]"
    >
      <Check size={15} strokeWidth={2.25} />
    </button>
  );
}

function FinishButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-brand-600)] px-3.5 text-body-sm font-semibold text-white cursor-pointer transition-colors duration-150 hover:bg-[var(--color-brand-500)] shadow-[0_2px_8px_color-mix(in_srgb,var(--color-brand-500)_30%,transparent)] active:scale-[0.97]"
    >
      <SendHorizontal size={13} strokeWidth={1.5} />
      Finish
    </button>
  );
}

function SplitPushButton({
  onPush,
  onFinish,
  disabled,
}: {
  onPush: () => void;
  onFinish: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex">
      <button
        onClick={onPush}
        disabled={disabled}
        className="flex h-8 items-center gap-1.5 rounded-l-lg bg-[var(--color-brand-600)] px-3.5 text-body-sm font-semibold text-white cursor-pointer transition-colors duration-150 hover:bg-[var(--color-brand-500)] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <CloudUpload size={14} strokeWidth={2.5} />
        Push to Jira
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center rounded-r-lg border-l border-white/20 bg-[var(--color-brand-600)] px-1.5 text-white cursor-pointer transition-colors duration-150 hover:bg-[var(--color-brand-500)]"
      >
        <ChevronDown size={14} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-52 rounded-xl border border-border-strong bg-[var(--color-surface-floating)] py-1.5 shadow-[var(--shadow-lg)]">
          <button
            onClick={() => {
              setOpen(false);
              onFinish();
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-body-sm text-text-secondary cursor-pointer hover:bg-hover-interactive hover:text-text-primary transition-colors duration-150"
          >
            <SendHorizontal size={13} strokeWidth={1.5} className="shrink-0" />
            <span>Push &amp; finish</span>
          </button>
        </div>
      )}
    </div>
  );
}

function OverflowButton({
  scenario,
  layout,
  onPush,
  pushDisabled,
}: {
  scenario: Scenario;
  layout: "A" | "B" | "C";
  onPush?: () => void;
  pushDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isDirty = scenario === "dirty";
  const hasLocal = scenario === "dirty" || scenario === "savedClean";
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border cursor-pointer transition-colors duration-150 ${
          open
            ? "border-border-strong bg-overlay-strong text-text-secondary"
            : "border-border-default bg-overlay-subtle text-text-secondary hover:bg-hover-interactive"
        }`}
      >
        <MoreHorizontal size={14} strokeWidth={1.5} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-56 rounded-xl border border-border-strong bg-[var(--color-surface-floating)] py-1.5 shadow-[var(--shadow-lg)]">
          <MenuItem icon={<Scissors size={13} strokeWidth={1.5} />} label="Split story" />
          {layout === "C" && (
            <>
              <MenuDivider />
              <MenuItem
                icon={<CloudUpload size={14} strokeWidth={2.5} />}
                label="Push to Jira (stay open)"
                disabled={pushDisabled}
                onClick={() => {
                  setOpen(false);
                  onPush?.();
                }}
              />
            </>
          )}
          <MenuItem icon={<CloudDownload size={13} strokeWidth={1.5} />} label="Pull from Jira" />
          <MenuItem icon={<ArrowUpRight size={13} strokeWidth={1.5} />} label="Open in Jira" />
          <MenuDivider />
          <MenuItem
            icon={<Trash2 size={13} strokeWidth={1.5} />}
            label={isDirty || (hasLocal && scenario === "savedClean") ? "Discard draft" : "Delete session"}
            danger
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  danger,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-body-sm cursor-pointer transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${
        danger
          ? "text-text-tertiary hover:bg-red-500/[0.06] hover:text-red-400/80"
          : "text-text-secondary hover:bg-hover-interactive hover:text-text-primary"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function MenuDivider() {
  return <div className="mx-2 my-1 h-px bg-overlay-default" />;
}

/* Render a tiny finished banner so the terminal state is visible inline. */
function FinishedBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--color-status-done-subtle)] bg-[var(--color-status-done-subtle)] px-3 py-1.5 text-body-sm font-medium text-[var(--color-status-done)]">
      <CheckCircle2 size={14} strokeWidth={1.75} />
      Pushed · session cleared · Ready to refine
    </div>
  );
}
