import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/request-parser";
import { validatePathParam } from "@/lib/api-validation";
import * as ticketService from "@/services/ticket-service";
import { handleServiceError } from "@/services/handle-service-error";
import type { UpdateMetadataInput } from "@/services/ticket-service";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveDraftKey } from "@/lib/draft-sync";

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

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as UpdateMetadataInput;

  try {
    const result = await ticketService.updateTicketMetadata(key, body);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
