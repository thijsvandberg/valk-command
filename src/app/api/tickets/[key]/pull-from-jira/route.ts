import { NextResponse } from "next/server";
import * as ticketService from "@/services/ticket-service";
import { handleServiceError } from "@/services/handle-service-error";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  try {
    const result = await ticketService.pullFromJira(key);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
