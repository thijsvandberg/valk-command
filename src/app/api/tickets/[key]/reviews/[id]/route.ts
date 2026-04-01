import { NextResponse } from "next/server";
import { db } from "@/db";
import { storedReview, ticketMetadata } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ key: string; id: string }> },
) {
  const { key, id } = await params;

  const review = await db.query.storedReview.findFirst({
    where: (r, { eq: eqFn, and: andFn }) =>
      andFn(eqFn(r.id, id), eqFn(r.ticketKey, key)),
  });

  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  await db.delete(storedReview).where(
    and(eq(storedReview.id, id), eq(storedReview.ticketKey, key)),
  );

  // Update qualityScore to the next most recent review, or null if none left
  const remaining = await db
    .select()
    .from(storedReview)
    .where(eq(storedReview.ticketKey, key))
    .orderBy(desc(storedReview.createdAt))
    .limit(1);

  const newScore = remaining[0]?.overallScore ?? null;

  await db
    .update(ticketMetadata)
    .set({ qualityScore: newScore })
    .where(eq(ticketMetadata.jiraKey, key));

  return NextResponse.json({ deleted: true });
}
