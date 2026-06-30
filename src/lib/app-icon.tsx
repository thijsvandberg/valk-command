import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Single source of truth for the Bridge app icon, rendered on the fly so the
 * dev and prod instances can carry different colours. The mark is the `bridge_`
 * wordmark distilled to what survives at 16px: a white mono "b" with the teal
 * underscore caret trailing beside it on a dark tile (exploration option F-dark).
 *
 * Why generated instead of static PNGs: dev (`next dev`, port 3101) and prod
 * (`next start`, port 3100) run the same checkout, so the only way to give them
 * distinct favicons is to branch on NODE_ENV at request time.
 */

// Dev (port 3101) gets a light tile with a black b; prod (3100) keeps the dark
// brand tile with a white b. Both share the teal underscore caret, so a 3101 tab
// is instantly distinguishable from a 3100 tab in the browser strip.
const isDev = process.env.NODE_ENV !== "production";
const BG = isDev ? "#f4f5f5" : "#021a19"; // dev: light surface · prod: brand teal-950
const ACCENT = isDev ? "#14a8a3" : "#3bbfbe"; // teal underscore (brand-400 reads better on light)
const LETTER = isDev ? "#0a0f0f" : "#ffffff"; // dev: near-black b · prod: white b

let fontCache: Buffer | null = null;
function spaceMonoBold(): Buffer {
  if (!fontCache) {
    fontCache = readFileSync(join(process.cwd(), "src/assets/fonts/SpaceMono-Bold.ttf"));
  }
  return fontCache;
}

type Opts = {
  /** Maskable PWA icon: fill the square edge-to-edge and keep the mark inside the safe zone. */
  maskable?: boolean;
  /** Rounded tile corners. Defaults to true for normal icons, false for maskable/apple. */
  rounded?: boolean;
};

export function renderAppIcon(size: number, opts: Opts = {}) {
  const maskable = opts.maskable ?? false;
  const rounded = opts.rounded ?? !maskable;

  // Maskable safe zone is the central ~80%; shrink the lockup so nothing clips.
  const scale = maskable ? 0.6 : 0.82;
  const s = size * scale;

  const fontSize = s * 0.62;
  const underWidth = s * 0.34;
  const underHeight = Math.max(2, s * 0.1);
  const gap = s * 0.06;

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BG,
          borderRadius: rounded ? size * 0.22 : 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-end", lineHeight: 1 }}>
          <div
            style={{
              fontFamily: "Space Mono",
              fontWeight: 700,
              fontSize,
              lineHeight: 1,
              color: LETTER,
            }}
          >
            b
          </div>
          <div
            style={{
              width: underWidth,
              height: underHeight,
              borderRadius: underHeight / 2,
              background: ACCENT,
              marginLeft: gap,
              marginBottom: s * 0.04,
            }}
          />
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      fonts: [{ name: "Space Mono", data: spaceMonoBold(), weight: 700, style: "normal" }],
    },
  );
}
