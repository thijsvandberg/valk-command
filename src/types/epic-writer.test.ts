import { describe, it, expect } from "vitest";
import {
  EPIC_WRITER_PHASES,
  EPIC_WRITER_PHASE_LABELS,
  isEpicWriterPhase,
} from "./epic-writer";

describe("Epic Writer phases (BRDG-488)", () => {
  it("has exactly the five simplified phases in rail order", () => {
    expect(EPIC_WRITER_PHASES).toEqual([
      "feed",
      "discovery",
      "breakdown",
      "refine",
      "sprints",
    ]);
  });

  it("no longer includes the removed 'detail' phase", () => {
    expect(EPIC_WRITER_PHASES).not.toContain("detail");
    expect(isEpicWriterPhase("detail")).toBe(false);
  });

  it("recognises 'refine' as a valid phase (the renamed full-detail step)", () => {
    expect(isEpicWriterPhase("refine")).toBe(true);
    expect(EPIC_WRITER_PHASE_LABELS.refine).toBe("Refine");
  });

  it("labels every phase", () => {
    for (const phase of EPIC_WRITER_PHASES) {
      expect(EPIC_WRITER_PHASE_LABELS[phase]).toBeTruthy();
    }
  });
});
