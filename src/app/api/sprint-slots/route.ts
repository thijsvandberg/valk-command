import { NextResponse } from "next/server";
import { db } from "@/db";
import { sprintSlot } from "@/db/schema";

export async function GET() {
  const slots = await db.select().from(sprintSlot).orderBy(sprintSlot.slotIndex).limit(50);
  return NextResponse.json(slots);
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body)) {
    return NextResponse.json(
      { error: "Request body must be an array of sprint slot objects" },
      { status: 400 },
    );
  }

  for (const slot of body) {
    if (typeof slot.slotIndex !== "number" || slot.slotIndex < 0 || slot.slotIndex > 7) {
      return NextResponse.json(
        { error: "slotIndex must be a number between 0 and 7" },
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
