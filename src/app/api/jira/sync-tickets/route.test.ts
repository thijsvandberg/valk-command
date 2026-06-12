// @vitest-environment node
// HTTP-only route test: the service layer is mocked. DB persistence behavior
// (ticket/metadata/story-version rows, re-sync dedup) is covered by
// src/lib/sync-tickets-service.test.ts and src/lib/upsert-issue.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockApplyRateLimit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rate-limiter", () => ({ applyRateLimit: mockApplyRateLimit }));

const mockSyncSprint = vi.hoisted(() => vi.fn());
const mockSyncIndividualTickets = vi.hoisted(() => vi.fn());
const mockSyncBacklog = vi.hoisted(() => vi.fn());
const mockPlanGroupKeys = vi.hoisted(() => vi.fn());
const mockReconcileGroupMembership = vi.hoisted(() => vi.fn());

// Stub with the same shape as the real class. Both route.ts and this test
// reference the mocked module's export, so instanceof checks in the route
// resolve against this class.
const { SyncValidationError } = vi.hoisted(() => {
  class SyncValidationError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.name = "SyncValidationError";
      this.status = status;
    }
  }
  return { SyncValidationError };
});

vi.mock("@/lib/sync-tickets-service", () => ({
  syncSprint: mockSyncSprint,
  syncIndividualTickets: mockSyncIndividualTickets,
  syncBacklog: mockSyncBacklog,
  planGroupKeys: mockPlanGroupKeys,
  reconcileGroupMembership: mockReconcileGroupMembership,
  SyncValidationError,
}));

import { POST } from "./route";

function makeRequest(query?: string, body?: unknown): Request {
  const url = query
    ? `http://localhost:3100/api/jira/sync-tickets?${query}`
    : "http://localhost:3100/api/jira/sync-tickets";
  return new Request(url, {
    method: "POST",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("POST /api/jira/sync-tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApplyRateLimit.mockResolvedValue(null);
    mockSyncSprint.mockResolvedValue({ count: 2, live: false });
    mockSyncIndividualTickets.mockResolvedValue({ count: 1, live: false });
    mockSyncBacklog.mockResolvedValue({ count: 5, live: false });
    mockPlanGroupKeys.mockResolvedValue(["VPL-1", "VPL-2"]);
    mockReconcileGroupMembership.mockResolvedValue({ reconciled: 0 });
  });

  it("returns the rate-limit response when limited", async () => {
    const limited = new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 });
    mockApplyRateLimit.mockResolvedValueOnce(limited);

    const response = await POST(makeRequest("sprintId=134"));

    expect(response.status).toBe(429);
    expect(mockSyncSprint).not.toHaveBeenCalled();
  });

  describe("sprint/backlog sync", () => {
    it("delegates a sprint sync to syncSprint and returns its result", async () => {
      const response = await POST(makeRequest("sprintId=134"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ count: 2, live: false });
      expect(mockSyncSprint).toHaveBeenCalledWith("134", "bulk", expect.anything());
    });

    it("passes the strategy query param through", async () => {
      await POST(makeRequest("sprintId=134&strategy=timestamp-first"));
      expect(mockSyncSprint).toHaveBeenCalledWith("134", "timestamp-first", expect.anything());
    });

    it("routes __backlog__ to syncBacklog", async () => {
      const response = await POST(makeRequest("sprintId=__backlog__"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ count: 5, live: false });
      expect(mockSyncBacklog).toHaveBeenCalledWith("bulk", expect.anything());
      expect(mockSyncSprint).not.toHaveBeenCalled();
    });

    it("maps SyncValidationError from the service to its status", async () => {
      mockSyncSprint.mockRejectedValueOnce(new SyncValidationError("sprintId is required"));

      const response = await POST(makeRequest());

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("sprintId is required");
    });

    it("maps a SyncValidationError with a custom status", async () => {
      mockSyncSprint.mockRejectedValueOnce(new SyncValidationError("Sprint not found", 404));

      const response = await POST(makeRequest("sprintId=999"));

      expect(response.status).toBe(404);
    });

    it("returns 500 when the service throws a generic error", async () => {
      mockSyncSprint.mockRejectedValueOnce(new Error("Network failure"));

      const response = await POST(makeRequest("sprintId=134"));

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  describe("individual ticket sync (body ticketKeys)", () => {
    it("delegates listed tickets to syncIndividualTickets", async () => {
      const response = await POST(makeRequest(undefined, { ticketKeys: ["VPL-1", "VPL-2"] }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ count: 1, live: false });
      expect(mockSyncIndividualTickets).toHaveBeenCalledWith(["VPL-1", "VPL-2"], expect.anything());
      expect(mockSyncSprint).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid ticketKeys in body", async () => {
      const response = await POST(makeRequest(undefined, { ticketKeys: [123, null] }));

      expect(response.status).toBe(400);
      expect(mockSyncIndividualTickets).not.toHaveBeenCalled();
    });

    it("returns 400 for empty ticketKeys array", async () => {
      const response = await POST(makeRequest(undefined, { ticketKeys: [] }));

      expect(response.status).toBe(400);
      expect(mockSyncIndividualTickets).not.toHaveBeenCalled();
    });
  });

  describe("mode=plan", () => {
    it("returns the planned keys for a sprint target", async () => {
      const response = await POST(makeRequest("mode=plan&sprintId=134"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ keys: ["VPL-1", "VPL-2"] });
      expect(mockPlanGroupKeys).toHaveBeenCalledWith({ kind: "sprint", id: "134" }, expect.anything());
    });

    it("resolves an epic target from epicKey", async () => {
      await POST(makeRequest("mode=plan&epicKey=VPL-E1"));
      expect(mockPlanGroupKeys).toHaveBeenCalledWith({ kind: "epic", id: "VPL-E1" }, expect.anything());
    });

    it("returns 400 when neither sprintId nor epicKey is given", async () => {
      const response = await POST(makeRequest("mode=plan"));

      expect(response.status).toBe(400);
      expect(mockPlanGroupKeys).not.toHaveBeenCalled();
    });

    it("returns 500 when planning throws a generic error", async () => {
      mockPlanGroupKeys.mockRejectedValueOnce(new Error("boom"));

      const response = await POST(makeRequest("mode=plan&sprintId=134"));

      expect(response.status).toBe(500);
    });
  });

  describe("mode=reconcile", () => {
    it("reconciles the posted keys against the target", async () => {
      const response = await POST(makeRequest("mode=reconcile&sprintId=134", { keys: ["VPL-1"] }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ reconciled: 0 });
      expect(mockReconcileGroupMembership).toHaveBeenCalledWith(
        { kind: "sprint", id: "134" },
        ["VPL-1"],
        expect.anything(),
      );
    });

    it("returns 400 for an invalid body", async () => {
      const response = await POST(makeRequest("mode=reconcile&sprintId=134", { keys: "nope" }));

      expect(response.status).toBe(400);
      expect(mockReconcileGroupMembership).not.toHaveBeenCalled();
    });

    it("returns 400 when the body is not JSON", async () => {
      const request = new Request("http://localhost:3100/api/jira/sync-tickets?mode=reconcile&sprintId=134", {
        method: "POST",
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(mockReconcileGroupMembership).not.toHaveBeenCalled();
    });

    it("returns 400 when neither sprintId nor epicKey is given", async () => {
      const response = await POST(makeRequest("mode=reconcile", { keys: [] }));

      expect(response.status).toBe(400);
      expect(mockReconcileGroupMembership).not.toHaveBeenCalled();
    });

    it("returns 500 when reconciliation throws a generic error", async () => {
      mockReconcileGroupMembership.mockRejectedValueOnce(new Error("boom"));

      const response = await POST(makeRequest("mode=reconcile&sprintId=134", { keys: ["VPL-1"] }));

      expect(response.status).toBe(500);
    });
  });
});
