// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { seedTicket, seedTicketSubtask } from "@/test/builders";
import { createJiraClientMock } from "@/test/mocks";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/jira-client", () => createJiraClientMock());

vi.mock("@/lib/activity-logger", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cache", () => ({
  cache: {
    invalidate: vi.fn(),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// BRDG-471: the route arms the auto-test-doc trigger; the helper's own gating is
// covered in test-doc-background.test.ts, so here we only assert the route decides
// to call it. `after` runs its callback inline so the spy is invoked synchronously.
const mockMaybeAutoGen = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/test-doc-background", () => ({
  maybeAutoGenerateTestDoc: (...args: unknown[]) => mockMaybeAutoGen(...args),
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => { void fn(); } };
});

import { PUT } from "./route";
import { jiraClient, JiraApiError } from "@/lib/jira-client";
import { cache } from "@/lib/cache";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";

function ticketStatus(key: string): string | undefined {
  return testDb.select().from(ticket).where(eq(ticket.jiraKey, key)).all()[0]?.status;
}

function makeParams(key: string): { params: Promise<{ key: string }> } {
  return { params: Promise.resolve({ key }) };
}

function putRequest(key: string, body: unknown): Request {
  return new Request(`http://localhost:3100/api/tickets/${key}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/tickets/[key]/status", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.clearAllMocks();
  });

  it("returns 400 for missing status", async () => {
    seedTicket(testDb, { jiraKey: "BRDG-1" });

    const response = await PUT(
      putRequest("BRDG-1", {}),
      makeParams("BRDG-1"),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it("returns 400 for invalid status value", async () => {
    seedTicket(testDb, { jiraKey: "BRDG-1" });

    const response = await PUT(
      putRequest("BRDG-1", { status: "INVALID" }),
      makeParams("BRDG-1"),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("status must be one of");
  });

  it("returns 404 when ticket not found", async () => {
    const response = await PUT(
      putRequest("BRDG-999", { status: "DONE" }),
      makeParams("BRDG-999"),
    );

    expect(response.status).toBe(404);
  });

  it("updates status and returns it", async () => {
    seedTicket(testDb, { jiraKey: "BRDG-1" });

    const response = await PUT(
      putRequest("BRDG-1", { status: "IN PROGRESS" }),
      makeParams("BRDG-1"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("IN PROGRESS");
  });

  it("invalidates the parent ticket detail cache when the updated ticket is a subtask", async () => {
    seedTicket(testDb, { jiraKey: "BRDG-1" });
    seedTicket(testDb, { jiraKey: "BRDG-2" });
    seedTicketSubtask(testDb, { ticketKey: "BRDG-1", subtaskKey: "BRDG-2" });

    await PUT(putRequest("BRDG-2", { status: "DEPRECATED" }), makeParams("BRDG-2"));

    expect(cache.invalidate).toHaveBeenCalledWith("/api/tickets/BRDG-1");
  });

  it("invalidates the epic detail and epics progress caches", async () => {
    seedTicket(testDb, { jiraKey: "BRDG-1", epicKey: "BRDG-100" });

    await PUT(putRequest("BRDG-1", { status: "DONE" }), makeParams("BRDG-1"));

    expect(cache.invalidate).toHaveBeenCalledWith("/api/tickets/BRDG-100");
    expect(cache.invalidate).toHaveBeenCalledWith("/api/epics/progress");
  });

  it("still invalidates epics progress when the ticket has no epic", async () => {
    seedTicket(testDb, { jiraKey: "BRDG-1" });

    await PUT(putRequest("BRDG-1", { status: "DONE" }), makeParams("BRDG-1"));

    expect(cache.invalidate).toHaveBeenCalledWith("/api/epics/progress");
  });

  it("applies locally with a jiraWarning when Jira is unreachable (transient)", async () => {
    seedTicket(testDb, { jiraKey: "BRDG-1", status: "IN PROGRESS" });
    vi.mocked(jiraClient.transitionIssue).mockRejectedValueOnce(
      new Error("Jira unavailable"),
    );

    const response = await PUT(
      putRequest("BRDG-1", { status: "DONE" }),
      makeParams("BRDG-1"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("DONE");
    expect(data.jiraWarning).toBe("Jira update failed");
    expect(ticketStatus("BRDG-1")).toBe("DONE");
  });

  it("returns 409 and does NOT change local status when Jira offers no matching transition", async () => {
    seedTicket(testDb, { jiraKey: "BRDG-1", status: "IN PROGRESS" });
    vi.mocked(jiraClient.transitionIssue).mockRejectedValueOnce(
      new Error('No available transition to "DONE" for issue BRDG-1'),
    );

    const response = await PUT(
      putRequest("BRDG-1", { status: "DONE" }),
      makeParams("BRDG-1"),
    );

    expect(response.status).toBe(409);
    // Jira refused, so the local status must stay as Jira has it — never stranded.
    expect(ticketStatus("BRDG-1")).toBe("IN PROGRESS");
  });

  it("returns 409 and does NOT change local status on a 4xx Jira rejection", async () => {
    seedTicket(testDb, { jiraKey: "BRDG-1", status: "IN PROGRESS" });
    vi.mocked(jiraClient.transitionIssue).mockRejectedValueOnce(
      new JiraApiError(400, "Bad Request", "transition not valid", "/transitions"),
    );

    const response = await PUT(
      putRequest("BRDG-1", { status: "DONE" }),
      makeParams("BRDG-1"),
    );

    expect(response.status).toBe(409);
    expect(ticketStatus("BRDG-1")).toBe("IN PROGRESS");
  });

  it("still applies locally on a 5xx Jira error (treated as transient, self-heals on next sync)", async () => {
    seedTicket(testDb, { jiraKey: "BRDG-1", status: "IN PROGRESS" });
    vi.mocked(jiraClient.transitionIssue).mockRejectedValueOnce(
      new JiraApiError(503, "Service Unavailable", "", "/transitions"),
    );

    const response = await PUT(
      putRequest("BRDG-1", { status: "DONE" }),
      makeParams("BRDG-1"),
    );

    expect(response.status).toBe(200);
    expect(ticketStatus("BRDG-1")).toBe("DONE");
  });

  describe("auto-test-doc trigger (BRDG-471)", () => {
    it("arms the trigger on a move into TEST", async () => {
      seedTicket(testDb, { jiraKey: "BRDG-1", status: "IN PROGRESS" });

      await PUT(putRequest("BRDG-1", { status: "TEST" }), makeParams("BRDG-1"));

      expect(mockMaybeAutoGen).toHaveBeenCalledWith("BRDG-1");
    });

    it("arms the trigger on a move into Done", async () => {
      seedTicket(testDb, { jiraKey: "BRDG-1", status: "IN PROGRESS" });

      await PUT(putRequest("BRDG-1", { status: "DONE" }), makeParams("BRDG-1"));

      expect(mockMaybeAutoGen).toHaveBeenCalledWith("BRDG-1");
    });

    it("does not arm the trigger on a transition that is neither Test nor Done", async () => {
      seedTicket(testDb, { jiraKey: "BRDG-1", status: "TO DO" });

      await PUT(putRequest("BRDG-1", { status: "IN PROGRESS" }), makeParams("BRDG-1"));

      expect(mockMaybeAutoGen).not.toHaveBeenCalled();
    });

    it("does not arm the trigger when the ticket is already in TEST", async () => {
      seedTicket(testDb, { jiraKey: "BRDG-1", status: "TEST" });

      await PUT(putRequest("BRDG-1", { status: "TEST" }), makeParams("BRDG-1"));

      expect(mockMaybeAutoGen).not.toHaveBeenCalled();
    });

    it("does not arm the trigger when Jira rejects the move to TEST", async () => {
      seedTicket(testDb, { jiraKey: "BRDG-1", status: "IN PROGRESS" });
      vi.mocked(jiraClient.transitionIssue).mockRejectedValueOnce(
        new JiraApiError(400, "Bad Request", "transition not valid", "/transitions"),
      );

      const response = await PUT(putRequest("BRDG-1", { status: "TEST" }), makeParams("BRDG-1"));

      expect(response.status).toBe(409);
      expect(mockMaybeAutoGen).not.toHaveBeenCalled();
    });
  });
});
