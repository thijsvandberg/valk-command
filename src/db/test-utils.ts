import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
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

  testDb.run(sql`
    CREATE TABLE conversation (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      related_ticket TEXT
    )
  `);

  testDb.run(sql`
    CREATE TABLE message (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      workspace_task_id TEXT
    )
  `);

  testDb.run(sql`
    CREATE TABLE scheduled_job (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      last_result_summary TEXT
    )
  `);

  testDb.run(sql`
    CREATE TABLE ticket (
      jira_key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT,
      status TEXT NOT NULL,
      assignee TEXT,
      assignee_avatar TEXT,
      epic TEXT,
      flagged INTEGER NOT NULL DEFAULT 0,
      reporter TEXT,
      description TEXT,
      acceptance_criteria TEXT,
      story_points REAL,
      sprint_name TEXT,
      labels TEXT,
      priority TEXT,
      components TEXT,
      jira_created_at TEXT,
      jira_updated_at TEXT,
      last_synced_at TEXT
    )
  `);

  testDb.run(sql`
    CREATE TABLE ticket_metadata (
      jira_key TEXT PRIMARY KEY REFERENCES ticket(jira_key),
      po_status TEXT,
      refinement_readiness TEXT NOT NULL DEFAULT 'not_ready' CHECK(refinement_readiness IN ('not_ready', 'in_progress', 'ready')),
      quality_score REAL,
      quality_stale INTEGER NOT NULL DEFAULT 0,
      effort_scores TEXT,
      po_notes TEXT,
      po_priority INTEGER,
      test_status TEXT NOT NULL DEFAULT 'untested' CHECK(test_status IN ('untested', 'pass', 'fail')),
      last_test_run_at TEXT,
      last_test_report_url TEXT
    )
  `);

  testDb.run(sql`
    CREATE TABLE sprint_slot (
      slot_index INTEGER PRIMARY KEY,
      sprint_id TEXT NOT NULL,
      sprint_name TEXT NOT NULL
    )
  `);

  testDb.run(sql`
    CREATE TABLE app_setting (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  testDb.run(sql`
    CREATE TABLE story_version (
      id TEXT PRIMARY KEY,
      jira_key TEXT NOT NULL REFERENCES ticket(jira_key),
      description TEXT NOT NULL,
      acceptance_criteria TEXT,
      content_hash TEXT NOT NULL,
      tag TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  testDb.run(sql`
    CREATE TABLE workspace_task (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'completed', 'failed')),
      started_at TEXT,
      completed_at TEXT,
      related_ticket TEXT,
      conversation_id TEXT
    )
  `);

  testDb.run(sql`
    CREATE TABLE alert (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      jira_key TEXT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0
    )
  `);

  testDb.run(sql`
    CREATE TABLE po_comment (
      id TEXT PRIMARY KEY,
      ticket_key TEXT NOT NULL REFERENCES ticket(jira_key),
      author TEXT NOT NULL DEFAULT 'Product Owner',
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  testDb.run(sql`
    CREATE TABLE jira_comment (
      id TEXT PRIMARY KEY,
      ticket_key TEXT NOT NULL REFERENCES ticket(jira_key),
      jira_comment_id TEXT,
      author_name TEXT NOT NULL,
      author_avatar TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  testDb.run(sql`
    CREATE TABLE ticket_local_edit (
      id TEXT PRIMARY KEY,
      ticket_key TEXT NOT NULL REFERENCES ticket(jira_key),
      field TEXT NOT NULL CHECK(field IN ('title', 'description')),
      local_value TEXT NOT NULL,
      base_jira_version TEXT,
      modified_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  testDb.run(sql`
    CREATE TABLE sync_log (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('sprint-sync', 'ticket-sync', 'single-ticket', 'comment-sync', 'webhook')),
      scope TEXT,
      status TEXT NOT NULL CHECK(status IN ('running', 'success', 'failed', 'cancelled')),
      summary TEXT,
      error_detail TEXT,
      duration_ms INTEGER,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      acknowledged INTEGER NOT NULL DEFAULT 0
    )
  `);

  testDb.run(sql`
    CREATE TABLE ticket_attachment (
      id TEXT PRIMARY KEY,
      ticket_key TEXT NOT NULL REFERENCES ticket(jira_key),
      jira_attachment_id TEXT,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      downloaded_at TEXT,
      local_path TEXT,
      cleaned_at TEXT
    )
  `);

  return testDb;
}
