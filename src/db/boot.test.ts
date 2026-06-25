// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// Boot-visibility tests for db/index.ts: getDb()/initDb() must log a clear
// "ready" line on success and a loud error carrying DB_PATH (then rethrow) on a
// failed open/migrate. The heavy deps are mocked so we drive both paths without
// touching a real SQLite file, and assert on the (mocked) logger calls.

const TEST_DB_PATH = "/tmp/bridge-boot-test.db";

vi.mock("@/lib/env", () => ({ env: { DB_PATH: TEST_DB_PATH } }));

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// A minimal Database stub. `new Database()` must be constructible, so it is a
// real function (an arrow fn cannot be used with `new`). Per-test behavior is
// driven through a mutable holder: the open can throw, and the migrate() mock
// decides migrate success vs failure. statSync is stubbed to a small size so the
// VACUUM branch stays quiet.
const pragma = vi.fn();
const dbBehavior: { openCalls: number; openImpl: () => void } = {
  openCalls: 0,
  openImpl: () => {},
};

vi.mock("better-sqlite3", () => {
  function FakeDatabase() {
    dbBehavior.openCalls += 1;
    dbBehavior.openImpl();
    return { pragma };
  }
  return { default: FakeDatabase };
});

vi.mock("drizzle-orm/better-sqlite3", () => ({
  drizzle: vi.fn(() => ({ __drizzle: true })),
}));

const migrate = vi.fn();
vi.mock("drizzle-orm/better-sqlite3/migrator", () => ({ migrate }));

vi.mock("fs", () => ({ statSync: vi.fn(() => ({ size: 1024 })) }));

import { logger } from "@/lib/logger";

// Fresh module instance per test resets the module-level `_db` singleton so each
// case starts from an unopened DB.
async function loadDb() {
  vi.resetModules();
  return import("./index");
}

describe("db boot visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PHASE;
    dbBehavior.openCalls = 0;
    dbBehavior.openImpl = () => {};
    migrate.mockImplementation(() => {});
  });

  it("logs a ready line at info on a successful open + migrate", async () => {
    const { initDb } = await loadDb();
    initDb();

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("db", "ready (migrations applied)");
  });

  it("logs the ready line only once even across repeated access", async () => {
    const { db, initDb } = await loadDb();
    initDb();
    // Subsequent property access goes through the Proxy -> getDb(), which is a
    // no-op once `_db` is set, so no second ready line.
    void db.select;
    void db.select;
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it("logs an error with DB_PATH and rethrows when migrate fails", async () => {
    const boom = new Error("disk I/O error");
    migrate.mockImplementation(() => {
      throw boom;
    });

    const { initDb } = await loadDb();
    expect(() => initDb()).toThrow(boom);

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);
    const call = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("db");
    expect(call[1]).toBe("open/migrate failed");
    // The path is passed as structured context so the boot cause is obvious.
    expect(call[2]).toEqual({ DB_PATH: TEST_DB_PATH });
    // The original error is forwarded so its stack survives.
    expect(call[3]).toBe(boom);
  });

  it("logs an error with DB_PATH and rethrows when the open fails", async () => {
    const boom = new Error("unable to open database file");
    dbBehavior.openImpl = () => {
      throw boom;
    };

    const { initDb } = await loadDb();
    expect(() => initDb()).toThrow(boom);

    const call = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toEqual({ DB_PATH: TEST_DB_PATH });
    expect(call[3]).toBe(boom);
  });

  it("retries the open on the next access after a failed init", async () => {
    const boom = new Error("transient open failure");
    dbBehavior.openImpl = () => {
      // Fail only the first open; subsequent opens succeed.
      if (dbBehavior.openCalls === 1) throw boom;
    };

    const { db, initDb } = await loadDb();
    expect(() => initDb()).toThrow(boom);

    // Second access should re-attempt (open succeeds now) and succeed.
    expect(() => void db.select).not.toThrow();
    expect(logger.info).toHaveBeenCalledWith("db", "ready (migrations applied)");
  });

  it("initDb is a no-op during the build phase (never opens the DB)", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    const { initDb } = await loadDb();
    initDb();
    expect(dbBehavior.openCalls).toBe(0);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });
});
