"use client";

/**
 * Throwaway exploration: how to set SP (committed story points) and the PO
 * guestimate from a board row WITHOUT showing two near-identical "#" badges on
 * hover. Today an unscored row reveals both an SP ghost and a guess ghost side
 * by side (see the "Today" strip), which reads as two competing affordances.
 *
 * Three flows, each solving the duplication differently:
 *   A · One entry point   - a single chip; one popover sets either value. SP
 *                           supersedes the guess in the row, so only ONE chip
 *                           is ever visible.
 *   B · Pencil to ink     - a single chip that graduates: a dashed guess that
 *                           you later "commit" into a solid SP. One chip, ever.
 *                           A "#" button types values past the preset scale.
 *   C · Twin track        - both values live in ONE bordered pill (guess -> SP),
 *                           so they read as a single unit, never two badges.
 *
 * Popovers render through a portal with fixed positioning (like the real
 * StoryPointPicker), so they overlay the page instead of being clipped by the
 * card's rounded overflow.
 *
 * Reachable at /dev/exploration/estimate-entry. Not linked from app nav.
 */

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/contexts/ThemeContext";
import { ArrowLeft, Sun, Moon, Hash, Minus, ArrowRight, Check, X, PenLine, SquareCheckBig } from "lucide-react";

/* ================================================================== *
 * Shared tokens + primitives.
 * ================================================================== */

const FIB = [1, 2, 3, 5, 8] as const;
const SLATE = "#64748b";
// Theme-aware slate foreground the real app already defines globally.
const SLATE_FG = "var(--meta-sp-fg)";
const slateTint = "color-mix(in srgb, #64748b 16%, transparent)";
const slateBorder = "color-mix(in srgb, #64748b 45%, transparent)";

type PopPos = { top: number; right: number } | null;

/**
 * Portal-popover state: anchors a fixed-position panel to a trigger button and
 * handles outside-click / Escape / scroll reposition. Mirrors the real picker so
 * the panel is never clipped by an ancestor's overflow.
 */
function usePortalPopover() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopPos>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const reposition = useCallback(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
  }, []);

  const close = useCallback(() => setOpen(false), []);
  // Position is computed here (an event handler), never synchronously in an
  // effect, so opening reads the trigger rect once and the panel mounts placed.
  const openPop = useCallback(() => {
    reposition();
    setOpen(true);
  }, [reposition]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  return { open, pos, triggerRef, popRef, openPop, close };
}

function PortalPanel({
  popRef,
  pos,
  width,
  children,
}: {
  popRef: React.Ref<HTMLDivElement>;
  pos: PopPos;
  width: number;
  children: React.ReactNode;
}) {
  if (!pos) return null;
  return createPortal(
    <div
      ref={popRef}
      className="fixed z-[9999] rounded-lg border border-border-default bg-[var(--color-surface-floating)] p-2 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)]"
      style={{ top: pos.top, right: pos.right, width }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** A single fibonacci / N-A swatch inside a popover. */
function Preset({
  n,
  active,
  dashed = false,
  onPick,
}: {
  n: number;
  active: boolean;
  dashed?: boolean;
  onPick: () => void;
}) {
  const isNA = n === 0;
  return (
    <button
      type="button"
      onClick={onPick}
      title={isNA ? "Not applicable" : undefined}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-[12px] font-semibold tabular-nums cursor-pointer transition-[opacity,background-color] duration-100 hover:opacity-80 active:opacity-60 ${dashed ? "border border-dashed" : ""}`}
      style={
        active
          ? { color: "#fff", background: SLATE, borderColor: "transparent" }
          : {
              color: SLATE_FG,
              background: dashed ? "transparent" : slateTint,
              borderColor: dashed ? slateBorder : "transparent",
            }
      }
    >
      {isNA ? <Minus size={12} strokeWidth={2} /> : n}
    </button>
  );
}

/** A committed (solid) or penciled (dashed) value chip shown in the row. */
function ValueChip({
  value,
  dashed,
  onClick,
  triggerRef,
}: {
  value: number;
  dashed: boolean;
  onClick: () => void;
  triggerRef?: React.Ref<HTMLButtonElement>;
}) {
  const label = value === 0 ? "-" : String(value);
  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={onClick}
      className={`flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium tabular-nums cursor-pointer transition-[opacity] duration-100 hover:opacity-80 active:opacity-60 ${dashed ? "border border-dashed" : "border border-transparent"}`}
      style={{
        color: SLATE_FG,
        background: dashed ? "transparent" : slateTint,
        borderColor: dashed ? slateBorder : "transparent",
      }}
    >
      <Hash size={11} strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}

/** Empty-state ghost: a faint "#", revealed only on row hover. */
function Ghost({
  onClick,
  triggerRef,
  dashed = false,
}: {
  onClick: () => void;
  triggerRef?: React.Ref<HTMLButtonElement>;
  dashed?: boolean;
}) {
  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={onClick}
      className={`flex h-6 w-7 items-center justify-center rounded-md text-text-muted opacity-0 transition-[opacity,background-color] duration-150 hover:bg-overlay-subtle hover:text-text-secondary group-hover/row:opacity-100 focus-visible:opacity-100 cursor-pointer ${dashed ? "border border-dashed border-border-subtle" : ""}`}
    >
      <Hash size={11} strokeWidth={2} />
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-0.5 pb-1 text-[9px] font-semibold uppercase tracking-wider text-text-muted">{children}</div>
  );
}

/* ================================================================== *
 * Flow A — One entry point.
 * One chip. One popover with a guess section and an SP section. SP supersedes
 * the guess in the row display, so the row shows at most ONE chip at any time.
 * ================================================================== */

function FlowA({ initSp = null, initGuess = null }: { initSp?: number | null; initGuess?: number | null }) {
  const [sp, setSp] = useState<number | null>(initSp);
  const [guess, setGuess] = useState<number | null>(initGuess);
  const pop = usePortalPopover();

  // SP wins; guess only shows until real points land (effectivePoints semantics).
  const shown = sp != null ? { v: sp, dashed: false } : guess != null ? { v: guess, dashed: true } : null;

  return (
    <>
      {shown ? (
        <ValueChip value={shown.v} dashed={shown.dashed} onClick={pop.open ? pop.close : pop.openPop} triggerRef={pop.triggerRef} />
      ) : (
        <Ghost onClick={pop.open ? pop.close : pop.openPop} triggerRef={pop.triggerRef} />
      )}

      {pop.open && (
        <PortalPanel popRef={pop.popRef} pos={pop.pos} width={208}>
          <SectionLabel>Guestimate · rough</SectionLabel>
          <div className="flex items-center gap-1">
            <Preset n={0} dashed active={guess === 0} onPick={() => setGuess(0)} />
            {FIB.map((n) => (
              <Preset key={n} n={n} dashed active={guess === n} onPick={() => setGuess(n)} />
            ))}
          </div>

          <div className="my-2 h-px bg-border-subtle" />

          <SectionLabel>Story points · committed</SectionLabel>
          <div className="flex items-center gap-1">
            <Preset n={0} active={sp === 0} onPick={() => setSp(0)} />
            {FIB.map((n) => (
              <Preset key={n} n={n} active={sp === n} onPick={() => setSp(n)} />
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2 text-[10px] text-text-tertiary">
            <span>
              Guess <span className="font-semibold text-text-secondary">{guess == null ? "—" : guess === 0 ? "N/A" : guess}</span>
              {"  ·  "}
              SP <span className="font-semibold text-text-secondary">{sp == null ? "—" : sp === 0 ? "N/A" : sp}</span>
            </span>
            {sp != null && guess != null && <span className="text-text-muted">SP shown</span>}
          </div>
        </PortalPanel>
      )}
    </>
  );
}

/* ================================================================== *
 * Flow B — Pencil to ink.
 * A single chip that graduates: empty -> dashed guess -> solid SP. The guess
 * value is remembered so you can see "was 3" after committing. One chip, ever.
 * ================================================================== */

/**
 * Preset grid (N/A + Fibonacci) with a "#" toggle that swaps to a free number
 * input, so values past the preset scale (13, 21, 34, …) are reachable. Matches
 * the real StoryPointPicker's custom-entry affordance. Picking does NOT close
 * the popover here — flow B wants you to set a guess, then reach the commit
 * action in the same interaction.
 */
function EstimateRow({
  value,
  dashed,
  onPick,
}: {
  value: number | null;
  dashed: boolean;
  onPick: (v: number | null) => void;
}) {
  const [custom, setCustom] = useState(false);
  const [input, setInput] = useState("");

  const submit = () => {
    const parsed = parseInt(input, 10);
    if (parsed > 0 && parsed <= 999) onPick(parsed);
    setCustom(false);
    setInput("");
  };
  const cancel = () => {
    setCustom(false);
    setInput("");
  };

  if (custom) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="number"
          min="1"
          max="999"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              cancel();
            }
          }}
          placeholder="13"
          className="h-7 w-16 rounded-md border border-border-default bg-[var(--color-surface-default)] px-2 text-center text-[12px] font-medium tabular-nums text-text-primary outline-none focus:border-[var(--color-brand-400)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={submit}
          title="Set value"
          className="flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-[opacity] duration-100 hover:opacity-80 active:opacity-60"
          style={{ color: "#fff", background: SLATE }}
        >
          <Check size={13} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          onClick={cancel}
          title="Cancel"
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted cursor-pointer transition-colors duration-100 hover:bg-overlay-default hover:text-text-secondary active:opacity-60"
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>
    );
  }

  const isCustomValue = value != null && value > 0 && !FIB.includes(value as (typeof FIB)[number]);
  return (
    <div className="flex items-center gap-1">
      <Preset n={0} dashed={dashed} active={value === 0} onPick={() => onPick(0)} />
      {FIB.map((n) => (
        <Preset key={n} n={n} dashed={dashed} active={value === n} onPick={() => onPick(n)} />
      ))}
      <button
        type="button"
        onClick={() => {
          setInput(isCustomValue ? String(value) : "");
          setCustom(true);
        }}
        title="Custom value (13, 21, …)"
        className={`flex h-7 w-7 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums cursor-pointer transition-[opacity] duration-100 hover:opacity-80 active:opacity-60 ${dashed && !isCustomValue ? "border border-dashed" : ""}`}
        style={
          isCustomValue
            ? { color: "#fff", background: SLATE, borderColor: "transparent" }
            : { color: SLATE_FG, background: dashed ? "transparent" : slateTint, borderColor: dashed ? slateBorder : "transparent" }
        }
      >
        {isCustomValue ? value : <Hash size={11} strokeWidth={2} />}
      </button>
      {/* Reset to unset (null) — distinct from N/A (-), which is an explicit value. */}
      <button
        type="button"
        onClick={() => onPick(null)}
        disabled={value == null}
        title="Clear (not set)"
        className={`flex h-7 w-7 items-center justify-center rounded-md text-text-muted cursor-pointer transition-colors duration-100 hover:bg-overlay-default hover:text-text-secondary active:opacity-60 ${value == null ? "opacity-30 pointer-events-none" : ""}`}
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

function FlowB({ initSp = null, initGuess = null }: { initSp?: number | null; initGuess?: number | null }) {
  const [sp, setSp] = useState<number | null>(initSp);
  const [guess, setGuess] = useState<number | null>(initGuess);
  const pop = usePortalPopover();

  const committed = sp != null;
  const shown = committed ? { v: sp!, dashed: false } : guess != null ? { v: guess, dashed: true } : null;

  // The guesstimate that existed when this popover opened. On commit the working
  // value becomes SP while THIS snapshot is kept as the guesstimate of record, so
  // a later "adjust + commit" preserves the earlier guess instead of overwriting
  // it with the value you replaced it by. Null when you start from empty, and
  // cleared if you explicitly reset the guess in this session.
  const guessAtOpen = useRef<number | null>(null);
  const openPopover = () => {
    guessAtOpen.current = guess;
    pop.openPop();
  };

  // Set the active value. An explicit clear in the guess phase also drops the
  // remembered guesstimate, so a fresh commit afterwards won't resurrect it.
  const setValue = (v: number | null) => {
    if (committed) {
      setSp(v);
      return;
    }
    setGuess(v);
    if (v == null) guessAtOpen.current = null;
  };

  // Keyboard entry while the popover is open: a preset key picks the value, 0/-
  // marks N/A, Backspace/Delete clears. Skipped while the custom number field is
  // focused so typing a multi-digit value (e.g. 13) is not hijacked. Picking does
  // not close, mirroring click, so the commit action stays reachable.
  useEffect(() => {
    if (!pop.open) return;
    const set = (v: number | null) => {
      if (committed) {
        setSp(v);
        return;
      }
      setGuess(v);
      if (v == null) guessAtOpen.current = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if ((document.activeElement as HTMLElement | null)?.tagName === "INPUT") return;
      if (e.key === "Escape") return;
      if (e.key === "Backspace" || e.key === "Delete") {
        set(null);
        return;
      }
      if (e.key === "0" || e.key === "-") {
        set(0);
        return;
      }
      const num = parseInt(e.key, 10);
      if (FIB.includes(num as (typeof FIB)[number])) set(num);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pop.open, committed]);

  return (
    <>
      {shown ? (
        <ValueChip value={shown.v} dashed={shown.dashed} onClick={pop.open ? pop.close : openPopover} triggerRef={pop.triggerRef} />
      ) : (
        <Ghost dashed onClick={pop.open ? pop.close : openPopover} triggerRef={pop.triggerRef} />
      )}

      {pop.open && (
        <PortalPanel popRef={pop.popRef} pos={pop.pos} width={284}>
          <SectionLabel>{committed ? "Story points" : "Guestimate"}</SectionLabel>
          <EstimateRow value={committed ? sp : guess} dashed={!committed} onPick={setValue} />

          {!committed && guess != null && (
            // Subtle "ink it" action: a quiet dashed outline in brand ink, not a
            // loud filled button. The guess is still penciled in until you press it.
            <button
              type="button"
              onClick={() => {
                setSp(guess);
                setGuess(guessAtOpen.current);
                pop.close();
              }}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-[11px] font-medium transition-[background-color] duration-100 hover:bg-[color-mix(in_srgb,var(--color-brand-500)_12%,transparent)] active:opacity-70 cursor-pointer"
              style={{
                color: "var(--color-brand-400)",
                borderColor: "color-mix(in srgb, var(--color-brand-500) 35%, transparent)",
              }}
            >
              <PenLine size={12} strokeWidth={2} />
              Commit as story points
            </button>
          )}

          {committed && guess != null && (
            // One action that also names the value it would restore.
            <div className="mt-2 flex justify-end border-t border-border-subtle pt-2 text-[10px] text-text-tertiary">
              <button
                type="button"
                onClick={() => {
                  setSp(null);
                  pop.close();
                }}
                className="transition-colors duration-100 hover:text-text-secondary cursor-pointer"
              >
                back to guestimate{" "}
                <span className="font-semibold text-text-secondary">{guess === 0 ? "(N/A)" : `(# ${guess})`}</span>
              </button>
            </div>
          )}
        </PortalPanel>
      )}
    </>
  );
}

/* ================================================================== *
 * Flow C — Twin track.
 * Both values live inside ONE bordered pill: guess -> SP. It reads as a single
 * unit, so hover never produces two free-floating badges. Each compartment
 * opens its own small picker.
 * ================================================================== */

function TwinContent({
  value,
  dashed,
  onPick,
}: {
  value: number | null;
  dashed: boolean;
  onPick: (v: number) => void;
}) {
  return (
    <>
      <SectionLabel>{dashed ? "Guestimate" : "Story points"}</SectionLabel>
      <div className="flex items-center gap-1">
        <Preset n={0} dashed={dashed} active={value === 0} onPick={() => onPick(0)} />
        {FIB.map((n) => (
          <Preset key={n} n={n} dashed={dashed} active={value === n} onPick={() => onPick(n)} />
        ))}
      </div>
    </>
  );
}

function FlowC({ initSp = null, initGuess = null }: { initSp?: number | null; initGuess?: number | null }) {
  const [sp, setSp] = useState<number | null>(initSp);
  const [guess, setGuess] = useState<number | null>(initGuess);
  const [side, setSide] = useState<"guess" | "sp" | null>(null);
  const [pos, setPos] = useState<PopPos>(null);
  const guessRef = useRef<HTMLButtonElement>(null);
  const spRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const placeFrom = useCallback((which: "guess" | "sp") => {
    const r = (which === "guess" ? guessRef : spRef).current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
  }, []);

  const openSide = (which: "guess" | "sp") => {
    if (side === which) {
      setSide(null);
      return;
    }
    placeFrom(which);
    setSide(which);
  };

  useEffect(() => {
    if (!side) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || guessRef.current?.contains(t) || spRef.current?.contains(t)) return;
      setSide(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSide(null);
    };
    const onMove = () => placeFrom(side);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [side, placeFrom]);

  const empty = sp == null && guess == null;
  const label = (v: number | null) => (v == null ? null : v === 0 ? "-" : String(v));

  return (
    <div
      className={empty ? "opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 focus-within:opacity-100" : undefined}
    >
      <div
        className="flex items-center rounded-md border"
        style={{ borderColor: slateBorder, borderStyle: guess != null && sp == null ? "dashed" : "solid" }}
      >
        <button
          ref={guessRef}
          type="button"
          onClick={() => openSide("guess")}
          title="Guestimate"
          className="flex h-6 items-center gap-1 px-1.5 text-[12px] font-medium tabular-nums transition-[background-color] duration-100 hover:bg-overlay-subtle cursor-pointer"
          style={{ color: guess != null ? SLATE_FG : "var(--color-text-muted)" }}
        >
          <Hash size={10} strokeWidth={2} aria-hidden style={{ opacity: guess != null ? 1 : 0.6 }} />
          {label(guess) ?? <span className="opacity-50">·</span>}
        </button>

        <ArrowRight size={11} strokeWidth={2} className="mx-0.5 shrink-0 text-text-muted" aria-hidden />

        <button
          ref={spRef}
          type="button"
          onClick={() => openSide("sp")}
          title="Story points"
          className="flex h-6 items-center gap-1 px-1.5 text-[12px] font-medium tabular-nums transition-[background-color] duration-100 hover:bg-overlay-subtle cursor-pointer"
          style={{ color: sp != null ? SLATE_FG : "var(--color-text-muted)" }}
        >
          <Hash size={10} strokeWidth={2} aria-hidden style={{ opacity: sp != null ? 1 : 0.6 }} />
          {label(sp) ?? <span className="opacity-50">·</span>}
        </button>
      </div>

      {side === "guess" && (
        <PortalPanel popRef={popRef} pos={pos} width={208}>
          <TwinContent value={guess} dashed onPick={(v) => { setGuess(v); setSide(null); }} />
        </PortalPanel>
      )}
      {side === "sp" && (
        <PortalPanel popRef={popRef} pos={pos} width={208}>
          <TwinContent value={sp} dashed={false} onPick={(v) => { setSp(v); setSide(null); }} />
        </PortalPanel>
      )}
    </div>
  );
}

/* ================================================================== *
 * "Today" strip — reproduces the two-badge hover problem for contrast.
 * ================================================================== */

function TodayBadges() {
  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100">
      {/* solid SP ghost */}
      <span className="flex h-6 w-7 items-center justify-center rounded-md border border-transparent bg-overlay-subtle text-text-muted">
        <Hash size={11} strokeWidth={2} />
      </span>
      {/* dashed guess ghost */}
      <span className="flex h-6 w-7 items-center justify-center rounded-md border border-dashed border-border-default text-text-muted">
        <Hash size={11} strokeWidth={2} />
      </span>
    </div>
  );
}

/* ================================================================== *
 * Row scaffold + cards.
 * ================================================================== */

type RowProps = { keyLabel: string; title: string; epic: string; epicTone: string; children: React.ReactNode };

function MiniRow({ keyLabel, title, epic, epicTone, children }: RowProps) {
  return (
    <div className="group/row flex h-12 items-center gap-3 border-b border-border-subtle px-4 transition-colors duration-100 last:border-b-0 hover:bg-overlay-subtle">
      <SquareCheckBig size={15} strokeWidth={1.8} className="shrink-0 text-text-muted" />
      <span className="shrink-0 font-mono text-[11px] text-text-muted">{keyLabel}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-text-secondary">{title}</span>
      <span
        className="hidden shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium sm:inline-flex"
        style={{ color: epicTone, background: `color-mix(in srgb, ${epicTone} 14%, transparent)` }}
      >
        {epic}
      </span>
      <div className="ml-1 flex shrink-0 items-center justify-end" style={{ minWidth: 96 }}>
        {children}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-[var(--color-surface-floating)] ring-1 ring-border-default">{children}</div>
  );
}

function FlowHeader({
  tag,
  title,
  blurb,
}: {
  tag: string;
  title: string;
  blurb: React.ReactNode;
}) {
  return (
    <div className="border-b border-border-subtle px-5 py-4">
      <div className="mb-1.5 flex items-baseline gap-2.5">
        <span className="rounded-md bg-[color-mix(in_srgb,var(--color-brand-500)_14%,transparent)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-brand-400)]">
          {tag}
        </span>
        <h3 className="font-display text-[16px] font-semibold tracking-[-0.01em] text-text-primary">{title}</h3>
      </div>
      <p className="max-w-xl text-[12.5px] leading-[1.6] text-text-tertiary">{blurb}</p>
    </div>
  );
}

const EPIC_A = "#c026a3";
const EPIC_B = "#0ea5b7";

/* ================================================================== *
 * Page.
 * ================================================================== */

export default function EstimateEntryExplorationPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
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
            /dev/exploration/estimate-entry
          </p>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.03em] text-text-primary">
            Setting SP &amp; the guestimate
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            Three flows for entering an estimate from a board row, each built to stop an unscored row from showing{" "}
            <strong className="text-text-secondary">two near-identical &ldquo;#&rdquo; badges</strong> on hover. Hover the
            rows, click the chips. Toggle light/dark to check both themes.
          </p>
          <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--color-status-done)_12%,transparent)] px-3 py-2 text-[12px] leading-[1.5] text-text-secondary ring-1 ring-[color-mix(in_srgb,var(--color-status-done)_30%,transparent)]">
            <span className="font-semibold text-[var(--color-status-done)]">Shipped</span>
            <span>
              <strong className="text-text-secondary">Flow B (Pencil to ink)</strong> is now live on the real Sprint Board as
              the unified <strong className="text-text-secondary">EstimatePicker</strong> (BRDG-323): one chip replaces the SP
              and guess badges, and the guess is kept after commit so &ldquo;back to guestimate&rdquo; works. This page is kept
              as reference.
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
            Hovering an unscored row reveals both an SP ghost and a separate guess ghost. Two competing &ldquo;#&rdquo;
            affordances, plus a tooltip — it&apos;s unclear which one to click.
          </p>
          <Card>
            <MiniRow keyLabel="VPL-4821" title="BT: Rooms (availability)" epic="Booking" epicTone={EPIC_A}>
              <TodayBadges />
            </MiniRow>
          </Card>
        </section>

        {/* ===== FLOW A ===== */}
        <section className="mb-12">
          <Card>
            <FlowHeader
              tag="A"
              title="One entry point"
              blurb={
                <>
                  A single chip. One popover holds a guess section and an SP section. The story-point value supersedes the
                  guess in the row, so <strong className="text-text-secondary">only one chip is ever shown</strong>. Calmest:
                  the guess/SP split is hidden inside the popover.
                </>
              }
            />
            <div>
              <MiniRow keyLabel="VPL-5001" title="Guest checkout — address validation" epic="Booking" epicTone={EPIC_A}>
                <FlowA />
              </MiniRow>
              <MiniRow keyLabel="VPL-5002" title="Rate plan caching layer" epic="Platform" epicTone={EPIC_B}>
                <FlowA initGuess={3} />
              </MiniRow>
              <MiniRow keyLabel="VPL-5003" title="Cancellation policy engine" epic="Booking" epicTone={EPIC_A}>
                <FlowA initSp={5} />
              </MiniRow>
              <MiniRow keyLabel="VPL-5004" title="Search ranking experiment" epic="Platform" epicTone={EPIC_B}>
                <FlowA initSp={8} initGuess={5} />
              </MiniRow>
            </div>
          </Card>
        </section>

        {/* ===== FLOW B ===== */}
        <section className="mb-12">
          <Card>
            <FlowHeader
              tag="B"
              title="Pencil to ink"
              blurb={
                <>
                  One chip that graduates through its lifecycle: empty → a{" "}
                  <span style={{ color: SLATE_FG }}>dashed guess</span> → a{" "}
                  <span style={{ color: SLATE_FG }}>solid SP</span> via a quiet{" "}
                  <strong className="text-text-secondary">Commit</strong> action (dashed outline, not a loud button). The guess
                  is remembered (&ldquo;was 3&rdquo;). The <strong className="text-text-secondary">#</strong> button (same as the
                  real picker) types any value past the Fibonacci presets — 13, 21, 34…
                </>
              }
            />
            <div>
              <MiniRow keyLabel="VPL-5101" title="Loyalty points accrual" epic="Booking" epicTone={EPIC_A}>
                <FlowB />
              </MiniRow>
              <MiniRow keyLabel="VPL-5102" title="Multi-currency display" epic="Platform" epicTone={EPIC_B}>
                <FlowB initGuess={5} />
              </MiniRow>
              <MiniRow keyLabel="VPL-5103" title="Refund webhook retries" epic="Platform" epicTone={EPIC_B}>
                <FlowB initSp={3} initGuess={2} />
              </MiniRow>
              <MiniRow keyLabel="VPL-5104" title="Legacy PMS data migration" epic="Platform" epicTone={EPIC_B}>
                <FlowB initSp={21} initGuess={13} />
              </MiniRow>
            </div>
          </Card>
        </section>

        {/* ===== FLOW C ===== */}
        <section className="mb-16">
          <Card>
            <FlowHeader
              tag="C"
              title="Twin track"
              blurb={
                <>
                  Both values live in <strong className="text-text-secondary">one bordered pill</strong> — guess{" "}
                  <ArrowRight size={11} strokeWidth={2} className="inline align-[-1px] text-text-muted" /> SP — so they read as a
                  single unit and the PO can compare them at a glance. Click either side to edit it. Never two free-floating
                  badges.
                </>
              }
            />
            <div>
              <MiniRow keyLabel="VPL-5201" title="Promo code stacking rules" epic="Booking" epicTone={EPIC_A}>
                <FlowC />
              </MiniRow>
              <MiniRow keyLabel="VPL-5202" title="Inventory sync backpressure" epic="Platform" epicTone={EPIC_B}>
                <FlowC initGuess={5} />
              </MiniRow>
              <MiniRow keyLabel="VPL-5203" title="Guest review moderation" epic="Booking" epicTone={EPIC_A}>
                <FlowC initSp={3} />
              </MiniRow>
              <MiniRow keyLabel="VPL-5204" title="Pricing rule audit log" epic="Platform" epicTone={EPIC_B}>
                <FlowC initSp={8} initGuess={5} />
              </MiniRow>
            </div>
          </Card>
        </section>

        <footer className="flex items-center gap-2 border-t border-border-subtle pt-5 text-[12px] text-text-tertiary">
          <Check size={14} strokeWidth={2} className="text-[var(--color-brand-400)]" />
          All three flows show at most one affordance per row on hover. Flow B was chosen and shipped (BRDG-323).
        </footer>
      </div>
    </div>
  );
}
