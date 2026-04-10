import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, afterAll, vi } from "vitest";
import { closeAllTestDbs } from "@/db/test-utils";

vi.mock("server-only", () => ({}));

// Reset rate limiter state between tests to prevent cross-test interference
afterEach(async () => {
  try {
    const { resetRateLimits } = await import("@/lib/rate-limiter");
    resetRateLimits();
  } catch {
    // rate-limiter not imported in all test suites
  }
});

afterEach(() => {
  cleanup();
});

afterAll(() => {
  closeAllTestDbs();
});
