import { NextResponse } from "next/server";
import { db } from "@/db";
import { storyVersion } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const versions = await db
    .select()
    .from(storyVersion)
    .where(eq(storyVersion.jiraKey, key));

  return NextResponse.json(versions);
}
