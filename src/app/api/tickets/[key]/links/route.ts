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

/**
 * Resolve a display relation to its Jira link type + direction. Prefers the
 * frontend-supplied jiraTypeName/direction (already resolved from the link-types API);
 * otherwise derives from the server-side mapping, defaulting to "Relates"/outward.
 */
async function resolveTypeAndDirection(
  relation: string | undefined,
  jiraTypeName?: string,
  direction?: "inward" | "outward",
  linkTypeFallback?: string,
): Promise<{ jiraLinkType: string; isInward: boolean }> {
  if (jiraTypeName && direction) {
    return { jiraLinkType: jiraTypeName, isInward: direction === "inward" };
  }
  const relationMap = await getRelationMapping();
  const mapping = relation ? relationMap[relation.toLowerCase()] : null;
  return {
    jiraLinkType: linkTypeFallback ?? mapping?.type ?? "Relates",
    isInward: mapping?.direction === "inward",
  };
}

/**
 * Find the Jira link id for an existing link when the local row never recorded it
 * (a Bridge-created link whose id a sync hasn't backfilled yet). Fetches the issue's
 * links from Jira and matches on the relation's Jira type + the linked issue on the
 * correct side. Returns null if nothing matches or Jira is unreachable, so the caller
 * tolerates a missing id the same way DELETE does.
 */
async function resolveJiraLinkId(
  parentKey: string,
  linkedKey: string,
  currentRelation: string,
): Promise<string | null> {
  const relationMap = await getRelationMapping();
  const mapping = relationMap[currentRelation.toLowerCase()];
  const isInward = mapping?.direction === "inward";
  try {
    const issues = await jiraClient.getIssueLinksByKeys([parentKey]);
    const links = issues[0]?.fields?.issuelinks ?? [];
    for (const link of links) {
      if (mapping?.type && link.type?.name !== mapping.type) continue;
      // createIssueLink stores source as inwardIssue, dest as outwardIssue. For an
      // outward relation the parent is the source, so the linked issue sits on the
      // outward side; for an inward relation it sits on the inward side.
      const linkedSide = isInward ? link.inwardIssue : link.outwardIssue;
      if (linkedSide?.key === linkedKey) return link.id;
    }
  } catch {
    return null;
  }
  return null;
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
  const { jiraLinkType, isInward } = await resolveTypeAndDirection(
    relation, body.jiraTypeName, body.direction, body.linkType,
  );
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

/**
 * Change the relation TYPE of an existing link (e.g. "relates to" -> "is blocked by").
 * Jira's API cannot edit a link's type, so this deletes the old link and creates a new
 * one. The two-step is hidden behind one call, with rollback if the create fails after a
 * successful delete so the link is never silently lost.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
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
  const body = parsed.data as {
    jiraLinkId?: string;
    linkedKey?: string;
    currentRelation?: string;
    relation?: string;
    jiraTypeName?: string;
    direction?: "inward" | "outward";
  };

  const linkedKey = body.linkedKey?.trim();
  const relation = body.relation?.trim();
  const currentRelation = body.currentRelation?.trim() ?? "";

  if (!linkedKey || !relation) {
    return errorResponse("linkedKey and relation are required", 400);
  }

  const targetTicket = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, linkedKey),
  });

  function linkResponse() {
    return NextResponse.json({
      relation,
      key: linkedKey,
      title: targetTicket?.title ?? linkedKey,
      type: targetTicket?.type ?? "task",
      jiraStatus: targetTicket?.status ?? "TO DO",
      assignee: null,
    });
  }

  // No-op: relation unchanged, nothing to do in Jira or locally.
  if (relation.toLowerCase() === currentRelation.toLowerCase()) {
    return linkResponse();
  }

  // Duplicate guard: this issue is already linked under the target relation.
  const existingNew = await db.query.ticketLink.findFirst({
    where: (row, { eq: eqFn, and: andFn }) =>
      andFn(eqFn(row.ticketKey, key), eqFn(row.linkedKey, linkedKey), eqFn(row.relation, relation)),
  });
  if (existingNew) {
    return errorResponse(`${linkedKey} is already linked as "${relation}"`, 409);
  }

  const { jiraLinkType: newType, isInward: newInward } = await resolveTypeAndDirection(
    relation, body.jiraTypeName, body.direction,
  );
  const oldResolved = await resolveTypeAndDirection(currentRelation);
  const newSource = newInward ? linkedKey : key;
  const newDest = newInward ? key : linkedKey;
  const oldSource = oldResolved.isInward ? linkedKey : key;
  const oldDest = oldResolved.isInward ? key : linkedKey;

  // Delete the existing Jira link. A still-pending placeholder has no Jira link yet, so
  // skip the delete. A synced row without a recorded id needs its id resolved on demand.
  const isPendingPlaceholder = body.jiraLinkId?.startsWith("pending-") ?? false;
  let deletedLinkId: string | null = null;

  if (!isPendingPlaceholder) {
    const idToDelete = body.jiraLinkId ?? (await resolveJiraLinkId(key, linkedKey, currentRelation));
    if (idToDelete) {
      try {
        await jiraClient.deleteIssueLink(idToDelete);
        deletedLinkId = idToDelete;
      } catch (err) {
        logger.error("links", `Failed to delete Jira link during retype: ${err}`);
        return errorResponse("Failed to change link type", 502);
      }
    }
  }

  // Create the new link; roll back to the original if this fails after a delete.
  try {
    await jiraClient.createIssueLink(newSource, newDest, newType);
  } catch (err) {
    logger.error("links", `Failed to create new Jira link during retype: ${err}`);
    if (deletedLinkId) {
      try {
        await jiraClient.createIssueLink(oldSource, oldDest, oldResolved.jiraLinkType);
        return errorResponse("Failed to change link type; original link restored", 502);
      } catch (rollbackErr) {
        logger.error("links", `Failed to restore original link after retype failure: ${rollbackErr}`);
        return errorResponse("Failed to change link type and could not restore the original link", 502);
      }
    }
    return errorResponse("Failed to change link type", 502);
  }

  // Swap the local row to the new relation. jiraLinkId stays null; the next sync backfills it.
  await db.delete(ticketLink).where(and(
    eq(ticketLink.ticketKey, key),
    eq(ticketLink.linkedKey, linkedKey),
    eq(ticketLink.relation, currentRelation),
  ));
  await db.insert(ticketLink).values({
    id: randomUUID(),
    ticketKey: key,
    jiraLinkId: null,
    relation,
    linkedKey,
    title: targetTicket?.title ?? linkedKey,
    type: targetTicket?.type ?? "task",
    status: targetTicket?.status ?? "TO DO",
    assignee: targetTicket?.assignee ?? null,
    assigneeAvatar: null,
  });

  try {
    await syncJiraTimestamp(key);
  } catch (err) {
    logger.warn("links", `Failed to sync Jira timestamp after link retype: ${err}`);
  }

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(`/api/tickets/${linkedKey}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  await db.delete(relatedSuggestionCache).where(eq(relatedSuggestionCache.ticketKey, key));

  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Changed link type: ${linkedKey} ${currentRelation} -> ${relation}`,
  });

  return linkResponse();
}
