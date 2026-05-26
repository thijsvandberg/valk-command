import { NextResponse } from "next/server";
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
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

  let body: UpdateMetadataInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await ticketService.updateTicketMetadata(key, body);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
