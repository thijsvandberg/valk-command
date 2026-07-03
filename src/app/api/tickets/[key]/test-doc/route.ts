import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { ticket, ticketLocalEdit, ticketMetadata, storyVersion } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveDraftKey } from "@/lib/draft-sync";
import { isDraftKey } from "@/lib/draft-key";
import { appendTestDocBlock } from "@/lib/test-doc";
import { coerceClassification } from "@/lib/parse-test-doc";
import * as ticketService from "@/services/ticket-service";
import { handleServiceError } from "@/services/handle-service-error";
import { cache } from "@/lib/cache";
import { originFromRequest } from "@/lib/ticket-events";
import { getActingUser } from "@/lib/acting-user";

/**
 * GET /api/tickets/[key]/test-doc
 *
 * Returns the accepted doc and the unreviewed draft cache (if any), so the
 * review modal can show an existing result instead of regenerating.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = await applyRateLimit("read");
  if (limited) return limited;

  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

  const meta = await db
    .select({
      testDoc: ticketMetadata.testDoc,
      testDocUpdatedAt: ticketMetadata.testDocUpdatedAt,
      testDocClassification: ticketMetadata.testDocClassification,
      testDocDraft: ticketMetadata.testDocDraft,
      testDocDraftClassification: ticketMetadata.testDocDraftClassification,
      testDocDraftGeneratedAt: ticketMetadata.testDocDraftGeneratedAt,
    })
    .from(ticketMetadata)
    .where(eq(ticketMetadata.jiraKey, key))
    .get();

  // Latest story CONTENT change (story versions are only written on content
  // changes, unlike Jira's updated timestamp which bumps on any field): lets
  // the review modal warn when the story changed after the doc was made.
  const latestVersion = await db
    .select({ createdAt: storyVersion.createdAt })
    .from(storyVersion)
    .where(eq(storyVersion.jiraKey, key))
    .orderBy(desc(storyVersion.createdAt))
    .limit(1)
    .get();
  // SQLite UTC format ("YYYY-MM-DD HH:MM:SS", no zone) -> real UTC instant.
  const storyUpdatedAt = latestVersion
    ? latestVersion.createdAt.includes("T")
      ? latestVersion.createdAt
      : `${latestVersion.createdAt.replace(" ", "T")}Z`
    : null;

  return NextResponse.json({
    storyUpdatedAt,
    saved: meta?.testDoc
      ? {
          markdown: meta.testDoc,
          classification: meta.testDocClassification ?? "ok",
          updatedAt: meta.testDocUpdatedAt,
        }
      : null,
    draft: meta?.testDocDraft
      ? {
          markdown: meta.testDocDraft,
          classification: meta.testDocDraftClassification ?? "ok",
          generatedAt: meta.testDocDraftGeneratedAt,
        }
      : null,
  });
}

/**
 * PUT /api/tickets/[key]/test-doc
 *
 * Saves the validated stakeholder test documentation (BRDG-426):
 * 1. Bridge copy in ticket_metadata (source of truth for BRDG-461 bundling).
 * 2. Jira: the description gets exactly one ":::expand Test documentation"
 *    block (existing block replaced), written through the regular local-edit +
 *    pushToJira path so markdown→ADF conversion, freshness/conflict checks and
 *    cache invalidation all behave like any other description edit.
 *
 * The Bridge copy is saved BEFORE the Jira push on purpose: a conflict or a
 * Jira outage must not lose the PO's validated doc.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);
  if (isDraftKey(key)) {
    return errorResponse("Cannot save test documentation for a draft ticket", 409);
  }

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { markdown, classification: rawClassification, notNeeded } = parsed.data as {
    markdown?: string;
    classification?: string;
    notNeeded?: boolean;
  };

  // Explicit "no test documentation needed" marker (PO judgement): Bridge-only,
  // no doc, no Jira write. The sprint bundle lists these separately and the
  // missing overview skips them, so the ticket is never re-reviewed.
  if (notNeeded === true) {
    const exists = await db
      .select({ jiraKey: ticket.jiraKey })
      .from(ticket)
      .where(eq(ticket.jiraKey, key))
      .get();
    if (!exists) {
      return errorResponse("Ticket not found", 404);
    }
    const marker = {
      testDoc: null,
      testDocUpdatedAt: new Date().toISOString(),
      testDocClassification: "not_stakeholder_relevant" as const,
      testDocDraft: null,
      testDocDraftClassification: null,
      testDocDraftGeneratedAt: null,
    };
    await db
      .insert(ticketMetadata)
      .values({ jiraKey: key, ...marker })
      .onConflictDoUpdate({ target: ticketMetadata.jiraKey, set: marker });
    cache.invalidate(`/api/tickets/${key}`);
    cache.invalidate(/^\/api\/tickets(\?|$)/);
    return NextResponse.json({ saved: true, notNeeded: true });
  }

  if (!markdown || typeof markdown !== "string" || !markdown.trim()) {
    return errorResponse("markdown is required", 400);
  }
  const classification = coerceClassification(rawClassification);

  const ticketRow = await db
    .select({ jiraKey: ticket.jiraKey, description: ticket.description })
    .from(ticket)
    .where(eq(ticket.jiraKey, key))
    .get();
  if (!ticketRow) {
    return errorResponse("Ticket not found", 404);
  }

  const doc = markdown.trim();
  const now = new Date().toISOString();

  // Accepting consumes the draft cache: the reviewed doc supersedes it.
  const accepted = {
    testDoc: doc,
    testDocUpdatedAt: now,
    testDocClassification: classification,
    testDocDraft: null,
    testDocDraftClassification: null,
    testDocDraftGeneratedAt: null,
  };
  await db
    .insert(ticketMetadata)
    .values({ jiraKey: key, ...accepted })
    .onConflictDoUpdate({
      target: ticketMetadata.jiraKey,
      set: accepted,
    });

  // Merge into the effective description: an unpushed local edit is the PO's
  // latest truth, so build on it rather than the (older) Jira mirror.
  const localEdit = await db
    .select({ localValue: ticketLocalEdit.localValue })
    .from(ticketLocalEdit)
    .where(and(eq(ticketLocalEdit.ticketKey, key), eq(ticketLocalEdit.field, "description")))
    .get();

  const merged = appendTestDocBlock(
    localEdit?.localValue ?? ticketRow.description ?? "",
    doc,
  );

  try {
    await ticketService.upsertLocalEdit(key, {
      field: "description",
      localValue: merged,
      isDraft: false,
    });
    const actingUser = await getActingUser();
    const result = await ticketService.pushToJira(key, originFromRequest(request), actingUser);

    // Conflict is a valid outcome: the Bridge copy is saved, the description
    // merge stays as a local edit for the regular resolve flow.
    if ("conflict" in result) {
      return NextResponse.json({ saved: true, ...result });
    }

    cache.invalidate(`/api/tickets/${key}`);
    cache.invalidate(/^\/api\/tickets(\?|$)/);
    return NextResponse.json({ saved: true, pushed: true });
  } catch (err) {
    return handleServiceError(err);
  }
}
