import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/db";
import { ticket, ticketMetadata } from "@/db/schema";
import { logActivity } from "@/lib/activity-logger";
import { applyRateLimit } from "@/lib/rate-limiter";

/**
 * Creates a local-only draft ticket with a temporary DRAFT-xxx key.
 * No Jira API call is made; the caller navigates immediately.
 * Background Jira sync is triggered separately.
 */
export async function POST(request: Request) {
  const limited = applyRateLimit("story-writer");
  if (limited) return limited;

  let body: { title?: string; sprintId?: string; issueType?: string } = {};
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
  const draftKey = `DRAFT-${randomUUID().slice(0, 8)}`;

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

  return NextResponse.json({
    key: draftKey,
    title,
    issueType,
    sprintId: body.sprintId ?? null,
  }, { status: 201 });
}
