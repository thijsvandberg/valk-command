/**
 * Throwaway exploration: 10 new logomark (beeldmerk) proposals for "Bridge".
 * Each concept attacks the name from a different angle (architecture, command
 * deck, network, typography, data). A subset also shows a wordmark lockup.
 * Reachable at /dev/exploration/logo; not linked from app nav.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/* ------------------------------------------------------------------ marks -- */
/* All marks share a 32x32 grid, round caps/joins, 2px structural stroke.
   Stroke uses currentColor; fills are explicit so they invert cleanly on the
   teal tile and on light/dark chips. */

type MarkProps = { className?: string };

function MarkSpanArch({ className }: MarkProps) {
  // Classic span: deck line, semicircular arch, hangers. Architectural.
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 23h24" stroke="currentColor" strokeWidth="2" />
      <path d="M7 23a9 9 0 0 1 18 0" stroke="currentColor" strokeWidth="2" />
      <path d="M11 23v-7.4M16 23v-9M21 23v-7.4" stroke="currentColor" strokeWidth="1.6" opacity="0.85" />
    </svg>
  );
}

function MarkCommandDeck({ className }: MarkProps) {
  // The bridge of a ship / command viewport: porthole ring, horizon, heading mark.
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="16" cy="17" r="10.5" stroke="currentColor" strokeWidth="2" />
      <path d="M7 19h18" stroke="currentColor" strokeWidth="1.6" opacity="0.85" />
      <path d="M13.4 7.6 16 4l2.6 3.6" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="17" r="1.7" fill="currentColor" />
    </svg>
  );
}

function MarkSuspension({ className }: MarkProps) {
  // Suspension engineering: two towers, draped main cable, hangers.
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 24h24" stroke="currentColor" strokeWidth="2" />
      <path d="M10 24V7M22 24V7" stroke="currentColor" strokeWidth="2" />
      <path d="M4 21 10 7q6 13 12 0l6 14" stroke="currentColor" strokeWidth="1.7" opacity="0.9" />
    </svg>
  );
}

function MarkMonogramB({ className }: MarkProps) {
  // Typographic: a sturdy geometric B built from two stacked bowls.
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M10 5v22M10 5h7a5 5 0 0 1 0 10h-7M10 15h8a5.5 5.5 0 0 1 0 11h-8"
        stroke="currentColor"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function MarkLinkedNodes({ className }: MarkProps) {
  // Connection: two endpoints joined by a single spanning arch with an apex node.
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 23Q16 7 26 23" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="23" r="2.6" fill="currentColor" />
      <circle cx="26" cy="23" r="2.6" fill="currentColor" />
      <circle cx="16" cy="14.6" r="2.2" fill="currentColor" />
    </svg>
  );
}

function MarkKeystone({ className }: MarkProps) {
  // Structural detail: an arch framing the wedge keystone at its apex.
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 26V16a10 10 0 0 1 20 0v10" stroke="currentColor" strokeWidth="2" />
      <path d="M12.8 7.4 19.2 7.4 17.4 13.2 14.6 13.2Z" fill="currentColor" />
    </svg>
  );
}

function MarkPillarDeck({ className }: MarkProps) {
  // Industrial / minimal: a deck slab resting on pillars over waterlines.
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="12.5" width="22" height="3.4" rx="1.3" fill="currentColor" />
      <path d="M9 15.9v9M16 15.9v9M23 15.9v9" stroke="currentColor" strokeWidth="2" />
      <path d="M6.5 28h4M14 28h4M21.5 28h4" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
    </svg>
  );
}

function MarkInterchange({ className }: MarkProps) {
  // Flow / overpass: two roadways crossing in an interchange.
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 25C13 25 19 7 27 7" stroke="currentColor" strokeWidth="2" />
      <path d="M5 7C13 7 19 25 27 25" stroke="currentColor" strokeWidth="2" opacity="0.6" />
    </svg>
  );
}

function MarkDataSpan({ className }: MarkProps) {
  // Data / visibility: a bar series whose tops trace an arch above a baseline.
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} strokeLinecap="round" strokeLinejoin="round">
      <g fill="currentColor">
        <rect x="5" y="19" width="3" height="6" rx="1.3" />
        <rect x="10" y="14" width="3" height="11" rx="1.3" />
        <rect x="14.5" y="10.5" width="3" height="14.5" rx="1.3" />
        <rect x="19" y="14" width="3" height="11" rx="1.3" />
        <rect x="24" y="19" width="3" height="6" rx="1.3" />
      </g>
      <path d="M4 27h24" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
    </svg>
  );
}

function MarkRelay({ className }: MarkProps) {
  // Orchestration: a hub relaying across two endpoints via paired mini-spans.
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21Q10.5 11 16 21M16 21Q21.5 11 27 21" stroke="currentColor" strokeWidth="2" />
      <circle cx="5" cy="21" r="2.4" fill="currentColor" />
      <circle cx="27" cy="21" r="2.4" fill="currentColor" />
      <circle cx="16" cy="21" r="3.3" fill="currentColor" />
    </svg>
  );
}

/* ----------------------------------------------------------------- config -- */

type WordmarkKind = "display" | "mono" | "lowercase" | "light";

type Concept = {
  id: string;
  name: string;
  angle: string;
  Mark: (p: MarkProps) => React.ReactElement;
  wordmark?: WordmarkKind;
};

const CONCEPTS: Concept[] = [
  { id: "span-arch", name: "Span", angle: "Architecture — arch + deck + hangers", Mark: MarkSpanArch, wordmark: "display" },
  { id: "command-deck", name: "Helm", angle: "Command deck — viewport, horizon, heading", Mark: MarkCommandDeck },
  { id: "suspension", name: "Cable", angle: "Engineering — suspension towers + catenary", Mark: MarkSuspension },
  { id: "monogram-b", name: "Bowl", angle: "Typographic — geometric B monogram", Mark: MarkMonogramB, wordmark: "mono" },
  { id: "linked-nodes", name: "Link", angle: "Connection — two endpoints, one span", Mark: MarkLinkedNodes },
  { id: "keystone", name: "Keystone", angle: "Structure — arch framing the wedge stone", Mark: MarkKeystone },
  { id: "pillar-deck", name: "Deck", angle: "Industrial — slab on pillars over water", Mark: MarkPillarDeck, wordmark: "lowercase" },
  { id: "interchange", name: "Cross", angle: "Flow — two roadways crossing", Mark: MarkInterchange },
  { id: "data-span", name: "Signal", angle: "Data — bar series tracing an arch", Mark: MarkDataSpan, wordmark: "light" },
  { id: "relay", name: "Relay", angle: "Orchestration — hub bridging endpoints", Mark: MarkRelay },
];

/* --------------------------------------------------------------- wordmark -- */

function Wordmark({ kind, Mark }: { kind: WordmarkKind; Mark: (p: MarkProps) => React.ReactElement }) {
  const markChip = (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] text-white shadow-[0_6px_16px_-8px_var(--color-brand-glow)]"
      style={{ background: "linear-gradient(150deg,var(--color-brand-400),var(--color-brand-700))" }}
    >
      <Mark className="h-[22px] w-[22px]" />
    </span>
  );

  if (kind === "display") {
    return (
      <div className="flex items-center gap-2.5">
        {markChip}
        <span className="font-display text-[22px] font-semibold tracking-[-0.03em] text-text-primary">Bridge</span>
      </div>
    );
  }
  if (kind === "mono") {
    return (
      <div className="flex items-center gap-2.5">
        {markChip}
        <span className="font-mono text-[15px] font-medium uppercase tracking-[0.34em] text-text-primary">Bridge</span>
      </div>
    );
  }
  if (kind === "lowercase") {
    return (
      <div className="flex items-center gap-2.5">
        {markChip}
        <span className="font-display text-[22px] font-medium lowercase tracking-[-0.02em] text-text-secondary">bridge</span>
      </div>
    );
  }
  // light
  return (
    <div className="flex items-center gap-2.5">
      {markChip}
      <span className="flex items-baseline gap-1.5">
        <span className="font-display text-[22px] font-light tracking-[-0.02em] text-text-primary">Bridge</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-brand-300)]">command</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------- page -- */

export default function LogoExplorationPage() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-[1080px]">
        <Link
          href="/dev/exploration"
          className="mb-7 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted transition-colors hover:text-[var(--color-brand-300)] cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
          exploration
        </Link>

        <header className="mb-9">
          <p className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
            /dev/exploration/logo
            <span className="rounded-full bg-[var(--color-status-error-subtle)] px-2 py-0.5 font-semibold tracking-[0.1em] text-[var(--color-status-error)]">
              Declined
            </span>
          </p>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.03em] text-text-primary">
            Logomark explorations
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            Ten new beeldmerk directions for <span className="text-text-primary">Bridge</span>, each from a different
            angle on the name — architecture, command deck, network, typography, data. A subset shows a paired wordmark.
            Today&apos;s mark sits in the reference strip below for comparison.
          </p>
          <p className="mt-4 max-w-2xl rounded-xl bg-[var(--color-status-error-subtle)] px-4 py-3 text-body-sm leading-[1.6] text-text-secondary ring-1 ring-[var(--color-status-error)]/20">
            <span className="font-semibold text-text-primary">Declined.</span> Bridge stays wordmark-only — no beeldmerk.
            The brand carries through the <span className="font-mono">bridge_</span> wordmark and its teal underscore;
            these marks are kept here for reference only.
          </p>
        </header>

        {/* current mark reference strip */}
        <div className="mb-10 flex flex-wrap items-center gap-4 rounded-2xl bg-[var(--color-surface-floating)] p-4 ring-1 ring-border-default">
          <span
            className="grid h-12 w-12 place-items-center rounded-[15px] text-white"
            style={{ background: "linear-gradient(150deg,var(--color-brand-400),var(--color-brand-700))" }}
          >
            <CurrentMark className="h-6 w-6" />
          </span>
          <div>
            <p className="font-display text-[15px] font-semibold text-text-primary">Current — aperture</p>
            <p className="text-body-sm text-text-tertiary">Rounded square + four-point aperture. Reads as a camera/lens, not a bridge.</p>
          </div>
        </div>

        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONCEPTS.map((c, i) => {
            const Mark = c.Mark;
            return (
              <li
                key={c.id}
                className="logo-card group relative flex flex-col gap-4 overflow-hidden rounded-2xl bg-[var(--color-surface-floating)] p-5 ring-1 ring-border-default transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:shadow-[0_28px_64px_-28px_var(--color-brand-glow),0_0_0_1px_var(--color-border-strong)]"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-brand-400)]/30 to-transparent" />

                <div className="flex items-start justify-between">
                  <span className="font-mono text-[11px] tabular-nums text-text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">{c.id}</span>
                </div>

                {/* primary: teal tile + variants */}
                <div className="flex items-center gap-3.5">
                  <span
                    className="grid h-16 w-16 shrink-0 place-items-center rounded-[20px] text-white shadow-[0_14px_30px_-14px_var(--color-brand-glow),inset_0_1px_0_0_rgba(255,255,255,0.18)]"
                    style={{ background: "linear-gradient(150deg,var(--color-brand-400),var(--color-brand-700))" }}
                  >
                    <Mark className="h-8 w-8" />
                  </span>
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-overlay-default text-[var(--color-brand-300)]">
                      <Mark className="h-[26px] w-[26px]" />
                    </span>
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f4f8f8] text-[var(--color-brand-700)] ring-1 ring-black/5">
                      <Mark className="h-[26px] w-[26px]" />
                    </span>
                  </div>
                </div>

                {c.wordmark && (
                  <div className="rounded-xl bg-overlay-default px-3.5 py-3">
                    <Wordmark kind={c.wordmark} Mark={Mark} />
                  </div>
                )}

                <div className="mt-auto">
                  <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-text-primary">{c.name}</h2>
                  <p className="mt-0.5 text-body-sm leading-[1.55] text-text-tertiary">{c.angle}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <style>{`
        @keyframes logoCardIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .logo-card { animation: logoCardIn 0.5s cubic-bezier(0.22,1,0.36,1) backwards; }
        @media (prefers-reduced-motion: reduce) { .logo-card { animation: none; } }
      `}</style>
    </div>
  );
}

function CurrentMark({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="5" width="14" height="14" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="5" r="1.5" fill="currentColor" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" />
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" opacity="0.5" />
    </svg>
  );
}
