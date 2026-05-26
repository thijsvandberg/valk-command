import { NextResponse } from "next/server";
import { jiraClient } from "@/lib/jira-client";

/**
 * GET /api/jira/labels
 *
 * Returns all available labels from the Jira instance.
 */
export async function GET() {
  try {
    const labels = await jiraClient.getLabels();
    return NextResponse.json({ labels }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ labels: [], error: message }, { status: 500 });
  }
}
