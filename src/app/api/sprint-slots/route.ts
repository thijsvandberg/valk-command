import { NextResponse } from "next/server";
import { db } from "@/db";
import { sprintSlot } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const slots = await db.select().from(sprintSlot).orderBy(sprintSlot.slotIndex);
  return NextResponse.json(slots);
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || !Array.isArray(body)) {
    return NextResponse.json(
      { error: "Request body must be an array of sprint slot objects" },
      { status: 400 },
    );
  }

  for (const slot of body) {
    if (typeof slot.slotIndex !== "number" || slot.slotIndex < 0 || slot.slotIndex > 3) {
      return NextResponse.json(
        { error: "slotIndex must be a number between 0 and 3" },
        { status: 400 },
      );
    }
    if (typeof slot.sprintId !== "string" || slot.sprintId.trim() === "") {
      return NextResponse.json(
        { error: "sprintId is required and must be a non-empty string" },
        { status: 400 },
      );
    }
    if (typeof slot.sprintName !== "string" || slot.sprintName.trim() === "") {
      return NextResponse.json(
        { error: "sprintName is required and must be a non-empty string" },
        { status: 400 },
      );
    }
  }

  // Replace all slots atomically
  const existingSlots = await db.select().from(sprintSlot);
  for (const existing of existingSlots) {
    await db.delete(sprintSlot).where(eq(sprintSlot.slotIndex, existing.slotIndex));
  }

  for (const slot of body) {
    await db.insert(sprintSlot).values({
      slotIndex: slot.slotIndex,
      sprintId: slot.sprintId.trim(),
      sprintName: slot.sprintName.trim(),
    });
  }

  const updated = await db.select().from(sprintSlot).orderBy(sprintSlot.slotIndex);
  return NextResponse.json(updated);
}
