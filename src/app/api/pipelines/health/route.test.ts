import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

import { GET } from "./route";
import { pipelineRun } from "@/db/schema";

function insertRun(opts: {
  id: string;
  ticketKey: string | null;
  state: "SUCCESSFUL" | "FAILED" | "IN_PROGRESS" | "STOPPED" | "PAUSED";
  createdAt?: string;
  completedAt?: string;
}) {
  testDb.insert(pipelineRun).values({
    id: opts.id,
    repo: "valk-platform",
    branchName: "main",
    pipelineUrl: `https://bitbucket.org/build/${opts.id}`,
    ticketKey: opts.ticketKey,
    state: opts.state,
    buildNumber: 1,
    createdAt: opts.createdAt ?? new Date().toISOString(),
    completedAt: opts.completedAt ?? new Date().toISOString(),
    isDeployment: false,
  }).run();
}

describe("GET /api/pipelines/health", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty map when no pipeline runs exist", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({});
  });

  it("returns green status when all runs are successful", async () => {
    insertRun({ id: "r1", ticketKey: "VPL-1", state: "SUCCESSFUL" });
    insertRun({ id: "r2", ticketKey: "VPL-1", state: "SUCCESSFUL" });

    const response = await GET();
    const data = await response.json();
    expect(data["VPL-1"].status).toBe("green");
    expect(data["VPL-1"].recentFails).toBe(0);
  });

  it("returns red status when last completed run failed", async () => {
    // More recent failure
    insertRun({ id: "r1", ticketKey: "VPL-2", state: "FAILED", createdAt: new Date(Date.now() - 1000).toISOString() });
    // Older success
    insertRun({ id: "r2", ticketKey: "VPL-2", state: "SUCCESSFUL", createdAt: new Date(Date.now() - 2000).toISOString() });

    const response = await GET();
    const data = await response.json();
    expect(data["VPL-2"].status).toBe("red");
    expect(data["VPL-2"].recentFails).toBe(1);
  });
});
