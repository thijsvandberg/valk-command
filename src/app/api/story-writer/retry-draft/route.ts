import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { applyRateLimit } from "@/lib/rate-limiter";
import { syncDraftToJira } from "@/lib/draft-sync";
import { eq } from "drizzle-orm";

/**
 * Retries Jira creation for a failed draft ticket.
 */
export async function POST(request: Request) {
  const limited = applyRateLimit("story-writer");
  if (limited) return limited;

  let body: { draftKey?: string; sprintId?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { draftKey, sprintId } = body;
  if (!draftKey || !draftKey.startsWith("DRAFT-")) {
    return NextResponse.json({ error: "Invalid draft key" }, { status: 400 });
  }

  const draft = await db.select().from(ticket).where(eq(ticket.jiraKey, draftKey)).get();
  if (!draft || draft.status !== "DRAFT_FAILED") {
    return NextResponse.json({ error: "Draft not in failed state" }, { status: 400 });
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
