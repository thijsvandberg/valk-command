// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  clientErrorSchema,
  shouldThrottle,
  _resetClientErrorSinkThrottle,
} from "./client-error-sink";

describe("client-error-sink schema", () => {
  it("accepts a minimal payload (message only)", () => {
    expect(clientErrorSchema.safeParse({ message: "x" }).success).toBe(true);
  });

  it("rejects an empty message", () => {
    expect(clientErrorSchema.safeParse({ message: "" }).success).toBe(false);
  });

  it("rejects a non-string field", () => {
    expect(clientErrorSchema.safeParse({ message: "x", stack: 5 }).success).toBe(false);
  });

  it("strips unknown keys from the parsed output", () => {
    const parsed = clientErrorSchema.safeParse({ message: "x", token: "secret" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).not.toHaveProperty("token");
  });
});

describe("shouldThrottle", () => {
  beforeEach(() => {
    _resetClientErrorSinkThrottle();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first call and suppresses an identical one within the window", () => {
    expect(shouldThrottle("boom", "/sprint")).toBe(false);
    expect(shouldThrottle("boom", "/sprint")).toBe(true);
  });

  it("allows the same message again after the window elapses", () => {
    expect(shouldThrottle("boom", "/sprint")).toBe(false);
    vi.advanceTimersByTime(30_001);
    expect(shouldThrottle("boom", "/sprint")).toBe(false);
  });

  it("keys on message+pathname (different path is not throttled)", () => {
    expect(shouldThrottle("boom", "/a")).toBe(false);
    expect(shouldThrottle("boom", "/b")).toBe(false);
  });

  it("treats an absent pathname as its own key", () => {
    expect(shouldThrottle("boom", undefined)).toBe(false);
    expect(shouldThrottle("boom", undefined)).toBe(true);
  });
});
