import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveDraftKey } from "@/lib/draft-sync";
import { agentErrorResponse, errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import {
  dispatchTargetedRelated,
  StoryWriterError,
  StoryWriterAgentError,
} from "@/lib/story-writer-messages";

type RouteContext = { params: Promise<{ key: string }> };

// Auto-chained from the chat when the compose skill emits a <related-request> tag.
// Resolves the loose sprint mention and dispatches a targeted find-related into the
// active session, returning the task to monitor (BRDG-397).
export async function POST(request: Request, { params }: RouteContext) {
  const limited = await applyRateLimit("story-writer");
  if (limited) return limited;

  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return errorResponse("query is required", 400);
  }
  const sprint = typeof body.sprint === "string" && body.sprint.trim() ? body.sprint.trim() : null;

  try {
    const result = await dispatchTargetedRelated({ key, query, sprint });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof StoryWriterAgentError) {
      return agentErrorResponse(err.agentError, err.status);
    }
    if (err instanceof StoryWriterError) {
      return errorResponse(err.message, err.status, err.code);
    }
    throw err;
  }
}
