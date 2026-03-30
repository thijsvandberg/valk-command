import { NextResponse } from "next/server";
import { agentUrl, agentHeaders } from "@/lib/agent-proxy";

export async function GET() {
  try {
    const res = await fetch(agentUrl("/health"), {
      headers: agentHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { status: "unreachable", auth: { status: "unknown" } },
      { status: 502 }
    );
  }
}
