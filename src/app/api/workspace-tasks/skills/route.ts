import { NextResponse } from "next/server";
import { agentUrl, agentHeaders } from "@/lib/agent-proxy";

export async function GET() {
  try {
    const res = await fetch(agentUrl("/api/skills"), {
      headers: agentHeaders(),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Agent unreachable" }, { status: 502 });
  }
}
