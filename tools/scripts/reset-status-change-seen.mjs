// Dev-only helper (BRDG-474 review): resurface the board's status-change lines by
// clearing the per-user "seen" queue, so the different statusline variants (status
// change, +what's-new, sprint-add, deploy, and the state-derived test-doc lines)
// become visible again on the live board without fabricating any data.
//
// Usage:
//   node tools/scripts/reset-status-change-seen.mjs backup   # snapshot only
//   node tools/scripts/reset-status-change-seen.mjs reset     # snapshot, then clear
//   node tools/scripts/reset-status-change-seen.mjs restore   # re-insert from snapshot
//
// The snapshot lives next to this script; restore is a full round-trip so the reset
// is reversible. Runs against the dev DB (DB_PATH, default sqlite.db).

import Database from "better-sqlite3";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = join(HERE, ".status-change-seen-backup.json");
const DB_PATH = process.env.DB_PATH || "sqlite.db";
const action = process.argv[2] ?? "reset";

const db = new Database(DB_PATH);
db.pragma("busy_timeout = 5000");

function snapshot() {
  const rows = db.prepare("SELECT user_id, status_change_id, seen_at FROM status_change_seen").all();
  writeFileSync(SNAPSHOT, JSON.stringify(rows, null, 2));
  return rows;
}

if (action === "backup") {
  const rows = snapshot();
  console.log(`Backed up ${rows.length} seen rows to ${SNAPSHOT}`);
} else if (action === "reset") {
  const rows = snapshot();
  const del = db.prepare("DELETE FROM status_change_seen").run();
  console.log(`Backed up ${rows.length} rows, then cleared ${del.changes} seen rows.`);
  console.log("Refresh the board — previously-dismissed status-change lines reappear.");
} else if (action === "restore") {
  if (!existsSync(SNAPSHOT)) {
    console.error(`No snapshot at ${SNAPSHOT}; nothing to restore.`);
    process.exit(1);
  }
  const rows = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  const insert = db.prepare(
    "INSERT OR IGNORE INTO status_change_seen (user_id, status_change_id, seen_at) VALUES (?, ?, ?)",
  );
  const tx = db.transaction((all) => {
    for (const r of all) insert.run(r.user_id, r.status_change_id, r.seen_at);
  });
  tx(rows);
  console.log(`Restored ${rows.length} seen rows from snapshot.`);
} else {
  console.error(`Unknown action "${action}". Use backup | reset | restore.`);
  process.exit(1);
}

db.close();
