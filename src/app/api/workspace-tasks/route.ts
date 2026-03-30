import { NextResponse } from "next/server";
import { agentUrl, agentHeaders } from "@/lib/agent-proxy";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(agentUrl("/api/tasks"), {
      method: "POST",
      headers: agentHeaders(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Agent unreachable" }, { status: 502 });
  }
}

export async function GET() {
  try {
    const res = await fetch(agentUrl("/api/tasks"), {
      headers: agentHeaders(),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Agent unreachable" }, { status: 502 });
  }
}
