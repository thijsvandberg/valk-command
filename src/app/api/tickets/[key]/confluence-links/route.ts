import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validatePathParam } from "@/lib/api-validation";
import { parseJsonBody } from "@/lib/request-parser";
import { db } from "@/db";
import { ticketConfluenceLink } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { applyRateLimit } from "@/lib/rate-limiter";

type RouteParams = { params: Promise<{ key: string }> };

const createLinkSchema = z.object({
  pageId: z.string().min(1),
  pageTitle: z.string().min(1),
  pageUrl: z.string().min(1),
  lastModifiedAt: z.string().optional(),
  lastModifiedBy: z.string().optional(),
  source: z.enum(["manual", "auto-detected"]).optional(),
});

const deleteLinkSchema = z.object({
  linkId: z.string().min(1),
});

/**
 * GET /api/tickets/[key]/confluence-links
 *
 * Returns all Confluence pages linked to this ticket.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;
  const links = await db.query.ticketConfluenceLink.findMany({
    where: (row, { eq }) => eq(row.ticketKey, key),
    orderBy: (row, { asc }) => [asc(row.createdAt)],
  });
  return NextResponse.json({ links }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * POST /api/tickets/[key]/confluence-links
 *
 * Links a Confluence page to a ticket. Idempotent — ignores duplicate pageId.
 * Body: { pageId, pageTitle, pageUrl, lastModifiedAt?, lastModifiedBy?, source? }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const parsed = await parseJsonBody(req, createLinkSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  // Idempotent: skip if this page is already linked to this ticket
  const existing = await db.query.ticketConfluenceLink.findFirst({
    where: (row, { and, eq }) => and(eq(row.ticketKey, key), eq(row.pageId, body.pageId)),
  });
  if (existing) {
    return NextResponse.json({ link: existing });
  }

  const [link] = await db.insert(ticketConfluenceLink).values({
    id: randomUUID(),
    ticketKey: key,
    pageId: body.pageId,
    pageTitle: body.pageTitle,
    pageUrl: body.pageUrl,
    source: body.source ?? "manual",
    lastModifiedAt: body.lastModifiedAt ?? null,
    lastModifiedBy: body.lastModifiedBy ?? null,
  }).returning();

  return NextResponse.json({ link }, { status: 201 });
}

/**
 * DELETE /api/tickets/[key]/confluence-links
 *
 * Unlinks a Confluence page. Body: { linkId }
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const limited = await applyRateLimit("delete");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const parsed = await parseJsonBody(req, deleteLinkSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  await db.delete(ticketConfluenceLink).where(
    and(
      eq(ticketConfluenceLink.id, body.linkId),
      eq(ticketConfluenceLink.ticketKey, key),
    ),
  );

  return NextResponse.json({ ok: true });
}
