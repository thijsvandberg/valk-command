import { db } from "@/db";
import { message } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Returns the next sequence number for a conversation.
 * SQLite is single-writer, so concurrent inserts serialize naturally.
 */
export function nextSequence(conversationId: string): number {
  const result = db
    .select({ max: sql<number>`COALESCE(MAX(${message.sequence}), 0)` })
    .from(message)
    .where(eq(message.conversationId, conversationId))
    .get();
  return (result?.max ?? 0) + 1;
}
