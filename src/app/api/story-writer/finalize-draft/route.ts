import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limiter";
import { finalizeDraft } from "@/lib/draft-sync";

/**
 * Finalizes a draft ticket by swapping the DRAFT-xxx key for the real Jira key.
 */
export async function POST(request: Request) {
  const limited = applyRateLimit("story-writer");
  if (limited) return limited;

  let body: { draftKey?: string; realKey?: string; sprintName?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { draftKey, realKey, sprintName } = body;
  if (!draftKey || !realKey) {
    return NextResponse.json({ error: "draftKey and realKey are required" }, { status: 400 });
  }

  try {
    finalizeDraft(draftKey, realKey, sprintName);
    return NextResponse.json({ success: true, realKey });
  } catch {
    return NextResponse.json({ error: "Failed to finalize draft" }, { status: 500 });
  }
}
