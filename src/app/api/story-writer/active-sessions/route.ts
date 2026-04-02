import { NextResponse } from "next/server";
import { db } from "@/db";
import { storyWriterSession } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const sessions = await db
    .select({
      ticketKey: storyWriterSession.ticketKey,
      sessionId: storyWriterSession.id,
    })
    .from(storyWriterSession)
    .where(eq(storyWriterSession.status, "active"))
    .all();

  const map: Record<string, string> = {};
  for (const s of sessions) {
    map[s.ticketKey] = s.sessionId;
  }

  return NextResponse.json(map);
}
