import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversation, storyWriterSession } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

const VALID_ACTIONS = ["delete", "markRead", "markUnread"] as const;
type BulkAction = typeof VALID_ACTIONS[number];

interface BulkBody {
  ids: string[];
  action: BulkAction;
}

export async function PATCH(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as BulkBody;

  if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.some((id) => typeof id !== "string")) {
    return errorResponse("ids must be a non-empty array of strings", 400);
  }

  if (body.ids.length > 200) {
    return errorResponse("Maximum 200 conversations per bulk operation", 400);
  }

  if (!VALID_ACTIONS.includes(body.action)) {
    return errorResponse(`action must be one of: ${VALID_ACTIONS.join(", ")}`, 400);
  }

  const { ids, action } = body;

  if (action === "delete") {
    await db.delete(storyWriterSession).where(inArray(storyWriterSession.conversationId, ids));
    await db.delete(conversation).where(inArray(conversation.id, ids));
    return NextResponse.json({ updated: ids.length });
  }

  if (action === "markRead") {
    const result = await db
      .update(conversation)
      .set({ readAt: new Date().toISOString() })
      .where(inArray(conversation.id, ids));
    return NextResponse.json({ updated: result.changes });
  }

  if (action === "markUnread") {
    const result = await db
      .update(conversation)
      .set({ readAt: null })
      .where(inArray(conversation.id, ids));
    return NextResponse.json({ updated: result.changes });
  }

  return errorResponse("Unknown action", 400);
}
