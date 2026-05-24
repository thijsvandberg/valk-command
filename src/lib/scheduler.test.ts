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

import { defineTask, getRegisteredTasks, tick } from "./scheduler";
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
      expect(found?.enabled).toBe(true);
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
  });
});
