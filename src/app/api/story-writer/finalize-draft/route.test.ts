// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockReturnValue(null) }));

const mockFinalizeDraft = vi.hoisted(() => vi.fn());
vi.mock("@/lib/draft-sync", () => ({
  finalizeDraft: mockFinalizeDraft,
}));

import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3100/api/story-writer/finalize-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/story-writer/finalize-draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFinalizeDraft.mockReturnValue(undefined);
  });

  it("returns 400 when draftKey is missing", async () => {
    const res = await POST(makeRequest({ realKey: "VPL-100" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when realKey is missing", async () => {
    const res = await POST(makeRequest({ draftKey: "DRAFT-abc" }));
    expect(res.status).toBe(400);
  });

  it("returns success with realKey on success", async () => {
    const res = await POST(makeRequest({ draftKey: "DRAFT-abc", realKey: "VPL-100" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.realKey).toBe("VPL-100");
    expect(mockFinalizeDraft).toHaveBeenCalledWith("DRAFT-abc", "VPL-100", undefined);
  });

  it("passes optional sprintName", async () => {
    await POST(makeRequest({ draftKey: "DRAFT-abc", realKey: "VPL-100", sprintName: "Sprint 5" }));
    expect(mockFinalizeDraft).toHaveBeenCalledWith("DRAFT-abc", "VPL-100", "Sprint 5");
  });

  it("returns 500 when finalizeDraft throws", async () => {
    mockFinalizeDraft.mockImplementation(() => { throw new Error("DB error"); });

    const res = await POST(makeRequest({ draftKey: "DRAFT-abc", realKey: "VPL-100" }));
    expect(res.status).toBe(500);
  });
});
