import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { db } from "@/db";
import { storyVersion } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;
  const { searchParams } = new URL(request.url);
  const metaOnly = searchParams.get("metaOnly") === "true";

  const rows = await db
    .select()
    .from(storyVersion)
    .where(eq(storyVersion.jiraKey, key));

  if (metaOnly) {
    return NextResponse.json(
      rows.map(({ description: _d, acceptanceCriteria: _ac, ...meta }) => meta),
    );
  }

  return NextResponse.json(rows);
}
