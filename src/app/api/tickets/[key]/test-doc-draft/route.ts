import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { ticket, ticketMetadata } from "@/db/schema";
import { eq } from "drizzle-orm";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { resolveDraftKey } from "@/lib/draft-sync";
import { isDraftKey } from "@/lib/draft-key";
import { TEST_DOC_CLASSIFICATIONS, type TestDocClassification } from "@/lib/parse-test-doc";

/**
 * PUT /api/tickets/[key]/test-doc-draft
 *
 * Caches a freshly generated (not yet reviewed) test doc in Bridge (BRDG-426),
 * so closing the modal or revisiting the ticket never costs a regeneration.
 * Bridge-local only: no Jira write, never read by the BRDG-461 bundle. The
 * accept path (PUT test-doc) clears it.
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
    return errorResponse("Cannot cache test documentation for a draft ticket", 409);
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

  const exists = await db
    .select({ jiraKey: ticket.jiraKey })
    .from(ticket)
    .where(eq(ticket.jiraKey, key))
    .get();
  if (!exists) {
    return errorResponse("Ticket not found", 404);
  }

  const draft = {
    testDocDraft: markdown.trim(),
    testDocDraftClassification: classification,
    testDocDraftGeneratedAt: new Date().toISOString(),
  };
  await db
    .insert(ticketMetadata)
    .values({ jiraKey: key, ...draft })
    .onConflictDoUpdate({ target: ticketMetadata.jiraKey, set: draft });

  // The board-row test-doc marker derives from this state; drop the cached
  // list responses so the next revalidation reflects the new draft.
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  return NextResponse.json({ saved: true });
}
