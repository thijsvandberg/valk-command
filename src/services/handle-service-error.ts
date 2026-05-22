import { NextResponse } from "next/server";
import { JiraOperationError, ServiceError } from "./errors";

export function handleServiceError(err: unknown): NextResponse {
  if (err instanceof ServiceError) {
    const body: { error: string; code: string; detail?: string } = {
      error: err.message,
      code: err.code,
    };
    if (err instanceof JiraOperationError) {
      body.detail = err.detail;
    }
    return NextResponse.json(body, { status: err.statusCode });
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
