import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import * as ticketService from "@/services/ticket-service";
import { handleServiceError } from "@/services/handle-service-error";
import { applyRateLimit } from "@/lib/rate-limiter";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  try {
    const result = await ticketService.pullFromJira(key);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
