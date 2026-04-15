import { NextResponse } from "next/server";
import * as ticketService from "@/services/ticket-service";
import { handleServiceError } from "@/services/handle-service-error";
import type { UpdateMetadataInput } from "@/services/ticket-service";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

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
