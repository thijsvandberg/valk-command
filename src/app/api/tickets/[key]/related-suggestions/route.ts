import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { relatedSuggestionCache, ticket, ticketLink } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { agentFetch } from "@/lib/agent-fetch";
import { agentUrl, agentHeaders } from "@/lib/agent-proxy";
import { parseRelatedStories } from "@/lib/parse-related-stories";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";

type RouteContext = { params: Promise<{ key: string }> };

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const SUBMIT_TIMEOUT_MS = 30_000;
const STREAM_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes for the AI to search all tickets
const MAX_SUGGESTIONS = 10;

/**
 * Parses SSE events from a ReadableStream until we get a "result" or "error" event.
 * Returns the output string on success, or throws on error/timeout.
 */
async function readTaskResult(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "message";

  try {
    while (true) {
      if (signal.aborted) throw new Error("Request aborted");

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          const data = line.slice(5).trim();

          if (currentEvent === "result") {
            try {
              const parsed = JSON.parse(data) as { output?: string };
              return parsed.output ?? data;
            } catch {
              return data;
            }
          }

          if (currentEvent === "error") {
            let message = "Task failed";
            try {
              const parsed = JSON.parse(data) as { message?: string };
              message = parsed.message ?? message;
            } catch { /* use default */ }
            throw new Error(message);
          }

          currentEvent = "message";
        } else if (line === "") {
          currentEvent = "message";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  throw new Error("Stream ended without result");
}

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
 * POST: discover related issues via the workspace find-related skill.
 * Returns cached results if they are fresh (< 30 min). Otherwise submits
 * a workspace task, reads the SSE stream server-side, parses, deduplicates,
 * caches, and returns.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  // Check if the ticket exists
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

  // Submit find-related skill to workspace
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

  // Read the SSE stream server-side until we get the result
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), STREAM_TIMEOUT_MS);

  let output: string;
  try {
    const headers = agentHeaders();
    delete headers["Content-Type"];

    const streamRes = await fetch(agentUrl(`/api/tasks/${taskId}/stream`), {
      headers,
      signal: abortController.signal,
    });

    if (!streamRes.ok || !streamRes.body) {
      return NextResponse.json(
        { error: `Stream failed: HTTP ${streamRes.status}` },
        { status: 502 },
      );
    }

    output = await readTaskResult(streamRes.body, abortController.signal);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("related-suggestions", "failed to read task result", {
      ticketKey: key,
      taskId,
      error: message,
    });

    if (message.includes("abort")) {
      return NextResponse.json(
        { error: "Workspace did not respond in time" },
        { status: 504 },
      );
    }

    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
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

  return NextResponse.json({ suggestions: result, cached: false });
}

/**
 * DELETE: clear the suggestions cache for this ticket.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  await db
    .delete(relatedSuggestionCache)
    .where(eq(relatedSuggestionCache.ticketKey, key));

  return new Response(null, { status: 204 });
}
