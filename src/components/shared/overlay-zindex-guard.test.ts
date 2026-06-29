import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// BRDG-422 guards: lock in the z-index inversion fixes and the dialog semantics
// added to the hand-rolled overlays, so they can't silently regress.

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("BRDG-422: z-index inversions are fixed", () => {
  it("CommandPalette sits on the modal layer, not above it (was z-tooltip)", () => {
    const src = read("src/components/command-palette/CommandPalette.tsx");
    expect(src).toContain("z-modal");
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

  it("the shared Popover uses token z + popover shadow", () => {
    const src = read("src/components/shared/Popover.tsx");
    expect(src).toContain("z-dropdown");
    expect(src).toContain("shadow-popover");
  });
});

describe("BRDG-422: hand-rolled overlays expose dialog semantics", () => {
  const dialogs = [
    "src/components/shared/StoryWriterLauncherModal.tsx",
    "src/components/sprint-board/SearchModal.tsx",
    "src/components/command-palette/CommandPalette.tsx",
    "src/components/sprint-board/SprintStatsPopover.tsx",
  ];
  for (const rel of dialogs) {
    it(`${rel} declares role="dialog" + aria-modal`, () => {
      const src = read(rel);
      expect(src).toContain('role="dialog"');
      expect(src).toContain('aria-modal="true"');
    });
  }

  it("SplitStoryPicker routes through the shared Modal", () => {
    const src = read("src/components/story-writer/SplitStoryPicker.tsx");
    expect(src).toContain('import { Modal }');
    expect(src).toContain("<Modal");
    expect(src).toContain("shadow-modal");
  });
});
