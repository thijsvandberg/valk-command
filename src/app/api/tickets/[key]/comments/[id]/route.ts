import { NextResponse } from "next/server";
import { db } from "@/db";
import { poComment } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ key: string; id: string }> },
) {
  const { key, id } = await params;

  const existing = await db.query.poComment.findFirst({
    where: (row, { eq, and }) => and(eq(row.id, id), eq(row.ticketKey, key)),
  });

  if (!existing) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  await db
    .delete(poComment)
    .where(and(eq(poComment.id, id), eq(poComment.ticketKey, key)));

  return NextResponse.json({ success: true });
}
