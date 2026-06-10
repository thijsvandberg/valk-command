import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/request-parser";
import { applyRateLimit } from "@/lib/rate-limiter";
import { handleServiceError } from "@/services/handle-service-error";
import { reorderPlaceholders } from "@/services/placeholder-service";

// Reorder placeholders within a sprint group (BRDG-328). Body: { orderedIds: string[] }
// in their new top-to-bottom order. Bridge-local; never touches Jira.

export async function POST(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as { orderedIds?: string[] };

  try {
    await reorderPlaceholders(body.orderedIds ?? []);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleServiceError(err);
  }
}
