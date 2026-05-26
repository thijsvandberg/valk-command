// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatTimestamp, formatDuration } from "./format-timestamp";

describe("formatTimestamp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T14:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns time only for today's date", () => {
    const result = formatTimestamp("2026-05-26T09:15:00Z");
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it("returns 'Yesterday HH:MM' for yesterday", () => {
    const result = formatTimestamp("2026-05-25T10:00:00Z");
    expect(result).toMatch(/^Yesterday \d{2}:\d{2}$/);
  });

  it("returns 'DD Mon HH:MM' for older dates", () => {
    const result = formatTimestamp("2026-05-10T08:00:00Z");
    expect(result).toMatch(/\d{1,2} \w{3} \d{2}:\d{2}/);
  });

  it("handles invalid date input without throwing", () => {
    const result = formatTimestamp("not-a-date");
    expect(typeof result).toBe("string");
  });
});

describe("formatDuration", () => {
  it("returns milliseconds for sub-second values", () => {
    expect(formatDuration(450)).toBe("450ms");
  });

  it("returns seconds for sub-minute values", () => {
    expect(formatDuration(5500)).toBe("5.5s");
  });

  it("returns minutes and seconds for values over 60s", () => {
    expect(formatDuration(125000)).toBe("2m 5s");
  });

  it("handles exact minute boundaries", () => {
    expect(formatDuration(60000)).toBe("1m 0s");
  });

  it("returns 0ms for zero", () => {
    expect(formatDuration(0)).toBe("0ms");
  });
});
