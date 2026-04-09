"use client";

/* ------------------------------------------------------------------ */
/*  10 logo marks + wordmark combos for "Bridge"                       */
/* ------------------------------------------------------------------ */

const brand600 = "#155a9e";
const brand400 = "#3389d8";
const surfaceBase = "#070b12";
const surfaceElevated = "#0c1219";
const textMuted = "rgba(140,180,225,0.26)";

/* SVG icon components */

function Mark1() {
  // Minimal arch: single clean arc with two pillars
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M4 17V11C4 6.58 7.58 3 12 3C16.42 3 20 6.58 20 11V17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="4" y1="17" x2="4" y2="21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="20" y1="17" x2="20" y2="21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function Mark2() {
  // Abstract H-bridge: two verticals connected by a horizontal span
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="5" width="3" height="14" rx="1.5" fill="currentColor" />
      <rect x="17" y="5" width="3" height="14" rx="1.5" fill="currentColor" />
      <rect x="7" y="10" width="10" height="3" rx="1" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function Mark3() {
  // Cable-stayed bridge: V-shaped cables from center tower
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <line x1="2" y1="16" x2="22" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="4" x2="12" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="6" x2="4" y2="16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      <line x1="12" y1="6" x2="20" y2="16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      <line x1="12" y1="9" x2="7" y2="16" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
      <line x1="12" y1="9" x2="17" y2="16" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

function Mark4() {
  // Rounded gateway: smooth arch doorway shape
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M5 20V8C5 5.24 8.13 3 12 3C15.87 3 19 5.24 19 8V20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="3" y1="20" x2="21" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Mark5() {
  // Double arch: two overlapping arches (like a real bridge with multiple spans)
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M2 18C2 18 5.5 10 9 10C12.5 10 12.5 10 12.5 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M11.5 10C11.5 10 11.5 10 15 10C18.5 10 22 18 22 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="2" y1="18" x2="22" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="5" y1="14" x2="5" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="12" y1="10" x2="12" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <line x1="19" y1="14" x2="19" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function Mark6() {
  // Geometric B: the letter B abstracted into a bridge-like form
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M6 4H14C16.76 4 19 6.24 19 9C19 10.5 18.3 11.8 17.2 12.6C18.8 13.4 20 15.1 20 17C20 19.76 17.76 22 15 22H6V4Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <line x1="6" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Mark7() {
  // Compass/navigation: bridge as connection point
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 16L10.5 10.5L16 8L13.5 13.5L8 16Z" fill="currentColor" opacity="0.8" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function Mark8() {
  // Horizon line with arc: sunrise/bridge hybrid
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 16C3 16 7 7 12 7C17 7 21 16 21 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="1" y1="16" x2="23" y2="16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7" r="1.5" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

function Mark9() {
  // Abstract connection: two nodes with a bridge span
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="5" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <circle cx="19" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M8 12C10 8 14 8 16 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function Mark10() {
  // Tower bridge: two towers with suspension span
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="6" width="3" height="14" rx="0.5" fill="currentColor" opacity="0.85" />
      <rect x="16" y="6" width="3" height="14" rx="0.5" fill="currentColor" opacity="0.85" />
      <path d="M6.5 8C6.5 8 9 5 12 5C15 5 17.5 8 17.5 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="2" y1="14" x2="22" y2="14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="5" y1="6" x2="3" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
      <line x1="19" y1="6" x2="21" y2="4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

const marks = [
  { id: 1, Icon: Mark1, name: "Minimal Arch", desc: "Clean single arc, two pillars. Architectural, restrained." },
  { id: 2, Icon: Mark2, name: "H-Span", desc: "Abstract H-shape. Two pillars, one span. Bold, geometric." },
  { id: 3, Icon: Mark3, name: "Cable-Stayed", desc: "Central tower with radiating cables. Modern, technical." },
  { id: 4, Icon: Mark4, name: "Gateway", desc: "Smooth arch doorway. Welcoming, monumental." },
  { id: 5, Icon: Mark5, name: "Double Span", desc: "Two arches, three pillars. Classic multi-span bridge." },
  { id: 6, Icon: Mark6, name: "Bridge-B", desc: "Letter B shaped as bridge form. Typographic, clever." },
  { id: 7, Icon: Mark7, name: "Compass", desc: "Navigation compass. Direction, command, wayfinding." },
  { id: 8, Icon: Mark8, name: "Horizon Arc", desc: "Sunrise arc over horizon line. Expansive, forward-looking." },
  { id: 9, Icon: Mark9, name: "Connection", desc: "Two nodes linked by span + arc. Connecting systems." },
  { id: 10, Icon: Mark10, name: "Tower Bridge", desc: "Twin towers with suspension. Structural, iconic." },
];

const fonts = [
  { family: "var(--font-display)", weight: 700, tracking: "-0.03em", size: "20px", label: "Bricolage Bold" },
  { family: "var(--font-display)", weight: 600, tracking: "-0.02em", size: "19px", label: "Bricolage Semi" },
  { family: "var(--font-body)", weight: 600, tracking: "-0.01em", size: "18px", label: "Inter Semi" },
  { family: "var(--font-body)", weight: 500, tracking: "0.04em", size: "14px", label: "Inter Medium Spaced", transform: "uppercase" as const },
  { family: "Georgia, serif", weight: 400, tracking: "0em", size: "20px", label: "Georgia Regular", style: "italic" as const },
  { family: "var(--font-display)", weight: 800, tracking: "-0.04em", size: "21px", label: "Bricolage Extra Bold" },
  { family: "'Courier New', monospace", weight: 700, tracking: "0.02em", size: "17px", label: "Mono Bold" },
  { family: "var(--font-body)", weight: 300, tracking: "0.06em", size: "15px", label: "Inter Light Spaced", transform: "uppercase" as const },
  { family: "Georgia, serif", weight: 700, tracking: "-0.01em", size: "20px", label: "Georgia Bold" },
  { family: "var(--font-display)", weight: 500, tracking: "0.01em", size: "17px", label: "Bricolage Medium" },
];

export function LogoExplorer() {
  return (
    <div className="noise-overlay relative min-h-full" style={{ background: surfaceBase }}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute top-[-15%] left-[20%] h-[500px] w-[500px] rounded-full opacity-40" style={{ background: `radial-gradient(circle, rgba(26,111,194,0.12) 0%, transparent 70%)` }} />
      </div>

      <div className="relative z-10 px-8 py-8 lg:px-12 lg:py-10 max-w-[1200px] mx-auto">
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: brand400 }}>
          Bridge Identity
        </p>
        <h1
          className="text-3xl font-bold tracking-[-0.03em]"
          style={{ color: "rgba(230,240,255,0.94)", fontFamily: "var(--font-display)" }}
        >
          Logo Explorer
        </h1>
        <p className="mt-1.5 text-sm leading-[1.7] max-w-2xl" style={{ color: "rgba(160,195,235,0.52)" }}>
          10 beeldmerk + wordmark combinations. Each row shows the icon at app size (in the blue square),
          the icon standalone, and the full logo lockup with different typography.
        </p>

        {/* Logo grid */}
        <div className="mt-8 flex flex-col gap-4">
          {marks.map((m, i) => {
            const font = fonts[i];
            return (
              <div
                key={m.id}
                className="flex items-center gap-6 rounded-2xl px-6 py-5 border transition-colors"
                style={{
                  background: surfaceElevated,
                  borderColor: "rgba(255,255,255,0.06)",
                }}
              >
                {/* Number */}
                <span className="text-[13px] font-bold tabular-nums shrink-0 w-6 text-right" style={{ color: textMuted }}>
                  {m.id}
                </span>

                {/* Icon in branded square (app size) */}
                <div
                  className="flex items-center justify-center h-10 w-10 rounded-xl shrink-0 text-white"
                  style={{ background: brand600, boxShadow: `0 2px 14px rgba(26,111,194,0.35), inset 0 1px 0 rgba(255,255,255,0.12)` }}
                >
                  <m.Icon />
                </div>

                {/* Divider */}
                <div className="h-8 w-px shrink-0" style={{ background: "rgba(255,255,255,0.06)" }} />

                {/* Full logo lockup */}
                <div className="flex items-center gap-3 min-w-[220px]" style={{ color: "rgba(230,240,255,0.94)" }}>
                  <m.Icon />
                  <span
                    style={{
                      fontFamily: font.family,
                      fontWeight: font.weight,
                      letterSpacing: font.tracking,
                      fontSize: font.size,
                      textTransform: font.transform,
                      fontStyle: font.style,
                    }}
                  >
                    Bridge
                  </span>
                </div>

                {/* Divider */}
                <div className="h-8 w-px shrink-0" style={{ background: "rgba(255,255,255,0.06)" }} />

                {/* Description */}
                <div className="flex-1 min-w-0">
                  <span className="text-[12px] font-semibold block" style={{ color: "rgba(230,240,255,0.80)" }}>
                    {m.name}
                  </span>
                  <span className="text-[11px] block mt-0.5" style={{ color: "rgba(160,195,235,0.40)" }}>
                    {m.desc}
                  </span>
                  <span className="text-[9px] uppercase tracking-widest mt-1 block" style={{ color: textMuted }}>
                    {font.label}
                  </span>
                </div>

                {/* Dark background preview (how it looks in sidebar) */}
                <div
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg shrink-0"
                  style={{ background: "#090e16" }}
                >
                  <div
                    className="flex items-center justify-center h-8 w-8 rounded-lg text-white"
                    style={{ background: brand600, boxShadow: `0 2px 10px rgba(26,111,194,0.35), inset 0 1px 0 rgba(255,255,255,0.12)` }}
                  >
                    <m.Icon />
                  </div>
                  <span
                    className="text-[14px]"
                    style={{
                      fontFamily: font.family,
                      fontWeight: font.weight,
                      letterSpacing: font.tracking,
                      color: "rgba(230,240,255,0.90)",
                      textTransform: font.transform,
                      fontStyle: font.style,
                    }}
                  >
                    Bridge
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
