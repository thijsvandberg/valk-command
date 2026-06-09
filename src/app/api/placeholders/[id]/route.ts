import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/request-parser";
import { applyRateLimit } from "@/lib/rate-limiter";
import { handleServiceError } from "@/services/handle-service-error";
import {
  updatePlaceholder,
  deletePlaceholder,
  type UpdatePlaceholderInput,
} from "@/services/placeholder-service";

// Update / delete a single placeholder (BRDG-304). Both are Bridge-local; delete
// removes the DB row (placeholders never reached Jira, so there is nothing to clean
// up there).

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { id } = await params;
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as UpdatePlaceholderInput;

  try {
    const row = await updatePlaceholder(id, body);
    return NextResponse.json(row);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { id } = await params;
  try {
    await deletePlaceholder(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleServiceError(err);
  }
}
