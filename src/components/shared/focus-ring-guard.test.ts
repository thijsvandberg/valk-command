import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// BRDG-420 guard: every interactive field that kills the native outline must
// supply its own focus indicator, so keyboard focus is never invisible. Scans the
// real UI (dev/exploration sandboxes and test files excluded).

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "exploration" || entry.name === "deleted") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

const INDICATOR =
  /focus:ring|focus:border|focus-visible:|focus:outline-\[|focus-within:/;

function classNameChunks(src: string): string[] {
  return src.match(/className=(?:"[^"]*"|\{`[^`]*`\}|\{[^}]*\})/g) ?? [];
}

describe("BRDG-420: no focusless focus:outline-none", () => {
  it("every focus:outline-none className also declares a focus ring/border", () => {
    const offenders: string[] = [];
    for (const file of [...walk("src/components"), ...walk("src/app")]) {
      for (const chunk of classNameChunks(readFileSync(file, "utf8"))) {
        if (chunk.includes("focus:outline-none") && !INDICATOR.test(chunk)) {
          offenders.push(`${file}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("BRDG-420: canonical field recipe carries a visible focus ring", () => {
  it("TextInput and TextArea use focus ring + brand border + disabled state", () => {
    for (const rel of [
      "src/components/shared/TextInput.tsx",
      "src/components/shared/TextArea.tsx",
      "src/components/shared/Select.tsx",
    ]) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src).toContain("focus:ring-1");
      expect(src).toContain("focus:border-[var(--color-brand-500)]");
      expect(src).toContain("disabled:opacity-50");
    }
  });
});
