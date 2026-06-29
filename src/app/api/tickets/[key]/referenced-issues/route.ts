import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketLink, sprintNameCache } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { validatePathParam } from "@/lib/api-validation";
import { preparedPoComments, preparedJiraComments } from "@/db/prepared";
import { extractIssueKeys } from "@/lib/issue-keys";
import type { LinkSearchResult } from "@/lib/api-client";

// Project prefix of an issue key ("VPL-123" -> "VPL"), mirroring the search route.
function projectOf(key: string): string | null {
  const idx = key.indexOf("-");
  return idx > 0 ? key.slice(0, idx) : null;
}

const noStore = { headers: { "Cache-Control": "private, no-store" } };
const emptyResponse = () => NextResponse.json({ results: [] }, noStore);

/**
 * Issues referenced in a ticket's description and comments but not yet formally
 * linked. The picker surfaces these so the PO can one-click a mention into a real
 * Jira link. All source text already lives locally (description + both comment
 * tables), so this is a pure local scan: no Jira read, no comment fetch to the
 * client. Rows mirror the /api/tickets/search row shape so LinkSearchResultRow
 * renders them unchanged.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const source = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });
  if (!source) return emptyResponse();

  const poComments = preparedPoComments({ key });
  const jiraComments = preparedJiraComments({ key });

  // Description first, then comments, so first-seen order reflects mention order.
  const blob = [
    source.description ?? "",
    ...jiraComments.map((c) => c.content),
    ...poComments.map((c) => c.content),
  ].join("\n");

  const selfKey = key.toUpperCase();
  const mentioned = extractIssueKeys(blob).filter((k) => k !== selfKey);
  if (mentioned.length === 0) return emptyResponse();

  // Drop anything already formally linked: there is nothing to add for those.
  const links = await db
    .select({ linkedKey: ticketLink.linkedKey })
    .from(ticketLink)
    .where(eq(ticketLink.ticketKey, key));
  const linked = new Set(links.map((l) => l.linkedKey.toUpperCase()));

  const candidates = mentioned.filter((k) => !linked.has(k));
  if (candidates.length === 0) return emptyResponse();

  // Resolve against the local ticket table; unknown keys (unsynced or other
  // project) are silently dropped by the join + the order-preserving lookup below.
  const rows = await db
    .select({
      key: ticket.jiraKey,
      title: ticket.title,
      type: ticket.type,
      status: ticket.status,
      sprintId: ticket.sprintName,
      sprintDisplayName: sprintNameCache.displayName,
      epicKey: ticket.epicKey,
      assignee: ticket.assignee,
      jiraUpdatedAt: ticket.jiraUpdatedAt,
    })
    .from(ticket)
    .leftJoin(sprintNameCache, eq(ticket.sprintName, sprintNameCache.sprintId))
    .where(inArray(ticket.jiraKey, candidates));

  const byKey = new Map(rows.map((r) => [r.key.toUpperCase(), r]));

  const results: LinkSearchResult[] = [];
  for (const k of candidates) {
    const r = byKey.get(k);
    if (!r) continue;
    results.push({
      key: r.key,
      title: r.title,
      type: r.type ?? "task",
      status: r.status,
      sprintName: r.sprintDisplayName ?? r.sprintId,
      epicKey: r.epicKey ?? null,
      assignee: r.assignee ?? null,
      jiraUpdatedAt: r.jiraUpdatedAt ?? null,
      project: projectOf(r.key),
      source: "local",
    });
  }

  return NextResponse.json({ results }, noStore);
}
