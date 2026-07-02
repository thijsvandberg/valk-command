import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { ticket, ticketLocalEdit, ticketMetadata } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveDraftKey } from "@/lib/draft-sync";
import { isDraftKey } from "@/lib/draft-key";
import { appendTestDocBlock } from "@/lib/test-doc";
import { TEST_DOC_CLASSIFICATIONS, type TestDocClassification } from "@/lib/parse-test-doc";
import * as ticketService from "@/services/ticket-service";
import { handleServiceError } from "@/services/handle-service-error";
import { cache } from "@/lib/cache";
import { originFromRequest } from "@/lib/ticket-events";
import { getActingUser } from "@/lib/acting-user";

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
  const { markdown, classification: rawClassification } = parsed.data as {
    markdown?: string;
    classification?: string;
  };

  if (!markdown || typeof markdown !== "string" || !markdown.trim()) {
    return errorResponse("markdown is required", 400);
  }
  const classification: TestDocClassification =
    rawClassification && (TEST_DOC_CLASSIFICATIONS as readonly string[]).includes(rawClassification)
      ? (rawClassification as TestDocClassification)
      : "ok";

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

  await db
    .insert(ticketMetadata)
    .values({
      jiraKey: key,
      testDoc: doc,
      testDocUpdatedAt: now,
      testDocClassification: classification,
    })
    .onConflictDoUpdate({
      target: ticketMetadata.jiraKey,
      set: { testDoc: doc, testDocUpdatedAt: now, testDocClassification: classification },
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
