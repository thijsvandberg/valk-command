import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import * as ticketService from "@/services/ticket-service";
import { handleServiceError } from "@/services/handle-service-error";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveDraftKey } from "@/lib/draft-sync";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

  let force = false;
  try {
    const body = await request.json();
    force = body?.force === true;
  } catch {
    // No body or invalid JSON is fine
  }

  try {
    const result = await ticketService.pushToJira(key, force);

    // Conflict is a valid outcome (not an error) — return it as-is
    if ("conflict" in result) {
      return NextResponse.json(result);
    }

    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
