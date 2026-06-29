// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * BRDG-424 token-discipline guards. globals.css defines a full type scale, shadow
 * scale and color/token system; a long tail of code used to bypass them with
 * arbitrary values that happen to match a token. Once cleaned up, lock it: keep
 * off-scale text sizes, raw elevation box-shadows and already-a-token hexes from
 * creeping back into className / inline style.
 *
 * Scope is the production surfaces only. The dev exploration playground
 * (src/app/dev) intentionally trials off-scale values and is excluded, as are
 * test files and globals.css itself (the token source of truth).
 */

const ROOT = join(__dirname, "..", "..");

async function prodFiles(): Promise<string[]> {
  const glob = await import("fast-glob");
  // Glob without literal parens (fast-glob treats `(app)` as an extglob group),
  // then filter to the in-scope production trees.
  const all = await glob.default(["src/**/*.ts", "src/**/*.tsx"], {
    cwd: ROOT,
    ignore: ["**/*.test.ts", "**/*.test.tsx", "src/deleted/**"],
  });
  return all.filter((f) => f.startsWith("src/components/") || f.startsWith("src/app/(app)/"));
}

function read(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

// The bridge_ wordmark (19px, Space Mono) and the refinement wrap-up celebration
// display (22px) are deliberate off-scale brand/decorative sizes.
const TEXT_PX_ALLOW: Record<string, number[]> = {
  "src/components/shared/ViewHeader.tsx": [19],
  "src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx": [19],
  "src/components/refinement-session/SessionWrapUpCelebration.tsx": [22],
};

describe("BRDG-424: text sizes use the type scale", () => {
  it("has no off-scale text-[Npx] outside the documented wordmark/celebration exceptions", async () => {
    const files = await prodFiles();
    const violations: string[] = [];
    for (const file of files) {
      for (const m of read(file).matchAll(/text-\[(\d+)px\]/g)) {
        const px = Number(m[1]);
        if (!TEXT_PX_ALLOW[file]?.includes(px)) violations.push(`${file}: text-[${px}px]`);
      }
    }
    expect(violations).toEqual([]);
  });
});

// Raw box-shadows are permitted only for focus/selection rings (shadow-[0_0_0_*]),
// brand/decorative-tinted glows (color-mix / --color-brand / a hex tint), and two
// documented bespoke treatments (the nav panel's inset top-highlight, the keycap).
// Plain neutral elevation must use the scale (sm/md/lg/xl/2xl/popover/modal).
function rawShadowAllowed(shadow: string): boolean {
  if (/^shadow-\[0_0_0/.test(shadow)) return true; // ring
  if (/color-mix|--color-brand|#[0-9a-fA-F]/.test(shadow)) return true; // brand/decorative tint
  if (shadow.includes("inset_0_1px_0")) return true; // nav panel top highlight
  if (shadow.includes("0_1px_0_1px_var(--color-overlay")) return true; // keycap
  return false;
}

describe("BRDG-424: elevation uses the shadow scale", () => {
  it("has no raw neutral box-shadow outside the ring/glow/bespoke allowlist", async () => {
    const files = await prodFiles();
    const violations: string[] = [];
    for (const file of files) {
      for (const m of read(file).matchAll(/shadow-\[0[^\]]*\]/g)) {
        if (!rawShadowAllowed(m[0])) violations.push(`${file}: ${m[0]}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

// className arbitrary hexes (e.g. text-[#9b6cd4]) bypass the token system entirely.
// The refinement session page is excluded for now: its violet chat-accent hexes
// sit alongside in-flight parallel issue-icon work and will inherit the
// --color-chat-accent token once that lands.
const HEX_CLASSNAME_ALLOW_FILES = new Set<string>([
  "src/app/(app)/refinement/[sessionId]/session/[ticketKey]/page.tsx",
]);
const HEX_PREFIX =
  "(?:bg|text|border|ring|from|to|via|fill|stroke|outline|decoration|divide|accent|caret|shadow)";

describe("BRDG-424: className colors use tokens, not raw hexes", () => {
  it("has no arbitrary-value hex in className outside the documented exclusion", async () => {
    const files = await prodFiles();
    const re = new RegExp(`${HEX_PREFIX}-\\[#[0-9a-fA-F]{3,8}`, "g");
    const violations: string[] = [];
    for (const file of files) {
      if (HEX_CLASSNAME_ALLOW_FILES.has(file)) continue;
      for (const m of read(file).matchAll(re)) violations.push(`${file}: ${m[0]}]`);
    }
    expect(violations).toEqual([]);
  });

  it("no longer hardcodes the colors that now have tokens", async () => {
    const files = (await prodFiles()).filter((f) => !HEX_CLASSNAME_ALLOW_FILES.has(f));
    const tokenized = ["#9b6cd4", "#b48ee6", "#d04840", "#1ea34d"];
    const violations: string[] = [];
    for (const file of files) {
      const src = read(file);
      for (const hex of tokenized) if (src.includes(hex)) violations.push(`${file}: ${hex}`);
    }
    expect(violations).toEqual([]);
  });
});
