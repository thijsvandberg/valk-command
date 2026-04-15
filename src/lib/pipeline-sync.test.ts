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

import { processStateChanges, processPRNotifications } from "./pipeline-sync";
import { alert, followedTicket, followedSprint, ticket } from "@/db/schema";

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

  it("creates PR opened notification for a new PR", () => {
    processPRNotifications([{ prUrl: PR_URL, prTitle: "Add auth middleware", ticketKey: "VPL-123", isMerge: false, eventAt: new Date().toISOString() }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].category).toBe("pr");
    expect(alerts[0].message).toBe("PR opened: Add auth middleware");
    expect(alerts[0].linkUrl).toBe(PR_URL);
    expect(alerts[0].jiraKey).toBe("VPL-123");
  });

  it("creates both PR opened and PR merged for a merge commit pipeline", () => {
    processPRNotifications([{ prUrl: PR_URL, prTitle: "Add auth middleware", ticketKey: "VPL-123", isMerge: true, eventAt: new Date().toISOString() }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(2);
    const messages = alerts.map((a) => a.message).sort();
    expect(messages).toEqual(["PR merged: Add auth middleware", "PR opened: Add auth middleware"]);
    const linkUrls = alerts.map((a) => a.linkUrl);
    expect(linkUrls).toContain(PR_URL);
    expect(linkUrls).toContain(`${PR_URL}#merged`);
  });

  it("does not create duplicate PR opened on resync", () => {
    processPRNotifications([{ prUrl: PR_URL, prTitle: "Add auth middleware", ticketKey: "VPL-123", isMerge: false, eventAt: new Date().toISOString() }]);
    processPRNotifications([{ prUrl: PR_URL, prTitle: "Add auth middleware", ticketKey: "VPL-123", isMerge: false, eventAt: new Date().toISOString() }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(1);
  });

  it("does not create duplicate PR merged on resync", () => {
    processPRNotifications([{ prUrl: PR_URL, prTitle: "Add auth middleware", ticketKey: "VPL-123", isMerge: true, eventAt: new Date().toISOString() }]);
    processPRNotifications([{ prUrl: PR_URL, prTitle: "Add auth middleware", ticketKey: "VPL-123", isMerge: true, eventAt: new Date().toISOString() }]);

    // Still only 2 (opened + merged), not 4
    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(2);
  });

  it("handles null ticketKey", () => {
    processPRNotifications([{ prUrl: PR_URL, prTitle: "Hotfix branch", ticketKey: null, isMerge: false, eventAt: new Date().toISOString() }]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].jiraKey).toBeNull();
  });

  it("does nothing for empty candidates list", () => {
    processPRNotifications([]);
    expect(testDb.select().from(alert).all()).toHaveLength(0);
  });

  it("handles multiple distinct PRs independently", () => {
    processPRNotifications([
      { prUrl: `${PR_URL}/1`, prTitle: "PR One", ticketKey: "VPL-1", isMerge: false, eventAt: new Date().toISOString() },
      { prUrl: `${PR_URL}/2`, prTitle: "PR Two", ticketKey: "VPL-2", isMerge: false, eventAt: new Date().toISOString() },
    ]);

    const alerts = testDb.select().from(alert).all();
    expect(alerts).toHaveLength(2);
  });
});
