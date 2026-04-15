import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/agent-fetch", () => ({
  agentFetch: vi.fn(),
}));

import { agentFetch } from "@/lib/agent-fetch";
import { GET } from "./route";

describe("GET /api/workspace-tasks/health", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns agent health data on success", async () => {
    vi.mocked(agentFetch).mockResolvedValue({
      ok: true,
      data: { status: "ok", auth: { status: "authenticated" } },
      status: 200,
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe("ok");
  });

  it("returns 502 with unreachable status when agent fails", async () => {
    vi.mocked(agentFetch).mockResolvedValue({
      ok: false,
      error: { error: "Connection refused", code: "NETWORK_ERROR" },
      status: 502,
    });

    const response = await GET();
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.status).toBe("unreachable");
    expect(data.code).toBe("NETWORK_ERROR");
  });
});
