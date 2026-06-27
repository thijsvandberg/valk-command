import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// BRDG-421 guard tests. These operate on the source files themselves so they
// catch regressions the per-component render tests cannot (a new focusless
// button, a stray press-scale value, a menu re-hand-rolling a row).

const COMPONENTS_DIR = join(process.cwd(), "src/components");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const tsxFiles = walk(COMPONENTS_DIR);
const nonTestFiles = tsxFiles.filter((f) => !f.endsWith(".test.tsx"));

/** Each raw `<button` opening tag's text (up to the end of the opening tag). */
function buttonOpeningTags(src: string): string[] {
  return src
    .split("<button")
    .slice(1)
    .map((seg) => seg.slice(0, 900).split(/>\s*\n|>\s*</)[0]);
}

/** Names of string-literal className consts in the file that carry a focus style,
 *  so a `className={navBtnClass}` button counts as having focus. */
function focusBearingConsts(src: string): string[] {
  const names: string[] = [];
  const re = /const\s+(\w+)\s*=\s*(?:`[^`]*focus[^`]*`|"[^"]*focus[^"]*")/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) names.push(m[1]);
  return names;
}

/** A raw <button> has a focus ring if its opening tag mentions `focus` directly
 *  or references a focus-bearing className const defined in the same file. */
function focuslessButtons(src: string): string[] {
  const consts = focusBearingConsts(src);
  return buttonOpeningTags(src).filter(
    (tag) => !/focus/.test(tag) && !consts.some((c) => tag.includes(c)),
  );
}

describe("BRDG-421: single press-scale value", () => {
  it("uses only active:scale-[0.97] in src/components (no scale-95/[0.98]/etc.)", () => {
    const offenders: string[] = [];
    for (const f of nonTestFiles) {
      const src = readFileSync(f, "utf8");
      const matches = src.match(/active:scale-(?!\[0\.97\])[^\s"'`]+/g);
      if (matches) offenders.push(`${f}: ${matches.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("BRDG-421: migrated menus carry focus-visible on every button", () => {
  // These menus were converged onto the shared MenuItem (or kept raw with the
  // canonical interactive states). Every remaining raw <button> in them must
  // expose a keyboard focus ring.
  const cleaned = [
    "src/components/sprint-board/ticket-action-menu.tsx",
    "src/components/chat/ConversationOverflowMenu.tsx",
    "src/components/refinement-session/RefinementSessionMenu.tsx",
    "src/components/stakeholder/StakeholderOverflowMenu.tsx",
    "src/components/sprint-board/SprintDetailsPopover.tsx",
    "src/components/shared/TicketStatusPill.tsx",
  ];
  for (const rel of cleaned) {
    it(`${rel} has no focusless <button>`, () => {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(focuslessButtons(src)).toEqual([]);
    });
  }
});

describe("BRDG-421: focusless-button ratchet", () => {
  // The full button population (~497 non-test) still carries a long tail of raw
  // buttons without a focus ring; BRDG-421 materially reduces it and this ceiling
  // prevents regressions while the tail is chipped away. Lower the number when it
  // drops; it must never rise. (Heuristic: counts a raw <button> whose opening
  // tag has no `focus` token — className-via-const buttons may over-count, which
  // only makes the ceiling conservative.)
  const BASELINE = 249;
  it(`does not exceed ${BASELINE} focusless raw buttons in src/components`, () => {
    let focusless = 0;
    for (const f of nonTestFiles) {
      focusless += focuslessButtons(readFileSync(f, "utf8")).length;
    }
    expect(focusless).toBeLessThanOrEqual(BASELINE);
  });
});
