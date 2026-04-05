import { NextResponse } from "next/server";
import { db } from "@/db";
import { storyVersion } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string; id: string }> },
) {
  const { key, id } = await params;

  const row = await db
    .select()
    .from(storyVersion)
    .where(and(eq(storyVersion.id, id), eq(storyVersion.jiraKey, key)))
    .get();

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}
