import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Returns the sync status of a draft ticket.
 * - DRAFTING: Jira creation still pending
 * - REPLACED: Successfully finalized (description holds the real key)
 * - DRAFT_FAILED: Jira creation failed (description holds the error message)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key || !key.startsWith("DRAFT-")) {
    return NextResponse.json({ error: "Invalid draft key" }, { status: 400 });
  }

  const row = await db.select().from(ticket).where(eq(ticket.jiraKey, key)).get();
  if (!row) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  if (row.status === "REPLACED") {
    return NextResponse.json({ status: "synced", realKey: row.description });
  }

  if (row.status === "DRAFT_FAILED") {
    return NextResponse.json({ status: "error", error: row.description ?? "Jira creation failed" });
  }

  // Still DRAFTING
  return NextResponse.json({ status: "pending" });
}
