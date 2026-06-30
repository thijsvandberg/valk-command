import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { resolve } from "path";
import { statSync } from "fs";
import * as schema from "./schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { instrumentDatabase } from "@/lib/db-query-instrumentation";

const VACUUM_THRESHOLD_MB = 150;

let _db: BetterSQLite3Database<typeof schema> | null = null;

function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

function getDb() {
  if (isBuildPhase()) {
    throw new Error("Database must not be initialized during build");
  }
  if (!_db) {
    try {
      const sqlite = new Database(env.DB_PATH);
      sqlite.pragma("journal_mode = WAL");
      sqlite.pragma("foreign_keys = ON");
      // Instrument at the central DB layer so every prepared query is timed
      // automatically (BRDG-404), instead of hand-instrumenting call sites.
      instrumentDatabase(sqlite);
      _db = drizzle(sqlite, { schema });
      // Run migrations on first connection so all tables exist before any query
      migrate(_db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
      // Let SQLite analyze index statistics for optimal query planning
      sqlite.pragma("optimize");
    } catch (err) {
      // A broken DB open/migrate would otherwise surface as a vague 500 on the
      // first query; log it loudly with the path so the boot cause is obvious.
      // Null out the partial handle so a later call retries from scratch.
      _db = null;
      logger.error("db", "open/migrate failed", { DB_PATH: env.DB_PATH }, err);
      throw err;
    }
    logger.info("db", "ready (migrations applied)");

    // Suggest VACUUM when DB file exceeds threshold
    try {
      const sizeMb = statSync(env.DB_PATH).size / (1024 * 1024);
      if (sizeMb > VACUUM_THRESHOLD_MB) {
        console.warn(
          `[db-maintenance] Database is ${Math.round(sizeMb)}MB (threshold: ${VACUUM_THRESHOLD_MB}MB). ` +
          `Consider running VACUUM to reclaim space.`,
        );
      }
    } catch {
      // File stat failed, skip check
    }
  }
  return _db;
}

/**
 * Eagerly open the DB (and run migrations) so the "db ready" / "open failed"
 * line lands at boot instead of mid-request. Called from instrumentation's
 * register(); a thin wrapper over getDb() so it shares the same logging and the
 * one-time init guard. Skipped during the build phase, where getDb() throws.
 */
export function initDb(): void {
  if (isBuildPhase()) return;
  getDb();
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
