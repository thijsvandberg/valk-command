import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/db";
import { deprecatedAreaKeyword } from "@/db/schema";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { applyRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";

/**
 * CRUD for the editable deprecated-area keyword list (BRDG-285). The "replaced
 * area" deep-scan topic matches ticket text against these rows, so the PO grows
 * the list here over time. Local-only, never synced to Jira.
 */

export interface DeprecatedAreaDto {
  id: string;
  term: string;
  aliases: string;
  note: string;
  createdAt: string;
}

const createSchema = z.object({
  term: z.string().trim().min(1).max(120),
  aliases: z.string().max(500).optional(),
  note: z.string().max(500).optional(),
});

const updateSchema = createSchema.extend({
  id: z.string().min(1).max(64),
});

const deleteSchema = z.object({ id: z.string().min(1).max(64) });

function noStore(payload: unknown, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET() {
  const rows = await db
    .select()
    .from(deprecatedAreaKeyword)
    .orderBy(deprecatedAreaKeyword.term)
    .all();
  return noStore({ areas: rows as DeprecatedAreaDto[] });
}

export async function POST(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request, createSchema);
  if ("error" in parsed) return parsed.error;

  const { term, aliases, note } = parsed.data;
  const row = {
    id: randomUUID(),
    term: term.trim(),
    aliases: aliases?.trim() ?? "",
    note: note?.trim() ?? "",
  };

  try {
    await db.insert(deprecatedAreaKeyword).values(row);
  } catch (err) {
    logger.error("deprecated-areas", "insert failed", err);
    return errorResponse("Failed to add deprecated area", 500);
  }

  const saved = await db
    .select()
    .from(deprecatedAreaKeyword)
    .where(eq(deprecatedAreaKeyword.id, row.id))
    .get();
  return noStore({ area: saved as DeprecatedAreaDto }, 201);
}

export async function PUT(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request, updateSchema);
  if ("error" in parsed) return parsed.error;

  const { id, term, aliases, note } = parsed.data;
  const existing = await db
    .select()
    .from(deprecatedAreaKeyword)
    .where(eq(deprecatedAreaKeyword.id, id))
    .get();
  if (!existing) return errorResponse("Deprecated area not found", 404);

  await db
    .update(deprecatedAreaKeyword)
    .set({ term: term.trim(), aliases: aliases?.trim() ?? "", note: note?.trim() ?? "" })
    .where(eq(deprecatedAreaKeyword.id, id));

  const saved = await db
    .select()
    .from(deprecatedAreaKeyword)
    .where(eq(deprecatedAreaKeyword.id, id))
    .get();
  return noStore({ area: saved as DeprecatedAreaDto });
}

export async function DELETE(request: Request) {
  const limited = await applyRateLimit("delete");
  if (limited) return limited;

  const parsed = await parseJsonBody(request, deleteSchema);
  if ("error" in parsed) return parsed.error;

  await db.delete(deprecatedAreaKeyword).where(eq(deprecatedAreaKeyword.id, parsed.data.id));
  return new NextResponse(null, { status: 204 });
}
