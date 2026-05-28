import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
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

import type { JiraIssueLinkType } from "@/lib/jira-client";

type RouteContext = { params: Promise<{ key: string }> };

// Hardcoded fallback mapping used when Jira link types cannot be fetched
const FALLBACK_RELATION_TO_JIRA: Record<string, { type: string; direction: "outward" | "inward" }> = {
  "relates to":        { type: "Relates",    direction: "outward" },
  "blocks":            { type: "Blocks",     direction: "outward" },
  "is blocked by":     { type: "Blocks",     direction: "inward" },
  "clones":            { type: "Cloners",    direction: "outward" },
  "is cloned by":      { type: "Cloners",    direction: "inward" },
  "duplicates":        { type: "Duplicate",  direction: "outward" },
  "is duplicated by":  { type: "Duplicate",  direction: "inward" },
};

const LINK_TYPES_CACHE_KEY = "jira:link-types:raw";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Build a relation-to-Jira mapping from raw Jira link types.
 * Falls back to the hardcoded mapping if Jira is unreachable.
 */
async function getRelationMapping(): Promise<Record<string, { type: string; direction: "outward" | "inward" }>> {
  let jiraTypes = cache.get<JiraIssueLinkType[]>(LINK_TYPES_CACHE_KEY);

  if (!jiraTypes) {
    try {
      jiraTypes = await jiraClient.getIssueLinkTypes();
      if (jiraTypes.length > 0) {
        cache.set(LINK_TYPES_CACHE_KEY, jiraTypes, ONE_WEEK_MS);
      }
    } catch {
      // Fall through to fallback
    }
  }

  if (!jiraTypes || jiraTypes.length === 0) {
    return FALLBACK_RELATION_TO_JIRA;
  }

  const mapping: Record<string, { type: string; direction: "outward" | "inward" }> = {};
  for (const lt of jiraTypes) {
    mapping[lt.outward.toLowerCase()] = { type: lt.name, direction: "outward" };
    if (lt.inward.toLowerCase() !== lt.outward.toLowerCase()) {
      mapping[lt.inward.toLowerCase()] = { type: lt.name, direction: "inward" };
    }
  }
  return mapping;
}

export async function POST(request: Request, { params }: RouteContext) {
  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

  const t = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });

  if (!t) {
    return errorResponse("Ticket not found", 404);
  }

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as { targetKey?: string; linkType?: string; relation?: string; jiraTypeName?: string; direction?: "inward" | "outward" };

  const targetKey = body.targetKey?.trim();
  const relation = body.relation?.trim();

  if (!targetKey) {
    return errorResponse("targetKey is required", 400);
  }

  // Use jiraTypeName/direction from the frontend when available (already resolved from link-types API).
  // Fall back to server-side mapping derivation for backwards compatibility.
  let jiraLinkType: string;
  let isInward: boolean;

  if (body.jiraTypeName && body.direction) {
    jiraLinkType = body.jiraTypeName;
    isInward = body.direction === "inward";
  } else {
    const relationMap = await getRelationMapping();
    const mapping = relation ? relationMap[relation.toLowerCase()] : null;
    jiraLinkType = body.linkType ?? mapping?.type ?? "Relates";
    isInward = mapping?.direction === "inward";
  }
  const sourceKey = isInward ? targetKey : key;
  const destKey = isInward ? key : targetKey;

  try {
    await jiraClient.createIssueLink(sourceKey, destKey, jiraLinkType);
  } catch (err) {
    logger.error("links", `Failed to create Jira link: ${err}`);
    return errorResponse("Failed to create link in Jira", 502);
  }

  // Non-fatal: sync the Jira timestamp so stale detection stays accurate
  try {
    await syncJiraTimestamp(key);
  } catch (err) {
    logger.warn("links", `Failed to sync Jira timestamp after link creation: ${err}`);
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

  const parsedDelete = await parseJsonBody(request);
  if ("error" in parsedDelete) return parsedDelete.error;
  const body = parsedDelete.data as { jiraLinkId?: string; linkedKey?: string; relation?: string };

  const { jiraLinkId, linkedKey, relation } = body;

  if (!linkedKey) {
    return errorResponse("linkedKey is required", 400);
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

  // Delete from local DB, scoped to the specific relation when provided
  const conditions = [
    eq(ticketLink.ticketKey, key),
    eq(ticketLink.linkedKey, linkedKey),
  ];
  if (relation) {
    conditions.push(eq(ticketLink.relation, relation));
  }
  await db.delete(ticketLink).where(and(...conditions));

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
