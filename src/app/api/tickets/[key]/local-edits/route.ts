import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/request-parser";
import { validatePathParam } from "@/lib/api-validation";
import * as ticketService from "@/services/ticket-service";
import type { UpsertLocalEditInput } from "@/services/ticket-service";
import { handleServiceError } from "@/services/handle-service-error";
import { cache } from "@/lib/cache";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveDraftKey } from "@/lib/draft-sync";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);
  const edits = await ticketService.getLocalEdits(key);
  return NextResponse.json(edits);
}

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
  const body = parsed.data as Record<string, unknown>;

  try {
    const result = await ticketService.upsertLocalEdit(key, body as unknown as UpsertLocalEditInput);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}

// navigator.sendBeacon always sends POST
export const POST = PUT;

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = await applyRateLimit("delete");
  if (limited) return limited;

  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);
  const draftsOnly = new URL(request.url).searchParams.get("draftsOnly") === "true";
  const editState = await ticketService.deleteLocalEdits(key, { draftsOnly });
  cache.invalidate(`/api/tickets/${key}`);
  // The sprint/backlog list cache carries each ticket's editState; without this a
  // refetch would keep serving the stale "draft"/"local changes" label until the
  // 30s list TTL expires.
  cache.invalidate(/^\/api\/tickets(\?|$)/);
  // editState lets the caller broadcast the true post-delete state to other tabs,
  // so views like the refinement queue update live instead of waiting for a poll.
  return NextResponse.json({ success: true, editState });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);
  let body: Record<string, unknown> = {};
  try { body = await request.json(); } catch { /* no body is fine */ }

  try {
    if (body.promoteDrafts === true) {
      await ticketService.promoteDrafts(key);
      return NextResponse.json({ success: true });
    }
    const result = await ticketService.rebaseLocalEdits(key);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return handleServiceError(err);
  }
}
