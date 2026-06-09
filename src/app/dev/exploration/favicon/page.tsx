"use client";

/**
 * Throwaway exploration: favicon directions for Bridge.
 *
 * The current favicon.ico/logo.svg still use the aperture "BridgeMark" beeldmerk,
 * which was rejected as the brand. These five options instead derive from the
 * real brand: the `bridge_` wordmark (Space Mono, teal cursor). At 16px a wordmark
 * is unreadable, so each option distills it to its smallest legible signature —
 * the mono "b" and/or the teal underscore caret. No aperture/lens mark.
 *
 * Each option is shown large, at real favicon sizes (16/32/48/64), and inside a
 * faux browser tab on light and dark chrome. Reachable at /dev/exploration/favicon.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Space_Mono } from "next/font/google";

const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], display: "swap" });
const MONO = spaceMono.style.fontFamily;

// Brand teal scale (from globals.css), hard-coded so the SVGs are accurate even
// outside the app's CSS-variable scope — favicon files can't read CSS vars.
const T = {
  b200: "#6dd4d1",
  b300: "#3bbfbe",
  b400: "#14a8a3",
  b500: "#0e8e88",
  b600: "#0a736e",
  b700: "#075854",
  b950: "#021a19",
};

type Option = {
  id: string;
  title: string;
  note: string;
  /** Render the mark at a given pixel size. */
  render: (px: number) => React.ReactNode;
};

/** Shared rounded tile. rx scales with size to keep the corner radius proportional. */
function Tile({ fill, children }: { fill: string; children?: React.ReactNode }) {
  return (
    <>
      <rect width="32" height="32" rx="7" fill={fill} />
      {children}
    </>
  );
}

const OPTIONS: Option[] = [
  {
    id: "a",
    title: "Underscore b · light",
    note: "The wordmark distilled: a single mono b sitting on its teal cursor. Light tile reads as a document/brand chip.",
    render: (px) => (
      <svg width={px} height={px} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <Tile fill="#ffffff" />
        <rect x="0.5" y="0.5" width="31" height="31" rx="6.5" stroke="#000000" strokeOpacity="0.08" />
        <text x="16" y="21.5" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize="20" fill={T.b700}>
          b
        </text>
        <rect x="9" y="24.4" width="14" height="2.8" rx="1.4" fill={T.b400} />
      </svg>
    ),
  },
  {
    id: "f",
    title: "b _ lockup · wordmark",
    note: "Closest to the real bridge_ lockup: a mono b with the teal underscore trailing beside it on the baseline, not beneath. Reads as a cropped wordmark.",
    render: (px) => (
      <svg width={px} height={px} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <Tile fill="#ffffff" />
        <rect x="0.5" y="0.5" width="31" height="31" rx="6.5" stroke="#000000" strokeOpacity="0.08" />
        <text x="11" y="22" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize="19" fill={T.b700}>
          b
        </text>
        <rect x="17.5" y="21" width="9" height="2.8" rx="1.4" fill={T.b400} />
      </svg>
    ),
  },
  {
    id: "f-dark",
    title: "b _ lockup · dark",
    note: "Same wordmark crop on a dark console tile: white b, teal trailing underscore. Mirrors how bridge_ sits in the app's dark header.",
    render: (px) => (
      <svg width={px} height={px} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <Tile fill={T.b950} />
        <text x="11" y="22" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize="19" fill="#ffffff">
          b
        </text>
        <rect x="17.5" y="21" width="9" height="2.8" rx="1.4" fill={T.b300} />
      </svg>
    ),
  },
  {
    id: "b",
    title: "Knockout b · solid teal",
    note: "Maximum contrast for tiny tab strips: white b knocked out of a solid brand tile, trailing caret. The safest option to recognise at 16px against any browser theme.",
    render: (px) => (
      <svg width={px} height={px} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <Tile fill={T.b600} />
        <text x="14" y="21.5" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize="20" fill="#ffffff">
          b
        </text>
        <rect x="20" y="11" width="3.2" height="11" rx="1.4" fill={T.b200} />
      </svg>
    ),
  },
  {
    id: "c",
    title: "Prompt ›_ · console",
    note: "Leans into the command-center idea — a shell prompt chevron plus a cursor. No letter at all, so it stays crisp and abstract; pure 'Bridge is a console'.",
    render: (px) => (
      <svg width={px} height={px} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <Tile fill={T.b950} />
        <path d="M9 10.5 L15 16 L9 21.5" stroke={T.b300} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="17.5" y="19" width="7.5" height="2.8" rx="1.4" fill={T.b300} />
      </svg>
    ),
  },
  {
    id: "d",
    title: "Cursor only · minimal",
    note: "The most reductive: drop everything but the signature teal underscore on a graphite tile. A bet that the cursor alone is ownable. Strongest as a set with the wordmark.",
    render: (px) => (
      <svg width={px} height={px} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <Tile fill="#0f1514" />
        <rect x="8" y="19.5" width="16" height="3.4" rx="1.7" fill={T.b400} />
      </svg>
    ),
  },
  {
    id: "e",
    title: "Gradient b · premium",
    note: "Same b + cursor as A/B but on a layered teal gradient with an inner highlight for depth. Feels more like a product mark than a flat chip; best on app/PWA tiles.",
    render: (px) => (
      <svg width={px} height={px} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="favGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor={T.b400} />
            <stop offset="1" stopColor={T.b700} />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="7" fill="url(#favGrad)" />
        <rect x="1" y="1" width="30" height="30" rx="6" stroke="#ffffff" strokeOpacity="0.18" />
        <text x="14" y="21.5" textAnchor="middle" fontFamily={MONO} fontWeight={700} fontSize="20" fill="#ffffff">
          b
        </text>
        <rect x="20" y="11" width="3.2" height="11" rx="1.4" fill="#ffffff" />
      </svg>
    ),
  },
];

const REAL_SIZES = [16, 32, 48, 64];

export default function FaviconExplorationPage() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-base)] px-6 py-10 lg:px-10">
      <div className="mx-auto max-w-[920px]">
        <header className="mb-8">
          <Link
            href="/dev/exploration"
            className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-text-tertiary transition-colors hover:text-text-primary cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            exploration
          </Link>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.03em] text-text-primary">
            Favicon directions
          </h1>
          <p className="mt-2 max-w-2xl text-body-lg leading-[1.7] text-text-secondary">
            Five favicons built from the <span className={`${spaceMono.className} text-[var(--color-brand-300)]`}>bridge_</span> wordmark
            rather than the rejected aperture mark. Each distils the brand to what survives at 16px: the mono{" "}
            <span className={spaceMono.className}>b</span> and the teal underscore caret. Each is shown large, at real
            favicon sizes, and in a browser tab on light and dark chrome.
          </p>
        </header>

        <ul className="grid gap-5 sm:grid-cols-2">
          {OPTIONS.map((opt) => (
            <li
              key={opt.id}
              className="flex flex-col gap-5 overflow-hidden rounded-2xl bg-[var(--color-surface-floating)] p-5 ring-1 ring-border-default"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-brand-300)]">
                      {opt.id}
                    </span>
                    <h2 className="font-display text-[16px] font-semibold tracking-[-0.01em] text-text-primary">
                      {opt.title}
                    </h2>
                  </div>
                  <p className="mt-1.5 text-body-sm leading-[1.6] text-text-tertiary">{opt.note}</p>
                </div>
              </div>

              {/* Large preview on light + dark */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid place-items-center rounded-xl bg-[#f4f5f5] py-6 ring-1 ring-black/5">
                  {opt.render(96)}
                </div>
                <div className="grid place-items-center rounded-xl bg-[#0c1110] py-6 ring-1 ring-white/5">
                  {opt.render(96)}
                </div>
              </div>

              {/* Real favicon sizes */}
              <div className="flex items-end gap-5 rounded-xl bg-overlay-default px-4 py-3">
                {REAL_SIZES.map((s) => (
                  <div key={s} className="flex flex-col items-center gap-1.5">
                    {opt.render(s)}
                    <span className="font-mono text-[9px] tracking-[0.1em] text-text-muted">{s}px</span>
                  </div>
                ))}
              </div>

              {/* Faux browser tabs */}
              <div className="space-y-2">
                {(["light", "dark"] as const).map((mode) => {
                  const light = mode === "light";
                  return (
                    <div
                      key={mode}
                      className="flex w-fit items-center gap-2 rounded-t-lg px-3 py-1.5 ring-1"
                      style={{
                        background: light ? "#ffffff" : "#1f2424",
                        boxShadow: light ? "inset 0 0 0 1px rgba(0,0,0,0.06)" : "inset 0 0 0 1px rgba(255,255,255,0.06)",
                      }}
                    >
                      {opt.render(16)}
                      <span
                        className="text-[12px]"
                        style={{ color: light ? "#1a1f1f" : "#e8eced", fontFamily: MONO }}
                      >
                        Bridge · Sprint Board
                      </span>
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
