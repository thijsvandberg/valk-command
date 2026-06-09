"use client";

/**
 * TEMPORARY exploration page for the bento-launcher button (the collapsed
 * bottom-left grid button that opens the sidebar panel, shipped in BRDG-317).
 * The current treatment reads a bit plain/app-icon-like; these variants try
 * treatments that sit better within the editorial brand styling.
 * Reach it at /dev/exploration/launcher. Pick one and I'll wire it into Sidebar.tsx.
 */

import Link from "next/link";
import { LayoutGrid, ArrowLeft } from "lucide-react";

const GLYPH = "h-[18px] w-[18px]";

type Variant = {
  id: string;
  name: string;
  note: string;
  /** The variant that was chosen and shipped into the real launcher. */
  chosen?: boolean;
  /** Rendered button. Kept at the real 44px size unless the variant is about size. */
  el: React.ReactNode;
};

const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]";
const motion =
  "transition-[transform,box-shadow,background-color,color] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:scale-95";

const VARIANTS: Variant[] = [
  {
    id: "current",
    name: "Current",
    note: "Glass squircle, hairline ring, brand icon. The baseline you have now.",
    el: (
      <button
        aria-label="Open navigation"
        className={`grid h-11 w-11 cursor-pointer place-items-center rounded-2xl bg-[var(--color-surface-floating)]/90 text-[var(--color-brand-300)] shadow-[0_10px_30px_-6px_rgba(0,0,0,0.6),0_0_0_1px_var(--color-border-strong)] ring-1 ring-border-strong backdrop-blur-xl hover:scale-[1.06] hover:text-[var(--color-brand-200)] ${motion} ${focus}`}
      >
        <LayoutGrid className={GLYPH} strokeWidth={1.75} />
      </button>
    ),
  },
  {
    id: "brand-gradient",
    name: "Brand gradient",
    chosen: true,
    note: "Solid brand fill with a soft glow. Echoes the Sprint Board hero tile inside the panel; reads as the primary action.",
    el: (
      <button
        aria-label="Open navigation"
        className={`grid h-11 w-11 cursor-pointer place-items-center rounded-2xl bg-gradient-to-br from-[var(--color-brand-400)] to-[var(--color-brand-600)] text-white shadow-[0_10px_30px_-6px_var(--color-brand-glow),0_0_0_1px_rgba(255,255,255,0.08)] hover:scale-[1.06] ${motion} ${focus}`}
      >
        <LayoutGrid className={GLYPH} strokeWidth={1.75} />
      </button>
    ),
  },
  {
    id: "tonal",
    name: "Tonal brand",
    note: "Translucent brand tint, no heavy shadow. Quiet and on-brand; sits lightly over the board.",
    el: (
      <button
        aria-label="Open navigation"
        className={`grid h-11 w-11 cursor-pointer place-items-center rounded-2xl bg-[var(--color-brand-600)]/15 text-[var(--color-brand-300)] ring-1 ring-[var(--color-brand-600)]/30 backdrop-blur-xl hover:bg-[var(--color-brand-600)]/25 hover:text-[var(--color-brand-200)] hover:scale-[1.06] ${motion} ${focus}`}
      >
        <LayoutGrid className={GLYPH} strokeWidth={1.75} />
      </button>
    ),
  },
  {
    id: "circle",
    name: "Circle glass",
    note: "Round instead of squircle, so it doesn't echo an app-icon. Glass surface, hairline ring.",
    el: (
      <button
        aria-label="Open navigation"
        className={`grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-[var(--color-surface-floating)]/80 text-[var(--color-brand-300)] shadow-[0_10px_30px_-6px_rgba(0,0,0,0.5)] ring-1 ring-border-strong backdrop-blur-xl hover:scale-[1.06] hover:text-[var(--color-brand-200)] ${motion} ${focus}`}
      >
        <LayoutGrid className={GLYPH} strokeWidth={1.75} />
      </button>
    ),
  },
  {
    id: "pill",
    name: "Pill + sprint key",
    note: "Reads as a launcher, not an icon: grid glyph plus the active sprint key in mono. Wider footprint.",
    el: (
      <button
        aria-label="Open navigation"
        className={`flex h-11 cursor-pointer items-center gap-2 rounded-full bg-[var(--color-surface-floating)]/90 px-3.5 text-text-secondary shadow-[0_10px_30px_-6px_rgba(0,0,0,0.5)] ring-1 ring-border-strong backdrop-blur-xl hover:scale-[1.03] hover:text-text-primary ${motion} ${focus}`}
      >
        <LayoutGrid className="h-[17px] w-[17px] text-[var(--color-brand-300)]" strokeWidth={1.75} />
        <span className="font-mono text-[11px] tracking-tight">BT: 139</span>
      </button>
    ),
  },
  {
    id: "ghost",
    name: "Outline ghost",
    note: "Transparent, hairline border only, muted glyph that warms to brand on hover. Most restrained.",
    el: (
      <button
        aria-label="Open navigation"
        className={`grid h-11 w-11 cursor-pointer place-items-center rounded-2xl bg-transparent text-text-tertiary ring-1 ring-border-default hover:bg-[var(--color-surface-floating)]/70 hover:text-[var(--color-brand-300)] hover:ring-border-strong hover:scale-[1.06] ${motion} ${focus}`}
      >
        <LayoutGrid className={GLYPH} strokeWidth={1.75} />
      </button>
    ),
  },
  {
    id: "dark-chip",
    name: "Elevated chip",
    note: "Solid elevated surface with a top inner-highlight seam. Feels physical/layered rather than floaty.",
    el: (
      <button
        aria-label="Open navigation"
        className={`relative grid h-11 w-11 cursor-pointer place-items-center overflow-hidden rounded-2xl bg-[var(--color-surface-elevated)] text-[var(--color-brand-300)] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)] ring-1 ring-border-default hover:scale-[1.06] hover:text-[var(--color-brand-200)] ${motion} ${focus}`}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
        <LayoutGrid className={GLYPH} strokeWidth={1.75} />
      </button>
    ),
  },
  {
    id: "brand-ring",
    name: "Glass + brand ring",
    note: "Keeps the glass surface but swaps the neutral ring for a brand-tinted one and a faint brand glow.",
    el: (
      <button
        aria-label="Open navigation"
        className={`grid h-11 w-11 cursor-pointer place-items-center rounded-2xl bg-[var(--color-surface-floating)]/90 text-[var(--color-brand-300)] shadow-[0_10px_30px_-8px_var(--color-brand-glow)] ring-1 ring-[var(--color-brand-500)]/40 backdrop-blur-xl hover:scale-[1.06] hover:ring-[var(--color-brand-400)]/60 hover:text-[var(--color-brand-200)] ${motion} ${focus}`}
      >
        <LayoutGrid className={GLYPH} strokeWidth={1.75} />
      </button>
    ),
  },
];

export default function LauncherExplorationPage() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-[920px]">
        <Link
          href="/dev/exploration"
          className="mb-6 inline-flex items-center gap-1.5 text-body-sm text-text-tertiary transition-colors hover:text-text-secondary cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          All explorations
        </Link>

        <header className="mb-8">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
            /dev/exploration/launcher
          </p>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
            Launcher button
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            The collapsed bottom-left button that opens the sidebar panel. Treatments to make it fit the
            editorial brand styling better than the current glass squircle. Hover each to feel its motion.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--color-status-done-subtle)] px-3 py-1.5 text-body-sm">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-status-done)]">Shipped</span>
            <span className="text-text-secondary">
              Chosen: <strong className="font-semibold text-text-primary">Brand gradient</strong>, and the
              launcher was made draggable corner-to-corner (BRDG-317).
            </span>
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {VARIANTS.map((v) => (
            <div
              key={v.id}
              className={`flex flex-col overflow-hidden rounded-2xl ring-1 ${
                v.chosen ? "ring-2 ring-[var(--color-status-done)]/60" : "ring-border-subtle"
              }`}
            >
              {/* Faux board surface so the button is judged in context */}
              <div className="relative grid h-36 place-items-center bg-gradient-to-br from-[var(--color-surface-elevated)] to-[var(--color-surface-chrome)]">
                <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(120%_120%_at_15%_85%,var(--color-brand-500)/8,transparent_60%)]" />
                {v.chosen && (
                  <span className="absolute right-2.5 top-2.5 rounded-full bg-[var(--color-status-done-subtle)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-status-done)]">
                    Shipped
                  </span>
                )}
                {v.el}
              </div>
              <div className="border-t border-border-subtle bg-[var(--color-surface-floating)] px-4 py-3">
                <p className="text-body-sm font-medium text-text-primary">{v.name}</p>
                <p className="mt-0.5 text-[12px] leading-[1.5] text-text-tertiary">{v.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
