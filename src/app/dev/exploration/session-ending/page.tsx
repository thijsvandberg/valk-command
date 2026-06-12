"use client";

/**
 * Throwaway exploration: the "happy ending" of a refinement session. Today
 * pressing Complete in the wrap-up modal silently redirects to /refinement —
 * no confirmation, no moment of closure. Five endings, subtle -> loud:
 *
 *   A · Toast            - modal closes, a quiet toast confirms on landing.
 *   B · Button morph     - the Complete button itself pops into a check,
 *                          glows once, then the modal fades out.
 *   C · Summary state    - the modal swaps to a "Session complete" summary
 *                          (tickets / points / duration) with a Done button.
 *   D · Ticket cascade   - summary where the refined tickets stagger in one
 *                          by one and the totals count up from zero.
 *   E · Full celebration - the stage takes over: teal gradient field, grain,
 *                          a particle burst, display-type headline, streak.
 *
 * Every demo is a self-contained replayable stage: press Complete, watch the
 * ending, reset with the corner button. Reachable at
 * /dev/exploration/session-ending. Not linked from app nav.
 */

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/Button";
import {
  ArrowLeft,
  Sun,
  Moon,
  CheckCircle2,
  Check,
  X,
  RotateCcw,
  Save,
  Sparkles,
  Flame,
  NotebookPen,
  Clock3,
  Hash,
  Layers,
} from "lucide-react";

/* ================================================================== *
 * Demo data — one pretend session, reused by every variant.
 * ================================================================== */

const SESSION_TICKETS = [
  { key: "VPL-4821", title: "Guest checkout — address validation", points: 3 },
  { key: "VPL-4830", title: "Rate plan caching layer", points: 5 },
  { key: "VPL-4836", title: "Cancellation policy engine", points: 8 },
  { key: "VPL-4840", title: "Search ranking experiment", points: 2 },
] as const;

const TOTAL_POINTS = SESSION_TICKETS.reduce((s, t) => s + t.points, 0);
const DURATION_MIN = 23;

/* ================================================================== *
 * Page-scoped keyframes. Prefixed `se` so they can't collide with the
 * app-level keyframes in globals.css.
 * ================================================================== */

const KEYFRAMES = `
@keyframes seModalOut {
  from { opacity: 1; transform: translateY(0) scale(1); }
  to   { opacity: 0; transform: translateY(10px) scale(0.97); }
}
@keyframes seFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes seFadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes seToastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(12px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
@keyframes seCheckPop {
  0%   { opacity: 0; transform: scale(0.3); }
  60%  { opacity: 1; transform: scale(1.18); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes seGlowPulse {
  0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-brand-400) 55%, transparent); }
  100% { box-shadow: 0 0 0 18px transparent; }
}
@keyframes seRowIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes seBurst {
  0%   { opacity: 1; transform: translate(-50%, -50%) translate(0, 0) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) translate(var(--dx), var(--dy)) scale(0.3); }
}
@keyframes seRingExpand {
  from { opacity: 0.65; transform: translate(-50%, -50%) scale(0.35); }
  to   { opacity: 0;    transform: translate(-50%, -50%) scale(2.8); }
}
@keyframes seBreath {
  0%, 100% { opacity: 0.65; transform: translate(-50%, -50%) scale(1); }
  50%      { opacity: 1;    transform: translate(-50%, -50%) scale(1.08); }
}
@keyframes seDrift {
  0%   { transform: translateY(0); opacity: 0; }
  12%  { opacity: var(--op, 0.5); }
  80%  { opacity: var(--op, 0.5); }
  100% { transform: translateY(-470px); opacity: 0; }
}
@keyframes seConfettiFall {
  0%   { transform: translate3d(0, 0, 0) rotateZ(0deg) rotateX(0deg); opacity: 0; }
  6%   { opacity: 1; }
  100% { transform: translate3d(var(--sway, 0px), 480px, 0) rotateZ(var(--spin, 720deg)) rotateX(900deg); opacity: 1; }
}
@keyframes seCannonShot {
  0%   { transform: translate(0, 0) rotate(0deg) scale(1); opacity: 1; }
  70%  { opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)) rotate(var(--spin, 720deg)) scale(0.85); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .se-anim { animation-duration: 0.01ms !important; animation-delay: 0ms !important; }
}
`;

/* ================================================================== *
 * Shared scaffolding.
 * ================================================================== */

/** Collects setTimeout handles so a reset/unmount cancels a running ending. */
function useTimeline() {
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const at = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  useEffect(() => clear, [clear]);
  return { at, clear };
}

/** Eased count-up; mounts at 0 and animates to target. Remount (key) to replay. */
function CountUp({ target, durationMs = 850, delayMs = 0 }: { target: number; durationMs?: number; delayMs?: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now() + delayMs;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / durationMs));
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, delayMs]);
  return <>{value}</>;
}

/** The screen you land on after completing: a faux /refinement overview. */
function FauxOverview({ children }: { children?: React.ReactNode }) {
  return (
    <div className="se-anim absolute inset-0 px-8 py-7" style={{ animation: "seFadeIn 0.25s ease-out both" }}>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">/refinement</p>
      <p className="mt-1 font-display text-[18px] font-semibold tracking-[-0.02em] text-text-primary">Refinement</p>
      <div className="mt-4 space-y-2.5">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-border-subtle bg-[var(--color-surface-elevated)] px-4 py-3">
            <div className="h-2.5 w-40 rounded bg-overlay-default" />
            <div className="mt-2 h-2 w-24 rounded bg-overlay-subtle" />
          </div>
        ))}
        <p className="pt-1 text-[11px] text-text-muted">
          Completed sessions leave this list — the one you just finished is gone.
        </p>
      </div>
      {children}
    </div>
  );
}

const TONE_TICKETS = "var(--color-brand-400)";

/** One compact ticket row inside the mini wrap-up modal. */
function TicketLine({ t }: { t: (typeof SESSION_TICKETS)[number] }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-3 py-1.5">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE_TICKETS }} />
      <span className="shrink-0 font-mono text-[11px] text-text-muted">{t.key}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-text-secondary">{t.title}</span>
      <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-overlay-subtle px-1.5 font-mono text-[10px] font-semibold tabular-nums text-text-muted">
        {t.points}
      </span>
    </div>
  );
}

/**
 * Scaled-down replica of the real SessionEndModal. `closing` plays the exit
 * animation; `body`/`footer` let a variant swap the content (variant C/D).
 */
function MiniModal({
  closing,
  body,
  footer,
}: {
  closing: boolean;
  body?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="se-anim w-full max-w-xl rounded-2xl border border-border-default bg-[var(--color-surface-elevated)] shadow-[0_8px_40px_rgba(0,0,0,0.25),0_2px_12px_color-mix(in_srgb,var(--color-brand-500)_8%,transparent)]"
      style={{
        animation: closing
          ? "seModalOut 0.22s ease-in both"
          : "fadeInUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-brand-600)]/10">
          <CheckCircle2 size={16} strokeWidth={1.5} className="text-[var(--color-brand-400)]" />
        </div>
        <div>
          <p className="font-display text-[15px] font-bold tracking-tight text-text-primary">Wrap Up Session</p>
          <p className="text-[11px] text-text-muted">{SESSION_TICKETS.length} tickets refined</p>
        </div>
      </div>
      {body ?? (
        <div className="px-3 py-2.5">
          {SESSION_TICKETS.map((t) => (
            <TicketLine key={t.key} t={t} />
          ))}
        </div>
      )}
      <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
        {footer}
      </div>
    </div>
  );
}

/** Default footer: the real three buttons; only Complete is wired. */
function DefaultFooter({ onComplete, completeSlot }: { onComplete?: () => void; completeSlot?: React.ReactNode }) {
  return (
    <>
      <Button variant="ghost" size="md" icon={<ArrowLeft size={13} strokeWidth={2} />} className="mr-auto">
        Back to Session
      </Button>
      <Button variant="secondary" size="md" icon={<Save size={13} strokeWidth={2} />}>
        Save
      </Button>
      {completeSlot ?? (
        <Button variant="primary" size="md" icon={<CheckCircle2 size={13} strokeWidth={2} />} onClick={onComplete}>
          Complete
        </Button>
      )}
    </>
  );
}

/** The demo viewport: faux app surface + reset control. */
function Stage({ onReset, resettable, children }: { onReset: () => void; resettable: boolean; children: React.ReactNode }) {
  return (
    <div className="relative h-[420px] overflow-hidden bg-[var(--color-surface-base)]">
      {children}
      {resettable && (
        <button
          type="button"
          onClick={onReset}
          title="Replay"
          className="se-anim absolute right-3 top-3 z-30 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-[var(--color-surface-floating)] text-text-muted ring-1 ring-border-default transition-colors duration-150 hover:text-text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]"
          style={{ animation: "seFadeIn 0.2s ease-out both" }}
        >
          <RotateCcw size={13} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}

function ModalCenter({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center px-6">{children}</div>;
}

function VariantHeader({ tag, title, dial, blurb }: { tag: string; title: string; dial: string; blurb: React.ReactNode }) {
  return (
    <div className="border-b border-border-subtle px-5 py-4">
      <div className="mb-1.5 flex items-baseline gap-2.5">
        <span className="rounded-md bg-[color-mix(in_srgb,var(--color-brand-500)_14%,transparent)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-brand-400)]">
          {tag}
        </span>
        <h3 className="font-display text-[16px] font-semibold tracking-[-0.01em] text-text-primary">{title}</h3>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">{dial}</span>
      </div>
      <p className="max-w-2xl text-[12.5px] leading-[1.6] text-text-tertiary">{blurb}</p>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-2xl bg-[var(--color-surface-floating)] ring-1 ring-border-default">{children}</div>;
}

/* ================================================================== *
 * Today — the silent ending (the problem).
 * ================================================================== */

function VariantToday() {
  const [done, setDone] = useState(false);
  return (
    <Stage onReset={() => setDone(false)} resettable={done}>
      {done ? (
        <div className="absolute inset-0">
          {/* No transition at all: the overview just appears. */}
          <div className="absolute inset-0 px-8 py-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">/refinement</p>
            <p className="mt-1 font-display text-[18px] font-semibold tracking-[-0.02em] text-text-primary">Refinement</p>
            <div className="mt-4 space-y-2.5">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-xl border border-border-subtle bg-[var(--color-surface-elevated)] px-4 py-3">
                  <div className="h-2.5 w-40 rounded bg-overlay-default" />
                  <div className="mt-2 h-2 w-24 rounded bg-overlay-subtle" />
                </div>
              ))}
              <p className="pt-1 text-[11px] text-text-muted">
                That&apos;s it. No confirmation, no summary — did it even save?
              </p>
            </div>
          </div>
        </div>
      ) : (
        <ModalCenter>
          <MiniModal closing={false} footer={<DefaultFooter onComplete={() => setDone(true)} />} />
        </ModalCenter>
      )}
    </Stage>
  );
}

/* ================================================================== *
 * A — Confirmation toast.
 * ================================================================== */

function VariantToast() {
  const [phase, setPhase] = useState<"idle" | "closing" | "after">("idle");
  const [toastVisible, setToastVisible] = useState(true);
  const tl = useTimeline();

  const complete = () => {
    setPhase("closing");
    setToastVisible(true);
    tl.at(230, () => setPhase("after"));
  };
  const reset = () => {
    tl.clear();
    setPhase("idle");
  };

  return (
    <Stage onReset={reset} resettable={phase !== "idle"}>
      {phase === "after" ? (
        <FauxOverview>
          {toastVisible && (
            <div
              className="se-anim absolute bottom-5 left-1/2 z-20 flex items-center gap-2.5 rounded-xl border border-border-default bg-[var(--color-surface-floating)] py-2.5 pl-3.5 pr-2 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)]"
              style={{ animation: "seToastIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
            >
              <CheckCircle2 size={15} strokeWidth={2} className="shrink-0 text-[var(--color-brand-400)]" />
              <p className="whitespace-nowrap text-[12.5px] text-text-secondary">
                Session completed
                <span className="text-text-muted">
                  {" "}
                  — {SESSION_TICKETS.length} tickets · {TOTAL_POINTS} points · {DURATION_MIN} min
                </span>
              </p>
              <button
                type="button"
                onClick={() => setToastVisible(false)}
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors duration-150 hover:text-text-secondary"
              >
                <X size={13} strokeWidth={1.8} />
              </button>
            </div>
          )}
        </FauxOverview>
      ) : (
        <ModalCenter>
          <MiniModal closing={phase === "closing"} footer={<DefaultFooter onComplete={complete} />} />
        </ModalCenter>
      )}
    </Stage>
  );
}

/* ================================================================== *
 * B — Button micro-celebration.
 * ================================================================== */

function VariantButtonMorph() {
  const [phase, setPhase] = useState<"idle" | "confirm" | "closing" | "after">("idle");
  const tl = useTimeline();

  const complete = () => {
    setPhase("confirm");
    tl.at(820, () => setPhase("closing"));
    tl.at(1050, () => setPhase("after"));
  };
  const reset = () => {
    tl.clear();
    setPhase("idle");
  };

  const confirming = phase === "confirm" || phase === "closing";

  return (
    <Stage onReset={reset} resettable={phase !== "idle"}>
      {phase === "after" ? (
        <FauxOverview />
      ) : (
        <ModalCenter>
          <MiniModal
            closing={phase === "closing"}
            footer={
              <DefaultFooter
                completeSlot={
                  <button
                    type="button"
                    onClick={phase === "idle" ? complete : undefined}
                    className="se-anim inline-flex h-7 min-w-[104px] cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[var(--color-brand-600)] px-2.5 text-body-sm font-medium text-white shadow-[0_2px_8px_color-mix(in_srgb,var(--color-brand-500)_30%,transparent)] transition-colors duration-150 hover:bg-[var(--color-brand-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.97]"
                    style={confirming ? { animation: "seGlowPulse 0.7s ease-out both" } : undefined}
                  >
                    {confirming ? (
                      <span className="se-anim inline-flex" style={{ animation: "seCheckPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}>
                        <Check size={15} strokeWidth={2.5} />
                      </span>
                    ) : (
                      <>
                        <CheckCircle2 size={13} strokeWidth={2} />
                        Complete
                      </>
                    )}
                  </button>
                }
              />
            }
          />
        </ModalCenter>
      )}
    </Stage>
  );
}

/* ================================================================== *
 * C — In-modal summary state.
 * ================================================================== */

function StatBlock({ icon, value, label, delayMs }: { icon: React.ReactNode; value: React.ReactNode; label: string; delayMs: number }) {
  return (
    <div
      className="se-anim flex flex-col items-center gap-0.5 rounded-xl bg-overlay-subtle px-5 py-3"
      style={{ animation: `seFadeUp 0.3s ease-out ${delayMs}ms both` }}
    >
      <span className="flex items-center gap-1.5 font-display text-[20px] font-semibold tabular-nums tracking-[-0.02em] text-text-primary">
        <span className="text-[var(--color-brand-400)]">{icon}</span>
        {value}
      </span>
      <span className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-text-muted">{label}</span>
    </div>
  );
}

function VariantSummary() {
  const [phase, setPhase] = useState<"idle" | "summary" | "closing" | "after">("idle");
  const tl = useTimeline();

  const done = () => {
    setPhase("closing");
    tl.at(230, () => setPhase("after"));
  };
  const reset = () => {
    tl.clear();
    setPhase("idle");
  };

  const inSummary = phase === "summary" || phase === "closing";

  return (
    <Stage onReset={reset} resettable={phase !== "idle"}>
      {phase === "after" ? (
        <FauxOverview />
      ) : (
        <ModalCenter>
          <MiniModal
            closing={phase === "closing"}
            body={
              inSummary ? (
                <div className="se-anim flex flex-col items-center px-6 py-7" style={{ animation: "seFadeIn 0.2s ease-out both" }}>
                  <span
                    className="se-anim flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-brand-600)]/12 text-[var(--color-brand-400)]"
                    style={{ animation: "seCheckPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
                  >
                    <Check size={24} strokeWidth={2.5} />
                  </span>
                  <p
                    className="se-anim mt-3 font-display text-[19px] font-semibold tracking-[-0.02em] text-text-primary"
                    style={{ animation: "seFadeUp 0.3s ease-out 120ms both" }}
                  >
                    Session complete
                  </p>
                  <div className="mt-4 flex items-stretch gap-2.5">
                    <StatBlock icon={<Layers size={14} strokeWidth={2} />} value={SESSION_TICKETS.length} label="tickets" delayMs={200} />
                    <StatBlock icon={<Hash size={14} strokeWidth={2} />} value={TOTAL_POINTS} label="points" delayMs={280} />
                    <StatBlock icon={<Clock3 size={14} strokeWidth={2} />} value={DURATION_MIN} label="minutes" delayMs={360} />
                  </div>
                </div>
              ) : undefined
            }
            footer={
              inSummary ? (
                <>
                  <Button variant="ghost" size="md" icon={<NotebookPen size={13} strokeWidth={1.8} />} className="mr-auto">
                    View session notes
                  </Button>
                  <Button variant="primary" size="md" onClick={done}>
                    Done
                  </Button>
                </>
              ) : (
                <DefaultFooter onComplete={() => setPhase("summary")} />
              )
            }
          />
        </ModalCenter>
      )}
    </Stage>
  );
}

/* ================================================================== *
 * D — Summary with ticket cascade.
 * ================================================================== */

function VariantCascade() {
  const [phase, setPhase] = useState<"idle" | "summary" | "closing" | "after">("idle");
  const tl = useTimeline();

  const done = () => {
    setPhase("closing");
    tl.at(230, () => setPhase("after"));
  };
  const reset = () => {
    tl.clear();
    setPhase("idle");
  };

  const inSummary = phase === "summary" || phase === "closing";
  const rowBase = 250; // first row lands after the check settles
  const rowStep = 110;
  const totalsAt = rowBase + SESSION_TICKETS.length * rowStep + 150;

  return (
    <Stage onReset={reset} resettable={phase !== "idle"}>
      {phase === "after" ? (
        <FauxOverview />
      ) : (
        <ModalCenter>
          <MiniModal
            closing={phase === "closing"}
            body={
              inSummary ? (
                <div className="px-5 py-5">
                  <div className="flex items-center gap-3">
                    <span
                      className="se-anim flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-brand-600)]/12 text-[var(--color-brand-400)]"
                      style={{ animation: "seCheckPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
                    >
                      <Check size={18} strokeWidth={2.5} />
                    </span>
                    <div className="se-anim" style={{ animation: "seFadeUp 0.3s ease-out 100ms both" }}>
                      <p className="font-display text-[16px] font-semibold tracking-[-0.02em] text-text-primary">Session complete</p>
                      <p className="text-[11px] text-text-muted">Here&apos;s what you produced</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-1">
                    {SESSION_TICKETS.map((t, i) => (
                      <div
                        key={t.key}
                        className="se-anim flex items-center gap-2.5 rounded-lg bg-overlay-subtle px-3 py-1.5"
                        style={{ animation: `seRowIn 0.32s cubic-bezier(0.34, 1.56, 0.64, 1) ${rowBase + i * rowStep}ms both` }}
                      >
                        <Check size={12} strokeWidth={2.5} className="shrink-0 text-[var(--color-brand-400)]" />
                        <span className="shrink-0 font-mono text-[11px] text-text-muted">{t.key}</span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-text-secondary">{t.title}</span>
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-[var(--color-brand-600)]/12 px-1.5 font-mono text-[10px] font-semibold tabular-nums text-[var(--color-brand-400)]">
                          {t.points}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div
                    className="se-anim mt-4 flex items-center justify-center gap-5 rounded-xl border border-border-subtle px-4 py-2.5 font-mono text-[12px] tabular-nums text-text-secondary"
                    style={{ animation: `seFadeUp 0.3s ease-out ${totalsAt}ms both` }}
                  >
                    <span>
                      <CountUp target={SESSION_TICKETS.length} delayMs={totalsAt} /> <span className="text-text-muted">tickets</span>
                    </span>
                    <span className="text-border-strong">·</span>
                    <span>
                      <CountUp target={TOTAL_POINTS} delayMs={totalsAt} /> <span className="text-text-muted">points</span>
                    </span>
                    <span className="text-border-strong">·</span>
                    <span>
                      {DURATION_MIN} <span className="text-text-muted">min · ~{Math.round(DURATION_MIN / SESSION_TICKETS.length)}/ticket</span>
                    </span>
                  </div>
                </div>
              ) : undefined
            }
            footer={
              inSummary ? (
                <>
                  <Button variant="ghost" size="md" icon={<NotebookPen size={13} strokeWidth={1.8} />} className="mr-auto">
                    View session notes
                  </Button>
                  <span className="se-anim" style={{ animation: `seFadeIn 0.3s ease-out ${totalsAt + 250}ms both` }}>
                    <Button variant="primary" size="md" onClick={done}>
                      Done
                    </Button>
                  </span>
                </>
              ) : (
                <DefaultFooter onComplete={() => setPhase("summary")} />
              )
            }
          />
        </ModalCenter>
      )}
    </Stage>
  );
}

/* ================================================================== *
 * E — Full celebration.
 * ================================================================== */

type Particle = { id: number; dx: number; dy: number; size: number; delay: number; dur: number; tone: string };

const PARTICLE_TONES = ["var(--color-brand-400)", "var(--color-brand-500)", "#7fd9d4"];

function makeParticles(): Particle[] {
  return Array.from({ length: 26 }, (_, i) => {
    const angle = (i / 26) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 70 + Math.random() * 120;
    return {
      id: i,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist * 0.8 - 30,
      size: 3 + Math.random() * 5,
      delay: Math.random() * 140,
      dur: 700 + Math.random() * 550,
      tone: PARTICLE_TONES[i % PARTICLE_TONES.length],
    };
  });
}

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function VariantCelebration() {
  const [phase, setPhase] = useState<"idle" | "closing" | "celebrate" | "after">("idle");
  const [particles, setParticles] = useState<Particle[]>([]);
  const tl = useTimeline();

  const complete = () => {
    setPhase("closing");
    setParticles(makeParticles());
    tl.at(200, () => setPhase("celebrate"));
  };
  const reset = () => {
    tl.clear();
    setPhase("idle");
  };

  return (
    <Stage onReset={reset} resettable={phase !== "idle"}>
      {phase === "celebrate" ? (
        <div className="se-anim absolute inset-0" style={{ animation: "seFadeIn 0.3s ease-out both" }}>
          {/* Layered teal gradient field + grain */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 110%, color-mix(in srgb, var(--color-brand-600) 38%, transparent) 0%, transparent 60%), radial-gradient(80% 60% at 15% 0%, color-mix(in srgb, var(--color-brand-500) 14%, transparent) 0%, transparent 55%), radial-gradient(70% 55% at 90% 10%, color-mix(in srgb, #7fd9d4 10%, transparent) 0%, transparent 50%), var(--color-surface-base)",
            }}
          />
          <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: GRAIN }} />

          <div className="relative flex h-full flex-col items-center justify-center">
            {/* Burst origin */}
            <div className="relative">
              <span
                className="se-anim pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 rounded-full border border-[var(--color-brand-400)]"
                style={{ animation: "seRingExpand 0.8s ease-out both" }}
              />
              {particles.map((p) => (
                <span
                  key={p.id}
                  className="se-anim pointer-events-none absolute left-1/2 top-1/2 rounded-full"
                  style={
                    {
                      width: p.size,
                      height: p.size,
                      background: p.tone,
                      "--dx": `${p.dx}px`,
                      "--dy": `${p.dy}px`,
                      animation: `seBurst ${p.dur}ms ease-out ${p.delay}ms both`,
                    } as React.CSSProperties
                  }
                />
              ))}
              <span
                className="se-anim relative flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-brand-600)] text-white shadow-[0_8px_32px_color-mix(in_srgb,var(--color-brand-500)_45%,transparent)]"
                style={{ animation: "seCheckPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
              >
                <Check size={30} strokeWidth={2.5} />
              </span>
            </div>

            <p
              className="se-anim mt-5 font-display text-[30px] font-bold tracking-[-0.03em] text-text-primary"
              style={{ animation: "seFadeUp 0.4s ease-out 250ms both" }}
            >
              Session wrapped
            </p>
            <p className="se-anim mt-1 text-[13px] text-text-tertiary" style={{ animation: "seFadeUp 0.4s ease-out 350ms both" }}>
              {SESSION_TICKETS.length} tickets refined · {TOTAL_POINTS} points estimated · {DURATION_MIN} minutes
            </p>
            <span
              className="se-anim mt-4 inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-brand-500)_14%,transparent)] px-3 py-1 text-[11.5px] font-medium text-[var(--color-brand-400)] ring-1 ring-[color-mix(in_srgb,var(--color-brand-500)_30%,transparent)]"
              style={{ animation: "seFadeUp 0.4s ease-out 480ms both" }}
            >
              <Flame size={12} strokeWidth={2} />
              3rd session this week
            </span>
            <span className="se-anim mt-6" style={{ animation: "seFadeIn 0.4s ease-out 700ms both" }}>
              <Button variant="primary" size="md" onClick={() => setPhase("after")}>
                Done
              </Button>
            </span>
          </div>
        </div>
      ) : phase === "after" ? (
        <FauxOverview />
      ) : (
        <ModalCenter>
          <MiniModal closing={phase === "closing"} footer={<DefaultFooter onComplete={complete} />} />
        </ModalCenter>
      )}
    </Stage>
  );
}

/* ================================================================== *
 * F/G/H — success ON the wrap-up page, around the modal.
 * The modal stays exactly as it is (Save still means pause); the page
 * behind it carries the reward for clearing the queue. Three intensities.
 * ================================================================== */

/** Deterministic pseudo-random so SSR and client render the same field.
 *  Rounded to 2 decimals: the SSR HTML serializer trims float precision,
 *  so full-precision values would hydration-mismatch against the client. */
function seededRand(i: number, salt: number) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return Math.round((x - Math.floor(x)) * 100) / 100;
}

/** Soft teal bloom behind the modal; fades in, then breathes slowly. */
function AmbientHalo() {
  return (
    <span
      className="se-anim pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[620px] rounded-full"
      style={{
        background:
          "radial-gradient(closest-side, color-mix(in srgb, var(--color-brand-500) 22%, transparent) 0%, transparent 70%)",
        animation: "seFadeIn 0.9s ease-out both, seBreath 5.5s ease-in-out 0.9s infinite",
        transform: "translate(-50%, -50%)",
      }}
    />
  );
}

/** Layered gradient field along the bottom of the page, with grain. */
function AuroraField() {
  return (
    <>
      <div
        className="se-anim pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(110% 70% at 50% 115%, color-mix(in srgb, var(--color-brand-600) 30%, transparent) 0%, transparent 60%), radial-gradient(60% 45% at 12% 105%, color-mix(in srgb, #7fd9d4 9%, transparent) 0%, transparent 55%), radial-gradient(60% 45% at 88% 105%, color-mix(in srgb, var(--color-brand-500) 12%, transparent) 0%, transparent 55%)",
          animation: "seFadeIn 1s ease-out both",
        }}
      />
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: GRAIN }} />
    </>
  );
}

/** Slow upward-drifting teal motes around the modal. Negative animation
 *  delays mean the field is already mid-flight when the page appears. */
function DriftParticles() {
  return (
    <>
      {Array.from({ length: 16 }, (_, i) => {
        const left = (seededRand(i, 1) * 100).toFixed(2);
        const size = (2 + seededRand(i, 2) * 3.5).toFixed(2);
        const dur = (8 + seededRand(i, 3) * 7).toFixed(2);
        const delay = (-seededRand(i, 4) * 8).toFixed(2);
        const op = (0.25 + seededRand(i, 5) * 0.35).toFixed(2);
        return (
          <span
            key={i}
            className="pointer-events-none absolute rounded-full"
            style={
              {
                left: `${left}%`,
                bottom: "-8px",
                width: `${size}px`,
                height: `${size}px`,
                background: PARTICLE_TONES[i % PARTICLE_TONES.length],
                "--op": op,
                animation: `seDrift ${dur}s linear ${delay}s infinite`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </>
  );
}

/** Celebratory line above the modal. */
function QueueClearedHeadline() {
  return (
    <div className="se-anim flex flex-col items-center gap-0.5" style={{ animation: "seFadeUp 0.45s ease-out 150ms both" }}>
      <p className="flex items-center gap-2 font-display text-[22px] font-bold tracking-[-0.02em] text-text-primary">
        <Sparkles size={17} strokeWidth={2} className="text-[var(--color-brand-400)]" />
        Queue cleared
      </p>
      <p className="text-[12px] text-text-tertiary">
        {SESSION_TICKETS.length} tickets refined · {TOTAL_POINTS} points · {DURATION_MIN} minutes — wrap up below
      </p>
    </div>
  );
}

/* Festive layers: a multi-tone confetti palette (brand teals + custom gold,
 * violet and rose accents) used by the one-shot rain and cannon variants. */
const CONFETTI_TONES = ["var(--color-brand-400)", "#7fd9d4", "#d9a441", "#9d7bdd", "#dd7e9b"];

/** One-shot confetti falling across the full page width, tumbling as it goes. */
function ConfettiRain() {
  return (
    <>
      {Array.from({ length: 36 }, (_, i) => {
        const left = (seededRand(i, 11) * 100).toFixed(2);
        const w = (5 + seededRand(i, 12) * 3).toFixed(2);
        const h = (9 + seededRand(i, 13) * 5).toFixed(2);
        const dur = (2.6 + seededRand(i, 14) * 1.6).toFixed(2);
        const delay = (seededRand(i, 15) * 1.2).toFixed(2);
        const sway = ((seededRand(i, 16) - 0.5) * 140).toFixed(2);
        const spin = Math.round(420 + seededRand(i, 17) * 900);
        const round = seededRand(i, 18) > 0.8;
        return (
          <span
            key={i}
            className="se-anim pointer-events-none absolute"
            style={
              {
                left: `${left}%`,
                top: "-18px",
                width: `${w}px`,
                height: round ? `${w}px` : `${h}px`,
                borderRadius: round ? "50%" : "1.5px",
                background: CONFETTI_TONES[i % CONFETTI_TONES.length],
                "--sway": `${sway}px`,
                "--spin": `${spin}deg`,
                animation: `seConfettiFall ${dur}s cubic-bezier(0.25, 0.1, 0.4, 1) ${delay}s both`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </>
  );
}

/** One corner cannon: confetti shot diagonally up from a bottom corner. */
function CannonSide({ side }: { side: "left" | "right" }) {
  const mirror = side === "right" ? -1 : 1;
  const salt = side === "right" ? 40 : 20;
  return (
    <>
      {Array.from({ length: 20 }, (_, i) => {
        const angle = ((20 + seededRand(i, salt + 1) * 52) * Math.PI) / 180;
        const dist = 180 + seededRand(i, salt + 2) * 300;
        const dx = (Math.cos(angle) * dist * mirror).toFixed(2);
        const dy = (-Math.sin(angle) * dist).toFixed(2);
        const dur = (1.1 + seededRand(i, salt + 3) * 0.7).toFixed(2);
        const delay = (seededRand(i, salt + 4) * 0.18).toFixed(2);
        const spin = Math.round((seededRand(i, salt + 5) - 0.5) * 1440);
        const w = (5 + seededRand(i, salt + 6) * 3).toFixed(2);
        const h = (10 + seededRand(i, salt + 7) * 5).toFixed(2);
        return (
          <span
            key={i}
            className="se-anim pointer-events-none absolute"
            style={
              {
                left: side === "left" ? "-6px" : undefined,
                right: side === "right" ? "-6px" : undefined,
                bottom: "-6px",
                width: `${w}px`,
                height: `${h}px`,
                borderRadius: "1.5px",
                background: CONFETTI_TONES[i % CONFETTI_TONES.length],
                "--dx": `${dx}px`,
                "--dy": `${dy}px`,
                "--spin": `${spin}deg`,
                animation: `seCannonShot ${dur}s cubic-bezier(0.16, 0.84, 0.44, 1) ${delay}s both`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </>
  );
}

function VariantFestive({ mode }: { mode: "rain" | "cannons" }) {
  const [run, setRun] = useState(0);
  return (
    <Stage onReset={() => setRun((r) => r + 1)} resettable>
      <div key={run} className="absolute inset-0">
        <AuroraField />
        <AmbientHalo />
        {mode === "rain" ? (
          <ConfettiRain />
        ) : (
          <>
            <CannonSide side="left" />
            <CannonSide side="right" />
          </>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6">
          <QueueClearedHeadline />
          <MiniModal closing={false} footer={<DefaultFooter />} />
        </div>
      </div>
    </Stage>
  );
}

function VariantAmbient({ headline = false, aurora = false }: { headline?: boolean; aurora?: boolean }) {
  const [run, setRun] = useState(0);
  return (
    <Stage onReset={() => setRun((r) => r + 1)} resettable>
      <div key={run} className="absolute inset-0">
        {aurora && <AuroraField />}
        <AmbientHalo />
        {aurora && <DriftParticles />}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6">
          {headline && <QueueClearedHeadline />}
          <MiniModal closing={false} footer={<DefaultFooter />} />
        </div>
      </div>
    </Stage>
  );
}

/* ================================================================== *
 * Page.
 * ================================================================== */

const VARIANTS: { tag: string; title: string; dial: string; blurb: React.ReactNode; demo: React.ReactNode }[] = [
  {
    tag: "A",
    title: "Confirmation toast",
    dial: "most subtle",
    blurb: (
      <>
        The modal closes as it does today, but a toast slides in on the overview:{" "}
        <strong className="text-text-secondary">&ldquo;Session completed — 4 tickets · 18 points · 23 min&rdquo;</strong>. Zero
        friction, closes the &ldquo;did that save?&rdquo; loop. Easy to miss, no real sense of accomplishment.
      </>
    ),
    demo: <VariantToast />,
  },
  {
    tag: "B",
    title: "Button micro-celebration",
    dial: "subtle",
    blurb: (
      <>
        The Complete button itself confirms: the label pops into a{" "}
        <strong className="text-text-secondary">check with a one-time glow</strong> (same family as the copy-confirm
        animation), then the modal fades out. Satisfying exactly where you clicked; adds ~0.8s before the redirect, no
        summary information.
      </>
    ),
    demo: <VariantButtonMorph />,
  },
  {
    tag: "C",
    title: "In-modal summary",
    dial: "middle",
    blurb: (
      <>
        Instead of closing, the modal swaps to a <strong className="text-text-secondary">&ldquo;Session complete&rdquo;</strong>{" "}
        state: animated check, stats (tickets / points / duration) and a single Done button. A revival of the deleted
        SessionSummary, inside the existing modal. One extra click, but a conscious ending plus a link to the notes you just
        wrote.
      </>
    ),
    demo: <VariantSummary />,
  },
  {
    tag: "D",
    title: "Summary with ticket cascade",
    dial: "less subtle",
    blurb: (
      <>
        Same summary, but the refined tickets <strong className="text-text-secondary">stagger in one by one</strong> with
        their points, and the totals count up from zero. Makes even a short session feel like output. The Done button
        arrives last; daily use would want a click-to-skip.
      </>
    ),
    demo: <VariantCascade />,
  },
  {
    tag: "E",
    title: "Full celebration",
    dial: "least subtle",
    blurb: (
      <>
        The stage takes over: layered teal gradient field with grain, a{" "}
        <strong className="text-text-secondary">particle burst</strong> from the check, display-type headline and a streak
        chip (&ldquo;3rd session this week&rdquo;). A genuine reward moment — with the tonal risk that a routine 10-minute
        session gets a standing ovation.
      </>
    ),
    demo: <VariantCelebration />,
  },
];

export default function SessionEndingExplorationPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      <style>{KEYFRAMES}</style>
      <div className="mx-auto max-w-[920px]">
        <div className="mb-7 flex items-center justify-between gap-3">
          <Link
            href="/dev/exploration"
            className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted transition-colors hover:text-[var(--color-brand-300)] cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            exploration
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-surface-floating)] px-3 py-1.5 text-[12px] font-medium text-text-secondary ring-1 ring-border-default transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-px hover:text-text-primary hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] cursor-pointer"
          >
            {theme === "dark" ? <Sun size={14} strokeWidth={1.8} /> : <Moon size={14} strokeWidth={1.8} />}
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>

        <header className="mb-10">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
            /dev/exploration/session-ending
          </p>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.03em] text-text-primary">
            Refinement session — the happy ending
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            Two layers of &ldquo;happy ending&rdquo;. First{" "}
            <strong className="text-text-secondary">five endings</strong> for the moment you press Complete, ramping from
            subtle to celebratory. Then <strong className="text-text-secondary">ambient and festive treatments</strong>{" "}
            that put success on the wrap-up page itself, around the modal, before you choose Save or Complete. Each stage
            is live; replay with the corner button. All variants use the same pretend session (4 tickets, 18 points, 23
            minutes).
          </p>
          <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--color-status-done)_12%,transparent)] px-3 py-2 text-[12px] leading-[1.5] text-text-secondary ring-1 ring-[color-mix(in_srgb,var(--color-status-done)_30%,transparent)]">
            <span className="font-semibold text-[var(--color-status-done)]">Chosen</span>
            <span>
              <strong className="text-text-secondary">Variant J (Corner cannons)</strong> was picked for the real wrap-up
              page: aurora + halo + &ldquo;Queue cleared&rdquo; headline + one-shot corner bursts, modal untouched. Written
              up as BRDG-341.
            </span>
          </p>
        </header>

        {/* ===== TODAY (the problem) ===== */}
        <section className="mb-12">
          <div className="mb-3 flex items-baseline gap-3">
            <h2 className="font-display text-[18px] font-semibold tracking-[-0.02em] text-text-primary">Today</h2>
            <span className="font-mono text-[11px] text-[var(--color-status-test,#d97706)]">the problem</span>
          </div>
          <p className="mb-4 max-w-xl text-[12.5px] leading-[1.6] text-text-tertiary">
            Complete silently redirects to the refinement overview, where the finished session no longer exists. No
            confirmation, no numbers, no closure.
          </p>
          <Card>
            <VariantToday />
          </Card>
        </section>

        {/* ===== VARIANTS ===== */}
        {VARIANTS.map((v) => (
          <section key={v.tag} className="mb-12">
            <Card>
              <VariantHeader tag={v.tag} title={v.title} dial={v.dial} blurb={v.blurb} />
              {v.demo}
            </Card>
          </section>
        ))}

        {/* ===== ON THE WRAP-UP PAGE ITSELF ===== */}
        <section className="mb-6">
          <div className="mb-3 flex items-baseline gap-3">
            <h2 className="font-display text-[18px] font-semibold tracking-[-0.02em] text-text-primary">
              On the wrap-up page itself
            </h2>
            <span className="font-mono text-[11px] text-[var(--color-brand-400)]">around the modal</span>
          </div>
          <p className="mb-4 max-w-2xl text-[12.5px] leading-[1.6] text-text-tertiary">
            A–E celebrate the exit. These three celebrate the <strong className="text-text-secondary">arrival</strong>:
            reaching the wrap-up means the queue is cleared, so the page behind the modal already carries the success —
            before you choose Save or Complete. The modal itself is untouched, so pausing via Save still feels right.
            Each layer stacks on the previous one; all three combine with any ending above.
          </p>
        </section>

        <section className="mb-12">
          <Card>
            <VariantHeader
              tag="F"
              title="Backdrop halo"
              dial="ambient"
              blurb={
                <>
                  A soft teal bloom fades in behind the modal and <strong className="text-text-secondary">breathes</strong>{" "}
                  slowly. The page feels warmer than the session screens you came from, without a single new element.
                </>
              }
            />
            <VariantAmbient />
          </Card>
        </section>

        <section className="mb-12">
          <Card>
            <VariantHeader
              tag="G"
              title="Halo + headline"
              dial="ambient +"
              blurb={
                <>
                  Adds one line above the modal: <strong className="text-text-secondary">&ldquo;Queue cleared&rdquo;</strong>{" "}
                  with the session numbers. Names the achievement explicitly and gives the wrap-up form a reason to exist
                  (&ldquo;wrap up below&rdquo;).
                </>
              }
            />
            <VariantAmbient headline />
          </Card>
        </section>

        <section className="mb-12">
          <Card>
            <VariantHeader
              tag="H"
              title="Aurora & drift"
              dial="full ambience"
              blurb={
                <>
                  The full treatment: a layered gradient field rises from the bottom of the page, grain for depth, and{" "}
                  <strong className="text-text-secondary">slow-drifting teal motes</strong> float up around the modal while
                  you write your notes. Festive but calm — nothing bursts, everything drifts.
                </>
              }
            />
            <VariantAmbient headline aurora />
          </Card>
        </section>

        <section className="mb-12">
          <Card>
            <VariantHeader
              tag="I"
              title="Confetti rain"
              dial="festive"
              blurb={
                <>
                  H&apos;s ambience, but the drift is replaced by a{" "}
                  <strong className="text-text-secondary">one-shot confetti fall</strong>: multi-tone pieces (teal, gold,
                  violet, rose) tumble down across the page for about three seconds when the wrap-up opens, then the page
                  settles into the calm aurora while you write.
                </>
              }
            />
            <VariantFestive mode="rain" />
          </Card>
        </section>

        <section className="mb-12">
          <Card>
            <VariantHeader
              tag="J"
              title="Corner cannons"
              dial="festive +"
              blurb={
                <>
                  Two confetti cannons fire <strong className="text-text-secondary">diagonally from the bottom corners</strong>{" "}
                  the moment the wrap-up opens — a short, punchy salute that frames the modal instead of covering it. Over in
                  under two seconds, then the aurora carries the mood.
                </>
              }
            />
            <VariantFestive mode="cannons" />
          </Card>
        </section>

        <footer className="flex items-center gap-2 border-t border-border-subtle pt-5 text-[12px] text-text-tertiary">
          <Sparkles size={14} strokeWidth={2} className="text-[var(--color-brand-400)]" />
          The layers compose: an ambient wrap-up page (F–H) plus a Complete-only finale (A–E) keeps Save neutral while
          the definitive close still gets its moment. All variants reuse data the wrap-up already has (queue, session
          estimates, start time, comment).
        </footer>
      </div>
    </div>
  );
}
