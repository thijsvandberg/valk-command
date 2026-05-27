import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { relatedSuggestionCache, ticket, ticketLink } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { agentFetch } from "@/lib/agent-fetch";
import { parseRelatedStories } from "@/lib/parse-related-stories";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";

type RouteContext = { params: Promise<{ key: string }> };

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SUBMIT_TIMEOUT_MS = 30_000;
const MAX_SUGGESTIONS = 10;

/**
 * GET: return cached related suggestions for this ticket.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const rows = await db
    .select()
    .from(relatedSuggestionCache)
    .where(eq(relatedSuggestionCache.ticketKey, key))
    .all();

  const cachedAt = rows.length > 0 ? rows[0].createdAt : null;

  return NextResponse.json({ suggestions: rows, cachedAt });
}

/**
 * POST: start discovering related issues via the workspace find-related skill.
 *
 * Returns cached results immediately if fresh (< 30 min).
 * Otherwise submits a workspace task and returns { taskId, streamUrl }
 * so the client can stream progress via EventSource.
 * When the task completes, the client calls PUT with the output to parse + cache.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const ticketRow = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });
  if (!ticketRow) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  // Check cache freshness
  const cached = await db
    .select()
    .from(relatedSuggestionCache)
    .where(eq(relatedSuggestionCache.ticketKey, key))
    .all();

  if (cached.length > 0) {
    const cacheAge = Date.now() - new Date(cached[0].createdAt).getTime();
    if (cacheAge < CACHE_TTL_MS) {
      return NextResponse.json({ suggestions: cached, cached: true });
    }
  }

  // Submit find-related skill to workspace and return immediately
  const conversationId = `related-${key}-${Date.now()}`;
  interface TaskResponse { id?: string; error?: string }
  const taskResult = await agentFetch<TaskResponse>("/api/tasks", {
    method: "POST",
    body: {
      skill: "find-related",
      args: { args: key },
      conversationId,
    },
    retries: 2,
    timeout: SUBMIT_TIMEOUT_MS,
  });

  if (!taskResult.ok) {
    logger.error("related-suggestions", "workspace task submission failed", {
      ticketKey: key,
      code: taskResult.error.code,
      error: taskResult.error.error,
    });
    return NextResponse.json(
      { error: taskResult.error.error, code: taskResult.error.code },
      { status: taskResult.status || 502 },
    );
  }

  const taskId = taskResult.data.id;
  if (!taskId) {
    return NextResponse.json({ error: "No task ID returned" }, { status: 502 });
  }

  return NextResponse.json({
    taskId,
    streamUrl: `/api/workspace-tasks/${taskId}/stream`,
    cached: false,
  }, { status: 202 });
}

/**
 * PUT: parse completed workspace output, deduplicate, cache, and return suggestions.
 * Called by the client after the task stream emits a "result" event.
 */
export async function PUT(request: Request, { params }: RouteContext) {
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
  if (!output) {
    return NextResponse.json({ error: "output is required" }, { status: 400 });
  }

  // Parse the workspace output
  const items = parseRelatedStories(output);

  // Load existing links for deduplication
  const existingLinks = await db
    .select({ linkedKey: ticketLink.linkedKey })
    .from(ticketLink)
    .where(eq(ticketLink.ticketKey, key))
    .all();
  const linkedKeys = new Set(existingLinks.map((l) => l.linkedKey));

  // Filter, deduplicate, rank, cap
  const suggestions = items
    .filter((item) => item.key !== key && !linkedKeys.has(item.key))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS);

  // Clear old cache and insert new results
  await db
    .delete(relatedSuggestionCache)
    .where(eq(relatedSuggestionCache.ticketKey, key));

  if (suggestions.length > 0) {
    const now = new Date().toISOString();
    const rows = suggestions.map((item) => ({
      id: randomUUID(),
      ticketKey: key,
      suggestedKey: item.key,
      score: item.score,
      title: item.title,
      issueType: item.type ?? null,
      status: item.status,
      jiraUrl: item.url ?? null,
      reason: item.reason ?? null,
      suggestedRelation: "relates to" as const,
      createdAt: now,
    }));
    await db.insert(relatedSuggestionCache).values(rows);
  }

  // Background sync: pull found tickets into local DB for preview
  const keysToSync = suggestions.map((s) => s.key);
  if (keysToSync.length > 0) {
    const syncUrl = new URL("/api/jira/sync-tickets", env.NEXT_PUBLIC_APP_URL);
    fetch(syncUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketKeys: keysToSync }),
    }).catch((err) => logger.error("related-suggestions", "background sync failed", err));
  }

  // Return the fresh results from DB (includes generated IDs)
  const result = await db
    .select()
    .from(relatedSuggestionCache)
    .where(eq(relatedSuggestionCache.ticketKey, key))
    .all();

  return NextResponse.json({ suggestions: result });
}

/**
 * DELETE: remove a single suggestion (dismiss) or all for this ticket.
 * Body: { id: string } to remove one, or empty/omitted to remove all.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    // empty body is fine for "delete all"
  }

  if (typeof body.id === "string") {
    await db
      .delete(relatedSuggestionCache)
      .where(
        and(
          eq(relatedSuggestionCache.ticketKey, key),
          eq(relatedSuggestionCache.id, body.id),
        ),
      );
  } else {
    await db
      .delete(relatedSuggestionCache)
      .where(eq(relatedSuggestionCache.ticketKey, key));
  }

  return new Response(null, { status: 204 });
}
