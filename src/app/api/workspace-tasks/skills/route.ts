import { NextResponse } from "next/server";
import { agentFetch } from "@/lib/agent-fetch";

export async function GET() {
  const result = await agentFetch("/api/skills");

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.error, code: result.error.code },
      { status: result.status || 502 },
    );
  }

  return NextResponse.json(result.data, { status: result.status });
}
