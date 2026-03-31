import { NextResponse } from "next/server";
import { db } from "@/db";
import { storyVersion } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string; id: string }> },
) {
  const { key, id } = await params;

  let body: { tag?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validTags = ["pre-refinement", "post-refinement", "final"];
  if (body.tag !== null && body.tag !== undefined && !validTags.includes(body.tag)) {
    return NextResponse.json(
      { error: `tag must be one of: ${validTags.join(", ")} (or null to clear)` },
      { status: 400 },
    );
  }

  const existing = await db
    .select()
    .from(storyVersion)
    .where(and(eq(storyVersion.id, id), eq(storyVersion.jiraKey, key)));

  if (existing.length === 0) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  await db
    .update(storyVersion)
    .set({ tag: body.tag ?? null })
    .where(eq(storyVersion.id, id));

  const updated = await db
    .select()
    .from(storyVersion)
    .where(eq(storyVersion.id, id));

  if (updated.length === 0) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json(updated[0]);
}
