import { NextResponse } from "next/server";
import { ServiceError } from "./errors";

export function handleServiceError(err: unknown): NextResponse {
  if (err instanceof ServiceError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.statusCode },
    );
  }
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
