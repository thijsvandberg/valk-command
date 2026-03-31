import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticketAttachment } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const attachments = await db
    .select()
    .from(ticketAttachment)
    .where(eq(ticketAttachment.ticketKey, key))
    .all();

  const enriched = attachments.map((att) => ({
    ...att,
    status: att.cleanedAt
      ? "cleaned"
      : att.downloadedAt
        ? "available"
        : "pending",
  }));

  return NextResponse.json(enriched);
}
