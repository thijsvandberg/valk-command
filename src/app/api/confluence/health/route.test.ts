import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockCheckHealth = vi.fn();
const mockIsLive = { value: true };

vi.mock("@/lib/confluence-client", () => ({
  confluenceClient: {
    get isLive() {
      return mockIsLive.value;
    },
    checkHealth: (...args: unknown[]) => mockCheckHealth(...args),
  },
}));

import { GET } from "./route";

describe("GET /api/confluence/health", () => {
  it("returns not-ok when confluenceClient.isLive is false", async () => {
    mockIsLive.value = false;

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      ok: false,
      live: false,
      error: "Confluence credentials not configured",
    });
  });

  it("returns ok when checkHealth succeeds", async () => {
    mockIsLive.value = true;
    mockCheckHealth.mockResolvedValue({ displayName: "admin" });

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      ok: true,
      live: true,
      user: { displayName: "admin" },
    });
  });

  it("returns error when checkHealth throws", async () => {
    mockIsLive.value = true;
    mockCheckHealth.mockRejectedValue(new Error("Connection refused"));

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({
      ok: false,
      live: false,
      error: "Connection refused",
    });
  });
});
