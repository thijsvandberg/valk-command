import { NextResponse } from "next/server";
import { applyRateLimit } from "@/lib/rate-limiter";
import { handleServiceError } from "@/services/handle-service-error";
import { promotePlaceholder } from "@/services/placeholder-service";

// Promote a placeholder into a real Jira ticket (BRDG-304): creates the issue,
// carries content/BV/guestimation, and marks the placeholder promoted. Returns the
// new Jira key.

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { id } = await params;
  try {
    const result = await promotePlaceholder(id);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
