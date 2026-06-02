// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

// Make isPipelineConfigured() return true so the deployment-detection helpers run.
vi.mock("@/lib/env", () => ({
  env: {
    BITBUCKET_WORKSPACE: "ws",
    BITBUCKET_REPO_SLUG: "valk-repo",
    BITBUCKET_EMAIL: "ci@example.com",
    BITBUCKET_APP_PASSWORD: "token",
    BITBUCKET_API_TOKEN: "",
    JIRA_EMAIL: "ci@example.com",
  },
}));

import {
  processStateChanges,
  processPRNotifications,
  classifyStepsForDeployment,
  classifyRunDeployment,
  backfillDeploymentDetection,
} from "./pipeline-sync";
import { alert, followedTicket, followedSprint, ticket, pipelineRun } from "@/db/schema";

/** Build a fetch Response-like object returning the given JSON, or a non-ok response. */
function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

/** Steps payload shape returned by the Bitbucket steps endpoint. */
function stepsPayload(names: string[]) {
  return { values: names.map((name) => ({ uuid: name, name })) };
}

function insertRun(overrides: Partial<typeof schema.pipelineRun.$inferSelect> = {}) {
  const run = makePipelineRun(overrides);
  testDb.insert(pipelineRun).values(run).run();
  return run;
}

const RECENT = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const OLD = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

function makePipelineRun(overrides: Partial<typeof schema.pipelineRun.$inferSelect> = {}): typeof schema.pipelineRun.$inferSelect {
  return {
    id: "valk-repo:1",
    repo: "repo",
    buildNumber: 1,
    branchName: "feature/VPL-123",
    ticketKey: "VPL-123",
    ticketKeys: null,
    state: "FAILED",
    previousState: "IN_PROGRESS",
    creator: null,
    durationSeconds: null,
    pipelineUrl: "https://bitbucket.org/ws/repo/pipelines/results/1",
    isDeployment: false,
    environment: null,
    environmentType: null,
    createdAt: "2026-04-14T10:00:00.000Z",
    completedAt: "2026-04-14T10:05:00.000Z",
    commitMessage: null,
    sourceBranch: null,
    prUrl: null,
    prTitle: null,
    prAuthor: null,
    ...overrides,
  };
}

describe("processStateChanges - pipeline failures", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates pipeline failure notification for FAILED transition", () => {
    processStateChanges([{ run: makePipelineRun({ state: "FAILED" }), oldState: "IN_PROGRESS" }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].category).toBe("pipeline");
    expect(alerts[0].message).toBe("Pipeline #1 failed for VPL-123");
    expect(alerts[0].jiraKey).toBe("VPL-123");
    expect(alerts[0].linkUrl).toBe("https://bitbucket.org/ws/repo/pipelines/results/1");
  });

  it("creates pipeline failure notification for STOPPED transition", () => {
    processStateChanges([{ run: makePipelineRun({ state: "STOPPED" }), oldState: "IN_PROGRESS" }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].category).toBe("pipeline");
    expect(alerts[0].message).toBe("Pipeline #1 failed for VPL-123");
  });

  it("does NOT create notification for SUCCESSFUL pipeline", () => {
    processStateChanges([{ run: makePipelineRun({ state: "SUCCESSFUL" }), oldState: "IN_PROGRESS" }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(0);
  });

  it("uses branch name fallback when ticketKey is null", () => {
    processStateChanges([{
      run: makePipelineRun({ state: "FAILED", ticketKey: null, branchName: "main" }),
      oldState: "IN_PROGRESS",
    }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toBe("Pipeline #1 failed on main");
    expect(alerts[0].jiraKey).toBeNull();
  });

  it("does not notify when oldState is not IN_PROGRESS", () => {
    processStateChanges([{ run: makePipelineRun({ state: "FAILED" }), oldState: "PAUSED" }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(0);
  });

  it("creates notifications for all tickets regardless of follow status", () => {
    processStateChanges([
      { run: makePipelineRun({ id: "repo:1", buildNumber: 1, ticketKey: "VPL-100", state: "FAILED" }), oldState: "IN_PROGRESS" },
      { run: makePipelineRun({ id: "repo:2", buildNumber: 2, ticketKey: "VPL-200", state: "FAILED" }), oldState: "IN_PROGRESS" },
    ]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(2);
  });
});

describe("processStateChanges - deployment notifications", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  it("creates production deployment success notification regardless of follow status", () => {
    processStateChanges([{
      run: makePipelineRun({ state: "SUCCESSFUL", isDeployment: true, environment: "Production", environmentType: "Production" }),
      oldState: "IN_PROGRESS",
    }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].category).toBe("deployment");
    expect(alerts[0].message).toBe("Deployed VPL-123 to Production");
    expect(alerts[0].jiraKey).toBe("VPL-123");
  });

  it("creates production deployment failure notification regardless of follow status", () => {
    processStateChanges([{
      run: makePipelineRun({ state: "FAILED", isDeployment: true, environment: "Production", environmentType: "Production" }),
      oldState: "IN_PROGRESS",
    }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].category).toBe("deployment");
    expect(alerts[0].message).toBe("Deployment to Production failed for VPL-123");
  });

  it("skips deployment notification when environment is null", () => {
    processStateChanges([{
      run: makePipelineRun({ state: "FAILED", isDeployment: true, environment: null }),
      oldState: "IN_PROGRESS",
    }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(0);
  });

  it("skips UAT deployment for non-followed ticket without followed sprint", () => {
    processStateChanges([{
      run: makePipelineRun({ state: "SUCCESSFUL", isDeployment: true, environment: "UAT2", environmentType: "Staging", ticketKey: "VPL-999" }),
      oldState: "IN_PROGRESS",
    }]);

    expect(testDb.select().from(alert).all()).toHaveLength(0);
  });

  it("notifies for UAT deployment when ticket is directly followed", () => {
    testDb.insert(followedTicket).values({ id: "ft-1", ticketKey: "VPL-123" }).run();

    processStateChanges([{
      run: makePipelineRun({ state: "SUCCESSFUL", isDeployment: true, environment: "UAT2", environmentType: "Staging" }),
      oldState: "IN_PROGRESS",
    }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toBe("Deployed VPL-123 to UAT2");
  });

  it("notifies for UAT deployment when ticket sprint is followed", () => {
    testDb.insert(ticket).values({
      jiraKey: "VPL-123", title: "Test ticket", status: "IN PROGRESS", sprintName: "VPL Sprint 42",
    }).run();
    testDb.insert(followedSprint).values({ sprintName: "VPL Sprint 42" }).run();

    processStateChanges([{
      run: makePipelineRun({ state: "FAILED", isDeployment: true, environment: "UAT1", environmentType: "Staging" }),
      oldState: "IN_PROGRESS",
    }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toBe("Deployment to UAT1 failed for VPL-123");
  });

  it("skips UAT deployment when sprint exists but is not followed", () => {
    testDb.insert(ticket).values({
      jiraKey: "VPL-123", title: "Test ticket", status: "IN PROGRESS", sprintName: "VPL Sprint 42",
    }).run();

    processStateChanges([{
      run: makePipelineRun({ state: "SUCCESSFUL", isDeployment: true, environment: "UAT3", environmentType: "Staging" }),
      oldState: "IN_PROGRESS",
    }]);

    expect(testDb.select().from(alert).all()).toHaveLength(0);
  });

  it("notifies for UAT when both ticket followed AND sprint followed (no duplicates)", () => {
    testDb.insert(followedTicket).values({ id: "ft-1", ticketKey: "VPL-123" }).run();
    testDb.insert(ticket).values({
      jiraKey: "VPL-123", title: "Test ticket", status: "IN PROGRESS", sprintName: "VPL Sprint 42",
    }).run();
    testDb.insert(followedSprint).values({ sprintName: "VPL Sprint 42" }).run();

    processStateChanges([{
      run: makePipelineRun({ state: "SUCCESSFUL", isDeployment: true, environment: "UAT2", environmentType: "Staging" }),
      oldState: "IN_PROGRESS",
    }]);

    expect(testDb.select().from(alert).all()).toHaveLength(1);
  });
});

describe("processPRNotifications", () => {
  beforeEach(() => {
    testDb = createTestDb();
  });

  const PR_URL = "https://bitbucket.org/ws/repo/pull-requests/42";

  it("does not create PR opened for non-merge pipeline (handled by syncPullRequests)", () => {
    processPRNotifications([{ prUrl: PR_URL, prTitle: "Add auth middleware", ticketKey: "VPL-123", isMerge: false, eventAt: new Date().toISOString() }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(0);
  });

  it("creates only PR merged for a merge commit pipeline", () => {
    processPRNotifications([{ prUrl: PR_URL, prTitle: "Add auth middleware", ticketKey: "VPL-123", isMerge: true, eventAt: new Date().toISOString() }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].category).toBe("pr");
    expect(alerts[0].message).toBe("PR merged: Add auth middleware");
    expect(alerts[0].linkUrl).toBe(`${PR_URL}#merged`);
    expect(alerts[0].jiraKey).toBe("VPL-123");
  });

  it("does not create duplicate PR merged on resync", () => {
    processPRNotifications([{ prUrl: PR_URL, prTitle: "Add auth middleware", ticketKey: "VPL-123", isMerge: true, eventAt: new Date().toISOString() }]);
    processPRNotifications([{ prUrl: PR_URL, prTitle: "Add auth middleware", ticketKey: "VPL-123", isMerge: true, eventAt: new Date().toISOString() }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(1);
  });

  it("handles null ticketKey", () => {
    processPRNotifications([{ prUrl: PR_URL, prTitle: "Hotfix branch", ticketKey: null, isMerge: true, eventAt: new Date().toISOString() }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].jiraKey).toBeNull();
  });

  it("does nothing for empty candidates list", () => {
    processPRNotifications([]);
    expect(testDb.select().from(alert).all()).toHaveLength(0);
  });

  it("handles multiple distinct merge PRs independently", () => {
    processPRNotifications([
      { prUrl: `${PR_URL}/1`, prTitle: "PR One", ticketKey: "VPL-1", isMerge: true, eventAt: new Date().toISOString() },
      { prUrl: `${PR_URL}/2`, prTitle: "PR Two", ticketKey: "VPL-2", isMerge: true, eventAt: new Date().toISOString() },
    ]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(2);
  });
});

describe("classifyStepsForDeployment (pure)", () => {
  it("flags a staging/uat-2 deploy step (the VPL-45794 case)", () => {
    expect(classifyStepsForDeployment([{ name: "Build" }, { name: "Deploy to uat-2" }])).toEqual({
      environment: "UAT2",
      type: "Staging",
    });
  });

  it("tolerates space and underscore separators in UAT step names", () => {
    expect(classifyStepsForDeployment([{ name: "Deploy uat 3" }])?.environment).toBe("UAT3");
    expect(classifyStepsForDeployment([{ name: "Deploy_uat_1" }])?.environment).toBe("UAT1");
  });

  it("returns null when a deploy step has no matching environment", () => {
    expect(classifyStepsForDeployment([{ name: "Deploy to nowhere" }])).toBeNull();
  });

  it("ignores 'set build' steps even when env-like", () => {
    expect(classifyStepsForDeployment([{ name: "Set build status for production" }])).toBeNull();
  });

  it("returns null when there is no deploy step at all", () => {
    expect(classifyStepsForDeployment([{ name: "Build" }, { name: "Test on staging" }])).toBeNull();
  });
});

describe("classifyRunDeployment (idempotent, retrying)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    testDb = createTestDb();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("flags a deployment run and stores environment", async () => {
    insertRun({ id: "valk-repo:1", buildNumber: 1, isDeployment: false });
    fetchMock.mockResolvedValueOnce(jsonResponse(stepsPayload(["Build", "Deploy to UAT2"])));

    const result = await classifyRunDeployment("valk-repo", 1, "valk-repo:1");

    expect(result).toBe("flagged");
    const row = testDb.select().from(pipelineRun).where(eq(pipelineRun.id, "valk-repo:1")).get();
    expect(row?.isDeployment).toBe(true);
    expect(row?.environment).toBe("UAT2");
    expect(row?.environmentType).toBe("Staging");
  });

  it("is idempotent: already-flagged run is not re-fetched", async () => {
    insertRun({ id: "valk-repo:1", buildNumber: 1, isDeployment: true, environment: "Production", environmentType: "Production" });

    const result = await classifyRunDeployment("valk-repo", 1, "valk-repo:1");

    expect(result).toBe("flagged");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns not-deployment without flagging when no deploy step", async () => {
    insertRun({ id: "valk-repo:1", buildNumber: 1, isDeployment: false });
    fetchMock.mockResolvedValueOnce(jsonResponse(stepsPayload(["Build", "Test"])));

    const result = await classifyRunDeployment("valk-repo", 1, "valk-repo:1");

    expect(result).toBe("not-deployment");
    expect(testDb.select().from(pipelineRun).where(eq(pipelineRun.id, "valk-repo:1")).get()?.isDeployment).toBe(false);
  });

  it("treats an HTTP error as transient and never writes isDeployment=false", async () => {
    insertRun({ id: "valk-repo:1", buildNumber: 1, isDeployment: false });
    fetchMock.mockResolvedValue(jsonResponse(null, false));

    const result = await classifyRunDeployment("valk-repo", 1, "valk-repo:1");

    expect(result).toBe("transient-error");
    expect(testDb.select().from(pipelineRun).where(eq(pipelineRun.id, "valk-repo:1")).get()?.isDeployment).toBe(false);
  });

  it("retries once in-cycle when the steps fetch throws, then flags", async () => {
    insertRun({ id: "valk-repo:1", buildNumber: 1, isDeployment: false });
    fetchMock
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(jsonResponse(stepsPayload(["Deploy to Production"])));

    const result = await classifyRunDeployment("valk-repo", 1, "valk-repo:1");

    expect(result).toBe("flagged");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(testDb.select().from(pipelineRun).where(eq(pipelineRun.id, "valk-repo:1")).get()?.environment).toBe("Production");
  });

  it("returns transient-error when both attempts throw", async () => {
    insertRun({ id: "valk-repo:1", buildNumber: 1, isDeployment: false });
    fetchMock.mockRejectedValue(new Error("network"));

    const result = await classifyRunDeployment("valk-repo", 1, "valk-repo:1");

    expect(result).toBe("transient-error");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("backfillDeploymentDetection", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    testDb = createTestDb();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("reclassifies a previously-missed deployment within the window", async () => {
    insertRun({ id: "valk-repo:10", buildNumber: 10, state: "SUCCESSFUL", isDeployment: false, createdAt: RECENT });
    fetchMock.mockResolvedValue(jsonResponse(stepsPayload(["Build", "Deploy to uat-2"])));

    const flagged = await backfillDeploymentDetection();

    expect(flagged).toBe(1);
    const row = testDb.select().from(pipelineRun).where(eq(pipelineRun.id, "valk-repo:10")).get();
    expect(row?.isDeployment).toBe(true);
    expect(row?.environment).toBe("UAT2");
  });

  it("classifies more than 5 completed runs in a single pass (no cap)", async () => {
    for (let i = 1; i <= 7; i++) {
      insertRun({ id: `valk-repo:${i}`, buildNumber: i, state: "SUCCESSFUL", isDeployment: false, createdAt: RECENT });
    }
    fetchMock.mockResolvedValue(jsonResponse(stepsPayload(["Deploy to UAT2"])));

    const flagged = await backfillDeploymentDetection();

    expect(flagged).toBe(7);
    const flaggedRows = testDb.select().from(pipelineRun).where(eq(pipelineRun.isDeployment, true)).all();
    expect(flaggedRows).toHaveLength(7);
  });

  it("ignores runs older than the backfill window", async () => {
    insertRun({ id: "valk-repo:99", buildNumber: 99, state: "SUCCESSFUL", isDeployment: false, createdAt: OLD });
    fetchMock.mockResolvedValue(jsonResponse(stepsPayload(["Deploy to UAT2"])));

    const flagged = await backfillDeploymentDetection();

    expect(flagged).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips IN_PROGRESS runs (only completed runs are backfilled)", async () => {
    insertRun({ id: "valk-repo:5", buildNumber: 5, state: "IN_PROGRESS", isDeployment: false, createdAt: RECENT });
    fetchMock.mockResolvedValue(jsonResponse(stepsPayload(["Deploy to UAT2"])));

    const flagged = await backfillDeploymentDetection();

    expect(flagged).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recovers a transient failure on the next backfill pass", async () => {
    insertRun({ id: "valk-repo:7", buildNumber: 7, state: "SUCCESSFUL", isDeployment: false, createdAt: RECENT });

    // First pass: both attempts fail -> stays unflagged, never written false.
    fetchMock.mockRejectedValue(new Error("network"));
    expect(await backfillDeploymentDetection()).toBe(0);
    expect(testDb.select().from(pipelineRun).where(eq(pipelineRun.id, "valk-repo:7")).get()?.isDeployment).toBe(false);

    // Second pass: steps API recovers -> run gets flagged.
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse(stepsPayload(["Deploy to Production"])));
    expect(await backfillDeploymentDetection()).toBe(1);
    expect(testDb.select().from(pipelineRun).where(eq(pipelineRun.id, "valk-repo:7")).get()?.isDeployment).toBe(true);
  });

  it("does not re-scan or flip already-flagged runs (idempotent)", async () => {
    insertRun({ id: "valk-repo:1", buildNumber: 1, state: "SUCCESSFUL", isDeployment: true, environment: "UAT2", environmentType: "Staging", createdAt: RECENT });
    fetchMock.mockResolvedValue(jsonResponse(stepsPayload(["Deploy to UAT2"])));

    const flagged = await backfillDeploymentDetection();

    expect(flagged).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(testDb.select().from(pipelineRun).where(eq(pipelineRun.id, "valk-repo:1")).get()?.isDeployment).toBe(true);
  });
});
