import { NextResponse } from "next/server";
import { db } from "@/db";
import { sprintSlot } from "@/db/schema";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

export async function GET() {
  const slots = await db.select().from(sprintSlot).orderBy(sprintSlot.slotIndex).limit(50);
  return NextResponse.json(slots);
}

export async function PUT(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  if (!Array.isArray(body)) {
    return errorResponse("Request body must be an array of sprint slot objects", 400);
  }

  for (const slot of body) {
    if (typeof slot.slotIndex !== "number" || slot.slotIndex < 0 || slot.slotIndex > 7) {
      return errorResponse("slotIndex must be a number between 0 and 7", 400);
    }
    if (typeof slot.sprintId !== "string" || slot.sprintId.trim() === "") {
      return errorResponse("sprintId is required and must be a non-empty string", 400);
    }
    if (typeof slot.sprintName !== "string" || slot.sprintName.trim() === "") {
      return errorResponse("sprintName is required and must be a non-empty string", 400);
    }
  }

  // Replace all slots atomically in a single transaction
  db.transaction((tx) => {
    tx.delete(sprintSlot).run();
    for (const slot of body) {
      tx.insert(sprintSlot).values({
        slotIndex: slot.slotIndex,
        sprintId: slot.sprintId.trim(),
        sprintName: slot.sprintName.trim(),
      }).run();
    }
  });

  const updated = await db.select().from(sprintSlot).orderBy(sprintSlot.slotIndex);
  return NextResponse.json(updated);
}
