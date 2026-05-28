import "server-only";

import { NextResponse } from "next/server";
import type { ZodError } from "zod";

import type { AgentError } from "@/lib/agent-fetch";

// Standard error shape consumed by the frontend ApiError class: { error: string; code?: string }

export function errorResponse(
  message: string,
  status: number,
  code?: string,
): NextResponse {
  const body: { error: string; code?: string } = { error: message };
  if (code !== undefined) body.code = code;
  return NextResponse.json(body, { status });
}

export function validationError(
  messageOrZodError: string | ZodError,
): NextResponse {
  const message =
    typeof messageOrZodError === "string"
      ? messageOrZodError
      : messageOrZodError.issues[0]?.message ?? "Invalid request body";
  return errorResponse(message, 400);
}

export function successResponse<T>(
  data: T,
  status = 200,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json(data, { status, headers });
}

export function agentErrorResponse(
  error: AgentError,
  status: number,
): NextResponse {
  return NextResponse.json(
    { error: error.error, code: error.code },
    { status: status || 502 },
  );
}
