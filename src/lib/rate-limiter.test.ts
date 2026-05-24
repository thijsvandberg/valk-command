// @vitest-environment node
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

  describe("write tier", () => {
    it("allows up to 30 requests", () => {
      for (let i = 0; i < 30; i++) {
        expect(applyRateLimit("write")).toBeNull();
      }
      const result = applyRateLimit("write");
      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
    });

    it("includes Retry-After header on 429", () => {
      for (let i = 0; i < 30; i++) applyRateLimit("write");
      const result = applyRateLimit("write")!;
      expect(result.headers.get("Retry-After")).toBeTruthy();
      expect(Number(result.headers.get("Retry-After"))).toBeGreaterThan(0);
    });

    it("includes error message in body", async () => {
      for (let i = 0; i < 30; i++) applyRateLimit("write");
      const result = applyRateLimit("write")!;
      const body = await result.json();
      expect(body.error).toMatch(/too many requests/i);
    });
  });

  describe("delete tier", () => {
    it("allows up to 15 requests", () => {
      for (let i = 0; i < 15; i++) {
        expect(applyRateLimit("delete")).toBeNull();
      }
      const result = applyRateLimit("delete");
      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
    });

    it("uses separate bucket from write tier", () => {
      for (let i = 0; i < 30; i++) applyRateLimit("write");
      expect(applyRateLimit("write")!.status).toBe(429);
      expect(applyRateLimit("delete")).toBeNull();
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
