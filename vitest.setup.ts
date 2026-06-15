import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, afterAll, vi } from "vitest";
import { closeAllTestDbs } from "@/db/test-utils";

vi.mock("server-only", () => ({}));

// ResizeObserver is not available in jsdom
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof globalThis.ResizeObserver;

// The localStorage exposed in the test runtime is an incomplete stub (missing
// clear()), so install a clean in-memory implementation reset between tests.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() { return Object.keys(store).length; },
  };
})();
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

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
  // Some suites stub localStorage with a partial mock, so guard clear().
  if (typeof localStorage?.clear === "function") localStorage.clear();
});

// Reset the account-scoped settings entries in SWR's global cache between tests.
// useAccountSetting (BRDG-343) reads/writes /api/settings/* in the default SWR
// cache; without this a value written in one test would persist into the next
// and pollute it. Scoped to settings keys so unrelated caches (e.g. sprints)
// keep their cross-test behaviour.
afterEach(async () => {
  try {
    const { mutate } = await import("swr");
    await mutate(
      (key) => typeof key === "string" && key.startsWith("/api/settings/"),
      undefined,
      { revalidate: false },
    );
  } catch {
    // swr not used in this suite
  }
});

afterAll(() => {
  closeAllTestDbs();
});
