import { NextResponse } from "next/server";
import { db } from "@/db";
import { storyWriterSession, ticket, ticketLink, ticketMetadata } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ key: string }> };

/**
 * Activates split mode for the active story writer session.
 * If targetKey is provided, links the existing story as the split target.
 * Otherwise, creates a new story on Jira with title "Split: {originalTitle}",
 * inserts a minimal local record, and creates bidirectional ticketLink rows.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const { key } = await params;

  let body: { targetKey?: string; sprintId?: string; title?: string; issueType?: string } = {};
  try {
    body = await request.json();
  } catch {
    // body stays empty — that is fine
  }

  const session = await db
    .select()
    .from(storyWriterSession)
    .where(
      and(
        eq(storyWriterSession.ticketKey, key),
        eq(storyWriterSession.status, "active"),
      ),
    )
    .get();

  if (!session) {
    return NextResponse.json({ error: "No active story writer session" }, { status: 404 });
  }

  const originalTicket = await db
    .select()
    .from(ticket)
    .where(eq(ticket.jiraKey, key))
    .get();

  if (!originalTicket) {
    return NextResponse.json({ error: "Original ticket not found" }, { status: 404 });
  }

  let targetKey: string;

  if (body.targetKey) {
    // Use existing story — validate it exists locally
    const existing = await db
      .select()
      .from(ticket)
      .where(eq(ticket.jiraKey, body.targetKey))
      .get();

    if (!existing) {
      return NextResponse.json(
        { error: `Ticket ${body.targetKey} not found locally` },
        { status: 404 },
      );
    }

    targetKey = body.targetKey;
  } else {
    // Create a new story on Jira
    const splitTitle = body.title?.trim() || `Split: ${originalTicket.title}`;

    let newJiraKey: string;
    try {
      const result = await jiraClient.createIssue({
        summary: splitTitle,
        sprintId: body.sprintId,
        issueType: body.issueType,
        // Empty ADF doc prevents Jira from applying its default issue type template
        description: { type: "doc", version: 1, content: [] },
      });
      newJiraKey = result.key;
    } catch (err) {
      logger.error("story-writer-split", "Failed to create Jira issue:", err);
      return NextResponse.json(
        { error: "Failed to create story in Jira" },
        { status: 502 },
      );
    }

    // Insert minimal local ticket record so it can be referenced
    await db.insert(ticket).values({
      jiraKey: newJiraKey,
      title: splitTitle,
      type: body.issueType ?? "story",
      status: "TO DO",
    });

    await db.insert(ticketMetadata).values({
      jiraKey: newJiraKey,
      poStatus: "Uitwerken",
    });

    targetKey = newJiraKey;
  }

  // Upsert bidirectional split links (both "create new" and "link existing" paths).
  // Use "split to" / "is split from" to match Jira's relation labels.
  // Only create if a local-only link does not already exist for this pair (avoids duplicates).
  const targetTicket = await db.select().from(ticket).where(eq(ticket.jiraKey, targetKey)).get();

  const forwardExists = await db
    .select({ id: ticketLink.id })
    .from(ticketLink)
    .where(and(eq(ticketLink.ticketKey, key), eq(ticketLink.linkedKey, targetKey), isNull(ticketLink.jiraLinkId)))
    .get();

  if (!forwardExists) {
    await db.insert(ticketLink).values({
      id: randomUUID(),
      ticketKey: key,
      relation: "split to",
      linkedKey: targetKey,
      title: targetTicket?.title ?? targetKey,
      type: "story",
      status: targetTicket?.status ?? "TO DO",
    });
  }

  const reverseExists = await db
    .select({ id: ticketLink.id })
    .from(ticketLink)
    .where(and(eq(ticketLink.ticketKey, targetKey), eq(ticketLink.linkedKey, key), isNull(ticketLink.jiraLinkId)))
    .get();

  if (!reverseExists) {
    await db.insert(ticketLink).values({
      id: randomUUID(),
      ticketKey: targetKey,
      relation: "is split from",
      linkedKey: key,
      title: originalTicket.title,
      type: originalTicket.type ?? "story",
      status: originalTicket.status,
    });
  }

  // Update session with target
  await db
    .update(storyWriterSession)
    .set({
      targetTicketKey: targetKey,
      targetLocalDraft: "",
      updatedAt: new Date().toISOString(),
    })
    .where(eq(storyWriterSession.id, session.id));

  const updated = await db
    .select()
    .from(storyWriterSession)
    .where(eq(storyWriterSession.id, session.id))
    .get();

  await logActivity({
    type: "story-writer",
    scope: key,
    summary: `Activated split mode: ${key} → ${targetKey}`,
  });

  return NextResponse.json({ targetTicketKey: targetKey, session: updated }, { status: 201 });
}
