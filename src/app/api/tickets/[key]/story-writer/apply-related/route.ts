import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { resolveDraftKey } from "@/lib/draft-sync";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { db } from "@/db";
import { storyWriterSession, relatedStoryCandidate, ticketLink } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { env } from "@/lib/env";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";
import { parseRelatedStories } from "@/lib/parse-related-stories";

type RouteContext = { params: Promise<{ key: string }> };

/**
 * POST: parse <related-stories> from workspace output and store as candidates.
 * Replaces any previous candidates for this session.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

  const postResult = await parseJsonBody(request);
  if ("error" in postResult) return postResult.error;
  const body = postResult.data as Record<string, unknown>;

  const output = typeof body.output === "string" ? body.output : "";

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
    return errorResponse("No active story writer session", 404);
  }

  const items = parseRelatedStories(output);

  if (items.length === 0) {
    // No related stories block in output — return existing candidates
    const existing = await db
      .select()
      .from(relatedStoryCandidate)
      .where(eq(relatedStoryCandidate.sessionId, session.id))
      .all();
    return NextResponse.json({ candidates: existing, found: false });
  }

  // Replace previous candidates for this session
  await db
    .delete(relatedStoryCandidate)
    .where(eq(relatedStoryCandidate.sessionId, session.id));

  const now = new Date().toISOString();
  const rows = items.map((item) => ({
    id: randomUUID(),
    sessionId: session.id,
    ticketKey: key,
    jiraKey: item.key,
    score: item.score,
    title: item.title,
    issueType: item.type ?? null,
    status: item.status,
    jiraUrl: item.url ?? null,
    updatedDate: item.updated ?? null,
    matchReason: item.reason ?? null,
    isLinked: false,
    createdAt: now,
  }));

  await db.insert(relatedStoryCandidate).values(rows);

  const candidates = await db
    .select()
    .from(relatedStoryCandidate)
    .where(eq(relatedStoryCandidate.sessionId, session.id))
    .all();

  // Background sync: pull all found stories into local DB so they're available for preview.
  // Fire-and-forget; do not await so the response returns immediately.
  const keysToSync = items.map((i) => i.key);
  if (keysToSync.length > 0) {
    const syncUrl = new URL("/api/jira/sync-tickets", env.NEXT_PUBLIC_APP_URL);
    fetch(syncUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketKeys: keysToSync }),
    }).catch((err) => logger.error("apply-related", "background sync failed", err));
  }

  return NextResponse.json({ candidates, found: true });
}

/**
 * PATCH: toggle isLinked on a candidate.
 * When linking, also creates a local ticketLink entry.
 * When unlinking, removes that ticketLink entry.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

  const patchResult = await parseJsonBody(request);
  if ("error" in patchResult) return patchResult.error;
  const body = patchResult.data as Record<string, unknown>;

  const candidateId = typeof body.candidateId === "string" ? body.candidateId : null;
  const isLinked = typeof body.isLinked === "boolean" ? body.isLinked : null;

  if (!candidateId || isLinked === null) {
    return errorResponse("candidateId and isLinked required", 400);
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
    return errorResponse("No active story writer session", 404);
  }

  // Handle virtual candidates synthesised from existing ticketLink entries
  if (candidateId.startsWith("link-")) {
    const linkId = candidateId.slice(5);
    const link = await db
      .select()
      .from(ticketLink)
      .where(eq(ticketLink.id, linkId))
      .get();

    if (!link) {
      return errorResponse("Candidate not found", 404);
    }

    if (!isLinked) {
      await db.delete(ticketLink).where(eq(ticketLink.id, linkId));
      if (link.jiraLinkId) {
        try { await jiraClient.deleteIssueLink(link.jiraLinkId); } catch { /* ignore */ }
      }
      await logActivity({
        type: "story-writer",
        scope: key,
        summary: `Related story ${link.linkedKey} unlinked from ${key}`,
      });
    }

    // Return the virtual candidate shape so the frontend can update state
    const now = new Date().toISOString();
    return NextResponse.json({
      candidate: {
        id: candidateId,
        sessionId: session.id,
        ticketKey: key,
        jiraKey: link.linkedKey,
        score: -1,
        title: link.title,
        issueType: link.type ?? null,
        status: link.status,
        jiraUrl: null,
        updatedDate: null,
        matchReason: link.relation,
        isLinked,
        createdAt: now,
      },
    });
  }

  const candidate = await db
    .select()
    .from(relatedStoryCandidate)
    .where(
      and(
        eq(relatedStoryCandidate.id, candidateId),
        eq(relatedStoryCandidate.sessionId, session.id),
      ),
    )
    .get();

  if (!candidate) {
    return errorResponse("Candidate not found", 404);
  }

  await db
    .update(relatedStoryCandidate)
    .set({ isLinked })
    .where(eq(relatedStoryCandidate.id, candidateId));

  if (isLinked) {
    // Create a local "relates to" ticketLink entry if not already present
    const existing = await db
      .select()
      .from(ticketLink)
      .where(
        and(
          eq(ticketLink.ticketKey, key),
          eq(ticketLink.linkedKey, candidate.jiraKey),
          eq(ticketLink.relation, "relates to"),
        ),
      )
      .get();

    if (!existing) {
      await db.insert(ticketLink).values({
        id: randomUUID(),
        ticketKey: key,
        relation: "relates to",
        linkedKey: candidate.jiraKey,
        title: candidate.title,
        type: candidate.issueType ?? null,
        status: candidate.status,
        jiraLinkId: null,
        assignee: null,
        assigneeAvatar: null,
      });
    }

    // Push link to Jira (non-fatal; local state is source of truth)
    try {
      await jiraClient.createIssueLink(key, candidate.jiraKey);
    } catch { /* ignore: Jira may not be reachable */ }
  } else {
    // Find the local ticketLink entry to get the jiraLinkId before deleting
    const link = await db
      .select()
      .from(ticketLink)
      .where(
        and(
          eq(ticketLink.ticketKey, key),
          eq(ticketLink.linkedKey, candidate.jiraKey),
          eq(ticketLink.relation, "relates to"),
        ),
      )
      .get();

    // Remove the local ticketLink entry
    await db
      .delete(ticketLink)
      .where(
        and(
          eq(ticketLink.ticketKey, key),
          eq(ticketLink.linkedKey, candidate.jiraKey),
          eq(ticketLink.relation, "relates to"),
        ),
      );

    // Delete from Jira if we have the link ID
    if (link?.jiraLinkId) {
      try {
        await jiraClient.deleteIssueLink(link.jiraLinkId);
      } catch { /* ignore */ }
    }
  }

  await logActivity({
    type: "story-writer",
    scope: key,
    summary: `Related story ${candidate.jiraKey} ${isLinked ? "linked" : "unlinked"} for ${key}`,
  });

  const updated = await db
    .select()
    .from(relatedStoryCandidate)
    .where(eq(relatedStoryCandidate.id, candidateId))
    .get();

  return NextResponse.json({ candidate: updated });
}

/**
 * GET: return all related story candidates for the active session.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

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
    return NextResponse.json({ candidates: [] });
  }

  const candidates = await db
    .select()
    .from(relatedStoryCandidate)
    .where(eq(relatedStoryCandidate.sessionId, session.id))
    .all();

  return NextResponse.json({ candidates });
}
