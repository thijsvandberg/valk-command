import { NextRequest, NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { ticketConfluenceLink } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { applyRateLimit } from "@/lib/rate-limiter";

type RouteParams = { params: Promise<{ key: string }> };

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
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;
  const body = await req.json() as {
    pageId: string;
    pageTitle: string;
    pageUrl: string;
    lastModifiedAt?: string;
    lastModifiedBy?: string;
    source?: "manual" | "auto-detected";
  };

  if (!body.pageId || !body.pageTitle || !body.pageUrl) {
    return NextResponse.json({ error: "pageId, pageTitle, and pageUrl are required" }, { status: 400 });
  }

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
  const limited = applyRateLimit("delete");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;
  const body = await req.json() as { linkId: string };

  if (!body.linkId) {
    return NextResponse.json({ error: "linkId is required" }, { status: 400 });
  }

  await db.delete(ticketConfluenceLink).where(
    and(
      eq(ticketConfluenceLink.id, body.linkId),
      eq(ticketConfluenceLink.ticketKey, key),
    ),
  );

  return NextResponse.json({ ok: true });
}
