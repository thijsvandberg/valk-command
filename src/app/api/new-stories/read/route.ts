import { NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/request-parser";
import { applyRateLimit } from "@/lib/rate-limiter";
import * as ticketService from "@/services/ticket-service";
import { handleServiceError } from "@/services/handle-service-error";

// PUT /api/new-stories/read - mark a single ticket read/unread in the inbox.
export async function PUT(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { key, read } = parsed.data as { key?: string; read?: boolean };

  if (typeof key !== "string" || key.length === 0) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  try {
    const result = await ticketService.updateTicketMetadata(key, {
      newStoryRead: read ?? true,
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}

// POST /api/new-stories/read - bulk mark many tickets read/unread (multi-select).
export async function POST(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { keys, read } = parsed.data as { keys?: string[]; read?: boolean };

  if (!Array.isArray(keys)) {
    return NextResponse.json({ error: "keys must be an array" }, { status: 400 });
  }

  try {
    const result = await ticketService.bulkMarkNewStoriesRead(keys, read ?? true);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
