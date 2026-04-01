import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolve } from "path";
import * as schema from "./schema";

const openHandles: Database.Database[] = [];

export function closeAllTestDbs() {
  for (const handle of openHandles) {
    try { handle.close(); } catch { /* already closed */ }
  }
  openHandles.length = 0;
}

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  openHandles.push(sqlite);
  const testDb = drizzle(sqlite, { schema });

  migrate(testDb, { migrationsFolder: resolve(process.cwd(), "drizzle") });

  return testDb;
}
