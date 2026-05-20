import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockFlush = vi.fn();
vi.mock("@/lib/cache", () => ({
  cache: {
    flush: (...args: unknown[]) => mockFlush(...args),
  },
}));

import { POST } from "./route";

describe("POST /api/cache/flush", () => {
  it("calls cache.flush and returns ok", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ ok: true });
    expect(mockFlush).toHaveBeenCalledOnce();
  });
});
