import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockStats = vi.fn().mockReturnValue({
  hits: 10,
  misses: 3,
  entries: 5,
  hitRate: "76.9%",
});

vi.mock("@/lib/cache", () => ({
  cache: {
    stats: (...args: unknown[]) => mockStats(...args),
  },
}));

import { GET } from "./route";

describe("GET /api/cache/stats", () => {
  it("returns cache stats object", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      hits: 10,
      misses: 3,
      entries: 5,
      hitRate: "76.9%",
    });
    expect(mockStats).toHaveBeenCalledOnce();
  });
});
