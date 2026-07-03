import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// BRDG-422 guards: lock in the z-index inversion fixes and the dialog semantics
// added to the hand-rolled overlays, so they can't silently regress.
// BRDG-428 extends this: the token scale (dropdown 50 < modal 60 < popover 65 <
// tooltip 70 < notification 80) is the single source for overlay layering; raw
// z values are forbidden in the real UI.

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

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

describe("BRDG-422: z-index inversions are fixed", () => {
  it("CommandPalette sits on the modal layer via the shared Modal (was z-tooltip)", () => {
    const src = read("src/components/command-palette/CommandPalette.tsx");
    // Hosted in Modal since BRDG-431; Modal owns the z-modal backdrop.
    expect(src).toContain('import { Modal }');
    expect(src).toContain("<Modal");
    expect(src).not.toContain("z-tooltip");
  });

  it("toasts use the dedicated notification layer", () => {
    expect(read("src/components/ui/Toast.tsx")).toContain("z-notification");
    expect(read("src/components/sync/SyncToast.tsx")).toContain("z-notification");
    // SyncToast must no longer share the modal layer.
    expect(read("src/components/sync/SyncToast.tsx")).not.toMatch(/z-modal\b/);
  });

  it("StakeholderBriefing uses z tokens, not off-scale z-[200]/z-[201]", () => {
    const src = read("src/components/stakeholder/StakeholderBriefing.tsx");
    expect(src).not.toContain("z-[200]");
    expect(src).not.toContain("z-[201]");
  });

  it("SprintStatsPopover sits on the modal layer, not z-40/z-50", () => {
    const src = read("src/components/sprint-board/SprintStatsPopover.tsx");
    expect(src).not.toMatch(/\bz-40\b/);
    expect(src).not.toMatch(/\bz-50\b/);
    expect(src).toContain("z-modal");
  });

  it("the shared anchored-panel primitive uses token z + popover shadow", () => {
    // Popover delegates to AnchoredPanel since BRDG-429; the inline skin
    // (z-dropdown + shadow-popover) lives in the primitive.
    const src = read("src/components/shared/AnchoredPanel.tsx");
    expect(src).toContain("z-dropdown");
    expect(src).toContain("z-popover");
    expect(src).toContain("shadow-popover");
  });
});

describe("BRDG-422/431: overlays expose dialog semantics", () => {
  // Hand-rolled dialogs that still declare their own role/aria.
  const dialogs = [
    "src/components/shared/StoryWriterLauncherModal.tsx",
    "src/components/sprint-board/SprintStatsPopover.tsx",
  ];
  for (const rel of dialogs) {
    it(`${rel} declares role="dialog" + aria-modal`, () => {
      const src = read(rel);
      expect(src).toContain('role="dialog"');
      expect(src).toContain('aria-modal="true"');
    });
  }

  // Fully migrated onto the shared Modal in BRDG-431 (role/aria/z + focus trap
  // come from Modal).
  const modalHosted = [
    "src/components/sprint-board/SearchModal.tsx",
    "src/components/command-palette/CommandPalette.tsx",
  ];
  for (const rel of modalHosted) {
    it(`${rel} routes through the shared Modal`, () => {
      const src = read(rel);
      expect(src).toContain('import { Modal }');
      expect(src).toContain("<Modal");
    });
  }

  it("SplitStoryPicker routes through the shared Modal", () => {
    const src = read("src/components/story-writer/SplitStoryPicker.tsx");
    expect(src).toContain('import { Modal }');
    expect(src).toContain("<Modal");
    expect(src).toContain("shadow-modal");
  });
});

describe("BRDG-428: the z-index token scale is authoritative", () => {
  // Raw values that used to sit on overlays. z-40 is deliberately not listed:
  // its two remaining uses (ChatLayout mobile drawer, InboxDigestBanner) are
  // layout layers that intentionally sit BELOW the token scale.
  const RAW_Z = [/\bz-50\b/, /\bz-\[9999\]\b/, /zIndex:\s*9999/, /\bz-\[100\]\b/, /\bz-\[200\]\b/];

  it("no raw overlay z values remain in the real UI (use the five tokens)", () => {
    const offenders: string[] = [];
    for (const file of [...walk("src/components"), ...walk("src/app")]) {
      const src = readFileSync(file, "utf8");
      for (const pattern of RAW_Z) {
        if (pattern.test(src)) offenders.push(`${file} matches ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the five tokens exist in the expected order", () => {
    const css = read("src/app/globals.css");
    const value = (name: string) =>
      Number(new RegExp(`--z-index-${name}:\\s*(\\d+)`).exec(css)?.[1]);
    expect(value("dropdown")).toBe(50);
    expect(value("modal")).toBe(60);
    expect(value("popover")).toBe(65);
    expect(value("tooltip")).toBe(70);
    expect(value("notification")).toBe(80);
  });
});
