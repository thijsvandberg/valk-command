import { NextResponse } from "next/server";
import * as ticketService from "@/services/ticket-service";
import type { UpsertLocalEditInput } from "@/services/ticket-service";
import { handleServiceError } from "@/services/handle-service-error";
import { cache } from "@/lib/cache";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const edits = await ticketService.getLocalEdits(key);
  return NextResponse.json(edits);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const result = await ticketService.upsertLocalEdit(key, body as unknown as UpsertLocalEditInput);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const draftsOnly = new URL(request.url).searchParams.get("draftsOnly") === "true";
  await ticketService.deleteLocalEdits(key, { draftsOnly });
  cache.invalidate(`/api/tickets/${key}`);
  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
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
