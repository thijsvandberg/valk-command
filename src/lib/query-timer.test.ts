// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { timedQuery } from "./query-timer";

describe("timedQuery", () => {
  it("returns the result and duration", async () => {
    const { result, durationMs } = await timedQuery("test", () => 42);
    expect(result).toBe(42);
    expect(typeof durationMs).toBe("number");
    expect(durationMs).toBeGreaterThanOrEqual(0);
  });

  it("works with async functions", async () => {
    const { result } = await timedQuery("test-async", async () => {
      return "hello";
    });
    expect(result).toBe("hello");
  });

  it("logs a warning for slow queries", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await timedQuery("slow-test", async () => {
      await new Promise((r) => setTimeout(r, 120));
      return true;
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[slow-query] slow-test:"),
    );
    warnSpy.mockRestore();
  });

  it("does not log for fast queries", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await timedQuery("fast-test", () => true);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
