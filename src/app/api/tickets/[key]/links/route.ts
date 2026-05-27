import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { resolveDraftKey } from "@/lib/draft-sync";
import { db } from "@/db";
import { ticketLink, relatedSuggestionCache } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";
import { syncJiraTimestamp } from "@/lib/sync-jira-timestamp";
import { randomUUID } from "crypto";

type RouteContext = { params: Promise<{ key: string }> };

const VALID_LINK_TYPES = [
  "Relates",
  "Blocks",
  "Cloners",
  "Duplicate",
];

// Map relation labels to Jira link type names and directions
const RELATION_TO_JIRA: Record<string, { type: string; direction: "outward" | "inward" }> = {
  "relates to":        { type: "Relates",    direction: "outward" },
  "blocks":            { type: "Blocks",     direction: "outward" },
  "is blocked by":     { type: "Blocks",     direction: "inward" },
  "clones":            { type: "Cloners",    direction: "outward" },
  "is cloned by":      { type: "Cloners",    direction: "inward" },
  "duplicates":        { type: "Duplicate",  direction: "outward" },
  "is duplicated by":  { type: "Duplicate",  direction: "inward" },
};

export async function POST(request: Request, { params }: RouteContext) {
  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

  const t = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });

  if (!t) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  let body: { targetKey?: string; linkType?: string; relation?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const targetKey = body.targetKey?.trim();
  const relation = body.relation?.trim();

  if (!targetKey) {
    return NextResponse.json({ error: "targetKey is required" }, { status: 400 });
  }

  // Determine Jira link type and direction from the relation label
  const mapping = relation ? RELATION_TO_JIRA[relation.toLowerCase()] : null;
  const jiraLinkType = body.linkType ?? mapping?.type ?? "Relates";

  if (!VALID_LINK_TYPES.includes(jiraLinkType)) {
    return NextResponse.json({ error: `Invalid link type: ${jiraLinkType}` }, { status: 400 });
  }

  // Determine inward/outward based on direction
  const isInward = mapping?.direction === "inward";
  const sourceKey = isInward ? targetKey : key;
  const destKey = isInward ? key : targetKey;

  try {
    await jiraClient.createIssueLink(sourceKey, destKey, jiraLinkType);
    await syncJiraTimestamp(key);
  } catch (err) {
    logger.error("links", `Failed to create Jira link: ${err}`);
    return NextResponse.json({ error: "Failed to create link in Jira" }, { status: 502 });
  }

  // Fetch the target ticket info for the response
  const targetTicket = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, targetKey),
  });

  const displayRelation = relation ?? "relates to";

  await db.insert(ticketLink).values({
    id: randomUUID(),
    ticketKey: key,
    jiraLinkId: null,
    relation: displayRelation,
    linkedKey: targetKey,
    title: targetTicket?.title ?? targetKey,
    type: targetTicket?.type ?? "task",
    status: targetTicket?.status ?? "TO DO",
    assignee: targetTicket?.assignee ?? null,
    assigneeAvatar: null,
  });

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(`/api/tickets/${targetKey}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  // Invalidate AI-suggested related issues cache so the linked issue is excluded next time
  await db.delete(relatedSuggestionCache).where(eq(relatedSuggestionCache.ticketKey, key));

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Linked ${key} ${displayRelation} ${targetKey}`,
  });

  return NextResponse.json({
    relation: displayRelation,
    key: targetKey,
    title: targetTicket?.title ?? targetKey,
    type: targetTicket?.type ?? "task",
    jiraStatus: targetTicket?.status ?? "TO DO",
    assignee: null,
  });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

  let body: { jiraLinkId?: string; linkedKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { jiraLinkId, linkedKey } = body;

  if (!linkedKey) {
    return NextResponse.json({ error: "linkedKey is required" }, { status: 400 });
  }

  // Delete from Jira if we have a jiraLinkId
  if (jiraLinkId) {
    try {
      await jiraClient.deleteIssueLink(jiraLinkId);
      await syncJiraTimestamp(key);
    } catch (err) {
      logger.warn("links", `Jira link deletion failed for ${jiraLinkId}: ${err}`);
    }
  }

  // Delete from local DB
  await db.delete(ticketLink).where(
    and(
      eq(ticketLink.ticketKey, key),
      eq(ticketLink.linkedKey, linkedKey),
    ),
  );

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(`/api/tickets/${linkedKey}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  // Invalidate AI-suggested related issues cache so removed link can appear as suggestion again
  await db.delete(relatedSuggestionCache).where(eq(relatedSuggestionCache.ticketKey, key));

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Removed link between ${key} and ${linkedKey}`,
  });

  return new Response(null, { status: 204 });
}
