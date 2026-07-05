import { describe, it, expect } from "vitest";
import { scrollFadeMask } from "./useScrollOverflow";

describe("scrollFadeMask", () => {
  it("shows no fade when the row is not scrollable", () => {
    const mask = scrollFadeMask({ canScrollLeft: false, canScrollRight: false });
    expect(mask).not.toContain("transparent");
  });

  it("fades only the right edge at the start of the scroll", () => {
    const mask = scrollFadeMask({ canScrollLeft: false, canScrollRight: true });
    expect(mask).toContain("black 0");
    expect(mask).toContain("transparent 100%");
  });

  it("drops the right fade at the end so the last item is not washed out", () => {
    const mask = scrollFadeMask({ canScrollLeft: true, canScrollRight: false });
    expect(mask).toContain("black 100%");
    expect(mask).not.toContain("transparent 100%");
    expect(mask).toContain("transparent 0");
  });

  it("fades both edges in the middle of the scroll", () => {
    const mask = scrollFadeMask({ canScrollLeft: true, canScrollRight: true });
    expect(mask).toContain("transparent 0");
    expect(mask).toContain("transparent 100%");
  });
});
