// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guard against the BRDG-418 bug class: a Tailwind class referencing a surface/
 * overlay CSS variable that is not declared in globals.css. The browser silently
 * drops the invalid declaration and the element renders with a transparent fill,
 * so this never surfaces as a build error. We catch it statically instead.
 *
 * Declaration-driven, not a fixed blocklist: any surface/overlay token referenced
 * anywhere in src/ must exist in globals.css, which also protects BRDG-424 against
 * future typos in the token system.
 */

const ROOT = join(__dirname, "..", "..");
const GLOBALS = join(ROOT, "src/app/globals.css");

// Captures `surface-base`, `overlay-subtle`, `surface-elevated-hover`, etc.
const TOKEN = "(surface|overlay)-([a-z]+(?:-[a-z]+)*)";

function declaredTokens(): Set<string> {
  const css = readFileSync(GLOBALS, "utf8");
  const declared = new Set<string>();
  // Declaration form: `--color-surface-base:` (lookahead for the colon excludes
  // right-hand-side `var(--color-...)` references).
  const re = new RegExp(`--color-${TOKEN}\\s*:`, "g");
  for (const m of css.matchAll(re)) declared.add(`${m[1]}-${m[2]}`);
  return declared;
}

interface Reference {
  file: string;
  token: string;
  form: "var" | "utility";
}

function referencedTokens(files: string[]): Reference[] {
  // `var(--color-surface-default)` form.
  const varRe = new RegExp(`var\\(\\s*--color-${TOKEN}\\s*\\)`, "g");
  // Utility form with any optional variant prefix: `bg-surface-base`,
  // `focus:bg-surface-base`, `dark:hover:bg-overlay-strong`. Opacity / arbitrary
  // suffixes (`/50`, `[...]`) fall outside `[a-z-]` and are naturally excluded.
  const utilRe = new RegExp(
    `(?<![\\w-])(?:bg|text|border|ring|fill|from|to|via|divide|outline|decoration|shadow|accent|caret|stroke)-${TOKEN}`,
    "g",
  );
  const refs: Reference[] = [];
  for (const file of files) {
    const src = readFileSync(join(ROOT, file), "utf8");
    for (const m of src.matchAll(varRe)) refs.push({ file, token: `${m[1]}-${m[2]}`, form: "var" });
    for (const m of src.matchAll(utilRe)) refs.push({ file, token: `${m[1]}-${m[2]}`, form: "utility" });
  }
  return refs;
}

describe("surface/overlay token integrity", () => {
  it("only declares the known surface tokens (sanity check)", () => {
    expect([...declaredTokens()].sort()).toEqual([
      "overlay-default",
      "overlay-strong",
      "overlay-subtle",
      "surface-base",
      "surface-chrome",
      "surface-elevated",
      "surface-elevated-hover",
      "surface-floating",
      "surface-toolbar",
    ]);
  });

  it("every surface/overlay token referenced in src/ is declared in globals.css", async () => {
    const glob = await import("fast-glob");
    const files = await glob.default(["src/**/*.ts", "src/**/*.tsx"], {
      cwd: ROOT,
      ignore: ["**/*.test.ts", "**/*.test.tsx", "src/deleted/**"],
    });

    const declared = declaredTokens();
    const violations = referencedTokens(files)
      .filter((r) => !declared.has(r.token))
      .map((r) => `${r.file}: ${r.form === "var" ? `var(--color-${r.token})` : r.token}`);

    expect(violations).toEqual([]);
  });
});
