import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reviewStory } from "./agent-client";

describe("agent-client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reviewStory returns mock review data", async () => {
    const promise = reviewStory("VPL-100");
    vi.advanceTimersByTime(2000);
    const result = await promise;

    expect(result.overallScore).toBe(68);
    expect(result.dimensions).toHaveLength(4);
    expect(result.dimensions[0].key).toBe("clarity");
    expect(result.summary).toBeTruthy();
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("reviewStory includes the ticket key in feedback", async () => {
    const promise = reviewStory("VPL-42");
    vi.advanceTimersByTime(2000);
    const result = await promise;

    const clarityFeedback = result.dimensions.find((d) => d.key === "clarity");
    expect(clarityFeedback?.feedback).toContain("VPL-42");
  });
});
