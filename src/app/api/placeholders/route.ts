import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/request-parser";
import { applyRateLimit } from "@/lib/rate-limiter";
import { handleServiceError } from "@/services/handle-service-error";
import {
  listPlaceholders,
  createPlaceholder,
  type CreatePlaceholderInput,
} from "@/services/placeholder-service";

// Forward-planning placeholder tickets (BRDG-304). Bridge-local, never synced to
// Jira until promoted. GET lists active placeholders (optionally scoped to a sprint
// or epic); POST creates one.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sprintId = searchParams.get("sprintId");
  const epicKey = searchParams.get("epicKey");
  try {
    const rows = await listPlaceholders({ sprintId, epicKey });
    return NextResponse.json(rows);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function POST(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as CreatePlaceholderInput;

  try {
    const row = await createPlaceholder(body);
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return handleServiceError(err);
  }
}
