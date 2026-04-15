import { NextResponse } from "next/server";
import * as ticketService from "@/services/ticket-service";
import { handleServiceError } from "@/services/handle-service-error";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

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
