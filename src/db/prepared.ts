import { db } from "@/db";
import { poComment, jiraComment, activityLog, conversation, message } from "@/db/schema";
import { eq, desc, or, isNull, sql } from "drizzle-orm";

// Prepared query helpers for high-frequency queries.
// Uses sql.placeholder() for proper parameterization.
// better-sqlite3 caches compiled statements at the native level,
// so repeated .prepare() calls with the same SQL are cheap.

export function preparedPoComments(params: { key: unknown }) {
  return db
    .select()
    .from(poComment)
    .where(eq(poComment.ticketKey, sql.placeholder("key")))
    .prepare()
    .all(params);
}

export function preparedJiraComments(params: { key: unknown }) {
  return db
    .select()
    .from(jiraComment)
    .where(eq(jiraComment.ticketKey, sql.placeholder("key")))
    .prepare()
    .all(params);
}

export function preparedConversationList() {
  return db
    .select()
    .from(conversation)
    .where(
      or(
        isNull(conversation.relatedTicket),
        sql`EXISTS (SELECT 1 FROM ${message} WHERE ${message.conversationId} = ${conversation.id})`,
      ),
    )
    .orderBy(desc(conversation.createdAt))
    .limit(200)
    .prepare()
    .all();
}

export function preparedActivityLog() {
  return db
    .select()
    .from(activityLog)
    .orderBy(desc(activityLog.startedAt))
    .limit(20)
    .prepare()
    .all();
}
