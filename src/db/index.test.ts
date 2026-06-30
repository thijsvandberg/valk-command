// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolve } from "path";
import { existsSync, unlinkSync } from "fs";
import * as schema from "./schema";

const MIGRATIONS_FOLDER = resolve(process.cwd(), "drizzle");

// Tables that must exist after migrations run
const EXPECTED_TABLES = [
  "conversation",
  "message",
  "ticket",
  "ticket_metadata",
  "workspace_task",
  "scheduled_job",
  "alert",
];

describe("db initialization and migrations", () => {
  it("creates all required tables via migrate()", () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite, { schema });

    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);

    for (const expected of EXPECTED_TABLES) {
      expect(tableNames).toContain(expected);
    }

    sqlite.close();
  });

  it("returns empty result from conversation table on fresh db", () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite, { schema });

    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    const rows = db.select().from(schema.conversation).all();
    expect(rows).toEqual([]);

    sqlite.close();
  });

  it("migrate() is idempotent — running twice does not throw", () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite, { schema });

    expect(() => {
      migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
      migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    }).not.toThrow();

    sqlite.close();
  });
});

describe("db with file-based sqlite", () => {
  const TEST_DB_PATH = resolve(process.cwd(), "test-migration.db");

  afterEach(() => {
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  it("creates tables on a fresh db file", () => {
    const sqlite = new Database(TEST_DB_PATH);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite, { schema });

    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    const rows = db.select().from(schema.conversation).all();
    expect(rows).toEqual([]);

    sqlite.close();
  });

  it("honors busy_timeout = 5000 on a real connection (read-back)", () => {
    const sqlite = new Database(TEST_DB_PATH);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");

    // Round-trip read-back proves SQLite accepted the value (guards against a
    // typo in the pragma string), not just that our code called pragma().
    expect(sqlite.pragma("busy_timeout", { simple: true })).toBe(5000);

    sqlite.close();
  });
});
