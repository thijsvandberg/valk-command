import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { storyWriterSession, relatedStoryCandidate, ticketLink } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { env } from "@/lib/env";
import { jiraClient } from "@/lib/jira-client";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";

type RouteContext = { params: Promise<{ key: string }> };

interface RelatedStoryItem {
  key: string;
  score: number;
  title: string;
  type?: string;
  status: string;
  url?: string;
  updated?: string;
  reason?: string;
}

function parseRelatedStories(output: string): RelatedStoryItem[] {
  const match = output.match(/<related-stories>([\s\S]*?)<\/related-stories>/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RelatedStoryItem =>
        typeof item === "object" &&
        item !== null &&
        typeof item.key === "string" &&
        typeof item.score === "number" &&
        typeof item.title === "string" &&
        typeof item.status === "string",
    );
  } catch {
    return [];
  }
}

/**
 * POST: parse <related-stories> from workspace output and store as candidates.
 * Replaces any previous candidates for this session.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "No active story writer session" }, { status: 404 });
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

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const candidateId = typeof body.candidateId === "string" ? body.candidateId : null;
  const isLinked = typeof body.isLinked === "boolean" ? body.isLinked : null;

  if (!candidateId || isLinked === null) {
    return NextResponse.json({ error: "candidateId and isLinked required" }, { status: 400 });
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
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
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
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

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
