import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// Focus-styling guard. Non-text interactive controls (buttons, clickable rows,
// custom widgets) that kill the native outline must still declare their own focus
// indicator, so keyboard focus is never invisible. Text-editing fields are exempt:
// the native text caret already marks focus, and the PO asked for no extra
// ring/glow around inputs, so they intentionally carry only `focus:outline-none`
// (or a subtle border). Scans the real UI (dev/exploration and test files excluded).

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

// A text-editing field shows focus via the native caret, so it needs no CSS ring.
// `placeholder` in the class list is the reliable static signal for input/textarea.
const isTextField = (chunk: string) => chunk.includes("placeholder");

describe("focus guard: non-text controls keep a focus indicator", () => {
  it("every focus:outline-none className declares an indicator or is a text field", () => {
    const offenders: string[] = [];
    for (const file of [...walk("src/components"), ...walk("src/app")]) {
      for (const chunk of classNameChunks(readFileSync(file, "utf8"))) {
        if (
          chunk.includes("focus:outline-none") &&
          !INDICATOR.test(chunk) &&
          !isTextField(chunk)
        ) {
          offenders.push(`${file}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("canonical field recipe: subtle focus border, no ring/glow", () => {
  it("TextInput/TextArea/Select use a subtle brand border, a disabled state, and no ring", () => {
    for (const rel of [
      "src/components/shared/TextInput.tsx",
      "src/components/shared/TextArea.tsx",
      "src/components/shared/Select.tsx",
    ]) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src).toContain("focus:border-[var(--color-brand-500)]/40");
      expect(src).toContain("disabled:opacity-50");
      expect(src).not.toContain("focus:ring");
    }
  });
});
