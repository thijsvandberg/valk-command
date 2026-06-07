import { describe, it, expect } from "vitest";
import { sprintEndFromStart, toInputDateTime, toIsoDateTime, startDateFromPreviousEnd, sprintDurationDays } from "./sprint-dates";

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

describe("startDateFromPreviousEnd", () => {
  it("returns the day after the previous Thursday end (the new Friday)", () => {
    // Thu 4 Jun 2026 -> Fri 5 Jun 2026
    expect(startDateFromPreviousEnd("2026-06-04T17:00:00.000Z")).toBe("2026-06-05");
  });

  it("handles a month rollover", () => {
    // Thu 30 Apr 2026 -> Fri 1 May 2026
    expect(startDateFromPreviousEnd("2026-04-30T17:00:00.000Z")).toBe("2026-05-01");
  });

  it("round-trips to local midnight through the picker converters", () => {
    const start = startDateFromPreviousEnd("2026-06-04T17:00:00.000Z");
    expect(toInputDateTime(toIsoDateTime(start))).toBe(start);
  });

  it("feeds the conventional end-date suggestion", () => {
    // A Friday start derived from the previous end yields the next Thursday end.
    const start = startDateFromPreviousEnd("2026-06-04T17:00:00.000Z");
    expect(sprintEndFromStart(start)).toBe("2026-06-18T17:00");
  });

  it("returns empty for missing or unparseable end dates", () => {
    expect(startDateFromPreviousEnd(null)).toBe("");
    expect(startDateFromPreviousEnd(undefined)).toBe("");
    expect(startDateFromPreviousEnd("")).toBe("");
    expect(startDateFromPreviousEnd("not a date")).toBe("");
  });
});

describe("sprintDurationDays", () => {
  it("counts whole days between start and end, ignoring the end time", () => {
    // Fri 17 Jul -> Thu 30 Jul (17:00) is a 13-day span.
    expect(sprintDurationDays("2026-07-17", "2026-07-30T17:00")).toBe(13);
  });

  it("counts a same-day span as zero", () => {
    expect(sprintDurationDays("2026-07-17", "2026-07-17")).toBe(0);
  });

  it("returns null when a date is missing or the end precedes the start", () => {
    expect(sprintDurationDays("", "2026-07-30")).toBeNull();
    expect(sprintDurationDays("2026-07-17", "")).toBeNull();
    expect(sprintDurationDays("2026-07-30", "2026-07-17")).toBeNull();
  });
});

describe("date converters", () => {
  it("keeps a date with no time time-less across the round trip", () => {
    // No phantom time may appear: a date picked without a time must come back
    // as the same bare date regardless of the runner's timezone. This is the
    // regression that surfaced as a "02:00" start in a UTC+2 zone.
    const iso = toIsoDateTime("2026-07-03");
    expect(toInputDateTime(iso)).toBe("2026-07-03");
  });

  it("preserves an explicit time across the round trip", () => {
    const iso = toIsoDateTime("2026-06-18T17:00");
    expect(toInputDateTime(iso)).toBe("2026-06-18T17:00");
  });

  it("returns empty for empty input", () => {
    expect(toIsoDateTime("")).toBe("");
    expect(toInputDateTime("")).toBe("");
    expect(toInputDateTime(null)).toBe("");
  });
});
