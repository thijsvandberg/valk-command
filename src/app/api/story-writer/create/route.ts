import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketMetadata } from "@/db/schema";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { applyRateLimit } from "@/lib/rate-limiter";

/**
 * Creates a brand-new Jira story and a minimal local ticket record.
 * Returns the new ticket key so the caller can navigate to /tickets/[key]/write.
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

  let newKey: string;
  try {
    const result = await jiraClient.createIssue({
      summary: title,
      sprintId: body.sprintId,
      issueType,
      // Empty ADF doc prevents Jira from applying its default issue type template
      description: { type: "doc", version: 1, content: [] },
    });
    newKey = result.key;
  } catch (err) {
    console.error("[story-writer/create] Failed to create Jira issue:", err);
    return NextResponse.json(
      { error: "Failed to create story in Jira" },
      { status: 502 },
    );
  }

  await db.insert(ticket).values({
    jiraKey: newKey,
    title,
    type: issueType,
    status: "TO DO",
  });

  await db.insert(ticketMetadata).values({
    jiraKey: newKey,
    poStatus: "Uitwerken",
  });

  await logActivity({
    type: "story-writer",
    scope: newKey,
    summary: `Created new story: ${newKey} — ${title}`,
  });

  return NextResponse.json({ key: newKey }, { status: 201 });
}
