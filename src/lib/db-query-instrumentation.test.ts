// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { instrumentDatabase } from "./db-query-instrumentation";
import { getQueryStats, resetQueryStats, SLOW_QUERY_THRESHOLD_MS } from "./query-timer";

function makeDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, secret TEXT)");
  sqlite
    .prepare("INSERT INTO t (id, name, secret) VALUES (?, ?, ?)")
    .run(1, "alice", "topsecret");
  sqlite
    .prepare("INSERT INTO t (id, name, secret) VALUES (?, ?, ?)")
    .run(2, "bob", "hunter2");
  return instrumentDatabase(sqlite);
}

describe("instrumentDatabase", () => {
  beforeEach(() => {
    resetQueryStats();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records a timing under the parameterized SQL text label", () => {
    const db = makeDb();
    db.prepare("SELECT name FROM t WHERE id = ?").get(1);

    const stats = getQueryStats();
    const row = stats.find((s) => s.label === "SELECT name FROM t WHERE id = ?");
    expect(row).toBeDefined();
    expect(row?.count).toBe(1);
    expect(row?.avgMs).toBeGreaterThanOrEqual(0);
  });

  it("never records bound parameter values in the label", () => {
    const db = makeDb();
    db.prepare("SELECT * FROM t WHERE secret = ?").get("topsecret");

    const labels = getQueryStats().map((s) => s.label);
    // The label is the parameterized SQL; the bound value must not leak into it.
    expect(labels).toContain("SELECT * FROM t WHERE secret = ?");
    for (const label of labels) {
      expect(label).not.toContain("topsecret");
    }
  });

  it("logs a [slow-query] warn over the threshold with the SQL identity and no bound value", () => {
    // Register a SQL function that sleeps, so a query reliably crosses the
    // threshold without depending on wall-clock flakiness of a trivial query.
    const sqlite = new Database(":memory:");
    sqlite.function("slow_sleep", () => {
      const end = Date.now() + SLOW_QUERY_THRESHOLD_MS + 30;
      while (Date.now() < end) {
        /* busy-wait to exceed the slow threshold deterministically */
      }
      return 1;
    });
    instrumentDatabase(sqlite);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    sqlite.prepare("SELECT slow_sleep() WHERE 'secretvalue' = ?").get("secretvalue");

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const line = warnSpy.mock.calls[0][0] as string;
    expect(line).toContain("[slow-query]");
    expect(line).toContain("SELECT slow_sleep() WHERE 'secretvalue' = ?");
    // The bound value passed to .get() must not appear in the logged line.
    expect(line).not.toContain("= 'secretvalue'");
  });

  it("does not warn for fast queries", () => {
    const db = makeDb();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    db.prepare("SELECT 1").get();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("preserves .get() result", () => {
    const db = makeDb();
    const row = db.prepare("SELECT name FROM t WHERE id = ?").get(2) as {
      name: string;
    };
    expect(row.name).toBe("bob");
  });

  it("preserves .all() result", () => {
    const db = makeDb();
    const rows = db.prepare("SELECT id FROM t ORDER BY id").all() as {
      id: number;
    }[];
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  it("preserves .run() result (RunResult.changes)", () => {
    const db = makeDb();
    const result = db
      .prepare("UPDATE t SET name = ? WHERE id = ?")
      .run("carol", 1);
    expect(result.changes).toBe(1);
    const row = db.prepare("SELECT name FROM t WHERE id = 1").get() as {
      name: string;
    };
    expect(row.name).toBe("carol");
  });

  it("preserves .iterate() lazy iteration", () => {
    const db = makeDb();
    const names: string[] = [];
    for (const row of db
      .prepare("SELECT name FROM t ORDER BY id")
      .iterate() as IterableIterator<{ name: string }>) {
      names.push(row.name);
    }
    expect(names).toEqual(["alice", "bob"]);
  });

  it("preserves .pluck() so .get() returns the scalar column", () => {
    const db = makeDb();
    const value = db.prepare("SELECT name FROM t WHERE id = ?").pluck().get(2);
    expect(value).toBe("bob");
  });

  it("preserves .raw() so .all() returns array rows", () => {
    const db = makeDb();
    const rows = db
      .prepare("SELECT id, name FROM t ORDER BY id")
      .raw()
      .all() as unknown[][];
    expect(rows[0]).toEqual([1, "alice"]);
    expect(rows[1]).toEqual([2, "bob"]);
  });

  it("times the execution that runs at the end of a .raw() chain", () => {
    const db = makeDb();
    db.prepare("SELECT id FROM t WHERE id = ?").raw().all(1);
    const labels = getQueryStats().map((s) => s.label);
    expect(labels).toContain("SELECT id FROM t WHERE id = ?");
  });

  it("preserves .columns() metadata", () => {
    const db = makeDb();
    const cols = db.prepare("SELECT id, name FROM t").columns();
    expect(cols.map((c) => c.name)).toEqual(["id", "name"]);
  });

  it("preserves statement properties (.source/.reader)", () => {
    const db = makeDb();
    const stmt = db.prepare("SELECT id FROM t WHERE id = ?");
    expect(stmt.source).toBe("SELECT id FROM t WHERE id = ?");
    expect(stmt.reader).toBe(true);
  });

  it("is idempotent (double-instrument does not double-count)", () => {
    const db = makeDb();
    instrumentDatabase(db); // second call is a no-op
    db.prepare("SELECT 1 WHERE 1 = ?").get(1);
    const row = getQueryStats().find((s) => s.label === "SELECT 1 WHERE 1 = ?");
    expect(row?.count).toBe(1);
  });

  it("returns a handle without a real prepare untouched (does not throw)", () => {
    // Mirrors a minimally-mocked Database (see db/boot.test.ts): no prepare to
    // wrap, so instrumentation must be a no-op rather than crash at boot.
    const stub = { pragma: () => {} } as unknown as import("better-sqlite3").Database;
    expect(() => instrumentDatabase(stub)).not.toThrow();
    expect(instrumentDatabase(stub)).toBe(stub);
  });
});
