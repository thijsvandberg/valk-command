import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { subtaskSuggestion } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { parseSubtaskSuggestions } from "@/lib/parse-subtask-suggestions";

type RouteContext = { params: Promise<{ key: string }> };

/**
 * GET: return persisted pending subtask suggestions for this ticket.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const rows = await db
    .select()
    .from(subtaskSuggestion)
    .where(eq(subtaskSuggestion.ticketKey, key))
    .all();

  return NextResponse.json({ suggestions: rows });
}

/**
 * PUT: parse workspace output and persist suggestions (replaces any existing).
 * Body: { suggestions: string[] } (pre-parsed titles)
 */
export async function PUT(request: Request, { params }: RouteContext) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  let titles: string[];

  if (Array.isArray(body.suggestions)) {
    titles = body.suggestions.filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
  } else if (typeof body.output === "string" && body.output) {
    titles = parseSubtaskSuggestions(body.output);
  } else {
    return errorResponse("suggestions (string[]) or output (string) is required", 400);
  }

  // Replace all existing suggestions for this ticket
  await db
    .delete(subtaskSuggestion)
    .where(eq(subtaskSuggestion.ticketKey, key));

  if (titles.length > 0) {
    const now = new Date().toISOString();
    const rows = titles.map((title) => ({
      id: randomUUID(),
      ticketKey: key,
      title,
      createdAt: now,
    }));
    await db.insert(subtaskSuggestion).values(rows);
  }

  const result = await db
    .select()
    .from(subtaskSuggestion)
    .where(eq(subtaskSuggestion.ticketKey, key))
    .all();

  return NextResponse.json({ suggestions: result });
}

/**
 * DELETE: remove a single suggestion (dismiss/accept) or all for this ticket.
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
      .delete(subtaskSuggestion)
      .where(
        and(
          eq(subtaskSuggestion.ticketKey, key),
          eq(subtaskSuggestion.id, body.id),
        ),
      );
  } else {
    await db
      .delete(subtaskSuggestion)
      .where(eq(subtaskSuggestion.ticketKey, key));
  }

  return new Response(null, { status: 204 });
}
