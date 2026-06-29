// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { relativeDate, formatAbsoluteDate } from "./date-utils";

describe("relativeDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty string for null/undefined", () => {
    expect(relativeDate(null)).toBe("");
    expect(relativeDate(undefined)).toBe("");
  });

  it("returns empty string for invalid date", () => {
    expect(relativeDate("not-a-date")).toBe("");
  });

  it('returns "just now" for < 1 minute ago', () => {
    const now = new Date().toISOString();
    expect(relativeDate(now)).toBe("just now");
  });

  it("returns minutes ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:10:00Z"));
    expect(relativeDate("2026-01-15T12:05:00Z")).toBe("5m ago");
  });

  it("returns hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T15:00:00Z"));
    expect(relativeDate("2026-01-15T12:00:00Z")).toBe("3h ago");
  });

  it("returns days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T12:00:00Z"));
    expect(relativeDate("2026-01-15T12:00:00Z")).toBe("5d ago");
  });

  it("returns months ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));
    expect(relativeDate("2026-01-15T12:00:00Z")).toBe("3mo ago");
  });

  it("returns years ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2028-01-15T12:00:00Z"));
    expect(relativeDate("2026-01-15T12:00:00Z")).toBe("2y ago");
  });
});

describe("formatAbsoluteDate", () => {
  it("returns empty string for null/undefined", () => {
    expect(formatAbsoluteDate(null)).toBe("");
    expect(formatAbsoluteDate(undefined)).toBe("");
  });

  it("returns empty string for invalid date", () => {
    expect(formatAbsoluteDate("not-a-date")).toBe("");
  });

  it("formats a valid ISO date", () => {
    const result = formatAbsoluteDate("2026-01-15T12:30:00Z");
    expect(result).toBeTruthy();
    expect(result).toContain("2026");
    expect(result).toContain("Jan");
  });

  it("prefixes a two-letter weekday code when requested", () => {
    const result = formatAbsoluteDate("2026-06-25T13:58:00Z", { weekday: true });
    expect(result).toMatch(/^(Mo|Tu|We|Th|Fr|Sa|Su) /);
    expect(result).toContain("Jun 2026");
  });

  it("omits the weekday by default", () => {
    const result = formatAbsoluteDate("2026-06-25T13:58:00Z");
    expect(result).not.toMatch(/^(Mo|Tu|We|Th|Fr|Sa|Su) /);
  });
});
