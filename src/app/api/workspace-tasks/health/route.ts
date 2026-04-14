import { NextResponse } from "next/server";
import { agentFetch } from "@/lib/agent-fetch";

export async function GET() {
  const result = await agentFetch("/health", { timeout: 5000 });

  if (!result.ok) {
    return NextResponse.json(
      { status: "unreachable", auth: { status: "unknown" }, code: result.error.code },
      { status: 502 },
    );
  }

  return NextResponse.json(result.data, { status: result.status });
}
