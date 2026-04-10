import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  buckets,
  applyRateLimit,
  trackOutboundCall,
  getOutboundUsage,
  isOutboundLimitApproaching,
  resetRateLimits,
} from "./rate-limiter";

describe("rate-limiter", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  describe("checkRateLimit", () => {
    it("allows requests within the limit", () => {
      const result = checkRateLimit("test", 5, 60_000);
      expect(result).toBeNull();
    });

    it("returns retry-after when limit exceeded", () => {
      for (let i = 0; i < 5; i++) {
        checkRateLimit("test", 5, 60_000);
      }
      const result = checkRateLimit("test", 5, 60_000);
      expect(result).toBeGreaterThan(0);
    });

    it("uses separate buckets for different keys", () => {
      for (let i = 0; i < 5; i++) {
        checkRateLimit("bucket-a", 5, 60_000);
      }
      const resultA = checkRateLimit("bucket-a", 5, 60_000);
      const resultB = checkRateLimit("bucket-b", 5, 60_000);
      expect(resultA).toBeGreaterThan(0);
      expect(resultB).toBeNull();
    });
  });

  describe("applyRateLimit", () => {
    it("returns null when not limited", () => {
      const result = applyRateLimit("read");
      expect(result).toBeNull();
    });

    it("returns 429 response when limited", () => {
      for (let i = 0; i < 120; i++) {
        applyRateLimit("read");
      }
      const result = applyRateLimit("read");
      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
    });
  });

  describe("outbound tracking", () => {
    it("tracks outbound calls", () => {
      trackOutboundCall("jira");
      trackOutboundCall("jira");
      const usage = getOutboundUsage("jira");
      expect(usage.current).toBe(2);
      expect(usage.limit).toBe(100);
    });

    it("detects approaching limits", () => {
      for (let i = 0; i < 80; i++) {
        trackOutboundCall("jira");
      }
      expect(isOutboundLimitApproaching("jira")).toBe(true);
    });

    it("reports not approaching when under threshold", () => {
      for (let i = 0; i < 10; i++) {
        trackOutboundCall("jira");
      }
      expect(isOutboundLimitApproaching("jira")).toBe(false);
    });
  });
});
