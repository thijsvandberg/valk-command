import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import * as ticketService from "@/services/ticket-service";
import { handleServiceError } from "@/services/handle-service-error";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveDraftKey } from "@/lib/draft-sync";
import { cache } from "@/lib/cache";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

  try {
    const result = await ticketService.pushToJira(key);

    // Conflict is a valid outcome (not an error) — return it as-is
    if ("conflict" in result) {
      return NextResponse.json(result);
    }

    // A successful push clears the local edits; drop the detail and list caches so
    // the "local changes" label does not linger behind their TTLs.
    cache.invalidate(`/api/tickets/${key}`);
    cache.invalidate(/^\/api\/tickets(\?|$)/);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
