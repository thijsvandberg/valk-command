import { NextResponse } from "next/server";
import { db } from "@/db";
import { storyVersion, ticket } from "@/db/schema";
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

  // Backfill updatedBy from ticket assignee for versions that predate the field
  if (versions.some((v) => !v.updatedBy)) {
    const t = await db.query.ticket.findFirst({
      where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
    });
    if (t?.assignee) {
      for (const v of versions) {
        if (!v.updatedBy) {
          v.updatedBy = t.assignee;
          v.updatedByAvatar = t.assigneeAvatar;
        }
      }
    }
  }

  return NextResponse.json(versions);
}
