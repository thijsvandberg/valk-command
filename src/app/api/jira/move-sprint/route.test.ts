// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { NextRequest } from "next/server";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

const mockMoveToSprint = vi.fn().mockResolvedValue(undefined);
const mockMoveToBacklog = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/jira-client", () => ({
  jiraClient: {
    moveToSprint: (...args: unknown[]) => mockMoveToSprint(...args),
    moveToBacklog: (...args: unknown[]) => mockMoveToBacklog(...args),
  },
}));

vi.mock("@/lib/cache", () => ({
  cache: {
    invalidate: vi.fn(),
  },
}));

import { POST } from "./route";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";

function makeRequest(body: unknown): Request {
  return new NextRequest("http://localhost/api/jira/move-sprint", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/jira/move-sprint", () => {
  beforeEach(() => {
    testDb = createTestDb();
    mockMoveToSprint.mockReset().mockResolvedValue(undefined);
    mockMoveToBacklog.mockReset().mockResolvedValue(undefined);

    testDb.insert(ticket).values({
      jiraKey: "VPL-100",
      title: "Test ticket",
      status: "TO DO",
      sprintName: "123",
    }).run();
  });

  it("moves ticket to a numbered sprint", async () => {
    const req = makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "456" });
    const res = await POST(req);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.movedCount).toBe(1);
    expect(mockMoveToSprint).toHaveBeenCalledWith(["VPL-100"], 456);

    const t = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-100")).get();
    expect(t!.sprintName).toBe("456");
  });

  it("moves ticket to backlog by clearing sprint", async () => {
    const req = makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "__backlog__" });
    const res = await POST(req);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.movedCount).toBe(1);
    expect(mockMoveToBacklog).toHaveBeenCalledWith(["VPL-100"]);
    expect(mockMoveToSprint).not.toHaveBeenCalled();

    const t = testDb.select().from(ticket).where(eq(ticket.jiraKey, "VPL-100")).get();
    expect(t!.sprintName).toBe("");
  });

  it("returns 400 for missing issueKeys", async () => {
    const req = makeRequest({ targetSprintId: "456" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-numeric non-backlog targetSprintId", async () => {
    const req = makeRequest({ issueKeys: ["VPL-100"], targetSprintId: "abc" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
