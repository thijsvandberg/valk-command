import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { storedReview, ticketMetadata } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { applyRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ key: string; id: string }> },
) {
  const limited = await applyRateLimit("delete");
  if (limited) return limited;

  const { key, id } = await params;
  const invalidKey = validatePathParam(key);
  if (invalidKey) return invalidKey;
  const invalidId = validatePathParam(id);
  if (invalidId) return invalidId;

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

  // The updated qualityScore/reviewCount are embedded in the cached ticket detail and
  // board list responses; invalidate so a client revalidation returns the new values.
  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  return NextResponse.json({ deleted: true });
}
