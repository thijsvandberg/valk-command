import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Exposes safe, non-secret configuration values to the client.
 * Add values here that the UI needs but that cannot be NEXT_PUBLIC_ env vars.
 */
export async function GET() {
  return NextResponse.json({
    nextSprintId: env.BT_NEXT_SPRINT_ID,
  });
}
