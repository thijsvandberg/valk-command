// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockReturnValue(null) }));

const mockPullFromJira = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
const mockHandleServiceError = vi.hoisted(() => vi.fn().mockReturnValue(
  new Response(JSON.stringify({ error: "Service error" }), { status: 500, headers: { "Content-Type": "application/json" } }),
));

vi.mock("@/services/ticket-service", () => ({
  pullFromJira: mockPullFromJira,
}));

vi.mock("@/services/handle-service-error", () => ({
  handleServiceError: mockHandleServiceError,
}));

import { POST } from "./route";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function makeRequest(): Request {
  return new Request("http://localhost:3100/api/tickets/VPL-100/pull-from-jira", {
    method: "POST",
  });
}

describe("POST /api/tickets/[key]/pull-from-jira", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPullFromJira.mockResolvedValue({ ok: true });
  });

  it("returns result from ticketService.pullFromJira", async () => {
    mockPullFromJira.mockResolvedValue({ ok: true, ticket: { key: "VPL-100" } });

    const res = await POST(makeRequest(), makeParams("VPL-100"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockPullFromJira).toHaveBeenCalledWith("VPL-100");
  });

  it("returns 400 for invalid key", async () => {
    const res = await POST(makeRequest(), makeParams(""));
    expect(res.status).toBe(400);
  });

  it("calls handleServiceError when pullFromJira throws", async () => {
    const err = new Error("Service failed");
    mockPullFromJira.mockRejectedValue(err);

    await POST(makeRequest(), makeParams("VPL-100"));
    expect(mockHandleServiceError).toHaveBeenCalledWith(err);
  });
});
