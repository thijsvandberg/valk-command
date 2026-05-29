import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { applyRateLimit } from "@/lib/rate-limiter";
import { syncDraftToJira } from "@/lib/draft-sync";
import { eq } from "drizzle-orm";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

/**
 * Retries Jira creation for a failed draft ticket.
 */
export async function POST(request: Request) {
  const limited = await applyRateLimit("story-writer");
  if (limited) return limited;

  const result = await parseJsonBody(request);
  if ("error" in result) return result.error;
  const body = result.data as { draftKey?: string; sprintId?: string };

  const { draftKey, sprintId } = body;
  if (!draftKey || !draftKey.startsWith("DRAFT-")) {
    return errorResponse("Invalid draft key", 400);
  }

  const draft = await db.select().from(ticket).where(eq(ticket.jiraKey, draftKey)).get();
  if (!draft || draft.status !== "DRAFT_FAILED") {
    return errorResponse("Draft not in failed state", 400);
  }

  // Reset to DRAFTING
  await db.update(ticket)
    .set({ status: "DRAFTING", description: null })
    .where(eq(ticket.jiraKey, draftKey));

  // Fire background sync
  syncDraftToJira(draftKey, {
    title: draft.title,
    sprintId,
    issueType: draft.type ?? "story",
  }).catch(() => {});

  return NextResponse.json({ status: "retrying" });
}
