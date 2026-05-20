import { NextRequest, NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { detectConfluenceUrls } from "@/lib/confluence-url-detector";
import { confluenceClient } from "@/lib/confluence-client";
import { env } from "@/lib/env";
import { adfToMarkdown } from "@/lib/adf-to-markdown";

type RouteParams = { params: Promise<{ key: string }> };

/**
 * GET /api/tickets/[key]/confluence-mentions
 *
 * Scans the ticket description and Jira comments for Confluence URLs.
 * Resolves page metadata for up to 5 detected pages.
 * Filters out pages already in ticketConfluenceLink.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const baseUrl = env.CONFLUENCE_BASE_URL || env.JIRA_BASE_URL;
  if (!baseUrl) {
    return NextResponse.json({ mentions: [] });
  }

  // Load ticket description + all comments
  const ticket = await db.query.ticket.findFirst({
    where: (row, { eq }) => eq(row.jiraKey, key),
  });

  const comments = await db.query.jiraComment.findMany({
    where: (row, { eq }) => eq(row.ticketKey, key),
  });

  // Extract plain text from ADF JSON fields
  const descriptionText = (() => {
    if (!ticket?.description) return "";
    try {
      return adfToMarkdown(JSON.parse(ticket.description));
    } catch {
      return ticket.description;
    }
  })();

  const commentTexts = comments.map((c) => {
    if (!c.content) return "";
    try {
      return adfToMarkdown(JSON.parse(c.content));
    } catch {
      return c.content;
    }
  });

  const allText = [descriptionText, ...commentTexts].join("\n");
  const detected = detectConfluenceUrls(allText, baseUrl);

  if (detected.length === 0) {
    return NextResponse.json({ mentions: [] });
  }

  // Filter out already-linked pages
  const existingLinks = await db.query.ticketConfluenceLink.findMany({
    where: (row, { eq }) => eq(row.ticketKey, key),
  });
  const linkedIds = new Set(existingLinks.map((l) => l.pageId));
  const unlinked = detected.filter((d) => !linkedIds.has(d.pageId));

  if (unlinked.length === 0) {
    return NextResponse.json({ mentions: [] });
  }

  // Resolve metadata for up to 5 pages (avoid bulk-fetching)
  if (!confluenceClient.isLive) {
    return NextResponse.json({
      mentions: unlinked.slice(0, 5).map((d) => ({
        pageId: d.pageId,
        title: `Page ${d.pageId}`,
        url: d.url,
        source: "description" as const,
      })),
    });
  }

  const toResolve = unlinked.slice(0, 5);
  const resolved = await Promise.allSettled(
    toResolve.map(async (d) => {
      const meta = await confluenceClient.getPageMetadata(d.pageId);
      return {
        pageId: d.pageId,
        title: meta.title,
        url: meta.url,
        source: "description" as const,
      };
    }),
  );

  const mentions = resolved
    .filter((r): r is PromiseFulfilledResult<{ pageId: string; title: string; url: string; source: "description" }> => r.status === "fulfilled")
    .map((r) => r.value);

  return NextResponse.json({ mentions });
}
