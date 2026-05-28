import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limiter";
import { finalizeDraft } from "@/lib/draft-sync";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

/**
 * Finalizes a draft ticket by swapping the DRAFT-xxx key for the real Jira key.
 */
export async function POST(request: Request) {
  const limited = applyRateLimit("story-writer");
  if (limited) return limited;

  const result = await parseJsonBody(request);
  if ("error" in result) return result.error;
  const body = result.data as { draftKey?: string; realKey?: string; sprintName?: string };

  const { draftKey, realKey, sprintName } = body;
  if (!draftKey || !realKey) {
    return errorResponse("draftKey and realKey are required", 400);
  }

  try {
    finalizeDraft(draftKey, realKey, sprintName);
    return NextResponse.json({ success: true, realKey });
  } catch {
    return errorResponse("Failed to finalize draft", 500);
  }
}
