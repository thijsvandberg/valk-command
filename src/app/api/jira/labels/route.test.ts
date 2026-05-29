// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    getLabels: vi.fn(),
  },
}));

import { GET } from "./route";
import { jiraClient } from "@/lib/jira-client";

describe("GET /api/jira/labels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns labels array from Jira", async () => {
    vi.mocked(jiraClient.getLabels).mockResolvedValue(["bug", "enhancement", "frontend"]);

    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.labels).toEqual(["bug", "enhancement", "frontend"]);
  });

  it("returns empty array with 500 on Jira failure", async () => {
    vi.mocked(jiraClient.getLabels).mockRejectedValue(new Error("Jira unavailable"));

    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.labels).toEqual([]);
    expect(data.error).toBeDefined();
  });
});
