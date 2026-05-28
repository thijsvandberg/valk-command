import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { validatePathParam } from "@/lib/api-validation";
import { cache } from "@/lib/cache";
import { enqueue as enqueueForRevalidation } from "@/lib/revalidation-queue";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveDraftKey } from "@/lib/draft-sync";
import { buildTicketDetail, updateTicketFields } from "@/lib/ticket-detail-builder";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

  const cacheKey = `/api/tickets/${key}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    enqueueForRevalidation([key]);
    return NextResponse.json(cached, {
      headers: {
        "X-Cache": "HIT",
        "Cache-Control": "private, no-cache",
      },
    });
  }

  const result = await buildTicketDetail(key);
  if (!result) {
    return errorResponse("Ticket not found", 404);
  }

  cache.set(cacheKey, result.data, 60_000);
  enqueueForRevalidation([key]);

  return NextResponse.json(result.data, {
    headers: {
      "X-Query-Time-Ms": String(result.durationMs),
      "X-Cache": "MISS",
      "Cache-Control": "private, no-cache",
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const outcome = await updateTicketFields(key, body);
  if ("error" in outcome) {
    return errorResponse(outcome.error, outcome.status);
  }

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  return NextResponse.json(outcome.result);
}
