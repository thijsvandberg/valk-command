// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: vi.fn(),
}));

import { agentFetch } from "@/lib/agent-fetch";
import { GET } from "./route";

describe("GET /api/workspace-tasks/skills", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns skills list on success", async () => {
    vi.mocked(agentFetch).mockResolvedValue({
      ok: true,
      data: [{ name: "investigate", description: "Investigate code" }],
      status: 200,
      retryCount: 0,
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data[0].name).toBe("investigate");
  });

  it("returns error when agent fails", async () => {
    vi.mocked(agentFetch).mockResolvedValue({
      ok: false,
      error: { error: "Agent unavailable", code: "UNREACHABLE" },
      status: 502,
      retryCount: 0,
    });

    const response = await GET();
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toBe("Agent unavailable");
  });
});
