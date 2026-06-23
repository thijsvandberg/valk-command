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

vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(),
}));

import { defineTask, getRegisteredTasks, tick, runTaskNow, setTaskEnabled, getTaskStatuses } from "./scheduler";
import { createNotification } from "@/lib/notifications";

// Each test uses a unique task name to avoid cross-test interference with the
// module-level task registry.
let taskCounter = 0;
function uniqueName() {
  return `test-task-${taskCounter++}`;
}

describe("scheduler", () => {
  beforeEach(() => {
    testDb = createTestDb();
    vi.resetAllMocks();
  });

  describe("defineTask", () => {
    it("registers a new task", () => {
      const name = uniqueName();
      defineTask(name, "Test Label", "Test description", 60_000, async () => ({}));
      const tasks = getRegisteredTasks();
      const found = tasks.find((t) => t.name === name);
      expect(found).toBeDefined();
      expect(found?.label).toBe("Test Label");
      expect(found?.intervalMs).toBe(60_000);
      expect(found?.enabledByDefault).toBe(true);
    });

    it("registers a task disabled by default when enabledByDefault is false", () => {
      const name = uniqueName();
      defineTask(name, "Off Task", "Desc", 60_000, async () => ({}), false);
      const found = getRegisteredTasks().find((t) => t.name === name);
      expect(found?.enabledByDefault).toBe(false);
    });

    it("updates existing task when called with same name", () => {
      const name = uniqueName();
      defineTask(name, "Original", "Desc", 10_000, async () => ({}));
      defineTask(name, "Updated", "Updated desc", 20_000, async () => ({ updated: true }));
      const tasks = getRegisteredTasks();
      const matches = tasks.filter((t) => t.name === name);
      expect(matches).toHaveLength(1);
      expect(matches[0].label).toBe("Updated");
      expect(matches[0].intervalMs).toBe(20_000);
    });
  });

  describe("getRegisteredTasks", () => {
    it("returns an array of registered tasks", () => {
      const name = uniqueName();
      defineTask(name, "Label", "Desc", 1000, async () => ({}));
      const result = getRegisteredTasks();
      expect(Array.isArray(result)).toBe(true);
      const found = result.find((t) => t.name === name);
      expect(found).toBeDefined();
    });
  });

  describe("tick", () => {
    it("runs an overdue task and returns its name in ran[]", async () => {
      const name = uniqueName();
      const handler = vi.fn().mockResolvedValue({ done: true });
      // intervalMs = 0 means it is always overdue
      defineTask(name, "Overdue Task", "Desc", 0, handler);

      const result = await tick();

      expect(result.ran).toContain(name);
      expect(result.results[name]).toEqual({ done: true });
      expect(handler).toHaveBeenCalled();
    });

    it("skips a task that is not overdue", async () => {
      const name = uniqueName();
      const handler = vi.fn().mockResolvedValue({});
      // Very large interval so the task is never overdue
      defineTask(name, "Far-future Task", "Desc", 999_999_999, handler);

      // Set last_run to right now so elapsed is nearly 0
      testDb.insert(appSetting).values({
        key: `scheduler:${name}:last_run`,
        value: new Date().toISOString(),
      }).run();

      const result = await tick();

      expect(result.ran).not.toContain(name);
      expect(handler).not.toHaveBeenCalled();
    });

    it("persists lastRun after running a task", async () => {
      const name = uniqueName();
      defineTask(name, "Persist Test", "Desc", 0, async () => ({ persisted: true }));

      await tick();

      const rows = testDb.select().from(appSetting).all();
      const lastRunRow = rows.find((r) => r.key === `scheduler:${name}:last_run`);
      expect(lastRunRow).toBeDefined();
    });

    it("handles task handler errors gracefully and notifies", async () => {
      const name = uniqueName();
      vi.mocked(createNotification).mockImplementation(() => undefined);
      defineTask(name, "Failing Task", "Desc", 0, async () => {
        throw new Error("task exploded");
      });

      // Should not throw even when the handler fails
      await expect(tick()).resolves.not.toThrow();

      // Notification should be created for the failure
      expect(createNotification).toHaveBeenCalledWith(
        "scheduler",
        expect.stringContaining("Failing Task"),
        expect.objectContaining({ category: "scheduler" }),
      );
    });

    it("prevents concurrent tick execution", async () => {
      const name = uniqueName();
      let resolveHandler!: () => void;
      const blockingPromise = new Promise<void>((res) => {
        resolveHandler = res;
      });

      defineTask(name, "Blocking Task", "Desc", 0, async () => {
        await blockingPromise;
        return {};
      });

      // Start tick but don't await it yet
      const first = tick();
      // Second tick should immediately return with empty ran
      const second = await tick();
      expect(second.ran).toHaveLength(0);

      resolveHandler();
      await first;
    });

    it("skips a task disabled by persisted setting even when overdue", async () => {
      const name = uniqueName();
      const handler = vi.fn().mockResolvedValue({});
      defineTask(name, "Persisted Off", "Desc", 0, handler);
      await setTaskEnabled(name, false);

      const result = await tick();

      expect(result.ran).not.toContain(name);
      expect(handler).not.toHaveBeenCalled();
    });

    it("skips a task whose enabledByDefault is false when no override exists", async () => {
      const name = uniqueName();
      const handler = vi.fn().mockResolvedValue({});
      defineTask(name, "Default Off", "Desc", 0, handler, false);

      const result = await tick();

      expect(result.ran).not.toContain(name);
      expect(handler).not.toHaveBeenCalled();
    });

    it("runs a default-off task once a persisted setting enables it", async () => {
      const name = uniqueName();
      const handler = vi.fn().mockResolvedValue({ ok: true });
      defineTask(name, "Enabled Override", "Desc", 0, handler, false);
      await setTaskEnabled(name, true);

      const result = await tick();

      expect(result.ran).toContain(name);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe("setTaskEnabled", () => {
    it("persists the override and reflects it in getTaskStatuses", async () => {
      const name = uniqueName();
      defineTask(name, "Toggle Me", "Desc", 60_000, async () => ({}), false);

      const ok = await setTaskEnabled(name, true);
      expect(ok).toBe(true);

      const enabledRow = testDb.select().from(appSetting).all()
        .find((r) => r.key === `scheduler:${name}:enabled`);
      expect(enabledRow?.value).toBe("true");

      const status = (await getTaskStatuses()).find((t) => t.name === name);
      expect(status?.enabled).toBe(true);
    });

    it("returns false for an unknown task name (validation)", async () => {
      const ok = await setTaskEnabled("does-not-exist", true);
      expect(ok).toBe(false);
    });
  });

  describe("getTaskStatuses", () => {
    it("yields null lastResult on a corrupt stored row instead of throwing", async () => {
      const name = uniqueName();
      defineTask(name, "Corrupt Result", "Desc", 60_000, async () => ({}));
      testDb.insert(appSetting).values({
        key: `scheduler:${name}:last_result`,
        value: "{broken json",
      }).run();

      const statuses = await getTaskStatuses();
      const status = statuses.find((t) => t.name === name);
      expect(status?.lastResult).toBeNull();
    });
  });

  describe("runTaskNow", () => {
    it("runs a disabled task on manual trigger (manual override)", async () => {
      const name = uniqueName();
      const handler = vi.fn().mockResolvedValue({ manual: true });
      defineTask(name, "Manual Override", "Desc", 999_999_999, handler, false);
      await setTaskEnabled(name, false);

      const result = await runTaskNow(name);

      expect(result).toEqual({ manual: true });
      expect(handler).toHaveBeenCalled();
    });
  });

  describe("deprecation task registration defaults", () => {
    // The Backlog Deprecation Review epic requires the three deprecation scans
    // to be OFF out of the box so they never run until the PO opts in.
    it("registers the three deprecation tasks disabled by default; others enabled", async () => {
      const { registerScheduledTasks } = await import("./scheduled-tasks");
      registerScheduledTasks();
      const tasks = getRegisteredTasks();
      const byName = (n: string) => tasks.find((t) => t.name === n);

      expect(byName("deprecation-staleness-scan")?.enabledByDefault).toBe(false);
      expect(byName("deprecation-deep-scan")?.enabledByDefault).toBe(false);
      expect(byName("deprecation-auto-enqueue")?.enabledByDefault).toBe(false);

      // A representative non-deprecation task keeps defaulting to enabled.
      expect(byName("incremental-sync")?.enabledByDefault).toBe(true);
    });
  });
});
