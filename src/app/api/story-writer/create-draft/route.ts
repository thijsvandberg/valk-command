import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/db";
import { ticket, ticketMetadata } from "@/db/schema";
import { logActivity } from "@/lib/activity-logger";
import { applyRateLimit } from "@/lib/rate-limiter";
import { syncDraftToJira } from "@/lib/draft-sync";

/**
 * Creates a local-only draft ticket with a DRAFT-xxx key.
 * Accepts an optional client-provided draftKey for instant navigation.
 * Jira creation runs in the background.
 */
export async function POST(request: Request) {
  const limited = applyRateLimit("story-writer");
  if (limited) return limited;

  let body: { title?: string; sprintId?: string; issueType?: string; draftKey?: string } = {};
  try {
    body = await request.json();
  } catch {
    // body stays empty
  }

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const issueType = body.issueType ?? "story";
  const sprintId = body.sprintId;
  const draftKey = body.draftKey?.startsWith("DRAFT-")
    ? body.draftKey
    : `DRAFT-${randomUUID().slice(0, 8)}`;

  await Promise.all([
    db.insert(ticket).values({
      jiraKey: draftKey,
      title,
      type: issueType,
      status: "DRAFTING",
    }),
    db.insert(ticketMetadata).values({
      jiraKey: draftKey,
      readiness: "drafting",
    }),
    logActivity({
      type: "story-writer",
      scope: draftKey,
      summary: `Created draft story: ${draftKey} — ${title}`,
    }),
  ]);

  // Fire background Jira sync (non-blocking)
  syncDraftToJira(draftKey, { title, sprintId, issueType }).catch(() => {});

  return NextResponse.json({
    key: draftKey,
    title,
    issueType,
    sprintId: sprintId ?? null,
  }, { status: 201 });
}
