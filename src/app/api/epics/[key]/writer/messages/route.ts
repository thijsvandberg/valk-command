import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { agentErrorResponse, errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import {
  sendStoryWriterMessage,
  StoryWriterError,
  StoryWriterAgentError,
} from "@/lib/story-writer-messages";

type RouteContext = { params: Promise<{ key: string }> };

/**
 * Sends a chat turn for an epic writer session. Delegates to the shared
 * sendStoryWriterMessage, which finds the active session by key; because the
 * epic session has mode="epic", epic-mode context assembly fires automatically.
 * No direct LLM call in Bridge: all AI runs on VRW.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const limited = await applyRateLimit("story-writer");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return errorResponse("content is required", 400);
  }

  try {
    const result = await sendStoryWriterMessage({
      key,
      content,
      codebaseResearch: body.codebaseResearch === true,
      model: typeof body.model === "string" ? body.model : undefined,
      skill: typeof body.skill === "string" ? body.skill : null,
      retryMessageId: typeof body.retryMessageId === "string" ? body.retryMessageId : null,
    });

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
