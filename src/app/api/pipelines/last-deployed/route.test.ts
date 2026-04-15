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

function insertDeployment(opts: {
  id: string;
  ticketKey: string | null;
  environment: string;
  state: "SUCCESSFUL" | "FAILED" | "IN_PROGRESS" | "STOPPED" | "PAUSED";
  completedAt: string;
}) {
  testDb.insert(pipelineRun).values({
    id: opts.id,
    repo: "valk-platform",
    branchName: "main",
    pipelineUrl: `https://bitbucket.org/build/${opts.id}`,
    ticketKey: opts.ticketKey,
    state: opts.state,
    buildNumber: 1,
    createdAt: opts.completedAt,
    completedAt: opts.completedAt,
    isDeployment: true,
    environment: opts.environment,
  }).run();
}

describe("GET /api/pipelines/last-deployed", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("returns empty map when no deployments exist", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({});
  });

  it("returns last deployment per ticket key", async () => {
    const older = new Date(Date.now() - 5000).toISOString();
    const newer = new Date(Date.now() - 1000).toISOString();
    insertDeployment({ id: "d1", ticketKey: "VPL-1", environment: "Staging", state: "SUCCESSFUL", completedAt: older });
    insertDeployment({ id: "d2", ticketKey: "VPL-1", environment: "Production", state: "SUCCESSFUL", completedAt: newer });

    const response = await GET();
    const data = await response.json();
    // Only the most recent deployment should be kept
    expect(data["VPL-1"]).toBeDefined();
    expect(data["VPL-1"].environment).toBe("Production");
    expect(data["VPL-1"].completedAt).toBe(newer);
  });

  it("excludes non-deployment pipeline runs", async () => {
    // Insert a non-deployment run (isDeployment = false)
    testDb.insert(pipelineRun).values({
      id: "non-deploy",
      repo: "valk-platform",
      branchName: "feature/test",
      pipelineUrl: "https://bitbucket.org/build/non-deploy",
      ticketKey: "VPL-3",
      state: "SUCCESSFUL",
      buildNumber: 1,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      isDeployment: false,
    }).run();

    const response = await GET();
    const data = await response.json();
    expect(data["VPL-3"]).toBeUndefined();
  });
});
