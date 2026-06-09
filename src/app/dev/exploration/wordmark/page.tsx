/**
 * Throwaway exploration: text-only logo (wordmark) directions for "Bridge".
 * No icon/beeldmerk — the character comes entirely from pronounced display
 * fonts and small typographic flourishes (two-tone, accent dot, cursor).
 * Each concept is shown large and in a faux header lockup matching the app
 * chrome (Bridge · BT: 139). Reachable at /dev/exploration/wordmark.
 */

import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import {
  Fraunces,
  Instrument_Serif,
  Syne,
  Unbounded,
  Bebas_Neue,
  Anton,
  Space_Mono,
  DM_Serif_Display,
  Big_Shoulders,
  Archivo,
  Sora,
  Geist_Mono,
  Martian_Mono,
  IBM_Plex_Mono,
  Major_Mono_Display,
  Gloock,
  Tektur,
  Zilla_Slab,
  Newsreader,
  Schibsted_Grotesk,
  Darker_Grotesque,
} from "next/font/google";

const fraunces = Fraunces({ subsets: ["latin"], weight: ["500", "600"], display: "swap" });
const instrument = Instrument_Serif({ subsets: ["latin"], weight: ["400"], style: ["normal", "italic"], display: "swap" });
const syne = Syne({ subsets: ["latin"], weight: ["700", "800"], display: "swap" });
const unbounded = Unbounded({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: ["400"], display: "swap" });
const anton = Anton({ subsets: ["latin"], weight: ["400"], display: "swap" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: ["400"], style: ["normal", "italic"], display: "swap" });
const bigShoulders = Big_Shoulders({ subsets: ["latin"], weight: ["700", "800"], display: "swap" });
const archivo = Archivo({ subsets: ["latin"], weight: ["800", "900"], display: "swap" });
const sora = Sora({ subsets: ["latin"], weight: ["300", "700"], display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], weight: ["500", "600"], display: "swap" });
const martianMono = Martian_Mono({ subsets: ["latin"], weight: ["500", "600"], display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], display: "swap" });
const majorMono = Major_Mono_Display({ subsets: ["latin"], weight: ["400"], display: "swap" });
const gloock = Gloock({ subsets: ["latin"], weight: ["400"], display: "swap" });
const tektur = Tektur({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });
const zillaSlab = Zilla_Slab({ subsets: ["latin"], weight: ["600", "700"], display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], weight: ["500"], style: ["italic", "normal"], display: "swap" });
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], weight: ["700", "800"], display: "swap" });
const darkerGrotesque = Darker_Grotesque({ subsets: ["latin"], weight: ["500", "700"], display: "swap" });

const ACCENT = "var(--color-brand-400)";

type Concept = {
  id: string;
  font: string;
  note: string;
  style: React.CSSProperties;
  node: React.ReactNode;
  chosen?: boolean;
};

const CONCEPTS: Concept[] = [
  {
    id: "fraunces",
    font: "Fraunces",
    note: "Editorial high-contrast serif. Warm, literary, with a teal full-stop.",
    style: { fontFamily: fraunces.style.fontFamily, fontWeight: 600, letterSpacing: "-0.03em" },
    node: (
      <>
        Bridge<span style={{ color: ACCENT }}>.</span>
      </>
    ),
  },
  {
    id: "instrument",
    font: "Instrument Serif",
    note: "Thin literary serif in italic. Quiet, refined, magazine-masthead.",
    style: { fontFamily: instrument.style.fontFamily, fontWeight: 400, fontStyle: "italic", letterSpacing: "-0.01em" },
    node: "Bridge",
  },
  {
    id: "syne",
    font: "Syne",
    note: "Extravagant grotesque, heavy + uppercase. A pure design statement.",
    style: { fontFamily: syne.style.fontFamily, fontWeight: 800, textTransform: "uppercase", letterSpacing: "-0.01em" },
    node: "Bridge",
  },
  {
    id: "unbounded",
    font: "Unbounded",
    note: "Rounded geometric display. Confident, a little playful, very current.",
    style: { fontFamily: unbounded.style.fontFamily, fontWeight: 700, letterSpacing: "-0.02em" },
    node: "Bridge",
  },
  {
    id: "bebas",
    font: "Bebas Neue",
    note: "Tall condensed caps, wide tracking. Calm, architectural marquee.",
    style: { fontFamily: bebas.style.fontFamily, fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.16em" },
    node: "Bridge",
  },
  {
    id: "anton",
    font: "Anton",
    note: "Heavy condensed poster, two-tone split. Loud and impossible to miss.",
    style: { fontFamily: anton.style.fontFamily, fontWeight: 400, textTransform: "uppercase", letterSpacing: "0.01em" },
    node: (
      <>
        Bri<span style={{ color: ACCENT }}>dge</span>
      </>
    ),
  },
  {
    id: "space-mono",
    font: "Space Mono",
    chosen: true,
    note: "Console monospace with a cursor. Speaks 'command center'. This is the one that shipped — live in the app header as bridge_.",
    style: { fontFamily: spaceMono.style.fontFamily, fontWeight: 700, letterSpacing: "-0.02em", textTransform: "lowercase" },
    node: (
      <>
        bridge<span style={{ color: ACCENT }}>_</span>
      </>
    ),
  },
  {
    id: "dm-serif",
    font: "DM Serif Display",
    note: "Sharp Didone serif. High-fashion contrast, decisive thicks and thins.",
    style: { fontFamily: dmSerif.style.fontFamily, fontWeight: 400, letterSpacing: "-0.01em" },
    node: "Bridge",
  },
  {
    id: "big-shoulders",
    font: "Big Shoulders",
    note: "Industrial condensed caps. Engineered, signage, utilitarian.",
    style: { fontFamily: bigShoulders.style.fontFamily, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em" },
    node: "Bridge",
  },
  {
    id: "archivo",
    font: "Archivo",
    note: "Ultra-bold grotesque, tight tracking. Modern, dense, no-nonsense.",
    style: { fontFamily: archivo.style.fontFamily, fontWeight: 900, letterSpacing: "-0.04em" },
    node: "Bridge",
  },
  {
    id: "sora",
    font: "Sora",
    note: "Geometric sans with a weight drop mid-word. Techy and tapered.",
    style: { fontFamily: sora.style.fontFamily, fontWeight: 700, letterSpacing: "-0.02em" },
    node: (
      <>
        Bri<span style={{ fontWeight: 300 }}>dge</span>
      </>
    ),
  },
  {
    id: "geist-mono",
    font: "Geist Mono",
    note: "Refined contemporary monospace with a block cursor. A cleaner alternative to Space Mono, but not the one we shipped.",
    style: { fontFamily: geistMono.style.fontFamily, fontWeight: 600, letterSpacing: "-0.03em", textTransform: "lowercase" },
    node: (
      <>
        bridge
        <span
          style={{ display: "inline-block", width: "0.5em", height: "0.92em", background: ACCENT, marginLeft: "0.08em", transform: "translateY(0.12em)", borderRadius: "1px" }}
        />
      </>
    ),
  },
  {
    id: "martian-mono",
    font: "Martian Mono",
    note: "Condensed monospace, uppercase. Telemetry / mission-control console.",
    style: { fontFamily: martianMono.style.fontFamily, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.02em" },
    node: "Bridge",
  },
  {
    id: "plex-mono",
    font: "IBM Plex Mono",
    note: "Enterprise technical mono with a shell prompt. Reads as a terminal.",
    style: { fontFamily: plexMono.style.fontFamily, fontWeight: 600, letterSpacing: "-0.02em", textTransform: "lowercase" },
    node: (
      <>
        <span style={{ color: ACCENT }}>$ </span>bridge
      </>
    ),
  },
  {
    id: "major-mono",
    font: "Major Mono Display",
    note: "All-lowercase monospaced display. Geometric and unmistakably designed.",
    style: { fontFamily: majorMono.style.fontFamily, fontWeight: 400, textTransform: "lowercase", letterSpacing: "0.02em" },
    node: "bridge",
  },
  {
    id: "gloock",
    font: "Gloock",
    note: "Dramatic high-contrast display serif. Editorial, premium, confident.",
    style: { fontFamily: gloock.style.fontFamily, fontWeight: 400, letterSpacing: "-0.01em" },
    node: "Bridge",
  },
  {
    id: "tektur",
    font: "Tektur",
    note: "Squared techno display, uppercase. Engineered and sci-fi adjacent.",
    style: { fontFamily: tektur.style.fontFamily, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.01em" },
    node: "Bridge",
  },
  {
    id: "zilla-slab",
    font: "Zilla Slab",
    note: "Slab serif with a teal full-stop. Sturdy, technical but warm.",
    style: { fontFamily: zillaSlab.style.fontFamily, fontWeight: 700, letterSpacing: "-0.02em" },
    node: (
      <>
        Bridge<span style={{ color: ACCENT }}>.</span>
      </>
    ),
  },
  {
    id: "newsreader",
    font: "Newsreader",
    note: "Literary editorial serif in italic. Calm, authored, masthead-like.",
    style: { fontFamily: newsreader.style.fontFamily, fontWeight: 500, fontStyle: "italic", letterSpacing: "-0.01em" },
    node: "Bridge",
  },
  {
    id: "schibsted",
    font: "Schibsted Grotesk",
    note: "Contemporary grotesk, ultra-bold and tight. Modern product brand.",
    style: { fontFamily: schibsted.style.fontFamily, fontWeight: 800, letterSpacing: "-0.03em" },
    node: "Bridge",
  },
  {
    id: "darker-grotesque",
    font: "Darker Grotesque",
    note: "Tall, airy condensed grotesque. Light and unexpected, lowercase.",
    style: { fontFamily: darkerGrotesque.style.fontFamily, fontWeight: 700, textTransform: "lowercase", letterSpacing: "0" },
    node: "bridge",
  },
  {
    id: "bricolage",
    font: "Bricolage (current)",
    note: "Today's display font for reference — the baseline to beat.",
    style: { fontFamily: "var(--font-bricolage, 'Bricolage Grotesque'), Georgia, sans-serif", fontWeight: 600, letterSpacing: "-0.03em" },
    node: "Bridge",
  },
];

/* Renders the wordmark; parent controls font-size and base color, the concept
   supplies family/weight/case and any accented spans. */
function Word({ concept }: { concept: Concept }) {
  return (
    <span style={{ ...concept.style, lineHeight: 1, display: "inline-block" }}>{concept.node}</span>
  );
}

/* Faux app header bar (light chrome) mirroring the screenshot, so each wordmark
   can be judged at real size beside the BT counter. */
function HeaderLockup({ concept }: { concept: Concept }) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl bg-[#eef4f3] px-4 py-3 ring-1 ring-black/[0.06]">
      <span className="text-[22px] text-[#0b1316]">
        <Word concept={concept} />
      </span>
      <span className="h-5 w-px bg-black/10" />
      <CalendarDays className="h-4 w-4 text-[#5b6b6a]" strokeWidth={1.75} />
      <span className="font-display text-[18px] font-semibold tracking-[-0.01em] text-[#0b1316]">BT: 139</span>
      <span className="h-2 w-2 rounded-full" style={{ background: "#34d399" }} />
    </div>
  );
}

export default function WordmarkExplorationPage() {
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
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-brand-400)]">
            /dev/exploration/wordmark
          </p>
          <h1 className="font-display text-[30px] font-semibold tracking-[-0.03em] text-text-primary">
            Text-only logo
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            Dropping the icon entirely — the logo is just the word, carried by a pronounced display font.
            Each concept is shown large on dark, then in the real header lockup (light chrome, beside BT: 139)
            so you can judge it where it actually lives.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {CONCEPTS.map((c, i) => (
            <div
              key={c.id}
              className={`wm-card relative flex flex-col gap-5 overflow-hidden rounded-2xl bg-[var(--color-surface-floating)] p-6 transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:shadow-[0_28px_64px_-28px_var(--color-brand-glow),0_0_0_1px_var(--color-border-strong)] ${
                c.chosen ? "ring-2 ring-[var(--color-brand-400)]" : "ring-1 ring-border-default"
              }`}
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-brand-400)]/30 to-transparent" />

              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] tabular-nums text-text-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex items-center gap-2">
                  {c.chosen && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-brand-400)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-surface-base)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      Shipped
                    </span>
                  )}
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">{c.font}</span>
                </span>
              </div>

              {/* large display */}
              <div className="flex min-h-[88px] items-center text-[clamp(40px,6vw,60px)] text-text-primary">
                <Word concept={c} />
              </div>

              {/* in-context header lockup */}
              <HeaderLockup concept={c} />

              <p className="text-body-sm leading-[1.55] text-text-tertiary">{c.note}</p>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes wmCardIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .wm-card { animation: wmCardIn 0.5s cubic-bezier(0.22,1,0.36,1) backwards; }
        @media (prefers-reduced-motion: reduce) { .wm-card { animation: none; } }
      `}</style>
    </div>
  );
}
