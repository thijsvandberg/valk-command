import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolve } from "path";
import * as schema from "./schema";
import { env } from "@/lib/env";

let _db: BetterSQLite3Database<typeof schema> | null = null;

function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

function getDb() {
  if (isBuildPhase()) {
    throw new Error("Database must not be initialized during build");
  }
  if (!_db) {
    const sqlite = new Database(env.DB_PATH);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    _db = drizzle(sqlite, { schema });
    // Run migrations on first connection so all tables exist before any query
    migrate(_db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
    // Let SQLite analyze index statistics for optimal query planning
    sqlite.pragma("optimize");
  }
  return _db;
}

export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});
