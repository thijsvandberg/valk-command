import { describe, it, expect } from "vitest";
import {
  computeDispositionFields,
  normalizeNote,
  DISMISS_COOLDOWN_DAYS,
  MAX_DISPOSITION_NOTE_LENGTH,
} from "./cleanup-disposition";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("computeDispositionFields", () => {
  it("confirm sets confirmed with no cooldown", () => {
    const f = computeDispositionFields("confirm");
    expect(f.disposition).toBe("confirmed");
    expect(f.dispositionUntil).toBeNull();
  });

  it("dismiss sets dismissed with the default 90-day cooldown", () => {
    const now = Date.UTC(2026, 5, 4);
    const f = computeDispositionFields("dismiss", { now });
    expect(f.disposition).toBe("dismissed");
    expect(DISMISS_COOLDOWN_DAYS).toBe(90);
    const until = new Date(f.dispositionUntil as string).getTime();
    expect(until - now).toBe(DISMISS_COOLDOWN_DAYS * DAY_MS);
  });

  it("dismiss honours a custom cooldown", () => {
    const now = Date.UTC(2026, 5, 4);
    const f = computeDispositionFields("dismiss", { now, cooldownDays: 30 });
    const until = new Date(f.dispositionUntil as string).getTime();
    expect(until - now).toBe(30 * DAY_MS);
  });

  it("reset clears disposition, cooldown, and note", () => {
    const f = computeDispositionFields("reset", { note: "ignored" });
    expect(f).toEqual({ disposition: null, dispositionUntil: null, dispositionNote: null });
  });

  it("stores a trimmed note on confirm/dismiss", () => {
    expect(computeDispositionFields("confirm", { note: "  keep  " }).dispositionNote).toBe("keep");
    expect(computeDispositionFields("dismiss", { note: "false positive" }).dispositionNote).toBe(
      "false positive",
    );
  });
});

describe("normalizeNote", () => {
  it("collapses blank/whitespace to null", () => {
    expect(normalizeNote(null)).toBeNull();
    expect(normalizeNote("   ")).toBeNull();
    expect(normalizeNote(undefined)).toBeNull();
  });

  it("clamps to the max length", () => {
    const long = "x".repeat(MAX_DISPOSITION_NOTE_LENGTH + 50);
    expect(normalizeNote(long)?.length).toBe(MAX_DISPOSITION_NOTE_LENGTH);
  });
});
