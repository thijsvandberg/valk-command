import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { resolveDraftKey } from "@/lib/draft-sync";
import { agentErrorResponse, errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import {
  sendStoryWriterMessage,
  deleteMessage,
  StoryWriterError,
  StoryWriterAgentError,
} from "@/lib/story-writer-messages";

type RouteContext = { params: Promise<{ key: string }> };

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
      return agentErrorResponse(err.agentError, err.status, err.messageId);
    }
    if (err instanceof StoryWriterError) {
      const body: { error: string; code?: string; messageId?: string } = { error: err.message };
      if (err.code !== undefined) body.code = err.code;
      if (err.messageId !== undefined) body.messageId = err.messageId;
      return NextResponse.json(body, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const limited = await applyRateLimit("delete");
  if (limited) return limited;

  const { key: rawKey } = await params;
  const invalid = validatePathParam(rawKey);
  if (invalid) return invalid;
  const key = resolveDraftKey(rawKey);
  const url = new URL(request.url);
  const messageId = url.searchParams.get("id");

  if (!messageId) {
    return errorResponse("Missing query parameter: id", 400);
  }

  try {
    const result = await deleteMessage(key, messageId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof StoryWriterError) {
      return errorResponse(err.message, err.status);
    }
    throw err;
  }
}
