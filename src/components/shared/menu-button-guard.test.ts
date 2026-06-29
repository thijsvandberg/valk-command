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
  // BRDG-425 fixed the remaining conditional-/const-className buttons that truly
  // lacked a focus ring (ChildIssueListHeader ROW, BasePicker Item, SessionTicket
  // itemClass, EpicFilterChips chips), dropping this ceiling from 16 to 7. The 7
  // that remain are heuristic false positives, not real misses: the button has a
  // focus ring that this scanner cannot see — either via a string-concatenated
  // const (WarningBadge's BADGE_INTERACTIVE), via `className={classes}` indirection
  // (MenuItem, ui/Button), beyond the 900-char opening-tag slice (DateTimePicker
  // day, GroupStatBar), or supplied by the caller through `{...rest}` (BasePicker
  // trigger). Lower the number when it drops; it must never rise.
  const BASELINE = 7;
  it(`does not exceed ${BASELINE} focusless raw buttons in src/components`, () => {
    let focusless = 0;
    for (const f of nonTestFiles) {
      focusless += focuslessButtons(readFileSync(f, "utf8")).length;
    }
    expect(focusless).toBeLessThanOrEqual(BASELINE);
  });
});
