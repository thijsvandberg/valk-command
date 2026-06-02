import { describe, it, expect } from "vitest";
import { sprintEndFromStart } from "./sprint-dates";

describe("sprintEndFromStart", () => {
  it("maps a Friday start to the Thursday two weeks later at 17:00", () => {
    // Fri 22 May 2026 -> Thu 4 Jun 2026
    expect(sprintEndFromStart("2026-05-22")).toBe("2026-06-04T17:00");
  });

  it("maps a Friday start with a time to the same Thursday at 17:00", () => {
    expect(sprintEndFromStart("2026-05-22T14:04")).toBe("2026-06-04T17:00");
  });

  it("snaps a later Tuesday start to the same anchoring Thursday", () => {
    // Tue 26 May 2026 -> Thu 4 Jun 2026 (same end as the Friday start)
    expect(sprintEndFromStart("2026-05-26")).toBe("2026-06-04T17:00");
  });

  it("handles a Thursday start (+1 week, then the next Thursday)", () => {
    // Thu 21 May 2026 -> +7 = Thu 28 May (offset 0) -> 28 May
    expect(sprintEndFromStart("2026-05-21")).toBe("2026-05-28T17:00");
  });

  it("does not mutate across calls (year rollover)", () => {
    // Fri 25 Dec 2026 -> Thu 7 Jan 2027
    expect(sprintEndFromStart("2026-12-25")).toBe("2027-01-07T17:00");
  });
});
