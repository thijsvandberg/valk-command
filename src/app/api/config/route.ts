import { NextResponse } from "next/server";

/**
 * Exposes safe, non-secret configuration values to the client.
 * Add values here that the UI needs but that cannot be NEXT_PUBLIC_ env vars.
 */
export async function GET() {
  return NextResponse.json({
    nextSprintId: process.env.BT_NEXT_SPRINT_ID ?? "",
  });
}
