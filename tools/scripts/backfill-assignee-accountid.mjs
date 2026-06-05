// One-off backfill: populate ticket.assignee_account_id from Jira issue data.
// The token can read issues but not search users, so we sample one issue per
// distinct assignee, read its real accountId, then update all rows by name.
// Run: node --env-file=.env.local tools/scripts/backfill-assignee-accountid.mjs
import Database from "better-sqlite3";

const cloudId = process.env.JIRA_CLOUD_ID;
const baseUrl = cloudId ? `https://api.atlassian.com/ex/jira/${cloudId}` : process.env.JIRA_BASE_URL;
const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
const dbPath = process.env.DB_PATH ?? "sqlite.db";

const db = new Database(dbPath);

// One representative issue key per distinct assignee.
const rows = db.prepare(
  "SELECT assignee, MIN(jira_key) AS key FROM ticket WHERE assignee IS NOT NULL GROUP BY assignee",
).all();
console.log(`Resolving accountIds for ${rows.length} distinct assignees...`);

async function getAccountId(key) {
  const res = await fetch(`${baseUrl}/rest/api/3/issue/${key}?fields=assignee`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) return { status: res.status, accountId: null };
  const body = await res.json();
  return { status: res.status, accountId: body?.fields?.assignee?.accountId ?? null };
}

const update = db.prepare("UPDATE ticket SET assignee_account_id = ? WHERE assignee = ?");
let resolved = 0;
let updatedRows = 0;
for (const { assignee, key } of rows) {
  const { status, accountId } = await getAccountId(key);
  if (accountId) {
    const info = update.run(accountId, assignee);
    resolved++;
    updatedRows += info.changes;
    console.log(`  ${assignee}: ${accountId} (${info.changes} rows)`);
  } else {
    // The sampled issue's current assignee no longer matches the stored name
    // (it changed in Jira since sync). Skipped; the next full sync will catch it.
    console.log(`  ${assignee}: no accountId on ${key} (status ${status}) — skipped`);
  }
}

console.log(`\nDone. Resolved ${resolved}/${rows.length} assignees, updated ${updatedRows} ticket rows.`);
db.close();
