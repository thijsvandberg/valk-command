// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: vi.fn().mockReturnValue(null) }));

const mockPushToJira = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
const mockHandleServiceError = vi.hoisted(() => vi.fn().mockReturnValue(
  new Response(JSON.stringify({ error: "Service error" }), { status: 500, headers: { "Content-Type": "application/json" } }),
));
const mockResolveDraftKey = vi.hoisted(() => vi.fn((key: string) => key));

vi.mock("@/services/ticket-service", () => ({
  pushToJira: mockPushToJira,
}));

vi.mock("@/services/handle-service-error", () => ({
  handleServiceError: mockHandleServiceError,
}));

vi.mock("@/lib/draft-sync", () => ({
  resolveDraftKey: mockResolveDraftKey,
}));

import { POST } from "./route";

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function makeRequest(body?: unknown): Request {
  return new Request("http://localhost:3100/api/tickets/VPL-100/push-to-jira", {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/tickets/[key]/push-to-jira", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPushToJira.mockResolvedValue({ ok: true });
    mockResolveDraftKey.mockImplementation((key: string) => key);
  });

  it("returns result from ticketService.pushToJira", async () => {
    const res = await POST(makeRequest(), makeParams("VPL-100"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockPushToJira).toHaveBeenCalledWith("VPL-100", false);
  });

  it("passes force: true from request body", async () => {
    await POST(makeRequest({ force: true }), makeParams("VPL-100"));
    expect(mockPushToJira).toHaveBeenCalledWith("VPL-100", true);
  });

  it("resolves DRAFT key before calling pushToJira", async () => {
    mockResolveDraftKey.mockReturnValue("VPL-999");

    await POST(makeRequest(), makeParams("DRAFT-abc"));
    expect(mockResolveDraftKey).toHaveBeenCalledWith("DRAFT-abc");
    expect(mockPushToJira).toHaveBeenCalledWith("VPL-999", false);
  });

  it("returns conflict result as-is", async () => {
    mockPushToJira.mockResolvedValue({ conflict: true, remoteVersion: "abc" });

    const res = await POST(makeRequest(), makeParams("VPL-100"));
    const data = await res.json();
    expect(data.conflict).toBe(true);
  });

  it("calls handleServiceError when pushToJira throws", async () => {
    const err = new Error("Push failed");
    mockPushToJira.mockRejectedValue(err);

    await POST(makeRequest(), makeParams("VPL-100"));
    expect(mockHandleServiceError).toHaveBeenCalledWith(err);
  });

  it("returns 400 for invalid key", async () => {
    const res = await POST(makeRequest(), makeParams(""));
    expect(res.status).toBe(400);
  });
});
