// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb } from "@/db/test-utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@/db/schema";
import { appSetting } from "@/db/schema";

let testDb: BetterSQLite3Database<typeof schema>;

vi.mock("@/db", () => ({
  get db() {
    return testDb;
  },
}));

describe("task-registry", () => {
  beforeEach(async () => {
    testDb = createTestDb();
    vi.resetModules();
  });

  async function importRegistry() {
    const mod = await import("./task-registry");
    return mod;
  }

  it("registerIndependentTask adds a task", async () => {
    const { registerIndependentTask, getIndependentTaskStatuses } = await importRegistry();
    registerIndependentTask({
      name: "test-task",
      label: "Test Task",
      description: "A test task",
      intervalMs: 60000,
      lastRunKey: "test-task:lastRun",
      lastResultKey: "test-task:lastResult",
    });

    const statuses = getIndependentTaskStatuses();
    expect(statuses).toHaveLength(1);
    expect(statuses[0].name).toBe("test-task");
  });

  it("registerIndependentTask is idempotent for same name", async () => {
    const { registerIndependentTask, getIndependentTaskStatuses } = await importRegistry();
    const task = {
      name: "dup-task",
      label: "Dup",
      description: "Dup",
      intervalMs: 1000,
      lastRunKey: "dup:lr",
      lastResultKey: "dup:res",
    };
    registerIndependentTask(task);
    registerIndependentTask(task);

    const statuses = getIndependentTaskStatuses();
    expect(statuses.filter((s) => s.name === "dup-task")).toHaveLength(1);
  });

  it("runIndependentTaskNow returns null for unknown task", async () => {
    const { runIndependentTaskNow } = await importRegistry();
    const result = await runIndependentTaskNow("nonexistent");
    expect(result).toBeNull();
  });

  it("runIndependentTaskNow calls runNow and returns result", async () => {
    const { registerIndependentTask, runIndependentTaskNow } = await importRegistry();
    const runNow = vi.fn().mockResolvedValue({ ran: true, count: 5 });
    registerIndependentTask({
      name: "runnable",
      label: "Runnable",
      description: "Can run",
      intervalMs: 1000,
      lastRunKey: "runnable:lr",
      lastResultKey: "runnable:res",
      runNow,
    });

    const result = await runIndependentTaskNow("runnable");
    expect(runNow).toHaveBeenCalled();
    expect(result).toEqual({ ran: true, count: 5 });
  });

  it("getIndependentTaskStatuses reads lastRun and lastResult from DB", async () => {
    const { registerIndependentTask, getIndependentTaskStatuses } = await importRegistry();

    testDb.insert(appSetting).values({ key: "task-a:lastRun", value: "2026-05-26T10:00:00Z" }).run();
    testDb.insert(appSetting).values({ key: "task-a:lastResult", value: JSON.stringify({ count: 3 }) }).run();

    registerIndependentTask({
      name: "task-a",
      label: "Task A",
      description: "Task A desc",
      intervalMs: 5000,
      lastRunKey: "task-a:lastRun",
      lastResultKey: "task-a:lastResult",
    });

    const statuses = getIndependentTaskStatuses();
    const status = statuses.find((s) => s.name === "task-a")!;
    expect(status.lastRunAt).toBe("2026-05-26T10:00:00Z");
    expect(status.lastResult).toEqual({ count: 3 });
    expect(status.enabled).toBe(true);
  });

  it("getIndependentTaskStatuses yields null lastResult on a corrupt stored row (no throw)", async () => {
    const { registerIndependentTask, getIndependentTaskStatuses } = await importRegistry();

    testDb.insert(appSetting).values({ key: "task-bad:lastResult", value: "{not valid json" }).run();

    registerIndependentTask({
      name: "task-bad",
      label: "Task Bad",
      description: "Corrupt result row",
      intervalMs: 5000,
      lastRunKey: "task-bad:lastRun",
      lastResultKey: "task-bad:lastResult",
    });

    const statuses = getIndependentTaskStatuses();
    const status = statuses.find((s) => s.name === "task-bad")!;
    expect(status.lastResult).toBeNull();
  });

  it("getIndependentTaskStatuses handles missing DB rows", async () => {
    const { registerIndependentTask, getIndependentTaskStatuses } = await importRegistry();
    registerIndependentTask({
      name: "no-data",
      label: "No Data",
      description: "No DB rows",
      intervalMs: 1000,
      lastRunKey: "no-data:lr",
      lastResultKey: "no-data:res",
    });

    const statuses = getIndependentTaskStatuses();
    const status = statuses.find((s) => s.name === "no-data")!;
    expect(status.lastRunAt).toBeNull();
    expect(status.lastResult).toBeNull();
  });
});
